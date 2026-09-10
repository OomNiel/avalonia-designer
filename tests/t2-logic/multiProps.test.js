/* T2 — multi-select common-property logic (propertyCatalog.multiCommonProps):
 * when several controls are selected, only properties every control supports are listed; a value is
 * shown only when all selected controls agree (differing values -> empty + flagged `mixed`). */
'use strict';
const { XamlModel } = require('../../out/xamlModel.js');
const { multiCommonProps } = require('../../out/propertyCatalog.js');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"';

module.exports = async (t) => {
    t.section('multi-select common properties');

    function docWith() {
        const m = new XamlModel(`<Window ${NS} Width="800" Height="450"><Canvas Name="Body"/></Window>`);
        return { m, body: m.findByName('Body') };
    }

    // Two Buttons with the SAME Background but DIFFERENT Padding.
    const a = docWith();
    const b1 = a.m.addControl(a.body, '<Button x:Name="Button1" Content="One" Background="#336699"/>', { x: 10, y: 10 });
    const b2 = a.m.addControl(a.body, '<Button x:Name="Button2" Content="Two" Background="#336699" Padding="4"/>', { x: 200, y: 10 });
    const rows = multiCommonProps([b1, b2]);
    const by = (k) => rows.find((r) => r.key === k);

    t.ok(by('Background'), 'common', 'Background common to two Buttons');
    t.equal(by('Background').value, '#336699', 'common', 'identical Background value shown');
    t.ok(by('Padding'), 'common', 'Padding common to two Buttons');
    t.equal(by('Padding').value, '', 'common', 'differing Padding shows an empty box');
    t.equal(by('Padding').mixed, true, 'common', 'differing Padding flagged mixed');
    t.ok(!by('__name__') && !by('__type__'), 'common', 'name/type excluded from multi rows');
    t.ok(!by('DockPanel.Dock') && !by('Grid.Row'), 'common', 'dock/grid-cell placement excluded');
    t.ok(by('Width'), 'common', 'size & position included (Width)');
    t.ok(by('Margin'), 'common', 'size & position included (Margin)');

    // A Button + a Panel share Background but NOT Content (intersection drops it).
    const c = docWith();
    const pb = c.m.addControl(c.body, '<Button x:Name="PB" Content="B"/>', { x: 10, y: 10 });
    const pp = c.m.addControl(c.body, '<Panel x:Name="PP" Background="Red"/>', { x: 200, y: 10 });
    const rows2 = multiCommonProps([pb, pp]);
    const by2 = (k) => rows2.find((r) => r.key === k);
    t.ok(by2('Background'), 'mix', 'Background common across Button + Panel');
    t.ok(!by2('Content'), 'mix', 'Content NOT offered when a Panel is selected too (intersection)');
    t.equal(by2('Background').value, '', 'mix', 'differing Background (theme default vs Red) is empty');
    t.equal(by2('Background').mixed, true, 'mix', 'differing Background flagged mixed');

    // Both unset (theme default) reads as IDENTICAL -> not mixed.
    const d = docWith();
    const db1 = d.m.addControl(d.body, '<Button x:Name="DB1" Content="x"/>', { x: 10, y: 10 });
    const db2 = d.m.addControl(d.body, '<Button x:Name="DB2" Content="y"/>', { x: 200, y: 10 });
    const bg = multiCommonProps([db1, db2]).find((r) => r.key === 'Background');
    t.ok(bg, 'defaults', 'Background present for two unset Buttons');
    t.equal(bg.mixed, false, 'defaults', 'both unset (theme default) -> identical, not mixed');

    // Theme row: 'Custom' when every control sets a colour, 'System' when none does.
    const theme1 = multiCommonProps([b1, b2]).find((r) => r.key === '__theme__');
    t.equal(theme1 && theme1.value, 'Custom', 'theme', 'both coloured -> Custom shown');
    const theme2 = multiCommonProps([db1, db2]).find((r) => r.key === '__theme__');
    t.equal(theme2 && theme2.value, 'System', 'theme', 'neither coloured -> System shown');
};
