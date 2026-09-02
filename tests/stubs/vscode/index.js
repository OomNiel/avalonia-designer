/* Minimal vscode stub for probing TS modules outside the extension host. */
const fs = require('fs');
const path = require('path');

class Uri {
    constructor(scheme, fsPath) { this.scheme = scheme; this.fsPath = fsPath; this.path = fsPath; }
    static file(p) { return new Uri('file', p); }
    toString() { return `${this.scheme}://${this.fsPath}`; }
    with(change) { return new Uri(change.scheme || this.scheme, change.fsPath || this.fsPath); }
}

class EventEmitter {
    constructor() { this.listeners = []; }
    event(listener) { this.listeners.push(listener); return { dispose: () => { } }; }
    fire(data) { for (const l of this.listeners) l(data); }
    dispose() { this.listeners = []; }
}

const workspace = {
    fs: {
        writeFile: async (uri, content) => { fs.writeFileSync(uri.fsPath, Buffer.from(content)); },
        readFile: async (uri) => fs.readFileSync(uri.fsPath),
        stat: async (uri) => ({ type: 1, mtime: 0, size: 0 }),
        delete: async (uri) => { try { fs.unlinkSync(uri.fsPath); } catch { } },
        createDirectory: async (uri) => fs.mkdirSync(uri.fsPath, { recursive: true })
    },
    getConfiguration: () => ({ get: () => undefined, update: async () => { } }),
    onDidSaveTextDocument: () => ({ dispose: () => { } })
};

const window = {
    showInformationMessage: () => Promise.resolve(undefined),
    showWarningMessage: () => Promise.resolve(undefined),
    showErrorMessage: () => Promise.resolve(undefined),
    showQuickPick: async () => undefined,
    showOpenDialog: async () => undefined,
    showTextDocument: async () => ({ document: { positionAt: () => ({ line: 0, character: 0 }) }, selection: null, revealRange: () => { } }),
    createOutputChannel: () => ({ appendLine: () => { }, show: () => { } }),
    activeTextEditor: null
};

const commands = { executeCommand: async () => undefined, registerCommand: () => ({ dispose: () => { } }) };

module.exports = {
    Uri,
    workspace,
    window,
    commands,
    EventEmitter,
    ThemeIcon: class { constructor(id) { this.id = id; } },
    TreeItem: class { constructor(label, collapsibleState) { this.label = label; this.collapsibleState = collapsibleState; this.description = ''; this.tooltip = ''; this.iconPath = undefined; } },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    TreeDataProvider: class { },
    DataTransferItem: class { constructor(value) { this.value = value; } },
    DataTransfer: class { set() { } get() { return undefined; } },
    ProgressLocation: { Notification: 15 },
    CancellationTokenSource: class { constructor() { this.token = { isCancellationRequested: false }; } cancel() { } dispose() { } },
    languages: { registerCompletionItemProvider: () => ({ dispose: () => { } }) },
    ViewColumn: { Active: -1, One: 1 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    Position: class { constructor(line, character) { this.line = line; this.character = character; } },
    Range: class { constructor(a, b) { this.start = a; this.end = b; } },
    Selection: class { constructor(a, b) { this.start = a; this.end = b; } }
};
