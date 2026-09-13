/* T2 — the code-behind check's event knowledge vs the generated event catalog.
 *
 * These are RED-FIRST tests for two real defects (fixed in refactor Phase 1):
 *
 *  1. Rule 4 ("handler signature doesn't match the event") compared the wired event against the
 *     tag-BLIND `EVENT_ARGS[e.event] ?? KNOWN_EVENT_ARGS[e.event]`, while the code WRITER uses the
 *     tag-AWARE `eventArgsFor(event, tag)` — which consults `EVENT_ARGS_BY_CONTROL`. Where a control
 *     overrides the EventArgs (Window.Opened = System.EventArgs, NumericUpDown.ValueChanged =
 *     NumericUpDownValueChangedEventArgs, DatePicker.SelectedDateChanged =
 *     DatePickerSelectedValueChangedEventArgs) the checker therefore demanded a DIFFERENT type than
 *     the one it had just generated, and published `fix-handler-signature` as an ERROR in PROBLEMS
 *     on perfectly correct, freshly generated code. The offered fix rewrote the signature to the
 *     same wrong text, so it could never converge.
 *
 *  2. `axamlFacts` recognises an event attribute only via its own hand-written `EVENTS` Set. Any
 *     event the picker OFFERS but that Set omits (DatePicker.SelectedDateChanged,
 *     NumericUpDown.Spinned, CalendarDatePicker.CalendarOpened, …) is invisible to the check: a
 *     handler the form wires but that does not exist is never reported (the XAML compiler fails
 *     with "no accessible method matches" and the designer stays silent).
 *
 * The tests assert BOTH directions — the correct signature is accepted AND the wrong one is still
 * rejected — so an "everything is fine" result cannot be the vacuous kind that comes from the event
 * simply not being recognised at all.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Uri } = require('vscode');
const { analyzeCodeBehind, axamlFacts } = require('../../out/codeBehindCheck.js');
const { EVENTS_BY_CONTROL, GENERIC_EVENTS, eventArgsFor } = require('../../out/controlEvents.js');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"';

let seq = 0;
function makeProject(axaml, codeFile, code) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `adb-ccevents-${seq++}-`));
    const axamlPath = path.join(dir, 'TestForm.axaml');
    fs.writeFileSync(axamlPath, axaml);
    fs.writeFileSync(path.join(dir, codeFile), code);
    return { dir, uri: Uri.file(axamlPath) };
}

const csClass = (handlers) => `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    public TestForm()
    {
        InitializeComponent();
    }
${handlers}
}
`;

const csHandler = (name, args) => `    private void ${name}(object sender, ${args} e)
    {
    }
`;

const kinds = (r) => r.issues.map((i) => i.kind);
const countOf = (r, kind) => kinds(r).filter((k) => k === kind).length;
const shortName = (full) => full.split('.').pop();

module.exports = async (t) => {
    t.section('T2: code-behind check — event signatures & recognition');

    // ---------- 1) the tag-AWARE EventArgs is accepted for every per-control override ----------
    const overrides = [
        { tag: 'Window', event: 'Opened', host: null },
        { tag: 'NumericUpDown', event: 'ValueChanged' },
        { tag: 'DatePicker', event: 'SelectedDateChanged' }
    ];

    for (const { tag, event, host } of overrides) {
        const want = eventArgsFor(event, tag);
        const blind = eventArgsFor(event);           // what the checker used to demand
        const handler = `Ctl1_${event}`;
        const element = `<${tag} x:Name="Ctl1" ${event}="${handler}"/>`;
        const axaml = `<Window ${NS} x:Class="Proj.TestForm" Width="800" Height="450">
  <Canvas Name="Body">
    ${element}
  </Canvas>
</Window>`;

        // The override must actually differ from the fallback, otherwise this case proves nothing.
        t.ok(want !== blind, `override/${tag}.${event}`,
            `the catalog really does override the EventArgs`,
            `${tag}.${event}: ${want} vs fallback ${blind}`);

        // (a) the signature the designer itself would write must NOT be reported
        const good = makeProject(axaml, 'TestForm.axaml.cs', csClass(csHandler(handler, want)));
        const rGood = await analyzeCodeBehind(good.uri, {});
        t.equal(countOf(rGood, 'fix-handler-signature'), 0, `override/${tag}.${event}`,
            'the generated signature is accepted (no phantom "wrong parameter type")',
            `expected ${shortName(want)}`);

        // (b) …while a genuinely wrong signature is still caught (the rule is not simply skipped).
        // `object` rather than another EventArgs type: the checker matches the expected SHORT name
        // (`EventArgs`, `…ValueChangedEventArgs`) with a substring test, so any real `*EventArgs`
        // type would satisfy it by accident and prove nothing.
        const bad = makeProject(axaml, 'TestForm.axaml.cs', csClass(csHandler(handler, 'object')));
        const rBad = await analyzeCodeBehind(bad.uri, {});
        t.ok(countOf(rBad, 'fix-handler-signature') === 1,
            `override/${tag}.${event}`,
            'a wrong parameter type is still reported',
            `got ${JSON.stringify(kinds(rBad))}`);
    }

    // ---------- 2) every event the picker can offer is recognised by the checker ----------
    // Skips the override cases above only when they are genuinely unrecognisable today; the point is
    // that the two lists cannot drift apart unnoticed.
    const unrecognised = [];
    const check = (tag, events) => {
        for (const ev of events) {
            const handler = `Ctl1_${ev}`;
            const axaml = `<Window ${NS}>
  <${tag} x:Name="Ctl1" ${ev}="${handler}"/>
</Window>`;
            const facts = axamlFacts(Uri.file('/tmp/probe.axaml'), axaml);
            if (!facts.events.some((e) => e.event === ev && e.handler === handler)) {
                unrecognised.push(`${tag}.${ev}`);
            }
        }
    };
    for (const [tag, events] of Object.entries(EVENTS_BY_CONTROL)) check(tag, events);
    // Control types with no curated list fall back to the generic list, so that must hold too.
    check('Button', GENERIC_EVENTS);

    // The hand-written list that used to live in codeBehindCheck.ts, kept here as the "must keep
    // working" baseline: deriving recognition from the catalog must not lose a single name.
    const LEGACY = [
        'Click', 'DoubleTapped', 'Tapped', 'Loaded', 'Unloaded', 'Initialized', 'AttachedToVisualTree',
        'DetachedFromVisualTree', 'SelectionChanged', 'SelectionChanging', 'IsCheckedChanged',
        'TextChanged', 'TextChanging', 'KeyDown', 'KeyUp', 'GotFocus', 'LostFocus', 'PointerPressed',
        'PointerReleased', 'PointerMoved', 'PointerEntered', 'PointerExited', 'PointerWheelChanged',
        'Checked', 'Unchecked', 'Indeterminate', 'ValueChanged', 'Opened', 'Closed', 'Opening',
        'Closing', 'Tick', 'DataContextChanged', 'SizeChanged', 'LayoutUpdated', 'ScrollChanged',
        'DropDownOpened', 'DropDownClosed', 'ItemsSourceChanged', 'EffectiveViewportChanged',
        'PropertyChanged', 'ActualThemeVariantChanged', 'Holding', 'ContextRequested'
    ];
    check('Button', LEGACY);

    t.equal(unrecognised, [], 'catalog',
        'every event the picker offers — and every name that used to be recognised — is an event',
        `${unrecognised.length} unrecognised`);

    // ---------- 3) an offered event with no handler must be reported ----------
    const wired = 'Dp1_SelectedDateChanged';
    const dpAxaml = `<Window ${NS} x:Class="Proj.TestForm" Width="800" Height="450">
  <Canvas Name="Body">
    <DatePicker x:Name="Dp1" SelectedDateChanged="${wired}"/>
  </Canvas>
</Window>`;
    const dp = makeProject(dpAxaml, 'TestForm.axaml.cs', csClass(''));
    const rDp = await analyzeCodeBehind(dp.uri, {});
    t.ok(countOf(rDp, 'insert-handler') === 1, 'missing-handler',
        'DatePicker.SelectedDateChanged with no handler is reported',
        `got ${JSON.stringify(kinds(rDp))}`);
    const reported = rDp.issues.find((i) => i.kind === 'insert-handler');
    t.equal(reported && reported.member, wired, 'missing-handler', 'and it names the wired handler');

    // A DatePicker handler that DOES exist is not reported (guard against over-reporting).
    const okAxaml = dpAxaml.replace('x:Class="Proj.TestForm"', 'x:Class="Proj.TestForm"');
    const ok = makeProject(okAxaml, 'TestForm.axaml.cs',
        csClass(csHandler(wired, eventArgsFor('SelectedDateChanged', 'DatePicker'))));
    const rOk = await analyzeCodeBehind(ok.uri, {});
    t.equal(countOf(rOk, 'insert-handler'), 0, 'missing-handler',
        'an existing handler is not reported as missing');
    t.equal(countOf(rOk, 'fix-handler-signature'), 0, 'missing-handler',
        'and its DatePicker signature is accepted');
};
