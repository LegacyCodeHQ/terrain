# Terrain — PRD (v1)

## Summary

Terrain is a macOS desktop app that renders a zoomable sunburst of a git
repository's directory structure, sized by file count. It lets developers get a
feel for the shape of an unfamiliar codebase before opening it in an IDE.

## Wedge

**Codebase terrain at a glance, before opening the IDE.** No code parsing, no
language semantics, no analysis — just file count by directory, visualized.

## Target user

Developers landing on an unfamiliar codebase: new hires, consultants, OSS
contributors, architects evaluating a repo.

## Out of scope (explicit, v1)

- Right sidebar (grouping/tagging)
- Left sidebar (Summary / Overview)
- Leaf interactions (click-to-open, copy path, etc.)
- Live file-watching / auto-refresh
- Streaming / progressive chart rendering during scan
- Caching of indexed repos
- Drag-and-drop folder onto window
- Multi-window / side-by-side comparison
- Static HTML export
- Windows / Linux builds
- Code signing & notarization
- Telemetry / analytics
- CLI invocation (`terrain /path/to/repo`)

## User flow

1. Launch app → empty state shows a single **Open repository** button, centered.
2. Click button → native folder picker.
3. App validates the chosen folder is a git repository.
   - Not a git repo → native error dialog: _"This folder is not a git
     repository."_ Returns to empty state.
4. App enumerates files via `git ls-files`, honoring `.gitattributes` filters
   (`linguist-generated`, `linguist-vendored`, `binary`).
   - During scan: bottom-right progress indicator shows file count progress.
   - Zero tracked files → native dialog: _"No tracked files in this
     repository."_ Returns to empty state.
5. Scan completes → sunburst renders full bleed in the window.
6. User can:
   - Click a slice → zoom into that subtree.
   - Click center → zoom out one level.
   - Hover a slice → tooltip shows directory/file name + file count.
   - Use breadcrumb at top → navigate ancestor path.
7. Toolbar actions:
   - **Close repository** → returns to empty state.
   - **Open new repository** → opens file picker, replaces current view.

## Visual spec

- Sunburst layout, behavior, and color encoding match the
  [d3 zoomable-sunburst reference](https://observablehq.com/@d3/zoomable-sunburst)
  exactly. Categorical hue per top-level branch via
  `d3.scaleOrdinal(d3.quantize(d3.interpolateRainbow, ...))`; descendants
  inherit ancestor hue.
- Breadcrumb at top of chart area.
- Hover tooltip: `name` + `count`.
- Single window, dark theme.

## Technical

- **Stack**: Electron + TypeScript + React + Vite + electron-forge + Biome +
  Jest. Mirrors `compass/compass-desktop/` conventions (main/renderer
  separation, IPC contracts in `src/shared/ipc/`).
- **Process boundaries**:
  - **Main**: spawns `git` (`git rev-parse`, `git ls-files`,
    `git check-attr`), reads filesystem, owns folder picker dialog and error
    dialogs.
  - **Renderer**: React app, owns sunburst (D3 v7), empty state, toolbar,
    tooltip, breadcrumb.
  - **IPC**: typed channels (see `src/shared/ipc/`).
- **Project location**: `/Users/ragunath/LegacyCodeHQ/terrain` — standalone git
  repo for now. Will be wired into the superepo as a submodule later.
- **Platforms**: macOS only for v1.
- **Distribution**: `npm run start` for development; unsigned `.app` build for
  v1. Signing/notarization deferred.

## v1 acceptance criteria

- [ ] App launches to empty state with **Open repository** button.
- [ ] Folder picker opens on click.
- [ ] Non-git folder shows native error dialog and returns to empty state.
- [ ] Empty git repo shows native "no tracked files" dialog and returns to
      empty state.
- [ ] Valid git repo: `git ls-files` runs, `.gitattributes` filters honored.
- [ ] Progress indicator (bottom-right) shows file count during scan.
- [ ] Sunburst renders matching the d3 reference (layout, colors, transitions).
- [ ] Click-to-zoom and click-center-to-zoom-out work.
- [ ] Breadcrumb reflects current zoom path and is clickable.
- [ ] Hover tooltip shows directory/file name and file count.
- [ ] Toolbar: **Close repository** returns to empty state; **Open new
      repository** replaces current view.
- [ ] Builds and runs on macOS.

## Deferred (v2+ candidates)

- Streaming / progressive chart rendering as files enumerate.
- Drag-and-drop folder onto window.
- Static HTML export (`--export terrain.html`).
- CLI mode (`terrain /path/to/repo` opens the app).
- Caching with file-watcher-driven incremental indexing.
- Multi-window for side-by-side comparison.
- Windows + Linux builds; signing/notarization on macOS.
- Recent-repos list on empty state.
- Light theme.
