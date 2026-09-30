/* T1 — a control's own themed minimum beats the Height the user set.
 *
 * Why this exists (reported 2026-09-29): *"the Height adjustment property for the Command Bar control is
 * ignored. It is Top docked in my test app."* Nothing in the designer was ignoring it — the XAML in that
 * app really carries `Height="30"` — and the control really renders 48 tall, because **Avalonia's
 * `CommandBar` ControlTheme carries `MinHeight="48"`**, and in Avalonia a MINIMUM outranks an explicit
 * Height. The panel's Height row (which shows the *rendered* size, deliberately) therefore snapped back to
 * 48 and the row looked dead.
 *
 * Measured one control at a time against the REAL host, because a theme is not something to reason about:
 * `CommandBar` 48, `TextBox`/`ComboBox`/`CheckBox`/`NumericUpDown`/`MaskedTextBox` 32 (plus `MinWidth` 64),
 * `CommandBarButton`/`CommandBarToggleButton` 40, `CommandBarSeparator` 24 — and a plain `Button` has none,
 * which is why the bug looked like a CommandBar quirk.
 *
 * The fix is the one the designer makes: write the companion `MinHeight` equal to the value the user typed
 * (`sizeFloorCompanion` in `src/propertyCatalog.ts`). That is what the last two cases here prove — this file
 * is the *mechanism*; the rule and its write sites are pinned in `t2-logic/propertyCatalog.test.js`.
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

/** A form whose root DockPanel is the dock region: 800x400 with a filling Body Canvas. */
const form = (inner) => `<Window ${NS}><DockPanel Name="Root" LastChildFill="True"><Canvas Name="Body"/>${inner}</DockPanel></Window>`;
/** The control as the designer writes it when the user docks it to the top. */
const top = (tag, extra) => `<${tag} x:Name="C" DockPanel.Dock="Top" ${extra}/>`;

module.exports = async (t) => {
    t.section('sizeFloor');
    const host = await startHost(await freePort());
    /** The rendered height of the control named C, and the floor the host reports for it. */
    const probe = async (xaml) => {
        const frame = await host.render(xaml, 800, 400);
        if (frame.error) throw new Error('render error: ' + String(frame.error).slice(0, 200));
        const c = (frame.controls || []).find((x) => x.name === 'C');
        if (!c) return { h: -1, minH: -1, minW: -1, reportedH: '' };
        return {
            h: Math.round(c.height),
            minH: Number(c.values?.MinHeight ?? 0),
            minW: Number(c.values?.MinWidth ?? 0),
            reportedH: String(c.values?.Height ?? '')
        };
    };

    try {
        // --- the floor is real, and the host reports it as the control actually has it ----
        const bar30 = await probe(form(top('CommandBar', 'Height="30"')));
        t.equal(bar30.minH, 48, 'floor', 'the host reports the themed MinHeight of a CommandBar (48)');
        t.equal(bar30.h, 48, 'floor',
            'so Height="30" renders 48 tall — the report, reproduced: the number in the XAML is not the height on screen');
        const text10 = await probe(form(top('TextBox', 'Height="10"')));
        t.equal(text10.minH, 32, 'floor', 'a TextBox floors at 32 (and its MinWidth at 64)');
        t.equal(text10.minW, 64, 'floor', 'MinWidth is reported too — the same rule covers Width');
        t.equal(text10.h, 32, 'floor', 'so Height="10" on a TextBox renders 32 tall');
        const btn10 = await probe(form(top('Button', 'Height="10"')));
        t.equal(btn10.minH, 0, 'floor', 'a plain Button has no floor at all');
        t.equal(btn10.h, 10, 'floor', 'which is why the bug looked like a CommandBar quirk');
        const cmdBtn = await probe(form(top('CommandBarButton', 'Height="10"')));
        t.equal(cmdBtn.minH, 40, 'floor', 'the CommandBar buttons floor at 40 and the separator at 24 — measured, not assumed');

        // --- what the designer writes makes the user's number win --------------------------
        const fixed = await probe(form(top('CommandBar', 'Height="30" MinHeight="30"')));
        t.equal(fixed.h, 30, 'companion',
            'the companion MinHeight="30" the designer writes makes Height="30" mean 30');
        const cleared = await probe(form(top('CommandBar', 'Height="60"')));
        t.equal(cleared.h, 60, 'companion', 'and a height above the floor needs no companion at all');

        // --- the dock's own thickness may not ask for a size the control cannot have --------
        const dockThickness = await probe(form(top('CommandBar', 'Height="48"')));
        t.equal(dockThickness.h, 48, 'dock',
            'docking a CommandBar to the top gives it its own thickness (48), not the usual 24');
        const smallDock = await probe(form(top('CommandBar', 'Height="24"')));
        t.equal(smallDock.h, 48, 'dock',
            'a 24-pixel command bar cannot exist — which is why the dock writes max(24, floor) instead');
    } finally {
        await host.dispose?.();
    }
};
