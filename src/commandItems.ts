/* The Grumpy Command Bar's ITEMS: the real Avalonia children that sit in the bar's named row, not
 * attributes — so the ordinary property round-trip never touches them. Everything that reads or
 * writes them lives here; the designer panel turns it into messages, the tests drive it directly.
 *
 * WHY A MODULE OF ITS OWN. The failure this file exists to prevent is SILENT. The bar is a chrome
 * Border whose Child is a StackPanel named `{bar}Items`; an item written with the wrong tag (a
 * `TextBlock` for a Text Box), a caption put in `Content` on a TextBlock, an icon whose `Data` is not
 * escaped, or a row that is not a StackPanel at all — every one of those still compiles and still
 * draws, with items missing or wrong. The names are pinned against resources/GrumpyCommandBar.{cs,vb}
 * and the host snippet in the T2 test.
 *
 * THE SHAPE, decided with the user on 2026-09-29 (see the control's own file header for the full story):
 *
 *   <chrome:GrumpyCommandBar x:Name="bar1" Height="36" Padding="8,0">
 *     <StackPanel x:Name="bar1Items" Orientation="Horizontal" Spacing="6">
 *       <TextBlock x:Name="lbl1" Text="Name:" VerticalAlignment="Center"/>
 *       <TextBox x:Name="txt1" Width="140" VerticalAlignment="Center"/>
 *       <Button x:Name="btn1" Content="Save" VerticalAlignment="Center"/>
 *       <Border x:Name="sep1" Width="1" Height="18" Background="#FF808080" VerticalAlignment="Center"/>
 *       <ToggleButton x:Name="tgl1" Content="Bold" VerticalAlignment="Center"/>
 *       <RadioButton x:Name="rad1" Content="Left" GroupName="al" VerticalAlignment="Center"/>
 *       <Button x:Name="ico1" VerticalAlignment="Center">
 *         <PathIcon Data="M…" Width="16" Height="16"/>
 *       </Button>
 *     </StackPanel>
 *   </chrome:GrumpyCommandBar>
 *
 * An icon button is a Button that contains a `<PathIcon>` (a built-in icon we ship) or an `<Image>`
 * (a file the user picked, copied into the project's `Assets` folder and referenced as `avares://…`),
 * optionally with a `<TextBlock>` caption beside it. That is the whole vocabulary — every item is an
 * ordinary Avalonia control, so it focuses, types, checks and clicks for real at runtime.
 *
 * Wire formats (designer ↔ webview):
 *   properties message:  commandInfo = { row, items: commandItemsOf(model, el) }
 *   save items:          { type:'saveCommands', name, items:[{ kind, name, text, … }] }
 */
import { XamlModel, localName } from './xamlModel';

/** The bundled AvaloniaChrome command bar — the replacement for Avalonia's withheld CommandBar family. */
export const COMMAND_BAR_TAGS = ['GrumpyCommandBar'];

/** The prefix and CLR namespace a form needs to use the bar (the twin of `spread`/`charts`). */
export const COMMAND_BAR_PREFIX = 'chrome';
export const COMMAND_BAR_XMLNS = 'using:AvaloniaChrome';

export function isCommandBarTag(tag: string): boolean {
    return COMMAND_BAR_TAGS.includes(tag);
}

/** The row the items sit in: a direct child StackPanel, named `{bar}Items` by the designer. */
export const COMMAND_ROW_SUFFIX = 'Items';
export const COMMAND_ROW_SPACING_DEFAULT = 6;

/** The separator an item uses: a thin Border, because Avalonia's own Separator carries a theme margin. */
export const SEPARATOR_WIDTH = '1';
export const SEPARATOR_HEIGHT = '18';
export const SEPARATOR_COLOR = '#FF808080';

/**
 * The marker that says an item is a CHILD — an entry that belongs to the item in front of it, shown
 * in the bar after its parent and indented in the Items Editor.
 *
 * It lives in `Classes`, which is what Avalonia has for exactly this: a settable, space-separated list
 * of names on a control, carrying no behaviour of its own and colliding with no real property (the
 * form's own `<Separator Classes="MenuBarDivider"/>` uses the same idea). The depth is IN the name —
 * `cmdChild` for the first level, `cmdChild2` for the second — so a child of a child keeps its place,
 * and the fact survives every round-trip through the editor.
 *
 * The INDENT (a left `Margin`) is what makes the hierarchy visible in the bar; it is written alongside
 * the class and removed with it, so the two never disagree. Nothing creates a child on its own: a bar
 * whose items came from a Menu (see the item editor's own rules) keeps them, and the depth is
 * preserved — never quietly flattened — by every edit and save.
 */
