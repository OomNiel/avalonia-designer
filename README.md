<p align="center">
  <img src="Grumpy.png" width="128" height="128" alt="Grumpy's WYSIWYG Designer">
</p>

<h3 align="center">
  <a href="https://paypal.me/grumpyextensions">If you enjoy using this extension, please contribute and consider making a donation.</a>
</h3>

<p align="center">
  <a href="https://paypal.me/grumpyextensions">
    <img src="https://img.shields.io/badge/Donate-PayPal-00457C?logo=paypal&logoColor=white" alt="Donate with PayPal">
  </a>
</p>

# Grumpy's WYSIWYG Designer for VS Code

> **Formerly *Avalonia Designer for VS Code*.** The extension id is unchanged — `grumpy.avalonia-designer` — so
> your settings, shortcuts and downloaded models keep working, and searching for the old name still finds it.

A **WYSIWYG form designer for the [Avalonia](https://avaloniaui.net) UI framework** that lives inside
VS Code: drop controls on a design surface, set their properties in a friendly panel, and let the
extension write the **XAML** ***and*** the C#/VB.NET code-behind for you.

As a long time user of Windows based IDE's, I got used to have access to interactive WYSIWYG style
form designer features. On Linux though I could not find such a tool that suited me for using with the
VS Code app. This extension is an attempt to solve that problem.

*This extension is a developing project. As such expect to find some bugs and unexplained weirdness.*

I need the help of the community to test, find errors, bring missing features to light and help with
the debugging. This project lives in a
[GitHub repository](https://github.com/OomNiel/avalonia-designer). **Bug reports, questions and
remarks are welcome in the [issue tracker](https://github.com/OomNiel/avalonia-designer/issues).**

Listed below is the list of the features of this extension. Feel free to enjoy and contribute.

## Install

**From the Visual Studio Marketplace** — search for *Grumpy's WYSIWYG Designer* in the Extensions view
(`Ctrl+Shift+X`), or:

```bash
code --install-extension grumpy.avalonia-designer
```

The current version is **`0.11.14`**, so the command above installs it (add `-force` to reinstall, or to
update a copy that is already on the machine; *Extensions → ⟳ Check for Extension Updates* is the
no-terminal way to see it).

**Or from GitHub** — take the `.vsix` attached to the
[latest release](https://github.com/OomNiel/avalonia-designer/releases/latest) (the file name carries
its version, so it is obvious which build you downloaded):

```bash
code --install-extension avalonia-designer-0.11.14.vsix --force
```

> **One version number everywhere.** The GitHub tag, the release title and the listing all carry the same
> number — `0.11.14` now — and the marketplace updates you automatically when a newer one is published.
> [CHANGELOG.md](https://github.com/OomNiel/avalonia-designer/blob/main/CHANGELOG.md) says what changed in
> each release, and
> [PUBLISHING.md](https://github.com/OomNiel/avalonia-designer/blob/main/PUBLISHING.md) records every version
> that has gone live, with the hash the gallery serves.

Either way, **reload the window** afterwards (`Ctrl+Shift+P` → *Developer: Reload Window*). The
previewer host is compiled with the **.NET SDK** the first time you open a form — see
[USER_MANUAL.md §3](https://github.com/OomNiel/avalonia-designer/blob/main/USER_MANUAL.md#3-installation--first-run)
for the prerequisites.

## 1. The preview is real

The design surface is rendered by an **actual headless Avalonia application** (`host/`, C#/net8.0 on
**Avalonia 12.1.1**) that loads your XAML over a Web-socket and returns a PNG — **plus every
control's bounds, parent and Grid cell**. That is what makes click-to-select, drag, resize and cell
drop work against a genuine render rather than an approximation.

Three loader strategies keep it working when a form uses types the host cannot resolve:

- `IRuntimeXamlLoader` (via reflection, full fidelity)
- a temp-file `AvaloniaXamlLoader.Load(uri)`
- a programmatic fallback builder that renders what it can and shows a labeled error card for what it
  cannot.

## 2. C# and VB.NET code-behind generation — VB as a first-class citizen

Generated VB gets control **accessor properties**, so you can write `TextBox2.Text = "Hello"`
directly; correct `Imports`; a manual `InitializeComponent()`; a fully-qualified `x:Class`; and exact
`EventArgs` per event (VB is strict — a mismatch fails the build with `AVLN:0004`).

The awkward parts are handled rather than hand-waved: VB **one-line lambdas**
(`Function(r) r.Name`, `Sub(s, e) DoIt()`) used to unbalance method spans and produce false errors.

The analyzer now distinguishes them from real blocks. Visual designers in Linux distros almost never
support VB.NET at all. Eventually I will make all .NET languages work with this extension.

## 3. An event catalog generated from the real assemblies that drives a picker

Placing a control opens a chooser listing the events **that control actually exposes** (its default
event first). Tick **several** at once, press **Skip** to place it un-wired, or tick
*Remember my choice* to stop being asked. **Right-click → Add event…** wires more later (already-wired
events are marked and cannot be picked twice), and **middle-click** lists the wired handlers so you
choose which one to jump to in the code-behind files.

## 4. 🩺 Code Fix… — the designer notices when you edit by hand

Hand-editing XAML or the code-behind normally leaves the two out of step, and the compiler error you
get then rarely points at the change that caused it. **Code Fix…** checks the code-behind against the
form *and* the project's DataSets, then repairs what it finds. It fixes missing VB accessors,
left-over accessors, duplicate methods, orphaned event handlers, wrong handler signatures, a
never-called `InitializeComponent()`, broken Data-Image / `ItemsSource` bindings, DataSet drift after
a rename, missing `Imports`, and bundled helper files that were never copied into the project.

It can run **by itself** (when you return to the designer tab by default — also on save, while typing,
or only on demand, via **⚙ Settings**), publishes findings to **PROBLEMS**, and marks a control whose
handler is missing with a **⚠ badge** right on the canvas.

**It also checks what the AI writes.** The same check runs the moment a model has changed the file, in both
diff modes, because that is when a finding is cheapest to act on. The rules it gained for that job are the
mistakes generated code actually makes: a handler **nothing calls** (fixed by wiring the event into the form),
a name that is **not a control of this form but starts like one** (`Status` where the form has `StatusDate1`, so
`CS0103` never reaches the build unchecked), a **second member with the same name** (`CS0111`), a **class or
`namespace` declared inside a class** — the shape a pasted answer leaves behind, and the `CS1513` one user hit —
and **braces that do not balance**, which a truncated answer leaves open. The structural ones are repaired rather
than reported: the wrapper is unwrapped with the members kept, the missing braces are closed at the end.
It is a rule checker, not a compiler — type errors, wrong API use and a missing `using` are still the build's job.

**So the build does that job.** Since `0.10.1` a **Code Fix…** run — and the return to the designer after you
edited the code by hand or with the AI assist — also runs the project's own `dotnet build` (incremental, about a
second on the test app). The compiler's errors appear in the same list and the same PROBLEMS pane, and the ones a
rule can *write* are repaired **one at a time, rebuilding after each**, until the build is clean: a missing `;`
anywhere in a body (the compiler knows the line, so the rules' semicolon fix is handed it), a missing brace, a
missing `using`. A repair that does not bring the project closer to compiling is **undone**, and an error no rule
understands is listed for you — the model is offered it only while a model is already running (the built-in
runtime, or any `llama-server` answering on this machine). Nothing about the designer's own edits pays for a build: a handler it inserted lands on disk and stays instant.

`avaloniaDesigner.codeCheck.build` turns the build off; `codeCheck.aiRepair` turns off the model's part in it; a
`maxPasses` bound (10) and the panel being closed stop the loop.

The striking part: it is never destructive. Every finding offers a **“keep my edit”** alternative
*Leave it — keep my code*, or *Keep my delete — un-wire it*, which removes the event from the form so
the XAML and the code agree again. A handler you **renamed** by hand is offered as a one-click
**re-point** instead of an empty new stub, so the body you wrote is never lost.

## 5. It creates complete run-ready projects

Not just forms. **Avalonia: New Form** covers Window/UserControl with five templates (Blank, Login,
Data entry, About, Main window with menu + status bar), and project scaffolding produces a complete
Avalonia project with the bundled Titlebar, helper files, `.vscode` build/launch tasks and DataSet
support (C# or VB.NET) that `dotnet build`s clean and runs. The test suite proves that for the whole
control matrix in both languages.

## 6. A DataSet designer with live data binding

Design ADO.NET DataSet tables and columns visually (`*.adset`), generate the runtime class (C#/VB)
**and** the `.xsd`, then bind controls to it. Bindings stay in sync when a table or column is renamed —
the designer knows what a binding is made of rather than treating the code as text.

It also supports **“follow a column of a bound grid”**: a ComboBox or ListBox can mirror one text
column of a table a DataGrid owns and update **live** as you add, edit or delete rows in the grid —
without taking the table away from the grid's own editing, undo and save-back.

## 7. Bundled helper controls and charts, copied in and kept in sync

File and Folder **path pickers** (platform dialog via `TopLevel.StorageProvider`, no extra package),
a cross-platform **dark titlebar** (`ChromeWindow`), `GrumpyPanel`, `AnchorHelper`, `ColumnFollower`
and `ExifImageLoader`. Each is copied into your project the first time it is needed — and re-copied by
**Code Fix…** for projects that predate it.

Seven **self-drawing charts** join them in the same bundled file style (`GrumpyCharts.cs` / `.vb`, no
package, no chart engine, no image — the control draws itself, so it scales and prints): **Line Plot**,
where the X axis is the sample number; **X, Y Plot** for `(x, y)` pairs, as a line, as markers or both;
**Bar**, **Area** and **Pie** for categories and shares; the **Waterfall** — a projected 3D surface
that stands one spreadsheet **column per sampleset** (a sweep, a run, a pass) behind the next and joins
them with a mesh, coloured per set, by value (a heat map) or either side of a limit, and turnable with
the mouse; and the **Surface Chart 3D** — a corrugated sheet where one spreadsheet **column per slice**
is a profile along the sheet's length, drawn as a grid mesh, a mesh over a solid sheet or a solid,
coloured per slice or by a **temperature ramp** from the valleys to the ridges, with its own drag-to-turn
view (*Elevation*, *Azimuth*, *Z Spacing*, *Zoom*) and a two-slider **range window** that picks the width
and the SLICES on show (the view re-fits, so a selection zooms into the sheet).
Numbers come from a **spreadsheet** you point at (an absolute path — the workbook is not copied
into your project and stays yours to edit) or from typed-in values; **Live Update** re-reads a sheet on
save, including while Excel or LibreOffice has it open. Four editors in the Properties panel build the
rest: **Series** (one line per series, its own columns and its own axis), **Axis** (sides, ticks, labels and
per-series scales, and three independent colours — the axis line, its tick labels and its name), **Legend**
(side, font size and a rounded frame; the entries switch traces on and off at runtime) and **Cursors** — up
to two draggable cursors with a value readout that is always white on black and always legible, the arrow
keys stepping a sample at a time, *follow trace* keeping the crossing on the selected series, the readout's
border and series line drawn in the colour of the series it follows, and a `ΔX`/`ΔY` row once both are on.
The chart's own frame rows are in the same panel — backcolour and opacity, the border, **Padding**, the room
between that border and the chart frame (it pushes the title, the legend bar and the plot inward; leave it
empty and nothing moves), and a **Background Gradient** (linear, radial or conic, with three colour stops).
The workbook is chosen from the chart's **right-click menu** (*Choose spreadsheet…*). The whole walkthrough
is **USER_MANUAL §19**.

## 8. A property grid that behaves like a real one

**Items editors.** Some controls are defined by their children, and writing those children by hand is where a beginner stops: a menu bar's items and submenus, a TabControl's pages, a ListBox's rows, a status bar's items, and a TreeView's nodes all have a small editor in the Properties panel (**Edit tree nodes…**, **Edit menu items…**, and so on). The **Tree Items** editor is the newest: indented rows where the indentation *is* the nesting, a Header and an *expanded* tick per node, buttons to add, nest, un-nest, reorder and delete, and a confirmation before a delete takes a whole subtree. Anything the editor cannot represent — an `ItemTemplate`, a `Styles` block, a bound `ItemsSource` — appears as a greyed read-only row and is never rewritten, so building a tree by hand can never silently destroy what was already there.

Every control gets the *familiar* editor for each property kind: the full color palette,
**font pickers populated from your machine's actual font list** (enumerated in the host),
`ItemsSource` and Browse pickers, Data-Image binding, plus dedicated editors for Tab items, List
items, ComboBox items, menu items, a status bar and **DataGrid Rows & Columns** (row background, row
height, column width, frozen columns, header font/color/alignment).

Rows are grouped into collapsible sections in the same order for every control, and every control has
a plain-language **“About this control”** help panel — the extension is aimed at beginners, so nothing
assumes you already know Avalonia's vocabulary.

**A text box applies when you press `Enter` or click away from it** — not on every keystroke, which
would re-render the preview and rebuild this panel while you are still typing. Everything else (a
checkbox, a drop-down, a colour, a toolbar button) applies the moment you click it.

## 9. Designer ergonomics tools to make form control layout easier

Multi-select with six alignments, same-width/same-height and equal spacing (vertical and horizontal).
Dock, Grid-cell and anchor handling with a cell highlight and drag-to-re-cell; dot grid with
snap-to-grid; cross-hair guides; rulers; zoom/fit.

Split panels are designed visually, controls can be moved between containers without breaking their
code-behind, and **undo/redo (5 levels) also reverts code-behind changes**.

One toolbar click makes a dated **backup of the whole project** before risky work — and when the app is
finished, **📦 Publish** builds it in Release and packages it as a **Debian installer**
(`publish/<name>_<version>_<arch>.deb`) that you can copy to another machine and install there. The
package **depends on the .NET runtime instead of bundling it**, so apt installs the prerequisite and
the `.deb` stays small. **🚀 Install** installs that package on the machine you are working on (the
password is asked for in the terminal), so the app appears in the application menu and runs outside VS
Code. On **Windows** the same two buttons produce an **MSI** (WiX) that installs per-machine into
`Program Files` with a Start-menu entry and an *Apps & features* entry, and installing a newer build
replaces the old one.

## 10. ✨ AI assist — write the handler, write a new function, or fix what a rule cannot

> **⚠ EXPERIMENTAL FEATURE-USE WITH CAUTION**
>
> The AI assist is experimental: it may change shape, and its usefulness depends on the machine it runs on —
> a local model needs memory **available right now**. The designer therefore checks your host when it starts
> and greys the AI section out, with the reason, when the machine cannot hold the smallest supported model.
> See *Host requirements* below for the numbers, and for the way out if the check is wrong about your machine.

The Code Fix engine repairs what can be expressed as a rule. For the rest — an empty handler, or a
change you can only describe in words — the extension can ask a **local** model.

**Host requirements (checked when the extension starts).** The model runs on *your* machine, so the designer
asks it first and says what it found:

| | |
|---|---|
| **Blocked** — the AI section is greyed out, with the reason shown in it | under **~8 GB of memory available to a model**. That is the smallest supported model's own requirement (roughly its size again while it runs): free RAM, plus the VRAM of a discrete card. A CPU without AVX2, or fewer than 4 threads, blocks it too. |
| **Warning** — it runs, but you are told | under **20 GB available**: comfortable for the 3B model, tight for a larger one. |
| **Never counted as help** | an integrated GPU's shared/carve-out VRAM — it comes out of the same RAM, so counting it would count the same gigabytes twice. A discrete card with under 4 GB VRAM is named as "no help" but is never on its own a reason to refuse. |
| **The way out** | **Use it anyway — I know this machine** in ⚙ Settings → AI assist (`assistant.ignoreHostCheck`), for an eGPU, a card that was not detected, or a machine you know can do it. The override is remembered and logged. |

*AI: Status & hardware check* prints the same verdict with the numbers behind it.

**The caret is where you write the request.** *Inside a method* (*AI: Implement in Function…*) the model
returns the **complete method** — same name, signature and indentation — from what you type ("read the row the
user picked and fill the TextBoxes"). *Outside every method* the same command writes a **new** member where the
caret is: *"create a function named `SortArray` that sorts a passed array"* gives you
`private static void SortArray(int[] values)` — `private` always, `static`/`Shared` only when the body needs no
instance state and no form control (never for a `<Control>_<Event>` handler, since XAML resolves those on the
instance), any `using` it needs added after the last one, and, when the name matches a control in the form, an
offer to write `Click="…"` onto it. A name that **already exists is refused**, never quietly replaced: the
message tells you to put the caret inside it and run the same command to rewrite it instead.

**Nothing is written without you saying so.** The answer opens as a **diff** with *✓ Apply AI change* and
*✕ Discard*, also offered in the status bar and directly above the member, so the decision cannot expire while
you read it; *✨ Fix with AI…* appears on findings that sit inside a method; and **Build to verify** runs your
project's build, because generated code is not taken on trust. Prefer no review step? Clear **⚙ Settings →
Show the proposed code as a diff** and the code is written straight in — still one undoable edit, still the same
rules first (the duplicate refusal, the visibility correction), with **Undo** offered by name afterwards.

**The prompt is written in the editor, at the caret (`0.10.11`).** There is no dialog to find at the top of the
window: the command inserts two marker comments where the caret is —
`// ✎ AI: begin — write what you want below, as many lines as you like` … `// ✎ AI: end` — puts the caret between
them, and a code lens above the block offers **▶ Send to AI assist** and **✕ Cancel** (`Ctrl+Alt+Enter` sends).
Write as many lines as the request needs; the two marker lines and everything between them are **removed** when
the request is sent, cancelled or refused, so the file ends up exactly as it was. The prompt is still planned
against the model before anything goes out — what is left for your words, and what had to be dropped to fit, are
said in the status bar while you type, and a request that is too long is refused **without deleting what you
wrote**, which is the one thing a dialog that closes over your words could never do.

**The answer is checked before and after it lands.** A model that wraps its reply in a `namespace`/`class` of
its own is unwrapped (that failure once produced `CS1513` in a user's file), an answer that declared several
members is refused rather than guessed at, and the designer's own check runs the moment the file changes — so a
handler nothing calls, a control name the form does not have, a duplicate member or unbalanced braces are
reported immediately instead of at the next save.

**It brings its own model.** For a developer with no AI at all there is nothing to install and no
account to create: *AI: Set Up Local Model…* builds a small C# model server with the .NET SDK the
designer already uses — one extension package for every platform and architecture, because the native
code is resolved by NuGet on your machine — and offers **one model, two ways to run it**: *Qwen2.5-Coder 7B ·
GPU (Vulkan)* and *Qwen2.5-Coder 7B · CPU only (no GPU)* — **the same 4.4 GB download**, fetched **once**,
verified against the SHA-256 the Hub publishes, into the extension's own storage. The 7B is the model that
measured best on this project (the only one of five whose generated C# compiled), and the two entries are the
real choice a person faces: **use the GPU or not** — measured on these weights, 9.7 s for a handler with the GPU
layers offloaded against 13.0 s entirely on the CPU. The entry you pick decides both halves of that (`0.10.9`):
the GPU entry writes the Vulkan build **and** a full offload, the CPU entry writes the CPU build and none, so the
label cannot lie about what is running. Everything else a picker could offer lives under one **Advanced…** fold (`0.10.5`). **Any other GGUF is one command away:** *AI: Add a Model from Hugging Face…* takes a model page or
a file URL, lists the files in the repo with their sizes, reads the size and the hash from **Hugging Face
itself**, and downloads it through the same verification — after which it behaves exactly like a built-in one,
including **Remove Model**, which gives the disk space back — it deletes the weights behind whatever the list has
selected (a downloaded model, **or** a server entry whose `.gguf` is in this extension's storage), and refuses
anything else by naming the folder it *is* allowed to delete from (`0.10.4`). Nothing is fetched until you press
**Load Model**.

**The built-in runtime can use your GPU — and now that is the default.** The picker's first entry runs the 7B on
the **Vulkan** build; the second runs the same weights on the **CPU** build, for a machine whose Vulkan driver
will not load them. *AI: Built-in Runtime Backend…* switches either way by hand, and on the Vulkan build `max`
on the GPU-offload field really does offload. Asking is not getting, and the extension never says otherwise:
with no usable Vulkan device llama.cpp falls back to the CPU by itself, the status report names the build that
is **actually running** (`Native backend: …`), and a driver that dies while the weights load is retried once on
the CPU — reason in the log, and a one-click offer to keep it that way. The option costs one bigger first build
(~40 MB more to download, ~130 MB more on disk in the extension's own build folder).

**And when the 7B is not enough, it asks about your big model.** If a Code Fix run ends without a clean build,
the panel offers one thing: *"Try once more with your 30B model?"* — with what that costs in the question (the
7B is unloaded first, your `llama-server` unit is started, ~20 GB, about a minute) — and it narrates every step
while it happens: unloading, starting, waiting for the weights with the seconds counting, then the retry. It is
offered once, never in a loop, and only when the model behind that unit really is bigger than the 7B and really
would fit in the free memory (`0.10.5`).

**Or point it at a model you already run.** The picker lists the ways a model can arrive, in the order
the extension can guarantee them: **its own runtime** (llama.cpp via LLamaSharp, weights from Hugging Face, no
other program needed), then **your own `llama-server`** — which this extension will *start for you* — then **a
server that is already listening** (Ollama, or a `llama-server` you run yourself; the address is a setting),
then **LM Studio's library**, then loose `.gguf` files found on disk. For the LM Studio case, *AI: Choose a
Local Model…* still does the work: it starts its server if it is not running, warns you *before* loading if the
model does not fit in the free memory, loads it with recommended start values, points the extension at it and
proves it answers. Either way nothing leaves the machine, the feature ships **off**, and a hardware check (RAM,
CPU threads, AVX2) refuses the models this machine cannot run well instead of letting you find out the hard way.

**A `llama-server` you already have is a first-class engine, not just an address.** *AI: Start My
llama-server…* finds the binary (the usual build folders and your `PATH`, or a path you set), asks which `.gguf`
to serve, shows the flags it would use (context size, threads, GPU **layers** — from your machine, each with its
reason) and starts it; *AI: Stop My llama-server* stops it again. Nothing is copied and nothing is downloaded:
llama.cpp reads the file where it is. It passes **llama.cpp's own flags** (`--model`, `--host`, `--port`,
`--ctx-size`, `--threads`, `--n-gpu-layers`, `--alias`) and waits for `/health` to say the weights are in RAM
before calling it ready. If a llama-server **is already running**, you are asked instead of a second copy of the
same weights being loaded. One you started yourself is now **managed rather than shrugged at**: ⚙ Settings → AI
assist has *Start server* / *Stop server* for it, and the line beside those buttons says who owns it — the unit
with its uptime and whether it returns at login, or a plain process with its pid (`src/llamaService.ts`, added in
`0.10.3`). Stop always asks first, and a unit belonging to the *system* manager is never touched: the
`sudo systemctl stop …` line is printed instead. The extra flags you want are a setting (`--device none -nr`,
say), added last so they win.

**And it can be taught how your code reads.** *AI: Learn the House Rules from My Code…* (or the button in the ⚙
panel) reads your project's C# and VB files and **measures** the idioms — indentation, brace style, member
visibility, `static`/`Shared`, handler naming, and for VB whether events are wired with `Handles` or
`AddHandler` — then offers the patterns that cleared two gates: at least **5 examples agreeing 80 %** of the
time, each shown with its own evidence (`5 of 5 C# members`). You tick what to keep, the rules go into every
request, and a codebase split 50/50 deliberately produces **no** rule — a house style nobody chose is worse than
none. Rules are counted per language, learning calls no model at all, and the list is empty until you ask for it
(12 max, editable by hand in the same box).

**And it is told what your form's data actually is.** The generated DataSet is described to the model the way the
generator emits it (`0.10.9`): a class of **static helpers** with a **top-level** row class per table — not the
nested typed `DataSet` earlier versions produced — with the members that do **not** exist named outright, and the
plain fact that a grid's rows *are* what `ItemsSource` holds (never `.Items`, which is WPF's name). That sentence
is what makes *"link the ComboBox to the selected row"* come out as code that compiles: on this project the
assistant had rewritten the same method three times with the old shape and got CS1061 every time, and the Vulkan
build fixed it on the first run once the facts told the truth.

**The ⚙ Settings panel shows where every entry comes from**, because that is what decides whether it can work:
*LM Studio · in My Models, ready to load* (the extension is a remote control there — LM Studio is the runtime and
can only load a name it has), *This extension's own runtime · weights on disk, ready to load* (or *not downloaded
yet — 4.4 GB to fetch on the first load*), *My own llama-server · llama.cpp* (your own binary, started from the
panel — and if one of yours is already answering, the entry says so rather than offering a second copy),
*Found on this machine · … added to LM Studio first by a symbolic link* for a file the scan found, and *a server I
run myself* for anything else already listening. Its two checkboxes
are the decisions that are not about one model: **Use a local model for Code Fix and Implement** (the switch
that loads, and unloads when cleared) and **Show the proposed code as a diff before it is applied**. While it
is asking your machine for its model list it says so — *looking for local models…* in the AI section, and
**`Loading…`** beside Cancel and Save while the dialog itself is still being filled (`0.10.9`) — because the first
such look of a session also starts LM Studio's own service, and an empty dropdown should never look like a broken
one. That wait is short now: an answer is reused for 15 seconds and the `lms` helper is given 3 in that path
(*Refresh list*, loads and imports still ask in full), where it used to be a 20-second default timeout, twice per
state, on every open, save and focus.

**When a load fails, LM Studio's own log is translated rather than shown** — the two aborts that actually happen
are a model bigger than the kernel's locked-memory limit (with **Keep Model in Memory** named as LM Studio's own
setting, so it is clear whose to change) and the Vulkan build of llama.cpp losing the integrated GPU (*"not
enough memory for command submission"*), for which a CPU-only runtime is named as the way out — for the
extension's own runtime that is *AI: Built-in Runtime Backend…* → **CPU build**. Failures never
pass LM Studio's jargon through, and the full `lms …` command line goes to the extension's log either way.

**And the memory comes back.** *Unload* frees whichever runtime is actually holding the model — the extension's
own sidecar, the `llama-server` this window started **and** LM Studio — and every model is freed when the IDE
closes, so a 6 GB model does not sit in RAM after a session. A llama-server you started yourself is left alone on
purpose, and *said* to be left alone. The status report says what is in memory *right now* (*Loaded now: …*), not
just what the settings point at, so "did my load take?" is answerable from the panel.

## 11. Engineering discipline

- **~6,946 automated assertions across 5 layers**, including a layer that drives the real headless
  renderer over WebSocket and asserts pixels/bounds, a layer that runs the webview in **jsdom**, and a
  matrix that `dotnet build`s generated C# **and** VB projects for every control.
- **CI on every push** (compile, fast layers, and a real `vsce package`), plus a dry-run-first release
  workflow.
- **~10,500 lines of documentation**: a 2,000-line beginner `USER_MANUAL.md`, a per-control
  `CONTROLS.md`, the generated `Events per Control.md`, a real `CHANGELOG.md`, a maintainer
  `PUBLISHING.md` and a developer `NOTES.md` with the gotchas written down.
- A **generated** catalog rather than hand-maintained lists, so the code, the signatures and the
  reference document cannot drift apart.

## Status and prerequisites

- **Published on the
  [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=grumpy.avalonia-designer)**
  — still changing, but every release ships with a green suite.
- **One version number per release.** The GitHub tag, the release title and `package.json` all carry the same
  `major.minor.patch`, and that is the number the Marketplace shows; it only ever goes up, so updates arrive by
  themselves. `1.0.0` stays reserved for the first stable release, because a published version can never be
  reused. [PUBLISHING.md](https://github.com/OomNiel/avalonia-designer/blob/main/PUBLISHING.md) records what is
  live and how it got there.
- VS Code **1.85+**; the **.NET SDK** (the preview host is built with it — the designer names the
  missing SDK with a download link rather than failing silently). Generated projects target `net10.0`.
- Both the preview host and generated projects use **Avalonia 12.1.1** — one version, so what you
  design is what you run.
- **MIT** licensed.

## Read more

- [USER_MANUAL.md](https://github.com/OomNiel/avalonia-designer/blob/main/USER_MANUAL.md) — the full
  guide, written for beginners
- [Events per Control.md](https://github.com/OomNiel/avalonia-designer/blob/main/Events%20per%20Control.md)
  — every event of every control, with the `EventArgs` a handler must take
- [CONTROLS.md](https://github.com/OomNiel/avalonia-designer/blob/main/CONTROLS.md) — per-control
  properties and default events
- [CHANGELOG.md](https://github.com/OomNiel/avalonia-designer/blob/main/CHANGELOG.md) — what changed in
  each release
- [PUBLISHING.md](https://github.com/OomNiel/avalonia-designer/blob/main/PUBLISHING.md) — packaging and
  Marketplace release steps (for maintainers)
- [Visual Studio Marketplace listing](https://marketplace.visualstudio.com/items?itemName=grumpy.avalonia-designer)
  — the extension itself
- [All releases and VSIX downloads](https://github.com/OomNiel/avalonia-designer/releases)
- [Issue tracker](https://github.com/OomNiel/avalonia-designer/issues) — bug reports, questions and
  remarks go here
