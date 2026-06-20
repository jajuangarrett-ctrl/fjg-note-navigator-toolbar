# AGENTS.md

Custom Obsidian plugin source for Franklin Garrett's note navigation toolbar.

This source folder is the working project. The installed Obsidian plugin output is copied into:

`/Users/franklingarrett/FJG Vault/.obsidian/plugins/fjg-note-navigator-toolbar/`

Do not treat `/Users/franklingarrett/FJG Vault/.obsidian/plugins/note-toolbar/` as the source for this custom plugin. That folder is the upstream Note Toolbar community plugin install.

## Build And Install

From this folder:

```bash
npm run build
mkdir -p "/Users/franklingarrett/FJG Vault/.obsidian/plugins/fjg-note-navigator-toolbar"
cp manifest.json main.js styles.css "/Users/franklingarrett/FJG Vault/.obsidian/plugins/fjg-note-navigator-toolbar/"
```

Then reload Obsidian and enable `FJG Note Navigator Toolbar` in Community Plugins.

## Durable Project State

Do not rely on Codex Goals as the only project record. When work changes direction, update `PLUGIN.md` in this folder and the vault-facing copy at:

`/Users/franklingarrett/FJG Vault/Artifacts/Custom Toolbar/PLUGIN.md`

Commit source changes locally before leaving the project.

