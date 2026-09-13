<div align="center">

**English** | [简体中文](README.md)

</div>

# Super Lib

<div align="center">

<img src="docs/assets/ui/super-Logo.png" alt="Super Lib logo" width="160" />

</div>

Super Lib is a free local asset manager for creative work. Browse images, videos, audio, and models in one workspace, organize them with folders, tags, color filters, and collections, and optionally add AI analysis and a custom appearance.

[Download for Windows](https://github.com/aimtowin/Super/releases/latest/download/SuperSetup.exe) · [Releases and other downloads](https://github.com/aimtowin/Super/releases/latest) · [Quick start](docs/user-guide/quick-start.en.md) · [Report a bug](https://github.com/aimtowin/Super/issues)

![Super Lib workspace with asset browsing, folder navigation, and a custom background](docs/assets/ui/super-workspace-2.2.8.png)

## Start with a local library

1. Download and install `SuperSetup.exe`, then open Super Lib.
2. Create a library at a location on a local disk. An SSD is recommended; leave room for assets and preview caches.
3. Optionally configure a provider in **Settings → AI** and customize themes, backgrounds, and text size in **Settings → Appearance**. Both steps can be skipped.
4. Import assets or link an existing folder, then start browsing and organizing.

Super Lib itself is free. Optional third-party AI services may charge according to their own pricing.

## Highlights

- **Multiple asset types**: manage images, video, audio, 3D models, text, and other recognized files. Unsupported preview types can still be catalogued and opened externally.
- **Organization and discovery**: folders, tags, ratings, favorites, descriptions, palettes, collections, filters, sorting, and full-text search within the current scope.
- **Local first**: managed imports copy assets into a library, while linked folders reference an external directory in place. Library data stays local and can be synchronized between devices through WebDAV when needed.
- **Browsing and preview**: thumbnails, video previews, metadata, the viewer, and background derivative work are designed not to block browsing.
- **Automation and extensibility**: plugins, controlled automation scripts, and local MCP connections are supported. Writes are bounded by permissions, execution plans, and risk confirmation.
- **AI analysis and search**: generate descriptions and tags for supported media, then use natural language to find analyzed assets and create temporary smart collections. AI is optional and requires your own provider configuration.
- **Appearance**: light and dark themes, custom backgrounds, theme colors, and four application text-size levels.
- **External libraries and browser capture**: supported external libraries can be opened directly; the browser extension saves web images and video into the currently open Super library.

## Install and use

The current `v2.2.8` release provides a Windows x64 installer. Download `SuperSetup.exe` for a first installation. Full update ZIPs and delta packages are update-delivery artifacts. Availability on other platforms depends on the files actually attached to a release.

Libraries live at the location you choose. Importing copies assets into the library; linking references files at their existing location, which must remain accessible. See the [quick start](docs/user-guide/quick-start.en.md).

For installation, import, browsing, sync, AI, extension, and troubleshooting guidance, see the [user guide](docs/user-guide/README.en.md).

## Feedback and license

Report bugs through [GitHub Issues](https://github.com/aimtowin/Super/issues) or through the social platform where the author shares Super Lib. Include your app version, reproduction steps, expected and actual behavior, and relevant screenshots. See [troubleshooting](docs/user-guide/troubleshooting.en.md).

Super Lib is free to use. Repository code is licensed under the [MIT License](LICENSE); third-party component and asset notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Build locally

Node.js 24 is required (see `.nvmrc`). Native development targets macOS arm64 and Windows x64; do not build from an SMB/NAS-mounted path.

```bash
npm ci --registry=https://registry.npmjs.org
npm run rebuild:native
npm start
```

Common verification and packaging commands:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run package
npm run make:inno
```

On Windows, `npm run make:inno` creates `out/make/inno/SuperSetup.exe`. Repository scripts and the [extension author manual](docs/manual/README.md) define the current build, delivery, and extension boundaries.

## Documentation

| Document | Content |
| --- | --- |
| [Quick start](docs/user-guide/quick-start.en.md) | Installation, local library creation, optional setup, and first import |
| [Appearance](docs/user-guide/appearance.en.md) | Color modes, backgrounds, text size, and screenshots |
| [User guide](docs/user-guide/README.en.md) | Install, import, browse, search, tags, collections, sync, AI, browser extension, and troubleshooting |
| [Extension author manual](docs/manual/README.md) | Plugin, automation-script, and MCP development guides and API references |
| [Product brief (historical planning)](docs/product-brief.md) | Product direction and early scope; use the user guide for current instructions |
| [Glossary](docs/glossary.md) | Definitions for libraries, automation, plugins, sync, and more |

License notices for third-party components, media runtimes, and assets are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the license files shipped with each component.
