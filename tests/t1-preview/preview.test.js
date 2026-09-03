/* T1 — PreviewerHost render pipeline: control placement bounds, Body auto-fill at two sizes,
 * ChromeWindow title bar (navy band + caption buttons + icon), ListBox empty + compact rows,
 * avares image resolution via projectPath. */
'use strict';
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { startHost, renderPng, HOST_BIN } = require('../helpers/host');
const { countIn, solidPng } = require('../helpers/png');
const { buildHost } = require('../helpers/build');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"';
const W = (body) => `<Window ${NS} Width="800" Height="450">\n  <Window.Styles><FluentTheme/></Window.Styles>\n  ${body}\n</Window>`;

function freePort() {
    return new Promise((res) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    });
}
const near = (a, b, tol = 3) => Math.abs(a - b) <= tol;
const byName = (frame, name) => frame.controls.find((c) => c.name === name);

module.exports = async (t) => {
    t.section('T1: PreviewerHost render pipeline');

    if (!fs.existsSync(HOST_BIN)) {
        t.note('host binary missing — building PreviewerHost first');
        const r = buildHost();
        t.ok(r.ok, 'host-build', 'prerequisite', `errors=${r.errors}`);
        if (!r.ok) return;
    }

    const port = await freePort();
    const host = await startHost(port);
    try {
        // 1) placement: Button at (100,50) 120x36 renders at its Canvas position
        {
            const { frame, img } = await renderPng(host, W(
                `<Canvas><Button x:Name="btn1" Content="OK" Canvas.Left="100" Canvas.Top="50" Width="120" Height="36"/></Canvas>`), 800, 450);
            t.ok(!frame.error, 'placement', 'no render error', frame.error || '');
            const b = byName(frame, 'btn1');
            t.ok(!!b, 'placement', 'btn1 reported');
            if (b) {
                t.ok(near(b.x, 100), 'placement', 'x=100', `x=${b.x.toFixed(1)}`);
                t.ok(near(b.y, 50), 'placement', 'y=50', `y=${b.y.toFixed(1)}`);
                t.ok(near(b.width, 120, 4), 'placement', 'w=120', `w=${b.width.toFixed(1)}`);
                t.ok(near(b.height, 36, 6), 'placement', 'h=36', `h=${b.height.toFixed(1)}`);
            }
        }

        // 2) Body auto-fill at 800x450 and 1200x700
        const bodyXaml = W('<DockPanel Name="Root"><Canvas Name="Body"><TextBlock Text="x"/></Canvas></DockPanel>');
        for (const [w, h] of [[800, 450], [1200, 700]]) {
            const { frame } = await renderPng(host, bodyXaml, w, h);
            const body = byName(frame, 'Body');
            t.ok(!!body, 'body-fill', `${w}x${h} body reported`);
            if (body) {
                t.ok(near(body.width, w, 3) && near(body.height, h, 3), 'body-fill', `${w}x${h} fills window`,
                    `body=${body.width.toFixed(1)}x${body.height.toFixed(1)}`);
            }
        }

        // 3) ChromeWindow title bar: navy band, caption buttons, body below the bar
        {
            const cw = 800, ch = 494;
            const chrome = `<chrome:ChromeWindow ${NS} xmlns:chrome="using:AvaloniaChrome" Width="${cw}" Height="${ch}" TitleBarTitle="Test App">
  <DockPanel Name="Root"><Canvas Name="Body"/></DockPanel>
</chrome:ChromeWindow>`;
            const { frame, img } = await renderPng(host, chrome, cw, ch);
            t.ok(!frame.error, 'chrome', 'no render error', frame.error || '');
            // navy band across the top 44px
            const navy = countIn(img, 0, cw, 0, 44, (r, g, b) => r === 0x0E && g === 0x21 && b === 0x38);
            t.ok(navy / (cw * 44) > 0.5, 'chrome', 'title bar navy band', `navy=${((navy / (cw * 44)) * 100).toFixed(0)}%`);
            // caption buttons: white glyph pixels in the top-right 3x42px block
            const glyphs = countIn(img, cw - 130, cw, 0, 44, (r, g, b) => r > 200 && g > 200 && b > 200);
            t.ok(glyphs > 20, 'chrome', 'caption button glyphs', `white px=${glyphs}`);
            // body sits below the 44px bar
            const body = byName(frame, 'Body');
            t.ok(!!body, 'chrome', 'Body reported');
            if (body) {
                t.ok(near(body.y, 44, 3), 'chrome', 'body below title bar', `y=${body.y.toFixed(1)}`);
                t.ok(near(body.height, ch - 44, 4), 'chrome', 'body height minus bar', `h=${body.height.toFixed(1)}`);
            }
        }

        // 4) ListBox placed EMPTY (no auto items) with compact style
        {
            const { frame } = await renderPng(host, W(
                `<Canvas><ListBox x:Name="lb" Width="140" Height="120">
   <ListBox.Styles><Style Selector="ListBoxItem"><Setter Property="MinHeight" Value="0"/><Setter Property="Padding" Value="4,1,4,1"/></Style></ListBox.Styles>
 </ListBox></Canvas>`), 800, 450);
            t.equal(frame.controls.filter((c) => c.type === 'ListBoxItem').length, 0, 'listbox', 'empty on placement');
            const lb = byName(frame, 'lb');
            t.ok(lb && near(lb.width, 140, 4) && near(lb.height, 120, 6), 'listbox', 'sized', lb ? `${lb.width.toFixed(0)}x${lb.height.toFixed(0)}` : 'missing');
        }

        // 5) ListBox compact item rows (MinHeight 0 → auto-size to text)
        {
            const { frame } = await renderPng(host, W(
                `<Canvas><ListBox x:Name="lb" Width="140" Height="120">
   <ListBox.Styles><Style Selector="ListBoxItem"><Setter Property="MinHeight" Value="0"/><Setter Property="Padding" Value="4,1,4,1"/></Style></ListBox.Styles>
   <ListBoxItem x:Name="it1" Content="Alpha"/>
   <ListBoxItem x:Name="it2" Content="Beta"/>
 </ListBox></Canvas>`), 800, 450);
            const it1 = byName(frame, 'it1'), it2 = byName(frame, 'it2');
            t.ok(!!it1 && !!it2, 'listbox', 'items reported');
            if (it1 && it2) {
                t.ok(it1.height <= 30, 'listbox', 'compact row height', `it1 h=${it1.height.toFixed(1)}`);
                t.ok(it2.y > it1.y, 'listbox', 'rows stacked', `it1.y=${it1.y.toFixed(0)} it2.y=${it2.y.toFixed(0)}`);
            }
        }

        // 6) avares image resolved via projectPath
        {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-preview-'));
            const assets = path.join(dir, 'Assets');
            fs.mkdirSync(assets, { recursive: true });
            fs.writeFileSync(path.join(assets, 'logo.png'), solidPng(32, 32, 220, 30, 30));
            fs.writeFileSync(path.join(dir, 'Proj.csproj'), '<Project Sdk="Microsoft.NET.Sdk"/>\n');
            const { frame, img } = await renderPng(host, W(
                `<Canvas><Image x:Name="imgLogo" Source="avares://Proj/Assets/logo.png" Canvas.Left="10" Canvas.Top="10"/></Canvas>`), 800, 450, dir);
            const imgCtrl = byName(frame, 'imgLogo');
            t.ok(!!imgCtrl, 'image', 'image control reported');
            if (imgCtrl) {
                t.ok(near(imgCtrl.width, 32, 3) && near(imgCtrl.height, 32, 3), 'image', 'natural bitmap size', `${imgCtrl.width.toFixed(0)}x${imgCtrl.height.toFixed(0)}`);
            }
            const red = countIn(img, 10, 42, 10, 42, (r, g, b) => r > 180 && g < 90 && b < 90);
            t.ok(red > 200, 'image', 'red pixels drawn', `red px=${red}`);
        }

        // 7) Grid: cells lay out children (Grid.Row/Grid.Column) + ShowGridLines renders
        {
            const { frame, img } = await renderPng(host, W(
                `<Canvas><Grid x:Name="g1" Canvas.Left="50" Canvas.Top="50" Width="300" Height="200" ShowGridLines="True" Background="White">
   <Grid.RowDefinitions><RowDefinition Height="*"/><RowDefinition Height="*"/></Grid.RowDefinitions>
   <Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions>
   <TextBlock x:Name="t0" Text="top" Grid.Row="0" Grid.Column="0"/>
   <TextBlock x:Name="t1" Text="bottom" Grid.Row="1" Grid.Column="1"/>
 </Grid></Canvas>`), 800, 450);
            t.ok(!frame.error, 'grid', 'no render error', frame.error || '');
            const t0 = byName(frame, 't0'), t1 = byName(frame, 't1');
            t.ok(!!t0 && !!t1, 'grid', 'children reported');
            if (t0 && t1) {
                // cell (0,0) = top-left quarter; cell (1,1) = bottom-right quarter
                t.ok(near(t0.x, 50, 3) && near(t0.y, 50, 3), 'grid', 't0 in cell (0,0)', `x=${t0.x.toFixed(0)} y=${t0.y.toFixed(0)}`);
                t.ok(near(t1.x, 200, 3) && near(t1.y, 150, 3), 'grid', 't1 in cell (1,1)', `x=${t1.x.toFixed(0)} y=${t1.y.toFixed(0)}`);
                t.equal(t0.parent, 'g1', 'grid', 't0 parent = g1');
                t.equal(t1.parent, 'g1', 'grid', 't1 parent = g1');
            }
            // the grid reports its cell boundaries so the webview can drag children between cells
            const gc = frame.gridCells && frame.gridCells.g1;
            t.ok(!!gc, 'grid', 'gridCells reported for g1');
            if (gc) {
                t.equal(JSON.stringify(gc.v.map((n) => Math.round(n))), '[50,200,350]', 'grid', 'column boundaries');
                t.equal(JSON.stringify(gc.h.map((n) => Math.round(n))), '[50,150,250]', 'grid', 'row boundaries');
            }
            // ShowGridLines: internal boundaries (x=200 vertical, y=150 horizontal) have non-white line pixels
            const vLine = countIn(img, 199, 201, 60, 240, (r, g, b) => !(r > 245 && g > 245 && b > 245));
            const hLine = countIn(img, 60, 340, 149, 151, (r, g, b) => !(r > 245 && g > 245 && b > 245));
            t.ok(vLine > 20, 'grid', 'internal vertical grid line drawn', `v px=${vLine}`);
            t.ok(hLine > 20, 'grid', 'internal horizontal grid line drawn', `h px=${hLine}`);
        }

        // 8) Image sized to its Grid cell renders at the cell size (designer auto-sizes a dropped
        //    Image to the cell it lands in — matching the "move into container" behaviour). The
        //    source's aspect ratio matches the cell (50x40 in a 100x80 cell) so Stretch=Uniform
        //    fills the cell exactly.
        {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-preview-gridimg-'));
            const assets = path.join(dir, 'Assets');
            fs.mkdirSync(assets, { recursive: true });
            fs.writeFileSync(path.join(assets, 'logo.png'), solidPng(50, 40, 220, 30, 30));
            fs.writeFileSync(path.join(dir, 'Proj.csproj'), '<Project Sdk="Microsoft.NET.Sdk"/>\n');
            const { frame } = await renderPng(host, W(
                `<Canvas><Grid x:Name="g8" Canvas.Left="100" Canvas.Top="100" Width="200" Height="160">
   <Grid.RowDefinitions><RowDefinition Height="*"/><RowDefinition Height="*"/></Grid.RowDefinitions>
   <Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions>
   <Image x:Name="img8" Source="avares://Proj/Assets/logo.png" Stretch="Uniform" Grid.Row="1" Grid.Column="1" Width="100" Height="80"/>
 </Grid></Canvas>`), 800, 450, dir);
            const gc = frame.gridCells && frame.gridCells.g8;
            t.ok(!!gc, 'grid-img', 'gridCells reported for g8');
            if (gc) {
                const col = Math.round(gc.v[1] - gc.v[0]); // cell (1,1) size = 100 x 80
                const row = Math.round(gc.h[1] - gc.h[0]);
                t.equal(JSON.stringify([col, row]), '[100,80]', 'grid-img', 'cell (1,1) is 100×80');
            }
            const imgCtrl = byName(frame, 'img8');
            t.ok(!!imgCtrl, 'grid-img', 'image reported');
            if (imgCtrl) {
                // image with Width/Height = cell size fills the cell
                t.equal(imgCtrl.parent, 'g8', 'grid-img', 'parent = g8');
                t.ok(near(imgCtrl.width, 100, 3) && near(imgCtrl.height, 80, 3), 'grid-img', 'renders at cell size',
                    `${imgCtrl.width.toFixed(0)}x${imgCtrl.height.toFixed(0)}`);
                t.ok(near(imgCtrl.x, 200, 3) && near(imgCtrl.y, 180, 3), 'grid-img', 'sits in cell (1,1)',
                    `x=${imgCtrl.x.toFixed(0)} y=${imgCtrl.y.toFixed(0)}`);
            }
        }

        // 9) Rotate (Angle): an Image.RenderTransform RotateTransform rotates the drawn image
        //    (Avalonia rotates around the element centre — a 90° turn of a 60x30 image at (100,100)
        //    makes the 30x60 result reach up to y=85, above the original top edge at y=100).
        {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-preview-rot-'));
            const assets = path.join(dir, 'Assets');
            fs.mkdirSync(assets, { recursive: true });
            fs.writeFileSync(path.join(assets, 'logo.png'), solidPng(60, 30, 220, 30, 30));
            fs.writeFileSync(path.join(dir, 'Proj.csproj'), '<Project Sdk="Microsoft.NET.Sdk"/>\n');
            const body = (xf) => W(
                `<Canvas><Image x:Name="imgRot" Canvas.Left="100" Canvas.Top="100" Source="avares://Proj/Assets/logo.png"${xf ? `>\n  ${xf}\n</Image>` : '/>'}</Canvas>`);
            const { frame, img } = await renderPng(host, body('<Image.RenderTransform><RotateTransform Angle="90"/></Image.RenderTransform>'), 800, 450, dir);
            t.ok(!frame.error, 'rotate', 'no render error', frame.error || '');
            const rc = byName(frame, 'imgRot');
            t.ok(!!rc, 'rotate', 'image reported');
            if (rc) {
                // the host reports the ROTATED bounding box (AABB), so the selection outline
                // surrounds the rotated image: a 90° turn of a 60x30 image = 30x60 centred at (130,115)
                t.ok(near(rc.width, 30, 3) && near(rc.height, 60, 3), 'rotate', 'rotated bounding box reported',
                    `${rc.width.toFixed(0)}x${rc.height.toFixed(0)}`);
                t.ok(near(rc.x, 115, 3) && near(rc.y, 85, 3), 'rotate', 'rotated bounds centred correctly',
                    `x=${rc.x.toFixed(0)} y=${rc.y.toFixed(0)}`);
            }
            const whole = countIn(img, 0, 800, 0, 450, (r, g, b) => r > 180 && g < 90 && b < 90);
            t.ok(whole > 1500, 'rotate', 'image still drawn (area preserved)', `red px=${whole}`);
            // rotated-only region: above the original top edge (y 85..100) — red when rotated, empty otherwise
            const topOnly = countIn(img, 110, 145, 85, 100, (r, g, b) => r > 180 && g < 90 && b < 90);
            t.ok(topOnly > 200, 'rotate', 'pixels rotated above the original top edge', `topOnly=${topOnly}`);
        }

        // 10) Shapes: Line/Rectangle/Ellipse/Arc render with correct bounds and draw their outline.
        //     The production snippets (ControlFactory) are the source of truth for the defaults.
        {
            const body = (xaml) => W(`<Canvas>${xaml}</Canvas>`);
            const dark = (r, g, b) => r < 160 && g < 160 && b < 160;

            // Line: Start/End points define its size (no Width/Height); bounds = geometry (120x80
            // at the Canvas position) and the stroke is drawn from the top-left to the bottom-right.
            {
                const sn = (await host.snippet('Line'));
                const { frame, img } = await renderPng(host, body(
                    sn.xaml.replace(/<([A-Za-z]+) /, '<$1 Canvas.Left="100" Canvas.Top="80" ')), 800, 450);
                t.ok(!frame.error, 'shapes', 'line renders without error', frame.error || '');
                const l = byName(frame, sn.name);
                t.ok(!!l, 'shapes', 'line reported');
                if (l) {
                    t.ok(near(l.x, 100) && near(l.y, 80), 'shapes', 'line position = canvas pos');
                    t.ok(near(l.width, 120, 2) && near(l.height, 80, 2), 'shapes', 'line size = geometry', `${l.width.toFixed(1)}x${l.height.toFixed(1)}`);
                }
                // stroke drawn along the box diagonal — the (1px, anti-aliased) line crosses the
                // whole box from (100,80) to (220,160), so the box contains a run of dark pixels
                t.ok(countIn(img, 100, 220, 80, 160, dark) > 40, 'shapes', 'line drawn across the box',
                    `line px=${countIn(img, 100, 220, 80, 160, dark)}`);
            }

            // Rectangle: black 1px outline + transparent fill; bounds = Width/Height.
            {
                const sn = (await host.snippet('Rectangle'));
                const { frame, img } = await renderPng(host, body(
                    sn.xaml.replace(/<([A-Za-z]+) /, '<$1 Canvas.Left="100" Canvas.Top="80" ')), 800, 450);
                t.ok(!frame.error, 'shapes', 'rectangle renders', frame.error || '');
                const r = byName(frame, sn.name);
                t.ok(!!r, 'shapes', 'rectangle reported');
                if (r) t.ok(near(r.width, 120, 2) && near(r.height, 80, 2), 'shapes', 'rectangle size');
                // outline dark on top/left edges, fill transparent (white inside)
                t.ok(countIn(img, 106, 114, 79, 81, dark) > 4, 'shapes', 'rectangle top edge drawn');
                t.ok(countIn(img, 99, 101, 86, 94, dark) > 4, 'shapes', 'rectangle left edge drawn');
                t.ok(countIn(img, 106, 114, 96, 104, (r, g, b) => r > 240 && g > 240 && b > 240) > 40,
                    'shapes', 'rectangle fill is transparent (white)');
            }

            // Ellipse: black outline + transparent fill; a square Ellipse (equal W/H) is a circle.
            {
                const sn = (await host.snippet('Ellipse'));
                const { frame, img } = await renderPng(host, body(
                    sn.xaml.replace(/<([A-Za-z]+) /, '<$1 Canvas.Left="100" Canvas.Top="80" ')), 800, 450);
                t.ok(!frame.error, 'shapes', 'ellipse renders', frame.error || '');
                const e = byName(frame, sn.name);
                t.ok(!!e, 'shapes', 'ellipse reported');
                if (e) t.ok(near(e.width, 100, 2) && near(e.height, 100, 2), 'shapes', 'ellipse size (circle)');
                // outline at the ellipse's top-centre and left-middle (the curve rounds away from
                // the box corners), transparent centre
                t.ok(countIn(img, 146, 154, 78, 82, dark) > 2, 'shapes', 'ellipse top drawn');
                t.ok(countIn(img, 98, 102, 126, 134, dark) > 2, 'shapes', 'ellipse left drawn');
                t.ok(countIn(img, 120, 180, 100, 160, (r, g, b) => r > 240 && g > 240 && b > 240) > 800,
                    'shapes', 'ellipse centre transparent (white)');
            }

            // Arc: stroked sweep (StartAngle 0 -> SweepAngle 270) within its box; centre stays white.
            {
                const sn = (await host.snippet('Arc'));
                const { frame, img } = await renderPng(host, body(
                    sn.xaml.replace(/<([A-Za-z]+) /, '<$1 Canvas.Left="100" Canvas.Top="80" ')), 800, 450);
                t.ok(!frame.error, 'shapes', 'arc renders', frame.error || '');
                const a = byName(frame, sn.name);
                t.ok(!!a, 'shapes', 'arc reported');
                if (a) t.ok(near(a.width, 100, 2) && near(a.height, 100, 2), 'shapes', 'arc size');
                // the 270° sweep draws dark pixels around the box edge (left edge + a corner curve)
                t.ok(countIn(img, 96, 104, 100, 160, dark) > 20, 'shapes', 'arc draws on the left edge',
                    `left px=${countIn(img, 96, 104, 100, 160, dark)}`);
                t.ok(countIn(img, 100, 200, 100, 180, (r, g, b) => r > 240 && g > 240 && b > 240) > 300,
                    'shapes', 'arc centre stays white (no fill)');
            }

            // Shapes render BEHIND other controls by default (Send to Back): the toolbox snippets
            // carry ZIndex="-1", which Avalonia honours in the paint order — verified here with two
            // overlapping opaque rectangles (a negative-Z shape loses to a later control, and a
            // later control with ZIndex="-1" ALSO loses to an earlier shape without one).
            {
                for (const tag of ['Line', 'Rectangle', 'Ellipse', 'Arc']) {
                    const sn = (await host.snippet(tag));
                    t.ok(sn.xaml.includes('ZIndex="-1"'), 'shapes-behind', `${tag} snippet carries ZIndex="-1"`);
                }
                const body = (xaml) => W(`<Canvas>${xaml}</Canvas>`);
                // red rect ZIndex=-1 (as placed) overlapping a later blue rect (no z) → BLUE on top
                {
                    const { frame, img } = await renderPng(host, body(
                        '<Rectangle x:Name="za" Canvas.Left="100" Canvas.Top="100" Width="100" Height="100" Fill="#E02020" ZIndex="-1"/>' +
                        '<Rectangle x:Name="zb" Canvas.Left="140" Canvas.Top="120" Width="100" Height="100" Fill="#2020E0"/>'), 800, 450);
                    t.ok(!frame.error, 'shapes-behind', 'z-order render ok', frame.error || '');
                    // overlap region x140..200 y120..200 → the LATER (blue) control wins
                    const blue = countIn(img, 145, 195, 125, 195, (r, g, b) => b > 180 && r < 90 && g < 90);
                    const red = countIn(img, 145, 195, 125, 195, (r, g, b) => r > 180 && g < 90 && b < 90);
                    t.ok(blue > 400 && red === 0, 'shapes-behind', 'shape with ZIndex=-1 renders behind a later control',
                        `blue=${blue} red=${red}`);
                }
                // red rect FIRST (no z), blue rect later with ZIndex="-1" → RED still on top
                {
                    const { frame, img } = await renderPng(host, body(
                        '<Rectangle x:Name="zc" Canvas.Left="100" Canvas.Top="100" Width="100" Height="100" Fill="#E02020"/>' +
                        '<Rectangle x:Name="zd" Canvas.Left="140" Canvas.Top="120" Width="100" Height="100" Fill="#2020E0" ZIndex="-1"/>'), 800, 450);
                    const blue = countIn(img, 145, 195, 125, 195, (r, g, b) => b > 180 && r < 90 && g < 90);
                    const red = countIn(img, 145, 195, 125, 195, (r, g, b) => r > 180 && g < 90 && b < 90);
                    t.ok(red > 400 && blue === 0, 'shapes-behind', 'ZIndex="-1" loses even to an earlier control',
                        `red=${red} blue=${blue}`);
                }
            }
        }

        // 11) Preview theme: the headless host can't see the OS colour scheme, so the render request
        //     carries the FluentTheme variant ('light'/'dark') — a "System"-themed form that the OS
        //     would show dark must NOT stay white in the designer. Empty canvas → theme background.
        {
            const empty = W('<Canvas Name="Body"/>');
            const light = await renderPng(host, empty, 800, 450, undefined, 'light');
            const dark = await renderPng(host, empty, 800, 450, undefined, 'dark');
            t.ok(!light.frame.error && !dark.frame.error, 'theme', 'no render error', light.frame.error || dark.frame.error || '');
            const lightBg = countIn(light.img, 0, 80, 0, 80, (r, g, b) => r > 200 && g > 200 && b > 200);
            const darkBg = countIn(dark.img, 0, 80, 0, 80, (r, g, b) => r < 90 && g < 90 && b < 90);
            t.ok(lightBg / 6400 > 0.85, 'theme', 'light theme renders a light design background', `light=${((lightBg / 6400) * 100).toFixed(0)}%`);
            t.ok(darkBg / 6400 > 0.85, 'theme', 'dark theme renders a dark design background (OS-dark echo)', `dark=${((darkBg / 6400) * 100).toFixed(0)}%`);
        }
    } finally {
        host.close();
    }
};
