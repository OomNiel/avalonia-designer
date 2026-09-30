/* T2 — the Grumpy Command Bar's ITEM model (`src/commandItems.ts`).
 *
 * The bar holds real Avalonia children in a named row, so the ordinary property round-trip never sees
 * them: this module is the only thing that writes an item, and the failure it must not have is a SILENT
 * one — a wrong tag, a caption in the wrong attribute, an icon whose path data is not escaped, or a
 * child of the bar that quietly disappears because the writer replaced the row. Every check below
 * runs the REAL XamlModel (the same one the designer uses), so nothing is proved on a hand-built stub.
 *
 * The names are pinned against resources/GrumpyCommandBar.{cs,vb} and the host snippet
 * (host/ControlFactory.cs) — the three places that must agree about what a `GrumpyCommandBar` is.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { XamlModel } = require('../../out/xamlModel.js');
const cmd = require('../../out/commandItems.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" '
    + 'xmlns:chrome="using:AvaloniaChrome"';

/** A form with an EMPTY bar (no row yet — the shape a hand-typed bar has). */
const emptyBar = () => new XamlModel(`<Window ${NS} Width="800" Height="450" Title="T">
  <Canvas x:Name="Body">
    <chrome:GrumpyCommandBar x:Name="bar1" Height="36" Padding="8,0"/>
  </Canvas>
</Window>`);

/** A form with the row the designer's snippet writes. */
const rowBar = (row) => new XamlModel(`<Window ${NS} Width="800" Height="450" Title="T">
  <Canvas x:Name="Body">
    <chrome:GrumpyCommandBar x:Name="bar1" Height="36" Padding="8,0">
      <StackPanel x:Name="bar1Items" Orientation="Horizontal" Spacing="6">
${row}
      </StackPanel>
    </chrome:GrumpyCommandBar>
  </Canvas>
</Window>`);

const barOf = (model) => model.findByName('bar1');

