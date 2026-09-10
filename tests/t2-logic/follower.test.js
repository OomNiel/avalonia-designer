/* T2 — follower bindings: a read-only control (ComboBox/ListBox/ItemsControl) lists one text column
 * of a table a DataGrid owns, live. Covers the .adset model record, the generated binding line
 * (VB + C#), the asset-catalogue entries the Items Source picker shows, and the Code Fix rules for
 * the two ways this goes wrong (inline items + ItemsSource, and a stale follower). */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Uri } = require('vscode');
const { parseDataSet, serializeDataSet, followersOf } = require('../../out/dataSetModel.js');
const {
    bindFollowerToColumn, findFollowerBinding, hasFollowerBinding, removeItemsSourceBinding
} = require('../../out/codeBehind.js');
const { listAssets } = require('../../out/assetCatalog.js');
const { analyzeCodeBehind } = require('../../out/codeBehindCheck.js');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"';

function makeProject(language, files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'follower-'));
    fs.writeFileSync(path.join(dir, language === 'vb' ? 'Proj.vbproj' : 'Proj.csproj'), '<Project Sdk="Microsoft.NET.Sdk"></Project>', 'utf8');
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text, 'utf8');
    return { dir, uri: Uri.file(path.join(dir, 'TestForm.axaml')) };
}

const VB_AXAML = `<Window ${NS} x:Class="Proj.TestForm">
  <DockPanel Name="Root">
    <Canvas Name="Body">
      <DataGrid x:Name="DataGrid3"/>
      <ComboBox x:Name="ComboBox2"/>
    </Canvas>
  </DockPanel>
</Window>`;

const VB_BEHIND = `Imports Avalonia.Controls
Class TestForm
    Private _customers As System.Collections.ObjectModel.ObservableCollection(Of CustomersRow)

    Public Sub New()
        InitializeComponent()
        _customers = MyData.LoadCustomers()
        MyData.WireCustomersGrid(DataGrid3, _customers)
    End Sub
End Class`;

const CS_BEHIND = `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    private System.Collections.ObjectModel.ObservableCollection<CustomersRow> _customers;

    public TestForm()
    {
        InitializeComponent();
        _customers = MyData.LoadCustomers();
        MyData.WireCustomersGrid(DataGrid3, _customers);
    }
}`;

