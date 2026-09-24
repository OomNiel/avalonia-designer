// BUNDLED-COPY: 0.11.19
// PathPicker.cs — BUNDLED RESOURCE (the VB twin is resources/PathPicker.vb). Copied into every
// generated project, next to GrumpyPanel.cs / ExifImageLoader.cs.
//
// A file / folder selection row: a read-only (by default) TextBox showing the chosen path plus a
// "…" Browse button that opens the platform's own dialog. It is the Avalonia equivalent of the
// WinForms OpenFileDialog / FolderBrowserDialog pair, as a CONTROL you can drop on a form and size
// like any other control.
//
//   <chrome:PathPicker x:Name="PathPicker1" Width="180" Height="24"
//                      PathType="File"
//                      Title="Select an image"
//                      Filter="Images|*.png;*.jpg|All files|*.*"
//                      InitialFolder="C:\Pictures"
//                      SelectedPath="{Binding PhotoPath, Mode=TwoWay}"/>
//
// PROPERTIES
// ----------
//   PathType        File (open a file) | Folder (pick a folder) | SaveFile (choose where to save)
//   SelectedPath    the chosen path — TWO-WAY: your code reads it, and may pre-set/clear it
//   Title           the dialog caption
//   Filter          WinForms-style filter, e.g. "Images|*.png;*.jpg|All files|*.*" (files only)
//   InitialFolder   folder the dialog opens in when SelectedPath is empty
//   IsPathReadOnly  True (default) = pick-only; False = the user may also type/paste a path
//   BrowseText      the button's caption ("…" by default)
//   ShowIcon        True (default) = a small file/folder icon at the left edge, so a File Selector
//                   and a Folder Selector are told apart at a glance
//
// NOTES
// -----
//   * The picker uses Avalonia's StorageProvider (TopLevel.StorageProvider), so it works on Linux,
//     Windows and macOS with the platform's native dialog — no extra package.
//   * The last folder you picked in is remembered for the rest of the session (best effort), so a
//     second picker on the same form starts where the first one left off.
//   * Nothing happens if the app has no TopLevel yet (e.g. in a designer preview), so it is safe to
//     place and render before the window is shown.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Data;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Platform.Storage;

namespace AvaloniaChrome;

/// <summary>What a <see cref="PathPicker"/> asks the user for.</summary>
public enum PathPickerKind
{
    /// <summary>Pick an existing file (OpenFilePicker).</summary>
    File,
    /// <summary>Pick an existing folder (OpenFolderPicker).</summary>
    Folder,
    /// <summary>Pick a file to save — it need not exist yet (SaveFilePicker).</summary>
    SaveFile
}

/// <summary>
/// A path entry row (TextBox + Browse… button) that opens the platform file/folder dialog and
/// stores the result in <see cref="SelectedPath"/>.
/// </summary>
public class PathPicker : UserControl
{
    /// <summary>Marker used by the designer's bundled-helper detection (keeps old copies current).</summary>
    public const string BundledMarker = "PathPicker";

    /// <summary>The chosen path. Empty while nothing has been picked. Two-way bindable.</summary>
    public static readonly StyledProperty<string?> SelectedPathProperty =
        AvaloniaProperty.Register<PathPicker, string?>(nameof(SelectedPath));

    /// <summary>File / Folder / SaveFile — what the Browse button opens.</summary>
    public static readonly StyledProperty<PathPickerKind> PathTypeProperty =
        AvaloniaProperty.Register<PathPicker, PathPickerKind>(nameof(PathType), PathPickerKind.File);

    /// <summary>The dialog's caption.</summary>
    public static readonly StyledProperty<string?> TitleProperty =
        AvaloniaProperty.Register<PathPicker, string?>(nameof(Title), "Select a file");

    /// <summary>WinForms-style filter for the file pickers:
    /// <c>"Images|*.png;*.jpg|All files|*.*"</c>. <c>"*.*"</c> is normalised to <c>"*"</c>.</summary>
    public static readonly StyledProperty<string?> FilterProperty =
        AvaloniaProperty.Register<PathPicker, string?>(nameof(Filter), "All files|*.*");

    /// <summary>Folder the dialog starts in when <see cref="SelectedPath"/> is empty.</summary>
    public static readonly StyledProperty<string?> InitialFolderProperty =
        AvaloniaProperty.Register<PathPicker, string?>(nameof(InitialFolder));

    /// <summary>True (default): the path box is read-only, so the value can only come from the
    /// dialog. False: the user may also type or paste a path.</summary>
    public static readonly StyledProperty<bool> IsPathReadOnlyProperty =
        AvaloniaProperty.Register<PathPicker, bool>(nameof(IsPathReadOnly), true);

