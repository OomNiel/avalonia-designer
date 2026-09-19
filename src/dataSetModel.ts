/**
 * DataSet schema model for the .adset designer.
 *
 * This is a RUNTIME-CONSTRUCTION DataSet designer (not VS's strongly-typed
 * codegen): the user designs tables + columns visually; the generator emits a
 * small C#/VB class that builds the DataSet at runtime (DataTables/DataColumns),
 * plus an .xsd for interop/documentation.
 */

export type ColumnType =
    | 'String' | 'Int32' | 'Int64' | 'Double' | 'Decimal'
    | 'Boolean' | 'DateTime' | 'Guid' | 'Byte[]';

export const COLUMN_TYPES: ColumnType[] = [
    'String', 'Int32', 'Int64', 'Double', 'Decimal', 'Boolean', 'DateTime', 'Guid', 'Byte[]'
];

/** Friendly labels for the column-type dropdown. */
export const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
    String: 'Text (String)',
    Int32: 'Whole number (Integer)',
    Int64: 'Long integer (Long)',
    Double: 'Decimal number (Double)',
    Decimal: 'Money / exact decimal (Decimal)',
    Boolean: 'True/False (Boolean)',
    DateTime: 'Date & time (DateTime)',
    Guid: 'Unique ID (Guid)',
    'Byte[]': 'Binary data (Byte[])'
};

/** C# type name used in generated code. */
export function csType(t: ColumnType): string {
    switch (t) {
        case 'String': return 'string';
        case 'Int32': return 'int';
        case 'Int64': return 'long';
        case 'Double': return 'double';
        case 'Decimal': return 'decimal';
        case 'Boolean': return 'bool';
        case 'DateTime': return 'DateTime';
        case 'Guid': return 'Guid';
        case 'Byte[]': return 'byte[]';
    }
}

/** VB type name used in generated code. */
export function vbType(t: ColumnType): string {
    switch (t) {
        case 'String': return 'String';
        case 'Int32': return 'Integer';
        case 'Int64': return 'Long';
        case 'Double': return 'Double';
        case 'Decimal': return 'Decimal';
        case 'Boolean': return 'Boolean';
        case 'DateTime': return 'DateTime';
        case 'Guid': return 'Guid';
        case 'Byte[]': return 'Byte()';
    }
}

/** XSD xs: type name used in the generated .xsd. */
export function xsType(t: ColumnType): string {
    switch (t) {
        case 'String': return 'xs:string';
        case 'Int32': return 'xs:int';
        case 'Int64': return 'xs:long';
        case 'Double': return 'xs:double';
        case 'Decimal': return 'xs:decimal';
        case 'Boolean': return 'xs:boolean';
        case 'DateTime': return 'xs:dateTime';
        case 'Guid': return 'xs:string';
        case 'Byte[]': return 'xs:base64Binary';
    }
}

/** What a column MEANS when its table is bound to a TreeView (asked 2026-09-18). */
export type TreeColumnRole =
    /** The node's text (what the tree shows). One per table. */
    | 'name'
    /** The node's identity, referenced by `parent`. Optional: without it, rows are matched by
     *  array order... which is what `parent` uses when there is no id column. */
    | 'id'
    /** A self-referencing column: this row's parent's `id` (a classic parent/child table). */
    | 'parent'
    /** A level or path column (`Level` = 0,1,2 … or `Path` = `1.2.3`), for tables that describe a
     *  hierarchy by depth or by a coded path instead of by parent references. */
    | 'level';

export interface DataColumnSpec {
    name: string;        // column field name (identifier)
    type: ColumnType;
    caption: string;     // header shown in a grid (VS "Caption")
    allowNull: boolean;
    /** Sample value the user typed (null = use an automatic value). Used in the sample row
     *  that's added to the generated DataSet when the table is bound to a control. */
    sampleValue: string | null;
    /** Role this column plays when the table is bound to a **TreeView** (null/absent = an ordinary
     *  data column). A tree needs a `name` column plus either a `parent` column (self-referencing
     *  table) or a `level` column (depth / dotted path). */
    role?: TreeColumnRole | null;
}

