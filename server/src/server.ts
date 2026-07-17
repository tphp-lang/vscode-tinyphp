'use strict';

import {
    createConnection,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    DiagnosticTag,
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
    Definition,
    InlayHint,
    InlayHintParams,
    InlayHintKind
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
            documentRangeFormattingProvider: true,
            // Inlay hints (grey type annotations)
            inlayHintProvider: true
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

    // 类块追踪：用于区分"类常量（类型必填）"与"全局/命名空间常量（类型可选）"
    // classBraceLevel >= 0 表示当前处于类/接口/trait/enum 块内
    let braceDepth = 0;
    let classBraceLevel = -1;

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

        // yield/Generator IS supported in TinyPHP (via minicoro) — no diagnostic needed.
        // Removed previous incorrect "yield not supported" warning.

        // Check for const without type — two words after const mean [type] [name]. One word = missing type.
        // 规则（GRAMMAR.md §3.3 / §7）:
        //   - 类常量（class/interface/trait/enum 块内）: 类型必填
        //   - 全局/命名空间常量: 类型可选（省略时按字面量推导），但建议写
        let constMatch = line.match(/^\s*(public|private|protected|static|final|readonly\s+)*\s*const\s+(\w+)\s*=/);
        if (constMatch) {
            let hasType = /^\s*(public|private|protected|static|final|readonly\s+)*\s*const\s+\w+\s+\w+\s*=/.test(line);
            if (!hasType) {
                let idx = line.indexOf('const') + 'const'.length;
                let inClass = classBraceLevel >= 0;
                if (inClass) {
                    // 类常量：类型必填（GRAMMAR.md §3.3）
                    diagnostics.push({
                        severity: DiagnosticSeverity.Warning,
                        range: {
                            start: { line: i, character: idx },
                            end: { line: i, character: idx + constMatch[2].length + 1 }
                        },
                        message: `TinyPHP 类常量类型必填（如 \`const int ${constMatch[2]} = ...\`）。`,
                        source: 'tinyphp'
                    });
                } else {
                    // 全局/命名空间常量：类型可选，但建议写
                    diagnostics.push({
                        severity: DiagnosticSeverity.Information,
                        range: {
                            start: { line: i, character: idx },
                            end: { line: i, character: idx + constMatch[2].length + 1 }
                        },
                        message: `全局/命名空间常量类型可选（省略时按字面量推导）。建议写上类型以便编译期类型检查（如 \`const int ${constMatch[2]} = ...\`）。`,
                        source: 'tinyphp'
                    });
                }
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
        // 排除预处理器指令行（#include / #require 等），它们是 TinyPHP 扩展，合法
        if (!/^\s*#/.test(line) && /\b(include|require)(_once)?\s*[\("]./.test(line)) {
            let kwMatch = line.match(/\b(include|require)(_once)?/);
            let kw = kwMatch ? kwMatch[0] : 'include';
            let idx = line.search(new RegExp('\\b' + kw));
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + kw.length } },
                message: `${kw} is not supported in AOT mode. Use #include for C headers.`,
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
        // 规则（GRAMMAR.md §6）: 函数参数类型可选（`type IDENTIFIER` 或 `IDENTIFIER` 均合法）
        //   但建议写类型以便编译期类型检查。箭头函数 `fn` 例外：强制参数+返回类型。
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
                            severity: DiagnosticSeverity.Information,
                            range: {
                                start: { line: i, character: pIdx },
                                end: { line: i, character: pIdx + clean.length }
                            },
                            message: `参数 ${clean} 类型可选，但建议写上类型以便编译期类型检查（如 \`int ${clean}\` 或 \`Demo ${clean}\`）。`,
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

        // 可变参数函数声明 ...$args 在函数签名中 → ❌ 不支持（需动态栈构造）
        // 数组展开 [...$a1, ...$a2] 和函数调用 spread f(...$args) → ✅ 支持（GRAMMAR.md §11.2）
        // 仅在函数参数声明上下文报警：function foo(...$args)
        if (/\bfunction\s+\w+\s*\([^)]*\.\.\.\$[a-zA-Z_]\w*/.test(line) ||
            /\bfn\s*\([^)]*\.\.\.\$[a-zA-Z_]\w*/.test(line)) {
            let match = line.match(/\.\.\.\$([a-zA-Z_]\w*)/);
            let name = match ? match[1] : 'args';
            let idx = line.indexOf(`...$${name}`);
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + name.length + 4 } },
                message: `Variadic function parameter ...\$${name} is not supported in TinyPHP (requires dynamic stack construction). Array spread [...]$arr and call spread f(...$arr) are supported.`,
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

        // --- Additional AOT-unsupported features (per TinyPHP GRAMMAR.md) ---

        // clone keyword — requires __clone dynamic dispatch
        if (/\bclone\s+\$/.test(line) || /\bclone\s+[a-zA-Z_]/.test(line)) {
            let idx = line.search(/\bclone\b/);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + 5 } },
                message: 'clone is not supported in TinyPHP — COS objects have no universal deep-copy (requires __clone dynamic dispatch).',
                source: 'tinyphp'
            });
        }

        // declare(strict_types=1) — TinyPHP is already strongly typed AOT
        if (/\bdeclare\s*\(/.test(line)) {
            let idx = line.search(/\bdeclare\b/);
            diagnostics.push({
                severity: DiagnosticSeverity.Information,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + 7 } },
                message: 'declare() is meaningless in TinyPHP — already strongly typed AOT. You can safely remove it.',
                source: 'tinyphp'
            });
        }

        // ??= null coalescing assignment — not implemented
        if (/\?\?=/.test(line)) {
            let idx = line.search(/\?\?=/);
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + 3 } },
                message: '??= is not implemented in TinyPHP — use `$a = $a ?? $b` instead.',
                source: 'tinyphp'
            });
        }

        // Magic methods requiring runtime dispatch (beyond __call/__get/__set/__callStatic already checked)
        let magicMethodMatch = line.match(/function\s+(__toString|__invoke|__clone|__debugInfo|__sleep|__wakeup|__serialize|__unserialize|__isset|__unset|__set_state)\b/);
        if (magicMethodMatch) {
            let idx = line.indexOf(magicMethodMatch[1]);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + magicMethodMatch[1].length } },
                message: `Magic method ${magicMethodMatch[1]} is not supported in TinyPHP — requires runtime dynamic dispatch/serialization.`,
                source: 'tinyphp'
            });
        }

        // Closure::bind / ->bindTo / Closure::call / Closure::fromCallable — runtime rebind not possible
        if (/\bClosure::(bind|call|fromCallable)\b/.test(line) || /->bindTo\s*\(/.test(line)) {
            let idx = line.search(/Closure::(bind|call|fromCallable)|->bindTo/);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + 20 } },
                message: 'Closure rebinding (Closure::bind/bindTo/call/fromCallable) is not supported in TinyPHP — closure scope is fixed at compile time via `use`.',
                source: 'tinyphp'
            });
        }

        // static return type — semantically identical to self in AOT, not implemented
        let staticReturnMatch = line.match(/\):\s*static\b/);
        if (staticReturnMatch) {
            let idx = line.search(/\bstatic\b/);
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + 6 } },
                message: 'static return type is not implemented in TinyPHP — semantically identical to self in AOT. Use self instead.',
                source: 'tinyphp'
            });
        }

        // DNF / intersection types: A&B (return type or parameter type)
        let dnfMatch = line.match(/\):\s*[A-Za-z_][\w\\]*\s*&\s*[A-Za-z_][\w\\]*/);
        if (dnfMatch) {
            let idx = line.search(/&\s*[A-Za-z_]/);
            if (idx !== -1) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: i, character: idx }, end: { line: i, character: idx + 1 } },
                    message: 'DNF/intersection types (A&B) are not supported in TinyPHP — would require interface vtable or t_var downgrade.',
                    source: 'tinyphp'
                });
            }
        }

        // \u{XXXX} Unicode escapes in strings — C does not support \u{} syntax
        let uniMatch = line.match(/\\u\{[0-9A-Fa-f]+\}/);
        if (uniMatch) {
            let idx = line.search(/\\u\{/);
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + uniMatch[0].length } },
                message: '\\u{XXXX} Unicode escapes are not supported in TinyPHP — C does not support \\u{} syntax. Use \\xXX or embed UTF-8 bytes directly.',
                source: 'tinyphp'
            });
        }

        // Named arguments: func(name: $value) — heuristic detection
        let namedArgsMatch = line.match(/\b([a-zA-Z_]\w*)\s*:\s*\$[a-zA-Z_]/);
        if (namedArgsMatch && !/\b(case|default|match|if|elseif|for|foreach|while|switch)\b/.test(line) && !/->/.test(line.substring(0, namedArgsMatch.index || 0))) {
            // Avoid false positives: skip if it's a property access $obj->prop: or label
            let pre = line.substring(0, namedArgsMatch.index || 0);
            if (!/^\s*[a-zA-Z_]\w*\s*:$/.test(line.trim()) && !/:\s*\$/.test(pre + namedArgsMatch[0])) {
                let idx = namedArgsMatch.index || 0;
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: { start: { line: i, character: idx }, end: { line: i, character: idx + namedArgsMatch[1].length } },
                    message: `Named arguments are not supported in TinyPHP — call ${namedArgsMatch[1]}() with positional arguments only.`,
                    source: 'tinyphp'
                });
            }
        }

        // __COMPILER_HALT_OFFSET__ constant
        if (/\b__COMPILER_HALT_OFFSET__\b/.test(line)) {
            let idx = line.search(/__COMPILER_HALT_OFFSET__/);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + 25 } },
                message: '__COMPILER_HALT_OFFSET__ is not supported in TinyPHP — no runtime file loading.',
                source: 'tinyphp'
            });
        }

        // final method modifier — only class-level final is supported
        let finalMethodMatch = line.match(/^\s*(public|private|protected)\s+final\s+function\b/) || line.match(/^\s*final\s+(public|private|protected)\s+function\b/);
        if (finalMethodMatch) {
            let idx = line.search(/\bfinal\b/);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: { start: { line: i, character: idx }, end: { line: i, character: idx + 5 } },
                message: 'final method modifier is not supported in TinyPHP — only final class is supported. Remove `final` from the method.',
                source: 'tinyphp'
            });
        }

        // implements ArrayAccess / Iterator / IteratorAggregate / Stringable — interface semantics not implemented
        let implMatch = line.match(/\bimplements\b\s+([A-Za-z_\\][\w\\,\s]*)/);
        if (implMatch) {
            let ifaceList = implMatch[1].split(',');
            for (let iface of ifaceList) {
                let trimmed = iface.trim();
                if (/\b(ArrayAccess|Iterator|IteratorAggregate|Stringable)\b/.test(trimmed)) {
                    let ifaceName = trimmed.match(/\b(ArrayAccess|Iterator|IteratorAggregate|Stringable)\b/)?.[0];
                    if (ifaceName) {
                        let idx = line.indexOf(ifaceName);
                        diagnostics.push({
                            severity: DiagnosticSeverity.Warning,
                            range: { start: { line: i, character: idx }, end: { line: i, character: idx + ifaceName.length } },
                            message: `${ifaceName} interface is recorded but not enforced in TinyPHP — dynamic dispatch (offsetGet/rewind/valid/current/key/__toString) is not supported in AOT. foreach only works with array and Generator.`,
                            source: 'tinyphp'
                        });
                    }
                }
            }
        }

        // print statement — TinyPHP only supports echo
        if (/\bprint\s*\(?\s*[\$\"'a-zA-Z0-9]/.test(line) && !/\bprintf?\s*\(/.test(line) && !/\bprint_r\s*\(/.test(line) && !/\bprintable\b/i.test(line)) {
            // Heuristic: avoid matching function names like printf, print_r, sprintf
            let printMatch = line.match(/\bprint\b\s*(?!\w)/);
            if (printMatch && !/\bfunction\s+print\b/.test(line)) {
                let idx = line.search(/\bprint\b\s*(?!\w)/);
                if (idx !== -1) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Information,
                        range: { start: { line: i, character: idx }, end: { line: i, character: idx + 5 } },
                        message: 'print is not supported in TinyPHP — use echo instead.',
                        source: 'tinyphp'
                    });
                }
            }
        }

        // 更新类块追踪状态（基于行内大括号变化）
        // 简化处理：剥离字符串/注释后统计大括号，避免字符串字面量内的 {} 干扰
        let codeOnly = line
            .replace(/\/\/.*$/, '')
            .replace(/#(?![\w\[]).*$/, '')
            .replace(/"(?:[^"\\]|\\.)*"/g, '""')
            .replace(/'(?:[^'\\]|\\.)*'/g, "''");
        let isClassDecl = /^\s*(abstract\s+|final\s+|readonly\s+)*(class|interface|trait|enum)\s+/.test(line);
        for (let ch of codeOnly) {
            if (ch === '{') {
                if (isClassDecl && classBraceLevel < 0) {
                    classBraceLevel = braceDepth;
                }
                braceDepth++;
            } else if (ch === '}') {
                braceDepth--;
                if (classBraceLevel >= 0 && braceDepth === classBraceLevel) {
                    classBraceLevel = -1;
                }
            }
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

    // 未使用变量/常量检测：收集所有定义点，扫描后文是否被引用
    checkUnusedSymbols(text, lines, diagnostics);

    // Send the computed diagnostics to VS Code
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

// 未使用变量/常量检测
//   - 局部变量：$var = ...; 或 int $var = ...;
//   - 全局/命名空间常量：const NAME = ...;（无类型前缀）
//   - 跳过：函数参数、类属性、foreach 的 $value、catch 的 $e（声明即视为已使用）
//   - 跳过：以 _ 开头的变量（约定为"占位"变量）
function checkUnusedSymbols(text: string, lines: string[], diagnostics: Diagnostic[]) {
    // 收集所有局部变量定义
    let varDefs: { name: string; line: number; col: number }[] = [];
    // 收集所有全局/命名空间常量定义
    //   hasAttribute: 是否有 #[Attribute] 注解，有的话跳过未使用检查
    let constDefs: { name: string; line: number; col: number; hasAttribute: boolean }[] = [];

    let braceDepth = 0;
    let classBraceLevel = -1;
    let funcBraceLevel = -1; // 函数体深度
    let inFuncSig = false; // 是否在函数签名中（跳过参数）

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let codeOnly = stripCommentsAndStrings(line);
        let trimmed = codeOnly.trim();

        // 检测类块
        let isClassDecl = /^\s*(abstract\s+|final\s+|readonly\s+)*(class|interface|trait|enum)\s+/.test(line);

        // 检测函数声明开始
        let funcDeclMatch = line.match(/\bfunction\s+\w*\s*\(/);

        // 收集局部变量定义（仅在函数体或顶层非类块中）
        //   形式 1: $var = ...; （普通赋值）
        //   形式 2: int $var = ...; / Foo $var = ...; （带类型）
        //   形式 3: static $var = ...; （静态局部变量）
        //   跳过类属性（类块顶层）和函数参数（在签名中）
        if (!inFuncSig && !(classBraceLevel >= 0 && braceDepth === classBraceLevel + 1 && funcBraceLevel < 0)) {
            // 形式 1: $var = ...;
            let varAssign = codeOnly.match(/^\s*(\$[a-zA-Z_]\w*)\s*=/);
            if (varAssign) {
                // 排除属性声明（public/static 等前缀）
                if (!/\b(public|private|protected|static|readonly|const)\s+/.test(codeOnly)) {
                    let name = varAssign[1];
                    if (!name.startsWith('$_')) {
                        let col = codeOnly.indexOf(name);
                        varDefs.push({ name, line: i, col });
                    }
                }
            }
            // 形式 2: Type $var = ...;
            let typedVar = codeOnly.match(/^\s*(?:int|float|string|bool|array|mixed|callable|(?:[A-Z_\\][\w\\]*))\s+(\$[a-zA-Z_]\w*)\s*=/);
            if (typedVar) {
                let name = typedVar[1];
                if (!name.startsWith('$_')) {
                    let col = codeOnly.indexOf(name);
                    varDefs.push({ name, line: i, col });
                }
            }
            // 形式 3: static $var = ...;
            let staticVar = codeOnly.match(/^\s*static\s+(\$[a-zA-Z_]\w*)\s*=/);
            if (staticVar) {
                let name = staticVar[1];
                if (!name.startsWith('$_')) {
                    let col = codeOnly.indexOf(name);
                    varDefs.push({ name, line: i, col });
                }
            }
        }

        // 收集全局/命名空间常量定义（类块外）
        if (classBraceLevel < 0) {
            let constMatch = codeOnly.match(/^\s*const\s+(\w+)\s*=/);
            if (constMatch) {
                let name = constMatch[1];
                if (!name.startsWith('_')) {
                    let constIdx = codeOnly.indexOf('const');
                    let nameIdx = codeOnly.indexOf(name, constIdx);
                    // 检查上方紧邻的非空行是否有 #[Attribute] 注解
                    //   注解形如 #[Attribute(...)]，可能跨多行（以 [ 开始，以 ] 结束）
                    //   简化：检查上方紧邻的非空行是否以 #[ 开头
                    let hasAttribute = false;
                    for (let j = i - 1; j >= 0; j--) {
                        let prevLine = lines[j].trim();
                        if (prevLine === '') continue; // 跳过空行
                        // 跳过纯注释行（// ... 或 /* ... */）
                        if (/^(\/\/|\/\*|\*)/.test(prevLine)) continue;
                        // 检测注解 #[...]（可能跨多行，但起始行以 #[ 开头）
                        if (/^\#\[/.test(prevLine)) {
                            hasAttribute = true;
                        }
                        break; // 找到第一个非空非注释行就停止
                    }
                    constDefs.push({ name, line: i, col: nameIdx, hasAttribute });
                }
            }
        }

        // 更新大括号状态
        for (let ch of codeOnly) {
            if (ch === '{') {
                if (isClassDecl && classBraceLevel < 0) {
                    classBraceLevel = braceDepth;
                }
                if (funcDeclMatch && funcBraceLevel < 0 && classBraceLevel >= 0) {
                    funcBraceLevel = braceDepth;
                }
                braceDepth++;
            } else if (ch === '}') {
                braceDepth--;
                if (funcBraceLevel >= 0 && braceDepth === funcBraceLevel) {
                    funcBraceLevel = -1;
                }
                if (classBraceLevel >= 0 && braceDepth === classBraceLevel) {
                    classBraceLevel = -1;
                }
            }
        }

        // 跟踪函数签名
        if (funcDeclMatch) {
            inFuncSig = true;
        }
        // 函数签名在行尾 ); 或 { 结束
        if (inFuncSig) {
            if (/\)\s*(\{|:|\n|$)/.test(codeOnly) || /{/.test(codeOnly)) {
                inFuncSig = false;
            }
        }
    }

    // 对每个变量定义，检查后续代码是否使用
    //   使用：$name 出现在非定义位置（= 左侧不算使用，但 +=/-= 算使用）
    //   特殊：foreach ($arr as $k => $v) 中的 $k/$v 是使用而非定义
    let usedVars = new Set<string>();
    let usedConsts = new Set<string>();

    // 扫描全文，找出所有使用的变量
    //   使用判断：$name 出现且不在"纯定义"位置
    //   纯定义：$name = ...; 且 $name 不出现在右侧
    //   使用场景：
    //     ① $name 出现在表达式中间（如 echo $name, $name + 1, $arr[$name]）
    //     ② $name 出现在复合赋值（$name +=, -=, .=, ...）
    //     ③ $name 出现在 = 右侧（$other = $name + 1）
    //     ④ $name 出现在控制结构（if ($name), foreach ($arr as $name), return $name）
    //     ⑤ $name 出现在函数调用（foo($name)）
    for (let i = 0; i < lines.length; i++) {
        let line = stripCommentsAndStrings(lines[i]);
        let varUses = line.matchAll(/\$(\w+)/g);
        for (let m of varUses) {
            let varName = '$' + m[1];
            let afterIdx = m.index! + m[0].length;
            let afterTwo = line.substring(afterIdx, afterIdx + 2);
            // 判断是否是"纯定义"位置：$name = （单等号，非 ==, ===, =>, .=）
            let isPureDef = afterTwo.startsWith('=') &&
                !afterTwo.startsWith('==') &&
                !afterTwo.startsWith('=>') &&
                !afterTwo.startsWith('.=');
            // 还需排除 +=, -=, *=, /=, %=, **=, &=, |=, ^=, <<=, >>=, ??=
            if (afterTwo[0] === '+' || afterTwo[0] === '-' || afterTwo[0] === '*' ||
                afterTwo[0] === '/' || afterTwo[0] === '%' || afterTwo[0] === '&' ||
                afterTwo[0] === '|' || afterTwo[0] === '^' || afterTwo[0] === '?') {
                if (afterTwo[1] === '=') isPureDef = false;
            }
            // 检查 3 字符复合赋值
            let afterThree = line.substring(afterIdx, afterIdx + 3);
            if (afterThree === '**=' || afterThree === '<<=' || afterThree === '>>=') {
                isPureDef = false;
            }

            if (isPureDef) {
                // 纯定义：检查右侧是否引用了同名变量（如 $i = $i + 1）
                let rhs = line.substring(afterIdx + 1);
                if (rhs.includes(varName)) {
                    usedVars.add(varName);
                }
            } else {
                // 使用点（包括复合赋值 += 等）
                usedVars.add(varName);
            }
        }
    }

    // 对每个 const 定义，检查是否在文中使用
    for (let cd of constDefs) {
        let name = cd.name;
        // 扫描所有行，查找 NAME 出现（非定义行）
        for (let i = 0; i < lines.length; i++) {
            if (i === cd.line) continue; // 跳过定义行
            let line = stripCommentsAndStrings(lines[i]);
            // 使用 \b 边界匹配
            let re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
            if (re.test(line)) {
                usedConsts.add(name);
                break;
            }
        }
    }

    // 报告未使用的变量（Information 级别，避免打扰）
    for (let vd of varDefs) {
        if (!usedVars.has(vd.name)) {
            diagnostics.push({
                severity: DiagnosticSeverity.Information,
                range: {
                    start: { line: vd.line, character: vd.col },
                    end: { line: vd.line, character: vd.col + vd.name.length }
                },
                message: `变量 ${vd.name} 已声明但未使用。移除未使用的变量以减少编译体积。`,
                source: 'tinyphp',
                tags: [DiagnosticTag.Unnecessary]
            });
        }
    }

    // 报告未使用的常量（Information 级别）
    //   跳过有 #[Attribute] 注解的常量（视为被注解使用）
    for (let cd of constDefs) {
        if (cd.hasAttribute) continue; // 注解常量跳过
        if (!usedConsts.has(cd.name)) {
            diagnostics.push({
                severity: DiagnosticSeverity.Information,
                range: {
                    start: { line: cd.line, character: cd.col },
                    end: { line: cd.line, character: cd.col + cd.name.length }
                },
                message: `常量 ${cd.name} 已声明但未使用。`,
                source: 'tinyphp',
                tags: [DiagnosticTag.Unnecessary]
            });
        }
    }
}

// 剥离注释和字符串（用于符号使用扫描）
function stripCommentsAndStrings(line: string): string {
    let result = '';
    let i = 0;
    let inString: '"' | "'" | null = null;
    let inLineComment = false;
    let inBlockComment = false;
    while (i < line.length) {
        let ch = line[i];
        let next = line[i + 1] || '';
        if (inLineComment) {
            break; // 行注释后续全部忽略
        }
        if (inBlockComment) {
            if (ch === '*' && next === '/') {
                inBlockComment = false;
                i += 2;
                continue;
            }
            i++;
            continue;
        }
        if (inString) {
            if (ch === '\\') { i += 2; continue; }
            if (ch === inString) { inString = null; i++; continue; }
            i++;
            continue;
        }
        if (ch === '/' && next === '/') { inLineComment = true; continue; }
        if (ch === '/' && next === '*') { inBlockComment = true; i += 2; continue; }
        if (ch === '#') {
            // # 预处理指令整行忽略（但 # 注释也算）
            // 简化：# 开头的行视为注释/预处理指令
            break;
        }
        if (ch === '"' || ch === "'") {
            inString = ch;
            i++;
            continue;
        }
        result += ch;
        i++;
    }
    return result;
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
        } else if (item.data === 'c-type') {
            let doc = TinyPHP.getCTypeDocumentation(item.label);
            if (doc) {
                item.documentation = { kind: MarkupKind.Markdown, value: doc };
            }
        } else if (item.data === 'constant') {
            let doc = TinyPHP.getConstantDocumentation(item.label);
            if (doc) {
                item.documentation = { kind: MarkupKind.Markdown, value: doc };
            }
        } else if (item.data === 'class-method') {
            // item.label 格式 "ClassName::method" 或 "ClassName->method"
            const m = item.label.match(/^(.+?)(?:::|->)(.+)$/);
            if (m) {
                let doc = TinyPHP.getClassMethodDocumentation(m[1], m[2]);
                if (doc) {
                    item.documentation = { kind: MarkupKind.Markdown, value: doc };
                }
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

        // Check if it's a C type annotation (C.int, C.double, ...)
        let cTypeDoc = TinyPHP.getCTypeDocumentation(word);
        if (cTypeDoc) {
            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: cTypeDoc
                }
            };
        }

        // Check if it's a C interop function (phpc_*, c_int, etc.)
        let cInteropDoc = TinyPHP.getCInteropDocumentation(word);
        if (cInteropDoc) {
            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: cInteropDoc
                }
            };
        }

        // Check if it's an extension constant (FILTER_*, PREG_*, ZLIB_*, etc.)
        let constDoc = TinyPHP.getConstantDocumentation(word);
        if (constDoc) {
            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: constDoc
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

// ---- Inlay Hints (灰色推导类型提示) ----

connection.languages.inlayHint.on(
    (params: InlayHintParams): InlayHint[] | null => {
        let document = documents.get(params.textDocument.uri);
        if (!document) return null;

        let settings = globalSettings;
        if (!settings.inlayHints.enable) return null;

        let text = document.getText();
        let lines = text.split(/\r?\n/);
        let hints: InlayHint[] = [];

        // 类块追踪（与诊断中的逻辑一致）
        let braceDepth = 0;
        let classBraceLevel = -1;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            let trimmed = line.trim();

            // 跳过空行/注释/预处理器
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
                updateBraceState(line);
                continue;
            }

            // 1. 函数参数无类型 → 在 $param 前显示灰色类型提示
            if (settings.inlayHints.showParameterTypes) {
                let funcSig = line.match(/\bfunction\s+\w*\s*\(([^)]*)\)/);
                if (funcSig) {
                    let paramsStr = funcSig[1];
                    // 解析每个参数
                    let params = parseParams(paramsStr);
                    for (let p of params) {
                        if (!p.type && p.name.startsWith('$')) {
                            // 无类型参数
                            let pIdx = line.indexOf(p.name, line.indexOf('('));
                            if (pIdx !== -1) {
                                let inferred = inferTypeFromDefault(p.default);
                                let label = inferred ? `${inferred} ` : 'mixed ';
                                hints.push({
                                    position: Position.create(i, pIdx),
                                    label: label,
                                    kind: InlayHintKind.Type,
                                    paddingLeft: false,
                                    paddingRight: false,
                                    tooltip: `参数 ${p.name} 类型可选（TinyPHP 不强制）。${inferred ? `根据默认值推导为 ${inferred}` : '建议写上类型以便编译期检查'}。`
                                });
                            }
                        }
                    }
                }
            }

            // 2. 全局/命名空间/函数内常量无类型 → 在常量名前显示推导类型
            //    （类常量也有 Warning 诊断，但 Inlay Hint 提供额外推导提示）
            if (settings.inlayHints.showConstantTypes) {
                let constMatch = line.match(/^\s*(?:public|private|protected|static|final|readonly\s+)*\s*const\s+(\w+)\s*=\s*([^;]+);/);
                if (constMatch) {
                    // 检查是否已有类型
                    let hasType = /^\s*(?:public|private|protected|static|final|readonly\s+)*\s*const\s+\w+\s+\w+\s*=/.test(line);
                    if (!hasType) {
                        let value = constMatch[2].trim();
                        let inferred = inferTypeFromLiteral(value);
                        if (inferred) {
                            let nameIdx = line.indexOf(constMatch[1], line.indexOf('const'));
                            if (nameIdx !== -1) {
                                let inClass = classBraceLevel >= 0;
                                let tooltip = inClass
                                    ? `类常量类型必填。根据字面量推导为 ${inferred}。`
                                    : `常量类型可选（省略时按字面量推导）。根据字面量推导为 ${inferred}。`;
                                hints.push({
                                    position: Position.create(i, nameIdx),
                                    label: `${inferred} `,
                                    kind: InlayHintKind.Type,
                                    paddingLeft: false,
                                    paddingRight: false,
                                    tooltip: tooltip
                                });
                            }
                        }
                    }
                }
            }

            // 3. 静态局部变量无类型 → static $x = ... → 显示推导类型
            //    GRAMMAR.md §7: 'static' type? '$' IDENTIFIER '=' expr ';' (类型可选)
            if (settings.inlayHints.showParameterTypes) {
                let staticMatch = line.match(/^\s*static\s+(\$[a-zA-Z_]\w*)\s*=\s*([^;]+);/);
                if (staticMatch) {
                    let value = staticMatch[2].trim();
                    let inferred = inferTypeFromLiteral(value);
                    if (inferred) {
                        let nameIdx = line.indexOf(staticMatch[1], line.indexOf('static'));
                        if (nameIdx !== -1) {
                            hints.push({
                                position: Position.create(i, nameIdx),
                                label: `${inferred} `,
                                kind: InlayHintKind.Type,
                                paddingLeft: false,
                                paddingRight: false,
                                tooltip: `静态局部变量类型可选。根据字面量推导为 ${inferred}。`
                            });
                        }
                    }
                }
            }

            // 4. 普通局部变量无类型标记 → $x = expr; → 显示推导类型
            //    TinyPHP 中 $x = 42 是赋值，类型按值推导。Inlay Hint 提示推导类型
            //    排除类块顶层（避免误报类属性声明 public $x;）
            //    支持跨多行表达式（如 match、数组、三元等）
            //    支持 for ($i = 0; $i < 5; $i++) 中的初始化语句类型推导
            if (settings.inlayHints.showParameterTypes) {
                let singleLineMatch = line.match(/^\s*(\$[a-zA-Z_]\w*)\s*=\s*([^;]+);/);
                let multiLineStart = /^\s*(\$[a-zA-Z_]\w*)\s*=\s*(?!.*;\s*$)/.test(line) &&
                    /\b(match|array|list|fn|function)\b/.test(line);
                // for 循环初始化：for ($i = 0; ...) — 在括号内，以 ; 分隔（非行尾 ;）
                let forInitMatch = line.match(/\bfor\s*\(\s*(\$[a-zA-Z_]\w*)\s*=\s*([^;)]+);/);

                if (singleLineMatch) {
                    // 单行赋值
                    if (!/\b(public|private|protected|static|readonly)\s+\$/.test(line)) {
                        let value = singleLineMatch[2].trim();
                        let inferred = inferTypeFromLiteral(value);
                        if (inferred) {
                            let nameIdx = line.indexOf(singleLineMatch[1]);
                            if (nameIdx !== -1) {
                                hints.push({
                                    position: Position.create(i, nameIdx),
                                    label: `${inferred} `,
                                    kind: InlayHintKind.Type,
                                    paddingLeft: false,
                                    paddingRight: false,
                                    tooltip: `局部变量。根据表达式推导为 ${inferred}。可写为 \`${inferred} ${singleLineMatch[1]} = ${value};\` 以声明固定类型。`
                                });
                            }
                        }
                    }
                } else if (forInitMatch) {
                    // for 循环初始化语句：for ($i = 0; ...)
                    let varName = forInitMatch[1];
                    let value = forInitMatch[2].trim();
                    let inferred = inferTypeFromLiteral(value);
                    if (inferred) {
                        let nameIdx = line.indexOf(varName);
                        if (nameIdx !== -1) {
                            hints.push({
                                position: Position.create(i, nameIdx),
                                label: `${inferred} `,
                                kind: InlayHintKind.Type,
                                paddingLeft: false,
                                paddingRight: false,
                                tooltip: `循环变量。根据初始化表达式推导为 ${inferred}。`
                            });
                        }
                    }
                } else if (multiLineStart) {
                    // 跨多行表达式（match/array/list/fn 等）
                    let varMatch = line.match(/^\s*(\$[a-zA-Z_]\w*)\s*=/);
                    if (!varMatch) { updateBraceState(line); continue; }
                    let varName = varMatch[1];
                    if (/\b(public|private|protected|static|readonly)\s+\$/.test(line)) {
                        updateBraceState(line); continue;
                    }
                    // 向前扫描后续行，直到找到语句结束（行尾有 ;）
                    let exprLines = [line.trim()];
                    let endLine = i;
                    for (let j = i + 1; j < lines.length && j <= i + 50; j++) {
                        exprLines.push(lines[j].trim());
                        endLine = j;
                        if (/;\s*$/.test(lines[j])) break;
                    }
                    let fullExpr = exprLines.join(' ');
                    // 提取 $var = ...; 中的表达式部分
                    let exprMatch = fullExpr.match(/^\s*\$[a-zA-Z_]\w*\s*=\s*(.+);\s*$/);
                    if (exprMatch) {
                        let value = exprMatch[1].trim();
                        let inferred = inferTypeFromLiteral(value);
                        if (inferred) {
                            let nameIdx = line.indexOf(varName);
                            if (nameIdx !== -1) {
                                hints.push({
                                    position: Position.create(i, nameIdx),
                                    label: `${inferred} `,
                                    kind: InlayHintKind.Type,
                                    paddingLeft: false,
                                    paddingRight: false,
                                    tooltip: `局部变量。根据表达式推导为 ${inferred}。可写为 \`${inferred} ${varName} = ...;\` 以声明固定类型。`
                                });
                            }
                        }
                    }
                    // 更新所有跨过行的大括号状态
                    for (let j = i; j <= endLine; j++) {
                        updateBraceState(lines[j]);
                    }
                    i = endLine;
                    continue;
                }
            }

            updateBraceState(line);
        }

        return hints;

        // 局部函数：更新类块追踪状态
        function updateBraceState(line: string) {
            let codeOnly = line
                .replace(/\/\/.*$/, '')
                .replace(/#(?![\w\[]).*$/, '')
                .replace(/"(?:[^"\\]|\\.)*"/g, '""')
                .replace(/'(?:[^'\\]|\\.)*'/g, "''");
            let isClassDecl = /^\s*(abstract\s+|final\s+|readonly\s+)*(class|interface|trait|enum)\s+/.test(line);
            for (let ch of codeOnly) {
                if (ch === '{') {
                    if (isClassDecl && classBraceLevel < 0) {
                        classBraceLevel = braceDepth;
                    }
                    braceDepth++;
                } else if (ch === '}') {
                    braceDepth--;
                    if (classBraceLevel >= 0 && braceDepth === classBraceLevel) {
                        classBraceLevel = -1;
                    }
                }
            }
        }
    }
);

