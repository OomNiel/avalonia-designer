/**
 * Plain-language descriptions for controls, aimed at novice users. Used by the
 * designer's "About this control" help panel and the toolbox item tooltips.
 */
export interface ControlInfo {
    label: string;  // friendly display label
    desc: string;   // what it does
    use: string;    // when to use it
}

const INFO: Record<string, ControlInfo> = {
    Window: {
        label: 'Window',
        desc: 'A top-level window (the form) with its own title bar and frame.',
        use: 'The starting point of most apps. Open it from code with Show() or ShowDialog().'
    },
    UserControl: {
        label: 'User Control',
        desc: 'A reusable piece of UI that can be placed inside other forms.',
        use: 'Use to build a repeatable component (e.g. a search bar) used in several windows.'
    },
    Button: {
        label: 'Button',
        desc: 'A clickable button that performs an action.',
        use: 'Use for actions like "Save", "Cancel" or "Open". Middle-click to add a Click handler.'
    },
    TextBox: {
        label: 'Text Box',
        desc: 'A box where the user types text (single or multi-line).',
        use: 'Use for names, emails, passwords (set PasswordChar) or any free text input.'
    },
    TextBlock: {
        label: 'Label / Text',
        desc: 'Shows static text (a label or heading).',
        use: 'Use for titles, captions and instructions. The user cannot edit it.'
    },
    ToggleSwitch: {
        label: 'Toggle Switch',
        desc: 'An on/off switch — the sliding style of a tick box.',
        use: 'Use for settings that take effect immediately (Wi-Fi on/off). Give it On/Off text, or a label via Content.'
    },
    MaskedTextBox: {
        label: 'Masked Text Box',
        desc: 'A text box that only accepts input matching a mask.',
        use: 'Use for phone numbers, postcodes, IDs: the mask says which digits/letters are allowed.'
    },
    NumericUpDown: {
        label: 'Numeric Up-Down',
        desc: 'A number box with small up/down arrows.',
        use: 'Use for quantities and amounts: the user types a number or steps it. Set Minimum/Maximum to bound it.'
    },
    ProgressBar: {
        label: 'Progress Bar',
        desc: 'Shows how far a task has got (a filled strip).',
        use: 'Use while loading or saving. Set Value (0-100) from code, or tick Indeterminate for a moving bar.'
    },
    Slider: {
        label: 'Slider',
        desc: 'Lets the user pick a number by dragging a handle.',
        use: 'Use for volumes, brightness, zoom: anything where a rough value is enough.'
    },
    Separator: {
        label: 'Separator',
        desc: 'A thin dividing line between groups.',
        use: 'Use to split up a form or a menu visually.'
    },
    Polyline: {
        label: 'Polyline',
        desc: 'An open multi-point line (a chart line, a run of connected segments).',
        use: 'Use for simple graphs and diagrams. Edit the Points list to shape it.'
    },
    Polygon: {
        label: 'Polygon',
        desc: 'A closed shape from a list of points (triangle, arrow, star).',
        use: 'Use for custom outlines. Edit the Points list; set Backcolor to fill it.'
    },
    PathIcon: {
        label: 'Path Icon',
        desc: 'A small icon drawn from path data — no image file needed.',
        use: 'Use for toolbar/status icons. Edit the Data path, or set Foreground for its colour.'
    },
    ComboBox: {
        label: 'Combo Box',
        desc: 'A drop-down list: click it to choose one option from a list.',
        use: 'Use when the user must pick one option from many (e.g. country, role).'
    },
    ListBox: {
        label: 'List Box',
        desc: 'Shows a list of items, possibly allowing multiple selection.',
        use: 'Use to display a collection the user can browse or select from. Edit the items from the "List Items" section in the Properties panel.'
    },
    CheckBox: {
        label: 'Check Box',
        desc: 'A tick box for a Yes/No (or three-state) option.',
        use: 'Use for toggles like "Remember me" or "Enable feature".'
    },
    RadioButton: {
        label: 'Radio Button',
        desc: 'A round option; only one in a group can be selected at a time.',
        use: 'Use to choose one option from a small set (e.g. payment method).'
    },
    Image: {
        label: 'Image',
        desc: 'Displays a picture.',
        use: 'Use for logos, icons or photos. Set Source to a file path or avares:// URI.'
    },
    Panel: {
        label: 'Panel',
        desc: 'A simple container that layers its children on top of each other.',
        use: 'Use to group controls or as a drawing/overlay surface.'
    },
    Grid: {
        label: 'Grid',
        desc: 'A container that lays out children in rows and columns.',
        use: 'The workhorse for forms — great for aligning labels and inputs.'
    },
    StackPanel: {
        label: 'Stack Panel',
        desc: 'Stacks its children in a line (vertical or horizontal).',
        use: 'Use for simple vertical forms or horizontal toolbars.'
    },
    DockPanel: {
        label: 'Dock Panel',
        desc: 'Pins children to the edges (top, bottom, left, right); the last one fills the rest.',
        use: 'Use for window layouts with a header, footer or sidebar.'
    },
    WrapPanel: {
        label: 'Wrap Panel',
        desc: 'Lays children in a row and wraps to the next line when full.',
        use: 'Use for tags, chips or items that flow like wrapped text.'
    },
    TabControl: {
        label: 'Tab Control',
        desc: 'Organizes content into tabs that the user switches between.',
        use: 'Use to group related sections into one window. Each tab is a TabItem (add, edit or remove them from the Properties panel).'
    },
    TreeView: {
        label: 'Tree View',
        desc: 'Shows a hierarchy of items that the user expands and collapses — like folders in a file tree.',
        use: 'Use for nested data the user drills into (categories, files, departments). It is placed with two starter nodes — a node shows its Header and holds further TreeViewItems. Add, nest and remove the nodes from the "Tree Items" section of the Properties panel. Setting ItemsSource is the other way to fill it, and the two cannot be mixed.'
    },
    TabItem: {
        label: 'Tab Item',
        desc: 'A single page inside a TabControl, shown with a tab header.',
        use: 'Managed as a child of a TabControl. Edit the Header (tab label) and Content from the Tab Items section of the Properties panel.'
    },
    DataGrid: {
        label: 'Data Grid',
        desc: 'Shows tabular data in rows and columns (like a spreadsheet).',
        use: 'Use for lists of records, e.g. a table of results.'
    },
    DataSet: {
        label: 'DataSet',
        desc: 'Designs a DataSet schema (tables + columns) visually — not a control you place on a form.',
        use: 'Click it to open the DataSet designer: define tables and columns (field name, header text, data type, allow-null), then Generate a runtime DataSet class (.cs/.vb) and an .xsd schema.'
    },
    Menu: {
        label: 'Menu Bar',
        desc: 'A horizontal menu bar with drop-down menus (File, Edit, Help, …).',
        use: 'Use at the top of a window to group commands. Add MenuItem children with a Header (e.g. "File"). Space items (Menu Items editor) put an invisible, pixel-wide gap between top-level items.'
    },
    StatusBar: {
        label: 'Status Bar',
        desc: 'A bar along the bottom of the window that shows status items (text, buttons, a clock).',
        use: 'A DockPanel strip docked to the bottom. It comes with a "Ready" label on the left; add more items with the Status Items editor (Properties panel) — each item is pinned LEFT or RIGHT and stretches to the bar\'s height.'
    },
    SplitPanel: {
        label: 'Split Panel',
        desc: 'A resizable multi-pane container (an Avalonia Grid with GridSplitters).',
        use: 'Drag the bar between panes at runtime to resize them; the panel resizes with the window. Add/remove panes and switch Columns/Rows under Split Layout in the Properties panel; each pane has a settable border and an empty body to drop controls into.'
    },
    GrumpyPanel: {
        label: 'Grumpy Panel',
        desc: 'A reusable docking-region panel: a framed box you drop controls into freely, which can also dock dock-able controls to its edges.',
        use: 'Drop it on any canvas or panel. Controls you drop inside land freely (like the form body); set a dock-able control\'s Dock (Left/Top/Right/Bottom) and it pins to that edge of the panel while the free body shrinks. Style the frame with Border Thickness / Border Brush / Background; the Theme row switches between the System look and your Custom colours. Its own Anchor (8 positions) pins the whole panel to its container.'
    },
    StatusDate: {
        label: 'Status Date / Time',
        desc: 'A live clock that shows the current system date and time (in the OS date/time format).',
        use: 'Placed anywhere (often in a Status Bar). It shows the current date/time in the OS format and updates itself every second — no code needed from you.'
    },
    GrumpyStatus: {
        label: 'Grumpy Status',
        desc: 'A dark status strip built on the GrumpyPanel base: docked to the bottom with a live clock on the right and a status label on the left.',
        use: 'Drop it on the form — it docks to the bottom edge. The label on the left shows "Ready" (edit its Text); the right side shows the live date/time. Add more items like any GrumpyPanel: drop them inside, or Dock a control (Left/Right/Bottom/Top) to pin it to a strip edge. Edit the dark-grey background, the light label/clock text colours, and the strip height from Properties.'
    },
    PathPicker: {
        label: 'File Selector',
        desc: 'A path row: a box showing the chosen file plus a "…" button that opens the platform\'s own Open dialog.',
        use: 'Drop it on the form, size it, and set Path Type (File / Folder / Save File) to choose which dialog opens. Filter limits the file types shown (WinForms style: "Images|*.png;*.jpg|All files|*.*"). Title is the dialog caption, Initial Folder is where it opens when nothing is picked yet, and Selected Path is the result — bind it to a code-behind field (or read it in a Click handler) to use the choice. Read Only Path (default True) means the user must pick, not type.'
    },
    PathPickerFolder: {
        label: 'Folder Selector',
        desc: 'A path row pre-set to Folder: a box showing the chosen folder plus a "…" button that opens the platform\'s own folder dialog.',
        use: 'Same control as File Selector, with Path Type = Folder, so the Browse button opens a folder picker (like the WinForms FolderBrowserDialog). The picked folder lands in Selected Path; Title is the dialog caption and Initial Folder is where it opens first.'
    },
    GrumpyBarPlot: {
        label: 'Bar Chart',
        desc: 'A bar chart that draws itself: one bar per category, side by side, stacked, or stacked to 100% — no package, no image file.',
        use: 'Type the values into Values (comma separated: 8,14,10,16) or point Spreadsheet at an .xlsx workbook whose X column holds the CATEGORY NAMES (column A by default) and whose Y column holds the values (column C). The names land on the X axis; when the X cells are numbers the axis falls back to numbers. Bar Mode picks Grouped (one bar per series per category), Stacked (each series starts where the previous ended, so a category reads as its total) or Stacked100 (every category fills to 100%, turning the data into a share of the total). Bar Width is how much of its slot one bar fills (0.8 leaves a fifth as gap) and Bar Corner Radius rounds the bar tops. 0 is always on the Y scale, because a bar is read as a length from its baseline. Everything else — the Series editor (one colour per series), the Axis editor, the legend with its tick boxes and the background gradient — works exactly as it does on the line plot. A bar has no cursors (a crosshair reads a value BETWEEN two samples, and a bar is one reading per category): hover a bar instead and its category and value appear in the black readout panel, and the only thing the chart\'s right-click menu offers is Fill the container / Restore the original position (which docks the chart over the whole form area and Esc puts back). **Data Selector** picks the workbook and which PAGE of it holds these categories and values.'
    },
    GrumpyAreaPlot: {
        label: 'Area Chart',
        desc: 'A filled area chart: each series is a shape under its line, plain, stacked, or stacked to 100%.',
        use: 'The same data as the bar chart: Values inline or a Spreadsheet whose X column names the categories and whose Y column holds the numbers. Area Mode picks Plain (each series fills down to zero, so the last one drawn covers the others), Stacked (each series fills from the top of the previous one — the shape monitoring dashboards use) or Stacked100 (every category totals 100%). Area Opacity (default 60) is how solid the fill is: the line along the top stays fully opaque, so a lighter fill lets the gridlines and the series behind it show through. The Series, Axis, Legend, Cursors and gradient editors work as on the line plot, and **Data Selector** picks the workbook and which PAGE of it holds these categories and values.'
    },
    GrumpyPiePlot: {
        label: 'Pie Chart',
        desc: 'A pie or doughnut chart: one wedge per labelled value, each with its own colour from the palette.',
        use: 'Type the wedge names into Labels (North,South,East,West) and the numbers into Values (32,24,18,26), or point Spreadsheet at an .xlsx workbook whose X column holds the SLICE NAMES (text, dates or numbers — a pie is the one chart whose categories are almost always words) and whose Y column holds the values. Doughnut Percent makes it a doughnut: 0 is a solid pie, 45 leaves a hole a bit under half the radius. Start Angle says where the first slice starts (0 = 12 o\'clock, slices run clockwise) and Slice Gap spaces the wedges apart. Slice Border Colour and Thickness draw the line between two slices (thickness 0 makes the colours touch). The Slices editor names the wedges that should differ from the palette (each with its own colour and Explode to push it out of the pie) and the Legend editor lists the slices with a tick box that switches one off. A pie has no gridlines, no axes and no cursors: hover a slice instead and it pops out of the ring by Hover Explode pixels (10 by default) with its name, value and share of the total in the black readout panel. **Data Selector** picks the workbook and which PAGE of it holds the slice names and values.'
    },
    GrumpySurfacePlot: {
        label: 'Surface Chart 3D',
        desc: 'A 3D surface: a sheet of corrugated iron, or any surface a family of profiles describes. One '
            + 'SERIES is one slice along the sheet\'s length, its values are that slice\'s height at every X '
            + 'position across the width, and neighbouring slices are joined so the picture is the surface '
            + 'itself. No package, no assets.',
        use: 'Every series is one SLICE along the sheet\'s LENGTH: it reads the SAME shared X column (the '
            + 'width positions) and its own Y column, so the columns C, D, E … are slices 1, 2, 3 … and the '
            + 'Series editor lists them, each named by its Title and coloured by its own colour. Each slice '
            + 'stands where the SPREADSHEET says: Z Row names the row that holds one Z value per slice (empty '
            + '= the Names Row), which is one row of numbers like 0, 5, 10 … along the length — and where that '
            + 'cell is not a number the slices are numbered from Z Start in steps of Z Step instead. Style '
            + 'picks how the sheet is drawn — Grid mesh (the quads\' edges only, so you see through it), Grid '
            + 'mesh + solid (the mesh over a filled surface, the default) or Solid — and Colour By picks the '
            + 'colour: Sampleset (one colour per slice) or Temperature, a ramp by HEIGHT from Low Colour at '
            + 'the valleys to High Colour on the ridges, with Colour Low/High pinning that range when several '
            + 'charts are read against one scale. Solid Opacity makes the filled sheet see-through, and Mesh '
            + 'Colour/Thickness shape the mesh lines themselves (the floor gridlines keep Grid Colour). For a '
            + 'quick sketch without a workbook, Sample Sets takes whole slices inline — "1,2,3; 3,2,1" is two '
            + 'slices of three samples. The VIEW is Elevation (how far above the floor you look, default 30), '
            + 'Azimuth (where the sheet is turned to, default 45), Sheet Depth (how deep it stands) and Zoom; '
            + 'in the app the chart can also be DRAGGED to turn it, which never changes the saved angles. '
            + '**The range window is this chart\'s legend**: Width From/To cuts the picture to part of the '
            + 'sheet\'s width and Slice From/To picks WHICH slices are drawn (the sheet\'s length, so a long '
            + 'capture can be looked at a few corrugations at a time), and the view is ALWAYS re-fitted to make '
            + 'that window fill the frame — selecting a range zooms into it instead of leaving a small sheet in '
            + 'a large frame. The height is the data itself and has no slider. That legend is not a list of '
            + 'names: the surface is the one chart whose legend is a RANGE SELECTOR, drawn as an X slider and a '
            + 'Z slider (with the selected numbers beside them). It takes the side the form asks for — along the '
            + 'top or bottom edge, or DOWN a Left/Right edge with the sliders and their numbers turned on their '
            + 'side. Drag a handle in the running app and the picture follows live; set the numbers in the '
            + 'Legend editor (Width range and Slice range) to save them into the form. **Data Selector** picks '
            + 'the workbook and which PAGE of it holds the surface.'
    },

    GrumpyWaterfallPlot: {
        label: 'Waterfall',
        desc: 'A 3D waterfall (spectral) chart: successive samplesets drawn one behind the other — samples across, values up, and each set receding into the depth with the mesh that joins them. No package, no assets.',
        use: 'One SERIES is one SAMPLESET, so the columns C, D, E … are sets 1, 2, 3 … and the row number is the sample point (sample 1 is the first data row): the Series editor therefore lists your sweeps, each named by its Title in the legend, coloured by its own colour, and with a **Z Column** row naming the spreadsheet column that set reads — leave it empty and the sets walk one column each from the chart\'s First Set Column, so ten bare series read C, D, E … L. For a quick sketch without a workbook, Sample Sets takes them inline — "1,2,3; 4,5,6" is two sets of three samples. Style picks Ribbon (solid fills, so nearer sets hide the ones behind), Translucent (with Fill Opacity) or Lines (no fill: traces and mesh only, a wireframe). Colour By picks how the traces are painted: Sampleset (one colour per set), Value (a heat map by amplitude, with Heat Low/High pinning the map\'s ends — empty means the data\'s own least and greatest) or Split (two colours either side of Split Value, so a limit is visible in the picture; the trace is cut exactly where it crosses it). Connectors draws the mesh between the sets (Connector Step spaces it out; 0 spreads about forty connectors per trace), and Max Points thins a long capture for speed (512 drawn samples by default, 0 draws every one — the stride is the same for every set so the mesh stays aligned), and the view is Elevation (how far above the floor you look, default 30), Azimuth (where the cube is turned to, default 45), Set Spacing (how deep the sets stand) and Zoom. In the app the chart can also be DRAGGED to turn it — that changes only the running picture, never the saved angles. The floor gridlines and the three projected axes take their colour, thickness and labels from the axes rows (Axes, Axis Colour, ticks, Tick Labels, Tick Label Size, Axis Names, Sample/Value/Depth Axis Name). The pointer reports the sample it is over in the black readout panel (its X sample number and its Y value). **Data Selector** picks the workbook and which PAGE of it holds the sweeps.'
    },
    GrumpyLinePlot: {
        label: 'Line Plot',
        desc: 'A line chart that draws itself: your Y values in sample order, with axes, gridlines, a title and a legend — no package, no image file.',
        use: 'Type the Y values into Values (comma separated: 4,9,6,12) or point Spreadsheet at an .xlsx workbook — pick it from the chart\'s right-click menu (Choose spreadsheet…) or the Spreadsheet row; the X axis runs 0,1,2… across the samples. Add a line per series with the Series editor (Series — Edit series…): each series has its own Y column, colour, thickness, style and Visible switch, and the legend lists them with a tick box each. The Axis editor sets where each axis sits, its ticks and labels, and three colours of its own — the line and its ticks, the tick labels, and the axis name; each text colour left empty follows the line colour. The Legend editor sets the bar\'s side, its frame, backcolour and the margin between frame and entries; the Cursors editor adds up to two draggable crosshairs whose crossing follows the selected trace and whose readout reports its values in white on a black panel, while the trace\'s own colour marks the panel border and its series line (drag a line, ←/→ step one sample, ↑/↓ choose the trace, right-click for the chart menu). The plot backcolour, a background gradient, the border, gridlines, title and the padding between that border and the chart frame are in Properties (leave Padding empty for the chart\'s own small gap). The chart\'s right-click menu can Fill the container — the chart is docked over the whole form area, on top of the other controls, following the form as it resizes — and Restore the original position (the same as pressing Esc, which only acts while the chart is filled). The scale fits the data unless you set X/Y Min/Max. **Data Selector** (the button at the top of the Properties list) chooses where the data comes from: the workbook and which PAGE of it to read — the page list is the workbook\'s own sheet names — or Data Files, for the CSVs and other data files that come later.'
    },
    GrumpyXYPlot: {
        label: 'X, Y Plot',
        desc: 'An X,Y chart that draws itself: (x,y) pairs as a joined line, as markers, or both — with the same axes, gridlines, title and legend as the line plot.',
        use: 'Type the pairs into Points ("0,0 1,4 2,9") or point Spreadsheet at an .xlsx workbook where column B holds X and column C holds Y (row 1 names the axes, values start at row 2). Use the Series editor for one line per series — each series picks its own columns, colour, line style, marker and Join Points (on = a line through the points, off = a scatter) — the Cursors editor for up to two draggable crosshairs (their crossing follows the selected trace, their readout reports X and the trace value, and a following cursor is drawn in that trace\'s colour), and the legend editor for the bar\'s side, frame and tick boxes. The border, its Padding (the space between that border and the chart frame), the backcolour, gridlines and title are in Properties. More than one series read the X/Y pairs B/C, D/E, F/G… unless you name the columns yourself. **Data Selector** picks the workbook and which of its PAGES to read (or Data Files, for the CSVs and other data files that come later).'
    },
    XYTracker: {
        label: 'XY-Tracker',
        desc: 'A live read-out of the current Width × Height in pixels.',
        use: 'Dropped on a form it tracks its containing control (drop it into a pane or panel to watch that panel resize); placed in a Status Bar it reports the whole form\'s size. Style it like a label — Background, text Foreground and the font properties all work. Give it an Anchor to pin it to an edge.'
    },
    CustomTitleBar: {
        label: 'Custom Title Bar',
        desc: 'Replaces the window\'s default OS title bar with the bundled ChromeWindow custom title bar (dark navy, drag / min / max / close).',
        use: 'Drag it onto a Window-rooted form (or click the tool then the canvas). The form switches to the ChromeWindow title bar; undo with Ctrl+Z. Edit the title text via Properties → Title Bar Text.'
    },
    Border: {
        label: 'Border',
        desc: 'A decorative frame around its child (background, border, rounded corners).',
        use: 'Use to give a control or panel a visible box, border or rounded corner.'
    },
    ScrollViewer: {
        label: 'Scroll Viewer',
        desc: 'Adds scroll bars around its content.',
        use: 'Use when content may be bigger than the available space.'
    },
    Canvas: {
        label: 'Canvas',
        desc: 'Positions children by exact X/Y coordinates (Canvas.Left / Canvas.Top).',
        use: 'Use for free positioning or drawing; less flexible for resizing windows.'
    },
    ItemsControl: {
        label: 'Items Control',
        desc: 'Shows a list of items (with no built-in selection).',
        use: 'Use to display a collection with your own layout or template; unlike a ListBox it has no selection.'
    },
    UniformGrid: {
        label: 'Uniform Grid',
        desc: 'A grid where every cell is the same size.',
        use: 'Use for a tidy grid of equal-sized tiles or buttons that fill the space evenly.'
    },
    Line: {
        label: 'Line',
        desc: 'A straight line drawn between two points (Start Point → End Point).',
        use: 'Use for dividers, connector lines or simple diagrams. Resize it like any control — the line stretches to fill the selection box; set its thickness and colour in Properties.'
    },
    Rectangle: {
        label: 'Rectangle',
        desc: 'A rectangular box — a filled shape with an outline (Backcolor + line colour).',
        use: 'Use for boxes, panels or frames. Round the corners with Radius X / Radius Y; resize by dragging an edge.'
    },
    Ellipse: {
        label: 'Circle / Ellipse',
        desc: 'An oval or circle (equal width and height make a perfect circle).',
        use: 'Use for dots, orbs or decorative shapes. Set Backcolor for the fill and line colour for the outline; resize by dragging an edge.'
    },
    Arc: {
        label: 'Arc',
        desc: 'A curved line (arc) drawn within its box, from a Start Angle sweeping to a Sweep Angle.',
        use: 'Use for gauges, progress-like curves or decorative arcs. Set the angles, thickness and colour in Properties.'
    },
    GroupBox: {
        label: 'Group Box',
        desc: 'A titled box that groups related controls inside it (Avalonia 12 control).',
        use: 'Drop it on the form, then drop controls inside it to keep related settings together. Edit the title via Properties → Header. The designer shows an outline box; the titled group box appears at runtime.'
    },
    HyperlinkButton: {
        label: 'Hyperlink Button',
        desc: 'A button styled as a clickable link that opens a web page (Avalonia 12 control).',
        use: 'Use for “terms”, “learn more” or external links. Type the address in Properties → Navigate URI (or bind a Command); middle-click adds a Click handler. The designer preview shows a plain button.'
    },
    CommandBar: {
        label: 'Command Bar',
        desc: 'A horizontal bar of command buttons with an overflow menu (Avalonia 12 control).',
        use: 'Use as a toolbar of actions for a window or page. Commands live under CommandBar.PrimaryCommands (added in the XAML; a commands editor is planned). Dock it Top for a toolbar. The designer shows an empty bar area — the buttons appear at runtime.'
    },
    CommandBarButton: {
        label: 'Command Bar Button',
        desc: 'A single command button for a Command Bar (Avalonia 12 control).',
        use: 'Edit its Content/Label text; middle-click adds a Click handler. In a Command Bar, list it under CommandBar.PrimaryCommands in the XAML. The designer preview shows a normal button.'
    },
    CommandBarToggleButton: {
        label: 'Command Bar Toggle Button',
        desc: 'A toggle (on/off) command button for a Command Bar (Avalonia 12 control).',
        use: 'Shows an on/off state, e.g. a Bold/Italic button. In a Command Bar, list it under CommandBar.PrimaryCommands. The designer preview shows a toggle button.'
    },
    CommandBarSeparator: {
        label: 'Command Bar Separator',
        desc: 'A thin divider between groups of command buttons (Avalonia 12 control).',
        use: 'Add it between commands in CommandBar.PrimaryCommands to visually group them.'
    },
    GrumpySheet: {
        label: 'Spreadsheet',
        desc: 'A spreadsheet grid — 26 columns (A…Z) and 50 rows by default — with lettered headers that stay frozen, ranges you select by dragging, in-place typing, drag-to-autofill and a formula bar. It draws itself: no NuGet package, no template, no assets.',
        use: 'In the designer, the cell contents are typed in through the Cells row in the Properties panel (Edit cells…), which writes them into the form as <spread:SheetCell> elements and sets Rows/Columns there too, and the same dialog\'s formatting bar sets bold, italics, size, font, colours and alignment for whatever is selected. In the app you run the sheet is live: click a cell and type, drag to select a range, click a column letter or a row number to select the whole line, and drag the small square at the bottom-right of the selection to fill a series — 1, 2 becomes 3, 4, 5 …, 2, 4 becomes 6, 8 …, Item1, Item2 becomes Item3, and anything else repeats. Delete clears the selection, F2 or a double click edits the active cell, Esc abandons an edit, and the fx box at the top shows and edits the active cell\'s contents (Ctrl+U or a click puts the caret there). A right-click opens a menu that lines the selection up (left, centre, right, or automatic, for cells or for whole columns and rows), bolds or italicises it, and clears its contents or its formatting. Drag a border between two column letters — or between two row numbers — to give that column or row its own size; the new sizes are readable and writable through ColumnWidths/RowHeights as "3:120,7:60" pairs, and SheetSizeChanged fires once per drag, on release. Scrollbars appear when the sheet is bigger than its space (Show Scrollbars = False turns them off), the wheel scrolls the rows, Shift+wheel the columns, and a wheel over a sheet too short to scroll moves the columns instead. Read what the user typed with GetCell(row, column), write it with SetCell(row, column, text) — both 1-based, as are SelectedFirstRow/SelectedLastRow/SelectedFirstColumn/SelectedLastColumn — and react to every committed change with the CellChanged event; Allow Editing = False turns the sheet into a read-only result grid. The cell text is stored verbatim, so a formula like =SUM(B2:B6) is kept and shown; evaluating it is the next phase.'
    },
};

