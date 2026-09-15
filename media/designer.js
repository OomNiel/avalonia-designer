/* global acquireVsCodeApi */
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const $ = (id) => document.getElementById(id);

    // A control name is XAML-derived, so a hand-written `x:Name` can contain a quote or a bracket
    // (XML entity-decoded before it reaches us). Interpolating that straight into an attribute
    // selector throws a SyntaxError inside the handler that builds it. `CSS.escape` is the right
    // tool but is not available everywhere (the jsdom test layer has no CSS object), so fall back to
    // escaping the characters that actually matter.
    const cssEscape = (s) => (typeof CSS !== 'undefined' && CSS.escape)
        ? CSS.escape(String(s))
        : String(s).replace(/["\\\]]/g, '\\$&');

    const els = {
        canvas: $('canvas'),
        img: $('preview'),
        overlay: $('overlayLayer'),
        selection: $('selection'),
        status: $('status'),
        zoom: $('zoomValue'),
        wrap: $('canvasWrap'),
        propsBody: $('propsBody'),
        propsEmpty: $('propsEmpty'),
        controlList: $('controlList'),
        btnUndo: $('btnUndo'),
        btnRedo: $('btnRedo'),
        btnNewForm: $('btnNewForm'),
        btnRefresh: $('btnRefresh'),
        btnCodeFix: $('btnCodeFix'),
        btnBackup: $('btnBackup'),
        // Linux-only (the .deb flow); null elsewhere, hence the guarded listeners below.
        btnPublish: $('btnPublish'),
        btnInstall: $('btnInstall'),
        btnZoomIn: $('btnZoomIn'),
        btnZoomOut: $('btnZoomOut'),
        btnFit: $('btnFit'),
        btnDotGrid: $('btnDotGrid'),
        btnSnapGrid: $('btnSnapGrid'),
        btnGridSettings: $('btnGridSettings'),
        btnAlignLeft: $('btnAlignLeft'),
        btnAlignCentre: $('btnAlignCentre'),
        btnAlignRight: $('btnAlignRight'),
        btnAlignTop: $('btnAlignTop'),
        btnAlignMiddle: $('btnAlignMiddle'),
        btnAlignBottom: $('btnAlignBottom'),
        btnAlignText: $('btnAlignText'),
        btnSameWidth: $('btnSameWidth'),
        btnSameHeight: $('btnSameHeight'),
        btnEqualV: $('btnEqualV'),
        btnEqualH: $('btnEqualH'),
        multiSel: $('multiSel'),
        marquee: $('marquee'),
        radiusGuide: $('radiusGuide'),
        splitGuide: $('splitGuide'),
        dotGrid: $('dotGrid'),
        dotGridModal: $('dotGridModal'),
        dotGridSpacingX: $('dotGridSpacingX'),
        dotGridSpacingY: $('dotGridSpacingY'),
        dotGridColor: $('dotGridColor'),
        dotGridDotSize: $('dotGridDotSize'),
        dotGridSave: $('dotGridSave'),
        dotGridCancel: $('dotGridCancel'),
        btnClearSel: $('btnClearSel'),
        contextMenu: $('contextMenu'),
        toolbar: $('toolbar'),
        ctxDelete: $('ctxDelete'),
        ctxCut: $('ctxCut'),
        ctxCopy: $('ctxCopy'),
        ctxPaste: $('ctxPaste'),
        ctxMoveToContainer: $('ctxMoveToContainer'),
        ctxAddEvent: $('ctxAddEvent'),
        eventModal: $('eventModal'),
        eventTitle: $('eventTitle'),
        eventHint: $('eventHint'),
        eventList: $('eventList'),
        eventRemember: $('eventRemember'),
        eventRememberWrap: $('eventRememberWrap'),
        eventSkip: $('eventSkip'),
        eventWire: $('eventWire'),
        handlerModal: $('handlerModal'),
        handlerTitle: $('handlerTitle'),
        handlerHint: $('handlerHint'),
        handlerList: $('handlerList'),
        handlerAdd: $('handlerAdd'),
        handlerClose: $('handlerClose'),
        btnCodeSettings: $('btnCodeSettings'),
        settingsModal: $('settingsModal'),
        settingsHint: $('settingsHint'),
        settingsModes: $('settingsModes'),
        settingsBadges: $('settingsBadges'),
        settingsSave: $('settingsSave'),
        settingsCancel: $('settingsCancel'),
        aiEnabled: $('aiEnabled'),
        aiBadge: $('aiBadge'),
        aiBody: $('aiBody'),
        aiModel: $('aiModel'),
        aiModelHint: $('aiModelHint'),
        aiRefresh: $('aiRefresh'),
        aiScan: $('aiScan'),
        aiOptions: $('aiOptions'),
        aiOptContext: $('aiOptContext'),
        aiOptGpu: $('aiOptGpu'),
        aiOptTtl: $('aiOptTtl'),
        aiOptAddress: $('aiOptAddress'),
        aiContext: $('aiContext'),
        aiGpu: $('aiGpu'),
        aiTtl: $('aiTtl'),
        aiMaxTokens: $('aiMaxTokens'),
        aiTimeout: $('aiTimeout'),
        aiEndpoint: $('aiEndpoint'),
        aiLoad: $('aiLoad'),
        aiUnload: $('aiUnload'),
        aiStatus: $('aiStatus'),
        aiProgress: $('aiProgress'),
        aiStatusText: $('aiStatusText'),
        helpPanel: $('helpPanel'),
        helpTitle: $('helpTitle'),
        helpBody: $('helpBody'),
        btnToggleHelp: $('btnToggleHelp'),
        propsToggleRow: $('propsToggleRow'),
        chkAdvanced: $('chkAdvanced'),
        itemsModal: $('itemsModal'),
        itemsText: $('itemsText'),
        itemsSave: $('itemsSave'),
        itemsCancel: $('itemsCancel'),
        gridModal: $('gridModal'),
        gridRows: $('gridRows'),
        gridCols: $('gridCols'),
        gridAddRow: $('gridAddRow'),
        gridAddCol: $('gridAddCol'),
        gridSave: $('gridSave'),
        gridCancel: $('gridCancel'),
        menuDummies: $('menuDummies'),
        menuModal: $('menuModal'),
        menuTitle: $('menuTitle'),
        menuBody: $('menuBody'),
        menuAddTop: $('menuAddTop'),
        menuSave: $('menuSave'),
        menuCancel: $('menuCancel'),
        statusModal: $('statusModal'),
        statusTitle: $('statusTitle'),
        statusBody: $('statusBody'),
        statusAdd: $('statusAdd'),
        statusSave: $('statusSave'),
        statusCancel: $('statusCancel'),
        codeModal: $('codeModal'),
        codeHint: $('codeHint'),
        codeBody: $('codeBody'),
        codeRecheck: $('codeRecheck'),
        codeFixAll: $('codeFixAll'),
        codeClose: $('codeClose'),
        splitModal: $('splitModal'),
        splitTitle: $('splitTitle'),
        splitZones: $('splitZones'),
        splitCols: $('splitCols'),
        splitRows: $('splitRows'),
        splitPanesRow: $('splitPanesRow'),
        splitPanesLabel: $('splitPanesLabel'),
        splitCount: $('splitCount'),
        splitMinus: $('splitMinus'),
        splitPlus: $('splitPlus'),
        splitSave: $('splitSave'),
        splitCancel: $('splitCancel'),
        splitterModal: $('splitterModal'),
        splitterTitle: $('splitterTitle'),
        splitterBody: $('splitterBody'),
        splitterSave: $('splitterSave'),
        splitterCancel: $('splitterCancel'),
        dgModal: $('dgModal'),
        dgTitle: $('dgTitle'),
        dgHint: $('dgHint'),
        dgBody: $('dgBody'),
        dgSave: $('dgSave'),
        dgCancel: $('dgCancel'),
        cellHighlight: $('cellHighlight'),
        rulerH: $('rulerH'),
        rulerV: $('rulerV'),
        crosshair: $('crosshair'),
        chH: $('chH'),
        chV: $('chV'),
        btnCrosshair: $('btnCrosshair'),
        crosshairModal: $('crosshairModal'),
        chModeShort: $('chModeShort'),
        chModeLong: $('chModeLong'),
        chShortLength: $('chShortLength'),
        chThickness: $('chThickness'),
        chOpacity: $('chOpacity'),
        chColor: $('chColor'),
        crosshairSave: $('crosshairSave'),
        crosshairCancel: $('crosshairCancel')
    };

    const state = {
        frame: null,
        // name -> control for the CURRENT frame (see indexFrame). Every "the control the pointer is
        // dragging" / ancestor lookup used to scan the whole array, and those run per pointermove.
        byName: new Map(),
        scale: 1,
        fitted: false,
        selected: null, // { name: string|null }
        designW: 800,
        designH: 450,
        lastFitSize: null,
        pendingTag: null,
        showAdvanced: false,
        // Which Properties sections the user folded away, per control TYPE (e.g. { DataGrid: { data: true } }).
        // Remembered across designer reopens via the webview state (see loadCollapsed/persistCollapsed).
        collapsed: {},
        // The toolbar CATEGORIES the user folded away (e.g. { align: true }). Every group starts
        // UNFOLDED; the same webview state as the Properties folds (see loadToolbarFolds).
        toolbarFolds: {},
        helpOpen: true,
        lastProps: null,
        clipboard: false,
        controlListKey: null,
        recell: null, // { gridName, cells: { v: [], h: [] } } when the selected control is a Grid child
        // Divider bars of every SplitPanel (design coords) — a drag on one resizes the panes.
        splitBars: [],
        // Code-behind problems the extension reported, per control name: { name: { severity, title } }.
        // Drawn as a ⚠ badge in the control's overlay (see renderOverlays).
        markers: {},
        dotGrid: { enabled: true, snap: false, spacingX: 16, spacingY: 16, color: '#9db4d0', dotSize: 1.5 },
        // Crosshair look/length: mode 'short'|'long', shortLength px (Short cross total), line
        // thickness px, opacity %, line colour. The outline colour is auto-derived for contrast.
        crosshair: { mode: 'short', shortLength: 50, thickness: 1, opacity: 100, color: '#ff4d4d' },
        // All currently selected control names (multi-select). state.selected stays the ANCHOR
        // (the first-selected control that edge-alignment aligns everything else to).
        multi: new Set(),
        // Whether the project has a package to install: 'none' | 'stale' | 'ready' (from the extension).
        // 'none' until the first report arrives, so the Install button starts disabled.
        packageState: 'none',
        packageName: ''
    };

    // Single-line text controls that 'Align Text' can centre text in (matches propertyCatalog).
    const TEXT_ALIGN_TAGS = new Set(['TextBlock', 'TextBox', 'Button', 'CheckBox', 'RadioButton', 'ComboBox']);

    function post(m) {
        vscode.postMessage(m);
    }

    // ---------------- dot grid overlay + snap-to-grid ----------------
    function clampNum(v, min, max, dflt) {
        const n = parseFloat(v);
        if (Number.isNaN(n)) return dflt;
        return Math.min(max, Math.max(min, n));
    }
    // Applies the dot-grid settings: shows/hides the overlay and sets its CSS pattern
    // (radial-gradient dots — spacing = background size, dot size = gradient stop, colour = dot).
    function applyDotGrid() {
        const g = state.dotGrid || {};
        els.dotGrid.hidden = !g.enabled;
        if (g.enabled) {
            const color = g.color || '#9db4d0';
            const dot = Math.max(0.5, g.dotSize || 1);
            const sx = Math.max(4, g.spacingX || 16);
            const sy = Math.max(4, g.spacingY || 16);
            els.dotGrid.style.backgroundImage =
                `radial-gradient(circle, ${color} ${dot / 2}px, transparent ${dot / 2}px)`;
            els.dotGrid.style.backgroundSize = `${sx}px ${sy}px`;
        }
        els.btnDotGrid.classList.toggle('tb-active', !!g.enabled);
        els.btnSnapGrid.classList.toggle('tb-active', !!g.snap);
    }

    // ---------------- design rulers (top + left: white ticks on black) ----------------
    // Black strips hug the form's top/left edges and scroll+zoom with the canvas; the scale is in
    // DESIGN px. Major grads every 5 × the dot-grid spacing; minors are 10 equal divisions of a
    // major (= grid/2). A numeric label sits on every major. Tick LENGTH stays a fixed screen size;
    // only the SPACING scales with the zoom.
    const RULER_STRIP = 26;      // css px strip thickness (matches designer.css)
    const RULER_TICK_MINOR = 8;  // css px minor tick length
    const RULER_TICK_MAJOR = 15; // css px major tick length
    const RULER_MAJORS = 5;      // major gradation = RULER_MAJORS × grid spacing
    function rulerTickLayer(vertical, tickLen, stepCss, color) {
        const d = document.createElement('div');
        d.className = 'rul-tick';
        if (vertical) {
            d.style.top = '0'; d.style.bottom = '0'; d.style.right = '0'; d.style.width = tickLen + 'px';
            d.style.backgroundImage =
                'repeating-linear-gradient(180deg,' + color + ' 0 1px,transparent 1px ' + stepCss + 'px)';
        } else {
            d.style.left = '0'; d.style.right = '0'; d.style.bottom = '0'; d.style.height = tickLen + 'px';
            d.style.backgroundImage =
                'repeating-linear-gradient(90deg,' + color + ' 0 1px,transparent 1px ' + stepCss + 'px)';
        }
        return d;
    }
    function renderRulerAxis(axisEl, vertical, gridStep) {
        const sc = state.scale;
        const majorDesign = Math.max(1, RULER_MAJORS * Math.max(1, gridStep)); // design px per major
        const minorDesign = majorDesign / 10;                                  // gridStep / 2
        const minorCss = minorDesign * sc;
        const majorCss = majorDesign * sc;
        axisEl.innerHTML = '';
        if (minorCss >= 3) {
            axisEl.appendChild(rulerTickLayer(vertical, RULER_TICK_MINOR, minorCss, 'rgba(255,255,255,0.55)'));
        }
        if (majorCss >= 5) {
            axisEl.appendChild(rulerTickLayer(vertical, RULER_TICK_MAJOR, majorCss, '#ffffff'));
        }
        if (majorCss >= 28) {
            const designLen = vertical ? state.designH : state.designW;
            const count = Math.floor(designLen / majorDesign);
            for (let i = 0; i <= count; i++) {
                const pos = i * majorDesign;
                const css = pos * sc;
                const n = document.createElement('span');
                n.className = 'rul-num';
                n.textContent = String(pos);
                if (vertical) {
                    // Keep the (rotated, bottom-to-top) number on the FAR LEFT of the strip so it
                    // sits at the inner end of the major marker and never over the minor grads
                    // (which start 8 px in from the design edge).
                    n.style.top = css + 'px';
                    n.style.left = '2px';
                    n.style.transform = 'rotate(-90deg)';
                    n.style.transformOrigin = '0 0';
                } else {
                    n.style.top = '3px';
                    n.style.left = css + 'px';
                    n.style.transform = 'translateX(-50%)';
                    if (i === 0) { n.style.transform = ''; n.style.left = '3px'; }
                }
                axisEl.appendChild(n);
            }
        }
    }
    function renderRulers() {
        const g = state.dotGrid || {};
        const sx = Math.max(4, g.spacingX || 16);
        const sy = Math.max(4, g.spacingY || 16);
        renderRulerAxis(els.rulerH, false, sx);
        renderRulerAxis(els.rulerV, true, sy);
    }

    // Snaps a drag's total delta so the resulting outline/position aligns to the grid.
    // Uses the same per-corner maths as xamlModel.move/resize so the snapped outline and the
    // final applied position stay consistent. Returns the adjusted { dx, dy }.
    function snapDrag(drag, dx, dy) {
        const g = state.dotGrid || {};
        if (!(g.enabled && g.snap)) return { dx, dy };
        const spx = Math.max(4, g.spacingX || 16);
        const spy = Math.max(4, g.spacingY || 16);
        const b = drag.start;
        if (drag.mode === 'move') {
            return {
                dx: Math.round((b.x + dx) / spx) * spx - b.x,
                dy: Math.round((b.y + dy) / spy) * spy - b.y
            };
        }
        const c = drag.corner || 'se';
        let nx = dx, ny = dy;
        if (c.includes('e')) nx = Math.round((b.w + dx) / spx) * spx - b.w;
        if (c.includes('s')) ny = Math.round((b.h + dy) / spy) * spy - b.h;
        if (c.includes('w')) nx = Math.round((b.x + dx) / spx) * spx - b.x;
        if (c.includes('n')) ny = Math.round((b.y + dy) / spy) * spy - b.y;
        return { dx: nx, dy: ny };
    }

    // ---------------- frame / layout ----------------
    /**
     * Rebuilds the name -> control index for the frame that just arrived. `frame.controls` is only
     * ever replaced wholesale (never pushed to or spliced), so building the index here keeps it
     * valid for the frame's whole life. First match wins, exactly like the `.find()` scans below.
     */
    function indexFrame() {
        const byName = new Map();
        if (state.frame) {
            for (const c of state.frame.controls || []) {
                if (c.name && !byName.has(c.name)) byName.set(c.name, c);
            }
        }
        state.byName = byName;
    }

    /** The current frame's control with that name, or null. O(1). */
    function ctrlByName(name) {
        return (name && state.byName.get(name)) || null;
    }

    function applyFrame(msg) {
        const sizeChanged = state.designW !== (msg.width || 800) || state.designH !== (msg.height || 450);
        state.frame = msg;
        indexFrame();
        state.splitBars = msg.splitBars || [];
        state.designW = msg.width || 800;
        state.designH = msg.height || 450;
        if (msg.png) els.img.src = 'data:image/png;base64,' + msg.png;
        if (msg.dotGrid) state.dotGrid = msg.dotGrid;
        applyDotGrid();
        // The preview theme drives the placeholder text colour on a Menu bar (the rendered bar is
        // light or dark depending on the preview theme, not the extension's own theme).
        document.body.classList.toggle('pv-dark', msg.previewTheme === 'dark');
        document.body.classList.toggle('pv-light', msg.previewTheme !== 'dark');
        if (msg.crosshair && typeof msg.crosshair === 'object') setCrosshairConfig(msg.crosshair);
        if (state.fitted && sizeChanged) {
            state.fitted = false;
            fit();
        } else if (!state.fitted) {
            fit();
        } else {
            layout();
        }
        renderOverlays();
        renderSelection();
        renderRulers();
        populateControlList();
        els.status.title = msg.error || '';
        els.status.textContent = msg.error
            ? '⚠ ' + friendlyError(msg.error)
            : Math.round(state.designW) + ' × ' + Math.round(state.designH) + ' px';
    }

    function layout() {
        els.canvas.style.width = (state.designW * state.scale) + 'px';
        els.canvas.style.height = (state.designH * state.scale) + 'px';
        els.rulerH.style.width = els.canvas.style.width;
        els.rulerV.style.height = els.canvas.style.height;
        els.zoom.value = Math.round(state.scale * 100) + '%';
    }

    function fit() {
        const r = els.wrap.getBoundingClientRect();
        const pad = 48;
        const s = Math.min((r.width - pad) / state.designW, (r.height - pad) / state.designH);
        state.scale = Math.max(0.05, Math.min(s, 1.5));
        state.fitted = true;
        layout();
    }

    // ---------------- hit testing ----------------
    function toDesign(clientX, clientY) {
        const r = els.canvas.getBoundingClientRect();
        return { x: (clientX - r.left) / state.scale, y: (clientY - r.top) / state.scale };
    }

    function hitTest(x, y) {
        if (!state.frame) return null;
        // The frame's name index, not a Map rebuilt per call: hitTest runs on every pointermove that
        // drags a selection and on every toolbox dragover.
        const byName = state.byName;
        // Hierarchy-aware, mirroring Avalonia's input hit-testing: a control is never beaten by its
        // OWN ancestors (the locked Body surface, the Root dock, a containing panel) — an ancestor
        // only wins when nothing inside it is hit. Siblings/unrelated controls compare by ZIndex
        // (higher on top), ties go to the later one (paint order). Without this, a ZIndex="-1"
        // shape would always lose to the Body canvas (z=0, fills the form) and be un-clickable.
        const isAncestor = (anc, node) => {
            let cur = node && node.parent;
            while (cur) {
                if (cur === anc.name) return true;
                const pc = byName.get(cur);
                cur = pc ? pc.parent : null;
            }
            return false;
        };
        let hit = null;
        for (const c of state.frame.controls) {
            if (!c.name) continue;
            if (x < c.x || x > c.x + c.width || y < c.y || y > c.y + c.height) continue;
            if (!hit) { hit = c; continue; }
            if (isAncestor(c, hit)) continue;          // c is an ancestor of the hit → behind it
            if (isAncestor(hit, c)) { hit = c; continue; } // c is a descendant of the hit → on top
            if ((c.zIndex || 0) >= (hit.zIndex || 0)) hit = c; // siblings: zIndex, tie → later
        }
        return hit;
    }

    // ---------------- overlays ----------------
    /* One overlay div per named control, PATCHED in place rather than rebuilt. The old code cleared
     * the layer and re-created a div per control on every frame — on a 200-control form that is 200
     * nodes thrown away and 200 built again for a one-pixel drag (plus the style recalc that the
     * innerHTML teardown triggers). Nodes are keyed by control name, so a drag now writes the two
     * changed lengths on one existing node. */
    const overlayNodes = new Map();

    function overlayFor(name) {
        let d = overlayNodes.get(name);
        if (!d) {
            d = document.createElement('div');
            d.className = 'ov';
            d.dataset.name = name;
            overlayNodes.set(name, d);
        }
        return d;
    }

    /** Assigns a length only when it actually changed (re-writing the same value still dirties style). */
    function setLen(el, prop, value) {
        if (el.style[prop] !== value) el.style[prop] = value;
    }

    function renderOverlays() {
        if (!state.frame) {
            // No frame (form failed to load): drop every node so nothing is left floating.
            for (const node of overlayNodes.values()) {
                if (node.parentNode) node.parentNode.removeChild(node);
            }
            overlayNodes.clear();
            renderMenuDummies();
            return;
        }
        const scale = state.scale;
        const live = new Set();
        const order = document.createDocumentFragment();
        for (const c of state.frame.controls) {
            if (!c.name) continue;
            live.add(c.name);
            const d = overlayFor(c.name);
            setLen(d, 'left', (c.x * scale) + 'px');
            setLen(d, 'top', (c.y * scale) + 'px');
            setLen(d, 'width', (c.width * scale) + 'px');
            setLen(d, 'height', (c.height * scale) + 'px');
            // A code-behind problem the extension reported for this control (e.g. the handler the
            // form wires was deleted by hand) — a small ⚠ in the corner, hover to read it. The badge
            // is the node's only child, so it is patched in place too.
            const mark = state.markers[c.name];
            let badge = d.firstChild;
            if (mark) {
                if (!badge) {
                    badge = document.createElement('span');
                    d.appendChild(badge);
                }
                const cls = 'ov-badge ' + (mark.severity === 'warning' ? 'warn' : 'err');
                if (badge.className !== cls) badge.className = cls;
                if (badge.textContent !== '⚠') badge.textContent = '⚠';
                const title = mark.title || 'Code-behind problem';
                if (badge.title !== title) badge.title = title;
            } else if (badge) {
                d.removeChild(badge);
            }
            // Re-appending an existing child MOVES it, so this also restores the paint order.
            order.appendChild(d);
        }
        els.overlay.appendChild(order);
        // Controls that are no longer on the form lose their overlay.
        for (const [name, node] of overlayNodes) {
            if (live.has(name)) continue;
            if (node.parentNode) node.parentNode.removeChild(node);
            overlayNodes.delete(name);   // deleting while iterating a Map is safe
        }
        renderMenuDummies();
    }

    // ---------------- selection (single + multi) ----------------
    /** All currently selected control names (the anchor is state.selected.name). */
    function selectionNames() {
        return state.multi && state.multi.size
            ? [...state.multi]
            : (state.selected && state.selected.name ? [state.selected.name] : []);
    }

    // Tells the extension about the current selection. A multi-selection (>1) sends the whole
    // name list so the Properties panel can offer the intersection (common) properties.
    function postSelection() {
        const names = selectionNames();
        const m = { type: 'select', name: state.selected ? state.selected.name : null };
        if (names.length >= 2) m.multi = names;
        post(m);
    }

    // Sets the whole selection: `anchor` is the first-selected control alignment aligns to.
    function setSelection(anchor, names) {
        state.multi = new Set(names && names.length ? names : []);
        state.selected = { name: anchor };
        if (state.selected.name) {
            const hit = ctrlByName(anchor);
            if (hit && hit.parent && state.frame && state.frame.gridCells && state.frame.gridCells[hit.parent]) {
                state.recell = { gridName: hit.parent, cells: state.frame.gridCells[hit.parent] };
            } else {
                state.recell = null;
            }
        } else {
            state.recell = null;
        }
        hideCellHighlight();
        renderSelection();
        postSelection();
    }

    // Selects a control. With `additive` (Ctrl+Click) it toggles the control in the multi-selection
    // (the first control selected becomes the anchor); otherwise it makes a fresh single selection.
    function select(hit, additive) {
        if (additive) {
            if (!hit || !hit.name) { deselect(); return; }
            const wasSelected = state.multi.has(hit.name) || (state.selected && state.selected.name === hit.name);
            if (wasSelected) {
                // remove it from the selection
                state.multi.delete(hit.name);
                if (state.multi.size === 0) { deselect(); return; }
                if (state.selected && state.selected.name === hit.name) {
                    const first = state.multi.values().next().value;
                    state.selected = { name: first };
                }
            } else {
                if (state.multi.size === 0) state.selected = { name: hit.name }; // first -> anchor
                state.multi.add(hit.name);
            }
            // Keep the anchor's re-cell state (a Grid-child anchor still re-cells on drag).
            const anc = state.selected ? state.selected.name : null;
            const ancCtrl = ctrlByName(anc);
            if (ancCtrl && ancCtrl.parent && state.frame && state.frame.gridCells && state.frame.gridCells[ancCtrl.parent]) {
                state.recell = { gridName: ancCtrl.parent, cells: state.frame.gridCells[ancCtrl.parent] };
            } else {
                state.recell = null;
            }
            hideCellHighlight();
            renderSelection();
            postSelection();
            return;
        }
        setSelection(hit ? hit.name : null, hit ? [hit.name] : []);
    }

    function deselect() {
        state.multi = new Set();
        state.selected = null;
        state.recell = null;
        hideCellHighlight();
        renderSelection();
        post({ type: 'deselect' });
    }

    // The frame control for the FORM itself — the unnamed window root that fills the canvas. It
    // isn't clickable directly (the Body surface covers it), so it's offered at the top of the
    // control drop-down ("Form - <Title>") and by clicking empty design space.
    function formRootControl() {
        return state.frame ? state.frame.controls.find((c) => !c.name) : null;
    }

    /** Selects the form (Window root) — shows its Window properties (Title, Width/Height, …). */
    function selectForm() {
        if (!formRootControl()) { deselect(); return; }
        setSelection(null, []);
    }

    // ---------------- drag-to-re-cell (Grid children) ----------------
    function hideCellHighlight() {
        els.cellHighlight.hidden = true;
    }
    /** The Grid cell under design-space (x, y); cells.v/h are window/design coords. */
    function cellUnder(x, y) {
        const cells = state.recell.cells;
        let col = 0, row = 0;
        for (let i = 0; i < cells.v.length - 1; i++) {
            if (x >= cells.v[i] && x < cells.v[i + 1]) { col = i; break; }
        }
        for (let i = 0; i < cells.h.length - 1; i++) {
            if (y >= cells.h[i] && y < cells.h[i + 1]) { row = i; break; }
        }
        return {
            row, col,
            x: cells.v[col], y: cells.h[row],
            w: cells.v[col + 1] - cells.v[col], h: cells.h[row + 1] - cells.h[row]
        };
    }
    function renderCellHighlight(x, y) {
        const cell = cellUnder(x, y);
        const h = els.cellHighlight;
        h.hidden = false;
        h.style.left = (cell.x * state.scale) + 'px';
        h.style.top = (cell.y * state.scale) + 'px';
        h.style.width = (cell.w * state.scale) + 'px';
        h.style.height = (cell.h * state.scale) + 'px';
        return cell;
    }

    /** True if the control is flagged as locked (the structural Body design surface). */
    function isLockedControl(name) {
        const c = ctrlByName(name);
        return !!(c && c.locked);
    }

    /** True if the control is a SplitPanel pane body — selectable + editable in the Properties
     *  panel, but it must always FILL its pane, so it can't be resized or moved with the mouse. */
    function isPaneBodyControl(name) {
        const c = ctrlByName(name);
        return !!(c && c.paneBody);
    }

    // Draws the (lighter) selection outline for the NON-anchor selected controls; the anchor keeps
    // the full box + resize handles. Also refreshes the alignment toolbar buttons' enabled state.
    function renderMultiOutlines() {
        els.multiSel.innerHTML = '';
        if (!state.frame || !state.selected || !state.selected.name) return;
        for (const n of selectionNames()) {
            if (n === state.selected.name) continue;
            const c = ctrlByName(n);
            if (!c) continue;
            const d = document.createElement('div');
            d.className = 'multi-sel' + (c.locked ? ' locked' : '');
            d.style.left = (c.x * state.scale) + 'px';
            d.style.top = (c.y * state.scale) + 'px';
            d.style.width = (c.width * state.scale) + 'px';
            d.style.height = (c.height * state.scale) + 'px';
            els.multiSel.appendChild(d);
        }
    }

    function updateAlignButtons() {
        const names = selectionNames();
        const any = names.length > 0;
        const multi = names.length >= 2;
        for (const b of [els.btnAlignLeft, els.btnAlignCentre, els.btnAlignRight, els.btnAlignTop, els.btnAlignMiddle, els.btnAlignBottom]) {
            b.disabled = !multi;
        }
        // Align Text needs at least one single-line text control in the selection.
        const hasText = any && state.frame && names.some((n) => {
            const c = ctrlByName(n);
            return c && TEXT_ALIGN_TAGS.has(c.type);
        });
        els.btnAlignText.disabled = !hasText;
        // 'Make same Width/Height' needs >=2 selected AND at least one NON-anchor control that can
        // take a size. A Line's size is its Start/End geometry (it has no Width/Height), so Lines
        // are excluded from sizing (and the anchor is never modified).
        const anchorName = state.selected ? state.selected.name : null;
        const hasSizableTarget = multi && state.frame && names.some((n) => {
            if (n === anchorName) return false;
            const c = ctrlByName(n);
            return c && c.type !== 'Line';
        });
        els.btnSameWidth.disabled = !hasSizableTarget;
        els.btnSameHeight.disabled = !hasSizableTarget;
        // Equal spacing needs >= 3 controls that can be freely moved (not locked, not a direct Grid
        // child — those are placed by Grid.Row/Column, so their position isn't coordinate-based).
        const movable = multi && state.frame ? names.filter((n) => {
            const c = ctrlByName(n);
            if (!c || c.locked || c.paneBody || !c.name) return false;
            if (!c.parent) return true;
            const p = ctrlByName(c.parent);
            return !p || p.type !== 'Grid';
        }) : [];
        const eq = movable.length >= 3;
        els.btnEqualV.disabled = !eq;
        els.btnEqualH.disabled = !eq;
    }

    /** A Line or Arc has draggable point handles (sent by the extension in the frame) instead of
     *  the 8-handle resize box. */
    function isShapeControl(c) {
        return c && (c.type === 'Line' || c.type === 'Arc') && Array.isArray(c.handles) && c.handles.length > 0;
    }

    function renderSelection() {
        renderMultiOutlines();
        updateAlignButtons();
        const s = els.selection;
        if (!state.selected || !state.frame) {
            s.hidden = true;
            return;
        }
        const c = ctrlByName(state.selected.name);
        if (!c) {
            s.hidden = true;
            return;
        }
        // The FORM root (name null) fills the whole canvas: selecting it shows its Window
        // properties but no selection outline — there are no handles to drag or resize the form
        // (you resize it via the Width/Height properties).
        if (!c.name) {
            s.hidden = true;
            syncControlList();
            return;
        }
        s.hidden = false;
        s.classList.toggle('locked', !!c.locked);
        s.classList.toggle('pane', isPaneBodyControl(c.name));
        s.classList.toggle('shape', isShapeControl(c));
        s.classList.toggle('shape-line', c.type === 'Line');
        s.classList.toggle('shape-arc', c.type === 'Arc');
        s.style.left = (c.x * state.scale) + 'px';
        s.style.top = (c.y * state.scale) + 'px';
        s.style.width = (c.width * state.scale) + 'px';
        s.style.height = (c.height * state.scale) + 'px';
        if (isShapeControl(c)) {
            // A Line shows its two ENDS; an Arc shows its CENTRE + two ENDS — these are the drag
            // (resize + anchor) points. They're positioned relative to the selection box (the
            // reported bounds); the box is where the shape lives, so its origin maps to (0,0).
            s.innerHTML = c.handles.map((h) =>
                `<div class="shape-handle ${h.kind}" data-shape="1" data-kind="${h.kind}" ` +
                `style="left:${(h.x - c.x) * state.scale}px;top:${(h.y - c.y) * state.scale}px" ` +
                `title="${h.kind === 'centre' ? 'Drag to set the arc radius' : 'Drag to move this end (the other end stays put)'}"></div>`).join('');
            syncControlList();
            return;
        }
        // Structural controls (the Body design surface + the root layout panel) have NO resize
        // handles and can't be dragged — they fill the form automatically, so their size and
        // position are not user-editable. A SplitPanel pane body is the same: it FILLS its pane,
        // so it gets a selection outline but no resize handles (its divider is moved with the
        // pane's Width/Height property, or the Split Layout editor).
        s.innerHTML = c.locked
            ? '<div class="lock-badge" title="Locked (Body / root panel) — fills the form">🔒</div>'
            : isPaneBodyControl(c.name)
                ? ''
                : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
                    .map((cor) => `<div class="handle ${cor}" data-corner="${cor}"></div>`)
                    .join('');
        syncControlList();
    }

    // ---------------- control list dropdown (Properties panel) ----------------
    // The drop-down label for the FORM entry: "Form - <Title>" (or just "Form" when untitled).
    function formLabel() {
        const t = (state.frame && state.frame.formTitle) || '';
        return t ? 'Form - ' + t : 'Form';
    }

    function populateControlList() {
        const names = state.frame ? state.frame.controls.filter((c) => c.name).map((c) => c.name) : [];
        const ft = (state.frame && state.frame.formTitle) || '';
        // Rebuild when the control set OR the form title changes (the title is the form's label).
        const key = names.join('\u0001') + '\u0000' + ft;
        if (key !== state.controlListKey) {
            state.controlListKey = key;
            const sel = els.controlList;
            sel.innerHTML = '';
            // The FORM itself is first (value '' — its Window props resize the whole surface).
            const formOpt = document.createElement('option');
            formOpt.value = '';
            formOpt.textContent = formLabel();
            sel.appendChild(formOpt);
            if (state.frame) {
                for (const c of state.frame.controls) {
                    if (!c.name) continue;
                    const o = document.createElement('option');
                    o.value = c.name;
                    o.textContent = c.name + (c.locked ? '  🔒' : '') + '  (' + c.type + ')';
                    sel.appendChild(o);
                }
            }
        }
        syncControlList();
    }

    function syncControlList() {
        const cur = state.selected && state.selected.name ? state.selected.name : '';
        if (els.controlList.value !== cur) els.controlList.value = cur;
    }

    els.controlList.addEventListener('change', () => {
        const name = els.controlList.value;
        if (!state.frame) return;
        if (name === '') { selectForm(); return; } // the "Form - <Title>" entry
        const c = ctrlByName(name);
        if (c) select(c);
    });

    // ---------------- event picker modal (wire event(s) for a control) ----------------
    // Opened by the extension: after a control is PLACED (mode 'place' — the default event is
    // preselected, Skip places it unwired, the "remember" checkbox stores the choice) or from
    // right-click → Add event (mode 'add' — already-wired events are marked and cannot be re-picked,
    // and each of them offers ↗ to open its handler).
    let eventEdit = null;
    function closeEventPicker() { els.eventModal.hidden = true; eventEdit = null; }
    function eventChecked() {
        return Array.from(els.eventList.querySelectorAll('input.event-pick'))
            .filter((i) => i.checked && i.disabled === false).map((i) => i.value);
    }
    function refreshEventButtons() {
        const n = eventChecked().length;
        els.eventWire.disabled = n === 0;
        els.eventWire.textContent = n === 1 ? 'Wire event' : 'Wire ' + n + ' events';
    }
    function renderEventList() {
        if (!eventEdit) return;
        const list = els.eventList;
        list.innerHTML = '';
        const wiredMap = new Map(eventEdit.wired.map((w) => [w && w.event, w]));
        eventEdit.events.forEach((ev) => {
            const info = wiredMap.get(ev);
            const handler = info ? String(info.handler || '') : '';
            // The form wires it, but the method is gone (deleted by hand) → ⚠ instead of ✓.
            const missing = info ? info.missing === true : false;
            const row = document.createElement('div');
            row.className = 'event-row' + (handler ? ' wired' : '');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'event-pick';
            cb.value = ev;
            cb.disabled = !!handler;
            cb.checked = handler === '' && ev === eventEdit.preselect;
            cb.addEventListener('change', refreshEventButtons);
            row.appendChild(cb);
            const name = document.createElement('span');
            name.className = 'event-name';
            name.textContent = ev;
            row.appendChild(name);
            const h = document.createElement('span');
            h.className = 'event-handler';
            h.textContent = handler || (eventEdit.name + '_' + ev);
            row.appendChild(h);
            if (handler) {
                const badge = document.createElement('span');
                badge.className = 'event-wired' + (missing ? ' missing' : '');
                badge.textContent = missing ? '⚠ missing' : '✓ wired';
                badge.title = missing
                    ? 'The form wires ' + handler + ', but the method is gone — clicking ↗ recreates it'
                    : 'Wired in the form';
                row.appendChild(badge);
                const go = document.createElement('button');
                go.type = 'button';
                go.className = 'event-goto';
                go.textContent = '↗';
                go.title = (missing ? 'Recreate and open ' : 'Open ') + handler;
                go.addEventListener('click', () => post({ type: 'openHandler', name: eventEdit.name, handler, event: ev }));
                row.appendChild(go);
            }
            list.appendChild(row);
        });
        refreshEventButtons();
    }
    function openEventPicker(msg) {
        const place = msg.mode !== 'add';
        eventEdit = {
            name: String(msg.name || ''),
            mode: place ? 'place' : 'add',
            events: Array.isArray(msg.events) ? msg.events.map(String) : [],
            wired: Array.isArray(msg.wired) ? msg.wired : [],
            preselect: place ? String(msg.defaultEvent || '') : ''
        };
        const label = msg.label ? String(msg.label) : String(msg.tag || '');
        els.eventTitle.textContent = (place ? 'Wire an event — ' : 'Add event — ') + label + ' ' + eventEdit.name;
        els.eventHint.textContent = place
            ? 'Tick the event(s) to wire for this control. Each one becomes a handler in the code-behind (' +
            eventEdit.name + '_<Event>). Skip places it without a handler — right-click → Add event… adds one later.'
            : 'Events already wired are marked ✓ — pick any other event to add another handler.';
        els.eventRememberWrap.hidden = place === false;
        els.eventRemember.checked = false;
        renderEventList();
        els.eventModal.hidden = false;
        const first = els.eventList.querySelector('input.event-pick:not([disabled])');
        if (first) first.focus();
    }
    els.eventWire.addEventListener('click', () => {
        if (!eventEdit) return;
        const events = eventChecked();
        if (events.length === 0) return;
        post({ type: 'wireEvents', name: eventEdit.name, events, remember: els.eventRemember.checked });
        closeEventPicker();
    });
    els.eventSkip.addEventListener('click', () => {
        if (!eventEdit) return;
        const msg = { type: 'skipEventPicker', name: eventEdit.name, remember: els.eventRemember.checked };
        const place = eventEdit.mode === 'place';
        post(msg);
        if (place) els.status.textContent = 'Placed without an event handler.';
        closeEventPicker();
    });
    els.eventModal.addEventListener('click', (e) => {
        if (e.target === els.eventModal) { els.eventSkip.click(); } // click outside = skip
    });

    // ---------------- wired-event chooser (middle-click a control) ----------------
    // Middle-click asks the extension which handlers the control has: one → the extension opens it
    // straight away, several → this list (openHandlerMenu) so the user picks which one to jump to.
    let handlerTarget = null;
    function closeHandlerMenu() { els.handlerModal.hidden = true; handlerTarget = null; }
    function openHandlerMenu(msg) {
        handlerTarget = { name: String(msg.name || '') };
        const label = msg.label ? String(msg.label) : String(msg.tag || '');
        const wired = Array.isArray(msg.wired) ? msg.wired : [];
        els.handlerTitle.textContent = 'Wired events — ' + label + ' ' + handlerTarget.name;
        els.handlerHint.textContent = 'This control has ' + wired.length +
            ' event handlers. Pick the one to open in the code-behind.';
        els.handlerList.innerHTML = '';
        wired.forEach((w) => {
            if (!w || !w.handler) return;
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'event-row handler-row';
            row.title = 'Open ' + w.handler + ' in the editor';
            const name = document.createElement('span');
            name.className = 'event-name';
            name.textContent = String(w.event);
            row.appendChild(name);
            const h = document.createElement('span');
            h.className = 'event-handler';
            h.textContent = String(w.handler);
            row.appendChild(h);
            const go = document.createElement('span');
            go.className = 'event-wired' + (w.missing ? ' missing' : '');
            go.textContent = w.missing ? '⚠ recreate' : '↗';
            row.appendChild(go);
            row.addEventListener('click', () => {
                post({ type: 'openHandler', name: handlerTarget.name, handler: String(w.handler), event: String(w.event) });
                closeHandlerMenu();
            });
            els.handlerList.appendChild(row);
        });
        els.handlerModal.hidden = false;
        const first = els.handlerList.querySelector('.handler-row');
        if (first) first.focus();
    }
    els.handlerClose.addEventListener('click', closeHandlerMenu);
    els.handlerAdd.addEventListener('click', () => {
        const name = handlerTarget ? handlerTarget.name : null;
        closeHandlerMenu();
        if (name) post({ type: 'addEvent', name });
    });
    els.handlerModal.addEventListener('click', (e) => {
        if (e.target === els.handlerModal) closeHandlerMenu(); // click outside closes
    });

    // ---------------- code-check settings (toolbar ⚙ Settings) ----------------
    // Which trigger re-checks the code-behind (returning to the designer / on save / while typing /
    // only manually) and whether problem controls get a ⚠ badge. Stored in the user's settings.
    const CHECK_MODES = [
        ['onReturn', 'When I come back to the designer', 'Re-checks every time the designer tab is focused again — catches edits made in the code-behind meanwhile.'],
        ['onSave', 'When the code-behind is saved', 'Re-checks when the .vb/.cs file is saved (Ctrl+S).'],
        ['onType', 'While I type (after a pause)', 'Re-checks shortly after you stop typing in the code-behind.'],
        ['manual', 'Only when I press Code Fix…', 'No automatic check at all — the original behaviour.']
    ];
    let settingsOpen = false;
    // Set when the user presses ⚙ Settings. Without it, the extension's reply to a *save* (which carries
    // the same `codeSettings` message) reopened the panel a moment after the user closed it — the flicker
    // they reported on 2026-09-15. Opening is a user action; filling is not.
    let settingsPending = false;
    function closeSettings() { els.settingsModal.hidden = true; settingsOpen = false; settingsPending = false; }
    function fillSettings(msg) {
        const mode = String(msg && msg.mode ? msg.mode : 'onReturn');
        els.settingsModes.innerHTML = '';
        CHECK_MODES.forEach(([value, label, hint]) => {
            const row = document.createElement('label');
            row.className = 'settings-mode';
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'codeCheckMode';
            radio.value = value;
            radio.checked = value === mode;
            row.appendChild(radio);
            const text = document.createElement('span');
            text.className = 'settings-mode-text';
            const strong = document.createElement('b');
            strong.textContent = label;
            const small = document.createElement('span');
            small.className = 'settings-mode-hint';
            small.textContent = hint;
            text.appendChild(strong);
            text.appendChild(small);
            row.appendChild(text);
            els.settingsModes.appendChild(row);
        });
        els.settingsBadges.checked = !msg || msg.badges !== false;
        if (settingsPending) {
            settingsPending = false;
            els.settingsModal.hidden = false;
            settingsOpen = true;
            const first = els.settingsModes.querySelector('input');
            if (first) first.focus();
        }
    }
    els.btnCodeSettings.addEventListener('click', () => {
        settingsPending = true;
        post({ type: 'openCodeSettings' });
    });
    els.settingsSave.addEventListener('click', () => {
        const picked = els.settingsModes.querySelector('input:checked');
        post({
            type: 'saveCodeSettings',
            mode: picked ? picked.value : 'onReturn',
            badges: els.settingsBadges.checked,
            ai: aiPayload()
        });
        closeSettings();
        els.status.textContent = els.aiEnabled.checked
            ? 'Code-check and AI settings saved.'
            : 'Code-check settings saved. AI assist is off.';
    });
    els.settingsCancel.addEventListener('click', closeSettings);
    els.settingsModal.addEventListener('click', (e) => {
        if (e.target === els.settingsModal) closeSettings(); // click outside cancels
    });

    // ---------------- AI assist (the panel's second section) ----------------
    // The extension owns every decision here — the panel only shows state and posts intents. Load, unload
    // and the status check all happen extension-side through the same code the Command Palette uses.
    let aiState = null;

    function aiPayload() {
        const picked = els.aiModel.value;
        return {
            enabled: els.aiEnabled.checked,
            value: picked,
            contextLength: Number(els.aiContext.value) || 0,
            gpu: els.aiGpu.value === 'auto' ? 'auto' : els.aiGpu.value,
            ttlSeconds: els.aiTtl.value === 'auto' ? -1 : Number(els.aiTtl.value),
            maxTokens: Number(els.aiMaxTokens.value) || 4096,
            timeoutSeconds: Number(els.aiTimeout.value) || 60,
            endpoint: els.aiEndpoint.value.trim()
        };
    }

    function fillAi(state) {
        if (!state) return;
        aiState = state;
        els.aiEnabled.checked = !!state.enabled;
        els.aiBadge.textContent = state.enabled ? 'on' : 'off';
        els.aiBadge.className = 'ai-badge ' + (state.enabled ? 'on' : 'off');
        els.aiBody.hidden = !state.enabled;

        els.aiModel.innerHTML = '';
        const none = document.createElement('option');
        none.value = '';
        none.textContent = state.choices.length ? '— choose a model —' : '— nothing available —';
        els.aiModel.appendChild(none);
        (state.choices || []).forEach((c) => {
            const option = document.createElement('option');
            option.value = c.value;
            option.textContent = c.label;
            els.aiModel.appendChild(option);
        });
        // A selection the settings already point at wins; otherwise the first real choice, so "Load Model"
        // is never a no-op waiting for a click the user does not know to make.
        els.aiModel.value = state.selected || ((state.choices || [])[0] ? state.choices[0].value : '');
        // A `<select>` given a value with no matching option silently keeps whatever was selected before —
        // the display and the truth part ways, which reads exactly like an off-by-one in the list. The
        // placeholder option has an empty value, so this cannot be caught by comparing indices: check the
        // round trip instead and say so out loud if the browser refused the assignment.
        if (state.selected && els.aiModel.value !== state.selected) {
            const fallback = (state.choices || []).findIndex((c) => c.value === state.selected);
            if (fallback >= 0) els.aiModel.selectedIndex = fallback + 1; // +1: the placeholder is index 0
            if (els.aiModel.value !== state.selected) {
                setAiProgress(`the picker cannot show "${state.selected}" — the list the extension sent has no ` +
                    'such entry; press Refresh list, or report this with View → Output → "Avalonia Designer"');
            }
        }

        const chosen = (state.choices || []).find((c) => c.value === els.aiModel.value);
        // "Did my load take?" answered in words, not left to be inferred from the dropdown: for the
        // built-in runtime the pin lives in `modelPath`, so nothing else in the panel showed it.
        els.aiModelHint.textContent = [state.hint, chosen ? chosen.detail : '', state.pinned]
            .filter(Boolean).join('  ·  ');
        els.aiOptions.hidden = !chosen;
        els.aiContext.value = String(state.options.contextLength);
        els.aiGpu.value = ['off', 'max', '0.5'].includes(state.options.gpu) ? state.options.gpu : 'auto';
        els.aiTtl.value = state.options.ttlSeconds === 0 ? '0'
            : state.options.ttlSeconds === 3600 ? '3600'
                : state.options.ttlSeconds === state.options.recommended.ttlSeconds ? 'auto' : '900';
        els.aiMaxTokens.value = String(state.options.maxTokens);
        els.aiTimeout.value = String(state.options.timeoutSeconds);
        if (!els.aiEndpoint.value) els.aiEndpoint.value = state.endpoint;
        // The recommendation is named, so "auto" is a visible promise rather than a guess.
        els.aiContext.placeholder = String(state.options.recommended.contextLength);
        if (els.aiGpu.options[0]) {
            // Short on purpose: the full sentence does not fit the field, and a clipped recommendation reads
            // as a broken control (seen in the Chromium render, 2026-09-15).
            els.aiGpu.options[0].textContent = `recommended (${state.options.recommended.gpu})`;
        }
        applyKindToOptions(chosen);
    }

    /**
     * Shows only the rows the selected model's runtime will actually honour, and words the hints for it.
     *
     * The two runtimes take different arguments: LM Studio is told a context length, a GPU *ratio* and an
     * idle-unload timer, while the built-in runtime takes a context length and a GPU *layer count* and
     * lives only as long as the extension does. A field that is quietly ignored is how a user ends up
     * trusting a number that does nothing.
     */
    function applyKindToOptions(chosen) {
        const kind = chosen ? chosen.kind : '';
        const bundled = kind === 'bundled' || kind === 'file';
        els.aiOptTtl.hidden = bundled;
        els.aiOptAddress.hidden = kind !== 'custom';
        // Written through a guard: a hint span that is missing must not abort the state application, which
        // is how a markup change would silently stop the whole ⚙ panel from filling in.
        const say = (row, text) => {
            const el = row && row.querySelector('.ai-hint');
            if (el) el.textContent = text;
        };
        say(els.aiOptGpu, bundled
            ? 'max = all layers on the GPU; anything else runs on the CPU (the built-in runtime takes a layer count, not a ratio).'
            : 'A shared-memory GPU is usually slower than the CPU for big models.');
        say(els.aiOptContext, bundled
            ? 'tokens the model can hold — handed to the built-in runtime when it starts.'
            : 'tokens the model can hold. Bigger costs memory.');
    }

    els.aiEnabled.addEventListener('change', () => {
        els.aiBody.hidden = !els.aiEnabled.checked;
        els.aiBadge.textContent = els.aiEnabled.checked ? 'on' : 'off';
        els.aiBadge.className = 'ai-badge ' + (els.aiEnabled.checked ? 'on' : 'off');
        if (els.aiEnabled.checked && aiState && !els.aiModel.value) post({ type: 'aiState' });
    });
    // Choosing a model reveals the settings, per the flow the user asked for: the options are the second
    // decision, not something to hunt for first.
    els.aiModel.addEventListener('change', () => {
        const chosen = aiState && (aiState.choices || []).find((c) => c.value === els.aiModel.value);
        els.aiOptions.hidden = !chosen;
        els.aiModelHint.textContent = [aiState ? aiState.hint : '', chosen ? chosen.detail : '', aiState ? aiState.pinned : '']
            .filter(Boolean).join('  ·  ');
        applyKindToOptions(chosen);
        if (chosen && chosen.kind === 'custom') els.aiEndpoint.focus();
    });
    els.aiRefresh.addEventListener('click', () => post({ type: 'aiState', rescan: true }));
    // State the panel cannot see change on its own: a local server loads its model just-in-time when a
    // request arrives, so an open panel would keep showing "not in memory yet" while the model answers
    // (reported 2026-09-15). Coming back to the window is the moment to re-ask.
    window.addEventListener('focus', () => {
        if (els.settingsModal && !els.settingsModal.hidden) post({ type: 'aiState' });
    });
    els.aiScan.addEventListener('click', () => {
        setAiProgress('scanning this machine for model files…');
        post({ type: 'aiScan' });
    });
    els.aiLoad.addEventListener('click', () => {
        if (!els.aiModel.value) { setAiProgress('choose a model first'); return; }
        const chosen = aiState && (aiState.choices || []).find((c) => c.value === els.aiModel.value);
        const kind = chosen ? chosen.kind : '';
        setAiBusy(true);
        // The extension says what is actually happening (weights on disk vs downloading, and how many
        // bytes) — this is only what shows for the moment before its first line arrives.
        setAiProgress(kind === 'bundled'
            ? 'starting the built-in runtime…'
            : kind === 'file'
                ? 'importing the file and loading it — this can take a few minutes…'
                : 'loading — this can take a few minutes for a big model');
        // If the extension says nothing at all, say that too: a line that never changes cannot be told
        // apart from a dead one, which is what "downloading is not starting" was.
        armAiWatchdog();
        post({ type: 'aiLoad', value: els.aiModel.value, state: aiPayload() });
    });
    els.aiUnload.addEventListener('click', () => {
        // Unload is a state change like Load — same busy state, same watchdog, same refresh below.
        setAiBusy(true);
        setAiProgress('unloading…');
        armAiWatchdog();
        post({ type: 'aiUnload' });
    });
    // The status check is the same report the "AI: Status and Hardware Check" command shows — the extension
    // builds it, so the panel and the command cannot disagree.
    els.aiStatus.addEventListener('click', () => {
        setAiProgress('checking…');
        post({ type: 'aiStatus' });
    });

    function setAiProgress(message) {
        els.aiProgress.hidden = !message;
        els.aiProgress.textContent = message || '';
    }
    let aiWatchdog = 0;
    function setAiBusy(busy) {
        // Cleared on both edges: a note that the extension "has not reported back yet" must never appear
        // after the action has already finished.
        clearTimeout(aiWatchdog);
        for (const b of [els.aiLoad, els.aiUnload, els.aiScan, els.aiRefresh]) b.disabled = !!busy;
    }
    /** Arms the "no answer yet" note both long actions share (see the Load handler). */
    function armAiWatchdog() {
        clearTimeout(aiWatchdog);
        aiWatchdog = setTimeout(() => {
            if (els.aiProgress.textContent && !els.aiProgress.hidden) {
                els.aiProgress.textContent += '  —  the extension has not reported back yet (View → Output → "Avalonia Designer")';
            }
        }, 10000);
    }

    // Right-click on the control list dropdown → context menu to delete the
    // selected control (and clean up its code-behind references).
    els.controlList.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const name = els.controlList.value;
        if (!name || !state.frame) return;
        const c = ctrlByName(name);
        if (!c) return;
        // Highlight the control on the canvas for visual feedback.
        select(c);
        // Reuse the existing canvas context menu (Cut/Copy/Paste/Move/Delete).
        showContextMenu(e.clientX, e.clientY, c, { x: 0, y: 0 });
    });

    // ---------------- move / resize / marquee select ----------------
    let drag = null;
    let suppressClick = false;
    function onPointerDown(e) {
        if (e.button !== 0) return;
        // A NEW pointer interaction invalidates any pending click suppression. The flag is set on
        // every completed drag and consumed by the click the browser fires straight afterwards — but
        // when the pointer is released OFF the canvas that click lands on the common ancestor instead,
        // so the canvas click handler never ran, the flag stayed set and the user's next click was
        // silently eaten. Clearing it here is timer-free and always correct: a click is preceded by a
        // pointerdown.
        suppressClick = false;
        const t = e.target;
        // Shape drag-point handles (a Line's two ends / an Arc's centre + two ends): dragging the
        // point itself edits the shape — a Line end moves with the other end anchored; an Arc end
        // rotates around the centre with the other end anchored; the Arc CENTRE sets the radius.
        if (t.classList && t.classList.contains('shape-handle')) {
            e.preventDefault();
            e.stopPropagation();
            const p0 = toDesign(e.clientX, e.clientY);
            const selName = state.selected ? state.selected.name : null;
            const ctrl = ctrlByName(selName);
            drag = {
                mode: 'shape', shapeType: ctrl ? ctrl.type : null,
                kind: t.dataset.kind || 'end', name: selName,
                sx: e.clientX, sy: e.clientY, x0: p0.x, y0: p0.y
            };
            els.canvas.setPointerCapture(e.pointerId);
            return;
        }
        // Marquee (box) select: press-drag on the EMPTY design surface (the locked Body canvas
        // fills the whole form, so "empty" = hitting the locked Body or nothing at all) selects
        // every control inside the drawn box. Not while a toolbox tool is armed (that click
        // places a control) and not on a resize / shape handle.
        const p0 = toDesign(e.clientX, e.clientY);
        const hit0 = hitTest(p0.x, p0.y);
        const grabbingHandle = !!(t.classList && (t.classList.contains('handle') || t.classList.contains('shape-handle')));
        // Design-time SplitPanel divider drag: pressing on a divider bar starts a splitter drag (a
        // guide line follows the mouse; the new pane size is applied once on release).
        if (!state.pendingTag && !grabbingHandle) {
            const overBar = barAt(p0.x, p0.y);
            if (overBar) {
                e.preventDefault();
                e.stopPropagation();
                drag = { mode: 'split', pane: overBar.pane, other: overBar.other, axis: overBar.axis, bar: overBar, sx: e.clientX, sy: e.clientY };
                els.canvas.setPointerCapture(e.pointerId);
                return;
            }
        }
        if (!state.pendingTag && !grabbingHandle && (!hit0 || hit0.locked)) {
            drag = { mode: 'marquee', sx: e.clientX, sy: e.clientY, x0: p0.x, y0: p0.y };
            els.canvas.setPointerCapture(e.pointerId);
            return;
        }
        const sel = state.selected;
        if (!sel || !state.frame) return;
        const c = ctrlByName(sel.name);
        if (!c) return;
        // The Body design surface and a SplitPanel pane body can't be moved or resized — a pane
        // body always fills its pane (clicking it still selects it so its properties are editable).
        if (c.locked || c.paneBody) return;
        const start = { x: c.x, y: c.y, w: c.width, h: c.height };
        if (t.classList && t.classList.contains('handle')) {
            e.preventDefault();
            e.stopPropagation();
            drag = { mode: 'resize', name: sel.name, corner: t.dataset.corner, sx: e.clientX, sy: e.clientY, start };
            els.canvas.setPointerCapture(e.pointerId);
            return;
        }
        // Grab the selected control by its BODY to move it. The selection box is pointer-events:
        // none (so clicks pass through to hit-testing even when it covers the whole canvas), so
        // detect the grab by hit-testing the pointer position.
        const p = toDesign(e.clientX, e.clientY);
        const hit = hitTest(p.x, p.y);
        if (hit && hit.name === sel.name) {
            e.preventDefault();
            e.stopPropagation();
            drag = { mode: 'move', name: sel.name, sx: e.clientX, sy: e.clientY, start };
            // A direct child of a Grid is dragged to RE-CELL it (drag.recell marks the drag).
            drag.recell = !!state.recell;
            els.canvas.setPointerCapture(e.pointerId);
        }
    }

    function updateMarquee(x0, y0, x1, y1) {
        const s = els.marquee;
        s.style.left = (Math.min(x0, x1) * state.scale) + 'px';
        s.style.top = (Math.min(y0, y1) * state.scale) + 'px';
        s.style.width = (Math.abs(x1 - x0) * state.scale) + 'px';
        s.style.height = (Math.abs(y1 - y0) * state.scale) + 'px';
        s.hidden = false;
    }
    function hideMarquee() {
        els.marquee.hidden = true;
    }

    // ---------------- SplitPanel divider (design-time splitter) drag ----------------
    /** The divider bar under a design point (design coords), if any (with a small grab tolerance). */
    function barAt(x, y) {
        const bars = state.splitBars || [];
        const GRAB = 5;
        for (const b of bars) {
            if (b.axis === 'v') {
                const cx = b.x + b.w / 2;
                if (Math.abs(x - cx) <= (b.w / 2 + GRAB) && y >= b.y && y <= b.y + b.h) return b;
            } else {
                const cy = b.y + b.h / 2;
                if (Math.abs(y - cy) <= (b.h / 2 + GRAB) && x >= b.x && x <= b.x + b.w) return b;
            }
        }
        return null;
    }

    /** Draws a guide line for the dragged divider at `pos` (a design-coord offset along the axis). */
    function updateSplitGuide(b, pos) {
        const g = els.splitGuide;
        if (!g) return;
        g.hidden = false;
        const t = Math.max(2, 2 * state.scale);
        if (b.axis === 'v') {
            g.style.left = ((pos - 1) * state.scale) + 'px';
            g.style.top = (b.y * state.scale) + 'px';
            g.style.width = t + 'px';
            g.style.height = (b.h * state.scale) + 'px';
        } else {
            g.style.left = (b.x * state.scale) + 'px';
            g.style.top = ((pos - 1) * state.scale) + 'px';
            g.style.width = (b.w * state.scale) + 'px';
            g.style.height = t + 'px';
        }
    }
    function hideSplitGuide() {
        if (els.splitGuide) els.splitGuide.hidden = true;
    }

    // After a marquee drag: select every control whose bounds intersect the drawn box. The anchor
    // (the control alignment aligns to) is the one whose top-left corner is nearest the box's
    // top-left — i.e. the "first selected". Locked structural controls are excluded.
    function marqueeSelect(x0, y0, x1, y1) {
        const left = Math.min(x0, x1), right = Math.max(x0, x1);
        const top = Math.min(y0, y1), bottom = Math.max(y0, y1);
        const picked = state.frame.controls.filter((c) =>
            c.name && !c.locked &&
            c.x < right && c.x + c.width > left &&
            c.y < bottom && c.y + c.height > top);
        if (!picked.length) { deselect(); return; }
        const names = picked.map((c) => c.name);
        names.sort((a, b) => {
            const A = picked.find((c) => c.name === a);
            const B = picked.find((c) => c.name === b);
            return (Math.abs(A.y - top) + Math.abs(A.x - left)) - (Math.abs(B.y - top) + Math.abs(B.x - left));
        });
        setSelection(names[0], names);
    }

    // While dragging, only move a local OUTLINE (the selection box) — no messages are posted and
    // no preview re-render happens, so the outline follows the mouse smoothly. The actual model
    // change is applied once on pointer-up. The outline math must match xamlModel.move/resize.
    function dragOutline(drag, dx, dy) {
        const b = drag.start;
        if (drag.mode === 'move') return { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h };
        const c = drag.corner || 'se';
        const MIN = 5;
        let x = b.x, y = b.y, w = b.w, h = b.h;
        if (c.includes('e')) w = b.w + dx;
        if (c.includes('s')) h = b.h + dy;
        if (c.includes('w')) { w = b.w - dx; x = b.x + dx; }
        if (c.includes('n')) { h = b.h - dy; y = b.y + dy; }
        return { x, y, w: Math.max(MIN, w), h: Math.max(MIN, h) };
    }

    function onPointerMove(e) {
        if (!drag) return;
        if (Math.abs(e.clientX - drag.sx) < 2 && Math.abs(e.clientY - drag.sy) < 2) return;
        drag.moved = true;
        if (drag.mode === 'marquee') {
            const p = toDesign(e.clientX, e.clientY);
            updateMarquee(drag.x0, drag.y0, p.x, p.y);
            return;
        }
        if (drag.mode === 'shape') {
            const p = toDesign(e.clientX, e.clientY);
            // Move the grabbed handle dot to the pointer (relative to the selection box origin).
            const c = ctrlByName(drag.name);
            if (c) {
                const h = els.selection.querySelector('.shape-handle.' + drag.kind);
                if (h) {
                    h.style.left = ((p.x - c.x) * state.scale) + 'px';
                    h.style.top = ((p.y - c.y) * state.scale) + 'px';
                }
            }
            // The Arc's CENTRE handle sets the radius — show a faint guide line to the pointer.
            if (drag.shapeType === 'Arc' && drag.kind === 'centre') updateRadiusGuide(drag, p);
            else hideRadiusGuide();
            return;
        }
        if (drag.mode === 'split') {
            const p = toDesign(e.clientX, e.clientY);
            updateSplitGuide(drag.bar, drag.axis === 'v' ? p.x : p.y);
            return;
        }
        els.selection.classList.add('dragging');
        if (drag.recell && state.recell) {
            // Show which cell the dragged control will land in.
            const p = toDesign(e.clientX, e.clientY);
            renderCellHighlight(p.x, p.y);
        }
        const rawDx = (e.clientX - drag.sx) / state.scale;
        const rawDy = (e.clientY - drag.sy) / state.scale;
        // Snap-to-grid: adjust the delta so the live outline (and the final position) lands on
        // the grid — the outline and the applied move/resize use the SAME snapped delta.
        const snapped = drag.recell ? { dx: rawDx, dy: rawDy } : snapDrag(drag, rawDx, rawDy);
        const r = dragOutline(drag, snapped.dx, snapped.dy);
        const s = els.selection;
        s.hidden = false;
        s.style.left = (r.x * state.scale) + 'px';
        s.style.top = (r.y * state.scale) + 'px';
        s.style.width = (r.w * state.scale) + 'px';
        s.style.height = (r.h * state.scale) + 'px';
    }

    /** A thin guide line from an Arc's centre to the pointer while its radius is being set. */
    function updateRadiusGuide(drag, p) {
        const g = els.radiusGuide;
        const c = ctrlByName(drag.name);
        if (!c) return;
        const cx = c.x + c.width / 2;
        const cy = c.y + c.height / 2;
        const dx = (p.x - cx) * state.scale;
        const dy = (p.y - cy) * state.scale;
        const len = Math.max(1, Math.hypot(dx, dy));
        g.hidden = false;
        g.style.left = (cx * state.scale) + 'px';
        g.style.top = (cy * state.scale) + 'px';
        g.style.width = len + 'px';
        g.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    }
    function hideRadiusGuide() {
        els.radiusGuide.hidden = true;
    }

    function onPointerUp(e) {
        if (!drag) return;
        if (drag.moved) {
            suppressClick = true;
            if (drag.mode === 'marquee') {
                const p = toDesign(e.clientX, e.clientY);
                hideMarquee();
                marqueeSelect(drag.x0, drag.y0, p.x, p.y);
            } else if (drag.mode === 'split') {
                // Apply the dragged divider in ONE message (the pointer's position along the bar's
                // axis, in design coords); the extension converts it to a pane size + clamps.
                const p = toDesign(e.clientX, e.clientY);
                hideSplitGuide();
                post({
                    type: 'setSplitter', pane: drag.pane, other: drag.other, axis: drag.axis,
                    pos: Math.round(drag.axis === 'v' ? p.x : p.y)
                });
            } else if (drag.mode === 'shape') {
                const p = toDesign(e.clientX, e.clientY);
                hideRadiusGuide();
                if (drag.shapeType === 'Line') {
                    // A Line end moved by the total delta; the other end stays anchored.
                    post({ type: 'setLineEnd', name: drag.name, end: drag.kind, dx: p.x - drag.x0, dy: p.y - drag.y0 });
                } else if (drag.shapeType === 'Arc' && drag.kind === 'centre') {
                    // The Arc's centre sets the radius (distance from centre to the pointer).
                    post({ type: 'setArcRadius', name: drag.name, x: p.x, y: p.y });
                } else if (drag.shapeType === 'Arc') {
                    // An Arc end moved to the pointer — its angle around the centre changes.
                    post({ type: 'setArcEnd', name: drag.name, end: drag.kind, x: p.x, y: p.y });
                }
            } else {
                els.selection.classList.remove('dragging');
                if (drag.recell && state.recell) {
                    // Drop on a Grid cell: re-cell the control to the cell under the pointer.
                    const p = toDesign(e.clientX, e.clientY);
                    const cell = cellUnder(p.x, p.y);
                    hideCellHighlight();
                    post({ type: 'moveToCell', name: drag.name, row: cell.row, col: cell.col });
                } else {
                    // Apply the whole drag in ONE message (total delta from the drag start), so the
                    // extension updates the model and re-renders exactly once on drop. The delta is
                    // the same SNAPPED delta used for the outline, so a snapped move/resize lands on
                    // the grid.
                    const rawDx = (e.clientX - drag.sx) / state.scale;
                    const rawDy = (e.clientY - drag.sy) / state.scale;
                    const snapped = snapDrag(drag, rawDx, rawDy);
                    if (drag.mode === 'move') {
                        post({ type: 'move', name: drag.name, dx: snapped.dx, dy: snapped.dy });
                    } else {
                        post({ type: 'resize', name: drag.name, dx: snapped.dx, dy: snapped.dy, corner: drag.corner });
                    }
                }
            }
        }
        drag = null;
        try { els.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }

    els.canvas.addEventListener('pointerdown', onPointerDown);
    els.canvas.addEventListener('pointermove', onPointerMove);
    els.canvas.addEventListener('pointerup', onPointerUp);

    // ---------------- crosshair overlay (settings-driven) ----------------
    // The native cursor is hidden while the pointer is over the design surface (CSS); a custom
    // crosshair is drawn instead. Anchor rules: idle hover -> the pointer; a MOVE drag -> the
    // dragged control's TOP-LEFT corner; a RESIZE drag -> the active drag handle (edge handles
    // centre on the edge midpoint). Line thickness, colour, opacity and length (Short = the
    // short-length px cross, Long = full form) come from state.crosshair, which the extension
    // keeps in sync with its global config and sends on every frame.
    let crosshairAnchor = null; // last drawn crossing in css px within the canvas (null = hidden)
    function contrastFor(colour) {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(colour || '').trim());
        if (!m) return '#000000';
        const v = parseInt(m[1], 16);
        const lum = 0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255);
        return lum > 128 ? '#000000' : '#ffffff'; // light line -> dark outline, dark -> light
    }
    function setCrosshairConfig(cfg) {
        const c = state.crosshair;
        if (cfg.mode === 'short' || cfg.mode === 'long') c.mode = cfg.mode;
        if (typeof cfg.shortLength === 'number') c.shortLength = cfg.shortLength;
        if (typeof cfg.thickness === 'number') c.thickness = cfg.thickness;
        if (typeof cfg.opacity === 'number') c.opacity = cfg.opacity;
        if (typeof cfg.color === 'string') c.color = cfg.color;
        applyCrosshair();
    }
    function applyCrosshair() {
        const c = state.crosshair || {};
        els.crosshair.style.opacity = String(clampNum(c.opacity, 0, 100, 100) / 100);
        const colour = /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#ff4d4d';
        const outline = contrastFor(colour);
        [els.chH, els.chV].forEach((arm) => {
            arm.style.background = colour;
            // Crisp 1 px outline on EACH side of the line (never wider) — no soft shadow.
            arm.style.boxShadow = '0 0 0 1px ' + outline;
        });
        // Re-draw an already-visible crosshair so style/length changes show immediately.
        if (crosshairAnchor && !els.crosshair.hidden) drawCrosshair(crosshairAnchor.x, crosshairAnchor.y);
    }
    function drawCrosshair(x, y) {
        const c = state.crosshair || {};
        const T = Math.max(1, Math.min(12, Math.round(clampNum(c.thickness, 1, 12, 1))));
        const long = c.mode === 'long';
        const half = Math.floor(T / 2);
        const x0 = Math.round(x) - half; // left edge of the (T wide) vertical arm
        const y0 = Math.round(y) - half; // top edge of the (T tall) horizontal arm
        if (long) {
            const r = els.canvas.getBoundingClientRect();
            els.chH.style.left = '0px';
            els.chH.style.width = r.width + 'px';
            els.chH.style.top = y0 + 'px';
            els.chH.style.height = T + 'px';
            els.chV.style.top = '0px';
            els.chV.style.height = r.height + 'px';
            els.chV.style.left = x0 + 'px';
            els.chV.style.width = T + 'px';
        } else {
            const sl = Math.max(6, Math.round(clampNum(c.shortLength, 6, 4000, 50)));
            const hl = Math.round(sl / 2);
            els.chH.style.left = (Math.round(x) - hl) + 'px';
            els.chH.style.width = (hl * 2) + 'px';
            els.chH.style.top = y0 + 'px';
            els.chH.style.height = T + 'px';
            els.chV.style.top = (Math.round(y) - hl) + 'px';
            els.chV.style.height = (hl * 2) + 'px';
            els.chV.style.left = x0 + 'px';
            els.chV.style.width = T + 'px';
        }
        crosshairAnchor = { x, y };
        els.crosshair.hidden = false;
    }
    function hideCrosshair() {
        crosshairAnchor = null;
        els.crosshair.hidden = true;
    }
    /** Crosshair crossing: MOVE drag -> the dragged control's top-left corner; RESIZE drag -> the
     *  active handle point (edge handles centre on the edge midpoint); otherwise null (pointer). */
    function crosshairPoint(e, r) {
        if (drag && drag.mode === 'move') {
            return { x: parseFloat(els.selection.style.left) || 0, y: parseFloat(els.selection.style.top) || 0 };
        }
        if (drag && drag.mode === 'resize') {
            const L = parseFloat(els.selection.style.left) || 0;
            const T = parseFloat(els.selection.style.top) || 0;
            const W = parseFloat(els.selection.style.width) || 0;
            const H = parseFloat(els.selection.style.height) || 0;
            const cor = drag.corner || 'se';
            let ax = L, ay = T;
            if (cor === 'n' || cor === 's') ax = L + W / 2;
            else if (cor.includes('e')) ax = L + W;
            if (cor === 'w' || cor === 'e') ay = T + H / 2;
            else if (cor.includes('s')) ay = T + H;
            return { x: ax, y: ay };
        }
        return null;
    }
    function updateCrosshair(e) {
        // Ask for the drag anchor FIRST. During a move/resize drag it is derived from the selection box
        // and needs no canvas rect at all. Reading the rect up front (as this used to) forced a
        // synchronous layout on EVERY pointermove while dragging — onPointerMove had just written the
        // outline's left/top/width/height — which is the main cause of drag jank on a busy form.
        const anchor = crosshairPoint(e, null);
        if (anchor) { drawCrosshair(anchor.x, anchor.y); return; }
        const r = els.canvas.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        if (x < 0 || y < 0 || x > r.width || y > r.height) { hideCrosshair(); return; }
        drawCrosshair(x, y);
    }
    els.canvas.addEventListener('pointermove', updateCrosshair);
    els.canvas.addEventListener('pointerleave', hideCrosshair);

    els.canvas.addEventListener('click', (e) => {
        if (suppressClick) {
            suppressClick = false;
            return;
        }
        const p = toDesign(e.clientX, e.clientY);
        const hit = hitTest(p.x, p.y);
        // A tool is armed from the toolbox: click the canvas to place it here (each click
        // places one control).
        if (state.pendingTag) {
            const tag = state.pendingTag;
            state.pendingTag = null;
            updatePendingTool();
            post({ type: 'drop', tag, parentName: hit ? hit.name : null, x: p.x, y: p.y });
            return;
        }
        // Selecting happens when clicking the canvas surface. A control's overlay is
        // pointer-events:none, so clicking a control also lands on the canvas. Ctrl+Click (or
        // Cmd+Click on macOS) toggles the control in a multi-selection.
        if (e.target !== els.canvas && e.target !== els.img && e.target !== els.overlay) return;
        // Clicking EMPTY space (the locked Body design surface, or a gap on forms without one)
        // selects the FORM — its Window properties let you resize/size the whole surface.
        // Ctrl+Click on empty space has nothing to toggle, so it does nothing.
        const emptySpace = !hit || hit.locked;
        if (emptySpace) {
            if (!(e.ctrlKey || e.metaKey)) selectForm();
            return;
        }
        select(hit, e.ctrlKey || e.metaKey);
    });

    // Middle-mouse-button click on a control -> open the code-behind at the handler (this
    // replaced the old double-click action). Handled on mousedown (button 1) so it works even
    // where the browser suppresses the auxclick event, and preventDefault stops the middle-click
    // auto-scroll / paste. IMPORTANT (Linux/X11): the code-behind editor must NOT be opened while
    // the middle button is still held — releasing it over the newly focused editor pastes the
    // current primary selection into the .cs/.vb (a stray '>' or whatever text was last selected),
    // which breaks the build. So we only SELECT on press and post 'openEvent' once the button has
    // been RELEASED (and the pointer hasn't moved, i.e. it was a click, not a scroll attempt).
    let midDown = null; // {x, y, name} of the middle-button press
    els.canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 1) return; // middle button only (right-click shows the context menu)
        e.preventDefault();
        const p = toDesign(e.clientX, e.clientY);
        const hit = hitTest(p.x, p.y);
        midDown = hit && hit.name ? { x: e.clientX, y: e.clientY, name: hit.name } : null;
        if (midDown) select(hit);
    });
    window.addEventListener('mouseup', (e) => {
        if (e.button !== 1) return;
        e.preventDefault(); // never let the release perform a primary-selection paste
        const d = midDown;
        midDown = null;
        if (!d) return;
        // A click (not a drag): the pointer stayed put between press and release.
        if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) return;
        post({ type: 'openEvent', name: d.name });
    });

    // ---------------- drag & drop from toolbox ----------------
    let dropTarget = null;
    let dropNode = null;
    function highlightDrop(hit) {
        const node = (hit && overlayNodes.get(hit.name)) || null;
        if (dropTarget === hit && dropNode === node) return;
        dropTarget = hit;
        // The overlay node is looked up directly instead of querying the layer for `.ov.drop` and
        // rebuilding a [data-name] selector from the control name on every dragover.
        if (dropNode && dropNode !== node) dropNode.classList.remove('drop');
        if (node) node.classList.add('drop');
        dropNode = node;
    }

    els.canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        const p = toDesign(e.clientX, e.clientY);
        highlightDrop(hitTest(p.x, p.y));
    });
    els.canvas.addEventListener('dragleave', () => highlightDrop(null));
    els.canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        highlightDrop(null);
        state.pendingTag = null;
        updatePendingTool();
        let tag = null;
        try {
            tag = e.dataTransfer.getData('application/x-avalonia-control') ||
                e.dataTransfer.getData('application/vnd.code.tree.avaloniaDesigner.toolbox');
        } catch (err) { /* ignore */ }
        if (!tag) {
            els.status.textContent = 'Drag a control from the Toolbox view.';
            return;
        }
        const p = toDesign(e.clientX, e.clientY);
        const hit = hitTest(p.x, p.y);
        post({ type: 'drop', tag, parentName: hit ? hit.name : null, x: p.x, y: p.y });
    });

    // ---------------- armed toolbox tool (click tool, then click canvas) ----------------
    function updatePendingTool() {
        // The custom crosshair overlay is always shown over the design surface, so no native
        // cursor is needed while a toolbox tool is armed (the crosshair overlay is the pointer).
        if (state.pendingTag) {
            els.status.textContent = 'Click the canvas to place a ' + state.pendingTag + ' (Esc to cancel).';
        }
    }

    // ---------------- delete & context menu (cut / copy / paste / move / delete) ----------------
    function deleteSelected(name) {
        if (!name) return;
        if (isLockedControl(name)) return; // the Body design surface can't be deleted
        post({ type: 'delete', name });
        state.multi = new Set();
        state.selected = null;
        renderSelection();
        els.contextMenu.hidden = true;
    }

    function hideContextMenu() {
        els.contextMenu.hidden = true;
    }

    function showContextMenu(x, y, hit, p) {
        els.contextMenu.style.left = x + 'px';
        els.contextMenu.style.top = y + 'px';
        const name = hit && hit.name ? hit.name : '';
        els.contextMenu.dataset.name = name;
        els.contextMenu.dataset.parentName = name;
        els.contextMenu.dataset.x = String(p.x);
        els.contextMenu.dataset.y = String(p.y);
        // Items that act on the clicked control need a selection; Paste works anywhere.
        // The locked Body can't be cut/moved/deleted (only copied or edited).
        const hasSel = !!name;
        const locked = isLockedControl(name);
        els.ctxCut.disabled = !hasSel || locked;
        els.ctxCopy.disabled = !hasSel;
        els.ctxMoveToContainer.disabled = !hasSel || locked;
        // Add event… needs a NAMED control (the handler is named after it) but works for the locked
        // Body too — a Canvas can carry Loaded/pointer events like any other control.
        els.ctxAddEvent.disabled = !hasSel;
        els.ctxDelete.disabled = !hasSel || locked;
        els.ctxPaste.disabled = !state.clipboard;
        els.contextMenu.hidden = false;
        // Position AFTER it is visible and its items are enabled/disabled, so the measurement uses the
        // real size. A control near the bottom (or right) edge used to open the menu past the viewport
        // with its lower entries cut off and unreachable; flip it above / to the left of the cursor when
        // it would not fit, and clamp to the viewport as a last resort. The menu is position:fixed, so
        // the client coordinates from the event are the right coordinate space.
        const box = els.contextMenu.getBoundingClientRect();
        const margin = 4;
        let left = x;
        let top = y;
        if (left + box.width > window.innerWidth - margin) left = x - box.width;
        if (top + box.height > window.innerHeight - margin) top = y - box.height;
        els.contextMenu.style.left = Math.max(margin, left) + 'px';
        els.contextMenu.style.top = Math.max(margin, top) + 'px';
    }

    els.canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const p = toDesign(e.clientX, e.clientY);
        const hit = hitTest(p.x, p.y);
        if (hit && hit.name) select(hit);
        showContextMenu(e.clientX, e.clientY, hit, p);
    });

    els.ctxCut.addEventListener('click', () => {
        const name = els.contextMenu.dataset.name || null;
        if (name) {
            state.multi = new Set();
            state.selected = null;
            renderSelection();
            post({ type: 'cut', name });
        }
        els.contextMenu.hidden = true;
    });
    els.ctxCopy.addEventListener('click', () => {
        const name = els.contextMenu.dataset.name || null;
        if (name) post({ type: 'copy', name });
        els.contextMenu.hidden = true;
    });
    els.ctxPaste.addEventListener('click', () => {
        post({
            type: 'paste',
            x: parseFloat(els.contextMenu.dataset.x || '0'),
            y: parseFloat(els.contextMenu.dataset.y || '0'),
            parentName: els.contextMenu.dataset.parentName || null
        });
        els.contextMenu.hidden = true;
    });
    els.ctxMoveToContainer.addEventListener('click', () => {
        const name = els.contextMenu.dataset.name || null;
        if (name) post({ type: 'moveToContainer', name });
        els.contextMenu.hidden = true;
    });
    els.ctxDelete.addEventListener('click', () => deleteSelected(els.contextMenu.dataset.name));
    // Add event… — the extension answers with the openEventPicker message (the control's events,
    // which ones are already wired) and the modal below wires whatever gets ticked.
    els.ctxAddEvent.addEventListener('click', () => {
        const name = els.contextMenu.dataset.name || null;
        els.contextMenu.hidden = true;
        if (name) post({ type: 'addEvent', name });
    });
    els.contextMenu.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('click', hideContextMenu);
    window.addEventListener('resize', hideContextMenu);
    els.wrap.addEventListener('scroll', hideContextMenu, true);

    // Arrow-key auto-repeat fires ~20-30 keydowns per second, and each one used to post immediately:
    // every message re-renders the form on the host AND makes this webview decode the whole preview PNG
    // again. Accumulate the movement and send ONE nudge per animation frame instead — the same total
    // distance, one render. Keyed by the selection so a single select and a multi-select accumulate
    // separately (a selection change mid-frame must not move the wrong controls).
    const pendingNudges = new Map();
    let nudgeFrame = 0;
    function queueNudge(names, dx, dy) {
        const key = names.join('\u0000');
        const pending = pendingNudges.get(key) ?? { names: names.slice(), dx: 0, dy: 0 };
        pending.dx += dx;
        pending.dy += dy;
        pendingNudges.set(key, pending);
        if (nudgeFrame) return;
        nudgeFrame = requestAnimationFrame(() => {
            nudgeFrame = 0;
            const batch = [...pendingNudges.values()];
            pendingNudges.clear();
            for (const p of batch) post({ type: 'nudge', names: p.names, dx: p.dx, dy: p.dy });
        });
    }

    // Esc cancels an armed toolbox tool; arrows nudge the selection; Ctrl+X/C/V cut/copy/paste;
    // Delete removes. Arrow keys move ALL selected controls together (one undo step): the anchor
    // and every Ctrl+clicked control nudge by the same delta — Shift = coarse 10 px, plain = fine
    // 1 px. Only free-placed controls (direct Canvas children) nudge; a Grid/DockPanel lays its
    // children out, so they are not arrow-moved.
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
            if (state.pendingTag || drag) return; // a toolbox tool is armed, or a drag is in progress
            const step = e.shiftKey ? 10 : 1;
            const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
            const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
            const names = selectionNames().filter((n) => {
                const c = ctrlByName(n);
                return !!c && !c.locked && !c.paneBody;
            });
            if (!names.length) return;
            e.preventDefault();
            e.stopPropagation();
            queueNudge(names, dx, dy);
            return;
        }
        if (e.key === 'Escape' && state.pendingTag) {
            state.pendingTag = null;
            updatePendingTool();
            e.preventDefault();
            return;
        }
        // Cut / Copy / Paste on the selected control (native editing in text fields is untouched).
        if ((e.ctrlKey || e.metaKey) && !e.altKey) {
            const k = e.key.toLowerCase();
            const t = e.target;
            const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
            if (typing) return;
            // Undo / Redo (5 levels, handled by the extension): Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y.
            if (k === 'z') {
                e.preventDefault();
                post({ type: e.shiftKey ? 'redo' : 'undo', name: state.selected ? state.selected.name : null });
                return;
            }
            if (k === 'y') {
                e.preventDefault();
                post({ type: 'redo', name: state.selected ? state.selected.name : null });
                return;
            }
            if (k === 'x' && state.selected && state.selected.name) {
                e.preventDefault();
                const n = state.selected.name;
                state.multi = new Set();
                state.selected = null;
                renderSelection();
                post({ type: 'cut', name: n });
                return;
            }
            if (k === 'c' && state.selected && state.selected.name) {
                e.preventDefault();
                post({ type: 'copy', name: state.selected.name });
                return;
            }
            if (k === 'v') {
                e.preventDefault();
                post({ type: 'paste', x: state.designW / 2, y: state.designH / 2, parentName: null });
                return;
            }
            return;
        }
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
        if (!state.selected || !state.selected.name) return;
        e.preventDefault();
        deleteSelected(state.selected.name);
    });

    // ---------------- properties ----------------
    // Shared <datalist> suggestions (built once from the catalog's options). NOTE: only the
    // free-text fields (e.g. Margin) use datalists. Colour properties DON'T — the browser
    // filters datalist options by the typed value, so a colour dropdown only ever showed the
    // current colour. Colour uses the palette popup below (openColorPalette) instead.
    const builtDatalists = {};
    function ensureDatalist(id, options) {
        if (builtDatalists[id]) return;
        builtDatalists[id] = true;
        let dl = document.getElementById(id);
        if (!dl) {
            dl = document.createElement('datalist');
            dl.id = id;
            document.body.appendChild(dl);
        }
        for (const o of options || []) {
            const opt = document.createElement('option');
            opt.value = o;
            dl.appendChild(opt);
        }
    }

    // Colour-palette popup. A single fixed-position element (created on first use, so it isn't
    // clipped by the Properties panel's own scrolling). Lists EVERY preset colour — plus the
    // current value if it isn't a preset — ~5 rows visible, then it scrolls.
    const PALETTE_ROWS_VISIBLE = 5;
    function colorPaletteEl() {
        let p = document.getElementById('colorPalette');
        if (!p) {
            p = document.createElement('div');
            p.id = 'colorPalette';
            p.hidden = true;
            document.body.appendChild(p);
        }
        return p;
    }
    function openColorPalette(trigger, controlName, key, options, current) {
        const pal = colorPaletteEl();
        const entries = [];
        if (current && !options.includes(current)) entries.push(current); // custom colour on top
        for (const o of options || []) {
            if (!entries.includes(o)) entries.push(o);
        }
        pal.innerHTML = '';
        for (const c of entries) {
            const row = document.createElement('div');
            row.className = 'cp-row';
            const dot = document.createElement('span');
            dot.className = 'cp-swatch';
            dot.style.background = c;
            row.appendChild(dot);
            const name = document.createElement('span');
            name.textContent = c;
            row.appendChild(name);
            row.addEventListener('click', () => {
                closeColorPalette();
                post({ type: 'setProperty', name: controlName, key: key, value: c });
            });
            pal.appendChild(row);
        }
        pal.hidden = false;
        const rowH = 22;
        const maxPalH = (PALETTE_ROWS_VISIBLE * rowH + 10);
        pal.style.maxHeight = maxPalH + 'px';
        const r = trigger.getBoundingClientRect();
        const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
        const pw = pal.offsetWidth || 160;
        const ph = Math.min(pal.offsetHeight || maxPalH, maxPalH);
        const left = Math.max(8, Math.min(r.left, vw - pw - 8));
        // Open DOWN below the property by default. Open UP instead when the property row sits in
        // the lower half of the window (below the vertical middle) — or whenever there isn't
        // enough room below — so the list never runs off the bottom of the screen.
        const openUp = r.top > vh / 2 || (r.bottom + 4 + ph > vh - 8);
        pal.style.left = left + 'px';
        pal.style.top = (openUp ? Math.max(8, r.top - ph - 4) : (r.bottom + 4)) + 'px';
        window.__colorPaletteOpen = true;
    }
    function closeColorPalette() {
        const p = document.getElementById('colorPalette');
        if (p) p.hidden = true;
        window.__colorPaletteOpen = false;
    }
    // Close the palette when the user clicks outside it, presses Esc, or scrolls anywhere ELSE.
    // Scrolling INSIDE the popup's own list must be allowed — that's how you reach colour #31 —
    // so a scroll whose target is inside #colorPalette is ignored.
    document.addEventListener('click', (e) => {
        if (!window.__colorPaletteOpen) return;
        const p = document.getElementById('colorPalette');
        if (p && p.contains(e.target)) return;
        closeColorPalette();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeColorPalette();
    });
    document.addEventListener('scroll', (e) => {
        if (!window.__colorPaletteOpen) return;
        const p = document.getElementById('colorPalette');
        if (p && e.target && p.contains(e.target)) return; // scrolling the popup's own list
        closeColorPalette();
    }, true);

    // Best-effort conversion of a color value (name / rgb / hex) to a #RRGGBB hex.
    function toHex(value) {
        if (!value) return null;
        const m = /^#([0-9a-f]{6})$/i.exec(value.trim());
        if (m) return '#' + m[1];
        try {
            const probe = document.createElement('div');
            probe.style.color = value;
            probe.style.display = 'none';
            document.body.appendChild(probe);
            const cs = getComputedStyle(probe).color;
            document.body.removeChild(probe);
            const rgb = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/i.exec(cs || '');
            if (rgb) {
                return '#' + [1, 2, 3].map((i) => parseInt(rgb[i], 10).toString(16).padStart(2, '0')).join('');
            }
        } catch (err) { /* ignore */ }
        return null;
    }

    // Turns a raw renderer error into a short, plain-language hint for novices.
    function friendlyError(raw) {
        const r = raw || '';
        const first = r.split('\n')[0];
        if (/cannot find event handler|unable to find (a )?handler|event handler.*not found/i.test(r)) {
            return 'The XAML references an event handler that doesn\'t exist yet. Middle-click the control to create it. (' + first + ')';
        }
        if (/unable to find type|was not found|cannot find type/i.test(r)) {
            return 'A control type couldn\'t be found — it may be a custom/third-party control the previewer can\'t load. (' + first + ')';
        }
        if (/property .* does not exist|no property named|not found on .*control/i.test(r)) {
            return 'A property name isn\'t valid on this control — check the spelling. (' + first + ')';
        }
        if (/is not defined|does not exist|could not be found/i.test(r)) {
            return 'Something referenced here can\'t be found (a type, resource or handler). (' + first + ')';
        }
        return first;
    }

    // Plain-language "About this control" help panel (top of the Properties panel).
    function renderHelp(info) {
        if (!info) {
            els.helpPanel.hidden = true;
            return;
        }
        els.helpPanel.hidden = false;
        els.helpTitle.textContent = info.label;
        if (state.helpOpen) {
            els.helpBody.hidden = false;
            els.helpBody.innerHTML = '';
            const d = document.createElement('div');
            d.className = 'help-desc';
            d.textContent = info.desc;
            els.helpBody.appendChild(d);
            const u = document.createElement('div');
            u.className = 'help-use';
            u.textContent = '💡 ' + info.use;
            els.helpBody.appendChild(u);
            els.btnToggleHelp.textContent = '▾';
        } else {
            els.helpBody.hidden = true;
            els.btnToggleHelp.textContent = '▸';
        }
    }

    // ---------- Properties panel sections (grouping + fold memory) ----------
    /** Which sections the user folded, keyed by control TYPE — restored from the last session
     *  through the webview state (VS Code keeps it per panel, so reopening a form remembers it). */
    function loadCollapsed() {
        try {
            const saved = typeof vscode.getState === 'function' ? vscode.getState() : null;
            if (saved && saved.collapsed && typeof saved.collapsed === 'object') state.collapsed = saved.collapsed;
        } catch (e) { /* no state support: everything starts expanded */ }
    }

    function persistCollapsed() {
        try {
            if (typeof vscode.setState !== 'function') return;
            const prev = (typeof vscode.getState === 'function' ? vscode.getState() : null) || {};
            const next = Object.assign({}, prev);
            next.collapsed = state.collapsed;
            vscode.setState(next);
        } catch (e) { /* ignore */ }
    }

    function isSectionCollapsed(scope, id) {
        if (!scope || !id) return false;
        const forType = state.collapsed[scope];
        return !!(forType && forType[id]);
    }

    function toggleSection(scope, id) {
        if (!scope || !id) return;
        if (!state.collapsed[scope]) state.collapsed[scope] = {};
        if (state.collapsed[scope][id]) delete state.collapsed[scope][id];
        else state.collapsed[scope][id] = true;
        persistCollapsed();
    }

    /** A clickable group heading (▾ open / ▸ folded) for the Properties list. */
    function sectionHeader(labelText, id, scope) {
        const folded = isSectionCollapsed(scope, id);
        const head = document.createElement('div');
        head.className = 'prop-section' + (folded ? ' collapsed' : '');
        head.dataset.sectionId = id || '';
        head.setAttribute('role', 'button');
        head.setAttribute('aria-expanded', folded ? 'false' : 'true');
        head.title = folded ? 'Click to expand this group' : 'Click to collapse this group';
        const arrow = document.createElement('span');
        arrow.className = 'prop-section-arrow';
        arrow.textContent = folded ? '▸' : '▾';
        const name = document.createElement('span');
        name.textContent = labelText;
        head.appendChild(arrow);
        head.appendChild(name);
        head.addEventListener('click', () => {
            toggleSection(scope, id);
            if (state.lastProps) renderProperties(state.lastProps);
        });
        return head;
    }

    /** Which control the panel is currently showing, so a rebuild for the SAME control can keep the
     *  user's scroll position while a NEW selection starts at the top. */
    let propsShownFor = '';
    const propsIdentityOf = (msg) => (Array.isArray(msg && msg.names) && msg.names.length
        ? msg.names.join('\u0000')
        : String((msg && msg.name) || ''));

    /**
     * The field being TYPED into, holding the function that commits its value. A typed property is
     * applied on Enter or when the field loses focus — never while typing.
     *
     * Every commit costs a full round trip: the model is edited, the previewer re-renders the form,
     * a new PNG comes back, and the Properties panel is rebuilt for the response. Debouncing that to
     * 400 ms still ran the whole thing mid-word and threw the rows away underneath the user, which is
     * what made typing feel laggy. Discrete controls are unaffected — a dropdown, a confirmed colour,
     * a checkbox or a palette click is one action, not typing, and still applies immediately.
     *
     * Anything still pending is committed before the rows are rebuilt, so a refresh arriving from the
     * extension mid-typing can never swallow what was typed.
     */
    let pendingText = null;   // () => void: commits the value the field holds now

    function flushPendingText() {
        const commit = pendingText;
        pendingText = null;
        if (commit) commit();
    }

    /**
     * Wires a typed field to commit on Enter or blur. The value is read at commit time (not captured),
     * and the field remembers what the extension was last told: typing a value back to what it was —
     * or Enter followed by the `change` event it also fires — costs nothing and posts nothing twice.
     */
    function onTypedField(el, commit) {
        let committed = el.value;
        const flush = () => {
            const value = el.value;
            pendingText = null;
            if (value === committed) return;
            committed = value;
            commit();
        };
        el.addEventListener('input', () => { pendingText = flush; });
        el.addEventListener('change', flush);          // fires on blur, and on Enter for text inputs
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') flush(); });
    }

    /**
     * Rebuilds the Properties panel while preserving the scroll position when it rebuilds for the same
     * control. The panel is rebuilt wholesale on every property change, and TWO things used to move it:
     * the rebuilt content started at the top, and the focus restore called `focus()`, which makes the
     * browser scroll the focused input into view — so the property just edited ended up pinned to the
     * bottom edge of the panel. The input is now focused with `preventScroll` and the scroll offset is
     * saved and restored around the rebuild.
     */
    function renderProperties(msg) {
        // The rows are about to be thrown away: commit a half-typed value first (see onTypedField).
        flushPendingText();
        const id = propsIdentityOf(msg);
        const keep = id === propsShownFor ? els.propsBody.scrollTop : 0;
        try {
            renderPropertiesInner(msg);
        } finally {
            propsShownFor = id;
            els.propsBody.scrollTop = keep;
        }
    }

    function renderPropertiesInner(msg) {
        // Every property edit triggers a properties refresh that rebuilds the rows;
        // remember which field the user is editing so we can restore focus + caret.
        let focusKey = null;
        let focusCaret = 0;
        let focusTabItem = null;
        let focusTiProp = null;
        let focusListItem = null;
        const active = document.activeElement;
        if (active && active.dataset && els.propsBody.contains(active)) {
            if (active.dataset.propKey) {
                focusKey = active.dataset.propKey;
                focusCaret = active.selectionStart != null ? active.selectionStart : (active.value ? active.value.length : 0);
            } else if (active.dataset.tabitem) {
                focusTabItem = active.dataset.tabitem;
                focusTiProp = active.dataset.tiprop;
                focusCaret = active.selectionStart != null ? active.selectionStart : (active.value ? active.value.length : 0);
            } else if (active.dataset.listitem) {
                focusListItem = active.dataset.listitem;
                focusCaret = active.selectionStart != null ? active.selectionStart : (active.value ? active.value.length : 0);
            }
        }
        state.lastProps = { name: msg.name, properties: msg.properties, info: msg.info, tabItems: msg.tabItems, listItems: msg.listItems, multi: msg.multi === true, names: msg.names };
        const isMulti = state.lastProps.multi;
        // Multi-select: property edits must carry the WHOLE selection so the extension applies the
        // value to every selected control in one undo step.
        const multiNames = isMulti && Array.isArray(msg.names) && msg.names.length > 1 ? msg.names : null;
        const postSet = (key, value) => {
            const m = { type: 'setProperty', name: msg.name, key, value };
            if (multiNames) m.names = multiNames;
            post(m);
        };
        if (!msg.properties) {
            els.propsBody.hidden = true;
            els.propsEmpty.hidden = false;
            els.propsToggleRow.hidden = true;
            renderHelp(null);
            return;
        }
        els.propsEmpty.hidden = true;
        els.propsBody.hidden = false;
        els.propsToggleRow.hidden = false;
        renderHelp(msg.info);
        els.propsBody.innerHTML = '';
        // A single selection anchors the Properties to that control; a MULTI selection must keep
        // the webview's own selection set (the rows are the common properties across all of it).
        if (msg.name !== undefined && !isMulti) {
            state.selected = { name: msg.name };
            renderSelection();
        }
        // Text-input handler for TabItem rows (commits on Enter/blur, see onTypedField)
        const onTiText = (el) => onTypedField(el, () => {
            post({ type: 'setTabItemProperty', name: msg.name, itemName: el.dataset.tabitem, key: el.dataset.tiprop, value: el.value });
        });
        // Text-input handler for ListBoxItem rows (commits on Enter/blur, see onTypedField)
        const onLiText = (el) => onTypedField(el, () => {
            post({ type: 'setListItemProperty', name: msg.name, itemName: el.dataset.listitem, key: 'Content', value: el.value });
        });
        // Properties are grouped into sections (Editors / Layout & size / Appearance / Text & font /
        // Data / Behavior). The groups come from the extension in order; the fold state is per
        // control type, so folding "Data" on one DataGrid folds it on every DataGrid.
        const typeRow = (msg.properties || []).find((p) => p.key === '__type__');
        const scopeKey = (typeRow && typeRow.value) || (isMulti ? 'multi' : (msg.name || ''));
        let currentSection = null;
        for (const p of msg.properties) {
            const row = document.createElement('div');
            row.className = 'prop-row';
            const label = document.createElement('label');
            label.textContent = p.label;
            label.title = p.desc || p.label; // hover description

            let control = null;     // the element appended after the label
            let focusTarget = null; // the input to refocus after a rebuild
            const options = p.options || [];
            // Beginner mode hides advanced properties until "Show advanced" is ticked.
            if (p.advanced && !state.showAdvanced) continue;
            // A section starts once (rows arrive grouped), and a FOLDED section keeps its heading
            // but none of its rows.
            if (p.section && p.section !== currentSection) {
                currentSection = p.section;
                els.propsBody.appendChild(sectionHeader(p.section, p.sectionId, scopeKey));
            }
            if (p.section && isSectionCollapsed(scopeKey, p.sectionId)) continue;
            const onText = (el) => onTypedField(el, () => postSet(p.key, el.value));

            if (p.kind === 'dropdown' || p.kind === 'font') {
                const sel = document.createElement('select');
                sel.dataset.propKey = p.key;
                // Multi-select: values that differ show an empty '(multiple)' placeholder option.
                if (p.mixed) {
                    const ph = document.createElement('option');
                    ph.value = '';
                    ph.textContent = '(multiple)';
                    sel.appendChild(ph);
                }
                for (const o of options) {
                    const opt = document.createElement('option');
                    opt.value = o;
                    opt.textContent = o;
                    sel.appendChild(opt);
                }
                if (p.value && !options.includes(p.value)) {
                    const opt = document.createElement('option');
                    opt.value = p.value;
                    opt.textContent = p.value;
                    sel.appendChild(opt);
                }
                sel.value = p.value || '';
                sel.addEventListener('change', () => {
                    postSet(p.key, sel.value);
                });
                control = sel;
                focusTarget = sel;
            } else if (p.kind === 'color') {
                const wrap = document.createElement('div');
                wrap.className = 'prop-input-group';
                const swatch = document.createElement('input');
                swatch.type = 'color';
                swatch.className = 'color-swatch';
                const hex = toHex(p.value);
                if (hex) swatch.value = hex;
                const text = document.createElement('input');
                text.type = 'text';
                text.dataset.propKey = p.key;
                text.value = p.value || '';
                swatch.addEventListener('input', () => {
                    // Fires continuously while the native color picker is open. If we posted here
                    // the extension would re-render the properties panel, destroying this swatch
                    // and closing the picker mid-pick. So just mirror the value into the text box.
                    text.value = swatch.value;
                });
                swatch.addEventListener('change', () => {
                    // Fires only when the user CONFIRMS the color (closes the picker with OK/Enter).
                    text.value = swatch.value;
                    postSet(p.key, swatch.value);
                });
                onText(text);
                // Palette button — opens the full colour list (hidden in multi-select; the swatch /
                // hex field apply to all selected). (A <datalist> on the text box was dropped because
                // the browser filters datalist options by the typed value, so the dropdown appeared
                // to list only the current colour.)
                if (!isMulti) {
                    const palBtn = document.createElement('button');
                    palBtn.type = 'button';
                    palBtn.className = 'color-drop';
                    palBtn.textContent = '▾';
                    palBtn.title = 'Choose from the colour palette…';
                    palBtn.addEventListener('click', (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        openColorPalette(palBtn, msg.name, p.key, options, p.value || '');
                    });
                    wrap.appendChild(palBtn);
                }
                wrap.appendChild(swatch);
                wrap.appendChild(text);
                control = wrap;
                focusTarget = text;
            } else if (p.kind === 'margin') {
                control = document.createElement('input');
                control.type = 'text';
                control.dataset.propKey = p.key;
                control.value = p.value || '';
                if (p.mixed) control.placeholder = '(multiple)';
                control.setAttribute('list', 'designerMarginList');
                ensureDatalist('designerMarginList', options);
                onText(control);
                focusTarget = control;
            } else if (p.kind === 'button') {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'prop-button';
                btn.textContent = p.value || '…';
                btn.dataset.propKey = p.key;
                if (p.readOnly) btn.disabled = true;
                btn.addEventListener('click', () => {
                    // 'Items' opens the batch editor (one item per line).
                    if (p.key === 'Items') openItemsEditor((msg.items || []).map((s) => String(s)), msg.name);
                    // 'Rows & Columns' opens the Grid editor.
                    if (p.key === 'Grid.Defs') {
                        const d = msg.gridDefs || {};
                        openGridEditor({ rows: d.rows || ['*'], cols: d.cols || ['*'] }, msg.name);
                    }
                    // 'Menu Items' opens the menu tree editor for the selected Menu bar.
                    if (p.key === 'MenuItems') openMenuEditor(msg.name);
                    // 'Status Items' opens the flat item editor for the selected Status Bar.
                    if (p.key === 'StatusItems') openStatusEditor(msg.name, msg.statusItems || []);
                    // 'Split Layout' opens the split editor for the selected Split Panel.
                    if (p.key === 'SplitLayout') openSplitEditor(msg.name, msg.splitInfo || {});
                    // 'Splitters' opens the divider-bar styling editor for the selected Split Panel.
                    if (p.key === 'Splitters') openSplitterEditor(msg.name, msg.splitters || []);
                    // 'Rows' / 'Columns' open the DataGrid decoration editors.
                    if (p.key === 'Rows') openDataGridEditor('rows', msg.name, msg.dgRows || {});
                    if (p.key === 'Columns') openDataGridEditor('cols', msg.name, msg.dgCols || {});
                });
                control = btn;
            } else if (p.kind === 'file') {
                // A file-path property (Image Source, Window Icon, Title Bar Icon): a text field
                // (you can still type a path/avares:// URI) + a "Browse…" button that opens the
                // system file picker. The picked file is bundled into the project's Assets\ folder.
                // An Image.Source row (p.dataImage) ALSO gets a 'Data…' button that binds the Image
                // to a DataGrid's selected-row image column; when bound the file browser is disabled
                // (data wins) and the field shows the binding read-only.
                const wrap = document.createElement('div');
                wrap.className = 'prop-input-group';
                const ftxt = document.createElement('input');
                ftxt.type = 'text';
                ftxt.dataset.propKey = p.key;
                ftxt.value = p.value || '';
                if (p.mixed) ftxt.placeholder = '(multiple)';
                if (p.dataImage && p.readOnly) ftxt.disabled = true;
                else onText(ftxt);
                const fbtn = document.createElement('button');
                fbtn.type = 'button';
                fbtn.className = 'prop-browse';
                fbtn.textContent = '…';
                fbtn.title = 'Browse for a file…';
                if (p.dataImage && p.readOnly) fbtn.disabled = true;
                fbtn.addEventListener('click', () => post({ type: 'browseFile', name: msg.name, key: p.key }));
                wrap.appendChild(ftxt);
                // In multi-select the text field applies to all selected controls; the Browse /
                // Data… buttons act on the anchor only, so they're hidden there.
                if (!isMulti) {
                    wrap.appendChild(fbtn);
                    if (p.dataImage) {
                        const dbtn = document.createElement('button');
                        dbtn.type = 'button';
                        dbtn.className = 'prop-data';
                        dbtn.textContent = 'Data…';
                        dbtn.title = p.readOnly
                            ? 'This Image shows the selected row\'s image file from a DataGrid. Click to change or clear.'
                            : 'Show the image file stored in a DataGrid\'s selected row (a DataSet text column)…';
                        dbtn.addEventListener('click', () => post({ type: 'pickImageData', name: msg.name }));
                        wrap.appendChild(dbtn);
                    }
                }
                control = wrap;
                focusTarget = ftxt;
            } else if (p.key === 'ItemsSource') {
                // Items Source: a text field (you can still type a binding/asset manually) + a
                // "…" button that opens the asset picker (code collections + DataSet tables).
                // The text is read-only when the binding lives in code-behind (a DataSet table or
                // a picked asset), but the "…" button stays ENABLED so a bound control can still be
                // switched to another source or un-bound right here (kept in sync with the .adset).
                const wrap = document.createElement('div');
                wrap.className = 'prop-input-group';
                const itxt = document.createElement('input');
                itxt.type = 'text';
                itxt.dataset.propKey = p.key;
                itxt.value = p.value || '';
                if (p.readOnly) itxt.disabled = true;
                else onText(itxt);
                const ibtn = document.createElement('button');
                ibtn.type = 'button';
                ibtn.className = 'prop-browse';
                ibtn.textContent = '…';
                ibtn.title = p.readOnly ? 'Change or clear this binding…' : 'Pick a collection / DataSet table to bind…';
                ibtn.addEventListener('click', () => post({ type: 'pickItemsSource', name: msg.name }));
                wrap.appendChild(itxt);
                wrap.appendChild(ibtn);
                control = wrap;
                focusTarget = itxt;
            } else if (p.kind === 'number') {
                const num = document.createElement('input');
                num.type = 'number';
                num.dataset.propKey = p.key;
                num.value = p.value || '';
                if (p.mixed) num.placeholder = '(multiple)';
                // 'Undo-Redo' writes the .adset and regenerates the DataSet class, so it must never
                // fire per keystroke — it commits on Enter/blur like every other typed field.
                onText(num);
                focusTarget = num;
                if (p.unit) {
                    const wrap = document.createElement('div');
                    wrap.className = 'prop-input-group';
                    const unit = document.createElement('span');
                    unit.className = 'unit';
                    unit.textContent = p.unit;
                    wrap.appendChild(num);
                    wrap.appendChild(unit);
                    control = wrap;
                } else {
                    control = num;
                }
            } else {
                control = document.createElement('input');
                control.type = 'text';
                control.dataset.propKey = p.key;
                control.value = p.value || '';
                if (p.mixed) control.placeholder = '(multiple)';
                if (p.key === '__type__') control.disabled = true;
                if (p.key === '__name__') {
                    // A rename refactors the generated code-behind handlers in one step, so it commits
                    // on Enter/blur like every other typed field. It renames THIS control only, so it
                    // deliberately posts without the multi-selection `names` an ordinary row carries.
                    onTypedField(control, () => post({
                        type: 'setProperty', name: msg.name, key: '__name__', value: control.value
                    }));
                } else {
                    onText(control);
                }
                focusTarget = control;
            }

            if (p.readOnly && control) control.disabled = true;
            row.appendChild(label);
            row.appendChild(control);
            els.propsBody.appendChild(row);
            if (focusKey === p.key && focusTarget) {
                // preventScroll: without it the browser scrolls the focused input into view, which
                // moved the panel on every property change (the edited row landed at the bottom edge).
                focusTarget.focus({ preventScroll: true });
                try { focusTarget.setSelectionRange(focusCaret, focusCaret); } catch (err) { /* not focusable */ }
            }
        }
        // --- Tab Items section (shown when a TabControl is selected) ---
        if (msg.tabItems && msg.tabItems.length > 0) {
            const section = document.createElement('div');
            section.className = 'tab-items-section';

            const headRow = document.createElement('div');
            headRow.className = 'tab-items-head';
            const title = document.createElement('span');
            title.className = 'tab-items-title';
            title.textContent = 'Tab Items';
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'btn-tab-add';
            addBtn.title = 'Add a new tab item';
            addBtn.textContent = '+ Add Tab';
            addBtn.addEventListener('click', () => {
                post({ type: 'addTabItem', name: msg.name });
            });
            headRow.appendChild(title);
            headRow.appendChild(addBtn);
            section.appendChild(headRow);

            for (const ti of msg.tabItems) {
                const row = document.createElement('div');
                row.className = 'tab-item-row';
                row.dataset.tabitem = ti.name;

                const headerInput = document.createElement('input');
                headerInput.type = 'text';
                headerInput.className = 'ti-header';
                headerInput.dataset.tabitem = ti.name;
                headerInput.dataset.tiprop = 'Header';
                headerInput.value = ti.header || '';
                headerInput.title = 'Tab header (label)';
                onTiText(headerInput);
                row.appendChild(headerInput);

                const contentInput = document.createElement('input');
                contentInput.type = 'text';
                contentInput.className = 'ti-content';
                contentInput.dataset.tabitem = ti.name;
                contentInput.dataset.tiprop = 'Content';
                contentInput.value = ti.content || '';
                contentInput.title = 'Tab content';
                onTiText(contentInput);
                row.appendChild(contentInput);

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'btn-tab-remove';
                removeBtn.title = 'Remove this tab';
                removeBtn.textContent = '✕';
                removeBtn.dataset.tabitem = ti.name;
                removeBtn.addEventListener('click', () => {
                    post({ type: 'removeTabItem', name: msg.name, itemName: ti.name });
                });
                row.appendChild(removeBtn);

                section.appendChild(row);

                // Restore focus on whichever TabItem input was active before rebuild
                if (focusTabItem === ti.name && headerInput) {
                    headerInput.focus();
                    try { headerInput.setSelectionRange(focusCaret, focusCaret); } catch (err) { /* ignore */ }
                }
                if (focusTabItem === ti.name && focusTiProp === 'Content' && contentInput) {
                    contentInput.focus();
                    try { contentInput.setSelectionRange(focusCaret, focusCaret); } catch (err) { /* ignore */ }
                }
            }
            // The Tab Items editor is the first thing in the Properties pane for a TabControl —
            // prepend it so it sits ABOVE the Name/Type/theme rows (added last to the body, but
            // inserted as the first child once all rows are appended).
            els.propsBody.prepend(section);
        }
        // --- List Items section (shown when a ListBox is selected) ---
        if (msg.listItems) {
            const section = document.createElement('div');
            section.className = 'list-items-section';

            const headRow = document.createElement('div');
            headRow.className = 'list-items-head';
            const title = document.createElement('span');
            title.className = 'list-items-title';
            title.textContent = 'List Items';
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'btn-list-add';
            addBtn.title = 'Add an item — choose its type';
            addBtn.textContent = '+ Add Item';
            addBtn.addEventListener('click', () => {
                post({ type: 'addListItem', name: msg.name });
            });
            headRow.appendChild(title);
            headRow.appendChild(addBtn);
            section.appendChild(headRow);

            for (const li of msg.listItems) {
                const row = document.createElement('div');
                row.className = 'list-item-row';
                row.dataset.listitem = li.name;

                const contentInput = document.createElement('input');
                contentInput.type = 'text';
                contentInput.className = 'li-content';
                contentInput.dataset.listitem = li.name;
                contentInput.value = li.content || '';
                contentInput.title = 'Item text';
                onLiText(contentInput);
                row.appendChild(contentInput);

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'btn-list-remove';
                removeBtn.title = 'Remove this item';
                removeBtn.textContent = '✕';
                removeBtn.dataset.listitem = li.name;
                removeBtn.addEventListener('click', () => {
                    post({ type: 'removeListItem', name: msg.name, itemName: li.name });
                });
                row.appendChild(removeBtn);

                section.appendChild(row);

                // Restore focus on whichever list-item input was active before rebuild
                if (focusListItem === li.name && contentInput) {
                    contentInput.focus();
                    try { contentInput.setSelectionRange(focusCaret, focusCaret); } catch (err) { /* ignore */ }
                }
            }
            els.propsBody.appendChild(section);
        }
    }

    // ---------------- messages from the extension ----------------
    window.addEventListener('message', (e) => {
        const msg = e.data;
        switch (msg.type) {
            case 'frame':
                applyFrame(msg);
                break;
            case 'dotGrid': {
                if (msg.dotGrid) state.dotGrid = msg.dotGrid;
                applyDotGrid();
                renderRulers();
                break;
            }
            case 'crosshair': {
                if (msg.crosshair && typeof msg.crosshair === 'object') setCrosshairConfig(msg.crosshair);
                break;
            }
            case 'properties':
                renderProperties(msg);
                break;
            case 'status':
                els.status.textContent = msg.message;
                // A long status can change how the toolbar wraps (it shares the last row with the
                // ⚙ Settings button), so re-run the separator layout.
                layoutToolbar();
                break;
            case 'codeIssues':
                renderCodeIssues(msg);
                break;
            case 'selectControl': {
                if (state.frame) {
                    const c = ctrlByName(msg.name);
                    if (c) select(c);
                }
                break;
            }
            case 'openEventPicker':
                openEventPicker(msg);
                break;
            case 'openHandlerMenu':
                openHandlerMenu(msg);
                break;
            case 'codeMarkers': {
                state.markers = {};
                for (const m of (Array.isArray(msg.markers) ? msg.markers : [])) {
                    if (m && m.name) state.markers[String(m.name)] = { severity: String(m.severity || 'error'), title: String(m.title || '') };
                }
                renderOverlays();
                break;
            }
            case 'codeSettings':
                fillSettings(msg);
                break;
            case 'aiState':
                fillAi(msg.state);
                break;
            case 'aiProgress':
                setAiProgress(String(msg.message || ''));
                break;
            case 'aiResult': {
                setAiBusy(false);
                clearTimeout(aiWatchdog);
                const text = String(msg.message || '');
                // A failure stays in the progress line, where the user is looking, instead of only in the
                // designer's status bar at the bottom of the window. It also no longer vanishes.
                setAiProgress(msg.ok ? '' : (text ? '✗ ' + text : '✗ the load failed — see Output → Avalonia Designer'));
                els.status.textContent = (msg.ok ? '' : '✗ ') + text;
                // Ask for the state once more *after* the action is confirmed. The state posted as part of
                // the action is the right one, but if that message is lost (a webview that was not ready, a
                // second designer tab) the picker would keep showing the old selection forever — which is
                // what the user saw after loading the built-in 3B (2026-09-15). Unload needs it just as
                // much: the `● loaded` tag only disappears when a fresh state arrives, and until then the
                // panel named a model the user had just unloaded (reported the same day).
                if (msg.ok && (msg.action === 'load' || msg.action === 'unload')) post({ type: 'aiState' });
                break;
            }
            case 'aiStatus': {
                setAiBusy(false);
                els.aiStatusText.textContent = (Array.isArray(msg.lines) ? msg.lines : []).join('\n');
                // A background refresh (the palette changed the model under an open panel) updates the box but
                // must not pop it open: opening it is the user's action, and a box that appears by itself
                // reads as a fault rather than as news.
                if (!msg.quiet) els.aiStatusText.hidden = false;
                break;
            }
            case 'armTool': {
                state.pendingTag = msg.tag;
                updatePendingTool();
                break;
            }
            case 'clipboard': {
                state.clipboard = !!msg.has;
                break;
            }
            case 'historyState': {
                // The extension owns the undo/redo history (5 levels) and tells us whether there
                // is anything to undo/redo, so the toolbar buttons reflect reality.
                els.btnUndo.disabled = !msg.canUndo;
                els.btnRedo.disabled = !msg.canRedo;
                break;
            }
            case 'publishState': {
                applyPublishState(msg);
                break;
            }
            case 'fonts': {
                // System font list from the host — refresh the header-font picker if the Columns
                // editor is open (it may have been opened before the list arrived).
                systemFonts = Array.isArray(msg.fonts) ? msg.fonts.map(String) : [];
                if (dgEdit && dgEdit.mode === 'cols' && dgEdit.fieldEls && dgEdit.fieldEls.headerFont) {
                    const sel = dgEdit.fieldEls.headerFont;
                    const cur = String(dgEdit.values.headerFont || '');
                    const opts = systemFonts.length ? systemFonts : FONT_FALLBACK;
                    sel.innerHTML = '';
                    if (cur && !opts.includes(cur)) {
                        const o = document.createElement('option');
                        o.value = cur; o.textContent = cur; sel.appendChild(o);
                    }
                    for (const f of opts) {
                        const o = document.createElement('option');
                        o.value = f; o.textContent = f; sel.appendChild(o);
                    }
                    sel.value = cur ? cur : opts[0];
                }
                break;
            }
            default:
                break;
        }
    });

    // ---------------- toolbar ----------------
    // The toolbar wraps onto a second row when the buttons don't fit (see #toolbar in the CSS).
    // A separator (`.sep`) that the wrap left dangling — at the END of a row or at the very START
    // of the next one — is hidden, so a divider always has buttons on both sides of it.
    function layoutToolbar() {
        const bar = els.toolbar;
        if (!bar) return;
        // A category that is folded away takes its separator with it: it must not be reset below
        // (that would leave a stray divider standing where the group used to be).
        const folded = foldedToolbarItems();
        const seps = Array.from(bar.querySelectorAll('.sep')).filter((s) => folded.has(s) === false);
        for (const sep of seps) sep.hidden = false;
        if (seps.length === 0) return;
        // A button a folded group hid takes no space, so it is not the separator's neighbour either.
        const kids = Array.from(bar.children).filter((el) => el.hidden !== true);
        for (let i = 0; i < kids.length; i++) {
            const sep = kids[i];
            if (sep.classList.contains('sep') === false) continue;
            const prev = kids[i - 1];
            const next = kids[i + 1];
            const alone = (prev === undefined || prev.offsetTop !== sep.offsetTop)
                || (next === undefined || next.offsetTop !== sep.offsetTop);
            if (alone) sep.hidden = true;
        }
    }
    window.addEventListener('resize', () => layoutToolbar());

    // ---------------- foldable toolbar categories ----------------
    // The toolbar is a FLAT flex box (so it wraps as before), so a category is defined by its
    // heading chip: everything after a `.tbg-head` belongs to it, up to the next heading or the
    // `data-stop` marker (the status text and ⚙ Settings are never folded away). Groups start
    // UNFOLDED; the folded set is remembered per designer tab, like the Properties sections.
    function toolbarHeads() {
        return els.toolbar ? Array.from(els.toolbar.querySelectorAll('.tbg-head')) : [];
    }

    /** The toolbar items that belong to a heading — its following siblings, until the next
     *  heading or the `data-stop` marker. */
    function toolbarMembers(head) {
        const members = [];
        for (let el = head.nextElementSibling; el; el = el.nextElementSibling) {
            if (el.classList.contains('tbg-head') || el.hasAttribute('data-stop')) break;
            members.push(el);
        }
        return members;
    }

    /** Every item the FOLDED categories currently hide — their buttons, the zoom read-out and the
     *  separators inside them. Used both to hide them and to keep the wrap pass off them. */
    function foldedToolbarItems() {
        const hidden = new Set();
        for (const head of toolbarHeads()) {
            if (state.toolbarFolds[head.dataset.grp] !== true) continue;
            for (const el of toolbarMembers(head)) hidden.add(el);
        }
        return hidden;
    }

    /** Paints the folded state onto every category (and re-runs the wrap: the toolbar's rows change). */
    function applyToolbarFolds() {
        for (const head of toolbarHeads()) {
            const folded = state.toolbarFolds[head.dataset.grp] === true;
            for (const el of toolbarMembers(head)) el.hidden = folded;
            head.setAttribute('aria-expanded', folded ? 'false' : 'true');
            head.title = (head.dataset.tip || '')
                + (folded ? ' — click to unfold this group' : ' — click to fold this group away');
        }
        layoutToolbar();
    }

    function loadToolbarFolds() {
        try {
            const saved = typeof vscode.getState === 'function' ? vscode.getState() : null;
            if (saved && saved.toolbarFolds && typeof saved.toolbarFolds === 'object') state.toolbarFolds = saved.toolbarFolds;
        } catch (e) { /* every group starts unfolded */ }
    }

    function persistToolbarFolds() {
        try {
            if (typeof vscode.setState !== 'function') return;
            const prev = (typeof vscode.getState === 'function' ? vscode.getState() : null) || {};
            const next = Object.assign({}, prev);
            next.toolbarFolds = state.toolbarFolds;
            vscode.setState(next);
        } catch (e) { /* ignore */ }
    }

    function toggleToolbarGroup(grp) {
        if (!grp) return;
        if (state.toolbarFolds[grp] === true) delete state.toolbarFolds[grp];
        else state.toolbarFolds[grp] = true;
        persistToolbarFolds();
        applyToolbarFolds();
    }

    // ONE delegated listener for the whole toolbar: the headings are the only buttons without an
    // action of their own, and delegation survives anything that re-renders the toolbar.
    if (els.toolbar) {
        els.toolbar.addEventListener('click', (e) => {
            const head = e.target && e.target.closest ? e.target.closest('.tbg-head') : null;
            if (head) toggleToolbarGroup(head.dataset.grp || '');
        });
    }

    // Undo / Redo — the history (5 levels) lives in the extension; these post the SAME messages
    // the Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y shortcuts send, and are enabled/disabled by the
    // extension's historyState messages.
    els.btnUndo.addEventListener('click', () => post({ type: 'undo', name: state.selected ? state.selected.name : null }));
    els.btnRedo.addEventListener('click', () => post({ type: 'redo', name: state.selected ? state.selected.name : null }));
    els.btnNewForm.addEventListener('click', () => post({ type: 'openNewForm' }));
    // Refresh: re-read the .axaml and re-render the preview (the extension also re-queries the
    // design-time SQLite data, so rows added by a RUNNING app show up without reopening the form).
    els.btnRefresh.addEventListener('click', () => {
        els.status.textContent = 'Refreshing\u2026';
        post({ type: 'refresh' });
    });
    // Project Backup: the extension saves what is unsaved, then copies the project folder next to
    // itself as <Project>_<date>_<time>.
    els.btnBackup.addEventListener('click', () => {
        els.status.textContent = 'Saving and backing up the project\u2026';
        post({ type: 'projectBackup' });
    });
    // Code Fix…: check the code-behind against the form / DataSet and list what is wrong with it.
    els.btnCodeFix.addEventListener('click', () => {
        els.status.textContent = 'Checking the code-behind\u2026';
        post({ type: 'codeCheck' });
    });
    // Publish…: build the project and package it as a Debian installer. The extension runs the build in
    // a terminal (so the output is visible and the .deb can be rebuilt by hand), which is also why the
    // status line says "see the terminal" rather than pretending to know when it finished.
    if (els.btnPublish) {
        els.btnPublish.addEventListener('click', () => {
            els.status.textContent = 'Publishing the app \u2014 see the terminal\u2026';
            post({ type: 'publishApp' });
        });
    }
    // Install: install the built package on this machine (sudo, in the terminal). The button is disabled
    // unless the extension reported a CURRENT package; the guard is repeated here because a disabled
    // control does not swallow synthetic/explicit click dispatches in every environment.
    if (els.btnInstall) {
        els.btnInstall.addEventListener('click', () => {
            if (els.btnInstall.disabled) return;
            els.status.textContent = 'Installing the app \u2014 see the terminal\u2026';
            post({ type: 'installApp' });
        });
    }

    /**
     * The extension reports whether there is something to install:
     *   none   nothing published yet          -> Install is DISABLED
     *   stale  the package is older than the   -> Install is DISABLED (installing it would put the
     *          project's sources                  previous build on the machine while the designer
     *                                             shows the current one)
     *   ready  the package is current         -> Install is enabled
     * A disabled button says WHY in its tooltip, so a greyed-out button is not a mystery.
     */
    function applyPublishState(msg) {
        state.packageState = msg.state;
        state.packageName = msg.name || '';
        const btn = els.btnInstall;
        if (!btn) return;
        const what = state.packageName ? state.packageName : 'the app';
        if (msg.state === 'ready') {
            btn.disabled = false;
            btn.title = 'Install ' + what + ' on this machine, so it runs outside VS Code ' +
                '(Linux asks for your password in the terminal; Windows shows its own permission prompt).';
        } else if (msg.state === 'stale') {
            btn.disabled = true;
            btn.title = 'Nothing to install: the package is older than the project\u2019s sources. ' +
                'Press \u24d4 Publish\u2026 to rebuild it, then install the current build.';
        } else {
            btn.disabled = true;
            btn.title = 'Nothing to install yet: no package has been built. Press \u24d4 Publish\u2026 first.';
        }
    }
    els.btnZoomIn.addEventListener('click', () => {
        state.fitted = false;
        state.scale = Math.min(4, state.scale * 1.2);
        layout(); renderOverlays(); renderSelection(); renderRulers();
    });
    els.btnZoomOut.addEventListener('click', () => {
        state.fitted = false;
        state.scale = Math.max(0.05, state.scale / 1.2);
        layout(); renderOverlays(); renderSelection(); renderRulers();
    });
    els.btnFit.addEventListener('click', () => {
        state.fitted = false;
        fit(); renderOverlays(); renderSelection(); renderRulers();
    });
    els.btnClearSel.addEventListener('click', deselect);

    // --- alignment tools (edge + text) ---
    // Edge align: requires >= 2 selected controls; every selected control's edge/centre is moved
    // to match the ANCHOR (the first-selected control, state.selected.name).
    function postAlign(align) {
        const names = selectionNames();
        if (names.length < 2 || !state.selected || !state.selected.name) return;
        post({ type: 'align', align, anchor: state.selected.name, names });
    }
    // 'centre' aligns each control's centre-X to the anchor's (the centres form a VERTICAL line),
    // 'middle' aligns centre-Y (a HORIZONTAL line). The buttons post the kind that matches their
    // label/glyph: "Align vertical centres…" (↕) = centre-X, "Align horizontal centres…" (↔) = centre-Y.
    els.btnAlignLeft.addEventListener('click', () => postAlign('left'));
    els.btnAlignCentre.addEventListener('click', () => postAlign('middle'));
    els.btnAlignRight.addEventListener('click', () => postAlign('right'));
    els.btnAlignTop.addEventListener('click', () => postAlign('top'));
    els.btnAlignMiddle.addEventListener('click', () => postAlign('centre'));
    els.btnAlignBottom.addEventListener('click', () => postAlign('bottom'));
    // Make same Width/Height: resize every non-anchor selected control to the anchor's size.
    els.btnSameWidth.addEventListener('click', () => postAlign('sameWidth'));
    els.btnSameHeight.addEventListener('click', () => postAlign('sameHeight'));
    els.btnEqualV.addEventListener('click', () => postAlign('equalV'));
    els.btnEqualH.addEventListener('click', () => postAlign('equalH'));
    // Align Text: centres the text horizontally inside each selected single-line text control.
    els.btnAlignText.addEventListener('click', () => {
        const names = selectionNames();
        if (!names.length || !state.selected || !state.selected.name) return;
        post({ type: 'alignText', anchor: state.selected.name, names });
    });

    // --- dot grid toolbar toggles + settings popup ---
    els.btnDotGrid.addEventListener('click', () => post({ type: 'toggleDotGrid' }));
    els.btnSnapGrid.addEventListener('click', () => post({ type: 'toggleSnapToGrid' }));
    // --- crosshair settings popup (single Crosshair toolbar button) ---
    function openCrosshairSettings() {
        const c = state.crosshair || {};
        els.chModeShort.classList.toggle('active', c.mode !== 'long');
        els.chModeLong.classList.toggle('active', c.mode === 'long');
        els.chShortLength.value = clampNum(c.shortLength, 6, 4000, 50);
        els.chThickness.value = clampNum(c.thickness, 1, 12, 1);
        els.chOpacity.value = clampNum(c.opacity, 0, 100, 100);
        els.chColor.value = /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#ff4d4d';
        els.crosshairModal.hidden = false;
    }
    function closeCrosshairSettings() { els.crosshairModal.hidden = true; }
    els.btnCrosshair.addEventListener('click', openCrosshairSettings);
    els.chModeShort.addEventListener('click', () => {
        els.chModeShort.classList.add('active');
        els.chModeLong.classList.remove('active');
    });
    els.chModeLong.addEventListener('click', () => {
        els.chModeLong.classList.add('active');
        els.chModeShort.classList.remove('active');
    });
    els.crosshairCancel.addEventListener('click', closeCrosshairSettings);
    els.crosshairModal.addEventListener('click', (e) => {
        if (e.target === els.crosshairModal) closeCrosshairSettings(); // click outside the box
    });
    els.crosshairSave.addEventListener('click', () => {
        const settings = {
            mode: els.chModeLong.classList.contains('active') ? 'long' : 'short',
            shortLength: clampNum(els.chShortLength.value, 6, 4000, 50),
            thickness: clampNum(els.chThickness.value, 1, 12, 1),
            opacity: clampNum(els.chOpacity.value, 0, 100, 100),
            color: els.chColor.value || '#ff4d4d'
        };
        closeCrosshairSettings();
        post({ type: 'setCrosshair', settings });
    });
    els.btnGridSettings.addEventListener('click', () => {
        const g = state.dotGrid || {};
        els.dotGridSpacingX.value = g.spacingX || 16;
        els.dotGridSpacingY.value = g.spacingY || 16;
        els.dotGridColor.value = g.color || '#9db4d0';
        els.dotGridDotSize.value = g.dotSize || 1.5;
        els.dotGridModal.hidden = false;
        els.dotGridSpacingX.focus();
    });
    function closeDotGridSettings() { els.dotGridModal.hidden = true; }
    els.dotGridCancel.addEventListener('click', closeDotGridSettings);
    els.dotGridModal.addEventListener('click', (e) => {
        if (e.target === els.dotGridModal) closeDotGridSettings(); // click outside the box
    });
    els.dotGridSave.addEventListener('click', () => {
        const settings = {
            spacingX: clampNum(els.dotGridSpacingX.value, 4, 1000, 16),
            spacingY: clampNum(els.dotGridSpacingY.value, 4, 1000, 16),
            color: els.dotGridColor.value || '#9db4d0',
            dotSize: clampNum(els.dotGridDotSize.value, 0.5, 20, 1.5)
        };
        closeDotGridSettings();
        post({ type: 'setDotGrid', settings });
    });

    els.btnToggleHelp.addEventListener('click', () => {
        state.helpOpen = !state.helpOpen;
        if (state.lastProps) renderHelp(state.lastProps.info);
    });
    els.chkAdvanced.addEventListener('change', () => {
        state.showAdvanced = els.chkAdvanced.checked;
        if (state.lastProps) renderProperties(state.lastProps);
    });

    // --- 'Items' batch editor modal (ComboBox / ListBox / ItemsControl) ---
    let itemsTarget = null;
    function openItemsEditor(items, name) {
        itemsTarget = name;
        els.itemsText.value = (items || []).join('\n');
        els.itemsModal.hidden = false;
        els.itemsText.focus();
    }
    function closeItemsEditor() {
        els.itemsModal.hidden = true;
    }
    els.itemsSave.addEventListener('click', () => {
        const lines = els.itemsText.value.split('\n');
        post({ type: 'saveItems', name: itemsTarget, items: lines });
        closeItemsEditor();
    });
    els.itemsCancel.addEventListener('click', closeItemsEditor);
    els.itemsModal.addEventListener('click', (e) => {
        if (e.target === els.itemsModal) closeItemsEditor(); // click outside the box
    });

    // --- 'Code Fix…' findings (code-behind checker) ---
    // The extension RE-posts the list after every fix, so the panel always shows the current state
    // of the file instead of a stale snapshot — the per-item buttons stay enabled until then.
    function closeCodeFixes() {
        els.codeModal.hidden = true;
    }
    function renderCodeIssues(msg) {
        const issues = msg.issues || [];
        const file = msg.file || 'the code-behind';
        els.codeFixAll.disabled = false;
        els.codeBody.innerHTML = '';
        els.codeHint.textContent = issues.length === 0
            ? 'No problems found in ' + file + '.'
            : (msg.errors || 0) + ' error(s), ' + (msg.warnings || 0) + ' warning(s) in ' + file + '.';
        if (msg.backup) {
            const note = document.createElement('div');
            note.className = 'code-backup';
            note.textContent = 'Backup: ' + msg.backup;
            els.codeBody.appendChild(note);
        }
        for (const it of issues) {
            const row = document.createElement('div');
            row.className = 'code-item ' + (it.severity === 'error' ? 'error' : 'warning');
            const head = document.createElement('div');
            head.className = 'code-item-head';
            const badge = document.createElement('span');
            badge.className = 'code-badge';
            badge.textContent = it.severity === 'error' ? 'Error' : 'Warning';
            const title = document.createElement('span');
            title.className = 'code-item-title';
            title.textContent = it.title;
            head.appendChild(badge);
            head.appendChild(title);
            const detail = document.createElement('div');
            detail.className = 'code-item-detail';
            detail.textContent = it.detail;
            const actions = document.createElement('div');
            actions.className = 'code-item-actions';
            if (it.line) {
                const go = document.createElement('button');
                go.type = 'button';
                go.className = 'modal-btn';
                go.textContent = 'Go to line ' + it.line;
                go.addEventListener('click', () => post({ type: 'codeOpen', file: it.file, line: it.line }));
                actions.appendChild(go);
            }
            if (it.fixable) {
                const fix = document.createElement('button');
                fix.type = 'button';
                fix.className = 'modal-btn primary';
                fix.textContent = 'Fix';
                fix.addEventListener('click', () => {
                    fix.disabled = true;
                    fix.textContent = 'Fixing\u2026';
                    post({ type: 'codeFix', id: it.id });
                });
                actions.appendChild(fix);
                // Alternative ways to resolve the SAME finding — e.g. "the handler delete was
                // deliberate, drop the wiring from the form instead of re-creating the method".
                (it.alternatives || []).forEach((a, altIndex) => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'modal-btn';
                    b.textContent = a.label || 'Alternative fix';
                    b.title = a.detail || '';
                    b.addEventListener('click', () => {
                        b.disabled = true;
                        b.textContent = 'Applying\u2026';
                        post({ type: 'codeFix', id: it.id, alt: altIndex });
                    });
                    actions.appendChild(b);
                });
            } else {
                const manual = document.createElement('span');
                manual.className = 'code-item-manual';
                manual.textContent = 'needs a manual decision';
                actions.appendChild(manual);
            }
            row.appendChild(head);
            row.appendChild(detail);
            row.appendChild(actions);
            els.codeBody.appendChild(row);
        }
        els.codeModal.hidden = false;
    }
    els.codeRecheck.addEventListener('click', () => {
        els.status.textContent = 'Checking the code-behind\u2026';
        post({ type: 'codeCheck' });
    });
    els.codeFixAll.addEventListener('click', () => {
        els.codeFixAll.disabled = true;
        els.status.textContent = 'Applying fixes\u2026';
        post({ type: 'codeFixAll' });
    });
    els.codeClose.addEventListener('click', closeCodeFixes);
    els.codeModal.addEventListener('click', (e) => {
        if (e.target === els.codeModal) closeCodeFixes(); // click outside the box
    });
    // --- 'Rows & Columns' editor modal (Grid) ---
    let gridTarget = null;
    function gridInput() {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = '*';
        input.placeholder = 'Auto / * / 100';
        input.spellcheck = false;
        return input;
    }
    function gridItem(input) {
        const row = document.createElement('div');
        row.className = 'grid-def-item';
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'grid-def-del';
        del.title = 'Remove';
        del.textContent = '✕';
        del.addEventListener('click', () => { row.remove(); });
        row.appendChild(input);
        row.appendChild(del);
        return row;
    }
    function renderGridList(listEl, sizes) {
        listEl.innerHTML = '';
        (sizes || []).forEach((s) => {
            const input = gridInput();
            input.value = s || '*';
            listEl.appendChild(gridItem(input));
        });
    }
    function openGridEditor(defs, name) {
        gridTarget = name;
        renderGridList(els.gridRows, defs.rows && defs.rows.length ? defs.rows : ['*']);
        renderGridList(els.gridCols, defs.cols && defs.cols.length ? defs.cols : ['*']);
        els.gridModal.hidden = false;
        const first = els.gridRows.querySelector('input') || els.gridCols.querySelector('input');
        if (first) first.focus();
    }
    els.gridAddRow.addEventListener('click', () => els.gridRows.appendChild(gridItem(gridInput())));
    els.gridAddCol.addEventListener('click', () => els.gridCols.appendChild(gridItem(gridInput())));
    els.gridSave.addEventListener('click', () => {
        const read = (listEl) => Array.from(listEl.querySelectorAll('input'))
            .map((i) => i.value.trim()).filter(Boolean);
        post({ type: 'saveGridDefs', name: gridTarget, rows: read(els.gridRows), cols: read(els.gridCols) });
        els.gridModal.hidden = true;
    });
    els.gridCancel.addEventListener('click', () => { els.gridModal.hidden = true; });
    els.gridModal.addEventListener('click', (e) => {
        if (e.target === els.gridModal) els.gridModal.hidden = true; // click outside the box
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!els.itemsModal.hidden) closeItemsEditor();
            if (!els.gridModal.hidden) els.gridModal.hidden = true;
            if (!els.dotGridModal.hidden) closeDotGridSettings();
            if (!els.crosshairModal.hidden) closeCrosshairSettings();
            if (!els.menuModal.hidden) closeMenuEditor();
            if (!els.eventModal.hidden) els.eventSkip.click();
            if (!els.handlerModal.hidden) closeHandlerMenu();
            if (!els.settingsModal.hidden) closeSettings();
            if (!els.statusModal.hidden) closeStatusEditor();
            if (!els.splitModal.hidden) closeSplitEditor();
            if (!els.splitterModal.hidden) closeSplitterEditor();
            if (!els.dgModal.hidden) closeDataGridEditor();
            if (!els.codeModal.hidden) closeCodeFixes();
        }
    });

    // ---------------- menu bar dummies + 'Menu Items' tree editor ----------------
    // Avalonia only realizes MenuItem containers when a menu is OPENED, so the headless preview
    // renders an EMPTY menu bar. The extension sends the real item tree (state.frame.menus[name]);
    // we draw PLAIN placeholder labels (dummies) over the bar — they are NOT real controls, so
    // clicking one never selects a control or opens its Properties. Clicking a dummy (or the
    // 'Menu Items' property) opens the tree editor below; Save writes real <MenuItem> XAML.
    let menuEdit = null;           // { name, tree } working copy while the modal is open
    let menuExpanded = new Set();  // paths ("0", "0.1", …) expanded in the editor
    const MENU_MAX_DEPTH_UI = 5;
    // [value, label] — the value is the node kind the extension understands.
    const MENU_KIND_OPTIONS = [
        ['Item', 'Item'], ['CheckBox', 'CheckBox'], ['Radio', 'Radio'], ['ComboBox', 'ComboBox'],
        ['Separator', 'Separator'],
        ['FileSelector', 'File Selector'], ['FolderSelector', 'Folder Selector']
    ];
    /** Kind choices for one row. 'Space' — an invisible gap on the top bar — is a TOP-LEVEL kind
     *  (a submenu uses Separators for gaps), so it is only offered at depth 1. The two selector
     *  kinds are offered at any depth (they are leaf rows, like a Separator). */
    function menuKindOptions(depth, current) {
        const list = MENU_KIND_OPTIONS.slice();
        if (depth === 1 || current === 'Space') list.push(['Space', 'Space']);
        return list;
    }
    function menuKey(path) { return path.join('.'); }
    function menuCopy(n) {
        return {
            kind: (n && n.kind) || 'Item',
            header: n && n.header != null ? String(n.header) : '',
            width: n && n.width != null ? Number(n.width) : undefined,
            pathType: n && n.pathType ? String(n.pathType) : undefined,
            children: Array.isArray(n && n.children) ? n.children.map(menuCopy) : []
        };
    }
    function menuNew(kind, header) { return { kind: kind || 'Item', header: header || '', children: [] }; }
    function menuNodeAt(path) {
        if (!menuEdit) return null;
        let list = menuEdit.tree, node = null;
        for (const i of path) {
            if (!list) return null;
            node = list[i]; if (!node) return null;
            list = node.children;
        }
        return node;
    }
    function menuParent(path) {
        if (!menuEdit) return null;
        if (path.length === 1) return { list: menuEdit.tree, idx: path[0] };
        const p = menuNodeAt(path.slice(0, -1));
        if (!p) return null;
        return { list: p.children, idx: path[path.length - 1] };
    }
    function menuFocus(path) {
        const inp = els.menuBody.querySelector('.mn-row[data-path="' + cssEscape(menuKey(path)) + '"] .mn-header');
        if (inp) { inp.focus(); try { inp.select(); } catch (err) { /* ignore */ } }
    }
    function menuBtn(label, cls, title, fn, disabled) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'mn-act ' + cls;
        b.textContent = label; b.title = title || '';
        if (disabled) b.disabled = true;
        else if (fn) b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
        return b;
    }
    function renderMenuTree() {
        const body = els.menuBody;
        body.innerHTML = '';
        if (!menuEdit) return;
        const draw = (node, depth, path) => {
            const key = menuKey(path);
            const row = document.createElement('div');
            row.className = 'mn-row';
            row.dataset.depth = String(depth);
            row.dataset.path = key;
            row.style.paddingLeft = (10 + (depth - 1) * 24) + 'px';
            const isSep = node.kind === 'Separator';
            const isSpace = node.kind === 'Space';
            // A File/Folder Selector row is a leaf that holds the bundled <chrome:PathPicker>.
            const isPicker = node.kind === 'FileSelector' || node.kind === 'FolderSelector';
            const canHaveKids = !isSep && !isSpace && !isPicker && depth < MENU_MAX_DEPTH_UI;
            const hasKids = !!node.children && node.children.length > 0;
            const isOpen = menuExpanded.has(key);
            // Expand/collapse caret (leaf items show a dot).
            const caret = document.createElement('button');
            caret.type = 'button'; caret.className = 'mn-caret';
            if (canHaveKids) {
                caret.textContent = isOpen ? '▾' : '▸';
                caret.title = isOpen ? 'Collapse this submenu' : 'Expand this submenu';
                caret.addEventListener('click', () => {
                    if (isOpen) menuExpanded.delete(key); else menuExpanded.add(key);
                    renderMenuTree();
                });
            } else { caret.textContent = '·'; caret.disabled = true; }
            row.appendChild(caret);
            // Kind (maps to real MenuItem semantics on save). 'Space' is only a top-level bar gap.
            const sel = document.createElement('select');
            sel.className = 'mn-kind';
            for (const [k, label] of menuKindOptions(depth, node.kind)) {
                const o = document.createElement('option'); o.value = k; o.textContent = label;
                sel.appendChild(o);
            }
            sel.value = node.kind;
            sel.title = 'Item kind (how it behaves at runtime)';
            sel.addEventListener('change', () => {
                const to = sel.value;
                const toPicker = to === 'FileSelector' || to === 'FolderSelector';
                if (to === 'Space') {
                    node.kind = 'Space';
                    node.header = '';
                    node.children = [];
                    delete node.pathType;
                    if (!(Number(node.width) > 0)) node.width = 12;
                } else if (node.kind === 'Space') {
                    node.kind = to;
                    delete node.width;
                    if (toPicker) {
                        // A selector row: a dialog caption + a row width, never a submenu.
                        node.children = [];
                        node.pathType = to === 'FolderSelector' ? 'Folder' : 'File';
                        node.width = 160;
                    } else if (to !== 'Separator' && !node.header) node.header = 'New Item';
                } else {
                    const wasPicker = node.kind === 'FileSelector' || node.kind === 'FolderSelector';
                    if (to === 'Separator') node.header = '';
                    else if ((wasPicker || node.kind === 'Separator') && !node.header) node.header = 'New Item';
                    if (toPicker) {
                        node.children = [];
                        node.pathType = to === 'FolderSelector' ? 'Folder' : 'File';
                        if (!(Number(node.width) > 0)) node.width = 160;
                    } else if (wasPicker) {
                        delete node.pathType;
                        delete node.width;
                    }
                    node.kind = to;
                }
                renderMenuTree();
                menuFocus(path);
            });
            row.appendChild(sel);
            if (isSep) {
                const lbl = document.createElement('span');
                lbl.className = 'mn-sep-label';
                lbl.textContent = '—— separator ——';
                row.appendChild(lbl);
            } else {
                if (isSpace || isPicker) {
                    const span = document.createElement('span');
                    span.className = 'mn-space';
                    const inp = document.createElement('input');
                    inp.type = 'number'; inp.className = 'mn-width';
                    inp.min = '1'; inp.max = '500';
                    inp.value = String(Number(node.width) > 0 ? Number(node.width) : (isPicker ? 160 : 12));
                    inp.title = isPicker
                        ? 'Width of the picker row on the menu, in pixels'
                        : 'Width of the invisible gap between items, in pixels';
                    inp.addEventListener('input', () => {
                        const w = parseInt(inp.value, 10);
                        node.width = Number.isFinite(w) && w > 0 ? Math.min(500, w) : (isPicker ? 160 : 12);
                    });
                    inp.addEventListener('keydown', (e) => { e.stopPropagation(); });
                    span.appendChild(inp);
                    const px = document.createElement('span');
                    px.className = 'mn-sep-label'; px.textContent = isPicker ? 'px wide' : 'px gap';
                    span.appendChild(px);
                    row.appendChild(span);
                }
                const inp = document.createElement('input');
                inp.type = 'text'; inp.className = 'mn-header';
                inp.value = node.header || '';
                inp.placeholder = isPicker ? 'Dialog title' : 'Item text';
                inp.title = isPicker ? 'Caption of the file/folder dialog' : 'Item text (Header)';
                inp.addEventListener('input', () => { node.header = inp.value; });
                inp.addEventListener('keydown', (e) => { e.stopPropagation(); });
                row.appendChild(inp);
            }
            row.appendChild(document.createElement('span')); // flex spacer
            row.appendChild(menuBtn('+', 'mn-addc', canHaveKids ? 'Add a child item (its submenu)' : 'Maximum depth (5) reached', canHaveKids ? () => {
                node.children.push(menuNew('Item', 'New Item'));
                menuExpanded.add(key);
                const ci = node.children.length - 1;
                renderMenuTree();
                menuFocus(path.concat(ci));
            } : null, !canHaveKids));
            const canSib = !isSep && depth <= MENU_MAX_DEPTH_UI;
            row.appendChild(menuBtn('⇢', 'mn-adds', canSib ? 'Add a sibling item below' : 'Maximum depth (5) reached', canSib ? () => {
                const par = menuParent(path);
                if (!par) return;
                par.list.splice(par.idx + 1, 0, menuNew('Item', 'New Item'));
                renderMenuTree();
                menuFocus(path.slice(0, -1).concat(par.idx + 1));
            } : null, !canSib));
            row.appendChild(menuBtn('↑', 'mn-up', 'Move up', () => {
                const par = menuParent(path);
                if (par && par.idx > 0) {
                    const [it] = par.list.splice(par.idx, 1);
                    par.list.splice(par.idx - 1, 0, it);
                    renderMenuTree();
                }
            }));
            row.appendChild(menuBtn('↓', 'mn-down', 'Move down', () => {
                const par = menuParent(path);
                if (par && par.idx < par.list.length - 1) {
                    const [it] = par.list.splice(par.idx, 1);
                    par.list.splice(par.idx + 1, 0, it);
                    renderMenuTree();
                }
            }));
            row.appendChild(menuBtn('✕', 'mn-del', 'Delete this item (and its submenu)', () => {
                const par = menuParent(path);
                if (par) { par.list.splice(par.idx, 1); renderMenuTree(); }
            }));
            body.appendChild(row);
            if (isOpen && node.children) {
                for (let i = 0; i < node.children.length; i++) draw(node.children[i], depth + 1, path.concat(i));
            }
        };
        for (let i = 0; i < menuEdit.tree.length; i++) draw(menuEdit.tree[i], 1, [i]);
        if (!menuEdit.tree.length) {
            const empty = document.createElement('div');
            empty.className = 'mn-empty';
            empty.textContent = 'No items on the bar yet — click “+ Add menu item” above.';
            body.appendChild(empty);
        }
    }
    function addMenuTopRow() {
        if (!menuEdit) return;
        menuEdit.tree.push(menuNew('Item', 'New Item'));
        renderMenuTree();
        menuFocus([menuEdit.tree.length - 1]);
    }
    /** Opens the tree editor. A `topIdx` (from clicking a bar dummy) expands that item. */
    function openMenuEditor(name, topIdx) {
        const src = (state.frame && state.frame.menus && name) ? (state.frame.menus[name] || []) : [];
        menuEdit = { name: name || null, tree: src.map(menuCopy) };
        menuExpanded = new Set();
        if (typeof topIdx === 'number' && menuEdit.tree[topIdx]) menuExpanded.add(String(topIdx));
        els.menuTitle.textContent = 'Menu Items' + (menuEdit.name ? ' — ' + menuEdit.name : '');
        els.menuModal.hidden = false;
        renderMenuTree();
    }
    function closeMenuEditor() { els.menuModal.hidden = true; menuEdit = null; }
    els.menuAddTop.addEventListener('click', addMenuTopRow);
    els.menuSave.addEventListener('click', () => {
        if (menuEdit) post({ type: 'saveMenuItems', name: menuEdit.name, items: menuEdit.tree });
        closeMenuEditor();
    });
    els.menuCancel.addEventListener('click', closeMenuEditor);
    els.menuModal.addEventListener('click', (e) => {
        if (e.target === els.menuModal) closeMenuEditor(); // click outside the box
    });

    // ---------------- Status Items editor (flat list) ----------------
    // A Status Bar is a DockPanel strip; this editor manages its child controls (kind + text +
    // a LEFT/RIGHT anchor). Items are listed left→right; Save writes the real child controls.
    const STATUS_KIND_OPTIONS = ['TextBlock', 'TextBox', 'Button', 'ProgressBar', 'Separator', 'StatusDate', 'XYTracker'];
    let statusEdit = null; // { name, items: [{kind, text, position}] }
    const statusBtn = (label, cls, title, fn) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'mn-act ' + cls;
        b.textContent = label; b.title = title || '';
        b.addEventListener('click', (e) => { e.stopPropagation(); fn && fn(); });
        return b;
    };
    function renderStatusEditor() {
        const body = els.statusBody;
        body.innerHTML = '';
        if (!statusEdit) return;
        statusEdit.items.forEach((it, idx) => {
            const row = document.createElement('div');
            row.className = 'mn-row';
            row.dataset.idx = String(idx);
            row.dataset.kind = it.kind;
            const kindSel = document.createElement('select');
            kindSel.className = 'mn-kind';
            for (const k of STATUS_KIND_OPTIONS) {
                const o = document.createElement('option'); o.value = k; o.textContent = k;
                kindSel.appendChild(o);
            }
            kindSel.value = it.kind;
            kindSel.title = 'Item kind';
            kindSel.addEventListener('change', () => { it.kind = kindSel.value; renderStatusEditor(); });
            row.appendChild(kindSel);
            if (it.kind === 'TextBlock' || it.kind === 'TextBox' || it.kind === 'Button') {
                const inp = document.createElement('input');
                inp.type = 'text'; inp.className = 'mn-header';
                inp.value = it.text || ''; inp.placeholder = 'Text…'; inp.title = 'Item text';
                inp.addEventListener('input', () => { it.text = inp.value; });
                inp.addEventListener('keydown', (e) => e.stopPropagation());
                row.appendChild(inp);
            } else {
                const lbl = document.createElement('span');
                lbl.className = 'mn-sep-label';
                lbl.textContent = it.kind === 'StatusDate' ? 'live clock' : it.kind === 'XYTracker' ? 'form WxH' : it.kind === 'ProgressBar' ? '0–100%' : 'gap';
                row.appendChild(lbl);
            }
            const posSel = document.createElement('select');
            posSel.className = 'mn-pos';
            for (const p of ['Left', 'Right']) {
                const o = document.createElement('option'); o.value = p; o.textContent = 'Anchor ' + p;
                posSel.appendChild(o);
            }
            posSel.value = it.position === 'Right' ? 'Right' : 'Left';
            posSel.title = 'Anchor the item to the left or right side of the bar';
            posSel.addEventListener('change', () => { it.position = posSel.value; });
            row.appendChild(posSel);
            row.appendChild(document.createElement('span')); // spacer
            row.appendChild(statusBtn('↑', 'mn-up', 'Move left/up', () => {
                if (idx > 0) {
                    const [m] = statusEdit.items.splice(idx, 1);
                    statusEdit.items.splice(idx - 1, 0, m);
                    renderStatusEditor();
                }
            }));
            row.appendChild(statusBtn('↓', 'mn-down', 'Move right/down', () => {
                if (idx < statusEdit.items.length - 1) {
                    const [m] = statusEdit.items.splice(idx, 1);
                    statusEdit.items.splice(idx + 1, 0, m);
                    renderStatusEditor();
                }
            }));
            row.appendChild(statusBtn('✕', 'mn-del', 'Delete this item', () => {
                statusEdit.items.splice(idx, 1);
                renderStatusEditor();
            }));
            body.appendChild(row);
        });
        if (!statusEdit.items.length) {
            const e = document.createElement('div');
            e.className = 'mn-empty';
            e.textContent = 'No items on the bar — click “+ Add item” to put a label, button or clock on it.';
            body.appendChild(e);
        }
    }
    function openStatusEditor(name, items) {
        statusEdit = {
            name: name || null,
            items: (items || []).map((i) => ({
                kind: (i && i.kind) || 'TextBlock',
                text: i && i.text != null ? String(i.text) : '',
                position: i && i.position === 'Right' ? 'Right' : 'Left'
            }))
        };
        els.statusTitle.textContent = 'Status Items' + (statusEdit.name ? ' — ' + statusEdit.name : '');
        els.statusModal.hidden = false;
        renderStatusEditor();
    }
    function closeStatusEditor() { els.statusModal.hidden = true; statusEdit = null; }
    els.statusAdd.addEventListener('click', () => {
        if (!statusEdit) return;
        statusEdit.items.push({ kind: 'TextBlock', text: 'New Item', position: 'Left' });
        renderStatusEditor();
    });
    els.statusSave.addEventListener('click', () => {
        if (statusEdit) post({ type: 'saveStatusItems', name: statusEdit.name, items: statusEdit.items });
        closeStatusEditor();
    });
    els.statusCancel.addEventListener('click', closeStatusEditor);
    els.statusModal.addEventListener('click', (e) => {
        if (e.target === els.statusModal) closeStatusEditor(); // click outside the box
    });

    // ---------------- Split Layout editor (a SplitPanel = a Border frame around a Grid of panes + GridSplitters) ----
    // shape: 'zones' (the T — `top` panes side-by-side in the top band over a full-width bottom
    // pane), 'columns' (N side-by-side) or 'rows' (N stacked). The stepper sets the TOP-pane count
    // in Zones and the total pane count in Columns/Rows. Save posts the layout; the extension
    // rebuilds the Grid + splitter bars, keeping whatever is already inside each pane.
    let splitEdit = null; // { name, shape, count, top }
    function renderSplitEditor() {
        els.splitZones.classList.toggle('active', splitEdit.shape === 'zones');
        els.splitCols.classList.toggle('active', splitEdit.shape === 'columns');
        els.splitRows.classList.toggle('active', splitEdit.shape === 'rows');
        const zones = splitEdit.shape === 'zones';
        els.splitPanesLabel.textContent = zones ? 'Top panes' : 'Panes';
        els.splitPanesRow.hidden = false; // Zones now lets you choose how many panes sit up top
        els.splitCount.value = String(zones ? splitEdit.top : splitEdit.count);
    }
    function openSplitEditor(name, info) {
        const st = info || {};
        const shape = st.shape === 'zones' || st.shape === 'rows' ? st.shape
            : (st.shape === 'columns' ? 'columns' : (st.columns !== false ? 'columns' : 'rows'));
        const rawCount = Math.max(2, Math.min(8, Number(st.count) || 2));
        splitEdit = {
            name: name || null,
            shape: shape,
            count: rawCount,
            // Zones: top-band panes. Older info sent count = total (top + 1) with no `top`.
            top: shape === 'zones'
                ? Math.max(2, Math.min(8, Number(st.top) || (rawCount > 0 ? rawCount - 1 : 2)))
                : 2
        };
        els.splitTitle.textContent = 'Split Layout' + (splitEdit.name ? ' — ' + splitEdit.name : '');
        renderSplitEditor();
        els.splitModal.hidden = false;
    }
    function closeSplitEditor() { els.splitModal.hidden = true; splitEdit = null; }
    els.splitZones.addEventListener('click', () => { if (splitEdit) { splitEdit.shape = 'zones'; if (!splitEdit.top) splitEdit.top = 2; renderSplitEditor(); } });
    els.splitCols.addEventListener('click', () => { if (splitEdit) { splitEdit.shape = 'columns'; renderSplitEditor(); } });
    els.splitRows.addEventListener('click', () => { if (splitEdit) { splitEdit.shape = 'rows'; renderSplitEditor(); } });
    els.splitMinus.addEventListener('click', () => {
        if (!splitEdit) return;
        if (splitEdit.shape === 'zones') { if (splitEdit.top > 2) { splitEdit.top--; } }
        else if (splitEdit.count > 2) { splitEdit.count--; }
        renderSplitEditor();
    });
    els.splitPlus.addEventListener('click', () => {
        if (!splitEdit) return;
        if (splitEdit.shape === 'zones') { if (splitEdit.top < 8) { splitEdit.top++; } }
        else if (splitEdit.count < 8) { splitEdit.count++; }
        renderSplitEditor();
    });
    els.splitSave.addEventListener('click', () => {
        if (splitEdit) post({
            type: 'saveSplitLayout', name: splitEdit.name, shape: splitEdit.shape,
            count: splitEdit.count, top: splitEdit.top
        });
        closeSplitEditor();
    });
    els.splitCancel.addEventListener('click', closeSplitEditor);
    els.splitModal.addEventListener('click', (e) => {
        if (e.target === els.splitModal) closeSplitEditor(); // click outside the box
    });

    // ---------------- 'Splitters' editor (the runtime divider bars of a SplitPanel) ----------------
    // Each divider bar (GridSplitter) can be styled: thickness on its axis (a vertical divider's
    // Width, a horizontal one's Height), its colour, and whether it is visible at runtime.
    let splitterEdit = null; // { name, rows: [{ direction, thickness, color, visible }] }
    function renderSplitterEditor() {
        const host = els.splitterBody;
        host.innerHTML = '';
        if (!splitterEdit) return;
        const labels = {};
        const cnt = {};
        const rows = splitterEdit.rows || [];
        if (rows.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'modal-hint';
            empty.textContent = 'This split has no divider bars yet.';
            host.appendChild(empty);
            return;
        }
        rows.forEach((row, i) => {
            const key = row.direction;
            cnt[key] = (cnt[key] || 0) + 1;
            const rowEl = document.createElement('div');
            rowEl.className = 'splitter-row';
            const label = document.createElement('div');
            label.className = 'splitter-label';
            label.textContent = (key === 'vertical' ? 'Vertical divider' : 'Horizontal divider')
                + (cnt[key] > 1 ? ' ' + cnt[key] : '');
            label.title = key === 'vertical'
                ? 'Runs between the side-by-side panes; drag left/right to resize them.'
                : 'Runs between the stacked panes; drag up/down to resize them.';
            rowEl.appendChild(label);
            // Thickness
            const thick = document.createElement('label');
            thick.className = 'splitter-field';
            thick.appendChild(document.createTextNode('Thickness '));
            const thickIn = document.createElement('input');
            thickIn.type = 'number'; thickIn.min = '1'; thickIn.step = '1'; thickIn.value = String(row.thickness);
            thickIn.addEventListener('input', () => { row.thickness = thickIn.value; });
            thick.appendChild(thickIn);
            rowEl.appendChild(thick);
            // Colour (native swatch + hex text kept in sync)
            const col = document.createElement('label');
            col.className = 'splitter-field';
            col.appendChild(document.createTextNode('Colour '));
            const colSw = document.createElement('input');
            colSw.type = 'color';
            const colHex = document.createElement('input');
            colHex.type = 'text'; colHex.maxLength = 7;
            // initial swatch from hex (fall back to a grey when the stored colour isn't hex)
            const init = normalizeHex(row.color) || '#B0B0B0';
            colSw.value = init; row.color = init; colHex.value = init;
            colSw.addEventListener('input', () => { const h = normalizeHex(colSw.value); if (h) { row.color = h; colHex.value = h; } });
            colHex.addEventListener('input', () => { const h = normalizeHex(colHex.value); if (h) { row.color = h; colSw.value = h; } });
            col.appendChild(colSw);
            col.appendChild(colHex);
            rowEl.appendChild(col);
            // Visible
            const vis = document.createElement('label');
            vis.className = 'splitter-field splitter-vis';
            const visIn = document.createElement('input');
            visIn.type = 'checkbox';
            visIn.checked = row.visible !== false;
            visIn.addEventListener('change', () => { row.visible = visIn.checked; });
            vis.appendChild(visIn);
            vis.appendChild(document.createTextNode(' Visible'));
            rowEl.appendChild(vis);
            host.appendChild(rowEl);
        });
    }
    function normalizeHex(c) {
        const s = String(c || '').trim();
        return /^#?[0-9a-fA-F]{6}$/.test(s) ? (s.startsWith('#') ? s.toLowerCase() : '#' + s.toLowerCase()) : null;
    }
    function openSplitterEditor(name, splitters) {
        splitterEdit = {
            name: name || null,
            rows: (splitters || []).map((s) => ({
                direction: s.direction === 'horizontal' ? 'horizontal' : 'vertical',
                thickness: String(s.thickness ?? '5'),
                color: normalizeHex(s.color) || '#B0B0B0',
                visible: s.visible !== false
            }))
        };
        els.splitterTitle.textContent = 'Splitters' + (splitterEdit.name ? ' — ' + splitterEdit.name : '');
        renderSplitterEditor();
        els.splitterModal.hidden = false;
    }
    function closeSplitterEditor() { els.splitterModal.hidden = true; splitterEdit = null; }
    els.splitterSave.addEventListener('click', () => {
        if (splitterEdit) {
            post({
                type: 'saveSplitters', name: splitterEdit.name,
                items: splitterEdit.rows.map((r) => ({ direction: r.direction, thickness: r.thickness, color: r.color, visible: r.visible }))
            });
        }
        closeSplitterEditor();
    });
    els.splitterCancel.addEventListener('click', closeSplitterEditor);
    els.splitterModal.addEventListener('click', (e) => {
        if (e.target === els.splitterModal) closeSplitterEditor(); // click outside the box
    });

    // ---------------- 'Rows' / 'Columns' editors (DataGrid decoration) ----------------
    // The DataGrid's row/column decorations are grouped into two small popups. Each value is a
    // direct Avalonia DataGrid attribute written back on Save (unchanged values leave the XAML as
    // it was). Alternating row colours are deliberately absent — Avalonia's DataGrid has no
    // alternation support.
    // The 'Header text font' picker lists every system font the C# host sees (Avalonia
    // FontManager); the list arrives asynchronously in a 'fonts' message. Until then (or if the
    // host is unavailable) a compact default set is offered so the picker is never empty.
    const FONT_FALLBACK = ['Default', 'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Comic Sans MS',
        'Consolas', 'Courier New', 'Georgia', 'Impact', 'Lucida Console', 'Lucida Sans Unicode',
        'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'];
    let systemFonts = [];
    let dgEdit = null; // { name, mode: 'rows'|'cols', values: { fieldKey: value }, fieldEls }
    const DG_FIELDS = {
        rows: [
            { key: 'rowBackground', label: 'Row background', kind: 'color' },
            { key: 'foreground', label: 'Text colour', kind: 'color' },
            { key: 'rowHeight', label: 'Row height (px, empty = auto)', kind: 'number' },
            { key: 'rowHeaderWidth', label: 'Row header width (px, 0 = none)', kind: 'number' },
            { key: 'gridLines', label: 'Grid lines', kind: 'dropdown', options: ['All', 'Horizontal', 'Vertical', 'None'] },
            { key: 'hLine', label: 'Horizontal line colour', kind: 'color' },
            { key: 'vLine', label: 'Vertical line colour', kind: 'color' },
            { key: 'headers', label: 'Headers', kind: 'dropdown', options: ['All', 'Column', 'Row', 'None'] }
        ],
        cols: [
            { key: 'columnWidth', label: 'Column width (Auto / * / px)', kind: 'text' },
            { key: 'minColumnWidth', label: 'Min column width (px)', kind: 'number' },
            { key: 'maxColumnWidth', label: 'Max column width (px, empty = none)', kind: 'number' },
            { key: 'frozenCount', label: 'Frozen columns (pinned left)', kind: 'number' },
            { key: 'headerHeight', label: 'Header height (px, empty = auto)', kind: 'number' },
            { key: 'headerAlign', label: 'Header text alignment', kind: 'dropdown', options: ['Left', 'Center', 'Right'] },
            { key: 'headerColor', label: 'Header text colour', kind: 'color' },
            { key: 'headerFont', label: 'Header text font', kind: 'font' },
            { key: 'headerFontSize', label: 'Header text size (px, empty = theme)', kind: 'number' },
            { key: 'headerBg', label: 'Header background', kind: 'color' }
        ]
    };
    const DG_HINTS = {
        rows: 'Sets how the data rows and the grid around them look. Row height and row-header width are in pixels; leave a number empty to let the theme decide. (Alternating row colours aren\'t offered — Avalonia\'s DataGrid has no built-in support.)',
        cols: 'Sets how wide the columns are and how the column headers look. Column width accepts Auto, * (fill the space), a size like 150 or 2*. The header text settings (alignment, colour, font, size, background) are written as a column-header style.'
    };
    function normalizeColorValue(c) {
        const s = String(c || '').trim();
        if (s === '') return '';
        return /^#?[0-9a-fA-F]{6}$/.test(s) ? (s.startsWith('#') ? s.toLowerCase() : '#' + s.toLowerCase()) : s;
    }
    function renderDataGridEditor() {
        const host = els.dgBody;
        host.innerHTML = '';
        if (!dgEdit) return;
        els.dgTitle.textContent = dgEdit.mode === 'rows' ? 'Rows' : 'Columns';
        els.dgHint.textContent = DG_HINTS[dgEdit.mode];
        dgEdit.fieldEls = {};
        for (const f of DG_FIELDS[dgEdit.mode]) {
            const row = document.createElement('div');
            row.className = 'splitter-row';
            const label = document.createElement('div');
            label.className = 'splitter-label';
            label.textContent = f.label;
            row.appendChild(label);
            const value = String(dgEdit.values[f.key] ?? '');
            if (f.kind === 'dropdown' || f.kind === 'font') {
                // Font pickers list the system fonts (fallback set until the 'fonts' message
                // arrives); the current value is always offered even if it isn't in the list.
                const opts = f.kind === 'font'
                    ? (systemFonts.length ? systemFonts : FONT_FALLBACK)
                    : (f.options || []);
                const sel = document.createElement('select');
                sel.className = 'dg-input';
                if (value && !opts.includes(value)) {
                    const cur = document.createElement('option');
                    cur.value = value; cur.textContent = value; sel.appendChild(cur);
                }
                for (const o of opts) {
                    const opt = document.createElement('option');
                    opt.value = o; opt.textContent = o; sel.appendChild(opt);
                }
                sel.value = value ? value : opts[0];
                sel.addEventListener('change', () => { dgEdit.values[f.key] = sel.value; });
                row.appendChild(sel);
                dgEdit.fieldEls[f.key] = sel;
            } else if (f.kind === 'color') {
                const group = document.createElement('div');
                group.className = 'dg-color';
                const sw = document.createElement('input');
                sw.type = 'color';
                const tx = document.createElement('input');
                tx.type = 'text'; tx.maxLength = 7; tx.className = 'dg-input';
                const init = normalizeColorValue(value);
                sw.value = /^#[0-9a-fA-F]{6}$/.test(init) ? init : '#ffffff';
                tx.value = init;
                const syncTxt = () => { dgEdit.values[f.key] = tx.value; };
                const syncSw = () => { const c = normalizeColorValue(sw.value); dgEdit.values[f.key] = c; tx.value = c; };
                tx.addEventListener('input', syncTxt);
                sw.addEventListener('input', syncSw);
                group.appendChild(sw);
                group.appendChild(tx);
                row.appendChild(group);
                dgEdit.fieldEls[f.key] = tx;
            } else {
                const inp = document.createElement('input');
                inp.type = 'text'; inp.className = 'dg-input';
                inp.value = value;
                inp.addEventListener('input', () => { dgEdit.values[f.key] = inp.value; });
                row.appendChild(inp);
                dgEdit.fieldEls[f.key] = inp;
            }
            host.appendChild(row);
        }
    }
    function openDataGridEditor(mode, name, values) {
        dgEdit = { name: name || null, mode: mode === 'cols' ? 'cols' : 'rows', values: Object.assign({}, values || {}) };
        renderDataGridEditor();
        els.dgModal.hidden = false;
        // First time the Columns editor opens, ask the extension for the real system font list;
        // it replies with a 'fonts' message and the picker is refreshed with every family.
        if (dgEdit.mode === 'cols' && systemFonts.length === 0) post({ type: 'requestFonts' });
    }
    function closeDataGridEditor() { els.dgModal.hidden = true; dgEdit = null; }
    els.dgSave.addEventListener('click', () => {
        if (dgEdit) post({
            type: dgEdit.mode === 'rows' ? 'saveDataGridRows' : 'saveDataGridCols',
            name: dgEdit.name, values: dgEdit.values
        });
        closeDataGridEditor();
    });
    els.dgCancel.addEventListener('click', closeDataGridEditor);
    els.dgModal.addEventListener('click', (e) => {
        if (e.target === els.dgModal) closeDataGridEditor(); // click outside the box
    });

    /* Draw the placeholder labels over every (empty) Menu bar. The dummies are plain HTML overlay
     * chips — NOT canvas controls — so clicks on them never hit control-selection/hit-testing.
     *
     * Patched in place like the control overlays: the old code emptied the host and rebuilt every
     * chip (plus two listeners each) on every frame, so a drag across a form with a menu bar threw
     * away and re-created nodes — and their tooltips — dozens of times a second. The two listeners
     * now live on the host and dispatch from the chip's dataset. */
    const menuNodes = new Map();

    function menuDummy(kind, key) {
        let d = menuNodes.get(key);
        if (!d) {
            d = document.createElement('div');
            menuNodes.set(key, d);
        }
        const cls = kind === 'sep'
            ? 'menu-dummy-sep'
            : 'menu-dummy ' + (kind === 'item' ? 'item' : 'hint');
        if (d.className !== cls) d.className = cls;
        return d;
    }

    function renderMenuDummies() {
        const host = els.menuDummies;
        if (!host) return;
        const order = document.createDocumentFragment();
        const live = new Set();
        const scale = state.scale || 1;
        const put = (node, key, left, top, width, height) => {
            live.add(key);
            setLen(node, 'left', Math.round(left) + 'px');
            setLen(node, 'top', Math.round(top) + 'px');
            setLen(node, 'width', Math.round(width) + 'px');
            setLen(node, 'height', Math.round(height) + 'px');
            order.appendChild(node);
        };
        const mk = (kind, menuName, label, xPx, wPx, topPx, hPx, idx) => {
            const key = menuName + '|' + kind + '|' + (idx == null ? '' : idx);
            const d = menuDummy(kind, key);
            if (d.textContent !== label) d.textContent = label;
            const title = (kind === 'item')
                ? "Edit the '" + label + "' menu items"
                : 'Add a top-level menu item';
            if (d.title !== title) d.title = title;
            if (d.dataset.menu !== menuName) d.dataset.menu = menuName;
            const kindAttr = kind === 'item' ? 'item' : kind;
            if (d.dataset.kind !== kindAttr) d.dataset.kind = kindAttr;
            if (d.dataset.idx !== String(idx == null ? '' : idx)) d.dataset.idx = String(idx == null ? '' : idx);
            put(d, key, xPx, topPx, wPx, hPx);
        };
        if (state.frame && state.frame.menus) {
            for (const c of state.frame.controls) {
                if (!c.name || c.type !== 'Menu') continue;
                const items = state.frame.menus[c.name];
                if (!Array.isArray(items)) continue;
                const top = c.y * scale;
                const h = Math.max(20, c.height * scale);
                if (!items.length) {
                    mk('empty', c.name, '+ Add menu items…', (c.x + 3) * scale, 180 * scale, top, h);
                    continue;
                }
                const EST = 7.3; // approx px per header char at the bar's ~13px font
                let cursor = c.x + 3;
                items.forEach((it, i) => {
                    if (it.kind === 'Space') {
                        // An invisible gap of the space's width (px) between the items on the bar.
                        cursor += (Number(it.width) > 0 ? Number(it.width) : 12);
                        return;
                    }
                    if (it.kind === 'Separator') {
                        const key = c.name + '|sep|' + i;
                        const s = menuDummy('sep', key);
                        put(s, key,
                            (cursor + 5) * scale,
                            (c.y + c.height * 0.25) * scale,
                            1,
                            Math.max(2, Math.round(c.height * 0.5 * scale)));
                        cursor += 12;
                        return;
                    }
                    // A File/Folder Selector row shows its dialog caption; with none set, name the kind
                    // so the bar chip is never blank.
                    const header = it.header
                        || (it.kind === 'FileSelector' ? 'File Selector' : it.kind === 'FolderSelector' ? 'Folder Selector' : '');
                    const w = Math.max(34, header.length * EST + 28);
                    mk('item', c.name, header, cursor * scale, w * scale, top, h, i);
                    cursor += w;
                });
                mk('add', c.name, '+', (cursor + 3) * scale, 26 * scale, top, h);
            }
        }
        host.appendChild(order);
        for (const [key, node] of menuNodes) {
            if (live.has(key)) continue;
            if (node.parentNode) node.parentNode.removeChild(node);
            menuNodes.delete(key);
        }
    }

    // Delegated once instead of two listeners per chip per frame. A chip carries its menu name, its
    // kind and (for an item) its index, so the handlers stay stateless.
    els.menuDummies.addEventListener('pointerdown', (e) => {
        if (e.target && e.target.closest && e.target.closest('.menu-dummy')) {
            e.stopPropagation();
            e.preventDefault();
        }
    });
    els.menuDummies.addEventListener('click', (e) => {
        const chip = e.target && e.target.closest ? e.target.closest('.menu-dummy') : null;
        if (!chip) return;
        e.stopPropagation();
        const menuName = chip.dataset.menu;
        const kind = chip.dataset.kind;
        if (kind === 'item') { openMenuEditor(menuName, Number(chip.dataset.idx)); return; }
        openMenuEditor(menuName);
        if (kind === 'empty') addMenuTopRow(); // empty bar: jump straight to adding the first item
    });

    els.wrap.addEventListener('click', (e) => {
        if (e.target === els.wrap) deselect();
    });

    window.addEventListener('resize', () => {
        if (state.fitted) {
            fit();
            renderOverlays();
            renderSelection();
            renderRulers();
        }
    });

    applyDotGrid(); // initial toolbar state (overlay follows the first frame message)
    applyCrosshair(); // initial crosshair style (the frame message carries the saved settings)
    loadCollapsed(); // restore the Properties sections the user folded last time
    loadToolbarFolds(); // and the toolbar categories they folded away
    applyToolbarFolds(); // apply that state; this also runs the first wrap/separator pass
    // VS Code sizes the webview frame just after load — re-run once the real width is known.
    setTimeout(() => layoutToolbar(), 0);

    // tell the extension the webview is ready (triggers the first render)
    post({ type: 'ready' });
})();
