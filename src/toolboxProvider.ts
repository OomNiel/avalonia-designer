import * as vscode from 'vscode';
import { controlInfoFor } from './controlInfo';

export interface ControlDefinition {
    label: string;
    tag: string;
    /**
     * The CONTROLS.md category this control belongs to (e.g. "Layout panels").
     * Used by the Toolbox tree to group controls into collapsible sections that
     * mirror the reference document.
     */
    group: string;
}

// Category headings — kept in sync with the ## sections of CONTROLS.md.
const TOOLBOX_CATEGORY_BUTTONS = 'Buttons & command controls';
const TOOLBOX_CATEGORY_INPUT = 'Input & text editors';
const TOOLBOX_CATEGORY_ITEMS = 'Items controls & lists';
const TOOLBOX_CATEGORY_LAYOUT = 'Layout panels';
const TOOLBOX_CATEGORY_SHAPES = 'Shapes';
const TOOLBOX_CATEGORY_DATA = 'Data & grid';
const TOOLBOX_CATEGORY_PROGRESS = 'Progress, status & misc';
const TOOLBOX_CATEGORY_BARS = 'Bars';
// GrumpyCharts — the bundled AvaloniaCharts control set (a line plot and an X,Y plot).
const TOOLBOX_CATEGORY_CHARTS = 'Charts';
// GrumpySheet — the bundled AvaloniaSpreadsheet control. Its own category because it is a
// document-shaped control rather than a field, a list or a chart.
const TOOLBOX_CATEGORY_SPREADSHEET = 'Spreadsheet';
const TOOLBOX_CATEGORY_DEV = 'Dev Helpers';

/**
 * The complete list of controls offered by the Toolbox sidebar. The order is
 * preserved for any consumer that iterates the catalog; the Toolbox tree itself
 * renders these grouped by `group` (see TOOLBOX_CATEGORIES below).
 */
