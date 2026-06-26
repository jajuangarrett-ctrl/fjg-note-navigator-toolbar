# FJG Note Navigator Toolbar

## Purpose

Build a mobile-friendly Obsidian toolbar for Franklin's folder-first vault workflow.

The plugin should make common navigation and path-sharing actions available directly from the current note, especially on iPhone where the file explorer is slower to use.

This project was cloned from `chrisgurney/obsidian-note-toolbar` and then customized. The upstream clone remote is named `upstream`; do not push Franklin-specific work back to that repository.

## Source And Install Paths

Source:

`/Users/franklingarrett/Codex/plugins/custom-note-toolbar/`

Installed plugin:

`/Users/franklingarrett/FJG Vault/.obsidian/plugins/fjg-note-navigator-toolbar/`

Vault planning note:

`/Users/franklingarrett/FJG Vault/Artifacts/Custom Toolbar/Toolbar Plugin Ideas.md`

## Current Build

Plugin id: `fjg-note-navigator-toolbar`

Plugin name: `FJG Note Navigator Toolbar`

Version: `0.1.27`

Build command:

```bash
npm run build
```

Install command:

```bash
mkdir -p "/Users/franklingarrett/FJG Vault/.obsidian/plugins/fjg-note-navigator-toolbar"
cp manifest.json main.js styles.css "/Users/franklingarrett/FJG Vault/.obsidian/plugins/fjg-note-navigator-toolbar/"
```

## Feature Scope

- Folder Navigator: browse the vault root by default, plus subfolders, parent folder, and linked notes from the active note.
- Copy Location: copy vault path, folder path, full system path, Obsidian URI, wiki link, or Markdown link.
- Recent Notes: show recent Markdown files with current-folder items prioritized.
- Bookmarks: show saved Obsidian bookmarks plus configured shortcuts.
- Open Folder: open current folder, vault root, configured folders, or project folders in Finder/File Explorer on desktop.
- AI / Project Folders: open configured vault folders from a quick popup.
- Settings: choose visible buttons and configure folder, note, and project shortcuts.

## v0.1.24 Layout Update

- Folder and current-folder recent lists are capped around three visible rows.
- Notes, all-recent, and bookmark-style lists are capped around five visible rows.
- Mobile rows are slightly tighter so the Notes section sits higher and gets more space.

## v0.1.25 Layout Update

- Subfolder/current-folder caps are tightened further so the fourth folder row does not show on mobile.

## v0.1.26 Navigation Update

- Folder Navigator adds a top-left Back button above the title.
- Back returns to the previous drilled folder when available, otherwise it goes to the parent folder.

## v0.1.27 Search Update

- Folder Navigator search now finds matching folders deeper in the current folder tree.
- Matching folder results remain tappable drill-down rows.

## Important Distinction

The upstream community plugin install is:

`/Users/franklingarrett/FJG Vault/.obsidian/plugins/note-toolbar/`

That is not the custom plugin install. This custom plugin uses a different id and must be installed into:

`/Users/franklingarrett/FJG Vault/.obsidian/plugins/fjg-note-navigator-toolbar/`

If the custom plugin seems to disappear in Obsidian, first check that this install folder exists and that `manifest.json` contains `"id": "fjg-note-navigator-toolbar"`.
