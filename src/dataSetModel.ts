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

export interface DataColumnSpec {
    name: string;        // column field name (identifier)
    type: ColumnType;
    caption: string;     // header shown in a grid (VS "Caption")
    allowNull: boolean;
    /** Sample value the user typed (null = use an automatic value). Used in the sample row
     *  that's added to the generated DataSet when the table is bound to a control. */
    sampleValue: string | null;
}

export interface DataTableSpec {
    name: string;
    x: number;
    y: number;
    columns: DataColumnSpec[];
    /** Name of the bindable control this table is bound to (null = unbound). */
    boundTo: string | null;
    /** Kind of the bound control ('DataGrid' enables live add/edit/delete grid support). */
    boundToType?: 'DataGrid' | 'ListBox' | 'ComboBox' | 'ItemsControl' | null;
    /** Undo/redo depth for the bound grid's live editing (default 5; 0 disables undo). */
    undoRedoDepth?: number;
}

export interface DataSetSpec {
    version: number;
    name: string;        // dataset name (also the generated class name)
    tables: DataTableSpec[];
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

/** A fresh table (not yet added) with a unique name + a starter Id column. */
export function newTableSpec(spec: DataSetSpec): DataTableSpec {
    const names = new Set(spec.tables.map((t) => t.name.toLowerCase()));
    let i = spec.tables.length + 1;
    let name = `Table${i}`;
    while (names.has(name.toLowerCase())) { i++; name = `Table${i}`; }
    return { name, x: 40, y: 40, columns: [{ name: 'Id', type: 'Int32', caption: 'ID', allowNull: false, sampleValue: null }], boundTo: null, boundToType: null, undoRedoDepth: 5 };
}

/** A fresh column (not yet added) with a unique name inside `table`. */
export function newColumnSpec(table: DataTableSpec): DataColumnSpec {
    const names = new Set(table.columns.map((c) => c.name.toLowerCase()));
    let i = table.columns.length + 1;
    let name = `Column${i}`;
    while (names.has(name.toLowerCase())) { i++; name = `Column${i}`; }
    return { name, type: 'String', caption: name, allowNull: true, sampleValue: null };
}

/** Finds a table by name (case-insensitive). */
export function findTable(spec: DataSetSpec, name: string): DataTableSpec | undefined {
    return spec.tables.find((t) => t.name === name);
}

/**
 * Parses .adset JSON into a validated spec. Missing fields get sane defaults so a
 * hand-edited or older file still opens.
 */
export function parseDataSet(text: string): DataSetSpec {
    let raw: any;
    try {
        raw = JSON.parse(text);
    } catch {
        raw = {};
    }
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
                undoRedoDepth: typeof t.undoRedoDepth === 'number' && t.undoRedoDepth > 0 ? t.undoRedoDepth : (t.undoRedoDepth === 0 ? 0 : 5)
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
                        sampleValue: typeof c.sampleValue === 'string' && c.sampleValue ? c.sampleValue : null
                    });
                }
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
                ...(c.sampleValue ? { sampleValue: c.sampleValue } : {})
            })),
            ...(t.boundTo ? { boundTo: t.boundTo } : {}),
            ...(t.boundTo && t.boundToType ? { boundToType: t.boundToType } : {}),
            ...(t.undoRedoDepth !== undefined && t.undoRedoDepth !== 5 ? { undoRedoDepth: t.undoRedoDepth } : {})
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
