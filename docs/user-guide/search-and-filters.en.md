# Search and filters

> Documentation reviewed for Super Lib v2.3.21 on 2026-10-13 against current source and existing [packaged acceptance evidence](../releases/v2.3.21-validation.md). This review did not rerun the application or external integrations; screenshots retain their actual capture versions.

Click **Color** above the asset canvas to open the palette. Shift-click selects multiple colors; **Exclude** excludes the selected colors.

![Current palette filter; Chinese UI](../assets/ui/live-2.3.17/filter-color.png)

## Scope and updates

Search runs only in the current browse scope: the current folder/collection, the include-descendants choice, and active structured filters define the candidate set. Typing updates the result after about 200 ms; press Enter to submit immediately. Results load progressively in pages.

Search covers file name, tags, description (including AI description), source URL, author, folder path, and searchable metadata. Plain terms are case-insensitive substring matches.

## Advanced query syntax

Hover or keyboard-focus the `?` beside the search field for the in-app reminder. Queries are made of small terms:

| Syntax | Meaning | Example |
| --- | --- | --- |
| space | AND within one group; every term must match | `poster blue` |
| `\|` | OR; any group may match | `poster \| cover` |
| leading `-` | Exclude a condition | `-tag:draft` |
| double quotes | Keep spaces and `\|` inside a phrase | `"hero concept"` |
| `field:value` | Search only one field | `author:Jane` |

Field aliases:

- File name: `name:` or `filename:`
- Tags: `tag:` or `tags:`
- Description: `desc:` or `description:`
- Source URL: `source:`, `url:`, `link:`, or `source_url:`
- Author: `author:`
- Folder path: `path:`, `folder:`, or `folder_path:`
- Metadata: `meta:`, `metadata:`, or `metadata_text:`

Example:

```text
name:"hero concept" -tag:sketch | author:Jane
```

This means “the file name contains hero concept and is not tagged sketch, or the author is Jane”. Without a field prefix, all searchable fields are searched. Width, height, long edge, and duration are structured filters, not search operators.

## Filters

Use the separate Color, Tags, Shape, Rating, AI analysis, Favorites, Format, and More controls above the asset canvas. Different dimensions combine with AND; multiple values within one dimension combine with OR. Available dimensions include:

- Color: 18 hue ranges plus black, gray, and white, totaling 21 swatches; matches representative palette colors rather than only the dominant color
- Tags: searchable tags, top tags, and recently used filters
- Shape: landscape/portrait, 16:9, 4:3, 1:1, 3:4, 9:16 presets, plus a custom aspect ratio
- Rating: unrated through five stars
- AI analysis: analyzed or unanalyzed assets
- Favorites: a shortcut to favorite assets
- Format: image, video, audio, 3D, text, and individual extensions
- More: favorite, source URL present/absent, availability (available/missing), long-edge buckets, width, height, and duration ranges

Hold **Shift** while clicking color, tag, rating, format, or shape-preset values to OR-select several values in one dimension. Shift-click an active value again to remove it. A normal click replaces that dimension’s selection; clicking its only selected value clears it. Different dimensions remain ANDed. Boolean and numeric fields in **More** are independent fields, not a list of discrete values.

The bottom of the filter popover repeats “Hold Shift to multi-select”. Active conditions appear as removable chips; **Clear all** resets every filter.

## Sorting and smart collections

Sort by name, modified time, created time, file size, resolution, duration, rating, color, or author, ascending or descending; shuffle is also available. A search, its filters, and its sort can be saved as a smart collection. Smart collections recalculate when opened, so their results follow library changes.

## Exclusion versus selection inversion

Include/exclude applies to the selected values of one filter dimension. Different dimensions combine with AND; values inside a dimension use OR. The active-condition summary shows exclusions and allows individual removal or clearing all. Asset selection inversion (`Ctrl+I` on Windows) changes selection in the current browse scope, not filter mode. See the [illustrated examples](features.md#包含--排除条件摘要与清空).

## Custom colors, history and generation metadata

Enter a HEX color and adjust tolerance from 0–100, with include/exclude modes. Matching uses extracted swatches and periodic HSL, handling neutral colors separately; tolerance is not a calibrated perceptual color-distance measure. Filter exclusion and `Ctrl+I` asset-selection inversion remain independent.

History retains at most 20 terms of up to 512 characters. Comma-separated batch tags accept English/Chinese commas and at most 32 tags; check the split list before saving. Supported embedded SD/ComfyUI metadata in PNG can display generation markers and parameters. These are separate from AI-analysis status; an absent marker does not prove human authorship.
