# Session — Grumpy's WYSIWYG Designer for VS Code

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

## Where the last session left off (2026-09-26, thirteenth session — 0.12.8, docs done, release pending)

**The toolbox drag works on native Wayland, and the panel got two small rows moved.** The session began as a
verification of printing, then the user refactored the drag path and reported it *still* dead — which turned
into a four-release diagnosis (`0.12.3`…`0.12.6`), then two small requests (`0.12.7` Print Ink, `0.12.8` the
Data Selector row), and finally *"commit etc, do all docs, I want to publish to the Marketplace"* — so every
doc is in line and the tag/release/upload are the remaining steps.

**What 0.12.3 … 0.12.8 did** (full detail in `CHANGELOG.md`, `NOTES.md` §154–§157):

- **The drag, in four steps, each one answering the question the last one could not.** VS Code does not bridge
  a TreeView's drag MIME types into a webview, so the canvas's `drop` saw an **empty** `dataTransfer` and
  bailed (`0.12.3`: the tag now rides the `armTool` message — the click-to-place channel). Then the user's
  machine showed *"armTool posted"* and nothing else (`0.12.4`: instrumentation — the arm logs its own
  arrival, the webview logs every drag event it sees, and a swallowed drop is completed from the `dragover`
  stream going quiet). Then a single log line proved the gated probe could not tell *"the arm never arrived"*
  from *"the drag never arrived"* (`0.12.5`: probes unconditionally on the document, plus a 500 ms watchdog
  that hands the tool back to the click path). Then the answer: on that machine **not one drag event reaches
  the webview — not even `dragenter`** — so Electron starts a native drag and never hands it over (`0.12.6`:
  the **release rescue** — Chromium sends no mouse events during a native drag, so the first `mousemove` /
  `mouseup` after the arming *is* the release, and it places the tool where the user let go). The user
  confirmed: **"The workaround works."**
- **`H. Align` / `V. Align` are advanced rows** (`0.12.3`) — hidden until **Show advanced**, on every control
  and on the multi-selection panel.
- **A brand-new C# project built with `CS0103: The name 'GrumpyPrint' does not exist`** (`0.12.3`):
  `projectCreator.ts` never passed the helper that `GrumpyCharts` calls. Fixed, and a test now asserts the
  creator passes **every** file in `resources/` — the scaffold treats an option as optional, which is why
  nothing else caught it.
