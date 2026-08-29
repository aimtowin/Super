# ECS Update Source Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move Super's desktop-update discovery and binary delivery from private GitHub Releases to the existing HTTPS ECS service at `liuyangyang.me`.

**Architecture:** The ECS service exposes an unauthenticated, GitHub-compatible latest-release JSON feed at `/api/super/updates/latest` and immutable versioned files under `/downloads/super/releases/<version>/`. The desktop client trusts only that HTTPS origin and requires a SHA-256 digest before staging an installer. A release helper uploads versioned artifacts and atomically promotes `latest.json` on the ECS volume.

**Tech Stack:** Electron/TypeScript, Express, Node.js filesystem APIs, SSH/SCP release transport, Vitest and Node's built-in test runner.

---

### Task 1: Add and test a constrained ECS update manifest

**Files:**
- Create: `E:/Jarvis/projects/myhtml/super-update-feed.ts`
- Create: `E:/Jarvis/projects/myhtml/tests/super-update-feed.test.ts`
- Modify: `E:/Jarvis/projects/myhtml/server.ts`

1. Write tests for manifest parsing: bounded semantic version, SHA-256 digest, safe relative release paths, and rendering URLs only below `/downloads/super/`.
2. Implement the parser/renderer with no external URLs accepted from the stored JSON.
3. Serve `GET /api/super/updates/latest` from the persistent `/app/data/super-updates/latest.json` volume and serve versioned artifacts as immutable attachment downloads.
4. Run `npm test` and `npm run lint` in the ECS site project.

### Task 2: Switch the desktop client to the ECS trust boundary

**Files:**
- Modify: `src/main/app-update-service.ts`
- Modify: `tests/unit/app-update-service.test.ts`

1. Update failing update-service fixtures from GitHub URLs to the ECS update origin.
2. Replace the GitHub API request with `https://liuyangyang.me/api/super/updates/latest`.
3. Remove optional GitHub bearer-token handling and reject any manifest asset outside the exact HTTPS ECS download prefix.
4. Run the focused Vitest suite and TypeScript check.

### Task 3: Add a safe ECS publisher

**Files:**
- Create: `scripts/release/publish-ecs-update.mjs`
- Modify: `package.json`
- Test: `tests/unit/app-update-service.test.ts`

1. Validate local release ZIP and checksum before publishing.
2. Build an ECS manifest that contains only names, bytes, digest, notes, and relative versioned paths.
3. Use argument-array SSH/SCP calls, a staging directory, and atomic promotion of `latest.json`; require connection values from environment variables and never log credentials.
4. Dry-run the publisher locally, then publish only after the ECS service deployment is healthy.

### Task 4: Deploy and verify the service

**Files:**
- Modify: `E:/Jarvis/projects/myhtml/.github/workflows/deploy.yml` only if deployment must mount a new persistent directory.

1. Push the ECS-site server change through its existing GitHub Actions deployment.
2. Upload the validated update package with the publisher.
3. Verify public HTTPS manifest, content headers, asset download, and checksum.
4. Build and publish a new Super version that uses the ECS source. Existing 0.0.1 installations require one manual installer bootstrap because they have the old GitHub URL compiled in.
