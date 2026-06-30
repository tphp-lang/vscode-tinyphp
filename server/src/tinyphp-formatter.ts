'use strict';

import { TextEdit, Range, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

interface FormatOptions {
    tabSize: number;
    insertSpaces: boolean;
}

export function formatDocument(document: TextDocument, options: FormatOptions): TextEdit[] {
    const text = document.getText();
    const formatted = formatText(text, options);
    if (formatted === text) return [];

    const endPos = document.positionAt(text.length);
    return [TextEdit.replace(
        Range.create(Position.create(0, 0), endPos),
        formatted
    )];
}

export function formatRange(document: TextDocument, range: Range, options: FormatOptions): TextEdit[] {
    const text = document.getText(range);
    const formatted = formatText(text, options);
    if (formatted === text) return [];
    return [TextEdit.replace(range, formatted)];
}

function formatText(text: string, options: FormatOptions): string {
    const tab = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
    const lines = text.split(/\r?\n/);
    const result: string[] = [];
    let indentLevel = 0;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let trimmed = line.trimStart();

        // Preserve leading whitespace before preprocessor directives
        if (/^\s*#/.test(line)) {
            result.push(line.trim());
            continue;
        }

        trimmed = trimmed.trim();

        // Skip empty lines
        if (trimmed.length === 0) {
            result.push('');
            continue;
        }

        // Count leading closing braces — decrease indent BEFORE output
        const closesAtStart = (trimmed.match(/^\}+/) || [''])[0].length;
        indentLevel = Math.max(0, indentLevel - closesAtStart);

        // Apply spacing fixes to content only (before adding indent)
        let content = trimmed;
        content = content.replace(/\b(if|elseif|for|foreach|while|switch|catch|match)\s*\(/g, '$1 (');
        content = content.replace(/\)\s*\{/g, ') {');
        content = content.replace(/\b(else|do|try|finally)\s*\{/g, '$1 {');
        content = content.replace(/\}\s*(else|catch|while)\b/g, '} $1');
        content = content.replace(/\s+(;)/g, '$1');
        content = content.replace(/ {2,}/g, ' ');

        const indented = tab.repeat(indentLevel) + content;
        result.push(indented);

        // Count brace changes for next indent (exclude leading } already counted)
        const opens = (trimmed.match(/\{/g) || []).length;
        const closes = (trimmed.match(/\}/g) || []).length;
        indentLevel = Math.max(0, indentLevel + opens - (closes - closesAtStart));
    }

    return result.join('\n');
}
