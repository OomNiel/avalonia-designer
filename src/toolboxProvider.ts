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
const TOOLBOX_CATEGORY_BARS = 'Bars';

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
    { label: 'Image', tag: 'Image', group: TOOLBOX_CATEGORY_INPUT },
    { label: 'Panel', tag: 'Panel', group: TOOLBOX_CATEGORY_LAYOUT },
    { label: 'Grid', tag: 'Grid', group: TOOLBOX_CATEGORY_LAYOUT },
    { label: 'StackPanel', tag: 'StackPanel', group: TOOLBOX_CATEGORY_LAYOUT },
    { label: 'DockPanel', tag: 'DockPanel', group: TOOLBOX_CATEGORY_LAYOUT },
    { label: 'WrapPanel', tag: 'WrapPanel', group: TOOLBOX_CATEGORY_LAYOUT },
    { label: 'SplitPanel', tag: 'SplitPanel', group: TOOLBOX_CATEGORY_LAYOUT },
    { label: 'TabControl', tag: 'TabControl', group: TOOLBOX_CATEGORY_ITEMS },
    // --- Shapes ---
    { label: 'Line', tag: 'Line', group: TOOLBOX_CATEGORY_SHAPES },
    { label: 'Rectangle', tag: 'Rectangle', group: TOOLBOX_CATEGORY_SHAPES },
    { label: 'Ellipse', tag: 'Ellipse', group: TOOLBOX_CATEGORY_SHAPES },
    { label: 'Arc', tag: 'Arc', group: TOOLBOX_CATEGORY_SHAPES },
    { label: 'DataGrid', tag: 'DataGrid', group: TOOLBOX_CATEGORY_DATA },
    { label: 'DataSet', tag: 'DataSet', group: TOOLBOX_CATEGORY_DATA },
    { label: 'Menu', tag: 'Menu', group: TOOLBOX_CATEGORY_BARS },
    { label: 'StatusBar', tag: 'StatusBar', group: TOOLBOX_CATEGORY_BARS },
    { label: 'StatusDate', tag: 'StatusDate', group: TOOLBOX_CATEGORY_BARS },
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
    { label: TOOLBOX_CATEGORY_DATA, group: TOOLBOX_CATEGORY_DATA },
    { label: TOOLBOX_CATEGORY_BARS, group: TOOLBOX_CATEGORY_BARS }
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
            this.tooltip = `${info.label} — ${info.desc} ${info.use}\nClick the tool, then click the canvas to place it.`;
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
 * designer webview, and double-click / click-to-arm to add to the active
 * designer.
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
        }
    }

    async handleDrop(): Promise<void> {
        // Dropping onto the canvas is handled by the webview itself.
    }
}
