/* T0 — Compile/build sanity: tsc, media JS syntax, C# host build.
 * These must pass before any other layer is meaningful. */
'use strict';
const fs = require('fs');
const path = require('path');
const { buildHost, ROOT } = require('../helpers/build');

module.exports = async (t) => {
    t.section('T0: compile & build sanity');

    // 1) TypeScript extension compile
    const ts = t.run('npm run compile', { cwd: ROOT });
    t.ok(ts.ok, 'tsc', 'npm run compile', ts.ok ? 'exit 0' : ts.output.slice(-600));
    const tsErrors = (ts.output.match(/error TS\d+/g) || []).length;
    t.equal(tsErrors, 0, 'tsc', 'no error TSxxxx', `found ${tsErrors}`);

    // 2) media/*.js syntax (designer.js + dataSet.js live in the webview, plain scripts)
    const mediaDir = path.join(ROOT, 'media');
    const mediaJs = fs.readdirSync(mediaDir).filter((f) => f.endsWith('.js'));
    t.ok(mediaJs.length > 0, 'media', 'script files present', mediaJs.join(', '));
    for (const f of mediaJs) {
        const r = t.run(`node --check "${path.join(mediaDir, f)}"`);
        t.ok(r.ok, 'node-check', f, r.ok ? 'syntax OK' : r.output.slice(-300));
    }

    // 3) C# PreviewerHost build (ground truth: dotnet build --no-incremental, 0 errors)
    const host = buildHost();
    t.ok(host.ok && host.errors === 0, 'host-build', 'dotnet build PreviewerHost', `errors=${host.errors} warnings=${host.warnings}`);
};
