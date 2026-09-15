# Changelog

All notable changes to the **Avalonia Designer for VS Code** extension.

Format: based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [SemVer](https://semver.org/) — with one wrinkle, see the note below.

> **Two version numbers per release, on purpose.** GitHub tags and releases carry the descriptive
> name (`v1.0.0-beta.9`), but the Visual Studio Marketplace accepts only one to four plain numbers —
> a suffix like `-beta.9` is rejected. `package.json` therefore holds the Marketplace number — `0.9.2`
> for `v1.0.0-beta.9` — and each entry below names both. `1.0.0` is reserved for the first stable
> release, because a published version number can never be reused.

## [Unreleased]

_Nothing yet._

## [0.9.23] - 2026-09-15 · *the picker named a model that was not the one in use*

### Fixed

- **The model picker could display a different entry than the model actually in use.** Reported as
  *"the model picker still shows 'Let the server decide…', not the picked model"* after a built-in 3B load
  that had in fact succeeded (the log line, the settings and a running runtime all agreed). The values are
  opaque strings — the webview never mapped them to indices, so this was not the off-by-one it looked like.
  The real hazard is that a `<select>` handed a value it does not know **silently keeps what it had**, which
  is indistinguishable from an indexing bug on screen. The panel now checks the round trip after assigning,
  falls back to the entry's real index if it can find it, and otherwise says so in the progress line rather
  than showing another model's name as though it were the selection.
- **A confirmed load asks for the state once more.** The state posted as part of a load is the right one, but
  if that message is lost — a webview that was not ready yet, a second designer tab — the picker kept the old
  selection indefinitely. A successful `aiLoad` result now re-requests it, so the panel cannot stay stale.
- **The option hints can no longer abort the whole state application.** `applyKindToOptions` wrote into
  `.ai-hint` spans directly; a missing span threw, and everything after it in `fillAi` was skipped.

### Tests

- **The webview suite had been hiding an uncaught exception since 0.9.16.** The jsdom fixture built the
  option rows as empty divs while the real markup carries a `.ai-hint` span inside them, so every `aiState`
  message threw `TypeError: Cannot set properties of null` — jsdom logged it as uncaught and the rest of the
  state application was quietly skipped. The rows now carry their hint spans in the fixture.
- New assertions: the picker shows the selection the extension sent (index 3, not the first entry), a
  selection with no matching entry is reported instead of swapped, a confirmed load re-requests the state
  while a failed one does not, and the per-runtime hints are reworded for bundled vs LM Studio.

## [0.9.22] - 2026-09-15 · *every model said "loaded", and "never" was an invalid command*

### Fixed

- **Every LM Studio model was tagged `● loaded`.** The check was `/loaded/i.test(state)` and LM Studio's
  *unloaded* state is the string `not-loaded` — which contains `loaded`. The tag was therefore true for the
  whole list (reported 2026-09-15: *"how is it possible to have more than 1 model tagged 'Loaded'?"*).
  A single `isModelLoaded()` now compares the state exactly, and both `discover()` and the picker use it.
- **Loading a model failed with `--ttl 0`.** "never — keep it loaded" was passed to `lms load` as
  `--ttl 0`, and the CLI rejects it: *option '--ttl <seconds>' argument '0' is invalid. Number out of range,
  must be at least 1*. The load failed, so the model was never pinned and the picker never moved — which is
  the reported *"the selected model in the modelpicker does not update and the model is not pinned"*
  (the same failure, seen from the other end). `buildLoadArgs` now **omits the flag** when there is no timer,
  and `resolveLoadOptions` keeps `0` as the user's choice while `-1`/junk still fall back to the
  recommendation.
- **A load could succeed without the panel showing it.** For a bundled model the pin lives in `modelPath`,
  not in `model`, so a successful load looked like nothing had happened. The picker now says what is pinned
  in words under the dropdown — *"Pinned: … — serving requests on …"*, *"… the built-in runtime is not
  running; the next request starts it"*, or *"Not pinned, and nothing is loaded on … — a request will fail
  until something is loaded"* — and a bundled entry that is pinned but idle reads `● pinned, runtime
  stopped` instead of nothing.

### Tests

- `tests/t2-logic/aiPanel.test.js` gains a truth table for `isModelLoaded` (`'loaded'` only, not
  `'not-loaded'`/`'Not-Loaded'`/`'unloaded'`/`'loading'`), a check that an empty `loaded` list produces
  **zero** `● loaded` markers while a live one produces exactly the loaded entries, the exact argv for "no
  timer" (`--ttl` absent), and a loop over `0 / -1 / NaN / 3600 / 1` proving no resolved request can emit an
  out-of-range `--ttl`. Suite **3665 passed / 0 failed**.

## [0.9.21] - 2026-09-15 · *the selected model has to be able to answer*

### Fixed

- **A load is only "Loaded" once it has answered.** The LM Studio path reported success when `lms load`
  exited 0; the bundled path has always proven itself with a one-line round trip. That difference is how the
  panel could say *on* while the wire said `HTTP 400 No models loaded` (found while verifying the selection
  against a real app, 2026-09-15). Both paths now run the same test request, and a failure is reported with
  the reason instead of a green tick.
- **The dropdown no longer claims a model is selected when the server is free to choose.** With `model`
  empty — the state the settings most often hold — the panel showed the *first* LM Studio model as if it had
  been picked, and pressing Save then pinned a model nobody chose. There is now an explicit first entry,
  **"Let the server decide — whatever it has loaded"**, which is what the settings actually say, and Save
  keeps `model` empty for it.
- **Choosing it checks the server rather than assuming**: it asks which models the endpoint offers, reports
  how many and warns when nothing is loaded, instead of leaving "on" pointing at an empty server.

### Tests

- `tests/t2-logic/aiPanel.test.js` pins the new entry, the fallback for a model that has vanished from disk
  (it must not silently select the first one), and that an off switch still starts from a sensible value.
  Suite **3645 passed / 0 failed**.
## [0.9.20] - 2026-09-15 · *Load Model works, and Save stops flickering*

### Fixed

- **`Load Model` did nothing on every runtime, and this was the cause.** The panel's webview sent a **flat**
  request (`{contextLength, gpu, ttlSeconds, …}`) while the extension read `state.options.contextLength` —
  so the handler threw `Cannot read properties of undefined (reading 'contextLength')` *before* it could
  post a single message. That is what "downloading (first time)… nothing further happens" always was:
  0.9.19's reporting is what finally surfaced the message.
- **A load's arguments are now resolved before they become a command line.** The controls can say "you
  decide" in three ways (context `0`, GPU `auto`, timer `-1`) and passing those through produced
  `--gpu auto` and `--ttl -1`, which LM Studio rejects. `resolveLoadOptions()` turns them into real values
  from this machine, and the suite pins it — including `0` for the timer meaning "keep it loaded" rather
  than "missing".
- **Save no longer closes and reopens the panel.** The extension answers a save with the same
  `codeSettings` message it uses to fill the panel, and filling used to *open* it whenever it was closed —
  so the panel came straight back. Opening is now tied to the ⚙ Settings button (`settingsPending`), which
  is the only thing that may show it.

### Tests

- New `tests/t2-logic/panelContract.test.js` (25 assertions) compares the webview's payload with the
  extension's type **field by field**, names the exact field that threw, and pins `resolveLoadOptions`.
  The mismatch that broke Load Model for four releases could not have survived it. The T3 webview suite
  also asserts that a save echo leaves the modal closed. Suite **3643 passed / 0 failed**.
## [0.9.19] - 2026-09-15 · *a load can no longer fail in silence*

### Fixed

- **"Downloading is not starting … nothing further happens" is now impossible.** The panel's `aiLoad`
  handler awaited the load with no `try/catch`, so any thrown error inside it (a failed download, a build
  error, the 60-second start handshake timing out) vanished: the panel's own line kept promising a download
  while the extension had already given up. Every exit now reports to the panel and is logged.
- **The panel no longer claims a download is starting when the weights are already on disk.** The webview
  guessed the message; the extension now says what is happening — *"…is already on disk — starting the
  built-in runtime (its first build downloads the inference library, which can take a few minutes)…"* —
  and only mentions downloading when it is really downloading. That guess is what sent the user looking for
  a download that never began.
- **A failure is shown where the user is looking.** It lands in the panel's progress line (and stays there),
  not only in the designer's status bar at the bottom of the window.
- **Long steps show that they are alive**: the progress line repeats with the seconds spent
  (`… (45 s)`), so a slow first build cannot be mistaken for a dead one.
- **If the extension reports nothing at all, the panel says that too** (*"the extension has not reported
  back yet"* after 10 s), which separates "the extension is silent" from "the extension is working".

### Added

- **`logs/ai.log` in the extension's storage** (`~/.config/Code/User/globalStorage/grumpy.avalonia-designer/logs/ai.log`),
  written by every AI load step and failure with timestamps. The Output channel cannot be handed over when
  a bug only reproduces on someone else's machine; a file can.
- Unload and the status check are wrapped the same way, so no AI action can fail without a message.

### Tests

- `tests/t2-logic/aiPanel.test.js` grew to 88 assertions with a **never-silent** section: the handler
  catches and reports, the webview puts failures in the progress line, the elapsed ticker and the
  "already on disk" wording exist, and the log file is written. Suite **3616 passed / 0 failed**.
## [0.9.18] - 2026-09-15 · *downloads resume, and say how far they have got*

### Added

- **Downloads resume.** A 2.1 GB or 4.7 GB model that loses its connection at 90% now continues from where
  it stopped (an HTTP `Range` request onto the existing `.part` file) instead of starting again. A partial
  file *larger* than the model is discarded rather than appended to, a server that ignores `Range` (and
  answers 200 with the whole file) cannot duplicate the first half, and a `416` (our partial is past what
  the server has) restarts cleanly. A checksum mismatch still deletes the file, because everything after a
  bad byte is suspect.
- **The download reports bytes of bytes, live**: `1.2 GB of 4.7 GB · 26% · 12.4 MB/s`, ending at
  `100%` — the last line used to be whatever the throttled update happened to say, which looked like a
  stalled download while the checksum ran.
- **An `http://` model address works.** "Paste the address of one" handed every URL to `https.get`, so a
  model served over plain HTTP failed with a TLS error that said nothing about the real problem.

### Changed

- **The load options now reach the built-in runtime too.** Context length becomes `--ctx` and the GPU field
  becomes `--gpu-layers` (LM Studio takes a GPU *ratio*, llama.cpp takes a *layer count*: `max` = all
  layers, anything else = CPU, because a shared-memory GPU is slower for big models and half of an unknown
  layer count is not a number of layers). Before this, both fields were shown for bundled models and
  silently ignored.
- **Rows that cannot be honoured are hidden instead of shown and ignored**: *Unload when idle* disappears
  for the built-in runtime (it has no idle-unload concept), and *Address* only appears for "a server I run
  myself".
- The dropdown says when a download happens: "This extension's own runtime — **downloaded once when you
  press Load Model**, then local". "download once" in the label was read as "this downloads now" (the user
  asked), which is exactly the kind of ambiguity a label should not have.

