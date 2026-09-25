import { localName } from './xamlModel';
import { isChartTag, isCartesianChartTag, isSeriesChartTag, supportsCursors } from './chartSeries';

/**
 * Property descriptions for the designer's Properties panel.
 * Verified against the real Avalonia 12.1.1 assemblies (reflection dump of
 * public instance properties) so every property here is settable in XAML
 * without breaking the previewer render.
 */
export interface PropDef {
    key: string;
    label: string;
    kind: 'text' | 'number' | 'dropdown' | 'font' | 'color' | 'margin' | 'button' | 'file';
    value: string;
    options?: string[];
    unit?: string;
    desc?: string;
    advanced?: boolean;
    /** Read-only field (e.g. a DataSet binding managed in code-behind). */
    readOnly?: boolean;
    /** An Image.Source row: also offers a 'Data…' button that binds the Image to a DataGrid's
     *  selected-row image column (in addition to the file browser). */
    dataImage?: boolean;
    /** Multi-select row: the selected controls' values for this key DIFFER (shown as an empty box). */
    mixed?: boolean;
    /** Section header this row is filed under in the Properties panel (`undefined` = pinned above
     *  every section — the control's Name/Type identity rows). */
    section?: string;
    /** Stable id of that section — the webview remembers which sections the user collapsed per
     *  control TYPE with it (labels could be translated/reworded, ids should not). */
    sectionId?: string;
}

interface PropTemplate {
    key: string;
    label: string;
    kind: 'text' | 'number' | 'dropdown' | 'font' | 'color' | 'margin' | 'button' | 'file';
    options?: string[];
    unit?: string;
    desc?: string;
    advanced?: boolean;
    defaultValue?: string;
}

const BOOL = ['True', 'False'];
const TRISTATE = ['True', 'False', 'Null'];
const H_ALIGN = ['Stretch', 'Left', 'Center', 'Right'];
const V_ALIGN = ['Stretch', 'Top', 'Center', 'Bottom'];
const TEXT_ALIGN = ['Left', 'Center', 'Right', 'Justify'];
const TEXT_WRAP = ['NoWrap', 'Wrap', 'WrapWithOverflow'];
const TEXT_TRIM = ['None', 'CharacterEllipsis', 'WordEllipsis'];
const FONT_WEIGHTS = ['Normal', 'Bold', 'Thin', 'Light', 'Medium', 'SemiBold', 'ExtraBold', 'Black'];
const FONT_STYLES = ['Normal', 'Italic', 'Oblique'];
const STRETCH = ['None', 'Fill', 'Uniform', 'UniformToFill'];
const STRETCH_DIR = ['UpOnly', 'DownOnly', 'Both'];
const ORIENTATION = ['Vertical', 'Horizontal'];

/** GrumpyCharts: how a plot line or the gridlines are dashed, the X,Y plot's marker symbols, the
 *  chart title's position, and which sheet columns/rows hold the data. */
const CHART_LINE_STYLES = ['Solid', 'Dash', 'Dot', 'DashDot'];
const CHART_MARKERS = ['None', 'Dot', 'Cross', 'Square', 'Diamond'];
const CHART_TITLE_POSITIONS = ['Top', 'Bottom', 'Left', 'Right'];

/** How a bar chart stands its bars in their category (the C# `BarMode`). */
const BAR_MODES = ['Grouped', 'Stacked', 'Stacked100'];

/** How an area chart fills its series (the C# `AreaMode`). */
const AREA_MODES = ['Plain', 'Stacked', 'Stacked100'];

// The waterfall's own enums (the C# WaterfallStyle / WaterfallColorMode), in the same order.
const WATERFALL_STYLES = ['Ribbon', 'Translucent', 'Lines'];
const WATERFALL_COLOR_MODES = ['Sampleset', 'Value', 'Split'];

// The surface chart 3D's own enums (the C# SurfaceStyle / SurfaceColorMode), in the same order.
const SURFACE_STYLES = ['GridMesh', 'GridMeshSolid', 'Solid'];
const SURFACE_COLOR_BYS = ['Sampleset', 'Temperature'];
const DOCK_OPTIONS = ['None', 'Fill', 'Left', 'Top', 'Right', 'Bottom'];
// PathPicker.PathType — which platform dialog the Browse button opens. SaveFile need not exist yet
// (it is the “choose where to save” variant).
const PATH_TYPE = ['File', 'Folder', 'SaveFile'];
const CLICK_MODE = ['Release', 'Press', 'Hover'];
const LINE_CAPS = ['Flat', 'Round', 'Square'];
// CommandBar label/overflow position enums (verified against Avalonia 12.1.1).
const LABEL_POS = ['Bottom', 'Right', 'Collapsed'];
const OVERFLOW_VIS = ['Auto', 'Visible', 'Collapsed'];
const SCROLLBAR = ['Disabled', 'Auto', 'Hidden', 'Visible'];
const SELECTION_MODE = ['Single', 'Multiple', 'Extended', 'Toggle'];
const TAB_PLACEMENT = ['Top', 'Bottom', 'Left', 'Right'];
const STARTUP_LOC = ['Manual', 'CenterScreen', 'CenterOwner'];
const WINDOW_STATE = ['Normal', 'Maximized', 'Minimized', 'FullScreen'];
const DECORATIONS = ['Full', 'None', 'BorderOnly'];
const SIZE_TO_CONTENT = ['Manual', 'Width', 'Height', 'WidthAndHeight'];

/** Common named colors offered by the color pickers. */
const COLORS = [
    'Transparent', 'Black', 'White', 'Red', 'Green', 'Blue', 'Yellow', 'Orange',
    'Purple', 'Gray', 'DarkGray', 'LightGray', 'Silver', 'Navy', 'Teal', 'Aqua',
    'Maroon', 'Olive', 'Lime', 'Fuchsia', 'Gold', 'Coral', 'Crimson', 'Indigo',
    'Pink', 'Brown', 'Beige', 'LightBlue', 'DarkBlue', 'LightGreen', 'DarkGreen'
];

/**
 * Colour/brush properties that override the OS theme when set explicitly. The "Theme"
 * property switches a control back to "System" by clearing these.
 */
export const THEME_COLOR_KEYS = [
    'Background', 'Foreground', 'BorderBrush', 'CaretBrush', 'SelectionBrush',
    'PlaceholderForeground', 'RowBackground', 'HorizontalGridLinesBrush', 'VerticalGridLinesBrush'
];

/** True if the element sets any colour explicitly (so its Theme is "Custom"). */
export function hasCustomColors(el: Element): boolean {
    return THEME_COLOR_KEYS.some((k) => el.getAttribute(k));
}

/** Fonts offered by the Font Family picker. */
const FONTS = [
    'Default', 'sans-serif', 'serif', 'monospace', 'Arial', 'Arial Black', 'Calibri',
    'Cambria', 'Candara', 'Comic Sans MS', 'Consolas', 'Courier New', 'Georgia',
    'Impact', 'Lucida Console', 'Lucida Sans Unicode', 'Palatino Linotype', 'Segoe UI',
    'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'
];

/** Uniform margin presets offered by the Margin field. */
const MARGIN_PRESETS = ['0', '4', '8', '12', '16', '24', '32', '48'];

/**
 * XAML Opacity (0-1) -> percentage string for the Properties panel (0-100).
 * A missing/blank value means the default (fully opaque) -> 100.
 */
export function xamlToOpacity(xaml: string | undefined | null): string {
    const raw = String(xaml ?? '').trim();
    if (raw === '') return '100';
    const n = parseFloat(raw);
    if (isNaN(n)) return '100';
    return String(Math.round(n * 100));
}

/**
 * Percentage input (0-100, optionally "50%") -> XAML Opacity (0-1).
 * An empty value clears the attribute (defaults to fully opaque).
 */
export function opacityToXaml(pct: string): string {
    const raw = String(pct ?? '').trim().replace(/%\s*$/, '');
    if (raw === '') return '';
    const n = parseFloat(raw);
    if (isNaN(n)) return '';
    const clamped = Math.max(0, Math.min(100, n));
    return String(clamped / 100);
}

/**
 * Properties valid on EVERY control (the Layoutable / InputElement / Visual
 * surface). Note: Avalonia 11 uses `IsVisible` (bool), NOT WPF-style
 * `Visibility` (Visible/Hidden/Collapsed).
 */
export const COMMON_PROPS: PropTemplate[] = [
    { key: 'Width', label: 'Width', kind: 'number' },
    { key: 'Height', label: 'Height', kind: 'number' },
    { key: 'MinWidth', label: 'Min Width', kind: 'number' },
    { key: 'MinHeight', label: 'Min Height', kind: 'number' },
    { key: 'MaxWidth', label: 'Max Width', kind: 'number' },
    { key: 'MaxHeight', label: 'Max Height', kind: 'number' },
    { key: 'Margin', label: 'Margin', kind: 'text' },
    { key: 'HorizontalAlignment', label: 'H. Align', kind: 'dropdown', options: H_ALIGN },
    { key: 'VerticalAlignment', label: 'V. Align', kind: 'dropdown', options: V_ALIGN },
    { key: 'IsVisible', label: 'Visible', kind: 'dropdown', options: BOOL },
    { key: 'IsEnabled', label: 'Enabled', kind: 'dropdown', options: BOOL },
    { key: 'IsHitTestVisible', label: 'Hit-Test Visible', kind: 'dropdown', options: BOOL },
    { key: 'IsTabStop', label: 'Tab Stop', kind: 'dropdown', options: BOOL },
    { key: 'Focusable', label: 'Focusable', kind: 'dropdown', options: BOOL },
    { key: 'TabIndex', label: 'Tab Index', kind: 'number' },
    { key: 'Opacity', label: 'Opacity', kind: 'number' },
    { key: 'ZIndex', label: 'Z-Index', kind: 'number' },
    { key: 'Canvas.Left', label: 'Left', kind: 'number' },
    { key: 'Canvas.Top', label: 'Top', kind: 'number' }
];

/**
 * Anchor property (WinForms-style, provided by the bundled AnchorHelper in generated
 * projects). Written as an attached property on the `chrome` (AvaloniaChrome) namespace.
 * Not shown on the root element (a window/UserControl has no container to anchor to).
 */
export const ANCHOR_OPTIONS = [
    'None', 'Left', 'Right', 'Top', 'Bottom',
    'Left,Right', 'Top,Bottom',
    'Left,Bottom', 'Right,Bottom', 'Left,Top', 'Right,Top'
];

export const ANCHOR_PROPS: PropTemplate[] = [
    { key: 'chrome:AnchorHelper.Anchor', label: 'Anchor', kind: 'dropdown', options: ANCHOR_OPTIONS }
];

/**
 * GrumpyPanel's DEDICATED Anchor: 8 positions (the 4 edges + the 4 corners). Unlike the generic
 * Anchor (Canvas/DockPanel children only), this is offered on the panel wherever it sits (non-root).
 * The hyphenated corner values are read by the bundled AnchorHelper's substring matching
 * ("Top-Left" contains both "Left" and "Top" → pins that corner), so no helper change is needed.
 */
export const GRUMPY_ANCHOR_OPTIONS = [
    'None', 'Left', 'Right', 'Top', 'Bottom',
    'Top-Left', 'Top-Right', 'Bottom-Left', 'Bottom-Right'
];

export const GRUMPY_ANCHOR_PROPS: PropTemplate[] = [
    { key: 'chrome:AnchorHelper.Anchor', label: 'Anchor', kind: 'dropdown', options: GRUMPY_ANCHOR_OPTIONS }
];

// ---------------- StatusDate clock — Date/Time format (System / Custom presets) ----------------
/**
 * Friendly choices for the Date and Time parts of a StatusDate clock — aimed at beginners: each
 * option shows what it looks like, no raw .NET format strings required. 'None (hidden)' hides that
 * part; 'System date' / 'System time' use the OS current-culture standard (short date / long time).
 */
export const STATUS_CLOCK_CHOICES: Record<'date' | 'time', string[]> = {
    date: ['None (hidden)', 'System date', 'Mon, 9 Sep 2026', '9 September 2026', '09/09/2026', '2026-09-09'],
    time: ['None (hidden)', 'System time', '14:32', '14:32:05', '2:32 PM', '02:32:05 PM']
};

/** The .NET format string behind a friendly StatusDate choice: '' hides that part; 'd'/'T' are the
 *  OS current-culture standard short date / long time; anything else is an explicit pattern that the
 *  generated code renders with the InvariantCulture so the example the user picked is exact. */
export function statusClockFormat(part: 'date' | 'time', choice: string): string {
    if (choice === 'None (hidden)') return '';
    if (choice === 'System date') return 'd';
    if (choice === 'System time') return 'T';
    if (part === 'date') {
        switch (choice) {
            case 'Mon, 9 Sep 2026': return 'ddd, d MMM yyyy';
            case '9 September 2026': return 'd MMMM yyyy';
            case '09/09/2026': return 'dd/MM/yyyy';
            case '2026-09-09': return 'yyyy-MM-dd';
        }
    } else {
        switch (choice) {
            case '14:32': return 'HH:mm';
            case '14:32:05': return 'HH:mm:ss';
            case '2:32 PM': return 'h:mm tt';
            case '02:32:05 PM': return 'hh:mm:ss tt';
        }
    }
    return '';
}

/** The default StatusDate choices (OS date + OS time — today's behaviour) when a clock has no
 *  stored setting (e.g. placed before this feature). */
export const STATUS_CLOCK_DEFAULT = { date: 'System date', time: 'System time' };

/** True when `el` is a StatusDate live clock: a TextBlock with a Loaded handler that is NOT an
 *  XYTracker (which is also a TextBlock with Loaded, distinguished by Classes="XYTracker"). */
export function isStatusClock(el: Element): boolean {
    if (localName(el.tagName) !== 'TextBlock') return false;
    const cls = (el.getAttribute('Classes') || '').split(/\s+/);
    if (cls.indexOf('XYTracker') >= 0) return false;
    return el.hasAttribute('Loaded');
}

/** A lightweight "what will it look like right now?" sample for the preview row. Renders the small,
 *  fixed set of tokens our presets use (plus a JS approximation of the OS date/time). Not a full
 *  .NET formatter — it only needs to cover the offered choices. */
