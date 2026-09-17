/* T2 — the facts the AI prompts carry about a form's data (`src/dataSetFacts.ts`), added 2026-09-17.
 *
 * The user asked the assistant to link a ComboBox's selection to the matching grid row, and got:
 *
 *     var rowIndex = DataGrid1.Items.IndexOf(selectedItem);
 *
 * `Items` is WPF's name (Avalonia: `ItemsSource`, and no `IndexOf` on it), and the deeper mistake is the data
 * model: the ComboBox is bound through a `ColumnFollower` over `Customers.Name`, so a selected item is a
 * **Name string, not a row**. `dotnet build` stops on it (`CS1061`), no rule can repair it — the checker's
 * findings on that file were exactly zero — and the loop's model fallback was the only fixer left.
 *
 * So the model is now told what the designer already knows. What is proven here:
 *   1. the text says the four things that matter (the DataSet class, the grid's row type and columns, that a
 *      column-follower control holds a **value**, and what a Data-Image control shows);
 *   2. it says them from the *same* `DataSetContext` the rules use, so the two cannot disagree;
 *   3. `buildFixPrompt`/`buildImplementPrompt` carry the block (and none when there is nothing to say);
 *   4. the wiring: the panel delegates to the one mapping, and every AI request path passes the facts.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const facts = require('../../out/dataSetFacts.js');
const assistant = require('../../out/assistant.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** The real shape, taken from the user's own `.adset` (MyDataSet → Customers → DataGrid1). */
const CONTEXT = {
    datasetClasses: ['MyDataSet'],
    grids: [{
        datasetName: 'MyDataSet', datasetClass: 'MyDataSet', tableName: 'Customers',
        rowType: 'CustomersRow', columns: ['Id', 'Name', 'Image'], gridName: 'DataGrid1'
    }],
    followers: [{
        datasetName: 'MyDataSet', tableName: 'Customers', rowType: 'CustomersRow', column: 'Name',
        controlName: 'ComboBox1', ownerGrid: 'DataGrid1', adsetPath: '/p/MyDataSet.adset'
    }],
    images: [{
        datasetName: 'MyDataSet', datasetClass: 'MyDataSet', tableName: 'Customers', rowType: 'CustomersRow',
        controlName: 'Image1', gridName: 'DataGrid1', column: 'Image'
    }]
};

