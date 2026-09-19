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
    }
};

/** Returns the plain-language info for a control tag (falls back to a generic entry). */
export function controlInfoFor(tag: string): ControlInfo {
    return INFO[tag] || {
        label: tag,
        desc: `A ${tag} control.`,
        use: 'Select it on the canvas and use the Properties panel to adjust it.'
    };
}
