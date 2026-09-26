/* T2 — the spreadsheet's cell model (GrumpySheet, 2026-09-26).
 *
 * The feature: a sheet's cells are CHILD ELEMENTS, so the ordinary property round-trip never sees them.
 * Everything that reads or writes them lives in src/sheetCells.ts, and these tests pin the seams that
 * fail SILENTLY rather than loudly:
 *
 *   * an attribute named differently from the C# property (`row` for `Row`) — the form then compiles and
 *     draws with no cells in it at all,
 *   * a geometry default that disagrees with the control's own (the editor would draw a 50-row sheet and
 *     write cells the control ignores),
 *   * a blank or out-of-range cell written as an element — invisible in the file, ignored at runtime,
 *   * and the ADDRESS PARSER, which is the one place the twins could differ: VB checks integer overflow
 *     and THROWS while C# wraps silently, so both bound the letter and digit runs and this test holds all
 *     three implementations to the same bounds.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { XamlModel } = require('../../out/xamlModel.js');
const sheet = require('../../out/sheetCells.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const cs = read('resources/GrumpySheet.cs');
const vb = read('resources/GrumpySheet.vb');
const moduleSource = read('src/sheetCells.ts');

/** The renderer default the C# registers for a styled property, as a number. */
function csDefault(name) {
    const m = new RegExp(`Register<GrumpySheet, \\w+>\\(nameof\\(${name}\\), ([^)]+)\\)`).exec(cs);
    return m ? Number(m[1].trim().replace(/d$/, '')) : null;
}

function model(inner) {
    return new XamlModel(`<Window xmlns="https://github.com/avaloniaui"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        xmlns:spread="using:AvaloniaSpreadsheet">
        <Canvas Name="Holder">${inner}</Canvas>
    </Window>`);
}

const SHEET = (attrs = '', cells = '') =>
    `<spread:GrumpySheet x:Name="s1" ${attrs}>${cells}</spread:GrumpySheet>`;

function findSheet(m, name = 's1') {
    return m.findByName(name);
}

