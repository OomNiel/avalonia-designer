import { localName } from './xamlModel';

/**
 * Property descriptions for the designer's Properties panel.
 * Verified against the real Avalonia 11.0.10 assemblies (reflection dump of
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
const DOCK_OPTIONS = ['None', 'Fill', 'Left', 'Top', 'Right', 'Bottom'];
const CLICK_MODE = ['Release', 'Press', 'Hover'];
const LINE_CAPS = ['Flat', 'Round', 'Square'];
const SCROLLBAR = ['Disabled', 'Auto', 'Hidden', 'Visible'];
const SELECTION_MODE = ['Single', 'Multiple', 'Extended', 'Toggle'];
const HEADERS_VIS = ['All', 'Column', 'Row', 'None'];
const GRIDLINES = ['All', 'Horizontal', 'Vertical', 'None'];
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
    'TabControl', 'TabItem', 'DataGrid', 'Menu', 'StatusBar', 'ScrollViewer', 'UserControl', 'Window'
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
        { key: 'HeadersVisibility', label: 'Headers', kind: 'dropdown', options: HEADERS_VIS },
        { key: 'GridLinesVisibility', label: 'Grid Lines', kind: 'dropdown', options: GRIDLINES },
        { key: 'FrozenColumnCount', label: 'Frozen Columns', kind: 'number' },
        { key: 'RowHeight', label: 'Row Height', kind: 'number' },
        { key: 'RowHeaderWidth', label: 'Row Header Width', kind: 'number' },
        { key: 'ColumnWidth', label: 'Column Width', kind: 'text' },
        { key: 'SelectedIndex', label: 'Selected Index', kind: 'number' },
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
    { key: 'TitleBarIcon', label: 'Title Bar Icon', kind: 'file' }
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
    Header: { desc: 'Header (label) shown on the tab strip for a TabItem.' },
    Content: { desc: 'Text (or content) displayed in the control.' },
    Text: { desc: 'Text content of the control.' },
    PlaceholderText: { desc: 'Hint text shown while the field is empty.' },
    PasswordChar: { desc: 'Character used to hide password input.' },
    GroupName: { desc: 'Radio buttons sharing a group name act as a single group.' },
    Command: { desc: 'Command to execute when the control is triggered.' },
    CommandParameter: { desc: 'Parameter passed to the Command.' },
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
    'MaxDropDownHeight', 'WrapSelection', 'IsTextSearchEnabled',
    'AutoGenerateColumns', 'CanUserReorderColumns', 'CanUserResizeColumns', 'CanUserSortColumns',
    'FrozenColumnCount', 'HeadersVisibility', 'GridLinesVisibility', 'ColumnWidth', 'RowHeight', 'RowHeaderWidth',
    'ShowActivated', 'Topmost', 'SizeToContent', 'ExtendClientAreaToDecorationsHint'
]);

/**
 * Avalonia's default value for each property key (in XAML form).
 *
 * These are used to (a) display the framework default in the Properties panel
 * when the attribute is absent on the element, and (b) strip attributes that the
 * user sets back to their default (keeping the saved XAML clean).
 *
 * Avalonia 11.0.10 defaults. Opaque (Opacity 1 → display 100 %) is in XAML form here;
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
    AutoGenerateColumns: 'True',
    CanUserReorderColumns: 'True',
    CanUserResizeColumns: 'True',
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

/**
 * Builds the property list for a control element: common layout/state props,
 * font props (where the type supports them), then type-specific props.
 * Custom Window-derived roots (e.g. `chrome:ChromeWindow`) are treated as a Window
 * so all form-manipulation properties (Title, size, CanResize, position, ...) appear.
 */
export function propertyDefsFor(
    el: Element,
    effective?: Record<string, string>,
    itemSourceOverride?: { value: string; readOnly: boolean; desc?: string },
    /** 'Undo-Redo' depth for a DataGrid bound to a DataSet table (stored in the .adset, not XAML). */
    undoRedo?: { value: string },
    /** True when this Image opted OUT of dynamic Grid-cell auto-sizing (stored in the extension, not XAML). */
    autoSizeOff?: boolean
): PropDef[] {
    const tag = localName(el.tagName);
    const name = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
    // The Status Bar tool inserts a Border (Avalonia has no StatusBar control); its
    // generated name (StatusBar1, ...) identifies it so the StatusBar properties
    // (including Dock) show instead of only the generic Border ones.
    const isStatusBar = /^StatusBar\d*$/.test(name);
    const isWindowLike = tag === 'Window' || /window$/i.test(tag);

    const typeTemplates: PropTemplate[] = isWindowLike
        ? [
            ...(CONTROL_PROPS['Window'] || []),
            ...(tag === 'ChromeWindow' ? CHROME_WINDOW_PROPS : [])
        ]
        : [
            ...(isStatusBar ? (CONTROL_PROPS['StatusBar'] || []) : []),
            ...(CONTROL_PROPS[tag] || [])
        ];

    // Only non-root elements can anchor to a container (the root element is the
    // window/UserControl itself).
    const isRoot = !el.parentNode || (el.parentNode as Node).nodeType !== 1;

    // A control inside a Grid cell is positioned/sized by the Grid — DockPanel.Dock and
    // Canvas.Left/Top have no effect there (a Grid child's size is managed by its cell), so
    // hide them for direct Grid children.
    const inGrid = !isRoot && el.parentNode && (el.parentNode as Element).nodeType === 1
        && localName((el.parentNode as Element).tagName) === 'Grid';

    const templates: PropTemplate[] = [
        ...COMMON_PROPS,
        ...(isWindowLike || HAS_FONT_PROPS.has(tag) ? FONT_PROPS : []),
        ...typeTemplates,
        ...(isRoot ? [] : ANCHOR_PROPS)
    ].filter((t) =>
        // A control inside a Grid cell is positioned/sized by the Grid.
        !(inGrid && (t.key === 'DockPanel.Dock' || t.key === 'Canvas.Left' || t.key === 'Canvas.Top')) &&
        // A Line's size IS its Start/End geometry — Width/Height would clip it, not stretch it
        // (resize is done by dragging the selection handles, which scale the points instead).
        !(tag === 'Line' && (t.key === 'Width' || t.key === 'Height'))
    );
    const seen = new Set<string>();
    const props: PropDef[] = [
        { key: '__name__', label: 'Name', kind: 'text', value: el.getAttribute('x:Name') || el.getAttribute('Name') || '' },
        { key: '__type__', label: 'Type', kind: 'text', value: el.tagName },
        {
            key: '__theme__', label: 'Theme', kind: 'dropdown', options: ['System', 'Custom'],
            value: hasCustomColors(el) ? 'Custom' : 'System', advanced: false,
            desc: 'System: follow the OS theme (no fixed colours). Custom: use the colours you set below.'
        }
    ];
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
    if (tag === 'Grid') {
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
    if (tag === 'Menu') {
        props.push({
            key: 'MenuItems',
            label: 'Menu Items',
            kind: 'button',
            value: 'Edit menu items…',
            desc: 'Adds/removes the items on the menu bar and builds each one\'s submenu (up to 5 levels deep). Kinds: Item, CheckBox, Radio, ComboBox (options) and Separator.'
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
    return props;
}
