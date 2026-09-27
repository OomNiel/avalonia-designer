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
    t.equal(JSON.stringify(info),
        '{"rows":8,"columns":3,"cells":[{"row":1,"column":1,"text":"x"}],'
        + '"columnWidth":72,"rowHeight":22,"columnWidths":{},"rowHeights":{}}',
        'payload', 'sheetInfo carries the grid size, the cells, and the track sizes the editor draws from');

    t.note('the module owns the model, so the panel cannot drift from it');
    t.ok(moduleSource.includes("from './xamlModel'"), 'wiring', 'sheetCells imports the model');
    t.ok(moduleSource.includes('writeSheetCells'), 'wiring', 'the writer is the only way in');

    // ---------------------------------------------------------------- phase 2: per-cell formatting
    t.note('formatting: every attribute name is a property the twins declare');
    t.equal(sheet.SHEET_CELL_FIELDS.length, 10, 'format', 'the ten formatting fields — seven, and the border’s three');
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

    // ---------------------------------------------------------------- the border model (0.13.1)
    // A cell's border is which of its four edges are lined, one thickness and one colour. It is pinned
    // here — before any menu can offer it and any writer can spell it — because it is a FLAGS enum, and a
    // flags enum is the one place two twins can disagree while both compile: `Top | Right` and
    // `Top Or Right` are different spellings of the same idea, and a mistyped member name is a silent 0.
    t.note('the border enum: the same members, with the same VALUES, in both twins');
    const csBorder = /public enum SheetBorderEdges\s*\{([\s\S]*?)\}/.exec(cs);
    const vbBorder = /Public Enum SheetBorderEdges([\s\S]*?)End Enum/.exec(vb);
    t.ok(csBorder !== null, 'borders', 'the C# twin declares SheetBorderEdges');
    t.ok(vbBorder !== null, 'borders', 'the VB twin declares SheetBorderEdges');
    t.ok(/\[Flags\]\s*public enum SheetBorderEdges/.test(cs), 'borders',
        'C# marks it [Flags] — a corner cell wants Top and Left at once');
    t.ok(/<Flags>\s*Public Enum SheetBorderEdges/.test(vb), 'borders', 'and so does VB');

    /** name → value, out of a flags enum body: numbers, and `|`/`Or` chains of earlier members. */
    const flagsOf = (body) => {
        const values = {};
        for (const line of body.split('\n')) {
            const m = /^\s*(\w+)\s*=\s*(.+?)\s*,?\s*$/.exec(line);
            if (!m) {
                continue;
            }
            let value = 0;
            for (const part of m[2].split(/\s*(?:\||\bOr\b)\s*/)) {
                const n = /^\d+$/.test(part) ? Number(part) : values[part];
                if (n === undefined) {
                    return null;   // a member this cannot work out, so the comparison below must fail loudly
                }
                value |= n;
            }
            values[m[1]] = value;
        }
        return values;
    };

    const csFlags = csBorder ? flagsOf(csBorder[1]) : null;
    const vbFlags = vbBorder ? flagsOf(vbBorder[1]) : null;
    t.ok(csFlags !== null && vbFlags !== null, 'borders', 'both enums read as flags');
    t.equal(JSON.stringify(csFlags),
        JSON.stringify({ None: 0, Top: 1, Right: 2, Bottom: 4, Left: 8, All: 15 }), 'borders',
        'the six members: the four edges, None, and All as the four together');
    t.equal(JSON.stringify(vbFlags), JSON.stringify(csFlags), 'borders',
        'and the VB twin carries the same members with the same values — `|` is not `Or`');

    t.note('the cell keeps one edge set, one thickness and one colour — and no border until it is asked for');
    t.ok(/public SheetBorderEdges BorderEdges \{ get; set; \} = SheetBorderEdges\.None;/.test(cs), 'borders',
        'C#: BorderEdges starts at None');
    t.ok(/Public Property BorderEdges As SheetBorderEdges = SheetBorderEdges\.None/.test(vb), 'borders',
        'VB: BorderEdges starts at None');
    // The other two have NO initialiser on purpose: unset is 0 and null, which is what keeps a cell that
    // was never boxed a short element — and what the writer will have to leave out (see the fields table).
    t.ok(/public double BorderThickness \{ get; set; \}/.test(cs) &&
        /public Color\? BorderColor \{ get; set; \}/.test(cs), 'borders',
        'C#: BorderThickness and BorderColor are plain, unfilled members');
    t.ok(/Public Property BorderThickness As Double\s*$/m.test(vb) &&
        /Public Property BorderColor As Nullable\(Of Color\)\s*$/m.test(vb), 'borders',
        'VB: the same two, and neither carries a default');
    t.ok(!/BorderThickness\s*\{ get; set; \} =/.test(cs) && !/Property BorderThickness As Double\s*=/.test(vb),
        'borders', 'so 0 is available to mean the sheet\'s own line, in both twins');
    t.ok(/BorderOwnThickness/.test(cs) && /BorderOwnThickness/.test(vb), 'borders',
        'and both twins name the width a 0 stands for — one pixel, the grid line\'s own');
    t.ok(/BorderThickness > 0 \? cell\.BorderThickness : BorderOwnThickness/.test(cs) &&
        /If\(cell\.BorderThickness > 0, cell\.BorderThickness, BorderOwnThickness\)/.test(vb), 'borders',
        'which ONE place uses when drawing, so the rule cannot drift from the model');

    t.note('setting a border, and what turns it off again');
    t.ok(/public void SetBorder\(int row, int column, SheetBorderEdges edges, double thickness, Color\? color\)/
        .test(cs), 'borders', 'C#: SetBorder takes the whole border in one call, beside the other Set*');
    t.ok(/Public Sub SetBorder\(row As Integer, column As Integer, edges As SheetBorderEdges,\s*\n?\s*thickness As Double, color As Nullable\(Of Color\)\)/
        .test(vb), 'borders', 'VB: the same signature, member for member');
    for (const [name, source] of [['C#', cs], ['VB', vb]]) {
        // The EDGES are the switch. A width of 0 (or less) is the sheet's own line, NOT "no border" — a
        // cell that says where its border goes but not how thick gets a line like every other line on the
        // sheet, which is what a hand-written `BorderEdges="All"` relies on.
        t.ok(/SetBorder[\s\S]{0,1400}?SheetBorderEdges\.None/.test(source), 'borders',
            `${name}: no EDGES is what turns a border off`);
        t.ok(!/SetBorder[\s\S]{0,1400}?thickness <= 0/.test(source), 'borders',
            `${name}: and a width alone never does — 0 means the sheet's own line`);
        t.ok(/SetBorder[\s\S]{0,1600}?color = (?:null|Nothing)\b/.test(source), 'borders',
            `${name}: turning it off clears the colour too`);
        t.ok(/SetBorder[\s\S]{0,1800}?InvalidateVisual\(\)/.test(source), 'borders',
            `${name}: a border change repaints`);
        // ClearFormatting is the one path that has to drop it as well, or "Clear formatting" leaves a box.
        t.ok(/ClearFormatting[\s\S]{0,1500}?BorderEdges = SheetBorderEdges\.None[\s\S]{0,200}?BorderThickness = 0[\s\S]{0,200}?BorderColor = (?:null|Nothing)\b/
            .test(source), 'borders', `${name}: ClearFormatting drops the border with the rest`);
    }

    t.note('the border is DRAWN — over the grid lines, before the text, and on a page as well');
    for (const [name, source, area, helper] of [
        ['C#', cs, 'public override void Render', 'private void DrawCellBorder'],
        ['VB', vb, 'Public Overrides Sub Render', 'Private Sub DrawCellBorder']
    ]) {
        const body = source.slice(source.indexOf(area));
        t.ok(body.includes(helper), 'borders', `${name}: the render has a border pass of its own`);
        // Order is the whole point: a border must cover the grid line it sits on, and the text must stay
        // on top of both — so the call has to fall between the grid-line loops and the text loop.
        const lines = body.indexOf('gridPen');
        const borders = body.indexOf('DrawCellBorder(context, CellRect');
        const text = body.indexOf('inPlaceEdit');
        t.ok(lines >= 0 && borders > lines && text > borders, 'borders',
            `${name}: the pass runs after the grid lines and before the text`);
        // A border is PAGE CONTENT — unlike the wash and the selection outline, which a page drops — so
        // neither the call site nor the drawing method may test the page flag.
        t.ok(!/_printRange/.test(source.slice(borders - 400, borders)) &&
            !/_printRange/.test(source.slice(source.indexOf(helper), source.indexOf(helper) + 2200)), 'borders',
            `${name}: borders print — nothing about the page suppresses them`);
        // The half-thickness end extension: two lines that stop at the corner leave a chip out of the
        // outside of every corner of a box (proved in /tmp/sheetborders by the four outer corner pixels).
        t.ok(/rect\.X - \(left \? half : 0\)/.test(source) || /rect\.X - If\(hasLeft, half, 0\.0\)/.test(source),
            'borders', `${name}: the ends reach into the corner when the edge that meets there is drawn too`);
        t.ok(helper.slice(0, 40).length > 0 &&
            new RegExp(`${helper}[\\s\\S]{0,1800}?GridColor`).test(source), 'borders',
            `${name}: and a null BorderColor falls back to the sheet's own GridColor`);
    }

    t.note('the border travels in the workbook: a borders table, a borderId, and both directions');
    for (const [name, source] of [['C#', cs], ['VB', vb]]) {
        // Excel names every look twice over; a border is the third table of that kind, and it is INTERNED
        // the same way — one entry per distinct border, however many cells wear it.
        t.ok(/EmptyBorder/.test(source) && /_borders\b/.test(source) && /_borderAt/.test(source), 'borders',
            `${name}: a borders table of its own, interned like the fonts and the fills`);
        t.ok(/<border><left \/><right \/><top \/><bottom \/><diagonal \/><\/border>/.test(source), 'borders',
            `${name}: index 0 is Excel's empty border, with all four sides bare and a diagonal it ignores`);
        t.ok(/Function EdgeStyle|string EdgeStyle/.test(source) && /"thick"/.test(source) &&
            /"medium"/.test(source) && /"thin"/.test(source), 'borders',
            `${name}: a width in pixels becomes the one of Excel's three line styles it means — ` +
            'everything under medium is thin, which is also what a width of 0 is');
        t.ok(/String\.Empty|string\.Empty/.test(source) && /BorderKey/.test(source), 'borders',
            `${name}: and a cell that asked for no border has no key — so it never enters the table`);
        // The xf points into the table, and `applyBorder` is what tells a reader the border is meant.
        t.ok(source.includes('borderId=') && source.includes('applyBorder'), 'borders',
            `${name}: the format carries a borderId and says the border applies`);
        t.ok(/<borders count=/.test(source), 'borders', `${name}: the styles part writes the table itself`);
        // Order is not cosmetic: Excel refuses a styles part whose tables are out of schema order.
        const fillsAt = source.indexOf('<fills count');
        const bordersAt = source.indexOf('<borders count');
        const xfsAt = source.indexOf('<cellXfs count');
        t.ok(fillsAt > 0 && bordersAt > fillsAt && xfsAt > bordersAt, 'borders',
            `${name}: and writes it in the one order Excel accepts — fonts, fills, borders, cellXfs`);
        // Reading it back: the same four sides, the style's width, and the side's own colour.
        t.ok(/StyleThickness/.test(source) && /"thick"/.test(source), 'borders',
            `${name}: the reader turns Excel's line style back into a width`);
        t.ok(/"borders"/.test(source), 'borders',
            `${name}: it finds the border elements under the borders table, not anywhere in the part`);
        t.ok(/diagonal/.test(source), 'borders',
            `${name}: and knows a diagonal is not one of the four sides it draws`);
        // THE KEEP-ALIVE RULE, in the two places a cell can be dropped for having nothing to say. An empty
        // box is exactly what someone draws a border FOR, so a bordered blank must survive both.
        t.ok(/text\.Length == 0 && !cell\.Fill\.HasValue &&[\s\S]{0,90}?cell\.BorderEdges == SheetBorderEdges\.None/
            .test(source) || /text\.Length = 0 AndAlso Not cell\.Fill\.HasValue AndAlso[\s\S]{0,90}?cell\.BorderEdges = SheetBorderEdges\.None/
                .test(source), 'borders',
            `${name}: the WRITER still writes a cell whose only feature is a border`);
        t.ok(/format\.Edges ={1,2} SheetBorderEdges\.None/.test(source), 'borders',
            `${name}: and the READER still builds one — neither half may call a bordered blank "nothing"`);
    }

    // The VB twin's own traps, each one a bug that COMPILED and failed only at run time.
    t.ok(/Dim borderLook As String = BorderKey\(cell\)/.test(vb) && !/Dim borderKey As String = BorderKey\(/.test(vb),
        'borders', 'VB: the local is not named after the method it calls — VB is case-insensitive, so ' +
    '`borderKey` would shadow `BorderKey` and index it');
    t.ok(/wanted As Boolean/.test(vb) && !/EdgeXml\([\s\S]{0,120}?\bon As Boolean/.test(vb), 'borders',
        'VB: no parameter is called `on` — that is a reserved word, and the twin ships with Option Strict Off');
    t.ok(vb.includes('& XmlText(text) &') && !vb.includes('& Text(text) &'), 'borders',
        'VB: the inline string is escaped by XmlText — `Text(text)` binds to the String PARAMETER `text` ' +
        'and indexes it, so the twin could not save a text cell at all until this was caught');

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
    t.equal(sheet.sheetCellIsStyled({ row: 1, column: 1, text: '', borderEdges: 'All' }), true, 'format',
        'and so is a border — the third place the "nothing to say" rule lives, after the writer\'s loop ' +
        'and the reader\'s filter');
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
    t.ok(read('media/designer.js').includes("'bold', 'italic', 'fontSize', 'fontFamily', 'textColor', 'fill', 'textAlign',") &&
        read('media/designer.js').includes("'borderEdges', 'borderThickness', 'borderColor'"), 'wiring',
        'the webview editor keys its cells by the same ten fields');
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

    // ---------------------------------------------------------------- the 2026-09-26 runtime batch
    // Five things reported from the running app. Each is a SOURCE check because every one of them is a
    // seam between two files (or between the twins), which is exactly where this project's bugs live:
    // the in-cell editor drew nothing because Render skipped the cell the editor was supposed to draw,
    // and the character that was not typed went nowhere because InsertIntoEdit was written and never
    // called. Both compiled, both ran, and neither showed up in a test until now.
    t.note('the runtime fixes are in BOTH twins, and in the C# one as well');

    /** The two twins, so every assertion below is made twice — a fix in one language only is not a fix. */
    const twins = [['C#', cs], ['VB', vb]];
    const has = (source, needle) => source.replace(/\r\n/g, '\n').includes(needle);

    // 1) the in-place editor's text is drawn, with its caret, while typing.
    for (const [name, source] of twins) {
        t.ok(has(source, 'inPlaceEdit'), `fix:${name}`, 'the cell being edited is drawn in place');
        // The editor's text comes from _editText — the cell still holds the OLD value, and since phase 3 the
        // cell's own text may be a FORMULA, so the cell being typed in must not draw either of them.
        t.ok(/_editText[\s\S]{0,60}?ValueOf\(row, column\)/.test(source), `fix:${name}`,
            'its text comes from the editor, and every other cell draws what it WORKS OUT TO');
        t.ok(/editingAlign[\s\S]{0,500}?_caret/.test(source), `fix:${name}`,
            'and it is drawn WITH the caret');
        // …and every typed character reaches it: the insert method has to be CALLED, not just present.
        t.ok(/OnTextInput[\s\S]{0,2500}?InsertIntoEdit\(/.test(source), `fix:${name}`,
            'typing while the editor is open inserts into it (InsertIntoEdit is actually called)');
    }

    // 2) the selection corners: a whole-column selection spans every ROW, so its COLUMNS come from the
    //    anchor. The two flags were swapped, which is why clicking C selected A:C.
    for (const [name, source] of twins) {
        t.ok(/SelectionFirstRow[\s\S]{0,400}?_wholeColumns/.test(source), `fix:${name}`,
            'SelectionFirstRow tests the whole-COLUMN flag');
        t.ok(/SelectionFirstColumn[\s\S]{0,400}?_wholeRows/.test(source), `fix:${name}`,
            'and SelectionFirstColumn tests the whole-ROW one');
        t.ok(has(source, 'SelectedFirstColumn') && has(source, 'SelectColumn('), `fix:${name}`,
            'and the corners and SelectColumn are public, so the rule can be checked from outside');
    }

    // 3) the right-click menu. It is DRAWN BY THE CONTROL, not an Avalonia ContextMenu: that never opened
    //    for a real right-click (reported 2026-09-26 — the menu existed, its items worked when raised by
    //    hand, and right-clicking opened nothing at all), and the pixel probes in /tmp/sheetkeys (C#) and
    //    /tmp/sheetvbfix (VB) now right-click for real and find the panel on the canvas.
    for (const [name, source] of twins) {
        t.ok(!/new ContextMenu\(\)|New ContextMenu\(\)/.test(source), `fix:${name}`,
            'no Avalonia ContextMenu is used any more');
        t.ok(!/ContextRequested\s*\+=|AddHandler ContextRequested/.test(source), `fix:${name}`,
            'and nothing is left waiting on ContextRequested, which never reached the control ' +
            '(the comments may still explain why)');
        t.ok(has(source, 'IsRightButtonPressed'), `fix:${name}`,
            'the right button is handled by the control itself');
        t.ok(/IsRightButtonPressed[\s\S]{0,400}?ShowContextMenu\(/.test(source), `fix:${name}`,
            'and that is what opens the menu');
        t.ok(has(source, 'class SheetMenuItem') || has(source, 'Class SheetMenuItem'), `fix:${name}`,
            'a menu line is a plain class the control owns');
        for (const [needle, what] of [['Label', 'a label'], ['IsSeparator', 'a separator'], ['Ticked', 'a tick'],
        ['Run', 'and a command']]) {
            t.ok(new RegExp(`\\b${needle}\\b[\\s\\S]{0,120}?[=;]`).test(source), `fix:${name}`,
                `a menu line carries ${what}`);
        }
        for (const constant of ['MenuWidth', 'MenuItemHeight', 'MenuSeparatorHeight', 'MenuPad']) {
            t.ok(has(source, constant), `fix:${name}`, `the menu's geometry is a constant (${constant})`);
        }
        t.ok(has(source, 'BuildMenuItems'), `fix:${name}`, 'the lines are built on each open');
        for (const label of ['Align left', 'Align centre', 'Align right', 'Align automatically', 'Bold',
            'Italics', 'Clear formatting', 'Clear cells']) {
            t.ok(has(source, label), `fix:${name}`, `the menu offers ${label}`);
        }
        t.ok(has(source, 'AlignSelection('), `fix:${name}`, 'centring goes through AlignSelection');
        t.ok(has(source, 'SelectionTextAlign') && has(source, 'SelectionAllBold'), `fix:${name}`,
            'and the tick comes from what the selection already is');
        // A whole column must NOT gain a cell per empty row — the rule AlignSelection exists for.
        t.ok(/AlignSelection[\s\S]{0,700}?bounded/.test(source), `fix:${name}`,
            'a whole column only touches the cells that already exist');
        // Drawn, not popped up: the panel is painted LAST, over the scrollbars and everything else.
        t.ok(/DrawScrollBars\([\s\S]{0,200}?DrawContextMenu\(/.test(source), `fix:${name}`,
            'the panel is painted over everything else, last');
        t.ok(/DrawContextMenu[\s\S]{0,900}?GridColor/.test(source), `fix:${name}`,
            'and takes the sheet\'s own colours, so it fits any theme');
        // The mouse and the keyboard both drive it, and there has to be a way out of it.
        t.ok(/MenuItemAt[\s\S]{0,400}?IsSeparator/.test(source), `fix:${name}`,
            'a separator is not a line the pointer can land on');
        t.ok(has(source, 'ChooseMenuItem'), `fix:${name}`, 'a press inside the panel chooses a line');
        t.ok(has(source, 'CloseContextMenu'), `fix:${name}`, 'and there is a way to close it');
        t.ok(/OnPointerWheelChanged[\s\S]{0,300}?CloseContextMenu\(\)/.test(source), `fix:${name}`,
            'the wheel closes it — a menu pointing at a cell that scrolled away is wrong');
        t.ok(/OnSheetLostFocus[\s\S]{0,200}?CloseContextMenu\(\)/.test(source), `fix:${name}`,
            'so does losing the keyboard');
        t.ok(has(source, 'HandleMenuKey'), `fix:${name}`, 'the menu owns the keyboard while it is open');
        t.ok(/HandleMenuKey[\s\S]{0,1200}?Key\.Escape/.test(source), `fix:${name}`, 'Escape closes it');
        t.ok(/HandleMenuKey[\s\S]{0,1200}?Key\.Up/.test(source) && /HandleMenuKey[\s\S]{0,1200}?Key\.Down/.test(source),
            `fix:${name}`, 'the arrows move the highlight past the separators');
        t.ok(/HandleMenuKey[\s\S]{0,3200}?Key\.Enter/.test(source), `fix:${name}`, 'and Enter chooses');
        t.ok(/HandleMenuKey[\s\S]{0,200}?_menuOpen[\s\S]{0,200}?Return False/.test(source) ||
            /HandleMenuKey[\s\S]{0,200}?_menuOpen[\s\S]{0,200}?return false/.test(source), `fix:${name}`,
            'and it does nothing at all when the menu is closed');
        // A read-only sheet has nothing to line up, so it offers no menu.
        t.ok(/ShowContextMenu[\s\S]{0,200}?AllowEditing/.test(source), `fix:${name}`,
            'a read-only sheet opens no menu');
        // The panel is clamped inside the control, so an edge right-click cannot draw it off the sheet.
        t.ok(/ShowContextMenu[\s\S]{0,900}?Math\.Max\(0, Math\.Min\(point\.X, size\.Width - MenuWidth\)\)/.test(source),
            `fix:${name}`, 'and the panel is clamped inside the sheet near an edge');
    }

    // 4) dragging a border to size a column or a row.
    for (const [name, source] of twins) {
        t.ok(has(source, 'MinTrackSize'), `fix:${name}`, 'a track has a minimum size');
        t.ok(has(source, 'ColumnBorderAt') && has(source, 'RowBorderAt'), `fix:${name}`,
            'a header border is a hit zone of its own');
        t.ok(has(source, 'ColumnOffsets()') && has(source, 'RowOffsets()'), `fix:${name}`,
            'and the geometry is offset tables, not one width for every column');
        t.ok(has(source, 'ColumnWidths') && has(source, 'RowHeights'), `fix:${name}`,
            'the sizes are readable and writable as sparse attribute text');
        t.ok(has(source, 'SheetSizeChanged'), `fix:${name}`,
            'and announced once per drag (the name avoids Control.SizeChanged)');
        t.ok(!has(source, 'public event EventHandler<SheetSizeChangedEventArgs>? SizeChanged;') &&
            !has(source, 'Public Event SizeChanged '), `fix:${name}`,
            'never hidden behind Control.SizeChanged');
    }

    // 5) scrollbars, and a wheel that can reach the columns on the right.
    for (const [name, source] of twins) {
        t.ok(has(source, 'ShowScrollBars'), `fix:${name}`, 'the scrollbars can be switched off');
        t.ok(has(source, 'VScrollRect') && has(source, 'HScrollRect') && has(source, 'DrawScrollBars'),
            `fix:${name}`, 'and each is drawn only when there is something to scroll to');
        t.ok(has(source, 'ScrollTrackTo') && has(source, 'ScrollThumbTo'), `fix:${name}`,
            'the thumb can be dragged and the track clicked');
        // A plain wheel must scroll the columns when the rows all fit — the complaint was that the
        // columns off to the right could not be reached at all with an ordinary mouse.
        t.ok(/OnPointerWheelChanged[\s\S]{0,700}?ContentHeight\(\) <= grid\.Height/.test(source), `fix:${name}`,
            'and the wheel falls back to the columns when there are no rows to scroll');
        t.ok(/MeasureOverride[\s\S]{0,900}?ContentWidth\(\)/.test(source), `fix:${name}`,
            'the natural size counts the widened columns, or the last ones stay clipped');
        t.ok(has(source, 'ColumnWidthOf(column)') && has(source, 'RowHeightOf(row)'), `fix:${name}`,
            'and header labels are centred in their own track');
    }

    // 6) the keyboard: an arrow key on its own, and the Ctrl+Arrow/Ctrl+End a real sheet is driven with.
    for (const [name, source] of twins) {
        t.ok(/Key\.Left[\s\S]{0,200}?MoveWithControl\(0, -1/.test(source), `nav:${name}`,
            'Left goes through MoveWithControl');
        t.ok(/Key\.Right[\s\S]{0,200}?MoveWithControl\(0, 1/.test(source), `nav:${name}`, 'Right too');
        t.ok(/Key\.Up[\s\S]{0,200}?MoveWithControl\(-1, 0/.test(source), `nav:${name}`, 'Up too');
        t.ok(/Key\.Down[\s\S]{0,200}?MoveWithControl\(1, 0/.test(source), `nav:${name}`, 'Down too');
        t.ok(/MoveWithControl\([\s\S]{0,400}?If Not control|MoveWithControl\([\s\S]{0,400}?if \(!control\)/.test(source),
            `nav:${name}`, 'without Ctrl it is a plain one-cell move');
        t.ok(has(source, 'LastUsedCell'), `nav:${name}`, 'the last used cell can be found');
        t.ok(/Key\.End[\s\S]{0,300}?LastUsedCell\(\)/.test(source), `nav:${name}`,
            'Ctrl+End goes to the bottom-right of what is in the sheet');
        // Focus on load: the arrows have to work before anything is clicked, or it reads as "ignores the
        // keyboard". It cannot be done on attach — there is no TopLevel yet — so it waits for Loaded and
        // then one step through the dispatcher.
        t.ok(has(source, 'OnAttachedToVisualTree'), `focus:${name}`, 'the sheet hooks the attached event');
        t.ok(/OnAttachedToVisualTree[\s\S]{0,300}?Loaded/.test(source), `focus:${name}`,
            'and waits for Loaded, where there is a TopLevel to ask');
        t.ok(/Dispatcher[\s\S]{0,120}?Post\([\s\S]{0,120}?TryTakeFocus/.test(source), `focus:${name}`,
            'the request is posted, because asking inside Loaded itself is too early and is refused');
        t.ok(/TryTakeFocus[\s\S]{0,500}?(GetFocusedElement\(\)|FocusManager)/.test(source), `focus:${name}`,
            'and it only takes the keyboard when nothing else has it');
    }

    // 7) phase 3: formulas. A formula cell KEEPS its text and DRAWS its result, so the grid reads as results
    //    while the fx box and the editor read as formulas. The behaviour is measured by the two probes
    //    (/tmp/sheetformula and /tmp/sheetformulavb, 69 and 63 checks); what this pins is the SEAMS — the
    //    things that would break one twin, or the pair, without failing to compile.
    t.note('the formula engine is in BOTH twins, member for member');
    for (const [name, source] of twins) {
        for (const error of ['#DIV/0!', '#VALUE!', '#NAME?', '#REF!', '#CYCLE!']) {
            t.ok(has(source, error), `formula:${name}`, `the ${error} name is declared`);
        }
        t.ok(/ValueOf\(/.test(source), `formula:${name}`, 'ValueOf is the one call that computes a value');
        t.ok(/InvalidateValues\(\)/.test(source), `formula:${name}`, 'and its answers are dropped on a change');
        // The cache must be dropped for a cell edit AND for the Cells collection (XAML content adds cells
        // through the collection, not through SetCell).
        t.ok(/OnCellChanged\(row, column, value\)[\s\S]{0,200}?InvalidateValues\(\)/.test(source),
            `formula:${name}`, 'a cell edit forgets every result');
        t.ok(/OnCellsChanged[\s\S]{0,300}?InvalidateValues\(\)/.test(source),
            `formula:${name}`, 'and so does a change to the Cells collection');
        // A formula that reaches itself is NAMED, not a stack overflow.
        t.ok(/_evaluating[\s\S]{0,200}?CycleError/.test(source), `formula:${name}`,
            'a cell that is already being worked out reports #CYCLE!');
        t.ok(/_evaluating\.Remove\(key\)/.test(source), `formula:${name}`,
            'and the guard is released again on the way out');
        // IF does not evaluate the branch it does not take — the usual way to guard a division.
        t.ok(has(source, 'CallIf') && has(source, 'SkipArgument'), `formula:${name}`,
            'IF skips the branch it does not take');
        // A range past the last row is clipped, so SUM(B2:B999) means the column the author meant.
        t.ok(/Math\.Min\(_sheet\.RowCount, Math\.Max\(row1, row2\)\)/.test(source), `formula:${name}`,
            'a range is clipped to the sheet');
        // The engine is bounded, or a hand-typed monster takes the app down.
        t.ok(has(source, 'FormulaMaxDepth'), `formula:${name}`, 'nesting is bounded');
        // The address reader is NOT ParseCellName: a formula is read at an OFFSET, and "$A$1" is allowed.
        t.ok(has(source, 'TryReadAddress'), `formula:${name}`, 'the formula reader finds an address at an offset');
        t.ok(has(source, 'ParseCellName'), `formula:${name}`, 'and the public ParseCellName is left alone');
        // Twin-safe member names: VB owns Mod, Not, Name, IsNumeric and Call, so the pair uses these —
        // rename one in C# and the VB twin stops compiling, which is exactly what this catches early.
        for (const member of ['Modulo', 'LogicalNot', 'ReadName', 'IsNumericValue', 'CallFunction']) {
            t.ok(has(source, member), `formula:${name}`, `${member} is the shared name (a VB keyword otherwise)`);
        }
        t.ok(!/\bMod\(args\)|\bNot\(args\)|\.Call\(name/.test(source), `formula:${name}`,
            'and none of the VB keywords is used as a member');
    }

    // 8) the design-time sizing handles: a dragged header border in the Cells editor writes exactly what a
    //    dragged header border in the running control writes — the sheet's own sparse ColumnWidths /
    //    RowHeights — and refuses exactly what the control refuses (its 16px MinTrackSize). This is a twin
    //    rule twice over: the text has to be the same dialect, and the floor has to be the same number.
    t.note('a dragged border writes the control’s own sparse size text, in the designer and at run time');
    t.equal(sheet.SHEET_COLUMN_WIDTHS_ATTR, 'ColumnWidths', 'tracks', 'columns are ColumnWidths');
    t.equal(sheet.SHEET_ROW_HEIGHTS_ATTR, 'RowHeights', 'tracks', 'rows are RowHeights');
    t.equal(sheet.SHEET_TRACK_MIN, 16, 'tracks', 'and the floor is the control’s MinTrackSize');
    for (const [name, source] of twins) {
        t.ok(/MinTrackSize\s*(As Double\s*)?=\s*16(\.0)?/.test(source), `tracks:${name}`,
            'the control’s own floor is 16 — change one and this pair must change together');
        t.ok(has(source, 'ColumnWidths') && has(source, 'RowHeights'), `tracks:${name}`,
            'the control reads and writes both attributes');
    }

    // Junk is skipped rather than rejected, which is the rule the control applies to the same text (its own
    // probe indexes "banana,2:100,99:50,3:" down to "2:100"), and a size below the floor is dropped so the
    // editor never draws a column it cannot grab.
    const junk = sheet.parseSheetTracks('banana,2:100,3:,4:8,5:120');
    t.equal(JSON.stringify([...junk.entries()]), JSON.stringify([[2, 100], [5, 120]]), 'tracks',
        'a size list is read tolerantly: junk and sub-minimum sizes are skipped');

    // …and written back SORTED, so the same sizes always save as the same string.
    t.equal(sheet.sheetTracksText(new Map([[7, 60], [3, 120]])), '3:120,7:60', 'tracks',
        'sizes are written in index order, so an untouched sheet does not reshuffle');
    t.equal(sheet.sheetTracksText(sheet.parseSheetTracks('3:120,7:60')), '3:120,7:60', 'tracks',
        'and the text round-trips');

    // The sheet's own sizes, and the payload the editor draws from.
    const sizedModel = model('<spread:GrumpySheet x:Name="s1" ColumnWidth="90" RowHeight="24" ' +
        'ColumnWidths="2:140" RowHeights="banana,1:40"/>');
    const sizedEl = findSheet(sizedModel);
    const trackSizes = sheet.sheetTrackSizesOf(sizedEl);
    t.equal(trackSizes.columnWidth, 90, 'tracks', 'a track without a size of its own uses ColumnWidth');
    t.equal(trackSizes.rowHeight, 24, 'tracks', 'and RowHeight');
    t.equal(JSON.stringify([...trackSizes.columnWidths.entries()]), JSON.stringify([[2, 140]]), 'tracks',
        'column 2 has its own width');
    t.equal(JSON.stringify([...trackSizes.rowHeights.entries()]), JSON.stringify([[1, 40]]), 'tracks',
        'row 1 has its own height, and the junk beside it is skipped');
    const trackInfo = sheet.sheetInfoOf(sizedEl);
    t.equal(JSON.stringify(trackInfo.columnWidths), JSON.stringify({ 2: 140 }), 'tracks',
        'the editor’s payload carries the sizes as plain objects (a Map does not survive a message)');
    t.equal(trackInfo.columnWidth, 90, 'tracks', 'with the sheet’s own width beside them');

    // Writing them back: the sparse text, and REMOVING the attribute when nothing is left, which is how a
    // track goes back to ColumnWidth / RowHeight again.
    sheet.writeSheetTracks(sizedModel, sizedEl, { 1: 30, 3: 200 }, { 2: 34 });
    t.equal(sizedEl.getAttribute('ColumnWidths'), '1:30,3:200', 'tracks',
        'Save writes the sparse text the control expects');
    t.equal(sizedEl.getAttribute('RowHeights'), '2:34', 'tracks', 'for both axes');
    sheet.writeSheetTracks(sizedModel, sizedEl, {}, {});
    // xmldom answers '' for an attribute that is not there, so hasAttribute is the honest check.
    t.equal(sizedEl.hasAttribute('ColumnWidths'), false, 'tracks',
        'and an empty list REMOVES the attribute, so the sheet follows its own size again');
    t.equal(sizedEl.hasAttribute('RowHeights'), false, 'tracks', 'for the rows too');

    t.note('the designer panel can set the new properties'); const catalog = read('src/propertyCatalog.ts');
    for (const key of ['ShowScrollBars', 'ColumnWidths', 'RowHeights']) {
        t.ok(catalog.includes(`key: '${key}'`), 'panel', `the GrumpySheet rows offer ${key}`);
    }
    // The sheet is dockable, like the charts and every other panel child: the 'Dock' row writes the
    // ATTACHED DockPanel.Dock, which is what Avalonia's DockPanel reads — the control needs no property of
    // its own for it (GrumpyPanel's header says the same thing: "It has a Dock property of its own
    // (DockPanel.Dock)"). The designer then wraps the sheet in a DockPanel if it is not in one, and clears
    // the free-axis size so it stretches to that edge.
    const sheetRows = catalog.slice(catalog.indexOf('    GrumpySheet: ['),
        catalog.indexOf('    GrumpyLinePlot: ['));
    t.ok(sheetRows.includes("key: 'DockPanel.Dock'"), 'panel', 'the sheet offers the Dock row');
    t.ok(sheetRows.includes("label: 'Dock'") && sheetRows.includes('DOCK_OPTIONS'), 'panel',
        'labelled Dock, with the same dock list as every other control');
    t.ok(/DockPanel\.Dock/.test(read('src/designerPanel.ts')), 'panel',
        'and the designer handles DockPanel.Dock generically (wrapping the control in a DockPanel)');

    // ---------------------------------------------------------------------------------------------
    // 2026-09-27 — the toolbar, the .xlsx round trip and the macro list.
    //
    // Three features, and for each of them the failure that would be SILENT rather than loud:
    //
    //   * a macro the list offers but the PARSER cannot dispatch — the user picks StdDev from the popup
    //     and the cell says #NAME?, which reads as "the sheet is broken", not "the list lied";
    //   * a print path OUTSIDE the PRINT_SUPPORT guard — the file then needs packages and a helper a
    //     project without print support does not have, so it stops compiling entirely (this one really
    //     happened: `GrumpyPrint` was referenced unqualified and unguarded, and 12 generated projects
    //     failed to build);
    //   * a bundled-file MARKER that does not move — an existing project then keeps its old copy of the
    //     sheet for ever, so the toolbar never appears no matter how often it opens the form.
    t.section('T2: the spreadsheet toolbar, .xlsx and macro list');

    const bothTwins = (snippet, group) => {
        t.ok(cs.includes(snippet), group, `C#: ${snippet}`);
        t.ok(vb.includes(snippet), group, `VB: ${snippet}`);
    };

    t.note('the three new property rows exist in both twins, with one default each');
    t.ok(/Register<GrumpySheet, bool>\(nameof\(ShowToolbar\), true\)/.test(cs), 'toolbar',
        'C#: ShowToolbar defaults to true — a dropped sheet has File and Print straight away');
    t.ok(/Register\(Of GrumpySheet, Boolean\)\(NameOf\(ShowToolbar\), True\)/.test(vb), 'toolbar',
        'VB: the same default');
    t.ok(/nameof\(EditBackColor\), Color\.Parse\("#FFFFFF"\)/.test(cs) &&
        /NameOf\(EditBackColor\), Color\.Parse\("#FFFFFF"\)/.test(vb), 'toolbar',
        'the fx box backcolour defaults to white in both twins');
    t.ok(/nameof\(EditTextColor\), Color\.Parse\("#1E2228"\)/.test(cs) &&
        /NameOf\(EditTextColor\), Color\.Parse\("#1E2228"\)/.test(vb), 'toolbar',
        'and its text colour to the sheet\'s own text colour');
    t.ok(/AffectsRender<GrumpySheet>\([\s\S]{0,400}?ShowToolbarProperty/.test(cs) &&
        /AffectsRender\(Of GrumpySheet\)\([\s\S]{0,400}?ShowToolbarProperty/.test(vb), 'toolbar',
        'all three re-render the sheet when they change (ShowToolbar also re-measures it)');
    t.ok(/AffectsMeasure<GrumpySheet>\([\s\S]{0,300}?ShowToolbarProperty/.test(cs) &&
        /AffectsMeasure\(Of GrumpySheet\)\([\s\S]{0,300}?ShowToolbarProperty/.test(vb), 'toolbar',
        'because the strip takes room from the grid, so the layout has to run again');

    t.note('the toolbar, its menus and the macro list are in both twins');
    bothTwins('DrawToolbar', 'toolbar');
    bothTwins('OpenToolbarMenu', 'toolbar');
    bothTwins('BuildFileItems', 'toolbar');
    bothTwins('BuildPrintItems', 'toolbar');
    bothTwins('BuildPageItems', 'toolbar');
    bothTwins('ToolbarButtonAt', 'toolbar');
    bothTwins('MenuKind', 'toolbar');
    bothTwins('FitMacroItems', 'macro');
    bothTwins('UpdateMacroPopup', 'macro');
    bothTwins('AcceptMacro', 'macro');
    bothTwins('SelectedRangeText', 'macro');
    bothTwins('SheetPickerMemory', 'toolbar');
    t.ok(/One page is loaded at a time/.test(cs) && /One page is loaded at a time/.test(vb), 'toolbar',
        'the page list says one page is loaded at a time — the reminder to a user picking a page');
    t.ok(/_macroStart = -1[\s\S]{0,80}?CloseContextMenu|CloseContextMenu[\s\S]{0,200}?_macroStart = -1/.test(cs),
        'macro', 'closing a menu also drops the macro list\'s claim on the text');

    t.note('the macro list and the parser agree — the check that stops the list offering what Apply cannot do');
    const csMacros = [...cs.matchAll(/new SheetMacro \{ Name = "(\w+)"/g)].map((m) => m[1]);
    const vbMacros = [...vb.matchAll(/New SheetMacro With \{\.Name = "(\w+)"/g)].map((m) => m[1]);
    t.ok(csMacros.length >= 20, 'macro', `C#: the list offers ${csMacros.length} macros`);
    t.equal(vbMacros.join(','), csMacros.join(','), 'macro', 'and the VB list is the same list, in order');
    t.ok(csMacros.includes('Sum') && csMacros.includes('Avg') && csMacros.includes('StdDev') &&
        csMacros.includes('Max') && csMacros.includes('Min'), 'macro',
        'including the five the feature was asked for');
    // Every name is dispatched: by Apply's switch, or — for IF, which is lazy — by CallFunction.
    const applyCs = cs.slice(cs.indexOf('private FormulaValue Apply('), cs.indexOf('private FormulaValue Apply(') + 2000);
    const applyVb = vb.slice(vb.indexOf('Private Function Apply('), vb.indexOf('Private Function Apply(') + 2000);
    const missing = csMacros.filter((name) => {
        const upper = name.toUpperCase();
        if (upper === 'IF') return !/name == "IF"/.test(cs) || !/name = "IF"/.test(vb);
        return !applyCs.includes(`case "${upper}":`) && !applyCs.includes(`"${upper}"`) ||
            !applyVb.includes(`"${upper}"`);
    });
    t.equal(missing.join(','), '', 'macro', 'every macro the list offers is one the parser dispatches');

    t.note('the range spelling the list writes is the one the parser reads');
    t.ok(/_text\[probe\] == '\.' && _text\[probe \+ 1\] == '\.'/.test(cs), 'formula',
        'C#: Argument() accepts A1..B3 as well as A1:B3');
    t.ok(/_text\(probe\) = "\."c AndAlso _text\(probe \+ 1\) = "\."c/.test(vb), 'formula',
        'VB: the same two-dot separator');
    t.ok(/CellName\(firstRow, firstColumn\) \+ ":" \+ CellName/.test(cs) &&
        /CellName\(firstRow, firstColumn\) & ":" & CellName/.test(vb), 'macro',
        'and the macro pick WRITES it with a colon — the spelling every spreadsheet uses, and what the ' +
        'tooltip now says; the two-dot form above still reads, so nothing typed before it breaks');
    t.ok(/_rangeFirstRow/.test(cs) && /_rangeFirstRow/.test(vb), 'macro',
        'the last BLOCK selected is remembered, so "select the figures, click the total cell, type =sum" works');
    t.ok(/_rangeFirstRow = SelectionFirstRow\(\)/.test(cs) && /_rangeFirstRow = SelectionFirstRow\(\)/.test(vb),
        'macro', 'and it is remembered in RaiseSelectionChanged, while the block IS the selection');

    t.note('StdDev arrived with the sample and population split');
    for (const name of ['STDEV', 'STDDEV', 'STDEVP', 'STDDEVP']) {
        t.ok(cs.includes(`case "${name}":`), 'formula', `C#: ${name} is dispatched`);
        t.ok(vb.includes(`"${name}"`), 'formula', `VB: ${name} is dispatched`);
    }
    t.ok(/StdDev\(numbers, true\)/.test(cs) && /StdDev\(numbers, false\)/.test(cs), 'formula',
        'C#: the sample and population forms are the same helper with one flag');
    t.ok(/StdDevOf\(numbers, True\)/.test(vb) && /StdDevOf\(numbers, False\)/.test(vb), 'formula',
        'VB: named StdDevOf, because a bare StdDev would read as another property');

    t.note('the workbook round trip is in both twins');
    bothTwins('SaveWorkbook', 'book');
    bothTwins('LoadWorkbook', 'book');
    bothTwins('WorkbookPages', 'book');
    bothTwins('ExportPng', 'book');
    bothTwins('StatusText', 'book');
    bothTwins('"xl/workbook.xml"', 'book');
    bothTwins('xl/worksheets/sheet1.xml', 'book');
    bothTwins('inlineStr', 'book');
    bothTwins('sharedStrings.xml', 'book');
    bothTwins('xl/styles.xml', 'book');
    bothTwins('sheetData', 'book');
    t.ok(/type == "s"/.test(cs), 'book', 'C#: a shared string is resolved through the shared-strings table');
    t.ok(/type = "s"/.test(vb), 'book', 'VB: the same');
    t.ok(/sheet\.Rows = Math\.Max\(sheet\.Rows/.test(cs) && /sheet\.Rows = Math\.Max\(sheet\.Rows/.test(vb),
        'book', 'a loaded page GROWS the sheet and never shrinks it');
    t.ok(/xmlns:r=/.test(cs) && /xmlns:r=/.test(vb), 'book',
        'the workbook part declares the r: namespace its r:id lives in');
    // The two things a hand-written cell part gets wrong: a text cell without the type attribute (every
    // reader then drops the text) and a formula without its cached value (a reader that does not
    // calculate shows nothing).
    t.ok(/t=\\"inlineStr\\"/.test(cs) || cs.includes('t="inlineStr"'), 'book',
        'C#: a text cell says t="inlineStr"');
    t.ok(vb.includes('t=""inlineStr""'), 'book', 'VB: the same attribute');
    t.ok(/<f>[\s\S]{0,60}?<\/f>" \+ cache/.test(cs) && /"<\/f>" & cache/.test(vb), 'book',
        'and a formula carries the value it worked out, so other programs show the answer');

    t.note('the print and PDF paths stay inside the PRINT_SUPPORT guard');
    // What matters is that no CODE outside the guard names the helper: a comment may mention it, and one
    // does (the menu builder says where the helper comes from). So comments come out first, then the
    // guarded regions.
    const withoutComments = (text, mark) => text.split('\n')
        .map((line) => { const at = line.indexOf(mark); return at >= 0 ? line.slice(0, at) : line; })
        .join('\n');
    const csUnguarded = withoutComments(cs, '//').replace(/#if PRINT_SUPPORT[\s\S]*?#endif/g, '');
    const vbUnguarded = withoutComments(vb, "'").replace(/#If PRINT_SUPPORT Then[\s\S]*?#End If/g, '');
    t.ok(!csUnguarded.includes('GrumpyPrint') && !vbUnguarded.includes('GrumpyPrint'), 'print',
        'neither twin mentions the print helper outside the guard — a project without the packages must still compile');
    t.ok(!csUnguarded.includes('Print.ToFileAsync') && !vbUnguarded.includes('Print.ToFileAsync'), 'print',
        'nor the PDF writer');
    t.ok(cs.includes('AvaloniaCharts.GrumpyPrint') && vb.includes('Global.AvaloniaCharts.GrumpyPrint'), 'print',
        'and it is FULLY QUALIFIED inside the guard: the helper lives in the charts\' namespace, which the sheet cannot see unqualified');
    t.ok(/#if PRINT_SUPPORT[\s\S]{0,4000}?public static bool CanPrint/.test(cs) &&
        /#If PRINT_SUPPORT Then[\s\S]{0,4000}?Public Shared ReadOnly Property CanPrint/.test(vb), 'print',
        'CanPrint gates the printer row, the same test the charts make');
    t.ok(/needs print support/.test(cs) && /needs print support/.test(vb), 'print',
        'and the row is DISABLED with the reason, not left out');

    t.note('an existing project is offered the refresh');
    const { bundledComponentSpecs } = require('../../out/bundledComponents.js');
    const sheetSpec = bundledComponentSpecs(false).find((s) => s.kind === 'GrumpySheet');
    t.equal(sheetSpec.marker, 'EmptyBorder', 'bundled',
        'the marker moved to a token only today\'s copy has, or a form that updated once would keep its old ' +
        'sheet for ever — and this batch is not only a drawing change (a copy without EmptyBorder writes a ' +
        'workbook whose borders table cannot carry a box, and its VB half cannot save a text cell at all)');
    t.ok(/EmptyBorder/.test(cs) && /EmptyBorder/.test(vb), 'bundled',
        'and the token it names is in BOTH twins — the update check runs against whichever file a project holds, ' +
        'so a marker only one twin carries would offer the other one a refresh that never comes');
    t.ok(/marker/.test(read('src/bundledComponents.ts')) && sheetSpec.bundled.test('// BUNDLED RESOURCE'),
        'bundled', 'and the file still identifies itself as bundled boilerplate, so a user\'s own copy is left alone');
    const panel = read('src/designerPanel.ts');
    const sheetHelper = panel.slice(panel.indexOf('private ensureSheetHelper'), panel.indexOf('private ensureBundledFileIn'));
    t.ok(sheetHelper.includes("'GrumpyPrint'"), 'bundled',
        'the designer now copies the print helper in WITH the sheet, as it does with the chart: a project holding one without the other does not compile');

    t.note('the Properties panel offers the three rows');
    for (const key of ['ShowToolbar', 'EditBackColor', 'EditTextColor']) {
        t.ok(sheetRows.includes(`key: '${key}'`), 'panel', `the GrumpySheet rows offer ${key}`);
    }

    // ---------------------------------------------------------------------------------------------
    // 2026-09-27 (later) — COPYING A FORMULA MOVES ITS ADDRESSES, and the fill runs all four ways.
    //
    // The failures that would be SILENT rather than loud:
    //
    //   * a formula copied by a fill that keeps its old addresses — the column of totals then adds the
    //     same row up over and over, which looks exactly like a spreadsheet and is wrong;
    //   * a $ that does not anchor (the whole point of one), or a quoted "A1" that moves (it is text);
    //   * a reference pushed off the sheet that writes an address instead of #REF!;
    //   * filling UP or LEFT doing nothing at all, because only two of the four directions were written
    //     — and no handle at the top-left corner, so there is nothing to grab to even try.
    t.section('T2: copying a formula moves its addresses, and the fill runs all four ways');

    const panelSrc = read('src/controlInfo.ts');
    const js = read('media/designer.js');

    t.note('the shifter and the anchor reader are in both twins');
    bothTwins('ShiftFormula', 'fill');
    bothTwins('TryReadAnchoredAddress', 'fill');
    bothTwins('WholeToken', 'fill');
    bothTwins('IsNameChar', 'fill');
    bothTwins('TopHandleRect', 'fill');
    bothTwins('OnHandle', 'fill');
    t.ok(/columnFixed = text\[at\] == '\$';\s*\n\s*rowFixed = dollars > 0;/.test(cs) &&
        /columnFixed = text\(at\) = "\$"c\s*\n\s*rowFixed = dollars > 0/.test(vb), 'fill',
        'a $ before the LETTERS anchors the column and one before the digits anchors the row');
    t.ok(/builder\.Append\(RefError\);/.test(cs) && /builder\.Append\(RefError\)/.test(vb), 'fill',
        'a reference pushed off the sheet is written as #REF!, never as an address');
    t.ok(/if \(c == '"'\)\s*\n\s*\{/.test(cs) && /If c = """"c Then/.test(vb), 'fill',
        'both twins step over a quoted literal, so an "A1" inside one is text and is never moved');
    t.ok(/return next != '\.' \|\| \(at \+ used \+ 1 < text\.Length && text\[at \+ used \+ 1\] == '\.'\);/.test(cs) &&
        /Return next1 <> "\."c OrElse \(at \+ used \+ 1 < text\.Length AndAlso text\(at \+ used \+ 1\) = "\."c\)/.test(vb),
        'fill', 'a dot is a boundary only when it is one of the two that spell a range, so A1..A5 shifts');

    t.note('the fill copies a formula PER CELL and predicts anything else');
    t.ok(/ShiftFormula\(baseText\.Substring\(1\), row - baseRow, 0\)/.test(cs) &&
        /ShiftFormula\(baseText\.Substring\(1\), row - baseRow, 0\)/.test(vb), 'fill',
        'down/up: the copy travels the ROW distance from the cell it came from');
    t.ok(/ShiftFormula\(baseText\.Substring\(1\), 0, column - baseColumn\)/.test(cs) &&
        /ShiftFormula\(baseText\.Substring\(1\), 0, column - baseColumn\)/.test(vb), 'fill',
        'right/left: the same with the COLUMN distance');
    t.ok(/baseText\[0\] == '='/.test(cs) && /baseText\(0\) = "="c/.test(vb), 'fill',
        'and the source CELL decides which of the two happens, so one gesture can do both');
    t.ok(/_fillSourceFirstRow \+ i % height/.test(cs) && /_fillSourceFirstRow \+ i Mod height/.test(vb), 'fill',
        'the source cell a destination copies is its place in the block, so a 2-row block repeats');

    t.note('the drag runs all four ways');
    t.ok(/_fillRow > lastRow \|\| _fillRow < firstRow/.test(cs) &&
        /_fillRow > lastRow OrElse _fillRow < firstRow/.test(vb), 'fill',
        'ApplyFill has a branch for up as well as down');
    t.ok(/_fillColumn > lastColumn \|\| _fillColumn < firstColumn/.test(cs) &&
        /_fillColumn > lastColumn OrElse _fillColumn < firstColumn/.test(vb), 'fill',
        'and one for left as well as right');
    t.ok(/_fillRow < SelectionFirstRow\(\) \|\| _fillColumn < SelectionFirstColumn\(\)/.test(cs) &&
        /_fillRow < SelectionFirstRow\(\) OrElse _fillColumn < SelectionFirstColumn\(\)/.test(vb), 'fill',
        'so a drag aiming above or to the left counts as a fill at all');
    t.ok(/var firstRow = Math\.Min\(_fillRow, SelectionFirstRow\(\)\);/.test(cs) &&
        /Dim firstRow As Integer = Math\.Min\(_fillRow, SelectionFirstRow\(\)\)/.test(vb), 'fill',
        'and the dashed preview spans whichever way it is dragged');
    t.ok(/selection\.X - HandleSize \/ 2/.test(cs) && /selection\.X - HandleSize \/ 2/.test(vb), 'fill',
        'there is a second handle on the selection\'s top-left corner to grab for up/left');
    t.ok(/_fillSourceLastRow - _fillSourceFirstRow \+ 1/.test(cs) &&
        /_fillSourceLastRow - _fillSourceFirstRow \+ 1/.test(vb), 'fill',
        'the block\'s own height is what the copy wraps around, not the fill\'s length');

    t.note('the prediction takes a direction, so up/left continues the same series backwards');
    t.ok(/private static string\[\] PredictSeries\(IReadOnlyList<string> source, int count, int direction\)/.test(cs) &&
        /direction As Integer\) As String\(\)/.test(vb), 'fill', 'both twins have the three-argument form');
    t.ok(/distance\[i\] = direction > 0 \? source\.Count \+ i : i - count;/.test(cs) &&
        /distance\(i\) = If\(direction > 0, source\.Count \+ i, i - count\)/.test(vb), 'fill',
        'measured from the block\'s FIRST value, which is what makes the value BEFORE it the first written');
    t.ok(/PredictSeries\(source, count, down \? 1 : -1\)/.test(cs) &&
        /PredictSeries\(source, count, If\(down, 1, -1\)\)/.test(vb), 'fill',
        'the down/up branch passes 1 or -1 to it, so the same series continues either way');

    t.note('the design-time Cells editor fills the same way (media/designer.js)');
    t.ok(/function sheetShiftFormula\(body, rowDelta, columnDelta\)/.test(js), 'fill',
        'it has the same address shifter, so the design-time grid fills the way the form will');
    t.ok(/function sheetReadAddress\(text, at\)/.test(js) && /function sheetWholeToken\(text, at, used\)/.test(js),
        'fill', 'with the same anchor reader and the same "is this a whole address" rule');
    t.ok(/sheetPredict\(values, count, down \? 1 : -1\)/.test(js) &&
        /sheetPredict\(values, count, right \? 1 : -1\)/.test(js), 'fill',
        'its prediction takes the direction too');
    t.ok(/fill\.row < source\.r1/.test(js) && /fill\.column < source\.c1/.test(js), 'fill',
        'and it fills up and left, not only down and right');
    t.ok(/addHandle\(active\.offsetLeft - 3, active\.offsetTop - 3,/.test(js), 'fill',
        'the editor draws the same second handle');

    t.note('the designer says so, and the obsolete property is gone');
    t.ok(/the one at its top-left/.test(panelSrc), 'panel',
        'the Spreadsheet tooltip describes the second handle');
    t.ok(/COPIED rather than predicted/.test(panelSrc), 'panel',
        'and that a copied formula moves its addresses rather than being predicted');
    t.ok(/the older A1\.\.B3 still reads/.test(panelSrc), 'panel',
        'and which spelling a range is written in');
    const sheetCatalog = read('src/propertyCatalog.ts');
    t.ok(!/key: 'Watermark'/.test(sheetCatalog), 'panel',
        'no control offers the obsolete Watermark any more (AVLN5001 in a generated project)');
    t.ok(/MaskedTextBox: \[[\s\S]{0,900}?key: 'PlaceholderText', label: 'Hint Text'/.test(sheetCatalog), 'panel',
        'PlaceholderText replaces it on the masked box too, as it already does on the TextBox row');

    // ---------------------------------------------------------------------------------------------
    // 2026-09-27 (later) — THE PRINT AREA. The failures that would be SILENT rather than loud:
    //
    //   * a page that pictures the WHOLE sheet because nothing was selected — the accident the warning
    //     exists to prevent, and on paper it costs ink and time;
    //   * a warning with no way out, or one that prints while it is still on screen;
    //   * an area whose headers are WRONG (the block redrawn from A1, so B4:D9 reads A1:C6 on paper);
    //   * a page that still carries the selection outline, the fill handles or the scroll position.
    t.section('T2: the print area, and the warning that guards the whole sheet');

    t.note('the print area is in both twins');
    bothTwins('SheetPrintKind', 'print');
    bothTwins('PrintArea', 'print');
    bothTwins('HasPrintArea', 'print');
    bothTwins('PrintAreaText', 'print');
    bothTwins('RequestPrint', 'print');
    bothTwins('RunPrint', 'print');
    bothTwins('ShowPrintWarning', 'print');
    bothTwins('AbortPrint', 'print');
    bothTwins('PageForPrinting', 'print');
    bothTwins('OnWarningLine', 'print');
    bothTwins('PrintWarningWidth', 'print');
    bothTwins('WarningColor', 'print');
    t.ok(!/ChromeForPrinting/.test(cs) && !/ChromeForPrinting/.test(vb), 'print',
        'the old chrome-only page scope is gone: the page scope carries the AREA now');
    t.ok(/if \(HasPrintArea\(\)\)/.test(cs) && /If HasPrintArea\(\) Then/.test(vb), 'print',
        'a chosen area runs straight away, and only the single-cell case stops to ask');
    t.ok(/Warning = true,\s*\n?\s*Enabled = false/.test(cs) ||
        /Warning = true, Enabled = false/.test(cs), 'print',
        'C#: the warning lines are NOT choosable, so Enter lands on Abort');
    t.ok(/\.Warning = True, \.Enabled = False/.test(vb), 'print', 'VB: the same, or Enter picks a line with no action');
    t.ok(/Label = "Abort",\s*\n\s*Hint = "print nothing",\s*\n\s*Ticked = true,/.test(cs) &&
        /IsSeparator = True/.test(vb), 'print',
        'Abort is a real line, ticked, and comes before the whole-sheet line');
    t.ok(/SaveAsPngAsync\(bool wholeSheet = false\)/.test(cs) && /WritePdf\(string path, bool wholeSheet = false\)/.test(cs) &&
        /PrintAsync\(bool wholeSheet = false\)/.test(cs) && /SaveAsPdfAsync\(bool wholeSheet = false\)/.test(cs) &&
        /ExportPng\(string path, double scale = 2, bool wholeSheet = false\)/.test(cs), 'print',
        'C#: every entry can be told to take the whole sheet, and nothing else changes');
    t.ok(/SaveAsPngAsync\(Optional wholeSheet As Boolean = False\)/.test(vb) &&
        /ExportPng\(path As String, Optional scale As Double = 2.0,/.test(vb), 'print',
        'VB: the same, with VB\'s optional parameters');
    t.ok(/Run = \(\) => RequestPrint\(SheetPrintKind\.Picture\)/.test(cs) &&
        /png\.Run = Sub\(\) RequestPrint\(SheetPrintKind\.Picture\)/.test(vb), 'print',
        'the menu goes through RequestPrint rather than calling the export directly');
    t.ok(/ColumnOffset\(_printLastColumn \+ 1\) - ColumnOffset\(_printFirstColumn\)/.test(cs) &&
        /ColumnOffset\(_printLastColumn \+ 1\) - ColumnOffset\(_printFirstColumn\)/.test(vb), 'print',
        'the page is the area\'s own width — a widened column keeps its width on paper');
    t.ok(/RowOffset\(_printLastRow \+ 1\) - RowOffset\(_printFirstRow\)/.test(cs) &&
        /RowOffset\(_printLastRow \+ 1\) - RowOffset\(_printFirstRow\)/.test(vb), 'print',
        'and its own height, which is what stops the rest of the sheet printing underneath');
    t.ok(/_scrollX = sheet\.ColumnOffset\(firstColumn\)/.test(cs) &&
        /sheet\._scrollX = sheet\.ColumnOffset\(firstColumn\)/.test(vb), 'print',
        'the area is reached by SCROLLING to it, so the real headers sit beside it');
    t.ok(/if \(!_printRange\)/.test(cs) && /If Not _printRange Then/.test(vb), 'print',
        'a page carries no selection outline');
    t.ok(/!_selectAll && !_draggingFill && !_printRange/.test(cs) &&
        /Not _selectAll AndAlso Not _draggingFill AndAlso Not _printRange/.test(vb), 'print',
        'and no fill handles');
    t.ok(/SelectionFirstRow\(\) != SelectionLastRow\(\)/.test(cs) &&
        /SelectionFirstRow\(\) <> SelectionLastRow\(\)/.test(vb), 'print',
        'a single cell counts as nothing chosen — that is the case that warns');

    // ---------------------------------------------------------------------------------------------
    // 2026-09-27 (last) — THE PAGE. There is no page setup yet, so every job is composed on A4 and the
    // one page decision there is — which way round it is — is asked for before the job runs. The failures
    // that would be SILENT rather than loud:
    //
    //   * a job that still hands the SHEET over, so the picture is the area's own size again and the
    //     orientation does nothing at all;
    //   * a page that carries the selection WASH (or the header highlights) onto the paper;
    //   * an orientation that is drawn but not remembered, or remembered but not used;
    //   * a question asked for a direct API call, which would open a menu inside a form's Button click.
    t.section('T2: the page — A4, portrait or landscape, and the question asked before every job');

    t.note('the page and its orientation are in both twins');
    bothTwins('SheetOrientation', 'print');
    bothTwins('PrintOrientation', 'print');
    bothTwins('PageSize', 'print');
    bothTwins('PageText', 'print');
    bothTwins('PageForOrientation', 'print');
    bothTwins('SheetPrintPage', 'print');
    bothTwins('ShowOrientationChooser', 'print');
    bothTwins('ChooseOrientation', 'print');
    bothTwins('CancelPrint', 'print');
    bothTwins('PrintPageWidth', 'print');
    bothTwins('PrintPageMargin', 'print');
    t.ok(/595d/.test(cs) && /842d/.test(cs) && /595\.0/.test(vb) && /842\.0/.test(vb), 'print',
        'A4 in PDF points is the page, in both twins');
    t.ok(/private const double PrintPageMargin = 18d/.test(cs) &&
        /Private Const PrintPageMargin As Double = 18\.0/.test(vb), 'print',
        'with the same 18 pt margin the bundled charts keep — a sheet and a chart look like one printer');
    t.ok(/PrintOrientationProperty =\s*\n\s*AvaloniaProperty\.Register<GrumpySheet, SheetOrientation>\(nameof\(PrintOrientation\),\s*\n\s*SheetOrientation\.Portrait\)/.test(cs) &&
        /PrintOrientationProperty As StyledProperty\(Of SheetOrientation\) =\s*\n\s*AvaloniaProperty\.Register\(Of GrumpySheet, SheetOrientation\)\(NameOf\(PrintOrientation\),\s*\n\s*SheetOrientation\.Portrait\)/.test(vb),
        'print', 'and it is a real property, defaulting to PORTRAIT, so XAML and the panel can set it too');
    t.ok(/PrintOrientation == SheetOrientation\.Landscape\s*\n\s*\? new Size\(PrintPageHeight, PrintPageWidth\)/.test(cs) &&
        /If PrintOrientation = SheetOrientation\.Landscape Then\s*\n\s*Return New Size\(PrintPageHeight, PrintPageWidth\)/.test(vb),
        'print', 'landscape is the same A4 the other way round, in both twins');
    t.ok(/Stretch\.Uniform/.test(cs) && /Stretch\.Uniform/.test(vb), 'print',
        'the area is FITTED into the margin, never stretched');
    t.ok(/FillRectangle\(Brushes\.White/.test(cs) && /FillRectangle\(Brushes\.White/.test(vb), 'print',
        'and the paper itself is painted white, so a PNG of a page is not transparent');

    t.note('the job is handed the PAGE, not the sheet');
    t.ok(/PageForOrientation\(\)\s*\}\)/.test(cs) && /\{PageForOrientation\(\)\}/.test(vb), 'print',
        'the PDF and the printer take the composed page as their only visual');
    t.ok(/bitmap\.Render\(sheetPage\)/.test(cs) && /bitmap\.Render\(sheetPage\)/.test(vb), 'print',
        'and so does the PNG export — a page-shaped picture, as the panel row promises');
    t.ok(!/Math\.Round\(Bounds\.Width \* scale\)/.test(cs) && !/Math\.Round\(Bounds\.Width \* scale\)/.test(vb),
        'print', 'the PICTURE is no longer measured from the sheet (which is what made orientation a no-op)');
    t.ok(/Math\.Round\(pageSize\.Width \* scale\)/.test(cs) && /Math\.Round\(paper\.Width \* scale\)/.test(vb),
        'print', 'its size comes from the page, so 2x is still twice the page');
    t.ok(/Printable\.Default is not null/.test(cs) && /Printable\.Default IsNot Nothing/.test(vb) &&
        /Await Printable\.PrintVisualsAsync\(visuals, PageName\(\)\)/.test(vb), 'print',
        'Print… uses the platform service when there is one, and only falls back to CUPS — which is what ' +
        'the CanPrint property always promised');

    t.note('a page carries no selection at all');
    t.ok(/!_printRange && visibleSelection\.Width > 0/.test(cs) &&
        /Not _printRange AndAlso visibleSelection\.Width > 0/.test(vb), 'print',
        'not the WASH over the area — a tint would come out of the printer as a pale block');
    t.ok(/\(!_wholeColumns && !_selectAll\) \|\| _printRange/.test(cs) &&
        /\(Not _wholeColumns AndAlso Not _selectAll\) OrElse _printRange/.test(vb), 'print',
        'nor the lit-up column header of a whole-column area');

    t.note('and the page is asked about before the job runs');
    t.ok(/ShowOrientationChooser\(kind, false\)/.test(cs) && /ShowOrientationChooser\(kind, False\)/.test(vb),
        'print', 'an area selected goes to the page question instead of straight to the export');
    t.ok(/ShowOrientationChooser\(pending, true\)/.test(cs) && /ShowOrientationChooser\(pending, True\)/.test(vb),
        'print', '"print the whole sheet" leads there too, rather than printing behind the warning');
    t.ok(/PrintOrientation = orientation;/.test(cs) && /\n\s*PrintOrientation = orientation\n/.test(vb), 'print',
        'the answer is REMEMBERED on the sheet, so the next job starts on it');
    t.ok(/RunPrint\(_printKind, wholeSheet\)/.test(cs) && /RunPrint\(_printKind, wholeSheet\)/.test(vb), 'print',
        'and the job runs only after the answer — that is what makes the orientation real');
    t.ok(/Run = CancelPrint\b/.test(cs) && /Run = AddressOf CancelPrint/.test(vb), 'print',
        'Cancel is a line of its own, so a job is never produced by accident');
    t.ok(/the page orientation was not chosen/.test(cs) && /the page orientation was not chosen/.test(vb), 'print',
        'and it says so in the status line, the way Abort does');
    t.ok(/_menuHot = current/.test(cs) && /_menuHot = current/.test(vb), 'print',
        'the highlight STARTS on the current page, so Enter accepts what the sheet already has');
    t.ok(/enum MenuKind \{ Context, Toolbar, Macro, Warning, Setup, Panel \}/.test(cs) && /Setup/.test(vb), 'print',
        'the question is its own menu kind, which is what keeps Tab (the macro list\'s key) out of it');
    t.ok(/, " \+ PageText\(\)/.test(cs) && /& ", " & PageText\(\)/.test(vb), 'print',
        'every status line names the page as well as the area — "Saved a.png — B2:C3, A4 portrait"');

    t.note('the panel offers it, and the section list shows it');
    t.ok(/key: 'PrintOrientation', label: 'Orientation', kind: 'dropdown', options: \['Portrait', 'Landscape'\], defaultValue: 'Portrait'/.test(sheetCatalog),
        'panel', 'a PrintOrientation row with both ways round, defaulting to Portrait');
    t.ok(/'AllowEditing',\s*\n\s*'PrintOrientation'/.test(sheetCatalog), 'panel',
        'and it is placed in Behavior, beside the sheet\'s other switches');

    t.note('and a page that knows what it is TELLS the printer');
    const gpCs = read('resources/GrumpyPrint.cs');
    const gpVb = read('resources/GrumpyPrint.vb');
    t.ok(/class PrintPageSettings/.test(gpCs) && /Class PrintPageSettings/.test(gpVb), 'print',
        'both twins of the shared helper carry PrintPageSettings');
    t.ok(/public bool Landscape/.test(gpCs) && /Public Property Landscape As Boolean/.test(gpVb), 'print',
        'with Landscape');
    t.ok(/Landscape \? 4 : 3/.test(gpCs) && /If\(Landscape, 4, 3\)/.test(gpVb), 'print',
        'and the numbers CUPS wants: 4 landscape, 3 portrait');
    t.ok(/orientation-requested=/.test(gpCs) && /orientation-requested=/.test(gpVb), 'print',
        'the JOB is told the orientation — the PDF page box alone is not enough for pdftopdf');
    t.ok(/PageSize=/.test(gpCs) && /PageSize=/.test(gpVb), 'print',
        'and the paper, when the page names one');
    t.ok(/number-up=1/.test(gpCs) && /number-up=1/.test(gpVb), 'print',
        'and one page per sheet, so a saved lpoptions cannot halve the page layout');
    t.ok(/if \(settings is not null\)/.test(gpCs) && /If settings IsNot Nothing Then/.test(gpVb), 'print',
        'a caller that says nothing about its page sends no options at all — the charts are unchanged');
    t.ok(/CupsArguments/.test(gpCs) && /CupsArguments/.test(gpVb), 'print',
        'the argument list is a function of its own, which the T4 harness reads back from a stub lp');
    t.ok(/CupsArguments\(file, title, printer, settings\)/.test(gpCs) &&
        /CupsArguments\(file, title, printer, settings\)/.test(gpVb), 'print',
        'and lp is handed exactly that list');
    t.ok(/new AvaloniaCharts\.PrintPageSettings/.test(cs) &&
        /New Global\.AvaloniaCharts\.PrintPageSettings/.test(vb), 'print',
        'the sheet is the caller that DOES describe its page (fully qualified, as a bundled file must be)');
    t.ok(/Landscape = PrintOrientation == SheetOrientation\.Landscape/.test(cs) &&
        /\.Landscape = PrintOrientation = SheetOrientation\.Landscape/.test(vb), 'print',
        'passing the page question\'s own answer');
    t.ok(/PaperSize = PrintPaperName/.test(cs) && /\.PaperSize = PrintPaperName/.test(vb), 'print',
        'and the paper the page was composed for — named once, so the page and the job cannot disagree');

    // ---------------------------------------------------------------------------------------------
    // 2026-09-27 — the CELL LOOK panels: fill colour, text colour and borders.
    //
    // These are menus that are not lists of commands, so the failures that matter are different ones:
    //
    //   * a panel line that reaches the wrong cells — "Inside" has to become the four edges a CELL can
    //     store, worked out per cell, and a whole-column selection must not gain fifty empty elements;
    //   * a panel that closes on a MISS (the 4 px between two swatches) — the palette then vanishes for a
    //     click that meant nothing;
    //   * a colour picked in one panel landing in the wrong field (a fill where the ink was meant);
    //   * and the one that already bit: in VB `Nothing = True` is Nothing, and a Nothing assigned to a
    //     Boolean THROWS — right-clicking a BLANK cell (no cell element at all) killed the menu outright.
    //     Proved with /tmp/sheetpanels (C#) and /tmp/sheetpanelsvb (VB): the same 26 checks, the same
    //     numbers from both twins.
    // ---------------------------------------------------------------------------------------------
    t.section('T2: the spreadsheet colour and border panels');

    t.note('the three lines are offered, and both twins offer them');
    for (const label of ['Fill colour…', 'Text colour…', 'Borders…']) {
        bothTwins(label, 'panels');
    }

    t.note('the panel machinery is in both twins, member for member');
    for (const member of ['OpenColourPanel', 'OpenColourPickerPanel', 'OpenBordersPanel',
        'OpenBorderEdgesPanel', 'OpenBorderThicknessPanel', 'OpenPanel', 'ForEachSelectedCell',
        'SelectionColour', 'EdgesFor', 'ChooseFillColour', 'ChooseTextColour', 'ApplyBorderChoice',
        'ApplyBorderThickness', 'ChooseBorderColour', 'BorderChoiceItem', 'ThicknessItem', 'HexOf',
        'ContrastInk', 'MenuRowHeight', 'RowTop', 'SwatchRect', 'SliderTrackRect', 'SetChannel',
        'SetChannelFromPoint', 'SliderAt', 'SwatchAt', 'OnSwatchRow', 'ChannelValue', 'BuildMenuPalette']) {
        bothTwins(member, 'panels');
    }

    t.note('Outside and Inside are SELECTION spellings, worked out per cell, and only they are');
    for (const [name, source] of twins) {
        t.ok(/Enum BorderChoice[\s\S]{0,200}?Outside[\s\S]{0,80}?Inside/.test(source) ||
            /enum BorderChoice[\s\S]{0,200}?Outside[\s\S]{0,80}?Inside/.test(source), 'panels',
            `${name}: the hub's choice enum carries Outside and Inside`);
        t.ok(/EdgesFor\([\s\S]{0,2600}?row == firstRow/.test(source) ||
            /EdgesFor\([\s\S]{0,2600}?row = firstRow/.test(source), 'panels',
            `${name}: Outside is the rim — the first row's top, the last row's bottom, and so on`);
        t.ok(/EdgesFor\([\s\S]{0,3200}?row > firstRow/.test(source), 'panels',
            `${name}: and Inside is only the edges SHARED with another selected cell`);
    }
    // SheetBorderEdges itself must stay the four edges: a cell cannot store "Outside".
    t.ok(!/Outside|Inside/.test(/public enum SheetBorderEdges\s*\{([\s\S]*?)\}/.exec(cs)[1]), 'panels',
        'the flag enum a CELL stores has no Outside/Inside in it — those are not shapes a cell has');

    t.note('the palette is the same forty colours in both twins, and the probe\'s red is unique');
    const paletteCs = /MenuPaletteText =[\s\S]*?\{([\s\S]*?)\};/.exec(cs);
    const paletteVb = /MenuPaletteText As String\(\) = \{([\s\S]*?)\}/.exec(vb);
    t.ok(paletteCs !== null && paletteVb !== null, 'panels', 'both twins carry the palette text');
    const coloursOf = (body) => (body.match(/#[0-9A-Fa-f]{6}/g) || []);
    t.equal(coloursOf(paletteCs[1]).length, 40, 'panels', 'forty swatches — five lines of eight');
    t.equal(JSON.stringify(coloursOf(paletteVb[1])), JSON.stringify(coloursOf(paletteCs[1])), 'panels',
        'the two lists are the same, colour for colour');
    t.equal(coloursOf(paletteCs[1]).filter((c) => c.toUpperCase() === '#FF0000').length, 1, 'panels',
        'and pure red appears exactly ONCE — /tmp/sheetpanels finds a swatch by that ink, so a second one ' +
        'would let it click the wrong square and still pass');

    t.note('a pick applies to the whole selection, creating cells only when the selection is bounded');
    for (const [name, source] of twins) {
        t.ok(/ForEachSelectedCell[\s\S]{0,500}?bounded/.test(source), 'panels',
            `${name}: a whole column is not given fifty empty elements (the rule AlignSelection keeps)`);
        t.ok(/ForEachSelectedCell[\s\S]{0,900}?EnsureCell/.test(source), 'panels',
            `${name}: a bounded block has cells created, so "select, colour, type" works`);
    }

    t.note('a near miss inside a panel does not close it, and a slider keeps it open');
    for (const [name, source] of twins) {
        t.ok(/ChooseMenuItem[\s\S]{0,2000}?OnSwatchRow\(point\)/.test(source), 'panels',
            `${name}: a press between two swatches is the panel's own furniture (it stays up)`);
        t.ok(/ChooseMenuItem[\s\S]{0,1400}?SliderAt\(point\)/.test(source), 'panels',
            `${name}: a slider starts a drag instead of closing the panel`);
    }

    t.note('the VB trap that crashed the menu: Nothing is not False');
    // SelectionFlag answers Nothing for a selection with no cell elements at all. The C# twin's `== true`
    // is false there; VB's `= True` is NOTHING, and assigning that to a plain Boolean throws — so
    // right-clicking a blank cell crashed the VB control, and the C# one never could.
    t.ok(/Ticked = SelectionFlag\(true\) == true/.test(cs), 'panels', 'C#: the flag is compared, not assigned');
    t.ok(!/SelectionFlag\((True|False)\) = True/.test(vb), 'panels',
        'VB: nothing is assigned straight from a lifted comparison — that is the crash');
    t.ok(/SelectionFlag\(True\)\.GetValueOrDefault\(\)/.test(vb), 'panels',
        'VB: the flag is read out once, with its Nothing turned into False');
    t.ok(/allBold/.test(vb) && /allItalics/.test(vb), 'panels',
        'and both ticks come from those two locals');
};
