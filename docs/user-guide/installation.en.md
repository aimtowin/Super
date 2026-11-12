# Installation

> Documentation reviewed for Super Lib v2.4.2 on 2026-11-12 against current source and existing [packaged acceptance evidence](../releases/v2.3.21-validation.md). 2.4.2 only changes startup, layout and on-demand viewer loading; this review did not rerun the application or external integrations, and screenshots retain their actual capture versions.

Super Lib is free. Download it from the [latest Super Release](https://github.com/aimtowin/Super/releases/latest). The repository and the 2.4.2 release are public; see the [2.4.2 release acceptance record](../releases/v2.4.2-validation.md). Source remains MIT licensed; external AI providers may charge separately. New users can follow the [quick start](quick-start.en.md).

## Requirements

- Windows: 64-bit Windows 10 or Windows 11
- A local SSD is recommended for the library; assets and preview caches need additional space

Use [Super Releases](https://github.com/aimtowin/Super/releases) for the current Windows installer and version notes.

## Other platforms

The current `v2.4.2` release provides a Windows x64 installer. Check the actual release attachments for availability on other platforms.

## Windows

1. Download [SuperSetup.exe](https://github.com/aimtowin/Super/releases/latest/download/SuperSetup.exe).
2. Run the installer and follow the prompts.

Unsigned development builds may trigger SmartScreen. Verify the source, then choose **More info → Run anyway**. Uninstall from **Settings → Apps**.

## Upgrading

Download through the in-app update prompt or run a newer `SuperSetup.exe` over the existing installation. In-app updates prefer an available delta matching your installed version and otherwise use the full package. Once downloaded and prepared, confirm installation. The separate updater shows completion briefly, automatically launches Super Lib and closes. If launch fails, it retains an error and a manual retry option.

Libraries and user configuration live outside the installation directory; back up your library before upgrading. Full update ZIPs, delta ZIPs, and SHA-256 files are update and verification attachments; a first installation does not require downloading each one.

## Library versions and downgrade

2.4.2 supports database schema 52: 2.3.18 introduced migrations 50/51, 2.3.19 added migration 52, 2.3.20/21 retain it, and 2.4.x does not change the schema. Fully quit and back up the whole library before its first upgrade. An older app may not read the upgraded library. Downgrade using a separate pre-upgrade copy, then check assets and metadata; do not point the old app at your only upgraded library.
