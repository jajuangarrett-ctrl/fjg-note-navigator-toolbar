# FJG Note Navigator Toolbar

Custom Obsidian plugin for adding a compact note toolbar that navigates from the current note to nearby folders, notes, recent files, bookmarks, and configured project locations.

This fork started from `chrisgurney/obsidian-note-toolbar`, then was rebuilt around Franklin Garrett's folder-first navigation workflow.

## Features

- Folder Navigator button opens a searchable popup for the vault root by default, including notes, subfolders, parent navigation when browsing deeper folders, and linked notes from the active note.
- Copy Location menu copies vault-relative paths, full system paths, Obsidian URI links, wiki links, and Markdown file links.
- Recent Notes popup shows recently opened notes, with notes from the current folder first.
- Bookmarks popup reads saved Obsidian bookmarks and combines them with configured note and folder shortcuts.
- Open Folder menu opens the current note folder, vault root, configured folder shortcuts, or configured project folders in Finder/File Explorer on desktop.
- AI / Project Folders menu opens configured project folder shortcuts in Obsidian when they are vault folders, or through the desktop system file explorer when they are system paths.
- Settings control whether the toolbar is enabled, visible toolbar buttons, folder shortcuts, note shortcuts, project folder shortcuts, popup contents, sort order, recent-note limit, and subfolder inclusion.

## Installation

1. Build the plugin:

```bash
npm install
npm run build
```

2. Copy these files into an Obsidian plugin folder named `.obsidian/plugins/fjg-note-navigator-toolbar/`:

```text
main.js
manifest.json
styles.css
```

3. In Obsidian, open Settings, Community plugins, and enable `FJG Note Navigator Toolbar`.

## Usage

Open any Markdown note. The toolbar appears at the top of the note view.

Toolbar buttons:

- `Folder Navigator`: opens the vault root by default, then shows notes, subfolders, parent folder navigation when browsing deeper folders, and a search box. Click a note to open it. Click a folder to browse that folder.
- `Copy Location`: copies the active note or folder location in several formats.
- `Recent Notes`: shows recently opened notes and places recent notes from the current folder first.
- `Bookmarks`: shows saved Obsidian bookmarks plus configured note and folder shortcuts.
- `Open Folder`: opens folders in Finder/File Explorer. This is desktop-only and hidden on mobile.
- `AI / Project Folders`: opens configured folder shortcuts. Vault-relative folders open in Obsidian; system paths open on desktop.

## Settings

Open Settings, Community plugins, `FJG Note Navigator Toolbar`.

Available settings:

- Which toolbar buttons appear.
- Custom folder shortcuts, one per line as `Label | path`.
- Custom note shortcuts, one per line as `Label | path`.
- AI / project folder shortcuts, one per line as `Label | path`.
- Whether popups show notes, folders, or both.
- Sort order: File Name (A to Z), Created (New to Old), File Size (Big to Small), or Last Update (New to Old).
- Maximum number of recent notes retained.
- Whether folder popups include notes from subfolders.

Shortcut paths are vault-relative by default. Desktop open actions also accept full system paths for project folders outside the vault, including `~/...` paths.

Default AI / project folder shortcuts are:

```text
AI Team | AI Team
Formatted_Notes | AI Team/Formatted_Notes
Mira Emails | AI Team/Mira Emails
owner_inbox | AI Team/owner_inbox
Team_Inbox | AI Team/Team_Inbox
```

Edit these defaults in settings to match the vault.

## Mobile Notes

The plugin is not desktop-only. Folder browsing, copy actions, recent notes, bookmarks, and project folder popups work where Obsidian mobile supports the underlying APIs.

Opening folders in Finder/File Explorer is desktop-only, so the `Open Folder` toolbar button is hidden on mobile.

## Development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

The build outputs `main.js` and `styles.css` at the repo root.
