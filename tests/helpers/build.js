/* Project generation + dotnet build helpers shared by T0 / T2 / T4. */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(__dirname, '..', 'out', 'projects');

/** Builds the C# host first (needed by T1). Returns { ok, summary } or throws. */
function buildHost() {
    return dotnetBuild(path.join(ROOT, 'host', 'PreviewerHost.csproj'));
}

/** Runs `dotnet build -c Debug` in a folder or on a csproj; returns { ok, summary, output }. */
function dotnetBuild(target) {
    const cwd = target.toLowerCase().endsWith('.csproj') || target.toLowerCase().endsWith('.vbproj')
        ? path.dirname(target)
        : target;
    const project = target.toLowerCase().endsWith('.csproj') || target.toLowerCase().endsWith('.vbproj') ? target : '';
    try {
        const cmd = project ? `dotnet build "${project}" -c Debug --no-incremental` : 'dotnet build -c Debug --no-incremental';
        const output = execSync(cmd, { cwd, encoding: 'utf8', timeout: 300000 });
        const warn = /(\d+)\s+Warning\(s\)/.exec(output);
        const err = /(\d+)\s+Error\(s\)/.exec(output);
        return { ok: (err ? parseInt(err[1], 10) : 0) === 0, warnings: warn ? parseInt(warn[1], 10) : 0, errors: err ? parseInt(err[1], 10) : 0, output };
    } catch (e) {
        return { ok: false, warnings: -1, errors: -1, output: String(e.stdout || e.message) };
    }
}

/** Generates a project into OUT_DIR/<name> using the extension's real scaffolding. */
function generateProject({ language, tplId, name, outDir = OUT_DIR }) {
    const { generateProjectScaffold } = require(path.join(ROOT, 'out', 'projectScaffold.js'));
    const { TEMPLATES } = require(path.join(ROOT, 'out', 'formTemplates.js'));
    const tpl = TEMPLATES.find((t) => t.id === tplId);
    if (!tpl) throw new Error(`unknown template ${tplId}`);
    const dir = path.join(outDir, name);
    fs.rmSync(dir, { recursive: true, force: true });
    const chromeCs = readResource('ChromeWindow.cs');
    const chromeVb = readResource('ChromeWindow.vb');
    const anchorCs = readResource('AnchorHelper.cs');
    const anchorVb = readResource('AnchorHelper.vb');
    generateProjectScaffold({
        language, tpl, name, projectPath: dir,
        chromeCs, chromeVb, anchorCs, anchorVb
    });
    return dir;
}

function readResource(file) {
    const p = path.join(ROOT, 'resources', file);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

module.exports = { buildHost, dotnetBuild, generateProject, OUT_DIR, ROOT };
