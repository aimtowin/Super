# Quick start

> Documentation reviewed for Super Lib v2.3.21 on 2026-10-13 against current source and existing [packaged acceptance evidence](../releases/v2.3.21-validation.md). This review did not rerun the application or external integrations; screenshots retain their actual capture versions.

[简体中文](quick-start.md) · [User guide](README.en.md) · [Latest release](https://github.com/aimtowin/Super/releases/latest)

Super Lib is free to use. Create a local library to get started; AI and appearance settings are optional and can be configured later.

## 1. Install

Download `SuperSetup.exe` from the [latest GitHub Release](https://github.com/aimtowin/Super/releases/latest), run it, and follow the prompts. The release installer supports Windows x64.

Starting with v2.3.8, a four-step first-run guide helps you create or open a library, import assets, explore the workspace, and optionally configure appearance and AI. You can skip it or replay it from **Settings → General**. Upgrading an existing profile does not automatically show the guide.

You only need the EXE for a first installation. Full update ZIPs, delta ZIPs, and SHA-256 files are update and verification attachments.

## 2. Create a local library

Open the app, choose to create a library, and select a location on a local disk where you can keep your assets long term. An SSD is recommended, especially for large collections. Allow space for assets, thumbnails, and other preview caches, and remember the location for future access and backups.

Once the library is created, you can start browsing and organizing.

With a library already open, use **Main menu → Library → New library**. Enter a name, then follow the prompt to select a local location.

![Create-library dialog in the running application; Chinese UI](../assets/ui/live-2.3.17/03-create-library.png)

## 3. Optionally set up AI and appearance

Open **Main menu → Settings → AI**, enter your provider's API settings, model, and API key, then test the connection and save. See [AI analysis and search](ai.en.md). Importing, browsing, filtering, and organizing do not require AI.

You choose the AI service; third-party providers may charge. Analysis sends images or previews to the selected provider, so review its data handling before analyzing private assets.

In **Main menu → Settings → Appearance**, choose a light or dark theme, theme colors, a custom background, background opacity, and text size. Text-size levels `1`–`4` affect application text only.

See [Appearance](appearance.en.md) for screenshots and details.

## 4. Add your first assets

Start with a small collection to become familiar with the controls.

| Method | Use it when | File location |
| --- | --- | --- |
| Import files or folders | You want Super Lib to keep a copy | Copied into the library |
| Link a folder | You want to keep using an existing asset directory | Remains at its original location |

Import through the menu or by dragging files into the window. Use the link action in the sidebar's folder section to link an existing directory. Linked folders and their disks must remain accessible; moving or deleting original files also affects linked assets.

**Main menu → File** also provides separate actions for importing files, importing folders, and importing linked folders.

![Import and link actions in the File menu; Chinese UI](../assets/ui/live-2.3.17/20-import-menu.png)

## 5. Explore

![Super Lib workspace](../assets/ui/live-2.3.17/04-workspace.png)

Navigate folders and collections on the left, browse assets in the center, and inspect details on the right. Double-click an asset to open the viewer; right-click for available actions.

In 2.3.21, folder navigation prioritizes the central first page; Inspector statistics and covers load afterward. A pending Inspector does not require the canvas to wait. Pending first-page or child-folder queries show loading. Import prompts require a successful, confirmed empty scope; failed reads are not empty folders. See [loading states](basics.en.md#2321-folder-navigation-and-loading-states).

- Narrow results with color, tag, and format filters: [Search and filters](search-and-filters.en.md).
- Organize with tags and collections: [Basics](basics.en.md).
- Once AI is configured, analyze assets and find analyzed assets using natural language: [AI analysis and search](ai.en.md).

## Get help

Report bugs through [GitHub Issues](https://github.com/aimtowin/Super/issues) or through the social platform where the author shares Super Lib. Include your app and OS versions, reproduction steps, expected and actual results, and relevant screenshots or errors. Leave out API keys and private assets.

See [Troubleshooting](troubleshooting.en.md) for common issues.
