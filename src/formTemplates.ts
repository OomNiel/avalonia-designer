// ===========================================================================
// formTemplates.ts — Pure form-template engine shared by the "New Form" tool
// (newForm.ts) and the project generator (projectScaffold.ts / projectCreator.ts).
//
// No `vscode` dependency on purpose: this module can be loaded and tested in
// plain Node so we can verify every generated template builds.
// ===========================================================================

export interface FormHandler {
    name: string;    // control name, e.g. "btnLogin"
    event: string;   // event, e.g. "Click" -> handler "btnLogin_Click"
    body?: string;   // optional C# body lines (indented 8 spaces)
    bodyVb?: string; // optional VB body lines (indented 8 spaces)
}

export interface FormTemplate {
    id: string;
    label: string;
    description: string;
    fixedKind?: 'Window' | 'UserControl'; // fixed base type; blank lets the user choose
    size: { w: number; h: number };
    extraRoot?: string;
    title: (name: string) => string;
    body: (name: string, size: { w: number; h: number }) => string;
    handlers: FormHandler[];
}

/** Ready-to-build starting points aimed at novice users. */
export const TEMPLATES: FormTemplate[] = [
    {
        id: 'blank',
        label: 'Blank form',
        description: 'An empty form (Window or UserControl) with a free-form Canvas that resizes with the window',
        size: { w: 800, h: 450 },
        title: (name) => name,
        body: () => `    <DockPanel Name="Root">
        <Canvas Name="Body">
            <TextBlock Text="Drop controls here from the Toolbox" FontSize="14"
                       Canvas.Left="16" Canvas.Top="12"/>
        </Canvas>
    </DockPanel>`,
        handlers: []
    },
    {
        id: 'login',
        label: 'Login form',
        description: 'Username + password fields with a Sign In button',
        fixedKind: 'Window',
        size: { w: 340, h: 260 },
        extraRoot: 'WindowStartupLocation="CenterScreen" CanResize="False"',
        title: () => 'Login',
        body: () => `    <StackPanel Margin="24" Spacing="12" VerticalAlignment="Center">
        <TextBlock Text="Please sign in" FontSize="18" FontWeight="Bold" HorizontalAlignment="Center"/>
        <TextBox x:Name="txtUser" PlaceholderText="Username"/>
        <TextBox x:Name="txtPass" PlaceholderText="Password" PasswordChar="*"/>
        <Button x:Name="btnLogin" Content="Sign In" HorizontalAlignment="Center" Click="btnLogin_Click"/>
        <TextBlock x:Name="lblMessage" Text="" Foreground="Red" HorizontalAlignment="Center"/>
    </StackPanel>`,
        handlers: [{ name: 'btnLogin', event: 'Click' }]
    },
    {
        id: 'dataentry',
        label: 'Data entry form',
        description: 'A grid of labelled fields with a Save button',
        fixedKind: 'Window',
        size: { w: 380, h: 320 },
        extraRoot: 'WindowStartupLocation="CenterScreen" CanResize="False"',
        title: () => 'Data Entry',
        body: () => `    <Grid Margin="24">
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>
        <Grid.ColumnDefinitions>
            <ColumnDefinition Width="90"/><ColumnDefinition Width="*"/>
        </Grid.ColumnDefinitions>
        <TextBlock Text="First name:" Grid.Row="0" Grid.Column="0" VerticalAlignment="Center"/>
        <TextBox x:Name="txtFirst" Grid.Row="0" Grid.Column="1"/>
        <TextBlock Text="Last name:" Grid.Row="1" Grid.Column="0" VerticalAlignment="Center"/>
        <TextBox x:Name="txtLast" Grid.Row="1" Grid.Column="1"/>
        <TextBlock Text="Email:" Grid.Row="2" Grid.Column="0" VerticalAlignment="Center"/>
        <TextBox x:Name="txtEmail" Grid.Row="2" Grid.Column="1"/>
        <TextBlock Text="Age:" Grid.Row="3" Grid.Column="0" VerticalAlignment="Center"/>
        <TextBox x:Name="txtAge" Grid.Row="3" Grid.Column="1"/>
        <Button x:Name="btnSave" Content="Save" Grid.Row="4" Grid.Column="1" HorizontalAlignment="Right" Margin="0,12,0,0" Click="btnSave_Click"/>
    </Grid>`,
        handlers: [{ name: 'btnSave', event: 'Click' }]
    },
    {
        id: 'about',
        label: 'About dialog',
        description: 'A small centred dialog with an OK button',
        fixedKind: 'Window',
        size: { w: 360, h: 220 },
        extraRoot: 'WindowStartupLocation="CenterOwner" CanResize="False" ShowInTaskbar="False"',
        title: () => 'About',
        body: (name) => `    <StackPanel Margin="28" Spacing="12" VerticalAlignment="Center">
        <TextBlock Text="${name}" FontSize="22" FontWeight="Bold" HorizontalAlignment="Center"/>
        <TextBlock Text="Version 1.0" HorizontalAlignment="Center"/>
        <TextBlock Text="A short description of your application." TextWrapping="Wrap" HorizontalAlignment="Center"/>
        <Button x:Name="btnOk" Content="OK" HorizontalAlignment="Center" Width="90" Click="btnOk_Click"/>
    </StackPanel>`,
        handlers: [{ name: 'btnOk', event: 'Click', body: '        Close();', bodyVb: '        Me.Close()' }]
    },
    {
        id: 'mainwin',
        label: 'Main window (Menu + Status bar)',
        description: 'A window with a File menu and a status bar',
        fixedKind: 'Window',
        size: { w: 640, h: 400 },
        extraRoot: 'WindowStartupLocation="CenterScreen"',
        title: () => 'Main',
        body: () => `    <DockPanel>
        <Menu x:Name="mainMenu" DockPanel.Dock="Top">
            <MenuItem Header="File">
                <MenuItem Header="Exit"/>
            </MenuItem>
        </Menu>
        <Border DockPanel.Dock="Bottom" BorderThickness="0,1,0,0" Padding="8,0">
            <TextBlock x:Name="statusText" Text="Ready" VerticalAlignment="Center"/>
        </Border>
        <TextBlock Text="Main content goes here" FontSize="14" HorizontalAlignment="Center" VerticalAlignment="Center"/>
    </DockPanel>`,
        handlers: []
    }
];

