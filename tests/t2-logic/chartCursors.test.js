/* T2 — the chart 'Cursor' editor: the catalog button, the modal, the property element and the C#
 * chart's own cursor API must agree.
 *
 * Why this exists: cursors are the first chart feature that is BOTH a property element (like a
 * series' axis) and a list of independent little objects (like series), and each cursor carries seven
 * fields plus two chart-level readout settings. Four separate places can drift apart silently:
 *
 *   1. the catalog button and the webview hook (no button, or a button that opens nothing);
 *   2. the field lists — the modal's keys, the writer's attributes and the C# properties. A renamed
 *      attribute is not an error anywhere; the cursor simply keeps its default look;
 *   3. the ENUM spellings — the editor writes `Style="Long"` and the C# enum must have a member
 *      called Long, or the value is dropped (and in VB the members need `[Long]`, because Long is a
 *      VB type keyword: the metadata name stays "Long", which is what XAML is matched against);
 *   4. the property element itself — `Series` is the chart's CONTENT property, so cursors have to
 *      live in `<charts:GrumpyXYPlot.Cursors>`; writing them as plain children would fail to compile.
 *
 * These checks drive the real reader/writer and pin every side to the others.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const { propertyDefsFor } = require('../../out/propertyCatalog.js');
const { XamlModel } = require('../../out/xamlModel.js');
const {
    CHART_CURSOR_FIELDS, CHART_CURSOR_CHART_FIELDS, MAX_CURSORS, CURSOR_ORIENTATIONS, CURSOR_STYLES,
    READOUT_POSITIONS, chartCursorsOf, writeChartCursors, chartCursorChildren
} = require('../../out/chartSeries.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"'
    + ' xmlns:charts="using:AvaloniaCharts"';
const CHARTS = ['GrumpyLinePlot', 'GrumpyXYPlot'];

function elFrom(xml) {
    const doc = new DOMParser().parseFromString(`<root ${NS}>${xml}</root>`, 'text/xml');
    for (let i = 0; i < doc.documentElement.childNodes.length; i++) {
        const c = doc.documentElement.childNodes.item(i);
        if (c.nodeType === 1) return c;
    }
    return undefined;
}
const keyOf = (props, k) => props.find((p) => p.key === k);

function chartModel(inner, attrs) {
    const model = new XamlModel(`<Window ${NS}><Canvas Name="Body">`
        + `<charts:GrumpyXYPlot x:Name="C1" Width="320" Height="200" ${attrs || ''}>`
        + `${inner || ''}</charts:GrumpyXYPlot></Canvas></Window>`);
    return { model, el: model.findByName('C1') };
}

/** The members of a C# enum, in declaration order. */
function enumMembers(source, name) {
    const start = source.indexOf(`public enum ${name}`);
    if (start < 0) return [];
    const body = source.slice(start, source.indexOf('}', start));
    return body.split('\n')
        .map((l) => l.trim().replace(/,$/, ''))
        .filter((l) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(l));
}

/** The members of a VB enum. `[Long]` is the VB spelling of the member the XAML calls "Long". */
function vbEnumMembers(source, name) {
    const start = source.indexOf(`Public Enum ${name}`);
    if (start < 0) return [];
    const body = source.slice(start, source.indexOf('End Enum', start));
    return body.split('\n')
        .map((l) => l.trim().replace(/^\[|\]$/g, ''))
        .filter((l) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(l));
}

/** One block of a TS/JS source file, from a start marker up to the next end marker. */
function between(source, from, to) {
    const i = source.indexOf(from);
    if (i < 0) return '';
    const j = source.indexOf(to, i + from.length);
    return j < 0 ? source.slice(i) : source.slice(i, j);
}

