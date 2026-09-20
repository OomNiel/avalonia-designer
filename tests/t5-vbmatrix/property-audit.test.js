/* PROPERTY AUDIT — runs every toolbox control's LISTED properties through the real property
 * writer (XamlModel.setProperty) and verifies each one actually lands in the saved XAML
 * (round-trip: apply -> serialize -> re-parse -> value present / derived XAML produced).
 *
 * A property that is LISTED (appears in the Properties panel via propertyDefsFor) but does NOT
 * round-trip is reported as FAIL with the control + key, and a consolidated LIST is printed at the
 * end so each one can be inspected and implemented (or removed) deliberately.
 *
 * COMPLIANCE / SKIPPING:
 *   Once every property of a control verifies cleanly, that control is marked COMPLIANT in
 *   tests/compliance.json and is SKIPPED on later runs (the run just notes it). A control is
 *   re-checked automatically when its property list changes (the signature is a hash of the
 *   listed keys+kinds), or when you force a full re-run:
 *       AVALONIA_COMPLIANCE_RESET=1 npm test          # or
 *       rm tests/compliance.json && npm test
 *
 * Listed-but-not-plain-XAML properties (designer editors such as Menu Items / Split Layout /
 * Rows / Columns / Items, code-behind bindings, the Anchor helper) are counted as 'managed' and
 * never serialised onto the element — they are not failures by design.
 */
'use strict';
const fs = require('fs');
const net = require('net');
const path = require('path');
const { XamlModel } = require('../../out/xamlModel.js');
const { propertyDefsFor, DEFAULTS } = require('../../out/propertyCatalog.js');
const { TOOLBOX_CATEGORIES, controlsForGroup } = require('../../out/toolboxProvider.js');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"';
const META_KEYS = new Set(['__name__', '__type__', '__theme__']);
// Listed properties that are NOT written as a plain attribute on the control (code-behind
// bindings / .adset / helper-backed). SplitPanelPaneBorder is a number-kind designer property
// (it writes the pane Borders, not the split element); chrome:AnchorHelper.Anchor needs the
// bundled helper + namespace, and is compile-checked by T5.
const MANAGED_KEYS = new Set([
    'Command', 'CommandParameter', 'SelectedItem', 'Items', 'ItemsSource', 'UndoRedoDepth',
    'SplitLayout', 'SplitPanelPaneBorder', 'Splitters', 'Rows', 'Columns', 'Series', 'Axis', 'Legend',
    'MenuItems', 'StatusItems', 'Grid.Defs', 'chrome:AnchorHelper.Anchor',
    'StatusDate.Date', 'StatusDate.Time', 'StatusDate.Preview'
]);
// Keys our writer stores as DERIVED XAML rather than an attribute of the same name.
const DERIVED_KEYS = new Set(['Angle', 'Radius']);
// XAML-form test values (not the Properties-panel display forms).
const VALUE_OVERRIDES = {
    Opacity: '0.5', Angle: '45', Radius: '8', PasswordChar: 'X', Text: 'Hello', Content: 'Hello',
    Header: 'Hello', Title: 'Hello', PlaceholderText: 'Hello', GroupName: 'Grp',
    FontFamily: 'Inter', StartPoint: '10,20', EndPoint: '110,80', Source: 'Assets/matrix.png',
    Icon: 'Assets/matrix.png', TitleBarIcon: 'Assets/matrix.png'
};
const COMPLIANCE_PATH = path.join(__dirname, '..', 'compliance.json');
const RESET = process.env.AVALONIA_COMPLIANCE_RESET === '1';

function auditValueFor(prop) {
    if (Object.prototype.hasOwnProperty.call(VALUE_OVERRIDES, prop.key)) return VALUE_OVERRIDES[prop.key];
    switch (prop.kind) {
        case 'dropdown': {
            const opts = prop.options || [];
            const def = DEFAULTS[prop.key];
            return opts.find((o) => o !== def) || opts[0] || 'True';
        }
        case 'color': return '#336699';
        case 'font': return 'Inter';
        case 'margin': return '6,6,6,6';
        case 'number': return '10';
        case 'file': return 'Assets/matrix.png';
        default: return 'Hello';
    }
}

/** The toolbox's placeable controls (excludes the DataSet / CustomTitleBar tools). */
function toolboxControls() {
    const seen = new Set(); const out = [];
    for (const cat of TOOLBOX_CATEGORIES) {
        for (const c of controlsForGroup(cat.group)) {
            if (!c.tag || c.tag === 'DataSet' || c.tag === 'CustomTitleBar') continue;
            if (seen.has(c.tag)) continue;
            seen.add(c.tag); out.push(c);
        }
    }
    return out;
}

/** Signature of a control's listed properties (keys + kinds) — changes when the list changes. */
function propSig(props) {
    const src = props.map((p) => `${p.key}:${p.kind}`).sort().join('|');
    let h = 5381;
    for (let i = 0; i < src.length; i++) h = ((h << 5) + h + src.charCodeAt(i)) >>> 0;
    return h.toString(16);
}

function loadCompliance() {
    try { return JSON.parse(fs.readFileSync(COMPLIANCE_PATH, 'utf8')); }
    catch { return { version: 1, controls: {} }; }
}
function saveCompliance(rec) {
    try { fs.mkdirSync(path.dirname(COMPLIANCE_PATH), { recursive: true }); fs.writeFileSync(COMPLIANCE_PATH, JSON.stringify(rec, null, 2)); }
    catch (e) { /* best-effort */ }
}

function freePort() {
    return new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
}