    /// <summary>The Browse button's caption ("…" by default).</summary>
    public static readonly StyledProperty<string?> BrowseTextProperty =
        AvaloniaProperty.Register<PathPicker, string?>(nameof(BrowseText), "…");

    /// <summary>True (default): a small FILE or FOLDER icon is shown at the left edge, so a File
    /// Selector and a Folder Selector look different on the form.</summary>
    public static readonly StyledProperty<bool> ShowIconProperty =
        AvaloniaProperty.Register<PathPicker, bool>(nameof(ShowIcon), true);

    private readonly TextBox _box = new();
    private readonly Button _browse = new();

    /// <summary>The kind icon at the left edge: a page for File/SaveFile, a folder for Folder.
    /// (Fully qualified — `Path` alone would clash with System.IO.Path.)</summary>
    private readonly Avalonia.Controls.Shapes.Path _icon = new();

    /// <summary>The folder the last pick used — remembered in the per-user app-data folder (see
    /// <see cref="PickerFolderMemory"/>), so it survives a restart instead of being lost with the
    /// process.</summary>
    private static string? LastFolder
    {
        get => PickerFolderMemory.LastFolder;
        set => PickerFolderMemory.LastFolder = value;
    }

    /// <summary>Builds the row: the kind icon at the left, a fill TextBox bound to this control's
    /// properties, and the Browse button docked right.</summary>
    public PathPicker()
    {
        _box.VerticalAlignment = VerticalAlignment.Center;
        _box.Bind(TextBox.TextProperty, new Binding(nameof(SelectedPath)) { Source = this, Mode = BindingMode.TwoWay });
        _box.Bind(TextBox.IsReadOnlyProperty, new Binding(nameof(IsPathReadOnly)) { Source = this });
        _browse.Bind(ContentControl.ContentProperty, new Binding(nameof(BrowseText)) { Source = this });
        _browse.MinWidth = 26;
        _browse.Padding = new Thickness(6, 0, 6, 0);
        _browse.Margin = new Thickness(4, 0, 0, 0);
        _browse.VerticalAlignment = VerticalAlignment.Stretch;
        _browse.Click += async (_, _) => await BrowseAsync();
        DockPanel.SetDock(_browse, Dock.Right);
        // The kind icon (see UpdateIcon): follow the control's text colour so it fits the theme,
        // falling back to grey when no Foreground is set anywhere up the tree.
        _icon.Width = 14;
        _icon.Height = 14;
        _icon.Stretch = Stretch.Uniform;
        _icon.VerticalAlignment = VerticalAlignment.Center;
        _icon.Margin = new Thickness(0, 0, 4, 0);
        _icon.Bind(Avalonia.Controls.Shapes.Shape.FillProperty,
            new Binding(nameof(Foreground)) { Source = this, TargetNullValue = Brushes.Gray });
        DockPanel.SetDock(_icon, Dock.Left);
        UpdateIcon();
        Content = new DockPanel { LastChildFill = true, Children = { _icon, _browse, _box } };
    }

    /// <summary>Redraws the left-edge icon for the current <see cref="PathType"/>: a page for a file
    /// (or save) picker, a folder for a folder picker.</summary>
    private void UpdateIcon()
    {
        var folder = PathType == PathPickerKind.Folder;
        _icon.Data = Geometry.Parse(folder
            // A folder: back tab + body.
            ? "M 0,3 L 5,3 L 6.6,5.2 L 14,5.2 L 14,12.4 L 0,12.4 Z"
            // A page with a folded corner.
            : "M 2,0.6 L 9,0.6 L 13,4.6 L 13,13.4 L 2,13.4 Z M 9,0.6 L 9,4.6 L 13,4.6");
        _icon.IsVisible = ShowIcon;
        ToolTip.SetTip(_icon, folder
            ? "Picks a folder"
            : PathType == PathPickerKind.SaveFile ? "Picks a file to save" : "Picks a file");
    }

    /// <summary>Keeps the icon in step with <see cref="PathType"/> / <see cref="ShowIcon"/>.</summary>
    protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
    {
        base.OnPropertyChanged(change);
        if (change.Property == PathTypeProperty || change.Property == ShowIconProperty) UpdateIcon();
    }

    /// <summary>The chosen path (see <see cref="SelectedPathProperty"/>).</summary>
    public string? SelectedPath
    {
        get => GetValue(SelectedPathProperty);
        set => SetValue(SelectedPathProperty, value);
    }

