/* T2 — the product's NAME: one name everywhere, and the old one only where it is still needed.
 *
 * Why this exists: the rename of 2026-09-20 (Avalonia Designer → Grumpy's WYSIWYG Designer) touched three
 * kinds of string — the manifest (what the Marketplace shows and matches), the strings the editor shows
 * (the output channel, the Problems source, the messages that point at them) and the marker written into
 * generated files. The first two are easy to get 90 % right, and the missing 10 % is invisible until a
 * user reads "Avalonia Designer" in one menu and the new name in the title bar. The third is the real
 * trap: the DataSet recogniser must keep accepting the OLD spelling, or a project created before the
 * rename stops looking generated.
 *
 * So: the shipped surface is scanned for the old name (with one deliberate exception), the strings that
 * must agree are compared with each other rather than with a literal, and the recogniser is proved to
 * accept both spellings.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const NAME = "Grumpy's WYSIWYG Designer";
const OLD = 'Avalonia Designer';
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/** The name as TS/JS would spell it in a single-quoted literal — an apostrophe needs its backslash. */
const ESCAPED = NAME.replace(/'/g, "\\'");
const LIT = `'${ESCAPED}'`;

/** The files a user actually receives — the shipped text sources, not the test suite. */
function shippedFiles() {
    const out = ['package.json', 'README.md', 'USER_MANUAL.md', 'CONTROLS.md', 'Events per Control.md'];
    for (const dir of ['src', 'media', 'resources']) {
        for (const f of fs.readdirSync(path.join(ROOT, dir))) {
            if (/\.(ts|js|cs|vb)$/.test(f)) out.push(`${dir}/${f}`);
        }
    }
    for (const f of fs.readdirSync(path.join(ROOT, 'host'))) {
        if (/\.(cs|csproj)$/.test(f)) out.push(`host/${f}`);
    }
    return out;
}

module.exports = async (t) => {
    t.section('rebrand');

    // --- 1. the name the Marketplace shows, and the id that must NOT change ---
    const manifest = JSON.parse(read('package.json'));
    t.equal(manifest.displayName, `${NAME} for VS Code`, 'manifest', 'the display name is the new one');
    t.equal(`${manifest.publisher}.${manifest.name}`, 'grumpy.avalonia-designer', 'manifest',
        'the extension id is unchanged, so settings, shortcuts and downloaded models survive the rename');
    t.ok(manifest.description.length > 40 && !manifest.description.includes(OLD), 'manifest',
        'the description carries no leftover old name');
    t.equal(manifest.contributes.configuration.title, NAME, 'manifest',
        'the Settings section is named after the product');
    const container = manifest.contributes.viewsContainers.activitybar[0];
    t.equal(container.title, NAME, 'manifest', 'and so is the Activity Bar container');
    t.equal(container.id, 'avaloniaDesigner', 'manifest',
        'while the container id stays as it is — an id is not a name users read');

    // --- 2. the strings that must agree with each other ---
    const logger = read('src/logger.ts');
    const check = read('src/codeBehindCheck.ts');
    const build = read('src/buildDiagnostics.ts');
    const assist = read('src/assistantUi.ts');
    const channel = /createOutputChannel\('((?:[^'\\]|\\.)*)'\)/.exec(logger);
    t.ok(channel, 'strings', 'the extension creates its own output channel');
    t.equal(channel ? channel[1].replace(/\\'/g, "'") : '', NAME, 'strings',
        'and it is called the new name (written with its apostrophe escaped)');
    t.ok(check.includes(`d.source = ${LIT};`), 'strings',
        'the diagnostics the designer finds carry the same name as their source');
    t.ok(build.includes(`${LIT.replace(/'$/, "'")} (build)`) || build.includes(`'${ESCAPED} (build)'`), 'strings',
        'and so do the ones that come from the build');
    t.ok(assist.includes(LIT), 'strings',
        'the assistant looks for its own findings under that same name, or its button would vanish');

    // --- 3. no leftover old name on the shipped surface ---
    // Two exceptions, both deliberate. The DataSet recogniser names the OLD wording so files written
    // before the rename still count as generated (section 4 proves that it does), and the README names
    // the old name exactly once — in its "Formerly …" line. Anywhere else it is a leftover.
    const ALLOWED_FILES = new Set(['src/dataSetEditor.ts']);
    const ALLOWED_LINE = { 'README.md': /Formerly/ };
    const offenders = [];
    for (const rel of shippedFiles()) {
        if (ALLOWED_FILES.has(rel)) continue;
        read(rel).split('\n').forEach((line, i) => {
            if (!line.includes(OLD)) return;
            if (ALLOWED_LINE[rel] && ALLOWED_LINE[rel].test(line)) return;
            offenders.push(`${rel}:${i + 1}`);
        });
    }
    t.equal(offenders.length, 0, 'leftovers', 'no shipped file still calls the product by its old name',
        offenders.slice(0, 6).join(', '));
    t.ok(/Formerly \*Avalonia Designer for VS Code\*/.test(read('README.md')), 'leftovers',
        'while the README keeps exactly the one line that names it, for the people who know the old name');

    // --- 4. the old spelling still counts as generated ---
    const editor = read('src/dataSetEditor.ts');
    const found = /return (\/.*\/)\.test\(readText\(file\)\)/.exec(editor);
    t.ok(found, 'compat', 'the DataSet recogniser is a plain test on the file text');
    const recogniser = new RegExp(found[1].slice(1, -1));
    t.ok(recogniser.test('// Generated by the Avalonia Designer — DataSet designer. Do not edit by hand.'),
        'compat', 'a DataSet written before the rename still counts as generated');
    t.ok(recogniser.test("' Generated by Grumpy's WYSIWYG Designer — DataSet designer. Do not edit by hand."),
        'compat', 'and so does one written after it');
    t.ok(!recogniser.test('public class MyData { }'), 'compat',
        "while a hand-written file is still the user's own code");
    const generator = read('src/dataSetGenerator.ts');
    t.ok(generator.includes(`Generated by ${NAME}`), 'compat',
        'the generator writes the new wording (plain inside a double-quoted literal)');
    t.ok(generator.includes(`Generated by ${ESCAPED}`), 'compat',
        'and escapes the apostrophe inside its single-quoted C# literal');
};
