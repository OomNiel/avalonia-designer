import * as vscode from 'vscode';

/** A single shared output channel ("Avalonia Designer") for extension diagnostics.
 *  Visible in: View → Output → "Avalonia Designer" (more reliable than console.log,
 *  which only lands in the Extension Host output, not the exthost.log file). */
let channel: vscode.OutputChannel | undefined;

export function log(msg: string): void {
    if (!channel) channel = vscode.window.createOutputChannel('Avalonia Designer');
    const ts = new Date().toISOString().slice(11, 19);
    channel.appendLine(`[${ts}] ${msg}`);
}

export function logError(err: unknown): void {
    log('ERROR: ' + (err instanceof Error ? err.message : String(err)));
}
