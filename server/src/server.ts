'use strict';

import {
    createConnection,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    Hover,
    MarkupKind,
    DocumentSymbolParams,
    SymbolInformation,
    SymbolKind,
    Location,
    Range,
    Position,
    SignatureHelp,
    SignatureInformation,
    ParameterInformation,
    Definition
} from 'vscode-languageserver/node';

import {
    TextDocument
} from 'vscode-languageserver-textdocument';

import * as TinyPHP from './tinyphp-parser';
import { formatDocument, formatRange } from './tinyphp-formatter';

// Create a connection for the server
let connection = createConnection();

// Create a simple text document manager
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
    let capabilities = params.capabilities;

    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    hasDiagnosticRelatedInformationCapability = !!(
        capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Full,
            // Completion support
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['$', '>', '\\', ':']
            },
            // Hover support
            hoverProvider: true,
            // Signature help
            signatureHelpProvider: {
                triggerCharacters: ['(', ','],
                retriggerCharacters: [',']
            },
            // Document symbols
            documentSymbolProvider: true,
            // Go to definition
            definitionProvider: true,
            // Find references
            referencesProvider: false,
            // Formatting
            documentFormattingProvider: true,
            documentRangeFormattingProvider: true
        }
    };

    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true
            }
        };
    }

    return result;
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes
        connection.client.register(
            DidChangeConfigurationNotification.type,
            undefined
        );
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            connection.console.log('Workspace folder change event received.');
        });
    }
});

// ---- Document validation / Diagnostics ----

documents.onDidChangeContent(change => {
    validateTextDocument(change.document);
});

documents.onDidOpen(change => {
    validateTextDocument(change.document);
});

