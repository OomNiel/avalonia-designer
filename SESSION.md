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

## Where the last session left off (2026-09-16)

**Released and installed: `0.9.38`** — *plus* everything from the 2026-09-15 marathon (§100–§118 in
`NOTES.md`, `TEST_PLAN.md` §10, `CHANGELOG.md`).

- **0.9.38 — the prompt is planned, not just sent.** The description dialog now says how much room your
  sentence has (*"~315 tokens (~1260 characters) left"*) and refuses to accept more; the optional context
  (style sample, then member list) is dropped in a stated order when the window is tight, named in the Output
  channel; if the required parts do not fit, nothing is sent and the message carries the numbers. External
  servers (LM Studio/Ollama) are deliberately exempt. §121 records the honest split the user asked for:
  a cap bounds *time to first token*, it does not make the answer better, and it cannot shorten the answer
  (that is `maxTokens`). Suite **3985** passed / 0 failed.

- **0.9.37 — a switch for the diff, and a window that fits the prompt.** The ⚙ Settings panel gained
  **"Show the proposed code as a diff before it is applied"** (`assistant.showDiff`, on by default): cleared,
  the code is written straight in through the very function Apply uses, with the same rules first and **Undo**
  offered by name. The other half came from a bug report — a bundled 12B model answered with *0 characters*
  because the bundled window (4096) and the answer budget (4096) could not both hold a prompt; the prompt is
  now measured and the answer gets the remainder, and every request **and** every outcome is logged with sizes
  and the finish reason, plus the runtime's own last lines when an answer is empty. §120 has the write-up,
  including the first question that mattered: *is the string even ours?* (it was LM Studio's, not ours).
  Suite **3962** passed / 0 failed.

- **0.9.36 — "Create a function named 'SortArray'".** *AI: Implement in Function…* now branches on the
  caret: **inside a method** it rewrites that method (unchanged), **outside every method** it writes a new
  member where the caret is. The model picks the name and signature from one sentence; the placement is
  snapped to a line boundary with a blank line of separation; visibility is forced to `private` with
  `static`/`Shared` only where the body provably needs no instance state; `using`/`Imports` the member needs
  are added after the last existing one; a name that already exists is **refused** (checked on the sentence
  *and* on the answer); and a new `<Control>_<Event>` member offers to wire `Click="…"` in the form. All of
  it is pure code under test (`tests/t2-logic/implementMember.test.js`, 99 assertions). Suite **3940**
  passed / 0 failed; §119 has the write-up, including the two bugs the tests caught (a `Private Static Sub`
  that was not recognised, and usings that landed above the file's own imports).
- **Standing rule that keeps paying:** put the interesting decision in a pure function so the suite can
  drive it. Every bug of the day was found by asserting **result text** (an inserted member, a corrected
  declaration), never by re-reading the code.

### From 2026-09-15

**Released and installed: `0.9.35`** (0.9.16 → 0.9.35 all landed today, each one from a report made while the
user clicked through the real panel, except the last one, which the *user* wrote and this session verified;
write-ups in `NOTES.md` §100–§118, one-line summaries in `TEST_PLAN.md` §10).
The whole day was one arc: the AI section of the ⚙ panel, driven by the user's own machine.

- **The last change set (0.9.35) was the user's own** — 7 files, +283/−20 — and it added **Remove Model**, a
  **fifth download** (`gemma-4-coder-12b-q4`), a `currentSelection` fix and a **foldable ⚙ Settings dialog**
  that the accompanying inventory never mentioned. Verifying it meant: reading the diff rather than the summary;
  re-reading every new spec's size and SHA-256 from the Hugging Face API (all three matched); driving the
  removal path for real in a temp `globalStorage` (cancel, confirm, not-on-disk, not-ours, and a delete that
  **fails** — which the code silently reported as success, now fixed); and renaming the *"press Refresh list"*
  note, since an empty selection is a legitimate state now. Suite **3841** passed / 0 failed.
- **A destructive button needs three things to be honest:** a confirmation that names what will be removed, an
  unload **before** the delete (the runtime holds the `.gguf` open), and a *verified* delete. The third is what
  no green suite will tell you — `try { unlink } catch {}` plus "removed" is a success message for a file that is
  still there.

- **Model handling is now honest end to end.** The picker shows where each entry comes from and what Load will do
  with it; the built-in entries say whether their weights are on disk; a model that is loaded is marked
  (`● in use`, `● pinned, runtime stopped`) and the status carries a **`Loaded now:`** line, so "did my load
  take?" is answerable from the panel (§109, §112).
- **The model's life is owned.** `deactivate` frees both runtimes (LM Studio via a detached `lms unload --all`,
  the sidecar via `stopModelServer`), and **Unload** in the panel frees both too — for a *built-in* model the old
  Unload was a no-op that reported success (§110, §117).
- **Failures are translated, never passed through.** `--yes` so a guardrail prompt cannot hang a load with no
  terminal to answer it (§111); the mlock abort names LM Studio as the owner of *Keep Model in Memory* (§111);
  the Vulkan `device lost` abort names a CPU-only runtime as the way out (§111).
- **The real lesson of the day — the settings that were written and then overruled.** Six exchanges on *"the
  picker reverts to 'Let the server decide…'"* went into delivery defects (§113–§115) before the cause turned out
  to be outside the extension: `OptimisedCSTest/.vscode/settings.json` pinned
  `"avaloniaDesigner.assistant.backend": "external"` at **workspace** scope, and workspace values beat global
  ones — so every write the panel made was invisible to it. Settings are now written **where the value already
  lives** (`configView()` → folder → workspace → user, like VS Code's own Settings UI) (§116).
  → **When a setting "does not stick", read the effective value (`inspect()`), not the one you wrote.**
- **Diagnosis is now cheap.** `logs/ai.log` records the full `lms …` command line on success *and* failure, the
  panel state that followed a load (`Load finished (ok) — panel state: backend=… selection=…`), what the webview
  applied (`Panel applied: wanted=… shown=…`), and every Save (`Panel save: value=… kind=…`). Each of the three
  user reports in that area was solved by reading the other side's log; the extension's own log was the gap.
- **Standing rule that kept paying:** when the user says "X does not work", read the *other* side's log first
  (LM Studio's `server-logs/`, `lms runtime ls`, `lms ps`, the model's own config files) before touching code —
  twice the doing was correct and only the telling was wrong.

Also worth remembering from earlier today: **thinking models** (§101, 0.9.15), **one-command setup** (§100,
0.9.14), and **the local AI assist's two tiers** (`NOTES.md` §90–§99): tier 1 talks to any OpenAI-compatible
server (LM Studio, Ollama, your own `llama-server`), tier 2 brings its own — `host/ModelHost/` is a C# server
built on the user's machine with the .NET SDK, so one VSIX fits every platform, and weights are downloaded once
with a SHA-256 check. Both are **off by default**.

- **Versions 0.9.5 – 0.9.35 are local builds only.** The Marketplace still carries **0.9.4** (GitHub release
  `v1.0.0-beta.11`, hash-verified); publishing a newer one means following `PUBLISHING.md` part F (numbers-only
  version, both GitHub release flags, no BETA suffix). The repo tags only the `v1.0.0-beta.N` series — the 0.9.x
  releases are commits, not tags.
- **Gotcha that cost the most time:** `files.autoSave = onFocusChange` + `editor.formatOnSave` in the user's
  settings save *every* dirty buffer when focus moves (any terminal command does), which silently reverts edits
  made to files that are open in the editor. Verify edits on disk and run `tsc`/the suite before believing a
  multi-file change; put new tests in files that are not open (NOTES.md §99).
- Also: a VSIX installed while a window is open changes **nothing** until that window reloads — the status
  command now prints the running version so that is never guesswork.

**Still true from earlier in the day:** why the model list is a command rather than a settings dropdown (a
`contributes.configuration` `enum` is static manifest text and cannot be filled from LM Studio at runtime), and
that *AI: Unload the Loaded Model* frees the RAM (now both runtimes, 0.9.34).

## How to continue

1. Build/run: `npm install` → `npm run compile` → `dotnet build host/PreviewerHost.csproj` → F5.
2. Test: `npm test` (or `npm run test:fast|preview|webview|runtime`, `--file <name>`).
3. Package/install + **reload the window** after any change (see NOTES.md §1).
4. New feature: follow the "add a toolbox control" checklist in NOTES.md §5, add test coverage
   (drop-in `tests/**/*.test.js`), and update NOTES.md / memory when done.
