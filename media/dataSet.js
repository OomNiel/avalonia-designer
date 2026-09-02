/* DataSet designer webview — .adset custom editor.
 * Renders DataSet tables as draggable boxes; right-click menus to add tables /
 * columns; a Properties panel to edit table + column fields (name, header,
 * data type, allow-null). All edits are posted to the extension, which owns the
 * model (source of truth) and re-pushes `state` after every change.
 */
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();

    let spec = null;            // latest spec pushed by the extension
    let controls = [];          // bindable controls in the project: {name,type,bound}
    let selection = null;       // {table} or {table, column} (null = dataset)
    let ctx = { x: 0, y: 0 };   // right-click coordinates

    const $ = (id) => document.getElementById(id);

    // ---------- Post helpers ----------
    function post(msg) { vscode.postMessage(msg); }

    // ---------- Rendering ----------
    function renderCanvas() {
        const canvas = $('canvas');
        canvas.querySelectorAll('.tbl, .empty-hint').forEach((n) => n.remove());
        if (!spec) return;
        if (spec.tables.length === 0) {
            const h = document.createElement('div');
            h.className = 'empty-hint';
            h.textContent = 'Right-click the canvas to add a table.';
            canvas.appendChild(h);
        }
        for (const t of spec.tables) {
            canvas.appendChild(tableEl(t));
        }
    }

    function typeLabel(type) {
        const map = {
            String: 'Text', Int32: 'Integer', Int64: 'Long', Double: 'Double',
            Decimal: 'Decimal', Boolean: 'Boolean', DateTime: 'Date & time',
            Guid: 'Guid', 'Byte[]': 'Byte[]'
        };
        return map[type] || type;
    }

    function tableEl(t) {
        const el = document.createElement('div');
        el.className = 'tbl' + (isSelTable(t.name) ? ' sel' : '');
        el.style.left = (t.x || 40) + 'px';
        el.style.top = (t.y || 40) + 'px';
        el.dataset.name = t.name;

        const head = document.createElement('div');
        head.className = 'tbl-head';
        const title = document.createElement('span');
        title.textContent = t.name;
        const count = document.createElement('span');
        count.className = 'tbl-count';
        count.textContent = t.columns.length + (t.columns.length === 1 ? ' column' : ' columns');
        head.appendChild(title);
        head.appendChild(count);
        el.appendChild(head);

        for (const c of t.columns) {
            const row = document.createElement('div');
            row.className = 'tbl-col' + (isSelColumn(t.name, c.name) ? ' sel' : '');
            row.dataset.table = t.name;
            row.dataset.col = c.name;
            const cap = document.createElement('span');
            cap.className = 'col-cap';
            cap.textContent = c.caption || c.name;
            const tp = document.createElement('span');
            tp.className = 'col-type';
            tp.textContent = typeLabel(c.type);
            row.appendChild(cap);
            row.appendChild(tp);
            el.appendChild(row);
        }

        const add = document.createElement('div');
        add.className = 'tbl-add';
        add.textContent = '＋ Add column';
        add.dataset.table = t.name;
        el.appendChild(add);

        return el;
    }

    function isSelTable(name) {
        return selection && selection.table === name && !selection.column;
    }
    function isSelColumn(table, column) {
        return selection && selection.table === table && selection.column === column;
    }

    // ---------- Selection + Properties panel ----------
    function setSelection(table, column) {
        selection = (table === undefined) ? null : { table, column: column || null };
        renderCanvas();
        renderProps();
    }

    function renderProps() {
        const box = $('props');
        if (!spec) return;
        box.innerHTML = '';
        // The DATASET panel is always visible at the top: dataset name + the
        // bind-to-control dropdown (enabled only while a table is selected on the canvas).
        renderDatasetSection(box);
        if (selection) {
            const t = spec.tables.find((x) => x.name === selection.table);
            if (!t) { selection = null; renderProps(); return; }
            renderTableSection(box, t);
            if (selection.column) {
                const c = t.columns.find((x) => x.name === selection.column);
                if (c) renderColumnSection(box, t, c);
            }
        }
    }

    function field(label, id, desc) {
        const div = document.createElement('div');
        div.className = 'field';
        const l = document.createElement('label');
        l.htmlFor = id;
        l.textContent = label;
        const inner = document.createElement('div');
        inner.id = id;
        div.appendChild(l);
        div.appendChild(inner);
        if (desc) {
            const d = document.createElement('div');
            d.className = 'desc';
            d.textContent = desc;
            div.appendChild(d);
        }
        return div;
    }

    function renderDatasetSection(box) {
        const h = document.createElement('h3');
        h.textContent = 'DATASET';
        box.appendChild(h);

        // DataSet / generated class name
        const f = field('Name', 'ds-name', 'The DataSet / generated class name.');
        const input = document.createElement('input');
        input.type = 'text';
        input.value = spec.name;
        input.addEventListener('change', () => {
            const v = input.value.trim();
            if (v && v !== spec.name) post({ type: 'setName', name: v });
            else input.value = spec.name;
        });
        f.querySelector('#ds-name').appendChild(input);
        box.appendChild(f);

        // Bindable controls dropdown — enabled only while a table is selected on the canvas
        const activeTable = selection && selection.table
            ? spec.tables.find((x) => x.name === selection.table)
            : undefined;
        const enabled = !!activeTable;
        const bf = field('Bind to control', 'ds-bind',
            enabled
                ? 'Pick a control to bind the selected table to. A * marks a control already bound to a dataset.'
                : 'Select a table on the canvas first — the dropdown then binds that table to the control you pick.');
        const sel = document.createElement('select');
        sel.disabled = !enabled;
        const current = activeTable ? (activeTable.boundTo || '') : '';
        const none = document.createElement('option');
        none.value = '';
        none.textContent = '(None)';
        sel.appendChild(none);
        for (const c of (controls || [])) {
            const o = document.createElement('option');
            o.value = c.name;
            o.textContent = c.name + ' (' + c.type + ')' + (c.bound ? ' *' : '');
            // A control already claimed by another table/dataset can't be picked here.
            if (c.bound && c.name !== current) o.disabled = true;
            if (c.name === current) o.selected = true;
            sel.appendChild(o);
        }
        sel.addEventListener('change', () => {
            if (!activeTable) return;
            const v = sel.value;
            if (v === '') {
                if (activeTable.boundTo) post({ type: 'unbind', table: activeTable.name });
            } else if (v !== activeTable.boundTo) {
                post({ type: 'bind', table: activeTable.name, control: v });
            }
        });
        bf.querySelector('#ds-bind').appendChild(sel);
        box.appendChild(bf);

        // Un-bind the selected table when it is currently bound
        if (activeTable && activeTable.boundTo) {
            const ub = document.createElement('div');
            ub.className = 'field';
            const btn = document.createElement('button');
            btn.textContent = 'Un-bind ' + activeTable.name;
            btn.style.cssText = 'background:transparent;color:var(--vscode-errorForeground);border:1px solid var(--vscode-errorForeground);border-radius:3px;padding:5px 10px;cursor:pointer;width:100%;';
            btn.addEventListener('click', () => post({ type: 'unbind', table: activeTable.name }));
            ub.appendChild(btn);
            box.appendChild(ub);
        }
    }

    function renderTableSection(box, t) {
        const h = document.createElement('h3');
        h.textContent = 'Table';
        box.appendChild(h);

        const f = field('Name', 'tbl-name', 'The table name (e.g. Customers).');
        const input = document.createElement('input');
        input.type = 'text';
        input.value = t.name;
        input.addEventListener('change', () => {
            const v = input.value.trim();
            if (v && v !== t.name) post({ type: 'setTableName', oldName: t.name, name: v });
            else input.value = t.name;
        });
        f.querySelector('#tbl-name').appendChild(input);
        box.appendChild(f);

        const btns = document.createElement('div');
        btns.className = 'field';
        const addBtn = document.createElement('button');
        addBtn.textContent = '＋ Add Column';
        addBtn.style.cssText = 'background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;border-radius:3px;padding:5px 10px;cursor:pointer;width:100%;';
        addBtn.addEventListener('click', () => post({ type: 'addColumn', table: t.name }));
        btns.appendChild(addBtn);
        const delBtn = document.createElement('button');
        delBtn.textContent = 'Delete Table';
        delBtn.style.cssText = 'background:transparent;color:var(--vscode-errorForeground);border:1px solid var(--vscode-errorForeground);border-radius:3px;padding:5px 10px;cursor:pointer;width:100%;margin-top:6px;';
        delBtn.addEventListener('click', () => post({ type: 'removeTable', name: t.name }));
        btns.appendChild(delBtn);
        box.appendChild(btns);

        const hint = field('Columns', 'tbl-cols', 'Click a column to edit its fields. Right-click a column to rename/delete it.');
        const p = document.createElement('p');
        p.className = 'none';
        p.textContent = t.columns.length + (t.columns.length === 1 ? ' column' : ' columns');
        hint.querySelector('#tbl-cols').appendChild(p);
        box.appendChild(hint);
    }

    const TYPE_OPTIONS = ['String', 'Int32', 'Int64', 'Double', 'Decimal', 'Boolean', 'DateTime', 'Guid', 'Byte[]'];

    function renderColumnSection(box, t, c) {
        const h = document.createElement('h3');
        h.textContent = 'Column — ' + c.name;
        box.appendChild(h);

        const nf = field('Field name', 'col-name', 'The column name in the DataTable (a code identifier).');
        const nInput = document.createElement('input');
        nInput.type = 'text';
        nInput.value = c.name;
        nInput.addEventListener('change', () => {
            const v = nInput.value.trim();
            if (v && v !== c.name) post({ type: 'setColumnProp', table: t.name, column: c.name, prop: 'name', value: v });
            else nInput.value = c.name;
        });
        nf.querySelector('#col-name').appendChild(nInput);
        box.appendChild(nf);

        const cf = field('Header text (Caption)', 'col-caption', 'The heading shown in a grid for this column.');
        const cInput = document.createElement('input');
        cInput.type = 'text';
        cInput.value = c.caption || '';
        cInput.placeholder = c.name;
        cInput.addEventListener('change', () => {
            post({ type: 'setColumnProp', table: t.name, column: c.name, prop: 'caption', value: cInput.value });
        });
        cf.querySelector('#col-caption').appendChild(cInput);
        box.appendChild(cf);

        const tf = field('Data type', 'col-type', 'What this column stores. Pick the .NET type.');
        const sel = document.createElement('select');
        for (const opt of TYPE_OPTIONS) {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            if (opt === c.type) o.selected = true;
            sel.appendChild(o);
        }
        sel.addEventListener('change', () => post({ type: 'setColumnProp', table: t.name, column: c.name, prop: 'type', value: sel.value }));
        tf.querySelector('#col-type').appendChild(sel);
        box.appendChild(tf);

        const af = field('Allow null', 'col-null', 'Whether this column may be empty (null).');
        const checkWrap = document.createElement('div');
        checkWrap.className = 'check';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = c.allowNull;
        cb.addEventListener('change', () => post({ type: 'setColumnProp', table: t.name, column: c.name, prop: 'allowNull', value: cb.checked }));
        const lab = document.createElement('span');
        lab.textContent = 'Column may be null';
        checkWrap.appendChild(cb);
        checkWrap.appendChild(lab);
        af.querySelector('#col-null').appendChild(checkWrap);
        box.appendChild(af);

        const svf = field('Sample value', 'col-sample', 'Shown in the sample row when this table is bound to a control. Leave blank for an automatic value (e.g. "Sample", 1, True, now).');
        const svInput = document.createElement('input');
        svInput.type = 'text';
        svInput.value = c.sampleValue || '';
        svInput.placeholder = '(auto)';
        svInput.addEventListener('change', () => {
            post({ type: 'setColumnProp', table: t.name, column: c.name, prop: 'sampleValue', value: svInput.value });
        });
        svf.querySelector('#col-sample').appendChild(svInput);
        box.appendChild(svf);

        const btns = document.createElement('div');
        btns.className = 'field';
        const delBtn = document.createElement('button');
        delBtn.textContent = 'Delete Column';
        delBtn.style.cssText = 'background:transparent;color:var(--vscode-errorForeground);border:1px solid var(--vscode-errorForeground);border-radius:3px;padding:5px 10px;cursor:pointer;width:100%;';
        delBtn.addEventListener('click', () => post({ type: 'removeColumn', table: t.name, column: c.name }));
        btns.appendChild(delBtn);
        box.appendChild(btns);
    }

    // ---------- Drag tables ----------
    // `t` must be a LIVE node in the DOM. The drag origin comes from the node's own
    // style.left/top (what we set when rendering) — not offsetLeft, which is 0 for a
    // detached/just-rebuilt node.
    function startDrag(t, sx, sy) {
        let moved = false;
        const origX = parseFloat(t.style.left) || 0;
        const origY = parseFloat(t.style.top) || 0;
        const onMove = (e) => {
            const nx = Math.max(0, origX + (e.clientX - sx));
            const ny = Math.max(0, origY + (e.clientY - sy));
            t.style.left = nx + 'px';
            t.style.top = ny + 'px';
            moved = true;
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            if (moved) {
                post({ type: 'moveTable', name: t.dataset.name, x: parseInt(t.style.left, 10), y: parseInt(t.style.top, 10) });
            }
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }

    // ---------- Context menu ----------
    function showMenu(items) {
        const menu = $('ctxmenu');
        menu.innerHTML = '';
        for (const item of items) {
            if (item === '-') {
                const s = document.createElement('div');
                s.className = 'sep';
                menu.appendChild(s);
                continue;
            }
            const mi = document.createElement('div');
            mi.className = 'mi';
            mi.textContent = item.label;
            mi.addEventListener('click', () => { hideMenu(); item.action(); });
            menu.appendChild(mi);
        }
        menu.style.display = 'block';
        const r = menu.getBoundingClientRect();
        menu.style.left = Math.min(ctx.x, window.innerWidth - r.width - 4) + 'px';
        menu.style.top = Math.min(ctx.y, window.innerHeight - r.height - 4) + 'px';
    }
    function hideMenu() { $('ctxmenu').style.display = 'none'; }

    // ---------- Events ----------
    window.addEventListener('message', (ev) => {
        const msg = ev.data;
        if (!msg) return;
        if (msg.type === 'state') {
            spec = msg.spec;
            controls = msg.controls || [];
            if (selection) {
                const t = spec.tables.find((x) => x.name === selection.table);
                if (!t) selection = null;
                else if (selection.column && !t.columns.find((c) => c.name === selection.column)) selection.column = null;
            }
            $('ds-name-input') && ($('ds-name-input').value = spec.name);
            renderCanvas();
            renderProps();
        } else if (msg.type === 'status') {
            $('status').textContent = msg.message || '';
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        $('canvas').addEventListener('click', (e) => {
            const tbl = e.target.closest('.tbl');
            const col = e.target.closest('.tbl-col');
            const addRow = e.target.closest('.tbl-add');
            if (addRow) {
                post({ type: 'addColumn', table: addRow.dataset.table });
                return;
            }
            if (col) {
                setSelection(col.dataset.table, col.dataset.col);
                return;
            }
            if (tbl) {
                setSelection(tbl.dataset.name, null);
                return;
            }
            setSelection(undefined, undefined); // deselect
        });

        $('canvas').addEventListener('pointerdown', (e) => {
            const head = e.target.closest('.tbl-head');
            if (head && e.button === 0) {
                e.preventDefault();
                const name = head.closest('.tbl').dataset.name;
                const sx = e.clientX, sy = e.clientY;
                // Selecting re-renders the canvas (rebuilding every table node), so grab
                // the FRESH node by name afterwards — never drag the stale/detached one.
                setSelection(name, null);
                const fresh = document.querySelector('.tbl[data-name="' + CSS.escape(name) + '"]');
                if (fresh) startDrag(fresh, sx, sy);
            }
        });

        $('canvas').addEventListener('contextmenu', (e) => {
            e.preventDefault();
            ctx.x = e.clientX; ctx.y = e.clientY;
            const tbl = e.target.closest('.tbl');
            const col = e.target.closest('.tbl-col');
            if (col) {
                const t = spec.tables.find((x) => x.name === col.dataset.table);
                const c = t && t.columns.find((x) => x.name === col.dataset.col);
                if (t && c) {
                    setSelection(t.name, c.name);
                    showMenu([
                        { label: 'Rename column…', action: () => renamePrompt('Rename column', c.name, (v) => post({ type: 'setColumnProp', table: t.name, column: c.name, prop: 'name', value: v })) },
                        { label: 'Add column', action: () => post({ type: 'addColumn', table: t.name }) },
                        '-',
                        { label: 'Delete column', action: () => post({ type: 'removeColumn', table: t.name, column: c.name }) }
                    ]);
                }
                return;
            }
            if (tbl) {
                const t = spec.tables.find((x) => x.name === tbl.dataset.name);
                if (t) {
                    setSelection(t.name, null);
                    showMenu([
                        { label: 'Add column', action: () => post({ type: 'addColumn', table: t.name }) },
                        { label: 'Rename table…', action: () => renamePrompt('Rename table', t.name, (v) => post({ type: 'setTableName', oldName: t.name, name: v })) },
                        '-',
                        { label: 'Delete table', action: () => post({ type: 'removeTable', name: t.name }) }
                    ]);
                }
                return;
            }
            // empty canvas
            showMenu([
                { label: 'Add table here', action: () => post({ type: 'addTable', x: e.offsetX, y: e.offsetY }) }
            ]);
        });

        document.addEventListener('click', (e) => {
            if (!$('ctxmenu').contains(e.target)) hideMenu();
        });
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hideMenu();
            // Undo / Redo (5 levels, handled by the extension): Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y.
            if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                const k = e.key.toLowerCase();
                const t = e.target;
                const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
                if (typing) return;
                if (k === 'z') {
                    e.preventDefault();
                    post({ type: e.shiftKey ? 'redo' : 'undo' });
                } else if (k === 'y') {
                    e.preventDefault();
                    post({ type: 'redo' });
                }
            }
        });

        $('btnAddTable').addEventListener('click', () => {
            post({ type: 'addTable', x: 40 + (spec ? spec.tables.length * 12 : 0), y: 40 + (spec ? spec.tables.length * 12 : 0) });
        });
        $('btnGenerate').addEventListener('click', () => post({ type: 'generate' }));

        // Toolbar dataset-name field: change the DataSet / generated class name.
        $('ds-name-input').addEventListener('change', () => {
            const v = $('ds-name-input').value.trim();
            if (v && v !== spec.name) post({ type: 'setName', name: v });
            else $('ds-name-input').value = spec.name;
        });

        vscode.postMessage({ type: 'ready' });
    });

    function renamePrompt(title, current, submit) {
        const v = window.prompt(title, current);
        if (v && v.trim() && v.trim() !== current) submit(v.trim());
    }
})();
