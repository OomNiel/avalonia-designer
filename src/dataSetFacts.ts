/**
 * What a form's data actually is — as data, and as words a model can be told.
 *
 * The rules have always used these facts (they verify Data-Image / `ItemsSource` bindings, and the code
 * check's DataSet findings are built from them). The **model** did not, and on 2026-09-17 that showed:
 * asked to link a ComboBox's selection to the grid row, it wrote
 *
 *     var rowIndex = DataGrid1.Items.IndexOf(selectedItem);
 *
 * — two mistakes in one line, and neither is fixable by a rule. `Items` is WPF's name (Avalonia:
 * `ItemsSource`, and even that has no `IndexOf`), and the deeper one is the data model: the ComboBox is
 * bound through a `ColumnFollower` over `Customers.Name`, so **a selected item is a Name string, not a
 * row**. The row has to be looked up in the collection the grid is bound to.
 *
 * `describeDataSetFacts` is that knowledge, in the prompt's own words. It is written from the same
 * `DataSetContext` the checker builds, so the model is told what the designer already knows instead of
 * being left to guess — and it is *derived*, never invented: every line comes from a `.adset` on disk.
 */
import { DataSetContext, DataSetFollowerInfo, DataSetGridInfo, DataSetImageInfo } from './codeBehindCheck';
import { readDataSetFiles } from './dataSetReader';

/**
 * The DataSet facts for a project folder, exactly as the code check uses them: every table that is bound to
 * a control of this project, with the row type and columns the code-behind has to match, plus the image and
 * follower bindings recorded on those tables.
 *
 * Moved here from `designerPanel` on 2026-09-17 (the panel now calls this) so the rules and the AI prompts
 * can never disagree about what a form's data is — a second copy is how the ComboBox mistake happened.
 */
export function dataSetContextFor(projectFolder: string): DataSetContext {
    const grids: DataSetGridInfo[] = [];
    const images: DataSetImageInfo[] = [];
    const followers: DataSetFollowerInfo[] = [];
    const datasetClasses: string[] = [];
    for (const f of readDataSetFiles(projectFolder)) {
        datasetClasses.push(f.spec.name);
        for (const t of f.spec.tables) {
            const rowType = `${t.name}Row`;
            if (t.boundTo && t.boundToType === 'DataGrid') {
                grids.push({
                    datasetName: f.spec.name, datasetClass: f.spec.name, tableName: t.name,
                    rowType, columns: t.columns.map((c) => c.name), gridName: t.boundTo
                });
            }
            if (!t.boundTo) continue;
            for (const b of t.boundImages ?? []) {
                images.push({
                    datasetName: f.spec.name, datasetClass: f.spec.name, tableName: t.name,
                    rowType, controlName: b.control, gridName: t.boundTo, column: b.column
                });
            }
            for (const fl of t.followers ?? []) {
                followers.push({
                    datasetName: f.spec.name, tableName: t.name, rowType, column: fl.column,
                    controlName: fl.control, ownerGrid: t.boundTo, adsetPath: f.adsetPath
                });
            }
        }
    }
    return { datasetClasses, grids, images, followers };
}

/** `Folder` may be '' (no project found) — then there is nothing to say, and no facts block is added. */
export function dataSetFactsFor(projectFolder: string | undefined): string {
    if (!projectFolder) return '';
    try {
        return describeDataSetFacts(dataSetContextFor(projectFolder));
    } catch {
        // A `.adset` that cannot be read must never make an AI request fail: the prompt simply has fewer
        // facts, which is exactly the state this feature was in before today.
        return '';
    }
}

/**
 * The facts as prompt text. Deliberately written as *statements about this form*, in the voice of someone
 * who built it, because that is what a small model follows — and each one is something the compiler would
 * otherwise have to complain about.
 */
export function describeDataSetFacts(ctx: DataSetContext | undefined): string {
    if (!ctx) return '';
    const lines: string[] = [];
    const datasets = [...new Set(ctx.datasetClasses)];
    // One table per dataset, for the concrete example below (`MyDataSet.Customers` is the shape a model keeps
    // writing, and it is the shape the compiler refuses).
    const tableOf = new Map<string, string>();
    for (const g of ctx.grids) if (!tableOf.has(g.datasetClass)) tableOf.set(g.datasetClass, g.tableName);
    for (const name of datasets) {
        // WHAT THIS CLASS IS — asked 2026-09-17, after the user's own build reported
        // CS1061 "'MyDataSet' does not contain a definition for 'Customers'". The generator emits a *helper*
        // class: static methods, plus one **top-level** row class per table. It is NOT the ADO.NET typed
        // `DataSet` that earlier versions produced. Calling it "the generated DataSet class" was enough for a
        // model to keep writing `((MyDataSet.CustomersDataTable)DataGrid1.ItemsSource)`, which is exactly the
        // code the compiler refused — and it kept doing it, because nothing said the shape had changed.
        const t = tableOf.get(name);
        lines.push(
            `- \`${name}\` is a **generated class of static methods**, not an ADO.NET \`DataSet\` and not a `
            + 'container of tables. It has no table or row *properties*: there is no '
            + (t
                ? `\`${name}.${t}\`, no nested \`${name}.${t}DataTable\` and no nested \`${name}.${t}Row\`; `
                : 'nested `…DataTable` or `…Row` type; ')
            + 'every table has a top-level row class (named below) and the generated helpers '
            + '`Load…()`, `Save…(rows)`, `Wire…Grid(grid, rows)`, `Add…Row`, `Edit…Row`, `Delete…Row`, `Build…Columns(grid)`.'
        );
    }
    for (const g of ctx.grids) {
        lines.push(
            `- \`${g.gridName}\` is bound to the \`${g.tableName}\` table of ${g.datasetClass}; each item in it is a `
            + `\`${g.rowType}\` with these members: ${g.columns.map((c) => `\`${c}\``).join(', ')}. `
            + `The rows it shows **are** what \`${g.gridName}.ItemsSource\` holds — read them from there (that is `
            + `the \`ObservableCollection<${g.rowType}>\` the generated \`Load${g.tableName}()\` returns), never by `
            + `casting that collection to the DataSet class and never through \`.Items\` (that name is WPF's).`
        );
    }
    for (const f of ctx.followers) {
        lines.push(
            `- \`${f.controlName}\` **follows a column**, not the table: it is bound to `
            + `\`${f.tableName}.${f.column}\` (the grid \`${f.ownerGrid}\` shows those rows). Its selected item is `
            + `**the value of that column — a plain value, not a \`${f.rowType}\`** — so to find the matching row, `
            + `search the collection the grid is bound to and compare that column with the selected value. `
            + 'Never index the grid by the selected item, and never assume it is a row.'
        );
    }
    for (const i of ctx.images) {
        lines.push(
            `- \`${i.controlName}\` shows the \`${i.column}\` column of the row selected in \`${i.gridName}\` `
            + `(a \`${i.rowType}\`), through the generated \`BindImage_${i.controlName}()\` binding.`
        );
    }
    if (lines.length === 0) return '';
    return `DataSet bindings recorded for this form (from ${datasets.length === 1 ? 'the .adset file' : 'the .adset files'}):\n`
        + lines.join('\n');
}
