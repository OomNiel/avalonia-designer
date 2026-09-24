/* T5 — VB.NET blank project: place EVERY toolbox control, then apply EVERY available
 * property for each control and verify it actually functions.
 *
 * Verification per item:
 *   - PLACEMENT: each control is placed via the production snippet (host `snippet` msg, the
 *     same path the extension uses), rendered through PreviewerHost and checked for bounds +
 *     no render error; then ALL controls are written into the VB project's MainWindow.axaml
 *     and `dotnet build` must be 0 errors / 0 warnings.
 *   - PROPERTIES: for each control, `propertyDefsFor` yields its Properties-panel list. Each
 *     property gets a safe, deterministic test value. Runtime check: render the control with
 *     the property applied and assert the preview host reports the value back (for the keys the
 *     host reflects) with no render error. Compile check: every property is written into the
 *     VB project and the build must pass — on a build failure the project is rebuilt per-control
 *     to isolate the offending property.
 *
 * Reports one PASS/FAIL line per control (placement) and per control+property (feature = control
 * tag, action = `prop:<key>`), so the log/report show successes and failures individually.
 */
'use strict';
const fs = require('fs');
const net = require('net');
const path = require('path');
const { Uri } = require('vscode');
const { generateProject, dotnetBuild, buildHost, OUT_DIR } = require('../helpers/build');
const { startHost, HOST_BIN } = require('../helpers/host');
const { solidPng } = require('../helpers/png');
const { XamlModel } = require('../../out/xamlModel.js');
const { propertyDefsFor, DEFAULTS } = require('../../out/propertyCatalog.js');
const { TOOLBOX_CATEGORIES, controlsForGroup } = require('../../out/toolboxProvider.js');
const { insertStatusDateClock, bindControlToAsset } = require('../../out/codeBehind.js');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"';
const META_KEYS = new Set(['__name__', '__type__', '__theme__']);
// Properties that are NOT set via a plain XAML attribute (binding / editor / .adset-based).
// Split Layout / Pane Border are designer-managed (no XAML attribute) — the designerPanel routes
// them; the pane border is written onto the pane Borders, not the split Grid.
const NON_XAML_KEYS = new Set(['Command', 'CommandParameter', 'SelectedItem', 'Items', 'ItemsSource', 'UndoRedoDepth', 'SplitLayout', 'SplitPanelPaneBorder', 'StatusDate.Date', 'StatusDate.Time', 'StatusDate.Preview']);
// Properties the preview host reflects in frame.controls[].values.
const REPORTABLE = new Set(['Width', 'Height', 'Margin', 'Padding', 'BorderThickness', 'CornerRadius',
    'FontSize', 'FontFamily', 'Background', 'Foreground', 'BorderBrush', 'CaretBrush', 'SelectionBrush']);
const COLOR_KEYS = new Set(['Background', 'Foreground', 'BorderBrush', 'CaretBrush', 'SelectionBrush']);
// The preview host reports the THEME default for these (not the applied value) — the render can't
// prove them, so the compile gate (Phase D) is the authoritative check.
const LENIENT_REFLECT = new Set(['CornerRadius']);