- **`Print Ink`** (`0.12.7`, asked for in these words: *"I want the option to print 'Colour' or 'Mono'. If mono
  is selected the plot background colour must be temporarily set to transparent and after the print restored
  to what it was before printing."*): all seven charts, **both** halves of the plot background removed for the
  job (the `PlotBackOpacity` plate and a form-set `PlotBackBrush`) and both put back from a `using`, so a
  failed print cannot leave the form changed. The scoped-override machinery became general
  (`ApplyPrintTweaks` / `WithPrintTweaksAsync` / `PrintTweaksRestore`) and the PNG and both PDF paths honour
  it.
- **The `Data Selector` row now sits in the Data section** (`0.12.8`): it had been keyed `Data`, which is also
  the shape controls' path-geometry row (`Path Data`), and the section map takes the first listing — so it was
  filed under *Appearance*. It has a key of its own now and is listed first in **Data**.

**Two facts to carry forward.** The `0.12.7` `.vsix` is **contaminated** — packaged while a stray probe file
(`Consumer.cs`) sat in the repository root, and it rode into the package — so `0.12.8` is the file to upload,
and it contains all of `0.12.7`. And the suite total **drifts** between runs (8,632 → 8,630) because the T5
property audit skips controls its compliance cache has already verified.

**Still open for the user:** the GitHub tag/release for `v0.12.8`, and the Marketplace upload itself (the
listing still carries **0.11.0**, so this one upload spans the whole chart line, the print work and these six
releases).

## The session before that (2026-09-25, twelfth session — 0.12.2 packaged, tagged and released)

**Charts print on a Linux desktop now, and the paper can leave the legend off.** The user reported **Print…**
greyed out on a project that was wired correctly, picked the **"PDF + CUPS service"** route out of the options
offered, then asked for the **Print Legend** row, the docs and the release — so `0.12.2` carries both, every doc
is in line, and the GitHub release is made.

**What 0.12.2 added** (full detail in `CHANGELOG.md` `[0.12.2]`, `NOTES.md` §153, `USER_MANUAL` §19.14):

- **`GrumpyPrint`** — a new bundled helper (C#, and its VB twin): the page is rendered to a temporary PDF and
  handed to **CUPS** (`lp [-d printer] -t "title" file`). It exists because `Avae.Printables` publishes a real
  service only for the platforms it targets and an **API-only** asset for a plain Linux desktop — where
  `UsePrintables()` compiles, runs and registers *nothing*, so `Printable.Default` stayed null and **Print…**
  stayed greyed out on the very machine the chart was drawn on. Windows and macOS are untouched: the helper is
  consulted only when no service exists.
- **`Print Legend`** on all seven charts — *As drawn* (default), *Off* (the graph only, the legend's room back
  to the plot) and *On* — scoped to the job: the chart's own `ShowLegend` is set and put back around the render,
  so the screen never changes.
- **`CanPrint` means "this machine can put a page on paper"** (the platform service *or* CUPS), the marker
  moved to `GrumpyPrint`, and **the helper is copied in together with the chart** — a project holding one
  without the other does not compile. In an older project, **save** the form holding a chart (or place one) and
  both are refreshed.

**What the previous session (0.12.1) did** — detail in `CHANGELOG.md` `[0.12.1]`, `NOTES.md` §152:

- **Availability instead of a dead click:** `CanPrint` reads `Printable.Default`; with no service the
  **Print…** entry is disabled and its tooltip names `AppBuilder.UsePrintables()`. PDF and PNG never need it.
- **Failures are reported:** a `PrintFailed` event + `Trace` line replaced the bare `catch { }`, and the same
  output is reachable from code — `ExportPdfAsync(path|stream)`, `ExportPng(path, scale)` — with `IsPrinting`
  and a re-entrancy guard (`_printBusy`) so a second click cannot open a second dialog.
- **Real paper:** `ChartPrintOptions` / `ChartPaper` (`AsDrawn` default, `A4`, `Letter`, `Margin`,
  `LightBackground`) exposed as **Print Paper / Print Margin / Print on White** on all seven charts, composed
  by a `ChartPrintPage` wrapper that paints the chart through a `VisualBrush` (the PDF stays vector). These
  rows sit outside `PRINT_SUPPORT` so the previewer still parses them.
- **`Save as picture…`** (PNG) and **Ctrl+P** joined the menu; the export folder is remembered separately from
  the spreadsheet folder; a picked file with no local path is written through its stream; a platform that
  prints a file but not a Visual gets a temporary PDF.
- **The designer notices a project that cannot print** (one from before 0.12.0) and offers the project-file
  half of the fix — `src/printSupport.ts`, idempotent, VB comma form only, byte-identical on generated
  projects; `Program`'s `.UsePrintables()` stays the user's.
- **A real bug found by the new harness:** the A4 page wrapper was laid out on the PNG path only, so the PDF
  path threw `Invalid create info - no Canvas provided`. Fixed in the shared `PageVisuals` helper.
- **Tests:** `tests/t2-logic/printSupport.test.js` (165) and `tests/t4-runtime/printExport.test.js` (37, with
  `printProgram.cs.tpl`); the staleness marker moved `printItem` → `ExportPdfAsync`; the `chartFill` order
  guard was strengthened (it had degenerated to `-1 < -1`); suite **8,346 passed / 0 failed** (from 8,121),
  host + 10 generated projects + VB matrix 0/0, PROBLEMS clean.
- **Docs + version:** `package.json`/lockfile/14 bundled stamps → **0.12.1**; CHANGELOG, README, USER_MANUAL,
  CONTROLS, TEST_PLAN, NOTES §152, this file, PUBLISHING state note.

**Open / next:**

1. **`0.12.2` is the upload candidate; the Marketplace still carries `0.11.0`.** `0.12.1` was packaged but never
   published — `0.12.2` supersedes it (its content, plus Linux printing and the legend row), so upload
   `avalonia-designer-0.12.2.vsix` and mark the `0.12.1` ledger entry superseded. `0.12.0`'s asset stays on
   its own GitHub release as the record of that build.
2. **Printing on Linux is proved with a STUB `lp`, not a real printer.** The harness asserts the argv, the
   rendered page and the cleanup; the last mile — paper coming out of the Canon — is still the user's to
   eyeball, along with a real PDF and a real printed page.
3. **`Avae.Printables` is a community library.** Its `Friend` `IPrintingService.GetVisual()` is what forced the
   helper's shape; if a future release makes that member public, the interface route becomes viable again — but
   it would still have to work in VB too, or the twins diverge.
4. **`host/ModelHost`** still restores LLamaSharp natives for every platform — untouched on purpose.
5. **Unrelated dirty files** still in the tree: `resources/ColumnFollower.cs` (a formatter re-indented the
   `case` blocks) and `package-lock.json` (lost its trailing newline).

## Where the last session left off (2026-09-25, tenth session — 0.12.0 released)

**The user's own hardcopy feature was verified, its VB half turned out never to have existed, and the work
shipped as `0.12.0`.** They added `Print…` / `Print to PDF…` to the chart menu behind `PRINT_SUPPORT` and
asked for a review of the code changes; the review found a symbol that never reached the VB compiler, and the
release below carries the fix.

**What went in** (full detail in `CHANGELOG.md` `[0.12.0]`, `NOTES.md` §151, `USER_MANUAL` §19.14):

- **Found: the VB symbol was never defined.** `src/projectScaffold.ts` set `PRINT_SUPPORT` from a
  `BeforeTargets="VbcCompile"` target, and the SDK assigns `FinalDefineConstants` *after* that target runs —
  so every VB project compiled with the feature silently absent, with 0 errors and 0 warnings. Fixed with
  `<DefineConstants>$(DefineConstants),PRINT_SUPPORT</DefineConstants>` (comma, not semicolon: vbc's
  `/define:` takes commas, and the `;` form is `BC31030`). Proven by reading the switch vbc received:
  `…,PLATFORM="AnyCPU",,PRINT_SUPPORT,_MyType="Empty"`, `DEBUG`/`TRACE` intact.
- **Why the earlier checks missed it:** "compiles with the symbol, 0 errors" is meaningless when the symbol
  can be dropped — a skipped conditional block compiles perfectly. The new guard **references the gated
  members**: `tests/t0-build/printsupport.test.js` generates a C# and a VB project, adds a probe calling
  `PrintAsync()`/`PrintToPdfAsync()`, and requires a clean build (`BC30456`/`CS1061` without the symbol).
- **C# was fine all along**, and the T0 matrix (10 generated projects) now compiles the print block in VB
  too: 0 errors / 0 warnings.
- **Docs brought in line:** the `[0.12.0]` changelog note had explained the broken mechanism as if it worked;
  it now names the overwrite, the comma rule and the two packages. `USER_MANUAL` §19.14 (new) documents
  hardcopy — menu, page-size behaviour, the per-language wiring, and the `BeforeTargets` trap in a warning
  box; the manual's §19 intro, its TOC (which was also missing 19.10–19.13) and the "no packages" note were
  corrected. `CONTROLS.md` charts section gained the `ChartBase` methods, `PRINT_SUPPORT` and the packages;
  `TEST_PLAN.md` gained the 0.12.0 log entry and a T0 row that names the probe.
- **The README image** (`DesignerDemo.png`, 3303×2242, 896 KB) sits directly under the *"Formerly Avalonia
  Designer for VS Code"* notice box, and is excluded from the `.vsix` — vsce rewrites a relative README image
  link to the repository, so the gallery serves it from GitHub and the package stays ~1.2 MB. Pinned from
  both sides in `packaging.test.js`.
- **In-extension help:** the seven chart controls share one appended sentence in `controlInfo.ts` about the
  two menu entries (a tag set, not seven copies).
- Suite **8,121 passed / 0 failed** (+20); PROBLEMS clean; `npm run compile` clean.

**Open / next:**

1. **`0.12.0` is released** — commit `69ac3f2` on `main`, annotated tag `v0.12.0` (same commit), GitHub
   release ***Latest*** with `avalonia-designer-0.12.0.vsix` (1,243,932 bytes, 118 files, sha256
   `7817b7c33051aaaf97a99d8a36a581dd6bfe9d6c1e540da70e0c071b482e46b6`). The attached asset was downloaded
   again and `cmp`-ed: byte-identical.
2. **The Marketplace upload is the developer's step** (publisher portal, `PUBLISHING.md` — the 0.12.0 block
   carries the artefact, the hash and a gallery query to confirm it afterwards). **The stable listing turned
   out to carry `0.11.0`, not `0.11.15`** — nothing between `0.11.1` and `0.11.19` ever reached it — so this
   single upload also brings the whole 0.11 chart line up to date, and the ledger's earlier "carries
   `0.11.15`" lines are corrected in the 0.12.0 block.
3. **A real printed page and a real PDF from the user's own app** are still unverified by them — the page is
   the size of the control, so the paper view is worth one look (their rule: they run the app).
4. **`host/ModelHost`** still restores LLamaSharp natives for every platform (the last place hundreds of
   megabytes can appear) — untouched on purpose.

## Where the last session left off (2026-09-24, ninth session — 0.11.19)

**The previewer now builds for one platform, not twenty-six.** Asked in the shape of a question — *"Would it
be feasable to extract the charting control from the designer extension and make it a plugin? … this
extension byte size is getting very large"* — and answered with measurements rather than agreement: the
charts are **793 KB** of a **583 MB** install, so a plugin would have saved nothing.

**What went in** (full detail in `CHANGELOG.md` `[0.11.19]` and `NOTES.md` §150):

- **What was actually large:** `host/PreviewerHost.csproj` had no `RuntimeIdentifier`, so `host/bin` collected
  SkiaSharp natives and debug symbols for **every** platform — **578 MB**, 304 MB of it `.pdb`. The extension
  builds that host on the *user's* machine, so each installed copy grew to **583 MB** (six copies: 3.5 GB).
- **The fix:** the SDK's portable RID (distro RID as fallback), `SelfContained=false` (unchanged runtime
  behaviour), `AppendRuntimeIdentifierToOutputPath=false` — found the hard way, the T1 layer failed with
  `ENOENT` because a RID moves the output into `…/net8.0/<rid>/` — and the natives' symbols dropped after the
  build, in both layouts (a Windows cross-build still carried 124 MB until the flat `lib*.pdb` were matched).
  **578 MB → 24 MB**, identical on `linux-x64` and on a `-r win-x64` cross-build.