const CONTROL_CATALOG: ControlDefinition[] = [
    { label: 'Button', tag: 'Button', group: TOOLBOX_CATEGORY_BUTTONS },
    { label: 'TextBox', tag: 'TextBox', group: TOOLBOX_CATEGORY_INPUT },
    { label: 'Label', tag: 'TextBlock', group: TOOLBOX_CATEGORY_INPUT },
    { label: 'ComboBox', tag: 'ComboBox', group: TOOLBOX_CATEGORY_BUTTONS },
    { label: 'ListBox', tag: 'ListBox', group: TOOLBOX_CATEGORY_ITEMS }, { label: 'ItemsControl', tag: 'ItemsControl', group: TOOLBOX_CATEGORY_ITEMS }, { label: 'CheckBox', tag: 'CheckBox', group: TOOLBOX_CATEGORY_BUTTONS },
    { label: 'RadioButton', tag: 'RadioButton', group: TOOLBOX_CATEGORY_BUTTONS },
    // ToggleSwitch: the on/off switch idiom (a CheckBox with a sliding track). Content is the label;
    // On/OffContent are what it shows in each state.
    { label: 'Toggle Switch', tag: 'ToggleSwitch', group: TOOLBOX_CATEGORY_BUTTONS },
    // --- Avalonia 12 controls (real tags saved; the 11 preview host draws approximations) ---
    { label: 'Hyperlink Button', tag: 'HyperlinkButton', group: TOOLBOX_CATEGORY_BUTTONS },
    { label: 'Command Bar', tag: 'CommandBar', group: TOOLBOX_CATEGORY_BUTTONS },
    { label: 'Command Bar Button', tag: 'CommandBarButton', group: TOOLBOX_CATEGORY_BUTTONS },
    { label: 'Command Bar Toggle Button', tag: 'CommandBarToggleButton', group: TOOLBOX_CATEGORY_BUTTONS },
    { label: 'Command Bar Separator', tag: 'CommandBarSeparator', group: TOOLBOX_CATEGORY_BUTTONS },
    { label: 'Image', tag: 'Image', group: TOOLBOX_CATEGORY_INPUT },
    // MaskedTextBox constrains typing to a mask (e.g. a phone number); NumericUpDown is a number box
    // with spinners; PathIcon draws an icon from path data (no image file needed).
    { label: 'Masked Text Box', tag: 'MaskedTextBox', group: TOOLBOX_CATEGORY_INPUT },
    { label: 'Numeric Up-Down', tag: 'NumericUpDown', group: TOOLBOX_CATEGORY_INPUT },
    { label: 'Path Icon', tag: 'PathIcon', group: TOOLBOX_CATEGORY_INPUT },
    // File / folder selection dialogs, as droppable controls (the bundled AvaloniaChrome.PathPicker:
    // a path row + a “…” Browse button that opens the platform's own dialog). Both tools insert the
    // same <chrome:PathPicker> element and differ only in PathType; set Path Type to SaveFile in the
    // Properties panel for a save-as dialog.
    { label: 'File Selector', tag: 'PathPicker', group: TOOLBOX_CATEGORY_INPUT },
    { label: 'Folder Selector', tag: 'PathPickerFolder', group: TOOLBOX_CATEGORY_INPUT },
    // GrumpyCharts (the bundled AvaloniaCharts set: dependency-free, self-drawing charts). The line
    // plot takes Y values in sample order (X runs 0…N-1); the X,Y plot takes (x,y) pairs and can be
    // markers only, joined, or both. The bar and area plots put one shape per point along a CATEGORY
    // axis (the X column's names when it holds text, numbers otherwise), grouped or stacked; the pie
    // is one wedge per labelled value, with an optional doughnut hole. All of them can read an .xlsx
    // workbook instead of an inline array.
    { label: 'Line Plot', tag: 'GrumpyLinePlot', group: TOOLBOX_CATEGORY_CHARTS },
    { label: 'X, Y Plot', tag: 'GrumpyXYPlot', group: TOOLBOX_CATEGORY_CHARTS },
    { label: 'Bar Chart', tag: 'GrumpyBarPlot', group: TOOLBOX_CATEGORY_CHARTS },
    { label: 'Area Chart', tag: 'GrumpyAreaPlot', group: TOOLBOX_CATEGORY_CHARTS },
    { label: 'Pie Chart', tag: 'GrumpyPiePlot', group: TOOLBOX_CATEGORY_CHARTS },
    // The waterfall (2026-09-22): successive SAMPLESETS drawn as 3D traces — samples across X, values
    // up Y, and each set receding along the depth — with the mesh that joins them. One series is one
    // sampleset, so a capture is one spreadsheet column per set.
    { label: 'Waterfall', tag: 'GrumpyWaterfallPlot', group: TOOLBOX_CATEGORY_CHARTS },
    // The surface chart 3D (2026-09-23): one spreadsheet column per slice along the sheet's length, joined
    // into a surface — mesh, mesh over solid, or solid, with a temperature ramp by height.
    { label: 'Surface Chart 3D', tag: 'GrumpySurfacePlot', group: TOOLBOX_CATEGORY_CHARTS },
    // GrumpySheet (2026-09-26): the bundled AvaloniaSpreadsheet control — a self-drawing spreadsheet,
    // 26 columns (A…Z) and 50 rows by default, with frozen headers, multi-cell selection, in-place
    // editing, drag-to-autofill and a formula bar. Its cells are typed in through the Cells editor in
    // the Properties panel, which writes them into the form as <spread:SheetCell> elements.
    { label: 'Spreadsheet', tag: 'GrumpySheet', group: TOOLBOX_CATEGORY_SPREADSHEET },
    { label: 'Panel', tag: 'Panel', group: TOOLBOX_CATEGORY_LAYOUT },
    { label: 'Grid', tag: 'Grid', group: TOOLBOX_CATEGORY_LAYOUT },
    { label: 'StackPanel', tag: 'StackPanel', group: TOOLBOX_CATEGORY_LAYOUT },
    { label: 'DockPanel', tag: 'DockPanel', group: TOOLBOX_CATEGORY_LAYOUT },
    { label: 'WrapPanel', tag: 'WrapPanel', group: TOOLBOX_CATEGORY_LAYOUT },
    { label: 'Group Box', tag: 'GroupBox', group: TOOLBOX_CATEGORY_LAYOUT },
    { label: 'SplitPanel', tag: 'SplitPanel', group: TOOLBOX_CATEGORY_LAYOUT },
    { label: 'Grumpy Panel', tag: 'GrumpyPanel', group: TOOLBOX_CATEGORY_LAYOUT },
    { label: 'TabControl', tag: 'TabControl', group: TOOLBOX_CATEGORY_ITEMS },
    // TreeView (2026-09-18): a real core control that was already in CONTROLS.md and in the event
    // catalogue, but had no Toolbox entry. It renders in the headless preview *for real* — no native
    // handle is involved (unlike a WebView, which cannot be previewed at all) — so what the designer
    // draws here is what the app shows. The host ships it with two starter nodes: `Header` is what a
    // TreeViewItem displays, and a node's children are its literal child items.
    { label: 'TreeView', tag: 'TreeView', group: TOOLBOX_CATEGORY_ITEMS },
    // --- Shapes ---
    { label: 'Line', tag: 'Line', group: TOOLBOX_CATEGORY_SHAPES },
    { label: 'Rectangle', tag: 'Rectangle', group: TOOLBOX_CATEGORY_SHAPES },
    { label: 'Ellipse', tag: 'Ellipse', group: TOOLBOX_CATEGORY_SHAPES },
    { label: 'Arc', tag: 'Arc', group: TOOLBOX_CATEGORY_SHAPES },
    // Polyline / Polygon are point-defined shapes (like Line): the Points list IS the shape. They ship
    // with Stretch="Fill" so the designer's resize box scales them.
    { label: 'Polyline', tag: 'Polyline', group: TOOLBOX_CATEGORY_SHAPES },
    { label: 'Polygon', tag: 'Polygon', group: TOOLBOX_CATEGORY_SHAPES },
    { label: 'DataGrid', tag: 'DataGrid', group: TOOLBOX_CATEGORY_DATA },
    { label: 'DataSet', tag: 'DataSet', group: TOOLBOX_CATEGORY_DATA },
    // --- Progress, status & misc (CONTROLS.md category) ---
    { label: 'ProgressBar', tag: 'ProgressBar', group: TOOLBOX_CATEGORY_PROGRESS },
    { label: 'Slider', tag: 'Slider', group: TOOLBOX_CATEGORY_PROGRESS },
    { label: 'Separator', tag: 'Separator', group: TOOLBOX_CATEGORY_PROGRESS },
    { label: 'Menu', tag: 'Menu', group: TOOLBOX_CATEGORY_BARS },
    { label: 'StatusBar', tag: 'StatusBar', group: TOOLBOX_CATEGORY_BARS },
    { label: 'StatusDate', tag: 'StatusDate', group: TOOLBOX_CATEGORY_BARS },
    { label: 'GrumpyStatus', tag: 'GrumpyStatus', group: TOOLBOX_CATEGORY_BARS },
    // --- Dev Helpers (design-time / debugging conveniences) ---
    { label: 'XY-Tracker', tag: 'XYTracker', group: TOOLBOX_CATEGORY_DEV },
    // Not a form control — a designer action: converts a Window's default title bar to the
    // bundled ChromeWindow custom title bar. Handled specially in the designer's drop handler.
    { label: 'Custom Title Bar', tag: 'CustomTitleBar', group: TOOLBOX_CATEGORY_BARS }
];