/** A form Image control that shows the image file stored in one of this table's TEXT columns for the
 *  currently-selected row of the table's bound DataGrid. `gridName` is the bound DataGrid control
 *  (normally this table's boundTo); the binding lives here (not as a XAML Image.Source) because the
 *  value is a per-row file path loaded at runtime. `column` must be a String column of this table. */
export interface BoundImageRef {
    control: string; // the Image control's x:Name (in the same form as the DataGrid)
    column: string;  // this table's TEXT column holding the absolute image-file path
}

export interface DataTableSpec {
    name: string;
    x: number;
    y: number;
    columns: DataColumnSpec[];
    /** Name of the bindable control this table is bound to (null = unbound). */
    boundTo: string | null;
    /** Kind of the bound control ('DataGrid' enables live add/edit/delete grid support;
     *  'TreeView' binds it to a hierarchy built from this table's `role` columns). */
    boundToType?: 'DataGrid' | 'ListBox' | 'ComboBox' | 'ItemsControl' | 'TreeView' | null;
    /** Undo/redo depth for the bound grid's live editing (default 5; 0 disables undo). */
    undoRedoDepth?: number;
    /** Name of the column used as the table's primary key (single-key identity; null = none,
     *  SQLite then falls back to its internal rowid). */
    keyColumn?: string | null;
    /** SQLite storage for this table. When set, the table's rows live in a SQLite database file
     *  instead of the sample/XML store (per-table data source). null = current behaviour.
     *  `tableName` is the real table name INSIDE that .db (imports that were renamed, e.g.
     *  Customers → Customers2, still read/write the original Customers table). */
    sqlite?: { file: string; connectionString?: string; tableName?: string } | null;
    /** Image controls (elsewhere on the same form) that follow this table's bound DataGrid selection
     *  and show the image file referenced by one of this table's String columns. */
    boundImages?: BoundImageRef[];
    /** Read-only controls (ComboBox / ListBox / ItemsControl) that FOLLOW this table: they display one
     *  String column of the rows the bound DataGrid shows, live (the generated code binds their
     *  ItemsSource to a `ColumnFollower` built from the grid's row collection). A control may not
     *  own a table *and* follow one. */
    followers?: FollowerRef[];
}

export interface DataSetSpec {
    version: number;
    name: string;        // dataset name (also the generated class name)
    tables: DataTableSpec[];
}

/** The table's image (Image follows the bound DataGrid selection) bindings. */
export function boundImagesOf(t: DataTableSpec): BoundImageRef[] {
    return t.boundImages ?? [];
}

/** A read-only control that follows this table's bound DataGrid (see `followers`). */
export interface FollowerRef {
    control: string; // the ComboBox / ListBox / ItemsControl x:Name
    type: string;    // its control type, so the generated code can be re-checked
    column: string;  // the String column whose values it lists
}

/** The read-only controls that follow this table. */
export function followersOf(t: DataTableSpec): FollowerRef[] {
    return t.followers ?? [];
}

/** True if `s` is a usable code identifier (letters/digits/underscore, not starting with a digit). */
export function isValidIdentifier(s: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
}

