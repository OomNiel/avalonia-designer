/* House rules — the idioms this developer's own code uses, remembered and put in the prompt.
 *
 * WHERE THIS CAME FROM (asked 2026-09-16): *"is it possible to 'train' the model in the extension as it gains
 * experience from the user?"* Fine-tuning was answered **no, not honestly** — a LoRA on a 12B needs dedicated
 * VRAM this machine does not have, and it would produce a model file to version, verify and explain. This is
 * the cheap, deterministic version of the same wish: the *things* a reviewer would keep correcting are facts
 * about the code in front of us, and they can be **measured** rather than guessed.
 *
 * WHAT MAKES A FACT WORTH KEEPING. Every rule here is counted, not judged:
 *
 *   - it needs a minimum number of samples (`MIN_SAMPLES`) — "the handler naming is Control_Event" means
 *     nothing when there were two handlers;
 *   - it needs the share to be overwhelming (`MIN_SHARE`) — a codebase split 60/40 has no convention, and
 *     telling the model to follow one of them would be inventing a house style;
 *   - it says how sure it is, out loud (`samples`/`total`), so the dialog can show *"41 of 41 handlers"*
 *     instead of asking the user to trust a sentence.
 *
 * Nothing here calls a model. Nothing here is persisted: the facts are derived from the user's files on
 * demand, the ones they accept are stored as settings, and the prompt gets the accepted list. That is also
 * why this file has no `vscode` import — the rules are a function of text, so the suite can drive them with
 * strings (including the two shapes this machine's own projects really have).
 */

/** One measured pattern, with the evidence behind it. */
export interface ConventionFact {
    /** Stable id, so an accepted fact can be recognised across runs. */
    id: string;
    /** The rule as it will be put in the prompt — one short, actionable sentence. */
    text: string;
    /** How many places agreed with it. */
    samples: number;
    /** How many places were looked at. */
    total: number;
    /** Which language it was measured in, for the dialog's grouping. */
    language: 'cs' | 'vb';
}

/** Below this many samples, a pattern is a coincidence. */
export const MIN_SAMPLES = 5;

/** …and below this share of the samples, it is not a convention but a habit-in-transition. */
export const MIN_SHARE = 0.8;

/** A single rule longer than this is a paragraph, and the prompt is not the place for one. */
export const MAX_CONVENTION_CHARS = 200;

/** How many rules the prompt will carry. Beyond this they stop being about style and start being a manual. */
export const MAX_CONVENTIONS = 12;

const EVENT_SUFFIXES = new Set([
    'Click', 'Tapped', 'DoubleTapped', 'RightTapped', 'PointerPressed', 'PointerReleased', 'PointerMoved',
    'PointerWheelChanged', 'KeyDown', 'KeyUp', 'TextChanged', 'SelectionChanged', 'Checked', 'Unchecked',
    'Loaded', 'Unloaded', 'SizeChanged', 'GotFocus', 'LostFocus', 'AttachedToVisualTree',
    'DetachedFromVisualTree', 'ContextRequested', 'ValueChanged', 'Opened', 'Closed'
]);

/**
 * One member declaration, as far as a style rule needs to see it.
 *
 * One parser for both languages on purpose: `Private Shared Sub Foo()` and `private static void Foo()`
 * differ in their keywords, not in their shape, and a single regex that has been reasoned about once is
 * worth more than four that each have their own edge cases. The three groups are *modifiers* (everything
 * before the return type), the *type* (`void`, `Sub`, `Task<int>`…, unused here but it is what keeps the
 * split honest) and the *name*.
 */
interface MemberDeclaration {
    modifiers: string;
    name: string;
}