/** Apply one property in isolation and prove it survived a save round-trip. */
function roundTripOk(snippetXaml, name, prop, val) {
    try {
        const m = new XamlModel(`<Window ${NS} Width="800" Height="450"><Canvas Name="Body"/></Window>`);
        const el = m.addControl(m.findByName('Body'), snippetXaml, { x: 3, y: 5 });
        // Already carries the value (e.g. the snippet ships AutoGenerateColumns=True) — a no-op
        // write still proves the property is in place.
        if (el.getAttribute(prop.key) === String(val)) return { ok: true, reason: `already ${val}` };
        const before = m.serialize(true);
        m.setProperty(el, prop.key, val);
        const after = m.serialize(true);
        if (after === before) return { ok: false, reason: `writing '${val}' produced no XAML change` };
        const parsed = new XamlModel(after);
        const el2 = parsed.findByName(name);
        if (!el2) return { ok: false, reason: 'control lost after re-parse' };
        if (DERIVED_KEYS.has(prop.key)) {
            if (prop.key === 'Angle') {
                const ok = after.indexOf(`Angle="${val}"`) >= 0;
                return ok ? { ok: true, reason: 'derived' } : { ok: false, reason: 'Angle not written as a RotateTransform' };
            }
            if (prop.key === 'Radius') {
                const ok = after.indexOf(`RadiusX="${val}"`) >= 0 && after.indexOf(`RadiusY="${val}"`) >= 0;
                return ok ? { ok: true, reason: 'derived' } : { ok: false, reason: 'Radius not written as RadiusX/RadiusY' };
            }
        }
        const got = el2.getAttribute(prop.key);
        return got === String(val)
            ? { ok: true, reason: `applied=${val}` }
            : { ok: false, reason: `wrote '${val}' but re-parsed as ${JSON.stringify(got)}` };
    } catch (e) {
        return { ok: false, reason: `threw: ${e.message}` };
    }
}

module.exports = async (t) => {
    t.section('property-audit (all toolbox controls × all listed properties; compliance-skipping)');

    // Host gives us the PRODUCTION snippets, so the listed properties include the name-derived
    // editors (Menu Items on Menu1, Status Items on StatusBar1, Split Layout/Splitters on
    // SplitPanel1, Rows/Columns on DataGrid1, ...) exactly as the designer sees them.
    const { HOST_BIN } = require('../helpers/host');
    const { buildHost } = require('../helpers/build');
    if (!fs.existsSync(HOST_BIN)) buildHost();
    const host = await startHostProxy();
    const compliance = RESET ? { version: 1, controls: {} } : loadCompliance();
    const issues = [];
    let controlsRun = 0, controlsSkipped = 0, propsVerified = 0, propsManaged = 0;

    try {
        for (const c of toolboxControls()) {
            const r = await host.snippet(c.tag);
            if (!r || !r.name || !r.xaml) { t.fail(c.tag, 'audit', `no snippet: ${r && r.error}`); continue; }
            // Listed properties for this control (from a doc built with its own snippet).
            const probe = new XamlModel(`<Window ${NS}><Canvas Name="Body"/></Window>`);
            const probeEl = probe.addControl(probe.findByName('Body'), r.xaml, { x: 3, y: 5 });
            const props = propertyDefsFor(probeEl).filter((p) => !META_KEYS.has(p.key));
            const sig = propSig(props);

            if (!RESET && compliance.controls[c.tag] && compliance.controls[c.tag].sig === sig) {
                controlsSkipped++;
                t.note(`${c.tag}: compliant (${props.length} listed) — SKIPPED (reset with AVALONIA_COMPLIANCE_RESET=1)`);
                continue;
            }

            controlsRun++;
            const cIssues = [];
            let verified = 0, managed = 0;
            for (const p of props) {
                if (p.kind === 'button' || MANAGED_KEYS.has(p.key)) {
                    managed++;
                    continue; // designer editor / binding / helper — by design, not a plain attribute
                }
                const val = auditValueFor(p);
                const res = roundTripOk(r.xaml, r.name, p, val);
                if (res.ok) { verified++; }
                else { cIssues.push({ key: p.key, kind: p.kind, reason: res.reason }); }
            }
            propsVerified += verified;
            propsManaged += managed;
            if (cIssues.length === 0) {
                compliance.controls[c.tag] = { sig, date: new Date().toISOString().slice(0, 10), properties: props.length };
                t.pass(c.tag, 'audit', `${verified} verified + ${managed} designer-managed — marked COMPLIANT`);
            } else {
                for (const i of cIssues) {
                    t.fail(c.tag, `prop:${i.key}`, `${i.reason}`);
                    issues.push({ control: c.tag, key: i.key, kind: i.kind, reason: i.reason });
                }
                t.fail(c.tag, 'audit', `${cIssues.length} listed propert${cIssues.length === 1 ? 'y' : 'ies'} NOT verified`);
            }
        }
    } finally {
        host.close();
    }

    saveCompliance(compliance);

    t.note(`AUDIT: ${controlsRun} control(s) checked, ${controlsSkipped} compliant+skipped; ${propsVerified} properties verified, ${propsManaged} designer-managed.`);
    if (issues.length) {
        t.note('LISTED PROPERTIES NOT VERIFIED (inspect each — implement or remove):\n' +
            issues.map((i) => `  - ${i.control} → ${i.key} (${i.kind}): ${i.reason}`).join('\n'));
        t.note('Compliance NOT recorded for controls with failures. Reset anytime with: AVALONIA_COMPLIANCE_RESET=1 npm test');
    } else {
        t.note('No listed-but-broken properties. Compliance file: ' + COMPLIANCE_PATH);
    }
    t.note('property-audit done');
};

async function startHostProxy() {
    const { startHost } = require('../helpers/host');
    const port = await freePort();
    return startHost(port);
}
