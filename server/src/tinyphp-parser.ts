'use strict';

import {
    CompletionItem,
    CompletionItemKind,
    InsertTextFormat,
    SignatureInformation,
    ParameterInformation,
    MarkupKind
} from 'vscode-languageserver/node';

// ============================================================================
// TinyPHP 关键字文档（基于 Lexer.php $keywords 数组）
// ============================================================================

interface KeywordDoc {
    description: string;
    category: string;
}

const keywordDocs: Record<string, KeywordDoc> = {
    // ---- 控制流 ----
    'if': { description: '条件分支语句', category: 'Control Flow' },
    'else': { description: 'if 的可选分支', category: 'Control Flow' },
    'elseif': { description: 'if 的额外条件分支', category: 'Control Flow' },
    'for': { description: 'for 循环: for ($i=0; $i<n; $i++)', category: 'Loop' },
    'while': { description: 'while 循环: while (cond)', category: 'Loop' },
    'do': { description: 'do-while 循环: do { } while (cond)', category: 'Loop' },
    'foreach': { description: '遍历数组: foreach ($arr as $k => $v)', category: 'Loop' },
    'switch': { description: 'switch 分支', category: 'Control Flow' },
    'case': { description: 'switch case 分支', category: 'Control Flow' },
    'default': { description: 'switch 默认分支', category: 'Control Flow' },
    'break': { description: '退出循环/switch', category: 'Control Flow' },
    'continue': { description: '跳过当前迭代', category: 'Control Flow' },
    'return': { description: '返回值并退出函数', category: 'Control Flow' },
    'goto': { description: '跳转到标签位置', category: 'Control Flow' },
    'match': { description: 'match 表达式（返回值）', category: 'Control Flow' },
    // ---- 异常 ----
    'try': { description: '定义可能抛出异常的代码块', category: 'Exception' },
    'catch': { description: '捕获异常（单类型）', category: 'Exception' },
    'finally': { description: '无论如何都执行的代码块', category: 'Exception' },
    'throw': { description: '抛出异常', category: 'Exception' },
    // ---- OOP ----
    'class': { description: '声明类。TinyPHP 需要 class Main { main(): void {} } 入口', category: 'OOP' },
    'interface': { description: '声明接口', category: 'OOP' },
    'trait': { description: '声明 trait（支持 use 复用）', category: 'OOP' },
    'enum': { description: '声明枚举', category: 'OOP' },
    'extends': { description: '继承父类（单继承）', category: 'OOP' },
    'implements': { description: '实现接口', category: 'OOP' },
    'abstract': { description: '抽象类/方法', category: 'OOP' },
    'final': { description: '不可继承/不可重写', category: 'OOP' },
    'readonly': { description: '只读属性（声明或构造中赋值一次）', category: 'OOP' },
    'static': { description: '静态属性/方法', category: 'OOP' },
    'public': { description: '公共访问', category: 'OOP' },
    'private': { description: '私有访问', category: 'OOP' },
    'new': { description: '创建实例', category: 'OOP' },
    'instanceof': { description: '检查实例类型', category: 'OOP' },
    'self': { description: '引用当前类（静态上下文）', category: 'OOP' },
    'parent': { description: '引用父类', category: 'OOP' },
    '__construct': { description: '构造函数', category: 'OOP' },
    '__destruct': { description: '析构函数', category: 'OOP' },
    // ---- 命名空间 ----
    'namespace': { description: '声明命名空间。不支持 namespace A { } 大括号形式', category: 'Module' },
    'use': { description: '导入类/函数/常量。支持分组 use A{B,C}', category: 'Module' },
    'as': { description: '导入别名', category: 'Module' },
    // ---- 声明 ----
    'const': { description: '声明常量', category: 'Declaration' },
    'function': { description: '声明函数/方法', category: 'Declaration' },
    'fn': { description: '箭头函数: fn($x) => expr', category: 'Declaration' },
    // ---- 输出/调试 ----
    'echo': { description: '输出值', category: 'Output' },
    // ---- 类型 ----
    'int': { description: '64位有符号整数 (int64_t)。类型固定，首次赋值后不可变', category: 'Type' },
    'float': { description: 'IEEE 754 双精度浮点 (double)', category: 'Type' },
    'string': { description: '字符串 (t_string 16B)。≤23字节 SSO 内联', category: 'Type' },
    'bool': { description: '布尔类型 (bool)', category: 'Type' },
    'void': { description: '无返回值', category: 'Type' },
    'never': { description: '永不返回 (exit/throw)', category: 'Type' },
    'array': { description: '有序映射 (t_array*)。128槽复用池+1.5x增长', category: 'Type' },
    'mixed': { description: '动态类型 (t_var 标签联合体)。有运行时开销', category: 'Type' },
    'callable': { description: '可调用类型 (t_callback)。闭包/C函数指针', category: 'Type' },
    // ---- 常量 ----
    'null': { description: '空值', category: 'Constant' },
    'true': { description: '布尔真', category: 'Constant' },
    'false': { description: '布尔假', category: 'Constant' },
    // ---- 不支持的特性说明 ----
    'list': { description: '数组解构: list($a, $b) = [1, 2]', category: 'Built-in' },
    'isset': { description: '检查变量是否已设置', category: 'Built-in' },
    'empty': { description: '检查变量是否为空', category: 'Built-in' },
    'unset': { description: '销毁变量', category: 'Built-in' },
    'exit': { description: '终止程序', category: 'Built-in' },
    'die': { description: 'exit() 别名', category: 'Built-in' },
    'error': { description: '触发错误', category: 'Built-in' },
    // ---- 不支持的特性（编译时报错）----
    'eval': { description: '❌ TinyPHP 不支持 eval() — AOT 无运行时解释器', category: 'Unsupported' },
    'yield': { description: '❌ TinyPHP 不支持 yield/Generator', category: 'Unsupported' },
};