/** Turns an arbitrary string into a valid identifier (underscores for invalid chars). */
export function sanitizeName(s: string): string {
    const cleaned = s.replace(/[^A-Za-z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
    return cleaned || 'DataSet';
}

/** A fresh table (not yet added) with a unique name + a starter Id column (flagged as the key). */
export function newTableSpec(spec: DataSetSpec): DataTableSpec {
    const names = new Set(spec.tables.map((t) => t.name.toLowerCase()));
    let i = spec.tables.length + 1;
    let name = `Table${i}`;
    while (names.has(name.toLowerCase())) { i++; name = `Table${i}`; }
    return { name, x: 40, y: 40, columns: [{ name: 'Id', type: 'Int32', caption: 'ID', allowNull: false, sampleValue: null }], keyColumn: 'Id', boundTo: null, boundToType: null, undoRedoDepth: 5 };
}

/** A fresh column (not yet added) with a unique name inside `table`. */
export function newColumnSpec(table: DataTableSpec): DataColumnSpec {
    const names = new Set(table.columns.map((c) => c.name.toLowerCase()));
    let i = table.columns.length + 1;
    let name = `Column${i}`;
    while (names.has(name.toLowerCase())) { i++; name = `Column${i}`; }
    return { name, type: 'String', caption: name, allowNull: true, sampleValue: null };
}

/** True when the table's data source is a SQLite database file (opt-in per table). */
export function isSqliteTable(t: DataTableSpec): boolean {
    return !!t.sqlite && !!t.sqlite.file;
}

/** The name of the table INSIDE the SQLite file (an import may have renamed the .adset table to
 *  avoid a clash, but the database table keeps its original name). Defaults to the spec name. */
/** Every role a TreeView-bound column may have, in the order the editor offers them. */
export const TREE_COLUMN_ROLES: TreeColumnRole[] = ['name', 'id', 'parent', 'level'];

/** The columns of `t` that carry a tree role, by role (a missing role is simply absent). */
export function treeRoles(t: DataTableSpec): Partial<Record<TreeColumnRole, string>> {
    const out: Partial<Record<TreeColumnRole, string>> = {};
    for (const c of t.columns) {
        if (c.role && !out[c.role]) out[c.role] = c.name;
    }
    return out;
}

/**
 * Whether a table can be bound to a TreeView: it needs a node text and a shape — a parent column
 * (self-referencing) or a level/path column. Checked in the editor before an offer is made, and
 * again by the generator, so a hand-edited `.adset` cannot produce code that cannot compile.
 */
export function canBindToTree(t: DataTableSpec): boolean {
    // A TreeView only needs node text. A parent column needs an id to look the parent up by, and a
    // level/path column describes the depth — with neither, the rows are still worth showing as a flat list
    // of root nodes, which is the ordinary case for a table like Id/Name/Image (2026-09-19: a user with
    // exactly that table could not bind at all). Declared once here so the editor, the generator and the
    // preview cannot each invent their own rule.
    return !!treeRoles(t).name;
}

export function sqliteTableName(t: DataTableSpec): string {
    return (t.sqlite && t.sqlite.tableName) || t.name;
}

/** The table's primary-key column spec (flagged via `keyColumn`), if one exists and is a column. */
export function keyColumnOf(t: DataTableSpec): DataColumnSpec | undefined {
    if (!t.keyColumn) return undefined;
    return t.columns.find((c) => c.name === t.keyColumn);
}

/** Finds a table by name (case-insensitive). */
export function findTable(spec: DataSetSpec, name: string): DataTableSpec | undefined {
    return spec.tables.find((t) => t.name === name);
}

/** Outcome of a checked `.adset` read. A set `error` means the file did NOT parse as a .adset and
 *  the returned spec is a recovery — callers must not write it back over the user's file. */
export interface DataSetParseResult {
    spec: DataSetSpec;
    error?: string;
}

/** JSON-level read: separates "could not parse at all" from "parsed but incomplete". */
function parseRaw(text: string): { raw: any; error?: string } {
    if (!String(text ?? '').trim()) return { raw: {}, error: 'the file is empty' };
    let raw: any;
    try {
        raw = JSON.parse(text);
    } catch (e) {
        return { raw: {}, error: `not valid JSON (${e instanceof Error ? e.message : String(e)})` };
    }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return { raw: {}, error: 'the top level is not a JSON object' };
    }
    if (raw.tables !== undefined && !Array.isArray(raw.tables)) {
        return { raw: {}, error: '"tables" is not an array' };
    }
    return { raw };
}

/**
 * Parses .adset JSON into a validated spec. Missing fields get sane defaults so a
 * hand-edited or older file still opens.
 *
 * Deliberately lenient: callers that only READ a schema (bindings, the grid follower, the
 * code-behind check) are content with best-effort defaults. Use `parseDataSetChecked` anywhere the
 * result could be written back.
 */
export function parseDataSet(text: string): DataSetSpec {
    return buildSpec(parseRaw(text).raw);
}

/**
 * Like `parseDataSet`, but also reports whether the file actually parsed.
 *
 * A half-written or hand-broken `.adset` used to open as a valid-looking default schema ("DataSet"
 * with no tables) and the next Save/Generate wrote that recovery over the user's file — silent data
 * loss. The DataSet editor keeps this error, tells the user, and refuses to save until the file is
 * fixed or deleted.
 */
export function parseDataSetChecked(text: string): DataSetParseResult {
    const { raw, error } = parseRaw(text);
    return { spec: buildSpec(raw), error };
}

/** Validates one raw .adset object into a spec (shared by both entry points). */
function buildSpec(raw: any): DataSetSpec {
    const name = sanitizeName(typeof raw.name === 'string' && raw.name ? raw.name : 'DataSet');
    const spec: DataSetSpec = { version: 1, name, tables: [] };
    if (Array.isArray(raw.tables)) {
        for (const t of raw.tables) {
            if (!t || typeof t !== 'object') continue;
            const tName = sanitizeName(typeof t.name === 'string' && t.name ? t.name : 'Table');
            const table: DataTableSpec = {
                name: tName,
                x: typeof t.x === 'number' ? t.x : 40,
                y: typeof t.y === 'number' ? t.y : 40,
                columns: [],
                boundTo: typeof t.boundTo === 'string' && t.boundTo ? t.boundTo : null,
                boundToType: typeof t.boundToType === 'string' && t.boundToType ? t.boundToType as DataTableSpec['boundToType'] : null,
                undoRedoDepth: typeof t.undoRedoDepth === 'number' && t.undoRedoDepth > 0 ? t.undoRedoDepth : (t.undoRedoDepth === 0 ? 0 : 5),
                keyColumn: typeof t.keyColumn === 'string' && t.keyColumn ? t.keyColumn : null
            };
            if (Array.isArray(t.columns)) {
                for (const c of t.columns) {
                    if (!c || typeof c !== 'object') continue;
                    const cName = sanitizeName(typeof c.name === 'string' && c.name ? c.name : 'Column');
                    const type = (COLUMN_TYPES as string[]).includes(c.type) ? c.type as ColumnType : 'String';
                    table.columns.push({
                        name: cName,
                        type,
                        caption: typeof c.caption === 'string' ? c.caption : cName,
                        allowNull: c.allowNull !== false,
                        sampleValue: typeof c.sampleValue === 'string' && c.sampleValue ? c.sampleValue : null,
                        role: TREE_COLUMN_ROLES.includes(c.role) ? c.role as TreeColumnRole : null
                    });
                }
            }
            // The key column must actually exist (guard against hand-edited files).
            if (!table.columns.some((c) => c.name === table.keyColumn)) table.keyColumn = null;
            if (t.sqlite && typeof t.sqlite === 'object' && typeof t.sqlite.file === 'string' && t.sqlite.file) {
                table.sqlite = {
                    file: t.sqlite.file,
                    connectionString: typeof t.sqlite.connectionString === 'string' && t.sqlite.connectionString ? t.sqlite.connectionString : undefined,
                    tableName: typeof t.sqlite.tableName === 'string' && t.sqlite.tableName ? t.sqlite.tableName : undefined
                };
            } else {
                table.sqlite = null;
            }
            // Image controls that follow this grid's selection and show a file path from a String column.
            if (Array.isArray(t.boundImages)) {
                const imgs: BoundImageRef[] = [];
                for (const b of t.boundImages) {
                    if (b && typeof b === 'object'
                        && typeof b.control === 'string' && b.control
                        && typeof b.column === 'string' && b.column) {
                        imgs.push({ control: b.control, column: b.column });
                    }
                }
                if (imgs.length) table.boundImages = imgs;
            }
            // Read-only controls that follow this table (ComboBox/ListBox/ItemsControl).
            if (Array.isArray(t.followers)) {
                const fw: FollowerRef[] = [];
                for (const f of t.followers) {
                    if (f && typeof f === 'object'
                        && typeof f.control === 'string' && f.control
                        && typeof f.column === 'string' && f.column) {
                        fw.push({
                            control: f.control,
                            type: typeof f.type === 'string' && f.type ? f.type : 'ComboBox',
                            column: f.column
                        });
                    }
                }
                if (fw.length) table.followers = fw;
            }
            if (table.columns.length === 0) {
                table.columns.push({ name: 'Id', type: 'Int32', caption: 'ID', allowNull: false, sampleValue: null });
            }
            spec.tables.push(table);
        }
    }
    if (spec.tables.length === 0) {
        spec.tables.push(newTableSpec(spec));
    }
    return spec;
}

/** Serializes the spec to pretty .adset JSON (null boundTo / sampleValue are omitted). */
export function serializeDataSet(spec: DataSetSpec): string {
    const plain = {
        version: spec.version,
        name: spec.name,
        tables: spec.tables.map((t) => ({
            name: t.name,
            x: t.x,
            y: t.y,
            columns: t.columns.map((c) => ({
                name: c.name,
                type: c.type,
                caption: c.caption,
                allowNull: c.allowNull,
                ...(c.sampleValue ? { sampleValue: c.sampleValue } : {}),
                // The tree role decides how a bound TreeView is shaped, so it has to survive the round-trip
                // like every other column fact (2026-09-19: it was read but never written, so a role set in
                // the editor was gone by the next load and the bind was refused as "no shape yet").
                ...(c.role ? { role: c.role } : {})
            })),
            ...(t.boundTo ? { boundTo: t.boundTo } : {}),
            ...(t.boundTo && t.boundToType ? { boundToType: t.boundToType } : {}),
            ...(t.undoRedoDepth !== undefined && t.undoRedoDepth !== 5 ? { undoRedoDepth: t.undoRedoDepth } : {}),
            ...(t.keyColumn ? { keyColumn: t.keyColumn } : {}),
            ...(t.sqlite && t.sqlite.file ? { sqlite: { file: t.sqlite.file, ...(t.sqlite.connectionString ? { connectionString: t.sqlite.connectionString } : {}), ...(t.sqlite.tableName ? { tableName: t.sqlite.tableName } : {}) } } : {}),
            ...(t.boundImages && t.boundImages.length ? { boundImages: t.boundImages } : {}),
            ...(t.followers && t.followers.length ? { followers: t.followers } : {})
        }))
    };
    return JSON.stringify(plain, null, 2) + '\n';
}

/** The default starter schema ("a pre-defined DataTable" as requested). */
export function defaultDataSetSpec(name: string): DataSetSpec {
    return {
        version: 1,
        name: sanitizeName(name),
        tables: [
            {
                name: 'Customers',
                x: 40,
                y: 40,
                boundTo: null,
                undoRedoDepth: 5,
                keyColumn: 'Id',
                columns: [
                    { name: 'Id', type: 'Int32', caption: 'ID', allowNull: false, sampleValue: null },
                    { name: 'Name', type: 'String', caption: 'Customer', allowNull: false, sampleValue: null },
                    { name: 'Email', type: 'String', caption: 'Email', allowNull: true, sampleValue: null },
                    { name: 'CreatedAt', type: 'DateTime', caption: 'Created', allowNull: true, sampleValue: null }
                ]
            }
        ]
    };
}
