/* T2 — the Toolbox catalog itself (`src/toolboxProvider.ts`, `src/controlInfo.ts`, `host/ControlFactory.cs`).
 *
 * Written for TreeView (asked 2026-09-18: *"Do the TreeView first"*), which turned out to need **five**
 * touchpoints and was missing all of them: the TypeScript catalog, the plain-language description, the
 * C# host's snippet table (the XAML a drop inserts), the host's type map (the programmatic fallback
 * builder) and the property catalog. Four of the five fail silently when forgotten:
 *
 *   - no catalog entry    → the control is simply not in the sidebar;
 *   - no description      → the tooltip and the "About this control" box are blank;
 *   - no host snippet     → the drop does nothing at all (the host cannot answer `snippet(tag)`);
 *   - no host type        → the preview falls back to a blank element;
 *   - no property entry   → the Properties panel shows only the generic fields.
 *
 * These assertions pin TreeView end to end, plus one general invariant — every catalog entry has a real
 * description — so the *next* control cannot repeat the same silent gaps.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { controlInfoFor } = require('../../out/controlInfo.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

module.exports = async (t) => {
    t.section('toolbox-treeview');

    const toolbox = read('src/toolboxProvider.ts');
    const host = read('host/ControlFactory.cs');

    // --- 1. the catalog -------------------------------------------------------------------------
    t.ok(/\{ label: 'TreeView', tag: 'TreeView', group: TOOLBOX_CATEGORY_ITEMS \}/.test(toolbox), 'catalog',
        'TreeView is in the Toolbox catalog, in the same category as ListBox and TabControl');
    t.ok(/const TOOLBOX_CATEGORY_ITEMS = 'Items controls & lists';/.test(toolbox), 'catalog',
        'and that category is an existing one, so it needs no new sidebar section');

    // --- 2. the description ---------------------------------------------------------------------
    const info = controlInfoFor('TreeView');
    t.equal(info.label, 'Tree View', 'info', 'it has a friendly name');
    t.ok(/hierarch/i.test(info.desc), 'info', 'a plain-language description of what it is', info.desc);
    t.ok(/expand|collapse/i.test(info.desc), 'info', 'including what makes it different from a ListBox');
    t.ok(/Header/.test(info.use), 'info',
        'and the "when to use it" text names Header, because that is what a TreeViewItem displays',
        info.use);
    t.ok(/ItemsSource/.test(info.use), 'info',
        'it also warns that ItemsSource and literal child nodes are alternatives — the same rule the '
        + 'ComboBox/ListBox items editor enforces');

    // --- 3. the host snippet (what a drop actually inserts) --------------------------------------
    // The snippet is one C# line whose XAML quotes are escaped as \" — so capture the whole line, not
    // "up to the first quote", which stops inside the first escaped one.
    const snippet = /\["TreeView"\] = n => \$(.*)$/m.exec(host);
    t.ok(snippet, 'host-snippet', 'the host has a snippet for the tag — without it a drop does nothing');
    const xaml = snippet ? snippet[1] : '';
    t.ok(/<TreeView x:Name=/.test(xaml), 'host-snippet',
        'the snippet names the control, like every other tool — the real generated name is proven by the '
        + 'T5 matrix, which inserts it and reports "snippet → TreeView — TreeView1"');
    t.ok(/<TreeViewItem Header=\\"/.test(xaml), 'host-snippet',
        'it ships starter nodes, so the drop is visible and clickable instead of an empty box');
    t.ok(/IsExpanded=\\"True\\"/.test(xaml), 'host-snippet',
        'one node starts expanded, so the hierarchy is visible in the preview without a click');
    t.ok(/Width=\\"180\\" Height=\\"140\\"/.test(xaml), 'host-snippet', 'and it has a sensible default size');

    // --- 4. the host type map (the programmatic fallback) ----------------------------------------
    t.ok(/\["TreeView"\] = typeof\(TreeView\)/.test(host), 'host-type',
        'the programmatic builder knows the type too, or the preview falls back to a blank element');
    t.ok(/\["TreeViewItem"\] = typeof\(TreeViewItem\)/.test(host), 'host-type',
        'and the node type, which is what the snippet actually inserts');

    // --- 5. the property catalog -----------------------------------------------------------------
    const props = read('src/propertyCatalog.ts');
    t.ok(/\n    TreeView: \[/.test(props), 'props', 'the Properties panel has a template for it');
    t.ok(/HAS_FONT_PROPS = new Set\(\[[\s\S]{0,700}?'TreeView',/.test(props), 'props',
        'and it is in the font/text list — a TreeView is a TemplatedControl, so it carries those properties');
    const template = /\n    TreeView: \[([\s\S]*?)\n    \],/.exec(props);
    const keys = template ? [...template[1].matchAll(/key: '([^']+)'/g)].map((m) => m[1]) : [];
    t.ok(keys.includes('Background') && keys.includes('Padding'), 'props',
        'with the styling properties a TemplatedControl actually has', keys.join(', '));
    t.equal(keys.includes('SelectedItem') || keys.includes('SelectedItems'), false, 'props',
        'and deliberately no selection property: it holds an object the panel cannot edit as text, and a '
        + 'wrong entry here writes XAML that does not compile');

    // --- the general invariant: no control may reach the sidebar without its text -----------------
    const entries = [...toolbox.matchAll(/\{ label: '([^']+)', tag: '([A-Za-z0-9]+)', group: ([A-Z_]+) \}/g)];
    t.ok(entries.length >= 30, 'coverage', `the catalog still parses (${entries.length} entries)`);
    const noText = entries.map((m) => m[2]).filter((tag) => (controlInfoFor(tag).desc ?? '').length < 12);
    t.equal(noText.length, 0, 'coverage',
        'every catalog control has a real description, so a tooltip can never be blank', noText.join(', '));
    const groups = new Set(entries.map((m) => m[3]));
    t.equal(groups.size > 0, true, 'coverage', `and every entry names a category (${[...groups].length} in use)`);
};
