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
    insertHandlerIntoCodeBehind, convertCodeBehindToChrome, hasDefaultEvent, defaultEventFor,
    applyAccessors
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
};
