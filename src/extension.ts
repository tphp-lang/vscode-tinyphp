'use strict';

import * as path from 'path';
import {
    ExtensionContext, window, commands, languages, IndentAction,
    TextEdit, Range, Position, TextDocument, FormattingOptions,
    DocumentFormattingEditProvider, DocumentRangeFormattingEditProvider,
    ProviderResult
} from 'vscode';
import {
    LanguageClient, LanguageClientOptions, ServerOptions,
    TransportKind, RevealOutputChannelOn
} from 'vscode-languageclient/node';
import { createMiddleware, TinyPHPMiddleware } from './middleware';

let client: LanguageClient;
let extCtx: ExtensionContext;
let mw: TinyPHPMiddleware;

// ---- Simple client-side formatter (fallback) ----
class TinyPHPFormatter implements DocumentFormattingEditProvider, DocumentRangeFormattingEditProvider {
    provideDocumentFormattingEdits(document: TextDocument, options: FormattingOptions): ProviderResult<TextEdit[]> {
        return formatDoc(document.getText(), options);
    }

    provideDocumentRangeFormattingEdits(document: TextDocument, range: Range, options: FormattingOptions): ProviderResult<TextEdit[]> {
        const text = document.getText(range);
        const formatted = format(text, options);
        if (formatted === text) return [];
        return [TextEdit.replace(range, formatted)];
    }
}

function formatDoc(text: string, options: FormattingOptions): TextEdit[] {
    const formatted = format(text, options);
    if (formatted === text) return [];
    const lines = text.split(/\r?\n/);
    const lastLine = lines.length - 1;
    const lastChar = lines[lastLine]?.length || 0;
    return [TextEdit.replace(new Range(0, 0, lastLine, lastChar), formatted)];
}

function format(text: string, options: FormattingOptions): string {
    const tab = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
    const lines = text.split(/\r?\n/);
    const result: string[] = [];
    let indentLevel = 0;

    for (const rawLine of lines) {
        const trimmed = rawLine.trim();

        if (trimmed.length === 0) {
            result.push('');
            continue;
        }

        // preprocessor directives always at column 0
        if (trimmed.startsWith('#')) {
            indentLevel = 0;
            result.push(trimmed);
            continue;
        }

        // closing braces/php tag decrease indent first
        if (trimmed.startsWith('}') || trimmed.startsWith('?>')) {
            indentLevel = Math.max(0, indentLevel - 1);
        }

        let line = tab.repeat(indentLevel) + trimmed;

        // fix spacing
        line = line.replace(/\b(if|elseif|for|foreach|while|switch|catch)\s*\(/g, '$1 (');
        line = line.replace(/\)\s*\{/g, ') {');
        line = line.replace(/\b(else|do)\s*\{/g, '$1 {');
        line = line.replace(/\s+;/g, ';');
        line = line.replace(/ {2,}/g, ' ');

        result.push(line);

        // count braces for next indent
        const opens = (trimmed.match(/\{/g) || []).length;
        const closes = (trimmed.match(/\}/g) || []).length;
        indentLevel = Math.max(0, indentLevel + opens - closes);
    }

    return result.join('\n');
}

// ---- Extension activation ----

export async function activate(ctx: ExtensionContext) {
    extCtx = ctx;
    mw = createMiddleware();

    languages.setLanguageConfiguration('tinyphp', {
        wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
        onEnterRules: [],
    });

    // Register client-side formatter (always available, no server needed)
    ctx.subscriptions.push(
        languages.registerDocumentFormattingEditProvider('tinyphp', new TinyPHPFormatter()),
        languages.registerDocumentRangeFormattingEditProvider('tinyphp', new TinyPHPFormatter())
    );

    // Start language server
    client = makeClient();
    ctx.subscriptions.push(client, mw,
        commands.registerCommand('tinyphp.restart.server', restart));

    await client.start();
    console.log('[TinyPHP] Started');
}

function makeClient(): LanguageClient {
    const serverModule = extCtx.asAbsolutePath(path.join('server', 'out', 'server.js'));
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: { execArgv: ['--nolazy', '--inspect=6040'], detached: true } }
    };
    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { language: 'tinyphp', scheme: 'file' },
            { language: 'tinyphp', scheme: 'untitled' }
        ],
        initializationOptions: { storagePath: extCtx.storagePath },
        revealOutputChannelOn: RevealOutputChannelOn.Never,
        middleware: mw,
    };
    return new LanguageClient('tinyphp', 'TinyPHP', serverOptions, clientOptions);
}

async function restart() {
    if (!client) return;
    await client.stop();
    client = makeClient();
    extCtx.subscriptions.push(client);
    await client.start();
    window.showInformationMessage('TinyPHP restarted');
}

export async function deactivate() {
    if (client) await client.stop();
}
