using Avalonia.Controls;

using System.Data;
using System.Collections.ObjectModel;
using System.Linq;
using System.Diagnostics.CodeAnalysis;
namespace GrumpyDesignerDemo;

public partial class MainWindow : AvaloniaChrome.ChromeWindow
{
    /// <summary>
    /// The version of the designer extension this form was last saved with.
    /// </summary>
    /// <remarks>
    /// The About menu item shows it, and its "What is in v…?" link points at that tag on GitHub.
    /// Update the number when the form is worked on with a newer extension.
    /// </remarks>
    public const string DesignerVersion = "0.13.19";

    private System.Collections.ObjectModel.ObservableCollection<ImagesRow> _images;
    public MainWindow()
    {
        InitializeComponent();
        _images = DemoDataSet.LoadImages();
        DemoDataSet.WireImagesGrid(DataGrid1, _images);
        foreach (var row in _images)
        {
            ComboBox1.Items.Add(row.Image);
        }
    }

    private void GrumpyStatus1Date_Loaded(object sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        var timer = new Avalonia.Threading.DispatcherTimer { Interval = System.TimeSpan.FromSeconds(1) };
        timer.Tick += (_, _) => GrumpyStatus1Date.Text = System.DateTime.Now.ToString();
        timer.Start();
    }

    private void Menu1_SelectionChanged(object sender, Avalonia.Controls.SelectionChangedEventArgs e)
    {
        // TODO: Handle Menu1_SelectionChanged
    }

    /// <summary>Opens the About box — the extension's icon, its version and the GitHub links.</summary>
    private void About_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        _ = new AboutDialog(DesignerVersion).ShowDialog(this);
    }

    /// <summary>
    /// Shuts the application down (menu item “Exit”).
    /// </summary>
    /// <remarks>
    /// The lifetime is asked directly rather than closing this one window: the app starts with
    /// <c>StartWithClassicDesktopLifetime</c>, so its Shutdown() ends the process cleanly — it
    /// closes every window, including any other window that happens to be open.
    /// </remarks>
    private void Exit_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        if (Avalonia.Application.Current?.ApplicationLifetime
            is Avalonia.Controls.ApplicationLifetimes.IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.Shutdown();
        }
        else
        {
            Close();   // no desktop lifetime (e.g. a designer/preview host): just close the window
        }
    }

    private void TabControl1_SelectionChanged(object sender, Avalonia.Controls.SelectionChangedEventArgs e)
    {
        // TODO: Handle TabControl1_SelectionChanged
    }

    private void Button1_Click(object sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        CheckBox1.IsChecked = !CheckBox1.IsChecked;
        RadioButton1.IsChecked = !RadioButton1.IsChecked;
        ToggleSwitch1.IsChecked = !ToggleSwitch1.IsChecked;
    }

    private void DataGrid1_SelectionChanged(object sender, Avalonia.Controls.SelectionChangedEventArgs e)
    {
        //This code was written by the local AI assistant - Use the right-click context menu to activate the AI assistant to help you write/debug code.

        if (DataGrid1.SelectedItem is ImagesRow selectedRow && !string.IsNullOrEmpty(selectedRow.File))
        {
            //Set the Image file to the Image control
            Image1.Source = new Avalonia.Media.Imaging.Bitmap(selectedRow.File);
        }

        if (_images.Count > 0)
        {
            // Update the ProgressBar value based on the selected index
            int selectedIndex = DataGrid1.SelectedItem is ImagesRow row ? _images.IndexOf(row) : -1;
            ProgressBar1.Value = selectedIndex >= 0 ? (selectedIndex + 1) / ((double)_images.Count - 1) * 100 : 0;
            // Update the ComboBox selection based on the selected item in the DataGrid
            ComboBox1.SelectedItem = DataGrid1.SelectedItem is ImagesRow imageRow ? imageRow.Image : null;
        }
        else
        {
            ProgressBar1.Value = 0;
        }

    }

    private void ProgressBar1_ValueChanged(object sender, Avalonia.Controls.Primitives.RangeBaseValueChangedEventArgs e)
    {
        // TODO: Handle ProgressBar1_ValueChanged
    }

    private void ComboBox1_SelectionChanged(object sender, Avalonia.Controls.SelectionChangedEventArgs e)
    {

        if (e.AddedItems.Count > 0)
        {
            var selectedItem = e.AddedItems[0];
            var itemsSource = DataGrid1.ItemsSource as ObservableCollection<ImagesRow>;
            if (itemsSource != null)
            {
                var selectedImage = selectedItem?.ToString();
                var selectedRow = itemsSource?.FirstOrDefault(row => row.Image == selectedImage);
                if (selectedRow != null)
                {
                    DataGrid1.SelectedItem = selectedRow;
                }
            }
        }
    }

    private void Timer1_Tick(object sender, System.EventArgs e)
    {
        // TODO: Handle Timer1_Tick
    }

    private void CheckBox1_IsCheckedChanged(object sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        // TODO: Handle CheckBox1_IsCheckedChanged
    }

    private void RadioButton1_IsCheckedChanged(object sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        // TODO: Handle RadioButton1_IsCheckedChanged
    }

    private void ToggleSwitch1_Click(object sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        // TODO: Handle ToggleSwitch1_Click
    }




    /// <summary>Sample Open button: Avalonia's own file dialog. The picked path is shown in GrumpyCommandBar1Path (sent by the designer as a starting point — edit or replace it freely).</summary>
    private async void GrumpyCommandBar1Open_Click(object sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        var top = Avalonia.Controls.TopLevel.GetTopLevel(this);
        if (top is null) return;
        var files = await top.StorageProvider.OpenFilePickerAsync(new Avalonia.Platform.Storage.FilePickerOpenOptions
        {
            Title = "Open file",
            AllowMultiple = false
        });
        if (files.Count > 0 && this.FindControl<Avalonia.Controls.TextBox>("GrumpyCommandBar1Path") is { } box)
            box.Text = files[0].Path.LocalPath;
    }

    /// <summary>Sample Save button: Avalonia's own file dialog. The picked path is shown in GrumpyCommandBar1Path (sent by the designer as a starting point — edit or replace it freely).</summary>
    private async void GrumpyCommandBar1Save_Click(object sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        var top = Avalonia.Controls.TopLevel.GetTopLevel(this);
        if (top is null) return;
        var file = await top.StorageProvider.SaveFilePickerAsync(new Avalonia.Platform.Storage.FilePickerSaveOptions
        {
            Title = "Save file",
            SuggestedFileName = "untitled.txt"
        });
        if (file is not null && this.FindControl<Avalonia.Controls.TextBox>("GrumpyCommandBar1Path") is { } box)
            box.Text = file.Path.LocalPath;
    }
}