    /// <summary>What the Browse button opens (see <see cref="PathTypeProperty"/>).</summary>
    public PathPickerKind PathType
    {
        get => GetValue(PathTypeProperty);
        set => SetValue(PathTypeProperty, value);
    }

    /// <summary>The dialog's caption (see <see cref="TitleProperty"/>).</summary>
    public string? Title
    {
        get => GetValue(TitleProperty);
        set => SetValue(TitleProperty, value);
    }

    /// <summary>The file filter (see <see cref="FilterProperty"/>).</summary>
    public string? Filter
    {
        get => GetValue(FilterProperty);
        set => SetValue(FilterProperty, value);
    }

    /// <summary>The folder the dialog starts in (see <see cref="InitialFolderProperty"/>).</summary>
    public string? InitialFolder
    {
        get => GetValue(InitialFolderProperty);
        set => SetValue(InitialFolderProperty, value);
    }

    /// <summary>Whether the path box rejects typing (see <see cref="IsPathReadOnlyProperty"/>).</summary>
    public bool IsPathReadOnly
    {
        get => GetValue(IsPathReadOnlyProperty);
        set => SetValue(IsPathReadOnlyProperty, value);
    }

    /// <summary>The Browse button's caption (see <see cref="BrowseTextProperty"/>).</summary>
    public string? BrowseText
    {
        get => GetValue(BrowseTextProperty);
        set => SetValue(BrowseTextProperty, value);
    }

    /// <summary>Whether the left-edge kind icon is shown (see <see cref="ShowIconProperty"/>).</summary>
    public bool ShowIcon
    {
        get => GetValue(ShowIconProperty);
        set => SetValue(ShowIconProperty, value);
    }

    /// <summary>
    /// Opens the platform dialog for the current <see cref="PathType"/> and writes the result into
    /// <see cref="SelectedPath"/>. Never throws (a missing picker/platform is not an app error) and
    /// does nothing when the control has no TopLevel yet (e.g. a design-time preview).
    /// </summary>
    public async Task BrowseAsync()
    {
        try
        {
            var provider = TopLevel.GetTopLevel(this)?.StorageProvider;
            if (provider is null) return;
            IStorageFolder? start = null;
            var startPath = string.IsNullOrWhiteSpace(LastFolder) ? InitialFolder : LastFolder;
            if (!string.IsNullOrWhiteSpace(startPath))
            {
                try { start = await provider.TryGetFolderFromPathAsync(new Uri(startPath!)); }
                catch { /* the remembered folder is gone — let the platform choose */ }
            }

            IStorageItem? picked = null;
            if (PathType == PathPickerKind.Folder)
            {
                var options = new FolderPickerOpenOptions { Title = Title, AllowMultiple = false };
                if (start is not null) options.SuggestedStartLocation = start;
                var folders = await provider.OpenFolderPickerAsync(options);
                if (folders.Count > 0) picked = folders[0];
            }
            else if (PathType == PathPickerKind.SaveFile)
            {
                var options = new FilePickerSaveOptions
                {
                    Title = Title,
                    SuggestedStartLocation = start,
                    SuggestedFileName = SuggestedFileName(),
                    DefaultExtension = DefaultExtension(),
                    FileTypeChoices = FileTypes()
                };
                picked = await provider.SaveFilePickerAsync(options);
            }
            else
            {
                var options = new FilePickerOpenOptions
                {
                    Title = Title,
                    AllowMultiple = false,
                    SuggestedStartLocation = start,
                    FileTypeFilter = FileTypes()
                };
                var files = await provider.OpenFilePickerAsync(options);
                if (files.Count > 0) picked = files[0];
            }

            if (picked is null) return;
            var path = picked.TryGetLocalPath();
            if (string.IsNullOrEmpty(path)) return;
            SelectedPath = path;
            LastFolder = FolderOf(path!);
        }
        catch
        {
            // The picker must never take the app down: an unusable StorageProvider (or a dialog the
            // user cancelled in an odd way) simply leaves SelectedPath alone.
        }
    }