documents.onDidSave(change => {
    validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    let settings = await getDocumentSettings(textDocument.uri);

    // Only run diagnostics if enabled
    if (!settings.diagnostics.enable) {
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
        return;
    }

    let text = textDocument.getText();
    let diagnostics: Diagnostic[] = [];

    // Basic syntax checks
    let lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Check for unmatched braces/parens
        let openBraces = (line.match(/\{/g) || []).length;
        let closeBraces = (line.match(/\}/g) || []).length;
        let openParens = (line.match(/\(/g) || []).length;
        let closeParens = (line.match(/\)/g) || []).length;

        // Check for PHP opening tag — TinyPHP doesn't need <?php
        if (/^<\?php\b/i.test(line)) {
            diagnostics.push({
                severity: DiagnosticSeverity.Information,
                range: {
                    start: { line: i, character: line.indexOf('<?') },
                    end: { line: i, character: line.indexOf('<?php') + 5 }
                },
                message: 'TinyPHP does not require <?php. You can safely remove it.',
                source: 'tinyphp'
            });
        }

        // Check for PHP short tags
        if (/<\?(?!php|=)/.test(line)) {
            diagnostics.push({
                severity: DiagnosticSeverity.Information,
                range: {
                    start: { line: i, character: line.indexOf('<?') },
                    end: { line: i, character: line.indexOf('<?') + 2 }
                },
                message: 'PHP short tags are not needed in TinyPHP.',
                source: 'tinyphp'
            });
        }

        // Check for unsupported features
        if (/\beval\s*\(/.test(line)) {
            let idx = line.search(/\beval\b/);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: i, character: idx },
                    end: { line: i, character: idx + 4 }
                },
                message: 'eval() is not supported in TinyPHP (AOT compilation).',
                source: 'tinyphp'
            });
        }

        if (/\$\$/.test(line)) {
            let idx = line.search(/\$\$/);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: i, character: idx },
                    end: { line: i, character: idx + 2 }
                },
                message: 'Variable variables ($$var) are not supported in TinyPHP.',
                source: 'tinyphp'
            });
        }

        if (/\byield\b/.test(line)) {
            let idx = line.search(/\byield\b/);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: i, character: idx },
                    end: { line: i, character: idx + 5 }
                },
                message: 'yield/generators are not supported in TinyPHP (AOT compilation).',
                source: 'tinyphp'
            });
        }

        // Check for const without type — two words after const mean [type] [name]. One word = missing type.
        let constMatch = line.match(/^\s*(public|private|protected|static|final|readonly\s+)*\s*const\s+(\w+)\s*=/);
        if (constMatch) {
            // Check if there's a type before the constant name: "const [type] [name]"
            let hasType = /^\s*(public|private|protected|static|final|readonly\s+)*\s*const\s+\w+\s+\w+\s*=/.test(line);
            if (!hasType) {
                let idx = line.indexOf('const') + 'const'.length;
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: i, character: idx },
                        end: { line: i, character: idx + constMatch[2].length + 1 }
                    },
                    message: 'TinyPHP class constants require an explicit type (e.g. `const int FOO = 1` or `const array TAGS = [...]`).',
                    source: 'tinyphp'
                });
            }
        }

        // Check for property without type (TinyPHP requires typed properties)
        // Pattern: access modifier directly followed by $ (no type word between)
        let propMatch = line.match(/^\s*(public|private|protected|static|readonly)\s+(\$[a-zA-Z_]\w*)/);
        if (propMatch) {
            let idx = line.indexOf(propMatch[2]);
            if (idx !== -1) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: i, character: idx },
                        end: { line: i, character: idx + propMatch[2].length }
                    },
                    message: 'TinyPHP properties require an explicit type (e.g. `public int $count = 0` or `public Demo $obj`).',
                    source: 'tinyphp'
                });
            }
        }

        // Check for unsupported PHP features (include, require, etc.)
        if (/\b(include|require)(_once)?\s*[\("]./.test(line)) {
            let idx = line.search(/\b(include|require)/);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + 7 } },
                message: 'include/require is not supported in AOT mode. Use #include for C headers.',
                source: 'tinyphp'
            });
        }

        // Check for unsupported dynamic calls: $fn(), $obj->$m(), call_user_func()
        if (/\$[a-zA-Z_]\w*\s*\(/.test(line) && !/\b(function|if|for|foreach|while|switch|match)\b/.test(line)) {
            let m = line.match(/(\$[a-zA-Z_]\w*)\s*\(/);
            if (m && !/(echo|return|new|throw)\s+\$/.test(line) && !/^\s*\$this\b/.test(line)) {
                // Simple heuristic - skip obvious non-dynamic-calls
            }
        }
        if (/\bcall_user_func\b/.test(line)) {
            let idx = line.search(/\bcall_user_func\b/);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + 15 } },
                message: 'call_user_func() is not supported in TinyPHP (dynamic calls require runtime resolution).',
                source: 'tinyphp'
            });
        }

        // Check for __call / __get / __set magic methods
        let magicMatch = line.match(/function\s+(__call|__get|__set|__callStatic)\b/);
        if (magicMatch) {
            let idx = line.indexOf(magicMatch[1]);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + magicMatch[1].length } },
                message: 'Magic methods __call/__get/__set are not supported in TinyPHP (no dynamic dispatch).',
                source: 'tinyphp'
            });
        }

        // Check for Reflection
        let reflMatch = line.match(/new\s+(Reflection\w+)/);
        if (reflMatch) {
            let idx = line.indexOf(reflMatch[1]);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + reflMatch[1].length } },
                message: 'Reflection API is not supported in TinyPHP (no runtime metadata).',
                source: 'tinyphp'
            });
        }

        // Check for function/method parameter without type
        let funcSig = line.match(/\bfunction\s+\w*\s*\(([^)]*)\)/);
        if (funcSig) {
            let params = funcSig[1];
            // Find untyped params: those that start with $ directly (no type word before)
            let untypedParams = params.match(/(?:^|,)\s*(\$[a-zA-Z_]\w*)/g);
            if (untypedParams) {
                for (let p of untypedParams) {
                    let clean = p.replace(/^[,\s]+/, '').trim();
                    let pIdx = line.indexOf(clean);
                    if (pIdx !== -1 && !new RegExp('\\w+\\s+' + clean.replace('$', '\\$')).test(params)) {
                        diagnostics.push({
                            severity: DiagnosticSeverity.Warning,
                            range: {
                                start: { line: i, character: pIdx },
                                end: { line: i, character: pIdx + clean.length }
                            },
                            message: `Parameter '${clean}' needs a type (e.g. \`int ${clean}\` or \`Demo ${clean}\`). TinyPHP requires typed parameters.`,
                            source: 'tinyphp'
                        });
                    }
                }
            }
        }

        let nullableMatch = line.match(/\?\s*(int|float|string|bool)\b/);
        if (nullableMatch) {
            let idx = line.search(/\?\s*(int|float|string|bool)\b/);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: i, character: idx },
                    end: { line: i, character: idx + nullableMatch[0].length }
                },
                message: 'Nullable types (?int, ?string, etc.) are not supported in TinyPHP.',
                source: 'tinyphp'
            });
        }

        // Check for assert($str) — use assert_true/assert_false instead
        if (/\bassert\s*\(/.test(line)) {
            let idx = line.search(/\bassert\b/);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + 6 } },
                message: 'assert($str) is not supported in TinyPHP. Use assert_true/assert_false/assert_eq_int/assert_eq_float/assert_eq_str.',
                source: 'tinyphp'
            });
        }

        // Check for create_function()
        if (/\bcreate_function\s*\(/.test(line)) {
            let idx = line.search(/\bcreate_function\b/);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + 15 } },
                message: 'create_function() is not supported in TinyPHP (AOT compilation).',
                source: 'tinyphp'
            });
        }

        // Check for compact() / extract()
        if (/\bcompact\s*\(/.test(line)) {
            let idx = line.search(/\bcompact\b/);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + 7 } },
                message: 'compact() is not supported in TinyPHP — no runtime symbol table.',
                source: 'tinyphp'
            });
        }
        if (/\bextract\s*\(/.test(line)) {
            let idx = line.search(/\bextract\b/);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + 8 } },
                message: 'extract() is not supported in TinyPHP — no runtime symbol table.',
                source: 'tinyphp'
            });
        }

        // Check for runtime introspection functions
        if (/\bdebug_backtrace\s*\(/.test(line)) {
            let idx = line.search(/\bdebug_backtrace\b/);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + 16 } },
                message: 'debug_backtrace() is not supported in TinyPHP — no runtime call stack.',
                source: 'tinyphp'
            });
        }
        if (/\bget_defined_vars\s*\(/.test(line)) {
            let idx = line.search(/\bget_defined_vars\b/);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + 16 } },
                message: 'get_defined_vars() is not supported in TinyPHP — no runtime symbol table.',
                source: 'tinyphp'
            });
        }
        if (/\bfunc_get_args\s*\(/.test(line)) {
            let idx = line.search(/\bfunc_get_args\b/);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + 14 } },
                message: 'func_get_args() is not supported in TinyPHP.',
                source: 'tinyphp'
            });
        }

        // Check for $GLOBALS
        if (/\$GLOBALS\b/.test(line)) {
            let idx = line.search(/\$GLOBALS/);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + 8 } },
                message: '$GLOBALS is not supported in TinyPHP — no global symbol table.',
                source: 'tinyphp'
            });
        }

        // Check for variadic ...$args
        if (/\.\.\.\$[a-zA-Z_]\w*/.test(line)) {
            let idx = line.search(/\.\.\.\$[a-zA-Z_]\w*/);
            let match = line.match(/\.\.\.\$([a-zA-Z_]\w*)/);
            let name = match ? match[1] : 'args';
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + name.length + 4 } },
                message: `Variadic ...\$${name} is not supported in TinyPHP — use explicit parameters instead.`,
                source: 'tinyphp'
            });
        }

        // Check for namespace block form (unsupported for multi-file)
        if (/^\s*namespace\s+\w.*\{/.test(line)) {
            let idx = line.indexOf('namespace');
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + 9 } },
                message: 'Namespace block form namespace A { } is not supported in TinyPHP multi-file mode. Use namespace A; (semicolon form).',
                source: 'tinyphp'
            });
        }
    }

    // Check for unbalanced braces across whole file
    let totalOpen = (text.match(/\{/g) || []).length;
    let totalClose = (text.match(/\}/g) || []).length;
    if (totalOpen !== totalClose) {
        diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 }
            },
            message: `Unbalanced braces: ${totalOpen} opening, ${totalClose} closing.`,
            source: 'tinyphp'
        });
    }

    // Send the computed diagnostics to VS Code
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

