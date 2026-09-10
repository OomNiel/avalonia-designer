/* T2 — dataSet model + generator: parse/serialize round-trip, unique table/column naming,
 * identifier sanitising, type mappings (cs/vb/xs), and C#/VB/XSD code generation. */
'use strict';
const {
  parseDataSet, serializeDataSet, defaultDataSetSpec, newTableSpec, newColumnSpec,
  isValidIdentifier, sanitizeName, csType, vbType, xsType, findTable
} = require('../../out/dataSetModel.js');
const { generateCs, generateVb, generateXsd } = require('../../out/dataSetGenerator.js');

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

  // --- default spec ---
  const dflt = defaultDataSetSpec('Demo');
  t.equal(dflt.name, 'Demo', 'default', 'name sanitized');
  t.ok(dflt.tables.length >= 1, 'default', 'has a starter table');
};
