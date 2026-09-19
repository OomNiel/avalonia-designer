/* T1 — a chart's colour properties must survive the preview host as NAMED colours.
 *
 * Why this exists: `XamlRenderer.ConvertValue` prefixed '#' onto any Color value that did not already
 * start with one. "White" therefore became "#White", `Color.Parse` threw, and the catch returned
 * Colors.Transparent — so a chart with TitleColor="White" drew its title INVISIBLY in the Designer
 * while the running app (which uses the real XAML loader) showed it perfectly. Reported by the user as
 * "the chart title renders correctly at runtime but is invisible during design time".
 *
 * The check renders a chart whose plate is a NAMED colour ("Black") and whose title is another
 * ("White"), then measures the title strip: with the bug the plate is transparent (the window's white
 * shows through) and no glyph pixels exist. A bare-hex plate is also rendered, so the fix cannot
 * regress the other direction (the panel can drop the '#' from a hex value).
 */
'use strict';
const net = require('net');
const fs = require('fs');
const { startHost, renderPng, HOST_BIN } = require('../helpers/host');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" '
    + 'xmlns:charts="using:AvaloniaCharts"';
const CHART_W = 300;
const CHART_H = 180;

/** A form with one chart at 0,0, so the top strip is at a known place in the image. */
const W = (attrs) => `<Window ${NS} Title="chart" Width="320" Height="200">
  <Canvas Name="Holder" Width="320" Height="200">
    <charts:GrumpyXYPlot x:Name="Chart1" Width="${CHART_W}" Height="${CHART_H}" Points="0,2 1,5 2,3" ${attrs}/>
  </Canvas>
</Window>`;

function freePort() {
    return new Promise((res) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    });
}

/** Counts dark and light pixels inside the chart's title strip (below the frame edge, above the plot). */
function strip(img) {
    let dark = 0;
    let light = 0;
    let total = 0;
    for (let y = 3; y < 20; y++) {
        for (let x = 6; x < CHART_W - 6; x++) {
            const i = (y * img.width + x) * 4;
            const [r, g, b] = [img.data[i], img.data[i + 1], img.data[i + 2]];
            total++;
            if (r < 90 && g < 90 && b < 90) dark++;
            else if (r > 200 && g > 200 && b > 200) light++;
        }
    }
    return { dark, light, total };
}

module.exports = async (t) => {
    t.section('charts: named colours');

    if (!fs.existsSync(HOST_BIN)) {
        t.note('host binary missing — skipping (build the host first)');
        return;
    }

    const host = await startHost(await freePort());
    try {
        // A NAMED plate colour: the strip must actually be painted dark. With the '#White'-style bug
        // the plate came out Transparent and the strip stayed the window's white.
        const black = await renderPng(host, W('PlotBackColor="Black" GridStyle="Dot"'), 320, 200);
        const sBlack = strip(black.img);
        t.ok(!black.frame.error, 'chart-colors', 'a chart with a named plate colour renders', black.frame.error || '');
        t.ok(sBlack.dark > sBlack.total * 0.8, 'chart-colors',
            'PlotBackColor="Black" really paints the title strip dark',
            `dark=${sBlack.dark}/${sBlack.total} light=${sBlack.light}`);

        // A NAMED title colour AND the title itself: glyph pixels must appear in that strip.
        const titled = await renderPng(host,
            W('PlotBackColor="Black" Title="Named" ShowTitle="True" TitleColor="White" GridStyle="Dot"'), 320, 200);
        const sTitled = strip(titled.img);
        t.ok(sTitled.light > 20, 'chart-colors',
            'TitleColor="White" draws visible title glyphs on the plate',
            `light=${sTitled.light} (dark=${sTitled.dark})`);

        // The other direction: a bare hex (the panel can strip the '#') must still parse.
        const hex = await renderPng(host, W('PlotBackColor="413e3e" GridStyle="Dot"'), 320, 200);
        const sHex = strip(hex.img);
        t.ok(sHex.dark > sHex.total * 0.8, 'chart-colors',
            'a bare hex plate colour ("413e3e") still parses',
            `dark=${sHex.dark}/${sHex.total}`);
    } finally {
        host.close();
    }
};
