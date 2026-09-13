/* T2 — generated code must not depend on an implicit `using System;`.
 *
 * Regression (user report): dropping a StatusDate control generated a live-clock handler using
 * `TimeSpan.FromSeconds(1)` and `DateTime.Now`, and the C# build failed with CS0103 — *"The name
 * 'DateTime' does not exist in the current context"* — because generated code-behinds carry no
 * `using System;`. The very same snippets already referenced `System.Globalization.CultureInfo`
 * fully qualified, so the fix is to qualify these too (`System.DateTime` is valid in VB as well).
 *
 * The DataSet generator is covered behaviourally (a DateTime column); the clock handler has no public
 * entry point, so it is guarded at source level — a guard that would have caught the original bug.
 * Comments are stripped first, since they are allowed to mention the unqualified names.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { generateCs, generateVb } = require('../../out/dataSetGenerator.js');
const { defaultDataSetSpec, newTableSpec, newColumnSpec } = require('../../out/dataSetModel.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Strip `//` and `/* … *​/` comments so only emitted code is inspected. */
const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Unqualified `DateTime.X` / `TimeSpan.X` occurrences (a `System.` prefix makes them legit). */
const bareSystemTypes = (text) => [...text.matchAll(/[^.\w](DateTime\.[A-Za-z]+|TimeSpan\.[A-Za-z]+)/g)]
    .map((m) => m[1]);

module.exports = async (t) => {
    t.section('T2: generated code / System types');

    // ---------- DataSet generator: a DateTime column ----------
    const spec = defaultDataSetSpec('SysTypes');
    const table = newTableSpec(spec);
    table.name = 'Events';
    const col = newColumnSpec(table);
    col.name = 'When';
    col.caption = 'When';
    col.type = 'DateTime';
    col.sampleValue = '2024-01-02T03:04:05';
    table.columns = [col];
    spec.tables = [table];

    const cs = generateCs(spec);
    t.ok(/DateTime/.test(cs), 'dataset-cs', 'the DateTime column is generated', '');
    t.ok(/^using System;/m.test(cs), 'dataset-cs',
        'and the generated C# DataSet file imports System (so unqualified DateTime IS legal there)');

    const vb = generateVb(spec);
    t.ok(/DateTime/.test(vb), 'dataset-vb', 'the VB DataSet generates the DateTime column too', '');
    t.ok(/^Imports System$/m.test(vb), 'dataset-vb', 'and that file Imports System');

    // ---------- the CODE-BEHIND is the file without `using System;` ----------
    // That is the premise of the rule, so the premise itself is asserted: `buildCsCodeBehind` emits
    // only `using Avalonia.Controls;`. Anything the designer INSERTS into a code-behind must therefore
    // qualify System types (or add the using itself) — which is exactly what the clock handler got
    // wrong.
    const templates = read('src/formTemplates.ts');
    t.ok(/using Avalonia\.Controls;/.test(templates) && !/using System;/.test(templates), 'source',
        'the generated C# code-behind does not import System');

    t.equal(bareSystemTypes(stripComments(read('src/codeBehind.ts'))), [], 'source',
        'src/codeBehind.ts emits no unqualified System type into a code-behind');
};