module.exports = async (t) => {
    t.section('chartCursorsModel');

    const panel = read('src/designerPanel.ts');
    const js = read('media/designer.js');
    const cs = read('resources/GrumpyCharts.cs');
    const vb = read('resources/GrumpyCharts.vb');

    // --- 1. the catalog: a Cursors button on both charts ---
    for (const tag of CHARTS) {
        const props = propertyDefsFor(elFrom(`<charts:${tag} x:Name="c1"/>`));
        const row = keyOf(props, 'Cursors');
        t.ok(row && row.kind === 'button', 'catalog', `${tag} lists a 'Cursors' editor button`,
            row ? row.value : 'row missing');
    }

    // --- 2. the webview opens it, the extension saves it ---
    t.ok(/p\.key === 'Cursors'\) openCursorEditor\(/.test(js), 'webview',
        "the Properties 'Cursors' button opens the editor");
    t.ok(js.includes("cursorModal: $('cursorModal')"), 'webview',
        'the Cursor modal shell is registered in the element map');
    t.ok(js.includes("type: 'saveChartCursors'"), 'webview', "the editor posts 'saveChartCursors'");
    t.ok(panel.includes("case 'saveChartCursors'"), 'panel', "the extension handles 'saveChartCursors'");
    t.ok(/msg\.cursorInfo = chartCursorsOf\(el\)/.test(panel), 'panel',
        'a chart sends its cursors to the editor (msg.cursorInfo)');
    t.ok(/id="cursorModal"/.test(panel), 'panel', 'the modal markup exists in the webview HTML');
    // The other chart editors must still work: the cursor work must not have replaced them.
    for (const key of ['Series', 'Axis', 'Legend']) {
        const row = keyOf(propertyDefsFor(elFrom('<charts:GrumpyXYPlot x:Name="c1"/>')), key);
        t.ok(row && row.kind === 'button' && js.includes(`p.key === '${key}'`), 'webview',
            `the ${key} editor still has its button and its webview hook`);
    }

    // --- 3. the modal edits exactly the fields the writer knows ---
    for (const f of CHART_CURSOR_FIELDS) {
        const used = js.includes(`'${f.key}'`) || js.includes(`.${f.key} =`) || js.includes(`row.${f.key}`);
        t.ok(used, 'seam', `the modal edits ${f.key}`);
    }
    for (const f of CHART_CURSOR_CHART_FIELDS) {
        t.ok(js.includes(`settings.${f.key}`), 'seam', `the modal edits the chart-level ${f.key}`);
    }
    const saveBlock = between(js, 'cursorSave.addEventListener', 'cursorCancel.addEventListener');
    t.ok(/type: 'saveChartCursors'/.test(saveBlock), 'seam', 'the save button posts the message');
    t.ok(/settings: cursorEdit\.settings/.test(saveBlock), 'seam', 'the message carries the readout settings');
    t.ok(/cursors: cursorEdit\.rows/.test(saveBlock), 'seam', 'the message carries the cursor list');
    const saveCase = between(panel, "case 'saveChartCursors'", "case 'saveGridDefs'");
    t.ok(/writeChartCursors\(doc\.model, el,/.test(saveCase), 'seam',
        'the handler writes the cursors onto the chart element');
    t.ok(/ensureGrumpyChartsHelper\(doc\)/.test(saveCase), 'seam',
        'saving cursors refreshes the project\'s bundled chart file (old copies cannot compile them)');

    // --- 4. the two-cursor cap ---
    t.equal(MAX_CURSORS, 2, 'cap', 'a chart draws at most two cursors');
    t.ok(/cursorEdit\.rows\.length >= MAX_CURSORS/.test(js), 'cap',
        'the Add button stops at the cap');
    t.ok(/cursorAdd\.disabled = rows\.length >= MAX_CURSORS/.test(js), 'cap',
        'and the cap is shown by disabling it');
    t.ok(new RegExp(`Math\\.Min\\(Cursors\\.Count, MaxCursors\\)`).test(cs), 'cap',
        'the C# renderer draws only the first two cursors, whatever the XAML holds');
    t.ok(new RegExp(`Math\\.Min\\(Cursors\\.Count, MaxCursors\\)`).test(vb), 'cap',
        'the VB twin caps them the same way');

    // --- 5. the enum spellings must match the C# and VB enums ---
    t.equal(CURSOR_ORIENTATIONS.join(','), enumMembers(cs, 'CursorOrientation').join(','), 'model',
        'the orientation picker lists the same members as the C# CursorOrientation enum');
    t.equal(CURSOR_STYLES.join(','), enumMembers(cs, 'CursorStyle').join(','), 'model',
        'the style picker lists the same members as the C# CursorStyle enum');
    t.equal(READOUT_POSITIONS.join(','), enumMembers(cs, 'CursorReadout').join(','), 'model',
        'the readout picker lists the same members as the C# CursorReadout enum');
    t.equal(CURSOR_ORIENTATIONS.join(','), vbEnumMembers(vb, 'CursorOrientation').join(','), 'model',
        'and the VB twin matches the orientation picker');
    t.equal(CURSOR_STYLES.join(','), vbEnumMembers(vb, 'CursorStyle').join(','), 'model',
        'and its CursorStyle — Long/Short written as [Long]/[Short], whose METADATA name is what XAML uses');

    // --- 6. every attribute the writer sets is a real member of the class it lands on ---
    const cursorClass = between(cs, 'public sealed class ChartCursor', 'public sealed class ChartData');
    t.ok(cursorClass.length > 0, 'model', 'the C# ChartCursor class is where the test expects it');
    for (const f of CHART_CURSOR_FIELDS) {
        t.ok(new RegExp(`public [\\w\\?\\[\\]]+ ${f.attr} \\{`).test(cursorClass), 'model',
            `ChartCursor exposes ${f.attr} (the XAML attribute and the host both map it by name)`);
    }
    const chartBase = between(cs, 'public abstract class ChartBase', 'protected abstract ChartData InlineData');
    t.ok(/public AvaloniaList<ChartCursor> Cursors \{ get; \}/.test(chartBase), 'model',
        'ChartBase exposes the Cursors collection the property element fills');
    for (const f of CHART_CURSOR_CHART_FIELDS) {
        t.ok(new RegExp(`nameof\\(${f.attr}\\)`).test(chartBase), 'model',
            `ChartBase registers ${f.attr} (the readout settings are chart-level attributes)`);
    }
    // A StyledProperty has to be registered for the renderer to react to it.
    t.ok(/ReadoutPositionProperty, CursorDecimalsProperty,/.test(cs), 'model',
        'changing the readout position or the decimals redraws the chart (AffectsRender)');
    t.ok(/ReadoutPositionProperty, CursorDecimalsProperty,/.test(vb), 'model',
        'and the VB twin registers them too');

    // --- 7. the runtime half: mouse, keyboard and the right-click menu ---
    t.ok(/protected override void OnKeyDown/.test(cs), 'runtime', 'the chart handles the cursor keys');
    t.ok(/Key\.Up or Key\.Down/.test(cs), 'runtime', 'up/down choose the trace the readout reports');
    t.ok(/Key\.Left or Key\.Right/.test(cs), 'runtime', 'left/right step the selected cursor');
    t.ok(/SampleStep\(/.test(cs), 'runtime',
        'and the step is one SAMPLE, taken from the data around the cursor');
    t.ok(/if \(live\.Count == 0\) return;/.test(cs), 'runtime',
        'without a cursor the chart leaves the arrow keys to the window around it');
    t.ok(/protected override void OnPointerMoved/.test(cs) && /DragCursorTo\(/.test(cs), 'runtime',
        'dragging a cursor line moves it');
    t.ok(/_dragMode is 1 or 3/.test(cs), 'runtime', 'the vertical line moves X, the horizontal line Y');
    t.ok(/ShowCursorMenu\(\)/.test(cs), 'runtime', 'right-clicking opens the cursor menu');
    t.ok(/Readout: follow the mouse/.test(cs) && /Readout: top right corner/.test(cs), 'runtime',
        'the menu offers both readout positions');
    t.ok(/Add cursor/.test(cs) && /Remove cursor/.test(cs) && /Reset cursors to the middle/.test(cs)
        && /Copy readout/.test(cs), 'runtime',
        'and the add/remove/reset/copy actions the user asked for');
    t.ok(/ValueAt\(/.test(cs), 'runtime',
        'the readout interpolates between samples (the cursors move freely)');
    t.ok(/Protected Overrides Sub OnKeyDown/.test(vb) && /Private Sub ShowCursorMenu/.test(vb), 'runtime',
        'the VB twin carries the same input handling');
    // Menu ticks are TEXT, not check marks: MenuItem.IsChecked does not exist in Avalonia 11.0, which
    // the bundled control still has to build against.
    t.ok(!/IsChecked/.test(between(cs, 'private void ShowCursorMenu', 'private static FormattedText MakeText')),
        'runtime', 'the menu carries its state in the item text (Avalonia 11.0 has no MenuItem.IsChecked)');

    // --- 12. Follow trace: the crossing sits on the selected trace unless it is switched off ---
    const followField = CHART_CURSOR_FIELDS.find((f) => f.key === 'followTrace');
    t.ok(followField && followField.attr === 'FollowTrace' && followField.def === 'True', 'follow',
        'the follow switch is a cursor field whose XAML attribute is FollowTrace, on by default');
    t.ok(/public bool FollowTrace \{ get; set; \} = true;/.test(cursorClass), 'follow',
        'the C# cursor carries it (default true, so the new behaviour is what you get)');
    t.ok(/Public Property FollowTrace As Boolean = True/.test(vb), 'follow',
        'and so does the VB twin');
    // The drawing must DERIVE the crossing's Y from the trace — with the same value the readout uses,
    // which is what keeps the number and the drawn crossing in agreement.
    const draw = between(cs, 'private void DrawCursors', 'private void DrawCursorReadout');
    t.ok(/cursor\.FollowTrace \&\& readoutValue\.HasValue/.test(draw), 'follow',
        'the C# drawing follows the trace only when the cursor asks for it AND the trace has a value');
    t.ok(/readoutValue = trace is null \? null : ValueAt\(trace\.Data, x\)/.test(draw), 'follow',
        'and takes the crossing Y from the trace, interpolated at the cursor X');
    const vbDraw = between(vb, 'Private Sub DrawCursors', 'Private Sub DrawCursorReadout');
    t.ok(/cursor\.FollowTrace AndAlso readoutValue\.HasValue/.test(vbDraw)
        && /ValueAt\(trace\.Data, x\)/.test(vbDraw),
        'follow', 'the VB twin derives it the same way');
    // One trace choice for both, so they cannot drift apart.
    for (const [name, source] of [['C#', cs], ['VB', vb]]) {
        t.ok(/SelectedTrace/.test(source), 'follow', `${name} picks the traced series through one helper`);
    }
    // Dragging a following cursor slides it along the trace: X from the pointer, Y untouched.
    const drag = between(cs, 'private void DragCursorTo', 'private void CopyReadout');
    t.ok(/if \(cursor\.FollowTrace\)[\s\S]*?cursor\.X = common\.XRange\.FromPixel[\s\S]*?return;/.test(drag),
        'follow', 'dragging a following cursor moves X only (any grip, including the horizontal line)');
    const vbDrag = between(vb, 'Private Sub DragCursorTo', 'Private Sub CopyReadout');
    t.ok(/If cursor\.FollowTrace Then/.test(vbDrag) && /cursor\.X = common\.XRange\.FromPixel/.test(vbDrag),
        'follow', 'and the VB twin does too');
    // A following cursor has no Y of its own, so the keyboard must not invent one.
    t.ok(/!cursor\.FollowTrace && double\.IsNaN\(cursor\.Y\)/.test(cs), 'follow',
        'the arrow keys do not write a Y for a following cursor');

    // The editor offers the switch and stands the Y position box down while it is on.
    t.ok(/seriesField\('Follow trace'/.test(js), 'follow', 'the Cursor editor has a Follow trace row');
    t.ok(/yPos\.disabled = follows/.test(js), 'follow',
        'and disables the Y position box while the crossing follows the trace');
    t.ok(/row\.followTrace = v; renderCursorEditor\(\)/.test(js), 'follow',
        'changing it redraws the editor, so the Y box follows the switch');

    // Reading and writing the attribute.
    const followChart = chartModel('');
    const followDefaults = chartCursorsOf(followChart.el);
    writeChartCursors(followChart.model, followChart.el, followDefaults.settings, [{ src: '-1' }]);
    const followWritten = followChart.model.serialize(true);
    t.ok(!/FollowTrace/.test(followWritten), 'follow',
        'a cursor that follows the trace writes no attribute at all (it is the default)');
    writeChartCursors(followChart.model, followChart.el, followDefaults.settings,
        [{ src: '0', followTrace: 'False' }]);
    t.ok(/FollowTrace="False"/.test(followChart.model.serialize(true)), 'follow',
        'switching it off IS written out');
    t.equal(chartCursorsOf(followChart.el).cursors[0].followTrace, 'False', 'follow',
        'and reads back as off');
    const handFollow = chartModel(`<charts:GrumpyXYPlot.Cursors>
        <charts:ChartCursor X="1" FollowTrace="False" Y="0"/>
      </charts:GrumpyXYPlot.Cursors>`);
    t.equal(chartCursorsOf(handFollow.el).cursors[0].followTrace, 'False', 'read',
        'a hand-written FollowTrace="False" is read and preserved');

    // --- 12b. the two-cursor difference rows (|X1 − X2| and |Y1 − Y2|) ---
    const readoutCs = between(cs, 'private void DrawCursorReadout', 'private static double? ValueAt');
    const readoutVb = between(vb, 'Private Sub DrawCursorReadout', 'Private Shared Function ValueAt');
    for (const [name, body] of [['C#', readoutCs], ['VB', readoutVb]]) {
        t.ok(/Count >= 2/.test(body), 'delta',
            `${name} only reports a difference while TWO cursors are drawn (a switched-off one adds none)`);
        t.ok(/Math\.Abs\(first\.X - second\.X\)/.test(body), 'delta',
            `${name} reports the absolute X difference`);
        t.ok(/Math\.Abs\(first\.Y - second\.Y\)/.test(body), 'delta',
            `${name} and the absolute Y difference`);
        t.ok(/ΔX /.test(body) && /ΔY /.test(body), 'delta',
            `${name} labels them ΔX and ΔY`);
    }
    // The values subtracted are the ones each cursor's own readout line shows — recorded on the hit
    // while drawing — so the difference can never contradict the rows above it.
    t.ok(/X = x, Y = readoutY/.test(draw), 'delta',
        'the C# records each cursor\'s readout value as it draws it');
    t.ok(/\.X = x, \.Y = readoutY/.test(vbDraw), 'delta', 'and the VB twin does too');
    // The delta row is drawn in the OTHER cursor's colour, and looks for that cursor explicitly.
    t.ok(/first\.Index == index \? second\.Cursor\.Color : first\.Cursor\.Color/.test(readoutCs), 'delta',
        'the C# difference row takes the colour of the cursor it is not reporting');
    t.ok(/first\.Index = index, second\.Cursor\.Color, first\.Cursor\.Color/.test(readoutVb), 'delta',
        'and the VB twin does the same');
    // The pair's numbers travel with the copied readout too.
    t.ok(/_readoutText = tag[\s\S]{0,220}delta/.test(readoutCs), 'delta',
        'the C# copied readout carries the difference (Copy readout in the chart menu)');
    t.ok(/_readoutText = tag[\s\S]{0,220}delta/.test(readoutVb), 'delta',
        'and so does the VB one');

    // --- 8. the host reads the property element (or the designer preview shows nothing) ---
    const host = read('host/XamlRenderer.cs');
    t.ok(/EndsWith\("\.Cursors"/.test(host), 'host', 'the host renderer looks for the .Cursors property element');
    t.ok(/new AvaloniaCharts\.ChartCursor\(\)/.test(host), 'host', 'and builds a ChartCursor per child');

    // --- 9. reading and writing ---
    const empty = chartModel('');
    const none = chartCursorsOf(empty.el);
    t.equal(none.cursors.length, 0, 'read', 'a chart with no cursor XAML reads as no cursors');
    t.equal(none.settings.readoutPosition, 'FollowMouse', 'read',
        'and with the renderer default readout position');
    t.equal(none.settings.decimals, '-1', 'read', 'and automatic decimals');

    // A hand-written form reads back exactly.
    const hand = chartModel(`<charts:GrumpyXYPlot.Cursors>
        <charts:ChartCursor Orientation="Vertical" Style="Long" Color="Teal" X="2.5" XValues="False"/>
        <charts:ChartCursor Orientation="Horizontal" Y="7" YValues="False"/>
      </charts:GrumpyXYPlot.Cursors>`, 'ReadoutPosition="TopRight" CursorDecimals="2"');
    const read2 = chartCursorsOf(hand.el);
    t.equal(read2.cursors.length, 2, 'read', 'both cursor elements are found');
    t.equal(read2.cursors[0].orientation, 'Vertical', 'read', 'the first cursor keeps its orientation');
    t.equal(read2.cursors[0].style, 'Long', 'read', 'and its style');
    t.equal(read2.cursors[0].color, 'Teal', 'read', 'and a NAMED colour is left alone');
    t.equal(read2.cursors[0].x, '2.5', 'read', 'and its X position');
    t.equal(read2.cursors[0].xValues, 'False', 'read', 'and its readout switches');
    t.equal(read2.cursors[0].y, '', 'read', 'an absent Y reads as empty (the middle of the axis)');
    t.equal(read2.cursors[1].orientation, 'Horizontal', 'read', 'the second cursor is separate');
    t.equal(read2.settings.readoutPosition, 'TopRight', 'read', 'the chart-level readout position is read');
    t.equal(read2.settings.decimals, '2', 'read', 'and so are the decimals');

    // Saving the defaults writes NOTHING: a cursor the user never touched stays a bare element.
    const fresh = chartModel('');
    writeChartCursors(fresh.model, fresh.el, none.settings, [{ src: '-1' }]);
    const bare = fresh.model.serialize(true);
    t.ok(bare.includes('<charts:GrumpyXYPlot.Cursors>'), 'write',
        'a new cursor gets the chart\'s .Cursors property element');
    t.ok(bare.includes('<charts:ChartCursor/>'), 'write', 'and a bare <charts:ChartCursor/> inside it');
    t.ok(!/X=""/.test(bare) && !/Orientation=/.test(bare) && !/Style=/.test(bare), 'write',
        'with every value equal to the renderer default left out');
    t.equal(chartCursorChildren(fresh.el).length, 1, 'write', 'and it reads back as one cursor');

    // A saved cursor keeps its element: editing a cursor in place must not lose anything (a cursor
    // element is where a future field would live, so the editor must never rebuild it wholesale).
    const edited = chartModel(`<charts:GrumpyXYPlot.Cursors>
        <charts:ChartCursor X="3" DataThatOnlyCameLater="kept"/>
      </charts:GrumpyXYPlot.Cursors>`);
    writeChartCursors(edited.model, edited.el, { readoutPosition: 'TopRight', decimals: '1' },
        [{ src: '0', orientation: 'Both', style: 'Solid', color: '#123456', xValues: 'True', yValues: 'False', x: '3', y: '4' }]);
    const saved = edited.model.serialize(true);
    t.ok(saved.includes('DataThatOnlyCameLater="kept"'), 'write',
        'an edited cursor keeps attributes this editor does not know about');
    t.ok(saved.includes('Style="Solid"') && saved.includes('Color="#123456"'), 'write',
        'while the fields it does own are written');
    t.ok(saved.includes('YValues="False"'), 'write', 'including a switch that is off');
    t.ok(saved.includes('Y="4"'), 'write', 'and a position');
    t.ok(saved.includes('ReadoutPosition="TopRight"') && saved.includes('CursorDecimals="1"'), 'write',
        'the chart-level readout settings are written too');
    const reRead = chartCursorsOf(edited.el);
    t.equal(reRead.cursors[0].style, 'Solid', 'read', 'the saved cursor reads back');
    t.equal(reRead.cursors[0].yValues, 'False', 'read', 'including its switches');
    t.equal(reRead.settings.decimals, '1', 'read', 'and the saved decimals');

    // Emptying the list removes the property element, so a chart with no cursors carries no cursor XAML.
    writeChartCursors(edited.model, edited.el, none.settings, []);
    t.ok(!edited.model.serialize(true).includes('Cursors'), 'write',
        'removing the last cursor removes the property element again');
    t.equal(chartCursorsOf(edited.el).cursors.length, 0, 'read', 'and the chart reads as having none');

    // Removing ONE of two cursors leaves the other, in order.
    const two = chartModel(`<charts:GrumpyXYPlot.Cursors>
        <charts:ChartCursor X="1"/>
        <charts:ChartCursor X="2"/>
      </charts:GrumpyXYPlot.Cursors>`);
    const both = chartCursorsOf(two.el).cursors;
    writeChartCursors(two.model, two.el, none.settings, [both[1]]);
    const one = chartCursorChildren(two.el);
    t.equal(one.length, 1, 'write', 'deleting one of two cursors leaves one element');
    t.ok(two.model.serialize(true).includes('X="2"'), 'write', 'and it is the one that was kept');
};
