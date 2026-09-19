/* T2 — dataSet model + generator: parse/serialize round-trip, unique table/column naming,
 * identifier sanitising, type mappings (cs/vb/xs), and C#/VB/XSD code generation. */
'use strict';
const {
  parseDataSet, serializeDataSet, defaultDataSetSpec, newTableSpec, newColumnSpec,
  isValidIdentifier, sanitizeName, csType, vbType, xsType, findTable, canBindToTree
} = require('../../out/dataSetModel.js');
const { generateCs, generateVb, generateXsd, consolidateRuntimeHelpers, stripRuntimeHelpers }
  = require('../../out/dataSetGenerator.js');

const ADSET = `{
  "version": 1,
  "name": "Store",
  "tables": [
    {
      "name": "Customers",
      "x": 40, "y": 40,
      "columns": [
        { "name": "Id", "type": "Int32", "caption": "ID", "allowNull": false },
        { "name": "Name", "type": "String", "caption": "Name", "allowNull": true, "sampleValue": "Ada" },
        { "name": "Balance", "type": "Decimal", "caption": "Balance", "allowNull": true }
      ],
      "boundTo": "gridCustomers", "boundToType": "DataGrid"
    },
    { "name": "Orders", "x": 260, "y": 40,
      "columns": [ { "name": "OrderId", "type": "Int32", "caption": "Order ID", "allowNull": false } ] }
  ]
}`;