module.exports = async (t) => {
    t.section('T2: the spreadsheet cell model');

    // ---------------------------------------------------------------- the names are the control's
    t.note('every attribute name the writer uses is a property the twins actually declare');
    for (const prop of ['Row', 'Column', 'Text']) {
        t.ok(new RegExp(`public\\s+\\w+\\??\\s+${prop}\\s*\\{`).test(cs), 'names',
            `the C# SheetCell declares ${prop}`);
        t.ok(new RegExp(`Public Property ${prop}\\b`).test(vb), 'names',
            `the VB SheetCell declares ${prop}`);
    }
    for (const prop of ['Rows', 'Columns', 'ColumnWidth', 'RowHeight', 'HeaderWidth', 'HeaderHeight',
        'ShowHeaders', 'ShowFormulaBar', 'AllowEditing', 'FontFamilyName', 'FontSize',
        'GridColor', 'HeaderBackColor', 'HeaderTextColor', 'CellBackColor', 'TextColor',
        'SelectionColor', 'SelectionFillColor']) {
        t.ok(cs.includes(`nameof(${prop})`), 'names', `the C# control declares ${prop}`);
        t.ok(vb.includes(`NameOf(${prop})`), 'names', `the VB control declares ${prop}`);
    }
    t.equal(sheet.SHEET_PREFIX, 'spread', 'names', 'the prefix the designer writes');
    t.equal(sheet.SHEET_XMLNS, 'using:AvaloniaSpreadsheet', 'names', 'the CLR namespace it points at');
    t.ok(cs.includes('namespace AvaloniaSpreadsheet'), 'names', 'the C# namespace matches');
    t.ok(vb.includes('Namespace Global.AvaloniaSpreadsheet'), 'names',
        'the VB namespace is Global. — without it VB prefixes the project root namespace onto it and ' +
        'the form fails to build with AVLN2000');

    // ---------------------------------------------------------------- geometry agrees with the control
    t.note('the editor draws the sheet the control will actually render');
    t.equal(sheet.SHEET_DEFAULT_ROWS, csDefault('Rows'), 'geometry', 'default Rows is the control’s');
    t.equal(sheet.SHEET_DEFAULT_COLUMNS, csDefault('Columns'), 'geometry', 'default Columns is the control’s');
    t.equal(sheet.SHEET_DEFAULT_COLUMN_WIDTH, csDefault('ColumnWidth'), 'geometry', 'default ColumnWidth');
    t.equal(sheet.SHEET_DEFAULT_ROW_HEIGHT, csDefault('RowHeight'), 'geometry', 'default RowHeight');
    t.equal(sheet.SHEET_DEFAULT_HEADER_WIDTH, csDefault('HeaderWidth'), 'geometry', 'default HeaderWidth');
    t.equal(sheet.SHEET_DEFAULT_HEADER_HEIGHT, csDefault('HeaderHeight'), 'geometry', 'default HeaderHeight');

    const sized = model(SHEET('Rows="12" Columns="4"', ''));
    t.equal(JSON.stringify(sheet.sheetSizeOf(findSheet(sized))), '{"rows":12,"columns":4}', 'geometry',
        'a sheet that sets its own size is read back');
    const unset = model(SHEET('', ''));
    t.equal(JSON.stringify(sheet.sheetSizeOf(findSheet(unset))), '{"rows":50,"columns":26}', 'geometry',
        'and a sheet that sets nothing falls back to the control’s own defaults');

    // ---------------------------------------------------------------- addresses
    t.note('addresses: the letters, the parse, and the bounds the twins share');
    t.equal(sheet.columnName(1), 'A', 'addresses', 'column 1');
    t.equal(sheet.columnName(26), 'Z', 'addresses', 'column 26');
    t.equal(sheet.columnName(27), 'AA', 'addresses', 'column 27 rolls over');
    t.equal(sheet.columnName(28), 'AB', 'addresses', 'column 28');
    t.equal(sheet.cellName(1, 1), 'A1', 'addresses', 'A1');
    t.equal(sheet.cellName(7, 28), 'AB7', 'addresses', 'AB7');
    t.equal(JSON.stringify(sheet.parseCellName('A1')), '{"row":1,"column":1}', 'addresses', 'parse A1');
    t.equal(JSON.stringify(sheet.parseCellName('ab7')), '{"row":7,"column":28}', 'addresses',
        'parse is case-insensitive');
    t.equal(sheet.parseCellName('nonsense'), null, 'addresses',
        'a word is not an address — the input that threw OverflowException in the VB twin');
    t.equal(sheet.parseCellName('A'), null, 'addresses', 'letters with no row');
    t.equal(sheet.parseCellName('12'), null, 'addresses', 'a row with no letters');
    t.equal(sheet.parseCellName('A0'), null, 'addresses', 'row 0 is not a row');
    t.equal(sheet.parseCellName('ABCD1'), null, 'addresses', 'four letters is past any sheet');
    t.equal(sheet.parseCellName('A12345678'), null, 'addresses', 'eight digits is past any sheet');
    t.equal(sheet.parseCellName('A1234567').row, 1234567, 'addresses', 'seven digits still parses');

    t.equal(sheet.SHEET_MAX_LETTERS, 3, 'addresses', 'three letters is the shared bound');
    t.equal(sheet.SHEET_MAX_DIGITS, 7, 'addresses', 'seven digits is the shared bound');
    t.ok(cs.includes(`letterCount > ${sheet.SHEET_MAX_LETTERS}`) && cs.includes(`digitCount > ${sheet.SHEET_MAX_DIGITS}`),
        'addresses', 'the C# twin applies the same bounds');
    t.ok(vb.includes(`letterCount > ${sheet.SHEET_MAX_LETTERS}`) && vb.includes(`digitCount > ${sheet.SHEET_MAX_DIGITS}`),
        'addresses', 'the VB twin applies the same bounds');

    // ---------------------------------------------------------------- reading cells
    t.note('reading: sorted, and nothing that could not be drawn');
    const read1 = model(SHEET('Rows="10" Columns="5"',
        '<spread:SheetCell Row="2" Column="2" Text="3"/>' +
        '<spread:SheetCell Row="1" Column="1" Text="Item"/>' +
        '<spread:SheetCell Row="1" Column="2" Text="Qty"/>' +
        '<spread:SheetCell Row="3" Column="1" Text=""/>' +
        '<spread:SheetCell Row="99" Column="1" Text="off the sheet"/>' +
        '<spread:SheetCell Row="1" Column="99" Text="off the sheet"/>' +
        '<spread:SheetCell Text="no address"/>' +
        '<spread:SheetCell Row="0" Column="1" Text="row 0"/>'));
    const cells = sheet.sheetCellsOf(findSheet(read1));
    t.equal(cells.length, 3, 'reading', 'blank, out-of-range and unaddressed cells are skipped');
    t.equal(JSON.stringify(cells), JSON.stringify([
        { row: 1, column: 1, text: 'Item' },
        { row: 1, column: 2, text: 'Qty' },
        { row: 2, column: 2, text: '3' }
    ]), 'reading', 'cells come back sorted by row then column, whatever order the file has');
    t.equal(cells[0].text, 'Item', 'reading', 'and the text is the text');

    const formula = model(SHEET('', '<spread:SheetCell Row="7" Column="2" Text="=SUM(B2:B6)"/>'));
    t.equal(sheet.sheetCellsOf(findSheet(formula))[0].text, '=SUM(B2:B6)', 'reading',
        'a formula is carried verbatim (it is evaluated in the next phase, not here)');

    // ---------------------------------------------------------------- writing cells
    t.note('writing: only cells worth an element, and an existing element is kept');
    const write = model(SHEET('Rows="10" Columns="5"', '<spread:SheetCell Row="1" Column="1" Text="Old"/>'));
    const target = findSheet(write);
    target.setAttribute('data-keep', 'me');       // stands in for anything a later version adds
    sheet.writeSheetCells(write, target, [
        { row: 2, column: 1, text: 'second' },
        { row: 1, column: 1, text: 'first' },
        { row: 3, column: 3, text: '' },           // blank: not written at all
        { row: 99, column: 1, text: 'off' },       // past Rows: dropped, the control ignores it anyway
        { row: 1, column: 1, text: 'later' }       // a second cell for A1: the first one wins
    ]);
    const written = sheet.sheetCellsOf(target);
    t.equal(JSON.stringify(written), JSON.stringify([
        { row: 1, column: 1, text: 'first' },
        { row: 2, column: 1, text: 'second' }
    ]), 'writing', 'only non-blank, in-range cells survive, and the first of a duplicate address wins');

    let elementCount = 0;
    for (let i = 0; i < target.childNodes.length; i++) {
        const kid = target.childNodes[i];
        if (kid.nodeType === 1 && String(kid.tagName).endsWith('SheetCell')) elementCount++;
    }
    t.equal(elementCount, 2, 'writing', 'a blank or out-of-range cell is not written as an element');
    const text = write.serialize(true);
    t.ok(text.indexOf('<spread:SheetCell Row="1" Column="1" Text="first"/>') >= 0, 'writing',
        'the element is written in the file with its address and text, prefix and all');
    t.ok(text.indexOf('Text=""') < 0, 'writing', 'and never carries an empty Text attribute');

    t.note('clearing: an editor that deletes every cell leaves no elements behind');
    sheet.writeSheetCells(write, target, []);
    t.equal(sheet.sheetCellsOf(target).length, 0, 'writing', 'the cells are gone');
    t.equal(write.serialize(true).indexOf('SheetCell'), -1, 'writing', 'and so are the elements');

    t.note('the info payload the webview editor is opened with');
    const info = sheet.sheetInfoOf(findSheet(model(SHEET('Rows="8" Columns="3"',
        '<spread:SheetCell Row="1" Column="1" Text="x"/>'))));
    t.equal(JSON.stringify(info), '{"rows":8,"columns":3,"cells":[{"row":1,"column":1,"text":"x"}]}',
        'payload', 'sheetInfo carries the grid size and the cells together');

    t.note('the module owns the model, so the panel cannot drift from it');
    t.ok(moduleSource.includes("from './xamlModel'"), 'wiring', 'sheetCells imports the model');
    t.ok(moduleSource.includes('writeSheetCells'), 'wiring', 'the writer is the only way in');
};