export function statusClockSample(dateChoice: string, timeChoice: string, now: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const render = (fmt: string, system: boolean): string => {
        if (!fmt) return '';
        if (system) {
            if (fmt === 'd') return now.toLocaleDateString();
            return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        let h12 = now.getHours() % 12; if (h12 === 0) h12 = 12;
        const ampm = now.getHours() < 12 ? 'AM' : 'PM';
        const toks: Record<string, string> = {
            ddd: days[now.getDay()], MMMM: months[now.getMonth()], MMM: months[now.getMonth()].slice(0, 3),
            yyyy: String(now.getFullYear()), MM: pad(now.getMonth() + 1), dd: pad(now.getDate()),
            d: String(now.getDate()), HH: pad(now.getHours()), mm: pad(now.getMinutes()),
            ss: pad(now.getSeconds()), hh: pad(h12), h: String(h12), tt: ampm
        };
        return fmt.replace(/dddd|ddd|MMMM|MMM|yyyy|HH|mm|ss|dd|hh|tt|[dh]/g, (tok) => toks[tok] ?? tok);
    };
    const d = dateChoice === 'None (hidden)' ? '' : render(statusClockFormat('date', dateChoice), dateChoice === 'System date');
    const t = timeChoice === 'None (hidden)' ? '' : render(statusClockFormat('time', timeChoice), timeChoice === 'System time');
    return [d, t].filter((s) => s !== '').join(' ');
}

/** Font/text properties — only on text-capable controls (not panels, Border, Image). */
export const FONT_PROPS: PropTemplate[] = [
    { key: 'FontFamily', label: 'Font Family', kind: 'text' },
    { key: 'FontSize', label: 'Font Size', kind: 'number' },
    { key: 'FontWeight', label: 'Font Weight', kind: 'dropdown', options: FONT_WEIGHTS },
    { key: 'FontStyle', label: 'Font Style', kind: 'dropdown', options: FONT_STYLES },
    { key: 'Foreground', label: 'Text Color (Foreground)', kind: 'text' }
];

/** Controls that expose the font/text properties (TemplatedControl / TextElement). */
export const HAS_FONT_PROPS = new Set([
    'Button', 'TextBox', 'TextBlock', 'ComboBox', 'ListBox', 'ListBoxItem', 'CheckBox', 'RadioButton',
    'TabControl', 'TabItem', 'DataGrid', 'Menu', 'StatusBar', 'ScrollViewer', 'UserControl', 'Window',
    'TreeView',
    // Avalonia 12 text-bearing controls (headers / labels / link text)
    'GroupBox', 'HyperlinkButton', 'CommandBar', 'CommandBarButton', 'CommandBarToggleButton',
    // The 2026-09-19 controls that show or take text
    'ToggleSwitch', 'MaskedTextBox', 'NumericUpDown'
]);

export const CONTROL_PROPS: Record<string, PropTemplate[]> = {
    Button: [
        { key: 'Content', label: 'Content', kind: 'text' },
        { key: 'Command', label: 'Command', kind: 'text' },
        { key: 'CommandParameter', label: 'Command Param', kind: 'text' },
        { key: 'IsDefault', label: 'Is Default', kind: 'dropdown', options: BOOL },
        { key: 'IsCancel', label: 'Is Cancel', kind: 'dropdown', options: BOOL },
        { key: 'ClickMode', label: 'Click Mode', kind: 'dropdown', options: CLICK_MODE },
        { key: 'HorizontalContentAlignment', label: 'H. Content', kind: 'dropdown', options: H_ALIGN },
        { key: 'VerticalContentAlignment', label: 'V. Content', kind: 'dropdown', options: V_ALIGN },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' }
    ],
    // --- Avalonia 12 controls (real tags; the 11 preview host draws approximations) ---
    GroupBox: [
        { key: 'Header', label: 'Header', kind: 'text' },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' },
        { key: 'HorizontalContentAlignment', label: 'H. Content', kind: 'dropdown', options: H_ALIGN },
        { key: 'VerticalContentAlignment', label: 'V. Content', kind: 'dropdown', options: V_ALIGN }
    ],
    HyperlinkButton: [
        { key: 'Content', label: 'Content', kind: 'text' },
        { key: 'NavigateUri', label: 'Navigate URI', kind: 'text' },
        { key: 'IsVisited', label: 'Visited', kind: 'dropdown', options: BOOL },
        { key: 'Command', label: 'Command', kind: 'text' },
        { key: 'CommandParameter', label: 'Command Param', kind: 'text' },
        { key: 'HorizontalContentAlignment', label: 'H. Content', kind: 'dropdown', options: H_ALIGN },
        { key: 'VerticalContentAlignment', label: 'V. Content', kind: 'dropdown', options: V_ALIGN },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' }
    ],
    CommandBar: [
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' },
        { key: 'IsOpen', label: 'Overflow Open', kind: 'dropdown', options: BOOL },
        { key: 'IsSticky', label: 'Sticky', kind: 'dropdown', options: BOOL },
        { key: 'IsDynamicOverflowEnabled', label: 'Dynamic Overflow', kind: 'dropdown', options: BOOL },
        { key: 'OverflowButtonVisibility', label: 'Overflow Button', kind: 'dropdown', options: OVERFLOW_VIS },
        { key: 'DefaultLabelPosition', label: 'Label Position', kind: 'dropdown', options: LABEL_POS }
    ],
    CommandBarButton: [
        { key: 'Content', label: 'Content', kind: 'text' },
        { key: 'Label', label: 'Label', kind: 'text' },
        { key: 'IsCompact', label: 'Compact', kind: 'dropdown', options: BOOL },
        { key: 'LabelPosition', label: 'Label Position', kind: 'dropdown', options: LABEL_POS },
        { key: 'Command', label: 'Command', kind: 'text' },
        { key: 'CommandParameter', label: 'Command Param', kind: 'text' },
        { key: 'HorizontalContentAlignment', label: 'H. Content', kind: 'dropdown', options: H_ALIGN },
        { key: 'VerticalContentAlignment', label: 'V. Content', kind: 'dropdown', options: V_ALIGN },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' }
    ],
    CommandBarToggleButton: [
        { key: 'Content', label: 'Content', kind: 'text' },
        { key: 'Label', label: 'Label', kind: 'text' },
        { key: 'IsChecked', label: 'Is Checked', kind: 'dropdown', options: BOOL },
        { key: 'IsCompact', label: 'Compact', kind: 'dropdown', options: BOOL },
        { key: 'LabelPosition', label: 'Label Position', kind: 'dropdown', options: LABEL_POS },
        { key: 'Command', label: 'Command', kind: 'text' },
        { key: 'CommandParameter', label: 'Command Param', kind: 'text' },
        { key: 'HorizontalContentAlignment', label: 'H. Content', kind: 'dropdown', options: H_ALIGN },
        { key: 'VerticalContentAlignment', label: 'V. Content', kind: 'dropdown', options: V_ALIGN },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' }
    ],
    CommandBarSeparator: [
        { key: 'IsCompact', label: 'Compact', kind: 'dropdown', options: BOOL }
    ],
    TextBox: [
        { key: 'Text', label: 'Text', kind: 'text' },
        { key: 'PlaceholderText', label: 'Placeholder', kind: 'text' },
        { key: 'PasswordChar', label: 'Password Char', kind: 'text' },
        { key: 'MaxLength', label: 'Max Length', kind: 'number' },
        { key: 'IsReadOnly', label: 'Read Only', kind: 'dropdown', options: BOOL },
        { key: 'AcceptsReturn', label: 'Accepts Return', kind: 'dropdown', options: BOOL },
        { key: 'AcceptsTab', label: 'Accepts Tab', kind: 'dropdown', options: BOOL },
        { key: 'TextWrapping', label: 'Text Wrapping', kind: 'dropdown', options: TEXT_WRAP },
        { key: 'TextAlignment', label: 'Text Align', kind: 'dropdown', options: TEXT_ALIGN },
        { key: 'IsUndoEnabled', label: 'Undo Enabled', kind: 'dropdown', options: BOOL },
        { key: 'SelectionStart', label: 'Selection Start', kind: 'number' },
        { key: 'SelectionEnd', label: 'Selection End', kind: 'number' },
        { key: 'CaretBrush', label: 'Caret Brush', kind: 'text' },
        { key: 'SelectionBrush', label: 'Selection Brush', kind: 'text' },
        { key: 'HorizontalContentAlignment', label: 'H. Content', kind: 'dropdown', options: H_ALIGN },
        { key: 'VerticalContentAlignment', label: 'V. Content', kind: 'dropdown', options: V_ALIGN },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' }
    ],
    TextBlock: [
        { key: 'Text', label: 'Text', kind: 'text' },
        { key: 'TextWrapping', label: 'Text Wrapping', kind: 'dropdown', options: TEXT_WRAP },
        { key: 'TextTrimming', label: 'Text Trimming', kind: 'dropdown', options: TEXT_TRIM },
        { key: 'TextAlignment', label: 'Text Align', kind: 'dropdown', options: TEXT_ALIGN },
        { key: 'LineHeight', label: 'Line Height', kind: 'number' },
        { key: 'LetterSpacing', label: 'Letter Spacing', kind: 'number' },
        { key: 'MaxLines', label: 'Max Lines', kind: 'number' },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'Background', label: 'Background', kind: 'text' }
    ],
    ComboBox: [
        { key: 'ItemsSource', label: 'Items Source', kind: 'text' },
        { key: 'SelectedIndex', label: 'Selected Index', kind: 'number' },
        { key: 'SelectedItem', label: 'Selected Item', kind: 'text' },
        { key: 'PlaceholderText', label: 'Placeholder', kind: 'text' },
        { key: 'IsDropDownOpen', label: 'Drop-Down Open', kind: 'dropdown', options: BOOL },
        { key: 'IsTextSearchEnabled', label: 'Text Search', kind: 'dropdown', options: BOOL },
        { key: 'MaxDropDownHeight', label: 'Max Drop Height', kind: 'number' },
        { key: 'HorizontalContentAlignment', label: 'H. Content', kind: 'dropdown', options: H_ALIGN },
        { key: 'VerticalContentAlignment', label: 'V. Content', kind: 'dropdown', options: V_ALIGN },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' }
    ],
    ListBox: [
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'ItemsSource', label: 'Items Source', kind: 'text' },
        { key: 'SelectedIndex', label: 'Selected Index', kind: 'number' },
        { key: 'SelectedItem', label: 'Selected Item', kind: 'text' },
        { key: 'SelectionMode', label: 'Selection Mode', kind: 'dropdown', options: SELECTION_MODE },
        { key: 'WrapSelection', label: 'Wrap Selection', kind: 'dropdown', options: BOOL },
        { key: 'IsTextSearchEnabled', label: 'Text Search', kind: 'dropdown', options: BOOL },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' }
    ],
    ItemsControl: [
        { key: 'ItemsSource', label: 'Items Source', kind: 'text' },
        { key: 'Background', label: 'Background', kind: 'text' }
    ],
    UniformGrid: [
        { key: 'Columns', label: 'Columns', kind: 'number' },
        { key: 'Rows', label: 'Rows', kind: 'number' },
        { key: 'FirstColumn', label: 'First Column', kind: 'number' },
        { key: 'FirstRow', label: 'First Row', kind: 'number' },
        { key: 'Background', label: 'Background', kind: 'text' }
    ],
    CheckBox: [
        { key: 'Content', label: 'Content', kind: 'text' },
        { key: 'IsChecked', label: 'Is Checked', kind: 'dropdown', options: TRISTATE },
        { key: 'IsThreeState', label: 'Three State', kind: 'dropdown', options: BOOL },
        { key: 'Command', label: 'Command', kind: 'text' },
        { key: 'CommandParameter', label: 'Command Param', kind: 'text' },
        { key: 'HorizontalContentAlignment', label: 'H. Content', kind: 'dropdown', options: H_ALIGN },
        { key: 'VerticalContentAlignment', label: 'V. Content', kind: 'dropdown', options: V_ALIGN },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' }
    ],
    RadioButton: [
        { key: 'Content', label: 'Content', kind: 'text' },
        { key: 'IsChecked', label: 'Is Checked', kind: 'dropdown', options: BOOL },
        { key: 'GroupName', label: 'Group Name', kind: 'text' },
        { key: 'Command', label: 'Command', kind: 'text' },
        { key: 'CommandParameter', label: 'Command Param', kind: 'text' },
        { key: 'HorizontalContentAlignment', label: 'H. Content', kind: 'dropdown', options: H_ALIGN },
        { key: 'VerticalContentAlignment', label: 'V. Content', kind: 'dropdown', options: V_ALIGN },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' }
    ],
    Image: [
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'Source', label: 'Source', kind: 'file' },
        { key: 'Stretch', label: 'Stretch', kind: 'dropdown', options: STRETCH },
        { key: 'StretchDirection', label: 'Stretch Direction', kind: 'dropdown', options: STRETCH_DIR },
        { key: 'Angle', label: 'Rotate', kind: 'number', unit: 'deg', desc: 'Rotates the image by this many degrees clockwise (writes an Image.RenderTransform RotateTransform).' }
    ],
    Panel: [
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'Background', label: 'Background', kind: 'text' }
    ],
    Grid: [
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'ShowGridLines', label: 'Show Grid Lines', kind: 'dropdown', options: BOOL }
    ],
    StackPanel: [
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'Orientation', label: 'Orientation', kind: 'dropdown', options: ORIENTATION },
        { key: 'Spacing', label: 'Spacing', kind: 'number' }
    ],
    DockPanel: [
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'LastChildFill', label: 'Last Child Fill', kind: 'dropdown', options: BOOL }
    ],
    // GrumpyPanel (a bundled AvaloniaChrome.GrumpyPanel — a Border whose child is a DockPanel +
    // named free body Canvas). Dock docks the whole panel into a DockPanel; the frame props style
    // its Border chrome (Theme System/Custom controls which of these are present).
    GrumpyPanel: [
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' },
        { key: 'Padding', label: 'Padding', kind: 'text' }
    ],
    // PathPicker (the bundled AvaloniaChrome.PathPicker — a path TextBox + Browse button that opens
    // the platform's file/folder dialog). Path Type picks WHICH dialog; Selected Path is the result
    // (two-way — set it to pre-fill, read it in code).
    PathPicker: [
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'PathType', label: 'Path Type', kind: 'dropdown', options: PATH_TYPE, desc: 'Which dialog the Browse button opens: File (pick an existing file), Folder (pick a folder) or SaveFile (choose where to save — the file need not exist yet).' },
        { key: 'SelectedPath', label: 'Selected Path', kind: 'text', desc: 'The chosen path. Two-way: set it to pre-fill the box (or clear it), read it in your code to use the pick.' },
        { key: 'Title', label: 'Dialog Title', kind: 'text', desc: 'Caption of the dialog window.' },
        { key: 'Filter', label: 'File Filter', kind: 'text', desc: 'File types offered by the dialog, WinForms style: "Images|*.png;*.jpg|All files|*.*". Ignored when Path Type is Folder.' },
        { key: 'InitialFolder', label: 'Initial Folder', kind: 'text', desc: 'Folder the dialog opens in when Selected Path is empty.' },
        { key: 'IsPathReadOnly', label: 'Read Only Path', kind: 'dropdown', options: BOOL, desc: 'True (default): the path can only come from the dialog. False: the user may also type or paste into the box.' },
        { key: 'ShowIcon', label: 'Show Icon', kind: 'dropdown', options: BOOL, desc: 'Show the small file/folder icon at the left edge, so a File Selector is told apart from a Folder Selector at a glance.' },
        { key: 'BrowseText', label: 'Browse Text', kind: 'text', desc: 'Caption of the Browse button (“…” by default — use "Browse…" for a wider button).' }
    ],
    WrapPanel: [
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'Orientation', label: 'Orientation', kind: 'dropdown', options: ORIENTATION },
        { key: 'ItemWidth', label: 'Item Width', kind: 'number' },
        { key: 'ItemHeight', label: 'Item Height', kind: 'number' }
    ],
    TabControl: [
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'SelectedIndex', label: 'Selected Index', kind: 'number' },
        { key: 'TabStripPlacement', label: 'Tab Strip', kind: 'dropdown', options: TAB_PLACEMENT },
        { key: 'HorizontalContentAlignment', label: 'H. Content', kind: 'dropdown', options: H_ALIGN },
        { key: 'VerticalContentAlignment', label: 'V. Content', kind: 'dropdown', options: V_ALIGN },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' }
    ],
    // TreeView (2026-09-18): the styling surface a TemplatedControl exposes, the same shape TabControl
    // uses. Selection is deliberately absent: `SelectedItem` holds an object the panel cannot edit as
    // text, and which node is selected is better driven from code than typed into XAML by hand.
    TreeView: [
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' }
    ],
    TabItem: [
        { key: 'Header', label: 'Header', kind: 'text' },
        { key: 'Content', label: 'Content', kind: 'text' },
        { key: 'HorizontalContentAlignment', label: 'H. Content', kind: 'dropdown', options: H_ALIGN },
        { key: 'VerticalContentAlignment', label: 'V. Content', kind: 'dropdown', options: V_ALIGN },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' }
    ],
    ListBoxItem: [
        { key: 'Content', label: 'Content', kind: 'text' },
        { key: 'HorizontalContentAlignment', label: 'H. Content', kind: 'dropdown', options: H_ALIGN },
        { key: 'VerticalContentAlignment', label: 'V. Content', kind: 'dropdown', options: V_ALIGN },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' }
    ],
    DataGrid: [
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'ItemsSource', label: 'Items Source', kind: 'text' },
        { key: 'AutoGenerateColumns', label: 'Auto Columns', kind: 'dropdown', options: BOOL },
        { key: 'IsReadOnly', label: 'Read Only', kind: 'dropdown', options: BOOL },
        { key: 'CanUserReorderColumns', label: 'Reorder Columns', kind: 'dropdown', options: BOOL },
        { key: 'CanUserResizeColumns', label: 'Resize Columns', kind: 'dropdown', options: BOOL },
        { key: 'CanUserSortColumns', label: 'Sort Columns', kind: 'dropdown', options: BOOL },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' }
    ],
    Menu: [
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'Background', label: 'Background', kind: 'text' }
    ],
    StatusBar: [
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'Background', label: 'Background', kind: 'text' }
    ],
    Border: [
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' },
        { key: 'Padding', label: 'Padding', kind: 'text' }
    ],
    ScrollViewer: [
        { key: 'HorizontalScrollBarVisibility', label: 'H. Scroll Bar', kind: 'dropdown', options: SCROLLBAR },
        { key: 'VerticalScrollBarVisibility', label: 'V. Scroll Bar', kind: 'dropdown', options: SCROLLBAR },
        { key: 'AllowAutoHide', label: 'Auto-Hide Bars', kind: 'dropdown', options: BOOL },
        { key: 'IsScrollInertiaEnabled', label: 'Scroll Inertia', kind: 'dropdown', options: BOOL },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' },
        { key: 'Padding', label: 'Padding', kind: 'text' }
    ],
    Canvas: [
        { key: 'Background', label: 'Background', kind: 'text' }
    ],
    // --- Shapes (Avalonia.Controls.Shapes) ---
    // Line is stroked only (no fill); its length/angle come from Start/End points, exposed as
    // editable "x,y" text. The designer stretches a Line on resize by scaling these points.
    // --- Progress, status & misc + the remaining input/button/shape gaps (2026-09-19) ---
    ProgressBar: [
        { key: 'Value', label: 'Value', kind: 'number' },
        { key: 'Minimum', label: 'Minimum', kind: 'number' },
        { key: 'Maximum', label: 'Maximum', kind: 'number' },
        { key: 'IsIndeterminate', label: 'Indeterminate', kind: 'dropdown', options: BOOL },
        { key: 'Foreground', label: 'Bar Colour', kind: 'color', options: COLORS },
        { key: 'Background', label: 'Background', kind: 'color', options: COLORS }
    ],
    Slider: [
        { key: 'Value', label: 'Value', kind: 'number' },
        { key: 'Minimum', label: 'Minimum', kind: 'number' },
        { key: 'Maximum', label: 'Maximum', kind: 'number' },
        { key: 'TickFrequency', label: 'Tick Every', kind: 'number' },
        { key: 'IsSnapToTickEnabled', label: 'Snap to Ticks', kind: 'dropdown', options: BOOL }
    ],
    Separator: [
        { key: 'Background', label: 'Colour', kind: 'color', options: COLORS }
    ],
    ToggleSwitch: [
        { key: 'IsChecked', label: 'On', kind: 'dropdown', options: BOOL },
        { key: 'OnContent', label: 'Text when On', kind: 'text' },
        { key: 'OffContent', label: 'Text when Off', kind: 'text' },
        { key: 'Content', label: 'Label', kind: 'text' },
        // A LOCAL Background wins over the Fluent ControlTheme's own setter, so this paints the
        // control's back plate behind the label + switch (the toggle pill itself keeps its theme
        // brush — ToggleSwitchFillOff/On — and is NOT recoloured by this). Setting it makes the
        // Theme row read 'Custom'; Theme = System clears it again (THEME_COLOR_KEYS).
        { key: 'Background', label: 'Background', kind: 'color', options: COLORS }
    ],
    MaskedTextBox: [
        { key: 'Text', label: 'Text', kind: 'text' },
        { key: 'Mask', label: 'Mask', kind: 'text' },
        { key: 'Watermark', label: 'Hint Text', kind: 'text' },
        { key: 'PasswordChar', label: 'Password Char', kind: 'text' }
    ],
    NumericUpDown: [
        { key: 'Value', label: 'Value', kind: 'number' },
        { key: 'Minimum', label: 'Minimum', kind: 'number' },
        { key: 'Maximum', label: 'Maximum', kind: 'number' },
        { key: 'Increment', label: 'Step', kind: 'number' },
        { key: 'FormatString', label: 'Format', kind: 'text' },
        { key: 'ShowButtonSpinner', label: 'Show Arrows', kind: 'dropdown', options: BOOL },
        // The template's ButtonSpinner binds Background, so this fills the number field itself.
        // Setting it makes the Theme row read 'Custom'; Theme = System clears it again.
        { key: 'Background', label: 'Background', kind: 'color', options: COLORS }
    ],
    Polyline: [
        { key: 'Points', label: 'Points', kind: 'text' },
        { key: 'Stroke', label: 'Line Colour', kind: 'color', options: COLORS },
        { key: 'StrokeThickness', label: 'Line Thickness', kind: 'number' }
    ],
    Polygon: [
        { key: 'Points', label: 'Points', kind: 'text' },
        { key: 'Fill', label: 'Backcolor', kind: 'color', options: COLORS },
        { key: 'Stroke', label: 'Line Colour', kind: 'color', options: COLORS },
        { key: 'StrokeThickness', label: 'Line Thickness', kind: 'number' }
    ],
    PathIcon: [
        { key: 'Data', label: 'Path Data', kind: 'text' },
        { key: 'Foreground', label: 'Icon Colour', kind: 'color', options: COLORS }
    ],
    // --- GrumpyCharts (the bundled AvaloniaCharts control set, 2026-09-19) ---
    // The two charts share every styling row; they differ in the data row (Values for a line plot,
    // Points for an X,Y plot) and in the marker rows, which only the X,Y plot draws.
    GrumpyLinePlot: [
        // Dockable like any panel child: DockPanel.Dock. Choosing a real dock makes the designer wrap
        // the chart in a DockPanel (when it isn't in one) and clear the free-axis size, so the chart
        // stretches to that edge; 'None' just removes the attribute. The chart redraws at its new
        // size because everything it draws is proportional.
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'Values', label: 'Values', kind: 'text' },
        // The workbook and its PAGE belong to the 'Data Selector' editor now (the Spreadsheet row that
        // used to sit here moved in there, so the file and the page are chosen in one place).
        { key: 'Gradient', label: 'Background Gradient', kind: 'button' },
        // X/Y Column and the data rows below belong to the ONE implicit series this chart draws
        // when it has no explicit <charts:LineSeries> children. A line plot reads X from the sample
        // index (0, 1, 2…), so only Y Column matters. Line Colour / Thickness / Style and the marker
        // rows moved into the 'Series' editor, where each line is styled on its own.
        { key: 'XColumn', label: 'X Column', kind: 'text' },
        { key: 'YColumn', label: 'Y Column', kind: 'text' },
        { key: 'HeaderRow', label: 'Names Row', kind: 'number' },
        { key: 'FirstDataRow', label: 'First Data Row', kind: 'number' },
        { key: 'LiveUpdate', label: 'Live Update', kind: 'dropdown', options: BOOL },
        { key: 'Title', label: 'Title', kind: 'text' },
        { key: 'ShowTitle', label: 'Show Title', kind: 'dropdown', options: BOOL },
        { key: 'TitlePosition', label: 'Title Position', kind: 'dropdown', options: CHART_TITLE_POSITIONS },
        { key: 'TitleColor', label: 'Title Colour', kind: 'color', options: COLORS },
        { key: 'TitleFontSize', label: 'Title Size', kind: 'number' },
        { key: 'PlotBackColor', label: 'Plot Backcolour', kind: 'color', options: COLORS },
        { key: 'PlotBackOpacity', label: 'Plot Opacity', kind: 'number' },
        { key: 'ShowBorder', label: 'Border', kind: 'dropdown', options: BOOL },
        { key: 'BorderBrush', label: 'Border Colour', kind: 'color', options: COLORS },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'number' },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' },
        { key: 'ShowGrid', label: 'Gridlines', kind: 'dropdown', options: BOOL },
        { key: 'GridColor', label: 'Grid Colour', kind: 'color', options: COLORS },
        { key: 'GridThickness', label: 'Grid Thickness', kind: 'number' },
        { key: 'GridStyle', label: 'Grid Style', kind: 'dropdown', options: CHART_LINE_STYLES },
        // The axis furniture (axis colour, the two tick sets and their sizes, the tick labels, the
        // axis names and their positions) belongs to the 'Axis' editor: each axis is an Axis object
        // now, with the chart-level properties kept only for forms written before that editor.
        { key: 'MinX', label: 'X Min', kind: 'number' },
        { key: 'MaxX', label: 'X Max', kind: 'number' },
        { key: 'MinY', label: 'Y Min', kind: 'number' },
        { key: 'MaxY', label: 'Y Max', kind: 'number' }
    ],
    GrumpyXYPlot: [
        // See GrumpyLinePlot: the same Dock row, so either chart can be pinned to a DockPanel edge.
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'Points', label: 'Points (x,y)', kind: 'text' },
        // See GrumpyLinePlot: the workbook and its page live in the 'Data Selector' editor now.
        { key: 'Gradient', label: 'Background Gradient', kind: 'button' },
        { key: 'XColumn', label: 'X Column', kind: 'text' },
        { key: 'YColumn', label: 'Y Column', kind: 'text' },
        { key: 'HeaderRow', label: 'Names Row', kind: 'number' },
        { key: 'FirstDataRow', label: 'First Data Row', kind: 'number' },
        { key: 'LiveUpdate', label: 'Live Update', kind: 'dropdown', options: BOOL },
        { key: 'Title', label: 'Title', kind: 'text' },
        { key: 'ShowTitle', label: 'Show Title', kind: 'dropdown', options: BOOL },
        { key: 'TitlePosition', label: 'Title Position', kind: 'dropdown', options: CHART_TITLE_POSITIONS },
        { key: 'TitleColor', label: 'Title Colour', kind: 'color', options: COLORS },
        { key: 'TitleFontSize', label: 'Title Size', kind: 'number' },
        { key: 'PlotBackColor', label: 'Plot Backcolour', kind: 'color', options: COLORS },
        { key: 'PlotBackOpacity', label: 'Plot Opacity', kind: 'number' },
        { key: 'ShowBorder', label: 'Border', kind: 'dropdown', options: BOOL },
        { key: 'BorderBrush', label: 'Border Colour', kind: 'color', options: COLORS },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'number' },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' },
        { key: 'ShowGrid', label: 'Gridlines', kind: 'dropdown', options: BOOL },
        { key: 'GridColor', label: 'Grid Colour', kind: 'color', options: COLORS },
        { key: 'GridThickness', label: 'Grid Thickness', kind: 'number' },
        { key: 'GridStyle', label: 'Grid Style', kind: 'dropdown', options: CHART_LINE_STYLES },
        { key: 'MinX', label: 'X Min', kind: 'number' },
        { key: 'MaxX', label: 'X Max', kind: 'number' },
        { key: 'MinY', label: 'Y Min', kind: 'number' },
        { key: 'MaxY', label: 'Y Max', kind: 'number' }
    ],
    // The BAR chart. See GrumpyLinePlot for the shared rows: the same Dock row, the same column /
    // row-number rows (X is the CATEGORY column here — its text labels the axis) and the same
    // appearance rows. Bar Mode / Bar Width / Bar Corner Radius are this chart's own.
    GrumpyBarPlot: [
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'Values', label: 'Values', kind: 'text' },
        { key: 'Gradient', label: 'Background Gradient', kind: 'button' },
        { key: 'XColumn', label: 'Category Column', kind: 'text' },
        { key: 'YColumn', label: 'Values Column', kind: 'text' },
        { key: 'HeaderRow', label: 'Names Row', kind: 'number' },
        { key: 'FirstDataRow', label: 'First Data Row', kind: 'number' },
        { key: 'LiveUpdate', label: 'Live Update', kind: 'dropdown', options: BOOL },
        { key: 'BarMode', label: 'Bar Mode', kind: 'dropdown', options: BAR_MODES },
        { key: 'BarWidth', label: 'Bar Width', kind: 'number' },
        { key: 'BarCornerRadius', label: 'Bar Corner Radius', kind: 'number' },
        { key: 'Title', label: 'Title', kind: 'text' },
        { key: 'ShowTitle', label: 'Show Title', kind: 'dropdown', options: BOOL },
        { key: 'TitlePosition', label: 'Title Position', kind: 'dropdown', options: CHART_TITLE_POSITIONS },
        { key: 'TitleColor', label: 'Title Colour', kind: 'color', options: COLORS },
        { key: 'TitleFontSize', label: 'Title Size', kind: 'number' },
        { key: 'PlotBackColor', label: 'Plot Backcolour', kind: 'color', options: COLORS },
        { key: 'PlotBackOpacity', label: 'Plot Opacity', kind: 'number' },
        { key: 'ShowBorder', label: 'Border', kind: 'dropdown', options: BOOL },
        { key: 'BorderBrush', label: 'Border Colour', kind: 'color', options: COLORS },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'number' },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' },
        { key: 'ShowGrid', label: 'Gridlines', kind: 'dropdown', options: BOOL },
        { key: 'GridColor', label: 'Grid Colour', kind: 'color', options: COLORS },
        { key: 'GridThickness', label: 'Grid Thickness', kind: 'number' },
        { key: 'GridStyle', label: 'Grid Style', kind: 'dropdown', options: CHART_LINE_STYLES },
        { key: 'MinX', label: 'X Min', kind: 'number' },
        { key: 'MaxX', label: 'X Max', kind: 'number' },
        { key: 'MinY', label: 'Y Min', kind: 'number' },
        { key: 'MaxY', label: 'Y Max', kind: 'number' }
    ],
    // The AREA chart: the bar chart's rows with Area Mode / Area Opacity instead of the bar ones.
    GrumpyAreaPlot: [
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'Values', label: 'Values', kind: 'text' },
        { key: 'Gradient', label: 'Background Gradient', kind: 'button' },
        { key: 'XColumn', label: 'Category Column', kind: 'text' },
        { key: 'YColumn', label: 'Values Column', kind: 'text' },
        { key: 'HeaderRow', label: 'Names Row', kind: 'number' },
        { key: 'FirstDataRow', label: 'First Data Row', kind: 'number' },
        { key: 'LiveUpdate', label: 'Live Update', kind: 'dropdown', options: BOOL },
        { key: 'AreaMode', label: 'Area Mode', kind: 'dropdown', options: AREA_MODES },
        { key: 'AreaOpacity', label: 'Area Opacity', kind: 'number' },
        { key: 'Title', label: 'Title', kind: 'text' },
        { key: 'ShowTitle', label: 'Show Title', kind: 'dropdown', options: BOOL },
        { key: 'TitlePosition', label: 'Title Position', kind: 'dropdown', options: CHART_TITLE_POSITIONS },
        { key: 'TitleColor', label: 'Title Colour', kind: 'color', options: COLORS },
        { key: 'TitleFontSize', label: 'Title Size', kind: 'number' },
        { key: 'PlotBackColor', label: 'Plot Backcolour', kind: 'color', options: COLORS },
        { key: 'PlotBackOpacity', label: 'Plot Opacity', kind: 'number' },
        { key: 'ShowBorder', label: 'Border', kind: 'dropdown', options: BOOL },
        { key: 'BorderBrush', label: 'Border Colour', kind: 'color', options: COLORS },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'number' },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' },
        { key: 'ShowGrid', label: 'Gridlines', kind: 'dropdown', options: BOOL },
        { key: 'GridColor', label: 'Grid Colour', kind: 'color', options: COLORS },
        { key: 'GridThickness', label: 'Grid Thickness', kind: 'number' },
        { key: 'GridStyle', label: 'Grid Style', kind: 'dropdown', options: CHART_LINE_STYLES },
        { key: 'MinX', label: 'X Min', kind: 'number' },
        { key: 'MaxX', label: 'X Max', kind: 'number' },
        { key: 'MinY', label: 'Y Min', kind: 'number' },
        { key: 'MaxY', label: 'Y Max', kind: 'number' }
    ],
    // The PIE chart: its own rows are the ring and the slice look. There are NO gridline, axis or
    // scale rows — a pie has no cartesian frame — and the slices themselves belong to the Slices
    // editor (they are child elements, like a line chart's series).
    GrumpyPiePlot: [
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'Labels', label: 'Slice Names', kind: 'text' },
        { key: 'Values', label: 'Slice Values', kind: 'text' },
        { key: 'Gradient', label: 'Background Gradient', kind: 'button' },
        { key: 'XColumn', label: 'Names Column', kind: 'text' },
        { key: 'YColumn', label: 'Values Column', kind: 'text' },
        { key: 'HeaderRow', label: 'Names Row', kind: 'number' },
        { key: 'FirstDataRow', label: 'First Data Row', kind: 'number' },
        { key: 'LiveUpdate', label: 'Live Update', kind: 'dropdown', options: BOOL },
        { key: 'DoughnutPercent', label: 'Doughnut Hole', kind: 'number' },
        { key: 'StartAngle', label: 'Start Angle', kind: 'number' },
        { key: 'SliceGap', label: 'Slice Gap', kind: 'number' },
        { key: 'SliceBorderColor', label: 'Slice Border Colour', kind: 'color', options: COLORS },
        { key: 'SliceBorderThickness', label: 'Slice Border Thickness', kind: 'number' },
        { key: 'HoverExplode', label: 'Hover Explode', kind: 'number' },
        { key: 'Title', label: 'Title', kind: 'text' },
        { key: 'ShowTitle', label: 'Show Title', kind: 'dropdown', options: BOOL },
        { key: 'TitlePosition', label: 'Title Position', kind: 'dropdown', options: CHART_TITLE_POSITIONS },
        { key: 'TitleColor', label: 'Title Colour', kind: 'color', options: COLORS },
        { key: 'TitleFontSize', label: 'Title Size', kind: 'number' },
        { key: 'PlotBackColor', label: 'Plot Backcolour', kind: 'color', options: COLORS },
        { key: 'PlotBackOpacity', label: 'Plot Opacity', kind: 'number' },
        { key: 'ShowBorder', label: 'Border', kind: 'dropdown', options: BOOL },
        { key: 'BorderBrush', label: 'Border Colour', kind: 'color', options: COLORS },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'number' },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' }
    ],
    // The WATERFALL chart: the samples run across X (the sample NUMBER), each value stands up Y and every
    // successive sampleset recedes along the depth. Its own rows are therefore the inline sets, the mesh,
    // the colour mode and the VIEW (how far apart the sets stand and from where they are seen) — plus the
    // chart-level axis rows further down, because its three axes are drawn in projection. No Axis editor
    // and no scale rows: the sample axis follows the data and the value axis fits it.
    GrumpyWaterfallPlot: [
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'SampleSets', label: 'Sample Sets', kind: 'text' },
        { key: 'Values', label: 'Values (one set)', kind: 'text' },
        { key: 'Gradient', label: 'Background Gradient', kind: 'button' },
        { key: 'YColumn', label: 'First Set Column', kind: 'text' },
        { key: 'HeaderRow', label: 'Names Row', kind: 'number' },
        { key: 'FirstDataRow', label: 'First Data Row', kind: 'number' },
        { key: 'LiveUpdate', label: 'Live Update', kind: 'dropdown', options: BOOL },
        { key: 'RibbonStyle', label: 'Style', kind: 'dropdown', options: WATERFALL_STYLES },
        { key: 'RibbonOpacity', label: 'Fill Opacity', kind: 'number' },
        { key: 'ColorMode', label: 'Colour By', kind: 'dropdown', options: WATERFALL_COLOR_MODES },
        { key: 'HeatMin', label: 'Heat Low', kind: 'number' },
        { key: 'HeatMax', label: 'Heat High', kind: 'number' },
        { key: 'SplitValue', label: 'Split Value', kind: 'number' },
        { key: 'BelowColor', label: 'Below Colour', kind: 'color', options: COLORS },
        { key: 'AboveColor', label: 'Above Colour', kind: 'color', options: COLORS },
        { key: 'ShowConnectors', label: 'Connectors', kind: 'dropdown', options: BOOL },
        { key: 'ConnectorColor', label: 'Connector Colour', kind: 'color', options: COLORS },
        { key: 'ConnectorThickness', label: 'Connector Thickness', kind: 'number' },
        { key: 'ConnectorStep', label: 'Connector Step', kind: 'number' },
        { key: 'MaxPoints', label: 'Max Points', kind: 'number' },
        { key: 'Elevation', label: 'Elevation (deg)', kind: 'number' },
        { key: 'Azimuth', label: 'Azimuth (deg)', kind: 'number' },
        { key: 'ZSpacing', label: 'Set Spacing', kind: 'number' },
        { key: 'Zoom', label: 'Zoom', kind: 'number' },
        { key: 'ZAxisTitle', label: 'Depth Axis Name', kind: 'text' },
        { key: 'Title', label: 'Title', kind: 'text' },
        { key: 'ShowTitle', label: 'Show Title', kind: 'dropdown', options: BOOL },
        { key: 'TitlePosition', label: 'Title Position', kind: 'dropdown', options: CHART_TITLE_POSITIONS },
        { key: 'TitleColor', label: 'Title Colour', kind: 'color', options: COLORS },
        { key: 'TitleFontSize', label: 'Title Size', kind: 'number' },
        { key: 'PlotBackColor', label: 'Plot Backcolour', kind: 'color', options: COLORS },
        { key: 'PlotBackOpacity', label: 'Plot Opacity', kind: 'number' },
        { key: 'ShowBorder', label: 'Border', kind: 'dropdown', options: BOOL },
        { key: 'BorderBrush', label: 'Border Colour', kind: 'color', options: COLORS },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'number' },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' },
        { key: 'ShowGrid', label: 'Floor Gridlines', kind: 'dropdown', options: BOOL },
        { key: 'GridColor', label: 'Grid Colour', kind: 'color', options: COLORS },
        { key: 'GridThickness', label: 'Grid Thickness', kind: 'number' },
        { key: 'GridStyle', label: 'Grid Style', kind: 'dropdown', options: CHART_LINE_STYLES },
        { key: 'ShowAxes', label: 'Axes', kind: 'dropdown', options: BOOL },
        { key: 'AxisColor', label: 'Axis Colour', kind: 'color', options: COLORS },
        { key: 'ShowMajorTicks', label: 'Major Ticks', kind: 'dropdown', options: BOOL },
        { key: 'MajorTickLength', label: 'Tick Length', kind: 'number' },
        { key: 'ShowTickLabels', label: 'Tick Labels', kind: 'dropdown', options: BOOL },
        { key: 'TickLabelFontSize', label: 'Tick Label Size', kind: 'number' },
        { key: 'ShowAxisTitles', label: 'Axis Names', kind: 'dropdown', options: BOOL },
        { key: 'XAxisTitle', label: 'Sample Axis Name', kind: 'text' },
        { key: 'YAxisTitle', label: 'Value Axis Name', kind: 'text' },
        { key: 'ShowLegend', label: 'Legend', kind: 'dropdown', options: BOOL },
        { key: 'LegendFontSize', label: 'Legend Size', kind: 'number' }
    ],
    // The SURFACE chart 3D (2026-09-23): a sheet whose profile rows are the spreadsheet's width positions
    // and whose columns are its slices along the length. Its own rows are the inline slices, how the surface
    // is drawn (mesh, mesh over solid, solid), the colours (a temperature ramp or one colour per slice) with
    // that ramp's two ends, the mesh's own colour and thickness, where each slice's Z comes from and how the
    // sheet is turned — plus the RANGE WINDOW (Width/Height From-To), which re-fits the picture to what it
    // selects: the special legend of a surface. Its three projected axes use the chart-level axis rows
    // further down, and there is no Value Axis Name of its own (the three names are Width/Height/Depth).
    GrumpySurfacePlot: [
        { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown', options: DOCK_OPTIONS },
        { key: 'SampleSets', label: 'Sample Sets', kind: 'text' },
        { key: 'Values', label: 'Values (one slice)', kind: 'text' },
        { key: 'Gradient', label: 'Background Gradient', kind: 'button' },
        { key: 'XColumn', label: 'X Column (width)', kind: 'text' },
        { key: 'YColumn', label: 'First Slice Column', kind: 'text' },
        { key: 'HeaderRow', label: 'Names Row', kind: 'number' },
        { key: 'FirstDataRow', label: 'First Data Row', kind: 'number' },
        { key: 'ZRow', label: 'Z Row', kind: 'number' },
        { key: 'ZStart', label: 'Z Start', kind: 'number' },
        { key: 'ZStep', label: 'Z Step', kind: 'number' },
        { key: 'LiveUpdate', label: 'Live Update', kind: 'dropdown', options: BOOL },
        { key: 'Style', label: 'Style', kind: 'dropdown', options: SURFACE_STYLES },
        { key: 'ColorBy', label: 'Colour By', kind: 'dropdown', options: SURFACE_COLOR_BYS },
        { key: 'LowColor', label: 'Low Colour', kind: 'color', options: COLORS },
        { key: 'HighColor', label: 'High Colour', kind: 'color', options: COLORS },
        { key: 'HeatMin', label: 'Colour Low', kind: 'number' },
        { key: 'HeatMax', label: 'Colour High', kind: 'number' },
        { key: 'SolidOpacity', label: 'Solid Opacity', kind: 'number' },
        // The solid block the sheet stands on: the space under the sheet filled down to the floor, so the
        // picture reads as a volume (an area chart lifted into 3D) instead of a skin with the plot's own back
        // panel showing through the space beneath it.
        { key: 'ShowBase', label: 'Solid Base', kind: 'dropdown', options: BOOL },
        { key: 'BaseColor', label: 'Base Colour', kind: 'color', options: COLORS },
        { key: 'MeshColor', label: 'Mesh Colour', kind: 'color', options: COLORS },
        { key: 'MeshThickness', label: 'Mesh Thickness', kind: 'number' },
        { key: 'MaxPoints', label: 'Max Points', kind: 'number' },
        { key: 'MinX', label: 'Width From', kind: 'number' },
        { key: 'MaxX', label: 'Width To', kind: 'number' },
        { key: 'MinY', label: 'Height From', kind: 'number' },
        { key: 'MaxY', label: 'Height To', kind: 'number' },
        // WHICH SLICES are drawn (the legend's second slider). The height between them is the data itself,
        // so it is only ever a scale — this is the one the user picks.
        { key: 'MinZ', label: 'Slice From', kind: 'number' },
        { key: 'MaxZ', label: 'Slice To', kind: 'number' },
        { key: 'Elevation', label: 'Elevation (deg)', kind: 'number' },
        { key: 'Azimuth', label: 'Azimuth (deg)', kind: 'number' },
        { key: 'ZSpacing', label: 'Sheet Depth', kind: 'number' },
        { key: 'Zoom', label: 'Zoom', kind: 'number' },
        // The X and Y axes' own SIZE, in percent — a zoom, not a window: Min/Max X and Y are untouched, so
        // the picture magnifies (and is clipped by the plot's frame) instead of showing a different range.
        { key: 'ZoomX', label: 'X Axis Zoom %', kind: 'number' },
        { key: 'ZoomY', label: 'Y Axis Zoom %', kind: 'number' },
        { key: 'XAxisTitle', label: 'Width Axis Name', kind: 'text' },
        { key: 'YAxisTitle', label: 'Height Axis Name', kind: 'text' },
        { key: 'ZAxisTitle', label: 'Depth Axis Name', kind: 'text' },
        { key: 'Title', label: 'Title', kind: 'text' },
        { key: 'ShowTitle', label: 'Show Title', kind: 'dropdown', options: BOOL },
        { key: 'TitlePosition', label: 'Title Position', kind: 'dropdown', options: CHART_TITLE_POSITIONS },
        { key: 'TitleColor', label: 'Title Colour', kind: 'color', options: COLORS },
        { key: 'TitleFontSize', label: 'Title Size', kind: 'number' },
        { key: 'PlotBackColor', label: 'Plot Backcolour', kind: 'color', options: COLORS },
        { key: 'PlotBackOpacity', label: 'Plot Opacity', kind: 'number' },
        { key: 'ShowBorder', label: 'Border', kind: 'dropdown', options: BOOL },
        { key: 'BorderBrush', label: 'Border Colour', kind: 'color', options: COLORS },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'number' },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' },
        { key: 'ShowGrid', label: 'Floor Gridlines', kind: 'dropdown', options: BOOL },
        { key: 'GridColor', label: 'Grid Colour', kind: 'color', options: COLORS },
        { key: 'GridThickness', label: 'Grid Thickness', kind: 'number' },
        { key: 'GridStyle', label: 'Grid Style', kind: 'dropdown', options: CHART_LINE_STYLES },
        { key: 'ShowAxes', label: 'Axes', kind: 'dropdown', options: BOOL },
        { key: 'AxisColor', label: 'Axis Colour', kind: 'color', options: COLORS },
        { key: 'ShowMajorTicks', label: 'Major Ticks', kind: 'dropdown', options: BOOL },
        { key: 'MajorTickLength', label: 'Tick Length', kind: 'number' },
        { key: 'ShowTickLabels', label: 'Tick Labels', kind: 'dropdown', options: BOOL },
        { key: 'TickLabelFontSize', label: 'Tick Label Size', kind: 'number' },
        { key: 'ShowAxisTitles', label: 'Axis Names', kind: 'dropdown', options: BOOL },
        { key: 'ShowLegend', label: 'Legend', kind: 'dropdown', options: BOOL },
        { key: 'LegendFontSize', label: 'Legend Size', kind: 'number' }
    ],
    Line: [
        { key: 'Stroke', label: 'Line Colour', kind: 'color', options: COLORS },
        { key: 'StrokeThickness', label: 'Line Thickness', kind: 'number' },
        { key: 'StrokeLineCap', label: 'Line Ends', kind: 'dropdown', options: LINE_CAPS },
        { key: 'StartPoint', label: 'Start Point', kind: 'text' },
        { key: 'EndPoint', label: 'End Point', kind: 'text' }
    ],
    Rectangle: [
        { key: 'Fill', label: 'Backcolor', kind: 'color', options: COLORS },
        { key: 'Stroke', label: 'Line Colour', kind: 'color', options: COLORS },
        { key: 'StrokeThickness', label: 'Line Thickness', kind: 'number' },
        // One 'Corner Radius' — a Rectangle's RadiusX and RadiusY are always identical, so the
        // designer edits them as a single value (key 'Radius' is designer-only; it writes both).
        { key: 'Radius', label: 'Corner Radius', kind: 'number' }
    ],
    Ellipse: [
        { key: 'Fill', label: 'Backcolor', kind: 'color', options: COLORS },
        { key: 'Stroke', label: 'Line Colour', kind: 'color', options: COLORS },
        { key: 'StrokeThickness', label: 'Line Thickness', kind: 'number' }
    ],
    Arc: [
        { key: 'Stroke', label: 'Line Colour', kind: 'color', options: COLORS },
        { key: 'StrokeThickness', label: 'Line Thickness', kind: 'number' },
        { key: 'StartAngle', label: 'Start Angle', kind: 'number' },
        { key: 'SweepAngle', label: 'Sweep Angle', kind: 'number' }
    ],
    UserControl: [
        { key: 'Content', label: 'Content', kind: 'text' },
        { key: 'HorizontalContentAlignment', label: 'H. Content', kind: 'dropdown', options: H_ALIGN },
        { key: 'VerticalContentAlignment', label: 'V. Content', kind: 'dropdown', options: V_ALIGN },
        { key: 'Padding', label: 'Padding', kind: 'text' },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' }
    ],
    Window: [
        { key: 'Title', label: 'Title', kind: 'text' },
        { key: 'Icon', label: 'Icon', kind: 'file' },
        { key: 'Background', label: 'Background', kind: 'text' },
        { key: 'CanResize', label: 'Can Resize', kind: 'dropdown', options: BOOL },
        { key: 'ShowInTaskbar', label: 'Show In Taskbar', kind: 'dropdown', options: BOOL },
        { key: 'ShowActivated', label: 'Show Activated', kind: 'dropdown', options: BOOL },
        { key: 'Topmost', label: 'Topmost', kind: 'dropdown', options: BOOL },
        { key: 'WindowStartupLocation', label: 'Startup Location', kind: 'dropdown', options: STARTUP_LOC },
        { key: 'WindowState', label: 'Window State', kind: 'dropdown', options: WINDOW_STATE },
        { key: 'SystemDecorations', label: 'Decorations', kind: 'dropdown', options: DECORATIONS },
        { key: 'SizeToContent', label: 'Size To Content', kind: 'dropdown', options: SIZE_TO_CONTENT },
        { key: 'ExtendClientAreaToDecorationsHint', label: 'Extend To Titlebar', kind: 'dropdown', options: BOOL },
        { key: 'BorderBrush', label: 'Border Brush', kind: 'text' },
        { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' },
        { key: 'CornerRadius', label: 'Corner Radius', kind: 'text' }
    ]
};

