/* T2 — marketplace packaging: the things a store review (and a first-run user) notices.
 *
 * These are all facts about files shipped in the repo, so they are asserted at source level. The
 * point is that the release stays reproducible and the package stays clean as the code grows: the
 * VSIX itself is verified by the CI workflow's packaging step. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const has = (rel) => fs.existsSync(path.join(ROOT, rel));

module.exports = async (t) => {
    t.section('T2: marketplace packaging');

    const pkg = JSON.parse(read('package.json'));
    const ignore = read('.vscodeignore');

    // ---------- 1) the manifest carries what both marketplaces require ----------
    for (const key of ['name', 'displayName', 'description', 'publisher', 'license', 'icon', 'main', 'version']) {
        t.ok(typeof pkg[key] === 'string' && pkg[key].length > 0, 'manifest', `package.json sets "${key}"`);
    }
    t.ok(!!pkg.repository && /^https:\/\/github\.com\//.test(pkg.repository.url), 'manifest',
        'the repository is a public URL (drives the Marketplace "Repository" link)');
    t.ok(!!pkg.bugs && !!pkg.bugs.url, 'manifest', 'and an issue tracker is declared');
    t.ok(!!pkg.homepage, 'manifest', 'a homepage is declared');
    t.ok((pkg.categories || []).length > 0, 'manifest', 'the extension declares at least one category');
    t.ok((pkg.keywords || []).length >= 5, 'manifest', 'and search keywords');
    t.ok(/^\^\d+\.\d+\.\d+$/.test(pkg.engines.vscode), 'manifest', 'the VS Code engine range is pinned');
    t.ok(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version), 'manifest', 'the version is valid semver');
    t.ok(has(pkg.main.replace(/^\.\//, '')), 'manifest', 'the declared entry point exists (out/extension.js, tsc output)');
    t.ok(has(pkg.icon), 'manifest', 'the declared icon file exists (vsce refuses to package without it)');

    // ---------- 2) activation: from contributions, not on every window start ----------
    t.equal(pkg.activationEvents, [], 'activation',
        'the extension does not activate on start-up (activationEvents is empty)');
    t.ok(JSON.stringify(pkg.activationEvents).includes('onStartupFinished') === false, 'activation',
        'in particular it does not slow down every VS Code start');
    const contrib = pkg.contributes || {};
    const implicit = (contrib.commands || []).length + (contrib.customEditors || []).length
        + Object.keys((contrib.viewsContainers || {}).activitybar || {}).length;
    t.ok(implicit > 0, 'activation',
        'which is safe because contributed commands/views/custom editors activate it on demand');
    t.ok((contrib.customEditors || []).length >= 1, 'activation', 'the AXAML designer is a custom editor');

    // ---------- 3) the icon really is a Marketplace-grade PNG (>= 128x128) ----------
    const png = fs.readFileSync(path.join(ROOT, pkg.icon));
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    t.ok(png.slice(0, 8).equals(signature), 'icon', 'the icon is a real PNG (not a renamed JPEG)');
    const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
    t.ok(w >= 128 && h >= 128, 'icon', `the icon is large enough (${w}x${h}, the minimum is 128x128)`);

    // ---------- 4) licence ----------
    t.equal(pkg.license, 'MIT', 'licence', 'the manifest declares the licence');
    t.ok(has('LICENSE'), 'licence', 'and the licence file is in the repo (and in the package)');
    t.ok(/MIT License/.test(read('LICENSE')), 'licence', 'and it really is MIT text');

    // ---------- 5) packaging hygiene: dev-only files must not reach the VSIX ----------
    t.ok(/^\.poolside\/\*\*/m.test(ignore), 'packaging', 'local tool state (.poolside) is excluded');
    t.ok(has('.poolside/settings.local.yaml'), 'packaging', '…and that file does exist, so the rule matters');
    t.ok(/^tests\/\*\*/m.test(ignore), 'packaging', 'the test suite is excluded');
    t.ok(/^tsconfig\.json$/m.test(ignore), 'packaging', 'build metadata (tsconfig.json) is excluded');
    t.ok(/^GrumpyWhite\.png$/m.test(ignore), 'packaging',
        'unreferenced artwork is excluded (nothing shipped loads GrumpyWhite.png)');
    t.ok(/^NOTES\.md$/m.test(ignore) && /^SESSION\.md$/m.test(ignore), 'packaging',
        'developer notes stay out of the package');
    t.ok(/^README\.md/m.test(ignore) === false && /^CHANGELOG\.md/m.test(ignore) === false, 'packaging',
        'while README and CHANGELOG DO ship (the Marketplace renders them)');
    // vsce does NOT use gitignore's "last match wins": a negated pattern (`!x`) beats every ignore
    // pattern wherever it sits (collectFiles() in vsce's package.js). So the maps can only stay out
    // if nothing negates out/ as a whole — a `!out/**` puts all ~30 of them straight back in.
    t.ok(/^\*\*\/\*\.map$/m.test(ignore), 'packaging', 'source maps are excluded');
    t.ok(/^\s*!out\/\*\*\s*$/m.test(ignore) === false, 'packaging',
        'and out/ is never negated as a whole (that would ship the source maps again)');
    t.ok(/^\s*!out\/\*\*\/\*\.js\s*$/m.test(ignore), 'packaging',
        'only the compiled JS is re-included (in case a future pattern tries to drop out/)');

    // ---------- 6) release plumbing ----------
    t.ok(has('.github/workflows/ci.yml'), 'ci', 'a CI workflow builds on every push');
    const ci = read('.github/workflows/ci.yml');
    t.ok(/npm ci/.test(ci), 'ci', 'installing from the lockfile (reproducible)');
    t.ok(/npm run compile/.test(ci), 'ci', 'compiling the extension');
    t.ok(/node tests\/runner\.js --layer t2-logic/.test(ci) && /node tests\/runner\.js --layer t3-webview/.test(ci),
        'ci', 'running the two layers that need no .NET SDK');
    t.ok(/npm run package/.test(ci), 'ci', 'and proving the extension still packages');
    t.ok(/node tests\/runner\.js\b/.test(ci), 'ci', 'the full .NET-dependent suite is available on demand');
    t.ok(/if:.*workflow_dispatch/.test(ci), 'ci',
        'the heavy job only runs when asked, so a push cannot go red for runner-image reasons');

    t.ok(has('.github/workflows/release.yml'), 'release', 'a release workflow exists');
    const rel = read('.github/workflows/release.yml');
    t.ok(/workflow_dispatch/.test(rel), 'release', 'and it is started by hand (a version number is one-way)');
    t.ok(/--pre-release/.test(rel), 'release', 'it can publish pre-releases (the current 1.0.0-beta line)');
    t.ok(/VSCE_PAT/.test(rel), 'release', 'it uses a Marketplace token from the repository secrets');
    t.ok(/node tests\/runner\.js/.test(rel), 'release', 'it runs the full suite');
    t.ok(rel.indexOf('node tests/runner.js') < rel.indexOf('--pre-release'), 'release',
        'and that suite runs BEFORE anything is published');
    t.ok(/dry_run/.test(rel), 'release', 'a dry run packages without publishing');
    for (const script of ['package', 'publish:pre', 'publish:stable']) {
        t.ok(!!pkg.scripts[script], 'release', `npm run ${script} is available`);
    }
    t.ok(/@vscode\/vsce@\d/.test(pkg.scripts['publish:pre'] || ''), 'release',
        'the publish script pins the vsce version (a release must be reproducible)');
    t.ok(pkg.scripts['vscode:prepublish'].includes('compile'), 'release',
        'packaging always compiles first (vsce runs vscode:prepublish)');
    // The maintainer guide and the workflow have to agree: a renamed secret would only fail at
    // publish time, which is the worst moment to find out.
    t.ok(has('PUBLISHING.md'), 'release', 'the publisher/PAT walkthrough is in the repo');
    const guide = read('PUBLISHING.md');
    t.ok(/VSCE_PAT/.test(guide), 'release', 'and names the same secret the workflow reads (VSCE_PAT)');
    t.ok(/Marketplace/.test(guide) && /Manage/.test(guide), 'release',
        'including the PAT scope that actually grants publishing');
    t.ok(/verify-pat/.test(guide), 'release', 'and the pre-flight command that tests a token first');
    t.ok(/^PUBLISHING\.md$/m.test(ignore), 'packaging', 'the maintainer guide stays out of the VSIX');
    t.ok(/^\.github\/\*\*$/m.test(ignore), 'packaging',
        'and so does repo infrastructure (.github: CI workflows + issue templates)');

    // ---------- 7) first-run friendliness: name the missing .NET SDK ----------
    const host = read('src/hostClient.ts');
    const panel = read('src/designerPanel.ts');
    t.ok(/DOTNET_SDK_MISSING_MESSAGE/.test(host), 'first-run', 'a missing .NET SDK has a dedicated message');
    t.ok(/dotnet\.microsoft\.com\/download/.test(host), 'first-run', 'which says where to get it');
    t.ok(/isMissingExecutable/.test(host) && /ENOENT/.test(host), 'first-run',
        'the raw "spawn dotnet ENOENT" is recognised and replaced');
    t.ok(/throw new Error\(DOTNET_SDK_MISSING_MESSAGE\)/.test(host), 'first-run',
        'the friendly message is what propagates to the UI');
    t.ok(/DOTNET_SDK_MISSING_MESSAGE/.test(panel) && /showErrorMessage/.test(panel), 'first-run',
        'and the designer shows it as an error box, not just a one-line status note');

    t.note('packaging done');
};
