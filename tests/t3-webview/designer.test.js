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
    'toolbar',
    'propsBody', 'propsEmpty', 'controlList', 'btnUndo', 'btnRedo', 'btnNewForm', 'btnRefresh', 'btnCodeFix', 'btnViewLog', 'btnBackup', 'btnZoomIn', 'btnZoomOut', 'btnFit', 'btnClearSel',
    // Linux-only in the real webview: the extension omits them elsewhere (see setup's `omit`).
    'btnPublish', 'btnInstall',
    'menuDummies',
    'contextMenu', 'ctxDelete', 'ctxCut', 'ctxCopy', 'ctxPaste', 'ctxMoveToContainer', 'ctxAddEvent',
    'eventModal', 'eventTitle', 'eventHint', 'eventList', 'eventRemember', 'eventRememberWrap', 'eventSkip', 'eventWire',
    'sliceModal', 'sliceTitle', 'sliceList', 'sliceFields', 'sliceHead', 'sliceAdd', 'sliceDel', 'sliceSave', 'sliceCancel',
    'dataModal', 'dataTitle', 'dataKind', 'dataFields', 'dataHead', 'dataSave', 'dataCancel',
    'handlerModal', 'handlerTitle', 'handlerHint', 'handlerList', 'handlerAdd', 'handlerClose',
    'btnCodeSettings', 'settingsModal', 'settingsHint', 'settingsModes', 'settingsBadges', 'settingsSave', 'settingsCancel',
    // the dialog's own "still arriving" marker (2026-09-17), left of Cancel/Save
    'settingsBusy',
    // the AI assist section of that panel (2026-09-15): switch, model list, load options, actions
    'aiEnabled', 'aiShowDiff', 'aiShowDiffHint', 'aiBadge', 'aiBody', 'aiModel', 'aiModelHint', 'aiRefresh', 'aiScan',
    'aiOptions', 'aiContext', 'aiGpu', 'aiTtl', 'aiMaxTokens', 'aiTimeout', 'aiEndpoint',
    'aiOptContext', 'aiOptGpu', 'aiOptTtl', 'aiOptAddress',
    'aiConvText', 'aiLearnConventions',
    'aiLoad', 'aiUnload', 'aiRemove', 'aiStatus', 'aiProgress', 'aiStatusText',
    // the host check's verdict in that section (2026-09-17): the reason, the tight-memory warning, the escape
    'aiHostBlocked', 'aiHostWarning', 'aiHostOverride',
    // the user's own llama-server row (2026-09-17): how to start it, the two buttons, who started it
    'aiLlamaTarget', 'aiLlamaStart', 'aiLlamaStop', 'aiLlamaOwner',
    'helpPanel', 'helpTitle', 'helpBody', 'btnToggleHelp', 'propsToggleRow', 'chkAdvanced',
    'itemsModal', 'itemsText', 'itemsSave', 'itemsCancel',
    'gridModal', 'gridRows', 'gridCols', 'gridAddRow', 'gridAddCol', 'gridSave', 'gridCancel',
    'menuModal', 'menuTitle', 'menuBody', 'menuAddTop', 'menuSave', 'menuCancel',
    'treeModal', 'treeTitle', 'treeBody', 'treeAdd', 'treeCancel', 'treeSave',
    'statusModal', 'statusTitle', 'statusBody', 'statusAdd', 'statusSave', 'statusCancel',
    'splitModal', 'splitTitle', 'splitZones', 'splitCols', 'splitRows', 'splitPanesRow', 'splitPanesLabel', 'splitCount', 'splitMinus', 'splitPlus', 'splitSave', 'splitCancel',
    'splitterModal', 'splitterTitle', 'splitterBody', 'splitterSave', 'splitterCancel',
    'dgModal', 'dgTitle', 'dgHint', 'dgBody', 'dgSave', 'dgCancel',
    'seriesModal', 'seriesTitle', 'seriesList', 'seriesFields', 'seriesHead',
    'seriesAdd', 'seriesDel', 'seriesUp', 'seriesDown', 'seriesSave', 'seriesCancel',
    'axisModal', 'axisTitle', 'axisList', 'axisFields', 'axisHead', 'axisAdd', 'axisDel', 'axisSave', 'axisCancel',
    'legendModal', 'legendTitle', 'legendBody', 'legendSave', 'legendCancel',
    'gradientModal', 'gradientTitle', 'gradientBody', 'gradientSave', 'gradientCancel',
    'cursorModal', 'cursorTitle', 'cursorList', 'cursorFields', 'cursorSettings', 'cursorHead',
    'cursorAdd', 'cursorDel', 'cursorSave', 'cursorCancel',
    'codeModal', 'codeHint', 'codeBody', 'codeRecheck', 'codeFixAll', 'codeClose',
    'cellHighlight',
    'btnDotGrid', 'btnSnapGrid', 'btnGridSettings', 'dotGrid',
    'dotGridModal', 'dotGridSpacingX', 'dotGridSpacingY', 'dotGridColor', 'dotGridDotSize',
    'dotGridSave', 'dotGridCancel',
    'multiSel', 'marquee', 'radiusGuide', 'splitGuide',
    'btnAlignLeft', 'btnAlignCentre', 'btnAlignRight', 'btnAlignTop', 'btnAlignMiddle', 'btnAlignBottom',
    'btnAlignText', 'btnSameWidth', 'btnSameHeight', 'btnEqualV', 'btnEqualH',
    'crosshair', 'chH', 'chV', 'btnCrosshair',
    'crosshairModal', 'chModeShort', 'chModeLong', 'chShortLength', 'chThickness', 'chOpacity',
    'chColor', 'crosshairSave', 'crosshairCancel',
    'rulerH', 'rulerV'];

/**
 * Builds the webview DOM + script. `omit` skips ids the extension does not emit on every platform —
 * the publish/install buttons only exist on Linux, so the script must still load (and keep working)
 * when they are missing.
 */
