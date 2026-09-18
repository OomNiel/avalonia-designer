/* T2 — the AI prompt that is typed in the editor, between two marker comments (asked 2026-09-18).
 *
 * WHY THIS FILE EXISTS. *"place the prompt input box next to the current cursor position and make the prompt
 * entry box a multi-line (at least 5 lines) input area"*. Neither is possible with `showInputBox` — it is
 * single-line by design (see `InputBoxOptions`) and VS Code pins it to the top of the window — and the Comments
 * API cannot do it either: a `CommentThread` has `canReply` but no readable input. So the editor is the input:
 * `AI: Implement in Function…` inserts a marker block at the caret, the user writes as many lines as they like,
 * and one code lens sends it (or throws it away).
 *
 * The parsing is pure, so the properties that matter are pinned here rather than by a screenshot: a block is
 * found whatever the comment prefix, a prompt with code in it survives verbatim, a broken block says *which*
 * marker is missing, and — the one that must never regress — **what was inserted is removed exactly**, so a
 * prompt can never quietly become a comment in someone's source.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const prompt = require('../../out/aiPrompt.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = JSON.parse(read('package.json'));

/**
 * The document with the snippet inserted where the caret was, as `insertSnippet` leaves it — including the
 * re-indentation VS Code applies to every inserted line (the block sits at the caret's own indent, which is
 * exactly how the marker has to look in a method body).
 */
function insertAt(text, snippet, line) {
    const lines = text.split('\n');
    const indent = ((lines[line] ?? '').match(/^\s*/) || [''])[0];
    const block = snippet.split('\n').slice(0, -1)
        .map((l) => (l ? indent + l.replace('$0', '') : ''));
    lines.splice(line, 0, ...block);
    return lines.join('\n');
}

