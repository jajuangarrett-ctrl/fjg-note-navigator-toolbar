import {
	App,
	MarkdownView,
	Menu,
	Modal,
	Notice,
	Platform,
	Plugin,
	PluginSettingTab,
	Setting,
	TAbstractFile,
	TFile,
	TFolder,
	normalizePath,
	setIcon,
} from "obsidian";

type ToolbarButtonId =
	| "folderNavigator"
	| "copyLocation"
	| "recentNotes"
	| "bookmarks"
	| "openFolder"
	| "projectFolders";

type SortOrder = "alphabetical" | "modified" | "created";

type CopyAction =
	| "vault-note"
	| "vault-folder"
	| "system-note"
	| "system-folder"
	| "obsidian-uri"
	| "wiki-link"
	| "markdown-file-link";

interface Shortcut {
	label: string;
	path: string;
}

interface RecentNote {
	path: string;
	openedAt: number;
}

interface ButtonVisibility {
	folderNavigator: boolean;
	copyLocation: boolean;
	recentNotes: boolean;
	bookmarks: boolean;
	openFolder: boolean;
	projectFolders: boolean;
}

interface FjgNoteToolbarSettings {
	enabled: boolean;
	buttons: ButtonVisibility;
	customFolderShortcuts: Shortcut[];
	customNoteShortcuts: Shortcut[];
	projectFolderShortcuts: Shortcut[];
	showNotesInPopups: boolean;
	showFoldersInPopups: boolean;
	sortOrder: SortOrder;
	includeSubfolderContents: boolean;
	maxRecentNotes: number;
	recentNotes: RecentNote[];
}

interface AdapterWithFullPath {
	getFullPath(path: string): string;
}

interface ElectronShell {
	openPath(path: string): Promise<string>;
}

interface ElectronModule {
	shell?: ElectronShell;
}

interface OsModule {
	homedir?: () => string;
}

declare global {
	interface Window {
		require?: (module: string) => unknown;
	}
}

const PLUGIN_CLASS = "fjg-note-toolbar";

const DEFAULT_SETTINGS: FjgNoteToolbarSettings = {
	enabled: true,
	buttons: {
		folderNavigator: true,
		copyLocation: true,
		recentNotes: true,
		bookmarks: true,
		openFolder: true,
		projectFolders: true,
	},
	customFolderShortcuts: [],
	customNoteShortcuts: [],
	projectFolderShortcuts: [
		{ label: "AI Team", path: "AI Team" },
		{ label: "Prompt Library", path: "Prompt Library" },
		{ label: "Agent Dashboard", path: "Artifacts/Agent Mission Control" },
		{ label: "Codex Projects", path: "~/Codex" },
	],
	showNotesInPopups: true,
	showFoldersInPopups: true,
	sortOrder: "alphabetical",
	includeSubfolderContents: false,
	maxRecentNotes: 40,
	recentNotes: [],
};

const BUTTONS: Array<{ id: ToolbarButtonId; label: string; icon: string; desktopOnly?: boolean }> = [
	{ id: "folderNavigator", label: "Folder Navigator", icon: "folder-search" },
	{ id: "copyLocation", label: "Copy Location", icon: "copy" },
	{ id: "recentNotes", label: "Recent Notes", icon: "history" },
	{ id: "bookmarks", label: "Bookmarks", icon: "bookmark" },
	{ id: "openFolder", label: "Open Folder", icon: "folder-open", desktopOnly: true },
	{ id: "projectFolders", label: "AI / Project Folders", icon: "folder-tree" },
];

export default class FjgNoteToolbarPlugin extends Plugin {
	settings: FjgNoteToolbarSettings = DEFAULT_SETTINGS;
	private renderTimer: number | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addSettingTab(new FjgNoteToolbarSettingTab(this.app, this));
		this.addRibbonIcon("folder-search", "Open folder navigator", () => this.openFolderNavigator());