/** The seven bundled chart controls all derive from the same `ChartBase`, so they all share the
 *  right-click menu's hardcopy entries (0.12.0) — one sentence here beats repeating it in seven
 *  `use` strings, and it stays true if a new chart type is added. */
const CHART_TAGS = new Set([
    'GrumpyLinePlot', 'GrumpyXYPlot', 'GrumpyBarPlot',
    'GrumpyAreaPlot', 'GrumpyPiePlot', 'GrumpyWaterfallPlot', 'GrumpySurfacePlot'
]);

const CHART_HARDCOPY_HELP =
    ' In the app you run (F5) the chart\'s right-click menu also carries Print…, Print to PDF… (it asks for a '
    + 'file, then writes one — on every platform) and Save as picture… (a PNG); Ctrl+P does the same from the '
    + 'keyboard. Print… needs a real window and either the platform\'s own print dialog (registered with '
    + 'AppBuilder.UsePrintables() — Windows, macOS, GTK) or, on a Linux desktop, the CUPS client `lp`: both '
    + 'paths are bundled, so on Linux it prints through CUPS with that one installed. \"Print to PDF…\" and '
    + '\"Save as picture…\" need neither. In the designer preview, which draws with the headless host, none of '
    + 'them is offered. The page they use is set by the Print Paper / Print Margin / Print on White rows in '
    + 'this panel; the default, As drawn, keeps the chart\'s own size — and the runtime Legend toggle leaves '
    + 'the legend off the paper when you only want the graph.';

/** Returns the plain-language info for a control tag (falls back to a generic entry). */
export function controlInfoFor(tag: string): ControlInfo {
    const info = INFO[tag];
    if (!info) {
        return {
            label: tag,
            desc: `A ${tag} control.`,
            use: 'Select it on the canvas and use the Properties panel to adjust it.'
        };
    }
    return CHART_TAGS.has(tag) ? { ...info, use: info.use + CHART_HARDCOPY_HELP } : info;
}
