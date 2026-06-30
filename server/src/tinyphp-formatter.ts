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
    let inPhpTag = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let trimmed = line.trim();

        // Skip empty lines
        if (trimmed.length === 0) {
            result.push('');
            continue;
        }

        // PHP tag tracking
        if (trimmed.startsWith('<?php')) {
            inPhpTag = true;
        }

        // Decrease indent before closing braces
        const closeCount = (trimmed.match(/^\}/g) || []).length;
        if (closeCount > 0) {
            indentLevel = Math.max(0, indentLevel - closeCount);
        }

        // Build indented line
        let indented = tab.repeat(indentLevel) + trimmed;

        // Fix spacing: ensure space after certain keywords
        indented = indented.replace(/\b(if|elseif|for|foreach|while|do|switch|catch)\s*\(/g, '$1 (');
        // Fix spacing: ensure space before {
        indented = indented.replace(/\)\s*\{/g, ') {');
        indented = indented.replace(/\b(else|do)\s*\{/g, '$1 {');
        // Fix spacing: semicolons
        indented = indented.replace(/\s+;/g, ';');
        // Fix multiple spaces
        indented = indented.replace(/ {2,}/g, ' ');

        result.push(indented);

        // Increase indent after opening braces
        // Count opening braces minus closing braces in the same line
        const opens = (trimmed.match(/\{/g) || []).length;
        const closes = (trimmed.match(/\}/g) || []).length;
        indentLevel = Math.max(0, indentLevel + opens - closes);

        // Decrease for lines that END with } (single-line blocks)
        if (trimmed.endsWith('}') && !trimmed.includes('{')) {
            indentLevel = Math.max(0, indentLevel - 1);
        }
    }

    return result.join('\n') + '\n';
}
