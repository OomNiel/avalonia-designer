// ===========================================================================
// projectScaffold.ts — Pure project-file generator for the "New Project" tool.
//
// No `vscode` dependency on purpose: this module can be loaded and tested in
// plain Node so we can verify every generated project builds (dotnet build).
//
// Stack (user decision 2026-08-24): net10.0 + Avalonia 12.1.1. New projects now use the
// DEFAULT Avalonia title bar (plain <Window> root). The ChromeWindow.cs/.vb + AnchorHelper
// files are still bundled (copy-always, user decision 2026-08-30) so the designer's
// "Custom Title Bar" tool can convert a form later without a copy step. ExifImageLoader.cs/.vb
// is bundled the same way (2026-09-08) so a Data-Image bound Image can load JPEGs upright.
// ===========================================================================

import {
    FormTemplate,
    buildAxaml,
    buildCsCodeBehind,
    buildVbCodeBehind,
    sanitize
} from './formTemplates';
import { withDesignerHeader } from './xamlHeader';

const AVALONIA_VERSION = '12.1.1';
const TARGET_FRAMEWORK = 'net10.0';
const MAIN_FORM_NAME = 'MainWindow';
// Hardcopy printing on the chart controls (GrumpyCharts) is compiled in behind PRINT_SUPPORT.
// Avae.Printables provides the native print dialog (platform services); AvaloniaUI.PrintToPDF
// provides cross-platform PDF export via Skia. Generated projects define PRINT_SUPPORT, reference
// both packages and call AppBuilder.UsePrintables() — see csproj()/vbproj() and programCs()/programVb().
const AVAE_PRINTABLES_VERSION = '3.0.7';
const AVALONIAUI_PRINTTOPDF_VERSION = '0.6.0';
// Exported so the designer can offer the same two packages to an existing project (see printSupport.ts)
// without a second copy of the version numbers to keep in step.
export { AVAE_PRINTABLES_VERSION, AVALONIAUI_PRINTTOPDF_VERSION };

export interface ScaffoldOptions {
    language: 'cs' | 'vb';
    tpl: FormTemplate;
    name: string;          // project/folder name (namespace is sanitized from this)
    projectPath: string;   // destination folder (must NOT exist yet)
    chromeCs: string;      // contents of ChromeWindow.cs (bundled resource)
    chromeVb: string;      // contents of ChromeWindow.vb (bundled resource)
    anchorCs: string;      // contents of AnchorHelper.cs (bundled resource)
    anchorVb: string;      // contents of AnchorHelper.vb (bundled resource)
    /** Contents of ExifImageLoader.cs (bundled resource — EXIF-aware image loading used by
     *  Data-Image bound Images). Optional: when omitted the file is not written, so tests that
     *  don't care about images keep generating exactly the old file set. */
    exifCs?: string;
    /** Contents of ExifImageLoader.vb (bundled resource — see exifCs). Optional. */
    exifVb?: string;
    /** Contents of GrumpyPanel.cs (bundled resource — the GrumpyPanel docking-region Border
     *  control). Optional: when omitted the file is not written (tests without GrumpyPanel stay
     *  byte-identical to before). */
    grumpyCs?: string;
    /** Contents of GrumpyPanel.vb (bundled resource — see grumpyCs). Optional. */
    grumpyVb?: string;
    /** Contents of PathPicker.cs (bundled resource — the file/folder selection row used by the
     *  File / Folder Selector tools). Optional: when omitted the file is not written, so tests
     *  that don't care about it keep generating exactly the old file set. */
    pathPickerCs?: string;
    /** Contents of PathPicker.vb (bundled resource — see pathPickerCs). Optional. */
    pathPickerVb?: string;
    /** Contents of GrumpyCharts.cs (bundled resource — the chart control set behind the Charts
     *  tools: a line plot and an X,Y plot). Optional, like the other bundled files. */
    chartsCs?: string;
    /** Contents of GrumpyCharts.vb (bundled resource — see chartsCs). Optional. */
    chartsVb?: string;
    /** Contents of GrumpyPrint.cs (bundled resource — the CUPS printer path the chart falls back to
     *  when the platform has no Avae.Printables service of its own: a plain Linux desktop installs
     *  the library's API-only asset, so nothing registers `Printable.Default` there). GrumpyCharts
     *  calls it whenever PRINT_SUPPORT is on, so the two files are copied together. Optional, like
     *  the other bundled files. */
    grumpyPrintCs?: string;
    /** Contents of GrumpyPrint.vb (bundled resource — see grumpyPrintCs). Optional. */
    grumpyPrintVb?: string;
    /** Contents of GrumpySheet.cs (bundled resource — the AvaloniaSpreadsheet spreadsheet control
     *  behind the Toolbox's Spreadsheet tool). Optional, like the other bundled files. */
    sheetCs?: string;
    /** Contents of GrumpySheet.vb (bundled resource — see sheetCs). Optional. */
    sheetVb?: string;
    /** Contents of ColumnFollower.cs (bundled resource — the live one-column view a read-only
     *  control follows a bound DataGrid with). Optional: when omitted the file is not written, so
     *  tests that don't care about followers keep generating exactly the old file set. */
    followerCs?: string;
    /** Contents of ColumnFollower.vb (bundled resource — see followerCs). Optional. */
    followerVb?: string;
    /** Absolute path to the VB.NET Companion LanguageServer.dll found on THIS machine (may be
     *  undefined). When set, VB projects get a .vscode/settings.json that wires the language
     *  bridge to it; when absent, no settings.json is written — so a generated project never
     *  carries another machine's hardcoded path (see §66 portability fix). */
    vbBridgeDll?: string;
}