		this.addCommand({
			id: "open-folder-navigator",
			name: "Open folder navigator",
			callback: () => this.openFolderNavigator(),
		});
		this.addCommand({
			id: "open-recent-notes",
			name: "Open recent notes",
			callback: () => new RecentNotesModal(this.app, this).open(),
		});
		this.addCommand({
			id: "open-bookmarks",
			name: "Open bookmarks and shortcuts",
			callback: () => new BookmarksModal(this.app, this).open(),
		});
		this.addCommand({
			id: "copy-current-note-path",
			name: "Copy current note vault path",
			callback: () => void this.copyCurrentLocation("vault-note"),
		});

		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				this.recordRecentFile(file);
				this.scheduleToolbarRender();
			}),
		);
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleToolbarRender()));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.scheduleToolbarRender()));
		this.registerEvent(this.app.vault.on("rename", () => this.scheduleToolbarRender()));
		this.registerEvent(this.app.vault.on("delete", () => this.scheduleToolbarRender()));

		this.app.workspace.onLayoutReady(() => {
			this.recordRecentFile(this.app.workspace.getActiveFile());
			this.renderToolbars();
		});
	}

	onunload(): void {
		this.removeToolbars();
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<FjgNoteToolbarSettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...loaded,
			buttons: {
				...DEFAULT_SETTINGS.buttons,
				...loaded?.buttons,
			},
			customFolderShortcuts: loaded?.customFolderShortcuts ?? DEFAULT_SETTINGS.customFolderShortcuts,
			customNoteShortcuts: loaded?.customNoteShortcuts ?? DEFAULT_SETTINGS.customNoteShortcuts,
			projectFolderShortcuts: loaded?.projectFolderShortcuts ?? DEFAULT_SETTINGS.projectFolderShortcuts,
			maxRecentNotes: loaded?.maxRecentNotes && Number.isFinite(loaded.maxRecentNotes)
				? Math.max(1, loaded.maxRecentNotes)
				: DEFAULT_SETTINGS.maxRecentNotes,
			recentNotes: loaded?.recentNotes ?? DEFAULT_SETTINGS.recentNotes,
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.scheduleToolbarRender();
	}

	openFolderNavigator(folderPath?: string): void {
		const folder = folderPath ? this.getFolder(folderPath) : this.getActiveFolder();
		if (!folder) {
			new Notice("Open a note first, or choose a valid folder shortcut.");
			return;
		}
		new FolderNavigatorModal(this.app, this, folder).open();
	}

	openFolderShortcut(shortcut: Shortcut): void {
		const normalized = this.normalizeShortcutPath(shortcut.path);
		const folder = this.getFolder(normalized);
		if (folder) {
			new FolderNavigatorModal(this.app, this, folder).open();
			return;
		}
		if (this.isLikelySystemPath(shortcut.path)) {
			void this.openSystemPath(shortcut.path, shortcut.label);
			return;
		}
		new Notice(`Folder not found: ${shortcut.path}`);
	}

	openNoteShortcut(shortcut: Shortcut): void {
		const file = this.getFile(this.normalizeShortcutPath(shortcut.path));
		if (!file) {
			new Notice(`Note not found: ${shortcut.path}`);
			return;
		}
		void this.openFile(file);
	}

	showCopyMenu(event: MouseEvent): void {
		const file = this.getActiveMarkdownFile();
		if (!file) {
			new Notice("Open a note first.");
			return;
		}

		const menu = new Menu();
		this.addCopyMenuItem(menu, "Copy vault-relative note path", "vault-note");
		this.addCopyMenuItem(menu, "Copy vault-relative folder path", "vault-folder");
		this.addCopyMenuItem(menu, "Copy system/full note path", "system-note");
		this.addCopyMenuItem(menu, "Copy system/full folder path", "system-folder");
		this.addCopyMenuItem(menu, "Copy Obsidian URI link", "obsidian-uri");
		this.addCopyMenuItem(menu, "Copy Markdown wiki link", "wiki-link");
		this.addCopyMenuItem(menu, "Copy Markdown file link", "markdown-file-link");
		menu.showAtMouseEvent(event);
	}

	showOpenFolderMenu(event: MouseEvent): void {
		if (Platform.isMobile) {
			new Notice("Opening folders in finder/file explorer is only available on desktop.");
			return;
		}

		const menu = new Menu();
		const activeFolder = this.getActiveFolder();
		if (activeFolder) {
			menu.addItem((item) =>
				item
					.setTitle("Open current note folder in finder/file explorer")
					.setIcon("folder-open")
					.onClick(() => void this.openVaultPathInSystem(activeFolder.path, "Current note folder")),
			);
		}
		menu.addItem((item) =>
			item
				.setTitle("Open vault root folder in finder/file explorer")
				.setIcon("archive")
				.onClick(() => void this.openVaultPathInSystem("", "Vault root folder")),
		);

		if (this.settings.customFolderShortcuts.length > 0) {
			menu.addSeparator();
			this.settings.customFolderShortcuts.forEach((shortcut) => {
				menu.addItem((item) =>
					item
						.setTitle(`Open ${shortcut.label}`)
						.setIcon("folder")
						.onClick(() => void this.openShortcutInSystem(shortcut)),
				);
			});
		}
		if (this.settings.projectFolderShortcuts.length > 0) {
			menu.addSeparator();
			this.settings.projectFolderShortcuts.forEach((shortcut) => {
				menu.addItem((item) =>
					item
						.setTitle(`Open ${shortcut.label}`)
						.setIcon("folder-tree")
						.onClick(() => void this.openShortcutInSystem(shortcut)),
				);
			});
		}
		menu.showAtMouseEvent(event);
	}

	showProjectFoldersMenu(event: MouseEvent): void {
		const menu = new Menu();
		if (this.settings.projectFolderShortcuts.length === 0) {
			menu.addItem((item) => item.setTitle("No AI / project folders configured").setDisabled(true));
		}
		this.settings.projectFolderShortcuts.forEach((shortcut) => {
			menu.addItem((item) =>
				item
					.setTitle(`Open ${shortcut.label}`)
					.setIcon("folder")
					.onClick(() => this.openFolderShortcut(shortcut)),
			);
		});
		menu.showAtMouseEvent(event);
	}

	async copyCurrentLocation(kind: CopyAction): Promise<void> {
		const file = this.getActiveMarkdownFile();
		if (!file) {
			new Notice("Open a note first.");
			return;
		}

		const folderPath = this.fileFolderPath(file);
		const text = this.getCopyText(kind, file, folderPath);
		if (!text) return;

		await navigator.clipboard.writeText(text);
		new Notice("Copied location.");
	}

	async openVaultPathInSystem(vaultPath: string, label: string): Promise<void> {
		if (Platform.isMobile) {
			new Notice("Opening system folders is only available on desktop.");
			return;
		}

		const fullPath = this.getFullPath(vaultPath);
		if (!fullPath) {
			new Notice("Full system paths are not available in this Obsidian environment.");
			return;
		}
		await this.openSystemPath(fullPath, label);
	}

	async openShortcutInSystem(shortcut: Shortcut): Promise<void> {
		if (this.isLikelySystemPath(shortcut.path)) {
			await this.openSystemPath(shortcut.path, shortcut.label);
			return;
		}
		await this.openVaultPathInSystem(this.normalizeShortcutPath(shortcut.path), shortcut.label);
	}

	async openSystemPath(systemPath: string, label: string): Promise<void> {
		if (Platform.isMobile) {
			new Notice("Opening system folders is only available on desktop.");
			return;
		}

		const shell = this.getElectronShell();
		if (!shell) {
			new Notice("Finder/file explorer access is not available in this Obsidian environment.");
			return;
		}

		const resolvedPath = this.resolveSystemPath(systemPath);
		if (!resolvedPath) {
			new Notice(`Could not resolve ${label}.`);
			return;
		}

		const result = await shell.openPath(resolvedPath);
		if (result) {
			new Notice(`Could not open ${label}: ${result}`);
			return;
		}
		new Notice(`Opened ${label}.`);
	}

	recordRecentFile(file: TFile | null): void {
		if (!file || file.extension !== "md") return;

		const recentNotes = this.settings.recentNotes.filter((recent) => recent.path !== file.path);
		recentNotes.unshift({ path: file.path, openedAt: Date.now() });
		this.settings.recentNotes = recentNotes.slice(0, this.settings.maxRecentNotes);
		void this.saveData(this.settings);
	}

	async openFile(file: TFile): Promise<void> {
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	getActiveMarkdownFile(): TFile | null {
		const file = this.app.workspace.getActiveFile();
		return file?.extension === "md" ? file : null;
	}

	getActiveFolder(): TFolder | null {
		const file = this.getActiveMarkdownFile();
		return file?.parent ?? null;
	}

	getFolder(path: string): TFolder | null {
		const folder = this.app.vault.getAbstractFileByPath(this.normalizeShortcutPath(path));
		return folder instanceof TFolder ? folder : null;
	}

	getFile(path: string): TFile | null {
		const normalized = this.normalizeShortcutPath(path);
		const file = this.app.vault.getAbstractFileByPath(normalized);
		if (file instanceof TFile) return file;
		if (!normalized.endsWith(".md")) {
			const markdownFile = this.app.vault.getAbstractFileByPath(`${normalized}.md`);
			return markdownFile instanceof TFile ? markdownFile : null;
		}
		return null;
	}

	normalizeShortcutPath(path: string): string {
		const trimmed = path.trim();
		if (trimmed === "/" || trimmed === "") return "";
		return normalizePath(trimmed.replace(/^\/+/, ""));
	}

	isLikelySystemPath(path: string): boolean {
		return path.startsWith("/") || path.startsWith("~/") || path === "~" || /^[A-Za-z]:[\\/]/.test(path);
	}

	fileFolderPath(file: TFile): string {
		return file.parent?.path === "/" ? "" : file.parent?.path ?? "";
	}

	sortFiles(files: TFile[]): TFile[] {
		return [...files].sort((a, b) => {
			switch (this.settings.sortOrder) {
				case "modified":
					return b.stat.mtime - a.stat.mtime || a.basename.localeCompare(b.basename);
				case "created":
					return b.stat.ctime - a.stat.ctime || a.basename.localeCompare(b.basename);
				case "alphabetical":
				default:
					return a.basename.localeCompare(b.basename);
			}
		});
	}

	sortFolders(folders: TFolder[]): TFolder[] {
		return [...folders].sort((a, b) => a.name.localeCompare(b.name));
	}

	collectFolderEntries(folder: TFolder): { notes: TFile[]; folders: TFolder[] } {
		const notes: TFile[] = [];
		const folders: TFolder[] = [];

		const visit = (current: TFolder, includeCurrentFolders: boolean): void => {
			current.children.forEach((child) => {
				if (child instanceof TFile && child.extension === "md") {
					notes.push(child);
				}
				if (child instanceof TFolder) {
					if (includeCurrentFolders) folders.push(child);
					if (this.settings.includeSubfolderContents) visit(child, true);
				}
			});
		};

		visit(folder, true);
		return {
			notes: this.sortFiles(notes),
			folders: this.sortFolders(folders),
		};
	}

	collectLinkedNotes(file: TFile | null): TFile[] {
		if (!file) return [];
		const resolvedLinks: Record<string, number> = this.app.metadataCache.resolvedLinks[file.path] ?? {};
		const linkedFiles = Object.keys(resolvedLinks)
			.map((path) => this.app.vault.getAbstractFileByPath(path))
			.filter((linkedFile): linkedFile is TFile => linkedFile instanceof TFile && linkedFile.extension === "md");
		return this.sortFiles(dedupeFiles(linkedFiles));
	}

	displayPath(file: TAbstractFile): string {
		return file.path === "/" || file.path === "" ? "Vault root" : file.path;
	}

	getFullPath(vaultPath: string): string | null {
		const adapter = this.app.vault.adapter as Partial<AdapterWithFullPath>;
		if (typeof adapter.getFullPath !== "function") return null;
		return adapter.getFullPath(vaultPath);
	}

	async readBookmarks(): Promise<Shortcut[]> {
		let raw = "";
		try {
			raw = await this.app.vault.adapter.read(`${this.app.vault.configDir}/bookmarks.json`);
		} catch {
			return [];
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return [];
		}
		const shortcuts: Shortcut[] = [];
		const seen = new Set<string>();

		const addPath = (label: string | undefined, path: string): void => {
			const normalized = this.normalizeShortcutPath(path);
			if (seen.has(normalized)) return;
			const target = this.app.vault.getAbstractFileByPath(normalized);
			if (!(target instanceof TFile) && !(target instanceof TFolder)) return;
			seen.add(normalized);
			shortcuts.push({ label: label?.trim() || target.name, path: normalized });
		};

		const walk = (value: unknown): void => {
			if (Array.isArray(value)) {
				value.forEach(walk);
				return;
			}
			if (!isRecord(value)) return;

			const path = typeof value.path === "string" ? value.path : null;
			const title = typeof value.title === "string" ? value.title : undefined;
			if (path) addPath(title, path);
			Object.values(value).forEach(walk);
		};

		walk(parsed);
		return shortcuts;
	}

	private addCopyMenuItem(menu: Menu, title: string, kind: CopyAction): void {
		menu.addItem((item) =>
			item
				.setTitle(title)
				.setIcon("copy")
				.onClick(() => void this.copyCurrentLocation(kind)),
		);
	}

	private getCopyText(kind: CopyAction, file: TFile, folderPath: string): string | null {
		switch (kind) {
			case "vault-note":
				return file.path;
			case "vault-folder":
				return folderPath;
			case "system-note":
				return this.noticeIfMissingFullPath(file.path);
			case "system-folder":
				return this.noticeIfMissingFullPath(folderPath);
			case "obsidian-uri":
				return `obsidian://open?vault=${encodeURIComponent(this.app.vault.getName())}&file=${encodeURIComponent(file.path)}`;
			case "wiki-link":
				return `[[${file.path.replace(/\.md$/i, "")}]]`;
			case "markdown-file-link":
				return `[${file.basename}](${encodeURI(file.path)})`;
		}
	}

	private noticeIfMissingFullPath(vaultPath: string): string | null {
		const fullPath = this.getFullPath(vaultPath);
		if (!fullPath) {
			new Notice("Full system paths are not available in this Obsidian environment.");
			return null;
		}
		return fullPath;
	}

	private getElectronShell(): ElectronShell | null {
		const requireFn = window.require;
		if (!requireFn) return null;
		const electron = requireFn("electron") as ElectronModule;
		return electron.shell ?? null;
	}

	private resolveSystemPath(systemPath: string): string | null {
		if (systemPath === "~" || systemPath.startsWith("~/")) {
			const home = this.getHomeDir();
			if (!home) return null;
			return systemPath === "~" ? home : `${home}${systemPath.slice(1)}`;
		}
		return systemPath;
	}

	private getHomeDir(): string | null {
		const requireFn = window.require;
		if (!requireFn) return null;
		const os = requireFn("os") as OsModule;
		return typeof os.homedir === "function" ? os.homedir() : null;
	}

	private scheduleToolbarRender(): void {
		if (this.renderTimer !== null) {
			window.clearTimeout(this.renderTimer);
		}
		this.renderTimer = window.setTimeout(() => {
			this.renderTimer = null;
			this.renderToolbars();
		}, 100);
	}

	private renderToolbars(): void {
		this.removeToolbars();
		if (!this.settings.enabled) return;
		const leaves = this.app.workspace.getLeavesOfType("markdown");
		leaves.forEach((leaf) => {
			if (leaf.view instanceof MarkdownView) {
				this.renderToolbarForView(leaf.view);
			}
		});
	}

	private renderToolbarForView(view: MarkdownView): void {
		const file = view.file;
		if (!file || file.extension !== "md") return;

		const container = view.contentEl;
		Array.from(container.children)
			.filter((el): el is HTMLElement => el.instanceOf(HTMLElement) && el.hasClass(PLUGIN_CLASS))
			.forEach((el) => el.remove());

		const toolbar = container.createDiv({ cls: PLUGIN_CLASS });
		toolbar.setAttr("data-plugin", "fjg-note-navigator-toolbar");
		this.moveToolbarIntoNoteFlow(container, toolbar);

		BUTTONS.forEach((button) => {
			if (!this.settings.buttons[button.id]) return;
			if (button.desktopOnly && Platform.isMobile) return;

			const buttonEl = toolbar.createEl("button", {
				cls: `${PLUGIN_CLASS}__button`,
				attr: {
					type: "button",
					"aria-label": button.label,
					title: button.label,
				},
			});
			const iconEl = buttonEl.createSpan({ cls: `${PLUGIN_CLASS}__icon` });
			setIcon(iconEl, button.icon);
			buttonEl.createSpan({ cls: `${PLUGIN_CLASS}__label`, text: button.label });
			buttonEl.addEventListener("click", (event) => this.handleToolbarButton(button.id, event));
		});

		container.prepend(toolbar);
	}

	private moveToolbarIntoNoteFlow(container: HTMLElement, toolbar: HTMLElement): void {
		const anchors = Array.from(
			container.querySelectorAll<HTMLElement>(".metadata-container, .metadata-properties, .inline-title"),
		).filter((el) => el.offsetParent !== null);
		const anchor = anchors.length > 0 ? anchors[anchors.length - 1] : undefined;
		if (!anchor) {
			container.prepend(toolbar);
			return;
		}
		anchor.insertAdjacentElement("afterend", toolbar);
	}

	private removeToolbars(): void {
		window.activeDocument?.querySelectorAll<HTMLElement>(`.${PLUGIN_CLASS}`).forEach((el) => {
			el.remove();
		});
	}

	private handleToolbarButton(buttonId: ToolbarButtonId, event: MouseEvent): void {
		switch (buttonId) {
			case "folderNavigator":
				this.openFolderNavigator();
				break;
			case "copyLocation":
				this.showCopyMenu(event);
				break;
			case "recentNotes":
				new RecentNotesModal(this.app, this).open();
				break;
			case "bookmarks":
				new BookmarksModal(this.app, this).open();
				break;
			case "openFolder":
				this.showOpenFolderMenu(event);
				break;
			case "projectFolders":
				this.showProjectFoldersMenu(event);
				break;
		}
	}
}

