/* T3 — webview behaviour (designer.js in jsdom): frame rendering, click-select regression
 * (selection fix), armed-tool drop, locked-Body context menu + lock badge + dropdown 🔒,
 * outline drag posts ONE resize on drop, file/ItemsSource property rows post browse/pick.
 *
 * hitTest semantics: the LAST named control containing the point wins (topmost/deepest wins),
 * so clicking a button selects the button and clicking the empty body selects Body.
 *
 * jsdom is a devDependency of tests/. If it is not installed (offline machine) the whole
 * layer SKIPs with a clear note instead of failing. */
'use strict';
const fs = require('fs');
const path = require('path');

const DESIGNER_JS = path.join(__dirname, '..', '..', 'media', 'designer.js');
const DESIGNER_CSS = path.join(__dirname, '..', '..', 'media', 'designer.css');

const IDS = ['canvas', 'preview', 'overlayLayer', 'selection', 'status', 'zoomValue', 'canvasWrap',
    'propsBody', 'propsEmpty', 'controlList', 'btnNewForm', 'btnZoomIn', 'btnZoomOut', 'btnFit', 'btnClearSel',
    'contextMenu', 'ctxDelete', 'ctxCut', 'ctxCopy', 'ctxPaste', 'ctxMoveToContainer',
    'helpPanel', 'helpTitle', 'helpBody', 'btnToggleHelp', 'propsToggleRow', 'chkAdvanced',
    'itemsModal', 'itemsText', 'itemsSave', 'itemsCancel',
    'gridModal', 'gridRows', 'gridCols', 'gridAddRow', 'gridAddCol', 'gridSave', 'gridCancel',
    'cellHighlight',
    'btnDotGrid', 'btnSnapGrid', 'btnGridSettings', 'dotGrid',
    'dotGridModal', 'dotGridSpacingX', 'dotGridSpacingY', 'dotGridColor', 'dotGridDotSize',
    'dotGridSave', 'dotGridCancel',
    'multiSel', 'marquee', 'radiusGuide',
    'btnAlignLeft', 'btnAlignCentre', 'btnAlignRight', 'btnAlignTop', 'btnAlignMiddle', 'btnAlignBottom',
    'btnAlignText', 'btnSameWidth', 'btnSameHeight',
    'crosshair', 'chH', 'chV', 'btnCrosshair',
    'crosshairModal', 'chModeShort', 'chModeLong', 'chShortLength', 'chThickness', 'chOpacity',
    'chColor', 'crosshairSave', 'crosshairCancel',
    'rulerH', 'rulerV'];

function setup() {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
        runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/'
    });
    const { window } = dom;

    const tagFor = (id) => {
        if (id === 'preview') return 'img';
        if (id === 'controlList') return 'select';
        if (id === 'itemsText') return 'textarea';
        if (id.startsWith('dotGridSpacing') || id === 'dotGridColor' || id === 'dotGridDotSize') return 'input';
        if (id === 'gridAddRow' || id === 'gridAddCol' || id === 'gridSave' || id === 'gridCancel'
            || id === 'dotGridSave' || id === 'dotGridCancel'
            || id === 'chModeShort' || id === 'chModeLong'
            || id === 'crosshairSave' || id === 'crosshairCancel') return 'button';
        if (id === 'chShortLength' || id === 'chThickness' || id === 'chOpacity' || id === 'chColor') return 'input';
        if (id.startsWith('btn') || id.startsWith('ctx')) return 'button';
        return 'div';
    };
    const make = (id) => { const el = window.document.createElement(tagFor(id)); el.id = id; return el; };

    // Mirror the real webview DOM: #canvasWrap > #canvas > #preview + #dotGrid + #overlayLayer +
    // #selection + #multiSel + #marquee, so handle events bubble up to the canvas's pointer
    // listeners exactly like the real page.
    const wrap = make('canvasWrap');
    const canvas = make('canvas');
    wrap.appendChild(canvas);
    canvas.appendChild(make('preview'));
    canvas.appendChild(make('dotGrid'));
    canvas.appendChild(make('overlayLayer'));
    canvas.appendChild(make('multiSel'));
    canvas.appendChild(make('marquee'));
    canvas.appendChild(make('radiusGuide'));
    canvas.appendChild(make('selection'));
    canvas.appendChild(make('crosshair'));
    canvas.appendChild(make('chH'));
    canvas.appendChild(make('chV'));
    window.document.body.appendChild(wrap);
    for (const id of IDS.filter((i) => i !== 'canvasWrap' && i !== 'canvas' && i !== 'preview' && i !== 'overlayLayer' && i !== 'selection' && i !== 'dotGrid' && i !== 'multiSel' && i !== 'marquee' && i !== 'radiusGuide' && i !== 'crosshair' && i !== 'chH' && i !== 'chV')) {
        window.document.body.appendChild(make(id));
    }

    const posted = [];
    window.acquireVsCodeApi = () => ({ postMessage: (m) => posted.push(m) });

    // Deterministic layout: wrap 848x498 → fit() gives exactly scale 1 for an 800x450 form.
    wrap.getBoundingClientRect = () => ({ left: 0, top: 0, right: 848, bottom: 498, width: 848, height: 498, x: 0, y: 0 });
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 450, width: 800, height: 450, x: 0, y: 0 });
    canvas.setPointerCapture = () => { };
    canvas.releasePointerCapture = () => { };

    window.eval(fs.readFileSync(DESIGNER_JS, 'utf8'));

    const $ = (id) => window.document.getElementById(id);
    const dispatch = (type, id, opts = {}) => {
        const el = $(id);
        const ev = new window.MouseEvent(type, { bubbles: true, cancelable: true, ...opts });
        el.dispatchEvent(ev);
    };
    const msg = (data) => {
        const ev = new window.Event('message');
        ev.data = data;
        window.dispatchEvent(ev);
    };
    const frame = (controls, gridCells) => ({
        // The designer only writes the preview <img> when png is non-empty (real frames have data).
        type: 'frame', png: 'AA==', width: 800, height: 450,
        controls: controls.map((c) => ({ name: c.name, type: c.type, x: c.x, y: c.y, width: c.w, height: c.h, locked: !!c.locked, parent: c.parent, handles: c.handles, zIndex: c.zIndex })),
        gridCells
    });

    return { dom, window, posted, $, dispatch, msg, frame };
}

