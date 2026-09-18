/* T2 — the **Tree Items** editor's contract (`src/designerPanel.ts`, `src/propertyCatalog.ts`,
 * `media/designer.js`). Asked 2026-09-18: *"Add an editor for treeviews nodes — keeping in mind our
 * mission is to keep things simple so novices can get going easily."*
 *
 * Four decisions were taken up front:
 *   1. the same shape as the Menu Items editor (indented rows, nest / un-nest), because that idiom
 *      already exists in this extension;
 *   2. a row edits the node's Header and an "expanded" tick — nothing else;
 *   3. a row the editor cannot represent is shown **read-only** and survives Save untouched;
 *   4. buttons: add child, add sibling, delete, move up, move down (plus nest / un-nest).
 *
 * The dangerous half is (3): a TreeView can hold an `ItemTemplate`, a `Styles` block or a bound
 * `ItemsSource`, and an editor that rebuilds the whole element would silently delete them. The
 * extension therefore removes and re-appends **only** `<TreeViewItem>` children.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

module.exports = async (t) => {
    t.section('tree-items');

    const panel = read('src/designerPanel.ts');
    const props = read('src/propertyCatalog.ts');
    const js = read('media/designer.js');

    // --- the node model and its conversion ------------------------------------------------------
    t.ok(/export interface TreeItemNode \{/.test(panel), 'model', 'the node model is declared');
    t.ok(/export function treeNodesOf\(el: Element\): TreeItemNode\[\]/.test(panel), 'model',
        'a TreeView reads out as a node tree');
    t.ok(/export function treeItemElementFor\(model: XamlModel, node: TreeItemNode, depth: number\)/.test(panel), 'model',
        'and a node tree writes back as real <TreeViewItem> elements');
    t.ok(/const TREE_MAX_DEPTH = 5;/.test(panel), 'model',
        'nesting is capped at five levels, the same depth the Menu editor allows');
    t.ok(/el\.setAttribute\('Header', header\);/.test(panel) && /el\.setAttribute\('IsExpanded', 'True'\);/.test(panel),
        'model', 'a node sets Header and, when ticked, IsExpanded — and nothing else');

    // --- decision 3: what the editor must never destroy -----------------------------------------
    t.ok(/function treeOtherEls\(el: Element\): Element\[\]/.test(panel), 'safety',
        'children that are not nodes are recognised');
    t.ok(/header: `<\$\{localName\(k\.tagName\)\}>`/.test(panel) && /readOnly: true/.test(panel), 'safety',
        'and are reported as read-only rows, labelled with the element they stand for, so the user can see '
        + 'they are there');
    t.ok(/if \(o\.readOnly\) return null;/.test(panel), 'safety',
        'they are never sent back as nodes — the element is still in the file, which is what '
        + '"survives Save" means');
    t.ok(/for \(const kid of treeItemEls\(el\)\) el\.removeChild\(kid\);/.test(panel), 'safety',
        'Save replaces ONLY the <TreeViewItem> children: an ItemTemplate, a Styles block or a bound '
        + 'ItemsSource stays exactly where it is');
    t.ok(/case 'saveTreeItems': \{/.test(panel)
        && /await this\.sendProperties\(doc, panel, msg\.name\);/.test(panel), 'safety',
        'and the apply path exists as its own message, like saveMenuItems, ending in a properties refresh');

    // --- the property row that opens it ----------------------------------------------------------
    t.ok(/key: 'TreeItems',\n            label: 'Tree Items',\n            kind: 'button',/.test(props), 'entry',
        'the Properties panel offers a "Tree Items" button for a TreeView');
    t.ok(/'MenuItems', 'StatusItems', 'TreeItems'\]/.test(props), 'entry',
        'and it is registered as a popup-editor key, so it is not also rendered as a value row');
    t.ok(/if \(p\.key === 'TreeItems'\) openTreeEditor\(msg\.name\);/.test(js), 'entry',
        'clicking it opens the editor on the selected TreeView');
    t.ok(/trees\[nm\] = treeNodesOf\(el\);/.test(panel) && /type: 'frame', \.\.\.frame, controls, menus, trees,/.test(panel),
        'entry', 'the node trees travel with the frame, the way the menu trees do');

    // --- decision 4: the buttons -----------------------------------------------------------------
    for (const title of [
        'Add a node inside this one',
        'Add a node next to this one',
        'Nest: make this a child of the node above it',
        'Un-nest: move this out to the level above',
        'Move this node up among its siblings',
        'Move this node down among its siblings',
        'Delete this node and everything inside it'
    ]) {
        t.ok(js.includes(`'${title}'`), 'buttons',
            `a row carries a button that says: ${title}`);
    }
    t.ok(/els\.treeAdd\.addEventListener\('click', \(\) => \{/.test(js), 'buttons',
        'and the modal has "+ Add node" for the first level');

    // --- decision 1: nesting is the list, not a number ------------------------------------------
    t.ok(/row\.style\.paddingLeft = \(10 \+ \(depth - 1\) \* 24\) \+ 'px';/.test(js), 'nesting',
        'a row is indented by its depth, so parent and child are visible at a glance');
    t.equal(/mn-level|level number|Level:/.test(js), false, 'nesting',
        'and there is no "level" field to fill in — the point of the decision');
    t.ok(/if \(idx === 0\) return;[\s\S]{0,200}?prev\.children\.push\(node\);/.test(js), 'nesting',
        'nesting moves the node under its previous sibling, which is what the button says it does');

    // --- saving ------------------------------------------------------------------------------------
    t.ok(/post\(\{ type: 'saveTreeItems', name: treeEdit\.name, items: treeEdit\.tree \}\)/.test(js), 'save',
        'Save posts the whole tree in one message, the same shape the Menu editor uses');
    t.ok(/function closeTreeEditor\(\) \{ els\.treeModal\.hidden = true; treeEdit = null; \}/.test(js), 'save',
        'and the working copy is dropped when the modal closes');
    t.ok(/src\.map\(treeCopy\)/.test(js), 'save',
        'the editor works on a copy, so Cancel cannot leave half an edit behind');
};