class FolderNavigatorModal extends Modal {
	private query = "";

	constructor(
		app: App,
		private readonly plugin: FjgNoteToolbarPlugin,
		private folder: TFolder,
		private readonly sourceFile: TFile | null = plugin.getActiveMarkdownFile(),
	) {
		super(app);
	}

	onOpen(): void {
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("fjg-note-toolbar-modal");

		const header = contentEl.createDiv({ cls: "fjg-note-toolbar-modal__header" });
		header.createEl("h2", { text: "Folder navigator" });
		header.createEl("p", { text: this.plugin.displayPath(this.folder) });

		const controls = contentEl.createDiv({ cls: "fjg-note-toolbar-modal__controls" });
		const search = controls.createEl("input", {
			cls: "fjg-note-toolbar-modal__search",
			attr: {
				type: "search",
				placeholder: "Search notes and folders...",
				value: this.query,
			},
		});
		search.addEventListener("input", () => {
			this.query = search.value;
			this.render();
		});
		window.setTimeout(() => search.focus(), 0);

		if (this.folder.parent) {
			const parentButton = controls.createEl("button", {
				cls: "fjg-note-toolbar-modal__utility",
				text: "Parent folder",
				attr: { type: "button" },
			});
			parentButton.addEventListener("click", () => {
				if (!this.folder.parent) return;
				this.folder = this.folder.parent;
				this.query = "";
				this.render();
			});
		}

		const entries = this.plugin.collectFolderEntries(this.folder);
		const query = this.query.trim().toLowerCase();
		const folders = entries.folders.filter((folder) => matchesQuery(folder.path, query));
		const notes = entries.notes.filter((file) => matchesQuery(file.path, query));
		const notePaths = new Set(notes.map((file) => file.path));
		const linkedNotes = this.plugin
			.collectLinkedNotes(this.sourceFile)
			.filter((file) => !notePaths.has(file.path))
			.filter((file) => matchesQuery(file.path, query));

		if (this.plugin.settings.showFoldersInPopups) this.renderFolderSection(contentEl, folders);
		if (this.plugin.settings.showNotesInPopups) {
			this.renderNoteSection(contentEl, "Notes", notes);
			this.renderNoteSection(contentEl, "Linked notes", linkedNotes);
		}
		if (
			(!this.plugin.settings.showFoldersInPopups || folders.length === 0) &&
			(!this.plugin.settings.showNotesInPopups || (notes.length === 0 && linkedNotes.length === 0))
		) {
			contentEl.createDiv({ cls: "fjg-note-toolbar-modal__empty", text: "No matching notes or folders." });
		}
	}

