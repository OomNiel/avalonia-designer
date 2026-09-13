/* T2 — the shared `.adset` reader (src/dataSetReader.ts).
 *
 * It caches the parsed schemas because six lookups read them and a single render reaches several of
 * them (each call used to walk the tree and read + parse every schema, synchronously). The cache is
 * validated on every call — file list, sizes and newest mtime — so an edit made here, by the DataSet
 * designer in another panel, or by an external tool is picked up with NO invalidation hook that a
 * future writer could forget to call. These tests pin exactly that.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readDataSetFiles, walkAdsets, invalidateDataSetFiles } = require('../../out/dataSetReader.js');

const spec = (name) => JSON.stringify({ version: 1, name, tables: [] });

module.exports = async (t) => {
    t.section('T2: .adset reader');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-reader-'));
    try {
        fs.mkdirSync(path.join(root, 'sub'));
        fs.mkdirSync(path.join(root, 'bin'));
        fs.writeFileSync(path.join(root, 'bin', 'build-output.adset'), spec('Nope'));
        const alpha = path.join(root, 'Data.adset');
        fs.writeFileSync(alpha, spec('Alpha'));
        fs.writeFileSync(path.join(root, 'sub', 'More.adset'), spec('Beta'));

        const first = readDataSetFiles(root);
        t.equal(first.length, 2, 'walk', 'both .adset files are found');
        t.equal(walkAdsets(root).length, 2, 'walk', 'bin/ is skipped');
        t.equal(first.map((f) => f.spec.name).sort(), ['Alpha', 'Beta'], 'parse', 'and both parsed');

        t.ok(readDataSetFiles(root) === first, 'cache', 'an unchanged folder reuses the parsed result');

        // An edit with NO invalidation must be visible (this is what makes the cache safe to use).
        fs.writeFileSync(alpha, spec('AlphaEdited'));
        const second = readDataSetFiles(root);
        t.ok(second !== first, 'fresh', 'an edit invalidates the entry by itself');
        t.equal(second.find((f) => f.adsetPath === alpha).spec.name, 'AlphaEdited', 'fresh',
            'and the edited content is read');
        t.ok(readDataSetFiles(root) === second, 'cache', 'the re-read result is cached again');

        fs.writeFileSync(path.join(root, 'Third.adset'), spec('Gamma'));
        t.equal(readDataSetFiles(root).length, 3, 'added', 'a new .adset is picked up');

        fs.rmSync(path.join(root, 'Third.adset'));
        t.equal(readDataSetFiles(root).length, 2, 'removed', 'a deleted .adset disappears');

        fs.writeFileSync(path.join(root, 'Broken.adset'), '{ not json');
        const withBroken = readDataSetFiles(root);
        t.equal(withBroken.length, 2, 'corrupt', 'a corrupt .adset is skipped');
        t.ok(withBroken.every((f) => f.spec && Array.isArray(f.spec.tables)), 'corrupt',
            'while the others still parse');

        invalidateDataSetFiles(root);
        t.ok(readDataSetFiles(root) !== withBroken, 'invalidate', 'invalidate drops the entry');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
};