// ---- Completion ----

connection.onCompletion(
    (textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
        let document = documents.get(textDocumentPosition.textDocument.uri);
        if (!document) return TinyPHP.getCompletionItems();
        let text = document.getText();
        let offset = document.offsetAt(textDocumentPosition.position);
        let wordStart = offset;
        while (wordStart > 0 && /[\w$#]/.test(text[wordStart - 1])) {
            wordStart--;
        }
        let prefix = text.substring(wordStart, offset);
        return TinyPHP.getCompletionItems(prefix);
    }
);

connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {
        if (item.data === 'function') {
            let doc = TinyPHP.getFunctionDocumentation(item.label);
            if (doc) {
                item.documentation = { kind: MarkupKind.Markdown, value: doc };
            }
        } else if (item.data === 'keyword') {
            let doc = TinyPHP.getKeywordDocumentation(item.label);
            if (doc) {
                item.documentation = { kind: MarkupKind.Markdown, value: doc };
            }
        } else if (item.data === 'c-interop') {
            let doc = TinyPHP.getCInteropDocumentation(item.label);
            if (doc) {
                item.documentation = { kind: MarkupKind.Markdown, value: doc };
            }
        } else if (item.data === 'preprocessor') {
            let doc = TinyPHP.getPreprocessorDocumentation(item.label);
            if (doc) {
                item.documentation = { kind: MarkupKind.Markdown, value: doc };
            }
        } else if (item.data === 'type') {
            let doc = TinyPHP.getTypeDocumentation(item.label);
            if (doc) {
                item.documentation = { kind: MarkupKind.Markdown, value: doc };
            }
        }
        return item;
    }
);