// ============================================================================
// TinyPHP 内置函数文档（Lexer 中提升为关键字的）
// ============================================================================

interface FuncDoc {
    description: string;
    signature: string;
    params: { name: string; description: string }[];
    returnType: string;
}

const functionDocs: Record<string, FuncDoc> = {
    'var_dump': {
        description: '打印变量详细信息（类型+值）。编译为 C 格式化输出。',
        signature: 'var_dump(mixed $value): void',
        params: [{ name: '$value', description: '要打印的值' }],
        returnType: 'void'
    },
    'count': {
        description: '返回数组元素数量',
        signature: 'count(array $array): int',
        params: [{ name: '$array', description: '目标数组' }],
        returnType: 'int'
    },
    'time': {
        description: '返回当前 Unix 时间戳',
        signature: 'time(): int',
        params: [],
        returnType: 'int'
    },
    'date': {
        description: '格式化时间戳为日期字符串',
        signature: 'date(string $format, int $timestamp = 0): string',
        params: [
            { name: '$format', description: '日期格式' },
            { name: '$timestamp', description: '时间戳（可选）' }
        ],
        returnType: 'string'
    },
    'sleep': {
        description: '暂停指定秒数',
        signature: 'sleep(int $seconds): int',
        params: [{ name: '$seconds', description: '秒数' }],
        returnType: 'int'
    },
    'hrtime': {
        description: '高精度时间（纳秒级）',
        signature: 'hrtime(bool $asNumber = false): array|int',
        params: [{ name: '$asNumber', description: '是否返回整数纳秒' }],
        returnType: 'array|int'
    },
    'is_int': {
        description: '检查是否为 int。TinyPHP 类型固定，编译期即可确定',
        signature: 'is_int(mixed $value): bool',
        params: [{ name: '$value', description: '要检查的值' }],
        returnType: 'bool'
    },
    'is_float': {
        description: '检查是否为 float',
        signature: 'is_float(mixed $value): bool',
        params: [{ name: '$value', description: '要检查的值' }],
        returnType: 'bool'
    },
    'is_string': {
        description: '检查是否为 string',
        signature: 'is_string(mixed $value): bool',
        params: [{ name: '$value', description: '要检查的值' }],
        returnType: 'bool'
    },
    'is_bool': {
        description: '检查是否为 bool',
        signature: 'is_bool(mixed $value): bool',
        params: [{ name: '$value', description: '要检查的值' }],
        returnType: 'bool'
    },
    'is_array': {
        description: '检查是否为 array',
        signature: 'is_array(mixed $value): bool',
        params: [{ name: '$value', description: '要检查的值' }],
        returnType: 'bool'
    },
    'is_object': {
        description: '检查是否为 object',
        signature: 'is_object(mixed $value): bool',
        params: [{ name: '$value', description: '要检查的值' }],
        returnType: 'bool'
    },
    'is_null': {
        description: '检查是否为 null',
        signature: 'is_null(mixed $value): bool',
        params: [{ name: '$value', description: '要检查的值' }],
        returnType: 'bool'
    },
    'is_callable': {
        description: '检查是否为 callable',
        signature: 'is_callable(mixed $value): bool',
        params: [{ name: '$value', description: '要检查的值' }],
        returnType: 'bool'
    },
    'error': {
        description: '触发错误',
        signature: 'error(string $message): void',
        params: [{ name: '$message', description: '错误消息' }],
        returnType: 'void'
    },
    'isset': {
        description: '检查变量是否已设置且非 null',
        signature: 'isset(mixed $var): bool',
        params: [{ name: '$var', description: '要检查的变量' }],
        returnType: 'bool'
    },
    'empty': {
        description: '检查变量是否为空',
        signature: 'empty(mixed $var): bool',
        params: [{ name: '$var', description: '要检查的变量' }],
        returnType: 'bool'
    },
    'unset': {
        description: '销毁变量',
        signature: 'unset(mixed $var): void',
        params: [{ name: '$var', description: '要销毁的变量' }],
        returnType: 'void'
    },
};