- **The old copies were deleted too:** this machine's six installed versions went from **3.5 GB to 29 MB**,
  verified by starting the pruned host and rendering a chart with it (the four-slider legend came out right).
- Six new pins in `packaging.test.js`; suite **8,100 passed / 0 failed**; PROBLEMS clean.
- **`host/ModelHost` is deliberately untouched** — the optional local-AI server still restores LLamaSharp
  natives for every platform, and is the one remaining place hundreds of megabytes can appear.

**Two things to know before continuing:**

1. **A RID build is per-machine by design** — it is resolved where the build runs, which is always where the
   previewer will run (locally, or inside WSL/remote/dev-container). Never set a fixed RID in the csproj:
   Windows users would then get Linux natives.
2. **A hand-pruned install stays pruned** until a new version is installed, because the extension only
   rebuilds the host when a host *source* is newer than the binary.

## Where the last session left off (2026-09-24, eighth session — 0.11.18)

**The height ramp was following the depth too, and the surface got its own controls.** Two field reports
plus four requests, all in one afternoon, and the release that carries them.

**What went in** (full detail in `CHANGELOG.md` `[0.11.18]` and `NOTES.md` §149):

- **The temperature ramp mixed the height with the depth** — *"the color gradient (temperature) should only
  apply to the y-axes … the z-slices also apply the gradient"*. A per-band gradient was laid along the
  *projected* height axis, and a point of a band stands at its own depth, so the same value came out at a
  different colour per band (a flat plate spanned 0.66…0.97 of the ramp at elevation 31). A band is now CUT
  into `levels` horizontal slices and each level is filled with its own blend, so the colour is a function of
  the value alone.
- **A triangle at the ramp's MAXIMUM was never filled** — the *"tops of the corrugated sheet are open"*
  report: `first` was clamped at the low end only, so the crest of a sheet reaching the scale's ceiling was a
  line of background (measured 0 → 9,482 sheet pixels at value 25 of 0…25).
- **The palette popup opened half off-screen** — anchored at the trigger's top-left with a clamp whose 8px
  floor won, plus a stylesheet `min-width` outranking the injected `max-width`.
- **`ZoomX` / `ZoomY`** (1…100 % of the fitted size, ranges untouched) **and two more legend sliders** for
  them, the four packed 26px apart (they were 34px), each zoom carrying ONE handle.
- **Pointing a 3D chart at a page loads the whole dataset**: a new host verb (`sheetShape`) reports the
  page's used range, and the form gets one bare `<charts:XYSeries/>` per data column — for the waterfail too,
  with an authored list never touched and a stale slice window cleared.
- **Legend on/off in the chart's right-click menu** (the tick in the item's label, since menu ticks need
  Avalonia 11.1).
- **The stale-copy class closed for good**: *"the new sliders is rendering in the designer preview but not
  during runtime"* — a *drawing* change adds no marker token, so it was invisible. Every bundled file now
  carries `BUNDLED-COPY: <version>` and staleness is a **content comparison** with the copy the extension
  ships; `avaloniaDesigner.bundled.autoUpdate` (off by default) makes the refresh silent.

**Three things to know before continuing:**

1. **Preview versus app is always about the FILE, not the feature.** The preview draws the host's copy of a
   bundled file, the app compiles the project's. Compare the two files first (they now carry the release in
   their header) before believing a bug in the chart code.
2. **A change inside an existing bundled type still needs a reason to be noticed** — with the content rule,
   "differs from the shipped copy" is that reason, so a project's copy is refreshed as soon as the extension
   ships a different file; hand-written helpers are still never touched.
3. **The zoom can only make the picture smaller** (100 % is the fitted size), because the plot box clips
   whatever it is asked to draw — the same reason the uniform `Zoom` row behaves as it does.

## Where the last session left off (2026-09-24, seventh session — 0.11.15)

**The width window is a cut, not a squeeze.** A reported follow-up to `0.11.14`, fixed the same day.

**What went in** (full detail in `CHANGELOG.md` `[0.11.15]` and `NOTES.md` §148):

- **Dragging the X slider in a running app grew two false panels** at either end of the sheet, perpendicular to
  it and apparently stationary while the window moved. Cause: `SurfaceWorld.UnitX` **clamps**, so every sample
  outside the window was drawn *at* the window's edge, piling each slice's off-window samples into a vertical
  line there; the band fill between two slices became a flat slab. The designer never showed it because a saved
  form has no `MinX`/`MaxX` — the window *is* the data's range.
- **The samples are now CUT to the window** (`CutToWindow`), with the window's own edges interpolated so the
  sheet ends exactly on the edge, and a segment that jumps clean over a narrow window contributing both edges.
  The **height** (Y) window keeps its clamp: there, flattening onto the ceiling/floor is the documented
  behaviour.
- **Two measurements worth keeping**: with no window the render is **pixel-identical to the pre-fix build**
  (0 of 128,800 pixels), and the new regression needs no reference image — the same chart at the same window
  over two datasets differing **only outside** the window must be pixel-identical, with the no-window pair as
  the control that proves the measurement can fail.
- **The marker moved again: `BandTriangle` → `CutToWindow`** (a drawing change in an existing type, no property
  touched), so a project holding the `0.11.14` chart is offered **Update now**.
- **A useful negative result**: before finding the clamp I checked the §144 hypothesis — that the designer's
  programmatic builder and the app's compiled XAML disagree — by building a scratch compiled-XAML project: the
  two renders are **pixel-identical** (0 of 114,400), so the difference had to be *state*, not implementation.
- **Docs**: `CHANGELOG` `[0.11.15]`, `USER_MANUAL` §19.13 (the width window cuts, the value window is a scale),
  `README` version refs, `TEST_PLAN.md` §10, `NOTES.md` §148, `SESSION`, `PUBLISHING`.

**Two things to know before continuing:**

