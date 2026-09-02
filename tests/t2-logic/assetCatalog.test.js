/* T2 — assetCatalog: ItemsSource asset detection across C# + VB (.cs/.vb),
 * lowercase `dim`, generics-before-plain (`List(Of T)`), module members implicitly Shared,
 * method-local Dim excluded, DataSet .adset tables listed. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { listAssets } = require('../../out/assetCatalog.js');

const CS_FILE = `using System.Collections.Generic;
public partial class MainWindow
{
    public string[] nameslist = { "a", "b" };
    public static ObservableCollection<string> SharedList { get; } = new();
    public List<Customer> Customers { get; } = new();
    private void Helper()
    {
        List<string> local = new(); // method-local, must NOT be an asset
    }
}
`;

const VB_FILE = `Imports System.Collections.Generic

Public Class MainWindow
    Public dim planets() As String = {"Mars", "Venus"}
    Public Shared ReadOnly colors As List(Of String) = New List(Of String)
    Public scores As ObservableCollection(Of Integer) = New ObservableCollection(Of Integer)

    Private Sub Helper()
        Dim local(3) As Integer
        Dim another As New List(Of String)
    End Sub
End Class

Public Module Globals
    Public items As List(Of Integer) = New List(Of Integer)
End Module
`;

function tmpProject() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-assets-'));
    fs.writeFileSync(path.join(dir, 'Proj.csproj'), '<Project Sdk="Microsoft.NET.Sdk"/>\n');
    fs.writeFileSync(path.join(dir, 'MainWindow.cs'), CS_FILE);
    fs.writeFileSync(path.join(dir, 'MainWindow.axaml.vb'), VB_FILE);
    return dir;
}

module.exports = async (t) => {
    t.section('assetCatalog');
    const dir = tmpProject();
    const assets = listAssets(dir, 'MainWindow');
    const names = assets.map((a) => a.value);
    t.note('assets: ' + names.join(', '));

    // C# form members (bare)
    t.ok(names.includes('nameslist'), 'csharp', 'string[] form member');
    t.ok(names.includes('SharedList'), 'csharp', 'static form member (bare)');
    t.ok(names.includes('Customers'), 'csharp', 'List<T> form member');

    // VB lowercase `dim` array + generics-before-plain + form members
    t.ok(names.includes('planets'), 'vb', 'lowercase `dim` array picked up');
    t.ok(names.includes('colors'), 'vb', 'List(Of String) generic (generics-before-plain)');
    t.ok(names.includes('scores'), 'vb', 'ObservableCollection(Of Integer)');

    // method-local Dim excluded
    t.ok(!names.includes('local'), 'vb', 'method-local dim excluded');
    t.ok(!names.includes('another'), 'vb', 'method-local List excluded');

    // module members implicitly Shared, qualified
    t.ok(names.includes('Globals.items'), 'vb', 'module member qualified');

    // every code asset labelled 'code' (3 C# + 4 VB, method-locals excluded)
    const codeAssets = assets.filter((a) => a.kind === 'code');
    t.equal(codeAssets.length, 7, 'assets', 'exactly 7 code assets', `found ${codeAssets.length}`);
};