const DECLARATION = /^[ \t]*([A-Za-z][\w \t]*?)[ \t]+([\w.<>\[\],?]+)[ \t]+([A-Za-z_]\w*)[ \t]*\(/gim;

export function memberDeclarations(text: string): MemberDeclaration[] {
    const out: MemberDeclaration[] = [];
    for (const match of String(text ?? '').matchAll(DECLARATION)) {
        out.push({ modifiers: match[1].trim(), name: match[3] });
    }
    return out;
}

/** `{` on the declaration line vs on the line below it. Only `)`-terminated declarations are counted. */
export function countBraceStyle(text: string): { same: number; next: number } {
    return {
        same: (String(text ?? '').match(/\)[ \t]*(?:\/\/[^\n]*)?\{[ \t]*$/gm) ?? []).length,
        next: (String(text ?? '').match(/\)[ \t]*(?:\/\/[^\n]*)?\r?\n[ \t]*\{/g) ?? []).length
    };
}

/**
 * The indent step, from the lines that are indented at all.
 *
 * A line indented by four is also "divisible by two", so the two are counted as if they were rivals and the
 * larger one wins ties: a 4-space file must not be reported as 2-space, and a genuinely 2-space file has
 * plenty of lines (2, 6, 10) that are not multiples of four.
 */
export function countIndent(text: string): { four: number; two: number; tabs: number } {
    let four = 0;
    let two = 0;
    let tabs = 0;
    for (const line of String(text ?? '').split(/\r?\n/)) {
        const match = /^([ \t]+)\S/.exec(line);
        if (!match) continue;
        if (match[1][0] === '\t') tabs += 1;
        else if (match[1].length % 4 === 0) four += 1;
        else two += 1;
    }
    return { four, two, tabs };
}

/** How a file's members are declared: `private` vs anything wider, and whether `static`/`Shared` is used. */
export function countModifiers(text: string): { private: number; other: number; static: number } {
    let priv = 0;
    let other = 0;
    let isStatic = 0;
    for (const decl of memberDeclarations(text)) {
        if (/\bprivate\b/i.test(decl.modifiers)) priv += 1;
        else if (/\b(public|internal|protected|friend)\b/i.test(decl.modifiers)) other += 1;
        if (/\b(static|shared)\b/i.test(decl.modifiers)) isStatic += 1;
    }
    return { private: priv, other, static: isStatic };
}

/** Handlers named `<Control>_<Event>` — the switch that decides whether the rule is worth stating. */
export function countHandlerNames(text: string): { named: number; total: number } {
    let named = 0;
    let total = 0;
    for (const decl of memberDeclarations(text)) {
        const at = decl.name.lastIndexOf('_');
        if (at <= 0) continue;
        if (!EVENT_SUFFIXES.has(decl.name.slice(at + 1))) continue;
        total += 1;
        named += 1;
    }
    return { named, total };
}

/** `Handles` clauses on handlers vs `AddHandler` calls: the one VB idiom that is a real fork in the road. */
export function countVbEventWiring(text: string): { handles: number; addHandler: number } {
    return {
        handles: (String(text ?? '').match(/\bHandles\b/g) ?? []).length,
        addHandler: (String(text ?? '').match(/\bAddHandler\b/g) ?? []).length
    };
}

/**
 * The rules a set of files agrees on.
 *
 * Files are counted **per language**, and a rule only exists when that language's own files justify it —
 * a C# project next to one VB form must not produce "use `Private Sub`" for the C# half.
 */
export function deriveConventions(files: { name: string; text: string; language: 'cs' | 'vb' }[]): ConventionFact[] {
    const cs = files.filter((f) => f.language === 'cs' && f.text.trim());
    const vb = files.filter((f) => f.language === 'vb' && f.text.trim());
    const out: ConventionFact[] = [];

    if (cs.length) {
        const text = cs.map((f) => f.text).join('\n');

        const indent = countIndent(text);
        const indentTotal = indent.four + indent.two + indent.tabs;
        out.push(...compact([
            rule('cs.indent.tabs', 'cs', 'Indent with tabs.', indent.tabs, indentTotal),
            rule('cs.indent.spaces', 'cs', `Indent with ${indent.four >= indent.two ? 4 : 2} spaces.`,
                indent.four >= indent.two ? indent.four : indent.two, indentTotal)
        ]));

        const brace = countBraceStyle(text);
        const braceTotal = brace.same + brace.next;
        out.push(...compact([
            rule('cs.brace.sameLine', 'cs',
                'Put the opening brace on the same line as the declaration (K&R style).',
                brace.same, braceTotal),
            rule('cs.brace.nextLine', 'cs',
                'Put the opening brace on its own line, below the declaration (Allman style).',
                brace.next, braceTotal)
        ]));

        const modifiers = countModifiers(text);
        const modTotal = modifiers.private + modifiers.other;
        out.push(...compact([
            rule('cs.visibility.private', 'cs',
                'Members are `private` unless something outside the class calls them.',
                modifiers.private, modTotal),
            // "no static members" is a real instruction only when there were members to be static about.
            modTotal >= MIN_SAMPLES && modifiers.static === 0
                ? {
                    id: 'cs.static.none',
                    text: 'No member is `static` — keep new members instance members.',
                    samples: modTotal, total: modTotal, language: 'cs' as const
                }
                : undefined
        ]));

        const handlers = countHandlerNames(text);
        out.push(...compact([
            rule('cs.handlers.controlEvent', 'cs',
                'Name event handlers `<Control>_<Event>`, e.g. `SaveButton_Click`.',
                handlers.named, handlers.total)
        ]));
    }

    if (vb.length) {
        const text = vb.map((f) => f.text).join('\n');

        const indent = countIndent(text);
        const indentTotal = indent.four + indent.two + indent.tabs;
        out.push(...compact([
            rule('vb.indent.tabs', 'vb', 'Indent with tabs.', indent.tabs, indentTotal),
            rule('vb.indent.spaces', 'vb', `Indent with ${indent.four >= indent.two ? 4 : 2} spaces.`,
                indent.four >= indent.two ? indent.four : indent.two, indentTotal)
        ]));

        const modifiers = countModifiers(text);
        const modTotal = modifiers.private + modifiers.other;
        out.push(...compact([
            rule('vb.visibility.private', 'vb',
                'Members are `Private` unless something outside the class needs them.',
                modifiers.private, modTotal),
            modTotal >= MIN_SAMPLES && modifiers.static === 0
                ? {
                    id: 'vb.static.none',
                    text: 'No member is `Shared` — keep new members instance members.',
                    samples: modTotal, total: modTotal, language: 'vb' as const
                }
                : undefined
        ]));

        const handlers = countHandlerNames(text);
        out.push(...compact([
            rule('vb.handlers.controlEvent', 'vb',
                'Name event handlers `<Control>_<Event>`, e.g. `SaveButton_Click`.',
                handlers.named, handlers.total)
        ]));

        const wiring = countVbEventWiring(text);
        const wiringTotal = wiring.handles + wiring.addHandler;
        out.push(...compact([
            rule('vb.wiring.addHandler', 'vb',
                'Wire events with `AddHandler` in code, not with a `Handles` clause.',
                wiring.addHandler, wiringTotal),
            rule('vb.wiring.handles', 'vb',
                'Wire events with a `Handles` clause on the handler, not with `AddHandler`.',
                wiring.handles, wiringTotal)
        ]));
    }

    // Strongest evidence first: the dialog lists them in the order the user should trust them.
    return out.sort((a, b) => (b.samples / b.total) - (a.samples / a.total) || b.samples - a.samples);
}

/** One candidate rule — `undefined` unless the evidence clears both gates. */
function rule(
    id: string,
    language: 'cs' | 'vb',
    text: string,
    agree: number,
    total: number
): ConventionFact | undefined {
    const fact = factsFrom(id, language, text, { agree, total });
    return fact ? { ...fact, text } : undefined;
}

/** Turns counts into a fact, or nothing when the evidence does not justify one. */
function factsFrom(
    id: string,
    language: 'cs' | 'vb',
    text: string,
    counts: { agree: number; total: number }
): Omit<ConventionFact, 'text'> | undefined {
    const { agree, total } = counts;
    if (total < MIN_SAMPLES || agree / total < MIN_SHARE) return undefined;
    return { id, samples: agree, total, language };
}

function compact<T>(items: (T | undefined | false)[]): T[] {
    return items.filter((x): x is T => !!x);
}

/** The list as it is stored and edited: trimmed, de-duplicated (case-insensitively), capped, no empties. */
export function normaliseConventions(raw: unknown): string[] {
    const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\r?\n/) : [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const entry of list) {
        const text = String(entry ?? '').trim().replace(/\s+/g, ' ');
        if (!text) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(text.slice(0, MAX_CONVENTION_CHARS));
        if (out.length >= MAX_CONVENTIONS) break;
    }
    return out;
}