1. **A position window cuts; a value window scales.** If a future report sounds like "data piled up at the edge"
   of a chart, look for a `Clamp01` on a *position* axis first — and remember the Z window drops whole slices,
   which is a third flavour of the same idea.
2. **`CutToWindow` is the staleness marker**, so the next drawing change in `GrumpyCharts` must move it again
   (the marker is *the newest token the shipped file has that an old copy lacks*, and a private helper's name is
   a perfectly good token when no property changed).

**State at hand-off:** suite **7,941 passed / 0 failed**; host, generated C# project and the VB matrix 0
warnings / 0 errors; `package.json` = `0.11.15`; VSIX packaged, audited and installed locally, tagged and
released on GitHub.

## Where the sixth session left off (2026-09-24, sixth session — 0.11.14)

**The surface chart 3D ships, and the reason its bands showed the plot's backcolour is fixed — in both
halves.**

**What went in** (full detail in `CHANGELOG.md` `[0.11.14]` and `NOTES.md` §147):

- **The seventh chart type**, `charts:GrumpySurfacePlot` (built 2026-09-23/24): one spreadsheet **column per
  slice** along the sheet's length over a **shared X column**, the Z of a slice from **Z Row** or **Z Start**
  / **Z Step**, styles **GridMesh / GridMeshSolid / Solid**, colouring **Sampleset** or a **Temperature**
  ramp with **Heat Min/Max**, **Solid Opacity**, the mesh rows, the view (**Elevation / Azimuth / Z Spacing /
  Zoom**, drag to turn), **Show Base** / **Base Colour**, and a **range-window legend** whose second slider
  picks the **slices** on show (the view re-fits, so a selection zooms). Both twins, toolbox, Properties,
  help text, preview.
- **The fold fix**: a band was filled as **one closed figure**, and a figure that crosses itself has two loops
  wound opposite ways — `NonZero` sums them to zero, drops the fill, and the plot's own backcolour shows
  through. It is now **one triangle pair per sample pair**, every triangle wound the way the band started.
- **The half that made it reach users**: the app compiles the *project's* copy, and the staleness check only
  looks for the marker token — which was still `GrumpySurfacePlot` on a copy that had a *different* drawing.
  The marker moved to **`BandTriangle`**, so **Update now** is offered again.
- **An unused O(n²) crossing scan** (computed and never used) went out with it: **966 ms → 42 ms** per render
  on a 6 × 2048-point sheet.
- **Docs**: `CHANGELOG` `[0.11.14]`, `USER_MANUAL` §19 intro table + **§19.13**, `CONTROLS.md`,
  `README.md` §7 (seven charts) + version refs, `TEST_PLAN.md` §10, `NOTES.md` §147, `SESSION`, `PUBLISHING`.
- **Housekeeping**: the unused `xlsx` npm dependency is gone (VSIX 5.29 MB → ~1.2 MB) and `repository.url` is
  a plain `https://` link again.

**Three things to know before continuing:**

1. **A form never carries a fill attribute for the surface** — the fill is the *drawing*, not a property: the
   styles are `Style` alone. A project whose bundled chart predates this release compiles fine and simply
   draws the old (hole-riddled) picture until the copy is refreshed, which is why the marker moved.
2. **The Z window's second slider counts slices, not values** (`"Z 3…4 of 6"`), and the view **always
   re-fits** to the window — so "a narrower window draws fewer pixels" is false by design. If a test or a
   measurement ever says otherwise, it is measuring the wrong thing (see §147 for the two ways it did).
3. **The staleness marker is the newest token the shipped file has**, and for a drawing-only change that can
   be a private helper's name. Moving it is the only mechanism that reaches projects already carrying the
   previous marker.

**State at hand-off:** suite **7,931 passed / 0 failed**; host, generated C# project and the VB matrix 0
warnings / 0 errors; PROBLEMS clean; `package.json` = `0.11.14`; VSIX packaged, audited and installed locally.

## Where the fifth session left off (2026-09-23, fifth session — 0.11.12)

**One new chart, and one feature deliberately not shipped.**

**What went in** (full detail in `CHANGELOG.md` `[0.11.12]` and `NOTES.md` §146):

- **The waterfall chart** (`charts:GrumpyWaterfallPlot`, the sixth type): one spreadsheet **column per
  sampleset** (a sweep, a run, a pass), stood behind the next and joined by a mesh; its own projector with
  **Elevation / Azimuth / Z Spacing / Zoom** and drag-to-turn; **Ribbon / Translucent / Lines** styles;
  **Sampleset / Value (heat map) / Split** colour modes with a heat range and a split value; the mesh rows
  (`ShowConnectors`, colour, thickness, `ConnectorStep`); `MaxPoints` thinning with one stride for every set;
  no cursors, by design. The series editor lists the sets, each row carrying a **Z Column**.
