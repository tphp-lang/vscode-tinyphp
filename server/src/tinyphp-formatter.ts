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

// 占位符：用于保护字符串和注释，避免空格规则破坏其内容
// 使用 \x00 (NUL) 包围索引，正则中 \d+ 匹配索引
const PLACEHOLDER_PATTERN = /\x00(\d+)\x00/g;

function formatText(text: string, options: FormatOptions): string {
    const tab = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
    const lines = text.split(/\r?\n/);
    const result: string[] = [];
    let indentLevel = 0;
    // switch/case 缩进追踪
    let switchBraceDepth = -1; // 当前 switch 的 { 所在缩进层级，-1 表示不在 switch 中
    let inCaseBody = false;    // 是否处于 case/default 标签后的语句体中
    let switchPending = false;  // 是否刚看到 switch 关键字，等待 {

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // 预处理器指令（#include/#flag/#cstruct/#callback/#import/#debug）保持原样，仅去首尾空白
        if (/^\s*#/.test(line)) {
            result.push(line.trim());
            continue;
        }

        let trimmed = line.trim();

        // 空行保留
        if (trimmed.length === 0) {
            result.push('');
            continue;
        }

        // 处理闭括号：行首的 } 先减缩进
        const closesAtStart = (trimmed.match(/^\}+/) || [''])[0].length;
        indentLevel = Math.max(0, indentLevel - closesAtStart);

        // 检查是否关闭了 switch（indentLevel 已减去 closesAtStart，若 <= switchBraceDepth 则 switch 已关闭）
        if (closesAtStart > 0 && switchBraceDepth >= 0 && indentLevel <= switchBraceDepth) {
            switchBraceDepth = -1;
            inCaseBody = false;
        }

        // 1. 分离行内注释（// ...），但跳过字符串内的 //
        const { code: codeNoComment, comment } = splitLineComment(trimmed);

        // 2. 保护字符串字面量（含 heredoc 标记符）— 用占位符替换
        const tokens: string[] = [];
        const protected_ = protectLiterals(codeNoComment, tokens);

        // 3. 对受保护的代码应用空格规则
        let code = applySpacingRules(protected_);

        // 4. 还原字符串字面量
        code = restoreLiterals(code, tokens);

        // 5. 组合代码 + 注释
        //    注释前加一个空格，但代码末尾已有空格则不重复加
        let content = code;
        if (comment) {
            content = code.length > 0 ? code + ' ' + comment : comment;
        }

        // switch/case 缩进处理
        //   case/default 标签本身不加额外缩进（与 switch 体同级）
        //   case 体中的语句（break/continue/赋值/调用等）额外缩进一级
        const isCaseLabel = /^case\b/.test(code) || /^default\s*:/.test(code);
        const isCloseBraceLine = /^\}/.test(code);
        // 检测 switch 关键字（标记下一个 { 为 switch 体）
        if (/\bswitch\b/.test(code) && !isCloseBraceLine) {
            switchPending = true;
        }
        let extraIndent = 0;
        if (inCaseBody && !isCaseLabel) {
            extraIndent = 1;
        }

        result.push(tab.repeat(indentLevel + extraIndent) + content);

        // case/default 标签后续行进入 case 体
        if (isCaseLabel && switchBraceDepth >= 0) {
            inCaseBody = true;
        }

        // 6. 更新缩进（基于受保护代码的大括号计数，避免字符串内 {} 干扰）
        //    注意：行首的 } 已在 closesAtStart 中减过缩进，这里不能重复计算
        const opens = (protected_.match(/\{/g) || []).length;
        const closes = (protected_.match(/\}/g) || []).length;
        // 如果本行打开了 { 且 switchPending，标记为 switch 体
        if (opens > 0 && switchPending) {
            switchBraceDepth = indentLevel; // 当前缩进层级（尚未加 opens）
            switchPending = false;
        } else if (opens > 0) {
            switchPending = false;
        }
        indentLevel = Math.max(0, indentLevel + opens - (closes - closesAtStart));
    }

    return result.join('\n');
}