// 解析函数参数字符串，返回 {name, type?, default?} 数组
function parseParams(paramsStr: string): { name: string; type?: string; default?: string }[] {
    let result: { name: string; type?: string; default?: string }[] = [];
    if (!paramsStr.trim()) return result;

    // 简单分割（不处理嵌套默认值中的逗号，可接受）
    let parts = splitParams(paramsStr);
    for (let part of parts) {
        let trimmed = part.trim();
        if (!trimmed) continue;

        // 跳过尾部逗号
        if (trimmed === ',') continue;

        // 默认值
        let defaultVal: string | undefined;
        let eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
            defaultVal = trimmed.substring(eqIdx + 1).trim();
            trimmed = trimmed.substring(0, eqIdx).trim();
        }

        // 可变参数 ...
        if (trimmed.startsWith('...')) {
            trimmed = trimmed.substring(3).trim();
        }

        // 引用 &
        if (trimmed.startsWith('&')) {
            trimmed = trimmed.substring(1).trim();
        }

        // 属性提升 public/private/protected
        let visibilityMatch = trimmed.match(/^(public|private|protected)\s+(.+)$/);
        if (visibilityMatch) {
            trimmed = visibilityMatch[2].trim();
        }

        // 现在 trimmed 形如 "int $x" 或 "$x"
        let tokens = trimmed.split(/\s+/);
        if (tokens.length >= 2) {
            // 有类型
            result.push({ name: tokens[tokens.length - 1], type: tokens.slice(0, -1).join(' ') });
        } else if (tokens.length === 1) {
            // 无类型
            result.push({ name: tokens[0], default: defaultVal });
        }
    }
    return result;
}

