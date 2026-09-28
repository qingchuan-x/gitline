import { App, PluginSettingTab, Setting } from "obsidian";
import type GitLinePlugin from "./main";
import type { GitLineSettings } from "./types";
import { formatBlame } from "./util/format";

export const DEFAULT_SETTINGS: GitLineSettings = {
  settingsVersion: 2,
  enabled: true,
  format: "{author} {time} {message}",
  timeStyle: "absolute",
  absoluteFormat: "YYYY-MM-DD HH:mm",
  showUncommitted: true,
  ignoreWhitespace: false,
  showStatusBar: true,
  cacheMaxFiles: 100,
};

const PREVIEW_SAMPLE = {
  sha: "a1b2c3d4e5f6",
  author: "Qingchuan",
  time: Math.floor(Date.now() / 1000) - 3 * 24 * 3600,
  message: "fix: line-end blame",
  uncommitted: false,
  fileName: "notes/demo.md",
};

export class GitLineSettingTab extends PluginSettingTab {
  private previewEl: HTMLElement | null = null;

  constructor(app: App, private plugin: GitLinePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "GitLine · Line-end Git blame / 行尾 Git 归属" });
    containerEl.createEl("p", {
      text:
        "Shows the Git blame of the current cursor line at its end. Requires Obsidian desktop + git. / 在当前光标所在行的行尾显示该行的 Git 归属信息。需要桌面端 + git 环境。",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Enable · 启用")
      .setDesc("Show Git blame at the end of the line. / 是否显示行尾 Git 归属。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.enabled).onChange(async (v) => {
          this.plugin.settings.enabled = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Display format · 显示格式")
      .setDesc(
        "Placeholders: {date} {time} {author} {message} {hash}; free combination & ordering. / 占位符：{date} {time} {author} {message} {hash}，可自由组合、调序。",
      )
      .addText((t) =>
        t
          .setPlaceholder("{author} {time} {message}")
          .setValue(this.plugin.settings.format)
          .onChange(async (v) => {
            this.plugin.settings.format = v || DEFAULT_SETTINGS.format;
            await this.plugin.saveSettings();
            this.refreshPreview();
          }),
      );

    new Setting(containerEl)
      .setName("Time style · 时间样式")
      .setDesc("Relative time (e.g. 3 days ago) or absolute time (to the minute). / 相对时间（如 3 天前）或绝对时间（精确到分钟）。")
      .addDropdown((d) =>
        d
          .addOption("relative", "Relative · 相对时间")
          .addOption("absolute", "Absolute · 绝对时间")
          .setValue(this.plugin.settings.timeStyle)
          .onChange(async (v) => {
            this.plugin.settings.timeStyle = v as GitLineSettings["timeStyle"];
            await this.plugin.saveSettings();
            this.refreshPreview();
          }),
      );

    new Setting(containerEl)
      .setName("Absolute time format · 绝对时间格式")
      .setDesc("Moment format string, e.g. YYYY-MM-DD HH:mm (to the minute). / moment 格式串，例如 YYYY-MM-DD HH:mm（精确到分钟）。")
      .addText((t) =>
        t
          .setPlaceholder("YYYY-MM-DD HH:mm")
          .setValue(this.plugin.settings.absoluteFormat)
          .onChange(async (v) => {
            this.plugin.settings.absoluteFormat = v || "YYYY-MM-DD HH:mm";
            await this.plugin.saveSettings();
            this.refreshPreview();
          }),
      );

    new Setting(containerEl)
      .setName("Uncommitted lines · 未提交行")
      .setDesc(
        "Show an uncommitted marker on lines not yet committed. / 尚未提交的行显示「未提交」。",
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showUncommitted).onChange(async (v) => {
          this.plugin.settings.showUncommitted = v;
          await this.plugin.saveSettings();
          this.refreshPreview();
        }),
      );

    new Setting(containerEl)
      .setName("Ignore whitespace · 忽略空白改动")
      .setDesc("Map to git blame -w: ignore whitespace-only changes. / 映射 git blame -w：仅空白差异不计为新提交。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.ignoreWhitespace).onChange(async (v) => {
          this.plugin.settings.ignoreWhitespace = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Status bar · 状态栏")
      .setDesc(
        "Show the current line's author in the status bar. / 在状态栏显示当前行提交人（带时间）。",
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showStatusBar).onChange(async (v) => {
          this.plugin.settings.showStatusBar = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Cache size · 缓存文件数")
      .setDesc(
        "Max number of files whose blame results are kept in LRU cache. / LRU 缓存最多保留多少个文件的 blame 结果。",
      )
      .addText((t) =>
        t
          .setPlaceholder("100")
          .setValue(String(this.plugin.settings.cacheMaxFiles))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n > 0) {
              this.plugin.settings.cacheMaxFiles = n;
              await this.plugin.saveSettings();
            }
          }),
      );

    this.previewEl = containerEl.createEl("div", { cls: "obg-setting-preview", text: "" });
    this.previewEl.createEl("strong", { text: "Preview · 预览：" });
    this.refreshPreview();
  }

  private refreshPreview(): void {
    if (!this.previewEl) return;
    const strong = this.previewEl.querySelector("strong");
    while (this.previewEl.lastChild && this.previewEl.lastChild !== strong) {
      this.previewEl.removeChild(this.previewEl.lastChild);
    }
    const sample = formatBlame(PREVIEW_SAMPLE, this.plugin.settings);
    this.previewEl.appendChild(document.createTextNode(" " + sample));
  }
}