// 分离行内注释（// ...），跳过字符串内的 //
function splitLineComment(line: string): { code: string, comment: string } {
    let inString: '"' | "'" | null = null;
    let escape = false;
    for (let i = 0; i < line.length - 1; i++) {
        let ch = line[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (inString) {
            if (ch === inString) { inString = null; }
        } else {
            if (ch === '"' || ch === "'") {
                inString = ch;
            } else if (ch === '/' && line[i + 1] === '/') {
                return { code: line.substring(0, i).trim(), comment: line.substring(i).trim() };
            }
        }
    }
    return { code: line, comment: '' };
}

// 保护字符串字面量（双引号、单引号）和 PHP 标签，用 \x00index\x00 占位符替换
// 注意：单双引号必须在一次遍历中匹配，否则双引号正则会误匹配单引号字符串内的 "
function protectLiterals(code: string, tokens: string[]): string {
    return code
        .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, (m) => {
            tokens.push(m);
            return `\x00${tokens.length - 1}\x00`;
        })
        .replace(/<\?(?:php|=)|\?>/g, (m) => {
            tokens.push(m);
            return `\x00${tokens.length - 1}\x00`;
        });
}

// 还原字符串字面量
function restoreLiterals(code: string, tokens: string[]): string {
    return code.replace(PLACEHOLDER_PATTERN, (_, i) => tokens[parseInt(i, 10)]);
}