// 按顶层逗号分割参数（处理嵌套括号/字符串）
function splitParams(s: string): string[] {
    let result: string[] = [];
    let depth = 0;
    let inString: '"' | "'" | null = null;
    let escape = false;
    let current = '';
    for (let i = 0; i < s.length; i++) {
        let ch = s[i];
        if (escape) { escape = false; current += ch; continue; }
        if (ch === '\\') { escape = true; current += ch; continue; }
        if (inString) {
            current += ch;
            if (ch === inString) inString = null;
            continue;
        }
        if (ch === '"' || ch === "'") { inString = ch; current += ch; continue; }
        if (ch === '(' || ch === '[' || ch === '{') { depth++; current += ch; continue; }
        if (ch === ')' || ch === ']' || ch === '}') { depth--; current += ch; continue; }
        if (ch === ',' && depth === 0) {
            result.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim()) result.push(current);
    return result;
}

// 从默认值推导类型
function inferTypeFromDefault(defaultVal?: string): string | null {
    if (!defaultVal) return null;
    return inferTypeFromLiteral(defaultVal);
}

// 从字面量或表达式推导类型（用于 Inlay Hint）
function inferTypeFromLiteral(expr: string): string | null {
    let trimmed = expr.trim();
    if (!trimmed) return null;

    // bool
    if (trimmed === 'true' || trimmed === 'false') return 'bool';
    // null
    if (trimmed === 'null') return 'mixed';
    // 整数（含八进制 0o、十六进制 0x、二进制 0b、下划线分隔）
    if (/^[-+]?\d[\d_]*$/.test(trimmed) ||
        /^[-+]?0[xX][0-9a-fA-F_]+$/.test(trimmed) ||
        /^[-+]?0[oO][0-7_]+$/.test(trimmed) ||
        /^[-+]?0[bB][01_]+$/.test(trimmed)) {
        return 'int';
    }
    // 浮点
    if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(trimmed) && /[.eE]/.test(trimmed)) {
        return 'float';
    }
    // 字符串（严格匹配整个表达式为单一字符串字面量）
    if (/^"(?:[^"\\]|\\.)*"$/.test(trimmed) || /^'(?:[^'\\]|\\.)*'$/.test(trimmed)) {
        return 'string';
    }
    // 数组
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) return 'array';
    if (trimmed.startsWith('array(') && trimmed.endsWith(')')) return 'array';

    // 函数调用：\ns\funcName(...) 或 funcName(...) 或 Foo::bar(...) — 通过内置函数表推导返回类型
    //   注意：方法调用 $obj->bar(...) 无法静态确定，返回 null
    //   注意：match 是控制流结构，不是函数调用，交由 inferTypeFromExpression 处理
    let funcCall = trimmed.match(/^(?:\\?[A-Za-z_\\][\w\\]*)\s*\(/);
    if (funcCall && !/^match\s*\(/.test(trimmed)) {
        // 提取函数名（去除命名空间前缀中的 \）
        let fullName = trimmed.substring(0, funcCall[0].length - 1).trim();
        let bareName = fullName.split('\\').pop()!;
        // 先精确查找，再按短名查找
        let rt = TinyPHP.getFunctionReturnType(fullName) || TinyPHP.getFunctionReturnType(bareName);
        if (rt) return rt;

        // 内置函数表未收录时，按命名约定推导
        if (/^(is_|is|str_|array_|in_array|ctype_)/.test(bareName)) {
            if (/^(is_|ctype_)/.test(bareName)) return 'bool';
            if (/^str_/.test(bareName)) return 'string';
            if (/^array_/.test(bareName)) {
                // array_keys/array_map/array_filter 等多数返回 array，array_sum/array_product 返回 int|float
                if (/^array_(sum|product)$/.test(bareName)) return 'int';
                return 'array';
            }
            // in_array → bool
            if (bareName === 'in_array') return 'bool';
        }
        // 已知返回标量的函数
        if (/^(count|sizeof|strlen|substr_count|strpos|stripos|strripos|strrpos|strcmp|strcasecmp|strncmp|strncasecmp|ord|intval|floatval|boolval)$/.test(bareName)) {
            if (bareName === 'intval') return 'int';
            if (bareName === 'floatval') return 'float';
            if (bareName === 'boolval') return 'bool';
            return 'int';
        }
        if (/^(strtolower|strtoupper|substr|trim|ltrim|rtrim|str_replace|str_pad|str_repeat|sprintf|ucfirst|lcfirst|ucwords|strrev|htmlspecialchars|nl2br|wordwrap|chunk_split|implode|join)$/.test(bareName)) {
            return 'string';
        }
        if (/^(floatval|doubleval)$/.test(bareName)) return 'float';
        // gettype → string, get_class → string
        if (bareName === 'gettype' || bareName === 'get_class') return 'string';

        // 无法确定返回类型 → 退回 null（不显示 Inlay Hint，避免误导）
        return null;
    }

    // new ClassName(...) → 对象类型
    let newMatch = trimmed.match(/^new\s+(\\?[A-Z][\w\\]*)\s*\(/);
    if (newMatch) {
        return newMatch[1].split('\\').pop()!;
    }

    // 复合表达式（算术、字符串连接、比较、逻辑、三元、管道等）
    return inferTypeFromExpression(trimmed);
}

// 从复合表达式推导类型（递归）
// 优先级：match > 三元 > ?? > || && > 比较 > . 字符串连接 > + - > * / % > 位操作 > 一元 ! > |>
function inferTypeFromExpression(expr: string): string | null {
    let trimmed = expr.trim();
    if (!trimmed) return null;

    // 先尝试字面量/函数调用/new/array（避免递归到复合分支）
    let simple = inferSimpleType(trimmed);
    if (simple !== undefined) return simple;

    // 保护字符串字面量（避免操作符扫描误判字符串内的字符）
    const tokens: string[] = [];
    const protected_ = protectStringLiterals(trimmed, tokens);

    // 去除最外层括号 (expr)
    let unwrapped = unwrapOuterParens(protected_);

    // 0. match 表达式：match (subject) { cond1 => r1, cond2 => r2, default => r3 }
    //    返回所有 => 右侧表达式的类型（取所有分支相同类型；数值分支混合时返回 float）
    let matchType = inferMatchExpressionType(unwrapped, tokens);
    if (matchType !== undefined) return matchType;

    // 1. 三元 expr ? a : b（优先级最低）
    let ternaryParts = findTopLevelTernary(unwrapped);
    if (ternaryParts) {
        let [cond, thenExpr, elseExpr] = ternaryParts;
        void cond; // 不关心条件类型
        let thenType = inferTypeFromExpression(restoreStringLiterals(thenExpr, tokens));
        let elseType = inferTypeFromExpression(restoreStringLiterals(elseExpr, tokens));
        if (thenType && elseType) {
            if (thenType === elseType) return thenType;
            // 类型不同：若两者皆为数值，返回 float；否则退回 null
            if (isNumeric(thenType) && isNumeric(elseType)) return 'float';
            return null;
        }
        return thenType || elseType;
    }

    // 2. ?? 空合并 — 取右侧类型
    let coalesceSplit = findTopLevelOperator(unwrapped, '??');
    if (coalesceSplit) {
        return inferTypeFromExpression(restoreStringLiterals(coalesceSplit[1], tokens));
    }

    // 3. || 或 && → bool
    if (findTopLevelOperator(unwrapped, '||') || findTopLevelOperator(unwrapped, '&&')) {
        return 'bool';
    }

    // 4. 比较操作符 → bool
    for (let op of ['<=>', '===', '!==', '==', '!=', '<=', '>=', '<', '>']) {
        if (findTopLevelOperator(unwrapped, op)) {
            return 'bool';
        }
    }

    // 5. 管道 |> — 取最右侧表达式类型
    let pipeSplit = findTopLevelOperator(unwrapped, '|>');
    if (pipeSplit) {
        return inferTypeFromExpression(restoreStringLiterals(pipeSplit[1], tokens));
    }

    // 6. 字符串连接 . → string
    if (findTopLevelOperator(unwrapped, '.')) {
        return 'string';
    }

    // 7. + - 算术（二元，非一元符号）
    let addSplit = findTopLevelBinaryArithOp(unwrapped, ['+', '-']);
    if (addSplit) {
        let [left, right, op] = addSplit;
        // 若 - 是一元负号（left 为空），递归处理右侧
        if (op === '-' && left.trim() === '') {
            return inferTypeFromExpression(restoreStringLiterals(right, tokens));
        }
        let lt = inferTypeFromExpression(restoreStringLiterals(left, tokens));
        let rt = inferTypeFromExpression(restoreStringLiterals(right, tokens));
        if (lt === 'float' || rt === 'float') return 'float';
        if (lt === 'int' && rt === 'int') return 'int';
        return null;
    }

    // 8. * / %
    let mulSplit = findTopLevelBinaryArithOp(unwrapped, ['*', '/', '%']);
    if (mulSplit) {
        let [left, right] = mulSplit;
        let lt = inferTypeFromExpression(restoreStringLiterals(left, tokens));
        let rt = inferTypeFromExpression(restoreStringLiterals(right, tokens));
        if (lt === 'float' || rt === 'float') return 'float';
        if (lt === 'int' && rt === 'int') return 'int';
        return null;
    }

    // 8.5 幂运算 ** — 结果总是 int 或 float：int ** int → int（非负指数时），
    //    但 PHP 中 int ** int 在溢出时为 float；保守推导：任一为 float → float，否则 int
    let powSplit = findTopLevelOperator(unwrapped, '**');
    if (powSplit) {
        let lt = inferTypeFromExpression(restoreStringLiterals(powSplit[0], tokens));
        let rt = inferTypeFromExpression(restoreStringLiterals(powSplit[1], tokens));
        if (lt === 'float' || rt === 'float') return 'float';
        if (lt === 'int' && rt === 'int') return 'int';
        return null;
    }

    // 9. 位操作 << >> & | ^ → int
    for (let op of ['<<', '>>', '&', '|', '^']) {
        if (findTopLevelOperator(unwrapped, op)) {
            return 'int';
        }
    }

    // 10. 一元 ! 逻辑非 → bool
    if (/^!\s*\S/.test(unwrapped)) {
        return 'bool';
    }

    // 11. 常量识别（PHP_EOL/PHP_INT_MAX 等）
    let constType = inferConstantType(trimmed);
    if (constType) return constType;

    // 12. 变量/属性/静态访问/数组访问 — 无法静态确定，返回 null
    return null;
}

// 简单类型判定（字面量/函数/new/array），返回 string | null | undefined
//   undefined 表示"不是简单类型，请继续复合表达式推导"
function inferSimpleType(expr: string): string | null | undefined {
    if (!expr) return null;
    // 注意：用 trim 后的版本做正则匹配，避免操作符分割后两侧的空格干扰
    let t = expr.trim();
    // bool/null/int/float/string/array 字面量 — 直接调 inferTypeFromLiteral 前置分支
    if (t === 'true' || t === 'false') return 'bool';
    if (t === 'null') return 'mixed';
    if (/^[-+]?\d[\d_]*$/.test(t) ||
        /^[-+]?0[xX][0-9a-fA-F_]+$/.test(t) ||
        /^[-+]?0[oO][0-7_]+$/.test(t) ||
        /^[-+]?0[bB][01_]+$/.test(t)) return 'int';
    if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(t) && /[.eE]/.test(t)) return 'float';
    if (/^"(?:[^"\\]|\\.)*"$/.test(t) || /^'(?:[^'\\]|\\.)*'$/.test(t)) return 'string';
    if (t.startsWith('[') && t.endsWith(']')) return 'array';
    if (t.startsWith('array(') && t.endsWith(')')) return 'array';

    // 函数调用（排除 match 控制流结构）
    let funcCall = t.match(/^(?:\\?[A-Za-z_\\][\w\\]*)\s*\(/);
    if (funcCall && !/^match\s*\(/.test(t)) {
        let fullName = t.substring(0, funcCall[0].length - 1).trim();
        let bareName = fullName.split('\\').pop()!;
        let rt = TinyPHP.getFunctionReturnType(fullName) || TinyPHP.getFunctionReturnType(bareName);
        if (rt) return rt;
        // 命名约定推导（与 inferTypeFromLiteral 中一致）
        if (/^(is_|ctype_)/.test(bareName)) return 'bool';
        if (/^str_/.test(bareName)) return 'string';
        if (/^array_/.test(bareName)) {
            if (/^array_(sum|product)$/.test(bareName)) return 'int';
            return 'array';
        }
        if (bareName === 'in_array') return 'bool';
        if (bareName === 'intval' || bareName === 'floatval' || bareName === 'boolval') {
            if (bareName === 'intval') return 'int';
            if (bareName === 'floatval') return 'float';
            return 'bool';
        }
        if (/^(count|sizeof|strlen|substr_count|strpos|stripos|strripos|strrpos|strcmp|strcasecmp|strncmp|strncasecmp|ord)$/.test(bareName)) return 'int';
        if (/^(strtolower|strtoupper|substr|trim|ltrim|rtrim|str_replace|str_pad|str_repeat|sprintf|ucfirst|lcfirst|ucwords|strrev|htmlspecialchars|nl2br|wordwrap|chunk_split|implode|join)$/.test(bareName)) return 'string';
        if (bareName === 'doubleval') return 'float';
        if (bareName === 'gettype' || bareName === 'get_class') return 'string';
        // 方法调用 $obj->foo() / 静态方法 Foo::bar() / 无法识别的函数 → null
        return null;
    }

    // new ClassName(...)
    let newMatch = t.match(/^new\s+(\\?[A-Z][\w\\]*)\s*\(/);
    if (newMatch) return newMatch[1].split('\\').pop()!;

    return undefined; // 不是简单类型，调用方继续复合推导
}

// 判断是否数值类型
function isNumeric(t: string | null): boolean {
    return t === 'int' || t === 'float';
}

// 保护字符串字面量（双引号、单引号），用 \x00index\x00 占位符替换
function protectStringLiterals(code: string, tokens: string[]): string {
    return code
        .replace(/"(?:[^"\\]|\\.)*"/g, (m) => {
            tokens.push(m);
            return `\x00${tokens.length - 1}\x00`;
        })
        .replace(/'(?:[^'\\]|\\.)*'/g, (m) => {
            tokens.push(m);
            return `\x00${tokens.length - 1}\x00`;
        });
}

