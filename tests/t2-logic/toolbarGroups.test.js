/* T2 — the toolbar's foldable categories (Edit, File, Zoom, Guides, Alignment, Spacing).
 *
 * The markup lives in the webview HTML template inside src/designerPanel.ts and the fold/unfold
 * behaviour in media/designer.js, so both are asserted here at SOURCE level (the jsdom layer T3
 * clicks the real markup). The category membership is pinned per heading: the toolbar is a flat
 * flex box and designer.js derives a category from its heading, so a button inserted in the wrong
 * place would silently join the wrong group. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** The `<div id="toolbar">…</div>` markup out of the webview template. */
function toolbarMarkup(src) {
    const start = src.indexOf('<div id="toolbar">');
    const end = src.indexOf('<div id="main">');
    return start >= 0 && end > start ? src.slice(start, end) : '';
}

const HEAD = /<button class="tbg-head" data-grp="([a-z]+)" data-tip="([^"]*)" aria-expanded="(true|false)">([^<]*)<\/button>/g;

/** The toolbar split into categories the same way designer.js walks it: the items after a heading,
 *  up to the next heading (or the data-stop marker). */
function categories(markup) {
    const heads = [...markup.matchAll(HEAD)];
    // The element designer.js stops at (it carries the data-stop marker) — the slice ends at its
    // tag, so neither the status text nor ⚙ Settings counts as a category member.
    const stop = markup.indexOf('<span id="status"');
    return heads.map((h, i) => {
        const from = h.index + h[0].length;
        const to = i + 1 < heads.length ? heads[i + 1].index : (stop > 0 ? stop : markup.length);
        return {
            grp: h[1], tip: h[2], expanded: h[3], label: h[4],
            items: [...markup.slice(from, to).matchAll(/id="([A-Za-z0-9_]+)"/g)].map((m) => m[1])
        };
    });
}

/** What each category must own, in toolbar order. */
const EXPECTED = [
    { grp: 'edit', label: 'Edit', items: ['btnUndo', 'btnRedo'] },
    { grp: 'file', label: 'File', items: ['btnNewForm', 'btnRefresh', 'btnCodeFix', 'btnBackup'] },
    { grp: 'zoom', label: 'Zoom', items: ['btnZoomOut', 'zoomValue', 'btnZoomIn', 'btnFit'] },
    { grp: 'guides', label: 'Guides', items: ['btnDotGrid', 'btnSnapGrid', 'btnGridSettings', 'btnCrosshair'] },
    {
        grp: 'align', label: 'Alignment',
        items: ['btnAlignLeft', 'btnAlignCentre', 'btnAlignRight', 'btnAlignTop', 'btnAlignMiddle',
            'btnAlignBottom', 'btnAlignText', 'btnSameWidth', 'btnSameHeight']
    },
    { grp: 'space', label: 'Spacing', items: ['btnEqualV', 'btnEqualH'] }
];