export const COMMAND_CHILD_CLASS_PREFIX = 'cmdChild';

/** How far one level of child indents an item, in pixels. */
export const COMMAND_CHILD_INDENT = 12;

/** The `Classes` name for a child at `depth` (1 = a menu's submenu entry). */
export function commandChildClass(depth: number): string {
    return depth <= 1 ? COMMAND_CHILD_CLASS_PREFIX : `${COMMAND_CHILD_CLASS_PREFIX}${depth}`;
}

/** The left `Margin` a child at `depth` carries — what indents it in the bar. */
export function commandChildIndent(depth: number): string {
    return `${COMMAND_CHILD_INDENT * Math.max(1, depth)},0,0,0`;
}

/** The child depth an element carries: 0 for a top-level item, 1+ for a child. */
export function commandChildDepth(el: Element): number {
    const classes = (el.getAttribute('Classes') || '').split(/\s+/).filter((c) => c.length > 0);
    for (const cls of classes) {
        const m = /^cmdChild(\d*)$/.exec(cls);
        if (m) return m[1] ? Math.max(1, parseInt(m[1], 10) || 1) : 1;
    }
    return 0;
}

/** The default size of an icon inside an icon button, in pixels. */
export const ICON_DEFAULT_SIZE = 16;

export type CommandItemKind =
    | 'Label' | 'TextBox' | 'Button' | 'Separator' | 'ToggleButton' | 'RadioButton' | 'IconButton';

export interface CommandItemKindInfo {
    kind: CommandItemKind;
    /** What the drop-down shows. */
    label: string;
    /** The Avalonia type written into the form. */
    tag: string;
    /** Where the caption goes: TextBlock's Text, or a Content-capable control's Content. */
    caption: 'Text' | 'Content' | 'none';
    /** The caption a brand-new item starts with. */
    captionDefault: string;
    /** True when the item can carry an icon (only Button and IconButton). */
    icon: boolean;
    /** True when the item needs a radio GroupName. */
    group: boolean;
    /** The event the editor offers for it ('' when it has none worth offering). */
    event: string;
    /** A sentence for the editor's help line. */
    hint: string;
}

/**
 * The seven item kinds, in the order the drop-down lists them. `Label` is a `TextBlock` (Avalonia has
 * no Label control) and a `Separator` is a Border, because the themed Separator's own margin would
 * shift it off the row; both are pinned by the T2 test against what the host and the twins accept.
 */
export const COMMAND_ITEM_KINDS: CommandItemKindInfo[] = [
    {
        kind: 'Label', label: 'Label', tag: 'TextBlock', caption: 'Text', captionDefault: 'Label:',
        icon: false, group: false, event: '',
        hint: 'Read-only text in the bar — a caption for the item beside it.'
    },
    {
        kind: 'TextBox', label: 'Text Box', tag: 'TextBox', caption: 'Text', captionDefault: '',
        icon: false, group: false, event: 'TextChanged',
        hint: 'An editable field. Its width is usually set; its height follows its own theme minimum.'
    },
    {
        kind: 'Button', label: 'Button', tag: 'Button', caption: 'Content', captionDefault: 'Button',
        icon: true, group: false, event: 'Click',
        hint: 'A push button. Give it a Click event and the handler is written into the code-behind.'
    },
    {
        kind: 'Separator', label: 'Separator', tag: 'Border', caption: 'none', captionDefault: '',
        icon: false, group: false, event: '',
        hint: 'A thin vertical rule between groups of items.'
    },
    {
        kind: 'ToggleButton', label: 'Toggle Button', tag: 'ToggleButton', caption: 'Content', captionDefault: 'Toggle',
        icon: true, group: false, event: 'IsCheckedChanged',
        hint: 'A button that stays down — a Bold/Italic style switch.'
    },
    {
        kind: 'RadioButton', label: 'Radio Button', tag: 'RadioButton', caption: 'Content', captionDefault: 'Option',
        icon: false, group: true, event: 'IsCheckedChanged',
        hint: 'One of a set: items sharing a Group name are mutually exclusive.'
    },
    {
        kind: 'IconButton', label: 'Icon Button', tag: 'Button', caption: 'Content', captionDefault: '',
        icon: true, group: false, event: 'Click',
        hint: 'A button whose face is an icon — a built-in one, or an image file from this machine.'
    }
];

