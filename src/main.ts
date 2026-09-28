import { FileSystemAdapter, MarkdownView, Plugin } from "obsidian";
import type { EditorView } from "@codemirror/view";
import { join } from "path";
import { DEFAULT_SETTINGS, GitLineSettingTab } from "./settings";
import type { BlameLine, GitLineSettings } from "./types";
import { currentLineBlameExtension, notifySettingsChanged } from "./editor/currentLineBlame";
import { BlameCache } from "./cache/blameCache";
import { isGitAvailable } from "./git/gitRunner";
import { formatTime } from "./util/time";

export default class GitLinePlugin extends Plugin {
  settings: GitLineSettings = { ...DEFAULT_SETTINGS };
  cache: BlameCache = new BlameCache(DEFAULT_SETTINGS.cacheMaxFiles);

  private gitOk = false;
  private statusBarEl: HTMLElement | null = null;
  private lastBlameInfo: BlameLine | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.cache = new BlameCache(this.settings.cacheMaxFiles);
    const vaultPath = this.getVaultPath();
    this.gitOk = vaultPath ? await isGitAvailable(vaultPath) : false;

    if (this.gitOk) {
      this.registerEditorExtension(currentLineBlameExtension(this));
    }

    this.statusBarEl = this.addStatusBarItem();
    this.updateStatusBarText();

    // 切换文件：清空旧状态，并强制新编辑器立即重算当前行
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.lastBlameInfo = null;
        this.updateStatusBarText();
        this.pokeActiveEditor();
      }),
    );
    this.registerEvent(this.app.workspace.on("editor-change", () => this.updateStatusBarText()));

    this.addSettingTab(new GitLineSettingTab(this.app, this));
  }

  onunload(): void {}

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<GitLineSettings> | null;
    const merged: GitLineSettings = Object.assign({}, DEFAULT_SETTINGS, loaded);
    const version = loaded?.settingsVersion ?? 1;
    if (version < 2) {
      // v1 → v2：默认显示格式升级为「提交人 + 提交时间(精确到分钟) + 提交消息」
      merged.format = DEFAULT_SETTINGS.format;
      merged.timeStyle = DEFAULT_SETTINGS.timeStyle;
      merged.settingsVersion = 2;
      this.settings = merged;
      await this.saveData(merged);
    } else {
      this.settings = merged;
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.cache.resize(this.settings.cacheMaxFiles);
    this.notifyAllEditors();
    this.updateStatusBarText();
  }

  // ---------- 供 CM6 扩展调用的上下文 ----------

  gitReady(): boolean {
    return this.gitOk;
  }

  /**
   * 按编辑器实例反查它所属 leaf 的文件。
   * 关键：不能用 workspace.getActiveFile()，否则分栏时所有编辑器都会 blame 活动文件。
   */
  getFilePathForEditor(cm: EditorView): string | null {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view as MarkdownView;
      const leafCm = (view.editor as any)?.cm as EditorView | undefined;
      if (leafCm === cm) return view.file?.path ?? null;
    }
    return this.app.workspace.getActiveFile()?.path ?? null;
  }

  async getFileMtime(filePath: string): Promise<number | null> {
    try {
      const st = await this.app.vault.adapter.stat(filePath);
      return st ? st.mtime : null;
    } catch {
      return null;
    }
  }

  resolveAbsPath(filePath: string): string {
    return join(this.getVaultPath(), filePath);
  }

  /** 状态栏只反映活动文件（filePath 需与活动文件一致，避免后台编辑器覆盖） */
  onBlameInfo(info: BlameLine | null, filePath?: string | null): void {
    const active = this.app.workspace.getActiveFile()?.path ?? null;
    if (filePath !== active) return;
    this.lastBlameInfo = info;
    this.updateStatusBarText();
  }

  // ---------- 内部工具 ----------

  private getVaultPath(): string {
    const adapter = this.app.vault.adapter;
    return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
  }

  private pokeActiveEditor(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const cm = (view.editor as any)?.cm as EditorView | undefined;
    if (cm && typeof cm.dispatch === "function") {
      notifySettingsChanged(cm);
    }
  }

  private notifyAllEditors(): void {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view as MarkdownView;
      const cm = (view.editor as any)?.cm as EditorView | undefined;
      if (cm && typeof cm.dispatch === "function") {
        notifySettingsChanged(cm);
      }
    }
  }

  private updateStatusBarText(): void {
    if (!this.statusBarEl) return;
    if (!this.gitOk) {
      this.statusBarEl.setText("git not found · git 未检测到");
      return;
    }
    const s = this.settings;
    if (!s.showStatusBar) {
      this.statusBarEl.setText("");
      return;
    }
    const info = this.lastBlameInfo;
    if (!info || !this.app.workspace.getActiveFile()) {
      this.statusBarEl.setText("");
      return;
    }
    if (info.uncommitted) {
      this.statusBarEl.setText("Uncommitted · 未提交");
      return;
    }
    const t = info.time ? formatTime(info.time, s) : "";
    this.statusBarEl.setText(`${info.author}${t ? " · " + t : ""}`);
  }
}