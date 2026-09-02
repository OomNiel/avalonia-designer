import * as vscode from 'vscode';
import { createNewProject, openLastProject, lastProjectPath, onLastProjectChanged } from './projectCreator';
import * as logger from './logger';

/**
 * "New Project" sidebar view (inside the Avalonia Designer Activity Bar container) —
 * quick-launch buttons for creating a new C# or VB.NET Avalonia project and for
 * reopening the most recent project.
 */
export class ProjectViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'avaloniaDesigner.projects';

  private _view: vscode.WebviewView | undefined;

  constructor(private readonly _extensionUri: vscode.Uri) {
    // Keep the webview's "Last project" line in sync after creation.
    onLastProjectChanged(() => this._postState());
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    logger.log('resolving New Project view');
    try {
      this._view = webviewView;
      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')]
      };
      webviewView.webview.html = this._getHtml();

      webviewView.webview.onDidReceiveMessage((message) => {
        if (!message) return;
        switch (message.command) {
          case 'createCs':
            void createNewProject(requireContext(), 'cs');
            break;
          case 'createVb':
            void createNewProject(requireContext(), 'vb');
            break;
          case 'openProject':
            void openLastProject(requireContext());
            break;
          case 'getState':
            this._postState();
            break;
        }
      });
      logger.log('New Project view resolved (webview HTML set)');
    } catch (err) {
      logger.logError(err);
      logger.log('New Project view FAILED to resolve');
    }
  }

  private _postState(): void {
    if (this._view) {
      this._view.webview.postMessage({
        command: 'state',
        hasProject: Boolean(lastProjectPath),
        lastProject: lastProjectPath || ''
      });
    }
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  html, body {
    height: 100%;
    margin: 0;
  }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    background-color: var(--vscode-sideBar-background);
    color: var(--vscode-sideBar-foreground);
    padding: 12px;
    /* Flex column so the view contents fill the full sidebar height and
       re-layout dynamically when the sidebar is resized: the action buttons
       stay pinned to the top, the "last project" line grows/shrinks with its
       text, and the hint sits at the bottom of the view. */
    display: flex;
    flex-direction: column;
  }
  h1 { font-size: 13px; font-weight: 600; margin: 0 0 6px 0; }
  p  { font-size: 12px; opacity: 0.8; margin: 0 0 14px 0; line-height: 1.5; }
  code { font-family: var(--vscode-editor-font-family); }
  button {
    width: 100%;
    padding: 9px 0;
    font-size: 13px;
    font-family: inherit;
    color: var(--vscode-button-foreground);
    background-color: var(--vscode-button-background);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    margin-bottom: 8px;
  }
  button:hover { background-color: var(--vscode-button-hoverBackground); }
  button.secondary {
    color: var(--vscode-button-secondaryForeground);
    background-color: var(--vscode-button-secondaryBackground);
  }
  button.secondary:hover { background-color: var(--vscode-button-secondaryHoverBackground); }
  .last { font-size: 11px; opacity: 0.7; margin: 8px 0; word-break: break-all; line-height: 1.4; }
  /* margin-top:auto in a flex column pins the hint to the bottom of the view,
     so it grows into empty space instead of leaving a dead gap under short content. */
  .hint { font-size: 11px; opacity: 0.6; margin-top: auto; line-height: 1.5; }
</style>
</head>
<body>
  <h1>New Avalonia project</h1>
  <p>Create a ready-to-run project (net10.0, Avalonia 12, custom title bar) with a
     pre-designed main form, then open it in the <b>Avalonia Designer</b> to edit it visually.</p>
  <button id="createCs">Create C# Project…</button>
  <button id="createVb">Create VB.NET Project…</button>
  <button id="open" class="secondary">Open Created Project</button>
  <div id="last" class="last" style="display:none"></div>
  <div class="hint">Also available via the Command Palette:
     “Avalonia: New Project…” and “Avalonia: Open Created Project”.</div>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('createCs').addEventListener('click', () => {
      vscode.postMessage({ command: 'createCs' });
    });
    document.getElementById('createVb').addEventListener('click', () => {
      vscode.postMessage({ command: 'createVb' });
    });
    document.getElementById('open').addEventListener('click', () => {
      vscode.postMessage({ command: 'openProject' });
    });
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg && msg.command === 'state') {
        const last = document.getElementById('last');
        if (msg.hasProject) {
          last.textContent = 'Last: ' + msg.lastProject;
          last.style.display = 'block';
        } else {
          last.textContent = '';
          last.style.display = 'none';
        }
      }
    });
    vscode.postMessage({ command: 'getState' });
  </script>
</body>
</html>`;
  }
}

// The projectCreator entry points need the extension context for globalState.
// Store it once at activation.
let activeContext: vscode.ExtensionContext | undefined;
export function setActiveContext(context: vscode.ExtensionContext): void {
  activeContext = context;
}
function requireContext(): vscode.ExtensionContext {
  if (!activeContext) {
    throw new Error('Extension context not initialised yet.');
  }
  return activeContext;
}