### Fixed

- **`.ai-opt[hidden]` did nothing.** An author `display` beats the UA stylesheet's `[hidden] { display: none }`
  regardless of specificity, so the row-hiding above had no effect until the rule existed — caught by
  rendering the panel in Chromium. (The same trap is why `.modal[hidden]` exists.)

### Tests

- New `tests/t2-logic/modelDownload.test.js` (53 assertions) drives the **real** download function against a
  **real local HTTP server**: a truncated first attempt, the `Range` request it then sends, byte-identical
  output, a server that ignores ranges, and a 416 restart. Suite **3603 passed / 0 failed**.
## [0.9.17] - 2026-09-15 · *the Settings panel fits on screen*

### Fixed

- **The ⚙ Settings panel no longer loses its top and bottom.** Reported by the user as "the shape of the
  settings panel currently hides the top and bottom items". Measured in Chromium with the real CSS and
  markup: the box was **340 × 1553 px**, and since a modal is centred with nothing scrolling, at 1024×700
  the title sat **426 px above** the viewport and Cancel/Save **1127 px below** it.
- **Every modal is now capped to the window and scrolls inside itself**
  (`max-height: calc(100vh - 28px); overflow-y: auto`). The AI section made this panel the first one tall
  enough to notice, but a long list of code-check findings could have done the same to the old panel.
- **The panel is wider** — 560 px instead of 340 px — **scoped to this panel only** (`#settingsModal`),
  because eight other small dialogs share `.modal-narrow`.
- **Cancel/Save stay pinned** to the bottom of the panel while the rest scrolls, so the last thing the user
  has to press is never off-screen.
- **The option values are no longer truncated.** A `<select>` spends ~18 px on its arrow, so in a 120 px
  column "recommended for this machine (off)" needed 199 px and rendered as "recommended for [truncated]".
  The value column is 175 px now and the labels are shorter ("recommended (off)", "max — all on GPU").

### Tests

- `tests/t2-logic/aiPanel.test.js` grew to 74 assertions with a **layout regression guard**: jsdom has no
  layout engine (which is why this was invisible to the suite), so the declarations that make it fit are
  asserted instead — the height cap, the internal scroll, the scoped width, the pinned action row, a value
  column of at least 160 px, and the absence of the three labels that were too wide for the field. Suite
  **3547 passed / 0 failed**.
## [0.9.16] - 2026-09-15 · *the AI switch lives in the designer's Settings panel*

### Added

- **An AI assist section in the designer's ⚙ Settings panel** (the toolbar button), so setting it up no
  longer means knowing about commands, ports or model ids:
  1. **On/off switch** — off makes every AI command unavailable (a context key gates the menu entries) and
     **unloads the model**, because leaving 17 GB resident after choosing "no AI" would be a strange
     machine to hand back.
  2. **A model dropdown** listing every chat model LM Studio has on disk (with the loaded one marked),
     both downloadable models, **every `.gguf` found on this machine**, and "a server I run myself".
  3. **The load settings appear once a model is chosen** — context length, GPU offload and idle-unload -
     plus the answer budget (`maxTokens`) and the timeout.
  4. **Load Model** — frees what is in memory first, pre-flights the memory cost, loads with the values
     shown, wires `backend`/`endpoint`/`model`, and then runs the status check.
  5. **Status & hardware check** shows the *same* report the palette command shows (one implementation).
  6. **Save** stores everything and closes; the designer is ready.
- **Scan machine for models…** — a bounded walk of `~`, `~/Downloads`, `~/models`, `~/llama.cpp`,
  `~/.cache/huggingface`, `/media` and `/mnt` (depth-limited, >100 MB, 12 s budget, progress shown). It
  **filters out `mmproj-*.gguf`** — the vision projectors that sit beside the weights and cannot answer a
  chat request — and skips files already inside LM Studio's folder, which `lms ls` already lists.
- **A discovered file just works.** A `.gguf` outside LM Studio's folder is imported with
  `lms import --symbolic-link` (the documented flags omit this: with no flag at all, `lms import` **moves**
  your file), and with no LM Studio installed it is handed to the extension's own runtime instead.
- **Three new settings** (`loadContextLength`, `loadGpu`, `loadTtlSeconds`) so the panel's choices persist;
  `0`/`auto`/`-1` mean "recommend one from this machine".

### Changed

- **Switching models unloads the previous one.** Reported by the user: selecting a new model used to leave
  the old one in memory. `lms unload --all` now runs before every load (`localModelCore.load`).
- **The model layer was split in two** — `localModelCore.ts` (discovery, load, unload, status, scan,
  import; no UI) and the two front doors that ask the questions: the Command Palette flows
  (`localModelSetup.ts`) and this panel (`aiPanel.ts`). Both call the same operations, so they cannot
  drift apart, and `assistantUi.statusLines()` is now shared with the panel for the same reason.
- `AI: Choose a Local Model…` and `AI: Unload the Loaded Model` stay in the palette (the user's choice:
  "keep both").

### Tests

- New `tests/t2-logic/aiPanel.test.js` (65 assertions) — the dropdown contract, the choice-value round
  trip (a model key contains a slash, an address contains a colon), the four groups in the list, and a
  **real scan of a temporary directory tree** containing a 120 MB sparse `.gguf`, an `mmproj` projector
  and a 4-byte blob: only the weights may come back. Suite **3539 passed / 0 failed**.
## [0.9.15] - 2026-09-15 · *models that think before they answer*

### Fixed

- **A thinking model no longer looks like a broken one.** Reasoning models (Qwen3.5, DeepSeek-R1, …) put
  their chain of thought in `reasoning_content` and only then write the answer. The extension read
  `content` alone, so when the thinking used up the token budget it showed **nothing**: the raw-answer tab
  said "0 characters", which explains nothing to anyone. Measured here with `qwen/qwen3.5-9b`: **837
  reasoning tokens** (3 186 characters) were spent before a 71-character answer, and with the old
  900-token budget the answer was `finish_reason: length` with empty content.
- The thinking is now read (`reasoning_content`, or `reasoning` as llama.cpp and vLLM spell it), shown as
  *"the model is thinking… (N characters so far)"* while it works, logged, and included in the
  raw-answer tab — so an empty answer always arrives with its explanation.
- An empty answer is explained with the numbers instead of a shrug: *"it wrote 3 186 characters of
  reasoning — 837 tokens — and then ran out of budget before writing any code"*, plus the setting to
  change. `finish_reason` is reported too, which separates "budget too small" from "rambled".

### Changed

- **The default `avaloniaDesigner.assistant.maxTokens` is 4096, not 900.** 900 was less than this model's
  thinking; nothing else changed, and a model that answers directly still stops at its own end-of-turn
  marker. The inactivity watchdog (not a total budget) means the larger ceiling costs nothing.
- The request now asks for token usage (`stream_options.include_usage`), which is what makes "837 thinking
  tokens" knowable rather than guessed.
- **AI: Choose a Local Model…** measures this during its test request: if a model thinks, it raises the
  answer budget to the working value in your settings itself and says so — "It thinks before it answers,
  so the answer budget was raised to 4096 (it spent 837 tokens thinking about a one-word reply)". Choosing
  a local model should not require knowing any of this.

### Tests

- New `tests/t2-logic/assistantThinking.test.js` (48 assertions), driven by the **captured stream** from
  the real model (120-token and 1500-token runs, both replayed). Suite **3471 passed / 0 failed**.
## [0.9.14] - 2026-09-15 · *setting up a local model is now one command*

### Added

- **AI: Choose a Local Model…** — the whole local-model setup in one command. It lists the models
  **LM Studio** already has on disk (read from LM Studio's own `lms` CLI), and picking one does
  everything: start LM Studio's server if needed, **pre-flight** the load with LM Studio's own memory
  estimate (warning *before* loading when the model does not fit in what is free), load the model with
  recommended start values, fill in `backend` / `endpoint` / `model` for you, and prove it answers with
  a one-line round trip before you touch any code.
- **Recommended start values, with reasons.** Context length, GPU offload and an idle-unload timer are
  derived from free RAM and the kernel's locked-memory limit (`/proc/self/limits` → `ulimit -l`), each
  with a one-line explanation shown before anything is loaded. **Change them…** overrides all three.
- **AI: Unload the Loaded Model** — frees the memory again when you are done (`lms unload --all`).
- **Translated load failures.** When a load aborts, LM Studio's own server log is read and translated:
  the common abort is a model larger than the kernel's locked-memory limit (LM Studio's **Keep Model in
  Memory**), and the message says so with both numbers — the lock limit and the model size. **Copy
  details** puts the log on the clipboard for anything else.