// 还原字符串字面量
function restoreStringLiterals(code: string, tokens: string[]): string {
    return code.replace(/\x00(\d+)\x00/g, (_, i) => tokens[parseInt(i, 10)]);
}

// 去除最外层括号 (expr) — 若整个表达式被一对括号包围
function unwrapOuterParens(code: string): string {
    let s = code.trim();
    while (s.startsWith('(') && s.endsWith(')')) {
        // 验证括号匹配：从第一个 ( 找到匹配的 )
        let depth = 0;
        let matchEnd = -1;
        for (let i = 0; i < s.length; i++) {
            if (s[i] === '(') depth++;
            else if (s[i] === ')') {
                depth--;
                if (depth === 0) {
                    matchEnd = i;
                    break;
                }
            }
        }
        if (matchEnd === s.length - 1) {
            // 最外层括号包裹整个表达式，去除
            s = s.slice(1, -1).trim();
        } else {
            break;
        }
    }
    return s;
}

// 在顶层（非括号内、非字符串占位符内）查找操作符，从右向左扫描，返回 [left, right]
//   op 是字符串操作符（如 '||', '+', '.' 等）
function findTopLevelOperator(code: string, op: string): [string, string] | null {
    let depth = 0;
    let i = code.length;
    while (i > 0) {
        i--;
        let ch = code[i];
        // 跳过字符串占位符 \x00digits\x00
        if (ch === '\x00') {
            // 当前 i 指向占位符末尾 \x00，向左查找开头的 \x00
            while (i > 0 && code[i - 1] !== '\x00') i--;
            if (i > 0) i--; // 现在 i 指向占位符开头 \x00
            continue; // 下次循环 i-- 后跳到占位符之前的位置
        }
        if (ch === ')') { depth++; continue; }
        if (ch === '(') { depth--; continue; }
        if (depth !== 0) continue;
        // 检查 op 是否在当前位置（op 的末尾字符在 i）
        let opLen = op.length;
        let start = i - opLen + 1;
        if (start < 0) continue;
        let candidate = code.substr(start, opLen);
        if (candidate === op) {
            // 排除操作符前后是标识符/数字字符（避免误匹配 . 在浮点数中，+ 在 ++ 中等）
            if (isOperatorBoundary(code, start, opLen)) {
                let left = code.substring(0, start);
                let right = code.substring(start + opLen);
                // 操作符两侧必须都有内容（一元操作符例外，由调用方判断）
                if (left.trim() && right.trim()) {
                    return [left, right];
                }
            }
        }
    }
    return null;
}

