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
const renderer = read('host/XamlRenderer.cs');
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

    // ---------------------------------------------------------------- phase 2: per-cell formatting
    t.note('formatting: every attribute name is a property the twins declare');
    t.equal(sheet.SHEET_CELL_FIELDS.length, 7, 'format', 'the seven formatting fields');
    for (const field of sheet.SHEET_CELL_FIELDS) {
        t.ok(new RegExp(`public\\s+[\\w?<>]+\\s+${field.attr}\\s*\\{`).test(cs), 'format',
            `the C# SheetCell declares ${field.attr}`);
        t.ok(new RegExp(`Public Property ${field.attr}\\b`).test(vb), 'format',
            `the VB SheetCell declares ${field.attr}`);
        // The preview host reads the cell elements itself, so a name it does not know means the canvas
        // shows a plain cell while the built app shows the formatted one.
        t.ok(renderer.includes(`case "${field.attr}":`), 'format',
            `the preview host applies ${field.attr}`);
    }

    t.note('the alignment enum: named as the twins name it, and not `Default`');
    t.equal(JSON.stringify(sheet.SHEET_ALIGNS), '["Auto","Left","Center","Right"]', 'format',
        'the four alignments');
    const csEnum = /public enum SheetAlign\s*\{([^}]*)\}/.exec(cs);
    const vbEnum = /Public Enum SheetAlign([\s\S]*?)End Enum/.exec(vb);
    t.ok(csEnum !== null, 'format', 'the C# enum is there');
    t.ok(vbEnum !== null, 'format', 'the VB enum is there');
    for (const name of sheet.SHEET_ALIGNS) {
        t.ok(new RegExp(`\\b${name}\\b`).test(csEnum ? csEnum[1] : ''), 'format', `the C# enum declares ${name}`);
        t.ok(new RegExp(`\\b${name}\\b`).test(vbEnum ? vbEnum[1] : ''), 'format', `the VB enum declares ${name}`);
    }
    // This is the reason the member is `Auto`: `Default` is a VB keyword, so an enum member by that
    // name is a BC30185 error where the C# twin compiles happily — a twin that is not a twin.
    t.ok(!cs.includes('SheetAlign.Default') && !vb.includes('SheetAlign.Default'), 'format',
        'neither twin calls the member Default');

    t.note('formatting values are spelled the one way the writer writes them');
    t.equal(sheet.normaliseSheetColor('#ffcc00'), '#FFCC00', 'format', 'a hex colour is upper-cased');
    t.equal(sheet.normaliseSheetColor('#f0c'), '#FF00CC', 'format', 'three digits are widened to six');
    t.equal(sheet.normaliseSheetColor('  #80FF0000  '), '#80FF0000', 'format', 'eight digits are kept');
    t.equal(sheet.normaliseSheetColor('Red'), 'Red', 'format',
        'a named colour is passed through — trashing a value this module cannot read would delete a ' +
        'highlight the user wrote by hand');
    t.equal(sheet.normaliseSheetColor(''), '', 'format', 'empty is the sheet\u2019s own colour');
    t.equal(sheet.normaliseSheetAlign('cEnTeR'), 'Center', 'format', 'an alignment is matched by name');
    t.equal(sheet.normaliseSheetAlign(''), '', 'format', 'empty is left empty — it is the sheet\u2019s own');
    t.equal(sheet.normaliseSheetNumber('20.126'), 20.13, 'format', 'a size is rounded to two decimals');
    t.equal(sheet.normaliseSheetNumber(''), 0, 'format', 'an empty size is 0 = the sheet\u2019s own');
    t.equal(sheet.normaliseSheetNumber('-5'), 0, 'format', 'and a negative one is refused');
    t.equal(sheet.normaliseSheetNumber('big'), 0, 'format', 'as is a word where a number belongs');

    t.note('a cell is styled when it decides anything of its own');
    t.equal(sheet.sheetCellIsStyled({ row: 1, column: 1, text: 'x' }), false, 'format', 'text alone is plain');
    t.equal(sheet.sheetCellIsStyled({ row: 1, column: 1, text: '', fill: '#FFCC00' }), true, 'format',
        'a highlight is formatting');
    t.equal(sheet.sheetCellIsStyled({ row: 1, column: 1, text: 'x', bold: false, textAlign: 'Auto' }), false,
        'format', 'stating the default is not formatting');

    t.note('writing formatting, and leaving the sheet\u2019s own settings out');
    const styled = model(SHEET('Rows="10" Columns="5"', ''));
    const styledEl = findSheet(styled);
    sheet.writeSheetCells(styled, styledEl, [
        {
            row: 1, column: 1, text: 'Item', bold: true, italic: true, fontSize: 20,
            fontFamily: 'Consolas', textColor: '#cc0000', fill: '#ffcc00', textAlign: 'center'
        },
        { row: 2, column: 1, text: '', fill: '#22AA55' },   // blank but highlighted: worth an element
        { row: 3, column: 1, text: '', bold: false },       // blank and plain: not
        { row: 4, column: 1, text: 'x', fill: 'Red' },      // a colour only the control can read
        { row: 5, column: 1, text: 'x', bold: false, fontSize: 0, textAlign: 'Auto', textColor: '' }
    ]);
    const styledText = styled.serialize(true);
    t.ok(styledText.indexOf('<spread:SheetCell Row="1" Column="1" Text="Item" Bold="True" Italic="True" ' +
        'FontSize="20" FontFamily="Consolas" TextColor="#CC0000" Fill="#FFCC00" TextAlign="Center"/>') >= 0,
        'format', 'the whole cell is written in one element, with the values normalised');
    t.ok(styledText.indexOf('<spread:SheetCell Row="2" Column="1" Fill="#22AA55"/>') >= 0, 'format',
        'a formatted but BLANK cell is written, and with no Text attribute at all');
    t.ok(styledText.indexOf('Row="3"') < 0, 'format', 'a blank cell with nothing to say is not written');
    t.ok(styledText.indexOf('<spread:SheetCell Row="4" Column="1" Text="x" Fill="Red"/>') >= 0, 'format',
        'a named colour is written back exactly as it came in');
    t.ok(styledText.indexOf('Row="5"') >= 0 && styledText.indexOf('Bold="False"') < 0 &&
        styledText.indexOf('FontSize="0"') < 0 && styledText.indexOf('TextAlign="Auto"') < 0, 'format',
        'stating the sheet\u2019s own settings writes no attributes for them');

    t.note('reading formatting back');
    t.equal(JSON.stringify(sheet.sheetCellsOf(styledEl)), JSON.stringify([
        {
            row: 1, column: 1, text: 'Item', bold: true, italic: true, fontSize: 20,
            fontFamily: 'Consolas', textColor: '#CC0000', fill: '#FFCC00', textAlign: 'Center'
        },
        { row: 2, column: 1, text: '', fill: '#22AA55' },
        { row: 4, column: 1, text: 'x', fill: 'Red' },
        { row: 5, column: 1, text: 'x' }
    ]), 'format', 'the cells come back with their formatting, and only what they decided');
    t.equal(JSON.stringify(sheet.sheetCellsOf(styledEl)[1]),
        '{"row":2,"column":1,"text":"","fill":"#22AA55"}', 'format',
        'a blank formatted cell survives the round trip — dropping it would delete the highlight');
    t.equal(JSON.stringify(sheet.sheetCellsOf(styledEl)[3]), '{"row":5,"column":1,"text":"x"}',
        'format', 'and a cell with only defaults reads as a plain cell did before formatting existed');

    t.note('clearing formatting takes the attributes OUT of the file');
    const plainAgain = sheet.sheetCellsOf(styledEl).map((cell) => (
        { row: cell.row, column: cell.column, text: cell.text }));
    sheet.writeSheetCells(styled, styledEl, plainAgain);
    const clearedText = styled.serialize(true);
    t.ok(clearedText.indexOf('Fill=') < 0 && clearedText.indexOf('Bold=') < 0 &&
        clearedText.indexOf('FontSize=') < 0 && clearedText.indexOf('TextAlign=') < 0 &&
        clearedText.indexOf('TextColor=') < 0 && clearedText.indexOf('FontFamily=') < 0 &&
        clearedText.indexOf('Italic=') < 0, 'format',
        'every formatting attribute is gone from the form');
    t.ok(clearedText.indexOf('Text="x"') >= 0, 'format', 'while the text the cells hold is untouched');
    t.ok(clearedText.indexOf('Row="2"') < 0, 'format',
        'and the blank cell that only had a highlight leaves no element behind');

    t.note('the formatting survives a full round trip unchanged');
    const again = model(SHEET('Rows="10" Columns="5"', ''));
    const againEl = findSheet(again);
    const beforeTrip = sheet.sheetCellsOf(styledEl);
    sheet.writeSheetCells(again, againEl, beforeTrip);
    t.equal(JSON.stringify(sheet.sheetCellsOf(againEl)), JSON.stringify(beforeTrip), 'format',
        'reading what was written gives back exactly what was read');

    t.note('the editor and the host agree on what a cell is');
    t.ok(read('media/designer.js').includes("'bold', 'italic', 'fontSize', 'fontFamily', 'textColor', 'fill', 'textAlign'"),
        'wiring', 'the webview editor keys its cells by the same seven fields');
    t.ok(renderer.includes('AvaloniaSpreadsheet.GrumpySheet sheet'), 'wiring',
        'and the host reads a sheet\u2019s cell elements the same way the control does');

    // The snippet a dropped sheet arrives as is what the T5 matrix writes into a real VB project and
    // compiles with the real XAML compiler, so formatting in the snippet is how the VB twin's own
    // attribute conversion (a nullable Colour, an enum by name) finally gets built. Keeping it there
    // keeps that check alive.
    t.note('the toolbox snippet ships the formatting, so T5 compiles it');
    const factory = read('host/ControlFactory.cs');
    // The snippet is a C# interpolated string, so its quotes are ESCAPED in the source — the assertion
    // has to match what the file says, backslashes and all.
    t.ok(factory.includes('Text=\\"Item\\" Bold=\\"True\\" Fill=\\"#DDE7F5\\"'), 'wiring',
        'the snippet\u2019s header cell is bold and shaded');
    t.ok(factory.includes('TextAlign=\\"Center\\"'), 'wiring',
        'and one of them is centred by name, which is the enum conversion the compiler has to accept');
};
