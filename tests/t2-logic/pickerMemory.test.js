/* T2 — the runtime half of the folder memory: the bundled CHART control and the bundled PATH PICKER
 * remember the folder their picker used, in the per-user app-data folder, so it survives a restart.
 *
 * Why this exists: this code ships inside every generated project, in two languages, and the failure
 * is silent — the picker still works, it just forgets. `PathPicker` used to keep the folder in a
 * static field ("remembered for the process lifetime"), which is exactly the kind of promise that
 * looks like a feature until the app is restarted.
 *
 * The two twins also have to carry the new token, because the token IS how an existing project
 * receives the change: the bundled-file refresh in `bundledComponents.ts` compares the marker, so a
 * file whose marker moved is rewritten the next time the designer saves the form.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, 'resources', file), 'utf8');
const { bundledComponentSpecs } = require('../../out/bundledComponents.js');

module.exports = async (t) => {
    t.section('pickerMemory');

    /** Asserts that `source` contains `needle` (a plain substring — these are source-shape checks). */
    const has = (source, needle, area, message) => {
        t.ok(source.includes(needle), area, message, needle);
    };
    const before = (source, first, second, area, message) => {
        const a = source.indexOf(first);
        const b = source.indexOf(second);
        t.ok(a >= 0 && b >= 0 && a < b, area, message, `${a} < ${b}`);
    };

    // ---------------------------------------------------------------- the chart control, both twins
    for (const [lang, file, kind, memory] of [
        ['C#', 'GrumpyCharts.cs', 'internal static class', 'ChartPickerMemory'],
        ['VB', 'GrumpyCharts.vb', 'Friend NotInheritable Class', 'ChartPickerMemory']
    ]) {
        const source = read(file);
        const area = `chart-${lang}`;
        has(source, memory, area, `${lang}: the chart has its own picker memory`);
        has(source, kind, area, `${lang}: declared as a ${kind} (it is internal plumbing, not API)`);
        has(source, 'GrumpyCharts.lastfolder', area,
            `${lang}: its own store file, so the chart and the path picker do not fight over one value`);
        has(source, 'SpecialFolder.LocalApplicationData', area,
            `${lang}: stored in the per-user app-data folder (the place the generated DataSet helpers use)`);
        has(source, 'GetTempPath()', area, `${lang}: with a temp fallback when there is no app-data folder`);
        has(source, 'Directory.Exists', area,
            `${lang}: a remembered folder that is gone is not offered to the platform`);
        has(source, 'File.WriteAllText', area, `${lang}: picking a folder writes it`);
        has(source, 'File.Delete', area, `${lang}: and clearing the value removes the file`);
        has(source, 'SuggestedStartLocation', area, `${lang}: the dialog is told where to start`);
        has(source, 'GetDirectoryName', area, `${lang}: what is remembered is the folder the file is in`);
        // Order matters: read the memory BEFORE the dialog, write it AFTER the user picked.
        before(source, 'ChartPickerMemory.LastFolder', 'OpenFilePickerAsync', area,
            `${lang}: the folder is read before the dialog opens`);
        const pick = source.indexOf('OpenFilePickerAsync');
        const remember = source.indexOf('ChartPickerMemory.LastFolder =', pick);
        t.ok(pick >= 0 && remember > pick, area,
            `${lang}: and remembered only once a file was actually picked`, `${pick} -> ${remember}`);
    }

    // The marker moved on again when the Data Selector arrived: the panel now writes SourceSheet /
    // SourceKind / DataFile, which an older copy cannot compile (2026-09-21). It moved once more on
    // 2026-09-22, when the bar and the pie lost their cursors and gained a hover readout and the pie
    // gained HoverExplode — then to the waterfall type, then to `IsFilled` when every chart gained the
    // fill/restore menu entry (a behaviour change, which no XAML attribute reveals), then up to the
    // waterfall's filled surface (`SurfaceFill` / `SurfaceToFloor`) and back down again when that was
    // removed — then to the surface chart 3D (`GrumpySurfacePlot`), and on 2026-09-24 to the triangle
    // band fill (`BandTriangle`) that stopped a folded band showing the plot's own backcolour through the
    // sheet: a DRAWING change in an existing type, which a project's old copy cannot show either. It stays
    // the newest token in BOTH twins, which is what refreshes existing projects.
    for (const [lang, file] of [['C#', 'GrumpyCharts.cs'], ['VB', 'GrumpyCharts.vb']]) {
        const marker = bundledComponentSpecs(lang === 'VB')
            .find((s) => s.kind === 'GrumpyCharts').marker;
        t.equal(marker, 'CutToWindow', `chart-${lang}`,
            `${lang}: the GrumpyCharts staleness marker is the newest thing an existing project needs`);
        has(read(file), marker, `chart-${lang}`,
            `${lang}: so the shipped file never looks stale (and a project's old copy is refreshed)`);
    }

    // ---------------------------------------------------------------- PathPicker, both twins
    for (const [lang, file, memory] of [
        ['C#', 'PathPicker.cs', 'class PickerFolderMemory'],
        ['VB', 'PathPicker.vb', 'Class PickerFolderMemory']
    ]) {
        const source = read(file);
        const area = `picker-${lang}`;
        has(source, memory, area, `${lang}: PathPicker has a persisted folder memory`);
        has(source, 'PathPicker.lastfolder', area, `${lang}: its own store file`);
        has(source, 'SpecialFolder.LocalApplicationData', area, `${lang}: in the per-user app-data folder`);
        has(source, 'Directory.Exists', area, `${lang}: a folder that is gone is ignored`);
        has(source, 'File.WriteAllText', area, `${lang}: the pick writes it`);
        has(source, 'IsNullOrWhiteSpace(LastFolder)', area,
            `${lang}: the browse flow reads the memory (an explicit InitialFolder is the fallback)`);
        has(source, 'InitialFolder', area, `${lang}: InitialFolder is still honoured when there is no memory`);
        const set = source.indexOf('LastFolder = FolderOf(', source.indexOf('BrowseAsync'));
        t.ok(set > 0, area, `${lang}: and the pick updates it — FolderOf keeps the dialog's parent folder`);
        // The old promise is gone: it used to be a static field kept "for the process lifetime".
        t.equal(/_lastFolder/.test(source), false, area,
            `${lang}: no field-only memory is left behind (that is the bug this replaces)`);
    }
    for (const [lang, file] of [['C#', 'PathPicker.cs'], ['VB', 'PathPicker.vb']]) {
        const marker = bundledComponentSpecs(lang === 'VB')
            .find((s) => s.kind === 'PathPicker').marker;
        t.equal(marker, 'PickerFolderMemory', `picker-${lang}`,
            `${lang}: the PathPicker staleness marker is the new memory class`);
        has(read(file), marker, `picker-${lang}`, `${lang}: present in the shipped file`);
    }

    // ---------------------------------------------------------------- the two are independent
    const chartsCs = read('GrumpyCharts.cs');
    const pickerCs = read('PathPicker.cs');
    t.equal(chartsCs.includes('PickerFolderMemory'), false, 'independent',
        'the chart does not depend on PathPicker (each bundled file is self-contained)');
    t.equal(pickerCs.includes('ChartPickerMemory'), false, 'independent',
        'nor the other way round');
};