// 检查操作符位置是否为真正的操作符边界（非浮点数的小数点、非 ++ 等）
function isOperatorBoundary(code: string, start: number, opLen: number): boolean {
    let beforeChar = start > 0 ? code[start - 1] : '';
    let afterChar = code[start + opLen] || '';
    let op = code.substr(start, opLen);

    // 对于 . 字符串连接操作符：前后不能是数字（避免浮点数 1.5）
    if (op === '.') {
        return !/\d/.test(beforeChar) && !/\d/.test(afterChar);
    }
    // 对于 +：前后不能是 +（避免 ++）和 =（避免 +=）
    if (op === '+') {
        return beforeChar !== '+' && afterChar !== '+' && afterChar !== '=';
    }
    // 对于 -：前后不能是 -（避免 --）和 =（避免 -=）
    if (op === '-') {
        return beforeChar !== '-' && afterChar !== '-' && afterChar !== '=';
    }
    // 对于 *：前不能是 *（避免 ** 幂运算中的第二个 *）后不能是 =（避免 *=）和 *（避免 ** 幂运算中的第一个 *）
    if (op === '*') {
        return beforeChar !== '*' && afterChar !== '=' && afterChar !== '*';
    }
    // 对于 /：前不能是 /（避免注释 //）后不能是 =（避免 /=）
    if (op === '/') {
        return beforeChar !== '/' && afterChar !== '=';
    }
    // 对于 %：后不能是 =（避免 %=）
    if (op === '%') {
        return afterChar !== '=';
    }
    // 对于 &：前后不能是 &（避免 &&）后不能是 =（避免 &=）
    if (op === '&') {
        return beforeChar !== '&' && afterChar !== '&' && afterChar !== '=';
    }
    // 对于 |：前后不能是 |（避免 ||）后不能是 >（避免 |>）和 =（避免 |=）
    if (op === '|') {
        return beforeChar !== '|' && afterChar !== '|' && afterChar !== '>' && afterChar !== '=';
    }
    // 对于 ^：后不能是 =（避免 ^=）
    if (op === '^') {
        return afterChar !== '=';
    }
    // 对于 <：前不能是 <（避免 <<）后不能是 =（避免 <=）和 <（避免 <<）
    if (op === '<') {
        return beforeChar !== '<' && afterChar !== '=' && afterChar !== '<';
    }
    // 对于 >：前不能是 >（避免 >>）后不能是 =（避免 >=）
    if (op === '>') {
        return beforeChar !== '>' && afterChar !== '=';
    }
    return true;
}