// ============================================================================
// C 互操作函数文档
// ============================================================================

const cInteropDocs: Record<string, string> = {
    'c_int': '**c_int(expr)** → int32_t\n将 PHP int 转换为 C int32_t',
    'c_float': '**c_float(expr)** → double\n将 PHP float 转换为 C double',
    'c_str': '**c_str(expr)** → const char*\n将 PHP string 转换为 C 字符串指针',
    'php_int': '**php_int(expr)** → t_int\n将 C int 转换为 PHP int',
    'php_float': '**php_float(expr)** → t_float\n将 C double 转换为 PHP float',
    'php_str': '**php_str(expr)** → t_string\n将 C 字符串（深拷贝）转换为 PHP string',
    'phpc_arr_int': '**phpc_arr_int(t_array*)** → int32_t*\n数组 → C int 数组（malloc）',
    'phpc_arr_dbl': '**phpc_arr_dbl(t_array*)** → double*\n数组 → C double 数组（malloc）',
    'phpc_arr_str': '**phpc_arr_str(t_array*)** → char**\n数组 → C 字符串数组（malloc）',
    'phpc_new_arr_int': '**phpc_new_arr_int(ptr, len)** → t_array*\nC int 数组 → PHP 数组',
    'phpc_new_arr_dbl': '**phpc_new_arr_dbl(ptr, len)** → t_array*\nC double 数组 → PHP 数组',
    'phpc_new_arr_str': '**phpc_new_arr_str(ptr, len)** → t_array*\nC 字符串数组 → PHP 数组',
    'phpc_obj': '**phpc_obj(t_object*)** → void*\n获取对象原始指针',
    'phpc_new_obj': '**phpc_new_obj(ptr, class)** → t_object*\n包装 C 指针为对象',
    'phpc_fn': '**phpc_fn(callback)** → void*\n获取回调函数指针',
    'phpc_env': '**phpc_env(callback)** → void*\n获取回调环境指针',
    'phpc_thunk': '**phpc_thunk(name, callback)** → void\n按 #callback 签名生成 thunk',
    'phpc_free': '**phpc_free(ptr)** → void\n释放 C malloc 内存',
    'phpc_free_str_arr': '**phpc_free_str_arr(ptr, len)** → void\n释放字符串数组',
};

