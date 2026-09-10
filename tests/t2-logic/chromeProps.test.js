/* T2 — ChromeWindow (custom title bar) properties are reachable & pinned:
 * TitleBarTitle / TitleBarIcon / TitleBarHeight appear on the form root and sit ABOVE the generic
 * Window props; TitleBarHeight defaults to 44 and reflects a set value. */
'use strict';
const { XamlModel } = require('../../out/xamlModel.js');
const { propertyDefsFor, DEFAULTS } = require('../../out/propertyCatalog.js');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"';

module.exports = async (t) => {
    t.section('ChromeWindow (custom title bar) properties');

    const m = new XamlModel(`<Window ${NS} Width="800" Height="450"><DockPanel Name="Body"/></Window>`);
    t.equal(m.convertRootToChromeWindow('My Window'), true, 'convert', 'Window converts to ChromeWindow');
    t.equal(m.root.tagName, 'chrome:ChromeWindow', 'convert', 'root is chrome:ChromeWindow');

    const props = propertyDefsFor(m.root);
    const idx = (k) => props.findIndex((p) => p.key === k);
    t.ok(idx('TitleBarTitle') >= 0, 'chrome', 'Title Bar Text row present');
    t.ok(idx('TitleBarIcon') >= 0, 'chrome', 'Title Bar Icon row present');
    t.ok(idx('TitleBarHeight') >= 0, 'chrome', 'Title Bar Height row present');
    // Pinned ABOVE the generic Window props (Title etc.).
    t.ok(idx('TitleBarTitle') < idx('Title') && idx('TitleBarIcon') < idx('Title') && idx('TitleBarHeight') < idx('Title'),
        'chrome', 'chrome rows sit above the Window Title prop');
    const h = props.find((p) => p.key === 'TitleBarHeight');
    t.equal(h.kind, 'number', 'chrome', 'Title Bar Height is a number field');
    t.equal(h.value, String(DEFAULTS.TitleBarHeight ?? '44'), 'chrome', 'Title Bar Height defaults to 44 when unset');

    // A set TitleBarHeight is reflected back.
    m.root.setAttribute('TitleBarHeight', '60');
    const h2 = propertyDefsFor(m.root).find((p) => p.key === 'TitleBarHeight');
    t.equal(h2.value, '60', 'chrome', 'set Title Bar Height reflected');
};
