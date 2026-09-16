/* House rules, the VS Code half: read a rule out of the settings for a prompt, and learn new ones from the
 * developer's own files.
 *
 * The split is the same one the whole AI feature uses — `conventions.ts` decides, this file touches VS Code.
 * What "learn" means here is deliberately unglamorous: **count** how the code in this project is written and
 * offer only the patterns that hold almost everywhere (see `MIN_SAMPLES`/`MIN_SHARE` in `conventions.ts`).
 * Nothing is inferred about intent, nothing is sent anywhere, and a project with no house style produces no
 * suggestions rather than a plausible-looking invention.
 *
 * Why the user is asked to accept each one: a rule the developer did not agree to is a rule the model will
 * be held to for every future answer, and the only entity that knows whether "Allman braces" is a decision or
 * an accident is the developer. The evidence goes next to each suggestion (`41 of 41 handlers`) so the
 * question is answerable at a glance.
 */

import * as vscode from 'vscode';
import { configView, updateSetting } from './settingWrite';
import { log } from './logger';
import {
    MAX_CONVENTIONS,
    MIN_SAMPLES,
    MIN_SHARE,
    conventionsBlock,
    deriveConventions,
    normaliseConventions,
    type ConventionFact
} from './conventions';

const SETTINGS = 'avaloniaDesigner.assistant';

/** How many code files are read. Enough for a house style, small enough to be instant. */
const MAX_FILES = 40;

/** Generated and machine-written files have no style of their own — counting them would drown the signal. */
const GENERATED = /(\.g\.|\.designer\.|assemblyinfo|assemblyattributes|\.generated\.|^obj$|^bin$)/i;

/** The rules for one language, as a prompt block — empty when the developer has not set any. */
export function conventionsFor(language: 'cs' | 'vb'): string {
    const raw = configView(SETTINGS).get<unknown>('conventions', []);
    return conventionsBlock(normaliseConventions(raw), language);
}

/**
 * "AI: Learn the House Rules from My Code…" — the measured patterns, offered one by one.
 *
 * Returns true when something was saved, so the caller can refresh the panels that show the list.
 */
export async function learnConventions(): Promise<boolean> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        void vscode.window.showWarningMessage('Open a project folder first — the rules come from its code.');
        return false;
    }
    const files = await vscode.workspace.findFiles(
        '**/*.{cs,vb}',
        '**/{bin,obj,node_modules,.git,.vs,out,dist}/**',
        MAX_FILES * 3
    );
    const readable = files
        .filter((uri) => !GENERATED.test(uri.path.split('/').pop() ?? ''))
        .slice(0, MAX_FILES);
    if (!readable.length) {
        void vscode.window.showWarningMessage(
            `No C# or VB.NET files were found in ${folder.name}, so there is nothing to learn from.`
        );
        return false;
    }

    const samples: { name: string; text: string; language: 'cs' | 'vb' }[] = [];
    for (const uri of readable) {
        try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            samples.push({
                name: uri.path.split('/').pop() ?? uri.path,
                text: Buffer.from(bytes).toString('utf8'),
                language: /\.vb$/i.test(uri.path) ? 'vb' : 'cs'
            });
        } catch {
            /* an unreadable file is not a reason to fail the whole scan */
        }
    }

    const known = normaliseConventions(configView(SETTINGS).get<unknown>('conventions', []));
    const knownText = new Set(known.map((k) => k.toLowerCase()));
    const facts = deriveConventions(samples).filter((f) => !knownText.has(f.text.toLowerCase()));
    log(`House rules: read ${samples.length} file(s), ${facts.length} pattern(s) cleared the gates `
        + `(${MIN_SAMPLES}+ samples, ${Math.round(MIN_SHARE * 100)}% agreement)`);

    if (!facts.length) {
        const already = known.length
            ? ' Everything it found is already in your list.'
            : '';
        void vscode.window.showInformationMessage(
            `${samples.length} file(s) read, and no pattern was strong enough to state as a rule — a rule needs `
            + `at least ${MIN_SAMPLES} examples agreeing ${Math.round(MIN_SHARE * 100)}% of the time.${already}`
        );
        return false;
    }

    const picked = await vscode.window.showQuickPick(
        facts.map((fact) => itemFor(fact, samples.length)),
        {
            title: 'House rules found in your code',
            placeHolder: 'Tick the ones the model should follow (they go into every request)',
            canPickMany: true,
            ignoreFocusOut: true,
            matchOnDescription: true
        }
    );
    if (!picked?.length) return false;

    const chosen = picked.map((p) => p.fact.text);
    const combined = normaliseConventions([...known, ...chosen]);
    const saved = combined.length - known.length;
    await updateSetting(vscode.workspace.getConfiguration(SETTINGS), 'conventions', combined);
    log(`House rules: saved ${saved} new rule(s) — ${combined.length} in total`);
    void vscode.window.showInformationMessage(
        saved === chosen.length
            ? `${saved} house rule(s) saved. They are now part of every request to the local model — edit them `
            + 'in the designer\'s ⚙ Settings panel under *Conventions*.'
            : `Only ${saved} of ${chosen.length} rule(s) fitted: the list stops at ${MAX_CONVENTIONS}. Remove one `
            + 'in the ⚙ Settings panel to make room.'
    );
    return saved > 0;
}

interface ConventionItem extends vscode.QuickPickItem {
    fact: ConventionFact;
}

function itemFor(fact: ConventionFact, files: number): ConventionItem {
    const noun = fact.language === 'cs' ? 'C# members' : 'VB.NET members';
    return {
        label: fact.text,
        // The evidence, in the same words the dialog's own gate uses: "41 of 41 C# members". A suggestion
        // without its numbers is a suggestion the user has to take on faith.
        description: `${fact.samples} of ${fact.total} ${noun}`,
        detail: `Measured in ${files} file(s) of this project`,
        fact
    };
}