	private renderFolderSection(contentEl: HTMLElement, folders: TFolder[]): void {
		const section = contentEl.createDiv({
			cls: "fjg-note-toolbar-modal__section fjg-note-toolbar-modal__section--folders",
		});
		section.createEl("h3", { text: "Subfolders" });
		if (folders.length === 0) {
			section.createDiv({ cls: "fjg-note-toolbar-modal__empty", text: "No subfolders." });
			return;
		}
		const list = section.createDiv({ cls: "fjg-note-toolbar-modal__list" });
		folders.forEach((folder) => {
			const button = list.createEl("button", {
				cls: "fjg-note-toolbar-modal__row",
				attr: { type: "button" },
			});
			const icon = button.createSpan({ cls: "fjg-note-toolbar-modal__row-icon" });
			setIcon(icon, "folder");
			button.createSpan({ cls: "fjg-note-toolbar-modal__row-title", text: folder.name || "Vault root" });
			button.createSpan({ cls: "fjg-note-toolbar-modal__row-path", text: this.plugin.displayPath(folder) });
			button.addEventListener("click", () => {
				this.folder = folder;
				this.query = "";
				this.render();
			});
		});
	}

	private renderNoteSection(contentEl: HTMLElement, title: string, notes: TFile[]): void {
		if (notes.length === 0) return;
		const section = contentEl.createDiv({
			cls: "fjg-note-toolbar-modal__section fjg-note-toolbar-modal__section--notes",
		});
		section.createEl("h3", { text: title });
		const list = section.createDiv({ cls: "fjg-note-toolbar-modal__list" });
		notes.forEach((file) => {
			const button = list.createEl("button", {
				cls: "fjg-note-toolbar-modal__row",
				attr: { type: "button" },
			});
			const icon = button.createSpan({ cls: "fjg-note-toolbar-modal__row-icon" });
			setIcon(icon, "file-text");
			button.createSpan({ cls: "fjg-note-toolbar-modal__row-title", text: file.basename });
			button.createSpan({ cls: "fjg-note-toolbar-modal__row-path", text: file.path });
			button.addEventListener("click", () => {
				void this.plugin.openFile(file);
				this.close();
			});
		});
	}
}

