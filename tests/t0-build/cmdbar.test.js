/* T0 — the GrumpyCommandBar's sample file dialogs must COMPILE in a generated project, in both
 * languages.
 *
 * Why a build test and not a text check: the bar's toolbox snippet carries `Click="…Open_Click"` /
 * `Click="…Save_Click"`, and the designer answers those attributes by writing the two handlers into
 * the form's code-behind. A handler with the wrong signature — or one that is simply missing — is not
 * a style problem: the language server stays quiet and `dotnet build` fails the XAML with AVLN3000
 * ("Unable to find suitable setter or adder…"), which is the failure that already took the user's app
 * down once over the Timer's Tick. The dialog API is the other half: `TopLevel.GetTopLevel(this)`,
 * `OpenFilePickerAsync`, `FindControl<T>`, and — in VB — `Await` inside an `Async Sub`, none of which
 * a grep can prove.
 *
 * So this layer drops the PRODUCTION snippet (fetched from the real host, exactly as the toolbox does)
 * into a generated project, lets `insertCommandBarFileHandlers` write the handlers the way the drop
 * does, and compiles it. 2 dotnet builds, which is why it lives in T0 with the other project builds.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { Uri } = require('vscode');
const { generateProject, dotnetBuild } = require('../helpers/build');
const { startHost } = require('../helpers/host');
const { insertCommandBarFileHandlers, commandBarFileHandlers } = require('../../out/codeBehind.js');

/** Puts the bar into the blank form's Body canvas, with the namespace it needs declared on the root. */
function placeBar(dir, snippet) {
    const axamlPath = path.join(dir, 'MainWindow.axaml');
    let axaml = fs.readFileSync(axamlPath, 'utf8');
    if (!axaml.includes('xmlns:chrome=')) {
        axaml = axaml.replace('<Window xmlns="https://github.com/avaloniaui"',
            '<Window xmlns="https://github.com/avaloniaui"\n        xmlns:chrome="using:AvaloniaChrome"');
    }
    axaml = axaml.replace('<Canvas Name="Body">', `<Canvas Name="Body">\n            ${snippet}`);
    fs.writeFileSync(axamlPath, axaml, 'utf8');
    return axamlPath;
}

module.exports = async (t) => {
    t.section('T0: the command bar\'s sample file dialogs compile');

    // The snippet the user gets, straight from the host — the same message the toolbox drop reads.
    const host = await startHost(45917);
    let snippet = '';
    let barName = '';
    try {
        const r = await host.snippet('GrumpyCommandBar');
        snippet = r.xaml;
        barName = r.name;
        t.ok(!!snippet && !!barName, 'snippet', 'the host answers with the bar snippet',
            `${barName}: ${snippet.slice(0, 60)}…`);
        t.ok(snippet.includes(`Click="${barName}Open_Click"`) && snippet.includes(`Click="${barName}Save_Click"`),
            'snippet', 'whose buttons are wired to the two dialog handlers');
    } finally {
        host.close();
    }
    if (!snippet || !barName) return;

    let failures = 0;
    for (const language of ['cs', 'vb']) {
        const name = language === 'cs' ? 'CmdBarSampleCs' : 'CmdBarSampleVb';
        const dir = generateProject({ language, tplId: 'blank', name });
        const axamlPath = placeBar(dir, snippet);
        // …and the handlers, exactly as the drop path writes them.
        await insertCommandBarFileHandlers(Uri.file(axamlPath), barName);

        const behindPath = path.join(dir, language === 'cs' ? 'MainWindow.axaml.cs' : 'MainWindow.axaml.vb');
        const behind = fs.readFileSync(behindPath, 'utf8');
        const names = commandBarFileHandlers(barName);
        t.ok(behind.includes(names.open) && behind.includes(names.save), 'handlers',
            `${language}: both handlers were written into the form's code-behind`);
        t.ok(/OpenFilePickerAsync/.test(behind) && /SaveFilePickerAsync/.test(behind), 'handlers',
            `${language}: they call the real pickers (the dialog is the point of the sample)`);

        const build = dotnetBuild(path.join(dir, language === 'cs' ? `${name}.csproj` : `${name}.vbproj`));
        if (!build.ok) failures++;
        t.ok(build.ok, 'build', `${language}: the form with the bar and its handlers builds`, build.summary
            || (build.output || '').split('\n').filter((l) => /error|AVLN/i.test(l)).slice(0, 6).join('\n'));
        // A build that succeeded for the wrong reason (the snippet never made it into the form) would
        // prove nothing, so the XAML is checked for the attribute the handlers answer.
        const written = fs.readFileSync(axamlPath, 'utf8');
        t.ok(written.includes(`Click="${names.open}"`), 'build',
            `${language}: the compiled form really carries the Click attribute`);
    }
    t.equal(failures, 0, 'build', 'both languages compile', `${failures} failing build(s)`);
};