export function buildAxaml(tpl: FormTemplate, name: string, kind: string, rootNamespace: string, displayName?: string): string {
    // VB's root namespace is applied to global-namespace classes, so x:Class is fully
    // qualified in both languages (e.g. DevHelper.frmTest).
    const xClass = `${rootNamespace}.${name}`;
    // displayName (usually the project name) feeds the window Title + any name-based
    // template text; it defaults to the form name for the "New Form" tool.
    const dn = displayName || name;
    const extra = tpl.extraRoot ? ' ' + tpl.extraRoot : '';
    return `<${kind} xmlns="https://github.com/avaloniaui"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        xmlns:d="http://schemas.microsoft.com/expression/blend/2008"
        xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
        mc:Ignorable="d" d:DesignWidth="${tpl.size.w}" d:DesignHeight="${tpl.size.h}"
        x:Class="${xClass}"
        Title="${tpl.title(dn)}" Width="${tpl.size.w}" Height="${tpl.size.h}"${extra}>
${tpl.body(dn, tpl.size)}
</${kind}>
`;
}

/**
 * Builds a form rooted on the shared <chrome:ChromeWindow> titlebar component
 * (used by the project generator — mirrors the bash avalonia-form-lib build_axaml).
 * The display name (usually the sanitized project name) is used for the window
 * title and for templates that show the app name (Blank title, About body).
 *
 * IMPORTANT: the ChromeWindow reserves TitleBarHeight (44px) at the top, so the
 * WINDOW height is the design height PLUS the title bar. That way the runtime
 * body area equals the design surface — otherwise controls docked to the bottom
 * (e.g. a Status Bar in a full-height DockPanel) end up off-screen because the
 * design was taller than the visible body.
 */
export const CHROME_TITLEBAR_HEIGHT = 44;

export function buildChromeAxaml(tpl: FormTemplate, formName: string, rootNamespace: string, displayName: string): string {
    const xClass = `${rootNamespace}.${formName}`;
    const extra = tpl.extraRoot ? ' ' + tpl.extraRoot : '';
    const title = tpl.title(displayName);
    const windowH = tpl.size.h + CHROME_TITLEBAR_HEIGHT;
    return `<chrome:ChromeWindow xmlns="https://github.com/avaloniaui"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        xmlns:chrome="using:AvaloniaChrome"
        xmlns:d="http://schemas.microsoft.com/expression/blend/2008"
        xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
        mc:Ignorable="d" d:DesignWidth="${tpl.size.w}" d:DesignHeight="${windowH}"
        x:Class="${xClass}"
        Title="${title} Window" TitleBarTitle="${title}"
        Width="${tpl.size.w}" Height="${windowH}"${extra}>
${tpl.body(displayName, tpl.size)}
</chrome:ChromeWindow>
`;
}

export function buildCsCodeBehind(name: string, kind: string, rootNamespace: string, handlers: FormHandler[]): string {
    const stubs = handlers.map((h) => {
        const body = h.body ? h.body : '        // TODO: Add your code here.';
        return `\n    private void ${h.name}_${h.event}(object sender, Avalonia.Interactivity.RoutedEventArgs e)\n    {\n${body}\n    }\n`;
    }).join('');
    return `using Avalonia.Controls;

namespace ${rootNamespace};

public partial class ${name} : ${kind}
{
    public ${name}()
    {
        InitializeComponent();
    }
${stubs}}
`;
}

export function buildVbCodeBehind(name: string, kind: string, handlers: FormHandler[]): string {
    // VB convention (matches the Avalonia VB templates): InitializeComponent is NOT
    // auto-generated, so the code-behind must define it via AvaloniaXamlLoader.Load(Me).
    const stubs = handlers.map((h) => {
        const body = h.bodyVb ? h.bodyVb : '        \' TODO: Add your code here.';
        return `\n    Private Sub ${h.name}_${h.event}(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)\n${body}\n    End Sub\n`;
    }).join('');
    return `Imports Avalonia
Imports Avalonia.Controls
Imports Avalonia.Markup.Xaml

Class ${name}
    Inherits ${kind}

    Public Sub New()
        InitializeComponent()
    End Sub

    Private Sub InitializeComponent()
        AvaloniaXamlLoader.Load(Me)
    End Sub
${stubs}End Class
`;
}

export function sanitize(s: string): string {
    return s.replace(/[^A-Za-z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
}