module.exports = async (t) => {
    t.section('the facts the AI is told about a form\'s data');

    // ---------- 1) the text ----------
    {
        const text = facts.describeDataSetFacts(CONTEXT);
        t.ok(/DataSet class `MyDataSet`/.test(text), 'facts', 'the DataSet class is named');
        t.ok(/`DataGrid1` is bound to the `Customers` table/.test(text), 'facts', 'the grid and its table');
        t.ok(/`CustomersRow`/.test(text), 'facts', 'with the row type, which is what a row IS');
        t.ok(/`Id`, `Name`, `Image`/.test(text), 'facts', 'and the members a row has, so nothing is invented');
        // The sentence that addresses the mistake that started this.
        t.ok(/`ComboBox1` \*\*follows a column\*\*/.test(text), 'facts',
            'a control bound to a column is called out');
        t.ok(/not a `CustomersRow`/.test(text), 'facts', 'its selected item is a value, not a row');
        t.ok(/search the collection the grid is bound to/.test(text), 'facts',
            'and the way to find the row is spelled out');
        t.ok(/Never index the grid by the selected item/.test(text), 'facts',
            'including the exact thing the model did wrong');
        t.ok(/`Image1` shows the `Image` column/.test(text), 'facts', 'the Data-Image binding is described too');
        t.equal(facts.describeDataSetFacts(undefined), '', 'facts', 'no context means no facts block');
        t.equal(facts.describeDataSetFacts({ datasetClasses: [], grids: [], images: [], followers: [] }), '',
            'facts', 'a project without bindings says nothing rather than something vague');
        t.equal(facts.dataSetFactsFor(undefined), '', 'facts', 'and no project folder means no facts');
        t.equal(facts.dataSetFactsFor('/definitely/not/here'), '', 'facts',
            'an unreadable folder never throws — a prompt with fewer facts is better than a failed request');
        // Two datasets, no bindings: still worth saying where the data comes from.
        t.ok(/`A`/.test(facts.describeDataSetFacts({ datasetClasses: ['A'], grids: [], images: [], followers: [] })),
            'facts', 'a DataSet with no grid binding is still named');
    }

    // ---------- 2) the prompts carry it ----------
    {
        const withFacts = assistant.buildFixPrompt({
            language: 'cs', finding: 'CS1061: no member Items', method: 'private void M() { }',
            header: 'using Avalonia.Controls;', facts: facts.describeDataSetFacts(CONTEXT)
        });
        const body = withFacts.map((m) => String(m.content)).join('\n');
        t.ok(/What this form and its data actually are \(authoritative/.test(body), 'prompt',
            'the facts arrive as a block that says it is authoritative');
        t.ok(/follows a column/.test(body), 'prompt', 'with the column-follower fact in it');
        t.ok(/never invent a member that is not in the code above or in this list/.test(body), 'prompt',
            'and an instruction about what to do with it');
        t.ok(body.indexOf('authoritative') < body.indexOf('Fix exactly that problem'), 'prompt',
            'placed before the task, so the contract is the last thing the model reads');

        const without = assistant.buildFixPrompt({
            language: 'cs', finding: 'x', method: 'private void M() { }', header: 'h'
        });
        t.equal(/authoritative/.test(without.map((m) => m.content).join('\n')), false, 'prompt',
            'and nothing at all when there are no facts');

        const implement = assistant.buildImplementPrompt({
            language: 'cs', description: 'link the combo to the grid row', method: 'private void M() { }',
            header: 'using Avalonia.Controls;', facts: facts.describeDataSetFacts(CONTEXT)
        });
        t.ok(/follows a column/.test(implement.map((m) => m.content).join('\n')), 'prompt',
            'the "implement in function" path gets them too — it is the one that wrote the wrong code');
    }

    // ---------- 3) wiring ----------
    {
        const panel = read('src/designerPanel.ts');
        t.ok(/private codeCheckDataSetContext\(projectFolder: string\): DataSetContext \{\s*\n\s*return dataSetContextFor\(projectFolder\);/.test(panel),
            'wiring', 'the panel delegates the mapping, so the rules and the prompts cannot disagree');
        t.equal((panel.match(/const grids: DataSetGridInfo\[\] = \[\];/g) || []).length, 0, 'wiring',
            'and its own copy of the mapping is gone (one implementation, not two)');
        t.ok(/import \{ dataSetContextFor \} from '\.\/dataSetFacts';/.test(panel), 'wiring', 'imported from the module');

        const ui = read('src/assistantUi.ts');
        t.equal((ui.match(/facts: formFactsFor\(/g) || []).length, 3, 'wiring',
            'all three AI request paths pass the facts: implement, fix, and the repair loop');
        t.ok(/function formFactsFor\(file: vscode\.Uri\): string \{/.test(ui), 'wiring',
            'through one helper that finds the project folder itself');
        t.ok(/const project = findProject\(file\);/.test(ui), 'wiring', 'by looking up the form\'s project');

        // The guard: three runtimes, and every one of them checked without starting anything.
        const guard = ui.slice(ui.indexOf('async function repairRuntime'), ui.indexOf('function formFactsFor'));
        t.ok(guard.length > 400, 'guard', 'repairRuntime was found');
        t.ok(/bundledRuntimeRunning\(\)\.running/.test(guard), 'guard', 'the built-in runtime is asked whether it runs');
        t.ok(/ownLlamaServerStatus\(\)/.test(guard), 'guard', 'a server this window started is used');
        t.ok(/await findRunningLlamaServer\(cfg\.endpoint\)/.test(guard), 'guard',
            'and so is one that answers without us — the user\'s own service, which is the case that failed');
        t.ok(/if \(cfg\.backend === 'bundled'\) return undefined;/.test(guard), 'guard',
            'while the built-in runtime is still never started just to repair something');
        t.ok(/return \(await probeServer\(cfg\)\)\.ok \? cfg : undefined;/.test(guard), 'guard',
            'with a probe as the last resort for an external server');
        t.ok(/const resolved = await repairRuntime\(cfg\);/.test(ui), 'guard',
            'the loop uses this resolution, not the one that starts a runtime');
        t.ok(/no model server is running — checked the built-in runtime, your own llama-server and/.test(ui),
            'guard', 'and its refusal names all three, so the log cannot mislead again');
    }
};
