/* global acquireVsCodeApi */
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const $ = (id) => document.getElementById(id);

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
        btnNewForm: $('btnNewForm'),
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
        multiSel: $('multiSel'),
        marquee: $('marquee'),
        radiusGuide: $('radiusGuide'),
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
        ctxDelete: $('ctxDelete'),
        ctxCut: $('ctxCut'),
        ctxCopy: $('ctxCopy'),
        ctxPaste: $('ctxPaste'),
        ctxMoveToContainer: $('ctxMoveToContainer'),
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
        scale: 1,
        fitted: false,
        selected: null, // { name: string|null }
        designW: 800,
        designH: 450,
        lastFitSize: null,
        pendingTag: null,
        showAdvanced: false,
        helpOpen: true,
        lastProps: null,
        clipboard: false,
        controlListKey: null,
        recell: null, // { gridName, cells: { v: [], h: [] } } when the selected control is a Grid child
        dotGrid: { enabled: true, snap: false, spacingX: 16, spacingY: 16, color: '#9db4d0', dotSize: 1.5 },
        // Crosshair look/length: mode 'short'|'long', shortLength px (Short cross total), line
        // thickness px, opacity %, line colour. The outline colour is auto-derived for contrast.
        crosshair: { mode: 'short', shortLength: 50, thickness: 1, opacity: 100, color: '#ff4d4d' },
        // All currently selected control names (multi-select). state.selected stays the ANCHOR
        // (the first-selected control that edge-alignment aligns everything else to).
        multi: new Set()
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
                    n.style.top = css + 'px';
                    n.style.left = '14px';
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
    function applyFrame(msg) {
        const sizeChanged = state.designW !== (msg.width || 800) || state.designH !== (msg.height || 450);
        state.frame = msg;
        state.designW = msg.width || 800;
        state.designH = msg.height || 450;
        if (msg.png) els.img.src = 'data:image/png;base64,' + msg.png;
        if (msg.dotGrid) state.dotGrid = msg.dotGrid;
        applyDotGrid();
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
        const byName = new Map();
        for (const c of state.frame.controls) if (c.name) byName.set(c.name, c);
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
    function renderOverlays() {
        els.overlay.innerHTML = '';
        if (!state.frame) return;
        for (const c of state.frame.controls) {
            if (!c.name) continue;
            const d = document.createElement('div');
            d.className = 'ov';
            d.style.left = (c.x * state.scale) + 'px';
            d.style.top = (c.y * state.scale) + 'px';
            d.style.width = (c.width * state.scale) + 'px';
            d.style.height = (c.height * state.scale) + 'px';
            d.dataset.name = c.name;
            els.overlay.appendChild(d);
        }
    }

    // ---------------- selection (single + multi) ----------------
    /** All currently selected control names (the anchor is state.selected.name). */
    function selectionNames() {
        return state.multi && state.multi.size
            ? [...state.multi]
            : (state.selected && state.selected.name ? [state.selected.name] : []);
    }

    // Sets the whole selection: `anchor` is the first-selected control alignment aligns to.
    function setSelection(anchor, names) {
        state.multi = new Set(names && names.length ? names : []);
        state.selected = { name: anchor };
        if (state.selected.name) {
            const hit = state.frame && state.frame.controls.find((c) => c.name === anchor);
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
        post({ type: 'select', name: anchor });
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
            const ancCtrl = anc && state.frame ? state.frame.controls.find((c) => c.name === anc) : null;
            if (ancCtrl && ancCtrl.parent && state.frame && state.frame.gridCells && state.frame.gridCells[ancCtrl.parent]) {
                state.recell = { gridName: ancCtrl.parent, cells: state.frame.gridCells[ancCtrl.parent] };
            } else {
                state.recell = null;
            }
            hideCellHighlight();
            renderSelection();
            post({ type: 'select', name: state.selected ? state.selected.name : null });
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
        return !!(state.frame && state.frame.controls.some((x) => x.name === name && x.locked));
    }

    // Draws the (lighter) selection outline for the NON-anchor selected controls; the anchor keeps
    // the full box + resize handles. Also refreshes the alignment toolbar buttons' enabled state.
    function renderMultiOutlines() {
        els.multiSel.innerHTML = '';
        if (!state.frame || !state.selected || !state.selected.name) return;
        for (const n of selectionNames()) {
            if (n === state.selected.name) continue;
            const c = state.frame.controls.find((x) => x.name === n);
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
            const c = state.frame.controls.find((x) => x.name === n);
            return c && TEXT_ALIGN_TAGS.has(c.type);
        });
        els.btnAlignText.disabled = !hasText;
        // 'Make same Width/Height' needs >=2 selected AND at least one NON-anchor control that can
        // take a size. A Line's size is its Start/End geometry (it has no Width/Height), so Lines
        // are excluded from sizing (and the anchor is never modified).
        const anchorName = state.selected ? state.selected.name : null;
        const hasSizableTarget = multi && state.frame && names.some((n) => {
            if (n === anchorName) return false;
            const c = state.frame.controls.find((x) => x.name === n);
            return c && c.type !== 'Line';
        });
        els.btnSameWidth.disabled = !hasSizableTarget;
        els.btnSameHeight.disabled = !hasSizableTarget;
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
        const c = state.frame.controls.find((x) => x.name === state.selected.name);
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
        // position are not user-editable.
        s.innerHTML = c.locked
            ? '<div class="lock-badge" title="Locked (Body / root panel) — fills the form">🔒</div>'
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
        const c = state.frame.controls.find((x) => x.name === name);
        if (c) select(c);
    });

    // Right-click on the control list dropdown → context menu to delete the
    // selected control (and clean up its code-behind references).
    els.controlList.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const name = els.controlList.value;
        if (!name || !state.frame) return;
        const c = state.frame.controls.find((x) => x.name === name);
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
        const t = e.target;
        // Shape drag-point handles (a Line's two ends / an Arc's centre + two ends): dragging the
        // point itself edits the shape — a Line end moves with the other end anchored; an Arc end
        // rotates around the centre with the other end anchored; the Arc CENTRE sets the radius.
        if (t.classList && t.classList.contains('shape-handle')) {
            e.preventDefault();
            e.stopPropagation();
            const p0 = toDesign(e.clientX, e.clientY);
            const selName = state.selected ? state.selected.name : null;
            const ctrl = selName && state.frame ? state.frame.controls.find((x) => x.name === selName) : null;
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
        if (!state.pendingTag && !grabbingHandle && (!hit0 || hit0.locked)) {
            drag = { mode: 'marquee', sx: e.clientX, sy: e.clientY, x0: p0.x, y0: p0.y };
            els.canvas.setPointerCapture(e.pointerId);
            return;
        }
        const sel = state.selected;
        if (!sel || !state.frame) return;
        const c = state.frame.controls.find((x) => x.name === sel.name);
        if (!c) return;
        if (c.locked) return; // the Body design surface can't be moved or resized
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
            const c = state.frame.controls.find((x) => x.name === drag.name);
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
        const c = state.frame.controls.find((x) => x.name === drag.name);
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
        const r = els.canvas.getBoundingClientRect();
        const anchor = crosshairPoint(e, r);
        if (anchor) { drawCrosshair(anchor.x, anchor.y); return; }
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

    // Middle-mouse-button click on a control -> wire the default event and open the
    // code-behind at the handler (this replaced the old double-click action). Handled on
    // mousedown (button 1) so it works even where the browser suppresses the auxclick
    // event, and preventDefault stops the middle-click auto-scroll / paste.
    els.canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 1) return; // middle button only (right-click shows the context menu)
        e.preventDefault();
        const p = toDesign(e.clientX, e.clientY);
        const hit = hitTest(p.x, p.y);
        if (hit && hit.name) {
            select(hit);
            post({ type: 'openEvent', name: hit.name });
        }
    });

    // ---------------- drag & drop from toolbox ----------------
    let dropTarget = null;
    function highlightDrop(hit) {
        if (dropTarget === hit) return;
        dropTarget = hit;
        const ovs = els.overlay.querySelectorAll('.ov.drop');
        ovs.forEach((o) => o.classList.remove('drop'));
        if (!hit) return;
        const d = els.overlay.querySelector('.ov[data-name="' + hit.name + '"]');
        if (d) d.classList.add('drop');
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
        els.ctxDelete.disabled = !hasSel || locked;
        els.ctxPaste.disabled = !state.clipboard;
        els.contextMenu.hidden = false;
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
    els.contextMenu.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('click', hideContextMenu);
    window.addEventListener('resize', hideContextMenu);
    els.wrap.addEventListener('scroll', hideContextMenu, true);

    // Esc cancels an armed toolbox tool; Ctrl+X/C/V cut/copy/paste; Delete removes.
    document.addEventListener('keydown', (e) => {
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

    function renderProperties(msg) {
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
        state.lastProps = { name: msg.name, properties: msg.properties, info: msg.info, tabItems: msg.tabItems, listItems: msg.listItems };
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
        if (msg.name !== undefined) {
            state.selected = { name: msg.name };
            renderSelection();
        }
        // Text-input handler for TabItem rows (posts setTabItemProperty with debounce)
        const onTiText = (el) => {
            let timer = null;
            el.addEventListener('input', () => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    post({ type: 'setTabItemProperty', name: msg.name, itemName: el.dataset.tabitem, key: el.dataset.tiprop, value: el.value });
                }, 400);
            });
        };
        // Text-input handler for ListBoxItem rows (posts setListItemProperty with debounce)
        const onLiText = (el) => {
            let timer = null;
            el.addEventListener('input', () => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    post({ type: 'setListItemProperty', name: msg.name, itemName: el.dataset.listitem, key: 'Content', value: el.value });
                }, 400);
            });
        };
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
            const onText = (el) => {
                let timer = null;
                el.addEventListener('input', () => {
                    clearTimeout(timer);
                    timer = setTimeout(() => {
                        post({ type: 'setProperty', name: msg.name, key: p.key, value: el.value });
                    }, 400);
                });
            };

            if (p.kind === 'dropdown' || p.kind === 'font') {
                const sel = document.createElement('select');
                sel.dataset.propKey = p.key;
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
                    post({ type: 'setProperty', name: msg.name, key: p.key, value: sel.value });
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
                    post({ type: 'setProperty', name: msg.name, key: p.key, value: swatch.value });
                });
                onText(text);
                // Palette button — opens the full colour list. (A <datalist> on the text box was
                // dropped because the browser filters datalist options by the typed value, so the
                // dropdown appeared to list only the current colour.)
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
                wrap.appendChild(swatch);
                wrap.appendChild(text);
                wrap.appendChild(palBtn);
                control = wrap;
                focusTarget = text;
            } else if (p.kind === 'margin') {
                control = document.createElement('input');
                control.type = 'text';
                control.dataset.propKey = p.key;
                control.value = p.value || '';
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
                });
                control = btn;
            } else if (p.kind === 'file') {
                // A file-path property (Image Source, Window Icon, Title Bar Icon): a text field
                // (you can still type a path/avares:// URI) + a "Browse…" button that opens the
                // system file picker. The picked file is bundled into the project's Assets\ folder.
                const wrap = document.createElement('div');
                wrap.className = 'prop-input-group';
                const ftxt = document.createElement('input');
                ftxt.type = 'text';
                ftxt.dataset.propKey = p.key;
                ftxt.value = p.value || '';
                onText(ftxt);
                const fbtn = document.createElement('button');
                fbtn.type = 'button';
                fbtn.className = 'prop-browse';
                fbtn.textContent = '…';
                fbtn.title = 'Browse for a file…';
                fbtn.addEventListener('click', () => post({ type: 'browseFile', name: msg.name, key: p.key }));
                wrap.appendChild(ftxt);
                wrap.appendChild(fbtn);
                control = wrap;
                focusTarget = ftxt;
            } else if (p.key === 'ItemsSource') {
                // Items Source: a text field (you can still type a binding/asset manually) + a
                // "…" button that opens the asset picker (code collections + DataSet tables).
                // Read-only when the binding lives in code-behind (a DataSet table or a picked
                // asset) — those are managed via the picker (or the DataSet designer).
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
                ibtn.title = 'Pick a collection / DataSet table to bind…';
                ibtn.disabled = !!p.readOnly;
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
                // 'Undo-Redo' commits on blur/Enter (not per keystroke) — it writes the .adset
                // and regenerates the DataSet class, so it must not fire on every digit.
                if (p.key === 'UndoRedoDepth') {
                    num.addEventListener('change', () => {
                        post({ type: 'setProperty', name: msg.name, key: p.key, value: num.value });
                    });
                } else {
                    onText(num);
                }
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
                if (p.key === '__type__') control.disabled = true;
                if (p.key === '__name__') {
                    // Renaming commits when the field loses focus (or Enter is pressed): the
                    // control is renamed and its generated code-behind handlers are refactored
                    // in one step, rather than on every keystroke.
                    control.addEventListener('change', () => {
                        post({ type: 'setProperty', name: msg.name, key: '__name__', value: control.value });
                    });
                    control.addEventListener('keydown', (ev) => {
                        if (ev.key === 'Enter') control.blur();
                    });
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
                focusTarget.focus();
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
            els.propsBody.appendChild(section);
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
                break;
            case 'selectControl': {
                if (state.frame) {
                    const c = state.frame.controls.find((x) => x.name === msg.name);
                    if (c) select(c);
                }
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
            default:
                break;
        }
    });

    // ---------------- toolbar ----------------
    els.btnNewForm.addEventListener('click', () => post({ type: 'openNewForm' }));
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
        }
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

    // tell the extension the webview is ready (triggers the first render)
    post({ type: 'ready' });
})();
