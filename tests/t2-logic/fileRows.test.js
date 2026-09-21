/* T2 — every `kind: 'file'` property row must be handled by the designer's `browseFile` case.
 *
 * Why this exists: the Charts' `SourceFile` row was added with kind 'file', so the Properties panel
 * rendered a "…" button for it — but `designerPanel.ts`'s `browseFile` handler carried a hardcoded
 * key allowlist (Source / Icon / TitleBarIcon) and returned early for anything else. The button
 * appeared and did nothing, and no test noticed: the webview renders the button from `kind`, while
 * the extension decides what a click means. This pins the two halves together.
 *
 * The handler cannot be imported here (it pulls in vscode), so the check reads the source and looks
 * for each key as a string literal inside the browseFile block. That is deliberately blunt: it
 * catches the bug class (a new file row left unhandled) without pretending to test the dialog.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {
    CONTROL_PROPS, COMMON_PROPS, FONT_PROPS, CHROME_WINDOW_PROPS
} = require('../../out/propertyCatalog.js');

const ROOT = path.join(__dirname, '..', '..');

/** Every property key the catalog declares with kind 'file' (the rows that want a Browse button). */
function fileKindKeys() {
    const keys = new Set();
    const collect = (list) => {
        for (const p of list || []) if (p.kind === 'file') keys.add(p.key);
    };
    for (const list of Object.values(CONTROL_PROPS)) collect(list);
    collect(COMMON_PROPS);
    collect(FONT_PROPS);
    collect(CHROME_WINDOW_PROPS);
    return [...keys].sort();
}

/** The text of the `case 'browseFile': { … }` block, up to the next case label. */
function browseFileBlock(source) {
    const start = source.indexOf("case 'browseFile':");
    if (start < 0) return '';
    const rest = source.slice(start + 1);
    const next = rest.search(/\n\s*case '/);
    return next < 0 ? rest : rest.slice(0, next);
}

module.exports = async (t) => {
    t.section('fileRows');

    const source = fs.readFileSync(path.join(ROOT, 'src', 'designerPanel.ts'), 'utf8');
    const block = browseFileBlock(source);
    t.ok(block.length > 0, 'fileRows', 'the browseFile case exists in designerPanel.ts');

    const keys = fileKindKeys();
    // Icon / Source / TitleBarIcon. The charts' workbook used to be a file-kind row too; it is picked
    // inside the 'Data Selector' editor now (2026-09-21), which is why this list is one shorter.
    t.ok(keys.length >= 3, 'fileRows', `catalog has file-kind rows (${keys.join(', ')})`);

    const missing = keys.filter((k) => !block.includes(`'${k}'`));
    t.equal(missing, [], 'fileRows',
        'every file-kind catalog key is accepted by the browseFile handler (or its Browse button does nothing)');

    // Self-test: prove the check CAN fail, so a green run means something. This is an old handler that
    // accepted only the Image's Source, so it must be reported as missing the other keys.
    const oldHandler = "case 'browseFile': { if (key !== 'Source') return; }";
    const syntheticMissing = keys.filter((k) => !oldHandler.includes(`'${k}'`));
    t.ok(syntheticMissing.length > 0, 'fileRows',
        'the check reports an unhandled key (self-test against an older handler)');

    // The charts' spreadsheet is a PATH, not a bundled asset: the chart reads it with ZipFile.OpenRead
    // and Live Update re-reads it on save, so bundling a copy into Assets would break it outright.
    t.ok(block.includes('isWorkbook'), 'fileRows', 'SourceFile gets its own (non-bundling) branch');
    t.ok(/isWorkbook[\s\S]{0,400}setProperty\(el, key, picked\[0\]\.fsPath\)/.test(block), 'fileRows',
        'SourceFile stores the absolute path, not an avares:// URI');

    // A `kind: 'file'` row is useless if it is buried behind "Show advanced" — SourceFile is not.
    const { propertyDefsFor } = require('../../out/propertyCatalog.js');
    const { DOMParser } = require('@xmldom/xmldom');
    const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" xmlns:charts="using:AvaloniaCharts"';
    const doc = new DOMParser().parseFromString(
        `<root ${NS}><Canvas><charts:GrumpyLinePlot x:Name="c1" Values="1,2"/><Image x:Name="i1"/></Canvas></root>`, 'text/xml');
    const kids = Array.from(doc.documentElement.firstChild.childNodes).filter((n) => n.nodeType === 1);
    for (const el of kids) {
        const rows = propertyDefsFor(el);
        for (const key of keys) {
            const row = rows.find((r) => r.key === key);
            if (!row) continue;
            t.equal(row.kind, 'file', 'fileRows', `${el.tagName}.${key} is still a file row`);
            t.equal(!!row.advanced, false, 'fileRows', `${el.tagName}.${key} is visible in beginner mode`);
        }
    }
};
