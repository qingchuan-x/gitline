## GitLine 0.1.5

### What's new
- Prevent stale commit messages after multi-line paste and unsaved edits
- Pause blame for the entire document until the edited file is saved
- Invalidate cached blame after `git commit` and `git add` using HEAD/index state
- Add Obsidian 1.13 declarative settings so options appear in settings search
- Add release artifact attestation without modifying immutable release assets
- Harden Git execution and remove unsafe `any` usage

### Files
- `main.js`, `manifest.json`, `styles.css` attached as release assets (required by Obsidian)