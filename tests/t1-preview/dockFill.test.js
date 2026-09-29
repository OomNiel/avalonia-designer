/* T1 — a docked control must FILL the region the dock hands it.
 *
 * Why this exists (reported 2026-09-28, after the ProgressBar's Dock row shipped): *"The added Dock
 * property only docks horizontally (fills the width). It should fill vertically as well."* The dock
 * transform was writing the right dock, the right thickness and the right LastChildFill — and the
 * control still came out as a thin line, because every THEMED control carries a centred alignment in
 * its own ControlTheme: Avalonia's ProgressBar ships `VerticalAlignment=Center`, so a bar docked Left
 * was laid out as a 220x4 sliver floating in the middle of the column it had been given, and Dock=Fill
 * filled the width while staying 4 px tall.
 *
 * The XAML below is what the PANEL writes for each dock — the axis the dock hands the control is sized
 * (a band gets its Height, a column its Width) and the free axis is left to the container, which is
 * exactly where the missing alignment showed up. Pixels are not asserted: the LAYOUT BOUNDS are, since
 * that is what the user was looking at.
 */
'use strict';
const net = require('net');
const { startHost } = require('../helpers/host');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"';

function freePort() {
    return new Promise((res) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    });
}

/** A form whose root DockPanel is the dock region: 800x450 with a filling Body Canvas. */
const form = (inner) => `<Window ${NS}><DockPanel Name="Root" LastChildFill="True">${inner}<Canvas Name="Body"/></DockPanel></Window>`;
/** A bar as the designer drops it (host/ControlFactory: 220x12), with `extra` giving its dock/size. */
const bar = (extra) => `<ProgressBar x:Name="Bar1" Minimum="0" Maximum="100" Value="40" ${extra}/>`;

module.exports = async (t) => {
    t.section('dockFill');
    const host = await startHost(await freePort());
    /** The bounds of the control named Bar1 in one rendered form: "x,y wxh". */
    const bounds = async (xaml, name = 'Bar1') => {
        const frame = await host.render(xaml, 800, 450);
        if (frame.error) throw new Error('render error: ' + String(frame.error).slice(0, 200));
        const c = (frame.controls || []).find((x) => x.name === name);
        return c ? `${c.x},${c.y} ${c.width}x${c.height}` : '(none)';
    };

    try {
        // --- the theme is the reason the designer has to write the alignment -------------------------
        // Dock=Left as the panel writes it (Height dropped, Width is the thickness) but WITHOUT the
        // alignment: the bar is a 4 px sliver centred in the column it was given.
        t.equal(await bounds(form(bar('DockPanel.Dock="Left" Width="220"'))), '0,223 220x4', 'theme',
            'a bar docked Left by itself is a 220x4 sliver — its ControlTheme centres it');
        // Not a ProgressBar quirk: a themed Button collapses the same way, which is why the dock
        // transform — not the bar's own row — is where this had to be fixed.
        const plainButton = await bounds(form('<Button x:Name="Bar1" DockPanel.Dock="Left" Width="220"/>'));
        const buttonH = Number(String(plainButton).split('x')[1]);
        t.ok(/ 220x\d+$/.test(plainButton) && buttonH < 100, 'theme',
            'and it is not the bar alone: a themed Button docked Left collapses too', plainButton);

        // --- what the panel's Dock branch now writes -------------------------------------------------
        t.equal(await bounds(form(bar('DockPanel.Dock="Left" Width="220" VerticalAlignment="Stretch"'))),
            '0,0 220x450', 'dock',
            'Dock=Left + Stretch fills the whole height, keeping its width as the thickness');
        t.equal(await bounds(form(bar('DockPanel.Dock="Bottom" Height="24" HorizontalAlignment="Stretch"'))),
            '0,426 800x24', 'dock',
            'Dock=Bottom stays a 24 px band across the width — the axis the dock SIZES is untouched');
        t.equal(await bounds(form(bar('DockPanel.Dock="Top" Height="24" HorizontalAlignment="Stretch"'))),
            '0,0 800x24', 'dock',
            'and a Top-docked one is the same band at the top');
        // Fill is the one dock the panel writes by MOVING the control to the DockPanel's last child
        // slot (with LastChildFill=True), so that — and not a dock edge — is the XAML here.
        const fillForm = (attrs) => `<Window ${NS}><DockPanel Name="Root" LastChildFill="True">
            <Canvas Name="Body"/>
            ${bar(attrs)}
          </DockPanel></Window>`;
        t.equal(await bounds(fillForm('')), '0,223 800x4', 'dock',
            'Dock=Fill WITHOUT the alignment is the 4 px line the user reported (width only)');
        t.equal(await bounds(fillForm('VerticalAlignment="Stretch" HorizontalAlignment="Stretch"')),
            '0,0 800x450', 'dock',
            'with it, Fill takes the whole remaining region — both directions');
        // A bar left-docked (no Dock at all means Left inside a DockPanel) that keeps Stretch:
        // 200 is the bar's own desired width, 450 the region it now fills.
        t.equal(await bounds(form(bar('VerticalAlignment="Stretch"'))), '0,0 200x450', 'dock',
            'and an undocked bar in the same panel, stretched, fills the height it is given');

        // --- a TAB PAGE's body: the dock must land INSIDE the page, not inside its canvas ------------
        // Reported 2026-09-29: *"any control with a Dock property does not dock properly in the tab
        // canvas … If I delete the canvas from that page, controls like a splitpanel or a chart dock
        // fill properly."* A page body is a DockPanel whose last child is that free Canvas, so the dock
        // moves the control into the DockPanel IN FRONT of the Canvas. Measured here: the band spans
        // the page (776 of the 800 surface = its 12 px page padding) and the Canvas keeps the rest —
        // which is what a page's own body is for.
        const tabForm = () => `<Window ${NS}><TabControl x:Name="Tabs">
            <TabItem Header="Page 1"><DockPanel x:Name="Body1" LastChildFill="True">
              ${bar('DockPanel.Dock="Bottom" Height="24" HorizontalAlignment="Stretch"')}
              <Canvas x:Name="PageCanvas"/>
            </DockPanel></TabItem>
          </TabControl></Window>`;
        t.equal(await bounds(tabForm()), '12,426 776x24', 'tabpage',
            'a band docked in the page spans the page at its bottom edge');
        t.equal(await bounds(tabForm(), 'PageCanvas'), '12,50 776x376', 'tabpage',
            'and the page Canvas keeps everything above it (the page body still fills the page)');

        // --- the same bar in a Grid cell: the wrapper stays in the cell, the bar fills it ------------
        t.equal(await bounds(`<Window ${NS}><Grid>
            <DockPanel Name="D1" LastChildFill="False">
              ${bar('DockPanel.Dock="Left" Width="220" VerticalAlignment="Stretch"')}
            </DockPanel>
            <Canvas x:Name="Foot" Height="20"/>
          </Grid></Window>`), '0,0 220x450', 'gridcell',
            'inside a Grid cell the bar is a column of its own width that fills the cell top to bottom');
    } finally {
        host.close();
    }
};
