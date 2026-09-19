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
};