/** Extra properties specific to the reusable ChromeWindow component (custom title bar). */
export const CHROME_WINDOW_PROPS: PropTemplate[] = [
    { key: 'TitleBarTitle', label: 'Title Bar Text', kind: 'text' },
    { key: 'TitleBarIcon', label: 'Title Bar Icon', kind: 'file' },
    { key: 'TitleBarHeight', label: 'Title Bar Height', kind: 'number' },
    { key: 'TitleBarBackground', label: 'Title Bar Color', kind: 'color' },
    { key: 'TitleBarForeground', label: 'Title Bar Text Color', kind: 'color' }
];

/**
 * Per-key refinements applied to ANY control: friendly input kind (font/color/margin
 * pickers), display units, and a hover description. Keeps the per-type lists lean while
 * giving every property a helpful editor and explanation in the Properties panel.
 */
const KEY_DEFAULTS: Record<string, Partial<PropTemplate>> = {
    // sizes
    Width: { unit: 'px', desc: 'Width of the control in pixels.' },
    Height: { unit: 'px', desc: 'Height of the control in pixels.' },
    MinWidth: { unit: 'px', desc: 'Minimum width in pixels.' },
    MinHeight: { unit: 'px', desc: 'Minimum height in pixels.' },
    MaxWidth: { unit: 'px', desc: 'Maximum width in pixels.' },
    MaxHeight: { unit: 'px', desc: 'Maximum height in pixels.' },
    'Canvas.Left': { unit: 'px', desc: 'X position in pixels within the Canvas.' },
    'Canvas.Top': { unit: 'px', desc: 'Y position in pixels within the Canvas.' },
    'DockPanel.Dock': { desc: 'Docking: which edge of a DockPanel this control is pinned to. None = no docking (drawn in its current position); Fill = take the remaining space. Only takes effect when the parent is a DockPanel.' },
    Margin: { kind: 'margin', options: MARGIN_PRESETS, desc: 'Space around the control in pixels. One value (all sides), two (horizontal, vertical) or four (left, top, right, bottom), e.g. "4,8,4,8".' },
    Padding: { desc: 'Space between the control edge and its content in pixels (one, two or four values).' },
    BorderThickness: { unit: 'px', desc: 'Border width in pixels (one or four values).' },
    CornerRadius: { kind: 'number', unit: 'px', desc: 'Corner rounding in pixels; one value or four (top-left, top-right, bottom-right, bottom-left).' },
    Opacity: { unit: '%', desc: 'Opacity as a percentage: 0 = fully transparent, 100 = fully opaque.' },
    ZIndex: { desc: 'Stacking order within its parent; higher values draw on top.' },
    TabIndex: { desc: 'Position in the Tab navigation order.' },

    // text / fonts
    FontFamily: { kind: 'font', options: FONTS, desc: 'Font family used for text (inherited by children).' },
    FontSize: { unit: 'px', desc: 'Text size in pixels.' },
    FontWeight: { desc: 'Thickness of the font (Normal = regular, Bold, etc.).' },
    FontStyle: { desc: 'Slant of the font: Normal, Italic or Oblique.' },
    Foreground: { kind: 'color', options: COLORS, desc: 'Text/foreground color. Pick a color or type a name / #RRGGBB.' },

    // colors & brushes
    Background: { kind: 'color', options: COLORS, desc: 'Fill color of the control.' },
    BorderBrush: { kind: 'color', options: COLORS, desc: 'Color of the border drawn around the control.' },
    CaretBrush: { kind: 'color', options: COLORS, desc: 'Color of the text cursor (caret) in a text field.' },
    SelectionBrush: { kind: 'color', options: COLORS, desc: 'Color of the highlighted (selected) text.' },
    PlaceholderForeground: { kind: 'color', options: COLORS, desc: 'Color of the placeholder/hint text.' },
    RowBackground: { kind: 'color', options: COLORS, desc: 'Background color of data rows.' },
    HorizontalGridLinesBrush: { kind: 'color', options: COLORS, desc: 'Color of horizontal grid lines.' },
    VerticalGridLinesBrush: { kind: 'color', options: COLORS, desc: 'Color of vertical grid lines.' },

    // --- Shapes ---
    Stroke: { kind: 'color', options: COLORS, desc: 'Line colour of the shape.' },
    Fill: { kind: 'color', options: COLORS, desc: 'Backcolor: the fill colour inside the shape.' },
    StrokeThickness: { unit: 'px', desc: 'Thickness of the outline/line in pixels.' },
    StrokeLineCap: { desc: 'Shape of the line ends: Flat (square-cut), Round or Square.' },
    StartAngle: { unit: '°', desc: 'Start angle of the arc in degrees (0 = pointing right).' },
    SweepAngle: { unit: '°', desc: 'How far the arc sweeps from the start angle, in degrees.' },
    Radius: { kind: 'number', unit: 'px', desc: 'Corner rounding in pixels (0 = square corners). Applied equally to X and Y.' },
    StartPoint: { desc: 'Line start, as "x,y" within the line\'s own box (e.g. "0,0").' },
    EndPoint: { desc: 'Line end, as "x,y" within the line\'s own box (e.g. "120,80").' },

    // --- The 2026-09-19 additions (ProgressBar / Slider / ToggleSwitch / MaskedTextBox /
    // NumericUpDown / Polyline / Polygon / PathIcon) ---
    Points: { desc: 'The shape\'s outline: "x,y" points separated by spaces (e.g. "0,80 30,10 60,60").' },
    Data: { desc: 'The icon\'s path data, e.g. "M0,8 L8,16 L16,0".' },

    // --- GrumpyCharts: the bar, area and pie rows (2026-09-20) ---
    BarMode: {
        desc: 'How the bars stand in their category: Grouped (side by side, one per series — the easiest '
            + 'to compare), Stacked (each series starts where the previous ended, so a category reads as '
            + 'its total) or Stacked100 (every category fills to 100%, turning the data into a share of '
            + 'the whole).'
    },
    BarWidth: {
        kind: 'number', unit: '× slot',
        desc: 'How much of its slot one bar fills: 0.8 (the default) leaves a fifth of the space as gap, '
            + '1 makes the bars touch.'
    },
    BarCornerRadius: { kind: 'number', unit: 'px', desc: 'Rounds the corners of every bar (0 = square).' },
    AreaMode: {
        desc: 'How the areas are filled: Plain (each series fills down to zero, so the last one drawn '
            + 'covers the ones before), Stacked (each fills from the top of the previous one) or '
            + 'Stacked100 (every category totals 100%).'
    },
    AreaOpacity: {
        kind: 'number', unit: '%',
        desc: 'How solid the fill is (default 60). The line along the top stays fully opaque, so a '
            + 'lighter fill lets the gridlines and the series behind it show through.'
    },
    Labels: { desc: 'The slice names, one per value ("North,South,East,West") — used with Slice Values when the chart has no spreadsheet.' },
    DoughnutPercent: {
        kind: 'number', unit: '%',
        desc: 'How thick the ring is, as a share of the radius: 0 is a solid pie (the default), 50 leaves '
            + 'a hole half the radius.'
    },
    SliceGap: { kind: 'number', unit: '°', desc: 'The gap between two neighbouring slices in degrees (0 = they touch).' },

    // --- GrumpyCharts: the waterfall's own rows (2026-09-22) ---
    SampleSets: {
        desc: 'Several samplesets written inline, one per semicolon-separated group: '
            + '"1,2,3; 4,5,6" is two sets of three samples. Handy for sketching without a workbook — a '
            + 'real capture names one spreadsheet column per set (one series each, C, D, E …).'
    },
    RibbonStyle: {
        desc: 'How each sampleset is drawn: **Ribbon** (a solid fill under the trace, so a nearer set '
            + 'hides the ones behind it — the classic waterfall), **Translucent** (the same fill, '
            + 'see-through, so the depth reads as layers) or **Lines** (no fill at all: the traces and '
            + 'the mesh make a wireframe).'
    },
    RibbonOpacity: {
        kind: 'number', unit: '%',
        desc: 'How solid a Translucent fill is (default 80). 100 makes it look like the Ribbon style; '
            + 'lower values let the sets behind it glow through.'
    },
    ColorMode: {
        desc: 'What decides the colour: **Sampleset** (one colour per set, from its series colour — the '
            + 'default), **Value** (a heat map by amplitude: a peak\'s tip takes the map\'s top colour '
            + 'and its foot the bottom one) or **Split** (two colours either side of Split Value, so a '
            + 'limit is visible in the picture instead of in a legend).'
    },
    HeatMin: {
        kind: 'number',
        desc: 'The amplitude the heat map\'s low end sits at. Empty (the default) uses the data\'s own '
            + 'least value, so the picture always uses the whole map.'
    },
    HeatMax: {
        kind: 'number',
        desc: 'The amplitude the heat map\'s top end sits at. Empty (the default) uses the data\'s own '
            + 'greatest value.'
    },
    SplitValue: {
        kind: 'number',
        desc: 'The amplitude where the Split colour mode changes colour (0 puts one colour below zero and '
            + 'the other above it, which is how a negative excursion is made obvious). The trace is cut '
            + 'exactly where it crosses this value.'
    },
    BelowColor: { kind: 'color', options: COLORS, desc: 'The colour of everything below Split Value.' },
    AboveColor: { kind: 'color', options: COLORS, desc: 'The colour of everything above Split Value.' },
    ShowConnectors: {
        desc: 'Join the samplesets with thin lines at the same sample — the mesh that turns a row of '
            + 'separate traces into a surface. Off leaves the bare traces (and no fill either, in the '
            + 'Lines style).'
    },
    ConnectorColor: { kind: 'color', options: COLORS, desc: 'The colour of the connectors (in the Value colour mode they take the heat map instead).' },
    ConnectorThickness: { kind: 'number', unit: 'px', desc: 'How thick the connectors are (0 draws none).' },
    ConnectorStep: {
        kind: 'number',
        desc: 'One connector every N drawn samples. Empty/0 (the default) spaces them so the mesh stays '
            + 'readable — about forty per trace, which is what a 2048-point set needs.'
    },
    MaxPoints: {
        kind: 'number',
        desc: 'How many samples of a trace are DRAWN at most (512 by default, 0 = every one). A '
            + '2048-point capture thinned to 512 still shows every peak that survives at screen '
            + 'resolution, and the picture stays interactive while it is being turned. The stride is the '
            + 'same for every set, so the mesh joins like to like.'
    },
    Elevation: {
        kind: 'number', unit: '°',
        desc: 'How far above the floor the chart is seen from (default 30): 0 is edge on (flat) and 89 '
            + 'looks almost straight down. In the app you can also DRAG the chart to turn it.'
    },
    Azimuth: {
        kind: 'number', unit: '°',
        desc: 'Where the cube is turned to (default 45 — the usual three-quarter view with the sets '
            + 'receding to the right). Changed live by dragging the chart, sideways this time.'
    },
    ZSpacing: {
        kind: 'number', unit: '× depth',
        desc: 'How deep the samplesets stand apart: 1 (the default) uses the whole fitted depth, 0.5 '
            + 'packs them half as deep, 2 stretches the picture back.'
    },
    Zoom: {
        kind: 'number', unit: '×',
        desc: 'Scales the fitted picture: 1 (the default) fits the whole cube into the frame, 1.2 makes '
            + 'it larger than the frame (the edges then leave it), 0.8 leaves a margin.'
    },
    Style: {
        desc: 'How the surface is drawn: **Grid mesh** (the quads\' edges only, so you see through the '
            + 'sheet), **Grid mesh + solid** (the mesh over a filled surface — the classic 3D surface look, '
            + 'the default) or **Solid** (the filled sheet with no mesh lines).'
    },
    ColorBy: {
        desc: 'What decides the colour: **Sampleset** (one colour per slice, from its series colour) or '
            + '**Temperature** (a ramp by HEIGHT — a ridge takes High Colour and a valley takes Low Colour, '
            + 'the default). In Temperature mode the ramp runs along the sheet\'s height axis, so the same '
            + 'ridge keeps its colour wherever it stands along the length.'
    },
    LowColor: { kind: 'color', options: COLORS, desc: 'The temperature ramp\'s colour at the sheet\'s LOWEST height.' },
    HighColor: { kind: 'color', options: COLORS, desc: 'The temperature ramp\'s colour at the sheet\'s greatest height.' },
    SolidOpacity: {
        kind: 'number', unit: '%',
        desc: 'How solid the filled surface is (100 by default = opaque metal). Lower values let what is '
            + 'behind the sheet glow through, which is how a fold is seen through the one in front of it.'
    },
    MeshColor: {
        kind: 'color', options: COLORS,
        desc: 'The colour of the surface\'s MESH lines — the profile lines along the width and the rungs '
            + 'along the length. (The floor\'s own gridlines keep Grid Colour.)'
    },
    ShowBase: {
        kind: 'dropdown', options: BOOL,
        desc: 'Draw the solid BLOCK the sheet stands on: the space under the sheet filled down to the floor, '
            + 'so the picture reads as a volume (an area chart lifted into 3D) instead of a skin. Because it '
            + 'is a block it HIDES what is behind it — slices behind a nearer face stop showing through the '
            + 'empty space beneath the sheet.'
    },
    BaseColor: {
        kind: 'color', options: COLORS,
        desc: 'The colour of that block\'s sides and ends. Flat and opaque: the temperature ramp belongs to '
            + 'the sheet itself.'
    },
    MeshThickness: { kind: 'number', unit: 'px', desc: 'How thick the surface\'s mesh lines are (0 draws none).' },
    ZRow: {
        kind: 'number',
        desc: 'Which spreadsheet ROW holds each slice\'s Z value — read along the series\' own columns, so one '
            + 'row of numbers puts every slice where it belongs (leave it empty and the Names Row is used). A '
            + 'cell that is not a number falls back to Z Start + Z Step.'
    },
    ZStart: {
        kind: 'number',
        desc: 'The Z of the first slice when the spreadsheet does not say (0 by default — the near edge of the '
            + 'sheet). The depth a slice is drawn at follows its Z VALUE, so slices the sheet spaces unevenly '
            + 'apart stand unevenly far apart.'
    },
    ZStep: {
        kind: 'number',
        desc: 'What one slice adds to the Z of the one behind it when the spreadsheet does not say (1 numbers '
            + 'them 0, 1, 2 …; 5 would make the sheet 5 units per slice long).'
    },
    ZAxisTitle: {
        desc: 'The name along the depth axis — what one step of it means ("Sweep", "Run"). Each set\'s '
            + 'own name in the legend comes from its series Title.'
    },
    HoverExplode: {
        kind: 'number', unit: 'px',
        desc: 'How far the slice under the **pointer** pops out of the ring while the mouse is over it '
            + '(10 pixels by default, 0 = it stays put). The slice also reports itself in the readout '
            + 'panel: its name, its value and its share of the total. Hovering never changes the saved '
            + 'form — it is a reading, not a setting.'
    },
    SliceBorderColor: { kind: 'color', options: COLORS, desc: 'The line drawn between two slices.' },
    SliceBorderThickness: { kind: 'number', unit: 'px', desc: 'How thick that line is (0 = the colours touch).' },
    Value: { kind: 'number', desc: 'The current value (Progress bar / Slider: 0-100; Number box: a number).' },
    Minimum: { kind: 'number', desc: 'The lowest value the control allows.' },
    Maximum: { kind: 'number', desc: 'The highest value the control allows.' },
    Increment: { kind: 'number', desc: 'How much one click of the arrows adds or subtracts.' },
    TickFrequency: { kind: 'number', desc: 'Distance between the slider\'s tick marks.' },
    IsIndeterminate: { desc: 'A moving bar for work whose progress is not known.' },
    IsSnapToTickEnabled: { desc: 'Whether the slider snaps to its tick marks while dragging.' },
    ShowButtonSpinner: { desc: 'Show the up/down arrows on the number box.' },
    FormatString: { desc: 'A format for the number, e.g. "F2" for two decimals or "{0:C}" for currency.' },
    Mask: { desc: 'Which characters are allowed: 0 = digit, L = letter, 9 = digit or space (e.g. "0000-0000").' },
    Watermark: { desc: 'Hint text shown while the box is empty.' },
    OnContent: { desc: 'What the switch shows when it is ON.' },
    OffContent: { desc: 'What the switch shows when it is OFF.' },

    // --- GrumpyCharts (the bundled chart control set, 2026-09-19) ---
    Values: { desc: 'The Y values to plot, separated by commas (e.g. "4,9,6,12"). X is the sample number: 0, 1, 2…' },
    SourceFile: { desc: 'An .xlsx workbook to read the values from. Empty = use the inline data instead. Pick one from the chart\'s right-click menu ("Choose spreadsheet…") — also the way to change it while the app runs.' },
    Gradient: { desc: 'A gradient behind the whole chart: a real Avalonia LinearGradientBrush, RadialGradientBrush or ConicGradientBrush with three colour stops. It replaces the plain Plot Backcolour while it is set.' },
    ShowLegend: { desc: 'Draw a legend bar along the bottom of the chart: one entry per series, its name in the series colour and a tick box that switches that trace on and off while the app runs (the series keeps its place on the axis, so the other lines do not jump). A chart with no series elements draws a single unnamed line, so it shows no legend.' },
    LegendFontSize: { kind: 'number', unit: 'px', desc: 'Font size of the series names in the legend bar.' },
    XColumn: { desc: 'Which spreadsheet column holds the X values (A, B, C…). Default B.' },
    YColumn: { desc: 'Which spreadsheet column holds the Y values. Default C (a line plot falls back to the X column when this one is empty).' },
    HeaderRow: { desc: 'The spreadsheet row holding the axis names. Default 1 (the top row).' },
    FirstDataRow: { desc: 'The spreadsheet row where the values start. Default 2 (everything below the names row).' },
    LiveUpdate: { desc: 'Re-read the spreadsheet when it changes on disk. Save the sheet and the chart redraws.' },
    ShowTitle: { desc: 'Draw the chart title.' },
    TitlePosition: { desc: 'Which side of the plot the title sits on: Top, Bottom, Left (rotated) or Right (rotated).' },
    TitleColor: { desc: 'Colour of the chart title.' },
    TitleFontSize: { unit: 'px', desc: 'Font size of the chart title.' },
    LineColor: { kind: 'color', options: COLORS, desc: 'Colour of the plotted line and its markers.' },
    LineThickness: { kind: 'number', unit: 'px', desc: 'Thickness of the plotted line.' },
    LineStyle: { desc: 'How the plotted line is drawn: Solid, Dash, Dot or DashDot.' },
    MarkerStyle: { desc: 'The symbol drawn at each X,Y point: None, Dot, Cross, Square or Diamond.' },
    MarkerSize: { kind: 'number', unit: 'px', desc: 'Size of the marker symbol.' },
    Connected: { desc: 'Join the points with a line. False = markers only (a scatter plot).' },
    PlotBackColor: { kind: 'color', options: COLORS, desc: 'The chart\'s backcolour: fills the whole chart - the plot area AND the margin around it where the title and axis labels are drawn. Setting it makes the chart readable on any form, whatever colour the form is.' },
    PlotBackOpacity: { kind: 'number', unit: '%', desc: 'How solid the chart\'s backcolour is: 0 = invisible (the form shows through, so the title and labels take the form\'s colour), 100 = solid.' },
    ShowBorder: { desc: 'Draw the border around the chart control.' },
    // BorderBrush / BorderThickness are documented once, above, for every control that has them.
    ShowGrid: { desc: 'Draw gridlines at the major ticks.' },
    GridColor: { kind: 'color', options: COLORS, desc: 'Colour of the gridlines.' },
    GridThickness: { kind: 'number', unit: 'px', desc: 'Thickness of the gridlines.' },
    GridStyle: { desc: 'How the gridlines are drawn: Solid, Dash, Dot or DashDot.' },
    ShowAxes: { desc: 'Draw the two axis lines along the left and bottom of the plot area.' },
    AxisColor: { kind: 'color', options: COLORS, desc: 'Colour of the axes, the ticks, the tick labels and the axis names.' },
    ShowMajorTicks: { desc: 'Draw the longer ticks at every labelled value.' },
    MajorTickLength: { kind: 'number', unit: 'px', desc: 'Length of the major ticks.' },
    ShowMinorTicks: { desc: 'Draw the shorter ticks between the labelled values (four per interval).' },
    MinorTickLength: { kind: 'number', unit: 'px', desc: 'Length of the minor ticks.' },
    ShowTickLabels: { desc: 'Draw the numbers along the axes.' },
    TickLabelFontSize: { kind: 'number', unit: 'px', desc: 'Font size of the tick numbers and the axis names.' },
    ShowAxisTitles: { desc: 'Draw the axis names — from your X/Y Axis Name, or the spreadsheet\'s column headers.' },
    XAxisTitle: { desc: 'Name shown along the bottom axis. Empty = use the spreadsheet\'s column header.' },
    YAxisTitle: { desc: 'Name shown beside the left axis. Empty = use the spreadsheet\'s column header.' },
    MinX: { desc: 'Lowest X shown. Empty = auto-fit to the data.' },
    MaxX: { desc: 'Highest X shown. Empty = auto-fit to the data.' },
    MinY: { desc: 'Lowest Y shown. Empty = auto-fit to the data.' },
    MaxY: { desc: 'Highest Y shown. Empty = auto-fit to the data.' },

    // booleans / common state
    IsVisible: { desc: 'Whether the control is shown. (Avalonia uses IsVisible, not Visibility.)' },
    IsEnabled: { desc: 'Whether the control is interactive (enabled).' },
    IsHitTestVisible: { desc: 'Whether the control can receive pointer/mouse input.' },
    IsTabStop: { desc: 'Whether the control can be reached with the Tab key.' },
    Focusable: { desc: 'Whether the control can receive keyboard focus.' },
    IsReadOnly: { desc: 'Whether the content can be edited.' },
    IsChecked: { desc: 'Checked state: True / False / Null (indeterminate).' },
    IsThreeState: { desc: 'Allow a third, indeterminate checked state.' },
    IsDefault: { desc: 'Whether pressing Enter triggers this button.' },
    IsCancel: { desc: 'Whether pressing Esc triggers this button.' },
    AcceptsReturn: { desc: 'Whether pressing Enter inserts a new line (multi-line).' },
    AcceptsTab: { desc: 'Whether pressing Tab inserts a tab character.' },
    IsUndoEnabled: { desc: 'Whether typing can be undone.' },
    IsDropDownOpen: { desc: 'Whether the drop-down list is currently open.' },
    IsTextSearchEnabled: { desc: 'Whether typing selects matching items.' },
    ShowGridLines: { desc: 'Whether grid lines are drawn (design aid).' },
    LastChildFill: { desc: 'Whether the last child fills the remaining space.' },
    WrapSelection: { desc: 'Whether selection wraps around at the end.' },
    AutoGenerateColumns: { desc: 'Whether columns are created automatically from the data.' },
    CanUserReorderColumns: { desc: 'Whether the user can drag columns to reorder them.' },
    CanUserResizeColumns: { desc: 'Whether the user can resize columns.' },
    CanUserSortColumns: { desc: 'Whether clicking a column header sorts the data.' },
    AllowAutoHide: { desc: 'Whether scrollbars hide when not in use.' },
    IsScrollInertiaEnabled: { desc: 'Whether scrolling continues after release (inertia).' },

    // window
    Title: { desc: 'Text shown in the window title bar.' },
    Icon: { desc: 'Icon shown in the title bar / taskbar (a file path or avares:// URI).' },
    // custom title bar (ChromeWindow)
    TitleBarTitle: { desc: 'Text shown centred in the custom title bar (ChromeWindow).' },
    TitleBarIcon: { desc: 'Icon shown on the left of the custom title bar (a file path or avares:// URI).' },
    TitleBarHeight: { unit: 'px', desc: 'Height of the custom title bar in pixels (default 44). The form body sits below it.' },
    TitleBarBackground: { kind: 'color', options: COLORS, desc: 'Background color of the custom title bar (default the dark navy #0E2138). Clear the box to go back to the default.' },
    TitleBarForeground: { kind: 'color', options: COLORS, desc: 'Color of the custom title bar\'s text and its min/max/close glyphs (default white).' },
    CanResize: { desc: 'Whether the window can be resized by the user.' },
    ShowInTaskbar: { desc: 'Whether the window appears in the taskbar.' },
    ShowActivated: { desc: 'Whether the window becomes active when shown.' },
    Topmost: { desc: 'Whether the window stays on top of other windows.' },
    WindowStartupLocation: { desc: 'Where the window appears when it opens.' },
    WindowState: { desc: 'Initial window state: Normal, Maximized, Minimized or FullScreen.' },
    SystemDecorations: { desc: 'Window chrome: Full (title bar + frame), None (frameless), or BorderOnly.' },
    SizeToContent: { desc: 'Whether the window sizes itself to fit its content.' },
    ExtendClientAreaToDecorationsHint: { desc: 'Extend content into the title-bar area (for custom chrome).' },

    // content / values
    Header: { desc: 'Header (title/label) of the control — e.g. a TabItem tab label or a GroupBox group title.' },
    Content: { desc: 'Text (or content) displayed in the control.' },
    Text: { desc: 'Text content of the control.' },
    PlaceholderText: { desc: 'Hint text shown while the field is empty.' },
    PasswordChar: { desc: 'Character used to hide password input.' },
    GroupName: { desc: 'Radio buttons sharing a group name act as a single group.' },
    Command: { desc: 'Command to execute when the control is triggered.' },
    CommandParameter: { desc: 'Parameter passed to the Command.' },
    // HyperlinkButton
    NavigateUri: { desc: 'Web address (URI) the link opens when clicked (e.g. https://example.com). Leave empty to act on Command instead.' },
    IsVisited: { desc: 'Whether the link is shown as already visited (visited styling).' },
    // CommandBar / CommandBarButton
    Label: { desc: 'Label text shown for the command (in a Command Bar) or button.' },
    IsCompact: { desc: 'Compact mode — icon/label fit in a smaller command area.' },
    LabelPosition: { desc: 'Where the label sits: Bottom (stacked below the icon), Right (beside it) or Collapsed (icon only).' },
    IsOpen: { desc: 'Whether the Command Bar overflow panel is open.' },
    IsSticky: { desc: 'Whether an opened overflow stays open until dismissed.' },
    IsDynamicOverflowEnabled: { desc: 'Whether commands automatically move to the overflow when the bar is too small.' },
    OverflowButtonVisibility: { desc: 'When the overflow (…) button is shown: Auto, Visible or Collapsed.' },
    Source: { desc: 'Image source: a file path or avares:// URI.' },
    Stretch: { desc: 'How the image is fitted inside its box.' },
    StretchDirection: { desc: 'Which directions the image may be scaled.' },
    ItemsSource: { desc: 'Source collection of items (e.g. a binding or array).' },
    SelectedItem: { desc: 'The currently selected item.' },
    SelectedIndex: { desc: 'Index of the selected item (-1 = none).' },

    // text-specific numbers
    MaxLength: { desc: 'Maximum number of characters that can be entered.' },
    SelectionStart: { desc: 'Character position where the text selection starts.' },
    SelectionEnd: { desc: 'Character position where the text selection ends.' },
    LineHeight: { unit: 'px', desc: 'Height of each line of text in pixels.' },
    LetterSpacing: { unit: 'px', desc: 'Extra space between characters in pixels.' },
    MaxLines: { desc: 'Maximum number of lines of text shown.' },

    // panel / layout
    Spacing: { unit: 'px', desc: 'Space between child items in pixels.' },
    ItemWidth: { unit: 'px', desc: 'Width given to each wrapped item in pixels.' },
    ItemHeight: { unit: 'px', desc: 'Height given to each wrapped item in pixels.' },
    Columns: { desc: 'Number of columns in a UniformGrid (0 = automatic).' },
    Rows: { desc: 'Number of rows in a UniformGrid (0 = automatic).' },
    FirstColumn: { desc: 'The first column that has content in a UniformGrid.' },
    FirstRow: { desc: 'The first row that has content in a UniformGrid.' },

    // data grid
    RowHeight: { unit: 'px', desc: 'Height of each data row in pixels.' },
    RowHeaderWidth: { unit: 'px', desc: 'Width of the row-header column in pixels.' },
    ColumnWidth: { desc: 'Width of columns: a number, "Auto" or "*" (stretch).' },
    FrozenColumnCount: { desc: 'Number of leading columns that stay fixed when scrolling.' },
    HeadersVisibility: { desc: 'Which headers are shown: All, Column, Row or None.' },
    GridLinesVisibility: { desc: 'Which grid lines are shown: All, Horizontal, Vertical or None.' },
    MaxDropDownHeight: { unit: 'px', desc: 'Maximum height of the drop-down list in pixels.' },

    // anchor (bundled AnchorHelper)
    'chrome:AnchorHelper.Anchor': { desc: 'Anchor the control to one or more edges of its container so it moves (or stretches) with them when the form is resized. Left/Right/Top/Bottom = stay a fixed distance from that edge; combining two OPPOSITE edges (Left,Right or Top,Bottom) makes the control stretch between them. Only takes effect on controls placed directly on a Canvas, and requires the bundled AnchorHelper (generated projects include it).' }
};

