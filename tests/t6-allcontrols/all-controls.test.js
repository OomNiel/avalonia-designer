/* T6 — All-Controls TabControl integration test (C# + VB.NET).
 *
 * Generates a blank project in each selected language, populates MainWindow with a
 * TabControl whose tabs correspond to the Toolbox categories, places every placeable
 * visual control from the toolbox onto its category tab (via the production snippets
 * the host serves), wires every code-behind dependency the snippets' event attributes
 * demand, then:
 *   - compiles the project (dotnet build → 0 errors / 0 warnings),
 *   - builds a net10 Avalonia.Headless harness that References the generated project,
 *   - runs the harness, which instantiates MainWindow, selects every tab,
 *     FindControls every placed control, and asserts non-zero bounds.
 *
 * SWITCHES (environment variables):
 *   T6_LANG   = cs | vb | both   (default: both)  Which language project(s) to build & run.
 *   T6_LIVE   = 0 | 1            (default: 0)     0 = Avalonia.Headless; 1 = live platform
 *                                                  (UsePlatformDetect) — renders to a real
 *                                                  display, still checks programmatically.
 *   T6_RESUME = 0 | 1            (default: 0)     1 = resume from checkpoint
 *                                                  (tests/out/t6-state.json), skipping
 *                                                  phases already done.
 *
 * PAUSE / RESUME:
 *   Send SIGINT (Ctrl-C) or SIGTERM at any time.  The test finishes the current
 *   t.run() call (or catches the resulting interruption), writes the checkpoint,
 *   and exits.  Re-run with T6_RESUME=1 to continue from where it left off.
 *
 * Usage:
 *   node tests/runner.js --layer t6-allcontrols                       # both, headless
 *   T6_LANG=cs   node tests/runner.js --layer t6-allcontrols         # C# only
 *   T6_LANG=vb   node tests/runner.js --layer t6-allcontrols         # VB.NET only
 *   T6_LIVE=1    node tests/runner.js --layer t6-allcontrols         # live rendering
 *   T6_RESUME=1  node tests/runner.js --layer t6-allcontrols         # resume
 */
'use strict';
const fs = require('fs');
const net = require('net');
const path = require('path');
const { Uri } = require('vscode');
const { generateProject, dotnetBuild, buildHost } = require('../helpers/build');
const { startHost, HOST_BIN } = require('../helpers/host');
const { solidPng } = require('../helpers/png');
const { XamlModel } = require('../../out/xamlModel.js');
const { TOOLBOX_CATEGORIES, controlsForGroup } = require('../../out/toolboxProvider.js');
const { insertHandlerIntoCodeBehind, insertStatusDateClock,
    insertCommandBarFileHandlers, insertXyTrackerClock, bindControlToAsset } =
    require('../../out/codeBehind.js');

// ── Configuration ──────────────────────────────────────────────────────
const LANG = process.env.T6_LANG || 'both';   // cs | vb | both
const LIVE = process.env.T6_LIVE === '1';     // 0 = headless (default), 1 = live platform
const RESUME = process.env.T6_RESUME === '1'; // 0 = fresh, 1 = resume from checkpoint

const T6_DIR = __dirname;
const OUT_6 = path.join(path.dirname(T6_DIR), 'out');        // tests/out
const OUT_PROJECTS = path.join(OUT_6, 'projects');            // tests/out/projects
const OUT_HARNESS = path.join(OUT_6, 't6-harness');           // tests/out/t6-harness
const STATE_FILE = path.join(OUT_6, 't6-state.json');
const SNIPPETS_CACHE = path.join(OUT_6, 't6-snippets.json');
const TABCONTROL_NAME = 'AllControlsTab';