- **The filled surface between the sets was built and then removed again, by hand.** `SurfaceFill` ("Fill The
  Roof"), `SurfaceColor`, `SurfaceOpacity` and `SurfaceToFloor` ("Block Walls") existed for a day — with a
  solid terrain block, a mesh-tiled roof and finally a flat-shaded quilt — and are **not in this release**:
  the open corridors are what the chart is for. Roughly 106 of its assertions went out with it (7,655 → 7,549).
- **Docs**: `USER_MANUAL` §19.12, `CONTROLS.md` (table + property list), `README` §7 (six chart types, version
  `0.11.12`), `CHANGELOG` `[0.11.12]`, `TEST_PLAN.md` (the new files and the marker's whole journey).

**Three things to know before continuing:**

1. **A form must not carry the removed attributes.** Any `.axaml` written during the experiment with
   `SurfaceFill="True"` / `SurfaceToFloor="True"` will no longer compile against the current chart — those
   four attributes are gone (`ChartTestCS/MainWindow.axaml` was cleaned up; a backup sits next to it).
2. **The staleness marker is back to `IsFilled`** (it walked `SurfaceFill` → `SurfaceToFloor` → `RoofVertices`
   → `RoofVertex` and came back down). A project refreshed during the experiment keeps the extra code and is
   *not* reported stale — harmless, since the panel no longer offers the attributes and no saved form asks for
   a fill. A marker cannot name a feature that no longer exists; see `NOTES.md` §146.
3. **The rain rule is measurable and worth keeping in mind**: at `Elevation="89"` each screen column is a line
   of falling water, so "no water reaches the floor" is counted per column. The filler surfaces are gone, but
   the technique is in `NOTES.md` §146 for the next projected picture that has to be sealed.

**State at hand-off:** suite **7,549 passed / 0 failed** (compliance re-audit clean), PROBLEMS clean, host and
the VB matrix build 0/0, `package.json` = `0.11.12`.

## Where the fourth session left off (2026-09-21, fourth session — 0.11.11)

**The whole chart line is released together:** `0.11.3` … `0.11.11` were all built and installed on this
machine during the day and go out as **one** version, because the Marketplace and the GitHub tag carry the
same number and it only ever goes up.

**What went in** (full detail in `CHANGELOG.md` `[0.11.11]` and `NOTES.md` §145):

- **Three new chart types** — Bar (Grouped / Stacked / Stacked100), Area (Plain / Stacked / Stacked100)
  and Pie (with a doughnut hole) — each with the full editor set, plus a **Slices** editor for the pie and
  category names read from the spreadsheet's X column. Both twins, toolbox, properties, help text and the
  designer preview.
- **The Data Selector editor** on every chart: the **source** (Spreadsheet, or Data Files — a picker whose
  file is remembered but not read yet), the **workbook**, and the **page**, listed from the workbook's own
  sheet names. `SourceSheet` resolves a page through the workbook's rels, so a reorder in Excel keeps the
  chart on the same sheet.
- **The fixes that came with them:** axis colours now show in the preview (`Nullable<Color>` was skipped by
  the host's converter); a stale bundled helper is offered on *open*; and the code check stopped reporting
  a chart's axis **title** as an invalid control name.
- **Sample data** in `TestExtApps/GrumpyCharts.xlsx`: one page per new chart type, laid out the way the
  charts read by default.

**Two things to know before continuing:**

1. **The one bug that took three releases** was a webview dropdown showing the letters "p" and "a": the
   option list was plain strings where `labelledSelect` expects `[value, label]` pairs. `NOTES.md` §145 has
   the full post-mortem, and `tests/t2-logic/dropdownOptions.test.js` now runs the real helper in a
   stand-in DOM so it cannot come back.
2. **The staleness marker moved to `SourceSheet`.** An existing project's bundled `GrumpyCharts` copy is
   refreshed when the designer opens a form and offers **Update now** — accept it before expecting the new
   chart types or the page selector to compile.

**State at hand-off:** suite **6,946 passed / 0 failed**, PROBLEMS clean, host and a generated VB project
build 0/0, `package.json` = `0.11.11`, VSIX packaged and audited, tagged and released on GitHub, and the
Marketplace upload prepared (`PUBLISHING.md`).

## Where the third session left off (2026-09-21 — 0.11.2)

**Released: `0.11.2`** — *the chart gets its own colours: a gradient background, three axis colours, a reading
you can always read*. Four appearance requests in one breath: the cursor readout must always be **white on
black** (with the border and the series line still taking the selected series' colour), the axis pickers must
split into **three independent colours** (line, tick labels, name), the chart must take a **gradient background
brush** built from Avalonia's `LinearGradientBrush` / `RadialGradientBrush` / `ConicGradientBrush`, and the
spreadsheet **file picker must move into the chart's right-click menu** with its **Browse Button row removed**
from the Properties list.

- **The gradient is real brush XAML**: `PlotBackBrush` (a `Brush` on `ChartBase`, in both twins) written as a
  property element with three stops (start, middle, end; the middle is optional), an angle for the linear kind,
  corner-to-corner diagonals or a compass direction at 0°/90°/180°/270°. With a brush set the plot area is not
  re-filled — that would map a second, compressed copy of the gradient onto it. **None** removes the element
  and gives the backcolour back; the editor reads a hand-written brush back too.
- **`ShowBrowse` survives as a no-op.** The **"…"** button is gone from the surface *and* from the running app
  (the right-click menu carries *Choose spreadsheet…* in both), but the row is kept in the two twins so a form
  saved by an earlier version still compiles — removing the property would have broken every one of them.
- **The discovery of the session, and it was a real bug:** the preview renders through the host's
  **programmatic builder** — not through the runtime XAML loaders — and that builder had never read a *property
  element* other than the ones it was taught (`.Cursors`, `.XAxis`, `.YAxis`), so the gradient was invisible in
  the designer while the built app showed it perfectly. Chasing it turned up an older one underneath:
  `Brush.Parse` returns an **immutable** brush, a property typed `Brush` (**not** `IBrush`) refuses it, and the
  builder's per-property `catch` swallowed the exception — so **any** `Brush`-typed attribute
  (`PlotBackBrush="#FF0000"` among them) had silently kept its default in the preview, for as long as Brush
  attributes have existed there. Both fixed in `host/XamlRenderer.cs` (`ReadBrush` + a mutable-brush
  conversion).
- **`GrumpyCharts` staleness marker → `PlotBackBrush`.** A gradient is the first such thing the editor writes
  as a *property element*, which no older copy of the bundled file can resolve at all.
- **Tests 6,437 / 0** (+131 from 6,306; **6,484** with a forced full control re-audit):
  `t2-logic/chartAppearance` 100 with both twins, the editor seams and real write/read/clear round-trips,
  `t1-preview/chartAppearance` 13 measured in pixels, `bundledComponents` +2 for the moved marker, and the
  rest from **stale** assertions these four changes invalidated in the existing chart files.
  The pixel file is the one that earned its keep: it proves what one sample never can (two plate points
  **differ** under a gradient where a plain colour makes them **identical**) and it is what exposed the host
  bug. Lessons recorded there: a radial brush gives its four corners the same colour by construction, and the
  plate margin *above* the plot (y=4) is where a colour can be sampled without catching a gridline — a strip
  8 px lower reported 29 shades for a single flat colour.
- **Docs updated** (rule 7b was lifted for this request): `CHANGELOG` `[0.11.2]` (+ the 0.11.1 entry's
  "…"-button sentence annotated as since-moved), `README` (version refs + the §7 chart paragraph),
  `USER_MANUAL` §19.2/19.4/19.7/19.8, `CONTROLS`, `TEST_PLAN` (+ its 0.11.2 subsection), `tests/README`,
  `NOTES` §144, `SESSION`, `PUBLISHING`. The `GrumpyCharts.cs` header comment that still promised a "…" button
  was corrected in the same pass.
- **Open for the next session:** the Marketplace carries **`0.11.0`**; `0.11.1` and `0.11.2` are both
  un-uploaded, and **`0.11.2` is the file to upload** (portal *Update*, *Pre-release* unchecked, confirm with
  `flags: 914`) — 0.11.1's number is spent, so uploading 0.11.2 covers everything in both.

## Where the second session left off (2026-09-20, 0.11.1)

**Released: `0.11.1`** — *the chart frame gets its own room, and the spinner boxes line up*. Two small requests
closed the day out. **`Padding`** is a new chart property (`Thickness`): the space between the chart's border
and everything it draws inside — the title, the legend bar and the plot area with its axis furniture. The border
itself does not move and the chart's backcolour still reaches it, so the band it opens is chart rather than
form; `LegendMargin` (0.11.0) is its sibling one level in (that one is *inside* the legend frame). The second
request was the Series editor's number fields: **Line Thickness** and **Marker Size** rendered 204 px wide with
their right edge 35 px past every other field, because a number input's automatic minimum size — the spinner
included — beat the 64 px flex basis; they now share the text/select rule and end flush at 169 px.

- **`GrumpyCharts` staleness marker → `Padding`.** A new *attribute* is as invisible to an old project copy as a
  new type, and compiled XAML rejects it — so saving the form refreshes that project's bundled file.
- **Tests 6,306 / 0** (+85 assertions: `t1-preview/chartPadding` 24, `t2-logic/chartPadding` 56,
  `bundledComponents` +2, the CSS guards +2, T5 audit +2). The T5 audit re-checked **both charts by itself**
  because their property list changed and applies `Padding="6,6,6,6"` through the real writer in both twins.
  With `AVALONIA_COMPLIANCE_RESET=1` the total is **6,308** — the audit skips a control it has already verified
  (cache: the gitignored `tests/compliance.json`).
- Both twins compile 0/0 — the host at 12.1.1, a probe at 11.0.10 and the VB twin under `Option Strict On` at
  12.1.1, each with `Padding="10"` and `Padding="4,8,4,8"` used in a real form.
- **Docs updated** (rule 7b was lifted for this request): `CHANGELOG` `[0.11.1]`, `README` (it still claimed
  `0.10.11` in three places, which the `0.11.0` docs pass had missed), `USER_MANUAL` §19.7 (`Padding` row),
  `CONTROLS`, `TEST_PLAN` (+ its 0.11.1 subsection), `tests/README`, `NOTES` §143, `SESSION`, `PUBLISHING`.
- **Open for the next session:** the Marketplace carries **`0.11.0`**; `0.11.1` is the file to upload (portal
  *Update*, *Pre-release* unchecked, then confirm with `flags: 914`). The root `avalonia-designer-0.11.0.vsix`
  is a **local rebuild** of that version — different bytes from what was published — and the published bytes
  (`3d913e3d…`) exist only on GitHub/the gallery. The Series-editor layout harness lives at
  `tests/out/field-harness.html` (gitignored) if a future field needs the same check.

## Where the first session left off (2026-09-20, 0.11.0)

**Packed for publication and installed: `0.11.0`** — *the cursors belong to their series, and the charting tool
is written down*. The code change is one sentence from the user: *"the cursors must inherrit the color of the
series that it is following"* — a cursor whose **Follow trace** is on is now drawn (its lines, the handle at
its crossing and its whole readout panel) in the traced series' colour, so a reading is tied to its line
without reading the name, and its own **Colour** row applies to a free crosshair / threshold line.
`CursorColor(cursor, trace)` is the one place the rule lives and `DrawnColor` carries it to the panel; **the
`GrumpyCharts` staleness marker moved to `DrawnColor`**, because a project keeping an older bundled file would
have kept the old picture and looked like a fix that never arrived. The same release writes the charting tool
down in full — `USER_MANUAL` §19.8 (cursors, with the tips moved to §19.9), `CONTROLS.md`, `README.md` §7 —
and the README now opens with the **PayPal donation link** (*"If you enjoy using this extension, please
contribute and consider making a donation."*), which the Marketplace listing shows too. **The extension was
renamed the same day** — *Avalonia Designer for VS Code* → **Grumpy's WYSIWYG Designer for VS Code** — display
name only: the id, the settings keys, the keybindings and the 4.4 GB model folder are untouched, so nothing has
to be reinstalled or migrated, and the README keeps one *"Formerly …"* line for people who know the old name.
Suite **6,197 passed /
0 failed** (was 6,153), PROBLEMS clean, both twins 0/0 on Avalonia 12.1.1 and 11.0.10, and the VSIX is
`avalonia-designer-0.11.0.vsix` — 1,046,409 bytes, sha256 `3d913e3d…`, audited (a local project name in a
shipped comment was caught and scrubbed *before* packaging). Read `NOTES.md` §142.

**Previously: `0.10.11`** — *the prompt is written where you are, and the
extension can chart your data*. Two feature sets in one version. (1) The AI-assist prompt is now typed **in the
editor, at the caret**, between two marker comments and sent by a code lens (`Ctrl+Alt+Enter`), because neither
`showInputBox` nor the Comments API could put a multi-line box where the caret is. (2) **The charting tool** —
the reason the number grew: two **self-drawing** controls, `GrumpyLinePlot` and `GrumpyXYPlot` (no package, no
chart engine), fed by an `.xlsx` workbook you point at (an absolute path, re-read on save) or by typed-in
values, with four editors in the Properties panel: **Series** (one line per series, its own columns, its own
axis), **Axis** (sides, ticks, labels, per-series scales), **Legend** (a bar whose entries switch traces on and
off) and **Cursors** — up to two draggable cursors with a value readout, *follow trace* keeping the crossing on
the selected series, `←/→` stepping one sample, `↑/↓` choosing the trace, a right-click menu for on/off, readout
placement and copy, and a `ΔX`/`ΔY` row once both are on. Suite **6,153 passed / 0 failed** (1,221 of it the
chart work). Tag `v0.10.11` → `0512884`, GitHub release live and marked *Latest*, VSIX
`avalonia-designer-0.10.11.vsix` **1,035,659 bytes**, sha256 `20cfa4ce…`, installed locally. **Not yet uploaded
to the Marketplace** — the listing still carries `0.9.4`. Read `NOTES.md` **§141** before touching the charts:
VB `[Long]`/`[Short]`, `MenuItem.IsChecked` missing on 11.0, pixel tests that need a stated measurement box,
the Excel `FileShare` refusal, and why a bundled file needs a real *project* probe (12.1.1 **and** 11.0.10) to
be validated at all.

*`0.10.6`…`0.10.10` were the AI-assist weeks — the model picker, the Code Fix loop and its triggers, the
DataSet facts, the build-driven repair, the 30B step-up. They are recorded in `CHANGELOG.md` and `NOTES.md`
§135–§140 rather than here.*

**Previously: `0.10.5`** — *two choices a novice can read, and a step up when they are
not enough*. The picker is now the 7B **twice** — GPU (Vulkan) as the default, CPU-only as the fallback, over
**one** 4.4 GB download — with everything else folded under *Advanced…*; and when a **Code Fix…** run ends
without a clean build the extension **asks** before unloading the 7B and starting the user's 30B unit, narrating
every step (unload, start, weights with the seconds counting, retry once). Suite **4829 passed / 0 failed**
(`bigModel.test.js` is new, 31 assertions). The four models that measured badly — the 3B, both DeepSeeks and
Gemma — are gone from the table *and* from disk: **22 GB → 4.4 GB**. Read `NOTES.md` §134.

**Previously: `0.10.4`** — *the button that refused silently now says why*. Reported
minutes after `0.10.3`: *"The Remove Model function is not removing the selected model."* It was **refusing**: only
`bundled:<id>` selections were ever accepted, the selection is usually a server entry, and a refusal logged
nothing at all — so the attempt left no trace anywhere (the log's only removal line was gemma, at 14:56:58).
`resolveRemoveTarget()` now resolves any selection to the file behind it, deleting it only inside the extension's
own model folder and refusing anything else **by naming that folder**; Hub-added models became removable (they
were looked up in the pinned table alone); the button greys itself out with the reason as its tooltip. Suite
**4810 passed / 0 failed** (`removeModel.test.js` 40 → 69). Read `NOTES.md` §133.

**Previously: `0.10.3`** — *the server you already had becomes something you can see and
control*. Suite **4781 passed / 0 failed** (was 4707), PROBLEMS clean, VSIX packed and installed. It answers the
question the user asked while comparing their two local runtimes — *"I don't know who started the llama server
(could have been me!)"* — with **Start / Stop** controls for their own `llama-server` in ⚙ Settings → AI assist,
the owner line (unit, scope, uptime, pid, enabled at login) in the panel and in the status dialog, and a stop that
always asks first. Read `NOTES.md` §132 before touching `src/llamaService.ts`. `0.10.2` was tagged and released
the same day but **never uploaded**, so `0.10.3` supersedes it and is the file to send to the Marketplace (the
listing still carries `0.9.4`; one number everywhere, and `0.10.0` never went out either).

**Also true of that session:** the extension's own bundled runtime was found **broken** — started from a temp copy
of the extension whose folder had been deleted, so `/health` said `loaded:true` while every request failed with
`Could not load file or assembly 'Microsoft.Extensions.Logging.Abstractions'`. Killed, rebuilt in the installed
folder, restarted (4.3 s to load). An extension **update** replaces that folder while such a process lives on, so
the same breakage is reachable in the field — see `NOTES.md` §132 for the two candidate fixes.

**Previously: `0.10.2`** — the release that makes the project's own build the referee
of the code check, and then fixes the two reasons the referee could not get the repairs done. Suite **4707
passed / 0 failed**, PROBLEMS clean, VSIX packed, tagged `v0.10.2`, GitHub release live, installed locally.
`0.10.1` was tagged and released the same day but **never uploaded** — `0.10.2` supersedes it, and it is the
file to upload to the Marketplace (one listing version, `0.10.0` never went out either).

- **The last hour of the session was a live bug hunt on the user's own app**, and it is the most useful part of
  this log: the assistant wrote `DataGrid1.Items.IndexOf(selectedItem)` for a ComboBox bound to a *column*
  (`CS1061`, and WPF's API name), the checker found **nothing** on that file, and the repair loop then refused to
  ask any model — because the guard knew only the built-in runtime (dead after a reload) and the configured
  endpoint (LM Studio's 1234, nothing listening), while the model answering everything was the user's own
  **systemd `llama-server` on 8080**. Fixed in `repairRuntime` (three runtimes, the third one found by probing)
  and in the prompt (`src/dataSetFacts.ts` now tells the model what the form is bound to). Both are written up in
  `NOTES.md` §131 — read that before touching either area.
- The three answers the user gave for the loop's design are the architecture now: rules first, the model only
  when it is **already running**, a build on the way back from the editor for hand/AI edits, designer-made edits
  stay instant, and what cannot be fixed is listed rather than guessed at.

- **The complaint it started from** was *"Code Fix… does not pick up syntax (or any other) errors"* after
  removing a `;` by hand. Diagnosis: **not a regression** — no semicolon rule ever existed, and the syntax rules
  are structural (they count braces), so a missing `;` is invisible to them while `dotnet build` refuses the
  file. The answer was not more rules: `src/buildDiagnostics.ts` parses the compiler's own output.
- **The strategy the user set** for the next phase, which is now the architecture: *"The system must check for
  errors by running a build when it is done refactoring the code, then Code Fix must check for compile errors
  and fix each one, one at a time untill the build is clean"* — rules first, then the AI **only when it is
  already running**, hand/AI edits build on the way back to the designer, designer-made edits stay instant, and
  what cannot be fixed is listed. `src/repairLoop.ts` is the pass logic (vscode-free, 77 assertions with fakes),
  `src/writeStamp.ts` is how a hand edit is told apart from a designer write.
- **Two decisions taken with the user against their own first draft**, both because the literal rule would have
  broken their own machine: the AI gate uses **available** memory (their box: 28 GB total, integrated APU — the
  one that runs a 3B model in 602 ms), and a greyed-out section always offers **Use it anyway**.
- **Still open:** the `0.10.0` Marketplace upload (publisher portal, `PUBLISHING.md` part E) — and now `0.10.1`
  is a local build too, so both are in the same queue unless the user uploads them together.

## Where the session before left off (2026-09-16)

**Released and installed: `0.10.0`** — the release that carries the whole `0.9.5` → `0.9.46` line (the AI
assist and everything it forced) to the Marketplace as **one version number**, *plus* everything from the
2026-09-15 marathon (§100–§118 in `NOTES.md`, `TEST_PLAN.md` §10, `CHANGELOG.md`). The `.vsix` is built and
verified; **the upload is the developer's** (publisher portal, `PUBLISHING.md` part E).

- **0.10.0 — the version scheme collapsed to one number.** `package.json`, the git tag and the release title
  all carry `v0.10.0`/`0.10.0`; the dual `v1.0.0-beta.N` tag beside a `0.9.x` listing version is gone from every
  current-facing document (README, USER_MANUAL, the CHANGELOG's scheme note, PUBLISHING's rules and part F), and
  the shipped-as-beta history is kept exactly as it shipped. The listing's `description` and keywords now say
  what the extension became: an optional **local** AI assist. `PUBLISHING.md` holds the local `sha256` and the
  paragraph to replace once the gallery serves `0.10.0`.

- **0.9.46 — the ⚙ panel says what it is waiting for.** Reported as *"it takes a while to load and start the
  server … show a loading message"*, and the user's description was literally right: the panel's state call
  runs LM Studio's `lms`, whose **first** invocation of a session starts LM Studio's service — the first
  `discover()` blocked **4270 ms** with the service processes appearing 3 s into it (probe 18:18:37, service
  18:18:40), while every call after that is ~220 ms. A line now appears **before** the round trip
  (`looking for local models…`) and is cleared by the state that arrives; every state request goes through one
  helper, and a test asserts exactly one call site is left. The mirror-image wart went too: `checking…` used to
  stay on screen forever, and the status answer now clears *that exact line* — never a failure text or a quiet
  refresh. §129.

- **0.9.45 — the built-in runtime can use the GPU, when you ask it to.** The queued item was *"Vulkan as an
  OPT-IN backend for the bundled llama.cpp runtime, CPU by default with fallback"*, and two probes settled the
  shape before any code was written: LLamaSharp's Vulkan package really does run on this machine (a 3B Q4 model
  loaded in **602 ms vs 1409 ms**, `offloaded 37/37 layers` to the Radeon 760M), and the `device lost` abort that
  made this opt-in was *LM Studio's* build with the 17.7 GB model — it did not reproduce. So: **one binary**, two
  native backends, chosen by `--backend cpu|vulkan`, always referenced (no second build to go stale); the
  setting `assistant.bundledBackend` plus **AI: Built-in Runtime Backend…**; the extension reports the build
  llama.cpp **actually loaded** (`/health` carries it, read from llama.cpp's own log lines as they arrive — the
  first version read them from a trailing buffer and reported CPU for a Vulkan run); a failed Vulkan attempt is
  retried **once** on the CPU, logged, and offered as a permanent switch. §128.

- **The ⚙ Settings dialog now fits at 1024×700** (the second queued item, and the 0.9.44 follow-up): re-measured
  in Chromium with the *real* per-model hint rather than the static markup, which corrected 0.9.44's own number —
  the worst case was **54 px** behind the scroll, not 46. House rules at **3 rows** (−18 px) and a tighter
  rhythm inside this dialog only (−36 px) put the content at **689 px → 0 px hidden**, House rules visible.
  Only this dialog changed.

- **0.9.44 — the ⚙ Settings dialog uses the window it is in.** Asked as *"it needs a few lines of height to be
  added"*, and this panel's height has now been reported twice — so it was **measured** instead of guessed:
  `python3 tools/measure-settings-panel.py` writes `tests/out/settings-measure.html` (the real `#settingsModal`
  markup + the real `media/designer.css`, VS Code theme variables faked) and exposes `window.__measure()`.
  With the AI section expanded the content is ~736 px, so 1440×900 fits, **1024×700 hid 82 px** (the last ~4
  rows — the House rules box) and 1000×520 hid 262 px. The dialog is now capped to `calc(100vh - 8px)` (the
  shared `.modal-box` still stops 28 px short) with a tighter rhythm inside (10 px padding, 6 px hint gaps,
  2 px section heads) — ~3 rows gained, only this dialog. Lesson recorded in §127: **a floor (`min-height`) is
  the wrong tool here** — the Save row is `position: sticky` and last in flow, so a floor leaves dead space
  *below* the buttons (measured: box 658 px, row 281 px).

- **0.9.43 — house rules: the model writes like the code around it.** The honest replacement for "train it on my
  code" (§124 said no to fine-tuning): the idioms your code already follows, **measured** from up to 40 of the
  project's C#/VB files and put in every prompt. *AI: Learn the House Rules from My Code…* (and the button in
  the ⚙ panel) counts indentation, brace style, member visibility, `static`/`Shared`, handler naming and — for
  VB — `Handles` vs `AddHandler`, then offers only what cleared two gates: **5 examples agreeing 80 %**, with
  the evidence on every suggestion (`5 of 5 C# members`). A 50/50 codebase gets no rule at all, and rules are
  counted per language so a C# project is never told to use `Private Sub`. The rules are an optional prompt
  part (given up after the member list, before the style sample), edited in the ⚙ panel one per line, empty by
  default. §126.

- **0.9.42 — your own `llama-server`, started from the editor.** The engine the user actually prefers
  (*"models served by the Llama.cpp server respond faster and better than the LM Studio models"*) is now one the
  extension can run: **AI: Start My llama-server…** finds the binary (the usual build folders, PATH, or a path you
  set), asks which `.gguf` to serve, shows the context/threads/GPU-layers it would use with the reason for each,
  waits for llama.cpp's own `/health` to say the weights are in RAM, and proves it answers before saying *Ready*.
  **AI: Stop My llama-server** stops the one it started; the panel has a *My own llama-server* entry with the
  same Load/Unload behaviour as the built-in runtime; `llamaServerPath` and `llamaServerArgs` are the two
  settings. The design is shaped by what this machine turned out to run: the developer's own server is a
  **systemd user service on port 8080** (a 30 B Qwen3-Coder, `--alias qwen3-coder-local`), so **an already-running
  llama-server is detected and offered instead of duplicated** — loading a second 17 GB copy is the one thing this
  feature could do that its own author would never forgive. A server this window did not start is never stopped,
  and the status report says so out loud. Fixtures are the real answers captured from that service
  (`version: 10365 (9afff1b74)`, `200 {"status":"ok"}`, `owned_by: "llamacpp"`, `/props → model_path`), with LM
  Studio's answers as the negative pair. §125.

- **0.9.41 — a model of your own, and no default program.** *AI: Add a Model from Hugging Face…* takes a model
  page or file URL, lists the repo's `.gguf` files with their sizes, and reads the size and SHA-256 from the
  Hub's own answer before downloading it through the same verified pipeline as the pinned five; the added
  model is an ordinary spec, so the picker, the load path, the hardware gate and Remove Model treat it
  identically. The picker is also regrouped — own runtime, then a server you run, then LM Studio, then loose
  files — after the user found a llama.cpp server answered faster and better than the LM Studio models. LM
  Studio was *not* removed: there was no dependency, and its GPU engines are the only ones this machine has.
  §124.

- **0.9.40 — the Code Fix checks generated code.** Five deterministic rules for what a model gets wrong
  (a handler nothing calls, a name that is not a control of the form but starts like one, a duplicate member in
  C#, a class *or* namespace inside a class, unbalanced braces), each with a Fix where the answer is mechanical,
  and the check now runs the moment the model writes — in both diff modes. Stated limit: it is a rule checker,
  not a compiler; type errors and missing usings are still the build's job. §123.

- **0.9.39 — the model that answered with a whole class.** A "create a function" request came back as
  `namespace … { class MainWindow … { … } }` and was inserted *inside* the existing class — `CS1513` in the
  user's app, repaired by hand (their file now builds 0/0). The prompt now forbids the wrapper outright, the
  answer is unwrapped before the diff (and refused when it declared several members), and `insertMember` strips
  as a backstop — while a local `class` inside a method is left alone. §122 has the write-up, and the regression
  test uses the verbatim broken answer.

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
- **The model's life is owned.** `deactivate` frees **every** runtime this window can hold — LM Studio via a
  detached `lms unload --all`, the sidecar via `stopModelServer`, and (since 0.9.42) the user's own
  `llama-server` via `stopOwnLlamaServer` — and **Unload** in the panel frees all of them too, naming any
  server it did *not* start. For a *built-in* model the old
  Unload was a no-op that reported success (§110, §117, §125).
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

- **`0.10.0` is the release of everything since 0.9.4.** `0.9.5` – `0.9.46` were local builds only (the AI
  assist's whole arc, plus the fixes it forced); `0.10.0` carries the lot to the Marketplace as **one number**
  — the tag, the release title and `package.json` all say `v0.10.0`/`0.10.0`, and the dual `v1.0.0-beta.N` tag
  beside a `0.9.x` listing version is gone (the CHANGELOG keeps that history as it shipped). The developer
  uploads it through the publisher portal (`PUBLISHING.md` part E — the CLI needs a PAT, and the global-PAT kind
  retires on 1 December 2026, so the portal is the durable path); `PUBLISHING.md` carries the local `sha256` and
  the block to replace with the verified line once the gallery serves it.
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