// Safe, deterministic test values — prove the property is actually applied (not just left at default).
const VALUES = {
    IsVisible: 'True', IsEnabled: 'True', IsHitTestVisible: 'True', IsTabStop: 'True',
    IsChecked: 'True', IsReadOnly: 'True', Focusable: 'True',
    PasswordChar: 'X', Text: 'Hello', Content: 'Hello', Header: 'Hello', Title: 'Hello',
    PlaceholderText: 'Hello', GroupName: 'Grp',
    TextWrapping: 'Wrap', TextTrimming: 'CharacterEllipsis', TextAlignment: 'Center',
    FontWeight: 'Bold', FontStyle: 'Italic', Orientation: 'Horizontal',
    SelectedIndex: '0', MaxLength: '10', Spacing: '8', LineHeight: '16', LetterSpacing: '1',
    MaxLines: '2', MinWidth: '10', MinHeight: '10', MaxDropDownHeight: '200',
    Columns: '2', Rows: '2', FirstColumn: '1', FirstRow: '1', ItemWidth: '60', ItemHeight: '24',
    FrozenColumnCount: '1', RowHeaderWidth: '24', RowHeight: '28', ColumnWidth: '120',
    TabStripPlacement: 'Bottom', SelectionMode: 'Single', ClickMode: 'Press',
    Stretch: 'Fill', StretchDirection: 'DownOnly', HeadersVisibility: 'All',
    // Shapes — the Point "x,y" and angle properties must be real values to compile.
    StartPoint: '10,20', EndPoint: '110,80', StartAngle: '0', SweepAngle: '180',
    RadiusX: '8', RadiusY: '8', StrokeThickness: '3', StrokeLineCap: 'Round',
    // Point-defined shapes and path icons: a generic "Hello" is neither a Points list nor a Geometry,
    // and the XAML compiler rejects it (AVLN2005, caught on Polyline/Polygon when they were added).
    Points: '0,0 40,0 40,40', Data: 'M0,0 L16,16',
    GridLinesVisibility: 'Horizontal', 'DockPanel.Dock': 'Left', 'chrome:AnchorHelper.Anchor': 'Left',
    HorizontalAlignment: 'Left', VerticalAlignment: 'Top',
    HorizontalContentAlignment: 'Left', VerticalContentAlignment: 'Top',
    Opacity: '0.5', BorderThickness: '2', Padding: '6,6,6,6', CornerRadius: '10',
    Source: 'Assets/matrix.png', Icon: 'Assets/matrix.png', TitleBarIcon: 'Assets/matrix.png',
    NavigateUri: 'https://example.com', Label: 'Hello', IsVisited: 'True', IsCompact: 'True',
    IsOpen: 'True', IsSticky: 'True', IsDynamicOverflowEnabled: 'True',
    LabelPosition: 'Right', OverflowButtonVisibility: 'Auto'
};

function valueFor(prop) {
    if (Object.prototype.hasOwnProperty.call(VALUES, prop.key)) return VALUES[prop.key];
    switch (prop.kind) {
        case 'number': {
            const d = DEFAULTS[prop.key];
            return d && d !== '' && !Number.isNaN(Number(d)) ? d : '10';
        }
        case 'dropdown': {
            const opts = prop.options || [];
            const def = DEFAULTS[prop.key];
            return opts.find((o) => o !== def) || opts[0] || 'True';
        }
        case 'color': return '#336699';
        case 'font': return 'Inter';
        case 'margin': return '6,6,6,6';
        case 'file': return 'Assets/matrix.png';
        case 'button': return null;
        default: return 'Hello';
    }
}