// Toolbox controls with no visual surface or not in the placeable catalog.
// (No "12-preview stand-in" exclusion is needed: the host and the generated apps are both on
//  Avalonia 12.1.1, so every catalog tag is a real type on both sides.)
const EXCLUDE = new Set(['DataSet', 'CustomTitleBar', 'Timer']);
// Common properties applied to every control (compile-gated).
const COMMON_PROPS = { Width: '120', Height: '32', Opacity: '0.95' };
// Events wired through the production insertHandlerIntoCodeBehind path.
const EVENT_CHECKS = [
    ['ComboBox', 'DropDownOpened', 'System.EventArgs'],
    ['Button', 'Tapped', 'Avalonia.Input.TappedEventArgs'],
    ['TextBox', 'KeyDown', 'Avalonia.Input.KeyEventArgs'],
    ['DataGrid', 'CellEditEnding', 'Avalonia.Controls.DataGridCellEditEndingEventArgs'],
    ['Menu', 'Opened', 'Avalonia.Interactivity.RoutedEventArgs'],
    ['CheckBox', 'Click', 'Avalonia.Interactivity.RoutedEventArgs'],
    ['TabControl', 'DoubleTapped', 'Avalonia.Input.TappedEventArgs'],
    ['ListBox', 'PointerPressed', 'Avalonia.Input.PointerPressedEventArgs']
];

// ── Toolbox enumeration ────────────────────────────────────────────────

/** All placeable visual controls, in catalogue order, deduplicated. */
function toolboxControls() {
    const seen = new Set(); const out = [];
    for (const cat of TOOLBOX_CATEGORIES) {
        for (const c of controlsForGroup(cat.group)) {
            if (!c.tag || EXCLUDE.has(c.tag)) continue;
            if (seen.has(c.tag)) continue;
            seen.add(c.tag); out.push(c);
        }
    }
    return out;
}

// ── Utilities ──────────────────────────────────────────────────────────

function freePort() {
    return new Promise((res) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    });
}

// ── Checkpoint / pause / resume ────────────────────────────────────────

let paused = false;
process.on('SIGINT', () => { paused = true; });
process.on('SIGTERM', () => { paused = true; });

function ckptKey(lang, phase) { return `${lang}:${phase}`; }

function loadState() {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
    catch { return { lang: LANG, live: LIVE, phases: {} }; }
}