/** Writes a complete, ready-to-run Avalonia project into projectPath. */
export function generateProjectScaffold(opts: ScaffoldOptions): void {
    const { language, tpl, name, projectPath, chromeCs, chromeVb, anchorCs, anchorVb, exifCs, exifVb, grumpyCs, grumpyVb, pathPickerCs, pathPickerVb, chartsCs, chartsVb, grumpyPrintCs, grumpyPrintVb, sheetCs, sheetVb, followerCs, followerVb, vbBridgeDll } = opts;
    const rootNamespace = sanitize(name);
    const formName = MAIN_FORM_NAME;

    if (language === 'cs') {
        write(projectPath, `${name}.csproj`, csproj(rootNamespace));
        write(projectPath, 'App.axaml', appAxaml(rootNamespace));
        write(projectPath, 'Program.cs', programCs(rootNamespace));
        write(projectPath, 'ChromeWindow.cs', chromeCs);
        write(projectPath, 'AnchorHelper.cs', anchorCs);
        if (exifCs) write(projectPath, 'ExifImageLoader.cs', exifCs);
        if (grumpyCs) write(projectPath, 'GrumpyPanel.cs', grumpyCs);
        if (pathPickerCs) write(projectPath, 'PathPicker.cs', pathPickerCs);
        if (chartsCs) write(projectPath, 'GrumpyCharts.cs', chartsCs);
        if (grumpyPrintCs) write(projectPath, 'GrumpyPrint.cs', grumpyPrintCs);
        if (sheetCs) write(projectPath, 'GrumpySheet.cs', sheetCs);
        if (followerCs) write(projectPath, 'ColumnFollower.cs', followerCs);
        write(projectPath, 'MainWindow.axaml', buildAxaml(tpl, formName, 'Window', rootNamespace, rootNamespace));
        write(projectPath, 'MainWindow.axaml.cs', buildCsCodeBehind(formName, 'Window', rootNamespace, tpl.handlers));
    } else {
        write(projectPath, `${name}.vbproj`, vbproj(rootNamespace));
        write(projectPath, 'App.axaml', appAxaml(rootNamespace));
        write(projectPath, 'Program.vb', programVb());
        write(projectPath, 'ChromeWindow.vb', chromeVb);
        write(projectPath, 'AnchorHelper.vb', anchorVb);
        if (exifVb) write(projectPath, 'ExifImageLoader.vb', exifVb);
        if (grumpyVb) write(projectPath, 'GrumpyPanel.vb', grumpyVb);
        if (pathPickerVb) write(projectPath, 'PathPicker.vb', pathPickerVb);
        if (chartsVb) write(projectPath, 'GrumpyCharts.vb', chartsVb);
        if (grumpyPrintVb) write(projectPath, 'GrumpyPrint.vb', grumpyPrintVb);
        if (sheetVb) write(projectPath, 'GrumpySheet.vb', sheetVb);
        if (followerVb) write(projectPath, 'ColumnFollower.vb', followerVb);
        write(projectPath, 'MainWindow.axaml', buildAxaml(tpl, formName, 'Window', rootNamespace, rootNamespace));
        write(projectPath, 'MainWindow.axaml.vb', buildVbCodeBehind(formName, 'Window', tpl.handlers));
        // VB.NET Companion language-server bridge. Written ONLY when the generator located the
        // extension's LanguageServer.dll on this machine (vbBridgeDll) — otherwise nothing is
        // written, so a generated project never bakes in another machine's path (the global
        // vbnetcompanion settings already cover users who have the bridge configured).
        if (vbBridgeDll) {
            write(projectPath, '.vscode/settings.json', vbSettingsJson(vbBridgeDll));
        }
    }
    // F5-ready .NET debugging on any OS (Linux/macOS/Windows): the standard `coreclr` debugger
    // launches the BUILT ASSEMBLY — never a Windows-only ".exe" path — and F5 / Ctrl+Shift+B run
    // the default "build" task first (with the global task.saveBeforeRun setting on, that also
    // saves every open file before each build).
    write(projectPath, '.vscode/launch.json', launchJson());
    write(projectPath, '.vscode/tasks.json', tasksJson());
}