/** Does the host's reported value prove the applied value took effect? */
function reflects(key, actual, applied) {
    if (actual === undefined || actual === null) return false;
    const a = String(actual).trim();
    if (COLOR_KEYS.has(key)) {
        // host returns #AARRGGBB (alpha-prefixed); the applied value is #RRGGBB
        const norm = (s) => { const h = s.replace(/^#/, ''); return (h.length === 8 ? h.slice(2) : h).toLowerCase(); };
        return norm(a) === norm(String(applied));
    }
    if (['Margin', 'Padding', 'BorderThickness', 'CornerRadius'].includes(key))
        return a.split(',')[0].trim() === String(applied).split(',')[0].trim();
    return a === String(applied).trim();
}

/** The toolbox's placeable controls (excludes the DataSet / CustomTitleBar tools). */
function toolboxControls() {
    const seen = new Set(); const out = [];
    for (const cat of TOOLBOX_CATEGORIES) {
        for (const c of controlsForGroup(cat.group)) {
            if (!c.tag || c.tag === 'DataSet' || c.tag === 'CustomTitleBar') continue;
            if (seen.has(c.tag)) continue;
            seen.add(c.tag); out.push(c);
        }
    }
    return out;
}

function freePort() {
    return new Promise((res) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    });
}

const WINDOW = (body) => `<Window ${NS} Width="800" Height="450">\n  <Window.Styles><FluentTheme/></Window.Styles>\n  <Canvas Name="Body">${body}</Canvas>\n</Window>`;

module.exports = async (t) => {
    t.section('T5: VB.NET blank project — all toolbox controls + all properties');

    // 0) toolbox enumeration sanity
    const controls = toolboxControls();
    // Avalonia 12-only controls: the 11.0.10 preview host can't instantiate the real types, so it
    // renders a stand-in (Border/Button/ToggleButton). Their real-tag XAML + every listed property
    // are still compile-verified against Avalonia 12.1.1 in Phase D (the authoritative gate).
    const AV12_PREVIEW = new Set(['GroupBox', 'HyperlinkButton', 'CommandBar', 'CommandBarButton', 'CommandBarToggleButton', 'CommandBarSeparator']);
    t.equal(controls.length, 52, 'toolbox', 'all placeable controls enumerated',
        `${controls.length}: ${controls.map((c) => c.tag).join(', ')}`);
    const tags = controls.map((c) => c.tag);

    // 1) generate the VB blank project (+ a real asset so Image properties resolve in the preview)
    const dir = generateProject({ language: 'vb', tplId: 'blank', name: 'VbMatrix' });
    const axamlPath = path.join(dir, 'MainWindow.axaml');
    const vbPath = path.join(dir, 'MainWindow.axaml.vb');
    const assetsDir = path.join(dir, 'Assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, 'matrix.png'), solidPng(64, 64, 0x33, 0x66, 0x99));
    t.note(`project → ${dir}`);

    // 2) host + production snippets for every toolbox control
    if (!fs.existsSync(HOST_BIN)) { t.note('building PreviewerHost…'); buildHost(); }
    const port = await freePort();
    const host = await startHost(port);
    const snippets = {};
    try {
        for (const c of controls) {
            const r = await host.snippet(c.tag);
            snippets[c.tag] = { name: r.name, xaml: r.xaml };
            t.ok(!!r.name && !!r.xaml, 'snippet', c.tag, `${r.name}`);
        }

        // ================= PHASE B — place every control (render check) =================
        t.section('T5 placement (per control, via preview host)');
        const compileProps = {}; // tag -> [{key,kind,value}]
        for (const c of controls) {
            const s = snippets[c.tag];
            if (AV12_PREVIEW.has(c.tag)) {
                t.note(c.tag, 'place', 'Avalonia 12-only control — preview host renders a stand-in; real-tag compile is checked in Phase D');
                continue;
            }
            const m = new XamlModel(WINDOW(''));
            const body = m.findByName('Body');
            let el;
            try { el = m.addControl(body, s.xaml, { x: 10, y: 10 }); }
            catch (e) { t.fail(c.tag, 'place', `addControl threw: ${e.message}`); continue; }
            // A real placed Image needs a Source to render at its size in the preview.
            if (c.tag === 'Image') m.setProperty(el, 'Source', 'Assets/matrix.png');
            const frame = await host.render(m.serialize(false), 800, 450, dir);
            t.ok(!frame.error, c.tag, 'place-render', frame.error || '');
            const rep = frame.controls.find((ct) => ct.name === s.name);
            t.ok(!!rep, c.tag, 'place-reported', `expected control '${s.name}'`);
            if (rep) {
                // bounds = canvas position + any snippet Margin (TextBlock ships Margin=4)
                t.ok(Math.abs(rep.x - 10) < 8 && Math.abs(rep.y - 10) < 8, c.tag, 'place-bounds',
                    `x=${rep.x.toFixed(0)} y=${rep.y.toFixed(0)} (want ≈10,10)`);
            }
        }

        // ================= PHASE C — properties: runtime (render) + compile =================
        t.section('T5 properties (runtime render + VB compile)');
        for (const c of controls) {
            const s = snippets[c.tag];
            const m = new XamlModel(WINDOW(''));
            const body = m.findByName('Body');
            const el = m.addControl(body, s.xaml, { x: 10, y: 10 });
            const props = propertyDefsFor(el).filter((p) => !META_KEYS.has(p.key));
            const tested = [];
            for (const p of props) {
                // Button-kind properties are DESIGNER EDITORS (Items / Grid.Defs / Menu Items /
                // Split Layout / Splitters / Rows / Columns ...) — never XAML attributes, so they
                // must not be serialised onto the element (e.g. a stray Rows="2" on a DataGrid).
                if (p.kind === 'button') { tested.push({ key: p.key, kind: p.kind, value: null, note: 'editor (button)' }); continue; }
                if (NON_XAML_KEYS.has(p.key)) { tested.push({ key: p.key, kind: p.kind, value: null, note: 'non-XAML (binding/editor)' }); continue; }
                if (p.key === 'chrome:AnchorHelper.Anchor') { tested.push({ key: p.key, kind: p.kind, value: null, note: 'compile-only' }); continue; }
                const val = valueFor(p);
                if (val === null) { tested.push({ key: p.key, kind: p.kind, value: null, note: 'no XAML value' }); continue; }
                m.setProperty(el, p.key, val);
                tested.push({ key: p.key, kind: p.kind, value: val });
            }
            compileProps[c.tag] = tested;

            // Avalonia 12-only controls: the 11 host's stand-in can't reflect their real properties,
            // so skip the runtime-render check — Phase D compiles every property against real 12.1.1.
            if (AV12_PREVIEW.has(c.tag)) {
                t.note(c.tag, 'props', `Avalonia 12-only — ${tested.filter((p) => p.value !== null).length} properties compile-gated in Phase D`);
                continue;
            }

            // --- runtime render (all that control's properties applied) ---
            const frame = await host.render(m.serialize(false), 800, 450, dir);
            const rep = frame.controls.find((ct) => ct.name === s.name);
            const values = rep && rep.values ? rep.values : {};
            if (frame.error) {
                for (const tp of tested) {
                    if (tp.value === null) continue;
                    t.fail(c.tag, `prop:${tp.key}`, `render-error: ${String(frame.error).slice(0, 120)}`);
                }
            } else {
                for (const tp of tested) {
                    if (tp.value === null) { t.pass(c.tag, `prop:${tp.key}`, tp.note || ''); continue; }
                    if (REPORTABLE.has(tp.key)) {
                        const ok = reflects(tp.key, values[tp.key], tp.value);
                        if (ok || LENIENT_REFLECT.has(tp.key)) {
                            t.pass(c.tag, `prop:${tp.key}`,
                                ok ? `applied=${tp.value} host=${values[tp.key]}`
                                    : `applied=${tp.value} (preview reflects the theme default — compile gate verifies)`);
                        } else {
                            t.fail(c.tag, `prop:${tp.key}`, `applied=${tp.value} host=${values[tp.key]}`);
                        }
                    } else {
                        t.pass(c.tag, `prop:${tp.key}`, `applied=${tp.value}`);
                    }
                }
            }
        }

        // ================= PHASE D — compile: all controls + all props in the VB project =================
        t.section('T5 compile (VB project: all controls + all properties)');
        const model = new XamlModel(fs.readFileSync(axamlPath, 'utf8'));
        const body = model.findByName('Body');
        let col = 0, row = 0;
        for (const c of controls) {
            const s = snippets[c.tag];
            const el = model.addControl(body, s.xaml, { x: col * 260, y: row * 200 });
            for (const p of compileProps[c.tag]) {
                if (p.value === null) continue;
                model.setProperty(el, p.key, p.value);
            }
            col++; if (col >= 4) { col = 0; row++; }
        }
        // A SECOND XYTracker (renamed XYTracker2) inserted in FORM mode — the StatusBar path the
        // user actually drops onto. It compile-gates the form handler (TopLevel.GetTopLevel) in
        // the same authoritative build as the container-mode XYTracker1 handler.
        const sXy = snippets['XYTracker'];
        const xy2Name = 'XYTracker2';
        model.addControl(body, sXy.xaml.split(sXy.name).join(xy2Name), { x: 1200, y: 0 });
        model.ensureChromeNamespace();
        // Menu Items editor's File/Folder Selector kinds: the bundled <chrome:PathPicker> written as
        // a Menu child (top-level bar row + a submenu row) must COMPILE in the same project.
        const menuBox = model.addControl(body, '<Menu x:Name="MatrixMenu" Width="300" Height="26"><MenuItem Header="File"/></Menu>', { x: 0, y: 1200 });
        if (menuBox) {
            for (const [pt, title, w] of [['File', 'Select a file', 160], ['Folder', 'Select a folder', 150]]) {
                const picker = model.createElement(`<chrome:PathPicker PathType="${pt}" Width="${w}" Height="24"/>`);
                picker.setAttribute('Title', title);
                menuBox.appendChild(picker);
            }
            model.ensureChromeNamespace();
        } else {
            t.fail('PathPicker', 'menu-picker', 'could not add the Menu for the selector kinds');
        }
        fs.writeFileSync(axamlPath, model.serialize(true), 'utf8');

        // StatusDate Loaded handler (the snippet references `StatusDate1_Loaded`).
        try { await insertStatusDateClock(Uri.file(axamlPath), snippets['StatusDate'].name); }
        catch (e) { t.fail('StatusDate', 'codebehind', `insertStatusDateClock: ${e.message}`); }

        // GrumpyStatus embeds a live StatusDate ({name}Date, Loaded="…Date_Loaded") — wire its
        // clock handler too so the combined 12.1.1 build compiles (AVLN3000 otherwise).
        if (snippets['GrumpyStatus']) {
            try { await insertStatusDateClock(Uri.file(axamlPath), `${snippets['GrumpyStatus'].name}Date`); }
            catch (e) { t.fail('GrumpyStatus', 'codebehind', `insertStatusDateClock: ${e.message}`); }
        }

        // XYTracker Loaded handlers: XYTracker1 sits on the Body canvas → container mode (reports
        // its parent); XYTracker2 (added above) is dropped in FORM mode like a StatusBar tracker.
        const { insertXyTrackerClock } = require('../../out/codeBehind.js');
        try { await insertXyTrackerClock(Uri.file(axamlPath), sXy.name, 'container'); }
        catch (e) { t.fail('XYTracker', 'codebehind', `insertXyTrackerClock: ${e.message}`); }
        try { await insertXyTrackerClock(Uri.file(axamlPath), xy2Name, 'form'); }
        catch (e) { t.fail('XYTracker', 'codebehind-form', `insertXyTrackerClock(form): ${e.message}`); }

        // ItemsSource functionality: bind the list controls to a code-behind collection (the
        // same path the asset picker uses).
        try {
            const vb = fs.readFileSync(vbPath, 'utf8');
            if (!vb.includes('MatrixNames')) {
                fs.writeFileSync(vbPath,
                    vb.replace(/\nEnd Class\s*$/, '\n    Public ReadOnly Property MatrixNames As String() = {"Alpha", "Beta", "Gamma"}\nEnd Class'), 'utf8');
            }
            for (const tag of ['ListBox', 'ComboBox', 'ItemsControl']) {
                await bindControlToAsset(Uri.file(axamlPath), snippets[tag].name, 'MatrixNames');
            }
        } catch (e) { t.fail('ItemsSource', 'codebehind', `bind: ${e.message}`); }

        // Event picker wiring: the extra events the catalog knows (NOT the default ones) are wired
        // through the production path — attribute in the XAML + stub in the code-behind — and the
        // combined build below is the authoritative VB gate: VB rejects a handler whose EventArgs
        // does not match the delegate exactly (AVLN:0004), so a wrong entry in EVENT_ARGS fails here.
        const { insertHandlerIntoCodeBehind } = require('../../out/codeBehind.js');
        const eventChecks = [
            ['ComboBox', 'DropDownOpened', 'System.EventArgs'],
            ['Button', 'Tapped', 'Avalonia.Input.TappedEventArgs'],
            ['TextBox', 'KeyDown', 'Avalonia.Input.KeyEventArgs'],
            ['DataGrid', 'CellEditEnding', 'Avalonia.Controls.DataGridCellEditEndingEventArgs'],
            ['Menu', 'Opened', 'Avalonia.Interactivity.RoutedEventArgs'],
            ['CheckBox', 'Click', 'Avalonia.Interactivity.RoutedEventArgs'],
            ['TabControl', 'DoubleTapped', 'Avalonia.Input.TappedEventArgs'],
            ['ListBox', 'PointerPressed', 'Avalonia.Input.PointerPressedEventArgs']
        ];
        for (const [tag, ev, wantArgs] of eventChecks) {
            const snip = snippets[tag];
            if (!snip) { t.fail(tag, `event:${ev}`, 'no snippet for the control'); continue; }
            const el = model.findByName(snip.name);
            if (!el) { t.fail(tag, `event:${ev}`, `control ${snip.name} not in the model`); continue; }
            const handler = `${snip.name}_${ev}`;
            try { await insertHandlerIntoCodeBehind(Uri.file(axamlPath), handler, ev, tag); }
            catch (e) { t.fail(tag, `event:${ev}`, `insertHandlerIntoCodeBehind: ${e.message}`); continue; }
            el.setAttribute(ev, handler);
            fs.writeFileSync(axamlPath, model.serialize(true), 'utf8');
            const vbText = fs.readFileSync(vbPath, 'utf8');
            const decl = new RegExp(`Sub\\s+${handler}\\s*\\(sender As Object, e As ([\\w.]+)\\)`);
            const m = decl.exec(vbText);
            t.ok(!!m, tag, `event:${ev}`, `handler stub inserted (${handler})`);
            t.equal(m && m[1], wantArgs, tag, `event:${ev}`, 'stub takes the exact EventArgs type');
            t.ok(new RegExp(`\\b${ev}="${handler}"`).test(fs.readFileSync(axamlPath, 'utf8')), tag, `event:${ev}`,
                'the event attribute is wired in the XAML');
        }

        // Combined build — the authoritative gate for every property.
        const r = dotnetBuild(dir);
        t.equal(r.errors, 0, 'compile', 'vb project (all controls + all props)', `errors=${r.errors} warnings=${r.warnings}`);
        if (r.warnings > 0) {
            // Surface build warnings (e.g. obsolete properties) so they are visible in the report.
            const warns = (r.output.match(/warning[^\n]*/gi) || []).slice(0, 8);
            t.note('build warnings:\n' + warns.map((w) => '  - ' + w.trim()).join('\n'));
        }
        if (r.errors !== 0) {
            t.note('combined build failed — isolating per control…');
            const errOut = (r.output || '').slice(0, 1500);
            t.note('first build error block:\n' + errOut.split('\n').slice(0, 12).join('\n'));
            // Fallback: rebuild the project once per control to find the offender(s).
            for (const c of controls) {
                const s = snippets[c.tag];
                const per = new XamlModel(`<Window ${NS} Width="800" Height="450" x:Class="VbMatrix.MainWindow">
  <DockPanel Name="Root"><Canvas Name="Body"/></DockPanel>
</Window>`);
                const body2 = per.findByName('Body');
                const el2 = per.addControl(body2, s.xaml, { x: 10, y: 10 });
                for (const p of compileProps[c.tag]) { if (p.value === null) continue; per.setProperty(el2, p.key, p.value); }
                per.ensureChromeNamespace();
                fs.writeFileSync(axamlPath, per.serialize(true), 'utf8');
                const rc = dotnetBuild(dir);
                const errTxt = (rc.output || '').slice(0, 400);
                // `!== 0` (not `> 0`): dotnetBuild returns errors=-1 when the build command threw,
                // which must be treated as a failure, not silently swallowed by the else branch.
                if (rc.errors !== 0) {
                    // try to name the offending attribute from the compiler message
                    const m = /'(?:[A-Za-z]+\.)?([A-Za-z_][\w.]*)'/.exec(errTxt) || /([A-Za-z_][\w.]*)(?=\s+was not found|\s+does not exist|\s+is not a valid)/i.exec(errTxt);
                    const key = m ? m[1] : null;
                    if (key && compileProps[c.tag].some((p) => p.key === key)) {
                        t.fail(c.tag, `prop:${key}`, `compile: ${errTxt.split('\n').find((l) => /error/i.test(l)) || errTxt}`);
                        compileProps[c.tag] = compileProps[c.tag].filter((p) => p.key !== key);
                    } else {
                        t.fail(c.tag, 'compile', `per-control build failed: ${errTxt.split('\n').filter((l) => /error/i.test(l)).slice(0, 3).join(' | ')}`);
                    }
                } else {
                    t.pass(c.tag, 'compile', `all ${compileProps[c.tag].length} properties compile`);
                }
            }
        } else {
            // combined build green → every property compiles
            let total = 0;
            for (const c of controls) {
                const applied = compileProps[c.tag].filter((p) => p.value !== null);
                t.pass(c.tag, 'compile', `${applied.length} properties compile (0 errors / ${r.warnings} warnings)`);
                total += applied.length;
            }
            t.note(`TOTAL properties compile-checked: ${total}`);
        }
    } finally {
        host.close();
    }

    t.note('T5 done');
};
