/* T2 — the Timer component, wired into the designer.
 *
 * Avalonia ships NO Timer control (verified against the shipped assemblies: `Avalonia.Base` and
 * `Avalonia.Controls` have no `Timer` type — what exists is the non-visual
 * `Avalonia.Threading.DispatcherTimer`), so the Toolbox offers the BUNDLED `AvaloniaChrome.Timer`,
 * which ticks on a WORKER thread (System.Timers.Timer) — the user's requirement, 2026-09-28: *"the
 * timer must run in a worker thread"*, so a slow handler cannot freeze the window.
 *
 * What is checked here is the wiring a unit test can see: the Toolbox/info/catalogue rows, the one
 * event (Tick, with its EventArgs type — that is what makes the generated VB stub compile), the
 * bundled-file spec (so an older copy in a project is refreshed), and the two twins' own shape. The
 * behaviour itself is proven on a running app in tests/t4-runtime/timer.test.js (real ticks, on a
 * non-UI thread, stopping at Stop() and at window close), and the tray UI in tests/t3-webview.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const { propertyDefsFor, PROP_SECTIONS } = require('../../out/propertyCatalog.js');
const { bundledComponentSpecs, isStaleBundledCopy } = require('../../out/bundledComponents.js');
const { DEFAULT_EVENT, eventsFor, eventArgsFor, asksForEventOnPlace } = require('../../out/controlEvents.js');
const { TOOLBOX_CATEGORIES, controlsForGroup } = require('../../out/toolboxProvider.js');
const { controlInfoFor } = require('../../out/controlInfo.js');
const { XamlModel } = require('../../out/xamlModel.js');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" xmlns:chrome="using:AvaloniaChrome"';

module.exports = async (t) => {
    t.section('Timer component');

    // ---------------------------------------------------------------- the Toolbox listing
    const all = TOOLBOX_CATEGORIES.flatMap((c) => controlsForGroup(c.group));
    const entry = all.find((c) => c.tag === 'Timer');
    t.ok(!!entry, 'toolbox', 'the Toolbox offers a Timer');
    t.equal(entry && entry.label, 'Timer', 'toolbox', 'labelled Timer');
    t.ok(!!entry && TOOLBOX_CATEGORIES.some((c) => c.group === entry.group), 'toolbox',
        'in a real category (' + (entry ? entry.group : '') + ')');
    const info = controlInfoFor('Timer');
    t.ok(!!info && info.desc.length > 40, 'toolbox', 'with an About-this-control entry');
    t.ok(/worker thread/i.test(info ? info.desc + ' ' + info.use : ''), 'toolbox',
        'that says the handler runs on a worker thread (the one thing a user must know)');

    // ---------------------------------------------------------------- the Properties rows
    const rows = propertyDefsFor(new XamlModel(`<Window ${NS}><Canvas Name="Body"><chrome:Timer x:Name="Timer1"/></Canvas></Window>`).findByName('Timer1'));
    const by = (k) => rows.find((r) => r.key === k);
    t.equal(by('Interval') && by('Interval').kind, 'number', 'props', 'Interval is a number row');
    t.equal(by('Interval') && by('Interval').value, '100', 'props',
        'defaulting to 100 ms — the WinForms Timer default');
    t.equal(by('Enabled') && by('Enabled').kind, 'dropdown', 'props', 'Enabled is a dropdown row');
    t.equal(by('Interval') && by('Interval').sectionId, 'behavior', 'props',
        'Interval is filed under Behavior (a component has no size, place or look)');
    t.equal(by('Enabled') && by('Enabled').sectionId, 'behavior', 'props', 'and so is Enabled');
    t.ok(!by('Width') && !by('Height'), 'props',
        'no Width/Height rows for a component that takes no space (and writes neither)');
    // A component has no layout / appearance / behavior of its own, so the panel MUST NOT offer the
    // common rows — only the two the Timer class actually declares (Interval + Enabled). The only
    // other rows are the identity rows (Name / Type), which describe the element itself.
    const propertyRows = rows.filter((r) => !r.key.startsWith('__'));
    t.equal(propertyRows.length, 2, 'props',
        'the component offers ONLY its own property rows — nothing from the common catalog leaks in');
    t.equal(propertyRows.map((r) => r.key).join(','), 'Interval,Enabled', 'props',
        'Interval and Enabled are the only rows the Timer carries');
    // …and NOT the Theme row either: it is a component's only Appearance row, and System/Custom is a
    // choice between two ways of colouring a control that draws nothing. It dragged a one-row
    // "Appearance" section onto the panel (asked 2026-09-30 to remove it).
    t.equal(rows.some((r) => r.key === '__theme__'), false, 'props',
        'no Theme row on a component — it has no colours for System/Custom to choose between');
    t.equal(rows.some((r) => r.sectionId === 'appearance'), false, 'props',
        'so the panel shows no Appearance section at all');
    t.equal(rows.some((r) => r.sectionId === 'layout'), false, 'props', 'and no Layout & size section');
    t.equal([...new Set(rows.map((r) => r.sectionId).filter(Boolean))].join(','), 'behavior', 'props',
        'Behavior is the only section a component has');
    for (const key of ['Margin', 'HorizontalAlignment', 'VerticalAlignment', 'IsVisible', 'IsEnabled',
        'IsHitTestVisible', 'IsTabStop', 'Focusable', 'TabIndex', 'Opacity', 'ZIndex',
        'Canvas.Left', 'Canvas.Top', 'chrome:AnchorHelper.Anchor']) {
        t.ok(!by(key), 'props', `no common ${key} row on a component that has no ${key.split('.').pop()}`);
    }
    // The two rows must name the component's OWN (CLR) properties — the bundled class declares them, and
    // a row for a property the class does not have would write XAML that fails to compile.
    const csText = read('resources/Timer.cs');
    for (const key of ['Interval', 'Enabled']) {
        t.ok(new RegExp(`public\\s+(double|bool)\\s+${key}\\b`).test(csText), 'props',
            `resources/Timer.cs declares ${key} as its own property`);
    }

    // ---------------------------------------------------------------- the one event
    t.equal(DEFAULT_EVENT['Timer'], 'Tick', 'events', 'placing a Timer wires Tick (its only event)');
    t.equal(JSON.stringify(eventsFor('Timer')), '["Tick"]', 'events', 'and Tick is the whole list');
    t.equal(eventArgsFor('Tick', 'Timer'), 'System.EventArgs', 'events',
        'the stub takes System.EventArgs — the component raises a plain EventHandler (VB is strict here)');
    // …and the PLACEMENT path must pass the control's tag, or that type is never looked up for it: the
    // form would then wire Tick to a handler taking RoutedEventArgs, which the Avalonia XAML compiler
    // rejects (AVLN3000) while the language server shows nothing — the user's app did not run (2026-09-29).
    t.ok(/insertHandlerIntoCodeBehind\(doc\.uri, handler, eventName, localName\(el\.tagName\)\)/.test(read('src/designerPanel.ts')),
        'events', 'the placement-time wiring passes the control tag (so Tick gets its own EventArgs)');
    t.equal(asksForEventOnPlace('Timer'), false, 'events',
        'a Timer is placed without an event dialog: there is exactly one event, and Tick is it');

    // ---------------------------------------------------------------- the bundled file
    const csSpec = bundledComponentSpecs(false).find((s) => s.kind === 'Timer');
    const vbSpec = bundledComponentSpecs(true).find((s) => s.kind === 'Timer');
    t.ok(!!csSpec && csSpec.file === 'Timer.cs', 'bundled', 'the C# file is Timer.cs');
    t.ok(!!vbSpec && vbSpec.file === 'Timer.vb', 'bundled', 'the VB file is Timer.vb');
    const cs = read('resources/Timer.cs');
    const vb = read('resources/Timer.vb');
    t.ok(cs.includes(csSpec.marker), 'bundled', 'the shipped C# copy carries the staleness marker');
    t.ok(vb.includes(vbSpec.marker), 'bundled', 'and so does the VB twin');
    t.equal(isStaleBundledCopy(cs, false, 'Timer', cs), false, 'bundled', 'the shipped C# copy is current');
    t.equal(isStaleBundledCopy(vb, true, 'Timer', vb), false, 'bundled', 'and the VB one too');
    t.ok(/BUNDLED-COPY: \d+\.\d+\.\d+/.test(cs.split('\n')[0]), 'bundled',
        'the C# file carries the release stamp its header promises');
    t.ok(/' BUNDLED-COPY: \d+\.\d+\.\d+/.test(vb.split('\n')[0]), 'bundled', 'the VB file too');
    // A copy that lacks the newest member (and one that differs at all) is refreshed — the rule the
    // whole bundled-file mechanism rests on, and the more so for a component nobody can see.
    const older = cs.replace('StartSuppressed', 'Ignored').replace(/BUNDLED-COPY: [\d.]+/, 'BUNDLED-COPY: 0.0.1');
    t.equal(isStaleBundledCopy(older, false, 'Timer', cs), true, 'bundled',
        'an older copy in a project IS reported (its ticks would differ with no visible clue)');

    // ---------------------------------------------------------------- the two twins agree
    // The worker thread is the whole point: System.Timers.Timer, never a DispatcherTimer.
    for (const [lang, text] of [['C#', cs], ['VB', vb]]) {
        t.ok(text.includes('System.Timers.Timer'), 'twins', `${lang}: ticks on a worker thread (System.Timers.Timer)`);
        t.ok(!/new\s+Avalonia\.Threading\.DispatcherTimer|Avalonia\.Threading\.DispatcherTimer\s*\{/.test(text),
            'twins', `${lang}: and NOT a DispatcherTimer (that would tick on the UI thread)`);
        t.ok(text.includes('StartSuppressed'), 'twins',
            `${lang}: the preview host can suppress it (a preview must not run timers)`);
        t.ok(text.includes('OnDetachedFromVisualTree'), 'twins',
            `${lang}: it stops when the form goes away`);
        t.ok(text.includes('AutoReset'), 'twins', `${lang}: it repeats (AutoReset), like the WinForms Timer`);
        t.ok(/100/.test(text), 'twins', `${lang}: 100 ms is the documented default`);
        t.ok(/IsVisible = False|IsVisible = false/.test(text), 'twins',
            `${lang}: the component declares itself invisible (it has no look of its own)`);
    }
    t.ok(/Tick\?\.Invoke\(this, EventArgs\.Empty\)/.test(cs), 'twins', 'C#: raises Tick with no event data');
    t.ok(/RaiseEvent Tick\(Me, EventArgs\.Empty\)/.test(vb), 'twins', 'VB: raises the same event the same way');
    // A throwing handler on a pool thread would kill the process, so it is traced instead.
    t.ok(/catch \(Exception ex\)/.test(cs) && /Catch ex As Exception/.test(vb), 'twins',
        'a throwing Tick handler is trapped (an exception on a pool thread would take the app down)');

    // ---------------------------------------------------------------- a new project gets the file
    const scaffold = read('src/projectScaffold.ts');
    t.ok(/timerCs\?: string;/.test(scaffold) && /timerVb\?: string;/.test(scaffold), 'scaffold',
        'the scaffold takes the two bundled Timer files');
    t.ok(/if \(timerCs\) write\(projectPath, 'Timer\.cs', timerCs\)/.test(scaffold), 'scaffold',
        'and writes Timer.cs for a C# project');
    t.ok(/if \(timerVb\) write\(projectPath, 'Timer\.vb', timerVb\)/.test(scaffold), 'scaffold',
        'and Timer.vb for a VB one');
    const creator = read('src/projectCreator.ts');
    t.ok(creator.includes("readResource(context, 'resources/Timer.cs')")
        && creator.includes("readResource(context, 'resources/Timer.vb')"), 'scaffold',
        'New Project reads both from the extension resources');

    // ---------------------------------------------------------------- the designer + host wiring
    const panel = read('src/designerPanel.ts');
    t.ok(/const COMPONENT_TAGS = NON_VISUAL_TAGS;/.test(panel), 'panel',
        'the panel takes the shared NON_VISUAL_TAGS list (one source of truth with the catalogue)');
    t.ok(/components: componentRowsOf\(doc\.model\)/.test(panel), 'panel',
        'every frame carries the components for the tray (they have no bounds to send as controls)');
    t.ok(/COMPONENT_TAGS\.has\(msg\.tag\)[\s\S]{0,400}?removeAttribute\('Canvas\.Left'\)/.test(panel), 'panel',
        'a dropped component loses the drop position — it has no place to be');
    t.ok(/private ensureTimerHelper\(/.test(panel)
        && /ensureBundledFileIn\([\s\S]{0,200}?'Timer',/.test(panel), 'panel',
        'and the bundled file is copied in the moment one is dropped');

    // ---------------------------------------------------------------- where the tray SITS
    // Reported after the first build: *"The chip strip sits between the canvas and the properties. Move to
    // bottom of canvas please."* It WAS a sibling of #canvasWrap, so the flex row made it a third column.
    // It now lives inside the canvas column (#canvasArea), last child, hugging the bottom of the design
    // surface. The nesting is what decides that, so the nesting is what this checks — counting the open
    // tags before it, since a sibling would also fall between the same two markers in the source.
    const mainTo = panel.slice(panel.indexOf('<div id="main">'), panel.indexOf('id="props"'));
    const beforeTray = mainTo.slice(0, mainTo.indexOf('id="componentTray"'));
    const depth = (beforeTray.match(/<div\b/g) || []).length - (beforeTray.match(/<\/div>/g) || []).length;
    t.ok(depth >= 1, 'tray',
        `the tray is INSIDE the canvas column (depth ${depth}), not a sibling of it — the column is #canvasArea`);
    t.ok(/id="canvasArea"/.test(mainTo) && mainTo.indexOf('id="canvasWrap"') < mainTo.indexOf('id="componentTray"'),
        'tray', 'and it comes after the scrolling design surface in that column');
    const css = read('media/designer.css');
    t.ok(/#canvasArea\s*\{[^}]*flex-direction:\s*column/s.test(css), 'tray',
        'the canvas column is a column flex box (canvas on top, tray at the bottom)');
    t.ok(/#canvasWrap\s*\{[^}]*min-height:\s*0/s.test(css), 'tray',
        'the scrolling surface is allowed to shrink inside it (so the tray never pushes it off screen)');
    t.ok(/#componentTray\s*\{[^}]*flex:\s*0\s+0\s+auto/s.test(css), 'tray',
        'and the strip keeps its own height instead of being squeezed');
    t.ok(/'Timer',\s*\n?\s*'the form holds a timer/.test(panel), 'panel',
        'with the reason spelled out in the notice it shows');

    const csproj = read('host/PreviewerHost.csproj');
    t.ok(csproj.includes('../resources/Timer.cs'), 'host', 'the preview host links the bundled Timer.cs');
    const factory = read('host/ControlFactory.cs');
    t.ok(/\["Timer"\] = n => \$"<chrome:Timer x:Name=/.test(factory), 'host',
        'and offers the chrome:Timer snippet the Toolbox drops');
    t.ok(!/Interval="\d+" Enabled="True"/.test(factory), 'host',
        'which starts DISABLED, like the WinForms Timer in the designer');
    t.ok(/\["Timer"\] = typeof\(AvaloniaChrome\.Timer\)/.test(factory), 'host',
        'the tag maps to the real type (so the builder never stands in for it)');
    const program = read('host/Program.cs');
    t.ok(/AvaloniaChrome\.Timer\.StartSuppressed = true/.test(program), 'host',
        'the preview host suppresses timers — a frame per keystroke must not leave them running');
    t.ok(read('src/hostClient.ts').includes("'Timer.cs'"), 'host',
        'and a host built without the file is treated as needing a rebuild');
};