function write(projectPath: string, relPath: string, content: string): void {
    const fullPath = require('path').join(projectPath, relPath);
    require('fs').mkdirSync(require('path').dirname(fullPath), { recursive: true });
    require('fs').writeFileSync(fullPath, content, 'utf8');
}

// ---------------------------------------------------------------------------
// File templates
// ---------------------------------------------------------------------------

function csproj(ns: string): string {
    return `<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>${TARGET_FRAMEWORK}</TargetFramework>
    <Nullable>enable</Nullable>
    <RootNamespace>${ns}</RootNamespace>
    <!-- Compiles the bundled GrumpyCharts.cs "Print…"/"Print to PDF…" menu entries + methods
         (Avae.Printables + AvaloniaUI.PrintToPDF). Omitted in the headless PreviewerHost, which
         links the same file but carries no printer packages. -->
    <DefineConstants>$(DefineConstants);PRINT_SUPPORT</DefineConstants>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Avalonia" Version="${AVALONIA_VERSION}" />
    <PackageReference Include="Avalonia.Desktop" Version="${AVALONIA_VERSION}" />
    <PackageReference Include="Avalonia.Themes.Fluent" Version="${AVALONIA_VERSION}" />
    <PackageReference Include="Avalonia.Fonts.Inter" Version="${AVALONIA_VERSION}" />
    <PackageReference Include="Avalonia.Controls.DataGrid" Version="${AVALONIA_VERSION}" />
    <!-- Hardcopy output for the chart controls (see GrumpyCharts.cs #if PRINT_SUPPORT). -->
    <PackageReference Include="Avae.Printables" Version="${AVAE_PRINTABLES_VERSION}" />
    <PackageReference Include="AvaloniaUI.PrintToPDF" Version="${AVALONIAUI_PRINTTOPDF_VERSION}" />
  </ItemGroup>

</Project>
`;
}

function vbproj(ns: string): string {
    return `<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>${TARGET_FRAMEWORK}</TargetFramework>
    <Nullable>enable</Nullable>
    <BuiltInComInteropSupport>true</BuiltInComInteropSupport>
    <RootNamespace>${ns}</RootNamespace>
    <!-- Compiles the bundled GrumpyCharts.vb "Print…"/"Print to PDF…" menu entries +
         methods (Avae.Printables + AvaloniaUI.PrintToPDF).
         VB only: vbc's /define: switch is COMMA-separated, and the SDK builds
         FinalDefineConstants from $(DefineConstants) itself — so PRINT_SUPPORT has to be
         appended HERE as a comma token. Two forms that look right and are not:
           • the C# idiom  $(DefineConstants);PRINT_SUPPORT  is handed to vbc verbatim and
             fails with BC31030 ("Conditional compilation constant '; ^^ ^^ PRINT_SUPPORT'
             is not valid");
           • setting FinalDefineConstants in a BeforeTargets="VbcCompile" target is
             overwritten again before the compiler runs — the build succeeds and the
             #If PRINT_SUPPORT block is silently compiled OUT (which is worse, because
             nothing tells you the feature is missing).
         DEBUG/TRACE are untouched: they are added by the SDK, not by this line. -->
    <DefineConstants>$(DefineConstants),PRINT_SUPPORT</DefineConstants>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Avalonia" Version="${AVALONIA_VERSION}" />
    <PackageReference Include="Avalonia.Desktop" Version="${AVALONIA_VERSION}" />
    <PackageReference Include="Avalonia.Themes.Fluent" Version="${AVALONIA_VERSION}" />
    <PackageReference Include="Avalonia.Fonts.Inter" Version="${AVALONIA_VERSION}" />
    <PackageReference Include="Avalonia.Controls.DataGrid" Version="${AVALONIA_VERSION}" />
    <!-- Hardcopy output for the chart controls (see GrumpyCharts.vb #If PRINT_SUPPORT). -->
    <PackageReference Include="Avae.Printables" Version="${AVAE_PRINTABLES_VERSION}" />
    <PackageReference Include="AvaloniaUI.PrintToPDF" Version="${AVALONIAUI_PRINTTOPDF_VERSION}" />
  </ItemGroup>

</Project>
`;
}