    /// <summary>Turns the <see cref="Filter"/> string into the picker's file types.
    /// <c>"Images|*.png;*.jpg"</c> → one "Images" entry; a bare <c>"*.txt"</c> → one "Files" entry;
    /// "All files" is always offered last. Falls back to <see cref="FilePickerFileTypes.All"/>.</summary>
    private IReadOnlyList<FilePickerFileType> FileTypes()
    {
        var list = new List<FilePickerFileType>();
        var parts = (Filter ?? string.Empty).Split('|', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 1)
        {
            var only = Patterns(parts[0]);
            if (only.Count > 0) list.Add(new FilePickerFileType("Files") { Patterns = only });
        }
        else
        {
            for (var i = 0; i + 1 < parts.Length; i += 2)
            {
                var pats = Patterns(parts[i + 1]);
                var name = parts[i].Trim();
                if (pats.Count > 0) list.Add(new FilePickerFileType(name.Length > 0 ? name : "Files") { Patterns = pats });
            }
        }
        list.Add(FilePickerFileTypes.All);   // always leave a way out of a narrow filter
        return list;
    }

    private static List<string> Patterns(string spec) =>
        spec.Split(new[] { ';', ',' }, StringSplitOptions.RemoveEmptyEntries)
            .Select((p) => p.Trim())
            .Where((p) => p.Length > 0)
            .Select((p) => p == "*.*" ? "*" : p)
            .ToList();

    /// <summary>The first filter pattern's extension (e.g. <c>*.png</c> → <c>png</c>), if any.</summary>
    private string? DefaultExtension()
    {
        var parts = (Filter ?? string.Empty).Split('|', StringSplitOptions.RemoveEmptyEntries);
        var spec = parts.Length == 1 ? parts[0] : (parts.Length > 1 ? parts[1] : string.Empty);
        var first = Patterns(spec).FirstOrDefault((p) => p.Contains('.'));
        return first is null ? null : first[(first.LastIndexOf('.') + 1)..].Trim('*');
    }

    /// <summary>The file name to suggest when saving (from a pre-set SelectedPath, else "untitled").</summary>
    private string SuggestedFileName()
    {
        var existing = string.IsNullOrWhiteSpace(SelectedPath) ? null : System.IO.Path.GetFileName(SelectedPath);
        return string.IsNullOrEmpty(existing) ? "untitled" : existing!;
    }

    /// <summary>The folder part of a path, or null when it has none.</summary>
    private static string? FolderOf(string path)
    {
        try
        {
            var dir = System.IO.Path.GetDirectoryName(path);
            return string.IsNullOrEmpty(dir) ? null : dir;
        }
        catch { return null; }
    }
}

/// <summary>
/// Remembers the folder the Browse button used last, so the next dialog opens there instead of wherever
/// the platform happens to start. It lives in the per-user app-data folder (~/.local/share/&lt;App&gt; on
/// Linux, %LOCALAPPDATA%\&lt;App&gt; on Windows) — the same place the generated DataSet helpers keep their
/// data — which is what makes it survive a restart. Every step is best-effort: an unwritable location
/// simply means the dialog starts at the platform's default again.
/// </summary>
internal static class PickerFolderMemory
{
    private static string? _folder;
    private static bool _loaded;

    private static string StorePath
    {
        get
        {
            var name = System.Reflection.Assembly.GetEntryAssembly()?.GetName().Name
                       ?? System.Reflection.Assembly.GetExecutingAssembly().GetName().Name
                       ?? "app";
            var root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (string.IsNullOrEmpty(root)) root = System.IO.Path.GetTempPath();
            var dir = System.IO.Path.Combine(root, name);
            // Fully qualified on purpose: this file deliberately does not import System.IO (the control
            // has a property called `Path`, so a bare `Path` would be ambiguous anyway).
            try { System.IO.Directory.CreateDirectory(dir); } catch { /* the failing write is what reports it */ }
            return System.IO.Path.Combine(dir, "PathPicker.lastfolder");
        }
    }

    /// <summary>The folder the last pick used (null = let the platform choose), or null once it is gone.</summary>
    internal static string? LastFolder
    {
        get
        {
            if (!_loaded)
            {
                _loaded = true;
                try { if (System.IO.File.Exists(StorePath)) _folder = System.IO.File.ReadAllText(StorePath).Trim(); }
                catch { _folder = null; }
            }
            // A folder on a drive that is no longer mounted is worse than no answer: the platform would
            // open the dialog inside a path that does not exist.
            if (string.IsNullOrEmpty(_folder) || !System.IO.Directory.Exists(_folder)) return null;
            return _folder;
        }
        set
        {
            _loaded = true;
            _folder = value;
            try
            {
                if (string.IsNullOrEmpty(value))
                {
                    if (System.IO.File.Exists(StorePath)) System.IO.File.Delete(StorePath);
                }
                else
                {
                    System.IO.File.WriteAllText(StorePath, value!);
                }
            }
            catch { /* best effort */ }
        }
    }
}