- **Two escape hatches in the same list:** *This extension's own model* (the bundled runtime, for a
  machine with no LM Studio) and *A server I run myself* (any OpenAI-compatible address — Ollama, a
  hand-built `llama-server`).

### Changed

- `avaloniaDesigner.assistant.setupModel` is retitled **AI: Choose a Local Model…**, because choosing is
  now what it does. `AI: Set Up Local Model…` still works (same command).
- The picker shows **embedding models separately** and never offers them as a chat model, using the type
  LM Studio's REST API reports rather than guessing from the name.
- The port is **read from LM Studio** (`lms server status`) instead of assuming 1234.

### Fixed

- An empty **PARAMS** column (embedding models) no longer shifts the architecture into the size column.
  Found by the new suite while writing it.

### Tests

- New `tests/t2-logic/localModels.test.js` (65 assertions) — every parser is pinned against **real
  captured `lms` output** from this machine, plus the recommendations, the exact `lms load` argv, and
  the wiring. Suite **3423 passed / 0 failed**.
## [0.9.13] - 2026-09-14 · *the Apply buttons are where you are looking*

### Added
- **The decision is now a button directly above the method** (a code lens: *✓ Apply AI change* /
  *✕ Discard*), refreshed when a proposal appears or is resolved. Reported three times in one day, the
  status bar and the diff's title bar turned out not to be enough on their own — a developer reviewing a
  change looks at the code, so that is where the buttons belong now. The status bar entry is also
  **coloured** instead of being one more grey word, and an unanswered notification leaves a line in the
  output channel saying where the buttons are.
- **The status dialog names the running version** (`extension v0.9.13`). A VSIX installed while a window
  is open changes nothing in that window until it reloads, and "did my reload take effect?" was
  otherwise guesswork.

### Fixed
- **A proposal tab left over from a previous window is closed at activation.** A proposal exists only in
  memory, so a diff pane restored by a window reload can never be applied — it is a dead pane without
  buttons, which is exactly what "there is no means to apply the diff" and "the tab opens by itself, I
  had all tabs closed" both turned out to be. Anything of ours found at startup is stale by definition.

## [0.9.12] - 2026-09-14 · *the bundled model stops repeating itself*

### Fixed
- **The bundled runtime now speaks the model's own chat template.** LLamaSharp was framing the
  conversation the Llama-2 way (`[INST] … [/INST]`), so a Qwen-style model never saw where the assistant
  turn began and answered by **repeating its first block until the token budget ran out** — the same
  prompt that LM Studio (`llama-server --jinja`) answered with one clean block came back from the bundled
  runtime as *30 copies of it, 4 049 characters, in 40 s, cut off mid-fence*. The template is read from
  the GGUF (`tokenizer.chat_template`) and the runtime stops at the family's end-of-turn marker. Measured
  after the fix: **one block, 131 characters, 3.1 s**.
- **An unfenced answer is no longer accepted as code.** A model that replied with a sentence about the
  change would have had that sentence written into the method. Unfenced text is now used only when it
  really reads like code (braces, language keywords, or an indented statement body); otherwise nothing is
  applied and the reason is stated.
- **A code block that was cut off is salvaged** instead of being thrown away, with a note saying so.
- **End-of-turn markers never reach the file** (the runtime decodes special tokens on purpose, so a
  `<|im_end|>` can appear at the end of an answer).

### Added
- **The raw answer is never thrown away when extraction fails.** It is written to the *Avalonia Designer*
  output channel and can be opened from the message as a read-only tab ("Show the raw answer"), together
  with a precise reason — empty answer, prose instead of code, or a block that never closed. The real
  failure this replaces said only "returned nothing usable", with no evidence to act on.

## [0.9.11] - 2026-09-14 · *the Apply button stops disappearing*