module.exports = async (t) => {
    t.section('command-bar items');

    // --- 1. the vocabulary the editor, the host and both twins must agree on ----------------------
    t.equal(cmd.COMMAND_BAR_TAGS.join(','), 'GrumpyCommandBar', 'vocabulary', 'the bar tag');
    t.equal(cmd.COMMAND_BAR_PREFIX, 'chrome', 'vocabulary',
        'the XML prefix (the same one ChromeWindow/GrumpyPanel use, so one xmlns covers them)');
    t.equal(cmd.COMMAND_BAR_XMLNS, 'using:AvaloniaChrome', 'vocabulary', 'and its CLR namespace');
    t.equal(cmd.COMMAND_ROW_SUFFIX, 'Items', 'vocabulary',
        'the item row is `{bar}Items` — the `{name}Body` convention GrumpyPanel already uses');
    const kinds = cmd.COMMAND_ITEM_KINDS.map((k) => k.kind).join(',');
    t.equal(kinds, 'Label,TextBox,Button,Separator,ToggleButton,RadioButton,IconButton', 'vocabulary',
        'the seven kinds the drop-down offers, in the order the user listed them');
    t.equal(cmd.COMMAND_ITEM_KINDS.filter((k) => k.icon).map((k) => k.kind).join(','), 'Button,ToggleButton,IconButton',
        'vocabulary', 'only the button-shaped kinds carry an icon');

    // The tags must be REAL Avalonia controls — a Label is a TextBlock, a Separator is a Border (the
    // themed Separator's own margin would shift it off the row). Pinned against the host's type map.
    const host = read('host/ControlFactory.cs');
    for (const kind of cmd.COMMAND_ITEM_KINDS) {
        t.ok(new RegExp(`\\["${kind.tag}"\\] = typeof\\(`).test(host) || kind.tag === 'TextBlock',
            'host', `the host's programmatic builder knows ${kind.tag} (else the item vanishes from the preview)`);
    }

    // The bundled twins must describe the same control the model writes.
    for (const file of ['resources/GrumpyCommandBar.cs', 'resources/GrumpyCommandBar.vb']) {
        const text = read(file);
        t.ok(/class GrumpyCommandBar/.test(text) || /Class GrumpyCommandBar/.test(text), 'twins',
            `${file} declares the class`);
        t.ok(text.includes('ForegroundProperty'), 'twins',
            `${file} carries the inheriting Foreground the panel's text-colour row writes`);
    }
    const snippet = /\["GrumpyCommandBar"\] = n => \$(.*)$/m.exec(host);
    t.ok(snippet, 'snippet', 'the host has a drop snippet for the bar');
    t.ok(/<StackPanel x:Name=\\"\{n\}Items\\"/.test(snippet ? snippet[1] : ''), 'snippet',
        'and it writes the same named row the model expects — a drop and an edit must agree');

    // A BAR-SHAPED TOOL DOCKS ON DROP. The Menu, the StatusBar and GrumpyStatus all carry
    // DockPanel.Dock in their snippet, and the designer's drop path docks a control whose snippet
    // already names an edge into the form's own root DockPanel (in front of the fill child) — so a
    // dropped tool is a full-width band at once. The command bar did NOT carry one, so a dropped bar
    // stayed a floating box on the Body canvas, sized by the drop, until the Dock row was used; the
    // user reported that as *"Dock Top does not fill the complete top space"* and pointed at the Menu
    // as the tool that gets it right (2026-09-30).
    const snippetFor = (tag) => {
        const m = new RegExp(`\\["${tag}"\\] = n => \\$"(.*)",$`, 'm').exec(host);
        return m ? m[1] : '';
    };
    t.ok(/DockPanel\.Dock=\\"Top\\"/.test(snippetFor('Menu')), 'snippet',
        'the Menu snippet docks Top (the reference the user pointed at)');
    t.ok(/DockPanel\.Dock=\\"Top\\"/.test(snippetFor('GrumpyCommandBar')), 'snippet',
        'so the command bar carries the same edge: a drop lands a full-width band, not a floating box');
    t.ok(/DockPanel\.Dock=\\"(Top|Bottom)\\"|DockPanel\.Dock/.test(snippetFor('GrumpyStatus')), 'snippet',
        'and the strip tools do it too — the bar is not the odd one out');

    // --- 2. writing all seven kinds ----------------------------------------------------------------
    const items = [
        { kind: 'Label', name: 'lbl1', text: 'Name:' },
        { kind: 'TextBox', name: 'txt1', width: '140' },
        { kind: 'Button', name: 'btn1', text: 'Save', width: '80', event: 'Click', handler: 'btn1_Click' },
        { kind: 'Separator', name: 'sep1' },
        { kind: 'ToggleButton', name: 'tgl1', text: 'Bold' },
        { kind: 'RadioButton', name: 'rad1', text: 'Left', group: 'al' },
        { kind: 'IconButton', name: 'ico1', icon: 'save', iconSize: '16' }
    ];
    const model = emptyBar();
    cmd.writeCommandItems(model, barOf(model), items);
    const xml = model.serialize(true);
    const row = cmd.commandRow(barOf(model));
    t.ok(row, 'write', 'the row was created on a hand-typed bar that had none');
    t.equal(row.getAttribute('x:Name'), 'bar1Items', 'write', 'and it is named after the bar');
    t.equal(row.getAttribute('Orientation'), 'Horizontal', 'write', 'items sit in one row');
    t.equal(row.getAttribute('Spacing'), '6', 'write', 'with the row gap the snippet writes by default');

    const kids = Array.from(row.childNodes).filter((n) => n.nodeType === 1);
    t.equal(kids.map((k) => k.tagName).join(','),
        'TextBlock,TextBox,Button,Border,ToggleButton,RadioButton,Button', 'write',
        'each kind is written as the real control it is meant to be');
    t.equal(kids[0].getAttribute('Text'), 'Name:', 'write', 'a Label is a TextBlock with Text');
    t.equal(kids[1].getAttribute('Width'), '140', 'write', 'a Text Box keeps its width');
    t.equal(kids[2].getAttribute('Content'), 'Save', 'write', 'a Button carries Content');
    t.equal(kids[2].getAttribute('Click'), 'btn1_Click', 'write', 'and its event names the handler');
    t.equal(kids[3].getAttribute('Width'), '1', 'write', 'a Separator is a 1px Border by default');
    t.equal(kids[3].getAttribute('Background'), '#FF808080', 'write', 'in a grey you can see');
    t.equal(kids[4].getAttribute('Content'), 'Bold', 'write', 'a Toggle Button carries Content');
    t.equal(kids[5].getAttribute('GroupName'), 'al', 'write',
        'a Radio Button carries the group that makes it mutually exclusive');
    t.ok(/<PathIcon Data="M2,2 L12,2/.test(xml), 'write', 'an icon button contains the built-in icon geometry');
    t.ok(!/&amp;amp;/.test(xml), 'write', 'and the path data is not double-escaped');

    // --- 3. reading it back ------------------------------------------------------------------------
    const back = cmd.commandItemsOf(model, barOf(model));
    t.equal(back.length, 7, 'read', 'all seven items come back');
    t.equal(back.map((i) => i.kind).join(','), kinds, 'read', 'with their kinds');
    t.equal(back[0].text, 'Name:', 'read', 'and their captions');
    t.equal(back[1].width, '140', 'read', 'and their sizes');
    t.equal(back[2].handler, 'btn1_Click', 'read', 'and their event handlers');
    t.equal(back[5].group, 'al', 'read', 'and a radio group');
    t.equal(back[6].icon, 'save', 'read',
        'a built-in icon is recognised by its geometry, so the editor shows its name, not a blob of path data');

    // A round trip through the editor must be a NO-OP: save what was read, and the row is identical.
    const before = model.serialize(true);
    cmd.writeCommandItems(model, barOf(model), back);
    t.equal(model.serialize(true) === before, true, 'round-trip',
        'reading then writing changes nothing — otherwise every visit to the editor would churn the form');

    // --- 4. sizes below a control's own floor ------------------------------------------------------
    // A TextBox's theme floors it at 32 tall: an item asked to be 24 is written with the companion
    // minimum, exactly like the Properties panel's Height row (XamlModel.writeSize owns that rule, and
    // this proves the item writer goes through it rather than setting the attribute behind its back).
    const floors = new XamlModel(`<Window ${NS}><Canvas x:Name="Body">
      <chrome:GrumpyCommandBar x:Name="bar1" Height="36"><StackPanel x:Name="bar1Items"/></chrome:GrumpyCommandBar>
    </Canvas></Window>`);
    floors.sizeFloors = { txt9: { w: 64, h: 32 } };
    cmd.writeCommandItems(floors, floors.findByName('bar1'), [{ kind: 'TextBox', name: 'txt9', height: '24' }]);
    const box = cmd.commandRow(floors.findByName('bar1')).firstChild;
    t.equal(box.getAttribute('Height'), '24', 'size', 'a height the user typed is written as typed');
    t.equal(box.getAttribute('MinHeight'), '24', 'size',
        'with the companion minimum that makes it win over the control\'s own theme floor');
    cmd.writeCommandItems(floors, floors.findByName('bar1'), [{ kind: 'TextBox', name: 'txt9', height: '40' }]);
    // NB: `getAttribute` answers '' — not null — for an attribute that is not there (the xmldom trap
    // this repo has already been bitten by), so the question is asked with hasAttribute.
    t.equal(cmd.commandRow(floors.findByName('bar1')).firstChild.hasAttribute('MinHeight'), false, 'size',
        'and the companion goes again when the item grows past its floor');

    // --- 5. what the editor must NOT destroy -------------------------------------------------------
    const mixed = rowBar('      <Button x:Name="keep1" Content="Mine"/>\n'
        + '      <ComboBox x:Name="hand1" Width="90"/>');
    cmd.writeCommandItems(mixed, barOf(mixed), [{ kind: 'Button', name: 'new1', text: 'New' }]);
    const after = cmd.commandRow(barOf(mixed));
    const names = Array.from(after.childNodes).filter((n) => n.nodeType === 1)
        .map((k) => k.getAttribute('x:Name'));
    t.equal(names.join(','), 'new1,hand1', 'preserve',
        'a control the user dropped into the bar by hand survives the editor, at the end');
    t.ok(!mixed.serialize(true).includes('x:Name="keep1"'), 'preserve',
        'while a Button the editor DID list is the editor\'s to remove — the item list is the source of '
        + 'truth for the kinds it knows, and only unknown controls are carried over');

    // A bar whose child is not a row at all (someone typed items straight inside): the first save must
    // MOVE them into the row rather than delete them.
    const straight = new XamlModel(`<Window ${NS}><Canvas x:Name="Body">
      <chrome:GrumpyCommandBar x:Name="bar1" Height="36">
        <Button x:Name="loose1" Content="Loose"/>
      </chrome:GrumpyCommandBar>
    </Canvas></Window>`);
    const moved = cmd.ensureCommandRow(straight, straight.findByName('bar1'));
    t.equal(moved.getAttribute('x:Name'), 'bar1Items', 'shape', 'a hand-typed bar gains the named row');
    t.equal(moved.firstChild.getAttribute('x:Name'), 'loose1', 'shape',
        'and the control that was the bar\'s child is moved INTO it, not dropped');

    // --- 6. icons from a file ----------------------------------------------------------------------
    const fileModel = emptyBar();
    cmd.writeCommandItems(fileModel, barOf(fileModel), [
        { kind: 'IconButton', name: 'ico2', iconFile: 'avares://App/Assets/print.png', iconSize: '20' },
        { kind: 'Button', name: 'ico3', icon: 'print', text: 'Print' }
    ]);
    const fileXml = fileModel.serialize(true);
    t.ok(/<Image Source="avares:\/\/App\/Assets\/print\.png" Width="20" Height="20"\/>/.test(fileXml), 'file-icon',
        'a picked file becomes an Image with its avares:// URI and the size asked for');
    // The saved form is pretty-printed, so the two children are on their own lines — the check allows
    // the whitespace the writer adds rather than pinning one line (which would fail on a tidy-up).
    t.ok(/<StackPanel Orientation="Horizontal" Spacing="4">\s*<PathIcon[^>]*\/>\s*<TextBlock Text="Print"[^>]*\/>/
        .test(fileXml), 'file-icon', 'an icon WITH a caption keeps both, in a small row inside the button');

    // --- 7. the summary the Commands row shows ------------------------------------------------------
    t.equal(cmd.commandItemSummary([]), 'No items yet', 'summary', 'an empty bar says so');
    t.equal(cmd.commandItemSummary(back), '7 items — Label, Text Box, Button, Separator, Toggle Button, '
        + 'Radio Button, Icon Button', 'summary', 'and otherwise lists the kinds in order');
    t.equal(cmd.commandItemSummary([{ kind: 'Button', other: 'ComboBox' }]), '1 item — ComboBox (other)',
        'summary', 'a control of an unknown kind is reported as "other" rather than pretending');

    // --- 8. the wiring across the three files that have to agree ------------------------------------
    // These are source-shape checks on purpose: the panel owns the dialogs and the document, the webview
    // owns the modal, and a message name or a picker that forgot its remembered folder is invisible until
    // a user reports "the button does nothing". The picker-folder rule has its own test (t2
    // pickerFolders); the names below are what has to line up between the two halves.
    const panel = read('src/designerPanel.ts');
    const web = read('media/designer.js');
    t.ok(/case 'saveCommands':/.test(panel), 'wiring', 'the panel handles saveCommands');
    t.ok(/writeCommandItems\(doc\.model, el, items\)/.test(panel), 'wiring',
        'by handing the items to the model (never by writing attributes itself)');
    t.ok(/case 'pickCommandIcon':/.test(panel), 'wiring', 'the panel owns the icon file picker');
    t.ok(/lastPickerFolder\('icon'\)/.test(panel) && /rememberPickerFile\('icon'/.test(panel), 'wiring',
        'which opens where the last icon came from and remembers the next one (the repo-wide picker rule)');
    t.ok(/this\.bundleProjectFile\(proj, picked\)/.test(panel), 'wiring',
        'and BUNDLES the picture into the project — an absolute path would break the form elsewhere');
    t.ok(/type: 'commandIconPicked'/.test(panel) && /index: Number\(msg\.index/.test(panel), 'wiring',
        'the answer carries the row it was asked for, because the dialog is asynchronous');
    t.ok(/insertHandlerIntoCodeBehind\(/.test(panel) && /noStub/.test(panel), 'wiring',
        'an item event gets its code-behind stub, and an item whose stub failed is saved without the event');
    t.ok(/\$\('cmdRows'\)/.test(web) && /type: 'saveCommands'/.test(web), 'wiring',
        'the webview builds the table and posts the same message name');
    t.ok(/p\.key === 'Commands'\) openCommandEditor\(/.test(web), 'wiring',
        'the Commands row opens the editor (or the button is dead)');
    t.ok(/type: 'pickCommandIcon'/.test(web) && /case 'commandIconPicked'/.test(web), 'wiring',
        'and it asks for a file and receives the answer by name');
    // The modal's markup must exist, or every `$('cmd…')` lookup throws at load and the whole webview
    // silently collapses to a handful of working controls (a trap this layer already documented).
    for (const id of ['cmdModal', 'cmdRows', 'cmdAdd', 'cmdSpacing', 'cmdSummary', 'cmdHint', 'cmdSave', 'cmdCancel']) {
        t.ok(new RegExp(`id="${id}"`).test(panel), 'wiring', `the modal markup has #${id} (designer.js looks it up)`);
    }

    // --- 9. a bar's items are placed by the BAR, so no dock/coordinate rows for them ----------------
    // Reported 2026-09-30: *"The GrumpyCommandBar does not dock and cause a build error"*. The row the
    // bar holds was offered the Dock row, and a Dock that has nowhere to act wrote the designer's own
    // WORD for "fill" into the form — `DockPanel.Dock="Fill"` does not compile (Avalonia's Dock enum is
    // Left/Top/Right/Bottom). Both halves are pinned here: the writer refuses, and the row is not
    // offered.
    t.ok(/if \(!inDockPanel\) \{/.test(panel) && /Dock needs a DockPanel around the control/.test(panel),
        'dock', 'a Dock with nowhere to act is refused BEFORE the attribute is written, and the user is told');
    {
        const props = require('../../out/propertyCatalog.js');
        const bar = new XamlModel(`<Window ${NS} Width="800" Height="450"><Canvas x:Name="Body">
          <chrome:GrumpyCommandBar x:Name="bar1" Height="36">
            <StackPanel x:Name="bar1Items" Orientation="Horizontal" Spacing="6">
              <Button x:Name="btn1" Content="Go"/>
            </StackPanel>
          </chrome:GrumpyCommandBar>
        </Canvas></Window>`);
        const keysOf = (name) => props.propertyDefsFor(bar.findByName(name), bar)
            .filter((r) => r.key.indexOf('__') !== 0).map((r) => r.key);
        const barKeys = keysOf('bar1');
        t.ok(barKeys.includes('DockPanel.Dock'), 'dock',
            'the BAR itself keeps its Dock row — docking the bar to a form edge is the whole point');
        t.ok(barKeys.includes('Commands'), 'dock', 'and its Commands editor row');
        const rowKeys = keysOf('bar1Items');
        t.equal(rowKeys.includes('DockPanel.Dock'), false, 'dock',
            'while the item row is NOT offered a Dock: the bar places its items, so a dock cannot act there');
        t.equal(rowKeys.includes('Canvas.Left') || rowKeys.includes('Canvas.Top'), false, 'dock',
            'nor canvas coordinates — there is no canvas inside the bar');
        const itemKeys = keysOf('btn1');
        t.equal(itemKeys.includes('DockPanel.Dock') || itemKeys.includes('Canvas.Left'), false, 'dock',
            'and an item inside that row is not offered them either (order is the editor\'s job)');
        t.ok(itemKeys.includes('Width') && itemKeys.includes('Content'), 'dock',
            'but the item keeps the rows that DO mean something on it (its size, its caption)');
    }

    // --- 10. The bar's starter items: two WORKING file-dialog buttons -----------------------
    // The toolbox snippet used to be three placeholders (a Label, a Text Box and a Go button); it now
    // carries a "File Open..." and a "File Save..." icon button plus the box the picked path lands in,
    // and the drop writes the two handlers that really open those dialogs (asked 2026-09-30). The Menu
    // copy that came between them was REMOVED: it produced buttons that looked right and did nothing.
    {
        const snippetOf = (tag) => {
            const src = read('host/ControlFactory.cs');
            const m = new RegExp(`\\["${tag}"\\] = n => \\$"(.*?)",\\n`).exec(src);
            return m ? m[1] : '';
        };
        const bar = snippetOf('GrumpyCommandBar');
        t.ok(bar.length > 0, 'sample', 'the host still builds the bar programmatically (snippet found)');
        // The snippet's attributes are written as `x:Name=\"{n}Open\"` in C#, so match the PLAIN text
        // instead of fighting regex escaping: q is the backslash-quote pair the source carries.
        const q = '\\"';
        const has = (frag) => bar.includes(frag);
        t.ok(has(`x:Name=${q}{n}Open${q}`) && has(`Click=${q}{n}Open_Click${q}`), 'sample',
            'the Open button carries a Click wired to {n}Open_Click');
        t.ok(has(`x:Name=${q}{n}Save${q}`) && has(`Click=${q}{n}Save_Click${q}`), 'sample',
            'the Save button carries a Click wired to {n}Save_Click');
        t.ok(has(`TextBlock Text=${q}File Open...${q}`) && has(`TextBlock Text=${q}File Save...${q}`),
            'sample', 'both buttons say what they do');
        t.ok(has(`x:Name=${q}{n}Path${q}`), 'sample',
            'and the bar has the box the picked path is shown in');
        // The placeholders it replaced are gone with the Menu copy.
        for (const gone of ['Label:', 'Content="Go"', '{n}Label', '{n}Text', '{n}Button']) {
            t.equal(bar.includes(gone), false, 'sample', `the old placeholder ${gone} is gone`);
        }
        // The buttons are ICON buttons — the same shape the Items Editor reads back as "Icon Button".
        t.equal((bar.match(/<PathIcon /g) || []).length, 2, 'sample', 'each button carries an icon');
        // The two names must be the ones the code-behind writer generates, or the XAML names handlers
        // that never exist (`dotnet build` fails, the designer says nothing).
        const cb = read('src/codeBehind.ts');
        t.ok(/return \{ open: `\$\{barName\}Open_Click`, save: `\$\{barName\}Save_Click` \};/.test(cb), 'sample',
            'the handlers the snippet names are exactly the ones insertCommandBarFileHandlers writes');
        t.ok(new RegExp('function commandBarPathBox\\(barName: string\\): string \\{\\s*return `\\$\\{barName\\}Path`').test(cb),
            'sample', 'and the path box it fills is the {n}Path box the snippet carries');
        // The panel writes them on the drop, and the Menu auto-populate is GONE from it.
        const panel = read('src/designerPanel.ts');
        t.ok(/insertCommandBarFileHandlers\(doc\.uri, barName\)/.test(panel), 'sample',
            'the drop path calls the dialog-handler writer');
        t.equal(/seedCommandBarFromMenu|findMenuBar/.test(panel), false, 'sample',
            'and nothing seeds the bar from the form\'s Menu any more');
        const items = read('src/commandItems.ts');
        for (const gone of ['seedCommandBarFromMenu', 'findMenuBar', 'menuEntriesOf', 'commandIconForHeader']) {
            t.equal(new RegExp(`function ${gone}`).test(items), false, 'sample',
                `the removed auto-populate leaves no ${gone} behind`);
        }
    }

    // --- the CHILD marker survives the feature that introduced it ---------------------------
    // The Menu copy is gone, but a bar whose items came from it (a form saved by 0.13.13, or items
    // marked by hand) must keep its hierarchy: child items are indented in the bar and in the editor,
    // and no edit or save may quietly promote them to top level.
    {
        const m = new XamlModel(`<Window ${NS}><Canvas Name="Body">`
            + '<chrome:GrumpyCommandBar x:Name="bar1" Height="36"><StackPanel x:Name="bar1Items"'
            + ' Orientation="Horizontal" Spacing="6"/></chrome:GrumpyCommandBar></Canvas></Window>');
        const bar = m.findByName('bar1');
        cmd.writeCommandItems(m, bar, [
            { kind: 'IconButton', name: 'ico1', text: 'File', icon: 'open', child: 0 },
            { kind: 'IconButton', name: 'ico2', text: 'Open...', icon: 'open', child: 1 },
            { kind: 'IconButton', name: 'ico3', text: 'Report.txt', icon: 'open', child: 2 },
            { kind: 'Separator', name: 'sep1', text: '', child: 1 }
        ]);
        const row = cmd.commandRow(bar);
        const kids = (el) => Array.from(el.childNodes).filter((n) => n.nodeType === 1);
        t.equal(kids(row).length, 4, 'child', 'the items are written as real controls in the bar');
        t.equal(cmd.commandChildDepth(kids(row)[0]), 0, 'child', 'a top-level item carries no marker');
        t.equal(cmd.commandChildDepth(kids(row)[1]), 1, 'child', 'a child item is depth 1');
        t.equal(cmd.commandChildDepth(kids(row)[2]), 2, 'child', 'a child of a child is depth 2');
        t.equal(kids(row)[1].getAttribute('Classes'), cmd.commandChildClass(1), 'child',
            'the depth lives in Classes (Avalonia\'s own list of names)');
        t.equal(kids(row)[2].getAttribute('Classes'), 'cmdChild2', 'child', 'one class per level');
        t.equal(kids(row)[1].getAttribute('Margin'), cmd.commandChildIndent(1), 'child',
            'with the indent that makes it visible in the bar');
        t.equal(kids(row)[2].getAttribute('Margin'), cmd.commandChildIndent(2), 'child',
            'a step deeper for a deeper child');
        // Read back exactly, and rewrite without drift — the editor round-trip.
        const items = cmd.commandItemsOf(m, bar);
        t.equal(items.map((i) => i.child).join(','), '0,1,2,1', 'child',
            'the reader returns each item\'s depth');
        t.equal(items.map((i) => i.name).join(','), 'ico1,ico2,ico3,sep1', 'child',
            'and its name, separator included');
        const before = m.serialize(true);
        cmd.writeCommandItems(m, bar, items);
        t.equal(m.serialize(true), before, 'child', 'a round-trip through the editor is byte-identical');
        // The depth is validated on the way in from the webview: junk is top level, deep nesting clamps.
        cmd.writeCommandItems(m, bar, [{ kind: 'Button', name: 'b1', text: 'x', child: 'nonsense' },
        { kind: 'Button', name: 'b2', text: 'y', child: -3 }]);
        t.equal(cmd.commandItemsOf(m, bar).map((i) => i.child).join(','), '0,0', 'child',
            'a depth that is not a positive number means "top level"');
    }
};
