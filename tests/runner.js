#!/usr/bin/env node
/* Avalonia Designer test runner.
 * Discovers tests/**\/*.test.js, runs each (an async fn receiving a test context `t`),
 * records PASS/FAIL/SKIP per action and writes:
 *   tests/out/log.jsonl   — one JSON line per action
 *   tests/out/report.md   — human-readable report + summary
 * Exits 0 only when no action failed.
 *
 * Usage:  node tests/runner.js [--layer t1-preview] [--file compile] [--list]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --- ensure the compiled extension modules can find 'vscode' (stub) + test deps (jsdom) ---
// The stub lives in tests/stubs (NOT node_modules — npm prunes anything not in package.json).
process.env.NODE_PATH = [
    path.join(__dirname, 'stubs'),
    path.join(__dirname, 'node_modules'),
    process.env.NODE_PATH || ''
].filter(Boolean).join(path.delimiter);
require('module').Module._initPaths();

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(__dirname, 'out');
fs.mkdirSync(OUT_DIR, { recursive: true });

const LOG_PATH = path.join(OUT_DIR, 'log.jsonl');
const REPORT_PATH = path.join(OUT_DIR, 'report.md');

const args = process.argv.slice(2);
const layerFilter = args.indexOf('--layer') >= 0 ? args[args.indexOf('--layer') + 1] : null;
const fileFilter = args.indexOf('--file') >= 0 ? args[args.indexOf('--file') + 1] : null;
const listOnly = args.includes('--list');

function discoverTests() {
    const files = [];
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name === 'node_modules' || e.name === 'out' || e.name === 'helpers' || e.name === 'fixtures' || e.name === 'headless') continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.name.endsWith('.test.js')) files.push(p);
        }
    };
    walk(__dirname);
    return files.sort();
}

function layerOf(file) {
    const rel = path.relative(__dirname, file);
    return rel.split(path.sep)[0];
}

function makeContext(layer) {
    const results = [];
    const record = (result, feature, action, detail) => {
        const entry = { ts: new Date().toISOString(), layer, feature, action, result, detail: detail || '' };
        results.push(entry);
        return entry;
    };
    return {
        results,
        section: (name) => record('SECTION', name, '', ''),
        note: (detail) => record('NOTE', '', '', detail),
        pass: (feature, action, detail) => record('PASS', feature, action, detail),
        fail: (feature, action, detail) => record('FAIL', feature, action, detail),
        skip: (feature, action, detail) => record('SKIP', feature, action, detail),
        ok: (cond, feature, action, detail) => cond ? record('PASS', feature, action, detail) : record('FAIL', feature, action, detail),
        equal: (actual, expected, feature, action, detail) => {
            const a = JSON.stringify(actual), e = JSON.stringify(expected);
            return a === e
                ? record('PASS', feature, action, detail)
                : record('FAIL', feature, action, `${detail || ''} expected=${e} actual=${a}`);
        },
        throws: (fn, feature, action) => {
            try { fn(); record('FAIL', feature, action, 'expected an exception but none was thrown'); }
            catch { record('PASS', feature, action, 'threw as expected'); }
        },
        run: (cmd, opts) => { try { return { ok: true, output: execSync(cmd, { encoding: 'utf8', timeout: 300000, ...opts }) }; } catch (e) { return { ok: false, output: String(e.stdout || e.message) }; } }
    };
}

async function main() {
    const files = discoverTests()
        .filter((f) => !layerFilter || layerOf(f) === layerFilter)
        .filter((f) => !fileFilter || path.basename(f).includes(fileFilter));
    const all = [];
    const started = Date.now();

    if (listOnly) {
        for (const f of files) console.log(layerOf(f).padEnd(12), path.relative(__dirname, f));
        return;
    }

    for (const f of files) {
        const layer = layerOf(f);
        console.log(`\n=== [${layer}] ${path.basename(f)} ===`);
        const ctx = makeContext(layer);
        let error = null;
        try {
            await require(f)(ctx);
        } catch (e) {
            error = e;
            ctx.fail(path.basename(f, '.test.js'), 'test-file', `uncaught: ${e && e.stack ? e.stack : e}`);
        }
        all.push(...ctx.results);
        if (error) console.log('  !! test file threw:', error.message);
        const fails = ctx.results.filter((r) => r.result === 'FAIL').length;
        const passes = ctx.results.filter((r) => r.result === 'PASS').length;
        const skips = ctx.results.filter((r) => r.result === 'SKIP').length;
        console.log(`  -> ${passes} passed, ${fails} failed, ${skips} skipped`);
    }

    // ---- write log + report ----
    const summary = {
        runAt: new Date().toISOString(),
        durationMs: Date.now() - started,
        passed: all.filter((r) => r.result === 'PASS').length,
        failed: all.filter((r) => r.result === 'FAIL').length,
        skipped: all.filter((r) => r.result === 'SKIP').length,
        layers: [...new Set(all.map((r) => r.layer))]
    };
    fs.writeFileSync(LOG_PATH, all.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    const md = [];
    md.push('# Avalonia Designer — test report', '');
    md.push(`Run: ${summary.runAt} · ${(summary.durationMs / 1000).toFixed(1)}s · **${summary.passed} passed / ${summary.failed} failed / ${summary.skipped} skipped**`, '');
    for (const layer of summary.layers) {
        md.push(`## ${layer}`, '');
        for (const r of all.filter((x) => x.layer === layer)) {
            const icon = r.result === 'PASS' ? '✅' : r.result === 'FAIL' ? '❌' : r.result === 'SKIP' ? '⏭️' : '—';
            md.push(`- ${icon} **${r.result}** · ${r.feature}${r.action ? ' → ' + r.action : ''}${r.detail ? ' — ' + r.detail : ''}`);
        }
        md.push('');
    }
    fs.writeFileSync(REPORT_PATH, md.join('\n'), 'utf8');

    console.log(`\n========================================`);
    console.log(`TOTAL: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped (${(summary.durationMs / 1000).toFixed(1)}s)`);
    console.log(`Log: ${LOG_PATH}`);
    console.log(`Report: ${REPORT_PATH}`);
    process.exitCode = summary.failed > 0 ? 1 : 0;
}

main().catch((e) => { console.error('RUNNER ERROR', e); process.exit(1); });