function saveState(state) {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function skipPhase(state, lang, phase) {
    return RESUME && state.phases[ckptKey(lang, phase)] === true;
}

function markPhase(state, lang, phase) {
    state.phases[ckptKey(lang, phase)] = true;
    saveState(state);
}

function checkPause() { return paused; }

/** Yields to the event loop so deferred signal handlers can run, then checks pause.
 *  Must be called after any execSync / t.run() call, because those block the event
 *  loop — a SIGINT received during execSync has its handler queued and is not
 *  processed until the call stack unwinds.  A single microtask/macrotask yield lets
 *  Node process the signal before we read `paused`. */
async function checkPauseAfterSignal() {
    await new Promise((resolve) => setImmediate(resolve));
    return checkPause();
}

// ── Harness (csproj) + driver (Program.cs) generation ──────────────────

/** Builds the harness .csproj with a ProjectReference to the generated project. */
function harnessCsproj(appName, appProjPath) {
    const relProj = path.relative(path.join(OUT_HARNESS, appName, 'Harness'), appProjPath)
        .split(path.sep).join('/');
    // Live mode needs Avalonia.Desktop (provides SetupWithActivator) + themes for rendering.
    const extraPackages = LIVE
        ? `  <PackageReference Include="Avalonia.Desktop" Version="12.1.1" />
  <PackageReference Include="Avalonia.Themes.Fluent" Version="12.1.1" />
  <PackageReference Include="Avalonia.Fonts.Inter" Version="12.1.1" />
`
        : '';
    return `<?xml version="1.0" encoding="utf-8"?>
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <AssemblyName>${appName}Harness</AssemblyName>
    <RootNamespace>${appName}Harness</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Avalonia.Headless" Version="12.1.1" />
    <PackageReference Include="Avalonia.Skia" Version="12.1.1" />
${extraPackages}  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="${relProj}" />
  </ItemGroup>
</Project>
`;
}

/** Substitutes placeholders in driver.cs.tpl to produce the driver source. */
function buildDriverSource(namespace, tabData) {
    const tpl = fs.readFileSync(path.join(T6_DIR, 'driver.cs.tpl'), 'utf8');
    const headlessCall = LIVE ? '.UsePlatformDetect()' : '.UseHeadless(new AvaloniaHeadlessPlatformOptions())';
    const settleMs = LIVE ? 1500 : 100;

    const tabLines = tabData.map((tab) => {
        const names = tab.controls.map((n) => `"${n}"`).join(', ');
        const header = tab.header.replace(/'/g, "\\'").replace(/"/g, '\\"');
        // `new string[]` (not `new[]`) so a tab that ends up with no controls still compiles
        // instead of failing with CS0826 "no best type for the implicitly-typed array".
        return `    (header: "${header}", controls: new string[] { ${names} }),`;
    }).join('\n');

    return tpl
        .replace(/\{NAMESPACE\}/g, namespace)
        .replace(/\{HEADLESS_CALL\}/g, headlessCall)
        .replace(/\{SETTLE_MS\}/g, String(settleMs))
        .replace(/\{IS_LIVE\}/g, LIVE ? 'true' : 'false')
        .replace(/\{TABCONTROL_NAME\}/g, TABCONTROL_NAME)
        .replace(/\{TAB_COUNT\}/g, String(tabData.length))
        .replace(/\{TAB_DATA\}/g, tabLines);
}

// ── Code-behind wiring ─────────────────────────────────────────────────

/**
 * Wires the production code-behind functions for both C# and VB.NET:
 *    - StatusDate clock (snippet has Loaded="…_Loaded")
 *    - GrumpyStatus embedded clock (Loaded="…Date_Loaded")
 *    - GrumpyCommandBar file-dialog handlers (Open/Close Click)
 *    - XYTracker clock (container mode + form mode)
 *    - Event-picker stubs (verifies EventArgs resolution)
 *    - ItemsSource binding for ListBox/ComboBox/ItemsControl
 */
async function wireCodeBehind(t, lang, axamlPath, cbPath, snippets) {
    const label = lang === 'cs' ? 'C#' : 'VB.NET';

    // 1) StatusDate clock
    if (snippets.StatusDate) {
        try { insertStatusDateClock(Uri.file(axamlPath), snippets.StatusDate.name); }
        catch (e) { t.fail('StatusDate', 'clock', `${label}: ${e.message}`); }
    }
    // 2) GrumpyStatus embedded StatusDate clock
    if (snippets.GrumpyStatus) {
        try { insertStatusDateClock(Uri.file(axamlPath), snippets.GrumpyStatus.name + 'Date'); }
        catch (e) { t.fail('GrumpyStatus', 'clock', `${label}: ${e.message}`); }
    }
    // 3) GrumpyCommandBar file dialog handlers
    if (snippets.GrumpyCommandBar) {
        try { insertCommandBarFileHandlers(Uri.file(axamlPath), snippets.GrumpyCommandBar.name); }
        catch (e) { t.fail('GrumpyCommandBar', 'handlers', `${label}: ${e.message}`); }
    }
    // 4) XYTracker clock — container mode (on tab canvas) + form mode (in status bar)
    if (snippets.XYTracker) {
        try { insertXyTrackerClock(Uri.file(axamlPath), snippets.XYTracker.name, 'container'); }
        catch (e) { t.fail('XYTracker', 'clock', `${label}: ${e.message}`); }
    }
    if (snippets.XYTracker2) {
        try { insertXyTrackerClock(Uri.file(axamlPath), snippets.XYTracker2.name, 'form'); }
        catch (e) { t.fail('XYTracker2', 'clock', `${label}: ${e.message}`); }
    }

    // 5) Event-picker stubs
    for (const [tag, ev, wantArgs] of EVENT_CHECKS) {
        const snip = snippets[tag];
        if (!snip) continue;
        const handler = `${snip.name}_${ev}`;
        try {
            await insertHandlerIntoCodeBehind(Uri.file(axamlPath), handler, ev, tag);
        } catch (e) {
            t.fail(tag, `event:${ev}`, `${label}: insertHandlerIntoCodeBehind: ${e.message}`);
            continue;
        }
        const cbText = fs.readFileSync(cbPath, 'utf8');
        const esc = handler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // C#: "private void Handler(object sender, EventArgs e)"  (object?, not nullable in this build)
        // VB: "Private Sub Handler(sender As Object, e As EventArgs)"
        const decl = lang === 'cs'
            ? new RegExp(`void\\s+${esc}\\s*\\(object\\??\\s*sender,\\s*([\\w.]+)\\s*e\\)`)
            : new RegExp(`Sub\\s+${esc}\\s*\\(sender As Object, e As ([\\w.]+)\\)`, 'i');
        const m = decl.exec(cbText);
        t.ok(!!m, tag, `event:${ev}`, `${label}: handler '${handler}' inserted`);
        t.equal(m && m[1], wantArgs, tag, `event:${ev}`,
            `${label}: stub takes the exact EventArgs type`);
    }

    // 6) ItemsSource binding for list controls
    const itemSrcTags = ['ListBox', 'ComboBox', 'ItemsControl'];
    const hasItemSrc = itemSrcTags.some((tag) => snippets[tag]);
    if (hasItemSrc) {
        const cbText = fs.readFileSync(cbPath, 'utf8');
        if (!cbText.includes('MatrixNames')) {
            const propLine = lang === 'vb'
                ? '\n    Public ReadOnly Property MatrixNames As String() = {"Alpha", "Beta", "Gamma"}\n'
                : '\n    public string[] MatrixNames { get; } = new[] { "Alpha", "Beta", "Gamma" };\n';
            if (lang === 'vb') {
                fs.writeFileSync(cbPath, cbText.replace(/(\nEnd Class\s*$)/, propLine + '$1'), 'utf8');
            } else {
                const lastBrace = cbText.lastIndexOf('}');
                fs.writeFileSync(cbPath, cbText.slice(0, lastBrace) + propLine + '    ' + cbText.slice(lastBrace), 'utf8');
            }
        }
        // bindControlToAsset works for both languages: C# gets fields from the
        // Avalonia NameGenerator source generator; VB gets accessors via syncVbAccessors.
        for (const tag of itemSrcTags) {
            if (snippets[tag]) {
                try {
                    await bindControlToAsset(Uri.file(axamlPath), snippets[tag].name, 'MatrixNames');
                } catch (e) {
                    t.fail(tag, 'itemsSource', `${label}: ${e.message}`);
                }
            }
        }
    }

    t.note(`${label}: code-behind wiring complete`);
}

// ── Build the TabControl XAML ──────────────────────────────────────────

/**
 * Populates MainWindow.axaml with a TabControl whose TabItems correspond to
 * toolbox categories.  Each tab carries a Canvas with every placeable control
 * from its category, placed via the production snippet.
 *
 * Returns { tabData, snippets } for the driver and code-behind phases.
 */
async function buildTabXaml(t, model, body, axamlPath, snippets, controls) {
    const tabCtl = model.addControl(body,
        `<TabControl x:Name="${TABCONTROL_NAME}" Width="760" Height="380"/>`,
        { x: 10, y: 10 });
    model.ensureChromeNamespace();
    model.ensureNames();

    // Create XYTracker2 (form-mode copy) from the XYTracker snippet.
    if (snippets.XYTracker) {
        const xy2Name = 'XYTracker2';
        const xy2Xaml = snippets.XYTracker.xaml.split(snippets.XYTracker.name).join(xy2Name);
        snippets.XYTracker2 = { name: xy2Name, xaml: xy2Xaml };
    }

    const tabData = [];
    for (const cat of TOOLBOX_CATEGORIES) {
        const catControls = controls.filter((c) => c.group === cat.group);
        if (catControls.length === 0) continue;

        const safe = cat.group.replace(/[^a-zA-Z0-9]/g, '');
        const canvasName = `${safe}Canvas`;
        const tabItem = model.createElement(
            `<TabItem Header="${cat.label}"><Canvas Name="${canvasName}"/></TabItem>`);
        tabCtl.appendChild(tabItem);

        const canvas = model.findByName(canvasName);
        if (!canvas) {
            t.fail(cat.label, 'tab-canvas', 'could not find canvas ' + canvasName);
            continue;
        }

        let ctrlNames = [];
        let px = 10, py = 10, rowH = 0;
        for (const c of catControls) {
            const snip = snippets[c.tag];
            if (!snip) continue;
            // ItemsControl ships with pre-populated TextBlock children; those
            // conflict with ItemsSource binding at runtime ("Items collection must
            // be empty before using ItemsSource").  Strip them, keep the element.
            let snippetXaml = snip.xaml;
            if (c.tag === 'ItemsControl') {
                const m = snippetXaml.match(/x:Name="([^"]*)"/);
                const nm = m ? m[1] : snip.name;
                snippetXaml = `<ItemsControl x:Name="${nm}" Width="140" Height="120"/>`;
            }
            let el;
            try {
                el = model.addControl(canvas, snippetXaml, { x: px, y: py });
            } catch (e) {
                t.fail(c.tag, 'place', `addControl threw: ${e.message}`);
                continue;
            }
            if (c.tag === 'Image') model.setProperty(el, 'Source', 'Assets/matrix.png');
            if (c.tag !== 'Separator') {
                model.setProperty(el, 'Width', COMMON_PROPS.Width);
                model.setProperty(el, 'Height', COMMON_PROPS.Height);
            }
            ctrlNames.push(snip.name);
            const w = parseInt(snip.xaml.match(/Width="(\d+)"/)?.[1] || COMMON_PROPS.Width, 10) || 120;
            const h = parseInt(snip.xaml.match(/Height="(\d+)"/)?.[1] || COMMON_PROPS.Height, 10) || 32;
            rowH = Math.max(rowH, h);
            px += w + 10;
            if (px > 700) { px = 10; py += rowH + 10; rowH = 0; }
        }

        // XYTracker2 goes on the Dev Helpers tab.
        if (snippets.XYTracker2 && cat.group === 'Dev Helpers') {
            const devCanvas = canvas;
            model.addControl(devCanvas, snippets.XYTracker2.xaml, { x: 400, y: 10 });
            ctrlNames.push(snippets.XYTracker2.name);
        }

        // Menu + File/Folder PathPickers go on the Bars tab.
        if (cat.group === 'Bars') {
            const menuBox = model.addControl(canvas,
                `<Menu x:Name="MatrixMenu" Width="300" Height="26"><MenuItem Header="File"/></Menu>`,
                { x: 10, y: 10 });
            if (menuBox) {
                for (const [pt, title, w] of [['File', 'Select a file', 160], ['Folder', 'Select a folder', 150]]) {
                    const picker = model.createElement(`<chrome:PathPicker PathType="${pt}" Width="${w}" Height="24"/>`);
                    picker.setAttribute('Title', title);
                    menuBox.appendChild(picker);
                }
                model.ensureChromeNamespace();
            }
        }

        tabData.push({ header: cat.label, controls: ctrlNames });
    }

    // Wire event attributes onto the control elements (needed before code-behind
    // wiring so the XAML references the handler names the code-behind defines).
    for (const [tag, ev] of EVENT_CHECKS) {
        const snip = snippets[tag];
        if (!snip) continue;
        const el = model.findByName(snip.name);
        if (el) {
            el.setAttribute(ev, `${snip.name}_${ev}`);
        }
    }

    fs.writeFileSync(axamlPath, model.serialize(true), 'utf8');
    return tabData;
}

