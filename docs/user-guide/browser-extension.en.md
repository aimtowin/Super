# Browser extension

> Applies to Super Lib v2.2.8; package availability follows release attachments.

Save web images or videos into a Super library with **context-menu saving** and **drag-and-drop saving**. Supports Chrome / Edge (Chromium) and Firefox.

Media is downloaded by the **browser**, with cookies and Referer as applicable, then passed to the local Super app. Saving depends on the source site's permissions and response. Keep Super running with a library open; the extension connects to it through `127.0.0.1`.

## Installation

> The current `v2.2.8` Release does not include an extension ZIP or Firefox XPI. These instructions apply when you already have a project extension package. Check [release attachments](https://github.com/aimtowin/Super/releases); desktop installers and delta ZIPs are not extensions. Persistent Firefox installation requires a signed XPI.

### Chrome / Edge

1. Obtain `super-extension-<version>.zip` and extract it to a fixed folder (e.g. `Documents/Super-extension`). The folder must directly contain `manifest.json`.
2. Open `chrome://extensions` (Edge: `edge://extensions`) and enable Developer mode (top-right).
3. Click “Load unpacked” and select the extracted folder.

### Firefox

1. Obtain `super-extension-firefox-<version>-signed.xpi`.
2. Open `about:addons` → gear icon → “Install Add-on From File…” → select the downloaded `.xpi`.
3. The extension stays installed across Firefox restarts, like a store install.

### Updating

- **Chrome / Edge**: obtain the new zip, extract over the old folder, then click Refresh on the extension card in `chrome://extensions` (or remove and reload).
- **Firefox**: obtain the new `.xpi` and repeat the install steps; it replaces the old version.

## Usage

1. Start Super and open a library.
2. The extension toolbar icon turns **colored** when connected and stays **gray** when not.
3. **Context-menu save**: right-click an image or video on a web page → “Save to Super” → choose a target folder (recent saves/browses → separator → root → top-level folders; subfolders expand level by level).
4. **Drag-and-drop save**: drag an image and a tree-shaped save menu opens — hover `›` on a folder with children to enter its level, `‹` to go back, release outside the panel or press `Esc` to cancel.
5. A “Saving to Super” bubble shows progress on the page.

### Options page

Right-click the extension icon → Options to toggle:

- Notifications (system notification for save results)
- Focus Super after saving
- Reveal the saved asset in the library
- The drag-and-drop tree menu on web images/videos

## Troubleshooting

**“Cannot connect to Super”**

Make sure Super is running with a library open. Gray icon = disconnected; colored = connected.

**“forbidden origin” (403) when saving**

Check desktop/extension compatibility and record the browser version, extension version, and full error. An old version threshold alone is not sufficient guidance; report persistent problems.

**The saved image is not visible in the library**

Check the “Reveal in library” option in the extension options page, and confirm the target folder you chose.

**Firefox says “This add-on could not be installed because it appears to be corrupt” / “not verified”**

Possible causes include signing, file integrity, and browser compatibility. Use a project-provided signed XPI. If no such asset is attached, the release page currently does not provide a persistently installable Firefox package.

**Does the extension access all websites? Is it safe?**

The extension accesses target pages to identify and download media. Downloads contact source websites; library writes use the local Super endpoint. Check the package source and permissions shown by the browser.

## Privacy

- Download requests may include cookies and Referer headers required by the source; this is not entirely offline operation.
- Saves are initiated by you; media files are uploaded directly to your local Super app.
- The only stored record (recently used folders) lives in the browser’s local `storage`.
