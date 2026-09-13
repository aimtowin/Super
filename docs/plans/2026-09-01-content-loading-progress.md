# Content Loading Progress Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show clear in-progress feedback while Super is reading a library scope before assets can be rendered.

**Architecture:** The browse request has no safe total-work estimate, so the empty loading surface will use the shared accessible indeterminate progress primitive instead of a fabricated percentage. Determinate import/index progress remains unchanged because those operations already emit processed and total counts.

**Tech Stack:** React 19, TypeScript, shared renderer UI primitives, CSS.

---

### Task 1: Add an accessible loading progress surface

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`

1. Render the shared indeterminate `Progress` component beside the existing loading title whenever content is loading, the browser session is restoring, or a library is opening/creating.
2. Constrain the progress width and spacing for the centered loading state without affecting existing task progress bars.
3. Run typecheck and renderer lint; visually verify with the development application.
