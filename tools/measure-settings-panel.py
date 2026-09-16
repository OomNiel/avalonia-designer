#!/usr/bin/env python3
"""Writes a standalone page of the ⚙ Settings dialog, so its size can be MEASURED instead of guessed.

    python3 tools/measure-settings-panel.py
    # then open tests/out/settings-measure.html (the integrated browser) and ask it:
    #   page.setViewportSize({width:1024,height:700}); window.__measure()

WHY THIS EXISTS. The panel's size has been the subject of two user reports — "hides the top and bottom items"
(2026-09-15) and "it needs a few lines of height to be added" (2026-09-16) — and both were answered by
measuring in Chromium against the REAL stylesheet and the REAL markup, at the sizes a developer actually has.
Guessing at CSS numbers is how a "fix" becomes a second report: `max-height`, a sticky footer and a folded
section interact, and jsdom (T3) has no layout engine at all.

It renders only the webview's own HTML + CSS — no extension host, no app, nothing that needs the user's
machine — and it is NOT part of `npm test`: it is a tape measure, not a test.

The page exposes `window.__measure()`:
    { viewport, boxH, top, contentH, hiddenPx, scrolls, houseRulesVisible, saveBottom }
"""

import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main() -> int:
    source = (ROOT / 'src' / 'designerPanel.ts').read_text()
    start = source.index('<div id="settingsModal"')
    end = source.index('<div id="itemsModal"')
    markup = source[start:end].rsplit('</div>', 1)[0] + '</div>'

    css = (ROOT / 'media' / 'designer.css').read_text()
    # VS Code supplies the theme variables; the page needs plausible values for all of them, including the
    # ones a rule only uses as a fallback (`var(--accent, #4ea1ff)`).
    values = {
        'panel': '#252526', 'panel-2': '#1e1e1e', 'fg': '#e6e6e6', 'fg-dim': '#9d9d9d',
        'border': '#3c3c3c', 'accent': '#4ea1ff', 'bg': '#1e1e1e', 'hover': '#2a2d2e',
        'vscode-editor-font-family': "'DejaVu Sans Mono', monospace",
    }
    variables = sorted(set(re.findall(r'var\((--[\w-]+)[,)]', css)))
    declarations = '\n'.join(
        f'  {name}: {values.get(name[2:], "#8a8a8a" if "dim" in name else "#3c3c3c")};'
        for name in variables
    )

    out = ROOT / 'tests' / 'out' / 'settings-measure.html'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
:root {{
{declarations}
}}
html, body {{ margin: 0; height: 100%; background: #1e1e1e; color: #e6e6e6;
  font-family: system-ui, sans-serif; font-size: 13px; }}
{css}
</style></head><body>
{markup}
<script>
// The webview keeps the modal hidden until the extension answers, and shows the AI body only when the
// feature is switched on. Here the dialog is the subject, so both are shown and the AI section can be
// folded or expanded per measurement.
const modal = document.getElementById('settingsModal');
modal.hidden = false;
document.getElementById('aiBody').hidden = false;
document.getElementById('aiOptions').hidden = false;
window.__measure = () => {{
  const box = modal.querySelector('.modal-box');
  const save = box.querySelector(':scope > .modal-buttons');
  const rules = document.getElementById('aiConvText');
  const r = box.getBoundingClientRect();
  return {{
    viewport: window.innerHeight,
    boxH: Math.round(r.height),
    top: Math.round(r.top),
    contentH: Math.round(box.scrollHeight),
    hiddenPx: Math.max(0, box.scrollHeight - box.clientHeight),
    scrolls: box.scrollHeight > box.clientHeight + 1,
    houseRulesVisible: rules.getBoundingClientRect().bottom <= r.bottom - 2,
    saveBottom: Math.round(save.getBoundingClientRect().bottom)
  }};
}};
</script></body></html>""")
    print(f'wrote {out.relative_to(ROOT)} ({len(variables)} CSS variables, {len(markup)} chars of markup)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
