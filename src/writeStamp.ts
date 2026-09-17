/**
 * "Was this code changed by hand (or by the model) since the designer last built it?"
 *
 * The rule the user set on 2026-09-17:
 *
 * > *If the edit comes from an automatic event handler addition by the designer the code usually does not
 * > have syntax problems and the designer has focus, so the check can be done with Code Fix… If the edit was
 * > done by hand or with the ai assisted features, a build is required to check for errors. For hand edits
 * > and ai assisted additions, the check must run when the user switched from the editor tab to the
 * > designer.*
 *
 * The signal for "by hand" is `document.isDirty`: a designer command writes the file to disk, so the buffer
 * reloads clean, while typing in the editor — and a workspace edit applied by the assistant — leaves the
 * buffer modified. The assistant path marks its own edits explicitly as well, because a model write is
 * worth a build whatever the buffer says.
 *
 * A leaf module on purpose: both `designerPanel` and `assistantUi` need it, and neither may import the
 * other. No `vscode`, so the bookkeeping is testable.
 */
const edited = new Map<string, string>();

/**
 * Remembers that a form's code changed outside a tidy designer write. `what` is only for the log/status —
 * the useful part is that the NEXT check of that form must build rather than only run the rules.
 */
export function markCodeEdited(formKey: string, what = 'by hand'): void {
    if (!edited.has(formKey)) edited.set(formKey, what);
}

/** True when that form's code has changed since it was last built. */
export function codeEditedSinceBuild(formKey: string): boolean {
    return edited.has(formKey);
}

/** Why it needs a build (for the status line). */
export function codeEditedReason(formKey: string): string | undefined {
    return edited.get(formKey);
}

/** Called once the form has been checked with a build. */
export function clearCodeEdited(formKey: string): void {
    edited.delete(formKey);
}

/** Test seam: forget everything (a fresh window must not inherit another one's state). */
export function resetCodeEdited(): void {
    edited.clear();
}
