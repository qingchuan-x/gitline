# GitLine

> **EN** — Show Git blame (time / author / message) at the end of the **current cursor line**, with a fully configurable format.
> **中文** — 在当前光标所在行的**行尾**显示该行的 Git 归属：**时间 · 提交人 · 提交消息**，显示内容与顺序、时间格式均可配置。

A Git-inline-blame plugin for Obsidian, similar to the inline blame in IntelliJ / VSCode GitLens (Current Line Blame pattern), but only follows the cursor line so it never floods the screen.
一个 Obsidian 的行内 Git blame 插件，效果类似 IntelliJ / VSCode GitLens 的行内 blame（Current Line Blame 范式），只跟随光标行、不占整屏。

---

## Features · 功能

- **Line-end widget for the current line** · 当前行行尾挂件：author + time + message，可用 `{date} {time} {author} {message} {hash}` 自由组合、调序
- **Time style** · 时间样式：relative (3 days ago) / absolute (to the minute, default `YYYY-MM-DD HH:mm`)
- **Uncommitted lines** show `未提交` · 未提交的行显示「未提交」
- **Status bar** shows current line author · 状态栏显示当前行提交人（可关）
- **`git blame -w`** ignore-whitespace toggle · 忽略空白开关
- **LRU cache** (default 100 files), auto-invalidated on save · LRU 缓存（默认 100 个文件），保存后自动失效
- **Auto-detects git**; shows a friendly hint instead of crashing · 自动检测 git；无 git 环境时提示而非崩溃
- **Bilingual UI** (English + 中文) · 双语界面

## Install · 安装（开发模式）

Prerequisites · 前提：Obsidian **desktop** + **git** on PATH (`git --version` works).

1. Open your vault → Settings → Third-party plugins → enable **Developer mode**. 打开你的 vault → 设置 → 第三方插件 → 开发者模式：开启。
2. Go to `yourVault/.obsidian/plugins/`. 进入 `你的vault/.obsidian/plugins/` 目录。
3. Copy this plugin folder as `gitline/` (it must contain `main.js`, `manifest.json`, `styles.css`). 把本插件目录复制为 `gitline/`。
4. Restart Obsidian (or reload), then enable **GitLine**. 重启 Obsidian（或重新加载），在第三方插件列表启用 **GitLine**。

> You can also build it yourself with `npm run build` and install the output. 也可自行 `npm run build` 构建后安装。

## Development · 开发

```bash
npm install        # install deps (needs network) · 安装依赖（需网络）
npm run dev        # watch-build main.js · 监听构建
npm run build      # type-check + production build · 类型检查 + 生产构建
```

## Settings · 设置项

| Item · 项 | Description · 说明 | Default · 默认 |
|---|---|---|
| Enable · 启用 | Master switch · 总开关 | on |
| Display format · 显示格式 | Template: `{date} {time} {author} {message} {hash}` | `{author} {time} {message}` |
| Time style · 时间样式 | relative / absolute (to the minute) · 相对 / 绝对（精确到分钟） | absolute |
| Absolute format · 绝对时间格式 | Moment format string · moment 格式串 | `YYYY-MM-DD HH:mm` |
| Uncommitted lines · 未提交行 | Show marker on uncommitted lines | on |
| Ignore whitespace · 忽略空白 | `git blame -w` | off |
| Status bar · 状态栏 | Show current line author | on |
| Cache size · 缓存文件数 | LRU file count · LRU 上限 | 100 |

## Known limitations (MVP) · 已知限制（MVP）

- Only follows the **current cursor line**; full-file / visible-viewport persistent blame is phase 2. 只跟随**当前光标行**；整文件/可视区多行常驻属于二期。
- Reading (preview) mode not supported yet (phase 2). 阅读（预览）模式暂不显示（二期）。
- Unsaved edits are attributed to the last saved version; no line-offset compensation (phase 2). 编辑中的未保存内容按「上次保存版」归属，不做行偏移补偿（二期）。
- Large files (>2000 lines) are blamed in full in one pass; `-L` viewport increment is phase 2. 大文件（>2000 行）仍整文件 blame 一次，二期再做 `-L` 可视区增量。