module.exports = async (t) => {
  t.section('dataSet model + generator');

  // --- parse ---
  const spec = parseDataSet(ADSET);
  t.equal(spec.name, 'Store', 'parse', 'dataset name');
  t.equal(spec.tables.length, 2, 'parse', 'two tables');
  const customers = findTable(spec, 'Customers');
  t.ok(!!customers, 'parse', 'Customers found');
  t.equal(customers.columns.length, 3, 'parse', 'column count');
  t.equal(customers.boundTo, 'gridCustomers', 'parse', 'boundTo preserved');
  t.equal(customers.boundToType, 'DataGrid', 'parse', 'boundToType preserved');

  // --- serialize round-trip ---
  const text = serializeDataSet(spec);
  t.ok(text.includes('"name": "Store"'), 'serialize', 'name in output');
  t.ok(text.includes('"boundTo": "gridCustomers"'), 'serialize', 'boundTo preserved on save');
  const spec2 = parseDataSet(text);
  t.equal(spec2.tables.length, 2, 'serialize', 'round-trip table count');
  t.ok(!text.includes('"sampleValue": null'), 'serialize', 'null sampleValue omitted');

  // --- unique naming ---
  t.equal(newTableSpec(spec).name, 'Table3', 'naming', 'new table unique');
  t.equal(newColumnSpec(customers).name, 'Column4', 'naming', 'new column unique');

  // --- identifiers ---
  t.ok(isValidIdentifier('Customer_2') && !isValidIdentifier('2Fast') && !isValidIdentifier('has space'), 'identifiers', 'validity');
  t.equal(sanitizeName('my-dataset'), 'my_dataset', 'identifiers', 'sanitize dashes');
  t.equal(sanitizeName('123'), '_123', 'identifiers', 'leading digit');

  // --- type mappings ---
  t.equal(csType('Int32'), 'int', 'types', 'cs Int32');
  t.equal(csType('String'), 'string', 'types', 'cs String');
  t.equal(vbType('Int32'), 'Integer', 'types', 'vb Int32');
  t.equal(vbType('Byte[]'), 'Byte()', 'types', 'vb Byte[]');
  t.equal(xsType('DateTime'), 'xs:dateTime', 'types', 'xs DateTime');
  t.equal(xsType('Guid'), 'xs:string', 'types', 'xs Guid');

  // --- generator: C# / VB / XSD ---
  const cs = generateCs(spec, 'Proj');
  t.ok(cs.includes('public class Store'), 'generate', 'cs class declared');
  t.ok(cs.includes('GetCustomers()'), 'generate', 'cs GetCustomers');
  t.ok(cs.includes('WireCustomersGrid('), 'generate', 'cs WireCustomersGrid (DataGrid path)');
  t.ok(cs.includes('public class CustomersRow'), 'generate', 'cs row class');

  const vb = generateVb(spec, 'Proj');
  t.ok(vb.includes('Public Class Store'), 'generate', 'vb class declared');
  t.ok(vb.includes('Public Class CustomersRow'), 'generate', 'vb row class');

  // Sorting / scrolling recycle DataGrid row containers: the "+ Add row…" pointer handler used to be
  // attached per-container in LoadingRow and never removed, so a container later re-bound to a data
  // row still popped the Add dialog after a header sort. The handler is now shared, attached only
  // while a container shows the placeholder, detached on UnloadingRow, and it re-checks the row's
  // CURRENT DataContext at press time — a reordered data row never opens the dialog.
  t.ok(cs.includes('addRow.DataContext is CustomersRow d') && cs.includes('!d.IsPlaceholder'), 'generate', 'cs add-row handler re-checks DataContext');
  t.ok(cs.includes('grid.UnloadingRow += (_, e) => e.Row.RemoveHandler(Avalonia.Input.InputElement.PointerPressedEvent, addRowPointer)'), 'generate', 'cs add-row handler removed on UnloadingRow');
  t.ok(vb.includes('addData.IsPlaceholder'), 'generate', 'vb add-row handler re-checks DataContext');
  t.ok(vb.includes('AddHandler grid.UnloadingRow, Sub(s, e) e.Row.RemoveHandler(Avalonia.Input.InputElement.PointerPressedEvent, addRowPointer)'), 'generate', 'vb add-row handler removed on UnloadingRow');

  // Row-dialog file browser: every String column gets a "Browse…" button that opens the OS file
  // picker (images first, then all files), stores the picked file's FULL path in that box, and
  // remembers the folder for next time (memory + best-effort file next to the app). C# and VB.
  t.ok(cs.includes('using Avalonia.Platform.Storage;'), 'browse', 'cs imports Storage');
  t.ok(cs.includes('private async Task BrowseAsync(TextBox box)'), 'browse', 'cs picker method');
  t.ok(cs.includes('var browse_nameInput = new Button { Content = "Browse\u2026" }'), 'browse', 'cs browse button on the String box');
  t.ok(cs.includes('browse_nameInput.Click += async (_, _) => await BrowseAsync(nameInput);'), 'browse', 'cs button opens the picker for its box');
  t.ok(cs.includes('public static class FilePickerMemory'), 'browse', 'cs remembers the last folder');
  t.ok(cs.includes('FilePickerFileTypes.ImageAll') && cs.includes('FilePickerFileTypes.All'), 'browse', 'cs images-first filter');
  t.ok(cs.includes('box.Text = path;'), 'browse', 'cs stores the full path');
  t.ok(vb.includes('Imports Avalonia.Platform.Storage'), 'browse', 'vb imports Storage');
  t.ok(vb.includes('Private Async Function BrowseAsync(box As TextBox) As System.Threading.Tasks.Task'), 'browse', 'vb picker method');
  t.ok(vb.includes('Dim browseName As New Button With {.Content = "Browse…"}'), 'browse', 'vb browse button on the String box');
  t.ok(vb.includes('AddHandler browseName.Click, AddressOf BrowseFileName'), 'browse', 'vb handler name distinct from the button (case-insensitive)');
  t.ok(vb.includes('Public Module FilePickerMemory'), 'browse', 'vb remembers the last folder');
  t.ok(vb.includes('box.Text = path'), 'browse', 'vb stores the full path');

  const xsd = generateXsd(spec);
  t.ok(xsd.includes('<xs:schema'), 'generate', 'xsd schema root');
  t.ok(xsd.includes('Customers'), 'generate', 'xsd table element');

  // --- SQLite schema-sync (EnsureColumns) ---
  // Bound tables are SQLite-backed (default <DataSet>.db), so DatabaseAdapter + EnsureColumns are
  // emitted. The column defs must be UNQUOTED ("Id INTEGER", not "\"Id\" INTEGER") — quoted defs
  // broke the PRAGMA existence check (name compared with surrounding quotes) and ALTER tried to
  // re-add existing columns ("duplicate column name: Id"). The method quotes names only in the ALTER.
  t.ok(cs.includes('DatabaseAdapter.EnsureColumns(con, "Customers", new[] { "Id INTEGER", "Name TEXT", "Balance TEXT" })'), 'generate', 'cs EnsureColumns defs unquoted');
  t.ok(cs.includes('public static void EnsureColumns'), 'generate', 'cs EnsureColumns method');
  t.ok(cs.includes('ADD COLUMN \\"{name}\\"'), 'generate', 'cs EnsureColumns quotes only in ALTER');
  t.ok(vb.includes('DatabaseAdapter.EnsureColumns(con, "Customers", New String() { "Id INTEGER", "Name TEXT", "Balance TEXT" })'), 'generate', 'vb EnsureColumns defs unquoted');
  t.ok(vb.includes('Public Shared Sub EnsureColumns'), 'generate', 'vb EnsureColumns method');
  t.ok(vb.includes('ADD COLUMN """ & name'), 'generate', 'vb EnsureColumns quotes only in ALTER');
  // VB add/edit dialogs must not hardcode a dataset class name (BC30451 for any name other than
  // the literal "MyData") — they call the DataSet's own CreateDataSet() unqualified.
  t.ok(!vb.includes('MyData.CreateDataSet()'), 'generate', 'vb no hardcoded MyData dataset ref');
  t.ok(vb.includes('CustomersEditDialog(CreateDataSet()'), 'generate', 'vb dialog uses own CreateDataSet');

  // --- runtime storage: a published app's own folder is read-only ---
  // The .deb installs to /usr/lib/<pkg> and the MSI to "Program Files" — both root-owned, so a first
  // run that has to CREATE the .db / the remembered-folder file there fails (SQLite error 14, raised
  // from the form's constructor → no window at all, and no console when started from the app menu).
  // Generated code therefore keeps runtime data in the per-user data folder.
  t.ok(cs.includes('public static class RuntimeStorage'), 'storage', 'cs RuntimeStorage emitted');
  t.ok(cs.includes('Environment.SpecialFolder.LocalApplicationData'), 'storage', 'cs uses the per-user data folder');
  t.ok(cs.includes('public static string DbPath(string file) => Path.IsPathRooted(file) ? file : RuntimeStorage.PathFor(file);'), 'storage', 'cs DbPath resolves relative .db paths per user');
  t.ok(cs.includes('RuntimeStorage.PathFor("Store.lastfolder")'), 'storage', 'cs remembered picker folder is per user');
  t.equal(cs.split('AppContext.BaseDirectory').length - 1, 1, 'storage', 'cs touches the app folder once (the legacy fallback only)');
  t.ok(cs.includes('var beside = Path.Combine(AppContext.BaseDirectory, name);'), 'storage', 'cs still adopts data an earlier build left beside the executable');
  t.ok(vb.includes('Public Module RuntimeStorage'), 'storage', 'vb RuntimeStorage emitted');
  t.ok(vb.includes('Return If(IO.Path.IsPathRooted(file), file, RuntimeStorage.PathFor(file))'), 'storage', 'vb DbPath resolves relative .db paths per user');
  t.ok(vb.includes('RuntimeStorage.PathFor("Store.lastfolder")'), 'storage', 'vb remembered picker folder is per user');
  t.equal(vb.split('AppContext.BaseDirectory').length - 1, 1, 'storage', 'vb touches the app folder once (the legacy fallback only)');
  // Nothing to persist → no helper in the generated file (and no unused type to read past).
  const plainSpec = '{ "version": 1, "name": "Plain", "tables": [ { "name": "T", "columns": [ { "name": "Id", "type": "Int32", "allowNull": false } ] } ] }';
  t.ok(!generateCs(parseDataSet(plainSpec), 'Proj').includes('RuntimeStorage'), 'storage', 'cs: a DataSet that persists nothing omits the helper');
  t.ok(!generateVb(parseDataSet(plainSpec), 'Proj').includes('RuntimeStorage'), 'storage', 'vb: a DataSet that persists nothing omits the helper');

  // Two DataSets in one project (2026-09-18, OptimisedCSTest: MyDataSet + dsTreeView). The helpers are
  // namespace-level classes, so a second copy is CS0101 (BC30179 in VB) — exactly one file may keep them.
  const sqliteSpec = parseDataSet(ADSET);
  const csText = generateCs(sqliteSpec, 'Proj');
  const csTwo = consolidateRuntimeHelpers(
    [{ file: '/p/MyDataSet.cs', text: csText }, { file: '/p/dsTreeView.cs', text: csText }], 'cs');
  t.ok(csTwo[0].text.includes('public static class RuntimeStorage'), 'helpers', 'cs: the first file keeps the helpers');
  t.ok(!csTwo[1].text.includes('RuntimeStorage'), 'helpers', 'cs: the second file loses its copy');
  t.ok(!csTwo[1].text.includes('public static class DatabaseAdapter'), 'helpers', 'cs: the whole helper block goes, not just one class');
  t.ok(!csTwo[1].text.includes('/// <summary>Small SQLite helper'), 'helpers', 'cs: the helper doc comments go too');
  t.ok(csTwo[1].text.includes('public class Store'), 'helpers', 'cs: the DataSet class itself is untouched');
  t.ok(csTwo[1].text.trimEnd().endsWith('}'), 'helpers', 'cs: the stripped file still closes its namespace');
  t.ok(consolidateRuntimeHelpers(csTwo, 'cs')[0].text === csTwo[0].text, 'helpers', 'cs: a lone copy stays where it is');
  t.ok(stripRuntimeHelpers(csTwo[0].text, 'cs').length < csTwo[0].text.length, 'helpers', 'cs: stripRuntimeHelpers drops it');
  t.ok(!stripRuntimeHelpers(csTwo[0].text, 'cs').includes('RuntimeStorage'), 'helpers', 'cs: nothing of the helper is left behind');
  t.ok(stripRuntimeHelpers('namespace P\n{\n}\n', 'cs') === 'namespace P\n{\n}\n', 'helpers', 'cs: a file without helpers is returned unchanged');
  const vbText = generateVb(sqliteSpec, 'Proj');
  const vbTwo = consolidateRuntimeHelpers(
    [{ file: '/p/A.vb', text: vbText }, { file: '/p/B.vb', text: vbText }], 'vb');
  t.ok(vbTwo[0].text.includes('Public Module RuntimeStorage'), 'helpers', 'vb: the first file keeps the helpers');
  t.ok(!vbTwo[1].text.includes('RuntimeStorage'), 'helpers', 'vb: the second file loses its copy');
  t.ok(vbTwo[1].text.trimEnd().endsWith('End Namespace'), 'helpers', 'vb: the stripped file still closes its namespace');

  // The tree roles decide the shape a bound TreeView gets, so they have to survive the round-trip: reading
  // them but never writing them (2026-09-19) meant a role picked in the editor was gone by the next load, so
  // canBindToTree said "no shape yet" and the bind was refused — the report was "I can't get it to bind".
  const roleSpec = parseDataSet(ADSET);
  roleSpec.tables[0].columns[1].role = 'name';
  t.ok(serializeDataSet(roleSpec).includes('"role": "name"'), 'tree', 'a tree role is written to the .adset');
  t.equal(parseDataSet(serializeDataSet(roleSpec)).tables[0].columns[1].role, 'name', 'tree',
      'and read back, so the editor and the generator agree on the shape');
  t.ok(!serializeDataSet(parseDataSet(ADSET)).includes('"role"'), 'tree',
      'a dataset without roles gains no role keys — the file is unchanged');

  // ADSET's Customers is Id / Name / Balance. One role alone is enough: the rows become root nodes, which is
  // the truth for a flat table (the report that produced this: Id/Name/Image with no parent or level column).
  const treeSpec = (roles) => {
    const s = parseDataSet(ADSET);
    const t = s.tables[0];
    t.boundTo = 'TreeView1';
    t.boundToType = 'TreeView';
    for (const c of t.columns) c.role = roles[c.name] || null;
    return s;
  };
  t.ok(canBindToTree(treeSpec({ Name: 'name' }).tables[0]), 'tree',
      'node text alone can bind: a flat table is a tree of root nodes');
  t.ok(!canBindToTree(treeSpec({}).tables[0]), 'tree', 'no name role means no tree at all');
  t.ok(generateCs(treeSpec({ Name: 'name' }), 'Proj')
      .includes('TreeBuilder.BuildFlat(rows, r => r.Name ?? "")'), 'tree',
      'cs: a flat table calls BuildFlat');
  const vbFlat = generateVb(treeSpec({ Name: 'name' }), 'Proj');
  t.ok(vbFlat.includes('TreeBuilder.BuildFlat(rows,') && vbFlat.includes('If(r.Name'), 'tree',
      'vb: the same shape, through the VB name selector');
  t.ok(generateCs(treeSpec({ Name: 'name', Id: 'id', Balance: 'parent' }), 'Proj')
      .includes('TreeBuilder.Build(rows, r => r.Id, r => r.Balance, r => r.Name ?? "")'), 'tree',
      'cs: id + parent still walks up');
  t.ok(generateCs(treeSpec({ Name: 'name', Balance: 'level' }), 'Proj')
      .includes('TreeBuilder.BuildByHierarchy(rows, r => r.Balance, r => r.Name ?? "")'), 'tree',
      'cs: a level column still reads the depth');
  t.ok(generateVb(treeSpec({ Name: 'name', Id: 'id', Balance: 'parent' }), 'Proj')
      .includes('TreeBuilder.Build(rows, Function(r) r.Id'), 'tree', 'vb: id + parent walks up as well');

  // --- default spec ---
  const dflt = defaultDataSetSpec('Demo');
  t.equal(dflt.name, 'Demo', 'default', 'name sanitized');
  t.ok(dflt.tables.length >= 1, 'default', 'has a starter table');
};