function appAxaml(ns: string): string {
    return withDesignerHeader(appAxamlBody(ns));
}

function appAxamlBody(ns: string): string {
    return `<Application xmlns="https://github.com/avaloniaui"
             xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
             x:Class="${ns}.App"
             RequestedThemeVariant="Default">
    <Application.Styles>
        <FluentTheme />
        <!-- DataGrid (Avalonia.Controls.DataGrid package) ships its own control theme -->
        <StyleInclude Source="avares://Avalonia.Controls.DataGrid/Themes/Fluent.xaml"/>
    </Application.Styles>
</Application>
`;
}

function programCs(ns: string): string {
    return `using System;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Avae.Printables;
using AvaloniaChrome;

namespace ${ns};

public partial class App : Application
{
    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
            desktop.MainWindow = new MainWindow();
        base.OnFrameworkInitializationCompleted();
    }
}

public static class Program
{
    [STAThread]
    public static void Main(string[] args) =>
        BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);

    public static AppBuilder BuildAvaloniaApp() =>
        AppBuilder.Configure<App>().UsePlatformDetect().UsePrintables().LogToTrace();
}
`;
}

function programVb(): string {
    return `Imports Avalonia
Imports Avalonia.Controls
Imports Avalonia.Controls.ApplicationLifetimes
Imports Avalonia.Markup.Xaml
Imports Avae.Printables

Public Class App
    Inherits Application

    Public Overrides Sub Initialize()
        AvaloniaXamlLoader.Load(Me)
    End Sub

    Public Overrides Sub OnFrameworkInitializationCompleted()
        If TypeOf ApplicationLifetime Is ClassicDesktopStyleApplicationLifetime Then
            Dim desktop = DirectCast(ApplicationLifetime, ClassicDesktopStyleApplicationLifetime)
            desktop.MainWindow = New MainWindow()
        End If
        MyBase.OnFrameworkInitializationCompleted()
    End Sub
End Class

Module Program
    Sub Main(args As String())
        BuildAvaloniaApp().StartWithClassicDesktopLifetime(args)
    End Sub

    Function BuildAvaloniaApp() As AppBuilder
        Return AppBuilder.Configure(Of App)() _
            .UsePlatformDetect() _
            .UsePrintables() _
            .LogToTrace()
    End Function
End Module
`;
}

function vbSettingsJson(dllPath: string): string {
    return `{
    "vbnetcompanion.enableLanguageClientBridge": true,
    "vbnetcompanion.enableBridgeForCSharp": true,
    "vbnetcompanion.enableBridgeForVisualBasic": true,
    "vbnetcompanion.languageClientServerCommand": "dotnet",
    "vbnetcompanion.languageClientServerArgs": [
        ${JSON.stringify(dllPath)},
        "--stdio"
    ]
}
`;
}

function launchJson(): string {
    return `{
    // F5-ready .NET (coreclr) debugging — works on Linux, macOS and Windows. The program is the
    // BUILT ASSEMBLY (no ".exe" — that Windows convention doesn't apply on Linux/macOS), and F5
    // runs the "build" task first (with task.saveBeforeRun on, all open files are saved too).
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Launch",
            "type": "coreclr",
            "request": "launch",
            "preLaunchTask": "build",
            "program": "\${workspaceFolder}/bin/Debug/${TARGET_FRAMEWORK}/\${workspaceFolderBasename}.dll",
            "args": [],
            "cwd": "\${workspaceFolder}",
            "console": "internalConsole",
            "stopAtEntry": false
        },
        {
            "name": "Attach",
            "type": "coreclr",
            "request": "attach",
            "processId": "\${command:pickProcess}"
        }
    ]
}
`;
}

function tasksJson(): string {
    return `{
    "version": "2.0.0",
    "tasks": [
        {
            // Default build task (Ctrl+Shift+B, or F5's preLaunchTask). With the global
            // task.saveBeforeRun setting on, every open file is saved before this runs.
            "label": "build",
            "type": "shell",
            "command": "dotnet build",
            "group": {
                "kind": "build",
                "isDefault": true
            },
            "problemMatcher": "$msCompile"
        }
    ]
}
`;
}
