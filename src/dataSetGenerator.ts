/**
 * Code generation for the DataSet designer: a runtime-construction class
 * (C# or VB.NET) that builds the DataSet, plus a standard .xsd schema file.
 */
import { DataSetSpec, DataTableSpec, DataColumnSpec, csType, vbType, xsType } from './dataSetModel';

function escCs(s: string): string { return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
function escVb(s: string): string { return s.replace(/"/g, '""'); }
function escXml(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/** C# literal for a column's sample value (falls back to a sensible type default). */
function csSampleValue(c: DataColumnSpec): string {
    const sv = c.sampleValue ? c.sampleValue.trim() : '';
    switch (c.type) {
        case 'String': return `"${escCs(sv || 'Sample')}"`;
        case 'Int32': { const n = parseInt(sv, 10); return Number.isFinite(n) ? String(n) : '0'; }
        case 'Int64': { const n = parseInt(sv, 10); return Number.isFinite(n) ? `${n}L` : '0L'; }
        case 'Double': {
            if (sv) { const n = Number(sv); if (Number.isFinite(n)) { let t = String(n); if (!t.includes('.') && !t.includes('e') && !t.includes('E')) t += '.0'; return t; } }
            return '0.0';
        }
        case 'Decimal': {
            if (sv) { const n = Number(sv); if (Number.isFinite(n)) return `${n}m`; }
            return '0m';
        }
        case 'Boolean': return /^(true|1)$/i.test(sv) ? 'true' : 'false';
        case 'DateTime': return sv ? `DateTime.Parse("${escCs(sv)}")` : 'DateTime.Now';
        case 'Guid': return sv ? `Guid.Parse("${escCs(sv)}")` : 'Guid.NewGuid()';
        case 'Byte[]': return 'Array.Empty<byte>()';
    }
}

/** VB literal for a column's sample value (falls back to a sensible type default). */
function vbSampleValue(c: DataColumnSpec): string {
    const sv = c.sampleValue ? c.sampleValue.trim() : '';
    switch (c.type) {
        case 'String': return `"${escVb(sv || 'Sample')}"`;
        case 'Int32': { const n = parseInt(sv, 10); return Number.isFinite(n) ? String(n) : '0'; }
        case 'Int64': { const n = parseInt(sv, 10); return Number.isFinite(n) ? `${n}L` : '0L'; }
        case 'Double': {
            if (sv) { const n = Number(sv); if (Number.isFinite(n)) { let t = String(n); if (!t.includes('.') && !t.includes('e') && !t.includes('E')) t += '.0'; return t; } }
            return '0.0';
        }
        case 'Decimal': {
            if (sv) { const n = Number(sv); if (Number.isFinite(n)) return `${n}D`; }
            return '0D';
        }
        case 'Boolean': return /^(true|1)$/i.test(sv) ? 'True' : 'False';
        case 'DateTime': return sv ? `DateTime.Parse("${escVb(sv)}")` : 'DateTime.Now';
        case 'Guid': return sv ? `Guid.Parse("${escVb(sv)}")` : 'Guid.NewGuid()';
        case 'Byte[]': return 'New Byte() {}';
    }
}

// ---------------- Typed row collections (for binding to a DataGrid, ListBox, etc.) ----------------

/** C# top-level row class for a bound table (DataGrid auto-generates columns from its properties). */
function csRowClass(t: DataTableSpec): string {
    const lines: string[] = [];
    lines.push(`    public class ${t.name}Row`);
    lines.push('    {');
    for (const c of t.columns) {
        const pt = c.type === 'String' || c.type === 'Byte[]' ? `${csType(c.type)}?` : csType(c.type);
        lines.push(`        public ${pt} ${c.name} { get; set; }`);
    }
    const firstStr = t.columns.find((c) => c.type === 'String') ?? t.columns[0];
    lines.push('');
    lines.push(`        public override string ToString() => Convert.ToString(${firstStr.name}) ?? "";`);
    lines.push('    }');
    return lines.join('\n');
}

/** C# Get<T>() method: builds a List<Row> from the DataTable (keeps the sample row). */
function csGetMethod(t: DataTableSpec): string[] {
    const lines: string[] = [];
    lines.push(`        public static System.Collections.Generic.List<${t.name}Row> Get${t.name}()`);
    lines.push('        {');
    lines.push(`            var list = new System.Collections.Generic.List<${t.name}Row>();`);
    lines.push(`            var dt = CreateDataSet().Tables["${t.name}"]!;`);
    lines.push('            foreach (System.Data.DataRow r in dt.Rows)');
    lines.push('            {');
    lines.push(`                list.Add(new ${t.name}Row`);
    lines.push('                {');
    for (const c of t.columns) lines.push(`                    ${c.name} = ${csRowValue(c)},`);
    lines.push('                });');
    lines.push('            }');
    lines.push('            return list;');
    lines.push('        }');
    return lines;
}

/** C# value read from a DataRow (null-safe so grid edits / DBNull don't throw). */
function csRowValue(c: DataColumnSpec): string {
    const n = c.name;
    switch (c.type) {
        case 'String': return `r["${n}"] == System.DBNull.Value ? null : (string)r["${n}"]`;
        case 'Byte[]': return `r["${n}"] == System.DBNull.Value ? null : (byte[])r["${n}"]`;
        case 'Int32': return `r["${n}"] == System.DBNull.Value ? default : (int)r["${n}"]`;
        case 'Int64': return `r["${n}"] == System.DBNull.Value ? default : (long)r["${n}"]`;
        case 'Double': return `r["${n}"] == System.DBNull.Value ? default : (double)r["${n}"]`;
        case 'Decimal': return `r["${n}"] == System.DBNull.Value ? default : (decimal)r["${n}"]`;
        case 'Boolean': return `r["${n}"] == System.DBNull.Value ? default : (bool)r["${n}"]`;
        case 'DateTime': return `r["${n}"] == System.DBNull.Value ? default : (DateTime)r["${n}"]`;
        case 'Guid': return `r["${n}"] == System.DBNull.Value ? default : (Guid)r["${n}"]`;
    }
}

/** VB top-level row class for a bound table. */
function vbRowClass(t: DataTableSpec): string {
    const lines: string[] = [];
    lines.push(`    Public Class ${t.name}Row`);
    lines.push('');
    for (const c of t.columns) lines.push(`        Public Property ${c.name} As ${vbType(c.type)}`);
    const firstStr = t.columns.find((c) => c.type === 'String') ?? t.columns[0];
    lines.push('');
    lines.push('        Public Overrides Function ToString() As String');
    lines.push(`            Return Convert.ToString(Me.${firstStr.name})`);
    lines.push('        End Function');
    lines.push('');
    lines.push('    End Class');
    return lines.join('\n');
}

/** VB Get<T>() method: builds a List(Of Row) from the DataTable (keeps the sample row). */
function vbGetMethod(t: DataTableSpec): string[] {
    const lines: string[] = [];
    lines.push(`        Public Shared Function Get${t.name}() As List(Of ${t.name}Row)`);
    lines.push('');
    lines.push(`            Dim list As New List(Of ${t.name}Row)()`);
    lines.push(`            Dim dt As DataTable = CreateDataSet().Tables("${t.name}")`);
    lines.push('            For Each r As DataRow In dt.Rows');
    lines.push(`                list.Add(New ${t.name}Row With {`);
    t.columns.forEach((c, ci) => {
        // VB object-initializer members are comma-separated (no trailing comma allowed).
        const comma = ci < t.columns.length - 1 ? ',' : '';
        lines.push(`                    .${c.name} = ${vbRowValue(c)}${comma}`);
    });
    lines.push('                })');
    lines.push('            Next');
    lines.push('            Return list');
    lines.push('        End Function');
    return lines;
}

/** VB value read from a DataRow (null-safe). */
function vbRowValue(c: DataColumnSpec): string {
    const n = c.name;
    switch (c.type) {
        case 'String': return `If(r("${n}") Is DBNull.Value, Nothing, CStr(r("${n}")))`;
        case 'Byte[]': return `If(r("${n}") Is DBNull.Value, Nothing, CType(r("${n}"), Byte()))`;
        case 'Int32': return `If(r("${n}") Is DBNull.Value, 0, CInt(r("${n}")))`;
        case 'Int64': return `If(r("${n}") Is DBNull.Value, 0L, CLng(r("${n}")))`;
        case 'Double': return `If(r("${n}") Is DBNull.Value, 0.0, CDbl(r("${n}")))`;
        case 'Decimal': return `If(r("${n}") Is DBNull.Value, 0D, CDec(r("${n}")))`;
        case 'Boolean': return `If(r("${n}") Is DBNull.Value, False, CBool(r("${n}")))`;
        case 'DateTime': return `If(r("${n}") Is DBNull.Value, DateTime.MinValue, CDate(r("${n}")))`;
        case 'Guid': return `If(r("${n}") Is DBNull.Value, Guid.Empty, CType(r("${n}"), Guid))`;
    }
}

// ---------------- Live DataGrid support (bound to a DataGrid) ----------------
// Generates a persistent, editable grid: the DataGrid binds to an ObservableCollection
// (typed rows), a blank "+ Add row…" placeholder opens a popup dialog with one
// type-matched input per column (Save writes to the collection + persists to an XML
// file), and right-clicking a row offers Edit / Delete. In-place cell edits persist too.

const ADD_ROW_HINT = '+ Add row\u2026'; // ellipsis

/** true when the table is bound to a DataGrid (not a ListBox/ComboBox/ItemsControl). */
function isGridBound(t: DataTableSpec): boolean {
    return t.boundToType === 'DataGrid' && !!t.boundTo;
}
const anyGridBound = (spec: DataSetSpec) => spec.tables.some(isGridBound);

/** Lower-camel field name used for a column's input control (e.g. Name -> _nameInput). */
function fieldName(c: DataColumnSpec): string {
    const s = c.name[0].toLowerCase() + c.name.slice(1);
    return `${s}Input`;
}

// ---- C# ----

/** C# read of a persisted row (Convert.* is robust to ReadXml's string-type inference). */
function csLoadValue(c: DataColumnSpec): string {
    const n = c.name;
    switch (c.type) {
        case 'String': return `r["${n}"] == System.DBNull.Value ? null : Convert.ToString(r["${n}"])`;
        case 'Byte[]': return `r["${n}"] == System.DBNull.Value ? null : (byte[])r["${n}"]`;
        case 'Int32': return `r["${n}"] == System.DBNull.Value ? 0 : Convert.ToInt32(r["${n}"])`;
        case 'Int64': return `r["${n}"] == System.DBNull.Value ? 0L : Convert.ToInt64(r["${n}"])`;
        case 'Double': return `r["${n}"] == System.DBNull.Value ? 0.0 : Convert.ToDouble(r["${n}"])`;
        case 'Decimal': return `r["${n}"] == System.DBNull.Value ? 0m : Convert.ToDecimal(r["${n}"])`;
        case 'Boolean': return `r["${n}"] == System.DBNull.Value ? false : Convert.ToBoolean(r["${n}"])`;
        case 'DateTime': return `r["${n}"] == System.DBNull.Value ? DateTime.MinValue : Convert.ToDateTime(r["${n}"])`;
        case 'Guid': return `r["${n}"] == System.DBNull.Value ? Guid.Empty : (Guid)r["${n}"]`;
    }
}

/** C# placeholder value for a column (blank add-row). */
function csPlaceholderValue(c: DataColumnSpec, firstString: boolean): string {
    switch (c.type) {
        case 'String': return firstString ? `"${escCs(ADD_ROW_HINT)}"` : '""';
        case 'Int32': return '0';
        case 'Int64': return '0L';
        case 'Double': return '0.0';
        case 'Decimal': return '0m';
        case 'Boolean': return 'false';
        case 'DateTime': return 'DateTime.MinValue';
        case 'Guid': return 'Guid.Empty';
        case 'Byte[]': return 'Array.Empty<byte>()';
    }
}

/** C# save expression for one column (DateTime.MinValue is stored as null). */
function csSaveArg(c: DataColumnSpec): string {
    const n = c.name;
    return c.type === 'DateTime'
        ? `r.${n} == DateTime.MinValue ? (object)System.DBNull.Value : r.${n}`
        : `r.${n}`;
}

/** C# seed literal for the "no file yet" sample row. */
function csSeedLiteral(c: DataColumnSpec): string {
    return csSampleValue(c);
}

/** C# top-level snapshot class for one grid-bound table (undo/redo). */
function csSnapshotClass(t: DataTableSpec): string {
    return `    public class ${t.name}Snapshot
    {
        public System.Collections.Generic.List<${t.name}Row> Rows = new();
        public string Key = "";
    }`;
}

/** C# persistence + grid-wiring methods for a DataGrid-bound table (inside the class). */
function csPersistMethods(spec: DataSetSpec, t: DataTableSpec): string[] {
    const R = `${t.name}Row`;
    const L = `System.Collections.ObjectModel.ObservableCollection<${R}>`;
    const lines: string[] = [];
    lines.push('');
    lines.push(`        // --- ${t.name}: persistent live grid support ---`);
    lines.push(`        public static string ${t.name}File() => Path.Combine(AppContext.BaseDirectory, "${escCs(spec.name)}.${escCs(t.name)}.xml");`);
    lines.push('');
    lines.push(`        public static ${L} Load${t.name}()`);
    lines.push('        {');
    lines.push(`            var rows = new ${L}();`);
    lines.push('            try');
    lines.push('            {');
    lines.push('                var ds = new System.Data.DataSet();');
    lines.push(`                ds.ReadXml(${t.name}File());`);
    lines.push(`                foreach (System.Data.DataRow r in ds.Tables["${escCs(t.name)}"]!.Rows)`);
    lines.push('                {');
    lines.push(`                    rows.Add(new ${R}`);
    lines.push('                    {');
    for (const c of t.columns) lines.push(`                        ${c.name} = ${csLoadValue(c)},`);
    lines.push('                    });');
    lines.push('                }');
    lines.push('            }');
    lines.push('            catch');
    lines.push('            {');
    lines.push(`                rows.Add(new ${R} { ${t.columns.map((c) => `${c.name} = ${csSeedLiteral(c)}`).join(', ')} });`);
    lines.push('            }');
    const ph = t.columns.map((c) => `${c.name} = ${csPlaceholderValue(c, c === (t.columns.find((x) => x.type === 'String') ?? t.columns[0]))}`);
    lines.push(`            rows.Add(new ${R} { ${ph.join(', ')}, IsPlaceholder = true });`);
    lines.push('            return rows;');
    lines.push('        }');
    lines.push('');
    lines.push(`        public static void Save${t.name}(${L} rows)`);
    lines.push('        {');
    lines.push('            var ds = CreateDataSet();');
    lines.push(`            var t = ds.Tables["${escCs(t.name)}"]!;`);
    lines.push('            t.Clear(); // drop CreateDataSet\'s seed row(s); only the collection is saved');
    lines.push('            t.BeginLoadData();');
    lines.push('            foreach (var r in rows)');
    lines.push('            {');
    lines.push('                if (!r.IsPlaceholder)');
    lines.push(`                    t.Rows.Add(${t.columns.map((c) => csSaveArg(c)).join(', ')});`);
    lines.push('            }');
    lines.push('            t.EndLoadData();');
    lines.push(`            ds.WriteXml(${t.name}File());`);
    lines.push('        }');
    lines.push('');
    // --- Undo/redo (depth = the table's 'Undo-Redo' property; default 5, 0 disables) ---
    lines.push(`        private static readonly System.Collections.Generic.List<${t.name}Snapshot> _${t.name}Undo = new();`);
    lines.push(`        private static readonly System.Collections.Generic.List<${t.name}Snapshot> _${t.name}Redo = new();`);
    lines.push(`        private static int _${t.name}Depth = ${t.undoRedoDepth ?? 5};`);
    lines.push(`        private static ${t.name}Snapshot? _${t.name}PendingEdit;`);
    lines.push('');
    const csRowInit = t.columns.map((c) => `${c.name} = r.${c.name}`).join(', ');
    const csKeyParts = t.columns.map((c) => `{r.${c.name}}`).join('|');
    lines.push(`        private static ${t.name}Snapshot Snap${t.name}(${L} rows)`);
    lines.push('        {');
    lines.push(`            var s = new ${t.name}Snapshot();`);
    lines.push('            var parts = new System.Collections.Generic.List<string>();');
    lines.push('            foreach (var r in rows)');
    lines.push('                if (!r.IsPlaceholder)');
    lines.push('                {');
    lines.push(`                    s.Rows.Add(new ${R} { ${csRowInit} });`);
    lines.push(`                    parts.Add($"${csKeyParts}");`);
    lines.push('                }');
    lines.push('            s.Key = string.Join("\\n", parts);');
    lines.push('            return s;');
    lines.push('        }');
    lines.push('');
    lines.push(`        private static void Trim${t.name}Undo()`);
    lines.push('        {');
    lines.push(`            while (_${t.name}Undo.Count > _${t.name}Depth) _${t.name}Undo.RemoveAt(0);`);
    lines.push('        }');
    lines.push('');
    lines.push(`        private static void Push${t.name}Undo(${L} rows)`);
    lines.push('        {');
    lines.push(`            if (_${t.name}Depth <= 0) return;`);
    lines.push(`            _${t.name}Undo.Add(Snap${t.name}(rows));`);
    lines.push(`            Trim${t.name}Undo();`);
    lines.push(`            _${t.name}Redo.Clear();`);
    lines.push('        }');
    lines.push('');
    lines.push(`        private static void Restore${t.name}(${L} rows, ${t.name}Snapshot s)`);
    lines.push('        {');
    lines.push('            for (int i = rows.Count - 1; i >= 0; i--)');
    lines.push('                if (!rows[i].IsPlaceholder) rows.RemoveAt(i);');
    lines.push('            foreach (var r in s.Rows) rows.Insert(rows.Count - 1, r);');
    lines.push(`            Save${t.name}(rows);`);
    lines.push('        }');
    lines.push('');
    lines.push(`        private static void Undo${t.name}(${L} rows)`);
    lines.push('        {');
    lines.push(`            if (_${t.name}Undo.Count == 0) return;`);
    lines.push(`            _${t.name}Redo.Add(Snap${t.name}(rows));`);
    lines.push(`            var s = _${t.name}Undo[_${t.name}Undo.Count - 1];`);
    lines.push(`            _${t.name}Undo.RemoveAt(_${t.name}Undo.Count - 1);`);
    lines.push(`            Restore${t.name}(rows, s);`);
    lines.push('        }');
    lines.push('');
    lines.push(`        private static void Redo${t.name}(${L} rows)`);
    lines.push('        {');
    lines.push(`            if (_${t.name}Redo.Count == 0) return;`);
    lines.push(`            _${t.name}Undo.Add(Snap${t.name}(rows));`);
    lines.push(`            Trim${t.name}Undo();`);
    lines.push(`            var s = _${t.name}Redo[_${t.name}Redo.Count - 1];`);
    lines.push(`            _${t.name}Redo.RemoveAt(_${t.name}Redo.Count - 1);`);
    lines.push(`            Restore${t.name}(rows, s);`);
    lines.push('        }');
    lines.push('');
    // Typed columns replace auto-generation at runtime (XAML keeps AutoGenerateColumns="True"
    // so the designer preview still shows columns). DateTime columns get a DatePicker editor.
    lines.push(`        public static void Build${t.name}Columns(DataGrid grid)`);
    lines.push('        {');
    let dtIdx = 0;
    for (const c of t.columns) {
        if (c.type === 'Byte[]') continue;
        const header = escCs(c.caption || c.name);
        if (c.type === 'Boolean') {
            lines.push(`            grid.Columns.Add(new DataGridCheckBoxColumn { Header = "${header}", Binding = new Avalonia.Data.Binding("${escCs(c.name)}") });`);
        } else if (c.type === 'DateTime') {
            const dc = `dateCol${dtIdx++}`;
            lines.push(`            var ${dc} = new DataGridTemplateColumn { Header = "${header}" };`);
            lines.push(`            ${dc}.CellTemplate = new Avalonia.Controls.Templates.FuncDataTemplate<${t.name}Row>((r, _) => new TextBlock`);
            lines.push(`            { Text = r != null && r.${c.name} != DateTime.MinValue ? r.${c.name}.ToString("yyyy-MM-dd HH:mm") : "", VerticalAlignment = Avalonia.Layout.VerticalAlignment.Center });`);
            lines.push(`            ${dc}.CellEditingTemplate = new Avalonia.Controls.Templates.FuncDataTemplate<${t.name}Row>((r, _) =>`);
            lines.push('            {');
            lines.push('                var dp = new DatePicker { Margin = new Thickness(2) };');
            lines.push(`                dp.Bind(DatePicker.SelectedDateProperty, new Avalonia.Data.Binding("${escCs(c.name)}") { Converter = new DateTimeToOffsetConverter() });`);
            lines.push('                return dp;');
            lines.push('            });');
            lines.push(`            grid.Columns.Add(${dc});`);
        } else {
            lines.push(`            grid.Columns.Add(new DataGridTextColumn { Header = "${header}", Binding = new Avalonia.Data.Binding("${escCs(c.name)}") });`);
        }
    }
    lines.push('        }');
    lines.push('');
    lines.push(`        public static void Wire${t.name}Grid(DataGrid grid, ${L} rows)`);
    lines.push('        {');
    lines.push('            grid.AutoGenerateColumns = false; // typed columns built below; XAML True only for the designer preview');
    lines.push(`            Build${t.name}Columns(grid);`);
    lines.push('            grid.ItemsSource = rows;');
    lines.push(`            _${t.name}Depth = ${t.undoRedoDepth ?? 5};`);
    lines.push('            void HandleUndoKey(Avalonia.Input.KeyEventArgs e)');
    lines.push('            {');
    lines.push('                if (e.Handled) return;');
    lines.push('                if (e.KeyModifiers.HasFlag(Avalonia.Input.KeyModifiers.Control))');
    lines.push('                {');
    lines.push(`                    if (e.Key == Avalonia.Input.Key.U) { Undo${t.name}(rows); e.Handled = true; }`);
    lines.push(`                    else if (e.Key == Avalonia.Input.Key.R) { Redo${t.name}(rows); e.Handled = true; }`);
    lines.push('                }');
    lines.push('            }');
    lines.push('            grid.KeyDown += (_, e) => HandleUndoKey(e);');
    lines.push('            var undoWin = Avalonia.LogicalTree.LogicalExtensions.FindLogicalAncestorOfType<Window>(grid, true);');
    lines.push('            if (undoWin != null) undoWin.KeyDown += (_, e) => HandleUndoKey(e);');
    lines.push('            // A cell edit becomes an undo step only if it actually changed the row.');
    lines.push(`            grid.BeginningEdit += (_, _) => { if (_${t.name}Depth > 0) _${t.name}PendingEdit = Snap${t.name}(rows); };`);
    lines.push('            // Persist in-cell edits only when committed (Enter / Tab / click-away); Escape cancels without saving.');
    lines.push(`            grid.RowEditEnded += (_, e) =>`);
    lines.push('            {');
    lines.push(`                if (e.EditAction == Avalonia.Controls.DataGridEditAction.Commit)`);
    lines.push('                {');
    lines.push(`                    if (_${t.name}PendingEdit != null)`);
    lines.push('                    {');
    lines.push(`                        var now = Snap${t.name}(rows);`);
    lines.push(`                        if (now.Key != _${t.name}PendingEdit.Key)`);
    lines.push('                        {');
    lines.push(`                            _${t.name}Undo.Add(_${t.name}PendingEdit);`);
    lines.push(`                            Trim${t.name}Undo();`);
    lines.push(`                            _${t.name}Redo.Clear();`);
    lines.push('                        }');
    lines.push(`                        _${t.name}PendingEdit = null;`);
    lines.push('                    }');
    lines.push(`                    Save${t.name}(rows);`);
    lines.push('                }');
    lines.push(`                else _${t.name}PendingEdit = null;`);
    lines.push('            };');
    lines.push('            // The blank add-row opens the add dialog; real rows get a right-click Delete.');
    lines.push('            grid.LoadingRow += (_, e) =>');
    lines.push('            {');
    lines.push(`                var data = e.Row.DataContext as ${R};`);
    lines.push('                if (data == null) return;');
    lines.push('                if (data.IsPlaceholder)');
    lines.push('                {');
    lines.push('                    e.Row.AddHandler(Avalonia.Input.InputElement.PointerPressedEvent, (rs, re) =>');
    lines.push('                    {');
    lines.push('                        if (re.GetCurrentPoint(e.Row).Properties.IsLeftButtonPressed)');
    lines.push('                        {');
    lines.push('                            re.Handled = true;');
    lines.push(`                            _ = Add${t.name}Row(grid, rows);`);
    lines.push('                        }');
    lines.push('                    }, Avalonia.Interactivity.RoutingStrategies.Bubble, true);');
    lines.push('                }');
    lines.push('                else');
    lines.push('                {');
    lines.push('                    var menu = new ContextMenu();');
    lines.push('                    var delItem = new MenuItem { Header = "Delete row" };');
    lines.push(`                    delItem.Click += (_, _) => _ = Delete${t.name}Row(grid, rows, data);`);
    lines.push('                    menu.Items.Add(delItem);');
    lines.push('                    e.Row.ContextMenu = menu;');
    lines.push('                }');
    lines.push('            };');
    lines.push('        }');
    lines.push('');
    lines.push(`        public static async System.Threading.Tasks.Task Add${t.name}Row(DataGrid grid, ${L} rows)`);
    lines.push('        {');
    lines.push(`            var dlg = new ${t.name}EditDialog(CreateDataSet().Tables["${escCs(t.name)}"]!, null);`);
    lines.push('            var owner = OwnerOf(grid);');
    lines.push('            if (owner != null && await dlg.ShowDialog<bool>(owner))');
    lines.push('            {');
    lines.push('                var row = dlg.NewRow();');
    lines.push(`                Push${t.name}Undo(rows);`);
    lines.push('                rows.Insert(rows.Count - 1, row);');
    lines.push(`                Save${t.name}(rows);`);
    lines.push('            }');
    lines.push('        }');
    lines.push('');
    lines.push(`        public static async System.Threading.Tasks.Task Edit${t.name}Row(DataGrid grid, ${L} rows, ${R} row)`);
    lines.push('        {');
    lines.push(`            var dlg = new ${t.name}EditDialog(CreateDataSet().Tables["${escCs(t.name)}"]!, row);`);
    lines.push('            var owner = OwnerOf(grid);');
    lines.push(`            if (owner != null && await dlg.ShowDialog<bool>(owner)) { dlg.ApplyTo(row); Save${t.name}(rows); }`);
    lines.push('        }');
    lines.push('');
    lines.push(`        public static async System.Threading.Tasks.Task Delete${t.name}Row(DataGrid grid, ${L} rows, ${R} row)`);
    lines.push('        {');
    lines.push('            var dlg = new ConfirmDialog("Delete row", "Delete the selected row?");');
    lines.push('            var owner = OwnerOf(grid);');
    lines.push('            if (owner != null && await dlg.ShowDialog<bool>(owner))');
    lines.push('            {');
    lines.push(`                Push${t.name}Undo(rows);`);
    lines.push('                rows.Remove(row);');
    lines.push(`                Save${t.name}(rows);`);
    lines.push('            }');
    lines.push('        }');
    return lines;
}

/** C# INotifyPropertyChanged row class (in-place edits reflect in the DataGrid). */
function csGridRowClass(t: DataTableSpec): string {
    const lines: string[] = [];
    lines.push(`    public class ${t.name}Row : System.ComponentModel.INotifyPropertyChanged`);
    lines.push('    {');
    for (const c of t.columns) {
        const pt = c.type === 'String' || c.type === 'Byte[]' ? `${csType(c.type)}?` : csType(c.type);
        const init = c.type === 'String' || c.type === 'Byte[]' ? ';' : ' = default;';
        lines.push(`        private ${pt} _${c.name}${init}`);
        lines.push(`        public ${pt} ${c.name}`);
        lines.push('        {');
        lines.push(`            get => _${c.name};`);
        lines.push(`            set { if (_${c.name} != value) { _${c.name} = value; OnPropertyChanged(nameof(${c.name})); } }`);
        lines.push('        }');
    }
    lines.push('        [System.ComponentModel.DataAnnotations.Display(AutoGenerateField = false)]');
    lines.push('        public bool IsPlaceholder { get; set; }');
    lines.push('');
    lines.push('        public event System.ComponentModel.PropertyChangedEventHandler? PropertyChanged;');
    lines.push('        private void OnPropertyChanged(string name) => PropertyChanged?.Invoke(this, new System.ComponentModel.PropertyChangedEventArgs(name));');
    const firstStr = t.columns.find((c) => c.type === 'String') ?? t.columns[0];
    lines.push(`        public override string ToString() => Convert.ToString(${firstStr.name}) ?? "";`);
    lines.push('    }');
    return lines.join('\n');
}

/** C# dialog field declaration for one column. */
function csInputFieldDecl(c: DataColumnSpec): string {
    if (c.type === 'Byte[]') return '';
    const kind = (['Int32', 'Int64', 'Double', 'Decimal'].includes(c.type) ? 'NumericUpDown'
        : c.type === 'Boolean' ? 'CheckBox'
            : c.type === 'DateTime' ? 'DatePicker' : 'TextBox');
    return `        private ${kind} ${fieldName(c)} = null!;`;
}

/** C# dialog form rows for one column (label + input). */
function csInputConstruct(c: DataColumnSpec): string[] {
    if (c.type === 'Byte[]') return [];
    const fn = fieldName(c);
    const label = c.caption || c.name;
    const out = [`        root.Children.Add(new TextBlock { Text = "${escCs(label)}" });`];
    if (['Int32', 'Int64', 'Double', 'Decimal'].includes(c.type)) {
        const inc = (c.type === 'Int32' || c.type === 'Int64') ? '1' : '0.1';
        out.push(`        ${fn} = new NumericUpDown { Minimum = 0, Increment = ${inc} };`);
    } else if (c.type === 'Boolean') {
        out.push(`        ${fn} = new CheckBox();`);
    } else if (c.type === 'DateTime') {
        out.push(`        ${fn} = new DatePicker();`);
    } else {
        out.push(`        ${fn} = new TextBox();`);
    }
    out.push(`        root.Children.Add(${fn});`);
    return out;
}

/** C# dialog: pre-fill an input from the row. */
function csInputLoad(c: DataColumnSpec): string {
    const fn = fieldName(c);
    switch (c.type) {
        case 'String': return `        ${fn}.Text = row.${c.name};`;
        case 'Guid': return `        ${fn}.Text = row.${c.name} == Guid.Empty ? "" : row.${c.name}.ToString();`;
        case 'Int32': case 'Int64': return `        ${fn}.Value = row.${c.name};`;
        case 'Double': return `        ${fn}.Value = (decimal)row.${c.name};`;
        case 'Decimal': return `        ${fn}.Value = row.${c.name};`;
        case 'Boolean': return `        ${fn}.IsChecked = row.${c.name};`;
        case 'DateTime': return `        if (row.${c.name} != DateTime.MinValue) ${fn}.SelectedDate = row.${c.name};`;
        default: return '';
    }
}

/** C# dialog: read an input into a new row. */
function csInputNew(c: DataColumnSpec): string {
    const fn = fieldName(c);
    switch (c.type) {
        case 'String': return `        row.${c.name} = ${fn}.Text;`;
        case 'Guid': return `        row.${c.name} = Guid.TryParse(${fn}.Text, out var g) ? g : Guid.Empty;`;
        case 'Int32': return `        row.${c.name} = (int)Math.Truncate(${fn}.Value.GetValueOrDefault());`;
        case 'Int64': return `        row.${c.name} = (long)Math.Truncate(${fn}.Value.GetValueOrDefault());`;
        case 'Double': return `        row.${c.name} = (double)${fn}.Value.GetValueOrDefault();`;
        case 'Decimal': return `        row.${c.name} = ${fn}.Value.GetValueOrDefault();`;
        case 'Boolean': return `        row.${c.name} = ${fn}.IsChecked.GetValueOrDefault();`;
        case 'DateTime': return `        if (${fn}.SelectedDate.HasValue) row.${c.name} = ${fn}.SelectedDate.Value.DateTime;`;
        default: return '';
    }
}

/** C# edit/add dialog class for a DataGrid-bound table. */
function csDialogClass(t: DataTableSpec): string {
    const editable = t.columns.filter((c) => c.type !== 'Byte[]');
    const lines: string[] = [];
    lines.push(`    public class ${t.name}EditDialog : Window`);
    lines.push('    {');
    lines.push('        private readonly System.Data.DataTable _table;');
    for (const c of editable) { const d = csInputFieldDecl(c); if (d) lines.push(d); }
    lines.push('');
    lines.push(`        public ${t.name}EditDialog(System.Data.DataTable table, ${t.name}Row? row)`);
    lines.push('        {');
    lines.push('            _table = table;');
    lines.push('            Width = 360;');
    lines.push(`            Title = row == null ? "Add ${escCs(t.name)}" : "Edit ${escCs(t.name)}";`);
    lines.push('            var root = new StackPanel { Margin = new Thickness(12), Spacing = 8 };');
    for (const c of editable) for (const l of csInputConstruct(c)) lines.push(l);
    lines.push('            var btnRow = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, HorizontalAlignment = HorizontalAlignment.Right };');
    lines.push('            var saveBtn = new Button { Content = "Save", IsDefault = true };');
    lines.push('            saveBtn.Click += (_, _) => Close(true);');
    lines.push('            var cancelBtn = new Button { Content = "Cancel", IsCancel = true };');
    lines.push('            cancelBtn.Click += (_, _) => Close();');
    lines.push('            btnRow.Children.Add(saveBtn);');
    lines.push('            btnRow.Children.Add(cancelBtn);');
    lines.push('            root.Children.Add(btnRow);');
    lines.push('            Content = root;');
    lines.push('            if (row != null) LoadRow(row);');
    lines.push('        }');
    lines.push('');
    lines.push(`        private void LoadRow(${t.name}Row row)`);
    lines.push('        {');
    for (const c of editable) { const l = csInputLoad(c); if (l) lines.push(l); }
    lines.push('        }');
    lines.push('');
    lines.push(`        public ${t.name}Row NewRow()`);
    lines.push('        {');
    lines.push(`            var row = new ${t.name}Row();`);
    lines.push('            ApplyTo(row);');
    lines.push('            return row;');
    lines.push('        }');
    lines.push('');
    lines.push(`        public void ApplyTo(${t.name}Row row)`);
    lines.push('        {');
    for (const c of editable) { const l = csInputNew(c); if (l) lines.push(l); }
    lines.push('        }');
    lines.push('    }');
    return lines.join('\n');
}

/** C# shared confirmation dialog. */
function csConfirmClass(): string {
    return `    public class ConfirmDialog : Window
    {
        public ConfirmDialog(string title, string message)
        {
            Title = title;
            Width = 320;
            var root = new StackPanel { Margin = new Thickness(12), Spacing = 12 };
            root.Children.Add(new TextBlock { Text = message, TextWrapping = Avalonia.Media.TextWrapping.Wrap });
            var btnRow = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, HorizontalAlignment = HorizontalAlignment.Right };
            var yesBtn = new Button { Content = "Yes", IsDefault = true };
            yesBtn.Click += (_, _) => Close(true);
            var noBtn = new Button { Content = "No", IsCancel = true };
            noBtn.Click += (_, _) => Close();
            btnRow.Children.Add(yesBtn);
            btnRow.Children.Add(noBtn);
            root.Children.Add(btnRow);
            Content = root;
        }
    }`;
}

/** C# DateTime <-> DateTimeOffset converter (DatePicker.SelectedDate is DateTimeOffset?). */
function csDateTimeConverter(): string {
    return `    public class DateTimeToOffsetConverter : Avalonia.Data.Converters.IValueConverter
    {
        public object? Convert(object? value, Type targetType, object? parameter, System.Globalization.CultureInfo culture)
        {
            if (value is DateTime dt && dt != DateTime.MinValue) return new DateTimeOffset(DateTime.SpecifyKind(dt, DateTimeKind.Local));
            return null;
        }
        public object? ConvertBack(object? value, Type targetType, object? parameter, System.Globalization.CultureInfo culture)
        {
            if (value is DateTimeOffset dto) return dto.LocalDateTime;
            return null;
        }
    }`;
}

const stamp = () => new Date().toISOString().slice(0, 10);

// ---- VB ----

/** VB placeholder value for a column (blank add-row). */
function vbPlaceholderValue(c: DataColumnSpec, firstString: boolean): string {
    switch (c.type) {
        case 'String': return firstString ? `"${escVb(ADD_ROW_HINT)}"` : '""';
        case 'Int32': return '0';
        case 'Int64': return '0L';
        case 'Double': return '0.0';
        case 'Decimal': return '0D';
        case 'Boolean': return 'False';
        case 'DateTime': return 'DateTime.MinValue';
        case 'Guid': return 'Guid.Empty';
        case 'Byte[]': return 'New Byte() {}';
    }
}

/** VB save expression for one column (DateTime.MinValue is stored as null). */
function vbSaveArg(c: DataColumnSpec): string {
    const n = c.name;
    return c.type === 'DateTime'
        ? `If(r.${n} = DateTime.MinValue, CObj(DBNull.Value), CObj(r.${n}))`
        : `r.${n}`;
}

/** VB top-level snapshot class for one grid-bound table (undo/redo). */
function vbSnapshotClass(t: DataTableSpec): string {
    return `    Public Class ${t.name}Snapshot
        Public Rows As New List(Of ${t.name}Row)()
        Public Key As String = ""
    End Class`;
}

/** VB persistence + grid-wiring methods for a DataGrid-bound table (inside the class). */
function vbPersistMethods(spec: DataSetSpec, t: DataTableSpec): string[] {
    const R = `${t.name}Row`;
    const OC = `System.Collections.ObjectModel.ObservableCollection(Of ${R})`;
    const lines: string[] = [];
    lines.push('');
    lines.push(`        ' --- ${t.name}: persistent live grid support ---`);
    lines.push(`        Public Shared Function ${t.name}File() As String`);
    lines.push(`            Return System.IO.Path.Combine(System.AppContext.BaseDirectory, "${escVb(spec.name)}.${escVb(t.name)}.xml")`);
    lines.push('        End Function');
    lines.push('');
    lines.push(`        Public Shared Function Load${t.name}() As ${OC}`);
    lines.push('');
    lines.push(`            Dim rows As New ${OC}()`);
    lines.push('            Try');
    lines.push('                Dim ds As New DataSet()');
    lines.push(`                ds.ReadXml(${t.name}File())`);
    lines.push(`                For Each r As DataRow In ds.Tables("${escVb(t.name)}").Rows`);
    lines.push(`                    rows.Add(New ${R} With {`);
    t.columns.forEach((c, ci) => {
        const comma = ci < t.columns.length - 1 ? ',' : '';
        lines.push(`                        .${c.name} = ${vbRowValue(c)}${comma}`);
    });
    lines.push('                    })');
    lines.push('                Next');
    lines.push('            Catch');
    lines.push(`                rows.Add(New ${R} With { ${t.columns.map((c) => `.${c.name} = ${vbSampleValue(c)}`).join(', ')} })`);
    lines.push('            End Try');
    const ph = t.columns.map((c) => `.${c.name} = ${vbPlaceholderValue(c, c === (t.columns.find((x) => x.type === 'String') ?? t.columns[0]))}`);
    lines.push(`            rows.Add(New ${R} With { ${ph.join(', ')}, .IsPlaceholder = True })`);
    lines.push('            Return rows');
    lines.push('        End Function');
    lines.push('');
    lines.push(`        Public Shared Sub Save${t.name}(rows As ${OC})`);
    lines.push('');
    lines.push('            Dim ds As DataSet = CreateDataSet()');
    lines.push(`            Dim t As DataTable = ds.Tables("${escVb(t.name)}")`);
    lines.push(`            t.Clear() ' drop CreateDataSet's seed row(s); only the collection is saved`);
    lines.push('            t.BeginLoadData()');
    lines.push('            For Each r As CustomersRow In rows');
    lines.push('                If Not r.IsPlaceholder Then');
    lines.push(`                    t.Rows.Add(${t.columns.map((c) => vbSaveArg(c)).join(', ')})`);
    lines.push('                End If');
    lines.push('            Next');
    lines.push('            t.EndLoadData()');
    lines.push(`            ds.WriteXml(${t.name}File())`);
    lines.push('        End Sub');
    lines.push('');
    lines.push('            \' --- Undo/redo (depth = the table\'s \'Undo-Redo\' property; default 5, 0 disables) ---');
    lines.push(`        Private Shared ReadOnly _${t.name}Undo As New List(Of ${t.name}Snapshot)()`);
    lines.push(`        Private Shared ReadOnly _${t.name}Redo As New List(Of ${t.name}Snapshot)()`);
    lines.push(`        Private Shared _${t.name}Depth As Integer = ${t.undoRedoDepth ?? 5}`);
    lines.push(`        Private Shared _${t.name}PendingEdit As ${t.name}Snapshot`);
    lines.push('');
    const vbKeyParts = t.columns.map((c) => `{r.${c.name}}`).join('|');
    lines.push(`        Private Shared Function Snap${t.name}(rows As ${OC}) As ${t.name}Snapshot`);
    lines.push('');
    lines.push(`            Dim s As New ${t.name}Snapshot()`);
    lines.push('            Dim parts As New List(Of String)()');
    lines.push(`            For Each r As ${R} In rows`);
    lines.push('                If Not r.IsPlaceholder Then');
    lines.push(`                    s.Rows.Add(New ${R} With {${t.columns.map((c) => `.${c.name} = r.${c.name}`).join(', ')}})`);
    lines.push(`                    parts.Add($"${vbKeyParts}")`);
    lines.push('                End If');
    lines.push('            Next');
    lines.push('            s.Key = String.Join(vbLf, parts)');
    lines.push('            Return s');
    lines.push('        End Function');
    lines.push('');
    lines.push(`        Private Shared Sub Trim${t.name}Undo()`);
    lines.push('');
    lines.push(`            While _${t.name}Undo.Count > _${t.name}Depth`);
    lines.push(`                _${t.name}Undo.RemoveAt(0)`);
    lines.push('            End While');
    lines.push('        End Sub');
    lines.push('');
    lines.push(`        Private Shared Sub Push${t.name}Undo(rows As ${OC})`);
    lines.push('');
    lines.push(`            If _${t.name}Depth <= 0 Then Return`);
    lines.push(`            _${t.name}Undo.Add(Snap${t.name}(rows))`);
    lines.push(`            Trim${t.name}Undo()`);
    lines.push(`            _${t.name}Redo.Clear()`);
    lines.push('        End Sub');
    lines.push('');
    lines.push(`        Private Shared Sub Restore${t.name}(rows As ${OC}, s As ${t.name}Snapshot)`);
    lines.push('');
    lines.push('            Dim i As Integer = rows.Count - 1');
    lines.push('            While i >= 0');
    lines.push('                If Not rows(i).IsPlaceholder Then rows.RemoveAt(i)');
    lines.push('                i -= 1');
    lines.push('            End While');
    lines.push(`            For Each r As ${R} In s.Rows`);
    lines.push('                rows.Insert(rows.Count - 1, r)');
    lines.push('            Next');
    lines.push(`            Save${t.name}(rows)`);
    lines.push('        End Sub');
    lines.push('');
    lines.push(`        Private Shared Sub Undo${t.name}(rows As ${OC})`);
    lines.push('');
    lines.push(`            If _${t.name}Undo.Count = 0 Then Return`);
    lines.push(`            _${t.name}Redo.Add(Snap${t.name}(rows))`);
    lines.push(`            Dim s As ${t.name}Snapshot = _${t.name}Undo(_${t.name}Undo.Count - 1)`);
    lines.push(`            _${t.name}Undo.RemoveAt(_${t.name}Undo.Count - 1)`);
    lines.push(`            Restore${t.name}(rows, s)`);
    lines.push('        End Sub');
    lines.push('');
    lines.push(`        Private Shared Sub Redo${t.name}(rows As ${OC})`);
    lines.push('');
    lines.push(`            If _${t.name}Redo.Count = 0 Then Return`);
    lines.push(`            _${t.name}Undo.Add(Snap${t.name}(rows))`);
    lines.push(`            Trim${t.name}Undo()`);
    lines.push(`            Dim s As ${t.name}Snapshot = _${t.name}Redo(_${t.name}Redo.Count - 1)`);
    lines.push(`            _${t.name}Redo.RemoveAt(_${t.name}Redo.Count - 1)`);
    lines.push(`            Restore${t.name}(rows, s)`);
    lines.push('        End Sub');
    lines.push('');
    lines.push(`        Public Shared Sub Build${t.name}Columns(grid As DataGrid)`);
    lines.push('');
    let dtIdx = 0;
    for (const c of t.columns) {
        if (c.type === 'Byte[]') continue;
        const header = escVb(c.caption || c.name);
        if (c.type === 'Boolean') {
            lines.push(`            grid.Columns.Add(New DataGridCheckBoxColumn With {.Header = "${header}", .Binding = New Avalonia.Data.Binding("${escVb(c.name)}")})`);
        } else if (c.type === 'DateTime') {
            const dc = `dateCol${dtIdx++}`;
            lines.push(`            Dim ${dc} As New DataGridTemplateColumn With {.Header = "${header}"}`);
            lines.push(`            ${dc}.CellTemplate = New Avalonia.Controls.Templates.FuncDataTemplate(Of ${t.name}Row)(Function(r, ns)`);
            lines.push(`                Return New TextBlock With {.Text = If(r IsNot Nothing AndAlso r.${c.name} <> DateTime.MinValue, r.${c.name}.ToString("yyyy-MM-dd HH:mm"), ""), .VerticalAlignment = VerticalAlignment.Center}`);
            lines.push('            End Function)');
            lines.push(`            ${dc}.CellEditingTemplate = New Avalonia.Controls.Templates.FuncDataTemplate(Of ${t.name}Row)(Function(r, ns)`);
            lines.push('                Dim dp As New DatePicker With {.Margin = New Thickness(2)}');
            lines.push(`                dp.Bind(DatePicker.SelectedDateProperty, New Avalonia.Data.Binding("${escVb(c.name)}") With {.Converter = New DateTimeToOffsetConverter()})`);
            lines.push('                Return dp');
            lines.push('            End Function)');
            lines.push(`            grid.Columns.Add(${dc})`);
        } else {
            lines.push(`            grid.Columns.Add(New DataGridTextColumn With {.Header = "${header}", .Binding = New Avalonia.Data.Binding("${escVb(c.name)}")})`);
        }
    }
    lines.push('        End Sub');
    lines.push('');
    lines.push(`        Public Shared Sub Wire${t.name}Grid(grid As DataGrid, rows As ${OC})`);
    lines.push('');
    lines.push('            grid.AutoGenerateColumns = False \' typed columns built below; XAML True only for the designer preview');
    lines.push(`            Build${t.name}Columns(grid)`);
    lines.push('            grid.ItemsSource = rows');
    lines.push(`            _${t.name}Depth = ${t.undoRedoDepth ?? 5}`);
    lines.push('            Dim handleUndoKey As System.EventHandler(Of Avalonia.Input.KeyEventArgs) = Sub(s, e)');
    lines.push('                If e.Handled Then Return');
    lines.push('                If e.KeyModifiers.HasFlag(Avalonia.Input.KeyModifiers.Control) Then');
    lines.push('                    If e.Key = Avalonia.Input.Key.U Then');
    lines.push(`                        Undo${t.name}(rows)`);
    lines.push('                        e.Handled = True');
    lines.push('                    ElseIf e.Key = Avalonia.Input.Key.R Then');
    lines.push(`                        Redo${t.name}(rows)`);
    lines.push('                        e.Handled = True');
    lines.push('                    End If');
    lines.push('                End If');
    lines.push('            End Sub');
    lines.push('            AddHandler grid.KeyDown, handleUndoKey');
    lines.push('            Dim undoWin As Window = LogicalExtensions.FindLogicalAncestorOfType(Of Window)(grid, True)');
    lines.push('            If undoWin IsNot Nothing Then AddHandler undoWin.KeyDown, handleUndoKey');
    lines.push('            \' A cell edit becomes an undo step only if it actually changed the row.');
    lines.push(`            AddHandler grid.BeginningEdit, Sub(s, e) If _${t.name}Depth > 0 Then _${t.name}PendingEdit = Snap${t.name}(rows)`);
    lines.push('            \' Persist in-cell edits only when committed (Enter / Tab / click-away); Escape cancels without saving.');
    lines.push(`            AddHandler grid.RowEditEnded, Sub(s, e)`);
    lines.push(`                If e.EditAction = Avalonia.Controls.DataGridEditAction.Commit Then`);
    lines.push(`                    If _${t.name}PendingEdit IsNot Nothing Then`);
    lines.push(`                        Dim now As ${t.name}Snapshot = Snap${t.name}(rows)`);
    lines.push(`                        If now.Key <> _${t.name}PendingEdit.Key Then`);
    lines.push(`                            _${t.name}Undo.Add(_${t.name}PendingEdit)`);
    lines.push(`                            Trim${t.name}Undo()`);
    lines.push(`                            _${t.name}Redo.Clear()`);
    lines.push('                        End If');
    lines.push(`                        _${t.name}PendingEdit = Nothing`);
    lines.push('                    End If');
    lines.push(`                    Save${t.name}(rows)`);
    lines.push('                Else');
    lines.push(`                    _${t.name}PendingEdit = Nothing`);
    lines.push('                End If');
    lines.push('            End Sub');
    lines.push('            \' The blank add-row opens the add dialog; real rows get a right-click Delete.');
    lines.push('            AddHandler grid.LoadingRow, Sub(s, e)');
    lines.push('                Dim row = e.Row');
    lines.push(`                Dim data = TryCast(row.DataContext, ${R})`);
    lines.push('                If data Is Nothing Then Return');
    lines.push('                If data.IsPlaceholder Then');
    lines.push('                    Dim ph As System.EventHandler(Of Avalonia.Input.PointerPressedEventArgs) = Sub(rs, re)');
    lines.push('                        If re.GetCurrentPoint(row).Properties.IsLeftButtonPressed Then');
    lines.push('                            re.Handled = True');
    lines.push(`                            Add${t.name}Row(grid, rows)`);
    lines.push('                        End If');
    lines.push('                    End Sub');
    lines.push('                    row.AddHandler(Avalonia.Input.InputElement.PointerPressedEvent, ph, Avalonia.Interactivity.RoutingStrategies.Bubble, True)');
    lines.push('                Else');
    lines.push('                    Dim menu As New ContextMenu()');
    lines.push('                    Dim delItem As New MenuItem With {.Header = "Delete row"}');
    lines.push(`                    AddHandler delItem.Click, Sub() Delete${t.name}Row(grid, rows, data)`);
    lines.push('                    menu.Items.Add(delItem)');
    lines.push('                    row.ContextMenu = menu');
    lines.push('                End If');
    lines.push('            End Sub');
    lines.push('        End Sub');
    lines.push('');
    lines.push(`        Public Shared Async Sub Add${t.name}Row(grid As DataGrid, rows As ${OC})`);
    lines.push('');
    lines.push(`            Dim dlg As New ${t.name}EditDialog(MyData.CreateDataSet().Tables("${escVb(t.name)}"), Nothing)`);
    lines.push('            Dim owner = OwnerOf(grid)');
    lines.push('            If owner IsNot Nothing AndAlso Await dlg.ShowDialog(Of Boolean)(owner) Then');
    lines.push(`                Dim row As ${R} = dlg.NewRow()`);
    lines.push(`                Push${t.name}Undo(rows)`);
    lines.push('                rows.Insert(rows.Count - 1, row)');
    lines.push(`                Save${t.name}(rows)`);
    lines.push('            End If');
    lines.push('        End Sub');
    lines.push('');
    lines.push(`        Public Shared Async Sub Edit${t.name}Row(grid As DataGrid, rows As ${OC}, row As ${R})`);
    lines.push('');
    lines.push(`            Dim dlg As New ${t.name}EditDialog(MyData.CreateDataSet().Tables("${escVb(t.name)}"), row)`);
    lines.push('            Dim owner = OwnerOf(grid)');
    lines.push(`            If owner IsNot Nothing AndAlso Await dlg.ShowDialog(Of Boolean)(owner) Then`);
    lines.push('                dlg.ApplyTo(row)');
    lines.push(`                Save${t.name}(rows)`);
    lines.push('            End If');
    lines.push('        End Sub');
    lines.push('');
    lines.push(`        Public Shared Async Sub Delete${t.name}Row(grid As DataGrid, rows As ${OC}, row As ${R})`);
    lines.push('');
    lines.push('            Dim dlg As New ConfirmDialog("Delete row", "Delete the selected row?")');
    lines.push('            Dim owner = OwnerOf(grid)');
    lines.push('            If owner IsNot Nothing AndAlso Await dlg.ShowDialog(Of Boolean)(owner) Then');
    lines.push(`                Push${t.name}Undo(rows)`);
    lines.push('                rows.Remove(row)');
    lines.push(`                Save${t.name}(rows)`);
    lines.push('            End If');
    lines.push('        End Sub');
    return lines;
}

/** VB INotifyPropertyChanged row class (in-place edits reflect in the DataGrid). */
function vbGridRowClass(t: DataTableSpec): string {
    const lines: string[] = [];
    lines.push(`    Public Class ${t.name}Row`);
    lines.push('        Implements System.ComponentModel.INotifyPropertyChanged');
    lines.push('');
    for (const c of t.columns) {
        lines.push(`        Private _${c.name} As ${vbType(c.type)}`);
        lines.push(`        Public Property ${c.name} As ${vbType(c.type)}`);
        lines.push('            Get');
        lines.push(`                Return _${c.name}`);
        lines.push('            End Get');
        lines.push(`            Set(value As ${vbType(c.type)})`);
        lines.push(`                If _${c.name} <> value Then`);
        lines.push(`                    _${c.name} = value`);
        lines.push(`                    OnPropertyChanged(NameOf(${c.name}))`);
        lines.push('                End If');
        lines.push('            End Set');
        lines.push('        End Property');
        lines.push('');
    }
    lines.push('        <System.ComponentModel.DataAnnotations.Display(AutoGenerateField:=False)>');
    lines.push('        Public Property IsPlaceholder As Boolean');
    lines.push('');
    lines.push('        Public Event PropertyChanged As PropertyChangedEventHandler Implements System.ComponentModel.INotifyPropertyChanged.PropertyChanged');
    lines.push('');
    lines.push('        Private Sub OnPropertyChanged(name As String)');
    lines.push('            RaiseEvent PropertyChanged(Me, New PropertyChangedEventArgs(name))');
    lines.push('        End Sub');
    lines.push('');
    const firstStr = t.columns.find((c) => c.type === 'String') ?? t.columns[0];
    lines.push('        Public Overrides Function ToString() As String');
    lines.push(`            Return Convert.ToString(Me.${firstStr.name})`);
    lines.push('        End Function');
    lines.push('');
    lines.push('    End Class');
    return lines.join('\n');
}

/** VB dialog field declaration for one column. */
function vbInputFieldDecl(c: DataColumnSpec): string {
    if (c.type === 'Byte[]') return '';
    const kind = (['Int32', 'Int64', 'Double', 'Decimal'].includes(c.type) ? 'NumericUpDown'
        : c.type === 'Boolean' ? 'CheckBox'
            : c.type === 'DateTime' ? 'DatePicker' : 'TextBox');
    return `        Private _${fieldName(c)} As ${kind}`;
}

/** VB dialog form rows for one column (label + input). */
function vbInputConstruct(c: DataColumnSpec): string[] {
    if (c.type === 'Byte[]') return [];
    const fn = `_${fieldName(c)}`;
    const label = c.caption || c.name;
    const out = [`        Dim lbl${c.name} As New TextBlock With {.Text = "${escVb(label)}"}`];
    if (['Int32', 'Int64', 'Double', 'Decimal'].includes(c.type)) {
        const inc = (c.type === 'Int32' || c.type === 'Int64') ? '1' : '0.1';
        out.push(`        ${fn} = New NumericUpDown With {.Minimum = 0, .Increment = ${inc}}`);
    } else if (c.type === 'Boolean') {
        out.push(`        ${fn} = New CheckBox()`);
    } else if (c.type === 'DateTime') {
        out.push(`        ${fn} = New DatePicker()`);
    } else {
        out.push(`        ${fn} = New TextBox()`);
    }
    out.push(`        root.Children.Add(lbl${c.name})`);
    out.push(`        root.Children.Add(${fn})`);
    return out;
}

/** VB dialog: pre-fill an input from the row. */
function vbInputLoad(c: DataColumnSpec): string {
    const fn = `_${fieldName(c)}`;
    switch (c.type) {
        case 'String': return `        ${fn}.Text = row.${c.name}`;
        case 'Guid': return `        ${fn}.Text = If(row.${c.name} = Guid.Empty, "", row.${c.name}.ToString())`;
        case 'Int32': case 'Int64': case 'Double': case 'Decimal': return `        ${fn}.Value = row.${c.name}`;
        case 'Boolean': return `        ${fn}.IsChecked = row.${c.name}`;
        case 'DateTime': return `        If row.${c.name} <> DateTime.MinValue Then ${fn}.SelectedDate = row.${c.name}`;
        default: return '';
    }
}

/** VB dialog: read an input into a new row. */
function vbInputNew(c: DataColumnSpec): string {
    const fn = `_${fieldName(c)}`;
    switch (c.type) {
        case 'String': return `        row.${c.name} = ${fn}.Text`;
        case 'Guid': return `        Dim g As Guid\n        If Guid.TryParse(${fn}.Text, g) Then row.${c.name} = g Else row.${c.name} = Guid.Empty`;
        case 'Int32': return `        row.${c.name} = CInt(Math.Truncate(${fn}.Value.GetValueOrDefault()))`;
        case 'Int64': return `        row.${c.name} = CLng(Math.Truncate(${fn}.Value.GetValueOrDefault()))`;
        case 'Double': return `        row.${c.name} = CDbl(${fn}.Value.GetValueOrDefault())`;
        case 'Decimal': return `        row.${c.name} = ${fn}.Value.GetValueOrDefault()`;
        case 'Boolean': return `        row.${c.name} = ${fn}.IsChecked.GetValueOrDefault()`;
        case 'DateTime': return `        If ${fn}.SelectedDate.HasValue Then row.${c.name} = ${fn}.SelectedDate.Value.DateTime`;
        default: return '';
    }
}

/** VB edit/add dialog class for a DataGrid-bound table. */
function vbDialogClass(t: DataTableSpec): string {
    const editable = t.columns.filter((c) => c.type !== 'Byte[]');
    const lines: string[] = [];
    lines.push(`    Public Class ${t.name}EditDialog`);
    lines.push('        Inherits Window');
    lines.push('');
    lines.push('        Private ReadOnly _table As DataTable');
    for (const c of editable) { const d = vbInputFieldDecl(c); if (d) lines.push(d); }
    lines.push('');
    lines.push(`        Public Sub New(table As DataTable, Optional row As ${t.name}Row = Nothing)`);
    lines.push('');
    lines.push('            _table = table');
    lines.push('            Width = 360');
    lines.push(`            Title = If(row Is Nothing, "Add ${escVb(t.name)}", "Edit ${escVb(t.name)}")`);
    lines.push('            Dim root As New StackPanel With {.Margin = New Thickness(12), .Spacing = 8}');
    lines.push('');
    for (const c of editable) for (const l of vbInputConstruct(c)) lines.push(l);
    lines.push('');
    lines.push('            Dim btnRow As New StackPanel With {.Orientation = Orientation.Horizontal, .Spacing = 8, .HorizontalAlignment = HorizontalAlignment.Right}');
    lines.push('            Dim saveBtn As New Button With {.Content = "Save", .IsDefault = True}');
    lines.push('            AddHandler saveBtn.Click, Sub() Me.Close(True)');
    lines.push('            Dim cancelBtn As New Button With {.Content = "Cancel", .IsCancel = True}');
    lines.push('            AddHandler cancelBtn.Click, Sub() Me.Close()');
    lines.push('            btnRow.Children.Add(saveBtn)');
    lines.push('            btnRow.Children.Add(cancelBtn)');
    lines.push('            root.Children.Add(btnRow)');
    lines.push('');
    lines.push('            Content = root');
    lines.push('            If row IsNot Nothing Then LoadRow(row)');
    lines.push('        End Sub');
    lines.push('');
    lines.push(`        Private Sub LoadRow(row As ${t.name}Row)`);
    lines.push('');
    for (const c of editable) { const l = vbInputLoad(c); if (l) lines.push(l); }
    lines.push('        End Sub');
    lines.push('');
    lines.push(`        Public Function NewRow() As ${t.name}Row`);
    lines.push('');
    lines.push(`            Dim row As New ${t.name}Row()`);
    lines.push('            ApplyTo(row)');
    lines.push('            Return row');
    lines.push('        End Function');
    lines.push('');
    lines.push(`        Public Sub ApplyTo(row As ${t.name}Row)`);
    lines.push('');
    for (const c of editable) {
        const l = vbInputNew(c);
        if (l) for (const part of l.split('\n')) lines.push(part);
    }
    lines.push('        End Sub');
    lines.push('    End Class');
    return lines.join('\n');
}

/** VB shared confirmation dialog. */
function vbConfirmClass(): string {
    return `    Public Class ConfirmDialog
        Inherits Window

        Public Sub New(title As String, message As String)
            Title = title
            Width = 320
            Dim root As New StackPanel With {.Margin = New Thickness(12), .Spacing = 12}
            root.Children.Add(New TextBlock With {.Text = message, .TextWrapping = Avalonia.Media.TextWrapping.Wrap})
            Dim btnRow As New StackPanel With {.Orientation = Orientation.Horizontal, .Spacing = 8, .HorizontalAlignment = HorizontalAlignment.Right}
            Dim yesBtn As New Button With {.Content = "Yes", .IsDefault = True}
            AddHandler yesBtn.Click, Sub() Me.Close(True)
            Dim noBtn As New Button With {.Content = "No", .IsCancel = True}
            AddHandler noBtn.Click, Sub() Me.Close()
            btnRow.Children.Add(yesBtn)
            btnRow.Children.Add(noBtn)
            root.Children.Add(btnRow)
            Content = root
        End Sub
    End Class`;
}

/** VB DateTime <-> DateTimeOffset converter (DatePicker.SelectedDate is DateTimeOffset?).
 *  Uses EXPLICIT Implements clauses — VB's implicit interface matching rejects fully-qualified
 *  CultureInfo here (BC30149), but explicit per-member Implements compiles clean. */
function vbDateTimeConverter(): string {
    return `    Public Class DateTimeToOffsetConverter
        Implements Avalonia.Data.Converters.IValueConverter

        Public Function Convert(value As Object, targetType As Type, parameter As Object, culture As System.Globalization.CultureInfo) As Object Implements Avalonia.Data.Converters.IValueConverter.Convert
            If TypeOf value Is DateTime AndAlso CType(value, DateTime) <> DateTime.MinValue Then
                Return New DateTimeOffset(DateTime.SpecifyKind(CType(value, DateTime), DateTimeKind.Local))
            End If
            Return Nothing
        End Function

        Public Function ConvertBack(value As Object, targetType As Type, parameter As Object, culture As System.Globalization.CultureInfo) As Object Implements Avalonia.Data.Converters.IValueConverter.ConvertBack
            If TypeOf value Is DateTimeOffset Then
                Return CType(value, DateTimeOffset).LocalDateTime
            End If
            Return Nothing
        End Function
    End Class`;
}

/** Generates a C# class that builds the DataSet at runtime. */
export function generateCs(spec: DataSetSpec, rootNamespace: string): string {
    const ns = rootNamespace || spec.name;
    const grid = anyGridBound(spec);
    const lines: string[] = [];
    lines.push('// Generated by the Avalonia Designer — DataSet designer. Do not edit by hand.');
    lines.push(`// Edit ${spec.name}.adset in the designer and re-generate. (${stamp()})`);
    lines.push('using System;');
    lines.push('using System.Data;');
    lines.push('using System.Collections.Generic;');
    if (grid) {
        lines.push('using Avalonia;');
        lines.push('using System.Collections.ObjectModel;');
        lines.push('using System.ComponentModel;');
        lines.push('using System.IO;');
        lines.push('using System.Threading.Tasks;');
        lines.push('using Avalonia.Controls;');
        lines.push('using Avalonia.Input;');
        lines.push('using Avalonia.Layout;');
        lines.push('using Avalonia.LogicalTree;');
    }
    lines.push('');
    lines.push(`namespace ${ns}`);
    lines.push('{');
    lines.push(`    public class ${spec.name}`);
    lines.push('    {');
    lines.push(`        /// <summary>Builds the ${spec.name} DataSet at runtime (tables + columns).</summary>`);
    lines.push('        public static DataSet CreateDataSet()');
    lines.push('        {');
    lines.push(`            var ds = new DataSet("${escCs(spec.name)}");`);
    lines.push('');
    spec.tables.forEach((t, ti) => {
        lines.push(`            // ${escCs(t.name)}`);
        lines.push(`            var t${ti} = ds.Tables.Add("${escCs(t.name)}");`);
        t.columns.forEach((c, ci) => {
            // `Add` returns a non-null DataColumn, so setting AllowDBNull/Caption on the
            // local avoids CS8602 under `<Nullable>enable</Nullable>` (the string indexer is null-annotated).
            lines.push(`            var c${ti}_${ci} = t${ti}.Columns.Add("${escCs(c.name)}", typeof(${csType(c.type)}));`);
            if (!c.allowNull) lines.push(`            c${ti}_${ci}.AllowDBNull = false;`);
            if (c.caption && c.caption !== c.name) lines.push(`            c${ti}_${ci}.Caption = "${escCs(c.caption)}";`);
        });
        // Bound tables get a sample row so the control shows data at runtime.
        if (t.boundTo) {
            const values = t.columns.map((c) => csSampleValue(c));
            lines.push(`            t${ti}.Rows.Add(${values.join(', ')});`);
        }
        lines.push('');
    });
    lines.push('            return ds;');
    lines.push('        }');
    // Typed row collections for bound tables — a DataGrid can't display a DataView's rows/columns.
    for (const t of spec.tables) {
        if (t.boundTo) {
            lines.push('');
            for (const l of csGetMethod(t)) lines.push(l);
        }
    }
    // Live editable-grid support for DataGrid-bound tables.
    for (const t of spec.tables) {
        if (isGridBound(t)) {
            for (const l of csPersistMethods(spec, t)) lines.push(l);
        }
    }
    if (grid) {
        lines.push('');
        lines.push('        private static Window? OwnerOf(DataGrid grid) => Avalonia.LogicalTree.LogicalExtensions.FindLogicalAncestorOfType<Window>(grid, true);');
    }
    lines.push('    }');
    for (const t of spec.tables) {
        if (t.boundTo) {
            lines.push('');
            for (const l of (isGridBound(t) ? csGridRowClass(t) : csRowClass(t)).split('\n')) lines.push(l);
            if (isGridBound(t)) {
                lines.push('');
                for (const l of csSnapshotClass(t).split('\n')) lines.push(l);
            }
        }
    }
    if (grid) {
        for (const t of spec.tables) {
            if (isGridBound(t)) {
                lines.push('');
                for (const l of csDialogClass(t).split('\n')) lines.push(l);
            }
        }
        lines.push('');
        for (const l of csConfirmClass().split('\n')) lines.push(l);
        lines.push('');
        for (const l of csDateTimeConverter().split('\n')) lines.push(l);
    }
    lines.push('}');
    return lines.join('\n') + '\n';
}

/** Generates a VB.NET class that builds the DataSet at runtime. */
export function generateVb(spec: DataSetSpec, rootNamespace: string): string {
    const grid = anyGridBound(spec);
    const lines: string[] = [];
    lines.push("' Generated by the Avalonia Designer — DataSet designer. Do not edit by hand.");
    lines.push(`' Edit ${spec.name}.adset in the designer and re-generate. (${stamp()})`);
    lines.push('Imports System');
    lines.push('Imports System.Data');
    lines.push('Imports System.Collections.Generic');
    if (grid) {
        lines.push('Imports System.Collections.ObjectModel');
        lines.push('Imports System.ComponentModel');
        lines.push('Imports System.IO');
        lines.push('Imports Avalonia');
        lines.push('Imports Avalonia.Controls');
        lines.push('Imports Avalonia.Input');
        lines.push('Imports Avalonia.Layout');
        lines.push('Imports Avalonia.LogicalTree');
    }
    lines.push('');
    // VB applies RootNamespace to global-namespace types, so the class is emitted WITHOUT
    // an explicit Namespace block — otherwise RootNamespace would be prepended twice
    // (e.g. <Root>.MyData.MyData) and the class would be invisible to the app's code.
    lines.push(`    Public Class ${spec.name}`);
    lines.push('');
    lines.push(`        ''' <summary>Builds the ${spec.name} DataSet at runtime (tables + columns).</summary>`);
    lines.push('        Public Shared Function CreateDataSet() As DataSet');
    lines.push('');
    lines.push(`            Dim ds As New DataSet("${escVb(spec.name)}")`);
    lines.push('');
    spec.tables.forEach((t, ti) => {
        lines.push(`            ' ${escVb(t.name)}`);
        lines.push(`            Dim t${ti} As DataTable = ds.Tables.Add("${escVb(t.name)}")`);
        t.columns.forEach((c, ci) => {
            lines.push(`            Dim c${ti}_${ci} As DataColumn = t${ti}.Columns.Add("${escVb(c.name)}", GetType(${vbType(c.type)}))`);
            if (!c.allowNull) lines.push(`            c${ti}_${ci}.AllowDBNull = False`);
            if (c.caption && c.caption !== c.name) lines.push(`            c${ti}_${ci}.Caption = "${escVb(c.caption)}"`);
        });
        // Bound tables get a sample row so the control shows data at runtime.
        if (t.boundTo) {
            const values = t.columns.map((c) => vbSampleValue(c));
            lines.push(`            t${ti}.Rows.Add(${values.join(', ')})`);
        }
        lines.push('');
    });
    lines.push('            Return ds');
    lines.push('        End Function');
    // Typed row collections for bound tables — a DataGrid can't display a DataView's rows/columns.
    for (const t of spec.tables) {
        if (t.boundTo) {
            lines.push('');
            for (const l of vbGetMethod(t)) lines.push(l);
        }
    }
    // Live editable-grid support for DataGrid-bound tables.
    for (const t of spec.tables) {
        if (isGridBound(t)) {
            for (const l of vbPersistMethods(spec, t)) lines.push(l);
        }
    }
    if (grid) {
        lines.push('');
        lines.push('        Private Shared Function OwnerOf(grid As DataGrid) As Window');
        lines.push('            Return LogicalExtensions.FindLogicalAncestorOfType(Of Window)(grid, True)');
        lines.push('        End Function');
    }
    lines.push('');
    lines.push('    End Class');
    for (const t of spec.tables) {
        if (t.boundTo) {
            lines.push('');
            for (const l of (isGridBound(t) ? vbGridRowClass(t) : vbRowClass(t)).split('\n')) lines.push(l);
            if (isGridBound(t)) {
                lines.push('');
                for (const l of vbSnapshotClass(t).split('\n')) lines.push(l);
            }
        }
    }
    if (grid) {
        for (const t of spec.tables) {
            if (isGridBound(t)) {
                lines.push('');
                for (const l of vbDialogClass(t).split('\n')) lines.push(l);
            }
        }
        lines.push('');
        for (const l of vbConfirmClass().split('\n')) lines.push(l);
        lines.push('');
        for (const l of vbDateTimeConverter().split('\n')) lines.push(l);
    }
    return lines.join('\n') + '\n';
}

/** Generates a standard .xsd schema describing the DataSet (dataset design + tables + columns). */
export function generateXsd(spec: DataSetSpec): string {
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="utf-8"?>');
    lines.push(`<xs:schema id="${escXml(spec.name)}" xmlns="" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:msdata="urn:schemas-microsoft-com:xml-msdata">`);
    lines.push(`  <xs:element name="${escXml(spec.name)}" msdata:IsDataSet="true" msdata:UseCurrentCulture="true">`);
    lines.push('    <xs:complexType>');
    lines.push('      <xs:choice minOccurs="0" maxOccurs="unbounded">');
    for (const t of spec.tables) {
        lines.push(`        <xs:element name="${escXml(t.name)}" msdata:AllowDBNull="true">`);
        lines.push('          <xs:complexType>');
        lines.push('            <xs:sequence>');
        for (const c of t.columns) {
            const dt = xsType(c.type);
            const guid = c.type === 'Guid' ? ' msdata:DataType="System.Guid"' : '';
            lines.push(`              <xs:element name="${escXml(c.name)}" type="${dt}" minOccurs="0" msdata:AllowDBNull="${c.allowNull ? 'true' : 'false'}"${guid} />`);
        }
        lines.push('            </xs:sequence>');
        lines.push('          </xs:complexType>');
        lines.push('        </xs:element>');
    }
    lines.push('      </xs:choice>');
    lines.push('    </xs:complexType>');
    lines.push('  </xs:element>');
    lines.push('</xs:schema>');
    return lines.join('\n') + '\n';
}
