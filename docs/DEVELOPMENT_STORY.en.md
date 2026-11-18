# How I continued developing Super Lib

[简体中文](DEVELOPMENT_STORY.md) | **English**

By [aimtowin](https://github.com/aimtowin) · Through November 18, 2026 ([Super Lib 2.5.0](https://github.com/aimtowin/Super/releases/tag/v2.5.0))

I started from an existing open-source asset manager. In August 2026, I set up Super's own repository, release series, and `.super` library identifier. What shaped the project after that was not the name or icon. It was a set of problems I kept running into in the library: What should appear first when I switch folders? Can a disk scan yield while I keep working? Why should a small change make users download the entire installer? This page traces how I turned those questions into changes you can inspect in the source and release records.

## Show assets first and let background work catch up

Early on, I extended first-page loading from All Assets to folder browsing and moved sidebar statistics, exact counts, and derived media work off the initial display path. The [2.2.8 source baseline](https://github.com/aimtowin/Super/commit/6ad35fe55b24bdb2cc48b9e53543af07e6e17c67) captures that period of development; not every intermediate version has its own commit.

The harder problem was concurrency. When I switched folders quickly, a late response from the previous folder could not be allowed to overwrite the new canvas. A refresh triggered by disk changes or AI work also needed to leave fullscreen previews, filters, and unsaved descriptions alone. In [2.3.17](releases/v2.3.17.md), I tied page requests to the active browsing session and query generation, coalesced duplicate refreshes, and gave the active asset's details priority over bulk reads. [2.3.21](releases/v2.3.21.md) separated Inspector statistics and cover lookups from initial loading and distinguished a still-loading folder from an empty one or a failed read. In [2.4.4](releases/v2.4.4.md), I made manual refresh a cancellable task that yields to interactive work and runs at most once at a time per library, so a full disk scan would not monopolize the library process.

Some of these changes have scoped measurements. In the [2.4.2 warm-cache startup A/B](releases/v2.4.2.md), time to show the window fell from **2,336.5 ms to 662.5 ms**, and time until the library was usable fell from **2,787.5 ms to 2,254 ms** (production-style test, `n=2`). In a **50,000-item layout benchmark** for the same release, cumulative computation across 100 page chunks fell from **804.0 ms to 403.5 ms**. These are comparisons with earlier Super Lib code under specific conditions, not guarantees about overall speed or real NAS workloads.

Faster browsing could not come at the expense of data checks. I separated unlinking a folder from deleting it on disk: unlinking keeps the external files by default, and sync distinguishes temporary absence from explicit deletion so an unavailable location does not propagate as a delete request. These rules shipped in [2.3.18](releases/v2.3.18-validation.md). The [regression record](reference/followup-phase1-results-2026-10-09.md) covers local libraries and a simulated remote, not real NAS or multi-writer WebDAV validation.

## Make Windows updates traceable

I built out the Windows release process around installers, file-level deltas, version manifests, artifact checksums, and build provenance. The client looks for a delta matching the exact installed version and falls back to the full package if no delta matches or a delta fails verification. The release process records build inputs and outputs so an old installer or delta is not accidentally shipped with a new release.

The [2.4.1 validation record](releases/v2.4.1-validation.md) shows a concrete result: the delta from 2.4.0 to 2.4.1 was **2,031,262 bytes**, about **1.0%** of the full package. I also verified the installed 2.4.0 client's update flow through discovery, download, installation, and automatic relaunch. I did not separately capture the client logs for that run, so it does not establish that the installed client used the delta. The size ratio applies to that release pair, not to every update.

## Add optional tools to the workspace

I kept local asset management free and account-free, and built optional tools as separate extensions. [2.4.6](releases/v2.4.6.md) introduced Super Lib's extension catalog, with a designated HTTPS origin and package size and SHA-256 checks. **Infinite Canvas**, the first extension shipped through that catalog, can open multiple independent reference windows while the main workspace stays visible. The default floating preview still behaves as before.

[2.4.8](releases/v2.4.8.md) introduced the **Image Studio** workspace for generation, preview, original downloads, and history, with upstream credentials kept on the server. [2.4.9](releases/v2.4.9.md) added native and upscale channels and separated extension updates from application releases. Opening **Settings → Extensions** checks for new versions. Compatible extensions can update independently while keeping their existing enabled state. [2.5.0](releases/v2.5.0.md) tightened the startup update-prompt timing and replaced the generic image-loading state with a real download progress page that reports received bytes and percentage after the server acknowledges the image. Image generation is an optional online workflow, not a prerequisite for using the local library.

## Acknowledgements

Thank you to [dolag233](https://github.com/dolag233) and the [Serpent](https://github.com/dolag233/Serpent) contributors for making their work available as open source. Super Lib **builds on the code from Serpent 0.1.4**. Its local library and desktop application architecture provided the starting point for this work. The sidebar emoji grouping was also adapted from [Serpent 0.2.9](https://github.com/dolag233/Serpent/blob/f58701a6c06a41c075ef8fe8c6f48b7a6305f498/src/shared/entity-appearance.ts). The [MIT License](../LICENSE) retains the Serpent and Super contributors' copyright notices; see [Third-Party Notices](../THIRD_PARTY_NOTICES.md) for other components and assets. Thanks also to everyone who has reported issues, shared feedback, or contributed improvements to Super Lib.

## Source records

- [First Super commit](https://github.com/aimtowin/Super/commit/7b47348b7311ea4d96201a1e6de826c35f604997) and [original source snapshot](https://github.com/dolag233/Serpent/tree/6aeb146c8f893a2f4be9249195c838a653bcb090): the starting point and the first independently numbered Super version.
- Implementation examples: [async refresh and build provenance](https://github.com/aimtowin/Super/commit/4516e0a2928e0a92f757bbeee8a61c66d032ebd6) · [canvas-first browsing](https://github.com/aimtowin/Super/commit/465e820dc6fb5965b1e0366535eab98dd70b28cd) · [extension catalog and Infinite Canvas](https://github.com/aimtowin/Super/commit/b931aaaa038b4a542a307eb2ffb5090ea8fab75a) · [image channels and independent extension updates](https://github.com/aimtowin/Super/commit/ad9ca7e541daff35fd09a7aa7821950081b1a868).
- [Project decisions and release timeline](PROJECT_DECISION_AND_RELEASE_HISTORY.md) and [development milestones](POST_DEVELOPMENT_DECISIONS.md) (Chinese): version records, decisions, and verification scope.
- [Technical history archive](reference/ORIGINS_AND_TECHNICAL_HISTORY.md) (Chinese): fixed-version comparisons, test results, and preserved source material, not a current product comparison.