// ── Run the harness for one language ───────────────────────────────────

async function runHarness(t, lang, appName, dir, tabData) {
    const label = lang === 'cs' ? 'C#' : 'VB.NET';
    const harnessDir = path.join(OUT_HARNESS, appName, 'Harness');
    const appProj = path.join(dir, appName + (lang === 'cs' ? '.csproj' : '.vbproj'));
    const namespace = appName;

    fs.rmSync(path.join(OUT_HARNESS, appName), { recursive: true, force: true });
    fs.mkdirSync(harnessDir, { recursive: true });

    fs.writeFileSync(path.join(harnessDir, 'Harness.csproj'), harnessCsproj(appName, appProj), 'utf8');
    fs.writeFileSync(path.join(harnessDir, 'Program.cs'), buildDriverSource(namespace, tabData), 'utf8');

    // Build the referenced project first (prevents build-order races — see T4 notes).
    if (checkPause()) { t.skip(lang, 'pause', 'paused before referenced-build'); return; }
    const pre = t.run(`dotnet build "${appProj}" -c Debug --no-incremental`, { cwd: harnessDir });
    t.ok(pre.ok, lang, 'referenced-project-builds',
        pre.ok ? '' : String(pre.output).slice(-600));
    if (await checkPauseAfterSignal()) { t.skip(lang, 'pause', 'paused after referenced-build'); return; }

    // Run the driver.
    t.note(`${label}: dotnet run Harness (${LIVE ? 'live' : 'headless'})…`);
    if (checkPause()) { t.skip(lang, 'pause', 'paused before driver-run'); return; }
    const r = t.run(`dotnet run --project "Harness.csproj" -c Debug --no-incremental`, { cwd: harnessDir });
    const out = r.output || '';
    t.ok(r.ok, lang, 'driver-exits-0', r.ok ? '' : out.slice(-800));
    if (await checkPauseAfterSignal()) { t.skip(lang, 'pause', 'paused after driver-run'); return; }
    const resultLine = out.match(/^RESULT \w+/m);
    t.ok(resultLine && resultLine[0] === 'RESULT PASS', lang, 'final-result',
        resultLine ? resultLine[0] : 'RESULT line missing');
    const failLines = (out.match(/^FAIL /gm) || []).length;
    t.equal(failLines, 0, lang, 'no-fail-lines', `FAIL count=${failLines}`);

    for (const name of ['window-created', 'tabcontrol-found', 'tab-count']) {
        t.ok(out.includes('PASS ' + name), lang, 'check:' + name,
            out.includes('FAIL ' + name) ? 'reported FAIL' : '');
    }
    const tabSelectedPass = (out.match(/^PASS tab-selected:/gm) || []).length;
    const tabItemPass = (out.match(/^PASS tab-item:/gm) || []).length;
    t.ok(tabSelectedPass > 0, lang, 'tabs-selected', `PASS tab-selected count=${tabSelectedPass}`);
    t.ok(tabItemPass > 0, lang, 'tab-items-found', `PASS tab-item count=${tabItemPass}`);
    const ctrlFoundPass = (out.match(/^PASS control-found:/gm) || []).length;
    const ctrlFoundFail = (out.match(/^FAIL control-found:/gm) || []).length;
    t.equal(ctrlFoundFail, 0, lang, 'all-controls-found',
        `found=${ctrlFoundPass} missing=${ctrlFoundFail}`);
    if (ctrlFoundPass > 0) {
        const ctrlSizeFail = (out.match(/^FAIL control-size:/gm) || []).length;
        t.equal(ctrlSizeFail, 0, lang, 'all-controls-sized', `FAIL control-size count=${ctrlSizeFail}`);
        t.note(`${label}: ${ctrlFoundPass} controls found and sized at runtime`);
    }
}

