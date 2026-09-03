# Session — Avalonia Designer for VS Code

> The original 2026-08-22 build-session transcript was removed (2026-08-31) — it is superseded
> by the docs below, which are the durable, current references for continuing development.

## Where to look when starting a new session

- **`NOTES.md`** — lean developer quick-reference (build/run, structure, architecture, key gotchas,
  the "add a toolbox control" checklist, current state, history pointers).
- **`NOTES_ARCHIVE.md`** — the full verbatim history of all 51 original NOTES sections (reference only).
- **`NOTES_2026-09-03.md`** — the 2026-08-31 → 2026-09-03 dev log (§52–§69 write-ups + feature-history table).
- **`NOTES_MEMORY_2026-09-03.md`** — the old (2,530-line) Copilot repo-memory log (2026-08-25 → 2026-09-03).
- **`README.md`** — user-facing intro + architecture + getting started.
- **`USER_MANUAL.md`** — full beginner user guide (every feature, plain language).
- **`CONTROLS.md`** — every Avalonia control and its designer support.
- **`TEST_PLAN.md`** — the automated test-suite plan (layers T0–T5).
- **Copilot repo memory** (`/memories/repo/avalonia-designer-extension.md`) — auto-loads each
  session with the authoritative, cross-session gotchas and feature log.

## How to continue

1. Build/run: `npm install` → `npm run compile` → `dotnet build host/PreviewerHost.csproj` → F5.
2. Test: `npm test` (or `npm run test:fast|preview|webview|runtime`, `--file <name>`).
3. Package/install + **reload the window** after any change (see NOTES.md §1).
4. New feature: follow the "add a toolbox control" checklist in NOTES.md §5, add test coverage
   (drop-in `tests/**/*.test.js`), and update NOTES.md / memory when done.
