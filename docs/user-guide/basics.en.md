# Basics

> Reviewed for Super Lib v2.3.19 (2026-10-11). Screenshots retain their recorded versions; external integrations require separate acceptance.

[简体中文](basics.md) · [User guide](README.en.md) · [Floating image preview](#floating-image-preview) · [Corner hint bubble](#hover-hints)

## Create, open, and configure a library

On first launch choose **Create library**, pick a location, and enter a display name. A library contains managed assets, its database, and a `.super/` working directory. The display name does not move the library directory.

Use the upper-left **Main menu → Library** to create, open, or import libraries. **Library settings** lets you rename the current library, see its location, and edit its ignore configuration.

The ignore editor uses one rule per line, similar to `.gitignore`; the UI calls it an “ignore configuration file”. Saving immediately affects browsing, search, and scanning:

```text
# Ignore temporary files
*.tmp
# Ignore draft files, then keep one file
references/drafts/*
!references/drafts/keep.png
```

The `?` help explains `*`, `?`, `**`, a trailing `/` for directories, a leading `/` for library-root rules, and `!` negation.

### Open external libraries (Eagle / Billfish)

**Open library** → **Open external library…** → choose **Eagle** or **Billfish**:

1. Pick the source library (an Eagle/Billfish library folder or its archive);
2. choose where Super should create the local library;
3. Super converts the source and creates a local library at the destination (a large Eagle library can take several minutes on first conversion).

After conversion, browsing, search, tags, AI analysis, and everything else work exactly like a local library, and the original files are left untouched.

![Current external-library entry; no conversion started](../assets/ui/live-2.3.17/21-library-menu.png)

## Import assets

Drop one or more files, folders, or a mixed selection into Super, or use **Import files** / **Import folder**. Folder imports are recursive. For web assets you have permission to save, download them with your browser first, then import the local files.

The current product registry includes:

- Images: PNG, JPG/JPEG, JFIF, AVIF, GIF, TIFF/TIF, WebP, SVG, BMP, ICO, PSD, EXR, TGA
- Camera RAW: RAW, DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2
- Video: MP4, MOV, AVI, WMV, WebM, MKV, M4V, FLV
- Audio: WAV, MP3, OGG/OGA, M4A, AAC, FLAC, Opus (embedded artwork when available, waveform fallback and playback)
- 3D: FBX, OBJ, GLTF, GLB, STL (FBX is converted to a viewable GLB)
- Text: TXT, Markdown, JSON, CSV, XML, YAML, and common source/config formats
- Documents: PDF and HTML/HTM; preview behavior depends on document type

ZIP and EXE cards display themed extension thumbnails; this does not itself indicate a corrupt file. In 2.3.19, double-click a ZIP to browse members and use bounded read-only previews.

Super copies managed files into the library and assigns a stable asset ID. Name or content duplicates open a conflict dialog. Thumbnails and technical metadata are generated in the background. Automatic AI analysis only runs when configured and enabled; you can browse while background work continues.

#### Sequence-frame import

In **Settings → Assets**, turn **Detect image sequences during import** on or off (on by default). When enabled, dropping or importing consecutively numbered, same-size images (for example `00001.png`…`00150.png`) opens the sequence import dialog, where you can set the FPS. When disabled, the files are imported as ordinary images. A sequence appears as one playable asset in the viewer and can be dissolved back into individual frames.

In the dialog, adjust the frame range and FPS, then choose whether to import only the current file or the selected frames as a sequence.

## Browse and organize

- Sidebar: All assets, Trash, folders, collections, and smart collections. Folders and collections can include descendants; a collection is a many-to-many relationship, so an asset may belong to several collections.
- Canvas: tile, masonry, and folder/collection cards. Resizing sidebars or card size reflows the layout while preserving the approximate scroll position.
- Toolbar: search, filters, sorting, view, and card fields. In non-grid pages, irrelevant view controls are hidden.
- Inspector: file information, tags, rating, favorite, description, source URL, author, technical metadata, color space, and AI content.

Click to select and double-click to open the viewer. Drag on empty canvas space to marquee-select; use `⌘` on macOS or `Ctrl` on Windows while clicking to add to a selection. `Tab` moves focus between assets; `Shift` enables range selection where supported. Folders, collections, and smart collections support context-menu actions, inline `F2` rename, and `Delete`; deleting a non-empty container confirms first, and deleting a collection never deletes its assets.

![Library, Inspector, filters, and AI overview; Chinese UI](../assets/ui/live-2.3.17/05-inspector.png)

### Create a root-level folder

A new folder normally becomes a child of the selected folder. Starting with v2.3.0, click the sidebar's **Folders** heading or its trailing blank area, then the adjacent **+**, to create at the library root. The heading highlights the root creation target without changing the current view, open preview, or keyboard focus on mouse click. Show ignored items, add, and link remain independent buttons. Clicking, dragging, or double-clicking the title bar no longer changes the creation target; double-click retains the native window behavior.

Folders and All assets render progressively in pages. Sidebar counts, exact totals, and previews may update later. The indeterminate loading bar means a result is pending, not a measured completion percentage.

## Viewer

Double-click an asset to open the viewer. Images, SVG, RAW, PSD, TIFF, TGA, and EXR use their decoder or a generated derivative; SVG is rendered from its vector source in the viewer, not treated as the thumbnail. Videos loop by default and may use a Super-generated compatible proxy. Audio shows a waveform and playback controls. 3D models use the dedicated model viewer. PDF files render page-by-page in the built-in pdf.js viewer.

The viewer supports pan, wheel zoom, fit-to-view (numpad `.`), fullscreen, and rotate/horizontal/vertical mirror transforms for images and video. PDF preview supports zoom (0.25×–8×), pan, and fit-to-page; scrolling zooms around the mouse pointer. For formats other than PNG/JPEG, Super uses a detected color space when available and lets you choose among supported spaces. EXR can expose multiple planes/parts when present; this is not a professional channel-grading tool.

![Current 3D viewer displaying a repository-owned OBJ fixture](../assets/ui/live-2.3.17/viewer-model.png)

<a id="floating-image-preview"></a>

### Floating preview (updated in v2.3.2)

Keep a reference image or PDF visible while working in another application:

1. Double-click an image or PDF to open the viewer. Move the pointer near its controls or a window edge to reveal them.
2. Click **Float preview** in the controls. Once the floating window appears, the Super Lib main window minimizes automatically.
3. Drag the floating window's top area to move it. Drag an edge or corner to resize it. Images fit proportionally without stretching; PDFs retain page scrolling, zoom, fit, and drag-to-pan controls.
4. Move the pointer into the floating window to reveal its close button at the upper right. Click it, or press `Esc` while the floating window has focus, to restore the main window and continue browsing and previewing.

One image or PDF is shown at a time; opening another replaces it. This control is for ready image and PDF previews, not video, audio, or 3D viewers. The window stays above ordinary application windows; system security screens and exclusive fullscreen applications may cover it.

An image floating window uses its own fit-to-window view and does not inherit the main viewer's zoom, rotation, mirroring, or temporary color-space selection. A PDF reloads independently in the floating window and manages its own zoom and scroll. Close it to return to the main viewer.

### Image viewer controls (updated in v2.3.1)

The bottom controls leave space above the window edge, and tool hints use the unified lower-right bubble. The color-space menu follows light and dark themes; dimmed options are unavailable for selection.

<a id="hover-hints"></a>

## Corner hint bubble (current behavior)

In the main window, hover over a control or name with a hint to see the unified lower-right bubble. The duplicate native hint near the pointer is suppressed.

This includes toolbar buttons, sidebar folder, collection, and smart-collection names, plus asset names, list entries, and settings with existing hints. Long names wrap in the bubble so you can read the full text. Ordinary content without a hint does not receive an additional description.

The corner bubble follows the active theme and lets mouse clicks pass through. It hides when you move away, click, scroll, switch windows, or press `Esc`. It is enabled by default and requires no setup.

## Tags, collections, and smart collections

- Add tags from the Inspector or an asset context menu. The tag picker supports search, recent tags, and batch operations.
- Collections are manually maintained relationships. Drag assets into a collection or use the **Add to collection** submenu; removing an asset from a collection only removes the relationship.
- Smart collections save a search, filter, and sort definition and calculate results live.

## Trash and deletion

Normal `Delete` / macOS `⌘⌫` moves an asset or folder to Trash. Windows `Shift+Delete` and macOS `⌥⌘Delete` delete from disk after a confirmation. The undo icon in the notification can reverse the most recent undoable file operation and refreshes the current view.

## Linked folders

**Import linked folder** in the **File** menu references a real folder outside the library (such as a project or material directory). Assets are not copied into the library; they are referenced in place in their original folder. You can later copy a linked folder into the library (making it managed), relink it, or set rules for it.

## WebDAV cloud sync

Super can sync a library across machines over WebDAV: configure servers globally, bind each library, set auto-sync and the poll interval, and open remote synced libraries. See [Sync and external libraries](sync.en.md).

### Custom icons

Folders, collections and smart collections offer icon settings with 11 categories/200+ emoji, 24 glyphs and 8 colors. Search, save or restore the default. These local preferences do not rename files, change membership or sync with a WebDAV library. See the [illustrated guide](features.md).

## Shortcuts

| Action | macOS | Windows |
| --- | --- | --- |
| Open viewer | Enter | Enter |
| Open in external app | ⌘O | Ctrl+O |
| Reveal in file manager | ⌘⇧S | Ctrl+Shift+S |
| Focus search | ⌘F | Ctrl+F |
| Rename | F2 | F2 |
| Move to Trash | ⌘⌫ | Delete |
| Delete from disk | ⌥⌘Delete | Shift+Delete |
| Copy / Paste | ⌘C / ⌘V | Ctrl+C / Ctrl+V |
| Fit viewer | Numpad `.` | Numpad `.` |

See [Search and filters](search-and-filters.en.md) for query examples and [AI analysis](ai.en.md) for AI setup and jobs.

## 2.3.18 organization and viewer additions

Audio uses embedded artwork when available, with waveform fallback and a viewer waveform toggle. TTF/OTF/WOFF/WOFF2/TTC fonts load temporarily for sample preview without system installation; TTC previews its first face and uses a generic format card. GIF offers bounded pause/frame stepping; video speed spans 0.25×–4×. Text supports wrapping and decoding UTF-16/GB18030; convert to UTF-8 with a backup before editing legacy content. The new Markdown and ZIP viewers are described below.

Use sidebar filtering to retain matching ancestors; sorting changes display order. Dropping a child onto its direct parent promotes it one level, or to the root for a top-level parent. Folder Inspector statistics and automatic cover candidates come from the library index. Batch folder creation allows up to 32 names and retains successful items when another name fails.

Up to six session workspaces keep separate navigation, filters, selection, preview and scroll, while sharing background work. They are not persisted across restarts; switching libraries collapses the set.

Display rotation/mirroring does not write files. Explicit write-back is limited to supported managed static images (32 MiB/16M pixels), confirms the change, backs up original bytes and supports undo. Linked-source deletion requires its explicit source-delete action; ordinary unlink/Trash keeps external source bytes. Read the confirmation before permanently deleting.

## 2.3.19 viewers and organization

- Markdown switches between source and rendered GFM, including tables, tasks and code. Drafts and save/conflict checks remain intact. Raw HTML and implicit remote images are disabled; cards and Inspector show bounded structural previews.
- ZIP browsing filters member paths and previews text, Markdown and images without extracting files to disk or executing them. Unsafe paths, encryption, symlinks, duplicate members, corruption and budget overruns are rejected. Limits include 5,000 entries, 8 GiB declared content, 1 MiB text and 8 MiB images, with additional compression-ratio and decoded-pixel checks.
- Use a folder's picture-cover context action to select a library image, save or restore the default. Deleted or unavailable images fall back automatically. Covers live in the library database, do not alter image bytes, and are not included in asset-level WebDAV metadata sync.
- **Settings → Browse** offers reversible hiding of missing linked assets/folders (off by default). It changes display, not index records or ignore rules.
- The same settings page offers proximity, idle and always-visible viewer controls. Proximity is the default; keyboard/focus access is preserved. Previous/next navigation keeps the fullscreen host; closing still exits fullscreen.
- Viewer `Delete` targets only the current asset. Managed `Shift+Delete` retains confirmation; linked assets do not expose that permanent-delete key. Text input and unsaved drafts stay protected.
- Native open/import/save dialogs remember the most recent successful directory, respect explicit paths and do not update on cancel. Newly generated video posters prefer the 25% frame, with bounded fallback; existing posters are not regenerated in bulk.

Back up the complete library before upgrading: this release adds schema migration 52. Do not write the upgraded database with an older app. See [release notes](../releases/v2.3.19.md) and [packaged screenshots](features.md#2319-查看器与资源组织).
