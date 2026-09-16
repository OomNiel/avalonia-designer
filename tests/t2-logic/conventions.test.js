/* T2 — house rules: what is measured, what is *not* claimed, and where the rules end up.
 *
 * The feature exists because "train the model on my code" was answered honestly with "no fine-tuning on this
 * machine" (2026-09-16) and replaced with the deterministic version of the same wish. So the tests that
 * matter are the ones about **restraint**:
 *
 *   - a pattern below the gates is not offered at all (too few examples, or a codebase split 50/50);
 *   - the evidence travels with the suggestion, so the user can judge it (`4 of 4 C# members`);
 *   - a rule only ever comes from that language's own files — a C# project with one VB form must not be told
 *     to use `Private Sub`;
 *   - nothing here calls a model, and nothing is saved without the developer ticking it.
 *
 * The fixtures are real Avalonia code-behind in the shapes this extension itself generates (C# with `{` on
 * the next line and `Control_Click` handlers; VB with `Private Sub` and `Handles`), because a style rule that
 * only works on a made-up snippet is a style rule that will be wrong in a real project.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {
    MAX_CONVENTIONS,
    MAX_CONVENTION_CHARS,
    MIN_SAMPLES,
    MIN_SHARE,
    conventionsBlock,
    conventionsText,
    countBraceStyle,
    countHandlerNames,
    countIndent,
    countModifiers,
    countVbEventWiring,
    deriveConventions,
    memberDeclarations,
    normaliseConventions,
    parseConventionsText
} = require('../../out/conventions.js');
const { buildFixPrompt, buildGeneratePrompt, buildImplementPrompt } = require('../../out/assistant.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** C# code-behind the way this extension generates it: Allman braces, `private`, no statics. */
const CS = [
    'using Avalonia.Controls;',
    'using Avalonia.Interactivity;',
    '',
    'namespace Demo;',
    '',
    'public partial class MainWindow : Window',
    '{',
    '    public MainWindow()',
    '    {',
    '        InitializeComponent();',
    '    }',
    '',
    '    private void Save_Click(object? sender, RoutedEventArgs e)',
    '    {',
    '        StatusText.Text = "saved";',
    '    }',
    '',
    '    private void Cancel_Click(object? sender, RoutedEventArgs e)',
    '    {',
    '        Close();',
    '    }',
    '',
    '    private void Load_Click(object? sender, RoutedEventArgs e)',
    '    {',
    '        Close();',
    '    }',
    '',
    '    private void Clear_Click(object? sender, RoutedEventArgs e)',
    '    {',
    '        Close();',
    '    }',
    '',
    '    private void Export_Tapped(object? sender, RoutedEventArgs e)',
    '    {',
    '        Close();',
    '    }',
    '}'
].join('\n');

/** VB.NET code-behind with a `Handles` clause — the other half of the wiring fork. */
const VB = [
    'Imports Avalonia.Controls',
    '',
    'Public Class MainWindow',
    '    Inherits Window',
    '',
    '    Private Sub InitializeComponent()',
    '    End Sub',
    '',
    '    Private Sub Save_Click(sender As Object, e As RoutedEventArgs) Handles SaveButton.Click',
    '    End Sub',
    '',
    '    Private Sub Cancel_Click(sender As Object, e As RoutedEventArgs) Handles CancelButton.Click',
    '    End Sub',
    '',
    '    Private Sub Load_Click(sender As Object, e As RoutedEventArgs) Handles LoadButton.Click',
    '    End Sub',
    '',
    '    Private Sub Clear_Click(sender As Object, e As RoutedEventArgs) Handles ClearButton.Click',
    '    End Sub',
    '',
    '    Private Sub Export_Tapped(sender As Object, e As RoutedEventArgs) Handles ExportButton.Tapped',
    '    End Sub',
    'End Class'
].join('\n');

