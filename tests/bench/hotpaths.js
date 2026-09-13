#!/usr/bin/env node
/* Hot-path benchmark for the Avalonia Designer extension host.
 *
 * Not part of the test suite (the runner only discovers `*.test.js`). Run it by hand:
 *
 *     npm run bench              # human-readable table
 *     npm run bench -- --json    # machine-readable, for before/after comparison
 *
 * It measures the PURE, app-free functions that the refactor targets, so numbers are comparable
 * between runs without starting the previewer host or a webview:
 *
 *   serialize      XamlModel.serialize(forSave)          — re-serialises the whole document. Called
 *                                                          4–6× per single property edit today; the
 *                                                          Phase-2 fix memoises it behind a dirty flag.
 *   findByName     XamlModel.findByName × N             — O(N) because it rebuilds controlElements()
 *                                                          on every call, and render() calls it once
 *                                                          per control → O(N²) per frame.
 *   properties     propertyDefsFor × N + multiCommonProps — the property panel. multiCommonProps is
 *                                                          O(k²·m) over the selection.
 *   codeCheck      analyzeCodeBehind on a real temp project — the code-behind checker (sync file
 *                                                          reads + XAML parses + regex passes).
 *
 * Every benchmark reports ms/call; the aggregate line is what the phase summary quotes.
 */
'use strict';
const path = require('path');
process.env.NODE_PATH = [
    path.join(__dirname, '..', 'stubs'),
    path.join(__dirname, '..', 'node_modules'),
    process.env.NODE_PATH || ''
].filter(Boolean).join(path.delimiter);
require('module').Module._initPaths();

const fs = require('fs');
const os = require('os');

const asJson = process.argv.includes('--json');
const { XamlModel } = require('../../out/xamlModel.js');
const { propertyDefsFor, multiCommonProps } = require('../../out/propertyCatalog.js');
const { analyzeCodeBehind } = require('../../out/codeBehindCheck.js');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"';

/** A form with `n` named, positioned controls — roughly the shape a real medium-sized form has. */
function buildForm(n) {
    const rows = [];
    for (let i = 0; i < n; i++) {
        const x = (i % 10) * 70 + 8;
        const y = Math.floor(i / 10) * 40 + 8;
        rows.push(`    <Button x:Name="Button${i}" Canvas.Left="${x}" Canvas.Top="${y}" ` +
            `Width="64" Height="30" Content="B${i}"/>`);
    }
    return `<Window ${NS} x:Class="Proj.TestForm" Width="800" Height="600">
  <Canvas x:Name="Body" Width="800" Height="600">
${rows.join('\n')}
  </Canvas>
</Window>`;
}

function rows(n, indent) {
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push(`${indent}Private ReadOnly Property Button${i} As Button
${indent}    Get
${indent}        Return Me.FindControl(Of Button)("Button${i}")
${indent}    End Get
${indent}End Property`);
    }
    return out.join('\n');
}

function vbHandlers(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push(`    Private Sub Button${i}_Click(sender As Object, e As RoutedEventArgs)
    End Sub`);
    }
    return out.join('\n\n');
}

function makeCodeCheckProject(n) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-bench-'));
    const model = new XamlModel(buildForm(n));
    const axamlPath = path.join(dir, 'TestForm.axaml');
    fs.writeFileSync(axamlPath, model.serialize(false));
    // Every control wired, every handler present: the checker has real work to do and reports nothing.
    const wired = model.serialize(false).replace(/<Button x:Name="(Button\d+)"/g, '<Button x:Name="$1" Click="$1_Click"');
    fs.writeFileSync(axamlPath, wired);
    fs.writeFileSync(path.join(dir, 'TestForm.axaml.vb'), `Imports Avalonia.Controls
Imports Avalonia.Interactivity

Partial Public Class TestForm
    Inherits Window

    Public Sub New()
        InitializeComponent()
    End Sub

${rows(n, '    ')}

    Private Sub InitializeComponent()
    End Sub

${vbHandlers(n)}
End Class
`);
    return { dir, uri: require('vscode').Uri.file(axamlPath) };
}

function time(label, iters, fn) {
    fn(0);                                     // warm-up (JIT, first-parse caches)
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < iters; i++) fn(i);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    return { label, iters, ms, perMs: ms / iters };
}

async function timeAsync(label, iters, fn) {
    await fn(0);
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < iters; i++) await fn(i);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    return { label, iters, ms, perMs: ms / iters };
}

async function main() {
    const N = 200;                             // controls in the synthetic form
    const K = 12;                              // multi-selection size
    const results = [];

    const xml = buildForm(N);
    const model = new XamlModel(xml);
    const names = model.namedControls().map((c) => c.name);
    const els = names.map((nm) => model.findByName(nm)).filter(Boolean);

    results.push(time('serialize (full doc, 200 controls)', 20, () => model.serialize(false)));
    results.push(time('serialize forSave (200 controls)', 20, () => model.serialize(true)));
    results.push(time('findByName × N (200 lookups)', 5, () => {
        for (const nm of names) model.findByName(nm);
    }));
    results.push(time('propertyDefsFor × N (200 controls)', 3, () => {
        for (const el of els) propertyDefsFor(el);
    }));
    results.push(time(`multiCommonProps (${K} selected)`, 20, () => {
        multiCommonProps(els.slice(0, K));
    }));

    const proj = makeCodeCheckProject(80);
    const axamlText = fs.readFileSync(proj.uri.fsPath, 'utf8');
    // Two variants on purpose: the editor passes the in-memory model text, while the checker on its own
    // reads the .axaml from disk. The difference is the file-I/O share of the cost, which is what a
    // cache can remove — the rest is CPU inside the analyser.
    results.push(await timeAsync('analyzeCodeBehind (80 ctl VB, reads .axaml)', 3, async () => {
        await analyzeCodeBehind(proj.uri, {});
    }));
    results.push(await timeAsync('analyzeCodeBehind (80 ctl VB, text in memory)', 3, async () => {
        await analyzeCodeBehind(proj.uri, { axamlText });
    }));

    const totalMs = results.reduce((a, r) => a + r.ms, 0);
    if (asJson) {
        console.log(JSON.stringify({ n: N, k: K, totalMs, results }, null, 2));
        return;
    }
    console.log(`\nHot-path benchmark — form with ${N} controls, ${K}-control multi-selection\n`);
    console.log('  ' + 'benchmark'.padEnd(42) + 'iters'.padStart(6) + 'total ms'.padStart(11) + 'ms/call'.padStart(11));
    console.log('  ' + '-'.repeat(70));
    for (const r of results) {
        console.log('  ' + r.label.padEnd(42) + String(r.iters).padStart(6) +
            r.ms.toFixed(1).padStart(11) + r.perMs.toFixed(3).padStart(11));
    }
    console.log('  ' + '-'.repeat(70));
    console.log('  ' + 'TOTAL wall clock'.padEnd(42) + ''.padStart(6) + totalMs.toFixed(1).padStart(11));
    console.log('\n  (findByName is O(N) per call because it rebuilds controlElements(); the ×N row');
    console.log('   is therefore the O(N²) shape render() hits once per frame.)\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
