/* T2 — propertyCatalog: every control's Properties list (Name/Type always present),
 * 'file' kind (Image Source, Window Icon, ChromeWindow TitleBarIcon), Items/ItemsSource,
 * read-only bound ItemsSource override, root vs non-root (Anchor for a direct Canvas child — free
 * placement — and for a direct DockPanel child — e.g. a Status Bar item / StatusDate, which has no
 * Dock property, so an edge Anchor docks it; Grid/StackPanel children get no Anchor) and the ONE
 * control that keeps a Dock row inside a Grid cell (the ProgressBar, whose dock then happens INSIDE
 * that cell). */
'use strict';
const { DOMParser } = require('@xmldom/xmldom');
const {
    propertyDefsFor, PROP_SECTIONS, CONTROL_PROPS, COMMON_PROPS, FONT_PROPS, ANCHOR_PROPS,
    GRUMPY_ANCHOR_PROPS, CHROME_WINDOW_PROPS, hasCustomColors, THEME_COLOR_KEYS, sizeFloorCompanion
} = require('../../out/propertyCatalog.js');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" xmlns:chrome="using:AvaloniaChrome" xmlns:spread="using:AvaloniaSpreadsheet"';

function elFrom(xml) {
    const doc = new DOMParser().parseFromString(`<root ${NS}>${xml}</root>`, 'text/xml');
    const kids = [];
    for (let i = 0; i < doc.documentElement.childNodes.length; i++) {
        const c = doc.documentElement.childNodes.item(i);
        if (c.nodeType === 1) kids.push(c);
    }
    return kids[0];
}
const keyOf = (props, k) => props.find((p) => p.key === k);
const childEls = (el) => Array.from(el.childNodes).filter((n) => n.nodeType === 1);
const fs = require('fs');
const path = require('path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

module.exports = async (t) => {
    t.section('propertyCatalog');

    // --- Button on a Canvas (free placement): name/type + Content + Anchor ---
    const onCanvas = elFrom('<Canvas><Button x:Name="b1" Content="Go"/></Canvas>');
    const btn = childEls(onCanvas)[0];
    const btnProps = propertyDefsFor(btn);
    t.equal(keyOf(btnProps, '__name__').value, 'b1', 'props', 'Button name');
    t.equal(keyOf(btnProps, '__type__').value, 'Button', 'props', 'Button type');
    t.equal(keyOf(btnProps, 'Content').kind, 'text', 'props', 'Button Content kind');
    t.ok(keyOf(btnProps, 'chrome:AnchorHelper.Anchor'), 'props', 'Canvas child has Anchor');

    // --- Button in a DockPanel (a Status Bar item): Anchor IS offered (edge-pin; no Dock prop) ---
    const onDock = elFrom('<DockPanel><Button x:Name="s1" Content="Ready"/></DockPanel>');
    const dockBtn = childEls(onDock)[0];
    t.ok(keyOf(propertyDefsFor(dockBtn), 'chrome:AnchorHelper.Anchor'), 'props', 'DockPanel child (Status Bar item) has Anchor');
    // --- The spreadsheet is dockable: it is offered the same Dock row the charts get (2026-09-26) ---
    // A sheet is usually ONE REGION of a form (a grid docked Bottom under a body, or Left beside it), so
    // the row matters more here than for a control placed at an exact spot. The key is the ATTACHED
    // DockPanel.Dock — Avalonia reads that from the sheet wherever it sits, so no property of its own is
    // needed — and the designer wraps it in a DockPanel when it is not in one already.
    const sheetEl = elFrom('<Canvas><spread:GrumpySheet x:Name="sh1"/></Canvas>');
    const sheetChild = childEls(sheetEl)[0];
    const sheetDock = keyOf(propertyDefsFor(sheetChild), 'DockPanel.Dock');
    t.ok(!!sheetDock, 'props', 'the spreadsheet offers the Dock row');
    t.equal(sheetDock && sheetDock.label, 'Dock', 'props', 'labelled Dock');
    t.equal(JSON.stringify(sheetDock && sheetDock.options),
        JSON.stringify(['None', 'Fill', 'Left', 'Top', 'Right', 'Bottom']), 'props',
        'with the same choices as every other dockable control');
    // --- The progress bar is dockable too (2026-09-28, asked for) ---
    // A bar reports a job that runs across a FORM, so it is usually a BAND at an edge (under a toolbar,
    // or along the bottom) rather than a thing placed at an exact spot — the same reason the sheet and
    // the charts carry the row. Same ATTACHED key, so Avalonia reads it from the bar wherever it sits.
    const pbEl = elFrom('<Canvas><ProgressBar x:Name="pb1" Value="25"/></Canvas>');
    const pbChild = childEls(pbEl)[0];
    const pbProps = propertyDefsFor(pbChild);
    const pbDock = keyOf(pbProps, 'DockPanel.Dock');
    t.ok(!!pbDock, 'props', 'the progress bar offers the Dock row');
    t.equal(pbDock && pbDock.label, 'Dock', 'props', 'labelled Dock');
    t.equal(JSON.stringify(pbDock && pbDock.options),
        JSON.stringify(['None', 'Fill', 'Left', 'Top', 'Right', 'Bottom']), 'props',
        'with the same choices as every other dockable control');
    t.equal(pbDock && pbDock.value, 'None', 'props',
        'a bar on a Canvas shows None (free placement is not a dock)');
    t.ok(!!pbDock && !!pbDock.desc, 'props', 'the row explains what docking will do to the bar');
    // It is a row ON TOP of the bar's own: the progress rows are still there.
    t.equal(keyOf(pbProps, 'Value').kind, 'number', 'props', 'the bar keeps its Value row');
    t.ok(keyOf(pbProps, 'IsIndeterminate'), 'props', 'and its Indeterminate row');
    t.equal(pbDock && pbDock.sectionId, 'layout', 'props', 'and it is filed under Layout, not Appearance');
    // The row is only useful because the designer's Dock branch does NOT take the "fill the cell"
    // shortcut for a bar — that shortcut stores no attribute, so the row would snap straight back to
    // None. The two halves of the widened behaviour are pinned here (the wrap itself is unit-tested
    // against the model, see xamlModel.test.js).
    const dockSrc = require('fs')
        .readFileSync(require('path').join(__dirname, '..', '..', 'src', 'designerPanel.ts'), 'utf8');
    t.ok(/const dockInsideCell = parentIsGrid && localName\(el\.tagName\) === 'ProgressBar'/.test(dockSrc)
        && /if \(parentIsGrid && !dockInsideCell\)/.test(dockSrc), 'props',
        'the panel skips the fill-the-cell shortcut for a bar (so the dock really happens)');
    t.ok(/pn === 'Grid' && localName\(el\.tagName\) === 'ProgressBar'\) return model\.wrapInGridCell\(el\)/.test(dockSrc),
        'props', 'and gives the bar a DockPanel inside its own cell');
    // A Canvas that lives INSIDE a DockPanel (a TAB PAGE's body — <Name>BodyN + <Name>BodyNCanvas — or
    // a form's own Body canvas) is a dock region of its own: the control moves into that DockPanel in
    // front of the Canvas (2026-09-29). Falling through wrapped it in a DockPanel inside the Canvas,
    // where a Canvas sizes a child to its own desire — so Dock=Fill filled nothing there.
    t.ok(/const owner = model\.moveIntoOwnerDockPanel\(el, parent\);/.test(dockSrc)
        && /if \(owner\) return owner;/.test(dockSrc), 'props',
        'a Canvas inside a DockPanel is treated as that panel\'s dock region (tab pages included)');
    // A dock must also FILL the region it hands the control, and a themed control will not do that by
    // itself (its ControlTheme centres it: a bar docked Left came out 220x4 — reported 2026-09-28 as
    // "it only docks horizontally"). The panel therefore writes Stretch on the axis the dock leaves
    // free, and takes it back when the dock is cleared. The bounds are measured for real in
    // tests/t1-preview/dockFill.test.js — this is only the half that reads the panel's source.
    t.ok(/\|\| value === 'Fill'\) \{\s*\n\s*el\.setAttribute\('VerticalAlignment', 'Stretch'\)/.test(dockSrc),
        'props', 'a docked control is stretched on the axis the dock leaves free (Left/Right/Fill → height)');
    t.ok(/\|\| value === 'Bottom' \|\| value === 'Fill'\) \{\s*\n\s*el\.setAttribute\('HorizontalAlignment', 'Stretch'\)/.test(dockSrc),
        'props', 'and on the other axis for Top/Bottom/Fill (→ width)');
    t.ok(/if \(el\.getAttribute\('VerticalAlignment'\) === 'Stretch'\) el\.removeAttribute\('VerticalAlignment'\)/.test(dockSrc)
        && /if \(el\.getAttribute\('HorizontalAlignment'\) === 'Stretch'\) el\.removeAttribute\('HorizontalAlignment'\)/.test(dockSrc),
        'props', 'and Dock=None takes that Stretch back (an alignment set by hand is left alone)');
    // Inside a DockPanel the row reads back the dock the bar actually has (Fill is the implicit one).
    const pbDocked = elFrom('<DockPanel LastChildFill="False"><ProgressBar x:Name="pb2" DockPanel.Dock="Bottom" Height="24"/><Canvas x:Name="Body"/></DockPanel>');
    const pb2 = childEls(pbDocked).find((c) => (c.getAttribute('x:Name') || '') === 'pb2');
    t.equal(keyOf(propertyDefsFor(pb2), 'DockPanel.Dock').value, 'Bottom', 'props',
        'a docked bar reports the dock it has');
    // The bar is the ONE control that keeps the Dock row inside a Grid cell (2026-09-28, asked for):
    // a bar is a strip that reports a job, so a strip in a cell still wants an edge — and the designer
    // honours it INSIDE the cell (it wraps the bar in a DockPanel that keeps the cell) instead of moving
    // the bar out of the layout. Canvas.Left/Top stay hidden there: a Grid ignores them outright.
    const pbInGrid = elFrom('<Grid><ProgressBar x:Name="pb3"/></Grid>');
    const pb3 = childEls(pbInGrid)[0];
    t.ok(!!keyOf(propertyDefsFor(pb3), 'DockPanel.Dock'), 'props',
        'a bar in a Grid cell STILL offers Dock (its dock happens inside the cell)');
    t.ok(!keyOf(propertyDefsFor(pb3), 'Canvas.Left') && !keyOf(propertyDefsFor(pb3), 'Canvas.Top'), 'props',
        'but not Canvas.Left/Top — a Grid ignores those');
    // Every OTHER control keeps the old rule: inside a cell there is no Dock row at all.
    const gridOthers = elFrom('<Grid><Button x:Name="gb1"/><Image x:Name="gi1"/><ListBox x:Name="gl1"/></Grid>');
    for (const child of childEls(gridOthers)) {
        const nm = child.getAttribute('x:Name');
        t.ok(!keyOf(propertyDefsFor(child), 'DockPanel.Dock'), 'props',
            `${nm} in a Grid cell has NO Dock (the cell IS its layout)`);
    }
    // --- A bare root Button (no element parent) gets no Anchor ---
    const rootBtn = elFrom('<Button x:Name="r1" Content="Root"/>');
    t.equal(!!keyOf(propertyDefsFor(rootBtn), 'chrome:AnchorHelper.Anchor'), false, 'props', 'root (parentless) Button has no Anchor');

    // --- A Button inside a Grid cell is laid out by the Grid: no Anchor ---
    const onGrid = elFrom('<Grid><Button x:Name="g1"/></Grid>');
    const gridBtn = childEls(onGrid)[0];
    t.equal(!!keyOf(propertyDefsFor(gridBtn), 'chrome:AnchorHelper.Anchor'), false, 'props', 'Grid cell child has no Anchor');

    // --- Structural bars of the TOP-LEVEL layout DockPanel (Menu / StatusBar / Body) get no Anchor ---
    const topWin = elFrom('<Window><DockPanel><Menu x:Name="Menu1" DockPanel.Dock="Top"/><Canvas Name="Body"/></DockPanel></Window>');
    const topDock = childEls(topWin).find((c) => c.tagName === 'DockPanel');
    const menu = topDock ? childEls(topDock).find((c) => (c.getAttribute('x:Name') || '') === 'Menu1') : undefined;
    if (topDock && menu) {
        t.equal(!!keyOf(propertyDefsFor(menu), 'chrome:AnchorHelper.Anchor'), false, 'props', 'top-level docked Menu bar has no Anchor');
    }

    // --- Image: Source is a file picker + Rotate (Angle) comes from the RenderTransform ---
    const img = elFrom('<Image x:Name="i1"/>');
    const imgProps = propertyDefsFor(img);
    t.equal(keyOf(imgProps, 'Source').kind, 'file', 'props', 'Image Source kind=file');
    t.equal(keyOf(imgProps, 'Angle').kind, 'number', 'props', 'Image has Rotate (Angle)');
    t.equal(keyOf(imgProps, 'Angle').value, '', 'props', 'Angle empty when no transform');
    const imgRot = elFrom('<Image x:Name="i2"><Image.RenderTransform><RotateTransform Angle="45"/></Image.RenderTransform></Image>');
    t.equal(keyOf(propertyDefsFor(imgRot), 'Angle').value, '45', 'props', 'Angle read from RenderTransform');

    // --- ListBox: Items + ItemsSource; override shows read-only bound value ---
    const lb = elFrom('<ListBox x:Name="l1"/>');
    const lbProps = propertyDefsFor(lb);
    t.equal(keyOf(lbProps, 'Items').kind, 'button', 'props', 'ListBox Items opens editor');
    t.ok(keyOf(lbProps, 'ItemsSource'), 'props', 'ListBox has ItemsSource');
    const bound = propertyDefsFor(lb, undefined, { value: 'nameslist', readOnly: true, desc: 'bound' });
    t.equal(keyOf(bound, 'ItemsSource').value, 'nameslist', 'props', 'bound ItemsSource value');
    t.equal(keyOf(bound, 'ItemsSource').readOnly, true, 'props', 'bound ItemsSource readOnly');

    // --- Grid: 'Rows & Columns' button; children get Grid.Row / Grid.Column cell pickers ---
    const grid = elFrom('<Grid x:Name="g1"><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="*"/></Grid.RowDefinitions><Grid.ColumnDefinitions><ColumnDefinition Width="90"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions><Button x:Name="b1"/></Grid>');
    const gridProps = propertyDefsFor(grid);
    t.equal(keyOf(gridProps, 'Grid.Defs').kind, 'button', 'props', 'Grid has Rows & Columns button');
    const btnInside = childEls(grid).find((c) => (c.getAttribute('x:Name') || '') === 'b1');
    t.ok(!!btnInside, 'props', 'Grid child button found');
    if (btnInside) {
        const childProps = propertyDefsFor(btnInside);
        t.equal(keyOf(childProps, 'Grid.Row').kind, 'dropdown', 'props', 'Grid child has Grid Row');
        t.equal(JSON.stringify(keyOf(childProps, 'Grid.Row').options), '["0","1"]', 'props', 'Grid Row options from definitions');
        t.equal(keyOf(childProps, 'Grid.Column').kind, 'dropdown', 'props', 'Grid child has Grid Column');
        t.equal(JSON.stringify(keyOf(childProps, 'Grid.Column').options), '["0","1"]', 'props', 'Grid Column options from definitions');
    }
    // a Grid child is positioned/sized by its cell — Dock and Canvas.Left/Top have no effect
    // there (its size is managed by the cell), so they are hidden for direct Grid children.
    {
        const g = elFrom('<Grid x:Name="g1"><Image x:Name="img1" Grid.Row="0" Grid.Column="0"/></Grid>');
        const imgEl = childEls(g).find((c) => (c.getAttribute('x:Name') || '') === 'img1');
        t.ok(!!imgEl, 'props', 'Grid Image child found');
        if (imgEl) {
            const p = propertyDefsFor(imgEl);
            t.ok(!keyOf(p, 'DockPanel.Dock'), 'props', 'Grid child has NO Dock');
            t.ok(!keyOf(p, 'Canvas.Left') && !keyOf(p, 'Canvas.Top'), 'props', 'Grid child has NO Canvas.Left/Top');
            // an Image in a Grid can opt OUT of the dynamic cell auto-sizing (extension state,
            // not a XAML attribute — so it's passed in rather than read from the element).
            t.equal(keyOf(p, 'AutoSizeToCell').kind, 'dropdown', 'props', 'Image in Grid has Auto-size to Cell');
            t.equal(keyOf(p, 'AutoSizeToCell').value, 'True', 'props', 'Auto-size defaults True');
            t.equal(keyOf(propertyDefsFor(imgEl, undefined, undefined, undefined, true), 'AutoSizeToCell').value, 'False', 'props', 'Auto-size off shows False');
        }
    }
    // non-Image controls in a Grid do NOT get Auto-size to Cell
    {
        const g = elFrom('<Grid x:Name="g1"><Button x:Name="b1" Grid.Row="0" Grid.Column="0"/></Grid>');
        const btnEl = childEls(g).find((c) => (c.getAttribute('x:Name') || '') === 'b1');
        t.ok(!!btnEl, 'props', 'Grid Button child found');
        if (btnEl) {
            t.ok(!keyOf(propertyDefsFor(btnEl), 'AutoSizeToCell'), 'props', 'Button in Grid has no Auto-size');
        }
    }
    // a nested Grid (Grid inside a Grid) gets Grid.Row/Grid.Column too (so it can be re-celled)
    {
        const outer = elFrom('<Grid x:Name="outer"><Grid.RowDefinitions><RowDefinition Height="*"/><RowDefinition Height="*"/></Grid.RowDefinitions><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions><Grid x:Name="inner" Grid.Row="1" Grid.Column="1"/></Grid>');
        const inner = childEls(outer).find((c) => (c.getAttribute('x:Name') || '') === 'inner');
        t.ok(!!inner, 'props', 'nested Grid child found');
        if (inner) {
            const innerProps = propertyDefsFor(inner);
            t.equal(keyOf(innerProps, 'Grid.Row').kind, 'dropdown', 'props', 'nested Grid has Grid Row');
            t.equal(keyOf(innerProps, 'Grid.Column').kind, 'dropdown', 'props', 'nested Grid has Grid Column');
            t.equal(keyOf(innerProps, 'Grid.Row').value, '1', 'props', 'nested Grid Grid Row value');
            t.equal(keyOf(innerProps, 'Grid.Column').value, '1', 'props', 'nested Grid Grid Column value');
            t.equal(keyOf(innerProps, 'Grid.Defs').kind, 'button', 'props', 'nested Grid still has Rows & Columns');
            t.ok(!keyOf(innerProps, 'DockPanel.Dock'), 'props', 'nested Grid has NO Dock');
        }
    }
    // a control NOT in a Grid must not get the cell pickers (the standalone Button above)
    t.ok(!keyOf(btnProps, 'Grid.Row'), 'props', 'non-grid control has no Grid Row');

    // --- Window root: Title/Icon(file)/CanResize, NO Anchor ---
    const win = elFrom('<Window x:Class="P.Main" Width="800" Height="450" Title="App" CanResize="False"/>');
    const winProps = propertyDefsFor(win);
    t.equal(keyOf(winProps, '__type__').value, 'Window', 'props', 'Window type');
    t.equal(keyOf(winProps, 'Icon').kind, 'file', 'props', 'Window Icon kind=file');
    t.equal(keyOf(winProps, 'Title').value, 'App', 'props', 'Window Title value');
    t.ok(!keyOf(winProps, 'Anchor'), 'props', 'root has NO Anchor');

    // --- ChromeWindow root: TitleBarTitle text + TitleBarIcon file ---
    const ch = elFrom('<chrome:ChromeWindow x:Class="P.Main" TitleBarTitle="My App" Height="494"/>');
    const chProps = propertyDefsFor(ch);
    t.equal(keyOf(chProps, '__type__').value, 'chrome:ChromeWindow', 'props', 'ChromeWindow type');
    t.equal(keyOf(chProps, 'TitleBarTitle').value, 'My App', 'props', 'TitleBarTitle value');
    t.equal(keyOf(chProps, 'TitleBarIcon').kind, 'file', 'props', 'TitleBarIcon kind=file');
    t.ok(!keyOf(chProps, 'Anchor'), 'props', 'ChromeWindow root no Anchor');

    // --- Dock computed value: last child of DockPanel fills ---
    const dockEl = elFrom('<DockPanel><ListBox x:Name="l2"/></DockPanel>');
    const last = dockEl.childNodes; // l2 is the sole child
    const l2 = elFrom('<ListBox x:Name="l2"/>');
    const l2Props = propertyDefsFor(l2, undefined, undefined, undefined);
    t.ok(keyOf(l2Props, 'DockPanel.Dock'), 'props', 'ListBox has Dock prop');

    // --- Shapes: Line / Rectangle / Ellipse / Arc expose the right drawing properties ---
    // Line: line colour + thickness + caps + editable Start/End points; NO Width/Height (its size
    // is the geometry — setting Width/Height would clip it, not stretch it) and NO Backcolor.
    {
        const ln = elFrom('<Line x:Name="ln1" StartPoint="0,0" EndPoint="120,80" Stroke="Black" StrokeThickness="2"/>');
        const p = propertyDefsFor(ln);
        t.equal(keyOf(p, '__type__').value, 'Line', 'shapes', 'Line type');
        t.equal(keyOf(p, 'Stroke').kind, 'color', 'shapes', 'Line has Line Colour (color)');
        t.equal(keyOf(p, 'Stroke').value, 'Black', 'shapes', 'Line stroke value read');
        t.equal(keyOf(p, 'StrokeThickness').kind, 'number', 'shapes', 'Line has Line Thickness');
        t.equal(keyOf(p, 'StrokeThickness').value, '2', 'shapes', 'Line thickness value read');
        t.equal(keyOf(p, 'StrokeLineCap').kind, 'dropdown', 'shapes', 'Line has Line Ends');
        t.equal(keyOf(p, 'StartPoint').kind, 'text', 'shapes', 'Line has Start Point');
        t.equal(keyOf(p, 'StartPoint').value, '0,0', 'shapes', 'Start Point value');
        t.equal(keyOf(p, 'EndPoint').value, '120,80', 'shapes', 'End Point value');
        t.ok(!keyOf(p, 'Width') && !keyOf(p, 'Height'), 'shapes', 'Line has NO Width/Height');
        t.ok(!keyOf(p, 'Fill'), 'shapes', 'Line has NO Backcolor (stroked only)');
    }
    // Rectangle: Backcolor (Fill) + line colour/thickness + rounded corners
    {
        const rect = elFrom('<Rectangle x:Name="r1" Width="120" Height="80" Fill="Transparent" Stroke="Black" StrokeThickness="1" RadiusX="8" RadiusY="8"/>');
        const p = propertyDefsFor(rect);
        t.equal(keyOf(p, '__type__').value, 'Rectangle', 'shapes', 'Rectangle type');
        const fill = keyOf(p, 'Fill');
        t.ok(!!fill, 'shapes', 'Rectangle has Backcolor');
        t.equal(fill.label, 'Backcolor', 'shapes', 'Fill labelled Backcolor');
        t.equal(fill.kind, 'color', 'shapes', 'Backcolor is a colour picker');
        t.equal(fill.value, 'Transparent', 'shapes', 'Backcolor value read');
        t.equal(keyOf(p, 'Stroke').kind, 'color', 'shapes', 'Rectangle has Line Colour');
        t.equal(keyOf(p, 'StrokeThickness').kind, 'number', 'shapes', 'Rectangle has Line Thickness');
        // Corner radius is a SINGLE property (RadiusX and RadiusY are always identical — the
        // designer stores both from one field and surfaces the X value as the current value).
        const radius = keyOf(p, 'Radius');
        t.ok(!!radius, 'shapes', 'Rectangle has ONE Corner Radius prop');
        t.equal(radius.label, 'Corner Radius', 'shapes', 'Radius labelled Corner Radius');
        t.equal(radius.kind, 'number', 'shapes', 'Corner Radius is a number field');
        t.equal(radius.value, '8', 'shapes', 'Corner Radius value read from RadiusX');
        t.ok(!keyOf(p, 'RadiusX'), 'shapes', 'No separate Radius X row');
        t.ok(!keyOf(p, 'RadiusY'), 'shapes', 'No separate Radius Y row');
        t.ok(keyOf(p, 'Width') && keyOf(p, 'Height'), 'shapes', 'Rectangle keeps Width/Height (resizable box)');
    }
    // Rectangle with NO radius attribute defaults the Corner Radius field to 0 (square).
    {
        const rect = elFrom('<Rectangle x:Name="r2" Fill="Red"/>');
        const p = propertyDefsFor(rect);
        t.equal(keyOf(p, 'Radius').value, '0', 'shapes', 'Corner Radius defaults to 0 when absent');
    }
    // Ellipse: Backcolor + line colour/thickness (no corners)
    {
        const ell = elFrom('<Ellipse x:Name="e1" Fill="Transparent" Stroke="Black"/>');
        const p = propertyDefsFor(ell);
        t.equal(keyOf(p, '__type__').value, 'Ellipse', 'shapes', 'Ellipse type');
        t.equal(keyOf(p, 'Fill').label, 'Backcolor', 'shapes', 'Ellipse Backcolor');
        t.ok(keyOf(p, 'Stroke') && keyOf(p, 'StrokeThickness'), 'shapes', 'Ellipse line props');
        t.ok(!keyOf(p, 'RadiusX'), 'shapes', 'Ellipse has NO corner radius');
        t.ok(!keyOf(p, 'Radius'), 'shapes', 'Ellipse has NO corner radius prop');
    }
    // Arc: line props + Start/Sweep angles (stroked only, no Backcolor)
    {
        const arc = elFrom('<Arc x:Name="a1" Width="100" Height="100" StartAngle="0" SweepAngle="270" Stroke="Black"/>');
        const p = propertyDefsFor(arc);
        t.equal(keyOf(p, '__type__').value, 'Arc', 'shapes', 'Arc type');
        t.equal(keyOf(p, 'StartAngle').kind, 'number', 'shapes', 'Arc Start Angle');
        t.equal(keyOf(p, 'StartAngle').value, '0', 'shapes', 'Arc Start Angle value');
        t.equal(keyOf(p, 'SweepAngle').value, '270', 'shapes', 'Arc Sweep Angle value');
        t.ok(keyOf(p, 'Stroke') && keyOf(p, 'StrokeThickness'), 'shapes', 'Arc line props');
        t.ok(!keyOf(p, 'Fill'), 'shapes', 'Arc has NO Backcolor (stroked)');
        t.ok(keyOf(p, 'Width') && keyOf(p, 'Height'), 'shapes', 'Arc keeps Width/Height (resizable box)');
    }

    // --- Properties panel SECTIONS: one canonical grouping + order for every control ---
    {
        const onCanvas2 = elFrom('<Canvas><Button x:Name="b2" Content="Go" Background="#333333" Foreground="White" FontSize="14"/></Canvas>');
        const p = propertyDefsFor(childEls(onCanvas2)[0]);
        const secOf = (k) => { const r = keyOf(p, k); return r ? r.sectionId : undefined; };
        t.equal(secOf('__name__'), undefined, 'sections', 'Name is pinned above the sections');
        t.equal(secOf('__type__'), undefined, 'sections', 'Type is pinned above the sections');
        t.equal(secOf('Width'), 'layout', 'sections', 'Width is Layout & size');
        t.equal(secOf('Canvas.Left'), 'layout', 'sections', 'Left is Layout & size');
        t.equal(secOf('chrome:AnchorHelper.Anchor'), 'layout', 'sections', 'Anchor is Layout & size');
        t.equal(secOf('HorizontalAlignment'), 'layout', 'sections', 'H. Align is Layout & size');
        t.equal(secOf('Background'), 'appearance', 'sections', 'Background is Appearance');
        t.equal(secOf('Foreground'), 'appearance', 'sections', 'Text colour is Appearance (not Text)');
        t.equal(secOf('CornerRadius'), 'appearance', 'sections', 'Corner Radius is Appearance');
        t.equal(secOf('__theme__'), 'appearance', 'sections', 'Theme is Appearance');
        t.equal(secOf('Content'), 'text', 'sections', 'Content is Text & font');
        t.equal(secOf('FontSize'), 'text', 'sections', 'Font Size is Text & font');
        t.equal(secOf('ClickMode'), 'behavior', 'sections', 'Click Mode is Behavior');
        t.equal(secOf('IsEnabled'), 'behavior', 'sections', 'Enabled is Behavior');
        t.equal(secOf('IsVisible'), 'behavior', 'sections', 'Visible is Behavior');
        // Pinned identity rows first, then the sections in their canonical order.
        t.equal(p[0].key, '__name__', 'sections', 'Name is the first row');
        t.equal(p[1].key, '__type__', 'sections', 'Type is the second row');
        const seen = [...new Set(p.map((r) => r.sectionId).filter(Boolean))];
        const canonical = PROP_SECTIONS.map((s) => s.id).filter((id) => seen.indexOf(id) >= 0);
        t.equal(seen, canonical, 'sections', 'sections appear in the canonical order');
        // Inside a section the canonical key order holds: size → position → margin → anchor → align.
        const layout = p.filter((r) => r.sectionId === 'layout').map((r) => r.key);
        t.ok(layout.indexOf('Width') < layout.indexOf('Height'), 'sections', 'Width before Height');
        t.ok(layout.indexOf('Height') < layout.indexOf('Canvas.Left'), 'sections', 'size before position');
        t.ok(layout.indexOf('Canvas.Left') < layout.indexOf('Margin'), 'sections', 'position before Margin');
        t.ok(layout.indexOf('chrome:AnchorHelper.Anchor') < layout.indexOf('HorizontalAlignment'), 'sections', 'Anchor before the alignments');
    }

    // --- H. Align / V. Align are ADVANCED rows (2026-09-26) ---
    // They stay in the catalog and keep their section, but the webview skips `advanced` rows until
    // "Show advanced" is ticked — on every control that has them (both are COMMON_PROPS rows) and on the
    // multi-selection panel, which is built from the same propertyDefsFor. Without this test the rows can
    // quietly reappear in beginner mode and nothing notices.
    {
        const probes = [
            ['Button', elFrom('<Canvas><Button x:Name="b3" Content="Go"/></Canvas>')],
            ['TextBlock', elFrom('<Canvas><TextBlock x:Name="t3" Text="hi"/></Canvas>')],
            ['DataGrid', elFrom('<Canvas><DataGrid x:Name="d3"/></Canvas>')]
        ];
        for (const [name, holder] of probes) {
            const p = propertyDefsFor(childEls(holder)[0]);
            for (const k of ['HorizontalAlignment', 'VerticalAlignment']) {
                const row = keyOf(p, k);
                t.ok(row, 'advanced', `${name} still OFFERS ${k} (hidden is not removed)`);
                t.equal(row && !!row.advanced, true, 'advanced',
                    `${name}.${k} needs "Show advanced" — the row is only revealed by it`);
            }
        }
        // …and the webview's filter is the single gate both the single-selection and the multi-selection
        // panels go through, so "tick Show advanced" really is what brings them back.
        const webview = require('fs')
            .readFileSync(require('path').join(__dirname, '..', '..', 'media', 'designer.js'), 'utf8');
        t.ok(/if \(p\.advanced && !state\.showAdvanced\) continue;/.test(webview), 'advanced',
            'the webview hides advanced rows until Show advanced is ticked');
    }

    // --- The Theme row belongs to controls whose panel offers a THEME-COLOURED row ---
    // System = drop the fixed colours and follow the OS theme; Custom = restore them. Both answers work
    // through THEME_COLOR_KEYS (Background / Foreground / BorderBrush / CaretBrush / …), so a control
    // whose panel offers none of those rows has two answers with nothing to act on — and the row's own
    // wording, "use the colours you set below", points at colours that are not there. The Timer (a
    // component) came first (asked 2026-09-30); this is the same rule for the shapes, whose colours are
    // Fill / Stroke, and for the Image, Slider, PathPickers and spreadsheet, whose colours are their own.
    {
        const timer = elFrom('<DockPanel><chrome:Timer x:Name="tm1"/></DockPanel>');
        const timerRows = propertyDefsFor(childEls(timer)[0]);
        t.equal(!!keyOf(timerRows, '__theme__'), false, 'theme',
            'the Timer (a component that draws nothing) has no Theme row');
        t.equal(timerRows.some((r) => r.sectionId === 'appearance'), false, 'theme',
            'and therefore no Appearance section');
        const keeps = ['<Canvas><Button x:Name="b9" Content="Go"/></Canvas>',
            '<Canvas><TextBlock x:Name="t9" Text="hi"/></Canvas>',
            '<chrome:GrumpyPanel x:Name="gp9"/>',
            '<Canvas><Separator x:Name="sp9"/></Canvas>',
            '<Canvas><Border x:Name="bd9"/></Canvas>'];
        for (const xml of keeps) {
            const p = propertyDefsFor(childEls(elFrom(xml))[0] || elFrom(xml));
            t.equal(!!keyOf(p, '__theme__'), true, 'theme',
                `${xml.split(' ')[0].replace(/[<:]/g, '')} keeps its Theme row (it offers a theme colour)`);
        }
        // Colours that are NOT theme keys: the Theme row goes, the control's own colour rows stay, and
        // the Appearance section stays with them (Opacity is not a colour).
        const noTheme = [
            ['Image', '<Canvas><Image x:Name="i9"/></Canvas>', null, 'it offers no colour row at all'],
            ['Slider', '<Canvas><Slider x:Name="s9"/></Canvas>', null, 'it offers no colour row at all'],
            ['PathPicker', '<chrome:PathPicker x:Name="pp9"/>', null, 'it offers no colour row at all'],
            ['Line', '<Canvas><Line x:Name="l9"/></Canvas>', 'Stroke', 'Stroke is not a theme key'],
            ['Rectangle', '<Canvas><Rectangle x:Name="r9"/></Canvas>', 'Fill', 'Fill / Stroke are not theme keys'],
            ['Arc', '<Canvas><Arc x:Name="a9"/></Canvas>', 'Stroke', 'Stroke is not a theme key'],
            ['Polyline', '<Canvas><Polyline x:Name="pl9"/></Canvas>', 'Stroke', 'Stroke is not a theme key'],
            ['GrumpySheet', '<chrome:GrumpySheet x:Name="gs9"/>', 'GridColor', 'its GridColour / CellBackColor are its own']
        ];
        for (const [name, xml, ownColour, why] of noTheme) {
            const p = propertyDefsFor(childEls(elFrom(xml))[0] || elFrom(xml));
            t.equal(!!keyOf(p, '__theme__'), false, 'theme',
                `${name} has no Theme row (${why})`);
            if (ownColour) {
                t.equal(!!keyOf(p, ownColour), true, 'theme',
                    `${name} still offers its own ${ownColour} colour row`);
            }
            t.ok(p.some((r) => r.sectionId === 'appearance'), 'theme',
                `${name} keeps an Appearance section`);
        }
    }

    // --- Designer editor buttons are ALWAYS in the first section ('Editors') ---
    {
        const p = propertyDefsFor(elFrom('<DataGrid x:Name="d1"/>'));
        t.equal(keyOf(p, 'Rows').sectionId, 'editors', 'sections', 'DataGrid Rows editor is in Editors');
        t.equal(keyOf(p, 'Columns').sectionId, 'editors', 'sections', 'DataGrid Columns editor is in Editors');
        t.equal(p.filter((r) => r.sectionId)[0].sectionId, 'editors', 'sections', 'Editors is the very first section');
        t.equal(keyOf(p, 'Rows').section, 'Editors', 'sections', 'the row carries the section label too');
    }

    // --- The GrumpyCommandBar's brand-new "Items Editor" section (2026-09-30) ---
    // The bar's CONTENTS are what the control is — the frame rows only wrap them — so its editor is
    // no longer a button buried in Data but the first section of the panel, above Layout & size.
    {
        const bar = elFrom('<chrome:GrumpyCommandBar x:Name="GrumpyCommandBar1" Height="36">'
            + '<StackPanel x:Name="GrumpyCommandBar1Items" Orientation="Horizontal"/></chrome:GrumpyCommandBar>');
        const p = propertyDefsFor(bar);
        const editor = keyOf(p, 'Commands');
        t.equal(!!editor, true, 'items-editor', 'the bar still offers the Commands button');
        t.equal(editor.section, 'Items Editor', 'items-editor', 'its section is named "Items Editor"');
        t.equal(editor.sectionId, 'itemsEditor', 'items-editor', 'with its own section id');
        t.equal(editor.kind, 'button', 'items-editor', 'and it is still a popup-editor button');
        // …and it is the FIRST thing after the pinned identity rows, i.e. above the frame rows.
        const sections = p.filter((r) => r.sectionId);
        t.equal(sections[0].sectionId, 'itemsEditor', 'items-editor', 'Items Editor is the first section');
        t.equal(sections[0].key, 'Commands', 'items-editor', 'and it holds the editor button');
        t.equal(p[0].key, '__name__', 'items-editor', 'the identity rows stay pinned above every section');
        t.equal(p[1].key, '__type__', 'items-editor', 'Name then Type, as always');
        // The section is declared before 'editors' in the canonical order, and the bar's own panel
        // follows that order (an out-of-order panel would print the headings in a different order).
        t.equal(PROP_SECTIONS[0].id, 'itemsEditor', 'items-editor', 'declared as the very first section');
        t.equal(PROP_SECTIONS[0].label, 'Items Editor', 'items-editor', 'with the label the user asked for');
        const seen = [...new Set(p.map((r) => r.sectionId).filter(Boolean))];
        t.equal(seen, PROP_SECTIONS.map((s) => s.id).filter((id) => seen.indexOf(id) >= 0), 'items-editor',
            'the bar\'s sections appear in the canonical order');
        // The bar's frame rows are untouched, only the editor moved out of Data.
        t.equal(keyOf(p, 'Background').sectionId, 'appearance', 'items-editor', 'Background stays in Appearance');
        t.equal(keyOf(p, 'DockPanel.Dock').sectionId, 'layout', 'items-editor', 'Dock stays in Layout & size');
        t.equal(p.some((r) => r.sectionId === 'data'), false, 'items-editor',
            'and Data no longer holds the editor (the bar has no other Data row)');

        // NO OTHER CONTROL grows an empty "Items Editor": only the bar carries a Commands row, and the
        // webview prints a heading only where its rows are — so every other panel starts at Editors.
        for (const xml of ['<DataGrid x:Name="d9"/>', '<Button x:Name="b9" Content="Go"/>',
            '<chrome:GrumpySheet x:Name="s9"/>', '<TreeView x:Name="tv9"/>']) {
            const other = propertyDefsFor(elFrom(xml));
            t.equal(other.some((r) => r.sectionId === 'itemsEditor'), false, 'items-editor',
                `${xml.split(' ')[0].replace('<', '')} gets no Items Editor section`);
        }
        // …and the fallback for an UNLISTED editor button is still 'Editors', looked up by id — the
        // panel's first section is the bar's private one and must never collect another control's
        // buttons. (A hidden button is what a future control would add; here we check the rule itself.)
        const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'propertyCatalog.ts'), 'utf8');
        t.ok(/const EDITORS_SECTION = \(\(\) => \{\s*const index = PROP_SECTIONS\.findIndex\(\(s\) => s\.id === 'editors'\);/
            .test(src), 'items-editor',
            'the unlisted-button fallback finds Editors by id, never by position');
        t.ok(/EDITORS_SECTION\s*$/m.test(src) || /: EDITORS_SECTION\b/.test(src), 'items-editor',
            'and that constant is what an unlisted button falls back to');
    }

    // --- Coverage guard: every property the catalog can emit is filed in a section ---
    {
        const listed = new Set();
        for (const s of PROP_SECTIONS) for (const k of s.keys) listed.add(k);
        const missing = [];
        for (const [tag, list] of Object.entries(CONTROL_PROPS)) {
            for (const t of list) if (!listed.has(t.key)) missing.push(`${tag}.${t.key}`);
        }
        for (const t of COMMON_PROPS.concat(FONT_PROPS, ANCHOR_PROPS, GRUMPY_ANCHOR_PROPS, CHROME_WINDOW_PROPS)) {
            if (!listed.has(t.key)) missing.push(`shared.${t.key}`);
        }
        t.equal(missing, [], 'sections', 'every catalog key has a section (add new props to PROP_SECTIONS)');
        const els = ['<CheckBox x:Name="c1"/>', '<Window x:Name="w1"/>', '<TextBlock x:Name="t1"/>', '<Canvas><Image x:Name="i1"/></Canvas>'];
        for (const xml of els) {
            const el = elFrom(xml);
            const target = childEls(el).length ? childEls(el)[0] : el;
            const p = propertyDefsFor(target);
            const unsectioned = p.filter((r) => !r.section && r.key !== '__name__' && r.key !== '__type__').map((r) => r.key);
            t.equal(unsectioned, [], 'sections', `${target.tagName}: every row is pinned or sectioned`);
        }
    }

    // --- Background picker on NumericUpDown / ToggleSwitch, and the Theme (System/Custom) rule.
    //     Asking for a colour must flip the derived Theme row to Custom, and Theme = System must
    //     drop it again (that is how 'ignored on System' is implemented: the attribute is removed
    //     from the element, so nothing is left to apply). --------------------------------------
    {
        t.ok(THEME_COLOR_KEYS.indexOf('Background') >= 0, 'theme', 'Background is a theme colour key');
        for (const tag of ['NumericUpDown', 'ToggleSwitch']) {
            t.ok(CONTROL_PROPS[tag].some((r) => r.key === 'Background'), 'theme', `${tag} lists Background`);
            const el = elFrom(`<${tag} x:Name="c1"/>`);
            const bg = keyOf(propertyDefsFor(el), 'Background');
            t.equal(bg && bg.kind, 'color', 'theme', `${tag} Background is a colour picker`);
            t.equal(bg && bg.sectionId, 'appearance', 'theme', `${tag} Background is in Appearance`);
            // Unset: the control follows the OS theme, so the Theme row reads System.
            t.equal(keyOf(propertyDefsFor(el), '__theme__').value, 'System', 'theme', `${tag} starts on System`);
            t.equal(hasCustomColors(el), false, 'theme', `${tag} has no custom colour until one is set`);
            // Set it: Theme is DERIVED from the set colours, so it must now read Custom.
            el.setAttribute('Background', '#336699');
            t.equal(keyOf(propertyDefsFor(el), '__theme__').value, 'Custom', 'theme', `${tag} Background makes Theme Custom`);
            t.equal(hasCustomColors(el), true, 'theme', `${tag} Background counts as a custom colour`);
            // Theme = System: every theme colour is removed, so the backcolor cannot apply.
            for (const k of THEME_COLOR_KEYS) el.removeAttribute(k);
            t.ok(!el.getAttribute('Background'), 'theme', `${tag} Background is gone on System`);
            t.equal(keyOf(propertyDefsFor(el), '__theme__').value, 'System', 'theme', `${tag} is back on System`);
        }
    }

    // ---------- a themed control's own minimum beats the user's Height ----------
    // Reported 2026-09-29: *"the Height adjustment property for the Command Bar control is ignored"*.
    // Nothing ignored it: Avalonia's CommandBar theme carries MinHeight=48 and a MINIMUM beats an explicit
    // Height, so Height="30" renders 48 tall and the panel's row (which shows the rendered size) snapped
    // back. Measured against the real host: CommandBar 48, TextBox/ComboBox/CheckBox/NumericUpDown/
    // MaskedTextBox 32 (+MinWidth 64), CommandBarButton/ToggleButton 40, CommandBarSeparator 24, Button 0.
    // The rule below is what the designer writes as a companion minimum so the user's number wins.
    t.section('size floor (a themed minimum vs the user\'s Height/Width)');
    {
        // Below the floor: the companion is written, exactly as the user typed it.
        t.equal(sizeFloorCompanion('30', null, null, 48), '30', 'floor',
            'a Height below the control\'s floor gets a companion MinHeight');
        // `@xmldom/xmldom` answers '' for an attribute that is not there — which is what a real document
        // hands the rule, and reading that as "a minimum the user typed" made the first fix a no-op on a
        // real form while these tests (passing null) stayed green. Both spellings of absent must behave
        // identically.
        t.equal(sizeFloorCompanion('30', '30', '', 48), '30', 'floor',
            'an EMPTY MinHeight (xmldom\'s missing attribute) is treated as none');
        t.equal(sizeFloorCompanion('30', '', '', 48), '30', 'floor',
            'and an empty Height is no different from a missing one');
        t.equal(sizeFloorCompanion('30', '200', null, 48), '30', 'floor',
            'whatever the Height was before (here a full-width 200)');
        // A MinHeight ATTRIBUTE in the XAML is the user's (a theme floor is not written into the form), and
        // it is never overwritten — the panel then shows the size their own minimum produces.
        t.equal(sizeFloorCompanion('30', '30', '48', 48), undefined, 'floor',
            'a MinHeight already written in the XAML is left alone');
        // At or above the floor: nothing is added — a themed control keeps its own look.
        t.equal(sizeFloorCompanion('48', null, null, 48), undefined, 'floor', 'Height == floor needs no companion');
        t.equal(sizeFloorCompanion('80', null, null, 48), undefined, 'floor', 'nor does a larger one');
        t.equal(sizeFloorCompanion('30', null, null, 0), undefined, 'floor',
            'and a control with no floor (a Button) is never touched');
        // Growing past the floor again takes OUR companion back (a minimum equal to the size we wrote is
        // ours — and redundant either way).
        t.equal(sizeFloorCompanion('80', '30', '30', 48), '', 'floor',
            'growing past the floor removes the companion the designer wrote');
        t.equal(sizeFloorCompanion('', '30', '30', 48), '', 'floor',
            'and clearing the row (back to Auto) removes it too');
        t.equal(sizeFloorCompanion('', null, null, 48), undefined, 'floor',
            'while clearing a row that has none writes nothing');
        // A minimum the USER typed is theirs: it is never overwritten, even when it makes the Height
        // impossible — the panel then shows the size their own minimum produces.
        t.equal(sizeFloorCompanion('30', '200', '64', 48), undefined, 'floor',
            'a hand-set MinHeight is left alone');
        t.equal(sizeFloorCompanion('80', '200', '64', 48), undefined, 'floor',
            'even when the row is then raised');
        // Not a number: no NaN is ever written into a form.
        for (const v of ['Auto', 'auto', '50%', 'abc']) {
            t.equal(sizeFloorCompanion(v, null, null, 48), undefined, 'floor', `"${v}" is left to the framework`);
        }
        t.equal(sizeFloorCompanion('30.5', null, null, 48), '30.5', 'floor', 'a fractional size is written as typed');
        t.equal(sizeFloorCompanion('30', null, null, Number.NaN), undefined, 'floor',
            'an unknown floor (no frame reported yet) changes nothing');

        // The write sites, at source level: the rule lives in the MODEL, so every door goes through it —
        // the Properties panel, a multi-select edit, the same-width/height tools, the placement code, and
        // the **canvas resize handles**, which is the door the first attempt missed (it wrote
        // Width/Height straight onto the element, so dragging a CommandBar was still floored while typing
        // a number worked — reported straight after the first fix shipped).
        const panel = read('src/designerPanel.ts');
        const model = read('src/xamlModel.ts');
        t.ok(/sizeFloors: Record<string, \{ w: number; h: number \}> = \{\}/.test(model), 'floor-wiring',
            'the model holds the floors the host reported for each control');
        t.ok(/if \(key === 'Width' \|\| key === 'Height'\) \{ this\.writeSize\(el, key, value\); return; \}/.test(model),
            'floor-wiring', 'and setProperty routes every size write through writeSize');
        t.ok(/writeSize\(el: Element, key: 'Width' \| 'Height', value: string\)/.test(model) && /sizeFloorFor\(el, key\)/.test(model),
            'floor-wiring', 'which writes the companion minimum when the control\'s theme floors the value');
        const resizes = model.slice(model.indexOf('resize(el: Element'));
        t.ok(/this\.writeSize\(el, 'Width'/.test(resizes) && /this\.writeSize\(el, 'Height'/.test(resizes),
            'floor-wiring', 'the canvas resize handles included — the door that was missed');
        t.ok(!/el\.setAttribute\('Height', String\(Math\.round\(h\)\)\)/.test(resizes), 'floor-wiring',
            'and no write in resize() bypasses it any more');
        t.ok(/the panel fills it from every frame|doc\.model\.sizeFloors = \{\}/.test(panel), 'floor-wiring',
            'the panel refreshes the floors from each preview frame');
        t.ok(/doc\.model\.writeSize\(el, 'Height', String\(Math\.max\(24, doc\.model\.sizeFloorFor\(el, 'Height'\)\)\)\)/.test(panel)
            && /doc\.model\.writeSize\(el, 'Width', String\(Math\.max\(200, doc\.model\.sizeFloorFor\(el, 'Width'\)\)\)\)/.test(panel),
            'floor-wiring',
            'the dock thickness is the larger of the sensible one and the floor (a CommandBar cannot be 24 tall)');
        // The floors must also survive a re-parse: undo, reload and the history steps all build a fresh
        // XamlModel, which knows nothing — and the first edit right after an undo is exactly when nobody
        // looks for the companion that should have been written.
        t.ok(/private refreshSizeFloors\(doc: DesignerDocument\): void/.test(panel), 'floor-wiring',
            'the panel refreshes the floors in one place');
        const refreshes = (panel.match(/this\.refreshSizeFloors\(doc\);/g) || []).length;
        t.ok(refreshes >= 6, 'floor-wiring',
            `after every frame AND after every model re-parse (found ${refreshes} call sites, need >= 6)`);
        const host = read('host/XamlRenderer.cs');
        t.ok(/AddViaReflection\("MinWidth", InvariantNumber\);\s*\n\s*AddViaReflection\("MinHeight", InvariantNumber\);/.test(host),
            'floor-wiring', 'and the host reports MinWidth/MinHeight as the control actually has them');
    }

    // --- The per-control panel AUDIT ------------------------------------------------
    // Every toolbox control's panel, checked against the rule the Timer's Appearance section broke:
    // "Only relevant items must be listed in a control properties panel" (asked 2026-09-30). A row
    // that cannot do anything on the control it is offered for is not a cosmetic problem — it is a
    // row the user can set with no effect, or a dropdown with nothing in it, and nothing else in the
    // suite would notice (the T5 property audit checks that listed rows ROUND-TRIP; this one checks
    // they are the RIGHT rows).
    //
    // One check per RULE, with the offending controls listed in the detail: a hundred passes hide the
    // one failure, and a hundred failures bury it.
    {
        const NON_VISUAL = new Set(['Timer']);
        // Rows the catalog adds at runtime (designer editors and bindings), which belong to no tag
        // template — see the `props.push` sites in propertyCatalog.ts.
        const DYNAMIC_KEYS = new Set([
            'AutoSizeToCell', 'Axis', 'Columns', 'Cursors', 'DataSelector', 'Grid.Column', 'Grid.Row',
            'Grid.Defs', 'Items', 'Legend', 'MenuItems', 'Rows', 'Series', 'Slices', 'SplitLayout',
            'SplitPanelPaneBorder', 'Splitters', 'StatusDate.Date', 'StatusDate.Time', 'StatusDate.Preview',
            'StatusItems', 'TreeItems', 'UndoRedoDepth'
        ]);
        const sharedKeys = new Set([...COMMON_PROPS, ...FONT_PROPS, ...ANCHOR_PROPS,
        ...GRUMPY_ANCHOR_PROPS, ...CHROME_WINDOW_PROPS].map((t) => t.key));
        const metaKeys = new Set(['__name__', '__type__', '__theme__']);
        const sectionIds = PROP_SECTIONS.map((s) => s.id);

        // Every control the catalog knows, plus the ones it recognises by NAME rather than tag (a
        // Status Bar is a Border named StatusBarN, a SplitPanel a Border named SplitPanelN).
        const probes = Object.keys(CONTROL_PROPS).map((tag) => [tag, `<${tag === 'GrumpySheet' ? 'chrome:GrumpySheet' : tag} x:Name="${tag}1"/>`]);
        for (const [label, xml] of [
            ['StatusBar (Border named StatusBarN)', '<Border x:Name="StatusBar1"/>'],
            ['GrumpyStatus (GrumpyPanel named GrumpyStatusN)', '<chrome:GrumpyPanel x:Name="GrumpyStatus1"/>'],
            ['GrumpyCommandBar', '<chrome:GrumpyCommandBar x:Name="GrumpyCommandBar1">'
                + '<StackPanel x:Name="GrumpyCommandBar1Items" Orientation="Horizontal"/></chrome:GrumpyCommandBar>']
        ]) probes.push([label, xml]);

        const problems = { dupes: [], dead: [], buried: [], leaks: [], order: [], sections: [], themeNoColor: [] };
        // Where the popup editors live. Most are in the SAME section as the thing they edit (the
        // sheet's Cells in Data, a chart's Gradient in Appearance, its DataSelector in Data) — that is
        // deliberate, so they are reported rather than failed; what the audit does enforce is that a
        // button row is never left unfiled (rule 8), which is what hides an editor in the wrong place.
        const buttonHomes = new Set();
        let probed = 0;
        for (const [label, xml] of probes) {
            let el;
            try { el = elFrom(xml); } catch { problems.sections.push(`${label}: unparsable probe`); continue; }
            let rows;
            try { rows = propertyDefsFor(el); } catch (e) { problems.sections.push(`${label}: ${e.message}`); continue; }
            probed++;

            // 1) no row twice (a duplicate key means two rows writing the same attribute).
            const keys = rows.map((r) => r.key);
            const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
            if (dupes.length) problems.dupes.push(`${label}: ${[...new Set(dupes)].join(', ')}`);
            // Both answers of the Theme row work through THEME_COLOR_KEYS, so the row is only offered
            // where one of those rows is (see rule 6b).
            const hasThemeColor = rows.some((x) => x.key !== '__theme__' && THEME_COLOR_KEYS.indexOf(x.key) >= 0);

            for (const r of rows) {
                // 2) a row that cannot do anything: a dropdown with no options is a dead control; a
                //    row with no label is unreadable. Both are silently useless in the panel.
                if (r.kind === 'dropdown' && (!Array.isArray(r.options) || r.options.length === 0)) {
                    problems.dead.push(`${label}.${r.key} (empty dropdown)`);
                }
                if (!r.label && !r.key.startsWith('__')) problems.dead.push(`${label}.${r.key} (no label)`);
                // 3) WHERE an editor button sits, reported (see `buttonHomes`).
                if (r.kind === 'button') buttonHomes.add(`${label}.${r.key} → ${r.sectionId || '(none)'}`);
                // 4) traceability: a row is either the control's own, one of the shared catalog rows,
                //    a meta row, or one of the runtime rows. Anything else leaked in from another
                //    control's panel — which is how a no-op row gets offered.
                const own = (CONTROL_PROPS[label] || []).some((t) => t.key === r.key);
                if (!own && !sharedKeys.has(r.key) && !metaKeys.has(r.key) && !DYNAMIC_KEYS.has(r.key)
                    && label !== xml && !/^(StatusBar|GrumpyStatus|GrumpyCommandBar)/.test(label)) {
                    problems.leaks.push(`${label}.${r.key}`);
                }
                // 5) NO-OP ROWS ON A COMPONENT: the Timer draws nothing, so a colour/size/position row
                //    on it can only lie (this is the rule that removed its Appearance section).
                if (NON_VISUAL.has(label) && r.sectionId && r.sectionId !== 'behavior') {
                    problems.dead.push(`${label}.${r.key} (${r.sectionId} row on a component that draws nothing)`);
                }
                // 6) the rows a component must never carry, by name.
                if (NON_VISUAL.has(label) && ['Width', 'Height', 'Margin', 'Background', 'Foreground',
                    'BorderBrush', 'BorderThickness', 'CornerRadius', 'Opacity', '__theme__',
                    'chrome:AnchorHelper.Anchor', 'HorizontalAlignment', 'IsVisible'].includes(r.key)) {
                    problems.dead.push(`${label}.${r.key} (visual row on a component)`);
                }
                // 6b) …and the Theme row on a panel with nothing for it to act on: 'System' removes
                //     every theme colour and 'Custom' restores them, so on a control that offers no
                //     theme-coloured row both answers change nothing (the shapes' Fill/Stroke, an
                //     Image, a Slider, the PathPickers, the spreadsheet).
                if (r.key === '__theme__' && !hasThemeColor) {
                    problems.themeNoColor.push(label);
                }
            }

            // 7) the sections a panel shows are a subsequence of the canonical order — a panel whose
            //    headings come out in a different order means a row was filed by hand somewhere.
            const seen = [...new Set(rows.map((r) => r.sectionId).filter(Boolean))];
            const canonical = sectionIds.filter((id) => seen.includes(id));
            if (seen.join(',') !== canonical.join(',')) {
                problems.order.push(`${label}: ${seen.join(',')} (expected ${canonical.join(',')})`);
            }
            // 8) …and every row is filed at all (an unfiled row would land in the last section).
            const unfiled = rows.filter((r) => !r.key.startsWith('__') && !r.sectionId);
            if (unfiled.length) problems.sections.push(`${label}: ${unfiled.map((r) => r.key).join(', ')} unfiled`);
        }

        t.ok(probed >= 40, 'audit', `the audit really walked the toolbox (${probed} controls)`);
        t.equal(problems.dupes, [], 'audit', 'no control offers the same row twice');
        t.equal(problems.dead, [], 'audit', 'no dead rows (empty dropdown, no label, or a no-op row on a component)');
        t.equal(problems.leaks, [], 'audit', 'every row comes from the control\'s own template or a shared catalog row');
        t.equal(problems.order, [], 'audit', 'each panel\'s sections appear in the canonical order');
        t.equal(problems.sections, [], 'audit', 'every panel builds, and every row is filed in a section');
        t.equal(problems.themeNoColor, [], 'audit', 'no Theme row on a panel that offers no theme-coloured row');
        t.note(`${buttonHomes.size} editor buttons, e.g. `
            + [...buttonHomes].filter((b) => !/→ (editors|itemsEditor)$/.test(b)).slice(0, 6).join(', '));
    }
};