/**
 * Properties hidden by default (beginner mode) and revealed by the "Show advanced"
 * toggle. Keeps the panel focused on what a novice needs most.
 */
const ADVANCED_KEYS = new Set([
    'MinWidth', 'MinHeight', 'MaxWidth', 'MaxHeight',
    'Canvas.Left', 'Canvas.Top', 'ZIndex', 'TabIndex',
    'IsHitTestVisible', 'IsTabStop', 'Focusable',
    'IsThreeState', 'IsDefault', 'IsCancel', 'ClickMode', 'AcceptsTab', 'IsUndoEnabled',
    'SelectionStart', 'SelectionEnd',
    'Command', 'CommandParameter',
    'IsVisited', 'IsCompact', 'LabelPosition',
    'IsOpen', 'IsSticky', 'IsDynamicOverflowEnabled', 'OverflowButtonVisibility',
    'MaxDropDownHeight', 'WrapSelection', 'IsTextSearchEnabled',
    'AutoGenerateColumns', 'CanUserReorderColumns', 'CanUserResizeColumns', 'CanUserSortColumns',
    'FrozenColumnCount', 'HeadersVisibility', 'GridLinesVisibility', 'ColumnWidth', 'RowHeight', 'RowHeaderWidth',
    'ShowActivated', 'Topmost', 'SizeToContent', 'ExtendClientAreaToDecorationsHint',
    // GrumpyCharts: the spreadsheet plumbing and the scale overrides are for the times you need
    // them — a beginner only ever touches Values/Points, the title, the colours and the markers.
    'XColumn', 'YColumn', 'HeaderRow', 'FirstDataRow',
    'TitleFontSize', 'TickLabelFontSize', 'MajorTickLength', 'MinorTickLength', 'GridThickness',
    'LegendFontSize',
    'MarkerSize', 'MinX', 'MaxX', 'MinY', 'MaxY', 'MinZ', 'MaxZ'
]);