/**
 * The Toolbox categories, in display order. Mirrors the groups defined in
 * CONTROLS.md (only the categories that actually contain Toolbox controls are
 * shown). Each category becomes a collapsible section in the sidebar tree.
 */
export const TOOLBOX_CATEGORIES: { label: string; group: string }[] = [
    { label: TOOLBOX_CATEGORY_BUTTONS, group: TOOLBOX_CATEGORY_BUTTONS },
    { label: TOOLBOX_CATEGORY_INPUT, group: TOOLBOX_CATEGORY_INPUT },
    { label: TOOLBOX_CATEGORY_ITEMS, group: TOOLBOX_CATEGORY_ITEMS },
    { label: TOOLBOX_CATEGORY_LAYOUT, group: TOOLBOX_CATEGORY_LAYOUT },
    { label: TOOLBOX_CATEGORY_SHAPES, group: TOOLBOX_CATEGORY_SHAPES },
    { label: TOOLBOX_CATEGORY_SPREADSHEET, group: TOOLBOX_CATEGORY_SPREADSHEET },
    { label: TOOLBOX_CATEGORY_DATA, group: TOOLBOX_CATEGORY_DATA },
    { label: TOOLBOX_CATEGORY_PROGRESS, group: TOOLBOX_CATEGORY_PROGRESS },
    { label: TOOLBOX_CATEGORY_BARS, group: TOOLBOX_CATEGORY_BARS },
    { label: TOOLBOX_CATEGORY_CHARTS, group: TOOLBOX_CATEGORY_CHARTS },
    { label: TOOLBOX_CATEGORY_DEV, group: TOOLBOX_CATEGORY_DEV }
];

