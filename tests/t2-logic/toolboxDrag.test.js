/* T2 — the toolbox → canvas drag pipeline, in the extension half.
 *
 * The webview half is covered by t3 (a real `drop` with an empty dataTransfer, and the drop-free fallback
 * when the release never arrives). This file covers the wiring between the two, which is where the whole
 * feature was broken and where nothing looked:
 *
 *   VS Code does not bridge the MIME types a `TreeDragAndDropController.handleDrag` adds into a webview
 *   ("Mime types added in handleDrag won't be available outside the application"), so the control's tag
 *   cannot travel in the drag's dataTransfer. It travels on the `armTool` webview message instead — the
 *   channel click-to-place already uses — and that means three files must agree:
 *
 *     toolboxProvider.handleDrag  →  armDesignerTool  →  extension.ts  →  armToolInActiveDesigner
 *                                  →  postMessage({ type: 'armTool', tag, from: 'drag' })
 *
 * Reported 2026-09-26: "Drag-and-drop still not working" on a VS Code running with
 * `--ozone-platform=wayland`. The pipeline is now logged end to end (the extension's Output channel, and
 * `webviewLog` lines from the webview), so the next report can say WHICH stage died instead of guessing:
 * no arm at all, an arm that never arrived, dragover arriving while the drop is swallowed, or a drop that
 * arrives with no tag.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

module.exports = async (t) => {
    t.section('T2: toolbox drag → armTool → canvas drop (the extension half)');

    const toolbox = read('src/toolboxProvider.ts');
    const extension = read('src/extension.ts');
    const panel = read('src/designerPanel.ts');
    const webview = read('media/designer.js');

    // ---------------------------------------------------------------- the drag source arms the designer
    t.ok(/dragMimeTypes[^=]*=\s*\['application\/x-avalonia-control'\]/.test(toolbox), 'source',
        'the toolbox still declares a drag MIME type — it is the only thing that makes an item draggable, '
        + 'even though the webview can never read it');
    const dragIdx = toolbox.indexOf('handleDrag');
    const armIdx = toolbox.indexOf('this.armDesignerTool?.(first.def.tag)');
    t.ok(dragIdx >= 0 && armIdx > dragIdx && armIdx - dragIdx < 2000, 'source',
        'handleDrag (the drag-START hook) arms the tool with the row\'s tag');
    t.ok(/armDesignerTool: \(\(tag: string\) => void\) \| undefined/.test(toolbox), 'source',
        'on a public, optional hook, because extension.ts wires it after both providers exist');

    // …and extension.ts wires that hook to the drag variant of the arm
    t.ok(/toolbox\.armDesignerTool = \(tag: string\) => provider\.armToolInActiveDesigner\(tag, 'drag'\)/.test(extension),
        'wiring', 'extension.ts wires the hook, and marks it as a DRAG arm (the click path stays a click)');

    // ---------------------------------------------------------------- the arm is posted, and logged
    t.ok(/armToolInActiveDesigner\(tag: string, from: 'click' \| 'drag' = 'click'\)/.test(panel), 'arm',
        'armToolInActiveDesigner takes the source of the arm');
    t.ok(/postMessage\(\{ type: 'armTool', tag, from \}\)/.test(panel), 'arm',
        'and posts it as `from`, so the webview knows whether a click or a drag is waiting to complete');
    t.ok(/anyDesignerPanel\(\)/.test(panel) && /this\.panels\.values\(\)/.test(panel), 'arm',
        'with a fallback to any OPEN designer — a tab that never reported itself focused must not eat the arm');
    // The logging is the point of the exercise: a silent arm failure and a lost native drop look identical.
    t.ok(/log\(`toolbox \$\{from\}: armTool \$\{posted \? 'posted' : 'NOT delivered/.test(panel), 'arm',
        'the extension logs whether the arm really went out (a silent failure here is indistinguishable '
        + 'from a swallowed drop)');
    t.ok(/case 'webviewLog'/.test(panel) && /log\('webview: '/.test(panel), 'arm',
        'and the webview can log into the same channel, so one Output channel holds the whole story');

    // ---------------------------------------------------------------- the webview completes a lost drop
    t.ok(/DROP_QUIET_MS/.test(webview) && /function placeFromQuietDrag/.test(webview), 'webview',
        'the webview can complete a drag whose drop event never arrived');
    t.ok(/function armDropQuietTimer[\s\S]{0,400}?!state\.pendingTag \|\| !state\.dragArmed[\s\S]{0,80}?return/.test(webview),
        'webview', 'the fallback only runs for a DRAG-armed tool (Esc/changing your mind stays possible)');
    t.ok(/dragQuietTimer[\s\S]{0,300}?placeFromQuietDrag/.test(webview), 'webview',
        'it fires from the dragover stream going quiet — the one signal that works when the drop is swallowed');
    t.ok(/'drop'[\s\S]{0,900}?cancelDropQuietTimer\(\)/.test(webview), 'webview',
        'a real drop cancels the timer, so the fallback can never place a second control');
    t.ok(/state\.dragArmed = msg\.from === 'drag'/.test(webview), 'webview',
        'the arm message is what marks the arming as a drag');
    t.ok(/Release the drag on the canvas to place a/.test(webview), 'webview',
        'the status says "release" for a drag and "click" for a click — so a user can SEE the arm arrive, '
        + 'which is how the two failure modes are told apart in a report');

    // ---------------------------------------------------------------- the reason, in the code
    t.ok(/Mime types added in handleDrag won't be available outside the application/.test(webview)
        || /handleDrag won't be available outside the application/.test(toolbox), 'why',
        'the reason is written down where the next reader will hit it');
};
