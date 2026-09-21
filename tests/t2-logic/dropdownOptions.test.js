/* T2 — the webview's dropdown helper, and the option lists it is given.
 *
 * Red-first for the bug the user reported three times (2026-09-21): the Data Selector's "Data source"
 * dropdown displayed the letters **"p"** and **"a"**. Cause: the option constants in `media/designer.js`
 * are `[value, label]` PAIRS, and the Data Selector was handed a plain string array — so `pair[0]` and
 * `pair[1]` were read off the STRING, giving value 'S' with the label 'p' (and value 'D' labelled 'a').
 * Nothing failed, nothing logged: the dialog simply showed a letter where a word should be.
 *
 * Every claim here is about what the user SEES, so this file runs the real `labelledSelect` (extracted
 * from `media/designer.js`, not copied) against a tiny stand-in DOM, and reads the option list back.
 * It also pins the convention itself for the other dropdowns in that file, and the fact that the Data
 * Selector's labels are the words, not the raw enum names.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const WEB = path.join(ROOT, 'media', 'designer.js');
const source = fs.readFileSync(WEB, 'utf8');

/** The real `function labelledSelect(…) { … }` body, lifted out of the webview script by brace count. */
function extractFunction(name) {
    const start = source.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`${name} not found in media/designer.js`);
    let depth = 0;
    for (let i = source.indexOf('{', start); i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            depth--;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error(`${name} has unbalanced braces`);
}

/** The value `const <name> = …;` is bound to in the webview script (multi-line declarations too). */
function optionListFor(variable) {
    const at = source.indexOf(`const ${variable} =`);
    if (at < 0) throw new Error(`${variable} not found in media/designer.js`);
    const from = source.indexOf('=', at) + 1;
    let depth = 0;
    for (let i = from; i < source.length; i++) {
        const ch = source[i];
        if (ch === '[' || ch === '{' || ch === '(') depth++;
        else if (ch === ']' || ch === '}' || ch === ')') depth--;
        else if (ch === ';' && depth === 0) {
            // eslint-disable-next-line no-new-func
            return new Function(`return ${source.slice(from, i)};`)();
        }
    }
    throw new Error(`${variable} has no terminating semicolon`);
}

/** Stand-in element: only the handful of members labelledSelect touches. */
function fakeDom() {
    return {
        createElement(tag) {
            return {
                tag,
                value: '',
                textContent: '',
                children: [],
                appendChild(child) { this.children.push(child); return child; },
                addEventListener() { /* the test never fires a change */ }
            };
        }
    };
}

/** Runs the real helper over a list and returns [{ value, label }]. */
function options(list, value) {
    const document = fakeDom();
    // eslint-disable-next-line no-new-func
    const labelledSelect = new Function('document', `${extractFunction('labelledSelect')}; return labelledSelect;`)(document);
    const sel = labelledSelect(list, value, () => { });
    return sel.children.map((o) => ({ value: o.value, label: o.textContent }));
}

module.exports = async (t) => {
    t.section('T2: webview dropdown options');

    // ---------------------------------------------------------------- the reported bug
    const sourceOptions = optionListFor('DATA_SOURCE_OPTIONS');
    const rendered = options(sourceOptions, 'Spreadsheet');
    t.equal(rendered.map((o) => o.label).join(','), 'Spreadsheet,Data Files', 'data source',
        'the Data source dropdown shows WORDS, not letters');
    t.equal(rendered.map((o) => o.value).join(','), 'Spreadsheet,DataFiles', 'data source',
        'while the values written to the form stay the enum names');
    t.ok(rendered.length === 2 && sourceOptions.every((p) => Array.isArray(p)), 'data source',
        'and the list is [value, label] pairs — the shape the helper reads');

    // The helper must also survive a caller that hands it plain strings (the mistake that caused it):
    // a string means "the word is its own label".
    const plain = options(['Spreadsheet', 'DataFiles'], 'DataFiles');
    t.equal(plain.map((o) => o.label).join(','), 'Spreadsheet,DataFiles', 'data source',
        'a plain string list still renders whole words (the helper normalises it)');
    t.equal(plain.map((o) => o.value).join(','), 'Spreadsheet,DataFiles', 'data source',
        'with the string as its own value');
    t.ok(/typeof raw === 'string'/.test(extractFunction('labelledSelect')), 'data source',
        'so the guard is IN the helper, where the next caller inherits it');

    // An unknown value must fall back to the first option, not to an empty select.
    t.equal(options(sourceOptions, 'Nonsense')[0].value, 'Spreadsheet', 'data source',
        'an unknown source kind falls back to the first option');

    // ---------------------------------------------------------------- the convention, file-wide
    for (const name of ['CURSOR_ORIENTATIONS', 'READOUT_POSITIONS']) {
        const list = optionListFor(name);
        t.ok(Array.isArray(list) && list.every((p) => Array.isArray(p) && p.length === 2), 'convention',
            `${name} is [value, label] pairs too (that is why the plain array was wrong)`);
        const rows = options(list, list[0][0]);
        t.equal(rows.length, list.length, 'convention', `${name} renders every option`);
        t.ok(rows.every((o) => o.label.length > 1), 'convention',
            `${name} labels are words, not single characters`);
    }
    t.ok(!/DATA_SOURCE_KINDS/.test(source), 'convention',
        'the webview constant is named DATA_SOURCE_OPTIONS (the TS model keeps its own DATA_SOURCE_KINDS)');

    // ---------------------------------------------------------------- the editor really uses it
    t.ok(/labelledSelect\(DATA_SOURCE_OPTIONS, dataEdit\.kind/.test(source), 'wiring',
        'the Data Selector builds its dropdown from that list');
    t.ok(/DATA_SOURCE_OPTIONS\.some\(\(pair\) => pair\[0\] === info\.kind\)/.test(source), 'wiring',
        'and validates the chart\'s kind against the same pairs');
};
