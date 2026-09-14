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

## Where the last session left off (2026-09-14)

- **The local AI assist shipped in two tiers**, written up in `NOTES.md` §90–§99: tier 1 talks to any
  OpenAI-compatible server on the machine (LM Studio, Ollama, your own `llama-server`); tier 2 brings its
  own — `host/ModelHost/` is a C# server built on the user's machine with the .NET SDK, so one VSIX fits
  every platform, and the weights are downloaded once with a SHA-256 check. Both are **off by default**
  (`avaloniaDesigner.assistant.backend`).
- **Versions 0.9.5 – 0.9.13 are local builds only.** The Marketplace still carries **0.9.4** (GitHub
  release `v1.0.0-beta.11`, hash-verified); publishing a newer one means following `PUBLISHING.md` part F
  (numbers-only version, both GitHub release flags, no BETA suffix).
- **Gotcha that cost the most time:** `files.autoSave = onFocusChange` + `editor.formatOnSave` in the
  user's settings save *every* dirty buffer when focus moves (any terminal command does), which silently
  reverts edits made to files that are open in the editor. Verify edits on disk and run `tsc`/the suite
  before believing a multi-file change; put new tests in files that are not open (NOTES.md §99).
- Also: a VSIX installed while a window is open changes **nothing** until that window reloads — the status
  command now prints the running version so that is never guesswork.

## How to continue

1. Build/run: `npm install` → `npm run compile` → `dotnet build host/PreviewerHost.csproj` → F5.
2. Test: `npm test` (or `npm run test:fast|preview|webview|runtime`, `--file <name>`).
3. Package/install + **reload the window** after any change (see NOTES.md §1).
4. New feature: follow the "add a toolbox control" checklist in NOTES.md §5, add test coverage
   (drop-in `tests/**/*.test.js`), and update NOTES.md / memory when done.