// ============================================================================
// 预处理器指令文档
// ============================================================================

const preprocessorDocs: Record<string, string> = {
    '#include': '**#include [OS] "file.h"** 或 **#include [OS] <sys.h>**\n\n嵌入 C 头文件到生成的 C 代码中。\n\n**可选平台前缀**: `Windows`, `Linux`, `MacOS`, `Darwin`\n\n示例:\n- `#include "common.h"` — 所有平台\n- `#include Windows "win.h"` — 仅 Windows\n- `#include Linux <sys/io.h>` — 仅 Linux',
    '#flag': '**#flag [GCC|Clang|TCC] [Windows|Linux|MacOS|Darwin] -D... -l...**\n\n编译器/平台过滤的编译和链接标志。最多两个前缀（编译器+平台，顺序不限）。\n\n示例:\n- `#flag -O2 -lm` — 所有平台\n- `#flag GCC -D_GNU_SOURCE` — 仅 GCC\n- `#flag Clang Linux -fsanitize=address` — Clang + Linux',
    '#callback': '**#callback ret_type name(params)**\n声明 C 回调函数签名，供 `phpc_thunk` 生成 thunk 使用。\n\n示例: `#callback void on_event(int $code)`',
    '#import': '**#import name**\n按需引入扩展（自动加载 ext/name/src/*.php + *.c）',
    '#debug': '**#debug text**\n仅在 --debug 模式下输出（用于测试预期输出）',
};

// ============================================================================
// 不支持特性的诊断提示
// ============================================================================

export const unsupportedFeatures: Record<string, string> = {
    'eval': 'eval() 不被 TinyPHP 支持 — AOT 编译无运行时解释器',
    'yield': 'yield/Generator 不被 TinyPHP 支持',
    'include': 'include/require 不被 TinyPHP 支持 — 使用 #include 预处理器指令',
    'require': 'include/require 不被 TinyPHP 支持 — 使用 #include 预处理器指令',
    '__call': '魔术方法 __call/__get/__set 不被 TinyPHP 支持',
    '__get': '魔术方法 __call/__get/__set 不被 TinyPHP 支持',
    '__set': '魔术方法 __call/__get/__set 不被 TinyPHP 支持',
};

// ============================================================================
// 补全项生成
// ============================================================================

let completionItems: CompletionItem[] | null = null;