/**
 * Avalonia's default value for each property key (in XAML form).
 *
 * These are used to (a) display the framework default in the Properties panel
 * when the attribute is absent on the element, and (b) strip attributes that the
 * user sets back to their default (keeping the saved XAML clean).
 *
 * Avalonia 12.1.1 defaults. Opaque (Opacity 1 → display 100 %) is in XAML form here;
 * the panel converts it for display. Properties whose Avalonia default is genuinely
 * "unset/auto/empty" use '' so the field reads as auto (e.g. Width, Height, NaN).
 */
export const DEFAULTS: Record<string, string> = {
    // --- common layout / state ---
    Width: '',
    Height: '',
    MinWidth: '0',
    MinHeight: '0',
    MaxWidth: '',
    MaxHeight: '',
    Margin: '0',
    HorizontalAlignment: 'Stretch',
    VerticalAlignment: 'Stretch',
    IsVisible: 'True',
    IsEnabled: 'True',
    IsHitTestVisible: 'True',
    IsTabStop: 'True',
    Focusable: 'False',
    TabIndex: '0',
    Opacity: '1',
    ZIndex: '0',
    'Canvas.Left': '',
    'Canvas.Top': '',
    'DockPanel.Dock': 'None',
    'chrome:AnchorHelper.Anchor': 'None',

    // --- custom title bar (ChromeWindow) ---
    TitleBarHeight: '44',

    // --- styling (default = no border/padding/corner) ---
    Padding: '',
    BorderThickness: '',
    CornerRadius: '',
    HorizontalContentAlignment: 'Stretch',
    VerticalContentAlignment: 'Stretch',

    // --- font / text properties ---
    FontFamily: '',
    FontSize: '',
    FontWeight: 'Normal',
    FontStyle: 'Normal',
    Foreground: '',
    TextWrapping: 'NoWrap',
    TextTrimming: 'None',
    TextAlignment: 'Left',
    LineHeight: '0',
    LetterSpacing: '0',
    MaxLines: '0',

    // --- content / values ---
    Header: '',
    Content: '',
    Text: '',
    PlaceholderText: '',
    PasswordChar: '',
    GroupName: '',

    // --- colors / brushes (theme-derived → empty until set) ---
    Background: '',
    BorderBrush: '',
    CaretBrush: '',
    SelectionBrush: '',
    PlaceholderForeground: '',

    // --- TextBox ---
    MaxLength: '0',
    IsReadOnly: 'False',
    AcceptsReturn: 'False',
    AcceptsTab: 'False',
    IsUndoEnabled: 'True',
    SelectionStart: '0',
    SelectionEnd: '0',

    // --- CheckBox / RadioButton ---
    IsChecked: 'False',
    IsThreeState: 'False',

    // --- Button ---
    IsDefault: 'False',
    IsCancel: 'False',
    ClickMode: 'Release',

    // --- HyperlinkButton ---
    NavigateUri: '',
    IsVisited: 'False',

    // --- CommandBar ---
    IsCompact: 'False',
    IsOpen: 'False',
    IsSticky: 'False',

    // --- ComboBox ---
    IsDropDownOpen: 'False',
    IsTextSearchEnabled: 'False',
    MaxDropDownHeight: '200',

    // --- ListBox ---
    SelectionMode: 'Multiple',
    WrapSelection: 'False',
    SelectedIndex: '-1',
    SelectedItem: '',

    // --- DataGrid ---
    // Defaults mirror the REAL Avalonia.DataGrid (12.1.1): column reorder/resize default to FALSE,
    // so setting them to True must WRITE the attribute (a previous 'True' default here silently
    // stripped it — the property looked set in the panel but nothing worked at runtime).
    AutoGenerateColumns: 'False',
    CanUserReorderColumns: 'False',
    CanUserResizeColumns: 'False',
    CanUserSortColumns: 'True',
    HeadersVisibility: 'All',
    GridLinesVisibility: 'None',
    FrozenColumnCount: '0',
    RowHeight: '',
    RowHeaderWidth: '0',
    ColumnWidth: '',

    // --- TabControl ---
    TabStripPlacement: 'Top',

    // --- Panel / layout containers ---
    Orientation: 'Vertical',
    Spacing: '0',
    ItemWidth: '',
    ItemHeight: '',
    ShowGridLines: 'False',
    Columns: '0',
    Rows: '0',
    FirstColumn: '0',
    FirstRow: '0',

    // --- ScrollViewer ---
    HorizontalScrollBarVisibility: 'Disabled',
    VerticalScrollBarVisibility: 'Disabled',
    AllowAutoHide: 'False',
    IsScrollInertiaEnabled: 'True',

    // --- DockPanel ---
    LastChildFill: 'True',

    // --- Image ---
    Source: '',
    Stretch: 'None',
    StretchDirection: 'Both',

    // --- Shapes ---
    Stroke: '',
    Fill: '',
    StrokeThickness: '1',
    StrokeLineCap: 'Flat',
    StartAngle: '0',
    SweepAngle: '180',
    RadiusX: '0',
    RadiusY: '0',
    StartPoint: '',
    EndPoint: '',
    Points: '0,0 40,0 40,40',
    Data: 'M0,0 L16,16',
    Value: '50',
    Minimum: '0',
    Maximum: '100',
    Increment: '1',
    TickFrequency: '10',
    IsIndeterminate: 'False',
    IsSnapToTickEnabled: 'False',
    ShowButtonSpinner: 'True',
    FormatString: '',
    Mask: '0000-0000',
    Watermark: '',
    // --- GrumpyCharts: the control's own defaults, so the panel shows a real value and setting one
    // back to its default strips the attribute again. 'Values'/'Points' start empty on purpose: the
    // toolbox snippet fills them, so a dropped chart draws immediately. ---
    Values: '',
    SourceFile: '',
    ShowLegend: 'True',
    LegendFontSize: '12',
    XColumn: 'B',
    YColumn: 'C',
    HeaderRow: '1',
    FirstDataRow: '2',
    LiveUpdate: 'True',
    ShowTitle: 'False',
    TitlePosition: 'Top',
    TitleColor: '#303030',
    TitleFontSize: '14',
    LineColor: '#2D7DD2',
    LineThickness: '2',
    LineStyle: 'Solid',
    MarkerStyle: 'Dot',
    MarkerSize: '8',
    Connected: 'True',
    PlotBackColor: '#FFFFFF',
    PlotBackOpacity: '100',
    ShowBorder: 'True',
    // BorderBrush / BorderThickness already have their generic (unset) defaults above; a chart that
    // leaves them unset simply draws its own built-in border colour and width.
    ShowGrid: 'True',
    GridColor: '#E8E8E8',
    GridThickness: '1',
    GridStyle: 'Solid',
    ShowAxes: 'True',
    AxisColor: '#666666',
    ShowMajorTicks: 'True',
    MajorTickLength: '6',
    ShowMinorTicks: 'True',
    MinorTickLength: '3',
    ShowTickLabels: 'True',
    TickLabelFontSize: '11',
    ShowAxisTitles: 'True',
    XAxisTitle: '',
    YAxisTitle: '',
    MinX: '',
    MaxX: '',
    MinY: '',
    MaxY: '',
    // --- GrumpyCharts: the category and pie charts (the bar chart's own defaults, the area fill,
    // and the pie's ring, angle, gaps and slice outline). ---
    BarMode: 'Grouped',
    BarWidth: '0.8',
    BarCornerRadius: '0',
    AreaMode: 'Plain',
    AreaOpacity: '60',
    Labels: '',
    DoughnutPercent: '0',
    // StartAngle already has its generic default above (the Arc shape uses it too); a pie's own
    // default is the same 0 — 12 o'clock.
    SliceGap: '0',
    HoverExplode: '10',
    SliceBorderColor: '#FFFFFF',
    SliceBorderThickness: '1',
    // --- GrumpyCharts: the waterfall (2026-09-22) ---
    SampleSets: '',
    RibbonStyle: 'Ribbon',
    RibbonOpacity: '80',
    ColorMode: 'Sampleset',
    // Empty = "let the data decide", which is what the control's NaN default means.
    HeatMin: '',
    HeatMax: '',
    SplitValue: '0',
    BelowColor: '#2D7DD2',
    AboveColor: '#E4572E',
    ShowConnectors: 'True',
    ConnectorColor: '#6B7A8F',
    ConnectorThickness: '1',
    ConnectorStep: '0',
    MaxPoints: '512',
    // --- GrumpyCharts: the surface chart 3D (2026-09-23) ---
    Style: 'GridMeshSolid',
    ColorBy: 'Temperature',
    LowColor: '#1B2A6B',
    HighColor: '#E53935',
    SolidOpacity: '100',
    MeshColor: '#6B7A8F',
    ShowBase: 'False',
    BaseColor: '#3C3C3C',
    MeshThickness: '1',
    ZStart: '0',
    ZStep: '1',
    // Empty = "number the slices from ZStart/ZStep", which is what 0 means to the chart.
    ZRow: '',
    Elevation: '30',
    Azimuth: '45',
    ZSpacing: '1',
    Zoom: '1',
    ZAxisTitle: '',
    OnContent: 'On',
    OffContent: 'Off',
    Radius: '',

    // --- Menu ---
    Icon: '',

    // --- Window ---
    Title: '',
    CanResize: 'True',
    ShowInTaskbar: 'True',
    ShowActivated: 'True',
    Topmost: 'False',
    WindowStartupLocation: 'Manual',
    WindowState: 'Normal',
    SystemDecorations: 'Full',
    SizeToContent: 'Manual',
    ExtendClientAreaToDecorationsHint: 'False',

    // --- non-settable / informational ---
    Command: '',
    CommandParameter: ''
};