export function itemKindInfo(kind: string): CommandItemKindInfo | undefined {
    return COMMAND_ITEM_KINDS.find((k) => k.kind === kind);
}

/** One item, as the editor and the model exchange it. Every field is a string because that is what
 *  XAML holds: `''` means "not set", which is exactly "leave the attribute off". */
export interface CommandItem {
    kind: CommandItemKind;
    name: string;
    text: string;
    width: string;
    height: string;
    /** 0 for a top-level item, 1+ when it is a CHILD — an entry that belongs to the item in front of
     *  it (`Classes="cmdChild"` in the XAML, and the indent that goes with it). */
    child: number;
    /** A name from COMMAND_ICONS, or ''. */
    icon: string;
    /** An `avares://…` URI when the icon came from a file the user picked; takes precedence. */
    iconFile: string;
    /** Icon size in pixels ('' = ICON_DEFAULT_SIZE). */
    iconSize: string;
    /** RadioButton group name. */
    group: string;
    /** The event attribute on the element ('Click', 'IsCheckedChanged', 'TextChanged', or ''). */
    event: string;
    /** The handler method the event names ('btn1_Click', or ''). */
    handler: string;
}

/** The built-in icon set: a name, a label and the PathIcon geometry. Small, filled-outline shapes that
 *  read at 16 px, drawn from the same "M…" vocabulary the Path Icon tool uses. */
export const COMMAND_ICONS: { name: string; label: string; data: string }[] = [
    { name: 'save', label: 'Save', data: 'M2,2 L12,2 L14,4 L14,14 L2,14 Z M5,2 L5,7 L11,7 L11,2 Z M5,10 L11,10 L11,14 L5,14 Z' },
    { name: 'open', label: 'Open folder', data: 'M2,4 L7,4 L9,7 L15,7 L15,13 L2,13 Z' },
    { name: 'print', label: 'Print', data: 'M5,2 L12,2 L12,6 L5,6 Z M3,7 L14,7 L14,12 L3,12 Z M5,12 L12,12 L12,15 L5,15 Z' },
    { name: 'cut', label: 'Cut', data: 'M4,12 L14,2 M4,3 L14,13 M3,14 A2,2 0 1 1 3,10 A2,2 0 1 1 3,14 M13,14 A2,2 0 1 1 13,10 A2,2 0 1 1 13,14' },
    { name: 'copy', label: 'Copy', data: 'M3,2 L10,2 L10,10 L3,10 Z M6,6 L13,6 L13,14 L6,14 Z' },
    { name: 'paste', label: 'Paste', data: 'M5,2 L11,2 L11,4 L5,4 Z M3,4 L13,4 L13,15 L3,15 Z' },
    { name: 'undo', label: 'Undo', data: 'M6,5 L3,8 L6,11 M3,8 L11,8 A4,4 0 0 1 11,15' },
    { name: 'redo', label: 'Redo', data: 'M10,5 L13,8 L10,11 M13,8 L5,8 A4,4 0 0 0 5,15' },
    { name: 'settings', label: 'Settings', data: 'M8,5 A3,3 0 1 1 8,11 A3,3 0 1 1 8,5 M8,1 L8,4 M8,12 L8,15 M1,8 L4,8 M12,8 L15,8' },
    { name: 'search', label: 'Search', data: 'M7,2 A5,5 0 1 1 7,12 A5,5 0 1 1 7,2 M11,11 L15,15' },
    { name: 'add', label: 'Add', data: 'M8,2 L8,14 M2,8 L14,8' },
    { name: 'remove', label: 'Remove', data: 'M2,8 L14,8' },
    { name: 'refresh', label: 'Refresh', data: 'M13,8 A5,5 0 1 1 8,3 M11,1 L11,5 L15,5' },
    { name: 'play', label: 'Play', data: 'M4,2 L13,8 L4,14 Z' },
    { name: 'stop', label: 'Stop', data: 'M3,3 L13,3 L13,13 L3,13 Z' },
    { name: 'back', label: 'Back', data: 'M8,2 L2,8 L8,14 M2,8 L15,8' },
    { name: 'forward', label: 'Forward', data: 'M8,2 L14,8 L8,14 M14,8 L1,8' },
    { name: 'up', label: 'Up', data: 'M2,8 L8,2 L14,8 M8,2 L8,15' },
    { name: 'down', label: 'Down', data: 'M2,8 L8,14 L14,8 M8,14 L8,1' },
    { name: 'home', label: 'Home', data: 'M2,8 L8,2 L14,8 M4,8 L4,15 L12,15 L12,8' },
    { name: 'info', label: 'Info', data: 'M8,2 A6,6 0 1 1 8,14 A6,6 0 1 1 8,2 M8,7 L8,11 M8,5 L8,6' },
    { name: 'warning', label: 'Warning', data: 'M8,2 L15,14 L1,14 Z M8,6 L8,10 M8,12 L8,13' },
    { name: 'exit', label: 'Exit', data: 'M8,2 L8,8 M3,4 A6,6 0 1 0 13,4' }
];

