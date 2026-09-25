' BUNDLED-COPY: 0.12.2
' PathPicker.vb — BUNDLED RESOURCE (the C# twin is resources/PathPicker.cs). Copied into every
' generated project, next to GrumpyPanel.vb / ExifImageLoader.vb.
'
' A file / folder selection row: a read-only (by default) TextBox showing the chosen path plus a
' "…" Browse button that opens the platform's own dialog. It is the Avalonia equivalent of the
' WinForms OpenFileDialog / FolderBrowserDialog pair, as a CONTROL you can drop on a form and size
' like any other control.
'
'   <chrome:PathPicker x:Name="PathPicker1" Width="180" Height="24"
'                      PathType="File"
'                      Title="Select an image"
'                      Filter="Images|*.png;*.jpg|All files|*.*"
'                      InitialFolder="C:\Pictures"
'                      SelectedPath="{Binding PhotoPath, Mode=TwoWay}"/>
'
' PROPERTIES
' ----------
'   PathType        File (open a file) | Folder (pick a folder) | SaveFile (choose where to save)
'   SelectedPath    the chosen path — TWO-WAY: your code reads it, and may pre-set/clear it
'   Title           the dialog caption
'   Filter          WinForms-style filter, e.g. "Images|*.png;*.jpg|All files|*.*" (files only)
'   InitialFolder   folder the dialog opens in when SelectedPath is empty
'   IsPathReadOnly  True (default) = pick-only; False = the user may also type/paste a path
'   BrowseText      the button's caption ("…" by default)
'   ShowIcon        True (default) = a small file/folder icon at the left edge, so a File Selector
'                   and a Folder Selector are told apart at a glance
'
' NOTES
' -----
'   * The picker uses Avalonia's StorageProvider (TopLevel.StorageProvider), so it works on Linux,
'     Windows and macOS with the platform's native dialog — no extra package.
'   * The last folder you picked in is remembered for the rest of the session (best effort).
'   * Nothing happens if the app has no TopLevel yet (e.g. in a designer preview), so it is safe to
'     place and render before the window is shown.
Imports System
Imports System.Collections.Generic
Imports System.Linq
Imports System.Threading.Tasks
Imports Avalonia
Imports Avalonia.Controls
Imports Avalonia.Data
Imports Avalonia.Layout
Imports Avalonia.Platform.Storage

