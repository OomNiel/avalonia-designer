/* T2 — the chart's FILL / RESTORE ("dock" and "undock") entry (2026-09-22).
 *
 * The request: "add graph right-click options to all graph types that will dock the graph (fill) and also
 * undock (back to original position) in its container. The keyboard 'Esc' key should also undock the
 * expanded graph."
 *
 * What that has to mean in this control set, and what is pinned here:
 *   - it lives on the CHART's own menu (the one that already carries the spreadsheet picker), so it is
 *     added for EVERY chart type — including the bar and the pie, whose menu has no cursor entries and
 *     returns early: the fill entry must be added BEFORE that early return, or those two charts (the ones
 *     most likely to be squeezed on a form) would be the only ones without it;
 *   - the entry is STATE-AWARE: one item whose label says what the click will do, and the restore half
 *     carries the Esc hint, because Esc does the same thing;
 *   - "fill" means the container's whole rectangle: a Canvas child is moved to (0,0) and sized to the
 *     canvas, a Grid child also spans every row and column, and the chart is raised above its siblings —
 *     and the container's ORIGINAL placement (size, alignment, margin, Z, canvas/grid attachments, each
 *     including the "the form does not name it" state) is remembered so the restore is exact;
 *   - Esc is only swallowed while the chart really is filled, so a dialog around a collapsed chart still
 *     gets its own Esc;
 *   - the fill keeps up with the container when the WINDOW is resized, which is the whole point of docking
 *     it on a form.
 *
 * The GEOMETRY of all that is measured for real (a headless Avalonia app, tests/t4-runtime/chartFill);
 * this file is what keeps the wiring, the menu order and the two twins honest.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const cs = fs.readFileSync(path.join(ROOT, 'resources', 'GrumpyCharts.cs'), 'utf8');
const vb = fs.readFileSync(path.join(ROOT, 'resources', 'GrumpyCharts.vb'), 'utf8');
const TWINS = [['cs', cs], ['vb', vb]];
const count = (text, needle) => text.split(needle).length - 1;

module.exports = async (t) => {
    t.section('T2: filling a chart’s container (and putting it back)');

    for (const [lang, text] of TWINS) {
        // ---------------------------------------------------------------- the public API
        t.ok(lang === 'cs' ? /public bool FillContainer\(\)/.test(text) : /Public Function FillContainer\(\) As Boolean/.test(text),
            lang, `${lang}: FillContainer is public (code can call it, not just the menu)`);
        t.ok(lang === 'cs' ? /public bool RestorePlacement\(\)/.test(text) : /Public Function RestorePlacement\(\) As Boolean/.test(text),
            lang, `${lang}: RestorePlacement is public too`);
        t.ok(lang === 'cs' ? /public bool IsFilled => _filled;/.test(text) : /Public ReadOnly Property IsFilled As Boolean/.test(text),
            lang, `${lang}: and IsFilled says which state the chart is in`);
        t.ok(/_filled/.test(text), lang, `${lang}: the fill state is remembered`);
        t.ok(lang === 'cs'
            ? /if \(_filled \|\| Parent is not Visual host\) return false;/.test(text)
            : /If _filled OrElse host Is Nothing Then Return False/.test(text),
            lang, `${lang}: filling twice, or a chart with no container, is refused (not half-done)`);

        // ---------------------------------------------------------------- what is remembered
        for (const kept of ['_keepWidth', '_keepHeight', '_keepMargin', '_keepHAlign', '_keepVAlign',
            '_keepZ', '_keepLeft', '_keepTop', '_keepRow', '_keepColumn', '_keepRowSpan', '_keepColumnSpan']) {
            t.ok(text.includes(kept), lang, `${lang}: ${kept} is saved before the fill changes it`);
        }
        t.ok(lang === 'cs' ? /_keepLeft = Canvas\.GetLeft\(this\);/.test(text) : /_keepLeft = Canvas\.GetLeft\(Me\)/.test(text),
            lang, `${lang}: the canvas position is read with Get (NaN when the form never set it — writing that
            back leaves it unset rather than snapping the chart to 0,0)`.replace(/\s+/g, ' '));
        t.ok(lang === 'cs' ? /_keepZ = ZIndex;/.test(text) : /_keepZ = ZIndex/.test(text),
            lang, `${lang}: the stacking order is remembered (ZIndex is a Visual property, NOT Panel.ZIndex)`);

        // ---------------------------------------------------------------- what the fill does
        t.ok(lang === 'cs' ? /Width = Math\.Max\(1, host\.Bounds\.Width\);/.test(text) : /Width = Math\.Max\(1, host\.Bounds\.Width\)/.test(text),
            lang, `${lang}: the chart takes the container's width`);
        t.ok(lang === 'cs' ? /Height = Math\.Max\(1, host\.Bounds\.Height\);/.test(text) : /Height = Math\.Max\(1, host\.Bounds\.Height\)/.test(text),
            lang, `${lang}: and its height`);
        t.ok(lang === 'cs' ? /if \(host is Canvas\)[\s\S]{0,120}Canvas\.SetLeft\(this, 0\);/.test(text) : /If TypeOf host Is Canvas Then[\s\S]{0,120}Canvas\.SetLeft\(Me, 0\)/.test(text),
            lang, `${lang}: a Canvas child is moved to the container's corner (it cannot stretch)`);
        t.ok(/RowSpan/.test(text) && /ColumnSpan/.test(text), lang,
            `${lang}: a Grid child spans the whole grid, so its rectangle is the container's and not one cell's`);
        t.ok(lang === 'cs' ? /ZIndex = Math\.Max\(1000, _keepZ\);/.test(text) : /ZIndex = Math\.Max\(1000, _keepZ\)/.test(text),
            lang, `${lang}: and it is raised above its siblings, never below what the form gave it`);
        t.ok(lang === 'cs' ? /HorizontalAlignment\.Stretch;/.test(text) : /HorizontalAlignment\.Stretch/.test(text),
            lang, `${lang}: alignment is stretched (what a layout panel needs)`);

        // ---------------------------------------------------------------- the restore
        t.ok(lang === 'cs' ? /Width = _keepWidth;/.test(text) : /Width = _keepWidth/.test(text), lang,
            `${lang}: the restore writes the saved SIZE back (NaN included, which is "unset")`);
        const restoreBlock = text.slice(text.indexOf(lang === 'cs' ? 'public bool RestorePlacement()' : 'Public Function RestorePlacement()'));
        const restoreBody = restoreBlock.slice(0, 1200);
        for (const back of ['_keepHAlign', '_keepVAlign', '_keepMargin', '_keepZ', '_keepLeft', '_keepTop']) {
            t.ok(restoreBody.includes(back), lang, `${lang}: …and puts ${back} back too`);
        }
        t.ok(lang === 'cs' ? /if \(!_filled\) return false;/.test(text) : /If Not _filled Then Return False/.test(text),
            lang, `${lang}: restoring a chart that is not filled does nothing`);

        // ---------------------------------------------------------------- it follows the container
        t.ok(lang === 'cs'
            ? /container\.LayoutUpdated \+= OnFillHostLaidOut;/.test(text)
            : /AddHandler container\.LayoutUpdated, AddressOf OnFillHostLaidOut/.test(text),
            lang, `${lang}: the container's layout is watched while filled`);
        t.ok(lang === 'cs'
            ? /_fillHost\.LayoutUpdated -= OnFillHostLaidOut;/.test(text)
            : /RemoveHandler _fillHost\.LayoutUpdated, AddressOf OnFillHostLaidOut/.test(text),
            lang, `${lang}: and unwatched again on restore (no leak)`);
        t.ok(/OnDetachedFromVisualTree[\s\S]{0,400}LayoutUpdated -=/.test(lang === 'cs' ? text : text)
            || /_fillHost IsNot Nothing/.test(text), lang,
            `${lang}: a chart leaving the tree lets the event go as well`);
        t.ok(lang === 'cs' ? /Math\.Abs\(Width - width\) > 0\.5/.test(text) : /Math\.Abs\(Width - width\) > 0\.5/.test(text),
            lang, `${lang}: the resize watch only writes when the size really changed (it fires on every pass)`);

        // ---------------------------------------------------------------- the menu entry
        const menu = text.slice(text.indexOf(lang === 'cs' ? 'private void ShowChartMenu()' : 'Private Sub ShowChartMenu()'));
        const menuBody = menu.slice(0, 6000);
        t.ok(menuBody.includes('"Fill the container"'), lang, `${lang}: the menu offers "Fill the container"`);
        t.ok(menuBody.includes('"Restore the original position  (Esc)"'), lang,
            `${lang}: and the same entry becomes the restore, with the Esc hint in its label`);
        const fillAt = menuBody.indexOf(lang === 'cs' ? 'items.Add(fillItem);' : 'items.Add(fillItem)');
        const gateAt = menuBody.indexOf(lang === 'cs' ? 'if (!SupportsCursors)' : 'If Not SupportsCursors Then');
        t.ok(fillAt > 0 && gateAt > fillAt, lang,
            `${lang}: the entry is added BEFORE the no-cursors early return — so the bar and the pie have it too`);
        t.ok(lang === 'cs'
            ? /if \(_filled\) RestorePlacement\(\); else FillContainer\(\);/.test(menuBody)
            : /If _filled Then[\s\S]{0,80}RestorePlacement\(\)/.test(menuBody),
            lang, `${lang}: clicking it does whichever of the two the chart needs`);

        // ---------------------------------------------------------------- the Esc key
        const keys = text.slice(text.indexOf(lang === 'cs' ? 'protected override void OnKeyDown' : 'Protected Overrides Sub OnKeyDown'));
        const keysBody = keys.slice(0, 900);
        t.ok(lang === 'cs' ? /if \(e\.Key is Key\.Escape && _filled\)/.test(keysBody) : /If e\.Key = Key\.Escape AndAlso _filled Then/.test(keysBody),
            lang, `${lang}: Esc restores — and ONLY while the chart is filled`);
        t.ok(lang === 'cs' ? /RestorePlacement\(\);\s*e\.Handled = true;\s*return;/.test(keysBody.replace(/\r/g, ''))
            : /RestorePlacement\(\)[\s\S]{0,80}e\.Handled = True[\s\S]{0,40}Return/.test(keysBody),
            lang, `${lang}: and it is marked handled, so nothing else reacts to the same Esc`);
        t.ok(keysBody.indexOf('Key.Escape') < keysBody.indexOf('LiveCursorIndexes'), lang,
            `${lang}: the Esc branch comes BEFORE the cursor keys' early return (which would otherwise swallow it)`);

        // ---------------------------------------------------------------- Esc must be reachable
        t.ok(lang === 'cs'
            ? /IsRightButtonPressed\)[\s\S]{0,600}Focus\(\);\s*ShowChartMenu\(\);/.test(text)
            : /IsRightButtonPressed Then[\s\S]{0,600}Focus\(\)\s*ShowChartMenu\(\)/.test(text),
            lang, `${lang}: the right-click focuses the chart first, so Esc still reaches it after the menu closed`);
        t.ok(lang === 'cs' ? /Focus\(\);\s*return true;/.test(text) : /Focus\(\)\s*Return True/.test(text), lang,
            `${lang}: and filling focuses it as well`);
    }

    // ---------------------------------------------------------------- the twins stay twins
    for (const token of ['FillContainer', 'RestorePlacement', 'IsFilled', '_fillHost', 'ApplyFill',
        'OnFillHostLaidOut', 'Fill the container', 'Restore the original position']) {
        t.equal(count(cs, token) > 0, count(vb, token) > 0, 'parity', `both twins carry ${token}`);
    }
    t.equal(count(cs, 'FillContainer'), count(vb, 'FillContainer'), 'parity',
        'and they mention the fill the same number of times');
    t.equal(count(cs, 'RestorePlacement'), count(vb, 'RestorePlacement'), 'parity',
        'and the restore too');
    t.ok(/using Avalonia\.Layout;/.test(cs) && /Imports Avalonia\.Layout/.test(vb), 'parity',
        'both import Avalonia.Layout for the alignment enums the fill needs');

    // The chart's own menu is shared by every type, so one implementation covers all six of them —
    // pinned by the fact that ShowChartMenu lives on the BASE and no chart overrides it.
    t.equal(count(cs, 'private void ShowChartMenu()'), 1, 'all-types',
        'the menu is implemented once, on ChartBase (so every chart type has the fill entry)');
    t.equal(count(cs, 'protected override void ShowChartMenu'), 0, 'all-types',
        'and no chart type replaces it with its own copy');
    t.ok(/private static readonly string\[\] ChartTypes|public class GrumpyLinePlot : ChartBase/.test(cs), 'all-types',
        'the six chart types all derive from ChartBase, which is where the entry lives');
};