class RecentNotesModal extends Modal {
	private query = "";

	constructor(
		app: App,
		private readonly plugin: FjgNoteToolbarPlugin,
	) {
		super(app);
	}

	onOpen(): void {
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("fjg-note-toolbar-modal");

		contentEl.createEl("h2", { text: "Recent notes" });
		const search = contentEl.createEl("input", {
			cls: "fjg-note-toolbar-modal__search",
			attr: {
				type: "search",
				placeholder: "Search recent notes...",
				value: this.query,
			},
		});
		search.addEventListener("input", () => {
			this.query = search.value;
			this.render();
		});
		window.setTimeout(() => search.focus(), 0);

		const activeFolderPath = this.plugin.getActiveFolder()?.path ?? "";
		const query = this.query.trim().toLowerCase();
		const files = this.plugin.settings.recentNotes
			.map((recent) => this.plugin.getFile(recent.path))
			.filter((file): file is TFile => file instanceof TFile)
			.filter((file) => matchesQuery(file.path, query));

		const currentFolderFiles = files.filter((file) => (file.parent?.path ?? "") === activeFolderPath);

		if (currentFolderFiles.length > 0) {
			this.renderNoteList(contentEl, "Current Folder Recent Notes", currentFolderFiles);
		}
		this.renderNoteList(contentEl, "All Recent Notes", files);

		if (files.length === 0) {
			contentEl.createDiv({ cls: "fjg-note-toolbar-modal__empty", text: "No recent notes yet." });
		}
	}