// ---- Hover ----

connection.onHover(
    (_textDocumentPosition: TextDocumentPositionParams): Hover | null => {
        let document = documents.get(_textDocumentPosition.textDocument.uri);
        if (!document) {
            return null;
        }

        let word = getWordAtPosition(
            document,
            _textDocumentPosition.position
        );

        if (!word) {
            return null;
        }

        // Check if it's a built-in function
        let funcDoc = TinyPHP.getFunctionDocumentation(word);
        if (funcDoc) {
            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: funcDoc
                }
            };
        }

        // Check if it's a keyword
        let keywordDoc = TinyPHP.getKeywordDocumentation(word);
        if (keywordDoc) {
            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: keywordDoc
                }
            };
        }

        // Check if it's a built-in type
        let typeDoc = TinyPHP.getTypeDocumentation(word);
        if (typeDoc) {
            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: typeDoc
                }
            };
        }

        return null;
    }
);

// ---- Signature Help ----

connection.onSignatureHelp(
    (_textDocumentPosition: TextDocumentPositionParams): SignatureHelp | null => {
        let document = documents.get(_textDocumentPosition.textDocument.uri);
        if (!document) {
            return null;
        }

        let text = document.getText();
        let offset = document.offsetAt(_textDocumentPosition.position);

        // Find the function being called
        let funcName = getCurrentFunction(text, offset);
        if (!funcName) {
            return null;
        }

        let sig = TinyPHP.getFunctionSignature(funcName);
        if (!sig) {
            return null;
        }

        // Count commas to determine active parameter
        let paramStart = text.lastIndexOf('(', offset);
        let argsText = text.substring(paramStart + 1, offset);
        let activeParam = (argsText.match(/,/g) || []).length;

        return {
            signatures: [sig],
            activeSignature: 0,
            activeParameter: Math.min(activeParam, sig.parameters?.length ? sig.parameters.length - 1 : 0)
        };
    }
);