export function commandIconData(name: string): string | undefined {
    return COMMAND_ICONS.find((i) => i.name === name)?.data;
}

/**
 * The name prefix each item kind gets when the designer auto-names it — `btn1`, `txt2`, `ico3`.
 * The Items Editor's own "Add" uses the same table (media/designer.js `CMD_NAME_PREFIX`), so an item
 * written by the designer and one added by hand are named by ONE rule; the T2 test pins the two
 * copies together, because a drift here shows up only as two items that claim the same name.
 */
export const COMMAND_ITEM_NAME_PREFIX: Record<CommandItemKind, string> = {
    Label: 'lbl', TextBox: 'txt', Button: 'btn', Separator: 'sep',
    ToggleButton: 'tgl', RadioButton: 'rad', IconButton: 'ico'
};

/** The element children of `el`, as elements (never text/comments). */
function childElements(el: Element): Element[] {
    const out: Element[] = [];
    for (let n: Node | null = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 1) out.push(n as Element);
    }
    return out;
}

/** Escapes text for an attribute value. Path data carries commas and spaces but never quotes; a
 *  caption the user typed very well might, and an unescaped `"` would break the whole form. */
function esc(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The bar's item row: the direct child StackPanel, when there is one. */
export function commandRow(barEl: Element): Element | undefined {
    return childElements(barEl).find((k) => localName(k.tagName) === 'StackPanel');
}

/** The row's name for a bar — `{bar}Items`, the same `{name}Body` convention GrumpyPanel uses. */
export function commandRowName(barEl: Element): string {
    const name = barEl.getAttribute('x:Name') || barEl.getAttribute('Name') || 'GrumpyCommandBar';
    return `${name}${COMMAND_ROW_SUFFIX}`;
}

/**
 * The bar's item row, created (and named) when the form has none yet — a bar typed by hand without the
 * wrapper is still editable, and the first save through the editor gives it the row the snippet writes.
 */
export function ensureCommandRow(model: XamlModel, barEl: Element): Element {
    const found = commandRow(barEl);
    if (found) {
        if (!found.getAttribute('x:Name') && !found.getAttribute('Name')) {
            found.setAttribute('x:Name', commandRowName(barEl));
        }
        return found;
    }
    const row = model.createElement(`<StackPanel x:Name="${esc(commandRowName(barEl))}" `
        + `Orientation="Horizontal" Spacing="${COMMAND_ROW_SPACING_DEFAULT}"/>`);
    // The row must be the bar's Child, and a Border shows its first child — so an existing child that
    // is NOT a row (a stray control, or an older shape of this markup) is MOVED INTO the new row rather
    // than thrown away: the user put it there, and it is still an item.
    const existing = childElements(barEl);
    if (existing.length === 0) {
        barEl.appendChild(row);
        return row;
    }
    barEl.insertBefore(row, existing[0]);
    for (const kid of existing) {
        barEl.removeChild(kid);
        row.appendChild(kid);
    }
    return row;
}

/** The kind an existing element inside the row represents, or undefined when it is not one of ours
 *  (a control the user dropped in by hand — kept, and shown as "Other" in the editor). */
export function kindOfElement(el: Element): CommandItemKind | undefined {
    switch (localName(el.tagName)) {
        case 'TextBlock': return 'Label';
        case 'TextBox': return 'TextBox';
        case 'ToggleButton': return 'ToggleButton';
        case 'RadioButton': return 'RadioButton';
        case 'Border': return 'Separator';
        case 'Button': {
            const kids = childElements(el);
            const hasIcon = kids.some((k) => localName(k.tagName) === 'PathIcon' || localName(k.tagName) === 'Image')
                || kids.some((k) => childElements(k).some((g) => localName(g.tagName) === 'PathIcon'
                    || localName(g.tagName) === 'Image'));
            return hasIcon ? 'IconButton' : 'Button';
        }
        default: return undefined;
    }
}

/** The event attribute an item carries, and the handler it names. */
function eventOf(el: Element): { event: string; handler: string } {
    for (const event of ['Click', 'IsCheckedChanged', 'TextChanged']) {
        const handler = el.getAttribute(event);
        if (handler) return { event, handler };
    }
    return { event: '', handler: '' };
}

/** The icon an icon button carries: a built-in PathIcon's `Data`, or an Image's `Source`. */
function iconOf(el: Element): { icon: string; iconFile: string; iconSize: string } {
    const holders = childElements(el);
    for (const kid of [...holders, ...holders.flatMap((k) => childElements(k))]) {
        const tag = localName(kid.tagName);
        if (tag === 'PathIcon') {
            const data = kid.getAttribute('Data') || '';
            const builtin = COMMAND_ICONS.find((i) => i.data === data);
            return {
                icon: builtin ? builtin.name : '',
                iconFile: '',
                iconSize: kid.getAttribute('Width') || ''
            };
        }
        if (tag === 'Image') {
            return { icon: '', iconFile: kid.getAttribute('Source') || '', iconSize: kid.getAttribute('Width') || '' };
        }
    }
    return { icon: '', iconFile: '', iconSize: '' };
}

/** The caption of an item: a plain control's `Text`, or a `Content`-capable control's `Content`. */
function captionOf(el: Element): string {
    const tag = localName(el.tagName);
    if (tag === 'TextBlock' || tag === 'TextBox') return el.getAttribute('Text') || '';
    if (tag === 'Button' || tag === 'ToggleButton' || tag === 'RadioButton') {
        const own = el.getAttribute('Content');
        if (own) return own;
        // An icon button's caption sits in a TextBlock beside the icon.
        const text = childElements(el).flatMap((k) => [k, ...childElements(k)])
            .find((k) => localName(k.tagName) === 'TextBlock');
        return text ? (text.getAttribute('Text') || '') : '';
    }
    return '';
}

/**
 * Reads the bar's items back out of the form. Elements that are not one of the seven kinds are still
 * returned — as `kind` '' — so the editor can show them instead of silently dropping them on save.
 */
export function commandItemsOf(_model: XamlModel, barEl: Element): (CommandItem & { other?: string })[] {
    const row = commandRow(barEl);
    if (!row) return [];
    const items: (CommandItem & { other?: string })[] = [];
    for (const el of childElements(row)) {
        const kind = kindOfElement(el);
        const name = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
        if (!kind) {
            items.push({
                kind: 'Label', name, text: '', width: '', height: '', icon: '', iconFile: '', iconSize: '',
                child: commandChildDepth(el),
                group: '', event: '', handler: '', other: localName(el.tagName)
            });
            continue;
        }
        const icon = iconOf(el);
        const ev = eventOf(el);
        items.push({
            kind,
            name,
            text: captionOf(el),
            width: el.getAttribute('Width') || '',
            height: el.getAttribute('Height') || '',
            icon: icon.icon,
            iconFile: icon.iconFile,
            iconSize: icon.iconSize,
            child: commandChildDepth(el),
            group: el.getAttribute('GroupName') || '',
            event: ev.event,
            handler: ev.handler
        });
    }
    return items;
}

/** The markup for one item. Built as a small XAML string and handed to the model, which parses it —
 *  the same way the toolbox snippets are made. */
function markupFor(info: CommandItemKindInfo, item: CommandItem): string {
    const name = esc(item.name);
    const text = esc(item.text);
    // A CHILD item is marked where Avalonia keeps names of things: `Classes="cmdChild"` carries the
    // fact (and the depth), the left Margin makes it read as indented in the bar. Both are written
    // here so a child item added by the editor is marked exactly like a seeded one.
    const child = item.child > 0;
    const mark = child ? ` Classes="${esc(commandChildClass(item.child))}" Margin="${esc(commandChildIndent(item.child))}"` : '';
    switch (info.kind) {
        case 'Separator':
            return `<Border x:Name="${name}" Width="${esc(item.width || SEPARATOR_WIDTH)}" `
                + `Height="${esc(item.height || SEPARATOR_HEIGHT)}" Background="${SEPARATOR_COLOR}" `
                + `VerticalAlignment="Center"${mark}/>`;
        case 'TextBox':
            return `<TextBox x:Name="${name}" Text="${text}" VerticalAlignment="Center"${mark}/>`;
        case 'Label':
            return `<TextBlock x:Name="${name}" Text="${text}" VerticalAlignment="Center"${mark}/>`;
        case 'RadioButton':
            return `<RadioButton x:Name="${name}" Content="${text}" GroupName="${esc(item.group)}" `
                + `VerticalAlignment="Center"${mark}/>`;
        case 'ToggleButton':
            return `<ToggleButton x:Name="${name}" Content="${text}" VerticalAlignment="Center"${mark}/>`;
        default: {
            // Button and Icon Button: an icon, a caption, or both.
            const size = esc(item.iconSize || String(ICON_DEFAULT_SIZE));
            const iconMarkup = item.iconFile
                ? `<Image Source="${esc(item.iconFile)}" Width="${size}" Height="${size}"/>`
                : (() => {
                    const data = commandIconData(item.icon);
                    return data ? `<PathIcon Data="${esc(data)}" Width="${size}" Height="${size}"/>` : '';
                })();
            if (!iconMarkup) return `<Button x:Name="${name}" Content="${text}" VerticalAlignment="Center"${mark}/>`;
            if (!item.text) return `<Button x:Name="${name}" VerticalAlignment="Center"${mark}>${iconMarkup}</Button>`;
            return `<Button x:Name="${name}" VerticalAlignment="Center"${mark}><StackPanel Orientation="Horizontal" `
                + `Spacing="4">${iconMarkup}<TextBlock Text="${text}" VerticalAlignment="Center"/></StackPanel></Button>`;
        }
    }
}

/**
 * Replaces the bar's items with `items`, in order. Existing elements are REUSED by name where the kind
 * still matches (so an item keeps anything the designer knows about it — its floor bookkeeping, and its
 * place in the XAML), and rebuilt when the kind changed. Elements of a kind this model does not know are
 * left where they are, at the end: a control the user dropped into the bar by hand is not ours to delete.
 */
export function writeCommandItems(model: XamlModel, barEl: Element, items: unknown[]): void {
    const row = ensureCommandRow(model, barEl);
    const before = childElements(row);
    const other = before.filter((el) => kindOfElement(el) === undefined);
    for (const el of before) row.removeChild(el);

    for (const raw of items) {
        const item = normaliseItem(raw);
        if (!item) continue;
        const info = itemKindInfo(item.kind);
        if (!info) continue;
        const element = model.createElement(markupFor(info, item));
        // Sizes AFTER the name is set: `writeSize` looks the control's own floor up BY NAME (the preview
        // frame reports one per control), and it is what writes the companion minimum that makes a
        // height smaller than the control's theme minimum actually stick.
        if (item.name) element.setAttribute('x:Name', item.name);
        // An EMPTY size means "auto" — leave whatever the markup itself set (a Separator's 1×18, a
        // button's natural width). `writeSize('')` is the Properties panel's "clear the row" gesture:
        // it REMOVES the attribute, which for a separator would leave a Border with no size at all.
        if (item.width !== '') model.writeSize(element, 'Width', item.width);
        if (item.height !== '') model.writeSize(element, 'Height', item.height);
        if (item.event && item.handler) element.setAttribute(item.event, item.handler);
        row.appendChild(element);
    }
    for (const el of other) row.appendChild(el);
}

/** One item from the webview message, with every field a string and a kind we know. */
function normaliseItem(raw: unknown): CommandItem | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const r = raw as Record<string, unknown>;
    const kind = String(r.kind ?? '');
    if (!itemKindInfo(kind)) return undefined;
    const str = (v: unknown, fallback = ''): string => (v === undefined || v === null ? fallback : String(v));
    const info = itemKindInfo(kind)!;
    return {
        kind: kind as CommandItemKind,
        name: str(r.name),
        text: info.caption === 'none' ? '' : str(r.text, info.captionDefault),
        width: str(r.width),
        height: str(r.height),
        icon: str(r.icon),
        iconFile: str(r.iconFile),
        iconSize: str(r.iconSize),
        // The depth is a NUMBER on the wire: anything not a positive integer is a top-level item.
        child: Math.max(0, Math.min(8, Math.floor(Number(r.child)) || 0)),
        group: info.group ? str(r.group) : '',
        event: str(r.event),
        handler: str(r.handler)
    };
}

/** A one-line summary for the Commands row, e.g. "3 items — Label, Text Box, Button". */
export function commandItemSummary(items: readonly (CommandItem & { other?: string })[]): string {
    if (items.length === 0) return 'No items yet';
    const parts = items.map((i) => (i.other ? `${i.other} (other)` : (itemKindInfo(i.kind)?.label ?? i.kind)));
    return `${items.length} item${items.length === 1 ? '' : 's'} — ${parts.join(', ')}`;
}