	private renderNoteList(contentEl: HTMLElement, title: string, files: TFile[]): void {
		if (files.length === 0) return;
		const sectionClass = title === "Current Folder Recent Notes"
			? "fjg-note-toolbar-modal__section fjg-note-toolbar-modal__section--current-recent"
			: "fjg-note-toolbar-modal__section fjg-note-toolbar-modal__section--all-recent";
		const section = contentEl.createDiv({ cls: sectionClass });
		section.createEl("h3", { text: title });
		const list = section.createDiv({ cls: "fjg-note-toolbar-modal__list" });
		files.forEach((file) => {
			const button = list.createEl("button", {
				cls: "fjg-note-toolbar-modal__row",
				attr: { type: "button" },
			});
			const icon = button.createSpan({ cls: "fjg-note-toolbar-modal__row-icon" });
			setIcon(icon, "file-clock");
			button.createSpan({ cls: "fjg-note-toolbar-modal__row-title", text: file.basename });
			button.createSpan({ cls: "fjg-note-toolbar-modal__row-path", text: file.path });
			button.addEventListener("click", () => {
				void this.plugin.openFile(file);
				this.close();
			});
		});
	}
}

class BookmarksModal extends Modal {
	private query = "";

	constructor(
		app: App,
		private readonly plugin: FjgNoteToolbarPlugin,
	) {
		super(app);
	}

