/* T2 — the Windows installer (src/msiBuilder.ts) and the Windows branch of the publisher.
 *
 * An MSI is even less forgiving than a .deb about a few things: a ProductVersion with more than three
 * numbers or text in it is silently truncated (and a truncated version breaks upgrades), a fresh
 * UpgradeCode per build makes every install a *second* app instead of an upgrade, and an unescaped `&`
 * in a product name produces a .wxs that will not compile. All of that is asserted here, because none of
 * it can be tried on the machine this runs on.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');
const {
    xmlEscape, msiVersion, msiFileName, msiArchitecture, winRid, stableGuid, dotnetRuntimeFor,
    wixSource, wixBuildArgs
} = require('../../out/msiBuilder.js');
const { planPublish, msiSource, windowsPublishScript } = require('../../out/projectPublisher.js');

const CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <AssemblyName>Norfolk &amp; Sons</AssemblyName>
    <Version>2.4.1-beta.2</Version>
  </PropertyGroup>
</Project>
`;

module.exports = async (t) => {
    t.section('T2: MSI builder');

    // --- MSI version: three numbers, no text (MSI truncates the rest and upgrades break) ---
    t.equal(msiVersion('1.2.3'), '1.2.3', 'version', 'plain');
    t.equal(msiVersion('v1.0.0'), '1.0.0', 'version', 'a leading v is dropped');
    t.equal(msiVersion('1.0.0-beta.2'), '1.0.0', 'version', 'text after the numbers is dropped');
    t.equal(msiVersion('2.0'), '2.0.0', 'version', 'missing parts are filled in');
    t.equal(msiVersion('1.2.3.4'), '1.2.3', 'version', 'a fourth number is dropped (MSI has three)');
    t.equal(msiVersion('300.1.2'), '255.1.2', 'version', 'major is clamped to 255');
    t.equal(msiVersion('1.2.70000'), '1.2.65535', 'version', 'build is clamped to 65535');
    t.equal(msiVersion('beta'), '1.0.0', 'version', 'garbage falls back instead of producing an invalid one');
    t.equal(msiVersion(''), '1.0.0', 'version', 'and so does empty');

    // --- architecture + RID ---
    t.equal(msiArchitecture('x64'), 'x64', 'arch', 'x64');
    t.equal(msiArchitecture('arm64'), 'arm64', 'arch', 'arm64');
    t.equal(msiArchitecture('ia32'), 'x86', 'arch', 'ia32 → x86 (the WiX name)');
    t.equal(winRid('x64'), 'win-x64', 'arch', 'win-x64 for dotnet publish');
    t.equal(winRid('x86'), 'win-x86', 'arch', 'win-x86');
    t.equal(msiFileName('myapp', '1.0.0', 'x64'), 'myapp_1.0.0_x64.msi', 'file-name', 'the file name');

    // --- UpgradeCode must be stable per app, different per app ---
    const g1 = stableGuid('upgrade:myapp');
    t.equal(g1, stableGuid('upgrade:myapp'), 'guid', 'the same seed gives the same GUID (upgrades replace)');
    t.ok(g1 !== stableGuid('upgrade:otherapp'), 'guid', 'a different app gets a different GUID');
    t.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(g1), 'guid',
        'and it is a well-formed version-4 GUID string');
    t.ok(g1 !== stableGuid('upgrade:shortcut:myapp'), 'guid', 'a different purpose gives a different GUID');

    // --- the runtime requirement comes from the TFM ---
    t.equal(dotnetRuntimeFor('net10.0').major, 10, 'runtime', 'net10.0 → major 10');
    t.ok(/^https:\/\//.test(dotnetRuntimeFor('net10.0').url), 'runtime', 'with a download URL for the message');
    t.equal(dotnetRuntimeFor('nonsense'), undefined, 'runtime', 'an unknown TFM declares nothing');

    // --- the WiX source ---
    const wxs = wixSource({
        appName: 'Norfolk & Sons',
        exeName: 'Norfolk & Sons.exe',
        version: '2.4.1',
        manufacturer: 'Grumpy <grumpy@example.com>',
        description: 'A demo app',
        upgradeCode: g1,
        payloadDir: 'C:\\proj\\obj\\publish',
        runtimeMajor: 10,
        runtimeUrl: 'https://dotnet.microsoft.com/download/dotnet/10.0'
    });
    t.ok(wxs.startsWith('<?xml version="1.0" encoding="utf-8"?>'), 'wxs', 'an XML declaration');
    t.ok(wxs.includes('xmlns="http://wixtoolset.org/schemas/v4/wxs"'), 'wxs', 'WiX v4/v5 schema (what the wix tool expects)');
    t.ok(wxs.includes('Name="Norfolk &amp; Sons"'), 'wxs', 'the product name is XML-escaped');
    t.equal(/Name="Norfolk & Sons"/.test(wxs), false, 'wxs', 'and never written raw (an & would not compile)');
    t.ok(wxs.includes('Version="2.4.1"'), 'wxs', 'the MSI-shaped version');
    t.ok(wxs.includes(`UpgradeCode="${g1}"`), 'wxs', 'the stable UpgradeCode');
    t.ok(wxs.includes('Scope="perMachine"'), 'wxs',
        'per-machine: WiX warns that <Files> harvesting in per-user packages fails ICE validation');
    t.ok(wxs.includes('<StandardDirectory Id="ProgramFiles64Folder">'), 'wxs', 'installs under Program Files');
    t.ok(wxs.includes('<MajorUpgrade'), 'wxs', 'a major upgrade replaces the previous version');
    t.ok(wxs.includes('<Files Include="C:\\proj\\obj\\publish\\**" />'), 'wxs',
        'the payload is harvested by WiX, so the file list need not be known in advance');
    t.ok(wxs.includes('<Shortcut'), 'wxs', 'a Start-menu shortcut');
    t.ok(wxs.includes('<RemoveFolder Id="RemoveAppMenuFolder" On="uninstall" />'), 'wxs',
        'and it is removed on uninstall');
    t.ok(wxs.includes('NETRUNTIME_PRESENT'), 'wxs', 'the .NET runtime is a launch condition');
    t.ok(/Key="SOFTWARE\\dotnet\\Setup\\InstalledVersions\\x64\\sharedhost"/.test(wxs), 'wxs',
        'detected through the shared host registry key');
    t.ok(wxs.includes('needs the .NET 10 runtime'), 'wxs', 'and the message says which runtime is missing');
    t.ok(wxs.includes('https://dotnet.microsoft.com'), 'wxs', 'with where to get it');
    t.equal(/dotnet-runtime/.test(wxs), false, 'wxs',
        'the MSI never carries the runtime itself — it requires it (same rule as the .deb)');
    const noRuntime = wixSource({
        appName: 'Plain', exeName: 'Plain.exe', version: '1.0.0', manufacturer: 'm', description: 'd',
        upgradeCode: g1, payloadDir: 'C:\\p'
    });
    t.equal(/NETRUNTIME_PRESENT/.test(noRuntime), false, 'wxs', 'no launch condition when no TFM is known');

    t.equal(xmlEscape('a & b <c> "d" \'e\''), 'a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;', 'escape',
        'XML escaping covers all five characters');
    t.equal(wixBuildArgs('p.wxs', 'o.msi', 'x64').join(' '), 'build -arch x64 -o o.msi p.wxs', 'build-args',
        'the WiX v4+ command line');

    // --- the Windows plan + its generated files ---
    t.section('T2: Windows publish plan');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-msi-'));
    try {
        fs.writeFileSync(path.join(dir, 'App.csproj'), CSPROJ);
        const form = path.join(dir, 'MainWindow.axaml');
        fs.writeFileSync(form, '<Window xmlns="https://github.com/avaloniaui" Title="Demo"/>\n');
        const uri = vscode.Uri.file(form);

        t.equal(planPublish(uri, 'darwin'), undefined, 'plan',
            'no plan at all for a platform whose package format is not implemented');

        const plan = planPublish(uri, 'win32');
        t.ok(!!plan, 'plan', 'a Windows plan exists');
        t.equal(plan.kind, 'msi', 'plan', 'and it is an MSI plan');
        t.equal(plan.version, '2.4.1', 'plan', 'the version is MSI-shaped (the -beta.2 is dropped)');
        t.equal(plan.architecture, msiArchitecture(process.arch), 'plan', 'host architecture');
        t.equal(plan.exeName, 'Norfolk & Sons.exe', 'plan',
            'the executable name comes from AssemblyName, with the XML entity decoded');
        t.equal(path.basename(plan.outFile), msiFileName(plan.packageName, plan.version, plan.architecture),
            'plan', 'the installer file name follows the convention');
        t.ok(plan.outFile.includes(path.join('publish')), 'plan', 'it lands in <project>/publish/');
        t.ok(plan.wxsPath.endsWith('package.wxs'), 'plan', 'a WiX source is generated beside the script');
        t.equal(plan.runtimeMajor, 10, 'plan', 'the .NET 10 runtime is required, not bundled');

        const source = msiSource(plan);
        t.ok(source.includes('Name="Norfolk &amp; Sons"'), 'source', 'the source escapes the product name');
        t.ok(source.includes('<Files Include="'), 'source', 'and harvests the payload directory');
        t.ok(source.includes(`\\${path.sep.replace(/\\/g, '')}`) || source.includes(`\\**`), 'source',
            'with a Windows wildcard, whatever platform this test runs on');

        const ps = windowsPublishScript(plan);
        t.ok(ps.includes('$ErrorActionPreference'), 'script', 'the PowerShell script fails fast');
        t.ok(ps.includes('dotnet publish'), 'script', 'it publishes');
        t.ok(ps.includes('--self-contained false'), 'script',
            'framework-dependent — the same no-bundled-runtime rule as the .deb');
        t.ok(ps.includes(`-r ${winRid(plan.architecture)}`), 'script', 'for the Windows RID');
        t.ok(ps.includes(`wix build -arch ${plan.architecture}`), 'script', 'then builds the MSI with WiX');
        t.ok(ps.includes(`'${plan.projectFile}'`), 'script', 'paths are single-quoted (safe with spaces)');
        t.ok(ps.includes('Remove-Item -Recurse -Force'), 'script',
            'the payload is cleared first, so a deleted file cannot linger in the installer');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
};
