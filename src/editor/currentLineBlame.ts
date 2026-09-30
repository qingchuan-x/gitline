import { EditorState, StateEffect } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import type GitLinePlugin from "../main";
import type { BlameLine } from "../types";
import { formatBlame } from "../util/format";

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
  private currentLine = -1;
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
    if (settingsChanged) {
      this.refresh();
      return;
    }
    const sel = update.state.selection.main;
    const line = update.state.doc.lineAt(sel.head).number;
    if (line !== this.currentLine) {
      this.currentLine = line;
      // 换行：先清空再异步拉取
      this.decorations = Decoration.none;
      this.refresh();
    }
  }

  private refresh(): void {
    const settings = this.plugin.settings;
    const line = this.currentLine;
    // 按当前编辑器所属 leaf 解析它自己的文件（分栏时各编辑器互不干扰）
    const filePath = this.plugin.getFilePathForEditor(this.view);

    if (!this.plugin.gitReady() || !settings.enabled || !filePath || line < 1) {
      this.decorations = Decoration.none;
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

    const absPath = this.plugin.resolveAbsPath(filePath);
    const key = this.plugin.cache.keyFor(absPath, mtime ?? 0, this.plugin.settings.ignoreWhitespace);
    let result = this.plugin.cache.get(key);
    if (result === undefined) {
      try {
        result = await this.plugin.fetchBlame(absPath, this.plugin.settings.ignoreWhitespace);
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
    this.view.dispatch({ effects: applyBlameEffect.of(set) });
  }
}

function lineAt(state: EditorState): number {
  return state.doc.lineAt(state.selection.main.head).number;
}

/** 注册当前行 blame 扩展 */
export function currentLineBlameExtension(plugin: GitLinePlugin) {
  return ViewPlugin.fromClass(
    class extends CurrentLineBlamePlugin {
      constructor(view: EditorView) {
        super(view, plugin);
      }
    },
    { decorations: (v) => v.decorations },
  );
}