### Fixed
- **Applying or discarding a proposal no longer depends on catching a notification.** On the first
  successful real run the toast with *Apply*/*Discard* expired while the diff was being read, and with it
  went the only obvious way to accept the change. The decision now lives where it cannot time out: a
  **status bar** action (*Apply AI change* / *Discard*, hidden again once resolved) and two buttons in the
  **diff editor's own title bar**, both driven by a context key, so they are there for as long as the
  proposal is.
- **The diff no longer asks to be saved.** Its right-hand pane was opened as an untitled document, which
  is "unsaved" by definition — so closing it or reloading the window produced a save prompt about a pane
  that is nothing but a preview. It is served by a read-only content provider now, with no dirty state at
  all.
- **Build to verify saves your files first**, silently: a build compiles what is on disk, and a dirty
  editor would have verified something other than the change on screen.

## [0.9.10] - 2026-09-14 · *the endpoint setting shows where it points*

### Changed
- **The endpoint setting is no longer blank by default.** `avaloniaDesigner.assistant.endpoint` defaulted
  to an empty string, which *means* "use `http://127.0.0.1:1234/v1`" — correct in code, but the settings UI
  showed an empty box, so the only way to see where requests would go was to run the status command. The
  default is now the address itself (an empty value still falls back to it), and a test pins the two
  places it is written — the manifest and `DEFAULT_ENDPOINT` — to each other so they cannot drift.

## [0.9.9] - 2026-09-14 · *the status check knows what an embedding model is*

### Added
- **"Pin a model…"** in *AI: Status and Hardware Check*: when the server offers more than one chat model
  and none is chosen, the dialog now writes the choice for you (`avaloniaDesigner.assistant.model`) from a
  pick list, instead of leaving you to find the setting. **Copy** puts the whole report on the clipboard.

### Changed
- **Embedding models are no longer offered as candidates.** LM Studio lists
  `text-embedding-nomic-embed-text-v1.5` next to its chat models, and the dialog's "pick one of 3"
  invitation made it look like a valid answer — it cannot answer a chat request at all. Models that look
  like embeddings (by name: `embed`, `bge`, `gte`, `e5`) are now named in the list as
  *"(embeddings — cannot answer chat)"* and excluded from the counts, and a server offering *only*
  embeddings says exactly that. The heuristic drives a hint, never a filter, so a false positive costs a
  word.

## [0.9.8] - 2026-09-14 · *the status check names the model*

### Changed
- **AI: Status and Hardware Check now says which model will actually answer**, instead of the
  placeholder "(the server decides)" — which was accurate and useless: a server with exactly one model
  loaded makes the answer knowable, and a server with several makes it worth knowing that setting
  `avaloniaDesigner.assistant.model` is what pins one down (Ollama refuses a request that does not name
  a model). The command now probes the server first: one model → it is named; several → that is stated
  with the tip; server not answering → that is stated instead of a guess; `bundled` → the `.gguf` file it
  loads. The wording is a pure function with nine assertions in the suite.

## [0.9.7] - 2026-09-14 · *a sidebar icon you can actually see*

### Changed
- **A new Activity Bar icon, drawn for contrast.** The old one was made by scaling the coloured badge
  artwork down and clearing everything that was not the glyph, which left **no fully opaque pixel at
  all** — 5 938 semi-transparent ones — so it looked washed out and faint in the 24 px sidebar. It is
  now drawn as shapes: pure `#FFFFFF`, fully opaque, with the ring and Grumpy's face (cap, sunglasses
  and moustache as negative space) reduced to what survives at 24 px. `tools/make-activitybar-icon.py`
  regenerates it, and the test suite now decodes the PNG to assert what went unnoticed for two
  releases: white only, a solid core, a transparent background, not clipped.

### Added
- The model runtime's messages (build, model load, generation) now go to the extension's own
  **View → Output → "Avalonia Designer"** channel instead of the Extension Host log, which is where
  the rest of the designer's diagnostics already are.

## [0.9.6] - 2026-09-14 · *the AI assist brings its own model*

### Added
- **The AI assist can run its own local model — no server, no account, no Copilot required.** *AI: Set
  Up Local Model…* offers code-specialised models (Qwen2.5-Coder 3B at 2.1 GB, 7B at 4.7 GB), or a
  `.gguf` file you already have, or one you point it at by address. The download shows progress, can be
  cancelled, is verified against the publisher's SHA-256 and is stored in the extension's global
  storage — once, for all projects. *AI: Status and Hardware Check* reports the runtime, the model file
  and the server; *AI: Stop the Local Model* frees the RAM.
- **The runtime ships as source and is built on your machine.** `host/ModelHost/` is a small C# HTTP
  server that speaks the OpenAI API the client already uses, so one VSIX covers every platform and
  architecture: NuGet picks the right llama.cpp binaries for the current runtime identifier during the
  build the extension already performs for its design previewer. The bundled backend therefore needs no
  more than the .NET SDK the designer requires, and a 2 GB model never has to travel inside a VSIX.

### Changed
- **The request timeout is an inactivity budget, not a total one.** The clock restarts with every token,
  so a slow CPU writing a long method is allowed to take minutes, while a server that has stopped talking
  is caught in seconds. A total budget would have cut off exactly the slow-but-busy case this feature is
  for.

## [0.9.5] - 2026-09-14 · *the local AI assist (tier 1)*

### Added
- **✨ AI assist (tier 1) — a local model for the fixes a rule cannot express.** Two flows: *AI:
  Implement in Function…* (rewrite the method the caret is in, described in a dialog) and *✨ Fix with
  AI…* (on a finding that sits inside a method). It talks to a local OpenAI-compatible server — LM
  Studio, Ollama or `llama-server` — so nothing leaves the machine, and it is **off by default**
  (`avaloniaDesigner.assistant.*`). The proposal always opens as a **diff**; applying it is a normal
  edit (`Ctrl+Z` works) and is followed by an optional **Build to verify**. The model is asked for
  exactly one method, and the answer is parsed defensively (last fenced block, or JSON), re-indented to
  the file's own style and spliced over that method and nothing else. *AI: Status and Hardware Check*
  reports the endpoint, the reachable models and a **hardware verdict** (RAM, CPU threads, AVX2) — the
  basis for disabling the feature on a machine that cannot run a model. The bundled runtime, so users
  need no server at all, is the next tier (see `NOTES.md` §90).


## [0.9.4] - 2026-09-14 · *the `1.0.0-beta.11` build*

### Changed
- **A new icon.** The extension icon (Marketplace listing, Extensions view, README) is a new badge
  with the black background outside its blue ring removed, so it no longer reads as a black tile on a
  light page. Whitespace around the ring is transparent, the file is a 128x128 PNG (the size the
  Marketplace requires), and the manifest still names it `Grumpy.png` — same field, new artwork.
- **The Activity Bar uses a white version of the same badge.** The sidebar glyph is white ink on
  transparency, so it reads against the dark Activity Bar. Its file name is unchanged too
  (`GrumpyWhite.png`), and the artwork both icons derive from is kept in the repo but left out of the
  package.

## [0.9.3] - 2026-09-13 · *the `1.0.0-beta.10` build*

### Changed
- **The docs describe the stable releases only.** Every *Install Pre-Release Version* / `--pre-release`
  instruction was removed from `README.md`, `USER_MANUAL.md`, `CHANGELOG.md` and `PUBLISHING.md`:
  `0.9.x` ships as normal releases, so there is nothing for a user to choose between.
- **The release workflow defaults to a normal release.** Its `pre_release` input was on by default
  ("keep this on while the version is a -beta"), which would have published onto the other channel
  without anyone asking for it; ticking it is now the deliberate opt-in.

## [0.9.2] - 2026-09-13 · *the `1.0.0-beta.9` build*

### Added
- **📦 Publish — build your app as a Debian installer.** The project the form belongs to is built in
  Release and packaged as `publish/<name>_<version>_<arch>.deb`, ready to copy to another machine. The
  package installs the app into `/usr/lib/<name>` with a launcher in `/usr/bin/<name>` and an
  application-menu entry (using the form's **Window → Icon** when it has one). The **.NET runtime is
  declared as a dependency, not bundled** (`dotnet-runtime-8.0`), so apt fetches it instead of the
  `.deb` carrying a second copy. The build runs in a terminal pane so the output is visible.
- **🚀 Install — install that package on this machine**, so the app runs on its own (application menu or
  by name in a terminal) instead of only inside the designer. It runs `sudo dpkg -i` in a terminal and
  asks for the password **there**; nothing else is ever typed into that terminal while sudo waits.
- **Windows: the same buttons produce an MSI installer** (WiX), per-machine into `Program Files` with a
  Start-menu entry, an *Apps & features* entry and a shortcut icon from the form. Installing a newer
  version **replaces** the previous one (a stable `UpgradeCode` per app makes it an upgrade, not a
  second app). The .NET runtime is **checked, not bundled**, via a launch condition that says where to
  download it. Needs the WiX toolset: `dotnet tool install --global wix`.
- **`avaloniaDesigner.publish.*` settings** — package name, version, maintainer, description and extra
  `Depends`. All optional: empty values fall back to the project file's name and `<Version>`.
- **Code Fix reports writing into the app's own folder.** A write next to the executable
  (`File.WriteAllText(Path.Combine(AppContext.BaseDirectory, …), …)`, a `SqliteConnection` whose
  `Data Source` points there, …) works from the IDE and fails once the app is installed, so the check
  raises a **warning** (no automatic fix — it says where the file belongs instead).

### Changed
- **Generated DataSets keep their files per user instead of next to the app.** An installed app is
  read-only: the `.deb` puts it in `/usr/lib/<pkg>` and the MSI in `Program Files`, both owned by root.
  A form whose constructor had to *create* its SQLite database there died with `SQLite error 14`
  before any window existed — and started from the application menu there is no console to show it, so
  the app simply "did not start". Relative `.db` paths, the XML stores and the remembered "Browse…"
  folder now resolve through a generated `RuntimeStorage` helper into the per-user data folder
  (`~/.local/share/<App>/` on Linux, `%LOCALAPPDATA%\<App>\` on Windows). Data an earlier build left
  beside the executable is still used when it is the only copy, so nothing is orphaned.
- **Install is disabled unless the package is *current*.** There are three states and the button follows
  them: *no package yet* → disabled, *package older than the form* → disabled (installing it would put
  the previous build on the machine while the designer shows the current one), *up to date* → enabled.
  The tooltip says which case you are in, editing the form greys it out again immediately, and the
  button re-enables itself when a build started in the terminal produces the package. "Install anyway"
  is gone — publish first. Note that *older than the sources* counts only files that end up inside the
  app (`.axaml`, `.cs`/`.vb`, project files, images, fonts), so editing a README in the project folder
  does not invalidate a package.

### Notes
- Both buttons are **platform-specific by nature** — a `.deb` on Linux, an MSI on Windows — so the
  extension emits them on those two platforms and refuses the actions elsewhere (macOS has no package
  format wired up yet).
- The Windows MSI path is **generated and unit-tested but not yet built on a real Windows machine** (the
  development machine is Linux): the WiX source, the version/upgrade identity and the PowerShell build
  script are asserted, and the `wix build` step itself still needs a Windows run to be confirmed.

## [0.9.1] - 2026-09-13 · *the `1.0.0-beta.8` build*

A measured performance pass over the whole extension — every hot path was timed before and after —
plus the defects the new tests exposed and three things you reported while testing.

### Added
- **A new project opens in the Designer by itself.** *Avalonia: New Project* now runs the first build
  in the background and opens the main form's designer tab, so the next thing you see is your form
  instead of an empty folder.
- **A benchmark harness** — `npm run bench` times the extension's hot functions (XAML serialise and
  lookup, property catalog, the code-behind checker, the per-edit commit signal) on a synthetic
  200-control form, so a performance regression shows up as a number rather than a feeling.
- **~120 new automated assertions** (the suite now runs **2,786**, all green) covering the code-behind
  checker's event signatures and recognition, orphaned-handler cleanup, `.adset` parsing and caching,
  the first open of a new project, the System-qualified clock code, and the webview's pointer state,
  nudge coalescing, properties scroll position and context-menu placement.

### Changed
- **Typing into a property applies when you leave the field or press `Enter`** — not while you type.
  Each commit re-renders the preview, returns a PNG and rebuilds the Properties panel; doing that
  behind a 400 ms debounce still ran the whole round trip mid-word and rebuilt the panel under your
  cursor, which made typing feel laggy. Discrete controls (a checkbox, a drop-down, a confirmed
  colour, a palette pick, a toolbar button) still apply immediately.
- **Everything below was measured, not guessed** — `analyzeCodeBehind` 14.3 → **11.9 ms** (two O(n²)
  string patterns replaced by a line index and a single pass) · a 200-lookup name pass 2.02 →
  **0.028 ms** (one DOM index per render instead of a full walk per lookup) · the per-edit commit
  signal 3.3–5.0 → **1.5–1.6 ms** (the control-set signature is read off the live model instead of
  re-parsing the XAML twice) · reading every `.adset` 1.03 → **0.21 ms** per lookup (~7 ms less per
  render) · the code-behind lookup 0.143 → **0.065 ms** with no file bodies read at all · the canvas
  overlays 3.7 → **1.8 ms** per frame at 200 controls (patched in place instead of rebuilt).
- **The webview no longer forces layout on every pointer move.** The drag anchor is resolved before
  the canvas rect is read, and arrow-key nudges are coalesced to one message per animation frame
  (they used to post ~20–30 per second, each one a full preview re-render and PNG decode).

### Fixed
- **The right-click menu always fits on screen** — it is measured after being shown and flipped or
  clamped against the window edge, instead of running off the bottom on a control near the bottom.
- **The Properties panel stays where you left it.** Setting a property no longer scrolls the panel so
  that the edited row sits at the bottom edge.
- **Generated clock/status handlers compile in C#** — the clock and tracker no longer use bare
  `TimeSpan`/`DateTime` (`CS0103`); they are fully qualified as `System.TimeSpan`/`System.DateTime`,
  which is valid in VB too.
- **No more phantom "wrong parameter type" findings** for the events whose `EventArgs` differ per
  control (`Window.Opened`, `NumericUpDown.ValueChanged`, `DatePicker.SelectedDateChanged`): the
  checker now resolves the argument type the same tag-aware way the code writer does.
- **83 events are checked again.** The checker kept its own hand-written event list, which had drifted
  from the generated catalog — `RightTapped` on 45 types, the DataGrid edit events, `Expander.*` and
  others were offered by the picker but never verified. The list is now derived from the catalog.
- **Deleting a control removes *all* of its orphaned handlers.** The cleanup scan stopped at the track
  of the first handler it decided to keep, leaving the rest behind as dead code.
- **A corrupt `.adset` can no longer be silently replaced.** It is parsed strictly, the error is shown,
  and neither the designer nor the DataSet editor will write over it.
- **The previewer host no longer leaks per frame** — the render target bitmap is disposed (~1.4 MB per
  frame before), the headless window is closed even when collection throws, every image is parsed and
  decoded once per frame instead of twice, and the emitted DataGrid row type plus the reflected type
  lookups are cached instead of a non-collectable assembly per grid per render.
- **A previewer request can no longer hang forever**, and a child process that fails to connect is
  killed instead of being left behind.
- **A webview escape or a control name containing a quote** could throw inside a pointer handler
  (an unescaped attribute selector) or swallow your next click (a stale `suppressClick` flag); both
  are fixed.

### Notes
- The Marketplace number is **`0.9.1`**; the same build is tagged **`v1.0.0-beta.8`** on GitHub. A
  published version number can never be reused, so `1.0.0` stays reserved for the first stable
  release (`PUBLISHING.md` part E).
- Published on the Marketplace as a normal release — the uploaded file was the plain
  `avalonia-designer-0.9.1.vsix` (verified: the gallery's `VsixSha256` matches it byte for byte).

## [0.9.0] - 2026-09-12 · *the `1.0.0-beta.7` build*

### Added
- **First Visual Studio Marketplace listing** — published at
  <https://marketplace.visualstudio.com/items?itemName=grumpy.avalonia-designer>. The VSIX on the
  Marketplace is byte-for-byte the `1.0.0-beta.7` package uploaded to GitHub.

### Changed
- **`repository.url` no longer ends in `.git`** — the Marketplace copies that field into the listing's
  Repository / Get Started / Source links, where the suffix is redundant.

### Notes
- The version number is the *only* difference from `1.0.0-beta.7`. `PUBLISHING.md` part E records the
  exact rejection message and why `1.0.0` was left unclaimed.
- Everything under `1.0.0-beta.7` below applies to this release as well.

## [1.0.0-beta.7] - 2026-09-12

### Added
- **Event wiring you can see and choose.** Placing a control no longer silently picks an event for
you: a chooser lists the events that make sense for that control (curated per control type, the
default event first), you can **pick several at once**, and the handler stubs are created in one go.
**Skip** places the control unwired, and **Remember my choice** makes that control type stop asking
(settings: `avaloniaDesigner.askEventOnPlace`, `avaloniaDesigner.autoWireDefaultEvent`).
- **`Events per Control.md`** — a generated reference listing every event each control actually
exposes in Avalonia 12.1.1, with the `EventArgs` a handler must take, the declaring class, the
events offered in the picker, and the default event per control. Copy-paste accurate for
hand-written handlers.
- **Right-click → “Add event…”** wires another event on a control that is already placed, from the
same chooser. Events that are already wired are marked and cannot be selected twice.
- **Middle-click chooses which handler to open.** When a control has several events wired, the
middle-click now lists them so you can jump straight to the one you want (a single handler still
opens directly).
- **The code-behind check can run by itself.** The Code Fix… analysis can now run when you return to
the designer tab (default), on save, while typing, or only when you press the button
(`avaloniaDesigner.codeCheck.mode`). Findings are published to **PROBLEMS**, shown as a **⚠ badge**
on the control in the canvas, and summarised in the toolbar (`avaloniaDesigner.codeCheck.badges`).
The new **⚙ Settings** button opens these options in the designer.
- **“Keep my manual edit” for every finding.** When a check reports something you removed on
purpose, every fixable finding now offers an alternative that accepts your edit instead of undoing
it: delete the handler from the form as if it had never been wired (`unwrap-handler`), or record the
decision and stay quiet (`dismiss`).
- **Re-pointing after a rename.** A handler you renamed by hand (`Button1_Click` →
`Button1_Clicked`) is offered as a one-click **re-point** instead of an empty new stub, so the body
you wrote is never lost. A rename is only proposed when exactly one candidate fits the signature.
- **Foldable toolbar categories.** The designer toolbar is grouped into **Edit**, **File**,
**Zoom**, **Guides**, **Alignment** and **Spacing**; clicking a category heading folds its buttons
away and clicking it again brings them back. Categories start unfolded and the folded set is
remembered per designer tab.
- **CI and release workflows** (`.github/workflows/`). Every push compiles, runs the test layers
that need no .NET SDK and proves the extension still packages; a second workflow runs the full suite
and publishes to the Marketplace on demand.

### Changed
- **Toolbar tidy-up.** Every button is exactly 24 px tall, the toolbar wraps onto a second row
instead of squeezing buttons (a separator left dangling at a row break is hidden), **⚙ Settings**
sits at the far right, and all toolbar text is high-contrast.
- **Toolbar icons are inline SVG** (13 buttons: undo/redo, the six alignments, text-centre, size and
spacing) instead of font glyphs — identical on every machine, coloured by the button and readable
while disabled. **Refresh** is text-only.
- **Smaller package.** The VSIX no longer ships source maps, build metadata, unused artwork or local
tool state: **90 files / 588 KB** (was 114 files / 700 KB).
- **Activation is on demand.** The extension no longer activates at every VS Code start; the
designer, toolbox, commands and views activate it when they are used.
- **The event data is a generated catalog.** Default events, the picker lists and every handler
signature now come from `src/controlEvents.ts`, generated from the real Avalonia assemblies, so the
XAML stub, the C#/VB signature and the reference document cannot disagree any more.

### Fixed
- **A missing .NET SDK now says so.** Instead of the raw `spawn dotnet ENOENT`, the designer explains
that its preview host is built with the .NET SDK and links to the download page.
- The **Align horizontal/vertical centres** toolbar icons read as a star at 16 px; they now show two
arrows converging on the centre line.
- **Deeper high-contrast pass** on the alignment/spacing icons: they are drawn as paths (white,
1.7 px strokes) rather than by a font.

## [1.0.0-beta.6] - 2026-09-11

### Added
- **File Selector / Folder Selector tools (file & folder dialog controls)** — two new entries in the
  **Input & text editors** toolbox group. Each drops a path row (a box showing the chosen path + a
  **“…”** button) onto the form; the button opens the **platform's own** dialog (Windows / macOS /
  Linux, no extra package). Both insert the same `<chrome:PathPicker>` control and differ only in the
  shipped `Path Type`: `File` for the file selector, `Folder` for the folder selector — and `SaveFile`
  is one dropdown change away for a save-as dialog. The properties are **Path Type**, **Selected
  Path** (two-way: pre-fill it or bind/read it), **Dialog Title**, **File Filter**
  (`Images|*.png;*.jpg|All files|*.*`), **Initial Folder**, **Read Only Path** and **Browse Text**.
  The bundled **`PathPicker.cs`/`.vb`** helper is copied into the project the first time a selector is
  placed (and reported/re-copied by 🩺 **Code Fix…** for projects that predate it), exactly like
  `ChromeWindow` / `GrumpyPanel`.
- **A menu item can now be a File Selector or a Folder Selector.** The **Menu Items** editor offers the
  two new kinds next to **Item**, **CheckBox**, **Radio**, **ComboBox**, **Separator** and **Space**.
  A selector row is a **leaf** (no children) with its own **px width** and **dialog title** fields, and
  saving writes a real `<chrome:PathPicker PathType="File|Folder" …>` inside the `<MenuItem>` — so a
  menu can offer “Open file…” / “Choose folder…” without a line of code. Existing picker rows are read
  back into the editor when it reopens, and an unknown or garbled kind is normalised rather than
  corrupting the tree.
- **The path rows show which kind they are.** `<chrome:PathPicker>` draws a small **page** or **folder**
  glyph at its left edge (page for `File`/`SaveFile`, folder for `Folder`, tinted with the control's
  `Foreground` so it follows the theme), and the new **Show Icon** property (default `True`) turns it
  off — useful when a form has several pickers, or pickers inside a menu.
- **💾 Project Backup (designer toolbar)** — one click makes a dated copy of the whole project: it
  first **saves everything that is unsaved** (the open form, every open DataSet document and any other
  dirty editor) and then copies the project folder into its **parent** folder as
  **`<Project>_<YYYY-MM-DD>_<HH-MM-SS>`** (`MyApp_2026-09-11_14-32-05`, which sorts by date); if that
  name is taken, `-2`, `-3`, … is appended. `bin`, `obj`, `.vs`, `node_modules` and `.git` are skipped
  **at any depth** — a backup is the project's own files, never build output or a git history — and if
  a save fails, **nothing** is copied (the status line names the file that could not be saved).

### Changed
- **The Properties sidebar is now grouped into sections — with the same order for every toolbox
  control.** Instead of one long list whose order depended on the control, rows are filed under
  **Editors**, **Layout & size**, **Appearance**, **Text & font**, **Data** and **Behavior**, so
  related settings sit together (all colour/brush rows in Appearance; size, position, dock, anchor
  and alignment in Layout & size; content and font in Text & font; item sources and edit
  permissions in Data) and a given row is always in the same place whichever control you select.
  Inside a section the order is canonical too (Width → Height → Left/Top → Margin → Padding →
  Dock → Anchor → Alignments), and the designer's popup editors (Rows/Columns, Split Layout, Items,
  Menu Items, Status Items) are collected in a leading **Editors** group. Section headings are
  **collapsible** — the folded state is remembered **per control type** (in the panel's own state, so
  it survives reopening), and **Show advanced** still reveals the advanced rows inside their sections.

### Fixed
- **🩺 Code Fix… no longer reports a C# form as having no constructor.** The checker recognised C#
  methods by their `void` return type — and a constructor has **none** — so a perfectly good
  `public MainWindow() { InitializeComponent(); … }` was flagged with the **warning** *“No
  constructor / InitializeComponent”*. That warning is published into the **PROBLEMS** pane, so it
  looked like a compiler warning while `dotnet build` reported 0 warnings / 0 errors — and the fix it
  offered would have inserted a **second** constructor (`CS0111`) instead of using the existing one.
  Constructors are now parsed (any access modifier, attributes, `: base()`/`: this()` initialisers),
  the fix calls into the **existing** constructor, and a safety net makes a duplicate constructor
  impossible even for a layout the parser cannot read.
- **…and VB code-behind with a one-line lambda is read correctly.** A single-line
  `Function(r) r.Name` or `AddHandler x, Sub(s, e) DoIt()` has no `End Sub`/`End Function` in VB, but
  the checker counted it as a block — so the method's own `End Sub` closed the phantom level and the
  span collapsed or ran long. That produced a false *“InitializeComponent() is missing from the
  constructor”* **error** on any form with a follower or a status clock, and it could make the *remove
  leftover handler* fix delete the wrong lines. Single-line lambdas are skipped, multi-line ones are
  still counted, so a fix now cuts exactly the method it names.
- **🩺 Code Fix… inserts its statements inside the body.** Adding `InitializeComponent()` /
  `BindImage_X()` to a constructor put the line after the **signature** — in front of an Allman-style
  `{` on the next line, which is invalid C# — and a missing VB constructor was inserted **above**
  `Inherits`, which VB requires to come first in the class body. The call now lands after the opening
  `{` (C#) or after the `Inherits …` line (VB), and a Data-Image call goes **after**
  `InitializeComponent()` — before it, the grid the binding wires up does not exist yet.

## [1.0.0-beta.5] - 2026-09-11

### Fixed
- **A follower binding no longer makes a C# project warn (`CS8603`).** The generated line was
  `ComboBox2.ItemsSource = new ColumnFollower<CustomersRow, string>(…)`, but the DataSet generator
  writes the row property as `public string? Name` — and the project template sets
  `<Nullable>enable</Nullable>` — so the selector lambda `r => r.Name` returned a maybe-null value
  into a non-nullable `TValue` (*warning CS8603: Possible null reference return*) in **every**
  generated C# project. The follower's value type now matches the generated row property exactly:
  `string?` / `byte[]?` for the reference-type columns, plain `int`, `long`, `double`, `decimal`,
  `bool`, `System.DateTime`, `System.Guid` for the value-type ones. VB.NET has no nullable reference
  types, so its `String` spelling is unchanged. Re-binding a follower rewrites the line, so a project
  that already carries the old spelling is corrected by the next bind.

## [1.0.0-beta.4] - 2026-09-10

### Added
- **Every generated `.axaml` starts with a “do not edit by hand” notice** —
  `<!-- Do NOT edit this file manually - Use the Designer to make changes -->` is the first line of
  a new project's `App.axaml` and `MainWindow.axaml`, of every form the **New Form** tool creates,
  and it is (re-)stamped on **every designer save**, so a file that was hand-written, hand-edited or
  created by an older version gains it too. Exactly one copy is kept (`<?xml …?>`/BOM stay first),
  and the designer's **⟳ Refresh** change check ignores the notice — reloading a form whose body is
  unchanged is not mistaken for an outside edit.
- **🩺 Code Fix… (code-behind checker)** — a new **designer-toolbar** button that checks a form's
  code-behind against its `.axaml` **and** the project's `.adset` files, then lists what is wrong
  with a **Fix** button per finding, **Fix all**, **Re-check** and **Go to line**:
  - **VB accessors** — a named control whose `FindControl` accessor is missing (the cause of
    `BC30451 'Image1' is not declared'`), and accessors left over from a deleted control (dropped
    only when nothing else references them).
  - **Duplicate definitions** (`BC30269` / `CS0111`) — e.g. a generated Data-Image block that got
    inserted twice.
  - **Event wiring** — `Click=`/`Loaded=`/`SelectionChanged=` handlers that don't exist yet (a stub
    with the correct signature is inserted) and handlers whose `EventArgs` type is wrong.
  - **Leftovers** — `<Control>_<Event>` handlers of deleted controls, removed **nesting-aware** so a
    generated clock handler's inner `Sub … End Sub` can't be left behind.
  - **Data-Image bindings** — incomplete blocks, a lost `' DataImage:` marker (re-stamped), bindings
    whose Image or DataGrid no longer exists (un-bound), and renamed column/table
    (re-generated from the `.adset`).
  - **DataSet drift** — `row.<Column>`, `<dataset>.Load<Table>()` and `Wire<Table>Grid(…)` calls
    that reference a renamed/deleted table, and `ItemsSource` statements aimed at a deleted control.
  - **Build prerequisites** — a bundled helper (`ChromeWindow`, `GrumpyPanel`, `AnchorHelper`,
    `ExifImageLoader`) missing from the project (copied in), and missing `Imports`/`using`
    statements (`Avalonia.Controls.Shapes`, `AvaloniaChrome`, `Avalonia.Platform.Storage`,
    `System.Data`, `Avalonia.Input`).
  - **Structure** — `InitializeComponent()` never called, and a `chrome:ChromeWindow` root whose
    class still inherits `Window` (converted).
  Findings are **also published to the PROBLEMS pane** as diagnostics on the `.vb`/`.cs` (or the
  `.axaml`), and the code-behind is **backed up once per run** into the extension's storage before
  the first fix. Anything a human has to decide (a control name that isn't a valid identifier, the
  same `x:Name` twice, `x:Class` ≠ the declared class, a stale name still used by hand-written
  code) is listed **without** a fix button rather than guessed at.
- **⟳ Refresh button in the designer toolbar** — re-reads the `.axaml` from disk and re-renders, so
  edits made in another editor and **rows added by a running app** (the design-time SQLite preview)
  show up without closing and reopening the form. Unsaved designer edits are never clobbered.
- **Follow-a-column bindings (a read-only control follows a bound DataGrid)** — a control that only
  DISPLAYS data (**ComboBox / ListBox / ItemsControl**) can now list one **text column** of a table a
  DataGrid owns, **live**, without owning the table itself. The Items Source picker lists those
  columns as `DataSet.Table.Column` entries (“follows DataGrid3 — lists the Name column, live”);
  picking one writes
  `ComboBox2.ItemsSource = New ColumnFollower(Of CustomersRow, String)(_customers, Function(r) r.Name, Function(r) r.IsPlaceholder)`
  (C#: `new ColumnFollower<CustomersRow, string>(_customers, r => r.Name, r => r.IsPlaceholder)`),
  copies the bundled **`ColumnFollower.cs|.vb`** helper into the project when it is missing, and
  records the binding on the table's `.adset` (`followers`), so the DataSet designer and Code Fix
  see it. Followers keep the grid's row order, **skip the “+ Add row…” placeholder** row, update on
  add/remove/**cell edit** (in place, so the control keeps its selected item) and can be un-bound
  from the same picker. A control that owns a table (a bound DataGrid) is not offered followers.
- **ColumnFollower helper** — bundled like `AnchorHelper`/`ExifImageLoader` and shipped with every
  new project (older projects get it copied in on first use).

### Changed
- **ChromeWindow title-bar colours** — the bundled `ChromeWindow` gained **Title Bar Color** and  **Title Bar Text Color** properties (with the predefined palette), so the dark-navy bar can be
  restyled per form. A project that predates the properties gets the current bundled file first.
- **The previewer host shuts down by itself** when its WebSocket client disconnects, plus a 90 s
  watchdog when the extension never manages to connect, and it is killed explicitly on window
  reload / deactivation. Leaked hosts used to be reparented to `systemd` and stay resident
  (~25 MB each; ~20 had accumulated).
- **Previewer-host errors are logged to the “Avalonia Designer” output channel** instead of
  appearing as raw unhandled-rejection stacks in the Extension Host output pane.

### Fixed
- **Data-Image bindings can no longer be inserted twice** — the `BindImage_<control>` method now
  proves a binding exists even when its `' DataImage:` marker was lost, and a marker-less block gets
  its marker re-stamped instead of a duplicate copy of its handlers (the cause of
  `BC30269 … has multiple definitions with identical signatures`). Un-binding recognises a
  marker-less binding too.
- **VB accessor sync can no longer drop accessors** — it now unions the **saved `.axaml`** with the
  **in-memory model** (a control that was just dropped/bound can be missing from either side) and
  also picks up `Name=` (not only `x:Name`). This was the other half of the
  `'Image1' is not declared` bug.
- Removing a VB handler whose body holds a nested anonymous `Sub`/`Function` (the generated
  XY-Tracker / StatusDate clock) no longer stops at the inner `End Sub`, so deleting an XY-Tracker
  control leaves no `timer.Start()` / stray `End Sub` behind.
- Dragging a divider in a **multi-pane SplitPanel** (3+ panes) no longer moves the *other*
  dividers: the axis is rewritten all-star, Avalonia-style — the dragged pane takes the pixels and
  its immediate neighbour absorbs the difference (matching GridSplitter at runtime).
- The **title-bar colour properties** now offer the predefined colour palette in the Properties
  panel (they had been added without `options`, so the dropdown came up empty); the whole toolbox
  was audited — every colour property has the palette.
- The Add/Edit row dialog shows each column's **label** again above its input box, and the integer
  **key column is pre-filled with the next free id and shown read-only** when adding a row.
- Binding a control that still has **inline items** is now caught: Avalonia refuses an `ItemsSource`
  while `<ComboBoxItem>`-style children exist (“Items collection must be empty before using
  ItemsSource.”) and the app would throw at startup. The picker asks to clear them as part of the
  bind, and 🩺 Code Fix reports it (one-click fix). Code Fix also drops a **follower binding whose
  grid/column is gone** and re-copies a missing `ColumnFollower` helper.
- **Test suite:** the webview fixture now covers every element `media/designer.js` looks up (a
  missing `btnRefresh` made the script throw on load and silently reduced the T3 layer to 5 of ~360
  checks — there is now an assertion that fails loudly instead), the bundled-component fixtures
  mirror the current marker, and the T4 harness re-asserts its `ProjectReference` before building.

## [1.0.0-beta.3] - 2026-09-06

Third public **Beta**. ⚠️ Incomplete & buggy — development is on-going.

### Changed — SQLite is now the ONLY data store for bound tables (final semantics)

- **Bound tables are always SQLite.** A table bound to a DataGrid / ComboBox / ListBox / ItemsControl
  is persisted in a SQLite file; the old sample/XML data store is retired for bound tables and the
  one-time XML→SQLite migration is removed. Legacy `MyData.<Table>.xml` files are no longer read.
- **Existing `.db` files are used in place.** Browse stores the **absolute path** and the app edits
  that file directly — nothing is copied to `bin`. The generator no longer injects a
  `<Content … CopyToOutputDirectory>` entry for SQLite files.
- **Default database per DataSet.** A table that has no SQLite file of its own when it is **bound**
  is auto-registered against `<DataSetName>.db` (e.g. `MyData.db`), which is created next to the app
  on first run.
- **List-bound controls read the database too.** The generated `Get<T>` for ComboBox/ListBox/
  ItemsControl now loads rows from SQLite (`SELECT … ORDER BY rowid`) instead of sample/XML.
- **Preview always queries the pointed file.** The DataSet designer's "Preview SQLite data…" runs
  against the `.db` the table points at (absolute or project-relative), and Import SQLite links the
  file + real SQL table name so renamed tables keep working.
- If you have a beta-era project that stored data in `MyData.<Table>.xml`, re-import that data into a
  SQLite file via the DataSet designer's **Import SQLite…** and bind the table to it.

### Added
- **File browser in the add/edit row dialog** — every **text (String) column** in the DataGrid's
  "+ Add row…" / edit row dialog now has a **Browse…** button that opens the native OS file picker
  (images first, with an *All files* option) and writes the chosen file's **full absolute path** into
  that box. The dialog remembers the folder you last picked from (best-effort, kept next to the app)
  and starts there next time. Generated for **both C# and VB**.
- **SQLite-backed bound tables** — a DataSet table bound to a DataGrid / ComboBox / ListBox /
  ItemsControl is persisted in a SQLite `.db`. The DataSet designer has a per-table **Data source**
  picker + a **Primary key** flag; bound tables generate a shared **`DatabaseAdapter`** with
  DB-backed `Load`/`Save` (C# **and** VB) so the DataGrid's live add/edit/delete and undo/redo write
  through to the `.db` (integer keys stay stable — AUTOINCREMENT survives the DELETE+INSERT save;
  new rows read `last_insert_rowid` back). Generating adds the SQLite NuGet packages automatically;
  a **Preview SQLite data…** panel runs read-only queries against the `.db` and **Import SQLite…**
  reverse-engineers an existing `.db` into `.adset` tables. See "Changed" above for the final
  data-store semantics.
- **Menu Items editor** — a `Menu` bar has a **Menu Items** property that opens a tree editor
  (Item / CheckBox / Radio / ComboBox-of-options / Separator, up to 5 levels); top-level items
  are drawn as plain placeholder labels in the designer; Save writes real `<MenuItem>` XAML.
- **Status Bar redesign** — the Status Bar tool now inserts a real **DockPanel** strip (docked
  Bottom) with a **Status Items** editor: each item is pinned LEFT or RIGHT and stretches to the
  bar's height (TextBlock / TextBox / Button / ProgressBar / Separator / live-clock StatusDate).
- **XY-Tracker tool (Dev Helpers)** — a `TextBlock` that shows the live size of its context as
  **W x H px**, updated every 200 ms by a generated `Loaded` `DispatcherTimer` (C# and VB
  code-behind created for you). Dropped on a container it reports that container's size; dropped on
  a Status Bar (or added via the Status Items editor as the **'form WxH'** kind) it reports the
  **form's** client size and hugs the right edge. Standard Background / Foreground / Font properties
  and Anchor behaviour apply. (Form mode reaches the window via `TopLevel.GetTopLevel`, which is
  how Avalonia 12 exposes it — there is no `Control.TopLevel` instance property anymore.)
- **StatusDate Date/Time formats (System/Custom)** — selecting a StatusDate clock now shows
  beginner-friendly **Date Format** and **Time Format** pickers (each: **None (hidden)**, **System**
  = the OS format, or pick a shown example like *Mon, 9 Sep 2026* / *14:32*) plus a live **Preview**.
  You can hide either the date or the time, and the picked formats are written into the generated
  code-behind clock handler so the runtime clock matches.
- **SplitPanel design-time splitter dragging** — grab a divider between two panes in the designer
  and drag it to resize the panes: a guide line follows the mouse, and on release the split is
  applied as fixed pixels (the pane's Width/Height shows the new divider position; a neighbouring
  pane flexes). Drags respect each pane's minimum and undo as a single step (Ctrl+Z). Works across
  Zones / Columns / Rows layouts.
- **Grumpy Panel tool (Layout panels)** — a bundled **docking-region** control (a framed
  `<chrome:GrumpyPanel>`, `GrumpyPanel.cs`/`.vb` shipped with every project like ChromeWindow).
  Drop it on any canvas/panel: children you drop inside land **freely** (no auto-placement), and a
  **dock-able** control (Menu, Status Bar, Image, grids, …) can be **Docked** to the panel's edges
  — it pins to that edge while the free body shrinks (Dock = **None** returns it to the free body).
  The panel itself has a **Dock** plus a dedicated **8-position Anchor** (Left / Right / Top /
  Bottom / Top-Left / Top-Right / Bottom-Left / Bottom-Right) that pins it to its container, and a
  Border-style frame (Background / Border Brush / Border Thickness / Corner Radius) with a
  **System / Custom** Theme switch. Older projects get the helper copied in automatically when you
  place one.
- **GrumpyStatus tool (Bars)** — a ready-made **status strip built on the GrumpyPanel base**:
  dropping it docks a dark-grey (default) strip to the **bottom** edge, with a **status label on
  the left** and a **live clock (StatusDate) on the right** — its per-second timer code-behind is
  wired for you automatically. Afterwards it behaves like any GrumpyPanel: add more items freely
  or **Dock** them (Left/Right/Top/Bottom) to pin them to a strip edge; edit the label text, the
  clock, the dark-grey background and the strip height from Properties.
- **SplitPanel tool** — a resizable multi-pane container. Default **Zones** layout: two panes
  side-by-side over a full-width bottom pane, split by runtime-draggable bars; panes flex with the
  window. Click the panel's border to select/move the whole Split Panel; click a pane to select it
  and drop controls into it. A pane's **Width** (side-by-side) / **Height** (full-width bottom)
  sets the divider position, **0 hides** it, `*` lets it flex.
- **Split Layout editor** — switch a SplitPanel between **Zones** (a configurable number of panes
  in the top band over a full-width bottom pane, e.g. 2‑up or 3‑up over 1), **Columns** and **Rows**
  (with the pane count); each pane keeps its contents, and older Grid-rooted splits convert to the
  Border-framed form automatically.
- **Splitters editor** — style each divider bar of a SplitPanel: its **thickness**, **colour** and
  whether it is **visible** at runtime (hidden bars can't be dragged).
- **DataGrid Rows & Columns editors** — a DataGrid's Properties now offer **Rows** and **Columns**
  popups: row background, text colour, row height, row-header width, grid lines + their colours,
  header visibility, default/min/max column width, frozen columns and header height (all direct
  Avalonia DataGrid attributes). The Columns editor also styles the **column headers**: text
  alignment (left/centre/right), text colour, font family, font size and header background —
  written as a generated `<dg|DataGridColumnHeader>` style (Avalonia has no direct DataGrid
  header attributes).
- **Header font picker lists the system fonts** — the Columns editor's *Header text font* is now a
  dropdown of every font family the machine actually has (enumerated by the C# preview host via
  Avalonia's `FontManager.SystemFonts`, offered through the new host `fonts` command), with a
  compact built-in fallback list until the host responds.
- **Remove DataSet button** — the DataSet designer toolbar has a red **Remove DataSet** that warns
  first, then strips every grid/list/items/image binding + code-behind reference of the DataSet's
  tables, deletes the `.adset`, the generated `.cs`/`.vb` and `.xsd`, and deletes the **auto default
  `<DataSet>.db`** (project + bin copies) — user-browsed/per-table/external `.db` files are listed
  but kept (they may be shared). The panel then closes.
- **Image "Data…" binding** — an `Image`'s Source now has a **Data…** action: bind the image to a
  String column of a DataGrid-bound DataSet table. At runtime it shows the **selected row's**
  absolute image file (auto-selects row 0 on load; blank when the value is empty/missing). It is
  exclusive with a literal Source. Works in C# **and** VB; metadata lives on the owning table's
  `.adset` (`boundImages`) + a code-behind marker.
- **Design-time DATA preview on the canvas** — the designer renders XAML only (no code-behind), so
  bound data used to look empty while editing. Now each DataGrid-bound table's rows/columns are read
  from its `.db` (via the preview host, cap 8 rows) and the grid is filled read-only on the canvas;
  a Data-bound Image shows the **first row's** image. Runtime is untouched.
- **Properties panel top-actions** — the most-used editors are pinned to the **top** of the
  Properties panel: **Rows**/**Columns** for a DataGrid, **Split Layout**/**Splitters** for a
  SplitPanel, and **Tab Items** for a TabControl.

### Fixed
- **Deleting a VB control left code-behind fragments (e.g. `timer.Start() / End Sub`)** — deleting an
  XY-Tracker (or any control whose generated VB handler embeds an anonymous timer `Sub`) only removed
  the code up to the *inner* `End Sub`. Handler removal now finds the **matching** `End Sub` (nesting
  aware, skipping comments/strings), so the whole method is removed cleanly.
- **SplitPanel: dragging a divider in a multi-pane split moved the OTHER splitters too (design-time and
  runtime)** — the design-time drag pinned the dragged pane to a fixed pixel width, and a fixed + star
  column mix makes Avalonia's real `GridSplitter` resize only the fixed neighbour while the star
  absorbs (so neighbouring splitters shift). A divider drag now keeps the whole axis **all-star**
  (each pane's star value = its pixel width, Avalonia's own runtime model): the dragged pane takes the
  new pixels and its immediate neighbour absorbs the difference, so **only the dragged divider moves**
  in the designer and at runtime. Typing a pane's pixel Width/Height uses the same model.
- **XY-Tracker on the new GrumpyStatus bar reported the bar's size instead of the form's** — form-mode
  detection only recognised the legacy Status Bar strip, not the GrumpyStatus (a bottom-docked
  GrumpyPanel). A tracker dropped onto a GrumpyStatus now reports the **form's** client size and is
  pinned to the strip's **right** edge inside its dock band, exactly like a legacy Status Bar item
  (works whether you drop it on the strip's empty middle or straight onto its label/clock).
- **App showed old XML rows instead of the seeded SQLite rows** — the runtime reads the .db next to
  its exe, and the one-time XML→SQLite migration ran on the first launch (fresh, empty runtime db) and
  imported the leftover `MyData.<T>.xml`. The migration now runs **only when the database file is brand
  new** (didn't exist before that run), so a pre-existing/seeded .db is trusted as-is. Generating also
  adds any project-relative SQLite file as a **Content copy-to-output** item, so the build drops the
  same seeded .db next to the exe and runtime matches the designer preview.
- **Imported SQLite tables showed the sample row, not the DB rows** — importing a `.db` created
  tables schema-only (no link back to the file), so binding one and running loaded the sample/XML
  demo row. Imported tables are now **SQLite-backed** with the source file, and the spec remembers
  the real SQL table name (`sqlite.tableName`) — so an import that had to be renamed (e.g. DB
  `Customers` → `.adset` `Customers2`) still reads/writes the original `Customers` table.
- **VB Save<T>Grid used a hard-coded "CustomersRow"** — the generated VB `Save<T>` iterated
  `For Each r As CustomersRow`, which only compiled while the bound table was literally named
  Customers (any other name, e.g. an imported Customers2, produced “Type 'XRow' is not defined”).
  It now uses the table's own row type.
- **VB `'MyData' is not declared` (BC30451)** — the VB add/edit-row dialog code hard-coded
  `MyData.CreateDataSet()`, which only compiled when the DataSet was literally named MyData. It now
  uses the DataSet class's own unqualified `CreateDataSet()`.
- **Adding a column then running crashed with `SQLite Error 1: no such column`** — CREATE TABLE IF
  NOT EXISTS is a no-op on an existing `.db`, so columns added in the designer were missing at
  runtime. The generated `DatabaseAdapter` now runs **EnsureColumns** (PRAGMA table_info → ALTER
  TABLE ADD COLUMN for every missing column) after each open (C# **and** VB).
- **`duplicate column name: Id` crash** — EnsureColumns compared quoted defs against unquoted PRAGMA
  names, so it never recognised existing columns and re-created them. Defs are now emitted unquoted;
  only the ALTER statements quote column names.
- **Renaming a DataSet broke the build** — renaming left the old generated file + code-behind
  references behind (duplicate shared helpers → BC30179). The DataSet name is now **read-only**
  after creation in both the toolbar and the panel; to rename, Remove DataSet… and re-create it.
- **ItemsSource picker ⇄ DataSet designer stayed out of sync** — binding from the form's Items
  Source "…" now records exactly what the DataSet designer's Bind records (incl. the shared default
  `.db` and SQLite packages) and an open DataSet panel **live-refreshes** after a form-side
  bind/unbind, so the two entry points can't drift apart.
- **Data-bound Image rendered 0×0 at design time** — the preview host resolved an absolute `Source`
  as a *project-relative* path on Linux (every absolute path starts with `/`), the file was
  "missing", and the image was silently skipped. Rooted paths that exist are now used as-is while
  `/Assets/…` project paths still resolve. DataGrid rows **and** the bound image now both render on
  the canvas.
- **Newly placed controls showed Dock = "Fill" instead of "None"** — a control dropped into a
  DockPanel as its last child inherited the panel's default `LastChildFill="True"`, so the
  designer's Fill-detection labelled it Fill even though it had no `DockPanel.Dock`. Placement now
  normalises the same way choosing Dock = None does (drops `LastChildFill`), so a placed DataGrid
  keeps its own size and its Properties panel reads **None** until you explicitly pick Dock = Fill.
- **"Bind to control" dropdown was empty** — the DataSet designer's project scan used
  `/^\.axaml$/i`, which matches only a file literally named `.axaml`, so no real `*.axaml` ever
  contributed controls. The regex is now `/\.axaml$/i` (any `.axaml` file), so placed
  DataGrids/ListBoxes/ComboBoxes/ItemsControls appear again. The list also **refreshes** when a
  table is selected, so a control placed/saved after the designer opened shows up without a reload.
- **Dropdown popups (font picker, alignment, Properties selects) were unreadable** — the webview
  is a dark UI but didn't declare a dark `color-scheme`, so Chromium drew each native `<select>`
  list as an OS-light white box with the light-grey text on top. The designer now pins
  `color-scheme: dark` (dark list + light text, matching the panel) and the pickers' `<option>`
  rows get an explicit dark background / light text. (Also defines the previously missing
  `--panel-1` used by the modal fields.)
- DataGrid **Reorder Columns** / **Resize Columns** now actually work at runtime: the designer's
  defaults wrongly treated them as True, so setting True stripped the attribute and the real
  framework default (False) kept them off. Defaults now mirror the control (reorder/resize = False,
  sort = True), so setting True writes `CanUserReorderColumns="True"` / `CanUserResizeColumns="True"`.
- Docking a control that was placed **inside a SplitPanel pane** now docks it **within that pane**
  (the pane's body becomes a DockPanel; **Fill** fills the pane) instead of yanking it out to the
  form's root DockPanel.
- Generated **GridSplitter** bars now carry `MinWidth="1"`/`MinHeight="1"` (not 0) so a thin
  divider never shrinks away or becomes un-draggable.
- SplitPanel panes are individually selectable again — the split writes explicit
  `<Grid.ColumnDefinitions>` property elements (the host loader ignored the attribute shorthand).

## [1.0.0-beta.2] - 2026-09-03

Second public **Beta**. ⚠️ Incomplete & buggy — development is on-going.

### Added
- **Undo / Redo toolbar buttons (↶ / ↷)** — step the 5-level undo history back/forward straight
  from the toolbar (the Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y shortcuts still work). The buttons
  enable/disable to match what can actually be undone or redone.

[1.0.0-beta.2]: https://github.com/OomNiel/avalonia-designer/releases/tag/v1.0.0-beta.2

## [1.0.0-beta.1] - 2026-09-03

First public **Beta**. ⚠️ Incomplete & buggy — development is on-going.

### Added
- **New Project / New Form** — generate a complete Avalonia project or a single form in
  **C# or VB.NET** (net10.0 + Avalonia 12.1.1), rooted on a `Window`/`UserControl` with a
  custom `ChromeWindow` title bar available.
- **WYSIWYG `.axaml` designer** — open any form in a designer tab (Source/Design toggle):
  toolbox drag‑and‑drop (click‑tool‑then‑click‑canvas on Linux/Xorg), move/resize,
  multi‑select + alignment, shape controls (Line/Rectangle/Ellipse/Arc), Grid rows/columns
  + drag‑to‑re‑cell, docking, images‑in‑grid, dot‑grid/snap, undo/redo.
- **Properties panel** — common properties with live re‑render; colour palette, font, margin,
  file/asset pickers; theme (System/Custom) colour backup.
- **Alignment tools** — align/middle (centres), same width/height, and **equal vertical (⋮) /
  horizontal (⋯) spacing** that spreads 3+ selected controls with equal gaps (outermost stay put).
- **Crosshair** — pointer crosshair with move/resize anchors and a style setting (§68/§69).
- **Design rulers** — white-on-black top + left rulers scaled to the design surface (§69c).
- **Preview theme echo** — the live preview follows the file's theme, the `avaloniaDesigner.previewTheme`
  setting, or the VS Code light/dark theme (§69d).
- **DataSet designer** — design ADO.NET `DataSet` tables/columns visually (`*.adset`) and
  generate a runtime C#/VB class + `.xsd`.
- **Previewer Host** — a bundled C#/Avalonia headless renderer (auto‑built on first use)
  shows a faithful live preview and reports control bounds.
- **F5‑ready projects** — new projects ship a Linux‑safe `.vscode/launch.json` (`coreclr` +
  the built assembly, no Windows `.exe`) and a default `build` task; NuGet is restored before
  the project opens so the language server loads cleanly first time.

### Fixed
- Selecting the **form** (click empty design space or pick **"Form - <Title>"** in the control
  drop‑down) lets you resize the whole surface via its Window Width/Height.
- The **root layout panel** and the Body design surface are locked in place (no stray resize
  handles / accidental dragging).
- Hit‑testing is **hierarchy‑ and ZIndex‑aware** — shapes render behind by default but stay
  clickable where visible and never steal clicks from controls over them.
- Resizing a control by its **top edge** no longer drops it 44px low on ChromeWindow forms
  (parent-relative vs window-absolute coords) (§68b).
- The **Align vertical/horizontal centres** toolbar buttons now match their labels (↕/↔) (§69b).
- Colour dropdown lists the full palette (~5 rows visible, scrollable; opens upward when near
  the bottom); no more duplicate VB `Imports` or stray BOM characters.
- Generated VB projects no longer bake in a machine‑specific language‑server path.

### Notes for testers
- The preview host renders with **Avalonia 11** while generated apps target **Avalonia 12** —
  preview fidelity can differ slightly; some controls/custom types render as approximations.
- Toolbox drag‑and‑drop is unreliable on Linux/Xorg — use **click the tool, then click the canvas**.

[1.0.0-beta.1]: https://github.com/OomNiel/avalonia-designer/releases/tag/v1.0.0-beta.1