// ---- Document Symbols ----

connection.onDocumentSymbol(
    (_params: DocumentSymbolParams): SymbolInformation[] => {
        let document = documents.get(_params.textDocument.uri);
        if (!document) {
            return [];
        }

        let symbols: SymbolInformation[] = [];
        let text = document.getText();
        let lines = text.split(/\r?\n/);
        let uri = _params.textDocument.uri;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();

            // Class declaration
            let classMatch = line.match(
                /^\s*(abstract\s+)?(class|interface|trait|enum)\s+([a-zA-Z_]\w*)/
            );
            if (classMatch) {
                symbols.push({
                    name: classMatch[3],
                    kind: classMatch[1] ? SymbolKind.Class : SymbolKind.Class,
                    location: {
                        uri: uri,
                        range: {
                            start: { line: i, character: line.indexOf(classMatch[3]) },
                            end: { line: i, character: line.indexOf(classMatch[3]) + classMatch[3].length }
                        }
                    },
                    containerName: ''
                });
                continue;
            }

            // Function/method declaration
            let funcMatch = line.match(
                /^\s*(public|private|protected|static|final|abstract|readonly\s+)*\s*function\s+([a-zA-Z_]\w*)\s*\(/
            );
            if (funcMatch) {
                symbols.push({
                    name: funcMatch[2],
                    kind: SymbolKind.Function,
                    location: {
                        uri: uri,
                        range: {
                            start: { line: i, character: line.indexOf(funcMatch[2]) },
                            end: { line: i, character: line.indexOf(funcMatch[2]) + funcMatch[2].length }
                        }
                    },
                    containerName: ''
                });
                continue;
            }

            // Namespace
            let nsMatch = line.match(/^\s*namespace\s+([a-zA-Z_\\][\w\\]+)/);
            if (nsMatch) {
                symbols.push({
                    name: nsMatch[1],
                    kind: SymbolKind.Namespace,
                    location: {
                        uri: uri,
                        range: {
                            start: { line: i, character: line.indexOf(nsMatch[1]) },
                            end: { line: i, character: line.indexOf(nsMatch[1]) + nsMatch[1].length }
                        }
                    },
                    containerName: ''
                });
            }
        }

        return symbols;
    }
);

// ---- Go to Definition ----

connection.onDefinition(
    (_textDocumentPosition: TextDocumentPositionParams): Definition | null => {
        let document = documents.get(_textDocumentPosition.textDocument.uri);
        if (!document) {
            return null;
        }

        let word = getWordAtPosition(document, _textDocumentPosition.position);
        if (!word) {
            return null;
        }

        let text = document.getText();
        let lines = text.split(/\r?\n/);

        // Search for function definitions
        let funcPattern = new RegExp(
            `function\\s+${escapeRegExp(word)}\\s*\\(`
        );
        for (let i = 0; i < lines.length; i++) {
            if (funcPattern.test(lines[i])) {
                let col = lines[i].search(funcPattern) + 'function '.length;
                return {
                    uri: _textDocumentPosition.textDocument.uri,
                    range: {
                        start: { line: i, character: col },
                        end: { line: i, character: col + word.length }
                    }
                };
            }
        }

        // Search for class definitions
        let classPattern = new RegExp(
            `\\b(class|interface|trait|enum)\\s+${escapeRegExp(word)}\\b`
        );
        for (let i = 0; i < lines.length; i++) {
            let match = lines[i].match(classPattern);
            if (match) {
                let col = lines[i].indexOf(word);
                return {
                    uri: _textDocumentPosition.textDocument.uri,
                    range: {
                        start: { line: i, character: col },
                        end: { line: i, character: col + word.length }
                    }
                };
            }
        }

        // Search for variable assignments
        if (word.startsWith('$')) {
            let varPattern = new RegExp(
                `\\${escapeRegExp(word)}\\s*(=|=>)`
            );
            for (let i = 0; i < lines.length; i++) {
                if (varPattern.test(lines[i])) {
                    let col = lines[i].indexOf(word);
                    return {
                        uri: _textDocumentPosition.textDocument.uri,
                        range: {
                            start: { line: i, character: col },
                            end: { line: i, character: col + word.length }
                        }
                    };
                }
            }
        }

        return null;
    }
);