	onOpen(): void {
		void this.render();
	}

	private async render(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("fjg-note-toolbar-modal");

		contentEl.createEl("h2", { text: "Bookmarks" });
		const search = contentEl.createEl("input", {
			cls: "fjg-note-toolbar-modal__search",
			attr: {
				type: "search",
				placeholder: "Search bookmarks and shortcuts...",
				value: this.query,
			},
		});
		search.addEventListener("input", () => {
			this.query = search.value;
			void this.render();
		});
		window.setTimeout(() => search.focus(), 0);

		const bookmarkShortcuts = await this.plugin.readBookmarks();
		const allShortcuts = [
			...bookmarkShortcuts,
			...this.plugin.settings.customFolderShortcuts,
			...this.plugin.settings.customNoteShortcuts,
		];
		const query = this.query.trim().toLowerCase();
		const filtered = allShortcuts.filter((shortcut) => matchesQuery(`${shortcut.label} ${shortcut.path}`, query));

		if (filtered.length === 0) {
			contentEl.createDiv({ cls: "fjg-note-toolbar-modal__empty", text: "No bookmarks or shortcuts found." });
			return;
		}

		const list = contentEl.createDiv({ cls: "fjg-note-toolbar-modal__list" });
		filtered.forEach((shortcut) => {
			const target = this.app.vault.getAbstractFileByPath(this.plugin.normalizeShortcutPath(shortcut.path));
			const isFolder = target instanceof TFolder;
			const isFile = target instanceof TFile;

			const button = list.createEl("button", {
				cls: "fjg-note-toolbar-modal__row",
				attr: { type: "button" },
			});
			const icon = button.createSpan({ cls: "fjg-note-toolbar-modal__row-icon" });
			setIcon(icon, isFolder ? "folder" : "bookmark");
			button.createSpan({ cls: "fjg-note-toolbar-modal__row-title", text: shortcut.label });
			button.createSpan({ cls: "fjg-note-toolbar-modal__row-path", text: shortcut.path });
			button.addEventListener("click", () => {
				if (isFolder) {
					this.plugin.openFolderShortcut(shortcut);
					this.close();
					return;
				}
				if (isFile) {
					this.plugin.openNoteShortcut(shortcut);
					this.close();
					return;
				}
				new Notice(`Bookmark target not found: ${shortcut.path}`);
			});
		});
	}
}

class FjgNoteToolbarSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: FjgNoteToolbarPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("fjg-note-toolbar-settings");

		new Setting(containerEl).setName("Toolbar").setHeading();
		new Setting(containerEl)
			.setName("Enable note toolbar")
			.setDesc("Show the custom workflow toolbar at the top of Markdown notes.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
					this.plugin.settings.enabled = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName("Toolbar buttons").setHeading();
		BUTTONS.forEach((button) => {
			new Setting(containerEl)
				.setName(button.label)
				.setDesc(button.desktopOnly ? "Desktop only. Hidden on mobile." : "Show this button in note toolbars.")
				.addToggle((toggle) =>
					toggle.setValue(this.plugin.settings.buttons[button.id]).onChange(async (value) => {
						this.plugin.settings.buttons[button.id] = value;
						await this.plugin.saveSettings();
					}),
				);
		});

		new Setting(containerEl).setName("Popup contents").setHeading();
		new Setting(containerEl)
			.setName("Show notes")
			.setDesc("Include notes in folder, recent, and bookmark popups.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showNotesInPopups).onChange(async (value) => {
					this.plugin.settings.showNotesInPopups = value;
					await this.plugin.saveSettings();
				}),
			);
		new Setting(containerEl)
			.setName("Show folders")
			.setDesc("Include folders in folder and bookmark popups.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showFoldersInPopups).onChange(async (value) => {
					this.plugin.settings.showFoldersInPopups = value;
					await this.plugin.saveSettings();
				}),
			);
		new Setting(containerEl)
			.setName("Include subfolder contents")
			.setDesc("Show notes from nested folders when browsing a folder.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.includeSubfolderContents).onChange(async (value) => {
					this.plugin.settings.includeSubfolderContents = value;
					await this.plugin.saveSettings();
				}),
			);
		new Setting(containerEl)
			.setName("Sort order")
			.setDesc("Controls note ordering inside folder popups.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("alphabetical", "Alphabetical")
					.addOption("modified", "Modified date")
					.addOption("created", "Created date")
					.setValue(this.plugin.settings.sortOrder)
					.onChange(async (value) => {
						this.plugin.settings.sortOrder = value as SortOrder;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Max recent notes")
			.setDesc("How many recently opened notes to keep.")
			.addText((text) => {
				text.inputEl.type = "number";
				text
					.setPlaceholder(String(DEFAULT_SETTINGS.maxRecentNotes))
					.setValue(String(this.plugin.settings.maxRecentNotes))
					.onChange(async (value) => {
						const parsed = Number.parseInt(value, 10);
						this.plugin.settings.maxRecentNotes = Number.isFinite(parsed) ? Math.max(1, parsed) : DEFAULT_SETTINGS.maxRecentNotes;
						this.plugin.settings.recentNotes = this.plugin.settings.recentNotes.slice(0, this.plugin.settings.maxRecentNotes);
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName("Folder shortcuts").setHeading();
		new Setting(containerEl)
			.setName("Custom folder shortcuts")
			.setDesc("One per line: Label | vault-relative folder path. Desktop open actions also accept full system paths.")
			.addTextArea((text) => {
				text.inputEl.rows = 8;
				text
					.setPlaceholder("Label | folder path")
					.setValue(formatShortcuts(this.plugin.settings.customFolderShortcuts))
					.onChange(async (value) => {
						this.plugin.settings.customFolderShortcuts = parseShortcuts(value);
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName("Note shortcuts").setHeading();
		new Setting(containerEl)
			.setName("Custom note shortcuts")
			.setDesc("One per line: Label | vault-relative note path.")
			.addTextArea((text) => {
				text.inputEl.rows = 8;
				text
					.setPlaceholder("Dashboard | Artifacts/Agent Mission Control/README.md")
					.setValue(formatShortcuts(this.plugin.settings.customNoteShortcuts))
					.onChange(async (value) => {
						this.plugin.settings.customNoteShortcuts = parseShortcuts(value);
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName("AI / project folder shortcuts").setHeading();
		new Setting(containerEl)
			.setName("Project folder shortcuts")
			.setDesc("One per line: Label | vault-relative folder path. Desktop open actions also accept full system paths.")
			.addTextArea((text) => {
				text.inputEl.rows = 8;
				text
					.setPlaceholder("AI team | AI team")
					.setValue(formatShortcuts(this.plugin.settings.projectFolderShortcuts))
					.onChange(async (value) => {
						this.plugin.settings.projectFolderShortcuts = parseShortcuts(value);
						await this.plugin.saveSettings();
					});
			});
	}
}

function matchesQuery(value: string, query: string): boolean {
	return query === "" || value.toLowerCase().includes(query);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function dedupeFiles(files: TFile[]): TFile[] {
	const seen = new Set<string>();
	return files.filter((file) => {
		if (seen.has(file.path)) return false;
		seen.add(file.path);
		return true;
	});
}

function parseShortcuts(value: string): Shortcut[] {
	return value
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [rawLabel, ...rawPathParts] = line.split("|");
			const label = rawLabel.trim();
			const path = rawPathParts.join("|").trim();
			return path ? { label, path } : { label, path: label };
		})
		.filter((shortcut) => shortcut.label.length > 0 && shortcut.path.length > 0);
}

function formatShortcuts(shortcuts: Shortcut[]): string {
	return shortcuts.map((shortcut) => `${shortcut.label} | ${shortcut.path}`).join("\n");
}
