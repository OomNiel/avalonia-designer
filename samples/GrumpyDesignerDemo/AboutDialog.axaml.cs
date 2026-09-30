using Avalonia.Interactivity;

namespace GrumpyDesignerDemo;

/// <summary>
/// The About box: the designer extension's icon, the version of that extension this form was
/// last written with, and the links back to the project on GitHub.
/// </summary>
/// <remarks>
/// The version is passed in (the About menu item uses <see cref="MainWindow.DesignerVersion"/>),
/// so the dialog itself never has to know where the number came from.
/// </remarks>
public partial class AboutDialog : AvaloniaChrome.ChromeWindow
{
    private const string RepoUrl = "https://github.com/OomNiel/avalonia-designer";

    /// <summary>A dialog for the version this app was built with.</summary>
    public AboutDialog() : this(MainWindow.DesignerVersion)
    {
    }

    /// <summary>A dialog for an explicit designer version (e.g. <c>0.13.19</c>).</summary>
    public AboutDialog(string designerVersion)
    {
        InitializeComponent();

        VersionText.Text = "Designer extension version " + designerVersion;

        RepoLink.Content = "github.com/OomNiel/avalonia-designer";
        RepoLink.NavigateUri = new System.Uri(RepoUrl);

        // The version names its own release, so the link can be checked rather than guessed.
        ReleaseLink.Content = "What is in v" + designerVersion + "?";
        ReleaseLink.NavigateUri = new System.Uri(RepoUrl + "/releases/tag/v" + designerVersion);
    }

    private void Close_Click(object? sender, RoutedEventArgs e) => Close();
}
