# Avalonia Designer — test suite

Automated tests for the Avalonia Designer VS Code extension (see `TEST_PLAN.md` for the full
plan and log format). The suite is **prepared but not run end-to-end yet** — a smoke run of
every fast layer (T0-compile, T1, T2, T3, T4) passed; the slow T0 10-project build matrix is
deferred to the first full run.

## How to run

From the workspace root:

| Command | Runs |
| --- | --- |
| `npm test` | **Everything** (discovered `*.test.js` files) — includes the slow 10-project dotnet build matrix |
| `npm run test:list` | Lists the discovered test files by layer |
| `npm run test:fast` | T2 logic layer only (fast) |
| `npm run test:build` | T0 build layer (tsc + media syntax + host build + **10 project builds**) |
| `npm run test:preview` | T1 preview layer (spawns the real PreviewerHost) |
| `npm run test:webview` | T3 webview layer (jsdom) |
| `npm run test:runtime` | T4 Avalonia.Headless runtime driver (net10 build) |
| `node tests/runner.js --file compile` | A single test file (substring match on filename) |

Output:

- `tests/out/log.jsonl` — one JSON line per assertion (`ts, layer, feature, action, result, detail`)
- `tests/out/report.md` — human-readable report with pass/fail/skip summary
- exit code is non-zero if any assertion failed

## Layers

| Layer | What it checks | Needs |
| --- | --- | --- |
| `t0-build` | tsc compile, `media/*.js` syntax, C# PreviewerHost build, and every generated project (C#/VB × 5 templates) building 0 errors / 0 warnings | dotnet SDK + NuGet |
| `t1-preview` | PreviewerHost render pipeline: placement bounds, Body auto-fill at 2 sizes, ChromeWindow title bar (navy band, caption buttons, body below bar), empty + compact ListBox, avares image resolution | built host (T0 builds it) |
| `t2-logic` | Pure logic probes: `XamlModel` (move/resize 8 corners, serialize event strip/keep, auto-names, items, ChromeWindow conversion), `codeBehind` (asset + DataSet bind/unbind, VB accessors, handlers, Chrome convert), `propertyCatalog`, `assetCatalog`, `dataSet` model+generator | none (Node) |
| `t3-webview` | `designer.js` in jsdom: click-select, armed-tool drop, locked-Body menu/badge/🔒, outline drag posts ONE resize on drop, file/ItemsSource rows | `jsdom` (installed in `tests/`; layer SKIPs if missing) |
| `t4-runtime` | Avalonia.Headless driver: generates a real project, builds a net10 harness that ProjectReferences it and drives the real `MainWindow` (window created, Body auto-fill + resize-follow, WindowState transitions, placed control keeps position/size) | dotnet SDK, Avalonia.Headless 12.1.1 |
| `t5-vbmatrix` | VB.NET blank project: every toolbox control placed via the production snippets + rendered through the host; every property (from `propertyDefsFor`) applied and verified at runtime (host reflection of values) and at compile (the VB project with ALL controls + ALL properties must build 0 errors; isolated per control on failure). Reports one line per control+property | dotnet SDK, host |

## Adding a new test

Drop a new `tests/<layer>/anything.test.js`. It exports one async function:

```js
module.exports = async (t) => {
    t.section('my layer');
    t.ok(condition, 'feature', 'action', 'detail');        // pass/fail
    t.equal(actual, expected, 'feature', 'action', 'detail'); // deep compare via JSON
    t.pass('feature', 'action', 'detail');                  // unconditional pass
    t.skip('feature', 'action', 'detail');                  // mark skipped
    t.note('free text');                                    // informational only
};
```

The runner discovers it automatically (`*.test.js`, folders `node_modules/out/helpers/fixtures/headless` are skipped), runs it, and records every assertion into `log.jsonl` + `report.md`. No wiring needed.

## Infrastructure notes

- **vscode stub** lives in `tests/stubs/vscode/index.js` (NOT `tests/node_modules` — `npm install`
  prunes anything not in `package.json`). The runner prepends `tests/stubs` to `NODE_PATH` so the
  compiled `out/*.js` modules resolve `require('vscode')` to the stub.
- **jsdom** is a real `devDependency` in `tests/package.json` (install with `cd tests && npm install`).
- **PreviewerHost** is spawned per T1 run on a free port and shut down afterwards.
- T4 regenerates everything under `tests/out/` on each run, so artefacts are inspectable but not stale.