module.exports = async (t) => {
    t.section('house rules (conventions memory)');

    // ---------- 1) what is stored ----------
    {
        t.equal(normaliseConventions(['  Indent with 4 spaces.  ', 'indent with 4 SPACES.', '']), ['Indent with 4 spaces.'],
            'store', 'rules are trimmed and de-duplicated case-insensitively');
        t.equal(normaliseConventions('a\nb'), ['a', 'b'], 'store', 'a plain string is accepted as well as a list');
        t.equal(normaliseConventions(undefined), [], 'store', 'and nothing at all yields an empty list');
        t.equal(normaliseConventions(['one   two']), ['one two'], 'store',
            'inner runs of whitespace collapse — the text goes into a prompt');
        t.equal(normaliseConventions(['x'.repeat(400)])[0].length, MAX_CONVENTION_CHARS, 'store',
            'a rule longer than the cap is cut rather than sent');
        t.equal(normaliseConventions(Array.from({ length: 40 }, (_, i) => `rule ${i}`)).length, MAX_CONVENTIONS, 'store',
            'and the list stops at the cap, so the prompt cannot grow into a manual');
        t.equal(normaliseConventions(['ok']).length, 1, 'store', 'a normal list is left alone');

        // The panel's textarea and the setting are two views of one list; both directions are pinned.
        t.equal(parseConventionsText('Indent with 4 spaces.\n\n- Name event handlers.\n* No static members.').length, 3,
            'store', 'bullets and blank lines are tolerated when pasting into the editor');
        t.equal(parseConventionsText('- a\n* a')[0], 'a', 'store', 'and a pasted bullet does not become part of the rule');
        t.equal(conventionsText(['a', 'b']), 'a\nb', 'store', 'the editor text is one rule per line');
        t.equal(conventionsText(parseConventionsText('a\n a\nb')), 'a\nb', 'store',
            'typing the same rule twice in the editor stores it once');
    }

    // ---------- 2) the prompt block ----------
    {
        t.equal(conventionsBlock([]), '', 'block', 'no rules means no block at all — nothing to send');
        t.equal(conventionsBlock(['  ', '']), '', 'block', 'and whitespace-only rules count as none');
        const block = conventionsBlock(['Indent with 4 spaces.', 'Name event handlers <Control>_<Event>.'], 'cs');
        t.ok(/^House rules for C#/.test(block), 'block', 'the block names the language it applies to');
        t.ok(/follow them exactly/.test(block), 'block',
            'and states that it is an instruction rather than context to consider');
        t.equal(block.split('\n').length, 3, 'block', 'one line per rule, bulleted');
        t.ok(/^House rules for VB\.NET/.test(conventionsBlock(['x'], 'vb')), 'block', 'VB gets its own wording');
        t.ok(/^House rules for this codebase/.test(conventionsBlock(['x'])), 'block',
            'and language-less use still reads as a sentence');
    }

    // ---------- 3) what the rules are measured from ----------
    {
        const decls = memberDeclarations(CS).map((d) => d.name);
        t.ok(decls.includes('Save_Click') && decls.includes('Load_Click'), 'measure', 'member declarations are read');
        t.equal(decls.includes('MainWindow'), false, 'measure',
            'the class declaration is not a member (a constructor has no type between the modifiers and the name)');
        // `InitializeComponent();` looks exactly like a declaration line from a distance. It is a call, and
        // counting calls as members would put "no static members (5 of 12)"-style nonsense in the dialog.
        t.equal(decls.includes('InitializeComponent'), false, 'measure',
            'and a method CALL is not mistaken for a member declaration');
        t.equal(memberDeclarations('    var x = Foo();\n    DoSomething();').length, 0, 'measure',
            'a local declaration is not a member');
        t.equal(memberDeclarations('    private void A() { }')[0].modifiers, 'private', 'measure',
            'the modifiers are separated from the name');

        const indent = countIndent(CS);
        t.ok(indent.four >= 20 && indent.two === 0 && indent.tabs === 0, 'measure',
            'four-space indentation is counted as four, not as "divisible by two"');
        t.equal(countIndent('a\n\tb\n\t\tc').tabs, 2, 'measure', 'and tabs are recognised as tabs');
        t.equal(countIndent('a\n  b\n      c').two, 2, 'measure',
            'a file indented two at a time is counted as two (6 is not a multiple of four)');

        const brace = countBraceStyle(CS);
        t.ok(brace.next >= 5 && brace.same === 0, 'measure',
            'Allman (brace on the next line) is told apart from K&R');
        t.equal(countBraceStyle('    private void A() {\n    }').same, 1, 'measure', 'and the other way round too');

        const mods = countModifiers(CS);
        t.ok(mods.private >= 5 && mods.other === 0 && mods.static === 0, 'measure',
            'visibility and statics are counted from the declaration lines');

        const handlers = countHandlerNames(CS);
        t.equal(handlers.total, 5, 'measure', 'the five `<Control>_<Event>` names are recognised');
        t.equal(handlers.named, 5, 'measure', 'and all of them follow the pattern');
        t.equal(countHandlerNames('private void Whatever() { }').total, 0, 'measure',
            'a name with no event suffix is not counted as a handler either way');

        const wiring = countVbEventWiring(VB);
        t.equal(wiring.handles, 5, 'measure', 'VB `Handles` clauses are counted');
        t.equal(wiring.addHandler, 0, 'measure', 'and `AddHandler` is counted separately');
        t.equal(countVbEventWiring('AddHandler timer.Tick, Sub(s, e) DoIt()').addHandler, 1, 'measure',
            'including the lambda form');
    }

    // ---------- 4) the two gates, and the evidence ----------
    {
        t.equal(MIN_SAMPLES, 5, 'gate', 'a rule needs five examples before it is a rule');
        t.ok(Math.abs(MIN_SHARE - 0.8) < 1e-9, 'gate', 'and eighty per cent of them have to agree');

        const facts = deriveConventions([{ name: 'MainWindow.axaml.cs', text: CS, language: 'cs' }]);
        const ids = facts.map((f) => f.id);
        t.ok(ids.includes('cs.indent.spaces'), 'gate', 'the indent style is offered');
        t.ok(ids.includes('cs.brace.nextLine'), 'gate', 'so is the brace style');
        t.ok(ids.includes('cs.visibility.private'), 'gate', 'and the visibility rule');
        t.ok(ids.includes('cs.static.none'), 'gate', 'and "no static members", because there are none');
        t.ok(ids.includes('cs.handlers.controlEvent'), 'gate', 'and the handler naming');
        t.equal(facts.every((f) => f.samples >= MIN_SAMPLES && f.samples <= f.total), true, 'gate',
            'every offered rule carries how many of how many agreed');
        t.equal(facts.some((f) => f.id === 'cs.brace.sameLine'), false, 'gate',
            'the style this code does NOT use is never offered as a rule');
        const handlerFact = facts.find((f) => f.id === 'cs.handlers.controlEvent');
        t.equal(`${handlerFact.samples} of ${handlerFact.total}`, '5 of 5', 'gate',
            'and the evidence is the real count for that rule');

        // Three members: below the sample gate, so nothing is claimed even though they agree completely.
        const tiny = [
            'public partial class M : Window',
            '{',
            '    private void A_Click(object? s, RoutedEventArgs e)',
            '    {',
            '    }',
            '',
            '    private void B_Click(object? s, RoutedEventArgs e)',
            '    {',
            '    }',
            '',
            '    private void C_Click(object? s, RoutedEventArgs e)',
            '    {',
            '    }',
            '}'
        ].join('\n');
        const tinyFacts = deriveConventions([{ name: 'M.cs', text: tiny, language: 'cs' }]);
        t.equal(tinyFacts.some((f) => f.id === 'cs.handlers.controlEvent'), false, 'gate',
            'with only three handlers, the naming is a coincidence rather than a convention');
        t.ok(tinyFacts.some((f) => f.id === 'cs.indent.spaces'), 'gate',
            'while indentation, which had dozens of examples, is still offered');

        // A codebase split down the middle has no convention to state: half of it would be wrong.
        const split = [
            'public partial class M : Window {',
            '    private void A() {',
            '    }',
            '    private void B() {',
            '    }',
            '    private void C() {',
            '    }',
            '    private void D(',
            '    )',
            '    {',
            '    }',
            '    private void E(',
            '    )',
            '    {',
            '    }',
            '    private void F(',
            '    )',
            '    {',
            '    }',
            '}'
        ].join('\n');
        const splitFacts = deriveConventions([{ name: 'M.cs', text: split, language: 'cs' }]).map((f) => f.id);
        t.equal(splitFacts.includes('cs.brace.sameLine') || splitFacts.includes('cs.brace.nextLine'), false, 'gate',
            'a 50/50 codebase gets no brace rule at all — inventing one would be a house style nobody chose');

        // Tabs win when they are what the file uses.
        const tabbed = ['public partial class M : Window', '{', ...Array.from({ length: 8 }, (_, i) =>
            `\tprivate void H${i}_Click(object? s, RoutedEventArgs e)\n\t{\n\t\tClose();\n\t}`)].join('\n');
        const tabFacts = deriveConventions([{ name: 'M.cs', text: tabbed, language: 'cs' }]).map((f) => f.id);
        t.ok(tabFacts.includes('cs.indent.tabs'), 'gate', 'a tab-indented project is told to use tabs');
        t.equal(tabFacts.includes('cs.indent.spaces'), false, 'gate', 'and not told to use spaces');
    }

    // ---------- 5) one language never speaks for the other ----------
    {
        const mixed = deriveConventions([
            { name: 'MainWindow.axaml.cs', text: CS, language: 'cs' },
            { name: 'MainWindow.axaml.vb', text: VB, language: 'vb' }
        ]);
        const byLang = (lang) => mixed.filter((f) => f.language === lang).map((f) => f.id);
        t.ok(byLang('cs').includes('cs.handlers.controlEvent'), 'mixed', 'the C# rules come from the C# files');
        t.ok(byLang('vb').includes('vb.wiring.handles'), 'mixed', 'and the VB rules from the VB ones');
        t.equal(byLang('cs').some((id) => id.startsWith('vb.')), false, 'mixed',
            'a VB rule is never filed under C# (and the other way round)');
        t.equal(byLang('vb').some((id) => id.startsWith('cs.')), false, 'mixed', 'in either direction');
        t.ok(byLang('vb').includes('vb.visibility.private'), 'mixed', 'VB visibility is measured too');

        const csOnly = deriveConventions([{ name: 'M.cs', text: CS, language: 'cs' }]);
        t.equal(csOnly.some((f) => f.language === 'vb'), false, 'mixed',
            'a project with no VB files produces no VB rules — not even "use Private Sub"');
        t.equal(deriveConventions([]).length, 0, 'mixed', 'and no files means no rules rather than a guess');
        t.equal(deriveConventions([{ name: 'empty.cs', text: '   \n', language: 'cs' }]).length, 0, 'mixed',
            'a blank file is not evidence of anything');
    }

    // ---------- 6) the rules reach the prompt ----------
    {
        const rules = conventionsBlock(['Indent with 4 spaces.', 'Name event handlers <Control>_<Event>.'], 'cs');
        const generate = buildGeneratePrompt({
            language: 'cs', description: 'a sorting function', header: 'public partial class M : Window',
            members: 'private void A()', style: 'private void B() { }', rules
        })[1].content;
        t.ok(/House rules for C#/.test(generate), 'prompt', 'the new-member prompt carries the rules');
        t.ok(generate.indexOf('House rules') < generate.indexOf('The developer wants a NEW member'), 'prompt',
            'placed before the request: the instruction is the last thing the model reads about *how*');
        t.ok(generate.indexOf('House rules') > generate.indexOf('style reference'), 'prompt',
            'and after the context, so it does not get read as part of the code');
        t.equal(/House rules/.test(buildGeneratePrompt({
            language: 'cs', description: 'x', header: 'h', members: '', style: undefined
        })[1].content), false, 'prompt', 'with no rules the prompt is exactly as it was before');

        const implement = buildImplementPrompt({
            language: 'vb', description: 'sort it', method: 'Private Sub A()\nEnd Sub', header: 'Class M',
            rules: conventionsBlock(['Indent with 4 spaces.'], 'vb')
        })[1].content;
        t.ok(/House rules for VB\.NET/.test(implement), 'prompt', 'the rewrite prompt carries them too');
        t.ok(implement.indexOf('House rules') < implement.indexOf('The developer wants the method below'), 'prompt',
            'in the same position');

        const fix = buildFixPrompt({
            language: 'cs', finding: 'CS0111: a member with the same name', method: 'private void A() { }',
            header: 'public partial class M : Window', rules
        })[1].content;
        t.ok(/House rules for C#/.test(fix), 'prompt', 'and so does the Code Fix prompt');
        t.ok(fix.indexOf('House rules') < fix.indexOf('private void A()'), 'prompt',
            'before the method it is being asked about');
    }

    // ---------- 7) the plumbing ----------
    {
        const ui = read('src/conventionsUi.ts');
        t.ok(/const raw = configView\(SETTINGS\)\.get<unknown>\('conventions', \[\]\)/.test(ui), 'wiring',
            'the rules are read from the setting, through `configView` so they come from the scope that owns them');
        t.ok(/conventionsBlock\(normaliseConventions\(raw\), language\)/.test(ui), 'wiring',
            'and formatted by the pure module rather than by a second implementation here');
        t.ok(/deriveConventions\(samples\)/.test(ui), 'wiring',
            'learning calls the measured deriver — no model is involved in this feature');
        t.ok(/GENERATED/.test(ui) && /assemblyinfo/i.test(ui), 'wiring',
            'generated and designer files are skipped: they have no style of their own');
        t.ok(/canPickMany: true/.test(ui), 'wiring', 'the user ticks which suggestions to keep');
        t.ok(/updateSetting\(vscode\.workspace\.getConfiguration\(SETTINGS\), 'conventions'/.test(ui), 'wiring',
            'and the accepted ones are saved where the value already lives (the 0.9.15 lesson)');
        t.ok(/no pattern was strong enough/.test(ui), 'wiring',
            'nothing found is said plainly, with the gates that produced it');
        t.ok(/MAX_CONVENTIONS/.test(ui), 'wiring', 'and hitting the cap is reported instead of silently dropping rules');
        t.ok(!/chatDetailed|proposeMethod|openai/i.test(ui), 'wiring',
            'this module sends nothing anywhere — it reads files and settings');

        const assistantUi = read('src/assistantUi.ts');
        t.ok(/conventionsFor\(language\)/.test(assistantUi), 'wiring',
            'the AI flows ask for the rules in the document\'s own language');
        t.ok(/name: 'rules', text: rules, required: false/.test(assistantUi), 'wiring',
            'the new-member path plans them as an optional prompt part');
        t.ok(/rules: conventionsFor\(language\)/.test(assistantUi), 'wiring',
            'and the Code Fix path carries them unconditionally — the block is a few dozen tokens');

        const panel = read('src/aiPanel.ts');
        t.ok(/conventions: normaliseConventions\(cfg\.get<unknown>\('conventions', \[\]\)\)/.test(panel), 'wiring',
            'the panel is told the list, so the editor shows what the settings hold');
        t.ok(/parseConventionsText\(input\.conventions\)/.test(panel), 'wiring',
            'and Save parses the editor\'s text back through the same pure function');

        const panelUi = read('src/designerPanel.ts');
        t.ok(/case 'aiLearnConventions'/.test(panelUi) && /await learnConventions\(\)/.test(panelUi), 'wiring',
            'the ⚙ panel\'s Learn button runs the same flow as the command, not a copy of it');
        t.ok(/id="aiConvText"/.test(panelUi) && /id="aiLearnConventions"/.test(panelUi), 'wiring',
            'the editor and its button are in the AI section of the panel');

        const web = read('media/designer.js');
        t.ok(/conventions: els\.aiConvText \? els\.aiConvText\.value : ''/.test(web), 'wiring',
            'the webview sends the typed rules with the rest of the AI settings on Save');
        t.ok(/document\.activeElement !== els\.aiConvText/.test(web), 'wiring',
            'and a state arriving mid-edit does not overwrite what is being typed');

        const manifest = JSON.parse(read('package.json'));
        const props = (Array.isArray(manifest.contributes.configuration)
            ? manifest.contributes.configuration[0]
            : manifest.contributes.configuration).properties;
        const setting = props['avaloniaDesigner.assistant.conventions'];
        t.equal(setting.type, 'array', 'wiring', 'the setting is a list of strings, editable in the Settings UI');
        t.equal(setting.items.type, 'string', 'wiring', 'of strings');
        t.equal(Array.isArray(setting.default) && setting.default.length, 0, 'wiring',
            'and empty by default: no rules are imposed on anyone who did not ask');
        const commands = manifest.contributes.commands.map((c) => c.command);
        t.ok(commands.includes('avaloniaDesigner.assistant.learnConventions'), 'wiring',
            'the palette command is declared');
        const ext = read('src/extension.ts');
        t.ok(/registerCommand\('avaloniaDesigner\.assistant\.learnConventions'/.test(ext), 'wiring',
            'and registered');
        t.ok(/if \(await learnConventions\(\)\) void refreshPanels\(\)/.test(ext), 'wiring',
            'with the open panels refreshed only when something was actually saved');
    }
};