module.exports = async (t) => {
    t.section('T3: webview (designer.js in jsdom)');

    let jsdom;
    try { jsdom = require('jsdom'); } catch { /* offline */ }
    if (!jsdom) {
        t.skip('jsdom', 'install', 'jsdom not installed — run `npm install` in tests/ to enable the webview layer');
        return;
    }
    t.pass('jsdom', 'available', '');

    const css = fs.readFileSync(DESIGNER_CSS, 'utf8');
    t.ok(/pointer-events:\s*none/.test(css), 'css', 'selection box pointer-events:none (click-select fix)');
    // Properties sidebar: everything up to & including "Show advanced" stays pinned; ONLY the
    // property items list (#propsBody) scrolls (the panel itself no longer scrolls as a whole).
    t.ok(/#props\s*\{[^}]*overflow:\s*hidden/s.test(css), 'css', 'props panel does NOT scroll as a whole');
    t.ok(/#propsBody\s*\{[^}]*overflow-y:\s*auto/s.test(css), 'css', 'propsBody is the scrolling region');
    t.ok(/#propsToggleRow\s*\{[^}]*flex:\s*0\s+0\s+auto/s.test(css), 'css', 'Show advanced row stays pinned');

    const s = setup();
    const { $, dispatch, msg, frame, posted } = s;

    const controls = [
        { name: 'Root', type: 'DockPanel', x: 0, y: 0, w: 800, h: 450 },
        { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true },
        { name: 'btn1', type: 'Button', x: 100, y: 50, w: 120, h: 36 },
        { name: 'btn2', type: 'Button', x: 300, y: 50, w: 100, h: 30 }
    ];
    msg(frame(controls));

    // --- frame applied: preview, status, overlays, control list ---
    t.equal($('preview').src, 'data:image/png;base64,AA==', 'frame', 'preview src set');
    t.equal($('status').textContent, '800 × 450 px', 'frame', 'status dimensions');
    t.equal($('overlayLayer').children.length, 4, 'frame', 'overlay divs per named control');
    // Dropdown = the 4 named controls + the leading "Form" entry (the unnamed Window root).
    t.equal($('controlList').children.length, 5, 'frame', 'dropdown populated (4 controls + Form)');
    t.equal($('controlList').options[0].value, '', 'frame', 'first option is the form');
    const bodyOpt = [...$('controlList').children].find((o) => o.value === 'Body');
    t.ok(bodyOpt && bodyOpt.textContent.includes('🔒'), 'frame', 'Body dropdown shows 🔒');

    // --- design rulers: black strips hug the canvas top/left, sized to the design; white ticks ---
    t.equal($('rulerH').style.width, '800px', 'rulers', 'top ruler spans the canvas width');
    t.equal($('rulerV').style.height, '450px', 'rulers', 'left ruler spans the canvas height');
    // Default grid spacing 16 → major every 80 px (5×16), minor every 8 px (10 per major).
    t.ok($('rulerH').querySelectorAll('.rul-tick').length >= 2, 'rulers', 'top ruler has minor + major tick layers');
    t.ok($('rulerV').querySelectorAll('.rul-tick').length >= 2, 'rulers', 'left ruler has minor + major tick layers');
    t.ok($('rulerH').querySelectorAll('.rul-num').length >= 5, 'rulers', 'top ruler labels every major (0,80,160,…)');
    t.ok($('rulerV').querySelectorAll('.rul-num').length >= 5, 'rulers', 'left ruler labels every major');
    // A dotGrid message with a coarser spacing re-renders the ruler majors.
    msg({ type: 'dotGrid', dotGrid: { enabled: true, snap: false, spacingX: 40, spacingY: 40, color: '#111111', dotSize: 2 } });
    t.ok($('rulerH').querySelectorAll('.rul-num').length >= 2, 'rulers', 'ruler re-renders when the grid spacing changes');
    // Restore the default spacing so later tests (snap etc.) see spacing 16 again.
    msg({ type: 'dotGrid', dotGrid: { enabled: true, snap: false, spacingX: 16, spacingY: 16, color: '#9db4d0', dotSize: 1.5 } });

    // --- click-select: clicking a button selects it (deepest control wins) ---
    dispatch('click', 'canvas', { clientX: 110, clientY: 60 });
    t.equal(posted[posted.length - 1].type, 'select', 'click-select', 'posts select');
    t.equal(posted[posted.length - 1].name, 'btn1', 'click-select', 'name = btn1');
    const sel = $('selection');
    t.equal(sel.hidden, false, 'click-select', 'selection shown');
    t.equal(sel.querySelectorAll('.handle').length, 8, 'click-select', '8 resize handles (unlocked)');

    // --- clear-selection toolbar button posts deselect ---
    posted.length = 0;
    $('btnClearSel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.equal(posted[posted.length - 1].type, 'deselect', 'clear-sel', 'deselect posted');
    t.equal(sel.hidden, true, 'clear-sel', 'selection hidden');

    // --- armed tool: click canvas drops the control at design coords ---
    msg({ type: 'armTool', tag: 'TextBox' });
    posted.length = 0;
    dispatch('click', 'canvas', { clientX: 200, clientY: 120 });
    const drop = posted[posted.length - 1];
    t.equal(drop.type, 'drop', 'arm-tool', 'posts drop');
    t.equal(drop.tag, 'TextBox', 'arm-tool', 'tag carried');
    t.equal(Math.round(drop.x), 200, 'arm-tool', 'x mapped to design coords');
    t.equal(Math.round(drop.y), 120, 'arm-tool', 'y mapped to design coords');

    // --- locked Body: right-clicking the empty body selects Body + disables destructive actions ---
    dispatch('contextmenu', 'canvas', { clientX: 10, clientY: 10 }); // hits Body (0,0,800,450), not Root
    t.equal(posted[posted.length - 1].name, 'Body', 'locked-menu', 'right-click selects Body');
    t.equal($('ctxCut').disabled, true, 'locked-menu', 'Cut disabled');
    t.equal($('ctxMoveToContainer').disabled, true, 'locked-menu', 'Move disabled');
    t.equal($('ctxDelete').disabled, true, 'locked-menu', 'Delete disabled');
    t.equal($('ctxCopy').disabled, false, 'locked-menu', 'Copy still enabled');
    // selection box for locked Body: lock badge, no handles
    t.equal(sel.querySelectorAll('.handle').length, 0, 'locked-select', 'no resize handles');
    t.ok(sel.querySelector('.lock-badge'), 'locked-select', 'lock badge present');
    t.equal(sel.classList.contains('locked'), true, 'locked-select', 'selection marked locked');

    // Delete key on the locked Body must NOT post delete
    posted.length = 0;
    $('canvas').dispatchEvent(new s.window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    t.ok(posted.every((m) => m.type !== 'delete'), 'locked-select', 'Delete does not fire on locked control');

    // --- the FORM is selectable: first control-list entry "Form - <Title>", and clicking empty
    //     design space selects it (posts a select with name null → Window properties resize it). ---
    msg(Object.assign(frame([
        { name: null, type: 'Window', x: 0, y: 0, w: 800, h: 450, parent: null },
        { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true, parent: 'Root' },
        { name: 'btn1', type: 'Button', x: 100, y: 50, w: 120, h: 36, parent: 'Body' }
    ]), { formTitle: 'My App' }));
    const cl2 = $('controlList');
    t.equal(cl2.options[0].value, '', 'form-select', 'first entry is the form (empty value)');
    t.equal(cl2.options[0].textContent, 'Form - My App', 'form-select', 'form entry labelled with the window Title');
    // empty click on the locked Body → selects the FORM (name null)
    posted.length = 0;
    $('btnClearSel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    dispatch('click', 'canvas', { clientX: 20, clientY: 20 });
    t.equal(posted[posted.length - 1].type, 'select', 'form-select', 'empty click posts select');
    t.equal(posted[posted.length - 1].name, null, 'form-select', 'empty click selects the form');
    // picking the form entry from the drop-down also selects it
    posted.length = 0;
    cl2.value = '';
    cl2.dispatchEvent(new s.window.Event('change'));
    t.equal(posted[posted.length - 1].name, null, 'form-select', 'drop-down form entry selects the form');
    // and picking a real control still works
    posted.length = 0;
    cl2.value = 'btn1';
    cl2.dispatchEvent(new s.window.Event('change'));
    t.equal(posted[posted.length - 1].name, 'btn1', 'form-select', 'drop-down still selects named controls');

    // --- outline drag: pointerdown on a handle → moves → ONE resize post on pointerup ---
    {
        dispatch('click', 'canvas', { clientX: 110, clientY: 60 }); // select btn1 again
        const seHandle = sel.querySelector('.handle.se');
        t.ok(!!seHandle, 'drag', 'se handle exists');
        posted.length = 0;
        const pd = new s.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 220, clientY: 86 });
        seHandle.dispatchEvent(pd);
        dispatch('pointermove', 'canvas', { clientX: 225, clientY: 88 });
        dispatch('pointermove', 'canvas', { clientX: 230, clientY: 91 });
        t.equal(posted.length, 0, 'drag', 'no posts during drag (outline only)');
        t.equal(sel.classList.contains('dragging'), true, 'drag', 'dragging class set');
        dispatch('pointerup', 'canvas', { clientX: 230, clientY: 91 });
        const resize = posted.find((m) => m.type === 'resize');
        t.ok(!!resize, 'drag', 'one resize posted on drop');
        t.equal(resize.name, 'btn1', 'drag', 'resize name');
        t.equal(resize.corner, 'se', 'drag', 'resize corner');
        t.ok(Math.abs(resize.dx - 10) < 1e-6, 'drag', `dx = total delta (${resize.dx})`);
        t.ok(Math.abs(resize.dy - 5) < 1e-6, 'drag', `dy = total delta (${resize.dy})`);
    }

    // --- property rows: file kind posts browseFile, ItemsSource posts pickItemsSource ---
    msg({
        type: 'properties', name: 'img1',
        properties: [
            { key: '__name__', label: 'Name', kind: 'text', value: 'img1' },
            { key: 'Source', label: 'Source', kind: 'file', value: 'avares://P/Assets/logo.png' }
        ],
        info: null, tabItems: [], listItems: []
    });
    const srcRow = [...$('propsBody').children].find((r) => r.textContent.includes('Source'));
    t.ok(srcRow && srcRow.querySelector('.prop-browse'), 'props', 'file row has browse button');
    posted.length = 0;
    srcRow.querySelector('.prop-browse').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.equal(posted[posted.length - 1], { type: 'browseFile', name: 'img1', key: 'Source' }, 'props', 'browseFile posted');

    msg({
        type: 'properties', name: 'lb1',
        properties: [
            { key: '__name__', label: 'Name', kind: 'text', value: 'lb1' },
            { key: 'ItemsSource', label: 'Items Source', kind: 'text', value: 'nameslist', readOnly: true }
        ],
        info: null, tabItems: [], listItems: []
    });
    const lbRow = [...$('propsBody').children].find((r) => r.textContent.includes('Items Source'));
    t.ok(lbRow && lbRow.querySelector('.prop-browse'), 'props', 'ItemsSource row has picker button');
    posted.length = 0;
    lbRow.querySelector('.prop-browse').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.equal(posted[posted.length - 1], { type: 'pickItemsSource', name: 'lb1' }, 'props', 'pickItemsSource posted');

    // --- colour palette popup: lists EVERY preset colour (not just the current one), then a pick
    //     posts setProperty and closes. The old <datalist> filtered options to the typed value,
    //     which made the dropdown appear to contain only the current colour (issue 1). ---
    msg({
        type: 'properties', name: 'r1',
        properties: [
            { key: '__name__', label: 'Name', kind: 'text', value: 'r1' },
            { key: 'Fill', label: 'Backcolor', kind: 'color', value: 'Red', options: ['Red', 'Green', 'Blue', 'Yellow'] }
        ],
        info: null, tabItems: [], listItems: []
    });
    const colRow = [...$('propsBody').children].find((r) => r.textContent.includes('Backcolor'));
    const dropBtn = colRow.querySelector('.color-drop');
    t.ok(!!dropBtn, 'palette', 'colour row has a palette button');
    t.ok(!colRow.querySelector('input[list]'), 'palette', 'colour text field no longer uses a <datalist>');
    posted.length = 0;
    dropBtn.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    let palette = $('colorPalette');
    t.ok(palette && palette.hidden === false, 'palette', 'clicking ▾ opens the palette popup');
    t.equal(palette.querySelectorAll('.cp-row').length, 4, 'palette', 'lists ALL preset colours');
    t.ok([...palette.querySelectorAll('.cp-row')].some((r) => r.textContent.includes('Green')), 'palette', 'a non-current colour is listed');
    // pick "Green" → setProperty posted + popup closes
    posted.length = 0;
    const greenRow = [...palette.querySelectorAll('.cp-row')].find((r) => r.textContent.includes('Green'));
    greenRow.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.equal(posted[posted.length - 1], { type: 'setProperty', name: 'r1', key: 'Fill', value: 'Green' }, 'palette', 'picking a colour posts setProperty');
    t.equal(palette.hidden, true, 'palette', 'popup closes after a pick');
    // A custom current value (not a preset) is shown on top so it's still visible/selectable.
    msg({
        type: 'properties', name: 'r2',
        properties: [
            { key: '__name__', label: 'Name', kind: 'text', value: 'r2' },
            { key: 'Fill', label: 'Backcolor', kind: 'color', value: '#336699', options: ['Red', 'Green'] }
        ],
        info: null, tabItems: [], listItems: []
    });
    const colRow2 = [...$('propsBody').children].find((r) => r.textContent.includes('Backcolor'));
    colRow2.querySelector('.color-drop').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    palette = $('colorPalette');
    t.equal(palette.querySelectorAll('.cp-row').length, 3, 'palette', 'custom current colour added on top of the presets');
    t.ok(palette.querySelectorAll('.cp-row')[0].textContent.includes('#336699'), 'palette', 'custom colour listed first');
    // Escape closes the popup (the webview listens for Escape on `document`)
    posted.length = 0;
    s.window.document.dispatchEvent(new s.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    t.equal(palette.hidden, true, 'palette', 'Escape closes the popup');
    // Scrolling INSIDE the popup's own list is allowed (that's how you reach colour #31); a scroll
    // anywhere else (e.g. the properties list) still closes it.
    const backRow = () => [...$('propsBody').children].find((r) => r.textContent.includes('Backcolor'));
    backRow().querySelector('.color-drop').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    palette = $('colorPalette');
    t.equal(palette.hidden, false, 'palette', 'reopened for the scroll test');
    palette.dispatchEvent(new s.window.Event('scroll', { bubbles: true }));
    t.equal(palette.hidden, false, 'palette', 'scrolling the popup list does NOT close it');
    $('propsBody').dispatchEvent(new s.window.Event('scroll', { bubbles: true }));
    t.equal(palette.hidden, true, 'palette', 'scrolling the properties list closes the popup');
    // When the property sits BELOW the vertical middle of the window the popup opens UPWARDS
    // (above the property) so it never runs off the bottom of the screen.
    const lowBtn = backRow().querySelector('.color-drop');
    lowBtn.getBoundingClientRect = () => ({ left: 100, top: 600, right: 126, bottom: 622, width: 26, height: 22, x: 100, y: 600 });
    const vh = s.window.innerHeight || 768;
    t.ok(600 > vh / 2, 'palette', 'stubbed trigger is below the vertical middle');
    lowBtn.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    palette = $('colorPalette');
    const upTop = parseFloat(palette.style.top);
    t.ok(palette.hidden === false && upTop < 600 && upTop >= 8, 'palette', 'below the middle: popup opens ABOVE the property');

    // --- Grid 'Rows & Columns' editor: opens, add row, edit size, save posts saveGridDefs ---
    msg({
        type: 'properties', name: 'g1',
        properties: [
            { key: '__name__', label: 'Name', kind: 'text', value: 'g1' },
            { key: 'Grid.Defs', label: 'Rows & Columns', kind: 'button', value: 'Edit rows & columns…' }
        ],
        gridDefs: { rows: ['Auto', '*'], cols: ['90'] },
        info: null, tabItems: [], listItems: []
    });
    const defsRow = [...$('propsBody').children].find((r) => r.textContent.includes('Rows & Columns'));
    t.ok(!!defsRow, 'grid', 'Rows & Columns button rendered');
    const gridModal = $('gridModal');
    defsRow.querySelector('.prop-button').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.equal(gridModal.hidden, false, 'grid', 'editor opens');
    t.equal($('gridRows').querySelectorAll('input').length, 2, 'grid', 'rows pre-filled');
    t.equal($('gridCols').querySelectorAll('input').length, 1, 'grid', 'cols pre-filled');
    // add a row → 3 rows
    $('gridAddRow').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.equal($('gridRows').querySelectorAll('input').length, 3, 'grid', 'add row');
    // edit the new row's size
    const inputs = $('gridRows').querySelectorAll('input');
    inputs[2].value = '2*';
    posted.length = 0;
    $('gridSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    const gd = posted[posted.length - 1];
    t.equal(gd.type, 'saveGridDefs', 'grid', 'saveGridDefs posted');
    t.equal(gd.name, 'g1', 'grid', 'save target');
    t.equal(JSON.stringify(gd.rows), '["Auto","*","2*"]', 'grid', 'rows saved');
    t.equal(JSON.stringify(gd.cols), '["90"]', 'grid', 'cols saved');
    t.equal(gridModal.hidden, true, 'grid', 'editor closes on save');
    // --- drag-to-re-cell: dragging a Grid child to another cell posts moveToCell + highlights ---
    msg(frame(
        [
            { name: 'g1', type: 'Grid', x: 50, y: 50, w: 300, h: 200, parent: null },
            { name: 'b1', type: 'Button', x: 50, y: 50, w: 150, h: 100, parent: 'g1' },
            { name: 'btn2', type: 'Button', x: 400, y: 50, w: 100, h: 30, parent: null }
        ],
        { g1: { v: [50, 200, 350], h: [50, 150, 250] } }
    ));
    const cellHighlight = $('cellHighlight');
    // select b1 (a direct Grid child) via the control-list dropdown — a canvas click right after
    // a drag is suppressed once, so the dropdown avoids that ambiguity.
    const cl = $('controlList');
    cl.value = 'b1';
    cl.dispatchEvent(new s.window.Event('change'));
    posted.length = 0;
    const pdRecell = new s.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 60, clientY: 60 });
    $('canvas').dispatchEvent(pdRecell);
    dispatch('pointermove', 'canvas', { clientX: 250, clientY: 200 }); // into cell (1,1)
    t.equal(cellHighlight.hidden, false, 'recell', 'target cell highlighted');
    t.ok(Math.abs(parseFloat(cellHighlight.style.left) - 200) < 1 && Math.abs(parseFloat(cellHighlight.style.top) - 150) < 1,
        'recell', 'highlight covers cell (1,1)', `${cellHighlight.style.left},${cellHighlight.style.top}`);
    dispatch('pointerup', 'canvas', { clientX: 250, clientY: 200 });
    const mc = posted.find((m) => m.type === 'moveToCell');
    t.ok(!!mc, 'recell', 'moveToCell posted on drop');
    t.equal(mc.name, 'b1', 'recell', 'target name');
    t.equal(mc.row, 1, 'recell', 'row = 1');
    t.equal(mc.col, 1, 'recell', 'col = 1');
    t.equal(cellHighlight.hidden, true, 'recell', 'highlight hidden after drop');

    // a control NOT in a Grid still drags as a plain move (no moveToCell)
    cl.value = 'btn2';
    cl.dispatchEvent(new s.window.Event('change'));
    posted.length = 0;
    const pdMove = new s.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 410, clientY: 60 });
    $('canvas').dispatchEvent(pdMove);
    dispatch('pointermove', 'canvas', { clientX: 420, clientY: 62 });
    dispatch('pointerup', 'canvas', { clientX: 420, clientY: 62 });
    t.equal(cellHighlight.hidden, true, 'recell', 'no highlight for non-grid child');
    t.ok(posted.some((m) => m.type === 'move'), 'recell', 'non-grid drag posts move');
    t.ok(!posted.some((m) => m.type === 'moveToCell'), 'recell', 'non-grid drag does NOT post moveToCell');

    // --- dot grid: toolbar toggles + overlay + settings popup + snap-to-grid ---
    {
        // toolbar buttons post the toggle messages
        posted.length = 0;
        $('btnDotGrid').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(posted[posted.length - 1].type, 'toggleDotGrid', 'dotgrid', 'Grid button posts toggleDotGrid');
        posted.length = 0;
        $('btnSnapGrid').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(posted[posted.length - 1].type, 'toggleSnapToGrid', 'dotgrid', 'Snap button posts toggleSnapToGrid');

        // a dotGrid message applies the overlay + toolbar active states
        msg({ type: 'dotGrid', dotGrid: { enabled: false, snap: true, spacingX: 16, spacingY: 16, color: '#111111', dotSize: 2 } });
        t.equal($('dotGrid').hidden, true, 'dotgrid', 'overlay hidden when disabled');
        t.equal($('btnDotGrid').classList.contains('tb-active'), false, 'dotgrid', 'Grid button inactive');
        t.equal($('btnSnapGrid').classList.contains('tb-active'), true, 'dotgrid', 'Snap button active');
        msg({ type: 'dotGrid', dotGrid: { enabled: true, snap: true, spacingX: 16, spacingY: 16, color: '#111111', dotSize: 2 } });
        t.equal($('dotGrid').hidden, false, 'dotgrid', 'overlay shown when enabled');
        t.ok($('dotGrid').style.backgroundImage.includes('radial-gradient'), 'dotgrid', 'overlay uses radial-gradient dots');
        t.equal($('dotGrid').style.backgroundSize, '16px 16px', 'dotgrid', 'spacing applied to background size');

        // settings popup: open → Save posts setDotGrid (values clamped)
        posted.length = 0;
        $('btnGridSettings').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('dotGridModal').hidden, false, 'dotgrid', 'settings opens');
        $('dotGridSpacingX').value = '24';
        $('dotGridSpacingY').value = '32';
        $('dotGridDotSize').value = '3';
        $('dotGridSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('dotGridModal').hidden, true, 'dotgrid', 'settings closes on save');
        const sd = posted[posted.length - 1];
        t.equal(sd.type, 'setDotGrid', 'dotgrid', 'posts setDotGrid');
        t.equal(sd.settings.spacingX, 24, 'dotgrid', 'spacingX saved');
        t.equal(sd.settings.spacingY, 32, 'dotgrid', 'spacingY saved');

        // snap-to-grid: with snap on, a drag posts a delta that lands the control on the grid
        msg({ type: 'dotGrid', dotGrid: { enabled: true, snap: true, spacingX: 16, spacingY: 16, color: '#111111', dotSize: 2 } });
        msg(frame([{ name: 'b1', type: 'Button', x: 10, y: 10, w: 100, h: 30 }]));
        const clg = $('controlList');
        clg.value = 'b1';
        clg.dispatchEvent(new s.window.Event('change'));
        posted.length = 0;
        const pdg = new s.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 20, clientY: 20 });
        $('canvas').dispatchEvent(pdg);
        dispatch('pointermove', 'canvas', { clientX: 25, clientY: 23 });
        dispatch('pointerup', 'canvas', { clientX: 25, clientY: 23 }); // raw +5,+3 → snapped to (16,16) → delta +6,+6
        const mv = posted.find((m) => m.type === 'move');
        t.ok(!!mv, 'dotgrid', 'move posted');
        t.equal(mv.dx, 6, 'dotgrid', 'move snaps dx to grid (10+5 → 16 → delta 6)');
        t.equal(mv.dy, 6, 'dotgrid', 'move snaps dy to grid (10+3 → 16 → delta 6)');

        // snap off → the raw delta is posted unchanged
        msg({ type: 'dotGrid', dotGrid: { enabled: true, snap: false, spacingX: 16, spacingY: 16, color: '#111111', dotSize: 2 } });
        posted.length = 0;
        const pdg2 = new s.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 20, clientY: 20 });
        $('canvas').dispatchEvent(pdg2);
        dispatch('pointermove', 'canvas', { clientX: 25, clientY: 23 });
        dispatch('pointerup', 'canvas', { clientX: 25, clientY: 23 });
        const mv2 = posted.find((m) => m.type === 'move');
        t.ok(!!mv2, 'dotgrid', 'move posted (snap off)');
        t.equal(mv2.dx, 5, 'dotgrid', 'raw dx when snap off');
        t.equal(mv2.dy, 3, 'dotgrid', 'raw dy when snap off');
    }

    // --- crosshair: one settings button + popup, styled lines, move/resize anchors ---
    {
        // A frame carrying the saved settings applies them to the layer + lines.
        msg(Object.assign(frame([]), { crosshair: { mode: 'short', shortLength: 50, thickness: 1, opacity: 100, color: '#ff4d4d' } }));
        $('crosshair').hidden = true;
        dispatch('pointermove', 'canvas', { clientX: 200, clientY: 150 });
        t.equal($('crosshair').hidden, false, 'ch', 'short: shown while hovering the canvas');
        t.equal($('chH').style.width, '50px', 'ch', 'short length 50 -> horizontal arm 50 px');
        t.equal($('chV').style.height, '50px', 'ch', 'short length 50 -> vertical arm 50 px');
        t.equal($('chH').style.background, 'rgb(255, 77, 77)', 'ch', 'line colour applied');
        // Crisp 1 px outline on EACH side (never wider), auto-contrast: red -> black outline.
        t.equal($('chH').style.boxShadow, '0 0 0 1px #000000', 'ch', 'auto-contrast crisp outline (red -> black)');
        // Long mode -> full-canvas lines.
        msg({ type: 'crosshair', crosshair: { mode: 'long', shortLength: 50, thickness: 1, opacity: 100, color: '#ff4d4d' } });
        dispatch('pointermove', 'canvas', { clientX: 200, clientY: 150 });
        t.equal($('chH').style.width, '800px', 'ch', 'long: horizontal arm spans the canvas');
        t.equal($('chV').style.height, '450px', 'ch', 'long: vertical arm spans the canvas');
        // Thickness / opacity / custom short length.
        msg({ type: 'crosshair', crosshair: { mode: 'short', shortLength: 80, thickness: 3, opacity: 40, color: '#ffffff' } });
        dispatch('pointermove', 'canvas', { clientX: 200, clientY: 150 });
        t.equal($('chH').style.width, '80px', 'ch', 'custom short length applied');
        t.equal($('chH').style.height, '3px', 'ch', 'thickness 3 applied to the horizontal arm');
        t.equal($('chV').style.width, '3px', 'ch', 'thickness 3 applied to the vertical arm');
        t.equal($('crosshair').style.opacity, '0.4', 'ch', 'opacity 40% applied');
        t.equal($('chH').style.background, 'rgb(255, 255, 255)', 'ch', 'white line colour applied');
        t.equal($('chH').style.boxShadow, '0 0 0 1px #000000', 'ch', 'white line keeps a dark outline');
        msg({ type: 'crosshair', crosshair: { mode: 'short', shortLength: 50, thickness: 1, opacity: 100, color: '#000000' } });
        dispatch('pointermove', 'canvas', { clientX: 200, clientY: 150 });
        t.equal($('chH').style.boxShadow, '0 0 0 1px #ffffff', 'ch', 'dark line -> white outline (auto-contrast)');
        dispatch('pointerleave', 'canvas', {});
        t.equal($('crosshair').hidden, true, 'ch', 'hidden when the pointer leaves the canvas');

        // --- settings popup: the single Crosshair button opens it prefilled; Save posts setCrosshair ---
        posted.length = 0;
        $('btnCrosshair').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('crosshairModal').hidden, false, 'ch', 'Crosshair button opens the settings popup');
        t.equal($('chModeShort').classList.contains('active'), true, 'ch', 'mode prefilled Short');
        t.equal($('chModeLong').classList.contains('active'), false, 'ch', 'Long not active');
        t.equal($('chThickness').value, '1', 'ch', 'thickness prefilled');
        t.equal($('chShortLength').value, '50', 'ch', 'short length prefilled');
        t.equal($('chOpacity').value, '100', 'ch', 'opacity prefilled');
        t.equal($('chColor').value, '#000000', 'ch', 'colour prefilled');
        // Toggle Long + edit the fields, then Save.
        $('chModeLong').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('chModeLong').classList.contains('active'), true, 'ch', 'Long toggled on');
        t.equal($('chModeShort').classList.contains('active'), false, 'ch', 'Short toggled off');
        $('chShortLength').value = '75';
        $('chThickness').value = '2';
        $('chOpacity').value = '60';
        $('chColor').value = '#00ff88';
        posted.length = 0;
        $('crosshairSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('crosshairModal').hidden, true, 'ch', 'popup closes on save');
        const sc = posted[posted.length - 1];
        t.equal(sc.type, 'setCrosshair', 'ch', 'posts setCrosshair');
        t.equal(sc.settings.mode, 'long', 'ch', 'mode saved');
        t.equal(sc.settings.shortLength, 75, 'ch', 'short length saved');
        t.equal(sc.settings.thickness, 2, 'ch', 'thickness saved');
        t.equal(sc.settings.opacity, 60, 'ch', 'opacity saved');
        t.equal(sc.settings.color, '#00ff88', 'ch', 'colour saved');
        // Cancel just closes without posting.
        posted.length = 0;
        $('btnCrosshair').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        $('crosshairCancel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('crosshairModal').hidden, true, 'ch', 'Cancel closes the popup');
        t.equal(posted.length, 0, 'ch', 'Cancel posts nothing');
    }

    // --- crosshair anchors while dragging: MOVE -> control top-left; RESIZE -> the drag handle ---
    {
        msg(frame([
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true, parent: 'Root' },
            { name: 'btn1', type: 'Button', x: 100, y: 50, w: 120, h: 36, parent: 'Body' }
        ]));
        const cl = $('controlList');
        cl.value = 'btn1';
        cl.dispatchEvent(new s.window.Event('change'));
        const sel = $('selection');
        t.equal(sel.hidden, false, 'ch-drag', 'btn1 selected (handles shown)');
        const nH = sel.querySelector('.handle.n');
        t.ok(!!nH, 'ch-drag', 'top handle present');

        // RESIZE from the TOP handle: grab at (160,50), drag up to (160,40) -> handle point = top-mid.
        const pdN = new s.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 160, clientY: 50 });
        nH.dispatchEvent(pdN);
        dispatch('pointermove', 'canvas', { clientX: 160, clientY: 40 });
        t.equal(parseFloat($('chV').style.left), 160, 'ch-drag', 'resize n: crosshair on the handle x (edge midpoint)');
        t.equal(parseFloat($('chH').style.top), 40, 'ch-drag', 'resize n: crosshair on the moved top edge');
        dispatch('pointerup', 'canvas', { clientX: 160, clientY: 40 });

        // MOVE: grab the button BODY and drag; the crosshair centres on the control's top-left corner.
        posted.length = 0;
        const pdM = new s.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 130, clientY: 70 });
        $('canvas').dispatchEvent(pdM); // inside btn1 -> mode move
        dispatch('pointermove', 'canvas', { clientX: 180, clientY: 110 }); // +50,+40 design px
        const mvX = parseFloat(sel.style.left); // 150
        const mvY = parseFloat(sel.style.top);  // 90
        t.ok(Math.abs(parseFloat($('chV').style.left) - mvX) < 0.01 && Math.abs(parseFloat($('chH').style.top) - mvY) < 0.01,
            'ch-drag', 'move: crosshair centres on the control top-left corner', `${$('chV').style.left},${$('chH').style.top}`);
        t.ok(Math.abs(parseFloat($('chV').style.left) - 180) > 1, 'ch-drag', 'move: crosshair does NOT follow the pointer x (180)');
        dispatch('pointerup', 'canvas', { clientX: 180, clientY: 110 });
    }

    // --- multi-select: Ctrl+Click toggles, marquee box-selects, alignment tools post ---
    {
        msg(frame([
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true },
            { name: 'txt1', type: 'TextBlock', x: 40, y: 40, w: 200, h: 24 },
            { name: 'btn1', type: 'Button', x: 100, y: 100, w: 120, h: 36 },
            { name: 'btn2', type: 'Button', x: 300, y: 200, w: 100, h: 30 },
            { name: 'chk1', type: 'CheckBox', x: 500, y: 300, w: 140, h: 28 }
        ]));
        const alignBtns = ['btnAlignLeft', 'btnAlignCentre', 'btnAlignRight', 'btnAlignTop', 'btnAlignMiddle', 'btnAlignBottom'];
        const allEdgeDisabled = () => alignBtns.every((id) => $(id).disabled);
        // Consume any leftover suppressClick from the earlier drag tests (the real browser fires a
        // click after pointerup, which is suppressed once), then start from a cleared selection.
        dispatch('click', 'canvas', { clientX: 5, clientY: 5 });
        $('btnClearSel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));

        // No selection → every alignment button is disabled.
        t.ok(allEdgeDisabled(), 'multisel', 'no selection → edge-align disabled');
        t.equal($('btnAlignText').disabled, true, 'multisel', 'no selection → Align Text disabled');

        // Ctrl+Click btn1 → single (anchor) selection; Align Text enabled (Button), edge-align still needs 2.
        posted.length = 0;
        dispatch('click', 'canvas', { clientX: 110, clientY: 110, ctrlKey: true });
        let last = posted[posted.length - 1];
        t.equal(last.type, 'select', 'multisel', 'Ctrl+Click posts select');
        t.equal(last.name, 'btn1', 'multisel', 'first Ctrl+Click is the anchor');
        t.ok(allEdgeDisabled(), 'multisel', 'one control → edge-align disabled');
        t.equal($('btnAlignText').disabled, false, 'multisel', 'Button is a text control → Align Text enabled');

        // Ctrl+Click btn2 → both selected; anchor stays btn1; edge-align now enabled.
        posted.length = 0;
        dispatch('click', 'canvas', { clientX: 320, clientY: 210, ctrlKey: true });
        last = posted[posted.length - 1];
        t.equal(last.name, 'btn1', 'multisel', 'anchor stays btn1');
        t.equal($('multiSel').children.length, 1, 'multisel', 'one non-anchor outline (btn2)');
        t.ok(alignBtns.every((id) => !$(id).disabled), 'multisel', 'two controls → edge-align enabled');

        // Clicking an edge-align button posts align with the anchor + all names.
        posted.length = 0;
        $('btnAlignLeft').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const al = posted[posted.length - 1];
        t.equal(al.type, 'align', 'multisel', 'Align Left posts align');
        t.equal(al.align, 'left', 'multisel', 'align kind = left');
        t.equal(al.anchor, 'btn1', 'multisel', 'anchor = first selected');
        t.equal(JSON.stringify(al.names), '["btn1","btn2"]', 'multisel', 'names carry both');

        // Centre alignment buttons match their labels (regression: they were swapped): "Align
        // VERTICAL centres…" (↕) aligns centre-X (kind 'centre' → a vertical line of centres);
        // "Align HORIZONTAL centres…" (↔) aligns centre-Y (kind 'middle' → a horizontal line).
        posted.length = 0;
        $('btnAlignMiddle').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const am = posted[posted.length - 1];
        t.equal(am.type, 'align', 'multisel', 'Align vertical centres posts align');
        t.equal(am.align, 'centre', 'multisel', 'vertical-centres button posts centre (centre-X)');
        posted.length = 0;
        $('btnAlignCentre').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const ac = posted[posted.length - 1];
        t.equal(ac.type, 'align', 'multisel', 'Align horizontal centres posts align');
        t.equal(ac.align, 'middle', 'multisel', 'horizontal-centres button posts middle (centre-Y)');

        // Align Text with the multi-selection posts alignText for both names.
        posted.length = 0;
        $('btnAlignText').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const at = posted[posted.length - 1];
        t.equal(at.type, 'alignText', 'multisel', 'Align Text posts alignText');
        t.equal(JSON.stringify(at.names), '["btn1","btn2"]', 'multisel', 'alignText names');

        // Make same Width/Height: with two selected Buttons the size buttons are enabled and post
        // the same 'align' message with a size kind (the extension resizes the non-anchor control).
        t.ok(!$('btnSameWidth').disabled && !$('btnSameHeight').disabled, 'multisel', 'two controls → same-size enabled');
        posted.length = 0;
        $('btnSameWidth').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const sw = posted[posted.length - 1];
        t.equal(sw.type, 'align', 'multisel', 'Same Width posts align');
        t.equal(sw.align, 'sameWidth', 'multisel', 'align kind = sameWidth');
        t.equal(sw.anchor, 'btn1', 'multisel', 'same-width anchor = first selected');
        t.equal(JSON.stringify(sw.names), '["btn1","btn2"]', 'multisel', 'same-width names carry both');
        posted.length = 0;
        $('btnSameHeight').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const sh = posted[posted.length - 1];
        t.equal(sh.type, 'align', 'multisel', 'Same Height posts align');
        t.equal(sh.align, 'sameHeight', 'multisel', 'align kind = sameHeight');

        // Ctrl+Click btn1 again removes it → only btn2 remains, promoted to anchor; edge-align disabled.
        posted.length = 0;
        dispatch('click', 'canvas', { clientX: 110, clientY: 110, ctrlKey: true });
        last = posted[posted.length - 1];
        t.equal(last.name, 'btn2', 'multisel', 'removing the anchor promotes btn2');
        t.equal($('multiSel').children.length, 0, 'multisel', 'no non-anchor outlines');
        t.ok(allEdgeDisabled(), 'multisel', 'back to one control → edge-align disabled');

        // Marquee: drag a box over the empty Body from (20,20) to (400,260) → selects txt1, btn1,
        // btn2 (intersecting); chk1 (500,300) and the locked Body are excluded. The anchor is the
        // control nearest the box's top-left = txt1.
        $('btnClearSel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.ok(allEdgeDisabled(), 'multisel', 'cleared selection disables edge-align');
        posted.length = 0;
        const pdm = new s.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 20, clientY: 20 });
        $('canvas').dispatchEvent(pdm);
        dispatch('pointermove', 'canvas', { clientX: 400, clientY: 260 });
        t.equal($('marquee').hidden, false, 'multisel', 'marquee box drawn during drag');
        dispatch('pointerup', 'canvas', { clientX: 400, clientY: 260 });
        const selM = posted.filter((m) => m.type === 'select').pop();
        t.ok(!!selM, 'multisel', 'marquee posts select');
        t.equal(selM.name, 'txt1', 'multisel', 'marquee anchor = nearest to box top-left');
        t.equal($('marquee').hidden, true, 'multisel', 'marquee hidden after drop');
        t.equal($('multiSel').children.length, 2, 'multisel', 'two non-anchor outlines (btn1, btn2)');
        t.ok(alignBtns.every((id) => !$(id).disabled), 'multisel', 'three selected → edge-align enabled');

        // Consume the browser click that follows the marquee drag, then a plain click on txt1
        // collapses the multi-selection back to a single selection.
        dispatch('click', 'canvas', { clientX: 400, clientY: 260 });
        dispatch('click', 'canvas', { clientX: 45, clientY: 45 });
        t.equal($('multiSel').children.length, 0, 'multisel', 'plain click clears multi');
        t.ok(allEdgeDisabled(), 'multisel', 'single selection disables edge-align');

        // Lines have no Width/Height (their size is the Start/End geometry), so selecting only
        // Lines disables the same-size buttons even with two selected (edge-align stays enabled).
        msg(frame([
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true },
            { name: 'Line1', type: 'Line', x: 40, y: 40, w: 120, h: 80 },
            { name: 'Line2', type: 'Line', x: 200, y: 120, w: 100, h: 60 }
        ]));
        dispatch('click', 'canvas', { clientX: 5, clientY: 5 }); // consume any leftover suppressClick
        $('btnClearSel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        dispatch('click', 'canvas', { clientX: 50, clientY: 50, ctrlKey: true }); // Line1
        dispatch('click', 'canvas', { clientX: 220, clientY: 130, ctrlKey: true }); // Line2
        t.ok($('btnSameWidth').disabled && $('btnSameHeight').disabled, 'multisel', 'two Lines → same-size disabled (no Width/Height)');
        t.ok(alignBtns.every((id) => !$(id).disabled), 'multisel', 'two Lines → edge-align still enabled');
    }

    // --- shape drag-point handles: a Line shows its 2 ENDS; an Arc shows CENTRE + 2 ENDS ---
    {
        msg(frame([
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true },
            {
                name: 'L1', type: 'Line', x: 100, y: 80, w: 120, h: 80,
                handles: [{ kind: 'start', x: 100, y: 80 }, { kind: 'end', x: 220, y: 160 }]
            },
            {
                name: 'A1', type: 'Arc', x: 300, y: 80, w: 100, h: 100,
                handles: [{ kind: 'centre', x: 350, y: 130 }, { kind: 'start', x: 400, y: 130 }, { kind: 'end', x: 350, y: 180 }]
            }
        ]));
        const cl = $('controlList');
        const selBox = $('selection');

        // Line: selecting it shows 2 .shape-handle dots (no 8 resize handles) at its ends.
        cl.value = 'L1';
        cl.dispatchEvent(new s.window.Event('change'));
        t.equal(selBox.querySelectorAll('.shape-handle').length, 2, 'shape-pts', 'Line shows 2 end handles');
        t.equal(selBox.querySelectorAll('.handle').length, 0, 'shape-pts', 'Line has NO 8 resize handles');
        t.equal(selBox.classList.contains('shape-line'), true, 'shape-pts', 'Line selection marked shape-line');
        // drag the END handle → posts setLineEnd with the total delta (the other end stays anchored)
        posted.length = 0;
        const endHandle = selBox.querySelector('.shape-handle.end');
        const pdSh = new s.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 220, clientY: 160 });
        endHandle.dispatchEvent(pdSh);
        dispatch('pointermove', 'canvas', { clientX: 250, clientY: 180 });
        dispatch('pointerup', 'canvas', { clientX: 250, clientY: 180 });
        const sle = posted.find((m) => m.type === 'setLineEnd');
        t.ok(!!sle, 'shape-pts', 'Line end drag posts setLineEnd');
        t.equal(sle.name, 'L1', 'shape-pts', 'setLineEnd name');
        t.equal(sle.end, 'end', 'shape-pts', 'setLineEnd end kind');
        t.ok(Math.abs(sle.dx - 30) < 1e-6 && Math.abs(sle.dy - 20) < 1e-6, 'shape-pts', `setLineEnd delta (${sle.dx},${sle.dy})`);

        // Arc: selecting it shows 3 handles; dragging an end posts setArcEnd; centre → setArcRadius.
        cl.value = 'A1';
        cl.dispatchEvent(new s.window.Event('change'));
        t.equal(selBox.querySelectorAll('.shape-handle').length, 3, 'shape-pts', 'Arc shows 3 handles');
        t.equal(selBox.classList.contains('shape-arc'), true, 'shape-pts', 'Arc selection marked shape-arc');
        // drag the Arc START end → posts setArcEnd with the pointer position
        posted.length = 0;
        const arcStart = selBox.querySelector('.shape-handle.start');
        const pdArc = new s.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 400, clientY: 130 });
        arcStart.dispatchEvent(pdArc);
        dispatch('pointermove', 'canvas', { clientX: 380, clientY: 105 });
        dispatch('pointerup', 'canvas', { clientX: 380, clientY: 105 });
        const sae = posted.find((m) => m.type === 'setArcEnd');
        t.ok(!!sae, 'shape-pts', 'Arc end drag posts setArcEnd');
        t.equal(sae.end, 'start', 'shape-pts', 'setArcEnd kind');
        t.ok(Math.abs(sae.x - 380) < 1e-6 && Math.abs(sae.y - 105) < 1e-6, 'shape-pts', 'setArcEnd pointer coords');
        // drag the Arc CENTRE → shows the radius guide line, posts setArcRadius
        posted.length = 0;
        const arcCentre = selBox.querySelector('.shape-handle.centre');
        const pdArcC = new s.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 350, clientY: 130 });
        arcCentre.dispatchEvent(pdArcC);
        dispatch('pointermove', 'canvas', { clientX: 420, clientY: 200 });
        t.equal($('radiusGuide').hidden, false, 'shape-pts', 'radius guide shown while dragging the centre');
        dispatch('pointerup', 'canvas', { clientX: 420, clientY: 200 });
        const sar = posted.find((m) => m.type === 'setArcRadius');
        t.ok(!!sar, 'shape-pts', 'Arc centre drag posts setArcRadius');
        t.equal($('radiusGuide').hidden, true, 'shape-pts', 'radius guide hidden after drop');
        t.ok(Math.abs(sar.x - 420) < 1e-6 && Math.abs(sar.y - 200) < 1e-6, 'shape-pts', 'setArcRadius pointer coords');
    }

    // --- hit-testing is HIERARCHY-aware: shapes stay clickable where visible ---
    // A TextBox first, then a Rectangle (ZIndex=-1) over it. The shape renders behind, so:
    //   - the OVERLAP selects the TextBox (sibling z: 0 > -1);
    //   - the shape's EXPOSED area selects the SHAPE — it must NOT lose to its OWN ancestors
    //     (the locked Body canvas fills the form at z=0 and would otherwise steal every click);
    //   - empty space selects the FORM (the unnamed Window root — its props resize the surface).
    {
        msg(frame([
            { name: null, type: 'Window', x: 0, y: 0, w: 800, h: 450, parent: null },
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true, parent: 'Root' },
            { name: 'txtA', type: 'TextBox', x: 100, y: 80, w: 200, h: 40, zIndex: 0, parent: 'Body' },
            { name: 'rectB', type: 'Rectangle', x: 120, y: 60, w: 160, h: 120, zIndex: -1, parent: 'Body' }
        ]));
        dispatch('click', 'canvas', { clientX: 5, clientY: 5 }); // consume any leftover suppressClick
        $('btnClearSel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        // overlap (both txtA and rectB contain the point) → the TextBox (z=0) wins
        dispatch('click', 'canvas', { clientX: 150, clientY: 100 });
        t.equal(posted[posted.length - 1].type, 'select', 'z-hit', 'click posts select');
        t.equal(posted[posted.length - 1].name, 'txtA', 'z-hit', 'overlap → TextBox (z=0) beats the ZIndex=-1 shape');
        // the shape's EXPOSED area (below the textbox) → the SHAPE wins, NOT the Body ancestor
        posted.length = 0;
        dispatch('click', 'canvas', { clientX: 150, clientY: 160 });
        t.equal(posted[posted.length - 1].name, 'rectB', 'z-hit', 'exposed shape is clickable (not stolen by the Body ancestor)');
        // empty space → the FORM (Window root, name null) — NOT the locked Body
        posted.length = 0;
        dispatch('click', 'canvas', { clientX: 500, clientY: 300 });
        t.equal(posted[posted.length - 1].type, 'select', 'z-hit', 'empty click posts select');
        t.equal(posted[posted.length - 1].name, null, 'z-hit', 'empty space selects the form (Window)');

        // equal ZIndex siblings: the LATER one wins (collection order = paint order for ties)
        msg(frame([
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true, parent: 'Root' },
            { name: 'a1', type: 'Button', x: 100, y: 80, w: 120, h: 40, zIndex: 0, parent: 'Body' },
            { name: 'b2', type: 'Button', x: 120, y: 90, w: 120, h: 40, zIndex: 0, parent: 'Body' }
        ]));
        $('btnClearSel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        dispatch('click', 'canvas', { clientX: 150, clientY: 100 });
        t.equal(posted[posted.length - 1].name, 'b2', 'z-hit', 'equal ZIndex → later (b2) wins');

        // a shape brought FORWARD (ZIndex=1) beats a z=0 sibling over it
        msg(frame([
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true, parent: 'Root' },
            { name: 'txtC', type: 'TextBox', x: 100, y: 80, w: 200, h: 40, zIndex: 0, parent: 'Body' },
            { name: 'rectD', type: 'Rectangle', x: 120, y: 60, w: 160, h: 120, zIndex: 1, parent: 'Body' }
        ]));
        $('btnClearSel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        dispatch('click', 'canvas', { clientX: 150, clientY: 100 });
        t.equal(posted[posted.length - 1].name, 'rectD', 'z-hit', 'a shape brought forward (z=1) wins over a z=0 sibling');
    }

    // --- the SAME z/hierarchy behaviour holds for an ELLIPSE over a covered control ---
    // A Button first, then an Ellipse (ZIndex=-1) over it: the overlap must select the Button
    // (z=0 beats the behind-shape); the ellipse's EXPOSED area must select the ellipse (not the
    // Body ancestor); the ellipse must NEVER steal a click from the control it covers.
    {
        msg(frame([
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true, parent: 'Root' },
            { name: 'btnA', type: 'Button', x: 100, y: 80, w: 200, h: 60, zIndex: 0, parent: 'Body' },
            { name: 'ellB', type: 'Ellipse', x: 140, y: 60, w: 160, h: 160, zIndex: -1, parent: 'Body' }
        ]));
        $('btnClearSel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        // overlap (both contain the point) → the Button (z=0) wins, NOT the covering Ellipse
        dispatch('click', 'canvas', { clientX: 180, clientY: 110 });
        t.equal(posted[posted.length - 1].name, 'btnA', 'z-hit-ellipse', 'ellipse does NOT steal the covered control (Button z=0 wins)');
        // the ellipse's EXPOSED area (below the button) → the ellipse wins, not the Body ancestor
        posted.length = 0;
        dispatch('click', 'canvas', { clientX: 180, clientY: 190 });
        t.equal(posted[posted.length - 1].name, 'ellB', 'z-hit-ellipse', 'exposed ellipse is clickable (not stolen by Body ancestor)');
        // A Rectangle placed LATER over an Ellipse (both shapes z=-1, tie → later wins) — the
        // earlier Ellipse is only clickable on its exposed area, mirroring overlapping shapes.
        msg(frame([
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true, parent: 'Root' },
            { name: 'ellC', type: 'Ellipse', x: 140, y: 60, w: 160, h: 160, zIndex: -1, parent: 'Body' },
            { name: 'rectD', type: 'Rectangle', x: 180, y: 100, w: 120, h: 80, zIndex: -1, parent: 'Body' }
        ]));
        $('btnClearSel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        dispatch('click', 'canvas', { clientX: 220, clientY: 140 }); // inside both shapes
        t.equal(posted[posted.length - 1].name, 'rectD', 'z-hit-ellipse', 'later shape wins over an earlier shape (equal z)');
        posted.length = 0;
        dispatch('click', 'canvas', { clientX: 160, clientY: 80 }); // ellipse exposed above the rect
        t.equal(posted[posted.length - 1].name, 'ellC', 'z-hit-ellipse', 'earlier shape selectable on its exposed area');
    }
    t.note('T3 done');
};