module.exports = async (t) => {
    t.section('the AI prompt: written in the editor, at the caret');

    // ---------- 1) the snippet ----------
    {
        const cs = prompt.promptSnippet('csharp');
        t.ok(cs.startsWith('// ✎ AI: begin'), 'snippet', 'a C# block opens with a comment marker');
        t.ok(cs.includes('\n$0\n'), 'snippet', 'and the caret goes on the line between the two markers');
        t.ok(/\n\/\/ ✎ AI: end\n$/.test(cs), 'snippet', 'closing with the end marker and a newline');
        const vb = prompt.promptSnippet('vb');
        t.ok(vb.startsWith("' ✎ AI: begin") && vb.includes("\n' ✎ AI: end\n"), 'snippet',
            'VB uses its own comment prefix for both markers');
        t.equal(prompt.commentPrefix('vb'), "'", 'snippet', 'the prefix is decided per language');
        t.equal(prompt.commentPrefix('csharp'), '//', 'snippet', 'and C# is the default shape');
    }

    // ---------- 2) finding a block ----------
    {
        const snippet = prompt.promptSnippet('csharp');
        // Nothing typed yet: the block exists, and the honest answer is "it is empty", not "there is no block".
        const empty = prompt.findPromptBlock(insertAt('class A\n{\n}\n', snippet, 1));
        t.equal(empty.ok, false, 'find', 'an untouched block is not sendable');
        t.ok(/is empty/.test(empty.why), 'find', 'and the reason says so, rather than "there is no block"');

        const typed = [
            'class A',
            '{',
            '    // ✎ AI: begin — write what you want below, as many lines as you like',
            '    // Read the row the ComboBox picked and fill NameBox and AgeBox.',
            '    // Use the collection the grid is bound to; do not touch the signature.',
            '    // ✎ AI: end',
            '}',
            ''
        ].join('\n');
        const found = prompt.findPromptBlock(typed);
        t.equal(found.ok, true, 'find', 'a block with a prompt in it is found');
        t.equal(found.block.prompt.split('\n').length, 2, 'find', 'the markers themselves are not part of the prompt');
        t.ok(/ComboBox picked/.test(found.block.prompt), 'find', 'with its first line');
        t.ok(/do not touch the signature/.test(found.block.prompt), 'find', 'and its last');
        t.equal(found.block.begin, 2, 'find', 'the block starts at the begin marker (0-based)');
        t.equal(found.block.end, 5, 'find', 'and ends at the end marker');
        t.ok(found.block.prompt.startsWith('Read the row') && !found.block.prompt.includes('//'), 'find',
            'and neither are the comment prefixes — the prompt is what the user wrote');

        // Code pasted inside the block (no comment prefix) must survive: the block is *ours*, the text is theirs.
        const pasted = typed.replace('    // Read the row', '    var rows = DataGrid1.ItemsSource;');
        t.ok(/var rows = DataGrid1.ItemsSource;/.test(prompt.findPromptBlock(pasted).block.prompt), 'find',
            'a line without a comment prefix is kept as it is');
    }

    // ---------- 3) the reasons a block cannot be sent ----------
    {
        const noBegin = 'class A\n{\n}\n';
        const none = prompt.findPromptBlock(noBegin);
        t.equal(none.ok, false, 'why', 'a file with no block at all is refused');
        t.ok(/no ✎ AI block/.test(none.why) && /Implement in Function/.test(none.why), 'why',
            'with the command that starts one named, because that is the fix');

        const half = '// ✎ AI: begin — write what you want below, as many lines as you like\n// a prompt\nclass A\n';
        const broken = prompt.findPromptBlock(half);
        t.equal(broken.ok, false, 'why', 'a block whose closing marker was deleted is refused');
        t.ok(/closing marker/.test(broken.why), 'why', 'and the reason is specific — not the same as "no block"');
        t.equal(prompt.hasPromptBlock(half), true, 'why', 'the cheap check still sees a marker in that file');
        t.equal(prompt.hasPromptBlock('class A\n'), false, 'why', 'and says no for a file without one');
    }

    // ---------- 4) what was inserted is removed exactly ----------
    {
        const original = [
            'using Avalonia.Controls;',
            '',
            'public partial class MainWindow',
            '{',
            '    private void ComboBox1_SelectionChanged(object sender, EventArgs e)',
            '    {',
            '        // TODO: handle the selection',
            '    }',
            '}',
            ''
        ].join('\n');
        // The caret sits on the "TODO" line: that is where the block goes, and where it must come out of.
        const withBlock = insertAt(original, prompt.promptSnippet('csharp'), 6);
        t.ok(withBlock.includes('✎ AI: begin'), 'strip', 'the block is in the file while it is being typed');
        const inserted = withBlock.split('\n').length - original.split('\n').length;
        t.equal(inserted, 3, 'strip', 'and it costs exactly three lines: begin, the empty prompt line, end');
        const found = prompt.findPromptBlock(withBlock);
        t.equal(found.ok, false, 'strip', 'an empty block is the "nothing typed yet" state');
        // With a prompt in it, the round trip must be exact. The empty line between the markers is *the* empty
        // line: the file itself has blank lines, and this test exists because the first version of it edited
        // the wrong one and proved nothing.
        const typedBlock = withBlock.replace(
            /(✎ AI: begin[^\n]*\n)[ \t]*\n/,
            '$1    // read the picked row\n    // and fill the boxes\n'
        );
        t.equal(prompt.findPromptBlock(typedBlock).block.prompt, 'read the picked row\nand fill the boxes', 'strip',
            'the prompt is exactly the two lines that were typed between the markers');
        const parsed = prompt.findPromptBlock(typedBlock);
        t.equal(parsed.ok, true, 'strip', 'the typed block parses even though insertSnippet indented it');
        t.equal(prompt.stripPromptBlock(typedBlock, parsed.block), original, 'strip',
            'and removing it returns the document to exactly what it was BEFORE the block existed — the promise ' +
            'the whole design rests on: a prompt can never quietly become a comment in someone\'s source');
        const emptyFound = prompt.findPromptBlock(withBlock);
        t.equal(emptyFound.ok, false, 'strip', 'an empty block has no text, so the removal path is the cancel path');
    }

    // ---------- 5) the wiring ----------
    {
        const ui = read('src/assistantUi.ts');
        const ask = ui.slice(ui.indexOf('async function askDescription'), ui.indexOf('async function takePromptBlock'));
        t.ok(ask.length > 500, 'wiring', 'the prompt helper was found');
        t.equal(/showInputBox/.test(ask), false, 'wiring',
            'the single-line dialog is gone from this path — it cannot be multi-line, which is why it went');
        t.ok(/insertSnippet\(new vscode\.SnippetString\(promptSnippet\(input\.language\)\)\)/.test(ask), 'wiring',
            'the block is inserted as a snippet, so `$0` decides where the caret lands');
        t.ok(/pendingPrompt = \{ uri, resolve, validate \};/.test(ask), 'wiring',
            'and the flow waits for the user, not for a dialog to be dismissed');
        t.ok(/setStatusBarMessage\(/.test(ask), 'wiring',
            'what the dialog said in its own chrome is said in the status bar, where the typing happens');
        t.ok(/input\.placeHolder/.test(ask), 'wiring', 'including the example, which used to be the placeholder');

        const send = ui.slice(ui.indexOf('export async function sendAiPrompt'), ui.indexOf('export async function cancelAiPrompt'));
        t.ok(/const complaint = state\.validate\(taken\.prompt\);[\s\S]{0,400}?await takePromptBlock\(\{ remove: true \}\);/.test(send),
            'wiring', 'sending validates BEFORE removing, so a refused prompt stays readable in the file');
        t.ok(/if \(complaint\) \{[\s\S]{0,200}?showWarningMessage\(complaint\);[\s\S]{0,80}?return;/.test(send), 'wiring',
            'and the refusal is said out loud instead of closing a box over it');
        t.ok(/pendingPrompt = undefined;[\s\S]{0,120}?state\.resolve\(taken\.prompt\);/.test(send), 'wiring',
            'the answer is handed to the waiting flow, which is the same code path the dialog fed');
        const cancel = ui.slice(ui.indexOf('export async function cancelAiPrompt'), ui.indexOf('export async function cancelAiPrompt') + 400);
        t.ok(/state\?\.resolve\(undefined\)/.test(cancel), 'wiring',
            'cancelling resolves with nothing — the flow ends exactly as "dialog dismissed" did');
        t.ok(/pendingPrompt && promptRequestIsIn\(document\)/.test(ui), 'wiring',
            'the lens is only offered in the document the block is in');
        t.ok(/command: 'avaloniaDesigner\.assistant\.sendPrompt'/.test(ui) && /command: 'avaloniaDesigner\.assistant\.cancelPrompt'/.test(ui),
            'wiring', 'with both actions on the block itself');

        const ext = read('src/extension.ts');
        t.ok(/registerCommand\('avaloniaDesigner\.assistant\.sendPrompt', \(\) => sendAiPrompt\(\)\)/.test(ext), 'wiring',
            'and the commands are registered');
        t.ok(/registerCommand\('avaloniaDesigner\.assistant\.cancelPrompt', \(\) => cancelAiPrompt\(\)\)/.test(ext), 'wiring',
            'both of them');

        const cmds = json.contributes.commands.map((c) => c.command);
        t.ok(cmds.includes('avaloniaDesigner.assistant.sendPrompt') && cmds.includes('avaloniaDesigner.assistant.cancelPrompt'),
            'manifest', 'they are declared in the manifest, which is what a code lens command needs');
        const palette = json.contributes.menus.commandPalette.filter((m) => m.when === 'false').map((m) => m.command);
        t.ok(palette.includes('avaloniaDesigner.assistant.sendPrompt') && palette.includes('avaloniaDesigner.assistant.cancelPrompt'),
            'manifest', 'and kept OUT of the palette: with no block there is nothing to send');
        const keys = json.contributes.keybindings;
        t.ok(keys.some((k) => k.command === 'avaloniaDesigner.assistant.sendPrompt' && k.key === 'ctrl+alt+enter'),
            'manifest', 'Ctrl+Alt+Enter sends, for people who never look at a lens');
        t.ok(keys.every((k) => k.when === 'editorTextFocus'), 'manifest',
            'and both bindings wait for the editor, so they cannot fire over a dialog');
    }
};