// ── Main test ──────────────────────────────────────────────────────────

module.exports = async (t) => {
    const controls = toolboxControls();
    t.equal(controls.length, 50, 'toolbox', 'all placeable visual controls enumerated',
        `count=${controls.length}: ${controls.map((c) => c.tag).join(', ')}`);
    t.note(`T6 config: T6_LANG=${LANG} T6_LIVE=${LIVE ? '1' : '0'} T6_RESUME=${RESUME ? '1' : '0'}`);

    if (checkPause()) { t.skip('all', 'init', 'test paused before starting'); return; }

    const langs = LANG === 'both' ? ['cs', 'vb'] : [LANG];
    const state = loadState();

    // Start the PreviewerHost.
    if (!fs.existsSync(HOST_BIN)) { t.note('building PreviewerHost…'); buildHost(); }
    const port = await freePort();
    const host = await startHost(port);

    // ── Phase: fetch snippets (shared, cached to disk for resume) ──────
    let snippets;
    if (!skipPhase(state, 'all', 'snippets')) {
        t.section('T6: fetching production snippets for all controls');
        snippets = {};
        for (const c of controls) {
            const r = await host.snippet(c.tag);
            snippets[c.tag] = { name: r.name, xaml: r.xaml };
            t.ok(!!r.name && !!r.xaml, 'snippet', c.tag, r.name || 'no-name');
        }
        // Cache to disk so resume doesn't re-fetch (counter would increment).
        fs.mkdirSync(path.dirname(SNIPPETS_CACHE), { recursive: true });
        fs.writeFileSync(SNIPPETS_CACHE, JSON.stringify(snippets), 'utf8');
        if (checkPause()) { t.skip('all', 'pause', 'paused after snippets'); host.close(); return; }
        markPhase(state, 'all', 'snippets');
    } else {
        snippets = JSON.parse(fs.readFileSync(SNIPPETS_CACHE, 'utf8'));
        t.note('resuming — snippets loaded from cache');
    }

    // Create XYTracker2 from the cached snippet (counter-safe).
    if (snippets.XYTracker) {
        snippets.XYTracker2 = {
            name: 'XYTracker2',
            xaml: snippets.XYTracker.xaml.split(snippets.XYTracker.name).join('XYTracker2')
        };
    }

    try {
        for (const lang of langs) {
            const label = lang === 'cs' ? 'C#' : 'VB.NET';
            const appName = lang === 'cs' ? 'AllControlsCs' : 'AllControlsVb';
            t.section(`T6: ${label} — TabControl with ${controls.length} controls across ${TOOLBOX_CATEGORIES.length} tabs`);

            const dir = path.join(OUT_PROJECTS, appName);
            const axamlPath = path.join(dir, 'MainWindow.axaml');
            const cbPath = path.join(dir, lang === 'cs' ? 'MainWindow.axaml.cs' : 'MainWindow.axaml.vb');

            // ── Phase: generate ──
            if (!skipPhase(state, lang, 'generate')) {
                const genDir = generateProject({ language: lang, tplId: 'blank', name: appName });
                t.note(`${lang}: project → ${genDir}`);
                fs.mkdirSync(path.join(dir, 'Assets'), { recursive: true });
                fs.writeFileSync(path.join(dir, 'Assets', 'matrix.png'), solidPng(64, 64, 0x33, 0x66, 0x99));
                // Ensure Assets are copied to the output dir so the runtime harness
                // can resolve Image Source="Assets/matrix.png".
                const projPath = path.join(dir, appName + (lang === 'cs' ? '.csproj' : '.vbproj'));
                let projXml = fs.readFileSync(projPath, 'utf8');
                const assetItem = `\n  <ItemGroup>\n    <AvaloniaResource Include="Assets\\matrix.png" />\n  </ItemGroup>\n`;
                if (!projXml.includes('Assets\\matrix.png') && !projXml.includes('Assets/matrix.png')) {
                    projXml = projXml.replace(/(<\/Project>)/, assetItem + '$1');
                    fs.writeFileSync(projPath, projXml, 'utf8');
                }
                // VB.NET defaults Class to Friend — the harness needs Public.
                if (lang === 'vb') {
                    let cb = fs.readFileSync(cbPath, 'utf8');
                    if (/^Class MainWindow\s*$/m.test(cb)) {
                        cb = cb.replace(/^Class MainWindow\s*$/m, 'Public Class MainWindow');
                        fs.writeFileSync(cbPath, cb, 'utf8');
                    }
                }
                if (checkPause()) { t.skip(lang, 'pause', 'paused after generate'); continue; }
                markPhase(state, lang, 'generate');
            } else {
                t.note(`${lang}: resuming — generate phase done`);
            }

            // ── Phase: build TabControl XAML ──
            let tabData;
            if (!skipPhase(state, lang, 'xaml')) {
                if (checkPause()) { t.skip(lang, 'pause', 'paused before xaml'); continue; }
                t.note(`${label}: building TabControl XAML with ${controls.length} controls…`);
                const model = new XamlModel(fs.readFileSync(axamlPath, 'utf8'));
                const body = model.findByName('Body');
                if (!body) { t.fail(lang, 'body', 'Body Canvas not found'); continue; }
                tabData = await buildTabXaml(t, model, body, axamlPath, snippets, controls);
                t.note(`${label}: ${tabData.length} tabs, ${tabData.reduce((s, d) => s + d.controls.length, 0)} placed controls`);
                if (checkPause()) { t.skip(lang, 'pause', 'paused after xaml'); continue; }
                markPhase(state, lang, 'xaml');
            } else {
                t.note(`${lang}: resuming — xaml phase done`);
                tabData = [];
                for (const cat of TOOLBOX_CATEGORIES) {
                    const catCtrls = controls.filter((c) => c.group === cat.group && snippets[c.tag]);
                    if (catCtrls.length === 0) continue;
                    tabData.push({ header: cat.label, controls: catCtrls.map((c) => snippets[c.tag].name) });
                }
                // Add XYTracker2 to Dev Helpers.
                const dh = tabData.find((d) => d.header === 'Dev Helpers');
                if (dh && snippets.XYTracker2 && !dh.controls.includes('XYTracker2')) dh.controls.push('XYTracker2');
            }

            // ── Phase: code-behind ──
            if (!skipPhase(state, lang, 'codebehind')) {
                if (checkPause()) { t.skip(lang, 'pause', 'paused before codebehind'); continue; }
                t.note(`${label}: wiring code-behind…`);
                await wireCodeBehind(t, lang, axamlPath, cbPath, snippets);
                markPhase(state, lang, 'codebehind');
                if (checkPause()) { t.skip(lang, 'pause', 'paused after codebehind'); continue; }
            }

            // ── Phase: compile ──
            if (!skipPhase(state, lang, 'compile')) {
                if (checkPause()) { t.skip(lang, 'pause', 'paused before compile'); continue; }
                t.note(`${label}: compiling all-controls project…`);
                const r = dotnetBuild(dir);
                await checkPauseAfterSignal();
                t.equal(r.errors, 0, lang, 'compile',
                    `all ${controls.length} controls + events + code-behind: errors=${r.errors} warnings=${r.warnings}`);
                if (r.warnings > 0) {
                    const warns = (r.output.match(/warning[^\n]*/gi) || []).slice(0, 8);
                    t.note(`${label} warnings:\n  - ` + warns.map((w) => w.trim()).join('\n  - '));
                }
                if (r.errors !== 0) {
                    const errs = r.output.split('\n').filter((l) => /error/i.test(l)).slice(0, 10);
                    t.note(`${label} errors:\n` + errs.join('\n\n').slice(0, 1500));
                } else {
                    // A NOTE, not a second PASS: the gate above already records this fact.
                    t.note(`${label}: compile clean — 0 errors / ${r.warnings} warnings, all ${controls.length} controls`);
                    markPhase(state, lang, 'compile');
                }
                if (await checkPauseAfterSignal()) { t.skip(lang, 'pause', 'paused after compile'); continue; }
            }

            // ── Phase: harness (build + run) ──
            if (!skipPhase(state, lang, 'harness')) {
                if (checkPause()) { t.skip(lang, 'pause', 'paused before harness'); continue; }
                t.note(`${label}: building + running the runtime driver (${LIVE ? 'live' : 'headless'})…`);
                await runHarness(t, lang, appName, dir, tabData);
                if (await checkPauseAfterSignal()) { t.skip(lang, 'pause', 'paused after harness'); continue; }
                markPhase(state, lang, 'harness');
            }
        }

        // Final report — only finalize if every language phase completed.
        const allDone = langs.every((lang) => state.phases[`${lang}:harness`] === true);
        const csOk = langs.includes('cs') && state.phases['cs:harness'] === true;
        const vbOk = langs.includes('vb') && state.phases['vb:harness'] === true;
        const parts = [];
        if (langs.includes('cs')) parts.push(csOk ? '✅ C#' : '❌ C#');
        if (langs.includes('vb')) parts.push(vbOk ? '✅ VB.NET' : '❌ VB.NET');
        t.note(`T6 summary: ${parts.join(' | ')}`);
        if (allDone) markPhase(state, 'all', 'report');

        // ── Phase: cleanup ── Remove all temporary build artefacts, keeping only reports.
        if (allDone && !skipPhase(state, 'all', 'cleanup')) {
            t.section('T6: cleaning up temporary build artefacts');
            const cleaned = [];
            for (const lang of langs) {
                const appName = lang === 'cs' ? 'AllControlsCs' : 'AllControlsVb';
                const p = path.join(OUT_PROJECTS, appName);
                if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); cleaned.push(appName); }
            }
            // Remove the entire t6-harness directory (covers both languages + any leftovers).
            if (fs.existsSync(OUT_HARNESS)) {
                fs.rmSync(OUT_HARNESS, { recursive: true, force: true });
                cleaned.push('t6-harness');
            }
            // Remove snippets cache.
            fs.rmSync(SNIPPETS_CACHE, { force: true });
            cleaned.push('t6-snippets.json');
            // Mark cleanup done FIRST, then remove the state file so it doesn't persist.
            markPhase(state, 'all', 'cleanup');
            fs.rmSync(STATE_FILE, { force: true });
            t.note(`T6 cleanup: removed ${cleaned.join(', ')} + state file`);
        }
    } finally {
        host.close();
    }
    t.note('T6 done');
};
