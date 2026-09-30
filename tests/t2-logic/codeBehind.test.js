/* T2 — codeBehind: asset binding (C#/VB), DataSet binding + unbind (delete cleanup),
 * ItemsSource find/remove, VB accessor sync, handler insert, Chrome conversion, default events. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Uri } = require('vscode');
const {
    bindControlToAsset, bindControlToDataSet, unbindControlFromDataSet,
    hasDataSetBinding, findItemsSourceBinding, removeItemsSourceBinding,
    insertHandlerIntoCodeBehind, findHandlerInCodeBehind, convertCodeBehindToChrome, hasDefaultEvent, defaultEventFor, handlerChoice,
    findCodeBehindFile,
    removeHandlersFromCodeBehind,
    applyAccessors,
    bindImageToGrid, hasDataImageBinding, unbindImageFromGrid
} = require('../../out/codeBehind.js');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"';
const AXAML = `<Window ${NS} x:Class="Proj.TestForm" Width="800" Height="450">
  <DockPanel Name="Root">
    <Canvas Name="Body">
      <Button x:Name="btnTest" Content="A" Click="btnTest_Click"/>
      <ListBox x:Name="lstTest"/>
    </Canvas>
  </DockPanel>
</Window>`;

const CS_BEHIND = `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    public TestForm()
    {
        InitializeComponent();
    }
    private void btnTest_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
    }
}
`;

const VB_BEHIND = `Imports Avalonia.Controls

Namespace Proj
    Public Class TestForm
        Inherits Window

        Public Sub New()
            InitializeComponent()
        End Sub

        Private Sub btnTest_Click(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)
        End Sub
    End Class
End Namespace
`;

function tmpProject(language) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-codebehind-'));
    fs.writeFileSync(path.join(dir, 'Proj.csproj'), '<Project Sdk="Microsoft.NET.Sdk"/>\n');
    const axamlPath = path.join(dir, 'TestForm.axaml');
    fs.writeFileSync(axamlPath, AXAML);
    fs.writeFileSync(path.join(dir, language === 'cs' ? 'TestForm.axaml.cs' : 'TestForm.axaml.vb'),
        language === 'cs' ? CS_BEHIND : VB_BEHIND);
    return { dir, uri: Uri.file(axamlPath), read: () => fs.readFileSync(path.join(dir, language === 'cs' ? 'TestForm.axaml.cs' : 'TestForm.axaml.vb'), 'utf8') };
}

module.exports = async (t) => {
    t.section('codeBehind');

    // --- default events ---
    t.equal(defaultEventFor('Button'), 'Click', 'default-event', 'Button');
    t.equal(defaultEventFor('TextBox'), 'TextChanged', 'default-event', 'TextBox');
    t.equal(defaultEventFor('ListBox'), 'SelectionChanged', 'default-event', 'ListBox');
    t.equal(defaultEventFor('Panel'), 'DoubleTapped', 'default-event', 'fallback');
    t.ok(hasDefaultEvent('Button') && !hasDefaultEvent('Panel'), 'default-event', 'hasDefaultEvent');

    // --- middle-click decision: nothing wired / one / several ---
    t.equal(handlerChoice([]).mode, 'none', 'handler-choice', 'no wired handler → wire the default');
    t.equal(handlerChoice([{ event: 'Click', handler: 'btn1_Click' }]).mode, 'one', 'handler-choice',
        'a single handler → open it directly (no dialog)');
    t.equal(handlerChoice([{ event: 'Click', handler: 'btn1_Click' }]).handler, 'btn1_Click', 'handler-choice',
        'the single handler is returned');
    t.equal(handlerChoice([{ event: 'Click', handler: 'a' }, { event: 'Loaded', handler: 'b' }]).mode, 'many',
        'handler-choice', 'several handlers → let the user choose');
    t.equal(handlerChoice([{ event: 'Click', handler: 'a' }, { event: 'Tapped', handler: 'b' }]).wired.length, 2,
        'handler-choice', 'the chooser gets them all');
    {
        const list = [{ event: 'Click', handler: 'a' }, { event: 'Loaded', handler: 'b' }];
        const choice = handlerChoice(list);
        list.push({ event: 'KeyDown', handler: 'c' });
        t.equal(choice.wired.length, 2, 'handler-choice', 'the choice is a snapshot, not a live view');
    }

    // --- C# asset binding (ItemsSource = expr) ---
    {
        const p = tmpProject('cs');
        const file = await bindControlToAsset(p.uri, 'lstTest', 'nameslist');
        t.ok(!!file, 'asset-bind', 'cs returns path');
        t.ok(p.read().includes('lstTest.ItemsSource = nameslist;'), 'asset-bind', 'cs line written');
        t.equal(findItemsSourceBinding(p.uri, 'lstTest'), 'nameslist', 'asset-bind', 'findItemsSourceBinding round-trip');
        await removeItemsSourceBinding(p.uri, 'lstTest');
        t.ok(!p.read().includes('lstTest.ItemsSource'), 'asset-bind', 'cs line removed');
    }

    // --- VB asset binding writes line + syncs named-control accessors ---
    {
        const p = tmpProject('vb');
        await bindControlToAsset(p.uri, 'lstTest', 'planets');
        t.ok(p.read().includes('lstTest.ItemsSource = planets'), 'asset-bind', 'vb line written');
        t.ok(/Private ReadOnly Property lstTest As ListBox/.test(p.read()), 'asset-bind', 'vb accessor added');
        t.equal(findItemsSourceBinding(p.uri, 'lstTest'), 'planets', 'asset-bind', 'vb find round-trip');
        await removeItemsSourceBinding(p.uri, 'lstTest');
        t.ok(!p.read().includes('lstTest.ItemsSource'), 'asset-bind', 'vb line removed');
    }

    // --- Data-Image binding loads via the bundled EXIF-aware ExifImageLoader (JPEGs upright),
    //     not a plain Bitmap(path) — which ignores the EXIF Orientation tag (portrait JPEGs
    //     would render sideways while PNGs stay upright). Bind/unbind must round-trip. ---
    {
        const p = tmpProject('cs');
        const ref = { datasetName: 'D', tableName: 'Family', controlName: 'Image1', gridName: 'DataGrid1', column: 'Image' };
        const file = await bindImageToGrid(p.uri, ref);
        t.ok(!!file, 'data-image', 'cs bind returns a path');
        const cs = p.read();
        t.ok(cs.includes('Image1.Source = ExifImageLoader.LoadImageOriented(row.Image);'), 'data-image', 'cs loads via ExifImageLoader.LoadImageOriented');
        t.ok(!cs.includes('new Avalonia.Media.Imaging.Bitmap(row.Image)'), 'data-image', 'cs no longer uses a plain Bitmap(path)');
        t.ok(hasDataImageBinding(p.uri, 'Image1'), 'data-image', 'cs hasDataImageBinding true');
        await unbindImageFromGrid(p.uri, 'Image1');
        t.ok(!hasDataImageBinding(p.uri, 'Image1'), 'data-image', 'cs unbind removes the binding');
    }
    {
        const p = tmpProject('vb');
        const ref = { datasetName: 'D', tableName: 'Family', controlName: 'Image1', gridName: 'DataGrid1', column: 'Image' };
        await bindImageToGrid(p.uri, ref);
        const vb = p.read();
        t.ok(vb.includes('Image1.Source = ExifImageLoader.LoadImageOriented(row.Image)'), 'data-image', 'vb loads via ExifImageLoader.LoadImageOriented');
        t.ok(!vb.includes('New Avalonia.Media.Imaging.Bitmap(row.Image)'), 'data-image', 'vb no longer uses a plain Bitmap(path)');
        t.ok(hasDataImageBinding(p.uri, 'Image1'), 'data-image', 'vb hasDataImageBinding true');
        await unbindImageFromGrid(p.uri, 'Image1');
        t.ok(!hasDataImageBinding(p.uri, 'Image1'), 'data-image', 'vb unbind removes the binding');
    }

    // --- VB shape accessors: a shape control gets an accessor AND the Shapes namespace import ---
    // (Line/Rectangle/Ellipse/Arc live in Avalonia.Controls.Shapes — without the import the VB
    // code-behind fails with BC30002 "Type 'Line' is not defined".)
    {
        const vb = `Imports Avalonia.Controls\n\nClass MainWindow\n    Inherits Window\n\n    Public Sub New()\n        InitializeComponent()\n    End Sub\nEnd Class\n`;
        const withLine = applyAccessors(vb, [
            { name: 'Line2', type: 'Line' },
            { name: 'Rectangle2', type: 'Rectangle' },
            { name: 'Button1', type: 'Button' }
        ]);
        t.ok(/Private ReadOnly Property Line2 As Line/.test(withLine), 'shape-accessor', 'Line accessor added');
        t.ok(/Private ReadOnly Property Rectangle2 As Rectangle/.test(withLine), 'shape-accessor', 'Rectangle accessor added');
        t.ok(/^Imports Avalonia\.Controls\.Shapes$/m.test(withLine), 'shape-accessor', 'Shapes namespace imported');
        t.ok(/^Imports Avalonia\.Controls$/m.test(withLine), 'shape-accessor', 'Avalonia.Controls still imported');
        // no shapes → no Shapes import (and a plain control stays clean)
        const noShape = applyAccessors(vb, [{ name: 'Button1', type: 'Button' }]);
        t.ok(!/Imports Avalonia\.Controls\.Shapes/.test(noShape), 'shape-accessor', 'no Shapes import without shapes');
        t.ok(/Private ReadOnly Property Button1 As Button/.test(noShape), 'shape-accessor', 'Button accessor still added');
    }

    // --- VB BOM + duplicate-import corruption (issue 4) ---
    // Older versions didn't handle a leading U+FEFF: they prepended imports BEFORE the BOM and
    // re-added duplicates, leaving stray invisible BOMs mid-file (right before an Imports line).
    // applyAccessors must normalise every BOM, dedupe the imports it manages and restore a single
    // BOM at the very front (only if the file originally had one).
    const countLines = (s, re) => (s.match(re) || []).length;
    {
        // A fresh VB file that happens to start with a BOM (external editor/tool wrote it).
        const bomVb = '\uFEFFImports Avalonia.Controls\n\nClass MainWindow\n    Inherits Window\n\n    Public Sub New()\n        InitializeComponent()\n    End Sub\nEnd Class\n';
        const out = applyAccessors(bomVb, [
            { name: 'Line2', type: 'Line' },
            { name: 'Button1', type: 'Button' }
        ]);
        t.equal(out.charCodeAt(0), 0xFEFF, 'vb-bom', 'single BOM preserved at the very front');
        t.equal(countLines(out, /^Imports Avalonia\.Controls\.Shapes$/gm), 1, 'vb-bom', 'exactly ONE Shapes import');
        // The first Controls import carries the BOM, so allow an optional leading BOM on the line.
        t.equal(countLines(out, /^\uFEFF?Imports Avalonia\.Controls$/gm), 1, 'vb-bom', 'exactly ONE Controls import');
        // no stray BOM anywhere else in the file (only index 0)
        const bomPositions = [];
        for (let i = 0; i < out.length; i++) if (out.charCodeAt(i) === 0xFEFF) bomPositions.push(i);
        t.equal(JSON.stringify(bomPositions), '[0]', 'vb-bom', 'no mid-file BOMs');
        t.ok(/Private ReadOnly Property Line2 As Line/.test(out), 'vb-bom', 'Line accessor still added');
        // the Shapes import comes BEFORE the Controls import (top of file, after the BOM)
        t.ok(/^\uFEFFImports Avalonia\.Controls\nImports Avalonia\.Controls\.Shapes\n/m.test(out), 'vb-bom', 'imports ordered at top');
    }
    {
        // An ALREADY-CORRUPTED file: stray BOM sits before a mid-file Imports line and the
        // imports were duplicated by earlier buggy runs.
        const corrupt = 'Imports Avalonia.Controls.Shapes\nImports Avalonia.Controls\n\uFEFFImports Avalonia.Controls\n\nClass MainWindow\n    Inherits Window\n\n    Public Sub New()\n        InitializeComponent()\n    End Sub\nEnd Class\n';
        const out = applyAccessors(corrupt, [
            { name: 'Ellipse3', type: 'Ellipse' }
        ]);
        t.equal(out.charCodeAt(0) === 0xFEFF, false, 'vb-bom', 'no BOM added to a BOM-less file');
        t.equal(countLines(out, /^Imports Avalonia\.Controls\.Shapes$/gm), 1, 'vb-bom', 'duplicates collapsed to ONE Shapes import');
        t.equal(countLines(out, /^Imports Avalonia\.Controls$/gm), 1, 'vb-bom', 'duplicates collapsed to ONE Controls import');
        t.ok(!/\uFEFF/.test(out), 'vb-bom', 'mid-file BOM removed');
        t.ok(out.indexOf('Imports Avalonia.Controls.Shapes') > out.indexOf('Imports Avalonia.Controls'), 'vb-bom', 'Shapes after Controls');
    }

    // --- C# DataSet binding + detection + unbind (delete cleanup path) ---
    {
        const p = tmpProject('cs');
        const b = { controlName: 'lstTest', controlType: 'ListBox', tableName: 'Customers', datasetName: 'Store' };
        await bindControlToDataSet(p.uri, b);
        t.ok(p.read().includes('lstTest.ItemsSource = Customers;'), 'dataset-bind', 'cs ItemsSource line');
        t.ok(p.read().includes('public System.Collections.Generic.List<CustomersRow> Customers => Store.GetCustomers();'), 'dataset-bind', 'cs typed property');
        t.ok(hasDataSetBinding(p.uri, b), 'dataset-bind', 'hasDataSetBinding true');
        await unbindControlFromDataSet(p.uri, b);
        t.ok(!p.read().includes('Store.GetCustomers()'), 'dataset-bind', 'cs property removed');
        t.ok(!p.read().includes('lstTest.ItemsSource = Customers'), 'dataset-bind', 'cs line removed');
    }

    // --- VB DataSet binding + unbind ---
    {
        const p = tmpProject('vb');
        const b = { controlName: 'lstTest', controlType: 'ListBox', tableName: 'Customers', datasetName: 'Store' };
        await bindControlToDataSet(p.uri, b);
        t.ok(p.read().includes('lstTest.ItemsSource = Customers'), 'dataset-bind', 'vb ItemsSource line');
        t.ok(/Public ReadOnly Property Customers As System.Collections.Generic.List\(Of CustomersRow\)/.test(p.read()), 'dataset-bind', 'vb typed property');
        t.ok(hasDataSetBinding(p.uri, b), 'dataset-bind', 'vb hasDataSetBinding true');
        await unbindControlFromDataSet(p.uri, b);
        t.ok(!p.read().includes('Store.GetCustomers()'), 'dataset-bind', 'vb property removed');
    }

    // --- un-bind puts the code-behind BACK, in every shape ---
    // Asked for directly (2026-09-27): "Unbinding must also remove the code behind added by the binding
    // process". The binding adds an import (`using System.Data;`, plus System.Collections.ObjectModel for
    // a DataGrid) and the un-bind left it behind for ever — a plain form kept two usings it never had.
    // So the assertion is the strongest one available: bind, un-bind, and the file is BYTE-IDENTICAL to
    // what it was before. Anything the binding adds and the un-bind forgets breaks this.
    for (const language of ['cs', 'vb']) {
        for (const controlType of ['ListBox', 'DataGrid']) {
            const p = tmpProject(language);
            const before = p.read();
            const b = { controlName: controlType === 'DataGrid' ? 'gridTest' : 'lstTest', controlType, tableName: 'Customers', datasetName: 'Store' };
            await bindControlToDataSet(p.uri, b);
            const bound = p.read();
            const importLine = language === 'cs' ? 'using System.Data;' : 'Imports System.Data';
            t.ok(bound.includes(importLine), 'dataset-unbind',
                `${language}/${controlType}: the binding brought its import in`);
            t.ok(bound !== before, 'dataset-unbind', `${language}/${controlType}: and the code-behind changed`);
            await unbindControlFromDataSet(p.uri, b);
            t.equal(p.read(), before, 'dataset-unbind',
                `${language}/${controlType}: un-bind removes the binding's import along with its lines`);
            t.ok(!p.read().includes(importLine), 'dataset-unbind',
                `${language}/${controlType}: and does not leave the import behind`);
        }
    }
    // ... but an import something else still needs is KEPT: the user's own code (or a second bound
    // control in the same form) may be using it, and dropping it would break their build.
    {
        const p = tmpProject('cs');
        const b = { controlName: 'lstTest', controlType: 'ListBox', tableName: 'Customers', datasetName: 'Store' };
        // The form imports System.Data and uses DataView ITSELF: the un-bind must not take that import
        // away just because the binding has gone.
        const withDataView = `using Avalonia.Controls;
using System.Data;
namespace Proj;
public partial class TestForm : Window
{
    private DataView? _mine;
    public DataView? Mine => _mine;

    public TestForm()
    {
        InitializeComponent();
    }
}
`;
        fs.writeFileSync(path.join(p.dir, 'TestForm.axaml.cs'), withDataView);
        await bindControlToDataSet(p.uri, b);
        t.ok(p.read().includes('lstTest.ItemsSource = Customers;'), 'dataset-unbind',
            'cs: the form with its own DataView still binds');
        await unbindControlFromDataSet(p.uri, b);
        t.ok(p.read().includes('using System.Data;'), 'dataset-unbind',
            'cs: `System.Data` stays when the form itself still uses DataView');
        t.ok(!p.read().includes('lstTest.ItemsSource'), 'dataset-unbind', 'cs: while the binding is gone');
        t.ok(p.read().includes('DataView? Mine'), 'dataset-unbind', 'cs: and the form\'s own code is untouched');
    }

    // --- deleting one of the nine Toolbox controls added 2026-09-19 leaves nothing behind ---
    // Asked for directly: "check that all the added controls remove its code behind when deleted".
    // The delete path sweeps the handlers the XAML wired (removeHandlersFromCodeBehind) and any
    // orphaned `<Name>_<Event>` method (removeOrphanedHandlersForControls), and — through
    // notifyEdit's named-control signature check — the VB accessors, whose rebuild also re-syncs the
    // Shapes/AvaloniaChrome imports. None of it is per control, which is why these nine needed no
    // delete-path code of their own; this pins that for each of them.
    {
        const { applyAccessors, removeOrphanedHandlersForControls } = require('../../out/codeBehind.js');
        const NEW_CONTROLS = ['ProgressBar', 'Slider', 'Separator', 'Polyline', 'Polygon', 'PathIcon',
            'ToggleSwitch', 'MaskedTextBox', 'NumericUpDown'];

        for (const tag of NEW_CONTROLS) {
            // C#: there are no accessors to remove (the XAML compiler generates the fields), so the
            // only code a placed control creates is the handler the designer wires for it.
            const p = tmpProject('cs');
            await insertHandlerIntoCodeBehind(p.uri, `${tag}1_ValueChanged`, 'ValueChanged');
            t.ok(p.read().includes(`${tag}1_ValueChanged`), 'delete-cleanup',
                `cs ${tag}: wiring an event creates its handler`);
            await removeOrphanedHandlersForControls(p.uri, [`${tag}1`], new Set());
            t.ok(!p.read().includes(`${tag}1_ValueChanged`), 'delete-cleanup',
                `cs ${tag}: deleting the control removes that handler`);
        }

        // The Timer's Tick is a plain EventHandler, so its stub MUST take System.EventArgs — and the
        // handler signature is not cosmetic: the Avalonia XAML compiler rejects a mismatched one while
        // the language server does not (2026-09-29: the user's demo app showed a clean PROBLEMS pane and
        // failed `dotnet build` with AVLN3000 on its `Tick="Timer1_Tick"` attribute, so it could never
        // run). The TAG carries the EventArgs type — which is why the placement-time wiring has to pass
        // it, and why this test drives the writer both ways.
        for (const lang of ['cs', 'vb']) {
            const withTag = tmpProject(lang);
            await insertHandlerIntoCodeBehind(withTag.uri, 'Timer1_Tick', 'Tick', 'Timer');
            const line = withTag.read().split('\n').find((l) => l.includes('Timer1_Tick')) || '';
            t.ok(/System\.EventArgs/.test(line), 'timer-events',
                `${lang}: the Timer's Tick stub takes System.EventArgs (the component raises EventHandler)`);
            t.ok(!/RoutedEventArgs/.test(line), 'timer-events',
                `${lang}: and never RoutedEventArgs — that signature does not compile against it`);
            const noTag = tmpProject(lang);
            await insertHandlerIntoCodeBehind(noTag.uri, 'Timer1_Tick', 'Tick');
            const bare = noTag.read().split('\n').find((l) => l.includes('Timer1_Tick')) || '';
            t.ok(/RoutedEventArgs/.test(bare), 'timer-events',
                `${lang}: without the control's tag the stub falls back to RoutedEventArgs (the old bug)`);
        }

        // VB: a named control gets a FindControl accessor, and Shapes/AvaloniaChrome imports when the
        // type needs them — all of which must go with the control.
        const vbBase = `Imports Avalonia.Controls
Namespace Proj
    Public Class TestForm
        Inherits Window
        Public Sub New()
            InitializeComponent()
        End Sub
    End Class
End Namespace
`;
        const placed = applyAccessors(vbBase,
            NEW_CONTROLS.map((tag) => ({ name: `${tag}1`, type: tag })).concat([{ name: 'Button1', type: 'Button' }]));
        for (const tag of NEW_CONTROLS) {
            t.ok(placed.includes(`Property ${tag}1 As ${tag}`), 'delete-cleanup',
                `vb ${tag}: placing it adds a FindControl accessor`);
        }
        t.ok(/^Imports Avalonia\.Controls\.Shapes$/m.test(placed), 'delete-cleanup',
            'vb: a Polyline/Polygon pulls in the Shapes import');

        // The nine are deleted; Button1 stays (a form always has other named controls, which is also
        // what keeps the import rebuild running).
        const after = applyAccessors(placed, [{ name: 'Button1', type: 'Button' }]);
        for (const tag of NEW_CONTROLS) {
            t.ok(!after.includes(`${tag}1`), 'delete-cleanup', `vb ${tag}: deleting it removes the accessor`);
        }
        t.ok(!/Avalonia\.Controls\.Shapes/.test(after), 'delete-cleanup',
            'vb: and the Shapes import goes with the last shape');
        t.ok(/^Imports Avalonia\.Controls$/m.test(after), 'delete-cleanup',
            'vb: the always-needed Controls import stays');
    }

    // --- Code Fix: comment out code that uses a control the form no longer has (2026-09-19) ---
    // Asked for as a rule of its own. The point is that nothing of the user's code disappears: the
    // statement stays visible, commented, with a TODO marker saying why — because "why is this line
    // grey?" has to be answerable from the line itself.
    {
        const os = require('os');
        const { applyLocalFix } = require('../../out/codeBehindCheck.js');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'removed-control-'));
        const form = '<Window xmlns="https://github.com/avaloniaui" x:Class="Proj.Form"><Canvas Name="Body"><Button x:Name="Button1"/></Canvas></Window>';
        const axamlPath = path.join(dir, 'Form.axaml');
        fs.writeFileSync(axamlPath, form, 'utf8');
        const uri = { fsPath: axamlPath, path: axamlPath, toString: () => `file://${axamlPath}` };
        const csPath = path.join(dir, 'Form.axaml.cs');
        const lines = (...body) => ['namespace Proj {', '    public partial class Form {', '        void Go() {',
            ...body, '        }', '    }', '}', ''].join('\n');

        fs.writeFileSync(csPath, lines('            Slider1.Value = 5;', '            Button1.Content = "ok";'), 'utf8');
        const report = await applyLocalFix(uri, { kind: 'comment-out-control-code', data: { control: 'Slider1' } });
        const after = fs.readFileSync(csPath, 'utf8');
        t.ok(/\/\/ TODO: "Slider1" is no longer on the form/.test(after), 'comment-out',
            'the marker on the line says why it went grey');
        t.ok(/\/\/\s+Slider1\.Value = 5;/.test(after), 'comment-out', 'the statement is still there, commented out');
        t.equal(/^\s*Slider1\.Value/m.test(after), false, 'comment-out', 'so the build no longer sees it');
        t.ok(/^\s*Button1\.Content/m.test(after), 'comment-out', 'a control the form still has is untouched');
        t.ok(/Commented out 1 statement/.test(report), 'comment-out', 'and the fix reports what it did');

        // The repair loop retries until the build is clean, so a second run must change nothing.
        const again = await applyLocalFix(uri, { kind: 'comment-out-control-code', data: { control: 'Slider1' } });
        t.equal(again, 'No statements using "Slider1" were found to comment out.', 'comment-out',
            'a second run finds nothing left to do');
        t.equal(fs.readFileSync(csPath, 'utf8'), after, 'comment-out', 'and leaves the file byte-identical');

        // A statement split over two lines has to go inert whole — half of it would be a syntax error.
        fs.writeFileSync(csPath, lines('            Slider1.Value =', '                5;', '            Button1.Content = "ok";'), 'utf8');
        await applyLocalFix(uri, { kind: 'comment-out-control-code', data: { control: 'Slider1' } });
        const multi = fs.readFileSync(csPath, 'utf8');
        t.equal(/^\s*5;/m.test(multi), false, 'comment-out', 'a two-line statement is commented out as a whole');
        t.ok(/^\s*Button1\.Content/m.test(multi), 'comment-out', 'and the statement after it is still live');

        // VB: the designer's own FindControl accessor is never commented (syncVbAccessors drops it once
        // the references are gone) — but the statement that uses Slider1 is.
        const vbAxaml = path.join(dir, 'VbForm.axaml');
        fs.writeFileSync(vbAxaml, form.replace('Proj.Form', 'Proj.VbForm'), 'utf8');
        const vbUri = { fsPath: vbAxaml, path: vbAxaml, toString: () => `file://${vbAxaml}` };
        const vbPath = path.join(dir, 'VbForm.axaml.vb');
        fs.writeFileSync(vbPath, [
            'Imports Avalonia.Controls', 'Namespace Proj', '    Public Class VbForm', '        Inherits Window',
            '        Private ReadOnly Property Slider1 As Slider', '            Get',
            '                Return Me.FindControl(Of Slider)("Slider1")', '            End Get',
            '        End Property', '        Public Sub New()', '            InitializeComponent()',
            '            Slider1.Value = 5', '        End Sub', '    End Class', 'End Namespace', ''
        ].join('\n'), 'utf8');
        const vbReport = await applyLocalFix(vbUri, { kind: 'comment-out-control-code', data: { control: 'Slider1' } });
        const vbAfter = fs.readFileSync(vbPath, 'utf8');
        t.ok(/' TODO: "Slider1" is no longer on the form/.test(vbAfter), 'comment-out',
            'VB spells the marker with an apostrophe');
        t.ok(/'\s+Slider1\.Value = 5/.test(vbAfter), 'comment-out', 'and comments the VB statement');
        t.ok(/Private ReadOnly Property Slider1 As Slider/.test(vbAfter), 'comment-out',
            "the designer's own accessor is left for syncVbAccessors to drop");
        t.ok(/Commented out 1 statement/.test(vbReport), 'comment-out', 'with the same one-line report');
    }

    // --- and the fix clears its OWN finding (reported 2026-09-19) ---
    // "That works but still raises a PROBLEM entry" — the commented-out line still said `ProgressBar1.`,
    // so the rule re-reported exactly what it had just fixed, and no amount of re-running cleared it.
    // The rule now scans a comment-blanked copy of the file (same offsets), which is what makes the
    // round trip end quiet.
    {
        const os = require('os');
        const { applyLocalFix, analyzeCodeBehind } = require('../../out/codeBehindCheck.js');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'removed-control-recheck-'));
        const axamlPath = path.join(dir, 'Form.axaml');
        fs.writeFileSync(axamlPath,
            '<Window xmlns="https://github.com/avaloniaui" x:Class="Proj.Form"><Canvas Name="Body"><Button x:Name="Button1"/></Canvas></Window>',
            'utf8');
        const uri = { fsPath: axamlPath, path: axamlPath, toString: () => `file://${axamlPath}` };
        const csPath = path.join(dir, 'Form.axaml.cs');
        fs.writeFileSync(csPath, ['namespace Proj {', '    public partial class Form {', '        void Go() {',
            '            ProgressBar1.Value = 5;', '        }', '    }', '}', ''].join('\n'), 'utf8');

        const found = (r) => r.issues.filter((i) => i.kind === 'comment-out-control-code');
        t.equal(found(analyzeCodeBehind(uri, {})).length, 1, 'comment-out-recheck',
            'a use of a control the form does not have is reported');
        await applyLocalFix(uri, { kind: 'comment-out-control-code', data: { control: 'ProgressBar1' } });
        t.ok(/TODO: "ProgressBar1"/.test(fs.readFileSync(csPath, 'utf8')), 'comment-out-recheck',
            'the fix comments the statement out');
        t.equal(found(analyzeCodeBehind(uri, {})).length, 0, 'comment-out-recheck',
            'and the finding is GONE afterwards — a commented-out reference is not a problem');
        t.ok(/ProgressBar1/.test(fs.readFileSync(csPath, 'utf8')), 'comment-out-recheck',
            'while the code itself is still there to read');
    }

    // --- handler insertion (C# + VB) ---
    {
        const p = tmpProject('cs');
        const r = await insertHandlerIntoCodeBehind(p.uri, 'newHandler', 'Click');
        t.ok(!!r, 'handler', 'cs inserted');
        t.ok(/void newHandler\(/.test(p.read()), 'handler', 'cs method present');
    }
    {
        const p = tmpProject('vb');
        const r = await insertHandlerIntoCodeBehind(p.uri, 'newHandler', 'Click');
        t.ok(!!r, 'handler', 'vb inserted');
        t.ok(/Sub newHandler\(/.test(p.read()), 'handler', 'vb method present');
    }

    // --- middle-click NAVIGATE: findHandlerInCodeBehind locates an existing handler WITHOUT
    //     writing anything (placement owns creation; middle-click just jumps to it). ---
    {
        // CS fixture already contains `private void btnTest_Click(`.
        const p = tmpProject('cs');
        const loc = findHandlerInCodeBehind(p.uri, 'btnTest_Click');
        t.ok(!!loc && loc.cursorOffset >= 0, 'find-handler', 'cs finds the existing handler');
        t.equal((p.read().match(/btnTest_Click\s*\(/g) || []).length, 1, 'find-handler', 'cs file untouched (no re-insert)');
        // A missing handler is reported as absent (so the fallback can create it).
        t.equal(findHandlerInCodeBehind(p.uri, 'nope_Click'), undefined, 'find-handler', 'cs absent handler -> undefined');
    }
    {
        // VB fixture already contains `Private Sub btnTest_Click(`.
        const p = tmpProject('vb');
        const loc = findHandlerInCodeBehind(p.uri, 'btnTest_Click');
        t.ok(!!loc && loc.cursorOffset >= 0, 'find-handler', 'vb finds the existing handler');
        t.equal((p.read().match(/btnTest_Click\s*\(/gi) || []).length, 1, 'find-handler', 'vb file untouched (no re-insert)');
        t.equal(findHandlerInCodeBehind(p.uri, 'nope_Click'), undefined, 'find-handler', 'vb absent handler -> undefined');
    }

    // --- no duplicate when the existing handler was hand-edited to a DIFFERENT accessibility /
    //     modifier (the classic "middle-click still inserts code-behind" duplicate). ---
    {
        const p = tmpProject('cs');
        const alt = p.read().replace('private void btnTest_Click(', 'public async void btnTest_Click(');
        fs.writeFileSync(path.join(p.dir, 'TestForm.axaml.cs'), alt);
        const loc = findHandlerInCodeBehind(p.uri, 'btnTest_Click');
        t.ok(!!loc, 'find-handler', 'cs recognises a public async handler');
        const r = await insertHandlerIntoCodeBehind(p.uri, 'btnTest_Click', 'Click');
        t.ok(!!r, 'find-handler', 'cs insert still returns a location');
        t.equal((p.read().match(/btnTest_Click\s*\(/g) || []).length, 1, 'find-handler', 'cs NO duplicate for public async handler');
    }
    {
        const p = tmpProject('vb');
        const alt = p.read().replace('Private Sub btnTest_Click(', 'Public Shared Sub btnTest_Click(');
        fs.writeFileSync(path.join(p.dir, 'TestForm.axaml.vb'), alt);
        const loc = findHandlerInCodeBehind(p.uri, 'btnTest_Click');
        t.ok(!!loc, 'find-handler', 'vb recognises a Public Shared handler');
        const r = await insertHandlerIntoCodeBehind(p.uri, 'btnTest_Click', 'Click');
        t.ok(!!r, 'find-handler', 'vb insert still returns a location');
        t.equal((p.read().match(/btnTest_Click\s*\(/gi) || []).length, 1, 'find-handler', 'vb NO duplicate for Public Shared handler');
    }

    // --- Chrome conversion of code-behind (both languages) ---
    {
        const p = tmpProject('cs');
        await convertCodeBehindToChrome(p.uri);
        t.ok(p.read().includes('public partial class TestForm : AvaloniaChrome.ChromeWindow'), 'chrome-convert', 'cs base class');
    }
    {
        const p = tmpProject('vb');
        await convertCodeBehindToChrome(p.uri);
        t.ok(p.read().includes('Inherits AvaloniaChrome.ChromeWindow'), 'chrome-convert', 'vb base class (fully qualified)');
    }

    // --- Deleting a VB handler that CONTAINS a nested anonymous Sub (the XY-Tracker / StatusDate
    //     timer `AddHandler … Sub(s2, e2) … End Sub`) must remove the WHOLE method — the inner
    //     `End Sub` must not truncate it and leave `timer.Start()/End Sub` behind. ---
    {
        const p = tmpProject('vb');
        const vbWithClock = `Imports Avalonia.Controls

Namespace Proj
    Public Class TestForm
        Inherits Window

        Public Sub New()
            InitializeComponent()
        End Sub

        Private Sub XYTracker1_Loaded(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)
            Dim timer As New Avalonia.Threading.DispatcherTimer With {.Interval = TimeSpan.FromMilliseconds(200)}
            AddHandler timer.Tick, Sub(s2, e2)
                Dim c = TryCast(sender, Avalonia.Controls.Control)
                Dim p = TryCast(c.Parent, Avalonia.Visual)
                If p IsNot Nothing Then
                    XYTracker1.Text = String.Format(System.Globalization.CultureInfo.InvariantCulture, "{0:0} x {1:0} px", p.Bounds.Width, p.Bounds.Height)
                End If
            End Sub
            timer.Start()
        End Sub

        Private Sub btnTest_Click(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)
        End Sub
    End Class
End Namespace
`;
        fs.writeFileSync(path.join(p.dir, 'TestForm.axaml.vb'), vbWithClock);
        await removeHandlersFromCodeBehind(p.uri, ['XYTracker1_Loaded']);
        const vb = p.read();
        t.ok(!/XYTracker1_Loaded/.test(vb), 'vb-remove-nested', 'whole XYTracker handler removed');
        t.ok(!/timer\.Start\(\)/.test(vb), 'vb-remove-nested', 'no timer.Start() leftover');
        t.ok(/btnTest_Click/.test(vb), 'vb-remove-nested', 'a later sibling handler survives');
    }

    // --- findCodeBehindFile: cached, but re-validated on every call (Phase 2d) ---
    // Asked from ~35 places (twice per code-behind check, inside the panel's text-change handler, and
    // in the "nothing yet -> create the file -> look again" flow), and it used to read EVERY sibling
    // .cs/.vb body to compare class declarations — a few hundred KB on a real form folder. The cache
    // must never answer from a stale read, and the flow that creates the file first must see it.
    {
        const p = tmpProject('cs');
        const first = findCodeBehindFile(p.uri);
        t.ok(!!first && first.endsWith('TestForm.axaml.cs'), 'cb-cache',
            'resolves the convention-named file that declares the class');
        t.equal(findCodeBehindFile(p.uri), first, 'cb-cache', 'a second call answers the same file');

        // A new sibling that declares the class must not steal the answer from the conventional file.
        fs.writeFileSync(path.join(p.dir, 'MainWindow.cs'),
            'namespace Proj;\npublic partial class TestForm : Window { }\n');
        t.equal(findCodeBehindFile(p.uri), first, 'cb-cache',
            'the conventional file still wins after a sibling starts declaring the class');

        // The conventional file no longer declaring it must be noticed (this is the stale-read trap:
        // the name, and therefore the cheap file LIST, did not change — only the contents did).
        fs.writeFileSync(path.join(p.dir, 'TestForm.axaml.cs'),
            'namespace Proj;\npublic partial class Renamed : Window { }\n');
        t.ok(/MainWindow\.cs$/.test(findCodeBehindFile(p.uri) || ''), 'cb-cache',
            'an edit that drops the class declaration is picked up, without any invalidation call');

        // Deleting the file it named must not leave a path that no longer exists.
        fs.rmSync(path.join(p.dir, 'TestForm.axaml.cs'));
        t.ok(!/TestForm\.axaml\.cs$/.test(findCodeBehindFile(p.uri) || ''), 'cb-cache',
            'a deleted file is no longer reported');
    }

    // --- the create flow: look (nothing) -> write the code-behind -> look again ---
    // insertHandlerIntoCodeBehind does exactly that, so a cache that only accepts an invalidation hook
    // would insert the handler into undefined here.
    {
        const p = tmpProject('cs');
        fs.rmSync(path.join(p.dir, 'TestForm.axaml.cs'));
        t.equal(findCodeBehindFile(p.uri), undefined, 'cb-create', 'no code-behind yet -> undefined');

        const r = await insertHandlerIntoCodeBehind(p.uri, 'btnNew_Click', 'Click');
        t.ok(!!r, 'cb-create', 'the handler is inserted');
        t.ok(!!r && r.filePath.endsWith('TestForm.axaml.cs'), 'cb-create',
            'into the code-behind created a moment earlier');
        t.ok(/btnNew_Click/.test(p.read()), 'cb-create', 'and the method is really in that file');
    }

    // --- Code Fix…: lift a control the old dock path wrapped INSIDE its Canvas (reported 2026-09-29) ---
    // "any control with a Dock property does not dock properly in the tab canvas … if I delete the
    // canvas from that page, controls dock fill properly". The form runs, so the wrapper is invisible
    // until the layout is wrong — and re-setting the property repairs one control at a time.
    {
        const { analyzeCodeBehind, applyLocalFix } = require('../../out/codeBehindCheck.js');
        const wrap = (body) => {
            const d = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-dockwrap-'));
            fs.writeFileSync(path.join(d, 'Proj.csproj'), '<Project Sdk="Microsoft.NET.Sdk"/>\n');
            const ax = path.join(d, 'TestForm.axaml');
            fs.writeFileSync(ax, `<Window ${NS} x:Class="Proj.TestForm" Width="800" Height="450">\n  <TabControl x:Name="Tabs">\n    <TabItem Header="Page 1">\n      ${body}\n    </TabItem>\n  </TabControl>\n</Window>`);
            fs.writeFileSync(path.join(d, 'TestForm.axaml.cs'), 'using Avalonia.Controls;\nnamespace Proj;\npublic partial class TestForm : Window\n{\n    private void InitializeComponent() { }\n}\n');
            return { uri: Uri.file(ax), read: () => fs.readFileSync(ax, 'utf8') };
        };
        const page = (inner) => `<DockPanel x:Name="TabsBody1" LastChildFill="True">\n        <Canvas x:Name="TabsBody1Canvas">\n          ${inner}\n        </Canvas>\n      </DockPanel>`;
        const wrapped = '<DockPanel x:Name="DockPanel1" LastChildFill="False"><ProgressBar x:Name="Bar1" DockPanel.Dock="Bottom" Canvas.Left="10" Canvas.Top="20"/></DockPanel>';

        const p = wrap(page(wrapped));
        const found = analyzeCodeBehind(p.uri, {}).issues.filter((i) => i.kind === 'lift-dock-wrapper');
        t.equal(found.length, 1, 'dock-wrapper', 'the leftover wrapper is reported once');
        t.ok(!!found[0] && found[0].severity === 'warning', 'dock-wrapper', 'as a warning — the form still runs');
        t.ok(!!found[0] && /DockPanel1/.test(found[0].detail) && /TabsBody1/.test(found[0].detail), 'dock-wrapper',
            'naming both the wrapper and the panel the control belongs in');
        t.ok(!!found[0] && (found[0].alternatives ?? []).some((a) => a.kind === 'dismiss'), 'dock-wrapper',
            'and it can be dismissed like every other fixable finding');

        const msg = await applyLocalFix(p.uri, found[0], {});
        const fixed = p.read();
        t.ok(!/x:Name="DockPanel1"/.test(fixed), 'dock-wrapper', 'the wrapper is gone', fixed);
        t.ok(/<DockPanel x:Name="TabsBody1"[\s\S]*?<ProgressBar x:Name="Bar1" DockPanel\.Dock="Bottom"[^>]*\/>[\s\S]*?<Canvas x:Name="TabsBody1Canvas"/.test(fixed),
            'dock-wrapper', 'the bar is now a docked child of the page panel, in front of the Canvas', fixed);
        t.ok(!/Canvas\.Left/.test(fixed) && !/Canvas\.Top/.test(fixed), 'dock-wrapper', 'its stale Canvas.Left/Top are dropped', fixed);
        t.ok(/Moved Bar1 into TabsBody1/.test(msg), 'dock-wrapper', 'and the message says what moved where', msg);

        // Nothing to report when the control is already docked in the panel (a form the designer wrote
        // AFTER the fix), and nothing when the DockPanel is the user's own — the shape must match.
        const healthy = wrap('<DockPanel x:Name="TabsBody1" LastChildFill="True"><ProgressBar x:Name="Bar1" DockPanel.Dock="Bottom" Height="24"/><Canvas x:Name="TabsBody1Canvas"/></DockPanel>');
        t.equal(analyzeCodeBehind(healthy.uri, {}).issues.filter((i) => i.kind === 'lift-dock-wrapper').length, 0,
            'dock-wrapper', 'a correctly docked control is not reported');
        const hand = wrap(page('<DockPanel x:Name="Info"><TextBlock x:Name="T"/></DockPanel>'));
        t.equal(analyzeCodeBehind(hand.uri, {}).issues.filter((i) => i.kind === 'lift-dock-wrapper').length, 0,
            'dock-wrapper', 'nor is a hand-made DockPanel (not named DockPanelN by the dock code)');
        const twoKids = wrap(page('<DockPanel x:Name="DockPanel9"><TextBlock x:Name="A"/><TextBlock x:Name="B"/></DockPanel>'));
        t.equal(analyzeCodeBehind(twoKids.uri, {}).issues.filter((i) => i.kind === 'lift-dock-wrapper').length, 0,
            'dock-wrapper', 'nor a wrapper that holds more than one control (not a dock artefact)');
    }

    // --- Code Fix…: a TAB PAGE that lost its Canvas (reported 2026-09-30) ----------------------------
    // "On the Buttons tab, I can't freely relocate the controls, why?" — because the page's Canvas (the
    // free-placement surface the designer's own tab snippet writes as the DockPanel's fill child) had
    // been deleted, leaving every control as a DockPanel child. No Dock means LEFT, so each one got a
    // band with no position of its own: a drag wrote a Margin instead of Canvas.Left/Top and could only
    // nudge it. Measured on the user's own form before the repair: four controls as four columns at
    // x=30/170/330/530, and dragging Button1 by (40,30) wrote Margin="18,11,0,0" → "58,41,0,0".
    {
        const { analyzeCodeBehind, applyLocalFix } = require('../../out/codeBehindCheck.js');
        const pageForm = (body, extra = '') => {
            const d = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-pagecanvas-'));
            fs.writeFileSync(path.join(d, 'Proj.csproj'), '<Project Sdk="Microsoft.NET.Sdk"/>\n');
            const ax = path.join(d, 'TestForm.axaml');
            fs.writeFileSync(ax, `<Window ${NS} x:Class="Proj.TestForm" Width="800" Height="450">\n`
                + '  <TabControl x:Name="Tabs">\n    <TabItem Header="Buttons">\n      ' + body + '\n    </TabItem>\n'
                + '    <TabItem Header="Fine">\n      <DockPanel x:Name="TabsBody2">\n        <Canvas x:Name="TabsBody2Canvas"/>\n      </DockPanel>\n    </TabItem>\n'
                + '  </TabControl>\n' + extra + '</Window>');
            fs.writeFileSync(path.join(d, 'TestForm.axaml.cs'),
                'using Avalonia.Controls;\nnamespace Proj;\npublic partial class TestForm : Window\n{\n    private void InitializeComponent() { }\n}\n');
            return { dir: d, uri: Uri.file(ax), read: () => fs.readFileSync(ax, 'utf8') };
        };
        // The page as the user's form had it: four controls, no Canvas, and the LastChildFill the dock
        // workaround left behind.
        const stripped = '<DockPanel x:Name="TabsBody1" LastChildFill="False">\n'
            + '        <Button x:Name="Button1" Content="Click me..." Width="120" Height="32" Margin="18,11,0,0"/>\n'
            + '        <CheckBox x:Name="CheckBox1" Width="120" Margin="20,59,0,0"/>\n'
            + '        <TextBlock x:Name="Pinned1" Text="a deliberate band" DockPanel.Dock="Bottom"/>\n'
            + '      </DockPanel>';
        // What the host MEASURED (the page's own origin at 12,140).
        const bounds = [
            { name: 'TabsBody1', x: 12, y: 140, width: 776, height: 334 },
            { name: 'Button1', x: 30, y: 156, width: 120, height: 32 },
            { name: 'CheckBox1', x: 170, y: 156, width: 120, height: 32 }
        ];
        const find = (p) => analyzeCodeBehind(p.uri, { bounds }).issues.filter((i) => i.kind === 'restore-page-canvas');

        const p = pageForm(stripped);
        const found = find(p);
        t.equal(found.length, 1, 'page-canvas', 'the page with no Canvas is reported exactly once');
        t.equal(found[0].severity, 'warning', 'page-canvas', 'as a warning — the form still runs');
        t.equal(found[0].data.body, 'TabsBody1', 'page-canvas', 'naming the page body');
        t.equal(found[0].data.canvas, 'TabsBody1Canvas', 'page-canvas',
            'and the Canvas the designer gives a page (<name>BodyNCanvas)');
        t.equal(found[0].data.count, '2', 'page-canvas',
            'counting the controls that have no Dock (the deliberate band is NOT one of them)');
        t.ok(/can't be moved freely/.test(found[0].title), 'page-canvas',
            'and the title says what the user experiences, not what the markup looks like');
        t.ok((found[0].alternatives ?? []).some((a) => a.kind === 'dismiss'), 'page-canvas',
            'it can be dismissed like every other fixable finding');

        // The repair, driven the way the panel drives it (the same issue object, so the MEASURED
        // positions travel with it).
        const msg = await applyLocalFix(p.uri, found[0], { bounds });
        const fixed = p.read();
        t.ok(/<Canvas x:Name="TabsBody1Canvas">/.test(fixed), 'page-canvas', 'the page Canvas is back');
        t.ok(!/LastChildFill="False"/.test(fixed), 'page-canvas',
            'and the leftover LastChildFill="False" is gone (the Canvas must be the FILL child)');
        t.ok(/<Button x:Name="Button1"[^>]*Canvas\.Left="18" Canvas\.Top="16"/.test(fixed), 'page-canvas',
            'Button1 lands where the host measured it (30-12, 156-140), not where its band Margin said');
        t.ok(/<CheckBox x:Name="CheckBox1"[^>]*Canvas\.Left="158" Canvas\.Top="16"/.test(fixed), 'page-canvas',
            'and so does CheckBox1 — the four columns keep the places the user sees them in');
        t.ok(!/Margin=/.test(fixed), 'page-canvas', 'a band-relative Margin is not a position — it goes');
        const pinned = /<TextBlock x:Name="Pinned1"[^>]*\/>/.exec(fixed)[0];
        t.ok(/DockPanel\.Dock="Bottom"/.test(pinned) && !/Canvas\.Left/.test(pinned), 'page-canvas',
            'a child with an EXPLICIT Dock stays the band it was asked to be');
        t.ok(fixed.indexOf('<Canvas x:Name="TabsBody1Canvas">') > fixed.indexOf('Pinned1'), 'page-canvas',
            'and the Canvas is the last child, so it fills the page');
        t.ok(/Put TabsBody1Canvas back on the TabsBody1 page and moved 2 controls/.test(msg), 'page-canvas',
            'the message names the Canvas and how many controls moved', msg);

        // Done is done: a second run finds nothing (the fix must not become its own next finding).
        t.equal(find(p).length, 0, 'page-canvas', 'after the repair the page is not reported again');

        // A page that still HAS its Canvas is never reported — that is the healthy shape this fix makes.
        const healthy = pageForm('<DockPanel x:Name="TabsBody1">\n        <Canvas x:Name="TabsBody1Canvas"/>\n      </DockPanel>');
        t.equal(find(healthy).length, 0, 'page-canvas', 'a page with its Canvas is left alone');
        // …including the OTHER tab page in the same form, which has one.
        t.equal(analyzeCodeBehind(healthy.uri, { bounds }).issues.some((i) => i.data && i.data.body === 'TabsBody2'),
            false, 'page-canvas', 'and a different page is judged on its own markup');

        // NOT every page without a Canvas is broken. One undocked child with LastChildFill left on is
        // the deliberate "this control fills the page" page — the sheet and chart tabs of the user's own
        // form are exactly that, and the first version of this rule reported them too (3 findings on
        // their form, only 1 of them real, caught by running the rule against the real file).
        const fills = pageForm('<DockPanel x:Name="TabsBody1">\n        <chrome:GrumpySheet x:Name="Sheet1"/>\n      </DockPanel>');
        t.equal(find(fills).length, 0, 'page-canvas',
            'a page whose single control FILLS it is deliberate, not broken');
        const oneBand = pageForm('<DockPanel x:Name="TabsBody1" LastChildFill="False">\n        <Button x:Name="Only1" Width="120" Height="32"/>\n      </DockPanel>');
        t.equal(find(oneBand).length, 1, 'page-canvas',
            'but LastChildFill="False" makes even one child a band — that page is broken');
        const twoBands = pageForm('<DockPanel x:Name="TabsBody1">\n        <Button x:Name="A" Width="120"/>\n        <Button x:Name="B" Width="120"/>\n      </DockPanel>');
        t.equal(find(twoBands).length, 1, 'page-canvas',
            'as is a page where only the last of several children could ever fill');

        // Without a frame the Margin is the only position available — the fix still works, it just has
        // less to go on (and says so by moving nothing it cannot place).
        const noFrame = pageForm(stripped);
        const noBounds = analyzeCodeBehind(noFrame.uri, {}).issues.filter((i) => i.kind === 'restore-page-canvas');
        t.equal(noBounds.length, 1, 'page-canvas', 'the finding does not depend on a rendered frame');
        await applyLocalFix(noFrame.uri, noBounds[0], {});
        t.ok(/<Button x:Name="Button1"[^>]*Canvas\.Left="18" Canvas\.Top="11"/.test(noFrame.read()), 'page-canvas',
            'and the fallback uses the Margin it had (18,11)');

        // A form with NO code-behind still gets it: this rule is about the markup, and the analysis used
        // to stop at "No code-behind file found" before any rule ran.
        const bare = pageForm(stripped);
        fs.rmSync(path.join(bare.dir, 'TestForm.axaml.cs'));
        const kinds = analyzeCodeBehind(bare.uri, { bounds }).issues.map((i) => i.kind);
        t.ok(kinds.includes('report-only') && kinds.includes('restore-page-canvas'), 'page-canvas',
            'a form with no code-behind reports the markup finding too', kinds.join(','));
    }

    // --- the command bar's sample file dialogs (2026-09-30) -------------------------------
    // "Those buttons must implement file open and file save dialogs": the bar's toolbox snippet
    // carries a File Open… and a File Save… button, and the drop writes the code that makes them open
    // Avalonia's own dialogs. An empty stub would compile — and do nothing, which is exactly the
    // complaint that killed the Menu-copy that shipped first.
    {
        const { commandBarFileHandlers, insertCommandBarFileHandlers } =
            require('../../out/codeBehind.js');
        t.equal(commandBarFileHandlers('bar1').open, 'bar1Open_Click', 'cmd-dialogs',
            'the Open button names bar1Open_Click (the snippet writes the same attribute)');
        t.equal(commandBarFileHandlers('bar1').save, 'bar1Save_Click', 'cmd-dialogs',
            'and the Save button bar1Save_Click');

        for (const lang of ['cs', 'vb']) {
            const p = tmpProject(lang);
            await insertCommandBarFileHandlers(p.uri, 'bar1');
            const text = p.read();
            t.ok(/bar1Open_Click/.test(text), 'cmd-dialogs', `${lang}: the Open handler is written`);
            t.ok(/bar1Save_Click/.test(text), 'cmd-dialogs', `${lang}: and the Save handler`);
            // The dialog API itself — the whole point of the sample.
            t.ok(/OpenFilePickerAsync/.test(text) && /FilePickerOpenOptions/.test(text), 'cmd-dialogs',
                `${lang}: Open uses the real file-open picker`);
            t.ok(/SaveFilePickerAsync/.test(text) && /FilePickerSaveOptions/.test(text), 'cmd-dialogs',
                `${lang}: Save uses the real file-save picker`);
            // Types are fully qualified: a generated code-behind has no `using Avalonia.Platform.Storage`.
            t.ok(!/using Avalonia\.Platform\.Storage|Imports Avalonia\.Platform\.Storage/.test(text),
                'cmd-dialogs', `${lang}: and it never edits the form's using/Imports block`);
            t.ok(/Avalonia\.Controls\.TopLevel\.GetTopLevel\((this|Me)\)/.test(text), 'cmd-dialogs',
                `${lang}: works from a Window AND a UserControl (TopLevel.GetTopLevel, not StorageProvider)`);
            // The picked path is shown in the bar's own box — and looked up by NAME, so renaming or
            // deleting that box cannot break the build.
            t.ok(/bar1Path/.test(text), 'cmd-dialogs', `${lang}: the picked path goes into bar1Path`);
            t.ok(/FindControl/.test(text), 'cmd-dialogs',
                `${lang}: which is resolved by name (FindControl), so a renamed box is not a compile error`);
            // The handlers must be REAL bodies, not the designer's empty stubs.
            t.ok(!/TODO: Handle .*bar1(Open|Save)_Click/.test(text), 'cmd-dialogs',
                `${lang}: with real bodies — not the "TODO: Handle" stub the event wiring writes`);
            // …and readable: the code the user will look at first is indented like the code around it.
            // (Measured in the regenerated matrix 2026-09-30: the continuation line came out at the
            // same indent as its `if`, which reads as a mistake even though it compiles.)
            t.ok(lang === 'cs' ? /^ {12}box\.Text = /m.test(text) : /^ {12}(Dim box|If box)/m.test(text),
                'cmd-dialogs', `${lang}: the body is indented in steps, not flattened`);

            // Idempotent: dropping a second bar (or re-dropping) must not duplicate them.
            const once = p.read();
            await insertCommandBarFileHandlers(p.uri, 'bar1');
            t.equal(p.read(), once, 'cmd-dialogs', `${lang}: writing twice changes nothing`);
            t.equal((p.read().match(/bar1Open_Click/g) || []).length, 1, 'cmd-dialogs',
                `${lang}: one declaration — the only other mention lives in the .axaml`);

            // A handler the USER has written is theirs: the missing one is added, the existing one is
            // left byte-for-byte alone.
            const q = tmpProject(lang);
            const marker = lang === 'cs' ? '// my own open handler' : "' my own open handler";
            const mine = lang === 'cs'
                ? `using Avalonia.Controls;\nnamespace Proj;\npublic partial class TestForm : Window\n{\n`
                + `    public TestForm()\n    {\n        InitializeComponent();\n    }\n`
                + `    private async void bar1Open_Click(object sender, Avalonia.Interactivity.RoutedEventArgs e)\n`
                + `    {\n        ${marker}\n        await System.Threading.Tasks.Task.CompletedTask;\n    }\n}\n`
                : `Imports Avalonia.Controls\nNamespace Proj\n    Partial Public Class TestForm\n`
                + `        Inherits Window\n        Public Sub New()\n            InitializeComponent()\n`
                + `        End Sub\n        Private Async Sub bar1Open_Click(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)\n`
                + `            ${marker}\n        End Sub\n    End Class\nEnd Namespace\n`;
            fs.writeFileSync(path.join(q.dir, lang === 'cs' ? 'TestForm.axaml.cs' : 'TestForm.axaml.vb'),
                mine, 'utf8');
            await insertCommandBarFileHandlers(q.uri, 'bar1');
            const after = q.read();
            t.ok(after.includes(marker), 'cmd-dialogs',
                `${lang}: a handler the user already wrote keeps its body (never overwritten)`);
            t.equal((after.match(/bar1Open_Click/g) || []).length, 1, 'cmd-dialogs',
                `${lang}: and is not declared twice`);
            t.ok(after.includes('bar1Save_Click'), 'cmd-dialogs',
                `${lang}: while the missing one is still added`);
            t.ok(/SaveFilePickerAsync/.test(after), 'cmd-dialogs',
                `${lang}: with its real dialog code`);
        }

        // A form with no code-behind yet gets one — the same guarantee the clock handler gives.
        {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-cmddialog-'));
            fs.writeFileSync(path.join(dir, 'Proj.csproj'), '<Project Sdk="Microsoft.NET.Sdk"/>\n');
            const axamlPath = path.join(dir, 'TestForm.axaml');
            fs.writeFileSync(axamlPath, AXAML.replace('Click="btnTest_Click"', 'Click="bar1Open_Click"'));
            await insertCommandBarFileHandlers(Uri.file(axamlPath), 'bar1');
            const made = path.join(dir, 'TestForm.axaml.cs');
            t.ok(fs.existsSync(made), 'cmd-dialogs', 'the code-behind is created when the form has none');
            const text = fs.existsSync(made) ? fs.readFileSync(made, 'utf8') : '';
            t.ok(/bar1Open_Click/.test(text) && /bar1Save_Click/.test(text), 'cmd-dialogs',
                'with both dialog handlers inside the class');
            t.ok(/InitializeComponent/.test(text), 'cmd-dialogs', 'and the class the XAML expects');
        }
    }

    // --- the missing-import rule vs QUALIFIED code (reported 2026-09-30) ----------------------------
    // "In my GrumpyDesignerDemo test app problems pane: Imports Avalonia.Platform.Storage is missing …
    // fails as (BC30002 / CS0246)". The file in question builds 0/0 — it is the code-behind the designer
    // itself wrote for the command bar's File Open… / File Save… buttons, which names its types FULLY
    // QUALIFIED on purpose (so the form's own using/Imports block is never edited). The rule tested
    // `\bFilePickerOpenOptions\b` against the whole file, so it matched the TAIL of
    // `Avalonia.Platform.Storage.FilePickerOpenOptions` and demanded an import for a name that is already
    // qualified. `StorageProvider` was in that list for the same reason and is worse: it is also a
    // PROPERTY (`TopLevel.StorageProvider`), so the bare name is no evidence of a type use at all.
    {
        const { analyzeCodeBehind } = require('../../out/codeBehindCheck.js');
        const { insertCommandBarFileHandlers } = require('../../out/codeBehind.js');
        const codeBehindOf = (lang) => path.join(lang === 'cs' ? 'TestForm.axaml.cs' : 'TestForm.axaml.vb');
        const writeMember = (p, lang, member) => {
            const file = path.join(p.dir, codeBehindOf(lang));
            const text = fs.readFileSync(file, 'utf8');
            // C#'s template ends with the class's closing brace; the VB one ends with `End Namespace`,
            // so the member goes before `End Class` wherever that is (anchoring both to the end of file
            // silently inserted nothing in VB — and the test then "passed" on an empty file).
            const withMember = lang === 'cs'
                ? text.replace(/\n}\s*$/, `\n${member}\n}\n`)
                : text.replace(/\n([ \t]*)End Class/, `\n${member}\n$1End Class`);
            if (!withMember.includes(member)) throw new Error(`${lang}: the test member was not inserted`);
            fs.writeFileSync(file, withMember, 'utf8');
        };
        const storageFindings = (p) => analyzeCodeBehind(p.uri,
            { axamlText: fs.readFileSync(path.join(p.dir, 'TestForm.axaml'), 'utf8'), controls: [] })
            .issues.filter((i) => i.kind === 'add-import' && /Platform\.Storage/.test(i.title));

        // 1) the code the DESIGNER writes must never be reported: run the real generator, then the real
        //    checker over its output.
        const generated = tmpProject('cs');
        await insertCommandBarFileHandlers(generated.uri, 'bar1');
        t.ok(/Avalonia\.Platform\.Storage\.FilePickerOpenOptions/.test(generated.read()), 'import-rule',
            'the generated dialog handler really does name its types fully qualified');
        t.equal(storageFindings(generated).length, 0, 'import-rule',
            'and the checker does NOT ask for an import that file does not need');

        // 2) …while every genuinely unqualified use is still caught — the rule has to keep earning its keep.
        for (const [lang, member, what] of [
            ['cs', '    public void Pick() { var o = new FilePickerOpenOptions { AllowMultiple = false }; }',
                'cs: an unqualified new FilePickerOpenOptions without the using'],
            ['cs', '    public void All() { var a = FilePickerFileTypes.All; }',
                'cs: an unqualified static FilePickerFileTypes member'],
            ['cs', '    private static void Save(IStorageProvider storage, FilePickerSaveOptions picker) { }',
                "cs: the chart helper's own IStorageProvider signature"],
            ['vb', '    Public Sub Pick()\n        Dim o = New FilePickerOpenOptions With {.AllowMultiple = False}\n    End Sub',
                'vb: New FilePickerOpenOptions without Imports']
        ]) {
            const p = tmpProject(lang);
            writeMember(p, lang, member);
            t.equal(storageFindings(p).length, 1, 'import-rule', `${what} IS reported`);
        }

        // 3) the PROPERTY is not a type: a bare `StorageProvider.…` call must never produce this finding
        //    — it is the shape the designer's own handlers use (`top.StorageProvider.OpenFilePickerAsync`).
        for (const lang of ['cs', 'vb']) {
            const p = tmpProject(lang);
            writeMember(p, lang, lang === 'cs'
                ? '    public void Go() { var f = StorageProvider.OpenFilePickerAsync(null); }'
                : '    Public Sub Go()\n        Dim f = StorageProvider.OpenFilePickerAsync(Nothing)\n    End Sub');
            t.equal(storageFindings(p).length, 0, 'import-rule',
                `${lang}: the StorageProvider property alone never demands an import`);
        }

        // 4) and WITH the import present nothing is reported, in either language.
        for (const lang of ['cs', 'vb']) {
            const p = tmpProject(lang);
            const file = path.join(p.dir, codeBehindOf(lang));
            const importLine = lang === 'cs' ? 'using Avalonia.Platform.Storage;\n' : 'Imports Avalonia.Platform.Storage\n';
            const text = fs.readFileSync(file, 'utf8');
            fs.writeFileSync(file, (lang === 'cs' ? importLine + text : importLine + text), 'utf8');
            writeMember(p, lang, lang === 'cs'
                ? '    public void Pick() { var o = new FilePickerOpenOptions(); }'
                : '    Public Sub Pick()\n        Dim o = New FilePickerOpenOptions()\n    End Sub');
            t.equal(storageFindings(p).length, 0, 'import-rule',
                `${lang}: an unqualified use WITH the import is not reported`);
        }
    }
};
