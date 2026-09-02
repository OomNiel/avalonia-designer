// ===========================================================================
// projectScaffold.ts — Pure project-file generator for the "New Project" tool.
//
// No `vscode` dependency on purpose: this module can be loaded and tested in
// plain Node so we can verify every generated project builds (dotnet build).
//
// Stack (user decision 2026-08-24): net10.0 + Avalonia 12.1.1. New projects now use the
// DEFAULT Avalonia title bar (plain <Window> root). The ChromeWindow.cs/.vb + AnchorHelper
// files are still bundled (copy-always, user decision 2026-08-30) so the designer's
// "Custom Title Bar" tool can convert a form later without a copy step.
// ===========================================================================

import {
    FormTemplate,
    buildAxaml,
    buildCsCodeBehind,
    buildVbCodeBehind,
    sanitize
} from './formTemplates';

const AVALONIA_VERSION = '12.1.1';
const TARGET_FRAMEWORK = 'net10.0';
const MAIN_FORM_NAME = 'MainWindow';

export interface ScaffoldOptions {
    language: 'cs' | 'vb';
    tpl: FormTemplate;
    name: string;          // project/folder name (namespace is sanitized from this)
    projectPath: string;   // destination folder (must NOT exist yet)
    chromeCs: string;      // contents of ChromeWindow.cs (bundled resource)
    chromeVb: string;      // contents of ChromeWindow.vb (bundled resource)
    anchorCs: string;      // contents of AnchorHelper.cs (bundled resource)
    anchorVb: string;      // contents of AnchorHelper.vb (bundled resource)
    /** Absolute path to the VB.NET Companion LanguageServer.dll found on THIS machine (may be
     *  undefined). When set, VB projects get a .vscode/settings.json that wires the language
     *  bridge to it; when absent, no settings.json is written — so a generated project never
     *  carries another machine's hardcoded path (see §66 portability fix). */
    vbBridgeDll?: string;
}

/** Writes a complete, ready-to-run Avalonia project into projectPath. */
export function generateProjectScaffold(opts: ScaffoldOptions): void {
    const { language, tpl, name, projectPath, chromeCs, chromeVb, anchorCs, anchorVb, vbBridgeDll } = opts;
    const rootNamespace = sanitize(name);
    const formName = MAIN_FORM_NAME;

    if (language === 'cs') {
        write(projectPath, `${name}.csproj`, csproj(rootNamespace));
        write(projectPath, 'App.axaml', appAxaml(rootNamespace));
        write(projectPath, 'Program.cs', programCs(rootNamespace));
        write(projectPath, 'ChromeWindow.cs', chromeCs);
        write(projectPath, 'AnchorHelper.cs', anchorCs);
        write(projectPath, 'MainWindow.axaml', buildAxaml(tpl, formName, 'Window', rootNamespace, rootNamespace));
        write(projectPath, 'MainWindow.axaml.cs', buildCsCodeBehind(formName, 'Window', rootNamespace, tpl.handlers));
    } else {
        write(projectPath, `${name}.vbproj`, vbproj(rootNamespace));
        write(projectPath, 'App.axaml', appAxaml(rootNamespace));
        write(projectPath, 'Program.vb', programVb());
        write(projectPath, 'ChromeWindow.vb', chromeVb);
        write(projectPath, 'AnchorHelper.vb', anchorVb);
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
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Avalonia" Version="${AVALONIA_VERSION}" />
    <PackageReference Include="Avalonia.Desktop" Version="${AVALONIA_VERSION}" />
    <PackageReference Include="Avalonia.Themes.Fluent" Version="${AVALONIA_VERSION}" />
    <PackageReference Include="Avalonia.Fonts.Inter" Version="${AVALONIA_VERSION}" />
    <PackageReference Include="Avalonia.Controls.DataGrid" Version="${AVALONIA_VERSION}" />
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
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Avalonia" Version="${AVALONIA_VERSION}" />
    <PackageReference Include="Avalonia.Desktop" Version="${AVALONIA_VERSION}" />
    <PackageReference Include="Avalonia.Themes.Fluent" Version="${AVALONIA_VERSION}" />
    <PackageReference Include="Avalonia.Fonts.Inter" Version="${AVALONIA_VERSION}" />
    <PackageReference Include="Avalonia.Controls.DataGrid" Version="${AVALONIA_VERSION}" />
  </ItemGroup>

</Project>
`;
}

function appAxaml(ns: string): string {
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
        AppBuilder.Configure<App>().UsePlatformDetect().LogToTrace();
}
`;
}

function programVb(): string {
    return `Imports Avalonia
Imports Avalonia.Controls
Imports Avalonia.Controls.ApplicationLifetimes
Imports Avalonia.Markup.Xaml

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
