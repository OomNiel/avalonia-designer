/* T0 — Every generated project (C#/VB × all 5 templates) must build with 0 errors / 0 warnings.
 * 10 dotnet builds — this layer is the slowest and is normally run on demand (not every iteration). */
'use strict';
const { generateProject, dotnetBuild, OUT_DIR } = require('../helpers/build');
const { TEMPLATES } = require('../../out/formTemplates.js');

module.exports = async (t) => {
    t.section('T0: generated projects build (10 combos)');
    t.note(`output → ${OUT_DIR}`);

    for (const language of ['cs', 'vb']) {
        for (const tpl of TEMPLATES) {
            const name = `proj_${language}_${tpl.id}`;
            t.note(`generating ${language}/${tpl.id} → ${name}`);
            const dir = generateProject({ language, tplId: tpl.id, name });
            const r = dotnetBuild(dir);
            t.equal(r.errors, 0, 'project-build', `${language}/${tpl.id}`,
                `errors=${r.errors} warnings=${r.warnings}`);
            t.equal(r.warnings, 0, 'project-build', `${language}/${tpl.id} (warnings)`,
                `warnings=${r.warnings}`);
        }
    }
};
