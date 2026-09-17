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

/** Every diagnostic collection the extension creates`, in creation order (test-only). */
const __diagnosticCollections = [];

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
    // The designer runs builds in a real terminal; tests replace this to observe what would be typed.
    createTerminal: (opts) => ({ name: opts && opts.name, show: () => { }, sendText: () => { }, dispose: () => { } }),
    activeTextEditor: null
};

const commands = { executeCommand: async () => undefined, registerCommand: () => ({ dispose: () => { } }) };

module.exports = {
    Uri,
    workspace,
    window,
    commands,
    EventEmitter,
    // The scope a setting is written to. `configView().update` resolves this through `writeTargetFor`, so a
    // test that stubs `workspace.getConfiguration` needs the enum to exist (0.9.35).
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    ThemeIcon: class { constructor(id) { this.id = id; } },
    TreeItem: class { constructor(label, collapsibleState) { this.label = label; this.collapsibleState = collapsibleState; this.description = ''; this.tooltip = ''; this.iconPath = undefined; } },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    TreeDataProvider: class { },
    DataTransferItem: class { constructor(value) { this.value = value; } },
    DataTransfer: class { set() { } get() { return undefined; } },
    ProgressLocation: { Notification: 15 },
    CancellationTokenSource: class { constructor() { this.token = { isCancellationRequested: false }; } cancel() { } dispose() { } },
    languages: {
        registerCompletionItemProvider: () => ({ dispose: () => { } }),
        // The PROBLEMS pane, in memory and inspectable: `publishIssues` and `publishBuildDiagnostics` are
        // the two places the extension writes diagnostics, and a test can now look at what they published.
        // Every collection created here is pushed to `__diagnosticCollections` (newest last).
        createDiagnosticCollection: (name) => {
            const store = new Map();
            const key = (uri) => (uri && (uri.fsPath ?? String(uri))) ?? '';
            const collection = {
                name,
                set: (uri, list) => {
                    if (Array.isArray(list) && list.length > 0) store.set(key(uri), list);
                    else store.delete(key(uri));
                },
                get: (uri) => store.get(key(uri)),
                all: () => store,
                clear: () => store.clear(),
                dispose: () => store.clear()
            };
            __diagnosticCollections.push(collection);
            return collection;
        }
    },
    Diagnostic: class {
        constructor(range, message, severity) {
            this.range = range;
            this.message = message;
            this.severity = severity;
            this.source = '';
            this.code = undefined;
        }
    },
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    ViewColumn: { Active: -1, One: 1 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    Position: class { constructor(line, character) { this.line = line; this.character = character; } },
    // Both call shapes are used in the extension: `(start, end)` with Positions and `(l1, c1, l2, c2)`.
    Range: class {
        constructor(a, b, c, d) {
            const Pos = module.exports.Position;
            this.start = c === undefined ? a : new Pos(a, b);
            this.end = d === undefined ? b : new Pos(c, d);
        }
    },
    Selection: class { constructor(a, b) { this.start = a; this.end = b; } },
    /** Test-only: every diagnostic collection the extension created, in creation order. */
    __diagnosticCollections
};