// 查找顶层二元算术操作符（+ - * / %），返回 [left, right, op]
//   支持一元负号：若 - 出现在表达式开头且无左侧操作数，返回 ['', right, '-']
function findTopLevelBinaryArithOp(code: string, ops: string[]): [string, string, string] | null {
    for (let op of ops) {
        let split = findTopLevelOperator(code, op);
        if (split) {
            return [split[0], split[1], op];
        }
    }
    return null;
}

// 推导 match 表达式类型：match (subject) { cond1 => r1, cond2, cond3 => r2, default => r3 }
//   返回 string | null | undefined：
//   undefined = 不是 match 表达式
//   null = 是 match 但无法确定类型
//   string = 推导出的类型
function inferMatchExpressionType(code: string, tokens: string[]): string | null | undefined {
    // 检测是否以 match 关键字开头
    let matchHead = code.match(/^match\s*\(/);
    if (!matchHead) return undefined;

    // 找到 match 后的 (subject) 的匹配 ) 位置
    let parenStart = code.indexOf('(');
    if (parenStart === -1) return undefined;
    let parenEnd = findMatchingClose(code, parenStart, '(', ')');
    if (parenEnd === -1) return undefined;

    // 找到紧随其后的 {
    let braceStart = code.indexOf('{', parenEnd);
    if (braceStart === -1) return undefined;
    let braceEnd = findMatchingClose(code, braceStart, '{', '}');
    if (braceEnd === -1) return undefined;

    // 提取花括号内的内容
    let body = code.substring(braceStart + 1, braceEnd);
    // 还原字符串字面量
    body = restoreStringLiterals(body, tokens);

    // 按顶层逗号分割为分支
    let arms = splitTopLevelCommas(body);
    if (arms.length === 0) return null;

    // 收集所有 => 右侧表达式的类型
    let armTypes: string[] = [];
    for (let arm of arms) {
        let trimmedArm = arm.trim();
        if (!trimmedArm) continue;
        // 跳过尾部逗号
        if (trimmedArm === ',') continue;

        // 找到 => 分隔符（注意可能是多条件 cond1, cond2 => r1，但此时 arm 是单个分支已分割）
        // 找最顶层 => 的位置（避免字符串内的 =>）
        let arrowPos = findTopLevelArrow(trimmedArm);
        if (arrowPos === -1) continue; // 没找到 =>，跳过

        let resultExpr = trimmedArm.substring(arrowPos + 2).trim();
        let t = inferTypeFromExpression(resultExpr);
        if (t) armTypes.push(t);
    }

    if (armTypes.length === 0) return null;

    // 合并所有分支类型
    let firstType = armTypes[0];
    let allSame = armTypes.every(t => t === firstType);
    if (allSame) return firstType;

    // 数值类型混合 → float
    if (armTypes.every(t => isNumeric(t))) return 'float';

    return null;
}

// 找到顶层 => 的位置（避免字符串字面量内的 =>）
function findTopLevelArrow(code: string): number {
    let depth = 0;
    let i = 0;
    while (i < code.length - 1) {
        let ch = code[i];
        // 跳过字符串字面量
        if (ch === '"' || ch === "'") {
            let quote = ch;
            i++;
            while (i < code.length) {
                if (code[i] === '\\') { i += 2; continue; }
                if (code[i] === quote) { i++; break; }
                i++;
            }
            continue;
        }
        if (ch === '(' || ch === '[' || ch === '{') { depth++; i++; continue; }
        if (ch === ')' || ch === ']' || ch === '}') { depth--; i++; continue; }
        if (depth === 0 && ch === '=' && code[i + 1] === '>') {
            return i;
        }
        i++;
    }
    return -1;
}

// 按顶层逗号分割（跳过括号、方括号、花括号、字符串）
function splitTopLevelCommas(s: string): string[] {
    let result: string[] = [];
    let depth = 0;
    let current = '';
    let i = 0;
    while (i < s.length) {
        let ch = s[i];
        // 跳过字符串字面量
        if (ch === '"' || ch === "'") {
            let quote = ch;
            current += ch;
            i++;
            while (i < s.length) {
                if (s[i] === '\\') { current += s[i] + (s[i + 1] || ''); i += 2; continue; }
                current += s[i];
                if (s[i] === quote) { i++; break; }
                i++;
            }
            continue;
        }
        if (ch === '(' || ch === '[' || ch === '{') { depth++; current += ch; i++; continue; }
        if (ch === ')' || ch === ']' || ch === '}') { depth--; current += ch; i++; continue; }
        if (ch === ',' && depth === 0) {
            result.push(current);
            current = '';
            i++;
            continue;
        }
        current += ch;
        i++;
    }
    if (current.trim()) result.push(current);
    return result;
}

// 找到匹配的闭合括号位置（从 openPos 的开括号开始）
function findMatchingClose(code: string, openPos: number, open: string, close: string): number {
    let depth = 0;
    for (let i = openPos; i < code.length; i++) {
        if (code[i] === open) depth++;
        else if (code[i] === close) {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

// 查找顶层三元表达式 expr ? then : else
//   返回 [cond, then, else] 或 null
function findTopLevelTernary(code: string): [string, string, string] | null {
    let depth = 0;
    let qPos = -1;
    let colonPos = -1;
    // 找到第一个不在括号/字符串占位符内的 ?
    for (let i = 0; i < code.length; i++) {
        let ch = code[i];
        if (ch === '\x00') {
            // 跳过占位符 \x00index\x00
            while (i < code.length && code[i] !== '\x00') i++;
            if (i < code.length) i++; // 跳过尾 \x00
            continue;
        }
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (depth === 0 && ch === '?' && i + 1 < code.length && code[i + 1] !== '?') {
            // 不是 ?? 空合并
            if (i === 0 || code[i - 1] !== '?') {
                qPos = i;
                break;
            }
        }
    }
    if (qPos === -1) return null;

    // 从 qPos 之后找匹配的 : （考虑嵌套三元）
    depth = 0;
    let ternaryDepth = 0;
    for (let i = qPos + 1; i < code.length; i++) {
        let ch = code[i];
        if (ch === '\x00') {
            while (i < code.length && code[i] !== '\x00') i++;
            if (i < code.length) i++;
            continue;
        }
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (depth === 0 && ch === '?' && i + 1 < code.length && code[i + 1] !== '?') {
            ternaryDepth++;
        } else if (depth === 0 && ch === ':') {
            if (ternaryDepth === 0) {
                colonPos = i;
                break;
            }
            ternaryDepth--;
        }
    }
    if (colonPos === -1) return null;

    let cond = code.substring(0, qPos);
    let thenExpr = code.substring(qPos + 1, colonPos);
    let elseExpr = code.substring(colonPos + 1);
    return [cond, thenExpr, elseExpr];
}

// 推断常见 PHP 常量类型
function inferConstantType(name: string): string | null {
    // 整型常量
    if (/^(PHP_INT_MAX|PHP_INT_MIN|PHP_INT_SIZE|PHP_MAJOR_VERSION|PHP_MINOR_VERSION|PHP_RELEASE_VERSION|PHP_VERSION_ID|PHP_DEBUG|PHP_FLOAT_DIG|PHP_FLOAT_EPSILON|PHP_FLOAT_MAX|PHP_FLOAT_MIN|DIRECTORY_SEPARATOR|PHP_EOL|PHP_OS_FAMILY|PHP_OS|PHP_SAPI|PHP_BINARY)$/.test(name)) {
        if (/^(PHP_EOL|DIRECTORY_SEPARATOR|PHP_OS_FAMILY|PHP_OS|PHP_SAPI|PHP_BINARY)$/.test(name)) return 'string';
        if (/^(PHP_FLOAT_DIG|PHP_FLOAT_EPSILON|PHP_FLOAT_MAX|PHP_FLOAT_MIN)$/.test(name)) return 'float';
        return 'int';
    }
    if (name === 'PHP_VERSION') return 'string';
    if (name === 'M_PI' || name === 'M_E' || name === 'M_SQRT2' || name === 'M_SQRT3' ||
        name === 'M_LOG2E' || name === 'M_LOG10E' || name === 'M_LN2' || name === 'M_LN10' ||
        name === 'M_PI_2' || name === 'M_PI_4' || name === 'M_1_PI' || name === 'M_2_PI' ||
        name === 'M_2_SQRTPI' || name === 'M_SQRT1_2') return 'float';
    if (name === 'E_ALL' || name === 'E_ERROR' || name === 'E_WARNING' || name === 'E_NOTICE' ||
        name === 'E_PARSE' || name === 'E_STRICT' || name === 'E_DEPRECATED' ||
        name === 'E_CORE_ERROR' || name === 'E_CORE_WARNING' || name === 'E_COMPILE_ERROR' ||
        name === 'E_COMPILE_WARNING' || name === 'E_USER_ERROR' || name === 'E_USER_WARNING' ||
        name === 'E_USER_NOTICE' || name === 'E_USER_DEPRECATED') return 'int';
    if (name === 'true' || name === 'false') return 'bool';
    if (name === 'null') return 'mixed';
    if (name === 'STDIN' || name === 'STDOUT' || name === 'STDERR') return 'mixed';

    // 扩展常量类型推导（基于 constantDocs 的 category 与命名约定）
    const upper = name.toUpperCase();
    if (upper === 'ZLIB_VERSION' || upper === 'ICONV_IMPL' || upper === 'ICONV_VERSION') {
        return 'string';
    }
    if (upper.startsWith('FILTER_') || upper.startsWith('PREG_') || upper.startsWith('ZLIB_')
        || upper.startsWith('ZIP_') || upper.startsWith('STREAM_') || upper.startsWith('CAL_')
        || upper.startsWith('IMAGETYPE_') || upper.startsWith('EXIF_TYPE_') || upper.startsWith('FILEINFO_')
        || upper === 'SEEK_SET' || upper === 'SEEK_CUR' || upper === 'SEEK_END') {
        return 'int';
    }
    return null;
}

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
    inlayHints: {
        enable: boolean;
        showParameterTypes: boolean;
        showConstantTypes: boolean;
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
    inlayHints: {
        enable: true,
        showParameterTypes: true,
        showConstantTypes: true
    },
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