/**
 * Returns the Avalonia default (in XAML form) for a property key, or `undefined`
 * if the key has no meaningful default (i.e. it is empty/auto by default).
 */
export function defaultFor(key: string): string | undefined {
    return DEFAULTS[key];
}

/**
 * Effective Dock value for the Properties panel. Avalonia has no literal `Fill` Dock value,
 * so the designer stores Fill as NO `DockPanel.Dock` attribute + the control being the LAST
 * child of a DockPanel whose `LastChildFill` is not False. That state is therefore shown as
 * "Fill" (not the default "None"); anything else with no attribute is "None".
 */
function dockValueFor(el: Element): string {
    const attr = el.getAttribute('DockPanel.Dock');
    if (attr) return attr;
    const parent = el.parentNode as Element | null;
    if (parent && parent.nodeType === 1 && localName(parent.tagName) === 'DockPanel') {
        let isLast = true;
        for (let sib = el.nextSibling; sib; sib = sib.nextSibling) {
            if (sib.nodeType === 1) { isLast = false; break; }
        }
        if (isLast) {
            const lcf = (parent as Element).getAttribute('LastChildFill');
            if (lcf !== 'False') return 'Fill';
        }
    }
    return 'None';
}

/** Reads an element's rotation (degrees) from its `<X.RenderTransform><RotateTransform Angle="…"/>` ('' when none). */
function rotateAngleFor(el: Element): string {
    for (const prop of childElements(el)) {
        if (localName(prop.tagName).endsWith('.RenderTransform')) {
            for (const t of childElements(prop)) {
                if (localName(t.tagName) === 'RotateTransform') {
                    const a = t.getAttribute('Angle');
                    if (a) return a;
                }
            }
        }
    }
    return '';
}

/** Direct element children of `el` (skips text/comments). */
function childElements(el: Element): Element[] {
    const out: Element[] = [];
    for (let i = 0; i < el.childNodes.length; i++) {
        const n = el.childNodes.item(i);
        if (n && n.nodeType === 1) out.push(n as Element);
    }
    return out;
}

/** Counts a Grid's RowDefinition/ColumnDefinition children (0 when none are defined). */
function gridDefinitionCount(el: Element, kind: 'rows' | 'cols'): number {
    const propName = kind === 'rows' ? 'Grid.RowDefinitions' : 'Grid.ColumnDefinitions';
    const defs = childElements(el).find((k) => localName(k.tagName) === propName);
    if (!defs) return 0;
    return childElements(defs).length;
}

/** The first pane Border of a SplitPanel (given its root element — a Grid, or a Border wrapping a
 *  Grid) whose body Canvas is named SplitPanelNPaneM, if any. */
function firstPaneBorderOf(el: Element): Element | null {
    let grid: Element | null = null;
    if (localName(el.tagName) === 'Grid') grid = el;
    else if (localName(el.tagName) === 'Border') {
        for (const c of childElements(el)) {
            if (localName(c.tagName) === 'Grid') { grid = c; break; }
        }
    }
    if (!grid) return null;
    for (const c of childElements(grid)) {
        if (localName(c.tagName) !== 'Border') continue;
        for (const inner of childElements(c)) {
            const n = inner.getAttribute('x:Name') || inner.getAttribute('Name') || '';
            if (localName(inner.tagName) === 'Canvas' && /^SplitPanel\d+Pane\d+$/.test(n)) return c;
        }
    }
    return null;
}

/** Reads the current pane-border width of a SplitPanel (its first pane's BorderThickness, or '1'). */
function splitPaneBorderOf(el: Element): string {
    const b = firstPaneBorderOf(el);
    if (!b) return '1';
    const bt = b.getAttribute('BorderThickness');
    return bt ? bt.split(',')[0].trim() : '1';
}

/**
 * Builds the property list for a control element: common layout/state props,
 * font props (where the type supports them), then type-specific props.
 * Custom Window-derived roots (e.g. `chrome:ChromeWindow`) are treated as a Window
 * so all form-manipulation properties (Title, size, CanResize, position, ...) appear.
 */
// --- hardcopy output (2026-09-25) ---------------------------------------------------------
// The page a chart is printed or exported onto. The same three rows belong to all seven charts, so
// they are appended here rather than copied into seven entries. AsDrawn — the chart's own size, edge
// to edge — is the default, so a form that never touches these rows prints exactly as it did before,
// and the headless previewer parses them without a printer package (they are declared outside the
// PRINT_SUPPORT symbol in the bundled file for that reason).
const CHART_PRINT_PAPERS = ['AsDrawn', 'A4', 'Letter'];
// Whether the LEGEND goes on the page. AsDrawn (the default) prints what the chart shows, so nothing
// changes for a form that leaves the row alone; Off puts the graph on the paper with the legend's room
// given back to the plot — the usual hardcopy — and On forces it on. The override is scoped to the job
// in the bundled file: the chart on screen keeps its own ShowLegend whatever this says.
const CHART_PRINT_LEGENDS = ['AsDrawn', 'Off', 'On'];

const CHART_PRINT_ROWS: PropTemplate[] = [
    { key: 'PrintPaper', label: 'Print Paper', kind: 'dropdown', options: CHART_PRINT_PAPERS },
    { key: 'PrintMargin', label: 'Print Margin', kind: 'number' },
    { key: 'PrintLightBackground', label: 'Print on White', kind: 'dropdown', options: BOOL },
    { key: 'PrintLegend', label: 'Print Legend', kind: 'dropdown', options: CHART_PRINT_LEGENDS }
];

for (const tag of ['GrumpyLinePlot', 'GrumpyXYPlot', 'GrumpyBarPlot', 'GrumpyAreaPlot',
    'GrumpyPiePlot', 'GrumpyWaterfallPlot', 'GrumpySurfacePlot']) {
    CONTROL_PROPS[tag] = (CONTROL_PROPS[tag] ?? []).concat(CHART_PRINT_ROWS);
}

// ---------------- Properties panel sections ----------------
/**
 * The Properties panel files its rows into these sections — ALWAYS in this order, for every
 * toolbox control: the popup editors first, then layout/size, appearance, text, data and behavior.
 * Inside a section the keys listed here also fix the order, so a colour row, a size row or the
 * Anchor row is always in the same place whichever control is selected. Every key the catalog can
 * produce must be listed somewhere (a test asserts it) — anything unmapped falls back to the last
 * section, and a designer editor button always lands in `editors`.
 */
export type PropSectionId = 'editors' | 'layout' | 'appearance' | 'text' | 'data' | 'behavior';