export function getCompletionItems(): CompletionItem[] {
    if (completionItems) return completionItems;

    let items: CompletionItem[] = [];

    // ---- 预处理器指令 ----
    for (let [name, doc] of Object.entries(preprocessorDocs)) {
        items.push({
            label: name,
            kind: CompletionItemKind.Keyword,
            detail: 'TinyPHP Preprocessor',
            documentation: { kind: MarkupKind.Markdown, value: doc },
            insertText: name === '#include' ? '#include ${1|,Windows ,Linux ,MacOS ,Darwin |}"${2:file}"'
                : name === '#flag' ? '#flag ${1|,GCC ,Clang ,TCC ,Windows ,Linux ,MacOS ,Darwin |}${2:-Dflag}'
                : name === '#callback' ? '#callback ${1:name}(${2:params})'
                : name === '#import' ? '#import ${1:module}'
                : name === '#debug' ? '#debug ${1:message}'
                : name,
            insertTextFormat: InsertTextFormat.Snippet,
            data: 'preprocessor'
        });
    }

    // ---- 关键字 ----
    for (let [keyword, doc] of Object.entries(keywordDocs)) {
        items.push({
            label: keyword,
            kind: CompletionItemKind.Keyword,
            detail: `TinyPHP ${doc.category}`,
            documentation: doc.description,
            data: 'keyword'
        });
    }

    // ---- 内置函数 ----
    for (let [func, doc] of Object.entries(functionDocs)) {
        items.push({
            label: func,
            kind: CompletionItemKind.Function,
            detail: doc.signature,
            documentation: doc.description,
            insertText: doc.params.length > 0 ? `${func}($1)` : `${func}()`,
            insertTextFormat: InsertTextFormat.Snippet,
            data: 'function'
        });
    }

    // ---- C 互操作函数 ----
    for (let [name, doc] of Object.entries(cInteropDocs)) {
        items.push({
            label: name,
            kind: CompletionItemKind.Function,
            detail: 'TinyPHP C Interop',
            documentation: { kind: MarkupKind.Markdown, value: doc },
            insertText: name.includes('(') ? name : `${name}($1)`,
            insertTextFormat: InsertTextFormat.Snippet,
            data: 'c-interop'
        });
    }

    // ---- 类型 ----
    for (let t of ['int', 'float', 'string', 'bool', 'void', 'never', 'array', 'mixed', 'callable']) {
        items.push({
            label: t,
            kind: CompletionItemKind.TypeParameter,
            detail: 'TinyPHP Type',
            documentation: keywordDocs[t]?.description || `${t} 类型`,
            data: 'type'
        });
    }

    // ---- 魔术常量 ----
    for (let c of ['__LINE__', '__FILE__', '__DIR__', '__CLASS__', '__METHOD__', '__NAMESPACE__', 'DIRECTORY_SEPARATOR']) {
        items.push({
            label: c,
            kind: CompletionItemKind.Constant,
            detail: 'Magic Constant',
            data: 'constant'
        });
    }

    // ---- 代码片段 ----
    items.push(...getSnippetCompletions());

    completionItems = items;
    return items;
}

