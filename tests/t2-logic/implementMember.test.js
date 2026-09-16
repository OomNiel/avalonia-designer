/* T2 — "AI: Implement in Function…" when the caret is **not** in a method: generate a new member.
 *
 * Asked on 2026-09-16: *"Create a function named 'SortArray' that sorts the contents of a passed array"*
 * — placed at the caret, `private`, and `static`/`Shared` where that is possible. The user's answers
 * that shape everything below:
 *   - the model writes the name and the signature from the sentence (the diff is the review);
 *   - a caret inside a method keeps today's behaviour (rewrite it), so nothing here changes that path;
 *   - the new member lands at the caret, snapped to a line boundary, with one blank line of separation;
 *   - a name that already exists is **refused**, not replaced;
 *   - `using`/`Imports` the member needs may come with it;
 *   - visibility is always `private`, and `static`/`Shared` only where it cannot break the build.
 *
 * Every function tested here is pure — no VS Code, no model. That is the point: the interesting
 * decisions (where the text goes, what it looks like, when `static` is a lie) are decided by code the
 * suite can drive, and the command in `assistantUi.ts` only gathers facts and shows a diff.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {
    NEW_MEMBER_MARKER,
    addMemberToFile,
    addXamlEventAttribute,
    alreadyImported,
    buildGeneratePrompt,
    enclosingTypeSpan,
    handlerFromMemberName,
    insertMember,
    knownControlNames,
    memberIndent,
    memberNameOf,
    memberSignatures,
    normaliseMemberVisibility,
    parseNewMemberAnswer,
    sniffMemberName
} = require('../../out/assistant.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** A code-behind shaped like the generated ones: a control field, a handler, a helper. */
const CS_FILE = [
    'using System;',
    'using Avalonia.Controls;',
    '',
    'namespace Demo;',
    '',
    'public partial class MainWindow : Window',
    '{',
    '    private Button Save = null!;',
    '',
    '    public MainWindow()',
    '    {',
    '        InitializeComponent();',
    '    }',
    '',
    '    private void Save_Click(object? sender, RoutedEventArgs e)',
    '    {',
    '        Status.Text = "saving";',
    '    }',
    '}',
    ''
].join('\n');

const VB_FILE = [
    'Imports Avalonia.Controls',
    '',
    'Partial Public Class MainWindow',
    '    Inherits Window',
    '',
    '    Private Save As Button',
    '',
    '    Private Sub Save_Click(sender As Object, e As RoutedEventArgs)',
    '        Status.Text = "saving"',
    '    End Sub',
    'End Class',
    ''
].join('\n');

