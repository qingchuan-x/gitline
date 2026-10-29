## GitLine 0.1.2

### What's new
- Review compliance: settings heading no longer repeats the plugin name
- Replace `builtin-modules` dependency with Node built-in `node:module` (build hygiene)
- Use Obsidian's `Setting.setHeading()` and `createEl` helpers (review compliance)

### Features
- Show Git blame (time / author / message) at the end of the current line
- Configurable display format
- Works with any vault inside a Git repository

### Files
- `main.js`, `manifest.json`, `styles.css` attached as release assets (required by Obsidian)