// ---- Formatting ----

connection.onDocumentFormatting((params) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];
    return formatDocument(doc, {
        tabSize: params.options.tabSize,
        insertSpaces: params.options.insertSpaces
    });
});

connection.onDocumentRangeFormatting((params) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];
    return formatRange(doc, params.range, {
        tabSize: params.options.tabSize,
        insertSpaces: params.options.insertSpaces
    });
});

// ---- Utility functions ----

function getWordAtPosition(document: TextDocument, position: Position): string | null {
    let text = document.getText();
    let offset = document.offsetAt(position);
    let wordStart = offset;
    let wordEnd = offset;

    // Find start of word
    while (wordStart > 0 && /[\w$\\>]/.test(text[wordStart - 1])) {
        wordStart--;
    }

    // Find end of word
    while (wordEnd < text.length && /[\w$]/.test(text[wordEnd])) {
        wordEnd++;
    }

    if (wordStart === wordEnd) {
        return null;
    }

    return text.substring(wordStart, wordEnd);
}

function getCurrentFunction(text: string, offset: number): string | null {
    // Find the function name before the current position
    let searchStart = text.lastIndexOf('(', offset);
    if (searchStart === -1) {
        return null;
    }

    // Find where the function name starts
    let nameEnd = searchStart;
    while (nameEnd > 0 && /\s/.test(text[nameEnd - 1])) {
        nameEnd--;
    }

    let nameStart = nameEnd;
    while (nameStart > 0 && /[\w\\]/.test(text[nameStart - 1])) {
        nameStart--;
    }

    if (nameStart === nameEnd) {
        return null;
    }

    return text.substring(nameStart, nameEnd);
}

function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---- Configuration ----

interface TinyPHPSettings {
    diagnostics: {
        enable: boolean;
    };
    completion: {
        enable: boolean;
    };
    hover: {
        enable: boolean;
    };
    signatureHelp: {
        enable: boolean;
    };
    files: {
        exclude: string[];
        associations: string[];
    };
}

const defaultSettings: TinyPHPSettings = {
    diagnostics: { enable: true },
    completion: { enable: true },
    hover: { enable: true },
    signatureHelp: { enable: true },
    files: {
        exclude: ['**/.git/**', '**/node_modules/**', '**/vendor/**'],
        associations: ['*.tphp', '*.php', '*.inc']
    }
};

let globalSettings: TinyPHPSettings = defaultSettings;

async function getDocumentSettings(resource: string): Promise<TinyPHPSettings> {
    if (!hasConfigurationCapability) {
        return globalSettings;
    }
    let result = await connection.workspace.getConfiguration({
        scopeUri: resource,
        section: 'tinyphp'
    });
    return result || globalSettings;
}

// Listen for configuration changes
connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
    } else {
        globalSettings = <TinyPHPSettings>(
            (change.settings.tinyphp || defaultSettings)
        );
    }
});

// Make the text document manager listen on the connection
documents.listen(connection);

// Listen on the connection
connection.listen();
