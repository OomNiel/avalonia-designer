/**
 * The project-file half of "this project can print".
 *
 * A chart's **Print…** / **Print to PDF…** entries are compiled in behind the `PRINT_SUPPORT` symbol,
 * and the methods behind them need `Avae.Printables` + `AvaloniaUI.PrintToPDF`, plus one
 * `AppBuilder.UsePrintables()` call in `Program`. A project the designer generated from 0.12.0 on has
 * all of it; one generated before it compiles the bundled chart perfectly and simply HAS no print
 * entries — an invisible kind of missing (nothing fails, nothing warns), which is exactly why the
 * designer says so when a chart is placed.
 *
 * This module holds the two mechanical halves of that conversation, apart from the panel so they can be
 * tested on their own:
 *   - `printSupportState` — what is present and what is not;
 *   - `addPrintSupport` — the packages and the symbol, appended and never rewritten, idempotent.
 *
 * The `Program` line is deliberately NOT touched: rewriting somebody's `Main` is not a designer's
 * business, and the running chart reports the missing service anyway (its Print… entry comes up
 * disabled with a tooltip saying which call is missing).
 */
import * as fs from 'fs';
import * as path from 'path';
import { AVAE_PRINTABLES_VERSION, AVALONIAUI_PRINTTOPDF_VERSION } from './projectScaffold';

export type PrintLanguage = 'cs' | 'vb';

/** The two packages the chart's hardcopy entries need — the versions the scaffold writes. */
export const PRINT_PACKAGES = [
    { id: 'Avae.Printables', version: AVAE_PRINTABLES_VERSION },
    { id: 'AvaloniaUI.PrintToPDF', version: AVALONIAUI_PRINTTOPDF_VERSION }
];

export interface PrintSupportState {
    /** Both packages are referenced by the project file. */
    packages: boolean;
    /** `PRINT_SUPPORT` reaches the compiler (in the separator the language needs). */
    symbol: boolean;
    /** `Program` calls `AppBuilder.UsePrintables()`. */
    usePrintables: boolean;
    /** Everything the chart needs before its Print entries exist and work. */
    complete: boolean;
}

const referenced = (projectText: string, id: string): boolean =>
    new RegExp(`Include\\s*=\\s*"${id.replace(/\./g, '\\.')}"`).test(projectText);

/** What the project file and `Program` carry today. */
export function printSupportState(projectText: string, programText: string): PrintSupportState {
    const packages = PRINT_PACKAGES.every((p) => referenced(projectText, p.id));
    const symbol = /PRINT_SUPPORT/.test(projectText);
    const usePrintables = /\.UsePrintables\s*\(/.test(programText);
    return { packages, symbol, usePrintables, complete: packages && symbol && usePrintables };
}

/** The same, read from disk. A missing file reads as "not there", which is the honest answer. */
export function printSupportStateFor(projectPath: string): PrintSupportState {
    const read = (file: string): string => {
        try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
    };
    const dir = path.dirname(projectPath);
    return printSupportState(read(projectPath), read(path.join(dir, 'Program.cs')) + read(path.join(dir, 'Program.vb')));
}

/**
 * Appends the packages and the symbol to a project file — nothing else, and only what is missing, so it
 * is safe to call twice (and safe to call on a project that already has both: it returns the text
 * unchanged).
 *
 * **VB gets the comma form.** `vbc`'s `/define:` switch is comma-separated, so the C# semicolon idiom is
 * handed to the compiler verbatim and fails the build with `BC31030` — and a `BeforeTargets="VbcCompile"`
 * target is worse still, because the SDK overwrites `FinalDefineConstants` afterwards and the symbol
 * silently disappears. USER_MANUAL §19.14 documents both traps.
 */
export function addPrintSupport(projectText: string, language: PrintLanguage): string {
    let text = projectText;

    if (!/PRINT_SUPPORT/.test(text)) {
        const group = /<\/PropertyGroup>/.exec(text);
        if (!group) return projectText;   // not an SDK-style project file — leave it alone
        const line = language === 'vb'
            ? '    <DefineConstants>$(DefineConstants),PRINT_SUPPORT</DefineConstants>\n'
            : '    <DefineConstants>$(DefineConstants);PRINT_SUPPORT</DefineConstants>\n';
        text = text.slice(0, group.index)
            + '    <!-- Chart hardcopy: the Print… / Print to PDF… entries (USER_MANUAL 19.14) -->\n'
            + line + '  '
            + text.slice(group.index);
    }

    const missing = PRINT_PACKAGES.filter((p) => !referenced(text, p.id));
    if (missing.length > 0) {
        const refs = missing
            .map((p) => `    <PackageReference Include="${p.id}" Version="${p.version}" />`)
            .join('\n');
        const itemGroup = /<\/ItemGroup>/.exec(text);
        text = itemGroup
            ? text.slice(0, itemGroup.index) + refs + '\n  ' + text.slice(itemGroup.index)
            : text.replace(/<\/Project>/, `  <ItemGroup>\n${refs}\n  </ItemGroup>\n</Project>`);
    }

    return text;
}