Namespace Global.AvaloniaChrome

    ''' <summary>What a PathPicker asks the user for.</summary>
    Public Enum PathPickerKind
        ''' <summary>Pick an existing file (OpenFilePicker).</summary>
        File
        ''' <summary>Pick an existing folder (OpenFolderPicker).</summary>
        Folder
        ''' <summary>Pick a file to save — it need not exist yet (SaveFilePicker).</summary>
        SaveFile
    End Enum

    ''' <summary>
    ''' A path entry row (TextBox + Browse… button) that opens the platform file/folder dialog and
    ''' stores the result in SelectedPath.
    ''' </summary>
    Public Class PathPicker
        Inherits UserControl

        ''' <summary>Marker used by the designer's bundled-helper detection (keeps old copies current).</summary>
        Public Const BundledMarker As String = "PathPicker"

        ''' <summary>The chosen path. Empty while nothing has been picked. Two-way bindable.</summary>
        Public Shared ReadOnly SelectedPathProperty As StyledProperty(Of String) =
            AvaloniaProperty.Register(Of PathPicker, String)(NameOf(SelectedPath))

        ''' <summary>File / Folder / SaveFile — what the Browse button opens.</summary>
        Public Shared ReadOnly PathTypeProperty As StyledProperty(Of PathPickerKind) =
            AvaloniaProperty.Register(Of PathPicker, PathPickerKind)(NameOf(PathType), PathPickerKind.File)

        ''' <summary>The dialog's caption.</summary>
        Public Shared ReadOnly TitleProperty As StyledProperty(Of String) =
            AvaloniaProperty.Register(Of PathPicker, String)(NameOf(Title), "Select a file")

        ''' <summary>WinForms-style filter for the file pickers:
        ''' <c>"Images|*.png;*.jpg|All files|*.*"</c>. <c>"*.*"</c> is normalised to <c>"*"</c>.</summary>
        Public Shared ReadOnly FilterProperty As StyledProperty(Of String) =
            AvaloniaProperty.Register(Of PathPicker, String)(NameOf(Filter), "All files|*.*")

        ''' <summary>Folder the dialog starts in when SelectedPath is empty.</summary>
        Public Shared ReadOnly InitialFolderProperty As StyledProperty(Of String) =
            AvaloniaProperty.Register(Of PathPicker, String)(NameOf(InitialFolder))

        ''' <summary>True (default): the path box is read-only, so the value can only come from the
        ''' dialog. False: the user may also type or paste a path.</summary>
        Public Shared ReadOnly IsPathReadOnlyProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of PathPicker, Boolean)(NameOf(IsPathReadOnly), True)

        ''' <summary>The Browse button's caption ("…" by default).</summary>
        Public Shared ReadOnly BrowseTextProperty As StyledProperty(Of String) =
            AvaloniaProperty.Register(Of PathPicker, String)(NameOf(BrowseText), "…")

        ''' <summary>True (default): a small FILE or FOLDER icon is shown at the left edge, so a File
        ''' Selector and a Folder Selector look different on the form.</summary>
        Public Shared ReadOnly ShowIconProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of PathPicker, Boolean)(NameOf(ShowIcon), True)

        Private ReadOnly _box As New TextBox()
        Private ReadOnly _browse As New Button()

        ''' <summary>The kind icon at the left edge: a page for File/SaveFile, a folder for Folder.
        ''' (Fully qualified — 'Path' alone would clash with System.IO.Path.)</summary>
        Private ReadOnly _icon As New Avalonia.Controls.Shapes.Path()

        ''' <summary>The folder the last pick used — remembered for the process lifetime (best effort).</summary>
        ''' <summary>The folder the last pick used — remembered in the per-user app-data folder (see
        ''' PickerFolderMemory), so it survives a restart instead of being lost with the process.</summary>
        Private Shared Property LastFolder As String
            Get
                Return PickerFolderMemory.LastFolder
            End Get
            Set(value As String)
                PickerFolderMemory.LastFolder = value
            End Set
        End Property

        ''' <summary>Builds the row: the kind icon at the left, a fill TextBox bound to this control's
        ''' properties, and the Browse button docked right.</summary>
        Public Sub New()
            _box.VerticalAlignment = VerticalAlignment.Center
            _box.Bind(TextBox.TextProperty, New Binding(NameOf(SelectedPath)) With {.Source = Me, .Mode = BindingMode.TwoWay})
            _box.Bind(TextBox.IsReadOnlyProperty, New Binding(NameOf(IsPathReadOnly)) With {.Source = Me})
            _browse.Bind(ContentControl.ContentProperty, New Binding(NameOf(BrowseText)) With {.Source = Me})
            _browse.MinWidth = 26
            _browse.Padding = New Thickness(6, 0, 6, 0)
            _browse.Margin = New Thickness(4, 0, 0, 0)
            _browse.VerticalAlignment = VerticalAlignment.Stretch
            AddHandler _browse.Click, Async Sub(sender, e) Await BrowseAsync()
            DockPanel.SetDock(_browse, Dock.Right)
            ' The kind icon (see UpdateIcon): follow the control's text colour so it fits the theme,
            ' falling back to grey when no Foreground is set anywhere up the tree.
            _icon.Width = 14
            _icon.Height = 14
            _icon.Stretch = Avalonia.Media.Stretch.Uniform
            _icon.VerticalAlignment = VerticalAlignment.Center
            _icon.Margin = New Thickness(0, 0, 4, 0)
            _icon.Bind(Avalonia.Controls.Shapes.Shape.FillProperty,
                New Binding(NameOf(Foreground)) With {.Source = Me, .TargetNullValue = Avalonia.Media.Brushes.Gray})
            DockPanel.SetDock(_icon, Dock.Left)
            UpdateIcon()
            Content = New DockPanel With {.LastChildFill = True}
            DirectCast(Content, DockPanel).Children.Add(_icon)
            DirectCast(Content, DockPanel).Children.Add(_browse)
            DirectCast(Content, DockPanel).Children.Add(_box)
        End Sub

        ''' <summary>Redraws the left-edge icon for the current PathType: a page for a file (or save)
        ''' picker, a folder for a folder picker.</summary>
        Private Sub UpdateIcon()
            Dim folder As Boolean = PathType = PathPickerKind.Folder
            ' A folder: back tab + body. A file: a page with a folded corner.
            _icon.Data = Avalonia.Media.Geometry.Parse(If(folder,
                "M 0,3 L 5,3 L 6.6,5.2 L 14,5.2 L 14,12.4 L 0,12.4 Z",
                "M 2,0.6 L 9,0.6 L 13,4.6 L 13,13.4 L 2,13.4 Z M 9,0.6 L 9,4.6 L 13,4.6"))
            _icon.IsVisible = ShowIcon
            ToolTip.SetTip(_icon, If(folder,
                "Picks a folder",
                If(PathType = PathPickerKind.SaveFile, "Picks a file to save", "Picks a file")))
        End Sub

        ''' <summary>Keeps the icon in step with PathType / ShowIcon.</summary>
        Protected Overrides Sub OnPropertyChanged(change As AvaloniaPropertyChangedEventArgs)
            MyBase.OnPropertyChanged(change)
            If change.Property Is PathTypeProperty OrElse change.Property Is ShowIconProperty Then UpdateIcon()
        End Sub

        ''' <summary>The chosen path (see SelectedPathProperty).</summary>
        Public Property SelectedPath As String
            Get
                Return GetValue(SelectedPathProperty)
            End Get
            Set(value As String)
                SetValue(SelectedPathProperty, value)
            End Set
        End Property

        ''' <summary>What the Browse button opens (see PathTypeProperty).</summary>
        Public Property PathType As PathPickerKind
            Get
                Return GetValue(PathTypeProperty)
            End Get
            Set(value As PathPickerKind)
                SetValue(PathTypeProperty, value)
            End Set
        End Property

        ''' <summary>The dialog's caption (see TitleProperty).</summary>
        Public Property Title As String
            Get
                Return GetValue(TitleProperty)
            End Get
            Set(value As String)
                SetValue(TitleProperty, value)
            End Set
        End Property

        ''' <summary>The file filter (see FilterProperty).</summary>
        Public Property Filter As String
            Get
                Return GetValue(FilterProperty)
            End Get
            Set(value As String)
                SetValue(FilterProperty, value)
            End Set
        End Property

        ''' <summary>The folder the dialog starts in (see InitialFolderProperty).</summary>
        Public Property InitialFolder As String
            Get
                Return GetValue(InitialFolderProperty)
            End Get
            Set(value As String)
                SetValue(InitialFolderProperty, value)
            End Set
        End Property

        ''' <summary>Whether the path box rejects typing (see IsPathReadOnlyProperty).</summary>
        Public Property IsPathReadOnly As Boolean
            Get
                Return GetValue(IsPathReadOnlyProperty)
            End Get
            Set(value As Boolean)
                SetValue(IsPathReadOnlyProperty, value)
            End Set
        End Property

        ''' <summary>Whether the left-edge kind icon is shown (see ShowIconProperty).</summary>
        Public Property ShowIcon As Boolean
            Get
                Return GetValue(ShowIconProperty)
            End Get
            Set(value As Boolean)
                SetValue(ShowIconProperty, value)
            End Set
        End Property

        ''' <summary>The Browse button's caption (see BrowseTextProperty).</summary>
        Public Property BrowseText As String
            Get
                Return GetValue(BrowseTextProperty)
            End Get
            Set(value As String)
                SetValue(BrowseTextProperty, value)
            End Set
        End Property

        ''' <summary>
        ''' Opens the platform dialog for the current PathType and writes the result into
        ''' SelectedPath. Never throws (a missing picker/platform is not an app error) and does
        ''' nothing when the control has no TopLevel yet (e.g. a design-time preview).
        ''' </summary>
        Public Async Function BrowseAsync() As Task
            Try
                Dim provider = TopLevel.GetTopLevel(Me)?.StorageProvider
                If provider Is Nothing Then Return
                Dim start As IStorageFolder = Nothing
                Dim startPath As String = If(String.IsNullOrWhiteSpace(LastFolder), InitialFolder, LastFolder)
                If Not String.IsNullOrWhiteSpace(startPath) Then
                    Try
                        start = Await provider.TryGetFolderFromPathAsync(New Uri(startPath))
                    Catch
                        ' the remembered folder is gone — let the platform choose
                    End Try
                End If

                Dim picked As IStorageItem = Nothing
                If PathType = PathPickerKind.Folder Then
                    Dim options As New FolderPickerOpenOptions With {.Title = Me.Title, .AllowMultiple = False}
                    If start IsNot Nothing Then options.SuggestedStartLocation = start
                    Dim folders = Await provider.OpenFolderPickerAsync(options)
                    If folders.Count > 0 Then picked = folders(0)
                ElseIf PathType = PathPickerKind.SaveFile Then
                    Dim options As New FilePickerSaveOptions With {
                        .Title = Me.Title,
                        .SuggestedStartLocation = start,
                        .SuggestedFileName = SuggestedFileName(),
                        .DefaultExtension = DefaultExtension(),
                        .FileTypeChoices = FileTypes()
                    }
                    picked = Await provider.SaveFilePickerAsync(options)
                Else
                    Dim options As New FilePickerOpenOptions With {
                        .Title = Me.Title,
                        .AllowMultiple = False,
                        .SuggestedStartLocation = start,
                        .FileTypeFilter = FileTypes()
                    }
                    Dim files = Await provider.OpenFilePickerAsync(options)
                    If files.Count > 0 Then picked = files(0)
                End If

                If picked Is Nothing Then Return
                Dim path2 As String = picked.TryGetLocalPath()
                If String.IsNullOrEmpty(path2) Then Return
                SelectedPath = path2
                LastFolder = FolderOf(path2)
            Catch
                ' The picker must never take the app down: an unusable StorageProvider (or a dialog
                ' the user cancelled in an odd way) simply leaves SelectedPath alone.
            End Try
        End Function

        ''' <summary>Turns the Filter string into the picker's file types:
        ''' "Images|*.png;*.jpg" → one "Images" entry; a bare "*.txt" → one "Files" entry;
        ''' "All files" is always offered last. Falls back to FilePickerFileTypes.All.</summary>
        Private Function FileTypes() As IReadOnlyList(Of FilePickerFileType)
            Dim list As New List(Of FilePickerFileType)()
            Dim parts = If(Filter, String.Empty).Split("|"c, StringSplitOptions.RemoveEmptyEntries)
            If parts.Length = 1 Then
                Dim [only] = Patterns(parts(0))
                If [only].Count > 0 Then list.Add(New FilePickerFileType("Files") With {.Patterns = [only]})
            Else
                Dim i = 0
                While i + 1 < parts.Length
                    Dim pats = Patterns(parts(i + 1))
                    Dim name = parts(i).Trim()
                    If pats.Count > 0 Then list.Add(New FilePickerFileType(If(name.Length > 0, name, "Files")) With {.Patterns = pats})
                    i += 2
                End While
            End If
            list.Add(FilePickerFileTypes.All)   ' always leave a way out of a narrow filter
            Return list
        End Function

        Private Shared Function Patterns(spec As String) As List(Of String)
            Dim seps = New Char() {";"c, ","c}
            Return spec.Split(seps, StringSplitOptions.RemoveEmptyEntries) _
                .Select(Function(p) p.Trim()) _
                .Where(Function(p) p.Length > 0) _
                .Select(Function(p) If(p = "*.*", "*", p)) _
                .ToList()
        End Function

        ''' <summary>The first filter pattern's extension (e.g. "*.png" → "png"), if any.</summary>
        Private Function DefaultExtension() As String
            Dim parts = If(Filter, String.Empty).Split("|"c, StringSplitOptions.RemoveEmptyEntries)
            Dim spec = If(parts.Length = 1, parts(0), If(parts.Length > 1, parts(1), String.Empty))
            Dim first = Patterns(spec).FirstOrDefault(Function(p) p.Contains("."))
            If first Is Nothing Then Return Nothing
            Return first.Substring(first.LastIndexOf("."c) + 1).Trim("*"c)
        End Function

        ''' <summary>The file name to suggest when saving (from a pre-set SelectedPath, else "untitled").</summary>
        Private Function SuggestedFileName() As String
            Dim existing As String = If(String.IsNullOrWhiteSpace(SelectedPath), Nothing, System.IO.Path.GetFileName(SelectedPath))
            Return If(String.IsNullOrEmpty(existing), "untitled", existing)
        End Function

        ''' <summary>The folder part of a path, or Nothing when it has none.</summary>
        Private Shared Function FolderOf(path As String) As String
            Try
                Dim dir = System.IO.Path.GetDirectoryName(path)
                Return If(String.IsNullOrEmpty(dir), Nothing, dir)
            Catch
                Return Nothing
            End Try
        End Function
    End Class

    ''' <summary>
    ''' Remembers the folder the Browse button used last, so the next dialog opens there instead of
    ''' wherever the platform happens to start. It lives in the per-user app-data folder
    ''' (~/.local/share/&lt;App&gt; on Linux, %LOCALAPPDATA%\&lt;App&gt; on Windows) — the same place the
    ''' generated DataSet helpers keep their data — which is what makes it survive a restart. Every step is
    ''' best-effort: an unwritable location simply means the dialog starts at the platform's default again.
    ''' </summary>
    Friend NotInheritable Class PickerFolderMemory
        Private Shared _folder As String = Nothing
        Private Shared _loaded As Boolean = False

        Private Sub New()
        End Sub

        Private Shared ReadOnly Property StorePath As String
            Get
                Dim entry = System.Reflection.Assembly.GetEntryAssembly()
                Dim name As String = If(entry Is Nothing, Nothing, entry.GetName().Name)
                If String.IsNullOrEmpty(name) Then name = System.Reflection.Assembly.GetExecutingAssembly().GetName().Name
                If String.IsNullOrEmpty(name) Then name = "app"
                Dim root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
                If String.IsNullOrEmpty(root) Then root = System.IO.Path.GetTempPath()
                Dim dir = System.IO.Path.Combine(root, name)
                Try
                    System.IO.Directory.CreateDirectory(dir)
                Catch
                    ' The failing write is what reports it.
                End Try
                Return System.IO.Path.Combine(dir, "PathPicker.lastfolder")
            End Get
        End Property

        ''' <summary>The folder the last pick used (Nothing = let the platform choose), or Nothing once it is gone.</summary>
        Friend Shared Property LastFolder As String
            Get
                If Not _loaded Then
                    _loaded = True
                    Try
                        If System.IO.File.Exists(StorePath) Then _folder = System.IO.File.ReadAllText(StorePath).Trim()
                    Catch
                        _folder = Nothing
                    End Try
                End If
                If String.IsNullOrEmpty(_folder) OrElse Not System.IO.Directory.Exists(_folder) Then Return Nothing
                Return _folder
            End Get
            Set(value As String)
                _loaded = True
                _folder = value
                Try
                    If String.IsNullOrEmpty(value) Then
                        If System.IO.File.Exists(StorePath) Then System.IO.File.Delete(StorePath)
                    Else
                        System.IO.File.WriteAllText(StorePath, value)
                    End If
                Catch
                    ' Best effort.
                End Try
            End Set
        End Property
    End Class

End Namespace
