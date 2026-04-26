# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## What this is

**Terrain** is a macOS Electron + React desktop app that renders a zoomable
sunburst of a git repository's directory structure, sized by file count. It
helps developers get a feel for an unfamiliar codebase before opening it in an
IDE.

See [PRD.md](PRD.md) for the v1 product spec, scope, and acceptance criteria.

## Commands

```sh
npm run start           # Dev mode (electron-forge + vite HMR)
npm run lint            # biome check src/
npm run lint:fix        # biome check --write src/
npm run format          # biome format --write src/
npm test                # All tests (jest)
npm run test:main       # Main process tests only
npm run test:renderer   # Renderer process tests only
npm run package         # Build unsigned .app
npm run make            # Create distributable
npx jest --testPathPattern=<pattern>  # Single test file
```

## Architecture

### Process model

Strict Electron process separation:

- **Main** (`src/main/`) — app lifecycle, native dialogs, IPC handlers that
  shell out to `git` and read the filesystem.
- **Preload** (`src/main/preload.ts`) — exposes `window.electronAPI.invoke()`
  via contextBridge.
- **Renderer** (`src/renderer/`) — React SPA. Owns the sunburst (D3 v7), empty
  state, toolbar, breadcrumb, and tooltip.

The renderer never touches the filesystem or runs subprocesses; everything
external routes through IPC.

### IPC channels

Defined in `src/shared/ipc/`. Two groups:

| Group        | Channels                                  | Handler file               |
| ------------ | ----------------------------------------- | -------------------------- |
| `DIALOG_IPC` | `open-directory`, `show-error`            | `dialog-ipc-handlers.ts`   |
| `REPO_IPC`   | `validate`, `scan`, `scan-progress`       | `repo-ipc-handlers.ts`     |

Flow:

```
Renderer → window.electronAPI.invoke(channel, args)
        → ipcMain.handle → git/FS
        → Promise back to renderer
```

`scan-progress` is push-only from main → renderer via `webContents.send`.

### Shared types

`src/shared/` contains domain types used by both processes:

- `tree.ts` — `TreeNode` shape for the sunburst (`{ name, children?, value? }`).
- `ipc/` — IPC channel constants.

### Renderer

Single screen. App state is one of:

- `empty` — show **Open repository** button.
- `scanning` — show progress indicator while `git ls-files` runs.
- `loaded` — show sunburst.

No router. No external state library. Just React hooks.

## Code style

- **Biome 2** — 2-space indent, 80-char line width, single quotes.
- **TypeScript** — strict-ish (`noImplicitAny`); path alias `@/` → `src/`.

## Commit conventions

Conventional Commits: `<type>(<scope>): <subject>`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`

Rules: imperative mood, lowercase, no trailing period, ≤ 72 chars.
