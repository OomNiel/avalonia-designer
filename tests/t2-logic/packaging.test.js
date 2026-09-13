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
    // ...but valid semver is not what the Marketplace validates. It wants one to four PLAIN numbers
    // and rejects pre-release tags outright — that is how the first upload of 1.0.0-beta.7 failed
    // (2026-09-12): "The version string '1.0.0-beta.7' doesn't conform to the requirements for a
    // version." The GitHub tag may carry the friendlier "-beta.N" name; the number that goes into
    // the VSIX may not.
    t.ok(/^\d+(?:\.\d+){0,3}$/.test(pkg.version), 'manifest',
        'and the Marketplace version is numbers only (no semver pre-release tag)');
    t.ok(/[1-9]/.test(pkg.version), 'manifest', 'containing at least one non-zero number');
    t.equal(pkg.main, './out/extension.js', 'manifest', 'the entry point is the compiled output');
    t.ok(has('src/extension.ts'), 'manifest', 'which tsc builds from src/extension.ts');
    // out/ is git-ignored and rebuilt by `npm run compile` (the package step runs it too), so a fresh
    // clone legitimately has no out/ yet — only check the artefact when it is there.
    if (has('out')) t.ok(has('out/extension.js'), 'manifest', 'and out/extension.js exists once compiled');
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
    // The file itself only exists on a developer machine — it is git-ignored, so a fresh clone (and
    // therefore CI) never has it. Only the rule is required to be there.
    t.ok(/^tests\/\*\*/m.test(ignore), 'packaging', 'the test suite is excluded');
    t.ok(/^tsconfig\.json$/m.test(ignore), 'packaging', 'build metadata (tsconfig.json) is excluded');
    t.ok(/^GrumpyWhite\.png$/m.test(ignore) === false, 'packaging',
        'the Activity Bar icon is not excluded (see the manifest-assets checks below)');
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
    t.ok(/--pre-release/.test(rel), 'release', 'it can publish pre-releases (the current 0.9.x line)');
    t.ok(/VSCE_PAT/.test(rel), 'release', 'it uses a Marketplace token from the repository secrets');
    // A missing token must not be a failed run: a red run for a known setup gap only produces a
    // failure email, and the summary is what reports the truth instead. A publish that is attempted
    // and fails must still fail the job, so the guard against a silently skipped release stays.
    t.ok(/id: preflight/.test(rel) && /can_publish/.test(rel), 'release',
        'a preflight step decides whether this run can publish at all');
    t.ok(/if:.*can_publish.*dry_run|if:.*dry_run.*can_publish/.test(rel), 'release',
        'and the publish step is gated on it (and on dry_run)');
    t.ok(/GITHUB_STEP_SUMMARY/.test(rel) && /NOT PUBLISHED/.test(rel), 'release',
        'the job summary states what happened, including a warning when nothing was published');
    t.ok(/PUBLISHED.*failure|steps\.publish\.outcome/.test(rel), 'release',
        'and a publish that ran and failed is still reported as a failure');
    t.ok(!/::error::VSCE_PAT is not set/.test(rel), 'release',
        'the missing-token case no longer hard-fails the run');
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
    t.ok(/1 December 2026/.test(guide), 'release',
        'plus the global-PAT retirement deadline (the route this guide documents has an end date)');
    t.ok(/--azure-credential/.test(guide) && /2\.26\.1/.test(guide), 'release',
        'and the Entra ID replacement, with the vsce version it requires');
    t.ok(/numbers only/i.test(guide), 'release',
        'plus the rule that sank the first upload: the Marketplace version must be numbers only');
    t.ok(/^PUBLISHING\.md$/m.test(ignore), 'packaging', 'the maintainer guide stays out of the VSIX');
    t.ok(/^\.github\/\*\*$/m.test(ignore), 'packaging',
        'and so does repo infrastructure (.github: CI workflows + issue templates)');

    // ---------- 5b) every asset the manifest points at must SHIP ----------
    // The Activity Bar container icon is a file in the package (GrumpyWhite.png). Excluding it as
    // "artwork nothing loads" removes the extension's sidebar icon with no error anywhere — the
    // manifest is the only place that says it is used, so it is what gets checked here.
    const assets = new Set();
    const addIcon = (v) => { if (typeof v === 'string' && v.startsWith('$(') === false) assets.add(v); };
    addIcon(pkg.icon);
    for (const list of Object.values(contrib.viewsContainers || {})) for (const c of list) addIcon(c.icon);
    for (const list of Object.values(contrib.views || {})) for (const v of list) addIcon(v.icon);
    for (const c of contrib.commands || []) addIcon(c.icon);
    t.ok(assets.size >= 2, 'manifest-assets', 'the manifest references file assets (Marketplace + view icons)');
    // Micro-glob: `**` spans directories, `*` stays inside one, so an ignore rule can be matched the
    // way vsce would match it (exact path, `**/name`, `*.png`, or a bare file name).
    const globToRe = (g) => {
        const escaped = g.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        return new RegExp('^' + escaped.split('**').map((part) => part.split('*').join('[^/]*')).join('.*') + '$');
    };
    const ignores = ignore.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l.startsWith('#') === false && l.startsWith('!') === false);
    for (const asset of assets) {
        t.ok(has(asset), 'manifest-assets', `${asset} exists in the repo`);
        const excluded = ignores.some((rule) => {
            const re = globToRe(rule);
            return re.test(asset) || re.test('dir/' + asset) || rule === asset.split('/').pop();
        });
        t.ok(excluded === false, 'manifest-assets',
            `${asset} is NOT excluded by .vscodeignore (excluding it would silently break the UI it drives)`);
    }

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
