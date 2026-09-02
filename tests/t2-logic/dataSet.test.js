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

    const xsd = generateXsd(spec);
    t.ok(xsd.includes('<xs:schema'), 'generate', 'xsd schema root');
    t.ok(xsd.includes('Customers'), 'generate', 'xsd table element');

    // --- default spec ---
    const dflt = defaultDataSetSpec('Demo');
    t.equal(dflt.name, 'Demo', 'default', 'name sanitized');
    t.ok(dflt.tables.length >= 1, 'default', 'has a starter table');
};