export const PROP_SECTIONS: { id: PropSectionId; label: string; keys: string[] }[] = [
    {
        id: 'editors', label: 'Editors',
        // Everything the designer edits through a popup editor (`kind: 'button'`) — whether it is
        // pushed as a "top action" (DataGrid Rows/Columns, SplitPanel Split Layout/Splitters) or
        // lives in the control's own list (Items, Grid.Defs, MenuItems, StatusItems).
        keys: ['Rows', 'Columns', 'Series', 'Slices', 'Axis', 'Legend', 'Cursors', 'SplitLayout', 'Splitters', 'Items', 'Grid.Defs', 'MenuItems', 'StatusItems', 'TreeItems']
    },
    {
        id: 'layout', label: 'Layout & size',
        // Size, position, docking/anchoring and alignment — everything that says WHERE the control
        // is and how big it is, from the element's own size to its cell/dock/anchor in the parent.
        keys: [
            'Width', 'Height', 'MinWidth', 'MinHeight', 'MaxWidth', 'MaxHeight',
            'Canvas.Left', 'Canvas.Top', 'Margin', 'Padding',
            'DockPanel.Dock', 'chrome:AnchorHelper.Anchor',
            'HorizontalAlignment', 'VerticalAlignment', 'HorizontalContentAlignment', 'VerticalContentAlignment',
            'Grid.Row', 'Grid.Column',
            'Orientation', 'Spacing', 'ItemWidth', 'ItemHeight', 'LastChildFill',
            'MaxDropDownHeight', 'SizeToContent', 'CanResize', 'AutoSizeToCell', 'TitleBarHeight',
            'WindowState', 'WindowStartupLocation'
        ]
    },
    {
        id: 'appearance', label: 'Appearance',
        // Every colour/brush plus the other visual styling: borders, corners, opacity, the theme row,
        // shape geometry (fill/stroke/angle/radius) and images/icons.
        keys: [
            '__theme__', 'Background', 'Foreground', 'BorderBrush', 'BorderThickness', 'CornerRadius',
            'Opacity', 'SplitPanelPaneBorder', 'ShowGridLines',
            'CaretBrush', 'SelectionBrush', 'Fill', 'Stroke', 'StrokeThickness', 'StrokeLineCap',
            'Radius', 'Angle', 'StartPoint', 'EndPoint', 'StartAngle', 'SweepAngle',
            'Source', 'Stretch', 'StretchDirection', 'Icon', 'TitleBarIcon', 'ShowIcon',
            'TitleBarBackground', 'TitleBarForeground',
            // Point-defined shapes and path icons (2026-09-19)
            'Points', 'Data',
            // GrumpyCharts (the bundled chart control set, 2026-09-19): the frame, the plot area and
            // its opacity, the plot line, the markers, the gridlines, the axes with their ticks and
            // labels, and the title are all style rows, so they live in Appearance.
            'ShowBorder', 'PlotBackColor', 'PlotBackOpacity', 'Gradient',
            'LineColor', 'LineThickness', 'LineStyle',
            'MarkerStyle', 'MarkerSize',
            'ShowGrid', 'GridColor', 'GridThickness', 'GridStyle',
            'ShowAxes', 'AxisColor',
            'ShowMajorTicks', 'MajorTickLength', 'ShowMinorTicks', 'MinorTickLength',
            'ShowTickLabels', 'TickLabelFontSize', 'ShowAxisTitles',
            'ShowTitle', 'TitleColor', 'TitlePosition', 'TitleFontSize',
            'ShowLegend', 'LegendFontSize',
            // The category and pie charts (2026-09-20): how the shapes stand in their category, how
            // full the area fill is, and the pie's ring, its start angle, the gaps, the slice
            // outlines and how far the slice under the pointer pops out (2026-09-22).
            'BarMode', 'BarWidth', 'BarCornerRadius', 'AreaMode', 'AreaOpacity',
            'DoughnutPercent', 'StartAngle', 'SliceGap', 'SliceBorderColor', 'SliceBorderThickness',
            'HoverExplode',
            // The waterfall (2026-09-22): the fill style and its opacity, the colour mode with its heat
            // range and its split colours, the mesh, and the VIEW (the two angles, the set spacing and the
            // zoom). Its floor gridlines and its three projected axes use the axis rows just above.
            'RibbonStyle', 'RibbonOpacity', 'ColorMode', 'HeatMin', 'HeatMax', 'SplitValue',
            'BelowColor', 'AboveColor', 'ShowConnectors', 'ConnectorColor', 'ConnectorThickness',
            'ConnectorStep', 'MaxPoints', 'Elevation', 'Azimuth', 'ZSpacing', 'Zoom',
            // The surface chart 3D (2026-09-23): how the sheet is drawn and coloured, its mesh, the solid
            // base block under it, and the range window (Width From-To and Slice From-To) that re-fits the
            // picture to what it selects. The legend's two sliders are exactly that window: the width and
            // WHICH SLICES are drawn.
            'Style', 'ColorBy', 'LowColor', 'HighColor', 'SolidOpacity', 'MeshColor', 'MeshThickness',
            'ShowBase', 'BaseColor',
            // The X and Y axes' SIZE on screen (the axis zoom, 2026-09-24): 100 % is the fitted picture and
            // the ranges the axes cover are untouched by it — a zoom, not another range window.
            'ZoomX', 'ZoomY',
            'MinX', 'MaxX', 'MinY', 'MaxY', 'MinZ', 'MaxZ',
            // The surface fill between the sets was removed from the chart (the open corridors between
            // the sets are the default, unroofed picture), so the SurfaceFill / SurfaceColor /
            // SurfaceOpacity / SurfaceToFloor rows are gone with it.
        ]
    },
    {
        id: 'text', label: 'Text & font',
        // What the control SHOWS (content/caption/labels) and how that text is rendered or entered.
        keys: [
            // A ChromeWindow form shows the bar's caption before the window's own Title (the
            // title-bar rows come first for a custom-title-bar form).
            'TitleBarTitle', 'Title',
            'Content', 'Text', 'Header', 'Label', 'PlaceholderText', 'PasswordChar',
            'BrowseText', 'NavigateUri',
            'FontFamily', 'FontSize', 'FontWeight', 'FontStyle',
            'TextAlignment', 'TextWrapping', 'TextTrimming', 'LetterSpacing', 'LineHeight',
            'MaxLength', 'MaxLines', 'AcceptsReturn', 'AcceptsTab',
            'WrapSelection', 'SelectionStart', 'SelectionEnd',
            'StatusDate.Date', 'StatusDate.Time', 'StatusDate.Preview',
            // The 2026-09-19 controls: switch state text, the masked box's mask and hint, number format
            'OnContent', 'OffContent', 'Mask', 'Watermark', 'FormatString',
            // GrumpyCharts: the axis names (the spreadsheet's row-1 column headers by default), and the
            // waterfall's depth-axis name.
            'XAxisTitle', 'YAxisTitle', 'ZAxisTitle'
        ]
    },
    {
        id: 'data', label: 'Data',
        // The control's data payload and how it is edited: item/row sources, the selected item,
        // the grid's user-edit permissions and the file/folder picker's settings.
        keys: [
            'ItemsSource', 'SelectedItem', 'SelectedIndex',
            'PathType', 'SelectedPath', 'Filter', 'InitialFolder', 'IsPathReadOnly',
            'AutoGenerateColumns', 'IsReadOnly',
            'CanUserSortColumns', 'CanUserReorderColumns', 'CanUserResizeColumns',
            'FirstRow', 'FirstColumn', 'IsUndoEnabled', 'UndoRedoDepth',
            // Numeric payload of the 2026-09-19 controls (progress bar, slider, number box)
            'Value', 'Minimum', 'Maximum', 'Increment', 'TickFrequency',
            // GrumpyCharts data: the inline array, the spreadsheet link with its columns and rows,
            // and the optional fixed axis bounds (empty = auto-fit to the data). 'Points' is listed
            // under Appearance, where the point-defined shapes already keep it.
            'Values', 'Labels', 'SourceFile', 'XColumn', 'YColumn', 'HeaderRow', 'FirstDataRow',
            'MinX', 'MaxX', 'MinY', 'MaxY',
            // The waterfall's inline samplesets (see the row of the same name), and the surface chart's
            // own slice numbering (Z Row / Z Start / Z Step) beside it.
            'SampleSets', 'ZRow', 'ZStart', 'ZStep'
        ]
    },
    {
        id: 'behavior', label: 'Behavior',
        // State, interaction and window/control capabilities — the "everything else that makes it
        // work" rows (visibility, focus, check state, click/selection modes, window chrome flags).
        keys: [
            'IsVisible', 'IsEnabled', 'IsHitTestVisible', 'IsTabStop', 'Focusable', 'TabIndex', 'ZIndex',
            'IsChecked', 'IsThreeState', 'GroupName', 'IsDefault', 'IsCancel', 'IsVisited',
            'IsDropDownOpen', 'IsOpen', 'IsSticky', 'IsCompact', 'ClickMode', 'SelectionMode',
            'Command', 'CommandParameter', 'IsTextSearchEnabled', 'IsScrollInertiaEnabled',
            'AllowAutoHide', 'HorizontalScrollBarVisibility', 'VerticalScrollBarVisibility',
            'LabelPosition', 'DefaultLabelPosition', 'OverflowButtonVisibility',
            'IsDynamicOverflowEnabled', 'TabStripPlacement',
            'Topmost', 'ShowInTaskbar', 'ShowActivated', 'SystemDecorations',
            'ExtendClientAreaToDecorationsHint',
            // State flags of the 2026-09-19 controls
            'IsIndeterminate', 'IsSnapToTickEnabled', 'ShowButtonSpinner',
            // GrumpyCharts: join the X,Y points with a line, and re-read the spreadsheet on change
            'Connected', 'LiveUpdate',
            // GrumpyCharts hardcopy (2026-09-25): the page a chart prints or exports onto — which
            // paper, the margin inside it, whether the page is painted white first, and whether the
            // LEGEND goes on the paper at all. AsDrawn (the default) keeps the chart's own size and
            // prints the legend as drawn, which is what the rows did nothing about before.
            'PrintPaper', 'PrintMargin', 'PrintLightBackground', 'PrintLegend'
        ]
    }
];

/** Rows pinned ABOVE every section — the control's identity, exactly as before. */
const PINNED_PROP_KEYS = new Set(['__name__', '__type__']);

const SECTION_OF_KEY = (() => {
    const map = new Map<string, { id: PropSectionId; label: string; index: number; order: number }>();
    PROP_SECTIONS.forEach((s, index) => {
        s.keys.forEach((key, order) => {
            if (!map.has(key)) map.set(key, { id: s.id, label: s.label, index, order });
        });
    });
    return map;
})();

const LAST_SECTION = PROP_SECTIONS[PROP_SECTIONS.length - 1];

/**
 * Files every row into its section and orders the whole list: the pinned identity rows first, then
 * the sections in `PROP_SECTIONS` order, and inside a section the canonical key order. Rows a
 * control adds dynamically (an editor button, a Grid-cell row, a SplitPanel pane border, …) that
 * aren't listed anywhere keep their relative order at the end of their section, so nothing is lost.
 */
export function groupPropertyRows(rows: PropDef[]): PropDef[] {
    const entries = rows.map((row, i) => {
        const hit = SECTION_OF_KEY.get(row.key);
        const pinned = PINNED_PROP_KEYS.has(row.key);
        // A designer editor button is ALWAYS in 'Editors', even one a future control adds unlisted.
        const section = hit ?? (row.kind === 'button'
            ? { id: PROP_SECTIONS[0].id, label: PROP_SECTIONS[0].label, index: 0, order: 500 }
            : { id: LAST_SECTION.id, label: LAST_SECTION.label, index: PROP_SECTIONS.length - 1, order: 500 });
        return { row, i, pinned, index: pinned ? -1 : section.index, order: pinned ? 0 : section.order, section };
    });
    entries.sort((a, b) => (a.index - b.index) || (a.order - b.order) || (a.i - b.i));
    return entries.map((e) => e.pinned
        ? { ...e.row, section: undefined, sectionId: undefined }
        : { ...e.row, section: e.section.label, sectionId: e.section.id });
}

