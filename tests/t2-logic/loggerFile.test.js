/* T2 — the log file's own limits (`src/logger.ts`).
 *
 * Asked 2026-09-18: *"How large is the log file? I think we should clamp it's length limited."* — and the
 * clamp that existed was the wrong kind: `appendToMirror` deleted the **whole file** once it passed 512 KB.
 * That file was 504 KB holding three days of work at the time — every diagnosis of the 30B step-up, the
 * CS1002 rule and the missing `;` — so one more line would have erased all of it, and its first line showed
 * it had already happened once before.
 *
 * These assertions pin the replacement: the oldest lines go, the newest are kept, the cut lands on a line
 * boundary, a marker says what happened, and no single line can own the whole budget.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { log, mirrorLogTo, MIRROR_LIMITS } = require('../../out/logger.js');

module.exports = async (t) => {
    t.section('logger-file');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-log-'));
    const file = path.join(dir, 'ai.log');
    mirrorLogTo(file);

    // A file well past the limit, written exactly the way the extension writes it.
    const filler = 'x'.repeat(200);
    for (let i = 0; i < 4000; i += 1) log(`filler ${i} ${filler}`);

    const size = fs.statSync(file).size;
    // The measurement happens once every `statEvery` lines, so the file may run over by that much.
    const slack = MIRROR_LIMITS.statEvery * 240;
    t.ok(size <= MIRROR_LIMITS.maxBytes + slack, 'size',
        `the file is clamped near the limit instead of growing forever (${Math.round(size / 1024)} KB)`);

    const text = fs.readFileSync(file, 'utf8');
    t.ok(/^\[[^\]]+\] --- trimmed: the oldest \d+ KB were dropped/.test(text), 'marker',
        'and it says so in its first line, so a reader knows the history was cut');
    t.ok(/\n\[[^\]]+\] --- trimmed:/.test(text.slice(0, 4000)) === false, 'marker',
        'the marker is not repeated by every later trim of the same file');
    t.ok(/filler 0 /.test(text) === false, 'boundary', 'the oldest lines really are gone');

    // The newest lines survive, and the trim left room — it is not done on every append.
    log('LAST LINE BEFORE CHECK');
    const after = fs.readFileSync(file, 'utf8');
    t.ok(after.trimEnd().endsWith('LAST LINE BEFORE CHECK'), 'tail', 'the newest line is the last one');
    t.ok(after.length < MIRROR_LIMITS.maxBytes, 'tail',
        `the trim left headroom (${Math.round(after.length / 1024)} KB of ${Math.round(MIRROR_LIMITS.maxBytes / 1024)} KB)`);
    t.ok(/filler 3999 /.test(after), 'tail', 'and the lines just before it are still there');
    // The first kept line is a whole line: a fragment at the top of a log reads as corruption.
    const firstKept = after.split('\n').find((l) => !/--- trimmed:/.test(l) && l.trim() !== '');
    t.ok(/^\[[^\]]+\] filler \d+ /.test(firstKept), 'boundary',
        'every kept line is complete, timestamp and all', firstKept && firstKept.slice(0, 90));

    // A single runaway line must not own the budget (a build can print one enormous line).
    log(`runaway ${'y'.repeat(9000)}`);
    const cut = fs.readFileSync(file, 'utf8').trimEnd().split('\n').pop();
    t.ok(cut.length <= MIRROR_LIMITS.maxLine + 120, 'line-cap',
        `one huge line is cut instead of stored whole (${cut.length} characters on disk)`);
    t.ok(/\(\d+ characters cut\)/.test(cut), 'line-cap', 'and the cut is admitted in the line itself');

    // Leave the mirror somewhere harmless for whatever test runs next, then clean up.
    mirrorLogTo(path.join(os.tmpdir(), 'adb-log-after-tests.log'));
    fs.rmSync(dir, { recursive: true, force: true });
};