/** The editor's text: one rule per line. Bullets and blank lines are tolerated when pasting. */
export function parseConventionsText(text: string): string[] {
    return normaliseConventions(
        String(text ?? '')
            .split(/\r?\n/)
            .map((line) => line.replace(/^\s*[-*•]\s*/, ''))
            .filter((line) => line.trim().length > 0)
    );
}

/** The editor's text, from the stored list. */
export function conventionsText(list: string[]): string {
    return normaliseConventions(list).join('\n');
}

/**
 * The block that goes into a prompt — empty when there is nothing to say.
 *
 * Written as a directive list ("follow them") rather than as context, because that is what it is: the
 * developer has told us how their code reads, and the model is being held to it. The examples in the rules
 * are the shape this extension's own answers take, so a small model has something concrete to copy.
 */
export function conventionsBlock(list: string[], language?: 'cs' | 'vb'): string {
    const rules = normaliseConventions(list);
    if (!rules.length) return '';
    const label = language === 'vb' ? 'VB.NET' : language === 'cs' ? 'C#' : 'this codebase';
    return [
        `House rules for ${label} in this developer's codebase — follow them exactly:`,
        ...rules.map((r) => `- ${r}`)
    ].join('\n');
}

/** How much room the rules take, so the prompt can plan around them like any other part. */
export function conventionsTokens(block: string): number {
    // The same characters/4 estimate the rest of the request planning uses; kept here so the two cannot
    // drift apart by importing half of `assistant.ts` into a module that must stay dependency-free.
    return Math.ceil(String(block ?? '').length / 4);
}