function setup(omit = []) {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
        runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/'
    });
    const { window } = dom;

    const tagFor = (id) => {
        if (id === 'preview') return 'img';
        if (id === 'controlList') return 'select';
        if (id === 'itemsText') return 'textarea';
        if (id === 'eventRemember') return 'input';
        if (id === 'eventSkip' || id === 'eventWire') return 'button';
        if (id === 'handlerAdd' || id === 'handlerClose') return 'button';
        if (id === 'settingsBadges') return 'input';
        if (id === 'settingsSave' || id === 'settingsCancel') return 'button';
        if (id === 'settingsBusy') return 'span';
        if (id === 'aiEnabled') return 'input';
        if (id === 'aiShowDiff') return 'input';
        if (id === 'aiBody' || id === 'aiOptions') return 'div';
        if (id.startsWith('aiOpt')) return 'div'; // the option rows the panel hides per runtime
        if (id === 'aiModel' || id === 'aiGpu' || id === 'aiTtl') return 'select';
        if (id === 'aiContext' || id === 'aiMaxTokens' || id === 'aiTimeout' || id === 'aiEndpoint') return 'input';
        if (id === 'aiStatusText' || id === 'aiProgress' || id === 'aiBadge' || id === 'aiModelHint') return 'div';
        // The host check's reason and warning are paragraphs in the real markup, and the escape is a button.
        if (id === 'aiHostBlocked' || id === 'aiHostWarning') return 'p';
        if (id === 'aiHostOverride') return 'button';
        // The llama-server row: a dropdown, two buttons, and the sentence that answers "who started it?".
        if (id === 'aiLlamaTarget') return 'select';
        if (id === 'aiLlamaStart' || id === 'aiLlamaStop') return 'button';
        if (id === 'aiLlamaOwner') return 'p';
        if (id === 'aiLoad' || id === 'aiUnload' || id === 'aiRemove' || id === 'aiStatus' || id === 'aiRefresh' || id === 'aiScan' || id === 'aiLearnConventions') return 'button';
        if (id.startsWith('dotGridSpacing') || id === 'dotGridColor' || id === 'dotGridDotSize') return 'input';
        if (id === 'gridAddRow' || id === 'gridAddCol' || id === 'gridSave' || id === 'gridCancel'
            || id === 'dotGridSave' || id === 'dotGridCancel'
            || id === 'chModeShort' || id === 'chModeLong'
            || id === 'crosshairSave' || id === 'crosshairCancel'
            || id === 'menuSave' || id === 'menuCancel' || id === 'menuAddTop'
            || id === 'statusSave' || id === 'statusCancel' || id === 'statusAdd'
            || id === 'splitZones' || id === 'splitCols' || id === 'splitRows' || id === 'splitMinus' || id === 'splitPlus'
            || id === 'splitSave' || id === 'splitCancel'
            || id === 'splitterSave' || id === 'splitterCancel'
            || id === 'dgSave' || id === 'dgCancel'
            || id === 'gradientSave' || id === 'gradientCancel'
            || id === 'codeRecheck' || id === 'codeFixAll' || id === 'codeClose') return 'button';
        if (id === 'splitCount') return 'input';
        if (id === 'chShortLength' || id === 'chThickness' || id === 'chOpacity' || id === 'chColor') return 'input';
        if (id.startsWith('btn') || id.startsWith('ctx')) return 'button';
        return 'div';
    };
    const make = (id) => {
        const el = window.document.createElement(tagFor(id));
        el.id = id;
        // The option rows carry a `.ai-hint` span in the real panel markup and the webview writes into it.
        // Without the child here, `applyKindToOptions` threw a TypeError on *every* state message — jsdom
        // reported it as uncaught and the rest of the state application was quietly skipped, so this whole
        // path went unasserted from 0.9.16 until 2026-09-15.
        if (id.startsWith('aiOpt')) {
            const hint = window.document.createElement('span');
            hint.className = 'ai-hint';
            el.appendChild(hint);
        }
        // Mirror the two publish buttons as the extension emits them: Install starts DISABLED (nothing has
        // been published until the extension reports a state), Publish is always available.
        if (id === 'btnInstall') {
            el.disabled = true;
            el.title = 'Checking whether the app has been published…';
        }
        return el;
    };

    // Mirror the real webview DOM: #canvasWrap > #canvas > #preview + #dotGrid + #overlayLayer +
    // #selection + #multiSel + #marquee, so handle events bubble up to the canvas's pointer
    // listeners exactly like the real page.
    const wrap = make('canvasWrap');
    const canvas = make('canvas');
    wrap.appendChild(canvas);
    canvas.appendChild(make('preview'));
    canvas.appendChild(make('dotGrid'));
    canvas.appendChild(make('overlayLayer'));
    canvas.appendChild(make('menuDummies'));
    canvas.appendChild(make('multiSel'));
    canvas.appendChild(make('marquee'));
    canvas.appendChild(make('radiusGuide'));
    canvas.appendChild(make('selection'));
    canvas.appendChild(make('crosshair'));
    canvas.appendChild(make('chH'));
    canvas.appendChild(make('chV'));
    window.document.body.appendChild(wrap);
    for (const id of IDS.filter((i) => i !== 'canvasWrap' && i !== 'canvas' && i !== 'preview' && i !== 'overlayLayer' && i !== 'selection' && i !== 'dotGrid' && i !== 'multiSel' && i !== 'marquee' && i !== 'radiusGuide' && i !== 'crosshair' && i !== 'chH' && i !== 'chV' && i !== 'menuDummies' && !omit.includes(i))) {
        window.document.body.appendChild(make(id));
    }

    // In-memory stand-in for the webview's VS Code state (the Properties fold memory lives here).
    const vscodeState = {};
    const posted = [];
    window.acquireVsCodeApi = () => ({
        postMessage: (m) => posted.push(m),
        getState: () => vscodeState,
        setState: (next) => { for (const k of Object.keys(vscodeState)) delete vscodeState[k]; Object.assign(vscodeState, next); }
    });

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

    return { dom, window, posted, $, dispatch, msg, frame, vscodeState };
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

    // The fixture must mirror EVERY element media/designer.js looks up: a missing id makes
    // `$('…')` return null, the script throws at load time and this whole layer silently collapses
    // to a handful of actions (an added toolbar button once hid ~350 checks this way).
    const wantedIds = [...new Set([...fs.readFileSync(DESIGNER_JS, 'utf8').matchAll(/\$\('([A-Za-z0-9_]+)'\)/g)].map((m) => m[1]))];
    t.equal(wantedIds.filter((id) => IDS.includes(id) === false), [], 'fixture',
        'IDS covers every element designer.js uses');

    const css = fs.readFileSync(DESIGNER_CSS, 'utf8');
    t.ok(/pointer-events:\s*none/.test(css), 'css', 'selection box pointer-events:none (click-select fix)');
    // Properties sidebar: everything up to & including "Show advanced" stays pinned; ONLY the
    // property items list (#propsBody) scrolls (the panel itself no longer scrolls as a whole).
    t.ok(/#props\s*\{[^}]*overflow:\s*hidden/s.test(css), 'css', 'props panel does NOT scroll as a whole');
    t.ok(/#propsBody\s*\{[^}]*overflow-y:\s*auto/s.test(css), 'css', 'propsBody is the scrolling region');
    t.ok(/#propsToggleRow\s*\{[^}]*flex:\s*0\s+0\s+auto/s.test(css), 'css', 'Show advanced row stays pinned');
    // The Series/Axis/Legend/Cursor editors: a spinner field (Line Thickness, Marker Size, tick
    // lengths, legend margin …) must sit in the SAME rule as the text/select fields, stretch the same
    // way and carry min-width: 0. A number input's automatic minimum size is its intrinsic
    // ~20-character width (spinner included), so a fixed narrow flex-basis is ignored and the box
    // overflows the right edge of the row — the fields no longer line up.
    t.ok(/\.series-field input\[type='number'\][\s\S]{0,200}?\{[^}]*flex:\s*1\s+1\s+auto[^}]*min-width:\s*0/
        .test(css), 'css', 'series number fields share the text/select width rule (rows line up)');
    t.equal(/\.series-field input\[type='number'\]\s*\{[^}]*flex:\s*0\s+0\s+64px/.test(css), false, 'css',
        'no fixed 64px basis on a series number field (it would overflow the row)');

    const s = setup();
    const { $, dispatch, msg, frame, posted, vscodeState } = s;

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

    // --- overlays are PATCHED, not rebuilt (Phase 2d) ---
    // A frame used to clear the layer and re-create a div per control, so every drag frame threw
    // away and rebuilt every overlay node. The node for a control must now survive a re-render, and
    // the geometry must still follow the control.
    {
        const node = $('overlayLayer').querySelector('.ov[data-name="btn1"]');
        const left0 = node.style.left;
        msg(frame(controls.map((c) => (c.name === 'btn1' ? { ...c, x: 140 } : c))));
        const moved = $('overlayLayer').querySelector('.ov[data-name="btn1"]');
        t.ok(moved === node, 'overlay-patch', 'the overlay node is reused across frames');
        t.ok(moved.style.left !== left0, 'overlay-patch', 'and still follows the control');
        // A control that leaves the form must lose its node (nothing left floating over the canvas).
        msg(frame(controls.filter((c) => c.name !== 'btn2')));
        t.equal($('overlayLayer').querySelectorAll('.ov').length, 3, 'overlay-patch',
            'a dropped control loses its overlay');
        t.equal($('overlayLayer').querySelector('.ov[data-name="btn2"]'), null, 'overlay-patch',
            'and its node is removed');
        msg(frame(controls));
    }

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

    // --- arrow keys nudge the selection (the WHOLE selection moves together) ---
    // Nudges are COALESCED into one message per animation frame (refactor Phase 2): a held arrow key
    // auto-repeats ~20-30 times a second and each post used to mean a full host re-render plus a PNG
    // re-decode here. Every assertion below therefore waits a frame before inspecting what was posted.
    const waitFrame = () => new Promise((resolve) => setTimeout(resolve, 30));
    const key = (k, opts) => s.window.document.dispatchEvent(
        new s.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));

    // Single selection: ArrowRight posts a 1 px nudge for the selected control only.
    posted.length = 0;
    key('ArrowRight');
    await waitFrame();
    let nudge = posted.find((m) => m.type === 'nudge');
    t.ok(!!nudge && Array.isArray(nudge.names) && nudge.names.length === 1 && nudge.names[0] === 'btn1', 'nudge', 'ArrowRight nudges the selected control');
    t.equal(nudge && nudge.dx, 1, 'nudge', 'plain arrow = 1 px');
    t.equal(nudge && nudge.dy, 0, 'nudge', 'no vertical move for Right');

    // Key auto-repeat inside one frame collapses into ONE message carrying the total distance.
    posted.length = 0;
    key('ArrowRight'); key('ArrowRight'); key('ArrowRight');
    await waitFrame();
    const burst = posted.filter((m) => m.type === 'nudge');
    t.equal(burst.length, 1, 'nudge', 'a burst of key repeats posts a single nudge');
    t.equal(burst[0] && burst[0].dx, 3, 'nudge', 'carrying the summed distance');
    t.equal(burst[0] && burst[0].dy, 0, 'nudge', 'with no perpendicular drift');

    // Shift+ArrowUp = the coarse 10 px step.
    posted.length = 0;
    key('ArrowUp', { shiftKey: true });
    await waitFrame();
    nudge = posted.find((m) => m.type === 'nudge');
    t.ok(!!nudge, 'nudge', 'Shift+ArrowUp posts a nudge');
    t.equal(nudge && nudge.dx, 0, 'nudge', 'Shift+Up = no horizontal move');
    t.equal(nudge && nudge.dy, -10, 'nudge', 'Shift = 10 px step');

    // Multi-selection: ctrl+click btn2 (btn1 stays the anchor) → ArrowDown moves BOTH together.
    dispatch('click', 'canvas', { clientX: 320, clientY: 60, ctrlKey: true });
    posted.length = 0;
    key('ArrowDown');
    await waitFrame();
    nudge = posted.find((m) => m.type === 'nudge');
    t.ok(!!nudge && Array.isArray(nudge.names), 'nudge', 'ArrowDown after multi-select posts a nudge');
    t.equal(nudge.names.length, 2, 'nudge', 'both selected controls move together');
    t.ok(nudge.names.includes('btn1') && nudge.names.includes('btn2'), 'nudge', 'names = anchor + ctrl-clicked');
    t.equal(nudge.dy, 1, 'nudge', 'ArrowDown = 1 px down');
    t.equal(nudge.dx, 0, 'nudge', 'ArrowDown = no horizontal move');

    // Typing in a text field must NOT nudge (arrows are for the field's cursor). This waits a frame as
    // well, so it cannot pass merely because the message has not been posted yet.
    const someInput = s.window.document.createElement('input');
    s.window.document.body.appendChild(someInput);
    someInput.focus();
    posted.length = 0;
    someInput.dispatchEvent(new s.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    await waitFrame();
    t.ok(!posted.some((m) => m.type === 'nudge'), 'nudge', 'arrow in a text input does not nudge');
    someInput.remove();

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

    // --- toolbox drag: a webview drop with an EMPTY dataTransfer still places the armed tool ---
    // VS Code does not bridge the Toolbox TreeView's drag MIME types into a webview, so the
    // tag travels on the armTool message (fired on drag-start) and the drop handler falls back
    // to the armed tag when event.dataTransfer is empty — the path that makes drag work.
    msg({ type: 'armTool', tag: 'Button' });
    posted.length = 0;
    const dragEv = new s.window.MouseEvent('drop', { bubbles: true, cancelable: true, clientX: 300, clientY: 90 });
    dragEv.dataTransfer = { getData: () => '' }; // the real (empty) webview dataTransfer
    $('canvas').dispatchEvent(dragEv);
    const dragDrop = posted[posted.length - 1];
    t.equal(dragDrop.type, 'drop', 'toolbox-drag', 'posts drop from drag with empty dataTransfer');
    t.equal(dragDrop.tag, 'Button', 'toolbox-drag', 'armed tag used (VS Code did not bridge the MIME)');
    t.equal(Math.round(dragDrop.x), 300, 'toolbox-drag', 'x mapped to design coords');
    t.equal(Math.round(dragDrop.y), 90, 'toolbox-drag', 'y mapped to design coords');

    // --- an empty drop with no armed tool places nothing and tells the user ---
    posted.length = 0;
    const empty = new s.window.MouseEvent('drop', { bubbles: true, cancelable: true, clientX: 150, clientY: 80 });
    empty.dataTransfer = { getData: () => '' };
    $('canvas').dispatchEvent(empty);
    t.equal(posted.some((m) => m.type === 'drop'), false, 'empty-drop', 'no drop posted when unarmed and empty');
    t.equal($('status').textContent, 'Drag a control from the Toolbox view.', 'empty-drop', 'status explains the empty drop');

    // --- the drop that never comes (Electron on Wayland): the release is detected from the dragover stream ---
    // Reported 2026-09-26 on a native-Wayland VS Code: the drag highlights the canvas and the release does
    // nothing. dragover is proof the native drag reaches the webview, so the END of the drag is detected
    // instead of the drop: arm from a drag, hover, and the quiet stream after the release places the control.
    msg({ type: 'armTool', tag: 'Button', from: 'drag' });
    t.ok(/Release the drag on the canvas to place a Button/.test($('status').textContent || ''), 'drop-lost',
        'a DRAG-arm says so (a click-arm keeps the click wording)');
    posted.length = 0;
    const hover = new s.window.MouseEvent('dragover', { bubbles: true, cancelable: true, clientX: 300, clientY: 90 });
    hover.dataTransfer = { getData: () => '', types: [] };
    $('canvas').dispatchEvent(hover);
    t.equal(posted.filter((m) => m.type === 'drop').length, 0, 'drop-lost',
        'hovering posts nothing yet — the drag may still be cancelled');
    await new Promise((r) => setTimeout(r, 300));   // longer than the quiet-stream window
    const rescued = posted.filter((m) => m.type === 'drop');
    t.equal(rescued.length, 1, 'drop-lost', 'the quiet stream after the release places the armed control once');
    t.equal(rescued[0].tag, 'Button', 'drop-lost', 'with the armed tag');
    t.equal(`${Math.round(rescued[0].x)},${Math.round(rescued[0].y)}`, '300,90', 'drop-lost',
        'at the last point the drag was seen over the canvas');
    t.ok(posted.some((m) => m.type === 'webviewLog' && /drop event never arrived/.test(m.text)), 'drop-lost',
        'and says so in the log, so the platform is on record rather than guessed at');
    t.ok(posted.some((m) => m.type === 'webviewLog' && /dragover is arriving/.test(m.text)), 'drop-lost',
        'the log also records that dragover DID arrive — that is what rules a dead drag out');

    // --- a CLICK-armed tool must never be placed by that path ---
    msg({ type: 'armTool', tag: 'TextBox' });   // no `from`: the click-to-place arm
    posted.length = 0;
    const hover2 = new s.window.MouseEvent('dragover', { bubbles: true, cancelable: true, clientX: 120, clientY: 60 });
    hover2.dataTransfer = { getData: () => '', types: [] };
    $('canvas').dispatchEvent(hover2);
    await new Promise((r) => setTimeout(r, 300));
    t.equal(posted.filter((m) => m.type === 'drop').length, 0, 'drop-lost',
        'a click-armed tool waits for the click (the fallback is drag-only)');
    t.ok(/Click the canvas to place a TextBox/.test($('status').textContent || ''), 'drop-lost',
        'and the status still invites the click');

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
    // …but Add event… IS offered for the Body — a Canvas carries Loaded/pointer events like any control.
    t.equal($('ctxAddEvent').disabled, false, 'locked-menu', 'Add event enabled for the Body');

    // --- right-click → Add event… posts addEvent for a named control ---
    dispatch('contextmenu', 'canvas', { clientX: 110, clientY: 60 }); // hits btn1
    t.equal($('contextMenu').dataset.name, 'btn1', 'add-event', 'right-click selected btn1');
    t.equal($('ctxAddEvent').disabled, false, 'add-event', 'Add event enabled');
    posted.length = 0;
    $('ctxAddEvent').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.equal(posted[posted.length - 1].type, 'addEvent', 'add-event', 'posts addEvent');
    t.equal(posted[posted.length - 1].name, 'btn1', 'add-event', 'with the control name');
    t.equal($('contextMenu').hidden, true, 'add-event', 'the context menu closes');

    // --- the picker modal: place mode (default preselected, multi-select, remember) ---
    msg({ type: 'openEventPicker', mode: 'place', name: 'btn1', tag: 'Button', label: 'Button', defaultEvent: 'Click', events: ['Click', 'Tapped', 'Loaded'], wired: [] });
    t.equal($('eventModal').hidden, false, 'picker', 'the picker opens');
    t.ok(/btn1/.test($('eventTitle').textContent), 'picker', 'the title names the control');
    t.equal($('eventRememberWrap').hidden, false, 'picker', 'place mode offers the remember checkbox');
    const pickRows = [...$('eventList').querySelectorAll('.event-row')];
    t.equal(pickRows.length, 3, 'picker', 'one row per event');
    t.equal(pickRows[0].querySelector('.event-name').textContent, 'Click', 'picker', 'the first row is the first event');
    t.equal(pickRows[0].querySelector('input.event-pick').checked, true, 'picker', 'the default event is preselected');
    t.equal(pickRows[1].querySelector('input.event-pick').checked, false, 'picker', 'the others are not');
    t.equal(pickRows[0].querySelector('.event-handler').textContent, 'btn1_Click', 'picker', 'the handler name is previewed');
    t.equal($('eventWire').disabled, false, 'picker', 'Wire is enabled with the default ticked');
    pickRows[1].querySelector('input.event-pick').checked = true;
    pickRows[1].querySelector('input.event-pick').dispatchEvent(new s.window.Event('change'));
    t.equal($('eventWire').textContent, 'Wire 2 events', 'picker', 'the button reflects the count');
    posted.length = 0;
    $('eventWire').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    const wire = posted[posted.length - 1];
    t.equal(wire.type, 'wireEvents', 'picker', 'posts wireEvents');
    t.equal(wire.events.join(','), 'Click,Tapped', 'picker', 'both ticked events are sent');
    t.equal(wire.remember, false, 'picker', 'remember is off until ticked');
    t.equal($('eventModal').hidden, true, 'picker', 'the modal closes after wiring');

    // Skip = place the control without a handler (and it can remember that choice)
    msg({ type: 'openEventPicker', mode: 'place', name: 'btn2', tag: 'Button', label: 'Button', defaultEvent: 'Click', events: ['Click'], wired: [] });
    $('eventRemember').checked = true;
    posted.length = 0;
    $('eventSkip').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.equal(posted[posted.length - 1].type, 'skipEventPicker', 'picker', 'Skip posts skipEventPicker');
    t.equal(posted[posted.length - 1].remember, true, 'picker', 'the remember checkbox is carried');
    t.equal($('eventModal').hidden, true, 'picker', 'Skip closes the modal');

    // --- the picker modal: add mode (wired rows marked, ↗ Go to handler, Escape) ---
    msg({ type: 'openEventPicker', mode: 'add', name: 'btn1', tag: 'Button', label: 'Button', defaultEvent: 'Click', events: ['Click', 'Tapped'], wired: [{ event: 'Click', handler: 'btn1_Click' }] });
    const addRows = [...$('eventList').querySelectorAll('.event-row')];
    t.equal(addRows[0].classList.contains('wired'), true, 'picker-add', 'the wired row is marked');
    t.equal(addRows[0].querySelector('input.event-pick').disabled, true, 'picker-add', 'and cannot be picked again');
    t.equal(addRows[0].querySelector('input.event-pick').checked, false, 'picker-add', 'add mode preselects nothing');
    t.equal(addRows[0].querySelector('.event-wired').textContent, '✓ wired', 'picker-add', 'a ✓ wired badge is shown');
    t.equal(addRows[0].querySelector('.event-handler').textContent, 'btn1_Click', 'picker-add', 'the existing handler is named');
    t.equal($('eventRememberWrap').hidden, true, 'picker-add', 'remember is hidden when adding');
    t.ok(/Add event/.test($('eventTitle').textContent), 'picker-add', 'the title says Add event');
    posted.length = 0;
    addRows[0].querySelector('.event-goto').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.equal(posted[posted.length - 1].type, 'openHandler', 'picker-add', '↗ posts openHandler');
    t.equal(posted[posted.length - 1].handler, 'btn1_Click', 'picker-add', 'with the handler name');
    posted.length = 0;
    $('canvas').dispatchEvent(new s.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    t.equal($('eventModal').hidden, true, 'picker-add', 'Escape closes the picker');
    t.ok(posted.some((m) => m.type === 'skipEventPicker'), 'picker-add', 'Escape counts as Skip');

    // --- middle-click a control with SEVERAL wired handlers → the chooser lists them ---
    msg({
        type: 'openHandlerMenu', name: 'btn1', tag: 'Button', label: 'Button',
        wired: [{ event: 'Click', handler: 'btn1_Click' }, { event: 'Tapped', handler: 'btn1_Tapped' }, { event: 'Loaded', handler: 'btn1_Loaded' }]
    });
    t.equal($('handlerModal').hidden, false, 'handler-menu', 'the chooser opens');
    t.ok(/btn1/.test($('handlerTitle').textContent), 'handler-menu', 'the title names the control');
    t.ok(/3 event handlers/.test($('handlerHint').textContent), 'handler-menu', 'the hint counts the handlers');
    const handlerRows = [...$('handlerList').querySelectorAll('.handler-row')];
    t.equal(handlerRows.length, 3, 'handler-menu', 'one row per wired event');
    t.equal(handlerRows[0].querySelector('.event-name').textContent, 'Click', 'handler-menu', 'the event name is shown');
    t.equal(handlerRows[0].querySelector('.event-handler').textContent, 'btn1_Click', 'handler-menu', 'with its handler');
    t.equal(handlerRows[1].querySelector('.event-name').textContent, 'Tapped', 'handler-menu', 'order is kept');
    posted.length = 0;
    handlerRows[1].dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    const jump = posted[posted.length - 1];
    t.equal(jump.type, 'openHandler', 'handler-menu', 'clicking a row posts openHandler');
    t.equal(jump.handler, 'btn1_Tapped', 'handler-menu', 'with the chosen handler');
    t.equal(jump.event, 'Tapped', 'handler-menu', 'and its event name');
    t.equal(jump.name, 'btn1', 'handler-menu', 'for the right control');
    t.equal($('handlerModal').hidden, true, 'handler-menu', 'the chooser closes after the pick');

    // …and it offers a shortcut to wire another event
    msg({ type: 'openHandlerMenu', name: 'btn1', tag: 'Button', label: 'Button', wired: [{ event: 'Click', handler: 'btn1_Click' }, { event: 'Loaded', handler: 'btn1_Loaded' }] });
    posted.length = 0;
    $('handlerAdd').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.equal(posted[posted.length - 1].type, 'addEvent', 'handler-menu', 'Add event… posts addEvent');
    t.equal(posted[posted.length - 1].name, 'btn1', 'handler-menu', 'for the same control');
    t.equal($('handlerModal').hidden, true, 'handler-menu', 'and closes the chooser');

    // Escape closes it too
    msg({ type: 'openHandlerMenu', name: 'btn1', tag: 'Button', label: 'Button', wired: [{ event: 'Click', handler: 'a' }, { event: 'Loaded', handler: 'b' }] });
    $('canvas').dispatchEvent(new s.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    t.equal($('handlerModal').hidden, true, 'handler-menu', 'Escape closes the chooser');

    // --- a wired handler whose method is gone is marked ⚠ (in the picker and the chooser) ---
    msg({
        type: 'openEventPicker', mode: 'add', name: 'btn1', tag: 'Button', label: 'Button', defaultEvent: 'Click',
        events: ['Click', 'Tapped'],
        wired: [{ event: 'Click', handler: 'btn1_Click', missing: true }, { event: 'Tapped', handler: 'btn1_Tapped' }]
    });
    const missRows = [...$('eventList').querySelectorAll('.event-row')];
    t.equal(missRows[0].querySelector('.event-wired').textContent, '⚠ missing', 'missing-handler',
        'a deleted handler is shown as ⚠ missing, not ✓ wired');
    t.equal(missRows[0].querySelector('.event-wired').classList.contains('missing'), true, 'missing-handler',
        'and styled as missing');
    t.equal(missRows[1].querySelector('.event-wired').textContent, '✓ wired', 'missing-handler',
        'an existing handler still shows ✓ wired');
    $('eventSkip').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true })); // close (add mode)
    msg({
        type: 'openHandlerMenu', name: 'btn1', tag: 'Button', label: 'Button',
        wired: [{ event: 'Click', handler: 'btn1_Click', missing: true }, { event: 'Tapped', handler: 'btn1_Tapped' }]
    });
    const missMenuRows = [...$('handlerList').querySelectorAll('.handler-row')];
    t.equal(missMenuRows[0].querySelector('.event-wired').textContent, '⚠ recreate', 'missing-handler',
        'the middle-click chooser offers to recreate a deleted handler');
    t.equal(missMenuRows[1].querySelector('.event-wired').textContent, '↗', 'missing-handler',
        'while a live handler keeps the plain jump arrow');
    $('handlerClose').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));

    // --- Code Fix… findings: the primary Fix, the "keep my edit" alternative, and Fix all ---
    msg({
        type: 'codeIssues', file: 'MainWindow.axaml.vb', errors: 1, warnings: 0, backup: '',
        issues: [
            {
                id: 'insert-handler:Button1_Click:9', severity: 'error', fixable: true, line: 9, file: 'axaml',
                title: 'Button Click="Button1_Click" has no handler',
                detail: 'Insert an empty handler, or keep your delete and unwire the form.',
                alternatives: [
                    { label: 'Keep my delete — unwire it', detail: 'Removes Click="Button1_Click" from Button1.' },
                    { label: 'Leave it — keep my code', detail: 'Nothing is changed.' }
                ]
            },
            {
                id: 'rebuild-accessors:Button1:0', severity: 'warning', fixable: true, line: 0, file: 'code',
                title: 'Accessor for "Button1" is missing', detail: 'Rebuild it.',
                alternatives: [{ label: 'Leave it — keep my code', detail: 'Nothing is changed.' }]
            }
        ]
    });
    t.equal($('codeModal').hidden, false, 'code-issues', 'the findings modal opens');
    const codeRows = [...$('codeBody').querySelectorAll('.code-item')];
    t.equal(codeRows.length, 2, 'code-issues', 'one row per finding');
    const rowButtons = [...codeRows[0].querySelectorAll('.code-item-actions button')];
    t.equal(rowButtons.map((b) => b.textContent).join(' | '),
        'Go to line 9 | Fix | Keep my delete — unwire it | Leave it — keep my code', 'code-issues',
        'Go to line + Fix + one button per alternative');
    t.ok(/Removes Click/.test(rowButtons[2].title), 'code-issues', 'the alternative explains itself on hover');
    posted.length = 0;
    rowButtons[2].dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    const altPost = posted[posted.length - 1];
    t.equal(altPost.type, 'codeFix', 'code-issues', 'an alternative posts codeFix');
    t.equal(altPost.alt, 0, 'code-issues', 'with the alternative index');
    t.equal(altPost.id, 'insert-handler:Button1_Click:9', 'code-issues', 'for the right finding');
    posted.length = 0;
    rowButtons[1].dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.equal(posted[posted.length - 1].type, 'codeFix', 'code-issues', 'the primary Fix posts codeFix');
    t.equal('alt' in posted[posted.length - 1], false, 'code-issues', 'without an alternative index');
    const row2Buttons = [...codeRows[1].querySelectorAll('.code-item-actions button')];
    t.equal(row2Buttons.map((b) => b.textContent).join(' | '), 'Fix | Leave it — keep my code', 'code-issues',
        'a finding with one alternative shows two buttons (no Go to line when it has no line)');
    posted.length = 0;
    $('codeFixAll').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.equal(posted[posted.length - 1].type, 'codeFixAll', 'code-issues', 'Fix all is unchanged');
    $('codeClose').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.equal($('codeModal').hidden, true, 'code-issues', 'Close hides the findings');

    const ovBadges = () => [...$('overlayLayer').querySelectorAll('.ov-badge')];
    t.equal(ovBadges().length, 0, 'badges', 'no badges before any report');
    msg({ type: 'codeMarkers', markers: [{ name: 'btn1', severity: 'error', title: 'Button Click="btn1_Click" has no handler' }] });
    t.equal(ovBadges().length, 1, 'badges', 'one badge for the reported control');
    t.equal(ovBadges()[0].textContent, '⚠', 'badges', 'the badge is a ⚠');
    t.equal(ovBadges()[0].classList.contains('err'), true, 'badges', 'errors get the error style');
    t.ok(/no handler/.test(ovBadges()[0].title), 'badges', 'the tooltip carries the reason');
    const badgeHost = $('overlayLayer').querySelector('.ov[data-name="btn1"]');
    t.equal(badgeHost.contains(ovBadges()[0]), true, 'badges', 'it sits on the control\'s own overlay');
    t.equal($('overlayLayer').querySelector('.ov[data-name="btn2"]').querySelectorAll('.ov-badge').length, 0, 'badges',
        'other controls stay clean');
    msg({ type: 'codeMarkers', markers: [] });
    t.equal(ovBadges().length, 0, 'badges', 'an empty report clears the badges');

    // --- ⚙ Settings modal: four triggers + the badge switch, Save posts them ---
    // The extension answers the ⚙ button with the stored settings.
    const fillSettingsFromHost = () => msg({ type: 'codeSettings', mode: 'onReturn', badges: true });
    posted.length = 0;
    $('btnCodeSettings').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.equal(posted[posted.length - 1].type, 'openCodeSettings', 'settings', 'the button asks for the settings');
    t.equal($('settingsModal').hidden, true, 'settings', 'the modal waits for the answer');
    fillSettingsFromHost();
    t.equal($('settingsModal').hidden, false, 'settings', 'the answer opens the modal');
    const modeRadios = [...$('settingsModes').querySelectorAll('input')];
    t.equal(modeRadios.length, 4, 'settings', 'four re-check triggers offered');
    t.equal(modeRadios.map((r) => r.value).join(','), 'onReturn,onSave,onType,manual', 'settings', 'in trigger order');
    t.equal(modeRadios[0].checked, true, 'settings', 'the current mode is preselected');
    t.equal($('settingsBadges').checked, true, 'settings', 'badges on by default');
    modeRadios[2].checked = true;
    $('settingsBadges').checked = false;
    posted.length = 0;
    $('settingsSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    const savedSettings = posted[posted.length - 1];
    t.equal(savedSettings.type, 'saveCodeSettings', 'settings', 'Save posts saveCodeSettings');
    t.equal(savedSettings.mode, 'onType', 'settings', 'with the picked trigger');
    t.equal(savedSettings.badges, false, 'settings', 'and the badge switch');
    t.equal($('settingsModal').hidden, true, 'settings', 'and closes the modal');
    // The extension answers a Save with the same `codeSettings` message it uses to fill the panel. That echo
    // must NOT reopen it: reported on 2026-09-15 as "the panel briefly closes then opens again". Opening the
    // panel is a user action (the ⚙ button), filling it is not.
    msg({ type: 'codeSettings', mode: 'onReturn', badges: true });
    t.equal($('settingsModal').hidden, true, 'settings',
        'the settings the extension echoes back do not reopen the panel');
    t.equal($('settingsBadges').checked, true, 'settings', 'though they do refresh what it holds');
    // Cancel/Escape close without saving
    fillSettingsFromHost();
    posted.length = 0;
    $('canvas').dispatchEvent(new s.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    t.equal($('settingsModal').hidden, true, 'settings', 'Escape closes the settings');
    t.ok(posted.every((m) => m.type !== 'saveCodeSettings'), 'settings', 'without saving');
    // An open panel re-asks for the AI state when the user comes back to it: a local server loads its model
    // just-in-time when a request arrives, so the panel's own view can be overtaken while it sits there
    // (reported 2026-09-15). A closed panel must stay quiet, or every focus change would cost a scan.
    // The ⚙ button is what opens the panel — an echo of the settings alone does not (see above).
    $('btnCodeSettings').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    fillSettingsFromHost();
    t.equal($('settingsModal').hidden, false, 'settings', 'the panel is open for the focus test');
    posted.length = 0;
    s.window.dispatchEvent(new s.window.Event('focus'));
    t.equal(posted.some((m) => m.type === 'aiState'), true, 'settings',
        'an open panel re-asks for the AI state on focus');
    $('settingsCancel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.equal($('settingsModal').hidden, true, 'settings', 'Cancel closes the settings');
    posted.length = 0;
    s.window.dispatchEvent(new s.window.Event('focus'));
    t.equal(posted.some((m) => m.type === 'aiState'), false, 'settings', 'a closed panel stays quiet');

    // --- the ⚙ dialog's two sections fold, and the fold survives a close/reopen ---
    // The fixture is deliberately flat, so the two section wrappers are built here exactly as
    // `designerPanel.ts` emits them (a real markup guard lives in T2). Clicking the heading row folds a
    // section the way the Properties groups do; the body itself must not fold, or every click on a radio
    // inside it would close what you are clicking in.
    const sectionOf = (id) => $('settingsModal').querySelector(`.settings-section[data-section="${id}"]`);
    const headOf = (id) => sectionOf(id).querySelector('.settings-section-head');
    const bodyOf = (id) => sectionOf(id).querySelector('.settings-section-body');
    const arrowOf = (id) => headOf(id).querySelector('.settings-section-arrow');
    const clickOn = (el) => el.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    for (const id of ['codeCheck', 'aiAssist']) {
        const wrap = s.window.document.createElement('div');
        wrap.className = 'settings-section';
        wrap.setAttribute('data-section', id);
        const head = s.window.document.createElement('div');
        head.className = 'settings-section-head';
        head.setAttribute('role', 'button');
        const arrow = s.window.document.createElement('span');
        arrow.className = 'settings-section-arrow';
        head.appendChild(arrow);
        const body = s.window.document.createElement('div');
        body.className = 'settings-section-body';
        wrap.appendChild(head);
        wrap.appendChild(body);
        $('settingsModal').appendChild(wrap);
    }
    $('btnCodeSettings').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    fillSettingsFromHost();
    t.equal(bodyOf('codeCheck').hidden, true, 'folds', 'Code check starts folded — most visits are for the AI switch');
    t.equal(bodyOf('aiAssist').hidden, false, 'folds', 'AI assist starts expanded');
    t.equal(headOf('codeCheck').getAttribute('aria-expanded'), 'false', 'folds', 'and the folded row says so to a screen reader');
    t.equal(arrowOf('codeCheck').textContent, '▸', 'folds', 'with a ▸ arrow, like the folded Properties groups');
    clickOn(headOf('codeCheck'));
    t.equal(bodyOf('codeCheck').hidden, false, 'folds', 'clicking the heading opens the section');
    t.equal(arrowOf('codeCheck').textContent, '▾', 'folds', 'and the arrow turns down');
    t.equal(headOf('codeCheck').getAttribute('aria-expanded'), 'true', 'folds', 'aria-expanded follows');
    clickOn(bodyOf('codeCheck'));
    t.equal(bodyOf('codeCheck').hidden, false, 'folds', 'clicking *inside* the body does not fold it back');
    t.equal($('settingsModal').hidden, false, 'folds', 'and neither click closed the dialog');
    clickOn(headOf('aiAssist'));
    t.equal(bodyOf('aiAssist').hidden, true, 'folds', 'AI assist folds the same way');
    t.equal(s.vscodeState.settingsFolds && s.vscodeState.settingsFolds.aiAssist, true, 'folds',
        'the fold is remembered in the webview state, so the choice belongs to this tab');
    $('settingsCancel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    $('btnCodeSettings').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    fillSettingsFromHost();
    t.equal(bodyOf('codeCheck').hidden, false, 'folds', 'reopening the dialog keeps the section you opened open');
    t.equal(bodyOf('aiAssist').hidden, true, 'folds', 'and the one you folded folded');
    $('settingsCancel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));

    // --- the model picker shows the selection the extension sent, never a different entry ---
    // Reported 2026-09-15: after a built-in 3B load that succeeded (proved by the log, the settings and a
    // running runtime) the dropdown still read "Let the server decide…". The choice values are opaque
    // strings — the webview never maps them to indices — but a <select> handed a value it does not know
    // silently keeps what it had, which reads exactly like an off-by-one. Both halves are pinned here.
    const aiState = (over = {}) => Object.assign({
        enabled: true,
        endpoint: 'http://127.0.0.1:1234/v1',
        selected: 'bundled:qwen2.5-coder-3b-q4',
        choices: [
            { value: 'any:', label: 'Let the server decide — whatever it has loaded', detail: 'whatever is loaded', kind: 'any' },
            { value: 'lms:google/gemma-4-e4b', label: 'google/gemma-4-e4b  ·  7.5B', detail: '7.5B', kind: 'lmstudio' },
            { value: 'bundled:qwen2.5-coder-3b-q4', label: 'Qwen2.5-Coder 3B Instruct (Q4_K_M)', detail: '2 GB', kind: 'bundled' }
        ],
        options: {
            contextLength: 8192, gpu: 'auto', ttlSeconds: 0, maxTokens: 4096, timeoutSeconds: 120,
            recommended: { contextLength: 8192, ttlSeconds: 900 }
        },
        hint: '',
        pinned: 'Pinned: the built-in runtime loads this file at start',
        conventions: [],
        // The host check's verdict, as the extension sends it. Allowed and comfortable by default, so every
        // test above also covers the "nothing is disabled" path.
        host: {
            aiAllowed: true,
            availableGb: 24,
            overridden: false,
            gpu: { kind: 'integrated', name: 'AMD Radeon', vramGb: 0, source: 'lspci' },
            hardware: { arch: 'x64', cpuCount: 12, totalRamGb: 28, freeRamGb: 24, hasAvx2: true, platform: 'linux' },
            reasons: []
        }
    }, over);
    msg({ type: 'aiState', state: aiState() });
    t.equal($('aiModel').value, 'bundled:qwen2.5-coder-3b-q4', 'ai-picker',
        'the picker shows the selection the extension sent, not the first entry');
    // A state without a selection shows the placeholder, never another model: falling back to the first entry is
    // how a picker names a model nobody chose, which reads as the selection having been thrown away
    // (reported 2026-09-15: "the picker reverts to 'Let the server decide…' directly after the model loaded").
    posted.length = 0;
    msg({ type: 'aiState', state: aiState({ selected: '' }) });
    t.equal($('aiModel').value, '', 'ai-picker', 'no selection in the state means the placeholder, not model #1');
    // "No selection" became a *state* rather than a symptom in 0.9.35: a built-in backend with nothing pinned
    // sends `selected: ''` on purpose (`currentSelection`), and so does the moment after "Remove Model". The
    // note therefore says what to do instead of sending the user to "Refresh list", which cannot change it.
    t.ok(/no model chosen yet/.test($('aiProgress').textContent), 'ai-picker',
        'and it says what to do — pick one and load it — rather than "press Refresh list"');
    const applied = posted.find((m) => m.type === 'aiApplied');
    t.ok(applied && applied.wanted === '' && applied.shown === '', 'ai-picker',
        'the webview reports what it was told and what it showed, so a disagreement is one log line');
    msg({ type: 'aiState', state: aiState() });
    t.equal(posted.filter((m) => m.type === 'aiApplied').pop().shown, 'bundled:qwen2.5-coder-3b-q4', 'ai-picker',
        'and it reports the value it actually applied');
    t.equal($('aiModel').selectedIndex, 3, 'ai-picker',
        'and it is the entry carrying that value (index 0 is the placeholder, so no off-by-one)');
    t.ok(/Pinned/.test($('aiModelHint').textContent), 'ai-picker', 'the hint keeps the pinned sentence alongside it');
    // The per-runtime hints are written by the same call, so they are asserted here too: the fixture used to
    // lack the hint spans, and the throw they caused skipped everything after them in the state application.
    t.equal($('aiOptTtl').hidden, true, 'ai-picker', 'the idle-unload row is hidden for the built-in runtime');
    // The GPU hint now depends on which native build the built-in runtime runs (2026-09-16): the CPU build has
    // no GPU backend at all, so telling the user that "max" offloads every layer would be a promise the runtime
    // cannot keep. The old "layer count, not a ratio" sentence moved to the case where it is true — the Vulkan
    // build — and the guard was rewritten (not deleted) for that reason.
    t.ok(/"max" needs the Vulkan build/.test($('aiOptGpu').querySelector('.ai-hint').textContent), 'ai-picker',
        'with the CPU build the GPU hint says "max" cannot offload anything');
    t.ok(/AI: Built-in Runtime Backend/.test($('aiOptGpu').querySelector('.ai-hint').textContent), 'ai-picker',
        'and names the command that changes the build — the panel is where the question is asked');
    msg({ type: 'aiState', state: aiState({ bundledBackend: 'vulkan' }) });
    t.ok(/layer count, not a ratio/.test($('aiOptGpu').querySelector('.ai-hint').textContent), 'ai-picker',
        'with the Vulkan build it explains that "max" is a layer count, not LM Studio\'s ratio');
    t.ok(!/needs the Vulkan build/.test($('aiOptGpu').querySelector('.ai-hint').textContent), 'ai-picker',
        'and it stops telling the user to switch to the build that is already running');
    t.ok(/handed to the built-in runtime/.test($('aiOptContext').querySelector('.ai-hint').textContent), 'ai-picker',
        'and so is the context hint');
    msg({ type: 'aiState', state: aiState({ selected: 'lms:google/gemma-4-e4b' }) });
    t.equal($('aiModel').value, 'lms:google/gemma-4-e4b', 'ai-picker', 'picking an LM Studio model is applied too');
    t.equal($('aiOptTtl').hidden, false, 'ai-picker', 'and the idle-unload row comes back for it');
    t.ok(/shared-memory GPU/.test($('aiOptGpu').querySelector('.ai-hint').textContent), 'ai-picker',
        'with the hint reworded for LM Studio');
    // The user's own `llama-server` (2026-09-16): a third runtime, and the one that is easiest to get wrong in
    // this table — it takes llama.cpp's own `--n-gpu-layers` (a count, like the built-in runtime) and has no
    // idle-unload timer at all, so its two rows must read like the built-in runtime's while still naming its
    // own flags (a hint that says "the built-in runtime" about the user's own binary is worse than no hint).
    const llamaState = aiState({
        selected: 'llama:',
        choices: aiState().choices.concat([
            { value: 'llama:', label: 'My own llama-server  ·  llama.cpp', detail: 'llama.cpp · serving x.gguf right now', kind: 'llama' }
        ])
    });
    msg({ type: 'aiState', state: llamaState });
    t.equal($('aiModel').value, 'llama:', 'ai-picker', 'the user\'s own llama-server is selectable');
    t.equal($('aiOptTtl').hidden, true, 'ai-picker', 'and no idle-unload row is offered for it — it has no such setting');
    t.ok(/--n-gpu-layers/.test($('aiOptGpu').querySelector('.ai-hint').textContent), 'ai-picker',
        'the GPU hint names ITS flag, not the built-in runtime\'s');
    t.ok(/--ctx-size/.test($('aiOptContext').querySelector('.ai-hint').textContent), 'ai-picker',
        'and so does the context hint');
    t.ok(!/built-in runtime/.test($('aiOptGpu').querySelector('.ai-hint').textContent), 'ai-picker',
        'because calling the user\'s own binary "the built-in runtime" is worse than saying nothing');
    posted.length = 0;
    $('aiLoad').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.ok(/starting your llama-server/.test($('aiProgress').textContent), 'ai-picker',
        'and Load says which engine it is starting before the extension answers');
    // --- "show the proposal as a diff" — the switch that turns the review step off ---
    // Asked 2026-09-16: the ⚙ panel should let the user choose between reviewing a diff and having the code
    // written straight in. The webview only shows the state and posts it on Save; the extension owns the
    // behaviour, and the safe side is the default — a state that *forgot* the field must still show a diff.
    msg({ type: 'aiState', state: aiState() });
    t.equal($('aiShowDiff').checked, true, 'showdiff',
        'a state with no `showDiff` field still means "show the diff" — the default is the safe one');
    t.equal($('aiShowDiffHint').hidden, true, 'showdiff', 'and the hint stays out of the way while it is on');
    msg({ type: 'aiState', state: aiState({ showDiff: false }) });
    t.equal($('aiShowDiff').checked, false, 'showdiff', 'the state turns the switch off');
    t.equal($('aiShowDiffHint').hidden, false, 'showdiff',
        'and says what that means — the code goes straight in, and Ctrl+Z is the way back');
    $('btnCodeSettings').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    fillSettingsFromHost();
    posted.length = 0;
    $('aiShowDiff').checked = true;
    $('settingsSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    const savedAi = posted.find((m) => m.type === 'saveCodeSettings');
    t.equal(savedAi && savedAi.ai && savedAi.ai.showDiff, true, 'showdiff',
        'the checkbox travels with the AI settings on Save');

    // House rules in the panel (2026-09-16). The editor is a second view of one setting: the state fills it,
    // Save sends it back, and "Learn from my code…" only ever *asks* — the measuring and the gating happen
    // extension-side, in the same flow the palette command runs.
    msg({ type: 'aiState', state: aiState({ conventions: ['Indent with 4 spaces.', 'Members are `private`.'] }) });
    t.equal($('aiConvText').value, 'Indent with 4 spaces.\nMembers are `private`.', 'house-rules',
        'the editor shows the rules the settings hold, one per line');
    msg({ type: 'aiState', state: aiState({ conventions: [] }) });
    t.equal($('aiConvText').value, '', 'house-rules', 'and an empty list empties the editor');
    posted.length = 0;
    $('aiConvText').value = 'Indent with tabs.\nName event handlers <Control>_<Event>.';
    $('settingsSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    const savedRules = posted.find((m) => m.type === 'saveCodeSettings');
    t.equal(savedRules && savedRules.ai && savedRules.ai.conventions,
        'Indent with tabs.\nName event handlers <Control>_<Event>.', 'house-rules',
        'the typed rules travel with the AI settings on Save, as one rule per line');
    posted.length = 0;
    $('aiLearnConventions').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.equal(posted[posted.length - 1].type, 'aiLearnConventions', 'house-rules',
        'and "Learn from my code…" asks the extension — nothing is measured in the webview');
    t.ok(/reading your project/.test($('aiProgress').textContent), 'house-rules',
        'with a line that says what is happening while it reads the project');

    msg({ type: 'aiState', state: aiState({ selected: 'bundled:not-in-the-list', pinned: '', hint: '' }) });
    t.equal($('aiProgress').hidden, false, 'ai-picker',
        'a selection with no matching entry is reported rather than silently swapped for another model');
    t.ok(/cannot show/.test($('aiProgress').textContent), 'ai-picker', 'and the message names the problem');
    // A confirmed load asks for the state once more: a refresh that is lost (a webview that was not ready, a
    // second designer tab) must not be able to leave the picker showing the old selection indefinitely.
    msg({ type: 'aiState', state: aiState() });
    posted.length = 0;
    msg({ type: 'aiResult', action: 'load', ok: true, message: 'Bundled runtime answering on http://127.0.0.1:43511/v1' });
    t.equal(posted.some((m) => m.type === 'aiState'), true, 'ai-picker', 'a confirmed load re-requests the state');
    posted.length = 0;
    msg({ type: 'aiResult', action: 'load', ok: false, message: 'the download stopped' });
    t.equal(posted.some((m) => m.type === 'aiState'), false, 'ai-picker', 'a failed load does not');
    t.ok(/the download stopped/.test($('aiProgress').textContent), 'ai-picker', 'a failure stays visible in the progress line');

    // --- the host check greys the section out, with the reason and a way out (asked 2026-09-17) ---
    // "If it has less than 32 GB ram and an integrated GPU … the AI assistance feature must be greyed out with
    // an explanation" — and, agreed the same day, an explicit escape, because the numbers can be wrong about a
    // machine (an eGPU, a card the probe could not identify) and nothing should lock a user out of their own
    // computer. The verdict arrives with every state, so this is where it is applied.
    {
        const gpu = { kind: 'integrated', name: 'Intel UHD Graphics', vramGb: 0, source: 'lspci' };
        const hw = { arch: 'x64', cpuCount: 4, totalRamGb: 16, freeRamGb: 5, hasAvx2: true, platform: 'linux' };
        msg({
            type: 'aiState', state: aiState({
                host: {
                    aiAllowed: false, availableGb: 5, overridden: false, gpu, hardware: hw,
                    reasons: ['5.0 GB of memory is available to a model right now and the smallest supported model needs about 8 GB.']
                }
            })
        });
        t.equal($('aiEnabled').disabled, true, 'ai-host', 'a refused machine disables the AI switch');
        t.equal($('aiLoad').disabled, true, 'ai-host', 'and everything that could start a model');
        t.equal($('aiModel').disabled, true, 'ai-host', 'including the picker');
        t.equal($('aiScan').disabled, true, 'ai-host', 'and the machine scan');
        t.equal($('aiHostBlocked').hidden, false, 'ai-host', 'the reason is shown');
        t.ok(/disabled on this machine/.test($('aiHostBlocked').textContent), 'ai-host', 'saying the feature is off');
        t.ok(/5\.0 GB/.test($('aiHostBlocked').textContent), 'ai-host', 'with the number the machine gave');
        t.equal($('aiHostOverride').hidden, false, 'ai-host', 'and the escape is offered');
        posted.length = 0;
        $('aiHostOverride').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(posted[posted.length - 1].type, 'aiHostOverride', 'ai-host',
            'pressing it asks the extension to write the setting (which is what makes it remembered)');
        $('aiHostOverride').disabled = false;

        // Allowed, but tight: the warning shows on its own and nothing is disabled.
        msg({
            type: 'aiState', state: aiState({
                host: {
                    aiAllowed: true, availableGb: 16, overridden: false, gpu, hardware: hw,
                    warning: 'Only 16.0 GB of memory is available to a model. That is enough for the smallest models, but a larger one may be slow or fail to load.'
                }
            })
        });
        t.equal($('aiEnabled').disabled, false, 'ai-host', 'an allowed machine keeps every control live');
        t.equal($('aiHostBlocked').hidden, true, 'ai-host', 'with no reason shown');
        t.equal($('aiHostOverride').hidden, true, 'ai-host', 'and no escape needed');
        t.equal($('aiHostWarning').hidden, false, 'ai-host', 'but the tight-memory warning is shown');
        t.ok(/16\.0 GB/.test($('aiHostWarning').textContent), 'ai-host', 'naming the memory available');

        // Comfortable: neither line.
        msg({ type: 'aiState', state: aiState({}) });
        t.equal($('aiHostWarning').hidden, true, 'ai-host', 'a comfortable machine shows neither line');
        t.equal($('aiHostBlocked').hidden, true, 'ai-host', 'nothing blocked, nothing warned');
        t.equal($('aiEnabled').disabled, false, 'ai-host', 'and the switch is usable');
    }

    // --- the wait for the model list is ON SCREEN (asked 2026-09-16) ---
    // "When opening the Settings dialog and selecting the checkbox, the system takes a while to load and
    // start the server … show a loading message." The user's description was literally right, and it was
    // measured rather than assumed: the extension's state call goes through LM Studio's `lms`, whose first
    // invocation of a session starts LM Studio's service — the first `discover()` blocked **4270 ms** and the
    // service processes appeared 3 s into it (probe written 18:18:37, service start 18:18:40); every call
    // afterwards is ~220 ms. Until it answers, the picker is empty and the panel says nothing. The line is
    // written by the webview *before* the round trip (the extension is the thing being waited for) and
    // cleared by the state that arrives.
    $('btnCodeSettings').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    fillSettingsFromHost();
    t.equal($('settingsModal').hidden, false, 'ai-wait', '⚙ opens the dialog');
    t.equal($('aiProgress').hidden, false, 'ai-wait', 'and a line appears before the state does, not with it');
    t.ok(/looking for local models/.test($('aiProgress').textContent), 'ai-wait',
        'naming what is being waited for rather than saying "loading"');
    // Its place in the markup is deliberate and pinned in T2: the line lives *inside* the AI body, next to
    // the picker it describes, so an empty list is never on screen without it.
    msg({ type: 'aiState', state: aiState() });
    t.equal($('aiProgress').hidden, true, 'ai-wait', 'the state that arrives clears it');
    // Ticking the switch with nothing chosen asks again — and now says so, which is the report's exact case.
    msg({ type: 'aiState', state: aiState({ selected: '' }) });
    posted.length = 0;
    $('aiEnabled').checked = true;
    $('aiEnabled').dispatchEvent(new s.window.Event('change', { bubbles: true }));
    t.equal(posted[posted.length - 1].type, 'aiState', 'ai-wait', 'ticking the AI switch with no model chosen asks for a state');
    t.equal($('aiBody').hidden, false, 'ai-wait', 'and the body opens on the same click');
    t.ok(/looking for local models/.test($('aiProgress').textContent), 'ai-wait',
        'with the line visible, because that is when the user is looking at an empty picker');
    // "Refresh list" is the same wait, so it goes through the same helper — with the rescan flag it always had.
    posted.length = 0;
    $('aiRefresh').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    const refreshed = posted[posted.length - 1];
    t.equal(refreshed.type, 'aiState', 'ai-wait', '"Refresh list" asks for a state');
    t.equal(refreshed.rescan, true, 'ai-wait', 'with its rescan flag');
    t.ok(/looking for local models/.test($('aiProgress').textContent), 'ai-wait', 'and the same line, because it is the same wait');
    // The line is only ended by an answer to a request of ours: a failure reported by `aiResult` must survive
    // the state that is posted right after it, or the one message the user needed disappears as it lands.
    msg({ type: 'aiResult', action: 'load', ok: false, message: 'the model server stopped' });
    msg({ type: 'aiState', state: aiState() });
    t.ok(/the model server stopped/.test($('aiProgress').textContent), 'ai-wait',
        'the state after a failed load does not wipe the failure it follows');
    // The other half of the same problem: a line must not OUTLIVE its action either. "checking…" is answered
    // by the report itself, so it goes — and only it, so the failure next to it (and a quiet refresh from
    // another tab) cannot clear what the user is reading.
    posted.length = 0;
    $('aiStatus').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.ok(/checking/.test($('aiProgress').textContent), 'ai-wait', 'the status button says it is checking');
    msg({ type: 'aiStatus', lines: ['AI assist: off'] });
    t.equal($('aiProgress').hidden, true, 'ai-wait', 'and the report that answers it clears that line');
    t.equal($('aiStatusText').hidden, false, 'ai-wait', 'while the report itself stays on screen');
    msg({ type: 'aiResult', action: 'load', ok: false, message: 'the download stopped' });
    msg({ type: 'aiStatus', lines: ['AI assist: off'], quiet: true });
    t.ok(/the download stopped/.test($('aiProgress').textContent), 'ai-wait',
        'and a status refresh never wipes a message it did not write');

    // --- Unload is a state change, not just a result (reported 2026-09-15) ---
    // "the model is unloaded ... but the picker is not updated and the status check still shows that model
    // as being loaded". The `● loaded` tag comes from discovery, so it only clears when a fresh state
    // arrives — which nothing used to ask for after an unload.
    posted.length = 0;
    msg({ type: 'aiResult', action: 'unload', ok: true, message: 'unloaded 1 model(s)' });
    t.equal(posted.some((m) => m.type === 'aiState'), true, 'ai-picker',
        'a confirmed unload re-requests the state, so the ● loaded tag cannot survive it');
    posted.length = 0;
    $('aiUnload').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.equal(posted[posted.length - 1].type, 'aiUnload', 'ai-picker', 'Unload asks the extension to unload');
    t.equal($('aiLoad').disabled, true, 'ai-picker', 'and both buttons are disabled while it runs');
    t.ok(/unloading/.test($('aiProgress').textContent), 'ai-picker', 'with a line that says what is happening');
    msg({ type: 'aiResult', action: 'unload', ok: true, message: 'unloaded' });
    t.equal($('aiLoad').disabled, false, 'ai-picker', 'the buttons come back when the extension answers');


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

    // --- Properties SECTIONS: headings in order, fold on click, fold remembered per control type ---
    const sectionMsg = () => ({
        type: 'properties', name: 'dg1',
        properties: [
            { key: '__name__', label: 'Name', kind: 'text', value: 'dg1' },
            { key: '__type__', label: 'Type', kind: 'text', value: 'DataGrid' },
            { key: 'Rows', label: 'Rows', kind: 'button', value: 'Edit rows…', section: 'Editors', sectionId: 'editors' },
            { key: 'Width', label: 'Width', kind: 'number', value: '200', section: 'Layout & size', sectionId: 'layout' },
            { key: 'Background', label: 'Background', kind: 'color', value: '#333333', section: 'Appearance', sectionId: 'appearance' },
            { key: 'ItemsSource', label: 'Items Source', kind: 'text', value: '', section: 'Data', sectionId: 'data' },
            { key: 'IsReadOnly', label: 'Read Only', kind: 'dropdown', value: 'False', options: ['True', 'False'], section: 'Data', sectionId: 'data' },
            { key: 'IsEnabled', label: 'Enabled', kind: 'dropdown', value: 'True', options: ['True', 'False'], section: 'Behavior', sectionId: 'behavior' }
        ],
        info: null, tabItems: [], listItems: []
    });
    const heads = () => [...$('propsBody').children].filter((r) => r.classList.contains('prop-section'));
    const headLabels = () => heads().map((h) => h.textContent.replace(/[▾▸]/g, '').trim());
    const hasRow = (text) => [...$('propsBody').children].some((r) => r.textContent.includes(text));

    msg(sectionMsg());
    t.equal(headLabels(), ['Editors', 'Layout & size', 'Appearance', 'Data', 'Behavior'], 'sections', 'headings render in the canonical order');
    t.equal(heads()[0].getAttribute('aria-expanded'), 'true', 'sections', 'sections start expanded');
    const kids = [...$('propsBody').children];
    t.ok(kids.indexOf(heads()[0]) < kids.findIndex((r) => r.textContent.includes('Rows')), 'sections', 'a heading sits above its first row');
    t.equal(kids[0].textContent.includes('Name'), true, 'sections', 'the pinned Name row still comes first');
    t.ok(kids.indexOf(heads()[0]) > 1, 'sections', 'pinned rows precede the first section');

    // Fold 'Data': heading stays (with the folded arrow), its two rows disappear
    heads().find((h) => h.textContent.includes('Data')).dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.equal(headLabels().length, 5, 'sections', 'a folded section keeps its heading');
    t.equal(heads().find((h) => h.textContent.includes('Data')).getAttribute('aria-expanded'), 'false', 'sections', 'the folded state is announced');
    t.ok(heads().find((h) => h.textContent.includes('Data')).textContent.includes('▸'), 'sections', 'the folded heading shows the ▸ arrow');
    t.equal(hasRow('Items Source'), false, 'sections', 'a folded section hides its rows');
    t.equal(hasRow('Read Only'), false, 'sections', 'and its other rows');
    t.equal(hasRow('Width'), true, 'sections', 'other sections are untouched');
    t.ok(vscodeState.collapsed && vscodeState.collapsed.DataGrid && vscodeState.collapsed.DataGrid.data === true, 'sections', 'the fold is persisted in the webview state');

    // Remembered per control TYPE: a re-render keeps it folded, another type starts expanded
    msg(sectionMsg());
    t.equal(hasRow('Items Source'), false, 'sections', 'the fold survives a re-render');
    msg({
        type: 'properties', name: 'btn9',
        properties: [
            { key: '__name__', label: 'Name', kind: 'text', value: 'btn9' },
            { key: '__type__', label: 'Type', kind: 'text', value: 'Button' },
            { key: 'Content', label: 'Content', kind: 'text', value: 'Go', section: 'Text & font', sectionId: 'text' },
            { key: 'ItemsSource', label: 'Items Source', kind: 'text', value: '', section: 'Data', sectionId: 'data' }
        ],
        info: null, tabItems: [], listItems: []
    });
    t.equal(hasRow('Items Source'), true, 'sections', 'another control TYPE keeps its Data section open');
    // Fold the Button's Data section too (independent memory per type)…
    heads().find((h) => h.textContent.includes('Data')).dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.equal(vscodeState.collapsed.Button.data, true, 'sections', 'the fold now belongs to the Button type');
    // …then un-fold the DataGrid's again, which both proves the toggle and leaves the panel open
    // for the checks that follow.
    msg(sectionMsg());
    t.equal(hasRow('Read Only'), false, 'sections', 'the DataGrid fold is still remembered');
    heads().find((h) => h.textContent.includes('Data')).dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    t.equal(hasRow('Read Only'), true, 'sections', 'un-folding brings the rows back');
    t.equal(!!(vscodeState.collapsed.DataGrid && vscodeState.collapsed.DataGrid.data), false, 'sections', 'the un-fold is persisted too');

    // --- Toolbar: 'View Log' opens the extension's own log in an editor tab (asked 2026-09-18) ---
    {
        posted.length = 0;
        $('btnViewLog').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(posted[posted.length - 1], { type: 'viewLog' }, 'toolbar', 'View Log posts viewLog');
        t.ok(/opening the log/i.test($('status').textContent), 'toolbar',
            'and the status line says what is happening', $('status').textContent);
    }

    // --- Toolbar: 'Project Backup' asks the extension to save everything and copy the project ---
    {
        posted.length = 0;
        $('btnBackup').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(posted[posted.length - 1], { type: 'projectBackup' }, 'toolbar', 'Project Backup posts projectBackup');
        t.ok(/back(ing)? up/i.test($('status').textContent), 'toolbar', 'the status line says a backup is running',
            $('status').textContent);
    }

    // --- Toolbar: Publish / Install (Linux-only) ---
    // Publish builds the project and packages a .deb, Install installs that .deb on this machine. Both
    // are done by the extension (the build runs in a terminal there), so the webview posts and says so.
    {
        t.ok(!!$('btnPublish') && !!$('btnInstall'), 'publish-buttons', 'the two buttons exist');
        // Install starts disabled and says so: nothing is installable until the extension reports a
        // package, which is the whole point of the button being state-driven.
        t.equal($('btnInstall').disabled, true, 'install-state',
            'Install starts disabled, before any report has arrived');
        t.ok(/checking/i.test($('btnInstall').title), 'install-state', 'and its tooltip says it is checking');
        posted.length = 0;
        $('btnPublish').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(posted[posted.length - 1], { type: 'publishApp' }, 'publish-buttons', 'Publish posts publishApp');
        t.ok(/publish/i.test($('status').textContent), 'publish-buttons',
            'the status line says it is publishing (the terminal has the detail)', $('status').textContent);
        posted.length = 0;
        // Install is disabled until the extension reports a CURRENT package, so a state has to arrive
        // first (the webview never assumes something is installable).
        msg({ type: 'publishState', state: 'ready', name: 'MyApp 1.0.0' });
        $('btnInstall').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(posted[posted.length - 1], { type: 'installApp' }, 'publish-buttons', 'Install posts installApp');
        t.ok(/install/i.test($('status').textContent), 'publish-buttons', 'and the status line says so',
            $('status').textContent);
    }

    // On Windows/macOS the extension does not emit those buttons at all. The script must still load and
    // finish wiring the rest of the toolbar — a missing element used to abort the whole script silently.
    {
        const nos = setup(['btnPublish', 'btnInstall']);
        t.equal(nos.$('btnPublish'), null, 'publish-buttons', 'without the flag there is no Publish button');
        nos.posted.length = 0;
        nos.$('btnBackup').dispatchEvent(new nos.window.MouseEvent('click', { bubbles: true }));
        t.equal(nos.posted[nos.posted.length - 1], { type: 'projectBackup' }, 'publish-buttons',
            'a listener registered BEFORE them still runs');
        nos.$('btnZoomOut').dispatchEvent(new nos.window.MouseEvent('click', { bubbles: true }));
        t.equal(nos.$('zoomValue').value, '83%', 'publish-buttons',
            'and the script reached the listeners registered AFTER them (89% → 83% zoom out)');
    }

    // --- Install is only offered when there is a CURRENT package (the extension reports the state) ---
    // "ready" is the only enabled state: installing a stale package would put the PREVIOUS build on the
    // machine while the designer shows the current one, so an out-of-date or missing package disables the
    // button and the tooltip says which of the two it is.
    {
        const install = $('btnInstall');
        msg({ type: 'publishState', state: 'none', name: 'MyApp 1.0.0' });
        t.equal(install.disabled, true, 'install-state', 'nothing published → disabled');
        t.ok(/no package has been built/i.test(install.title), 'install-state',
            'the tooltip explains it (not a mystery grey button)', install.title);
        posted.length = 0;
        install.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(posted.length, 0, 'install-state', 'and a disabled button posts nothing');

        msg({ type: 'publishState', state: 'stale', name: 'MyApp 1.0.0' });
        t.equal(install.disabled, true, 'install-state', 'a package older than the sources → disabled');
        t.ok(/older than the project/i.test(install.title), 'install-state',
            'with the reason (the package is out of date)', install.title);

        msg({ type: 'publishState', state: 'ready', name: 'MyApp 1.0.0' });
        t.equal(install.disabled, false, 'install-state', 'a current package → enabled');
        t.ok(/install myapp 1\.0\.0/i.test(install.title), 'install-state',
            'and the tooltip names what will be installed', install.title);
        posted.length = 0;
        install.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(posted[posted.length - 1], { type: 'installApp' }, 'install-state',
            'clicking it now posts installApp');

        // Publishing again makes it stale (the extension reports it on the next edit), so it goes back.
        msg({ type: 'publishState', state: 'stale', name: 'MyApp 1.0.0' });
        t.equal(install.disabled, true, 'install-state', 'and back to disabled once it is out of date again');
    }

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

    // The popup must never hang off an edge of the window. Reported from the running designer 2026-09-24:
    // "when opening a colour palette (not the drop down colour picker) half the palette renders off-screen to
    // the right — the popup's top-left corner is anchored to the mouse cursor position". It was anchored at
    // the trigger's own top-left, which IS where the mouse is (the ▾ was just clicked), so a ▾ anywhere near
    // the right edge put half the list past it; the old clamp's own floor of 8px then won, leaving the list
    // `pw + 16 - vw` pixels outside. It now FLIPS so that its RIGHT edges line up with the trigger's, is
    // clamped into the window in BOTH directions, and has its width capped to the window so that even a panel
    // narrower than the list cannot overflow.
    {
        const rightBtn = backRow().querySelector('.color-drop');
        rightBtn.getBoundingClientRect = () => ({ left: 900, top: 200, right: 926, bottom: 222, width: 26, height: 22, x: 900, y: 200 });
        rightBtn.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        palette = $('colorPalette');
        const iw = s.window.innerWidth || 1024;
        const pw = palette.offsetWidth || 160;
        const left = parseFloat(palette.style.left);
        t.ok(left >= 8 && left + pw <= iw - 8, 'palette',
            'a trigger with no room to its right: the whole popup is still inside the window',
            `left ${left} + ${pw}px in ${iw}px`);
        t.ok(Math.abs(left + pw - 926) < 0.5, 'palette',
            'and it FLIPPED, so its right edges line up with the trigger\'s instead of running past the edge',
            `popup ${left}…${left + pw}, trigger right edge 926`);
        // A window narrower than the list: the width cap is what keeps it in, because there is nowhere to
        // flip to. (jsdom has no layout, so the numbers the browser would measure are read off the style.)
        // BOTH bounds matter: `min-width` outranks `max-width` in CSS, so a cap on the max alone left the box
        // at its stylesheet 160px in a 150px webview — measured in the browser: the list hung 18px past the
        // right edge with the cap "applied".
        Object.defineProperty(s.window, 'innerWidth', { value: 150, configurable: true });
        rightBtn.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const narrowStyle = $('colorPalette').style;
        const maxW = parseFloat(narrowStyle.maxWidth);
        const minW = parseFloat(narrowStyle.minWidth);
        t.ok(maxW > 0 && maxW <= 150 - 16, 'palette',
            'a window narrower than the list caps its WIDTH, so half of it cannot hang out either way',
            `max-width ${maxW}px in a 150px window`);
        t.ok(minW > 0 && minW <= 150 - 16, 'palette',
            'and the stylesheet\'s own min-width is lowered with it, or the box stays 160px wide and overflows',
            `min-width ${minW}px in a 150px window`);
        Object.defineProperty(s.window, 'innerWidth', { value: iw, configurable: true });
    }

    // --- typed properties commit on Enter / blur, NOT while typing ---
    // Every commit round-trips through the previewer (model edit -> re-render -> PNG -> properties
    // refresh -> this panel rebuilt), so applying a debounced edit mid-word made typing feel laggy.
    // A discrete pick (the palette above) still applies immediately.
    {
        const props = (value) => msg({
            type: 'properties', name: 'btn1',
            properties: [{ key: 'Content', label: 'Text', kind: 'text', value }],
            info: null, tabItems: [], listItems: []
        });
        const textField = () => $('propsBody').querySelector('input[data-prop-key="Content"]');
        props('Hello');
        t.ok(!!textField(), 'typed-commit', 'the Text row renders an input');

        // Typing alone posts nothing — no matter how many keystrokes, or how long they take.
        posted.length = 0;
        const field = textField();
        for (const v of ['H', 'He', 'Hel', 'Hell', 'Hello there']) {
            field.value = v;
            field.dispatchEvent(new s.window.Event('input', { bubbles: true }));
        }
        t.equal(posted.length, 0, 'typed-commit', 'five keystrokes post nothing at all');

        // Enter commits the value once (the input also fires `change` for Enter — it must not post twice).
        field.dispatchEvent(new s.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        field.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        t.equal(posted.length, 1, 'typed-commit', 'Enter commits exactly once');
        t.equal(posted[0], { type: 'setProperty', name: 'btn1', key: 'Content', value: 'Hello there' },
            'typed-commit', 'and carries the typed value');

        // Losing focus (blur → `change`) commits too, and only once.
        posted.length = 0;
        const field2 = textField();
        field2.value = 'Bye';
        field2.dispatchEvent(new s.window.Event('input', { bubbles: true }));
        t.equal(posted.length, 0, 'typed-commit', 'typing again still posts nothing');
        field2.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        t.equal(posted.length, 1, 'typed-commit', 'blur commits the value once');

        // Typing a value back to what it already was is not an edit — so it costs no round trip.
        posted.length = 0;
        const field3 = textField();
        field3.value = 'Bye edited';
        field3.dispatchEvent(new s.window.Event('input', { bubbles: true }));
        field3.value = 'Bye';
        field3.dispatchEvent(new s.window.Event('input', { bubbles: true }));
        field3.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        t.equal(posted.length, 0, 'typed-commit', 'an edit that changes nothing posts nothing');

        // THE SAFETY NET: the panel is rebuilt from the extension's own refresh (it happens after every
        // edit, and on code-check/frame messages). A half-typed value must be committed, not dropped.
        posted.length = 0;
        const field4 = textField();
        field4.value = 'Half typed';
        field4.dispatchEvent(new s.window.Event('input', { bubbles: true }));
        props('Bye');                       // a refresh arrives while the field is dirty
        t.equal(posted.length, 1, 'typed-commit', 'a panel rebuild commits the pending value first');
        t.equal(posted[0].value, 'Half typed', 'typed-commit', 'with what the user had typed');

        // TabItem / ListBoxItem rows are typed fields in the same panel and behave identically.
        posted.length = 0;
        msg({
            type: 'properties', name: 'tab1',
            properties: [],
            tabItems: [{ name: 'TabItem1', header: 'First' }],
            listItems: [{ name: 'Item1', content: 'One' }],
            info: null
        });
        const headerInp = $('propsBody').querySelector('input[data-tabitem]');
        t.ok(!!headerInp, 'typed-commit', 'a TabItem header row renders an input');
        headerInp.value = 'Second';
        headerInp.dispatchEvent(new s.window.Event('input', { bubbles: true }));
        t.equal(posted.length, 0, 'typed-commit', 'editing a header posts nothing while typing');
        headerInp.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        t.equal(posted.length, 1, 'typed-commit', 'blur posts the header once');
        t.equal(posted[0].type, 'setTabItemProperty', 'typed-commit', 'as setTabItemProperty');
        t.equal(posted[0].value, 'Second', 'typed-commit', 'with the typed header');
    }

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

        // Equal-spacing tools light up with 3+ selected and post their align kinds (the extension
        // equalises the gaps between the movable controls, keeping the two outermost fixed).
        t.equal($('btnEqualV').disabled, false, 'eqsp', '3 selected → equal vertical spacing enabled');
        t.equal($('btnEqualH').disabled, false, 'eqsp', '3 selected → equal horizontal spacing enabled');
        posted.length = 0;
        $('btnEqualV').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const eqv = posted[posted.length - 1];
        t.equal(eqv.type, 'align', 'eqsp', 'Equal V posts align');
        t.equal(eqv.align, 'equalV', 'eqsp', 'align kind = equalV');
        t.ok(Array.isArray(eqv.names) && eqv.names.length === 3, 'eqsp', 'carries the three selected controls');
        posted.length = 0;
        $('btnEqualH').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(posted[posted.length - 1].align, 'equalH', 'eqsp', 'Equal H posts align equalH');

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

    // --- Undo / Redo toolbar buttons (history lives in the extension) ---
    // The extension sends historyState (canUndo/canRedo) whenever the undo history changes; the
    // two buttons mirror it and post the SAME undo/redo message the Ctrl+Z / Ctrl+Shift+Z /
    // Ctrl+Y shortcuts send (with the current selection, if any).
    {
        // No history → both disabled.
        msg({ type: 'historyState', canUndo: false, canRedo: false });
        t.equal($('btnUndo').disabled, true, 'undoredo', 'no history → Undo disabled');
        t.equal($('btnRedo').disabled, true, 'undoredo', 'no history → Redo disabled');
        // Something to undo, but no redo branch yet.
        msg({ type: 'historyState', canUndo: true, canRedo: false });
        t.equal($('btnUndo').disabled, false, 'undoredo', 'history → Undo enabled');
        t.equal($('btnRedo').disabled, true, 'undoredo', 'no redo branch → Redo disabled');
        // Undone once → both undo AND redo available.
        msg({ type: 'historyState', canUndo: true, canRedo: true });
        t.equal($('btnRedo').disabled, false, 'undoredo', 'redo branch → Redo enabled');
        // Clicking posts undo/redo (no selection here → name null).
        $('btnClearSel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        posted.length = 0;
        $('btnUndo').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(posted[posted.length - 1].type, 'undo', 'undoredo', 'Undo button posts undo');
        t.equal(posted[posted.length - 1].name, null, 'undoredo', 'Undo carries no selection → name null');
        posted.length = 0;
        $('btnRedo').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(posted[posted.length - 1].type, 'redo', 'undoredo', 'Redo button posts redo');
        t.equal(posted[posted.length - 1].name, null, 'undoredo', 'Redo carries no selection → name null');
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
    // --- Menu bar dummies + 'Menu Items' tree editor ---
    // Avalonia never realizes MenuItems in the passive preview, so the extension sends the menu
    // item tree (frame.menus) and we draw PLAIN placeholder labels over the empty bar. They are
    // NOT real controls: clicking a dummy opens the tree editor (never selects a control / opens
    // Properties), and Save posts the real item tree back so the extension writes <MenuItem> XAML.
    {
        const menuFrame = (menus) => msg(Object.assign(frame([
            { name: 'Root', type: 'DockPanel', x: 0, y: 0, w: 800, h: 450, parent: null },
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true, parent: 'Root' },
            { name: 'mainMenu', type: 'Menu', x: 0, y: 0, w: 800, h: 32, parent: 'Root' }
        ]), { menus }));

        // Two top-level items → two dummies + the trailing "+" affordance (still not real controls).
        menuFrame({
            mainMenu: [
                { kind: 'Item', header: 'File', children: [{ kind: 'Item', header: 'Exit' }] },
                { kind: 'Item', header: 'View' }
            ]
        });
        const dm = $('menuDummies');
        t.equal(dm.children.length, 3, 'menu-dummies', 'bar shows one chip per top-level item + a trailing "+"');
        t.equal(dm.children[0].textContent, 'File', 'menu-dummies', 'first dummy is the File item');
        // Chips are patched in place like the overlays: the same node (and its tooltip) survives an
        // identical frame instead of being re-created, listeners and all, on every frame.
        const chip0 = dm.children[0];
        menuFrame({
            mainMenu: [
                { kind: 'Item', header: 'File', children: [{ kind: 'Item', header: 'Exit' }] },
                { kind: 'Item', header: 'View' }
            ]
        });
        t.ok($('menuDummies').children[0] === chip0, 'menu-dummies', 'chip node is reused across frames');
        const ddLabels = [...$('controlList').options].map((o) => o.textContent);
        t.ok(!ddLabels.some((x) => /File|Exit|View/.test(x)), 'menu-dummies', 'MenuItems are NOT in the control dropdown');

        // Clicking the File dummy opens the tree editor (File expanded) WITHOUT posting a select.
        posted.length = 0;
        dm.children[0].dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('menuModal').hidden, false, 'menu-editor', 'clicking a dummy opens the Menu Items editor');
        t.ok(posted.every((m) => m.type !== 'select'), 'menu-editor', 'dummy click never selects a control');
        t.equal($('menuBody').querySelectorAll('.mn-row').length, 3, 'menu-editor', 'File expanded shows Exit + View');

        // Save posts the whole tree so the extension writes the real <MenuItem> XAML.
        posted.length = 0;
        $('menuSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const sav = posted[posted.length - 1];
        t.equal(sav.type, 'saveMenuItems', 'menu-editor', 'Save posts saveMenuItems');
        t.equal(sav.name, 'mainMenu', 'menu-editor', 'carries the menu control name');
        t.equal(sav.items.length, 2, 'menu-editor', 'two top-level items');
        t.equal(sav.items[0].header, 'File', 'menu-editor', 'File header preserved');
        t.equal(sav.items[0].children[0].header, 'Exit', 'menu-editor', 'nested Exit preserved');
        t.equal($('menuModal').hidden, true, 'menu-editor', 'Save closes the editor');

        // The 'Menu Items' property (a button shown when the Menu is selected) opens the SAME editor.
        msg({
            type: 'properties', name: 'mainMenu', properties: [
                { key: 'MenuItems', label: 'Menu Items', kind: 'button', value: 'Edit menu items…' }
            ], info: null
        });
        const pbtn = $('propsBody').querySelector('.prop-button');
        t.ok(!!pbtn, 'menu-editor', 'Menu Items property renders as a button');
        pbtn.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('menuModal').hidden, false, 'menu-editor', 'Menu Items property opens the editor');

        // Add a top-level item: rename it, then switch its kind to Radio → Save carries both.
        $('menuAddTop').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        let rows = $('menuBody').querySelectorAll('.mn-row');
        let top = rows[rows.length - 1];
        t.equal(top.dataset.depth, '1', 'menu-editor', 'new row is a top-level item');
        const headerInp = top.querySelector('.mn-header');
        headerInp.value = 'Dark';
        headerInp.dispatchEvent(new s.window.Event('input', { bubbles: true }));
        const kindSel = top.querySelector('.mn-kind');
        kindSel.value = 'Radio';
        kindSel.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        posted.length = 0;
        $('menuSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const added = posted[posted.length - 1].items;
        t.equal(added[added.length - 1].kind, 'Radio', 'menu-editor', 'Radio kind carried to the extension');
        t.equal(added[added.length - 1].header, 'Dark', 'menu-editor', 'renamed header carried to the extension');

        // Depth is capped at 5: keep adding a child to the deepest row until the guard trips.
        menuFrame({ mainMenu: [{ kind: 'Item', header: 'File', children: [] }] });
        dm.children[0].dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        let guard = 0;
        for (; guard < 12; guard++) {
            const rr = $('menuBody').querySelectorAll('.mn-row');
            const deepest = rr[rr.length - 1];
            if (!deepest) break;
            const addc = deepest.querySelector('.mn-addc');
            if (!addc || addc.disabled) break;
            addc.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        }
        rows = $('menuBody').querySelectorAll('.mn-row');
        const deepest2 = rows[rows.length - 1];
        t.equal(deepest2.dataset.depth, '5', 'menu-depth', 'deepest reachable row is depth 5');
        t.equal(deepest2.querySelector('.mn-addc').disabled, true, 'menu-depth', 'depth 5 blocks adding a 6th level');
        t.equal(deepest2.querySelector('.mn-adds').disabled, false, 'menu-depth', 'a sibling at depth 5 is still allowed');

        // An EMPTY menu shows a "+ Add menu items…" hint that opens the editor and adds row 1;
        // Escape closes without saving.
        menuFrame({ mainMenu: [] });
        t.equal($('menuDummies').children.length, 1, 'menu-empty', 'empty bar shows a single hint chip');
        t.equal($('menuDummies').children[0].textContent, '+ Add menu items…', 'menu-empty', 'hint label');
        $('menuDummies').children[0].dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('menuModal').hidden, false, 'menu-empty', 'hint opens the editor');
        t.equal($('menuBody').querySelectorAll('.mn-row').length, 1, 'menu-empty', 'hint immediately adds the first item');
        posted.length = 0;
        const esc = new s.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        s.window.document.dispatchEvent(esc);
        t.equal($('menuModal').hidden, true, 'menu-empty', 'Escape closes the editor');
        t.ok(posted.every((m) => m.type !== 'saveMenuItems'), 'menu-empty', 'Escape does not save');
    }

    // --- 'Space' top-level kind: an invisible, pixel-wide gap between bar items ---
    {
        // A Space reserves a gap on the bar: no dummy chip is drawn for it.
        msg(Object.assign(frame([
            { name: 'Root', type: 'DockPanel', x: 0, y: 0, w: 800, h: 450, parent: null },
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true, parent: 'Root' },
            { name: 'mainMenu', type: 'Menu', x: 0, y: 0, w: 800, h: 32, parent: 'Root' }
        ]), {
            menus: {
                mainMenu: [
                    { kind: 'Item', header: 'File', children: [{ kind: 'Item', header: 'Exit' }] },
                    { kind: 'Space', width: 24 },
                    { kind: 'Item', header: 'View' }
                ]
            }
        }));
        const dm = $('menuDummies');
        t.equal(dm.children.length, 3, 'menu-space', 'dummies = File, View + trailing "+" (the Space reserves a gap, no chip)');
        t.equal(dm.children[0].textContent, 'File', 'menu-space', 'first dummy is File');
        t.equal(dm.children[1].textContent, 'View', 'menu-space', 'no chip between File and View for the Space');

        // Open the editor on File → top-level rows offer Space; a NESTED item does not.
        dm.children[0].dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const rows0 = [...$('menuBody').querySelectorAll('.mn-row')];
        const fileRow = rows0.find((r) => r.dataset.path === '0');
        const exitRow = rows0.find((r) => r.dataset.path === '0.0');
        const viewRow = rows0.find((r) => r.dataset.path === '2');
        const topKinds = [...fileRow.querySelector('.mn-kind').options].map((o) => o.value);
        const nestedKinds = [...exitRow.querySelector('.mn-kind').options].map((o) => o.value);
        t.ok(topKinds.includes('Space'), 'menu-space', 'a top-level row offers the Space kind');
        t.ok(!nestedKinds.includes('Space'), 'menu-space', 'a nested (submenu) item does NOT offer Space');
        t.equal(rows0.find((r) => r.querySelector('.mn-width')).querySelector('.mn-width').value, '24', 'menu-space', 'space width round-trips into the px field');
        t.equal(viewRow.querySelector('.mn-header').value, 'View', 'menu-space', 'View is the last top-level item');

        // Turn the last top-level item (View) into a Space and set its width, then Save.
        const vsel = viewRow.querySelector('.mn-kind');
        vsel.value = 'Space';
        vsel.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        const rows1 = [...$('menuBody').querySelectorAll('.mn-row')];
        const spaceRow = [...rows1].reverse().find((r) => r.querySelector('.mn-width'));
        t.ok(!!spaceRow, 'menu-space', 'switching a top-level item to Space shows the px width field');
        const wInp = spaceRow.querySelector('.mn-width');
        wInp.value = '30';
        wInp.dispatchEvent(new s.window.Event('input', { bubbles: true }));
        posted.length = 0;
        $('menuSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const savSpace = posted[posted.length - 1];
        t.equal(savSpace.type, 'saveMenuItems', 'menu-space', 'Save posts saveMenuItems');
        const sp = [...savSpace.items].reverse().find((x) => x.kind === 'Space'); // the one just edited
        t.ok(!!sp, 'menu-space', 'saved tree carries a Space node');
        t.equal(sp.width, 30, 'menu-space', 'Space width in px is carried to the extension');
        t.equal(sp.header, '', 'menu-space', 'a Space has no header');
    }

    // --- File / Folder Selector kinds: a path row ON the menu (the bundled <chrome:PathPicker>) ---
    {
        msg(Object.assign(frame([
            { name: 'Root', type: 'DockPanel', x: 0, y: 0, w: 800, h: 450, parent: null },
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true, parent: 'Root' },
            { name: 'selMenu', type: 'Menu', x: 0, y: 0, w: 800, h: 26, parent: 'Root' }
        ]), {
            menus: {
                selMenu: [
                    { kind: 'Item', header: 'File', children: [{ kind: 'FileSelector', pathType: 'File', header: 'Open image…', width: 180 }] },
                    { kind: 'FolderSelector', pathType: 'Folder', header: 'Pick folder', width: 150 },
                    { kind: 'Item', header: 'Help' }
                ]
            }
        }));
        const dm2 = $('menuDummies');
        t.equal(dm2.children.length, 4, 'menu-picker', 'dummies = File, folder row, Help + trailing “+”');
        // Open the editor on the File item (clicking a bar dummy) so the tree above is loaded.
        dm2.children[0].dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('menuModal').hidden, false, 'menu-picker', 'clicking the dummy opens the Menu Items editor');

        const rows2 = [...$('menuBody').querySelectorAll('.mn-row')];
        const fileRow2 = rows2.find((r) => r.dataset.path === '0');
        const pickerRow2 = rows2.find((r) => r.dataset.path === '0.0');
        const folderRow2 = rows2.find((r) => r.dataset.path === '1');
        const kinds2 = [...fileRow2.querySelector('.mn-kind').options].map((o) => o.value);
        t.ok(kinds2.includes('FileSelector') && kinds2.includes('FolderSelector'), 'menu-picker', 'the kind list offers File Selector and Folder Selector');
        const kindLabels2 = [...fileRow2.querySelector('.mn-kind').options].map((o) => o.textContent);
        t.ok(kindLabels2.includes('File Selector') && kindLabels2.includes('Folder Selector'), 'menu-picker', 'with friendly labels');
        t.equal(folderRow2.querySelector('.mn-kind').value, 'FolderSelector', 'menu-picker', 'a Folder Selector row round-trips its kind');
        const nested2 = [...pickerRow2.querySelector('.mn-kind').options].map((o) => o.value);
        t.ok(nested2.includes('FileSelector'), 'menu-picker', 'selectors are offered inside a submenu too');
        t.ok(!nested2.includes('Space'), 'menu-picker', 'the submenu still excludes Space');
        t.equal(pickerRow2.querySelector('.mn-header').value, 'Open image…', 'menu-picker', 'the dialog title round-trips into the text field');
        t.equal(pickerRow2.querySelector('.mn-header').placeholder, 'Dialog title', 'menu-picker', 'the field is labelled as a dialog title');
        t.equal(pickerRow2.querySelector('.mn-width').value, '180', 'menu-picker', 'the row width round-trips');
        t.equal(pickerRow2.querySelector('.mn-caret').disabled, true, 'menu-picker', 'a selector row is a leaf (no submenu)');
        t.equal([...pickerRow2.querySelectorAll('.mn-act')].some((b) => b.className.includes('mn-addc') && b.disabled === false), false, 'menu-picker', 'and offers no “add child”');

        // Turn the plain Help item into a File Selector, then Save.
        const helpRow2 = rows2.find((r) => r.dataset.path === '2');
        const hsel2 = helpRow2.querySelector('.mn-kind');
        hsel2.value = 'FileSelector';
        hsel2.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        const afterRows = [...$('menuBody').querySelectorAll('.mn-row')];
        const newPick = afterRows.find((r) => r.dataset.path === '2');
        t.equal(newPick.querySelector('.mn-width').value, '160', 'menu-picker', 'a new selector row gets a sensible default width');
        const titleInp2 = newPick.querySelector('.mn-header');
        titleInp2.value = 'Choose a file';
        titleInp2.dispatchEvent(new s.window.Event('input', { bubbles: true }));
        posted.length = 0;
        $('menuSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const savPick = posted[posted.length - 1];
        t.equal(savPick.type, 'saveMenuItems', 'menu-picker', 'Save posts saveMenuItems');
        const fp = savPick.items[2];
        t.equal(fp.kind, 'FileSelector', 'menu-picker', 'the saved node carries the File Selector kind');
        t.equal(fp.pathType, 'File', 'menu-picker', 'and its PathType');
        t.equal(fp.header, 'Choose a file', 'menu-picker', 'and the dialog title');
        t.equal(fp.width, 160, 'menu-picker', 'and the row width');
        t.equal(Array.isArray(fp.children) ? fp.children.length : 0, 0, 'menu-picker', 'a selector row has no children');
        const nestedPick = savPick.items[0].children[0];
        t.equal(nestedPick.kind, 'FileSelector', 'menu-picker', 'the nested selector round-trips through the editor');
        t.equal(nestedPick.pathType, 'File', 'menu-picker', 'including its PathType');
    }

    // --- Status Items editor (the Status Bar is a DockPanel; items are kind + text + Left/Right) ---
    // The 'Status Items' property opens a FLAT item editor (no nesting). Save posts the list back
    // and the extension writes the child controls; each item is anchored LEFT or RIGHT.
    {
        msg(frame([
            { name: 'Root', type: 'DockPanel', x: 0, y: 0, w: 800, h: 450, parent: null },
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true, parent: 'Root' },
            { name: 'StatusBar1', type: 'DockPanel', x: 0, y: 426, w: 800, h: 24, parent: 'Root' }
        ]));
        msg({
            type: 'properties', name: 'StatusBar1', properties: [
                { key: 'StatusItems', label: 'Status Items', kind: 'button', value: 'Edit status items…' }
            ], statusItems: [
                { kind: 'TextBlock', text: 'Ready', position: 'Left' },
                { kind: 'StatusDate', text: '', position: 'Right' }
            ], info: null
        });
        const pbtn = $('propsBody').querySelector('.prop-button');
        t.ok(!!pbtn, 'status-items', 'Status Items property renders as a button');
        $('statusModal').hidden = true;
        pbtn.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('statusModal').hidden, false, 'status-items', 'Status Items opens the editor');
        let rows = $('statusBody').querySelectorAll('.mn-row');
        t.equal(rows.length, 2, 'status-items', 'editor lists the bar items');
        t.equal(rows[0].querySelector('.mn-header').value, 'Ready', 'status-items', 'Ready text shown');
        t.equal(rows[1].querySelector('.mn-sep-label').textContent, 'live clock', 'status-items', 'clock row labelled');

        // Add an item, turn it into a RIGHT-anchored Button with text, then Save.
        $('statusAdd').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        rows = $('statusBody').querySelectorAll('.mn-row');
        const kindSel = rows[rows.length - 1].querySelector('.mn-kind');
        kindSel.value = 'Button';
        kindSel.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        rows = $('statusBody').querySelectorAll('.mn-row');
        t.equal(rows.length, 3, 'status-items', 'three rows after adding');
        const rowB = rows[rows.length - 1];
        const textInp = rowB.querySelector('.mn-header');
        t.ok(!!textInp, 'status-items', 'Button row has a text field');
        textInp.value = 'Save';
        textInp.dispatchEvent(new s.window.Event('input', { bubbles: true }));
        const posSel = rowB.querySelector('.mn-pos');
        posSel.value = 'Right';
        posSel.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        posted.length = 0;
        $('statusSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const sav = posted[posted.length - 1];
        t.equal(sav.type, 'saveStatusItems', 'status-items', 'Save posts saveStatusItems');
        t.equal(sav.name, 'StatusBar1', 'status-items', 'carries the bar name');
        t.equal(sav.items.length, 3, 'status-items', 'three items after add');
        const added = sav.items[2];
        t.equal(added.kind, 'Button', 'status-items', 'Button kind carried');
        t.equal(added.text, 'Save', 'status-items', 'Button text carried');
        t.equal(added.position, 'Right', 'status-items', 'Right anchor carried');

        // Escape closes without saving.
        pbtn.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        posted.length = 0;
        const esc2 = new s.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        s.window.document.dispatchEvent(esc2);
        t.equal($('statusModal').hidden, true, 'status-items', 'Escape closes the status editor');
        t.ok(posted.every((m) => m.type !== 'saveStatusItems'), 'status-items', 'Escape does not save');
    }

    // --- Split Layout editor (SplitPanel = a Border frame around a Grid of panes + GridSplitters) ---
    // The 'Split Layout' property opens a modal to switch Zones (the default T) / Columns / Rows
    // and set the pane count; Save posts the new layout (the extension rebuilds the Grid + splitters,
    // keeping pane bodies).
    {
        msg(frame([
            { name: 'Root', type: 'DockPanel', x: 0, y: 0, w: 800, h: 450, parent: null },
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true, parent: 'Root' },
            { name: 'SplitPanel1', type: 'Border', x: 60, y: 60, w: 480, h: 300, parent: 'Body' },
            { name: 'SplitPanel1Pane0', type: 'Canvas', x: 60, y: 60, w: 180, h: 240, parent: null },
            { name: 'SplitPanel1Pane1', type: 'Canvas', x: 245, y: 60, w: 175, h: 240, parent: null }
        ]));
        msg({
            type: 'properties', name: 'SplitPanel1', properties: [
                { key: 'SplitLayout', label: 'Split Layout', kind: 'button', value: 'Edit split…' }
            ], splitInfo: { shape: 'zones', count: 3, top: 2 }, info: null
        });
        const pbtn = $('propsBody').querySelector('.prop-button');
        t.ok(!!pbtn, 'split-layout', 'Split Layout property renders as a button');
        $('splitModal').hidden = true;
        pbtn.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('splitModal').hidden, false, 'split-layout', 'Split Layout opens the editor');
        t.equal($('splitZones').classList.contains('active'), true, 'split-layout', 'Zones active for the default T');
        t.equal($('splitPanesRow').hidden, false, 'split-layout', 'stepper shown for Zones (top-pane count)');
        t.equal($('splitPanesLabel').textContent, 'Top panes', 'split-layout', 'Zones stepper labelled Top panes');
        t.equal($('splitCount').value, '2', 'split-layout', 'top-pane count prefilled (2-up default)');
        // Bump Zones to 3 panes up top (3 + 1 below), then check the posted layout.
        $('splitPlus').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('splitCount').value, '3', 'split-layout', 'top-pane count increments');
        posted.length = 0;
        $('splitSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const savZ = posted[posted.length - 1];
        t.equal(savZ.type, 'saveSplitLayout', 'split-layout', 'Save posts saveSplitLayout');
        t.equal(savZ.name, 'SplitPanel1', 'split-layout', 'carries the split name');
        t.equal(savZ.shape, 'zones', 'split-layout', 'Zones shape carried');
        t.equal(savZ.top, 3, 'split-layout', 'top-pane count carried');
        t.equal(savZ.count, 3, 'split-layout', 'count carried');
        // Re-open, switch to Rows: the stepper becomes the pane count (defaults to the old total).
        $('splitModal').hidden = true;
        pbtn.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        $('splitRows').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('splitRows').classList.contains('active'), true, 'split-layout', 'Rows active after click');
        t.equal($('splitPanesLabel').textContent, 'Panes', 'split-layout', 'Columns/Rows stepper labelled Panes');
        t.equal($('splitCount').value, '3', 'split-layout', 'pane count defaults from splitInfo');
        $('splitMinus').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('splitCount').value, '2', 'split-layout', 'pane count decrements');
        $('splitPlus').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        $('splitPlus').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('splitCount').value, '4', 'split-layout', 'pane count increments');
        posted.length = 0;
        $('splitSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const sav = posted[posted.length - 1];
        t.equal(sav.type, 'saveSplitLayout', 'split-layout', 'Save posts saveSplitLayout');
        t.equal(sav.name, 'SplitPanel1', 'split-layout', 'carries the split name');
        t.equal(sav.shape, 'rows', 'split-layout', 'Rows shape carried');
        t.equal(sav.count, 4, 'split-layout', 'pane count carried');
        t.equal($('splitModal').hidden, true, 'split-layout', 'Save closes the editor');
    }

    // --- Splitters editor (the runtime divider bars of a SplitPanel) ---
    // The 'Splitters' property opens a modal with one row per GridSplitter; each row has a
    // thickness, a colour and a Visible toggle; Save posts saveSplitters with the rows in order.
    {
        msg(frame([
            { name: 'Root', type: 'DockPanel', x: 0, y: 0, w: 800, h: 450, parent: null },
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true, parent: 'Root' },
            { name: 'SplitPanel1', type: 'Border', x: 60, y: 60, w: 480, h: 300, parent: 'Body' }
        ]));
        msg({
            type: 'properties', name: 'SplitPanel1', properties: [
                { key: 'Splitters', label: 'Splitters', kind: 'button', value: 'Edit splitters…' }
            ], splitInfo: { shape: 'zones', count: 3 }, splitters: [
                { direction: 'vertical', thickness: '5', color: '#C0C0C0', visible: true },
                { direction: 'horizontal', thickness: '5', color: '#C0C0C0', visible: true }
            ], info: null
        });
        const pbtn2 = $('propsBody').querySelector('.prop-button');
        t.ok(!!pbtn2, 'splitters', 'Splitters property renders as a button');
        $('splitterModal').hidden = true;
        pbtn2.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('splitterModal').hidden, false, 'splitters', 'Splitters opens the editor');
        const rows = $('splitterBody').querySelectorAll('.splitter-row');
        t.equal(rows.length, 2, 'splitters', 'one row per divider bar');
        t.ok(/Vertical divider/.test(rows[0].textContent), 'splitters', 'first row labelled Vertical divider');
        t.ok(/Horizontal divider/.test(rows[1].textContent), 'splitters', 'second row labelled Horizontal divider');
        // Change the first (vertical) splitter: thickness 9, hide it.
        const first = rows[0];
        const thickIn = first.querySelector('input[type=number]');
        thickIn.value = '9';
        thickIn.dispatchEvent(new s.window.Event('input', { bubbles: true }));
        const visIn = first.querySelector('input[type=checkbox]');
        visIn.checked = false;
        visIn.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        posted.length = 0;
        $('splitterSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const spv = posted[posted.length - 1];
        t.equal(spv.type, 'saveSplitters', 'splitters', 'Save posts saveSplitters');
        t.equal(spv.name, 'SplitPanel1', 'splitters', 'carries the split name');
        t.equal(spv.items[0].direction, 'vertical', 'splitters', 'row order preserved');
        t.equal(spv.items[0].thickness, '9', 'splitters', 'thickness change carried');
        t.equal(spv.items[0].visible, false, 'splitters', 'visibility change carried');
        t.equal(spv.items[1].direction, 'horizontal', 'splitters', 'second row preserved');
        t.equal($('splitterModal').hidden, true, 'splitters', 'Save closes the editor');
    }

    // --- design-time splitter drag: press on a SplitPanel divider → guide follows → ONE
    // 'setSplitter' post on release (the extension turns it into a pane size). ---
    {
        msg({
            type: 'frame', png: 'AA==', width: 800, height: 450,
            controls: [
                { name: 'Root', type: 'DockPanel', x: 0, y: 0, width: 800, height: 450, parent: null, locked: false },
                { name: 'SplitPanel1Pane0', type: 'Canvas', x: 60, y: 60, width: 180, height: 240, parent: null, locked: false },
                { name: 'SplitPanel1Pane1', type: 'Canvas', x: 247, y: 60, width: 180, height: 240, parent: null, locked: false }
            ],
            splitBars: [
                { pane: 'SplitPanel1Pane0', other: 'SplitPanel1Pane1', axis: 'v', x: 240, y: 60, w: 7, h: 240 }
            ]
        });
        posted.length = 0;
        $('splitGuide').hidden = true; // real DOM ships it hidden
        const pdSplit = new s.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 243, clientY: 150 });
        $('canvas').dispatchEvent(pdSplit);
        t.equal($('splitGuide').hidden, true, 'splitter-drag', 'guide hidden until the divider moves');
        dispatch('pointermove', 'canvas', { clientX: 300, clientY: 150 });
        t.equal($('splitGuide').hidden, false, 'splitter-drag', 'guide shown while dragging the divider');
        dispatch('pointerup', 'canvas', { clientX: 300, clientY: 150 });
        const sp = posted.find((m) => m.type === 'setSplitter');
        t.ok(!!sp, 'splitter-drag', 'pointerdown on a divider starts a splitter drag');
        t.equal(sp && sp.pane, 'SplitPanel1Pane0', 'splitter-drag', 'left/top pane carried');
        t.equal(sp && sp.other, 'SplitPanel1Pane1', 'splitter-drag', 'far pane carried');
        t.equal(sp && sp.axis, 'v', 'splitter-drag', 'vertical axis carried');
        t.equal(sp && sp.pos, 300, 'splitter-drag', 'pointer position along the axis carried');
        t.equal($('splitGuide').hidden, true, 'splitter-drag', 'guide hidden after release');
        t.equal(posted.filter((m) => m.type === 'setSplitter').length, 1, 'splitter-drag', 'exactly one setSplitter message');
    }

    // --- 'Rows' / 'Columns' editors (DataGrid decoration) ---
    // A selected DataGrid shows a Rows and a Columns property button; each opens the decoration
    // modal pre-filled from the sent values; Save posts saveDataGridRows / saveDataGridCols.
    {
        msg(frame([
            { name: 'Root', type: 'DockPanel', x: 0, y: 0, w: 800, h: 450, parent: null },
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true, parent: 'Root' },
            { name: 'Grid1', type: 'DataGrid', x: 60, y: 60, w: 240, h: 160, parent: 'Body' }
        ]));
        msg({
            type: 'properties', name: 'Grid1', properties: [
                { key: 'Rows', label: 'Rows', kind: 'button', value: 'Edit rows…' },
                { key: 'Columns', label: 'Columns', kind: 'button', value: 'Edit columns…' }
            ], dgRows: { rowBackground: '', foreground: '', rowHeight: '', rowHeaderWidth: '0', gridLines: 'None', hLine: '', vLine: '', headers: 'All' },
            dgCols: { columnWidth: 'Auto', minColumnWidth: '20', maxColumnWidth: '', frozenCount: '0', headerHeight: '' },
            info: null
        });
        const btns = $('propsBody').querySelectorAll('.prop-button');
        t.equal(btns.length, 2, 'dg-editor', 'Rows and Columns buttons render');
        // Open Rows: pre-filled fields, change row background + row height, Save.
        $('dgModal').hidden = true;
        btns[0].dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('dgModal').hidden, false, 'dg-editor', 'Rows opens the editor');
        t.equal($('dgTitle').textContent, 'Rows', 'dg-editor', 'title Rows');
        const rowEls = $('dgBody').querySelectorAll('.splitter-row');
        t.equal(rowEls.length, 8, 'dg-editor', 'eight row fields');
        const colors = rowEls[0].querySelectorAll('input');
        t.ok(colors.length >= 2, 'dg-editor', 'row background has a colour field');
        const rowHeightInput = rowEls[2].querySelector('input');
        rowHeightInput.value = '28';
        rowHeightInput.dispatchEvent(new s.window.Event('input', { bubbles: true }));
        posted.length = 0;
        $('dgSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const rowMsg = posted[posted.length - 1];
        t.equal(rowMsg.type, 'saveDataGridRows', 'dg-editor', 'Save posts saveDataGridRows');
        t.equal(rowMsg.name, 'Grid1', 'dg-editor', 'carries the grid name');
        t.equal(rowMsg.values.rowHeight, '28', 'dg-editor', 'row height change carried');
        t.equal($('dgModal').hidden, true, 'dg-editor', 'Rows Save closes the editor');
        // Open Columns: change column width + frozen count + header text font, Save.
        btns[1].dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('dgTitle').textContent, 'Columns', 'dg-editor', 'title Columns');
        const colEls = $('dgBody').querySelectorAll('.splitter-row');
        t.equal(colEls.length, 10, 'dg-editor', 'ten column/header fields');
        t.ok(/Header text alignment/.test(colEls[5].textContent), 'dg-editor', 'header alignment field present');
        t.ok(/Header background/.test(colEls[9].textContent), 'dg-editor', 'header background field present');
        const widthInput = colEls[0].querySelector('input');
        widthInput.value = '2*';
        widthInput.dispatchEvent(new s.window.Event('input', { bubbles: true }));
        const frozenInput = colEls[3].querySelector('input');
        frozenInput.value = '1';
        frozenInput.dispatchEvent(new s.window.Event('input', { bubbles: true }));
        const fontSel = colEls[7].querySelector('select');
        t.ok(fontSel, 'dg-editor', 'header font is a dropdown');
        t.ok(fontSel.options.length > 5, 'dg-editor', 'font dropdown is populated (fallback fonts)');
        fontSel.value = 'Arial';
        fontSel.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        const alignSel = colEls[5].querySelector('select');
        alignSel.value = 'Center';
        alignSel.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        posted.length = 0;
        $('dgSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const colMsg = posted[posted.length - 1];
        t.equal(colMsg.type, 'saveDataGridCols', 'dg-editor', 'Save posts saveDataGridCols');
        t.equal(colMsg.values.columnWidth, '2*', 'dg-editor', 'column width carried');
        t.equal(colMsg.values.frozenCount, '1', 'dg-editor', 'frozen columns carried');
        t.equal(colMsg.values.headerFont, 'Arial', 'dg-editor', 'header font carried');
        t.equal(colMsg.values.headerAlign, 'Center', 'dg-editor', 'header alignment carried');
        t.equal($('dgModal').hidden, true, 'dg-editor', 'Columns Save closes the editor');
    }
    // --- 'Series' editor (GrumpyCharts): a chart's series are CHILD ELEMENTS, so the editor owns
    // the list (add / delete / reorder) and posts each entry's source child index, which is how the
    // extension keeps an existing element (with any per-series axis it carries) or creates a new one.
    {
        msg(frame([
            { name: 'Root', type: 'DockPanel', x: 0, y: 0, w: 800, h: 450, parent: null },
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true, parent: 'Root' },
            { name: 'Chart1', type: 'GrumpyLinePlot', x: 60, y: 60, w: 300, h: 180, parent: 'Body' }
        ]));
        const chartSeries = [
            { src: '0', type: 'Line', title: 'Inside', xColumn: '', yColumn: 'C', axisMode: 'Common', lineColor: '#FF0000', lineThickness: '3', lineStyle: 'Solid', markerStyle: 'Dot', markerSize: '8', connected: 'True' },
            { src: '1', type: 'Line', title: 'Outside', xColumn: '', yColumn: 'E', axisMode: 'Common', lineColor: '#0000FF', lineThickness: '3', lineStyle: 'Solid', markerStyle: 'Dot', markerSize: '8', connected: 'True' }
        ];
        msg({
            type: 'properties', name: 'Chart1', properties: [
                { key: 'Series', label: 'Series', kind: 'button', value: 'Edit series…' }
            ], chartSeries: chartSeries, info: null
        });
        const sbtn = $('propsBody').querySelector('.prop-button');
        t.ok(!!sbtn, 'series', 'Series renders as a property button');
        $('seriesModal').hidden = true;
        sbtn.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('seriesModal').hidden, false, 'series', 'Series opens the editor');
        t.equal($('seriesTitle').textContent, 'Series — Chart1', 'series', 'the title names the chart');
        const sItems = () => $('seriesList').querySelectorAll('.series-item');
        const sFields = () => [...$('seriesFields').querySelectorAll('.series-field')];
        const sField = (caption) => {
            const row = sFields().find((f) => f.textContent.trim().startsWith(caption));
            return row ? row.querySelector('input, select') : null;
        };
        t.equal(sItems().length, 2, 'series', 'one row per series');
        t.ok(/Inside/.test(sItems()[0].textContent), 'series', 'the first row shows its title + columns');
        t.ok(sItems()[0].className.indexOf('active') >= 0, 'series', 'the FIRST entry starts selected');
        t.ok(/Marker/.test($('seriesFields').textContent) === false, 'series',
            'a line series offers no marker fields');
        // Every series carries a Visible switch (the legend's tick box is the runtime version of it).
        t.ok(/Visible/.test($('seriesFields').textContent), 'series', 'the Visible switch is offered');

        // + Add series: a fresh entry, selected, in the next palette colour, with no Y column of its
        // own (empty = the chart's own column at render time).
        $('seriesAdd').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(sItems().length, 3, 'series', '+ Add series appends an entry');
        t.equal($('seriesHead').textContent, 'Series 3 of 3', 'series', 'the new entry is selected');
        t.equal(sField('Y Column').value, '', 'series', 'a new series has no Y column of its own');
        t.equal(sField('Line Colour').value.toLowerCase(), '#3d9970', 'series',
            'a new series takes the next palette colour (the swatch normalises case)');

        // Type into it: the list row follows live (title + column summary).
        const yIn = sField('Y Column');
        yIn.value = 'G';
        yIn.dispatchEvent(new s.window.Event('input', { bubbles: true }));
        const titleIn = sField('Title');
        titleIn.value = 'Delta';
        titleIn.dispatchEvent(new s.window.Event('input', { bubbles: true }));
        t.ok(/Delta/.test(sItems()[2].textContent) && /Y G/.test(sItems()[2].textContent), 'series',
            'editing a field updates its list row');

        // ↑ Up swaps it with the row above (the order is what the chart draws in).
        $('seriesUp').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('seriesHead').textContent, 'Series 2 of 3', 'series', 'Up moves the selection with the row');
        t.ok(/Delta/.test(sItems()[1].textContent), 'series', 'Up moves the entry one place up');
        t.equal($('seriesDown').disabled, false, 'series', 'Down is available again after moving up');

        // Save: every entry carries its source index, so the extension can keep the right element.
        posted.length = 0;
        $('seriesSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const sv = posted[posted.length - 1];
        t.equal(sv.type, 'saveChartSeries', 'series', 'Save posts saveChartSeries');
        t.equal(sv.name, 'Chart1', 'series', 'carries the chart name');
        t.equal(sv.items.length, 3, 'series', 'every entry is sent');
        t.equal(sv.items[0].src, '0', 'series', 'the first entry keeps its source child index');
        t.equal(sv.items[1].src, '-1', 'series', 'the new entry is marked as new (-1)');
        t.equal(sv.items[1].title, 'Delta', 'series', 'the new entry carries what was typed');
        t.equal(sv.items[1].yColumn, 'G', 'series', 'its Y column is carried');
        t.equal(sv.items[1].type, 'Line', 'series', 'the chart tag decides the series type');
        t.equal(sv.items[1].visible, 'True', 'series', 'the Visible switch is carried in the save message');
        t.equal(sv.items[2].src, '1', 'series', 'the displaced entry follows in order');
        t.equal($('seriesModal').hidden, true, 'series', 'Save closes the editor');

        // Selecting another row and deleting it drops it from the list (and from the save message).
        // Reopening re-sends the chart's CURRENT two series, so the editor lists two.
        sbtn.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(sItems().length, 2, 'series', 'reopening lists the chart’s series again');
        sItems()[1].dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('seriesHead').textContent, 'Series 2 of 2', 'series', 'clicking a row selects it');
        $('seriesDel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(sItems().length, 1, 'series', 'Delete removes the selected entry');
        posted.length = 0;
        $('seriesSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const del = posted[posted.length - 1];
        t.equal(del.items.length, 1, 'series', 'the deleted entry is not sent back');
        t.equal(del.items.map((i) => i.src).join(','), '0', 'series',
            'the surviving entry keeps its source index');

        // The last series cannot be deleted: a chart always draws at least one line.
        msg({
            type: 'properties', name: 'Chart1', properties: [
                { key: 'Series', label: 'Series', kind: 'button', value: 'Edit series…' }
            ], chartSeries: [chartSeries[0]], info: null
        });
        // A properties message re-renders the panel, so the button must be re-queried (the old node's
        // handler still closes over the PREVIOUS payload).
        $('propsBody').querySelector('.prop-button')
            .dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(sItems().length, 1, 'series', 'a single-series chart lists one entry');
        t.equal($('seriesDel').disabled, true, 'series', 'Delete is disabled at one series');
        t.equal($('seriesUp').disabled, true, 'series', 'Up is disabled on the first row');
        t.equal($('seriesDown').disabled, true, 'series', 'Down is disabled on the last row');
        // Deleting anyway must not empty the list (the button is disabled, and the handler guards).
        $('seriesDel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(sItems().length, 1, 'series', 'the only series cannot be deleted');
        $('seriesCancel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('seriesModal').hidden, true, 'series', 'Cancel closes the editor');
    }

    // --- 'Series' editor, WATERFALL: its series ARE samplesets (one slice each along the depth axis),
    // so the column row is labelled 'Z Column' — the row Grumpy reported missing (2026-09-22) — and its
    // placeholder walks ONE column per set (C, D, E …) instead of the X,Y plots' B/C, D/E pairing. The
    // row writes the ordinary YColumn attribute: no new XAML property, so an existing project's bundled
    // chart copy stays valid.
    {
        msg(frame([
            { name: 'Root', type: 'DockPanel', x: 0, y: 0, w: 800, h: 450, parent: null },
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true, parent: 'Root' },
            { name: 'Wf1', type: 'GrumpyWaterfallPlot', x: 60, y: 60, w: 300, h: 180, parent: 'Body' }
        ]));
        const wfSeries = [
            { src: '0', type: 'Line', title: 'Sweep 1', xColumn: '', yColumn: '', axisMode: 'Common', lineColor: '#2D7DD2', lineThickness: '2', lineStyle: 'Solid', markerStyle: 'Dot', markerSize: '8', connected: 'True', zColumn: 'True', zFirst: 'C', defY: 'C' },
            { src: '1', type: 'Line', title: 'Sweep 2', xColumn: '', yColumn: '', axisMode: 'Common', lineColor: '#E4572E', lineThickness: '2', lineStyle: 'Solid', markerStyle: 'Dot', markerSize: '8', connected: 'True', zColumn: 'True', zFirst: 'C', defY: 'D' }
        ];
        msg({
            type: 'properties', name: 'Wf1', properties: [
                { key: 'Series', label: 'Series', kind: 'button', value: 'Edit series…' }
            ], chartSeries: wfSeries, info: null
        });
        $('propsBody').querySelector('.prop-button')
            .dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('seriesModal').hidden, false, 'series-wf', 'the waterfall opens the same editor');
        const wItems = () => $('seriesList').querySelectorAll('.series-item');
        const wFields = () => [...$('seriesFields').querySelectorAll('.series-field')];
        const wField = (caption) => {
            const row = wFields().find((f) => f.textContent.trim().startsWith(caption));
            return row ? row.querySelector('input, select') : null;
        };
        t.ok(/Z Column/.test($('seriesFields').textContent), 'series-wf',
            'a sampleset offers a Z Column row');
        t.ok(/Y Column/.test($('seriesFields').textContent) === false, 'series-wf',
            'and not a second row called Y Column');
        t.ok(/Z C/.test(wItems()[0].textContent) && /Z D/.test(wItems()[1].textContent), 'series-wf',
            'the list summarises each set by its Z column (walking C, D …)');
        // + Add series: the placeholder continues the walk (third set → E), not the X/Y pairing (G).
        $('seriesAdd').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(wItems().length, 3, 'series-wf', '+ Add series appends another sampleset');
        t.equal(wField('Z Column').value, '', 'series-wf', 'a new set has no column of its own');
        t.equal(wField('Z Column').placeholder, 'E', 'series-wf',
            'its fallback is the next column along (E), not the X/Y pairing (G)');
        const zIn = wField('Z Column');
        zIn.value = 'L';
        zIn.dispatchEvent(new s.window.Event('input', { bubbles: true }));
        t.ok(/Z L/.test(wItems()[2].textContent), 'series-wf',
            'typing a column updates the list summary');
        posted.length = 0;
        $('seriesSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const wSave = posted[posted.length - 1];
        t.equal(wSave.type, 'saveChartSeries', 'series-wf', 'Save posts saveChartSeries');
        t.equal(wSave.items[2].yColumn, 'L', 'series-wf',
            "the Z Column row is written as the series' YColumn (a real ChartSeries property)");
        t.ok(!('zColumn' in wSave.items[2]) && !('zFirst' in wSave.items[2]), 'series-wf',
            'the editor metadata never reaches the XAML');
    }

    // --- 'Axis' editor (GrumpyCharts): the chart's two COMMON axes plus one X/Y pair per series that
    // is set to Per series. An axis has a side, a visibility switch, a colour, two tick sets, tick
    // labels and a name; a per-series axis can be added (tick "Own axis") and deleted again, and a
    // series on the common axes is listed read-only as information.
    {
        msg(frame([
            { name: 'Root', type: 'DockPanel', x: 0, y: 0, w: 800, h: 450, parent: null },
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true, parent: 'Root' },
            { name: 'Chart1', type: 'GrumpyXYPlot', x: 60, y: 60, w: 300, h: 180, parent: 'Body' }
        ]));
        msg({
            type: 'properties', name: 'Chart1', properties: [
                { key: 'Axis', label: 'Axis', kind: 'button', value: 'Edit axes…' }
            ],
            chartAxes: {
                commonX: null, commonY: null,
                legacy: {
                    showAxis: 'True', axisColor: '#123456', showMajorTicks: 'True', majorTickLength: '6',
                    showMinorTicks: 'True', minorTickLength: '3', showTickLabels: 'True',
                    tickLabelFontSize: '11', showAxisName: 'True', xName: 'Time', yName: 'Inside'
                },
                series: [
                    { title: 'One', type: 'XY', axisMode: 'PerSeries', x: null, y: null },
                    { title: 'Two', type: 'XY', axisMode: 'Common', x: null, y: null }
                ]
            },
            info: null
        });
        const abtn = $('propsBody').querySelector('.prop-button');
        t.ok(!!abtn, 'axes', 'Axis renders as a property button');
        $('axisModal').hidden = true;
        abtn.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('axisModal').hidden, false, 'axes', 'Axis opens the editor');
        const aItems = () => $('axisList').querySelectorAll('.series-item');
        const aFields = () => [...$('axisFields').querySelectorAll('.series-field')];
        // The caption is matched EXACTLY: 'Name' must not find the 'Name colour' row that sits above it
        // (the row's own caption is the span, the editors follow it).
        const aField = (caption) => {
            const row = aFields().find((f) => f.querySelector('span') && f.querySelector('span').textContent === caption);
            return row ? row.querySelector('input, select') : null;
        };
        // A colour row holds TWO inputs: the swatch, then the authoritative text field (so a colour
        // NAME like "White" survives). The text field is the one the editor reads and writes.
        const aColour = (caption) => {
            const row = aFields().find((f) => f.querySelector('span') && f.querySelector('span').textContent === caption);
            return row ? row.querySelectorAll('input')[1] : null;
        };
        // common Y, common X, series 1 X, series 1 Y, and an information row for series 2
        t.equal(aItems().length, 5, 'axes', 'both common axes and the per-series axes are listed');
        t.ok(/uses the common axes/.test(aItems()[4].textContent), 'axes',
            'a series on the common axes is listed as information');
        t.equal(aItems()[4].disabled, true, 'axes', 'and that row cannot be selected');
        // The first slot (the common Y axis) is pre-filled from the chart-level scalars.
        t.equal(aColour('Line colour').value.toLowerCase(), '#123456', 'axes',
            'the common axis is pre-filled from the chart-level properties');
        // The two TEXT colours are separate rows and start EMPTY: empty means "follow the line colour",
        // which is what a form written before they existed means.
        t.equal(aColour('Label colour').value, '', 'axes', 'the tick-label colour starts empty (follows)');
        t.equal(aColour('Name colour').value, '', 'axes', 'and so does the axis-name colour');
        t.equal(aField('Name').value, 'Inside', 'axes', 'including its name');
        // Move it to the other side and make it invisible.
        const posSel = aField('Position');
        t.equal(posSel.value, 'Left', 'axes', 'a Y axis starts on the left');
        posSel.value = 'Right';
        posSel.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        const visSel = aField('Visible');
        t.equal(visSel.value, 'True', 'axes', 'and is visible (On)');
        visSel.value = 'False';
        visSel.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        // The X axis offers only Top/Bottom.
        aItems()[1].dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const xPositions = [...aField('Position').options].map((o) => o.value);
        t.equal(xPositions.join(','), 'Top,Bottom', 'axes', 'an X axis offers Top/Bottom only');
        // Series 1's Y axis: not its own yet → the fields are disabled. Adding it enables them.
        aItems()[3].dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(aField('Position').disabled, true, 'axes',
            'a per-series axis that does not exist yet shows its fields disabled');
        t.equal($('axisAdd').disabled, false, 'axes', 'Add axis is offered for it');
        t.equal($('axisDel').disabled, true, 'axes', 'Delete is not (there is nothing to delete)');
        $('axisAdd').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(aField('Position').disabled, false, 'axes', 'Add axis enables its fields');
        t.equal($('axisDel').disabled, false, 'axes', 'and offers Delete');
        aColour('Line colour').value = '#00AA00';
        aColour('Line colour').dispatchEvent(new s.window.Event('input', { bubbles: true }));
        posted.length = 0;
        $('axisSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const ax = posted[posted.length - 1];
        t.equal(ax.type, 'saveChartAxes', 'axes', 'Save posts saveChartAxes');
        t.equal(ax.name, 'Chart1', 'axes', 'carries the chart name');
        t.equal(ax.commonY.position, 'Right', 'axes', 'the common Y axis side is carried');
        t.equal(ax.commonY.showAxis, 'False', 'axes', 'and its visibility');
        t.equal(ax.commonX.position, 'Bottom', 'axes', 'the untouched common X axis keeps its default');
        t.equal(ax.series.length, 1, 'axes', 'the Common-axis series is not sent');
        t.equal(ax.series[0].y.axisColor.toLowerCase(), '#00aa00', 'axes', 'the added per-series Y axis is sent');
        t.equal(ax.series[0].x, null, 'axes', 'its X axis stays unset');
        t.equal($('axisModal').hidden, true, 'axes', 'Save closes the editor');

        // Deleting a per-series axis sends null for it (the property element goes away).
        $('propsBody').querySelector('.prop-button')
            .dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        aItems()[3].dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(aField('Position').disabled, true, 'axes', 'a new edit starts from the sent data again');
        $('axisAdd').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        posted.length = 0;
        $('axisDel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        $('axisSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const del = posted[posted.length - 1];
        t.equal(del.series[0].y, null, 'axes', 'Delete sends null, which removes the axis element');
        $('axisCancel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('axisModal').hidden, true, 'axes', 'Cancel closes the editor');
    }

    // --- 'Legend' editor: the bar's on/off switch, which side it takes, and its frame ---
    {
        msg(frame([
            { name: 'Root', type: 'DockPanel', x: 0, y: 0, w: 800, h: 450, parent: null },
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true, parent: 'Root' },
            { name: 'Chart1', type: 'GrumpyXYPlot', x: 60, y: 60, w: 300, h: 180, parent: 'Body' }
        ]));
        msg({
            type: 'properties', name: 'Chart1', properties: [
                { key: 'Legend', label: 'Legend', kind: 'button', value: 'Edit legend…' }
            ],
            legendInfo: {
                showLegend: 'True', position: 'Bottom', fontSize: '12', showFrame: 'True',
                backColor: 'Transparent', borderBrush: '#C8C8C8', borderThickness: '1', cornerRadius: '4'
            },
            info: null
        });
        const lbtn = $('propsBody').querySelector('.prop-button');
        t.ok(!!lbtn, 'legend', 'Legend renders as a property button');
        $('legendModal').hidden = true;
        lbtn.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('legendModal').hidden, false, 'legend', 'Legend opens the editor');
        t.equal($('legendTitle').textContent, 'Legend — Chart1', 'legend', 'the title names the chart');
        const lFields = () => [...$('legendBody').querySelectorAll('.series-field')];
        const lField = (caption) => {
            const row = lFields().find((f) => f.textContent.trim().startsWith(caption));
            return row ? row.querySelector('input, select') : null;
        };
        // A colour row carries a swatch AND an authoritative text field — the text is the value.
        const lColour = (caption) => {
            const row = lFields().find((f) => f.textContent.trim().startsWith(caption));
            return row ? row.querySelector('input[type=text]') : null;
        };
        t.equal(lField('Legend').value, 'True', 'legend', 'the bar starts switched on');
        t.equal(lField('Position').value, 'Bottom', 'legend', 'on the bottom by default');
        t.equal([...lField('Position').options].map((o) => o.value).join(','), 'Bottom,Top,Left,Right',
            'legend', 'the four sides are offered');
        t.equal(lField('Frame').value, 'True', 'legend', 'the frame is on by default');
        t.equal(lColour('Backcolour').value, 'Transparent', 'legend', 'with a transparent backcolour');
        t.equal(lField('Corner radius').value, '4', 'legend', 'and a rounded corner');
        // Switch the bar off, move it to the right and give the frame a backcolour + radius.
        const onOff = lField('Legend');
        onOff.value = 'False';
        onOff.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        const pos = lField('Position');
        pos.value = 'Right';
        pos.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        const back = lColour('Backcolour');
        back.value = '#FFFF00';
        back.dispatchEvent(new s.window.Event('input', { bubbles: true }));
        const radius = lField('Corner radius');
        radius.value = '12';
        radius.dispatchEvent(new s.window.Event('input', { bubbles: true }));
        posted.length = 0;
        $('legendSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const lg = posted[posted.length - 1];
        t.equal(lg.type, 'saveChartLegend', 'legend', 'Save posts saveChartLegend');
        t.equal(lg.name, 'Chart1', 'legend', 'carries the chart name');
        t.equal(lg.values.showLegend, 'False', 'legend', 'the on/off switch is carried');
        t.equal(lg.values.position, 'Right', 'legend', 'the chosen side is carried');
        t.equal(String(lg.values.backColor).toLowerCase(), '#ffff00', 'legend',
            'the frame backcolour is carried');
        t.equal(lg.values.cornerRadius, '12', 'legend', 'and the corner radius');
        t.equal(lg.values.showFrame, 'True', 'legend', 'the untouched frame switch keeps its value');
        t.equal($('legendModal').hidden, true, 'legend', 'Save closes the editor');
        $('propsBody').querySelector('.prop-button')
            .dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        $('legendCancel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('legendModal').hidden, true, 'legend', 'Cancel closes the editor');
    }

    // --- 'Legend' editor on a SURFACE chart: the same bar, PLUS the range window that zooms the sheet.
    //     The sliders span the range the DATA covers (the extension sends it, measured by the host), and
    //     an end left at the outer edge posts EMPTY — "the whole range" — so the attribute is removed. ---
    {
        const LEGEND = {
            showLegend: 'True', position: 'Bottom', fontSize: '12', showFrame: 'True',
            backColor: 'Transparent', borderBrush: '#C8C8C8', borderThickness: '1', cornerRadius: '4',
            margin: '0', rangeXFrom: '', rangeXTo: '', rangeZFrom: '', rangeZTo: ''
        };
        const openSurfaceLegend = (legendRange, info) => {
            msg(frame([
                { name: 'Root', type: 'DockPanel', x: 0, y: 0, w: 800, h: 450, parent: null },
                { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true, parent: 'Root' },
                { name: 'Surf1', type: 'GrumpySurfacePlot', x: 60, y: 60, w: 380, h: 260, parent: 'Body' }
            ]));
            msg({
                type: 'properties', name: 'Surf1', properties: [
                    { key: 'Legend', label: 'Legend', kind: 'button', value: 'Edit legend…' }
                ],
                legendInfo: Object.assign({}, LEGEND, info || {}),
                legendRange: legendRange,
                info: null
            });
            $('legendModal').hidden = true;
            $('propsBody').querySelector('.prop-button')
                .dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        };
        const lRow = (caption) => [...$('legendBody').querySelectorAll('.series-field')]
            .find((f) => f.textContent.trim().startsWith(caption));
        const lSliders = (caption) => {
            const row = lRow(caption);
            return row ? [...row.querySelectorAll("input[type='range']")] : [];
        };

        openSurfaceLegend({ minX: 0, maxX: 100, minZ: 0, maxZ: 500 });
        t.equal($('legendModal').hidden, false, 'range', 'the surface legend opens like any other');
        const xSliders = lSliders('Width range');
        const zSliders = lSliders('Slice range');
        t.equal(xSliders.length, 2, 'range', 'the width range is a FROM slider and a TO slider');
        t.equal(zSliders.length, 2, 'range', 'and so is the slice range');
        t.equal(`${xSliders[0].min}/${xSliders[0].max}`, '0/100', 'range',
            'the width sliders span the width the DATA covers');
        t.equal(`${zSliders[0].min}/${zSliders[0].max}`, '0/500', 'range',
            'and the slice sliders the LENGTH it covers — the height has no slider at all');
        t.equal(`${xSliders[0].value}/${xSliders[1].value}`, '0/100', 'range',
            'with no window set they start at the whole sheet');
        t.ok(!!lRow('Width range').querySelector('.range-readout').textContent.includes('100'), 'range',
            'and the row spells the range out');
        t.ok(!!lRow('Width range').querySelector('.range-reset'), 'range',
            'there is a way back to the whole range');

        // Pick 70 … 100 of the width (the TOP end stays at the edge, so it posts empty) and 200 … 300 of
        // the length.
        xSliders[0].value = '70';
        xSliders[0].dispatchEvent(new s.window.Event('input', { bubbles: true }));
        zSliders[0].value = '200';
        zSliders[0].dispatchEvent(new s.window.Event('input', { bubbles: true }));
        posted.length = 0;
        $('legendSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const zoomed = posted[posted.length - 1];
        t.equal(zoomed.type, 'saveChartLegend', 'range', 'the range is saved with the legend');
        t.equal(zoomed.values.rangeXFrom, '70', 'range', 'the width FROM end is carried');
        t.equal(zoomed.values.rangeXTo, '', 'range',
            'an end left at the outer edge posts EMPTY, so no attribute is written for it');
        t.equal(zoomed.values.rangeZFrom, '200', 'range', 'the slice FROM end is carried');
        t.equal(zoomed.values.rangeZTo, '', 'range', 'and its outer end stays empty too');

        // 'Whole range' puts both ends back to the outside.
        openSurfaceLegend({ minX: 0, maxX: 100, minZ: 0, maxZ: 500 }, zoomed.values);
        t.equal(lSliders('Width range')[0].value, '70', 'range',
            'a saved range is pre-filled into the sliders, so the editor shows what the form says');
        t.equal(lSliders('Slice range')[0].value, '200', 'range', 'on both sliders');
        t.equal(lSliders('Width range')[1].value, '100', 'range',
            'and an end that was never set sits at the outside of the range');
        posted.length = 0;
        lRow('Width range').querySelector('.range-reset')
            .dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        lRow('Slice range').querySelector('.range-reset')
            .dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        $('legendSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const whole = posted[posted.length - 1];
        t.equal(`${whole.values.rangeXFrom}|${whole.values.rangeXTo}|${whole.values.rangeZFrom}|${whole.values.rangeZTo}`,
            '|||', 'range', 'the whole-range button clears all four bounds');

        // A surface that has not rendered yet has no measured range: the row says so instead of guessing.
        openSurfaceLegend(null);
        t.equal(lSliders('Width range').length, 0, 'range',
            'with no measured range there are no sliders to mislead');
        t.ok(!!lRow('Data range') && !!lRow('Data range').querySelector('.range-note'), 'range',
            'the editor says the range appears once the form has rendered');
        $('legendCancel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
    }

    // --- 'Cursors' editor: up to two draggable crosshairs, each with its own orientation, style,
    //     colour and readout columns, plus the chart-level readout settings ---
    {
        msg(frame([
            { name: 'Root', type: 'DockPanel', x: 0, y: 0, w: 800, h: 450, parent: null },
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true, parent: 'Root' },
            { name: 'Chart1', type: 'GrumpyXYPlot', x: 60, y: 60, w: 300, h: 180, parent: 'Body' }
        ]));
        msg({
            type: 'properties', name: 'Chart1', properties: [
                { key: 'Cursors', label: 'Cursors', kind: 'button', value: 'Edit cursors…' }
            ],
            cursorInfo: {
                settings: { readoutPosition: 'FollowMouse', decimals: '-1' },
                cursors: [
                    {
                        src: '0', orientation: 'Vertical', style: 'Long', color: 'Teal', xValues: 'False',
                        yValues: 'True', x: '2.5', y: ''
                    }
                ]
            },
            info: null
        });
        const cbtn = $('propsBody').querySelector('.prop-button');
        t.ok(!!cbtn, 'cursor', 'Cursors renders as a property button');
        $('cursorModal').hidden = true;
        cbtn.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('cursorModal').hidden, false, 'cursor', 'Cursors opens the editor');
        t.equal($('cursorTitle').textContent, 'Cursors — Chart1', 'cursor', 'the title names the chart');
        const cFields = () => [...$('cursorFields').querySelectorAll('.series-field')];
        const cField = (caption) => {
            const row = cFields().find((f) => f.textContent.trim().startsWith(caption));
            return row ? row.querySelector('input, select') : null;
        };
        const cColour = (caption) => {
            const row = cFields().find((f) => f.textContent.trim().startsWith(caption));
            return row ? row.querySelector('input[type=text]') : null;
        };
        const cRows = () => [...$('cursorList').querySelectorAll('.series-item')];
        const cList = () => cRows().map((r) => r.querySelector('.series-item-label').textContent);

        // The chart's existing cursor is pre-filled, attribute for attribute.
        t.equal(cRows().length, 1, 'cursor', 'the chart\'s cursor is listed');
        t.ok(cList()[0].startsWith('Cursor 1'), 'cursor', 'as "Cursor 1"', cList()[0]);
        t.ok(cList()[0].includes('2.5'), 'cursor', 'with its position in the summary', cList()[0]);
        t.equal(cField('Orientation').value, 'Vertical', 'cursor', 'its orientation is shown');
        t.equal(cField('Style').value, 'Long', 'cursor', 'and its style');
        t.equal(cColour('Colour').value, 'Teal', 'cursor', 'and a NAMED colour is left alone');
        t.equal(cField('X Values').value, 'False', 'cursor', 'and its readout switches');
        t.equal(cField('X position').value, '2.5', 'cursor', 'and its X position');
        t.equal(cField('Y position').value, '', 'cursor', 'an empty Y reads as empty (the middle)');
        t.equal($('cursorAdd').disabled, false, 'cursor', '+ Add cursor is offered while there is one');
        t.equal($('cursorDel').disabled, false, 'cursor', 'and Delete is live');
        // The orientation picker offers the three shapes, the readout picker the two positions.
        t.equal([...cField('Orientation').options].map((o) => o.value).join(','), 'Both,Vertical,Horizontal',
            'cursor', 'all three orientations are offered');
        t.equal([...cField('Style').options].map((o) => o.value).join(','), 'Solid,Dash,Dot,Long,Short',
            'cursor', 'and all five dash styles');
        const cSettings = () => [...$('cursorSettings').querySelectorAll('.series-field')];
        const cSetting = (caption) => {
            const row = cSettings().find((f) => f.textContent.trim().startsWith(caption));
            return row ? row.querySelector('select') : null;
        };
        t.equal(cSetting('Readout').value, 'FollowMouse', 'cursor',
            'the readout starts following the mouse');
        t.equal([...cSetting('Readout').options].map((o) => o.value).join(','), 'FollowMouse,TopRight',
            'cursor', 'both readout positions are offered');
        t.equal(cSetting('Decimals').value, '-1', 'cursor', 'and the decimals start automatic');
        t.equal([...cSetting('Decimals').options].map((o) => o.value).join(','), '-1,0,1,2,3,4,5,6',
            'cursor', 'with automatic plus 0…6');

        // --- Follow trace: on by default, and it stands the Y position box down ---
        t.equal(cField('Follow trace').value, 'True', 'cursor',
            'the crossing follows the selected trace by default');
        t.equal(cField('Y position').disabled, true, 'cursor',
            'and the Y position box is disabled — a following cursor has no Y of its own');
        const follow = cField('Follow trace');
        follow.value = 'False';
        follow.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        t.equal(cField('Y position').disabled, false, 'cursor',
            'switching the follow off enables the Y position box (a free crosshair)');
        t.ok(cList()[0].indexOf('follows the trace') < 0, 'cursor',
            'and the list summary stops saying it follows the trace', cList()[0]);
        const followBack = cField('Follow trace');
        followBack.value = 'True';
        followBack.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        t.ok(cList()[0].includes('follows the trace'), 'cursor',
            'switching it back on says so again', cList()[0]);

        // A second cursor, then the cap: no third one, and Add says so.
        $('cursorAdd').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(cRows().length, 2, 'cursor', '+ Add cursor adds one');
        t.equal($('cursorAdd').disabled, true, 'cursor', 'and stops at two cursors (the cap)');
        $('cursorAdd').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(cRows().length, 2, 'cursor', 'clicking Add again does nothing');
        t.ok(cList()[1].includes('Cursor 2'), 'cursor', 'the second one is listed as Cursor 2');
        $('cursorDel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(cRows().length, 1, 'cursor', 'Delete removes the selected cursor');
        t.equal($('cursorAdd').disabled, false, 'cursor', 'and Add is available again');

        // Edit the remaining cursor and save: everything lands in the message.
        const orient = cField('Orientation');
        orient.value = 'Horizontal';
        orient.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        const xvals = cField('X Values');
        xvals.value = 'True';
        xvals.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        const xpos = cField('X position');
        xpos.value = '4';
        xpos.dispatchEvent(new s.window.Event('input', { bubbles: true }));
        const readout = cSetting('Readout');
        readout.value = 'TopRight';
        readout.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        const decimals = cSetting('Decimals');
        decimals.value = '2';
        decimals.dispatchEvent(new s.window.Event('change', { bubbles: true }));
        posted.length = 0;
        $('cursorSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        const cs = posted[posted.length - 1];
        t.equal(cs.type, 'saveChartCursors', 'cursor', 'Save posts saveChartCursors');
        t.equal(cs.name, 'Chart1', 'cursor', 'carries the chart name');
        t.equal(cs.settings.readoutPosition, 'TopRight', 'cursor', 'the readout position is carried');
        t.equal(cs.settings.decimals, '2', 'cursor', 'and the decimals');
        t.equal(cs.cursors.length, 1, 'cursor', 'one cursor is carried');
        t.equal(cs.cursors[0].orientation, 'Horizontal', 'cursor', 'with the edited orientation');
        t.equal(cs.cursors[0].xValues, 'True', 'cursor', 'the edited switch');
        t.equal(cs.cursors[0].x, '4', 'cursor', 'and the edited position');
        t.equal(cs.cursors[0].followTrace, 'True', 'cursor', 'the follow switch keeps its value');
        t.equal(cs.cursors[0].src, '0', 'cursor',
            'keeping the element index, so the writer updates the cursor in place');
        t.equal(cs.cursors[0].style, 'Long', 'cursor', 'the untouched style keeps its value');
        t.equal(String(cs.cursors[0].color).toLowerCase(), 'teal', 'cursor', 'and so does the colour');
        t.equal($('cursorModal').hidden, true, 'cursor', 'Save closes the editor');

        // A chart with no cursors: the editor opens EMPTY (opening it must not add one), and
        // Add/Delete work from there.
        msg({
            type: 'properties', name: 'Chart1', properties: [
                { key: 'Cursors', label: 'Cursors', kind: 'button', value: 'Edit cursors…' }
            ],
            cursorInfo: { settings: { readoutPosition: 'TopRight', decimals: '-1' }, cursors: [] },
            info: null
        });
        $('propsBody').querySelector('.prop-button')
            .dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('cursorModal').hidden, false, 'cursor', 'the editor opens for a chart with no cursors');
        t.equal(cRows().length, 0, 'cursor', 'with an EMPTY list (nothing is added by opening it)');
        t.equal($('cursorDel').disabled, true, 'cursor', 'so Delete has nothing to remove');
        t.ok(/no cursors/i.test($('cursorFields').textContent), 'cursor', 'and the empty state says so');
        t.equal(cSetting('Readout').value, 'TopRight', 'cursor',
            'the saved readout position is pre-filled');
        $('cursorAdd').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(cRows().length, 1, 'cursor', 'Add works from the empty state');
        t.equal(cField('Orientation').value, 'Both', 'cursor', 'a new cursor starts as a crosshair');
        t.equal(cField('Style').value, 'Dash', 'cursor', 'with a dashed line');
        t.equal(cColour('Colour').value.toLowerCase(), '#ff8c00', 'cursor',
            'and the first cursor colour');
        $('cursorAdd').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(cColour('Colour').value.toLowerCase(), '#8000ff', 'cursor',
            'the second cursor takes another colour, so two can be told apart');
        // Deleting down to zero is allowed: a chart with no cursors is a real state.
        $('cursorDel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        $('cursorDel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(cRows().length, 0, 'cursor', 'the last cursor can be deleted (unlike a series)');
        posted.length = 0;
        $('cursorSave').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal(posted[posted.length - 1].cursors.length, 0, 'cursor',
            'saving an empty list posts an empty list (the writer removes the property element)');

        // Cancel throws the edits away.
        $('propsBody').querySelector('.prop-button')
            .dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        $('cursorCancel').dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        t.equal($('cursorModal').hidden, true, 'cursor', 'Cancel closes the editor');
    }

    // --- foldable toolbar categories: click a heading to fold its buttons away, click again to
    // bring them back (the REAL markup from the extension, not the fixture's bare buttons) ---
    {
        const panel = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'designerPanel.ts'), 'utf8');
        const markup = panel.slice(panel.indexOf('<div id="toolbar">'), panel.indexOf('<div id="main">'));
        const bar = $('toolbar');
        bar.innerHTML = markup.slice(markup.indexOf('>') + 1, markup.lastIndexOf('</div>'));
        const heads = () => [...bar.querySelectorAll('.tbg-head')];
        const head = (grp) => heads().find((h) => h.dataset.grp === grp);
        const click = (el) => el.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
        // The fixture also keeps a plain copy of every toolbar button directly under <body>, so the
        // injected markup produces DUPLICATE ids and getElementById resolves to that stale copy.
        // Query inside the toolbar instead (the real webview has no duplicates).
        const q = (id) => bar.querySelector('#' + id);
        const membersOf = (h) => {
            const out = [];
            for (let el = h.nextElementSibling; el; el = el.nextElementSibling) {
                if (el.classList.contains('tbg-head') || el.hasAttribute('data-stop')) break;
                out.push(el);
            }
            return out;
        };

        t.equal(heads().length, 6, 'toolbar-groups', 'the real toolbar markup has six category headings');
        t.equal(heads().filter((h) => h.getAttribute('aria-expanded') === 'true').length, 6, 'toolbar-groups',
            'and all six start unfolded');
        for (const id of ['btnUndo', 'btnBackup', 'btnZoomIn', 'zoomValue', 'btnSnapGrid', 'btnAlignLeft', 'btnEqualH', 'status']) {
            t.ok(!!q(id), 'toolbar-groups', `the rendered toolbar still carries #${id}`);
        }
        const alignMembers = membersOf(head('align'));
        t.equal(alignMembers.filter((el) => el.id).length, 9, 'toolbar-groups', 'Alignment owns its nine buttons');
        t.equal(alignMembers.length, 10, 'toolbar-groups',
            'plus the separator that closes the group (it folds away with it)');
        t.equal(membersOf(head('space')).map((el) => el.id).join(','), 'btnEqualV,btnEqualH', 'toolbar-groups',
            'Spacing stops at the data-stop marker (status + ⚙ Settings are never swallowed)');

        // Fold "Alignment": its buttons vanish, the chip reports itself folded, the state is kept.
        const align = head('align');
        const collapsedBefore = JSON.stringify(vscodeState.collapsed || null);
        click(align);
        t.equal(align.getAttribute('aria-expanded'), 'false', 'toolbar-groups', 'clicking a heading folds the category');
        t.equal(q('btnAlignLeft').hidden, true, 'toolbar-groups', 'its buttons are hidden');
        t.equal(q('btnSameHeight').hidden, true, 'toolbar-groups', 'all of them');
        t.equal(alignMembers[9].hidden, true, 'toolbar-groups', 'and so is the separator that ends the group');
        t.equal(q('btnUndo').hidden, false, 'toolbar-groups', 'other categories are untouched');
        t.equal(q('status').hidden, false, 'toolbar-groups', 'the status text stays');
        t.equal(q('btnCodeSettings').hidden, false, 'toolbar-groups', 'and so does ⚙ Settings');
        t.equal(vscodeState.toolbarFolds.align, true, 'toolbar-groups', 'the fold is remembered in the webview state');
        t.equal(JSON.stringify(vscodeState.collapsed || null), collapsedBefore, 'toolbar-groups',
            'and the Properties fold memory in the same state object survives');
        t.ok(/click to unfold/.test(align.title), 'toolbar-groups', 'the tooltip now offers to unfold it');

        // Click again → straight back.
        click(align);
        t.equal(align.getAttribute('aria-expanded'), 'true', 'toolbar-groups', 'clicking again unfolds the category');
        t.equal(q('btnAlignLeft').hidden, false, 'toolbar-groups', 'the buttons are back');
        t.ok(!('align' in vscodeState.toolbarFolds), 'toolbar-groups', 'and the remembered fold is cleared');

        // Categories fold independently.
        click(head('file'));
        click(head('guides'));
        t.equal(q('btnRefresh').hidden, true, 'toolbar-groups', 'File folds on its own');
        t.equal(q('btnDotGrid').hidden, true, 'toolbar-groups', 'so does Guides');
        t.equal(q('btnZoomIn').hidden, false, 'toolbar-groups', 'Zoom is unaffected');
        t.equal(vscodeState.toolbarFolds.file, true, 'toolbar-groups', 'both folds are remembered');
        t.equal(vscodeState.toolbarFolds.guides, true, 'toolbar-groups', '…');
        click(head('file'));
        click(head('guides'));
        t.equal(q('btnRefresh').hidden, false, 'toolbar-groups', 'unfolding puts everything back');
        t.equal(q('btnDotGrid').hidden, false, 'toolbar-groups', '…');
    }

    // --- pointer state: a drag the browser does NOT turn into a click must not eat the next click ---
    // (refactor Phase 1). `suppressClick` was set on every completed drag and cleared only inside the
    // canvas click handler. When the pointer is released off the canvas the browser fires the click on
    // the common ancestor instead, so the canvas never saw one — the flag stayed set and silently
    // swallowed the user's NEXT legitimate click.
    {
        const s2 = setup();
        s2.msg(s2.frame([
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true },
            { name: 'btn1', type: 'Button', x: 100, y: 50, w: 120, h: 36 },
            { name: 'btn2', type: 'Button', x: 300, y: 50, w: 100, h: 30 }
        ]));
        const selBox = s2.$('selection');
        const fullClick = (x, y) => {
            s2.dispatch('pointerdown', 'canvas', { button: 0, clientX: x, clientY: y });
            s2.dispatch('pointerup', 'canvas', { button: 0, clientX: x, clientY: y });
            s2.dispatch('click', 'canvas', { clientX: x, clientY: y });
            return s2.posted.find((m) => m.type === 'select');
        };

        // control: with no preceding drag, a click selects
        const first = fullClick(110, 60);
        t.ok(!!first && first.name === 'btn1', 'pointer-state', 'a plain click selects a control');

        // a real, completed DRAG (the se handle) — this is what sets suppressClick
        const seHandle = selBox.querySelector('.handle.se');
        t.ok(!!seHandle, 'pointer-state', 'the selected control has an se handle to drag');
        s2.posted.length = 0;
        seHandle.dispatchEvent(new s2.window.MouseEvent('pointerdown', {
            bubbles: true, cancelable: true, button: 0, clientX: 220, clientY: 86
        }));
        s2.dispatch('pointermove', 'canvas', { clientX: 225, clientY: 88 });
        s2.dispatch('pointermove', 'canvas', { clientX: 230, clientY: 91 });
        s2.dispatch('pointerup', 'canvas', { clientX: 230, clientY: 91 });
        t.ok(s2.posted.some((m) => m.type === 'resize'), 'pointer-state',
            'the drag completes and posts its resize (so the suppression flag IS set)');

        // The pointer ended off the canvas: the browser fires the click on the common ancestor,
        // so the canvas click handler never runs and never clears the flag.
        s2.window.document.body.dispatchEvent(
            new s2.window.MouseEvent('click', { bubbles: true, cancelable: true }));

        // the user's NEXT click must still work
        s2.posted.length = 0;
        const after = fullClick(320, 60);
        t.ok(!!after && after.name === 'btn2', 'pointer-state',
            'a click after an off-canvas release still selects',
            `posted=${JSON.stringify(s2.posted.map((m) => m.type))}`);
    }

    // --- no CSS attribute selector may be built by concatenating a raw name ---
    // (refactor Phase 1). A control name is XAML-derived; `querySelector('.ov[data-name="' + name +
    // '"]')` throws a SyntaxError inside a dragover handler the moment the name contains a quote.
    // The webview must look the node up (or escape) instead.
    {
        const js = fs.readFileSync(DESIGNER_JS, 'utf8');
        const raw = js.match(/(?:data-name|data-path)="'\s*\+\s*(?!cssEscape\()(?:hit|menuKey)?[A-Za-z_$][\w.$]*/g) || [];
        t.equal(raw, [], 'escape', 'no attribute selector is built from a raw name',
            raw.join(', '));
        t.ok(/const cssEscape =/.test(js), 'escape', 'the webview has its own escape helper');
    }

    // --- a property change must NOT move the Properties panel ---
    // (user report: after setting a property the panel scrolled so the edited row was the last one
    // visible). Two causes: the panel is rebuilt wholesale on every change, and the caret restore
    // called focus() — which makes the browser scroll the focused input into view.
    {
        const s4 = setup();
        s4.msg(s4.frame([
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true },
            { name: 'btn1', type: 'Button', x: 100, y: 50, w: 120, h: 36 }
        ]));
        const body = s4.$('propsBody');
        const rows = (name) => [
            { key: '__name__', label: 'Name', kind: 'text', value: name },
            { key: 'Width', label: 'Width', kind: 'number', value: '120' },
            { key: 'Height', label: 'Height', kind: 'number', value: '36' }
        ];
        const send = (name) => s4.msg({
            type: 'properties', name,
            properties: rows(name), info: null, tabItems: [], listItems: []
        });

        send('btn1');
        t.ok(body.children.length > 0, 'props-scroll', 'the panel rendered the rows');

        body.scrollTop = 40;
        send('btn1');   // a property change re-sends the whole panel for the SAME control
        t.equal(body.scrollTop, 40, 'props-scroll',
            'a rebuild for the same control keeps the scroll position');

        send('btn2');   // a different control
        t.equal(body.scrollTop, 0, 'props-scroll', 'a new selection starts at the top');

        const js = fs.readFileSync(DESIGNER_JS, 'utf8');
        t.ok(/focus\(\{ preventScroll: true \}\)/.test(js), 'props-scroll',
            'the caret restore focuses with preventScroll');
    }

    // --- the right-click menu must stay inside the window ---
    // (user report: right-clicking a control near the bottom opened the menu downwards, so its lower
    // entries were cut off and unreachable). jsdom does no layout, so the menu's size is stubbed here —
    // the flip depends only on that size and the cursor position.
    {
        const s5 = setup();
        s5.msg(s5.frame([
            { name: 'Body', type: 'Canvas', x: 0, y: 0, w: 800, h: 450, locked: true },
            { name: 'btn1', type: 'Button', x: 100, y: 50, w: 120, h: 36 }
        ]));
        const menu = s5.$('contextMenu');
        menu.getBoundingClientRect = () => ({
            width: 140, height: 240, top: 0, left: 0, right: 140, bottom: 240, x: 0, y: 0
        });
        const vh = s5.window.innerHeight;
        const vw = s5.window.innerWidth;
        const openAt = (x, y) => s5.$('canvas').dispatchEvent(
            new s5.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));

        openAt(400, 100);
        t.equal(menu.style.top, '100px', 'ctx-menu', 'a menu that fits opens below the cursor');
        t.equal(menu.style.left, '400px', 'ctx-menu', 'and to the right of it');

        openAt(400, vh - 50);
        t.equal(menu.style.top, `${vh - 50 - 240}px`, 'ctx-menu',
            'near the bottom it flips ABOVE the cursor so every entry stays visible');

        openAt(vw - 50, 100);
        t.equal(menu.style.left, `${vw - 50 - 140}px`, 'ctx-menu',
            'near the right edge it flips to the left of the cursor');

        // Even a cursor in the very last pixel cannot push the menu off-screen.
        openAt(vw - 1, vh - 1);
        t.ok(parseFloat(menu.style.top) >= 4 && parseFloat(menu.style.left) >= 4, 'ctx-menu',
            'and it is clamped to the viewport', `top=${menu.style.top} left=${menu.style.left}`);
    }

    t.note('T3 done');
};