function getSnippetCompletions(): CompletionItem[] {
    return [
        {
            label: 'class',
            kind: CompletionItemKind.Snippet,
            detail: 'class { }',
            insertText: ['class ${1:ClassName}', '{', '\t${0}', '}'].join('\n'),
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'classc',
            kind: CompletionItemKind.Snippet,
            detail: 'class with constructor',
            insertText: ['class ${1:ClassName}', '{', '\tpublic function __construct(${2})', '\t{', '\t\t${0}', '\t}', '}'].join('\n'),
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'classcp',
            kind: CompletionItemKind.Snippet,
            detail: 'class with constructor promotion',
            insertText: ['class ${1:ClassName}', '{', '\tpublic function __construct(', '\t\tpublic ${2:int} \\$${3:prop}', '\t) {', '\t\t${0}', '\t}', '}'].join('\n'),
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'pubf',
            kind: CompletionItemKind.Snippet,
            detail: 'public function',
            insertText: 'public function ${1:name}(${2:params}): ${3:void}\n{\n\t${0}\n}',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'prif',
            kind: CompletionItemKind.Snippet,
            detail: 'private function',
            insertText: 'private function ${1:name}(${2:params}): ${3:void}\n{\n\t${0}\n}',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'function',
            kind: CompletionItemKind.Snippet,
            detail: 'function declaration',
            insertText: 'function ${1:name}(${2:params})${3:: ${4:returnType}}\n{\n\t${0}\n}',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'fn',
            kind: CompletionItemKind.Snippet,
            detail: 'arrow function',
            insertText: 'fn(\\$${1:x}) => ${0:expr}',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'if',
            kind: CompletionItemKind.Snippet,
            detail: 'if statement',
            insertText: ['if (${1:condition}) {', '\t${0}', '}'].join('\n'),
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'ifelse',
            kind: CompletionItemKind.Snippet,
            detail: 'if-else',
            insertText: ['if (${1:condition}) {', '\t${2}', '} else {', '\t${0}', '}'].join('\n'),
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'for',
            kind: CompletionItemKind.Snippet,
            detail: 'for loop',
            insertText: 'for (\\$${1:i} = ${2:0}; \\$${1:i} < ${3:n}; \\$${1:i}++) {\n\t${0}\n}',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'foreach',
            kind: CompletionItemKind.Snippet,
            detail: 'foreach loop',
            insertText: 'foreach (\\$${1:array} as \\$${2:key} => \\$${3:value}) {\n\t${0}\n}',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'switch',
            kind: CompletionItemKind.Snippet,
            detail: 'switch statement',
            insertText: ['switch (${1:expr}) {', '\tcase ${2:value}:', '\t\t${3}', '\t\tbreak;', '\tdefault:', '\t\t${0}', '}'].join('\n'),
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'match',
            kind: CompletionItemKind.Snippet,
            detail: 'match expression',
            insertText: ['match (${1:expr}) {', '\t${2:pattern} => ${3:result},', '\tdefault => ${0:default},', '}'].join('\n'),
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'try',
            kind: CompletionItemKind.Snippet,
            detail: 'try-catch',
            insertText: ['try {', '\t${1}', '} catch (${2:Exception} \\$${3:e}) {', '\t${0}', '}'].join('\n'),
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'trycf',
            kind: CompletionItemKind.Snippet,
            detail: 'try-catch-finally',
            insertText: ['try {', '\t${1}', '} catch (${2:Exception} \\$${3:e}) {', '\t${4}', '} finally {', '\t${0}', '}'].join('\n'),
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'ns',
            kind: CompletionItemKind.Snippet,
            detail: 'namespace',
            insertText: 'namespace ${1:App\\\\Module};\n\n${0}',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'C->',
            kind: CompletionItemKind.Snippet,
            detail: 'C interop call',
            insertText: 'C->${1:func}(${0})',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'echo',
            kind: CompletionItemKind.Snippet,
            detail: 'echo variable',
            insertText: 'echo \\$${1:var};${0}',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'vd',
            kind: CompletionItemKind.Snippet,
            detail: 'var_dump debug',
            insertText: 'var_dump(\\$${1:var});${0}',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: '#include',
            kind: CompletionItemKind.Snippet,
            detail: 'preprocessor include',
            insertText: '#include "${1:file}"',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: '#callback',
            kind: CompletionItemKind.Snippet,
            detail: 'preprocessor callback',
            insertText: '#callback ${1:name}(${2:params})',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: '#flag',
            kind: CompletionItemKind.Snippet,
            detail: 'preprocessor flag',
            insertText: '#flag ${1:flag}',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: '#import',
            kind: CompletionItemKind.Snippet,
            detail: 'preprocessor import',
            insertText: '#import ${1:module}',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: '#debug',
            kind: CompletionItemKind.Snippet,
            detail: 'preprocessor debug',
            insertText: '#debug ${1:message}',
            insertTextFormat: InsertTextFormat.Snippet,
        },
    ];
}

// ============================================================================
// 文档查询函数
// ============================================================================

export function getFunctionDocumentation(name: string): string | null {
    let doc = functionDocs[name];
    if (!doc) {
        let cdoc = cInteropDocs[name];
        if (!cdoc) return null;
        return cdoc;
    }

    let md = `### ${doc.signature}\n\n${doc.description}\n\n`;
    if (doc.params.length > 0) {
        md += '**参数:**\n\n';
        for (let p of doc.params) {
            md += `- \`${p.name}\` — ${p.description}\n`;
        }
    }
    md += `\n**返回值:** \`${doc.returnType}\``;
    return md;
}

export function getKeywordDocumentation(name: string): string | null {
    let doc = keywordDocs[name];
    if (!doc) {
        let pdoc = preprocessorDocs[name];
        if (!pdoc) return null;
        return pdoc;
    }
    return `### \`${name}\`\n\n${doc.description}\n\n*${doc.category}*`;
}

export function getTypeDocumentation(name: string): string | null {
    return keywordDocs[name]?.description || null;
}

export function getFunctionSignature(name: string): SignatureInformation | null {
    let doc = functionDocs[name];
    if (!doc) return null;

    let params: ParameterInformation[] = doc.params.map(p => ({
        label: p.name,
        documentation: p.description
    }));

    return {
        label: doc.signature,
        documentation: doc.description,
        parameters: params
    };
}