module.exports = async (t) => {
    t.section('follower bindings');

    // ---------- 1) the .adset record ----------
    const spec = parseDataSet(JSON.stringify({
        version: 1,
        name: 'MyData',
        tables: [
            {
                name: 'Customers', x: 0, y: 0, columns: [{ name: 'Name', type: 'String', caption: 'Name', allowNull: false, sampleValue: null }],
                boundTo: 'DataGrid3', boundToType: 'DataGrid',
                followers: [{ control: 'ComboBox2', type: 'ComboBox', column: 'Name' }]
            },
            {
                name: 'Broken', x: 0, y: 0, columns: [], boundTo: 'DataGrid3', boundToType: 'DataGrid',
                followers: [{ control: '', type: 'ComboBox', column: 'Name' }, { control: 'ComboBox3', column: 'X' }]
            }
        ]
    }));
    const table = spec.tables.find((x) => x.name === 'Customers');
    t.equal(followersOf(table).length, 1, 'model', 'followers survive a parse');
    t.equal(followersOf(table)[0].column, 'Name', 'model', 'the followed column is kept');
    t.equal(followersOf(table)[0].control, 'ComboBox2', 'model', 'the follower control is kept');
    t.ok(serializeDataSet(spec).includes('"followers"'), 'model', 'serialize keeps followers');
    const broken = spec.tables.find((x) => x.name === 'Broken');
    t.equal(followersOf(broken).length, 1, 'model', 'a follower without a control is dropped');
    t.equal(followersOf(broken)[0].type, 'ComboBox', 'model', 'a missing type defaults to ComboBox');

    // ---------- 2) the generated binding line (VB) ----------
    const vb = makeProject('vb', { 'TestForm.axaml': VB_AXAML, 'TestForm.axaml.vb': VB_BEHIND });
    const ref = { datasetName: 'MyData', tableName: 'Customers', controlName: 'ComboBox2', column: 'Name', ownerGrid: 'DataGrid3' };
    const wrote = await bindFollowerToColumn(vb.uri, ref);
    t.ok(!!wrote, 'codegen', 'bindFollowerToColumn writes the code-behind');
    let text = fs.readFileSync(wrote, 'utf8');
    t.ok(text.includes('ComboBox2.ItemsSource = New ColumnFollower(Of CustomersRow, String)(_customers, Function(r) r.Name, Function(r) r.IsPlaceholder)'),
        'codegen', 'VB line uses the ColumnFollower helper with the row type, column and placeholder filter');
    const wireAt = text.indexOf('WireCustomersGrid(DataGrid3, _customers)');
    const lineAt = text.indexOf('ColumnFollower(Of CustomersRow');
    t.ok(wireAt > 0 && lineAt > wireAt, 'codegen', 'the line lands AFTER the grid wiring (the rows exist by then)');

    const info = findFollowerBinding(vb.uri, 'ComboBox2');
    t.equal(info && info.column, 'Name', 'codegen', 'findFollowerBinding reads the column back');
    t.equal(info && info.field, '_customers', 'codegen', 'findFollowerBinding reads the row collection');
    t.equal(info && info.rowType, 'CustomersRow', 'codegen', 'findFollowerBinding reads the row type');
    t.ok(hasFollowerBinding(vb.uri, 'ComboBox2'), 'codegen', 'hasFollowerBinding finds it');
    t.ok(!hasFollowerBinding(vb.uri, 'ComboBox1'), 'codegen', 'hasFollowerBinding is per control');

    await bindFollowerToColumn(vb.uri, ref);
    text = fs.readFileSync(wrote, 'utf8');
    t.equal(text.split('ColumnFollower(').length - 1, 1, 'codegen', 're-binding the same column is idempotent');
    await bindFollowerToColumn(vb.uri, { ...ref, column: 'Email' });
    text = fs.readFileSync(wrote, 'utf8');
    t.equal(text.split('ColumnFollower(').length - 1, 1, 'codegen', 're-binding another column REPLACES the line');
    t.ok(text.includes('r.Email'), 'codegen', 'the new column is used');

    await removeItemsSourceBinding(vb.uri, 'ComboBox2');
    text = fs.readFileSync(wrote, 'utf8');
    t.ok(!text.includes('ColumnFollower'), 'codegen', 'un-binding removes the line');
    t.ok(text.includes('WireCustomersGrid'), 'codegen', 'un-binding leaves the grid wiring alone');

    // ---------- 3) the generated binding line (C#) ----------
    const cs = makeProject('cs', { 'TestForm.axaml': VB_AXAML, 'TestForm.axaml.cs': CS_BEHIND });
    const csFile = await bindFollowerToColumn(cs.uri, ref);
    const csText = fs.readFileSync(csFile, 'utf8');
    t.ok(csText.includes('ComboBox2.ItemsSource = new ColumnFollower<CustomersRow, string>(_customers, r => r.Name, r => r.IsPlaceholder);'),
        'codegen', 'C# line uses the helper with the same shape');
    t.equal(findFollowerBinding(cs.uri, 'ComboBox2').rowType, 'CustomersRow', 'codegen', 'C# binding is readable back');

    // ---------- 4) picker entries ----------
    const proj = makeProject('vb', {
        'TestForm.axaml': VB_AXAML,
        'TestForm.axaml.vb': VB_BEHIND,
        'MyData.adset': serializeDataSet(spec)
    });
    const assets = listAssets(proj.dir, 'TestForm');
    const followers = assets.filter((a) => a.kind === 'follower');
    t.equal(followers.length, 1, 'assets', 'only the grid-bound table contributes follower entries');
    t.equal(followers[0].label, 'MyData.Customers.Name', 'assets', 'the label is dataset.table.column');
    t.equal(followers[0].owner, 'DataGrid3', 'assets', 'the entry names the grid it follows');
    t.ok(/follows DataGrid3/.test(followers[0].detail), 'assets', 'the detail explains what it follows');
    t.ok(!followers.some((f) => f.tableName === 'Broken'), 'assets', 'the non-grid table contributes none');

    // ---------- 5) Code Fix rules ----------
    const inlineProject = makeProject('vb', {
        'TestForm.axaml': `<Window ${NS} x:Class="Proj.TestForm">
  <Canvas Name="Body">
    <ComboBox x:Name="ComboBox2">
      <ComboBoxItem Content="one"/>
      <ComboBoxItem Content="two"/>
    </ComboBox>
  </Canvas>
</Window>`,
        'TestForm.axaml.vb': `Imports Avalonia.Controls
Class TestForm
    Public Sub New()
        InitializeComponent()
        ComboBox2.ItemsSource = New ColumnFollower(Of CustomersRow, String)(_customers, Function(r) r.Name, Function(r) r.IsPlaceholder)
    End Sub
End Class`
    });
    const axamlText = fs.readFileSync(inlineProject.uri.fsPath, 'utf8');
    const issues = analyzeCodeBehind(inlineProject.uri, { axamlText }).issues;
    t.ok(issues.some((i) => i.kind === 'remove-inline-items'), 'check', 'inline items + ItemsSource is reported');
    t.ok(issues.some((i) => i.kind === 'copy-bundled-helper' && i.data.helper === 'ColumnFollower'),
        'check', 'a missing ColumnFollower helper is reported');

    const followerCtx = {
        datasetClasses: ['MyData'],
        grids: [{ datasetName: 'MyData', datasetClass: 'MyData', tableName: 'Customers', rowType: 'CustomersRow', columns: ['Email'], gridName: 'DataGrid3' }],
        images: [],
        followers: [{ datasetName: 'MyData', tableName: 'Customers', rowType: 'CustomersRow', column: 'Name', controlName: 'ComboBox2', ownerGrid: 'DataGrid3', adsetPath: path.join(inlineProject.dir, 'MyData.adset') }]
    };
    const stale = analyzeCodeBehind(inlineProject.uri, { axamlText, dataSet: followerCtx }).issues;
    const drop = stale.find((i) => i.kind === 'drop-follower');
    t.ok(!!drop, 'check', 'a follower whose column vanished is reported');
    t.equal(drop && drop.data.control, 'ComboBox2', 'check', 'the finding names the follower control');

    const gridGone = analyzeCodeBehind(inlineProject.uri, {
        axamlText,
        dataSet: { ...followerCtx, grids: [] }
    }).issues;
    t.ok(gridGone.some((i) => i.kind === 'drop-follower'), 'check', 'a follower whose grid is gone is reported');

    const healthy = analyzeCodeBehind(inlineProject.uri, {
        axamlText, dataSet: { ...followerCtx, grids: [{ ...followerCtx.grids[0], columns: ['Name', 'Email'] }] }
    }).issues;
    t.ok(!healthy.some((i) => i.kind === 'drop-follower'), 'check', 'a healthy follower is not reported');
};
