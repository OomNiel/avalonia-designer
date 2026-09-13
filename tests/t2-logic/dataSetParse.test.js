/* T2 — .adset parsing must be able to REPORT a corrupt file.
 *
 * RED-FIRST test for a data-loss defect (fixed in refactor Phase 1): `parseDataSet` swallowed the
 * JSON error (`catch { raw = {}; }`) and returned a perfectly valid-looking default spec ("DataSet"
 * with no tables). Because every caller — including the DataSet editor's open path and the
 * generator's write path — treats the result as authoritative, opening a half-written or hand-edited
 * `.adset` silently produced a fresh empty schema, and the next save/Generate wrote it over the
 * user's file.
 *
 * The fix adds `parseDataSetChecked`, which reports the parse failure alongside the recovered spec,
 * so the open path can refuse to save. `parseDataSet` keeps its signature and behaviour for the
 * non-checking callers (best-effort reads elsewhere in the designer).
 */
'use strict';
const { parseDataSet, parseDataSetChecked } = require('../../out/dataSetModel.js');

const VALID = JSON.stringify({ version: 1, name: 'Customers', tables: [{ name: 'Orders', columns: [] }] });

module.exports = async (t) => {
    t.section('T2: .adset parsing');

    // back-compat: the lenient entry point behaves exactly as before
    const okSpec = parseDataSet(VALID);
    t.equal(okSpec.name, 'Customers', 'lenient', 'a valid file parses as before');

    const badSpec = parseDataSet('{ "name": "Customers", ');
    t.ok(!!badSpec && Array.isArray(badSpec.tables), 'lenient',
        'a corrupt file still returns a usable spec (callers that only read keep working)');

    // the new checked entry point
    t.equal(typeof parseDataSetChecked, 'function', 'checked', 'parseDataSetChecked is exported');

    if (typeof parseDataSetChecked !== 'function') return; // the rest is red until the fix lands

    const good = parseDataSetChecked(VALID);
    t.equal(good.error, undefined, 'checked', 'a valid file reports no error');
    t.equal(good.spec.name, 'Customers', 'checked', 'and yields the parsed spec');

    const bad = parseDataSetChecked('{ "name": "Customers", ');
    t.ok(!!bad.error, 'checked', 'a JSON syntax error IS reported', `error=${JSON.stringify(bad.error)}`);
    t.ok(!!bad.spec && Array.isArray(bad.spec.tables), 'checked',
        'while still handing back the recovered spec for display');

    const wrongShape = parseDataSetChecked('{"version":1,"tables":"nope"}');
    t.ok(!!wrongShape.error, 'checked',
        'a structurally wrong file is reported too (tables is not an array)');

    const empty = parseDataSetChecked('');
    t.ok(!!empty.error, 'checked', 'an empty file is reported (not silently a blank schema)');
};
