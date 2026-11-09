import { EditorState, StateEffect } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import type GitLinePlugin from "../main";
import type { BlameLine } from "../types";
import { formatBlame } from "../util/format";
import { getGitStateVersion } from "../git/gitRunner";

/** 异步结果到达后携带新的 DecorationSet */
const applyBlameEffect = StateEffect.define<DecorationSet>();
/** 设置变更通知（触发重新渲染/重新拉取） */
export const settingsChangedEffect = StateEffect.define<null>();

/** 通知某个 editor 设置已变更，立即重算当前行 */
export function notifySettingsChanged(view: EditorView): void {
  view.dispatch({ effects: settingsChangedEffect.of(null) });
}

/** 行尾挂件 */
class BlameWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  toDOM(): HTMLElement {
    const s = createEl("span", { cls: "gitline-blame" });
    s.textContent = this.text;
    return s;
  }
  eq(other: BlameWidget): boolean {
    return other.text === this.text;
  }
}

class CurrentLineBlamePlugin {
  decorations: DecorationSet = Decoration.none;
  /** 行尾 widget 作为原子区域，避免光标进入/越过 widget */
  atomicRanges: DecorationSet = Decoration.none;
  private currentLine = -1;
  /** 文档已改但尚未落盘时，整个文件都暂时不显示 blame，避免行号偏移后误用旧结果 */
  private documentDirty = false;
  private lastFilePath: string | null = null;
  private lastMtime: number | null = null;
  /** 递增序号，用于丢弃过期的异步结果 */
  private seq = 0;

  constructor(
    private view: EditorView,
    private plugin: GitLinePlugin,
  ) {
    this.currentLine = lineAt(view.state);
    this.refresh();
  }

  update(update: ViewUpdate): void {
    let settingsChanged = false;
    for (const tr of update.transactions) {
      for (const effect of tr.effects) {
        if (effect.is(applyBlameEffect)) this.decorations = effect.value;
        if (effect.is(settingsChangedEffect)) settingsChanged = true;
      }
    }

    const sel = update.state.selection.main;
    const line = update.state.doc.lineAt(sel.head).number;
    const lineChanged = line !== this.currentLine;
    if (lineChanged) this.currentLine = line;

    // 文档变化必须优先于换行判断：多行粘贴会同时改变内容和光标行号，
    // 否则会被误判为普通移动光标，继续沿用磁盘旧文件的提交消息。
    if (update.docChanged) {
      this.documentDirty = true;
      this.clearAndRefresh();
      return;
    }
    if (settingsChanged) {
      this.refresh();
      return;
    }
    if (lineChanged) {
      // 换行：先清空状态栏和挂件，再异步拉取
      this.clearAndRefresh();
    }
  }

  /** 清空可能残留的旧提交信息，并立即重新计算当前行 */
  private clearAndRefresh(): void {
    this.decorations = Decoration.none;
    this.atomicRanges = Decoration.none;
    this.plugin.onBlameInfo(null, this.plugin.getFilePathForEditor(this.view));
    this.refresh();
  }

  private refresh(): void {
    const settings = this.plugin.settings;
    const line = this.currentLine;
    // 按当前编辑器所属 leaf 解析它自己的文件（分栏时各编辑器互不干扰）
    const filePath = this.plugin.getFilePathForEditor(this.view);
    if (filePath !== this.lastFilePath) {
      this.lastFilePath = filePath;
      this.lastMtime = null;
      this.documentDirty = false;
    }

    if (!this.plugin.gitReady() || !settings.enabled || !filePath || line < 1) {
      this.decorations = Decoration.none;
      this.atomicRanges = Decoration.none;
      this.plugin.onBlameInfo(null, filePath);
      return;
    }

    const mySeq = ++this.seq;
    void this.fetchAndApply(filePath, line, mySeq);
  }

  private async fetchAndApply(filePath: string, line: number, mySeq: number): Promise<void> {
    const mtime = await this.plugin.getFileMtime(filePath);
    // 结果返回前：文件/行已变化则丢弃
    if (mySeq !== this.seq || this.plugin.getFilePathForEditor(this.view) !== filePath) return;
    // null 只是“尚未建立 mtime 基线”，不能据此认定文档已保存；
    // 否则用户在首次 stat 返回前编辑，会过早清除脏状态并显示旧 blame。
    const previousMtime = this.lastMtime;
    this.lastMtime = mtime;
    if (previousMtime !== null && previousMtime !== mtime) {
      this.documentDirty = false;
    }
    if (this.documentDirty) {
      this.plugin.onBlameInfo(null, filePath);
      return;
    }

    const absPath = this.plugin.resolveAbsPath(filePath);
    // 文件 mtime 之外还要带上 HEAD/index 状态，否则 git commit/add 后会继续复用旧 blame
    const gitVersion = await getGitStateVersion(absPath);
    if (mySeq !== this.seq || this.plugin.getFilePathForEditor(this.view) !== filePath) return;

    const stateVersion = `${mtime ?? 0}::${gitVersion ?? "nogit"}`;
    const key = this.plugin.cache.keyFor(absPath, mtime ?? 0, gitVersion, this.plugin.settings.ignoreWhitespace);
    let result = this.plugin.cache.get(key);
    if (result === undefined) {
      try {
        result = await this.plugin.fetchBlame(absPath, this.plugin.settings.ignoreWhitespace, stateVersion);
      } catch {
        result = null;
      }
      // 负缓存：null（不在仓库/报错）也缓存，避免重复跑 git
      this.plugin.cache.set(key, result);
    }
    if (mySeq !== this.seq || this.plugin.getFilePathForEditor(this.view) !== filePath) return;

    const info = result ? result.get(line) ?? null : null;
    this.applyDecorations(info, line);
    this.plugin.onBlameInfo(info, filePath);
  }

  private applyDecorations(info: BlameLine | null, line: number): void {
    const state = this.view.state;
    if (line < 1 || line > state.doc.lines) {
      this.setAsync(Decoration.none);
      return;
    }
    const docLine = state.doc.line(line);
    let set: DecorationSet = Decoration.none;
    if (info) {
      const text = formatBlame(info, this.plugin.settings);
      if (text) {
        set = Decoration.set([
          Decoration.widget({ widget: new BlameWidget(text), side: 1 }).range(docLine.to),
        ]);
      }
    }
    this.setAsync(set);
  }

  /** 异步路径必须走 dispatch，视图才会重算装饰 */
  private setAsync(set: DecorationSet): void {
    if (set === this.decorations) return;
    this.decorations = set;
    this.atomicRanges = set;
    this.view.dispatch({ effects: applyBlameEffect.of(set) });
  }
}

function lineAt(state: EditorState): number {
  return state.doc.lineAt(state.selection.main.head).number;
}

/** 注册当前行 blame 扩展 */
export function currentLineBlameExtension(plugin: GitLinePlugin) {
  const blamePlugin = ViewPlugin.fromClass(
    class extends CurrentLineBlamePlugin {
      constructor(view: EditorView) {
        super(view, plugin);
      }
    },
    { decorations: (v) => v.decorations },
  );
  return [
    blamePlugin,
    EditorView.atomicRanges.of((view) => view.plugin(blamePlugin)?.atomicRanges ?? Decoration.none),
  ];
}