export function propertyDefsFor(
    el: Element,
    effective?: Record<string, string>,
    itemSourceOverride?: { value: string; readOnly: boolean; desc?: string },
    /** 'Undo-Redo' depth for a DataGrid bound to a DataSet table (stored in the .adset, not XAML). */
    undoRedo?: { value: string },
    /** True when this Image opted OUT of dynamic Grid-cell auto-sizing (stored in the extension, not XAML). */
    autoSizeOff?: boolean,
    /** StatusDate clock format settings (read from its generated code-behind handler). When present
     *  on a status-clock TextBlock, the two System/Custom pickers + live preview rows are offered. */
    statusClock?: { date?: string; time?: string; preview?: string }
): PropDef[] {
    const tag = localName(el.tagName);
    const name = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
    // The Status Bar tool inserts a Border (Avalonia has no StatusBar control); its
    // generated name (StatusBar1, ...) identifies it so the StatusBar properties
    // (including Dock) show instead of only the generic Border ones.
    const isStatusBar = /^StatusBar\d*$/.test(name);
    // The GrumpyPanel tool inserts a bundled <chrome:GrumpyPanel> — a Border-based docking
    // region. It gets a DEDICATED 8-position Anchor + the frame (Border) chrome properties.
    const isGrumpyPanel = tag === 'GrumpyPanel';
    // The Split Panel tool is named SplitPanelN. New 3-zone splits are a Border wrapper
    // (its own clickable frame) around a Grid; older splits are the Grid itself. Its Split
    // Layout + Pane Border properties live here (the generic Grid 'Rows & Columns' editor is
    // hidden for Grid-rooted splits).
    const isSplitPanel = /^SplitPanel\d*$/.test(name);
    const isWindowLike = tag === 'Window' || /window$/i.test(tag);

    const typeTemplates: PropTemplate[] = isWindowLike
        ? [
            // ChromeWindow custom-title-bar properties are pinned ABOVE the generic Window props.
            ...(tag === 'ChromeWindow' ? CHROME_WINDOW_PROPS : []),
            ...(CONTROL_PROPS['Window'] || [])
        ]
        : [
            ...(isStatusBar ? (CONTROL_PROPS['StatusBar'] || []) : []),
            // A Border-rooted SplitPanel (the 3-zone frame) gets Dock + border/background
            // props; there is no generic 'Border' CONTROL_PROPS entry. Grid-rooted splits
            // fall through to the normal Grid template (Dock + Background + ShowGridLines).
            ...(isSplitPanel && tag === 'Border'
                ? [
                    { key: 'DockPanel.Dock', label: 'Dock', kind: 'dropdown' as const, options: DOCK_OPTIONS },
                    { key: 'Background', label: 'Background', kind: 'text' as const },
                    { key: 'BorderBrush', label: 'Border Brush', kind: 'text' as const },
                    { key: 'BorderThickness', label: 'Border Thickness', kind: 'text' as const }
                ]
                : (CONTROL_PROPS[tag] || []))
        ];

    // Only non-root elements can anchor to a container (the root element is the
    // window/UserControl itself).
    const isRoot = !el.parentNode || (el.parentNode as Node).nodeType !== 1;
    const parentEl: Element | null = !isRoot && el.parentNode && (el.parentNode as Node).nodeType === 1
        ? (el.parentNode as Element) : null;
    const parentTag = parentEl ? localName(parentEl.tagName) : '';

    // A control inside a Grid cell is positioned/sized by the Grid — DockPanel.Dock and
    // Canvas.Left/Top have no effect there (a Grid child's size is managed by its cell), so
    // hide them for direct Grid children.
    const inGrid = parentTag === 'Grid';
    // The Anchor property: on a CANVAS it is WinForms-style free anchoring (keeps a fixed
    // distance from the anchored edges; opposite edges stretch). Inside a DOCKPANEL — e.g. a
    // Status Bar strip — a StatusDate/TextBlock has no Dock property of its own, so an edge
    // Anchor pins the control to that edge (the designer mirrors it as DockPanel.Dock). The
    // form's TOP-LEVEL layout DockPanel (its own parent is the window root) is where the
    // template docks the Menu bar / Status Bar / Body / SplitPanel — those structural bars are
    // not offered Anchor. Grid / StackPanel children are laid out by their panel, so Anchor is
    // not offered there either.
    const parentIsTopLayout = parentTag === 'DockPanel' && !!parentEl
        && parentEl.parentNode && (parentEl.parentNode as Node).nodeType === 1
        && /window|usercontrol|chrome/i.test(localName((parentEl.parentNode as Element).tagName));
    // TODO(anchor-everywhere): the user wants Anchor offered on EVERY control, not only Canvas /
    // non-structural-DockPanel children (asked 2026-09-19, deliberately deferred). Doing it properly
    // means (1) teaching resources/AnchorHelper.cs + .vb to track children of Grid/StackPanel/… too
    // (today they only handle `GetVisualParent() is Canvas` and `… is DockPanel`), and only then
    // (2) widening this gate — probably `!isRoot` like the dedicated GrumpyPanel anchor, minus the
    // top-level layout DockPanel whose children carry Dock instead. Do NOT just widen the row first:
    // an Anchor that compiles but does nothing is worse than no row.
    const anchorable = parentTag === 'Canvas' || (parentTag === 'DockPanel' && !parentIsTopLayout);

    const templates: PropTemplate[] = [
        ...COMMON_PROPS,
        ...(isWindowLike || HAS_FONT_PROPS.has(tag) ? FONT_PROPS : []),
        ...typeTemplates,
        // GrumpyPanel carries a DEDICATED 8-position Anchor that is offered wherever the panel
        // sits (non-root) — it replaces the generic Canvas/DockPanel-gated Anchor for the panel.
        ...(!isRoot && isGrumpyPanel ? GRUMPY_ANCHOR_PROPS : []),
        ...(!isRoot && !isGrumpyPanel && anchorable ? ANCHOR_PROPS : [])
    ].filter((t) =>
        // A control inside a Grid cell is positioned/sized by the Grid.
        !(inGrid && (t.key === 'DockPanel.Dock' || t.key === 'Canvas.Left' || t.key === 'Canvas.Top')) &&
        // A Line's size IS its Start/End geometry — Width/Height would clip it, not stretch it
        // (resize is done by dragging the selection handles, which scale the points instead).
        !(tag === 'Line' && (t.key === 'Width' || t.key === 'Height'))
    );
    const seen = new Set<string>();
    // Editor 'action' buttons the user reaches for most often (DataGrid Rows/Columns, SplitPanel
    // Split Layout/Splitters) are promoted to the TOP of the Properties list — above Name/Type and
    // the styling rows — so they're visible without scrolling.
    const topActions: PropDef[] = [];
    const props: PropDef[] = [
        { key: '__name__', label: 'Name', kind: 'text', value: el.getAttribute('x:Name') || el.getAttribute('Name') || '' },
        { key: '__type__', label: 'Type', kind: 'text', value: el.tagName },
        {
            key: '__theme__', label: 'Theme', kind: 'dropdown', options: ['System', 'Custom'],
            value: hasCustomColors(el) ? 'Custom' : 'System', advanced: false,
            desc: 'System: follow the OS theme (no fixed colours). Custom: use the colours you set below.'
        }
    ];
    // A StatusDate live clock (a TextBlock whose Loaded handler ticks a clock) offers beginner-
    // friendly Date/Time format pickers (System = OS format, or pick a shown example) + a preview.
    if (isStatusClock(el)) {
        props.push(
            {
                key: 'StatusDate.Date', label: 'Date Format', kind: 'dropdown', options: STATUS_CLOCK_CHOICES.date,
                value: statusClock?.date ?? STATUS_CLOCK_DEFAULT.date,
                desc: 'How the date is shown. "None (hidden)" hides the date, "System date" uses your OS date format, or pick an example for a fixed look.'
            },
            {
                key: 'StatusDate.Time', label: 'Time Format', kind: 'dropdown', options: STATUS_CLOCK_CHOICES.time,
                value: statusClock?.time ?? STATUS_CLOCK_DEFAULT.time,
                desc: 'How the time is shown. "None (hidden)" hides the time, "System time" uses your OS time, or pick an example for a fixed look.'
            },
            {
                key: 'StatusDate.Preview', label: 'Preview', kind: 'text',
                value: statusClock?.preview ?? '', readOnly: true,
                desc: 'A live sample of what the clock shows with these formats.'
            }
        );
    }
    for (const t of templates) {
        if (seen.has(t.key)) continue;
        seen.add(t.key);
        const d = KEY_DEFAULTS[t.key] || {};
        const isItemsSource = t.key === 'ItemsSource';
        props.push({
            key: t.key,
            label: t.label,
            kind: (d.kind ?? t.kind) as PropDef['kind'],
            // Note: xmldom's getAttribute returns '' (not null) for a missing attribute,
            // so use || (not ??) to fall through to the DEFAULTS map. Opacity is edited as
            // a percentage (0-100), so convert the stored 0-1 to 0-100. Dock is computed
            // from the element + parent so Fill (no attribute + last child) is shown, not "None".
            // ItemsSource: when the control is bound to a DataSet table, the binding lives in the
            // code-behind (not a XAML attribute) — show it read-only so the field isn't blank.
            value: t.key === 'Opacity'
                ? xamlToOpacity(el.getAttribute(t.key))
                : t.key === 'DockPanel.Dock'
                    ? dockValueFor(el)
                    : t.key === 'Angle'
                        ? rotateAngleFor(el)
                        : t.key === 'Radius'
                            // A Rectangle's single 'Corner Radius' is stored as RadiusX/RadiusY
                            // (always identical) — show the X value (DEFAULTS['RadiusX'] = '0').
                            ? (el.getAttribute('RadiusX') || DEFAULTS['RadiusX'] || '0')
                            : (isItemsSource && itemSourceOverride)
                                ? itemSourceOverride.value
                                : (el.getAttribute(t.key) || t.defaultValue || (effective && effective[t.key]) || DEFAULTS[t.key] || ''),
            options: d.options ?? t.options,
            unit: d.unit ?? t.unit,
            desc: (isItemsSource && itemSourceOverride && itemSourceOverride.desc)
                ? itemSourceOverride.desc
                : (d.desc ?? t.desc),
            advanced: ADVANCED_KEYS.has(t.key),
            readOnly: (isItemsSource && itemSourceOverride) ? itemSourceOverride.readOnly : undefined
        });
    }
    // 'Undo-Redo' (depth) for a DataGrid bound to a DataSet table — stored in the .adset,
    // not written to XAML (Avalonia's DataGrid has no such property).
    if (tag === 'DataGrid' && undoRedo) {
        props.push({
            key: 'UndoRedoDepth',
            label: 'Undo-Redo',
            kind: 'number',
            value: undoRedo.value,
            desc: 'Undo/redo depth for this grid\'s live row editing (Ctrl+U = undo, Ctrl+R = redo). 0 disables undo.'
        });
    }
    // 'Rows' + 'Columns' group a DataGrid's row/column decoration properties (row colour, text
    // colour, row height, grid lines, headers; column width, frozen columns, header height) into
    // two popup editors. These are direct Avalonia DataGrid attributes — no alternating row
    // colours (Avalonia's DataGrid has no alternation support). Shown at the TOP of the list.
    if (tag === 'DataGrid') {
        topActions.push({
            key: 'Rows',
            label: 'Rows',
            kind: 'button',
            value: 'Edit rows…',
            desc: 'Styles the data rows and the grid around them: row background, text colour, row height, row-header width, grid lines and their colours, and header visibility.'
        });
        topActions.push({
            key: 'Columns',
            label: 'Columns',
            kind: 'button',
            value: 'Edit columns…',
            desc: 'Styles the columns and headers: the default column width, minimum/maximum column width, frozen (pinned) columns and the header height.'
        });
    }
    // 'Data Selector' opens the data-source editor on EVERY chart: which source (Spreadsheet or Data
    // Files), the file it reads, and — for a spreadsheet — which PAGE of it. Shown at the TOP.
    if (isChartTag(tag)) {
        topActions.push({
            key: 'Data',
            label: 'Data Selector',
            kind: 'button',
            value: 'Select data…',
            desc: 'Chooses where this chart gets its data. **Spreadsheet** reads a page of an .xlsx '
                + 'workbook: pick the file, then the page from the list of its own sheet names (leave it '
                + 'on <first page> to keep reading the first sheet). **Data Files** is the place for data '
                + 'files such as CSVs — the file is remembered in the form, and the charts will start '
                + 'reading it when that reader lands.'
        });
    }
    // 'Series' opens the multi-series editor for either chart: one line per entry, each with its own
    // spreadsheet column(s), colour, line style and markers. A single-series chart needs no series
    // at all — the chart's own styling draws it — so opening the editor seeds one entry from those
    // values. Series can share the chart's axis (Common) or be scaled on their own (Per series).
    // Shown at the TOP of the list. The BAR and AREA charts draw their series as rectangles/fills
    // instead of lines, but they are the same series in every other way, so they get the same four
    // editors (their data comes from the X column's CATEGORY names). The WATERFALL's series are its
    // SAMPLESETS, so it gets the Series and Legend editors but no Axis one: its three axes are drawn in
    // projection and styled by the chart-level axis rows instead.
    if (isSeriesChartTag(tag)) {
        topActions.push({
            key: 'Series',
            label: 'Series',
            kind: 'button',
            value: 'Edit series…',
            desc: 'Adds, removes and reorders the lines this chart draws. Each series has its own '
                + 'spreadsheet column(s), colour, line style, markers and join setting, and either shares '
                + 'the chart\'s axis and columns (Common) or is scaled on its own (Per series).'
                + (tag === 'GrumpyWaterfallPlot'
                    ? ' **On a waterfall each entry is one SAMPLESET** — its own column, drawn further '
                    + 'back along the depth than the one before it, and named by its Title in the legend. '
                    + 'A capture of twenty sweeps is twenty entries, reading one column each.'
                    : '')
        });
        if (isCartesianChartTag(tag)) {
            topActions.push({
                key: 'Axis',
                label: 'Axis',
                kind: 'button',
                value: 'Edit axes…',
                desc: 'Sets up the chart\'s two common axes (where each one sits, its colour, ticks, tick '
                    + 'labels, name and font size) and gives any Per-series line its own X and/or Y axis. '
                    + 'A per-series axis can be deleted again to leave that side to the common axis.'
            });
        }
        topActions.push({
            key: 'Legend',
            label: 'Legend',
            kind: 'button',
            value: 'Edit legend…',
            desc: 'Sets the legend bar up: switch it on or off, choose which side it sits on (bottom, '
                + 'top, left or right — it wraps to fit its entries either way), its font size, and a '
                + 'frame with its own backcolour, outline and rounded corners. Each entry carries a '
                + 'tick box that switches that trace on and off. **Margin** adds space between the frame '
                + 'and the entries inside it, on all four sides, so a framed legend does not look cramped.'
        });
    }
    // 'Cursors' opens the cursor editor for the charts that HAVE cursors: the two line charts and the
    // area chart. The bar and the pie have none — a cursor reads a value BETWEEN two samples, a bar is
    // one reading per category, and the pie has no frame — so their right-click menu carries no cursor
    // entries either, and they report what is under the pointer in the readout panel instead.
    if (supportsCursors(tag)) {
        topActions.push({
            key: 'Cursors',
            label: 'Cursors',
            kind: 'button',
            value: 'Edit cursors…',
            desc: 'Adds up to two draggable cursors and sets each one up: which lines it draws '
                + '(vertical, horizontal or both), its dash style and colour, whether the crossing '
                + 'point follows the selected trace or is a free crosshair of your own, whether its '
                + 'readout shows the X value, the trace value or both, and where it sits. **A cursor '
                + 'that follows a trace is drawn in that series\' colour** (its own colour then applies '
                + 'to a free cursor only), so the line, the crossing and the readout all belong to the '
                + 'trace they read. The readout '
                + 'panel follows the mouse or sits in the chart\'s top right corner, and the number of '
                + 'decimals can be fixed. In the app: drag a cursor\'s line to move it (a following '
                + 'cursor slides along its trace), use the left and right arrows to step it one '
                + 'sample, up/down to pick the trace the readout reports, and right-click the chart '
                + 'for the cursor menu. With two cursors switched on, the readout also reports the '
                + 'distance between them (|ΔX| and |ΔY|).'
        });
    }
    // 'Slices' opens the pie's slice editor: one row per wedge (the names it draws, with the
    // palette colour each one would take), where a row can be re-coloured, pushed out of the pie
    // (Explode) or switched off. A slice row is an OVERRIDE for a wedge the data supplies.
    // The pie gets the Legend editor too (the legend lists the SLICES and its tick boxes switch
    // one off) but no Axis and no Cursors: it has no cartesian frame.
    if (tag === 'GrumpyPiePlot') {
        topActions.push({
            key: 'Slices',
            label: 'Slices',
            kind: 'button',
            value: 'Edit slices…',
            desc: 'Names the wedges that should differ from the palette: colour each one, push it out of '
                + 'the pie (Explode, in pixels) or switch it off. The rows start from the slice names the '
                + 'chart draws (its Labels, or the names column of its workbook), so an untouched slice '
                + 'keeps the palette colour shown beside it and no element is written for it at all. '
                + 'Slices are matched to the data by NAME.'
        });
        topActions.push({
            key: 'Legend',
            label: 'Legend',
            kind: 'button',
            value: 'Edit legend…',
            desc: 'Sets the legend bar up: switch it on or off, choose which side it sits on (bottom, '
                + 'top, left or right — it wraps to fit its entries either way), its font size, and a '
                + 'frame with its own backcolour, outline and rounded corners. On a pie the entries are '
                + 'the SLICES, in data order and in their own colours, and each one carries a tick box '
                + 'that switches that wedge off while the app runs.'
        });
    }
    // 'Items' (batch editor) for combo/list/items controls — opens a popup where you type
    // one item per line. Disabled when the items come from elsewhere (DataSet binding or an
    // ItemsSource attribute), since static item children would be ignored/conflict then.
    if (tag === 'ComboBox' || tag === 'ListBox' || tag === 'ItemsControl') {
        const itemsManagedElsewhere = !!itemSourceOverride || !!el.getAttribute('ItemsSource');
        props.push({
            key: 'Items',
            label: 'Items',
            kind: 'button',
            value: 'Edit items…',
            readOnly: itemsManagedElsewhere,
            desc: itemsManagedElsewhere
                ? 'Items are managed elsewhere (bound to a DataSet table or an ItemsSource) — not editable here.'
                : 'Opens the item editor: type one item per line. Each line becomes an item in the list.'
        });
    }
    // 'Rows & Columns' for a Grid — without row/column definitions a Grid is just a single
    // cell, so this editor is the key to actually using the control (novice-friendly).
    // Hidden for a SplitPanel (a Grid): its panes/splitters are managed by 'Split Layout'.
    if (tag === 'Grid' && !isSplitPanel) {
        props.push({
            key: 'Grid.Defs',
            label: 'Rows & Columns',
            kind: 'button',
            value: 'Edit rows & columns…',
            desc: 'Opens the grid editor: add or remove rows and columns and set each one\'s size (Auto = fit content, * = fill the leftover space, or a number like 100 for exact pixels).'
        });
    }
    // 'Menu Items' — a Menu bar is empty until it has top-level items. Opens the menu tree editor
    // where the bar's items are added/removed and each item's submenu is built (up to 5 levels).
    // 'Tree Items' — a TreeView's nodes ARE its content, and hand-writing nested <TreeViewItem>
    // elements is exactly where a novice gives up (2026-09-18). Opens the node editor: add child /
    // add sibling / delete / move in and out of nesting, with a Header and an "expanded" tick per
    // node. Anything the TreeView holds that the editor cannot represent is shown read-only and is
    // never rewritten — the element stays in the file, untouched.
    if (tag === 'TreeView') {
        props.push({
            key: 'TreeItems',
            label: 'Tree Items',
            kind: 'button',
            value: 'Edit tree nodes…',
            desc: 'Adds and removes the nodes of the tree and sets how they nest (up to 5 levels). '
                + 'Each node shows its Header; the tick sets whether it starts expanded. Everything else '
                + 'the TreeView holds — an ItemTemplate, a bound ItemsSource, a Styles block — appears as '
                + 'a read-only row and is left exactly as it is.'
        });
    }
    if (tag === 'Menu') {
        props.push({
            key: 'MenuItems',
            label: 'Menu Items',
            kind: 'button',
            value: 'Edit menu items…',
            desc: 'Adds/removes the items on the menu bar and builds each one\'s submenu (up to 5 levels deep). Kinds: Item, CheckBox, Radio, ComboBox (options) and Separator.'
        });
    }
    // 'Status Items' — the Status Bar tool inserts a DockPanel bar; this opens the editor that
    // adds/removes the items on the bar (each pinned LEFT or RIGHT, stretching to the bar height).
    if (isStatusBar) {
        props.push({
            key: 'StatusItems',
            label: 'Status Items',
            kind: 'button',
            value: 'Edit status items…',
            desc: 'Adds/removes the items shown on the status bar. Each item is pinned to the LEFT or RIGHT side of the bar and stretches to fill the bar\'s height. Kinds: TextBlock (label), TextBox, Button, ProgressBar, Separator (gap) and StatusDate (live clock).'
        });
    }
    // A SplitPanel (a Grid named SplitPanelN) gets a 'Split Layout' editor + a settable pane border.
    // Split Layout + Splitters are shown at the TOP of the list; Pane Border stays with the rows.
    if (isSplitPanel) {
        topActions.push({
            key: 'SplitLayout',
            label: 'Split Layout',
            kind: 'button',
            value: 'Edit split…',
            desc: 'Switches the split between Zones (two panes over a full-width one), Columns (side-by-side) and Rows (stacked) and adds/removes the panes. Runtime-draggable splitter bars are added automatically and existing pane contents are kept.'
        });
        topActions.push({
            key: 'Splitters',
            label: 'Splitters',
            kind: 'button',
            value: 'Edit splitters…',
            desc: 'Styles the draggable divider bars between the panes: each one\'s thickness, colour and whether it is visible at runtime.'
        });
        props.push({
            key: 'SplitPanelPaneBorder',
            label: 'Pane Border',
            kind: 'number',
            unit: 'px',
            value: splitPaneBorderOf(el),
            desc: 'Width of the border drawn around each pane of the split panel.'
        });
    }
    // A control placed inside a Grid can be moved to a specific cell.
    if (!isRoot && el.parentNode && (el.parentNode as Element).nodeType === 1
        && localName((el.parentNode as Element).tagName) === 'Grid') {
        const gridParent = el.parentNode as Element;
        const rows = gridDefinitionCount(gridParent, 'rows') || 1;
        const cols = gridDefinitionCount(gridParent, 'cols') || 1;
        const indices = (n: number) => Array.from({ length: n }, (_, i) => String(i));
        props.push({
            key: 'Grid.Row', label: 'Grid Row', kind: 'dropdown', options: indices(rows),
            value: el.getAttribute('Grid.Row') || '0',
            desc: 'Which row of the parent Grid this control sits in.'
        });
        props.push({
            key: 'Grid.Column', label: 'Grid Column', kind: 'dropdown', options: indices(cols),
            value: el.getAttribute('Grid.Column') || '0',
            desc: 'Which column of the parent Grid this control sits in.'
        });
    }
    // An Image in a Grid cell is auto-sized to its cell on every render (it follows the cell's
    // current size). The user can opt OUT so the Image keeps the size they set instead.
    if (tag === 'Image' && !isRoot && el.parentNode && (el.parentNode as Element).nodeType === 1
        && localName((el.parentNode as Element).tagName) === 'Grid') {
        props.push({
            key: 'AutoSizeToCell',
            label: 'Auto-size to Cell',
            kind: 'dropdown',
            options: BOOL,
            value: autoSizeOff ? 'False' : 'True',
            desc: 'Keep this Image sized to its Grid cell (follows the cell when it changes). Off = the Image keeps the size you set; the cell no longer resizes it.'
        });
    }
    return groupPropertyRows(topActions.concat(props));
}

/** Property rows NEVER offered for bulk multi-select editing: identity (name/type), things handled
 *  elsewhere (Undo-Redo lives in the .adset; ItemsSource can be a code-behind binding), docking and
 *  Grid-cell placement (bulk-setting these would move/stack the controls). Theme IS offered. */
export const MULTI_PROP_EXCLUDE = new Set([
    '__name__', '__type__', 'UndoRedoDepth', 'ItemsSource', 'DockPanel.Dock', 'Grid.Row', 'Grid.Column'
]);

/**
 * Builds the multi-select Properties rows for several selected elements: only keys EVERY element
 * supports — plain, editable XAML properties (no designer editor buttons, no read-only/bound rows,
 * no MULTI_PROP_EXCLUDE keys). A row's value is shown only when every selected element has the same
 * value; when they differ the row is empty and flagged `mixed`. Theme (System/Custom) is kept.
 */
export function multiCommonProps(els: Element[]): PropDef[] {
    if (els.length === 0) return [];
    const keep = (p: PropDef) => p.kind !== 'button' && !p.readOnly && !MULTI_PROP_EXCLUDE.has(p.key);
    const lists: PropDef[][] = els.map((el) => propertyDefsFor(el).filter(keep));
    const rows: PropDef[] = [];
    for (const d of lists[0]) {
        if (!lists.every((l) => l.some((x) => x.key === d.key))) continue; // intersection only
        const per = lists.map((l) => l.find((x) => x.key === d.key)!);
        const v0 = per[0].value ?? '';
        const same = per.every((x) => (x.value ?? '') === v0);
        rows.push({ ...per[0], value: same ? v0 : '', mixed: !same });
    }
    return groupPropertyRows(rows);
}
