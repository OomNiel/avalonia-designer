/* T2 — marketplace packaging: the things a store review (and a first-run user) notices.
 *
 * These are all facts about files shipped in the repo, so they are asserted at source level. The
 * point is that the release stays reproducible and the package stays clean as the code grows: the
 * VSIX itself is verified by the CI workflow's packaging step. */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const has = (rel) => fs.existsSync(path.join(ROOT, rel));

/**
 * Minimal PNG reader — enough for the 8-bit RGBA, non-interlaced files this repo ships (PIL writes
 * exactly that). Needed because the icon assertions below are about *pixels*, and a dependency just to
 * look at 16 K pixels would not pay for itself.
 */
function readPng(file) {
    const buf = fs.readFileSync(file);
    if (!buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        throw new Error(`${file} is not a PNG`);
    }
    let pos = 8;
    let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
    const chunks = [];
    while (pos + 12 <= buf.length) {
        const len = buf.readUInt32BE(pos);
        const type = buf.toString('latin1', pos + 4, pos + 8);
        const data = buf.slice(pos + 8, pos + 8 + len);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
            interlace = data[12];
        } else if (type === 'IDAT') chunks.push(data);
        else if (type === 'IEND') break;
        pos += 12 + len;
    }
    if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
        throw new Error(`${file} is not 8-bit RGBA (depth ${bitDepth}, colour type ${colorType})`);
    }
    const raw = zlib.inflateSync(Buffer.concat(chunks));
    const bpp = 4, stride = width * bpp;
    const out = Buffer.alloc(height * stride);
    let rp = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[rp++];
        const line = raw.slice(rp, rp + stride);
        rp += stride;
        const prev = y > 0 ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
        const cur = out.slice(y * stride, (y + 1) * stride);
        for (let x = 0; x < stride; x++) {
            const a = x >= bpp ? cur[x - bpp] : 0;
            const b = prev[x];
            const c = x >= bpp ? prev[x - bpp] : 0;
            let val;
            switch (filter) {
                case 0: val = line[x]; break;
                case 1: val = line[x] + a; break;
                case 2: val = line[x] + b; break;
                case 3: val = line[x] + ((a + b) >> 1); break;
                case 4: {
                    const p = a + b - c;
                    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                    val = line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
                    break;
                }
                default: throw new Error(`${file}: unknown scanline filter ${filter}`);
            }
            cur[x] = val & 0xff;
        }
    }
    return { width, height, data: out };
}

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
    // and rejects any suffix outright — that is how the first upload of 1.0.0-beta.7 failed
    // (2026-09-12): "The version string '1.0.0-beta.7' doesn't conform to the requirements for a
    // version." The GitHub tag may carry the friendlier "-beta.N" name; the number that goes into
    // the VSIX may not.
    t.ok(/^\d+(?:\.\d+){0,3}$/.test(pkg.version), 'manifest',
        'and the Marketplace version is numbers only (no tag suffix)');
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
    t.equal(w, h, 'icon', `and square (${w}x${h}) — the listing, the Extensions view and the README all
        show it in a square box, so a rectangle would be letterboxed`);

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

    // GitHub force-migrates actions that declare Node 20 onto Node 24 and prints a deprecation warning
    // in EVERY run's log, which buries real annotations. The minimum major that declares node24, read
    // from each action's own action.yml: checkout v5, setup-node v5, setup-dotnet v5 — and
    // upload-artifact **v6**, because its v5 still declares node20. Pinned here so a stray `@v4`
    // cannot quietly bring the noise back.
    {
        const node24Min = {
            'actions/checkout': 5,
            'actions/setup-node': 5,
            'actions/setup-dotnet': 5,
            'actions/upload-artifact': 6
        };
        for (const [file, where] of [['.github/workflows/ci.yml', 'ci'],
        ['.github/workflows/release.yml', 'release']]) {
            const used = [...read(file).matchAll(/uses:\s*([\w.-]+\/[\w.-]+)@(v\d+)/g)]
                .map((m) => ({ action: m[1], major: Number(m[2].slice(1)) }));
            t.ok(used.length > 0, where, 'the workflow uses at least one action');
            t.equal(used.filter((u) => u.major < (node24Min[u.action] ?? 0))
                .map((u) => `${u.action}@v${u.major}`), [], where,
                'no action is left on a Node 20 major (it warns on every single run)');
        }
    }
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
    // Every PNG the manifest names (the Marketplace icon and the Activity Bar container icon) is
    // scaled by the UI, and nothing errors when the source is wrong — a 64x64 or non-square file just
    // looks blurry or squashed. Checked here rather than only for `pkg.icon`, because the sidebar icon
    // is exactly the kind of asset that gets swapped without anyone looking at it in a light theme.
    for (const asset of assets) {
        if (/\.png$/i.test(asset) === false) continue;
        const buf = fs.readFileSync(path.join(ROOT, asset));
        t.ok(buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
            'manifest-assets', `${asset} is a real PNG`);
        const aw = buf.readUInt32BE(16), ah = buf.readUInt32BE(20);
        t.ok(aw >= 128 && ah >= 128, 'manifest-assets', `${asset} is at least 128x128 (${aw}x${ah})`);
        t.equal(aw, ah, 'manifest-assets', `${asset} is square (${aw}x${ah})`);
    }

    // ---------- 6b) the sidebar glyph is actually VISIBLE (2026-09-14) ----------
    // The size/squareness checks above are blind to the failure that really happened: the Activity Bar
    // icon had been made by scaling the coloured badge down and clearing what was not the glyph, which
    // left **no fully opaque pixel at all** (5938 semi-transparent ones). Nothing in the manifest or in
    // the packaging is wrong in that state — it simply looks washed out at 24 px in the sidebar, and a
    // user has to report it. So look at the pixels: white only, a solid core, a transparent
    // background, and a glyph that is neither clipped nor off-centre.
    const sidebarIcons = Object.values(contrib.viewsContainers || {})
        .flatMap((list) => list.map((c) => c.icon))
        .filter((i) => typeof i === 'string' && /\.png$/i.test(i) && i !== pkg.icon);
    t.ok(sidebarIcons.length >= 1, 'icon-visibility', 'the Activity Bar container declares a PNG icon');
    for (const file of sidebarIcons) {
        const { width, height, data } = readPng(path.join(ROOT, file));
        let ink = 0, opaque = 0, tinted = 0;
        let minX = width, minY = height, maxX = -1, maxY = -1;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                if (data[i + 3] === 0) continue;
                ink += 1;
                if (data[i + 3] === 255) opaque += 1;
                if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) tinted += 1;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
        t.ok(ink > 0, 'icon-visibility', `${file} has a glyph (not an empty or fully transparent file)`);
        t.equal(tinted, 0, 'icon-visibility',
            `${file} is white only — no colour and no gradient, so the theme cannot wash it out`);
        t.ok(opaque > 0, 'icon-visibility',
            `${file} contains fully opaque pixels (the old glyph had none — that is exactly why it was faint)`);
        t.ok(opaque / ink >= 0.3, 'icon-visibility',
            `${file} has a solid core (${Math.round((opaque / ink) * 100)}% of its ink is fully opaque)`);
        t.ok(ink / (width * height) < 0.9, 'icon-visibility', `${file} keeps a transparent background`);
        t.ok(minX >= 2 && minY >= 2 && maxX <= width - 3 && maxY <= height - 3, 'icon-visibility',
            `${file} is not clipped by its canvas (ink bbox ${minX},${minY}-${maxX},${maxY})`);
        t.ok(Math.abs(minX + maxX - (minY + maxY)) <= 6, 'icon-visibility', `${file} is centred`);
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
