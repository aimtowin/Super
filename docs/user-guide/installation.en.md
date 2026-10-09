# Installation

> Reviewed for Super Lib v2.3.17 (2026-10-09); package availability follows release attachments.

Super Lib is free. Download it from the [latest Super Release](https://github.com/aimtowin/Super/releases/latest). A private GitHub repository requires an authorized signed-in account to download release assets. New users can follow the [quick start](quick-start.en.md).

## Requirements

- Windows: 64-bit Windows 10 or Windows 11
- A local SSD is recommended for the library; assets and preview caches need additional space

Use [Super Releases](https://github.com/aimtowin/Super/releases) for the current Windows installer and version notes.

## Other platforms

The current `v2.3.17` release provides a Windows x64 installer. Check the actual release attachments for availability on other platforms.

## Windows

1. Download [SuperSetup.exe](https://github.com/aimtowin/Super/releases/latest/download/SuperSetup.exe).
2. Run the installer and follow the prompts.

Unsigned development builds may trigger SmartScreen. Verify the source, then choose **More info → Run anyway**. Uninstall from **Settings → Apps**.

## Upgrading

Download through the in-app update prompt or run a newer `SuperSetup.exe` over the existing installation. In-app updates prefer an available delta matching your installed version and otherwise use the full package. Once downloaded and prepared, confirm installation. The separate updater shows completion briefly, automatically launches Super Lib and closes. If launch fails, it retains an error and a manual retry option.

Libraries and user configuration live outside the installation directory; back up your library before upgrading. Full update ZIPs, delta ZIPs, and SHA-256 files are update and verification attachments; a first installation does not require downloading each one.