/** Returns the controls that belong to a CONTROLS.md category, in catalog order. */
export function controlsForGroup(group: string): ControlDefinition[] {
    return CONTROL_CATALOG.filter((c) => c.group === group);
}

export class ControlItem extends vscode.TreeItem {
    constructor(public readonly def: ControlDefinition) {
        super(def.label, vscode.TreeItemCollapsibleState.None);
        this.description = def.tag;
        if (def.tag === 'DataSet') {
            // The DataSet 'tool' is not a form control — clicking it opens the schema designer.
            this.tooltip = 'DataSet — design tables and columns visually, then generate a runtime DataSet class (.cs/.vb) + .xsd. Click to open the DataSet designer.';
            this.command = { command: 'avaloniaDesigner.newDataSet', title: 'New DataSet', arguments: [] };
            this.contextValue = 'dataSetTool';
        } else {
            const info = controlInfoFor(def.tag);
            this.tooltip = `${info.label} — ${info.desc} ${info.use}\nDrag onto the canvas to place it, or click the tool then click the canvas.`;
            this.command = {
                command: 'avaloniaDesigner.addFromToolbox',
                title: 'Add to Designer',
                arguments: [def]
            };
            this.contextValue = 'toolboxControl';
        }
    }
}

/**
 * A collapsible category header in the Toolbox tree. Category headers are not
 * draggable and have no command (clicking them only expands/collapses).
 */
export class CategoryItem extends vscode.TreeItem {
    constructor(public readonly category: { label: string; group: string }) {
        super(
            category.label,
            vscode.TreeItemCollapsibleState.Expanded
        );
        this.contextValue = 'toolboxCategory';
    }
}

type ToolboxItem = ControlItem | CategoryItem;

/**
 * Sidebar toolbox. Supports drag (via TreeDragAndDropController) into the
 * designer webview, and click-to-arm to add to the active designer.
 *
 * The Toolbox controls are divided into collapsible category sections that
 * mirror the ## sections of CONTROLS.md (Window roots, Buttons & command
 * controls, Input & text editors, Items controls & lists, Layout panels,
 * Shapes, Scrolling, Data & grid, Progress/status/misc, Bars). Only categories
 * that contain Toolbox controls are shown.
 */
export class ToolboxProvider implements vscode.TreeDataProvider<ToolboxItem>, vscode.TreeDragAndDropController<ToolboxItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<ToolboxItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    readonly dropMimeTypes: string[] = [];
    readonly dragMimeTypes: string[] = ['application/x-avalonia-control'];

    /**
     * Called when a control is lifted out of the toolbox, so the active
     * designer webview can be armed with it.
     *
     * VS Code deliberately does NOT bridge the MIME types added in `handleDrag`
     * into a webview ("Mime types added in handleDrag won't be available
     * outside the application"), so the native `drop` event in the canvas cannot
     * read the control's tag from `event.dataTransfer`. The tag is delivered to
     * the webview the same way click-to-place does — via an `armTool` message —
     * so a webview drop can place the armed control even though its dataTransfer
     * is empty (this is what makes dragging work on Linux/Xorg, where the native
     * bridge is the unreliable path). Wired by extension.ts.
     */
    armDesignerTool: ((tag: string) => void) | undefined;

    getTreeItem(element: ToolboxItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ToolboxItem): ToolboxItem[] {
        if (!element) {
            // Root: one collapsible category header per group.
            return TOOLBOX_CATEGORIES.map((c) => new CategoryItem(c));
        }
        if (element instanceof CategoryItem) {
            // Expand a category to reveal its controls.
            return controlsForGroup(element.category.group).map((d) => new ControlItem(d));
        }
        return [];
    }

    handleDrag(source: readonly ToolboxItem[], dataTransfer: vscode.DataTransfer): void {
        // Only actual control items are draggable; category headers and the DataSet
        // tool (which opens a designer instead of placing a control) are not.
        const first = source[0];
        if (first instanceof ControlItem && first.def.tag && first.def.tag !== 'DataSet') {
            dataTransfer.set('application/x-avalonia-control', new vscode.DataTransferItem(first.def.tag));
            // Arm the active designer with this control: the webview cannot read the
            // drag's MIME data (see armDesignerTool's docs), so it carries the tag on
            // the arm message instead and reads it back on drop.
            this.armDesignerTool?.(first.def.tag);
        }
    }

    async handleDrop(): Promise<void> {
        // Dropping onto the canvas is handled by the webview itself.
    }
}
