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
        use: 'Use at the top of a window to group commands. Add MenuItem children with a Header (e.g. "File").'
    },
    StatusBar: {
        label: 'Status Bar',
        desc: 'A bar along the bottom of the window that shows status items (text, buttons, a clock).',
        use: 'A DockPanel strip docked to the bottom. It comes with a "Ready" label on the left; add more items with the Status Items editor (Properties panel) — each item is pinned LEFT or RIGHT and stretches to the bar\'s height.'
    },
    StatusDate: {
        label: 'Status Date / Time',
        desc: 'A live clock that shows the current system date and time (in the OS date/time format).',
        use: 'Placed anywhere (often in a Status Bar). It shows the current date/time in the OS format and updates itself every second — no code needed from you.'
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
