import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/** A single shared output channel ("Avalonia Designer") for extension diagnostics.
 *  Visible in: View → Output → "Avalonia Designer" (more reliable than console.log,
 *  which only lands in the Extension Host output, not the exthost.log file). */
let channel: vscode.OutputChannel | undefined;

/**
 * The file every line is mirrored into as well, once something calls `mirrorLogTo`.
 *
 * This exists because the split was invisible for a whole afternoon: `aiLog` wrote the file while the AI
 * client called plain `log`, so `logs/ai.log` was 766 lines of panel and load chatter with **not one**
 * `AI request:` or failure line in it — and that file is what a report gets checked against. One sink, so
 * "which log do I read?" has one answer.
 */
let mirror: string | undefined;

/** Mirror every line to this file (the caller decides where; `aiLog` passes `logs/ai.log`). */
export function mirrorLogTo(file: string): void {
    mirror = file;
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
    } catch {
        /* best effort: an unwritable log must not break a load */
    }
}

function appendToMirror(msg: string): void {
    if (!mirror) return;
    try {
        if (fs.existsSync(mirror) && fs.statSync(mirror).size > 512 * 1024) fs.rmSync(mirror, { force: true });
        fs.appendFileSync(mirror, `[${new Date().toISOString()}] ${msg}\n`);
    } catch {
        /* logging must never be the reason something fails */
    }
}

export function log(msg: string): void {
    if (!channel) channel = vscode.window.createOutputChannel('Avalonia Designer');
    const ts = new Date().toISOString().slice(11, 19);
    channel.appendLine(`[${ts}] ${msg}`);
    appendToMirror(msg);
}

export function logError(err: unknown): void {
    log('ERROR: ' + (err instanceof Error ? err.message : String(err)));
}