module.exports = async (t) => {
    t.section('T2: generate a new member (caret outside a method)');

    // ---------------- what the model is asked ----------------
    {
        const messages = buildGeneratePrompt({
            language: 'cs',
            description: "Create a function named 'SortArray' that sorts the contents of a passed array",
            header: 'using System;\n\npublic partial class MainWindow : Window',
            members: 'private void Save_Click(object? sender, RoutedEventArgs e)\npublic MainWindow()',
            style: 'private void Save_Click(object? sender, RoutedEventArgs e)\n{\n    Status.Text = "saving";\n}'
        });
        const user = messages.find((m) => m.role === 'user').content;
        t.ok(/SortArray/.test(user), 'prompt', "the developer's sentence is in the prompt");
        t.ok(user.includes('using System;'), 'prompt', 'the file header is context the model can read');
        t.ok(/Save_Click/.test(user), 'prompt', 'and the members the class already has, so it cannot duplicate them');
        t.ok(new RegExp(NEW_MEMBER_MARKER).test(user), 'prompt',
            'the marker that separates needed usings from the member is spelled out');
        t.ok(/ONE ```csharp code block/.test(user), 'prompt', 'the answer is constrained to one block');
        t.ok(/Always `private`/.test(user), 'prompt', 'private is mandatory');
        t.ok(/Add `static` only when/.test(user), 'prompt', 'and static is conditional, with the condition given');
        t.ok(/no `this`/.test(user) && /never be static/.test(user), 'prompt',
            'including why the event handler of a form never can be static');
        t.ok(!/keep the method\\'s signature/i.test(user), 'prompt',
            'nothing from the rewrite contract leaks in — this member has no signature to keep');

        const vb = buildGeneratePrompt({ language: 'vb', description: 'Sort a passed array', header: 'Imports System\n\nPartial Public Class MainWindow', members: '' });
        const vbUser = vb.find((m) => m.role === 'user').content;
        t.ok(/```vb/.test(vbUser), 'prompt-vb', 'VB is fenced as vb, so the model does not answer in C#');
        t.ok(/Add `Shared` only when/.test(vbUser), 'prompt-vb', 'VB is told Shared, not static');
        t.ok(/never `Static`/.test(vbUser), 'prompt-vb',
            'and that Static at member level is wrong in VB — the keyword means something else there');
        t.ok(!/Save_Click/.test(vbUser), 'prompt-vb', 'an empty member list adds no empty block');
    }

    // ---------------- reading the answer ----------------
    {
        const plain = parseNewMemberAnswer('```csharp\nprivate static void SortArray(int[] values)\n{\n    Array.Sort(values);\n}\n```');
        t.equal(memberNameOf(plain.member, 'cs'), 'SortArray', 'parse', 'the name comes off the declaration');
        t.equal(plain.usings.length, 0, 'parse', 'a member that needs nothing has no usings');
        t.ok(/Array\.Sort\(values\)/.test(plain.member), 'parse', 'and the body arrives intact');

        const withMarker = parseNewMemberAnswer(
            '```csharp\n// --- new member ---\nusing System.Linq;\n' + NEW_MEMBER_MARKER + '\nprivate static int[] Sorted(int[] v)\n{\n    return v.OrderBy(x => x).ToArray();\n}\n```'
        );
        t.equal(withMarker.usings.join(','), 'using System.Linq;', 'parse', 'usings before the marker are header additions');
        t.equal(memberNameOf(withMarker.member, 'cs'), 'Sorted', 'parse', 'and the member after it is the member');

        const vb = parseNewMemberAnswer("```vb\nImports System.Linq\n\nPrivate Shared Function Sorted(values() As Integer) As Integer()\n    Return values.OrderBy(Function(x) x).ToArray()\nEnd Function\n```");
        t.equal(vb.usings.join(','), 'Imports System.Linq', 'parse-vb',
            'without a marker the leading Imports are still recognised — nothing else can start a member');
        t.equal(memberNameOf(vb.member, 'vb'), 'Sorted', 'parse-vb', 'and the member itself is intact');

        const commented = parseNewMemberAnswer("```vb\n' " + NEW_MEMBER_MARKER + "\nPrivate Shared Sub SortArray(values() As Integer)\nEnd Sub\n```");
        t.equal(memberNameOf(commented.member, 'vb'), 'SortArray', 'parse-vb',
            'a marker the model commented out still splits the answer');

        const json = parseNewMemberAnswer('{"code": "private static void A(int[] v) { }", "note": "sorts"}');
        t.equal(memberNameOf(json.member, 'cs'), 'A', 'parse-json', 'the JSON answer shape works too');
        t.equal(json.note, 'sorts', 'parse-json', 'and its note is kept for the log');

        const prose = parseNewMemberAnswer('I am not sure how to do that.');
        t.equal(prose.member.trim(), '', 'parse-empty', 'prose yields no member, so the caller can show the raw answer');

        const cut = parseNewMemberAnswer('```csharp\nprivate static void A(int[] v)\n{');
        t.ok(/private static void A/.test(cut.member), 'parse-cut', 'an unterminated block still gives what there was');
    }

    // ---------------- reading the class ----------------
    {
        const cs = memberSignatures(CS_FILE, 'cs');
        t.equal(cs.map((m) => m.name).join(','), 'MainWindow,Save_Click', 'members',
            'the constructor and the handler are found — and `Status.Text = "saving";` is not a member');
        t.equal(cs.find((m) => m.name === 'MainWindow').isStatic, false, 'members', 'neither is static');
        t.ok(!cs.some((m) => m.name === 'Array'), 'members',
            'a call inside a body cannot be mistaken for a declaration (that is what NOT_A_RETURN_TYPE guards)');

        const props = memberSignatures('public string Name { get; set; }\nprivate static int Count = 0;', 'cs');
        t.equal(props.filter((m) => m.name === 'Name').length, 1, 'members',
            'a property is a member too — the name a new method is most likely to collide with');

        const vb = memberSignatures(VB_FILE, 'vb');
        t.equal(vb.map((m) => m.name).join(','), 'Save_Click', 'members-vb', 'VB methods are found (the field is not one)');
        t.equal(memberSignatures('Private Shared Function Sorted(values() As Integer) As Integer()\nEnd Function', 'vb')[0].isStatic, true, 'members-vb', 'Shared is read as static');

        const type = enclosingTypeSpan(CS_FILE, 15, 'cs');
        t.equal(type && type.name, 'MainWindow', 'type', 'the enclosing class is found from a line inside it');
        t.equal(type && type.endLine, 19, 'type', 'with the line of its closing brace');
        t.equal(enclosingTypeSpan(CS_FILE, 1, 'cs'), undefined, 'type',
            'a caret in the usings is outside every type — that is refused, never guessed at');
        const vbType = enclosingTypeSpan(VB_FILE, 8, 'vb');
        t.equal(vbType && vbType.name, 'MainWindow', 'type-vb', 'VB finds the class and its End Class');
        t.equal(vbType && vbType.endLine, 11, 'type-vb',
            'the class ends at `End Class` — an `End Sub` inside it does not close it');
        t.equal(enclosingTypeSpan(VB_FILE, 1, 'vb'), undefined, 'type-vb', 'above the class is outside it');

        const nested = ['class Outer', '{', '    class Inner', '    {', '        void A() { }', '    }', '}'].join('\n');
        t.equal(enclosingTypeSpan(nested, 5, 'cs').name, 'Inner', 'type',
            'the innermost type wins — a nested class is a legal home for a member');
        const multi = ['class A', '{', '}', '', 'class B', '{', '', '}'].join('\n');
        t.equal(enclosingTypeSpan(multi, 7, 'cs').name, 'B', 'type', 'and each type gets its own span');
        t.equal(memberIndent(CS_FILE, enclosingTypeSpan(CS_FILE, 15, 'cs'), 'cs'), '    ', 'indent',
            'the new member matches its neighbours');
    }

    // ---------------- where the text goes ----------------
    {
        const type = enclosingTypeSpan(CS_FILE, 15, 'cs');
        const member = 'private static void SortArray(int[] values)\n{\n    Array.Sort(values);\n}';

        // Caret on the blank line between the constructor and the handler: exactly one blank line
        // above and below the new member, and nothing else in the file moves.
        const memberBlock = [
            '    private static void SortArray(int[] values)',
            '    {',
            '        Array.Sort(values);',
            '    }'
        ].join('\n');
        const afterBody = insertMember({ text: CS_FILE, caretLine: 14, member, type, language: 'cs' });
        const expected = CS_FILE.replace(
            '\n\n    private void Save_Click',
            `\n\n${memberBlock}\n\n    private void Save_Click`
        );
        t.equal(afterBody, expected, 'insert',
            'a caret on a blank line gets the member right there, one blank line either side');
        t.ok(/^ {8}Array\.Sort\(values\);$/m.test(afterBody), 'insert',
            'the body is re-indented one level deeper than the declaration');

        // Caret on a field line just below: same thing, and the blank line already under the caret is
        // reused instead of adding a second one.
        const onField = insertMember({ text: CS_FILE, caretLine: 8, member, type, language: 'cs' });
        t.equal(onField, CS_FILE.replace(
            '    private Button Save = null!;\n',
            `    private Button Save = null!;\n\n${memberBlock}\n`
        ), 'insert-field', 'the member goes below the caret line, never inside it');
        t.ok(!/\n\n\n/.test(onField), 'insert-field', 'and the file never ends up with a run of blank lines');

        // Caret on the closing brace of the method above already placed one: still inside the class.
        const onBrace = insertMember({ text: CS_FILE, caretLine: 18, member, type, language: 'cs' });
        t.ok(onBrace.trimEnd().endsWith(`\n${memberBlock}\n}`), 'insert-clamp',
            'the member lands directly above the class closing brace, with no blank before it');

        // Caret on the class declaration line: the member must not land above the opening brace.
        const onDecl = insertMember({ text: CS_FILE, caretLine: 6, member, type, language: 'cs' });
        t.ok(onDecl.indexOf(memberBlock) > onDecl.indexOf('{'), 'insert-top',
            'the opening brace still comes first — a member is never written above it');

        // Line endings and BOM survive.
        const crlf = CS_FILE.replace(/\r?\n/g, '\r\n');
        const crlfOut = insertMember({ text: crlf, caretLine: 14, member, type, language: 'cs' });
        t.equal(crlfOut.includes('\r\n') && !/[^\r]\n/.test(crlfOut), true, 'insert-eol',
            'a CRLF file stays CRLF throughout');
        const bom = insertMember({ text: '\uFEFF' + CS_FILE, caretLine: 14, member, type, language: 'cs' });
        t.equal(bom.charCodeAt(0), 0xFEFF, 'insert-bom', 'and the BOM is restored');

        // VB: the member goes above `End Class`, and the `End Sub` above it is left alone.
        const vbType = enclosingTypeSpan(VB_FILE, 6, 'vb');
        const vbMember = 'Private Shared Sub SortArray(values() As Integer)\n    Array.Sort(values)\nEnd Sub';
        const vbOut = insertMember({ text: VB_FILE, caretLine: 6, language: 'vb', type: vbType, member: vbMember });
        t.equal(vbOut, VB_FILE.replace(
            '    Private Save As Button\n',
            `    Private Save As Button\n\n    Private Shared Sub SortArray(values() As Integer)\n` +
            '        Array.Sort(values)\n    End Sub\n'
        ), 'insert-vb', 'VB: below the caret line, inside the class, above the handler');
        t.ok(/    End Sub\nEnd Class/.test(vbOut), 'insert-vb', 'and `End Sub`/`End Class` keep their places');
    }

    // ---------------- visibility: private, and static only where it is safe ----------------
    {
        const members = memberSignatures(CS_FILE, 'cs');
        const controls = ['Save', 'Status'];

        const pure = normaliseMemberVisibility('private static void SortArray(int[] values)\n{\n    Array.Sort(values);\n}', 'cs', controls, members);
        t.ok(/^private static void SortArray/.test(pure.member), 'vis', 'a self-contained helper stays static');
        t.equal(pure.changed.length, 0, 'vis', 'and nothing had to be corrected');

        const loose = normaliseMemberVisibility('public static void SortArray(int[] values) { }', 'cs', controls, members);
        t.ok(/^private static/.test(loose.member), 'vis', 'public is forced to private');
        t.ok(loose.changed.some((c) => /private/.test(c)), 'vis', 'and the change is reported for the log');

        const noModifier = normaliseMemberVisibility('void SortArray(int[] values) { Array.Sort(values); }', 'cs', controls, members);
        t.ok(/^private static void SortArray/.test(noModifier.member), 'vis',
            'a model that omits visibility entirely still gets private — and static, since the body is self-contained');

        const usesThis = normaliseMemberVisibility('public static void Refresh()\n{\n    this.Save_Click(null, null);\n}', 'cs', controls, members);
        t.ok(/^private void Refresh/.test(usesThis.member), 'vis',
            'a body that touches `this` cannot be static — the keyword is removed rather than shipped broken');
        t.ok(usesThis.changed.some((c) => /removed `static`/.test(c)), 'vis', 'said so in the log');

        const usesControl = normaliseMemberVisibility('private static void ShowIt()\n{\n    Status.Text = "x";\n}', 'cs', controls, members);
        t.ok(/^private void ShowIt/.test(usesControl.member), 'vis', 'touching a form control is instance state too');

        const handler = normaliseMemberVisibility('private static void Save_Click(object? sender, RoutedEventArgs e)\n{\n    Save.IsEnabled = false;\n}', 'cs', controls, members);
        t.ok(/^private void Save_Click/.test(handler.member), 'vis',
            'and a handler is never static, because XAML resolves it on the instance');

        const pureHandler = normaliseMemberVisibility('private static void Save_Click(object? sender, RoutedEventArgs e)\n{\n}\n', 'cs', controls, members);
        t.ok(/^private void Save_Click/.test(pureHandler.member), 'vis',
            'even an empty handler — the name is what decides, not the body');

        const sibling = normaliseMemberVisibility('private static void A()\n{\n    Save_Click(null, null);\n}', 'cs', controls, members);
        t.ok(/^private void A/.test(sibling.member), 'vis',
            'calling a non-static sibling of the class is instance use');

        const vb = normaliseMemberVisibility('Public Function Sorted(values() As Integer) As Integer()\n    Return values\nEnd Function', 'vb', ['Save', 'Status'], memberSignatures(VB_FILE, 'vb'));
        t.ok(/^Private Shared Function Sorted/.test(vb.member), 'vis-vb', 'VB: Private + Shared for a self-contained one');

        const vbStatic = normaliseMemberVisibility('Private Static Sub SortArray(values() As Integer)\nEnd Sub', 'vb', [], []);
        t.ok(/^Private Shared Sub SortArray/.test(vbStatic.member), 'vis-vb',
            'VB: `Static` at member level is replaced with `Shared` — otherwise it would not compile');

        const vbInstance = normaliseMemberVisibility('Private Shared Sub ShowIt()\n    Status.Text = "x"\nEnd Sub', 'vb', ['Status'], []);
        t.ok(/^Private Sub ShowIt/.test(vbInstance.member), 'vis-vb', 'and Shared is dropped when a control is used');
    }

    // ---------------- wiring a new handler into the form ----------------
    {
        const axaml = [
            '<chrome:ChromeWindow x:Class="Demo.MainWindow" Title="Demo">',
            '  <StackPanel>',
            '    <Button x:Name="Save" Content="Save"/>',
            '    <TextBox Name=\'Status\'/>',
            '    <Button x:Name="Cancel" Click="Cancel_Click"/>',
            '  </StackPanel>',
            '</chrome:ChromeWindow>'
        ].join('\n');
        const controls = knownControlNames(axaml);
        t.equal(controls.join(','), 'Save,Status,Cancel', 'xaml', 'the form\'s control names are read');

        t.equal(handlerFromMemberName('Save_Click', controls)?.event, 'Click', 'handler',
            'a new member called <Control>_<Event> is recognised as a handler');
        t.equal(handlerFromMemberName('Status_TextChanged', controls)?.control, 'Status', 'handler', 'for any real control');
        t.equal(handlerFromMemberName('Save_Click', ['Nothing']), undefined, 'handler',
            'but only for a control that exists in the form');
        t.equal(handlerFromMemberName('Nonsense_Thing', controls), undefined, 'handler', 'and only for a real event');
        t.equal(handlerFromMemberName('SortArray', controls), undefined, 'handler', 'a plain function is not a handler');

        const wired = addXamlEventAttribute(axaml, 'Save', 'Click', 'Save_Click');
        t.ok(/<Button x:Name="Save" Click="Save_Click" Content="Save"\/>/.test(wired), 'xaml-wire',
            'the attribute goes right after the name, leaving the rest of the tag alone');
        t.equal(addXamlEventAttribute(axaml, 'Cancel', 'Click', 'Cancel_Click'), undefined, 'xaml-wire',
            'nothing is offered when the event is already wired');
        t.equal(addXamlEventAttribute(axaml, 'Missing', 'Click', 'Missing_Click'), undefined, 'xaml-wire',
            'or when the control is not in the form');
        t.ok(/<TextBox Name='Status' TextChanged="Status_TextChanged"\/>/.test(addXamlEventAttribute(axaml, 'Status', 'TextChanged', 'Status_TextChanged')), 'xaml-wire',
            'single quotes are as good as double ones');
    }

    // ---------------- the last conveniences ----------------
    {
        const type = enclosingTypeSpan(CS_FILE, 15, 'cs');
        const member = 'private static int[] Sorted(int[] v)\n{\n    return v.OrderBy(x => x).ToArray();\n}';
        const added = addMemberToFile({
            text: CS_FILE, caretLine: 14, member, usings: ['using System.Linq;'], type, language: 'cs'
        });
        t.equal(added.added.join(','), 'using System.Linq;', 'usings', 'the using the member asked for is added');
        t.ok(/using Avalonia\.Controls;\nusing System\.Linq;/.test(added.text), 'usings',
            'and it goes after the last existing using, where it compiles');
        t.ok(/private static int\[\] Sorted/.test(added.text), 'usings', 'with the member in the file too');

        const twice = addMemberToFile({
            text: added.text, caretLine: 14, member, usings: ['using System.Linq;'], type, language: 'cs'
        });
        t.equal(twice.added.length, 0, 'usings',
            'applying the same thing again adds no second using — the header cannot be damaged twice');
        t.equal(twice.text.match(/using System\.Linq;/g).length, 1, 'usings', 'exactly one copy in the file');

        const vbType = enclosingTypeSpan(VB_FILE, 6, 'vb');
        const vbAdded = addMemberToFile({
            text: VB_FILE, caretLine: 6, language: 'vb', type: vbType,
            member: 'Private Shared Function Sorted(values() As Integer) As Integer()\n    Return values\nEnd Function',
            usings: ['Imports System.Linq']
        });
        t.ok(/Imports Avalonia\.Controls\nImports System\.Linq/.test(vbAdded.text), 'usings-vb',
            'VB Imports go after the last Imports');
        t.ok(/Imports System\.Linq[\s\S]*Partial Public Class/.test(vbAdded.text), 'usings-vb',
            'and before the class, never inside it');
    }

    // ---------------- the parts that only exist in the command ----------------
    {
        const ui = read('src/assistantUi.ts');
        t.ok(/if \(!span\) \{\n\s+await createMemberInClass/.test(ui), 'command',
            'the caret being outside every method now *branches* instead of refusing');
        t.ok(!/Put the caret inside the method you want written/.test(ui), 'command',
            'and the old refusal — which made this feature impossible — is gone');
        t.ok(/async function createMemberInClass/.test(ui), 'command', 'the new path is its own, readable step');
        t.ok(/enclosingTypeSpan\(text, caretLine, language\)/.test(ui), 'command',
            'it refuses a caret that is not inside a class, rather than guessing an anchor');
        t.ok(/That line is not inside a class/.test(ui), 'command', 'and says so in words');
        t.ok(/already has a member called \$\{named\}\(\)/.test(ui), 'command',
            'a name the developer spelled out is checked against the class before a model call is spent');
        t.ok(/already has a member called \$\{name\}\(\)/.test(ui), 'command',
            'and the answer\'s own name is checked again — the refusal cannot be worked around by the model');
        t.ok(/normaliseMemberVisibility\(code, target\.language, target\.controls, target\.members, name\)/.test(ui),
            'command', 'visibility is corrected before the diff, never after Apply');
        t.ok(/kind: 'replace', span/.test(ui) && /kind: 'insert'/.test(ui), 'command',
            'one request path, one diff, one Apply button — the target says which of the two it is');
        t.ok(/async function offerWiring/.test(ui), 'command',
            'and a new handler offers to wire the event in the form');
        t.ok(/addXamlEventAttribute\(text, w\.control, w\.event, w\.handler\)/.test(ui), 'command',
            'through the tested text edit, on an undoable WorkspaceEdit');
        t.ok(/if \(pick !== 'Wire it'\) return;/.test(ui), 'command', 'offered, never assumed — the form is a different file');

        // --- the diff switch (asked 2026-09-16): review first, or write it straight in ---
        t.ok(/if \(!cfg\.showDiff\) \{/.test(ui), 'command',
            'the command honours "no diff" — the same code path, without the review step');
        t.ok(/const written = await writeProposal\(document, anchor, code\);/.test(ui), 'command',
            'and writes it through the very function the Apply button uses, so the two cannot diverge');
        t.ok(/Applied \$\{name\}\(\) without showing a diff/.test(ui), 'command',
            'saying in the log that the review step was skipped, and why');
        t.ok(/'Undo'/.test(ui) && /executeCommand\('undo'\)/.test(ui), 'command',
            'offering Undo by name — in that mode the change is already in the file');
        t.ok(/showDiff: cfg\.get<boolean>\('showDiff', true\)/.test(read('src/assistantUi.ts')), 'command',
            'read at the one place every entry point shares');
    }

    // ---------------- the small conveniences ----------------
    {
        t.equal(sniffMemberName("Create a function named 'SortArray' that sorts a passed array"), 'SortArray', 'sniff',
            'the name in the sentence is caught before a model call is spent');
        t.equal(sniffMemberName('Create a function called SortArray'), 'SortArray', 'sniff', 'without quotes too');
        t.equal(sniffMemberName('sort the rows in the grid'), undefined, 'sniff', 'and nothing is guessed otherwise');

        t.equal(alreadyImported('using System;\nusing System.Linq;', 'using System.Linq;'), true, 'imports',
            'a using the file already has is not added twice');
        t.equal(alreadyImported('using System;', 'using System.Linq;'), false, 'imports', 'a new one is kept');
        t.equal(alreadyImported('Imports System\nImports System.Linq', 'Imports System.Linq'), true, 'imports-vb',
            'the same for VB Imports');
    }
};