// 对受保护的代码（字符串已替换为占位符）应用空格规则
// 参考 PHP-FIG PER-CS 风格 + Intelephense 默认风格
function applySpacingRules(code: string): string {
    // ---- 阶段 0：紧贴操作符（去除周围空格）----
    // 这些操作符必须紧贴操作数，不能有空格

    // 0.1 对象成员访问 -> 紧贴：$obj -> method → $obj->method
    code = code.replace(/\s*->\s*/g, '->');
    // 0.2 静态访问 :: 紧贴：Foo :: bar → Foo::bar
    code = code.replace(/\s*::\s*/g, '::');
    // 0.3 自增自减 ++/-- 紧贴变量（去除周围空格，仅当紧邻 $ 或字母数字时）
    code = code.replace(/\s*\+\+\s*(?=\$|[A-Za-z_])/g, '++');
    code = code.replace(/\s*--\s*(?=\$|[A-Za-z_])/g, '--');
    code = code.replace(/(?<=\$[A-Za-z_]\w*|\])\s*\+\+/g, '++');
    code = code.replace(/(?<=\$[A-Za-z_]\w*|\])\s*--/g, '--');
    // 0.4 数组访问紧贴：$arr [0] → $arr[0]，$arr ] → $arr]
    code = code.replace(/(\$[A-Za-z_]\w*|\])\s*\[/g, '$1[');
    // 0.5 函数调用紧贴：foo ( → foo(（在阶段 11 统一处理）

    // ---- 阶段 1：控制关键字与大括号 ----

    // 1.1 控制关键字后加空格：if( → if (
    code = code.replace(/\b(if|elseif|for|foreach|while|switch|catch)\s*\(/g, '$1 (');

    // 1.2 ) { 之间保证空格
    code = code.replace(/\)\s*\{/g, ') {');

    // 1.3 else/do/try/finally 后的 {：else{ → else {
    code = code.replace(/\b(else|do|try|finally)\s*\{/g, '$1 {');

    // 1.4 } 与 else/catch/while 之间保证空格：}else → } else
    code = code.replace(/\}\s*(else|catch|while)\b/g, '} $1');

    // ---- 阶段 2：组合操作符（先吃空格再加统一空格）----

    // 2.1 三字符组合操作符
    code = code.replace(/\s*===\s*/g, ' === ');
    code = code.replace(/\s*!==\s*/g, ' !== ');
    code = code.replace(/\s*<=>\s*/g, ' <=> ');

    // 2.2 双字符组合操作符
    code = code.replace(/\s*==\s*/g, ' == ');
    code = code.replace(/\s*!=\s*/g, ' != ');
    code = code.replace(/\s*<=\s*/g, ' <= ');
    code = code.replace(/\s*>=\s*/g, ' >= ');
    code = code.replace(/\s*&&\s*/g, ' && ');
    code = code.replace(/\s*\|\|\s*/g, ' || ');
    code = code.replace(/\s*\?\?\s*/g, ' ?? ');
    // 2.3 管道操作符 |>（TinyPHP）
    code = code.replace(/\s*\|>\s*/g, ' |> ');
    // 2.4 =>（数组键、箭头函数返回）
    code = code.replace(/\s*=>\s*/g, ' => ');

    // ---- 阶段 3：二元算术/位/比较操作符（单字符） ----
    // 注意：必须在一元上下文不加空格

    // 3.1 + 二元加：前面是 ) 数字 变量 ]，后面是非 =（避免 +=）和非 +（避免 ++）
    //     一元 + 不加空格（前面是 ( 或 , 或操作符或行首）
    code = code.replace(/([\)\$\w\]])\s*\+(?!\+)\s*(?!=)/g, '$1 + ');
    // 3.2 - 二元减：同上（避免 -= 和一元 -），且避免 -> 和 --
    code = code.replace(/([\)\$\w\]])\s*-(?![->])\s*(?!=)/g, '$1 - ');
    // 3.3 ** 幂运算（必须在 * 乘法之前处理，否则会被拆成 * *）
    code = code.replace(/\s*\*\*\s*(?!=)/g, ' ** ');
    // 3.3.1 * 乘：前面非 (（避免函数指针 *）后面非 =（避免 *=）和非 *（避免 **）
    code = code.replace(/([\)\$\w\]])\s*\*(?!\*)\s*(?!=)/g, '$1 * ');
    // 3.4 / 除：前面非 / （避免注释）后面非 =（避免 /=）
    code = code.replace(/([\)\$\w\]])\s*\/\s*(?!=)/g, '$1 / ');
    // 3.5 % 取模：后面非 =（避免 %=）
    code = code.replace(/([\)\$\w\]])\s*%\s*(?!=)/g, '$1 % ');

    // 3.6 < 比较：前面非 < （避免 <<）后面非 = （避免 <=, <=>）和 < （避免 <<）
    code = code.replace(/([^\s<=>!])\s*<\s*([^<=>])/g, '$1 < $2');
    // 3.7 > 比较：前面非 > （避免 >>）非 - （避免 ->）后面非 = （避免 >=）
    code = code.replace(/([^\s<=>!-])\s*>\s*([^=>])/g, '$1 > $2');

    // 3.8 & 引用 vs 按位与
    //   3.8.1 引用 &$var 紧贴：& 后跟 $ 且非位与上下文（前面非 $var/)/]）
    //         string & $s → string &$s；foo(&$s) → foo(&$s)
    //         注意：(?<!&) 排除 && 的第二个 &，避免误匹配
    code = code.replace(/(?<!&)(?<!\$\w+\s*)(?<![\)\]]\s*)&\s+\$/g, '&$');
    //   3.8.2 按位与 & 加空格：前面是 $var 或 ) 或 ]（操作数结尾）
    //         $a & $b → $a & $b；foo() & $x → foo() & $x
    code = code.replace(/(?<=\$\w+|[\)\]])\s*&\s*(?![&=])/g, ' & ');
    // 3.9 | 按位或（非 ||，非 |>）：前面非 |，后面非 | 和 >
    code = code.replace(/([\)\$\w\]])\s*\|\s*(?![|>=])/g, '$1 | ');
    // 3.10 ^ 按位异或
    code = code.replace(/([\)\$\w\]])\s*\^\s*/g, '$1 ^ ');
    // 3.11 << 左移
    code = code.replace(/\s*<<\s*/g, ' << ');
    // 3.12 >> 右移
    code = code.replace(/\s*>>\s*/g, ' >> ');

    // ---- 阶段 4：赋值 = 加空格 ----
    // 4.1 `=` 周围加空格，避免破坏 == === != !== <= >= => |= &= 等
    //     先去除已有空格，再统一加
    code = code.replace(/([^=!<>+\-*/%&|^~?.])\s*=\s*([^=>])/g, '$1 = $2');
    // 4.2 行首的 = 处理（罕见）
    code = code.replace(/^=\s*([^=>])/g, '= $1');

    // ---- 阶段 5：一元操作符紧贴 ----
    // 5.1 逻辑非 ! 紧贴操作数（除非前面已是操作符或行首）
    //     ! $x → !$x，但 = ! $x → = !$x
    code = code.replace(/([\s(,!&|?(])!\s+/g, '$1!');
    code = code.replace(/^!\s+/g, '!');

    // ---- 阶段 6：instanceof 加空格 ----
    code = code.replace(/\s*instanceof\s+/g, ' instanceof ');

    // ---- 阶段 7：三元操作符 ? : ----
    // 7.1 ? 后加空格（避免 ?: 短三元和 ?? 已处理）
    code = code.replace(/([^\s?])\s*\?\s*([^\s?:])/g, '$1 ? $2');
    // 7.2 : 前加空格（仅当 ? 在前文出现时）
    //     这里只处理三元 : — 标签 : 和类型 : 不在此处理
    //     保守做法：检测 `expr ? expr : expr` 中的 :
    //     简化：只处理 ? 后面到 : 之间的空格
    code = code.replace(/(\?)\s*([^?]*?)\s*:\s*/g, (match, q, mid) => {
        // 仅当 mid 中没有 { } 嵌套时简单替换
        if (/[{}]/.test(mid)) return match;
        return `${q} ${mid} : `;
    });

    // ---- 阶段 8：分隔符 ----

    // 8.1 `,` 后加空格（除非后面是 ) ] } 或行尾）
    code = code.replace(/,(\S)/g, ', $1');

    // 8.2 `;` 后空格：先统一为 `; `，再处理行尾多余的 `; ` → `;`
    code = code.replace(/;\s+/g, '; ');

    // ---- 阶段 9：关键字多空格压缩 ----
    // 9.1 关键字之间压缩多空格为单空格（如 `public   static` → `public static`）
    code = code.replace(
        /\b(fn|function|class|interface|trait|enum|return|throw|new|echo|yield|extends|implements|abstract|final|readonly|public|private|protected|static|const|use|namespace|match|switch|case|default|break|continue|if|else|elseif|for|foreach|while|do|try|catch|finally|instanceof|and|or|xor|as|global|var)\s{2,}/g,
        '$1 '
    );

    // 9.2 关键字后确保空格：return/throw/echo/yield/print 后若直接跟值或 (，确保空格
    //     return$x → return $x；return($x) → return ($x)；return; 不变
    //     注意：\x00 用于匹配被保护的字符串占位符（字符串已在 protectLiterals 中替换）
    code = code.replace(/\b(return|throw|echo|yield|print)\b\s*(?=[\$\w'"-(\x00])/g, '$1 ');

    // ---- 阶段 10：函数调用紧贴 ----
    // 10.1 `(` 前的多余空格（函数调用）：`foo (` → `foo(`
    //      但保留控制关键字后的空格（已在阶段 1 处理）
    code = code.replace(/\b([a-zA-Z_]\w*)\s+\(/g, (match, name) => {
        if (['if', 'elseif', 'for', 'foreach', 'while', 'switch', 'catch', 'return', 'throw', 'new', 'echo', 'isset', 'empty', 'unset', 'list', 'exit', 'die', 'eval', 'assert', 'array'].includes(name)) {
            return match;
        }
        return name + '(';
    });

    // 10.2 ) 后多余空格压缩
    code = code.replace(/\)\s{2,}/g, ') ');

    return code.trim();
}
