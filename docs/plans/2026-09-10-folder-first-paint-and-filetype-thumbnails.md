# Folder first paint and file-type thumbnails

## Goal

Make every browse scope paint its first asset page before non-critical exact
counts and geometry work finish. Give formats without a raster preview a
readable extension thumbnail that follows the active theme.

## Design

Folder-scoped first-page searches may defer their exact total. The Worker
returns the requested page plus a lower-bound total and an explicit
`totalIsExact` flag. The Renderer paints that page immediately; its existing
background layout request obtains the exact total before deep scrolling needs
it. All-assets keeps its existing warm-path behaviour.

The Worker keeps a small LRU of fully hydrated, unfiltered browse id indexes,
keyed by scope and invalidated by the library change sequence. This extends the
existing all-assets optimisation to direct folders without caching filtered or
recursive semantics. A partial linked-folder path index improves the cold
direct-directory predicate.

Unsupported thumbnail formats render a DOM/CSS tile showing their filename
suffix. It uses semantic theme variables and data-tone attributes, so light and
dark themes need no generated image files or user migration.

## Verification

- Unit-test suffix labelling and theme-neutral thumbnail markup.
- Worker-test deferred totals and exact-total fallback.
- Run pagination and focused worker search tests, typecheck, and a desktop
  folder-navigation E2E test.
