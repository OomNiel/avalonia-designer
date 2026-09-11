/* T2 — Menu Items conversion: the design-time tree the Menu Items editor edits, including the two
 * File/Folder Selector kinds (a bundled <chrome:PathPicker> row ON the menu). Guards the round-trip
 * XAML → tree → XAML, so opening the editor and saving can never silently drop or downgrade a
 * selector row (a hand-written PathType="SaveFile" picker keeps its dialog kind). */
'use strict';
const { XamlModel } = require('../../out/xamlModel.js');
const { menuTreeOf, sanitizeMenuNodes, menuElementFor } = require('../../out/designerPanel.js');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"';
const menuDoc = (inner) => `<Window ${NS}><DockPanel><Menu x:Name="m1">${inner}</Menu></DockPanel></Window>`;

module.exports = async (t) => {
    t.section('menu-items (selector kinds)');

    // ---------- read: a Menu holding path-picker rows ----------
    const m = new XamlModel(menuDoc(
        '<chrome:PathPicker PathType="SaveFile" Width="180" Title="Save as…"/>' +
        '<MenuItem Header="File">' +
        '  <chrome:PathPicker PathType="Folder" Width="150"/>' +
        '  <MenuItem Header="Exit"/>' +
        '</MenuItem>'
    ));
    const menu = m.findByName('m1');
    const tree = menuTreeOf(menu);
    t.equal(tree.length, 2, 'read', 'both menu rows are read (the picker is NOT dropped)');
    t.equal(tree[0].kind, 'FileSelector', 'read', 'a PathPicker reads as the File Selector kind');
    t.equal(tree[0].pathType, 'SaveFile', 'read', 'a SaveFile picker keeps its dialog kind');
    t.equal(tree[0].header, 'Save as…', 'read', 'its Title becomes the row caption');
    t.equal(tree[0].width, 180, 'read', 'its Width is carried');
    t.equal(tree[1].kind, 'Item', 'read', 'a plain MenuItem still reads as an Item');
    t.equal(tree[1].children.length, 2, 'read', 'the submenu keeps both children');
    t.equal(tree[1].children[0].kind, 'FolderSelector', 'read', 'a nested picker reads as Folder Selector');
    t.equal(tree[1].children[0].pathType, 'Folder', 'read', 'with its PathType');
    t.equal(tree[1].children[0].header, undefined, 'read', 'an untitled picker has no caption');

    // ---------- sanitize: what the webview sends back ----------
    const clean = sanitizeMenuNodes([
        { kind: 'FileSelector', pathType: 'File', header: 'Open image…', width: 200 },
        { kind: 'FolderSelector', pathType: 'Folder', header: 'Pick a folder', width: 150 },
        { kind: 'FolderSelector', pathType: 'Bogus', header: 'x', width: -5, children: [{ kind: 'Item', header: 'ignored' }] },
        { kind: 'Nonsense', header: 'Plain item' },
        { kind: 'Space', width: 24 }
    ]);
    t.equal(clean.length, 5, 'sanitize', 'all rows survive (an unknown kind falls back to Item)');
    t.equal(clean[0].pathType, 'File', 'sanitize', 'the File kind is accepted');
    t.equal(clean[1].pathType, 'Folder', 'sanitize', 'the Folder kind is accepted');
    t.equal(clean[2].pathType, undefined, 'sanitize', 'a bogus PathType is dropped (kind decides)');
    t.equal(clean[2].width, undefined, 'sanitize', 'a negative width is dropped');
    t.equal(clean[2].children, undefined, 'sanitize', 'a selector row never keeps children');
    t.equal(clean[3].kind, 'Item', 'sanitize', 'an unknown kind becomes a plain Item');
    t.equal(clean[4].kind, 'Space', 'sanitize', 'a top-level Space is still accepted');

    // ---------- write: the sanitized tree becomes real XAML ----------
    const out = new XamlModel(menuDoc(''));
    const menuOut = out.findByName('m1');
    for (const n of clean) menuOut.appendChild(menuElementFor(out, n, 1));
    const text = out.serialize(true);
    t.ok(text.includes('xmlns:chrome="using:AvaloniaChrome"'), 'write', 'the chrome namespace is declared on the root');
    t.ok(text.includes('PathType="File"'), 'write', 'the File Selector kind writes PathType="File"');
    t.ok(text.includes('PathType="Folder"'), 'write', 'the Folder Selector kind writes PathType="Folder"');
    t.ok(text.includes('Title="Open image…"'), 'write', 'the row caption becomes the dialog Title');
    t.ok(text.includes('Width="200"'), 'write', 'the row width is written');

    // Round-trip: re-reading the written XAML gives the same tree back.
    const again = menuTreeOf(new XamlModel(text).findByName('m1'));
    t.equal(again.length, 5, 'round-trip', 'every row comes back');
    t.equal(again[0].kind, 'FileSelector', 'round-trip', 'the File Selector kind survives');
    t.equal(again[0].pathType, 'File', 'round-trip', 'with its PathType');
    t.equal(again[0].header, 'Open image…', 'round-trip', 'and its caption');
    t.equal(again[0].width, 200, 'round-trip', 'and its width');
    t.equal(again[2].pathType, 'Folder', 'round-trip', 'a dropped PathType is re-derived from the kind');
    t.equal(again[3].kind, 'Item', 'round-trip', 'the plain Item is unchanged');
    t.equal(again[4].kind, 'Space', 'round-trip', 'the Space gap is unchanged');

    // Defaults: a caption-less picker gets the kind's standard dialog title, and 160px.
    const defaults = new XamlModel(menuDoc(''));
    defaults.findByName('m1').appendChild(menuElementFor(defaults, { kind: 'FolderSelector' }, 1));
    const dText = defaults.serialize(true);
    t.ok(dText.includes('Title="Select a folder"'), 'write', 'a Folder Selector defaults to "Select a folder"');
    t.ok(dText.includes('Width="160"'), 'write', 'and to a 160px row');

    // A caption with quotes/& must survive the DOM write (and read back identically).
    const tricky = new XamlModel(menuDoc(''));
    tricky.findByName('m1').appendChild(menuElementFor(tricky, { kind: 'FileSelector', header: 'Say "hi" & bye' }, 1));
    const tText = tricky.serialize(true);
    const tBack = menuTreeOf(new XamlModel(tText).findByName('m1'));
    t.equal(tBack[0].header, 'Say "hi" & bye', 'write', 'quotes and & in the caption round-trip');
};
