# Documentation assets

Current user illustrations live in [`ui/live-2.3.17/`](ui/live-2.3.17/README.md). They are real captures of the released Windows application in an isolated fixture library. The [manifest](ui/live-2.3.17/manifest.json) records image dimensions and SHA-256; native update images have an explicit safe-preview capture mode. External integrations are settings-only, and a real packaged Console failure is retained rather than presented as a successful run.

- `ui/super-Logo.png` remains the product logo.
- `diagrams/source/` and architecture artifacts retain dated design/source evidence. Do not delete runtime resources, licenses or release baselines as document cleanup.
- Obsolete UI images with no remaining live references were removed from the current tree after a task-specific local backup. They remain available in the pre-cleanup Git commit `e359a291`. The dated [2.2.8 capture notes](ui/live-2.2.8/README.md) and [old screenshot audit](ui/screenshot-audit-2.2.8.md) describe historical evidence, not today's UI.

Do not publish credentials or real user libraries in screenshots. For current capture commands and limits, use the [new capture notes](ui/live-2.3.17/README.md); cleanup details and review findings are in the [documentation audit](../reference/documentation-review-2.3.17.md).
