/* T2 — propertyCatalog: every control's Properties list (Name/Type always present),
 * 'file' kind (Image Source, Window Icon, ChromeWindow TitleBarIcon), Items/ItemsSource,
 * read-only bound ItemsSource override, root vs non-root (Anchor only for non-root). */
'use strict';
const { DOMParser } = require('@xmldom/xmldom');
const { propertyDefsFor } = require('../../out/propertyCatalog.js');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" xmlns:chrome="using:AvaloniaChrome"';

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

module.exports = async (t) => {
    t.section('propertyCatalog');

    // --- Button: name/type + Content + Anchor (non-root) ---
    const btn = elFrom('<Button x:Name="b1" Content="Go"/>');
    const btnProps = propertyDefsFor(btn);
    t.equal(keyOf(btnProps, '__name__').value, 'b1', 'props', 'Button name');
    t.equal(keyOf(btnProps, '__type__').value, 'Button', 'props', 'Button type');
    t.equal(keyOf(btnProps, 'Content').kind, 'text', 'props', 'Button Content kind');
    t.ok(keyOf(btnProps, 'chrome:AnchorHelper.Anchor'), 'props', 'non-root has Anchor');

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
};