module.exports = async (t) => {
    t.section('T2: toolbar categories (fold / unfold)');

    const panel = read('src/designerPanel.ts');
    const css = read('media/designer.css');
    const js = read('media/designer.js');
    const markup = toolbarMarkup(panel);
    t.ok(markup.length > 0, 'toolbar-groups', 'the toolbar markup is in the webview template');

    // ---------- 1) the six headings ----------
    const cats = categories(markup);
    t.equal(cats.map((c) => c.grp).join(','), EXPECTED.map((e) => e.grp).join(','), 'toolbar-groups',
        'the toolbar has the six categories, in order');
    t.equal(cats.map((c) => c.label).join(','), EXPECTED.map((e) => e.label).join(','), 'toolbar-groups',
        'each one is labelled');
    t.ok(cats.every((c) => c.expanded === 'true'), 'toolbar-groups',
        'and every category starts UNFOLDED (aria-expanded="true")');
    t.ok(cats.every((c) => (c.tip || '').length > 10), 'toolbar-groups',
        'each heading carries a tooltip saying what the category is for');
    t.ok(/Alignment Tools/.test((cats.find((c) => c.grp === 'align') || {}).tip || ''), 'toolbar-groups',
        'the alignment category is named "Alignment Tools" in its tooltip');

    // ---------- 2) membership: exactly the buttons we expect, each in ONE category ----------
    for (const want of EXPECTED) {
        const got = cats.find((c) => c.grp === want.grp);
        t.equal(got ? got.items.join(',') : '(missing)', want.items.join(','), 'toolbar-groups',
            `the ${want.label} category owns exactly its ${want.items.length} item(s)`);
    }
    const all = cats.reduce((acc, c) => acc.concat(c.items), []);
    t.equal(all.length, new Set(all).size, 'toolbar-groups', 'no item is owned by two categories');
    t.equal(all.length, 25, 'toolbar-groups', 'all 25 toolbar items are grouped (13 icons, 11 buttons, the read-out)');
    t.ok(!all.includes('btnCodeSettings'), 'toolbar-groups',
        '⚙ Settings stays outside the categories (it never folds away)');
    t.ok(markup.indexOf('data-stop="') < markup.indexOf('id="btnCodeSettings"'), 'toolbar-groups',
        'the data-stop marker sits before the status text and ⚙ Settings');
    const ids = [...markup.matchAll(/id="([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
    t.equal(ids.length, new Set(ids).size, 'toolbar-groups', 'no duplicate id in the toolbar markup');
    t.equal(ids.filter((i) => i.startsWith('btn')).length, 25, 'toolbar-groups',
        'the grouping did not drop or duplicate a button');

    // ---------- 3) the heading chip: readable, and its caret is a SHAPE (no font to be missing) ----------
    // (whitespace tolerant: a CSS formatter may re-space the selectors)
    const head = /#toolbar \.tbg-head\s*\{([^}]*)\}/.exec(css);
    t.ok(!!head, 'toolbar-groups-css', 'the heading chip has its own rule');
    t.ok(!!head && /background:\s*transparent/.test(head[1]), 'toolbar-groups-css',
        'it is a heading, not an action button (no button fill)');
    t.ok(!!head && /color:\s*#[0-9a-f]{6}/.test(head[1]), 'toolbar-groups-css',
        'and it is drawn in an explicit, readable colour');
    t.ok(/#toolbar \.tbg-head:hover\s*\{[^}]*color:\s*var\(--fg-hi\)/.test(css), 'toolbar-groups-css',
        'hovering turns it full white');
    t.ok(/#toolbar \.tbg-head\[aria-expanded="false"\]\s*\{[^}]*background:\s*#[0-9a-f]{6}/.test(css), 'toolbar-groups-css',
        'a folded category looks put away');
    const caret = /#toolbar \.tbg-head::before\s*\{([^}]*)\}/.exec(css);
    t.ok(!!caret, 'toolbar-groups-css', 'the caret is drawn by the chip itself');
    t.ok(!!caret && /content:\s*''/.test(caret[1]), 'toolbar-groups-css',
        'as an empty box — never a text glyph, so no font can be missing');
    t.ok(!!caret && /border-right:/.test(caret[1]) && /border-bottom:/.test(caret[1]), 'toolbar-groups-css',
        'built from two borders (a chevron)');
    t.ok(!!caret && /transform:\s*rotate\(-45deg\)/.test(caret[1]), 'toolbar-groups-css',
        'pointing right while folded');
    t.ok(/#toolbar \.tbg-head\[aria-expanded="true"\]::before\s*\{[^}]*rotate\(45deg\)/.test(css), 'toolbar-groups-css',
        'and down once the category is open');
    t.ok(/font-family/.test(caret ? caret[1] : '') === false, 'toolbar-groups-css',
        'the caret needs no font at all');
    // The hidden attribute has to beat `#toolbar button { display: inline-flex }`.
    t.ok(/#toolbar \[hidden\]\s*\{[^}]*display:\s*none/.test(css), 'toolbar-groups-css',
        'a hidden toolbar item is really hidden (the button display rule would win otherwise)');

    // ---------- 4) the webview behaviour ----------
    t.ok(/toolbarFolds:\s*\{\}/.test(js), 'toolbar-groups-js', 'no category starts folded');
    t.ok(/function toolbarHeads\(\)/.test(js) && /querySelectorAll\('\.tbg-head'\)/.test(js), 'toolbar-groups-js',
        'the webview collects the headings');
    const members = /function toolbarMembers\(head\) \{([\s\S]*?)\n    \}/.exec(js);
    t.ok(!!members, 'toolbar-groups-js', 'and works out which items belong to one');
    t.ok(!!members && /nextElementSibling/.test(members[1]), 'toolbar-groups-js', 'by walking its siblings');
    t.ok(!!members && /classList\.contains\('tbg-head'\)/.test(members[1]), 'toolbar-groups-js',
        'stopping at the next heading');
    t.ok(!!members && /hasAttribute\('data-stop'\)/.test(members[1]), 'toolbar-groups-js',
        'and at the data-stop marker (status + ⚙ Settings never fold)');
    const apply = /function applyToolbarFolds\(\) \{([\s\S]*?)\n    \}/.exec(js);
    t.ok(!!apply, 'toolbar-groups-js', 'applying the folded state is its own function');
    t.ok(!!apply && /el\.hidden = folded/.test(apply[1]), 'toolbar-groups-js', 'it hides the members of a folded group');
    t.ok(!!apply && /aria-expanded/.test(apply[1]), 'toolbar-groups-js', 'keeps aria-expanded in step');
    t.ok(!!apply && /click to fold this group away/.test(apply[1]) && /click to unfold this group/.test(apply[1]),
        'toolbar-groups-js', 'and says in the tooltip what a click will do');
    t.ok(!!apply && /layoutToolbar\(\);/.test(apply[1]), 'toolbar-groups-js',
        'then re-runs the wrap (the rows change when items disappear)');
    t.ok(/function toggleToolbarGroup\(grp\)/.test(js), 'toolbar-groups-js', 'a heading click toggles its category');
    t.ok(/function loadToolbarFolds\(\)/.test(js) && /saved\.toolbarFolds/.test(js), 'toolbar-groups-js',
        'the folded set is restored from the webview state');
    t.ok(/function persistToolbarFolds\(\)/.test(js) && /next\.toolbarFolds = state\.toolbarFolds/.test(js), 'toolbar-groups-js',
        'and written back to it');
    t.ok(/els\.toolbar\.addEventListener\('click'/.test(js) && /closest\('\.tbg-head'\)/.test(js), 'toolbar-groups-js',
        'one delegated listener on the toolbar handles every heading');
    t.ok(/loadToolbarFolds\(\);/.test(js) && /applyToolbarFolds\(\);/.test(js), 'toolbar-groups-js',
        'both run at startup (the folds are in place before the first paint)');
    // Hiding items must not fool the dangling-separator pass into treating a hidden button as a
    // neighbour on the row — and that pass must not switch a folded group's separator back on.
    t.ok(/bar\.children\)\.filter\(\(el\) => el\.hidden !== true\)/.test(js), 'toolbar-groups-js',
        'the wrap ignores items a folded category hid');
    t.ok(/const folded = foldedToolbarItems\(\)/.test(js) && /folded\.has\(s\) === false/.test(js), 'toolbar-groups-js',
        'and leaves the separator of a folded category alone (it belongs to the fold)');

    t.note('toolbar categories done');
};
