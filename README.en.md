# Super

Super is a local-first visual asset workspace for creative teams. It supports import, search, tags, collections, previews, linked folders, browser capture, and local sync.

## Distribution status

Super is proprietary. This repository is for authorized development, builds, and verification only; it is not a public source, download, or update channel.

## Internal build

Node.js 24 is required (see `.nvmrc`). Common checks:

```bash
npm run lint
npm run typecheck
npm run test
npm run package
```

Create the Windows installer with `npm run make:inno`; its output is `out/make/inno/SuperSetup.exe`.
