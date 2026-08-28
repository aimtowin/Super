# Installation

Authorized installers are published through [Super Releases](https://github.com/aimtowin/Super/releases) or supplied directly by the project team.

## Requirements

- macOS: Apple Silicon (arm64) or Intel (x64), macOS 11 or newer
- Windows: 64-bit Windows 10 or Windows 11
- The app uses about 500 MB; library data needs additional space

Use [Super Releases](https://github.com/aimtowin/Super/releases) for the current Windows installer and version notes.

## macOS

1. Download the matching `Super-<version>-arm64.dmg` or x64 package.
2. Open the DMG and drag Super to Applications.

Unsigned development builds may trigger Gatekeeper. Verify the source, then right-click the app, choose Open, and confirm. If it is still blocked, clear quarantine from Terminal:

```bash
xattr -cr /Applications/Super.app
```

To uninstall, move the app to the Trash. Libraries live where you created them and are not removed with the app.

## Windows

1. Download `Super-<version> Setup.exe` or the Windows package attached to the release.
2. Run the installer and follow the prompts.

Unsigned development builds may trigger SmartScreen. Verify the source, then choose **More info → Run anyway**. Uninstall from **Settings → Apps**.

## Browser extension

The project team distributes the browser extension package with supported releases. For installation and usage, see [Browser extension](browser-extension.en.md).

## Upgrading

Replace the macOS app with the new DMG, or run the new Windows installer over the existing install. Libraries and user configuration live outside the application install directory and normally remain; back up a library before upgrading. Follow the release notes for migrations and platform-specific caveats.
