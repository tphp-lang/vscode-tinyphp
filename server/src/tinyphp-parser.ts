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
// TinyPHP 关键字文档（基于 Lexer.php $keywords 数组 + GRAMMAR.md）
// ============================================================================

interface KeywordDoc {
    description: string;
    category: string;
}

const keywordDocs: Record<string, KeywordDoc> = {
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
    'break': { description: '退出循环/switch，支持 break N', category: 'Control Flow' },
    'continue': { description: '跳过当前迭代，支持 continue N', category: 'Control Flow' },
    'return': { description: '返回值并退出函数', category: 'Control Flow' },
    'goto': { description: '跳转到标签位置: goto label; / label:', category: 'Control Flow' },
    'match': { description: 'match 表达式（返回值，支持多条件）', category: 'Control Flow' },
    'try': { description: '定义可能抛出异常的代码块', category: 'Exception' },
    'catch': { description: '捕获异常（单类型）', category: 'Exception' },
    'finally': { description: '无论如何都执行的代码块', category: 'Exception' },
    'throw': { description: '抛出异常: throw new Exception("msg")', category: 'Exception' },
    'class': { description: '声明类。TinyPHP 需要 class Main { main(): void {} } 入口', category: 'OOP' },
    'interface': { description: '声明接口（纯抽象类）', category: 'OOP' },
    'trait': { description: '声明 trait（支持 use 复用）', category: 'OOP' },
    'enum': { description: '声明枚举，支持 int/string backing type', category: 'OOP' },
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
    '__construct': { description: '构造函数，支持属性提升: public int $x', category: 'OOP' },
    '__destruct': { description: '析构函数，退出前自动调用，禁止写返回类型', category: 'OOP' },
    'namespace': { description: '声明命名空间。不支持 namespace A { } 大括号形式', category: 'Module' },
    'use': { description: '导入类/函数/常量。支持分组 use A{B,C} 和 use function', category: 'Module' },
    'as': { description: '导入别名', category: 'Module' },
    'const': { description: '声明常量', category: 'Declaration' },
    'function': { description: '声明函数/方法', category: 'Declaration' },
    'fn': { description: '箭头函数: fn($x) => expr', category: 'Declaration' },
    'echo': { description: '输出值，支持多参数 echo $a, $b;', category: 'Output' },
    'int': { description: '64位有符号整数 (int64_t)。类型固定，首次赋值后不可变', category: 'Type' },
    'float': { description: 'IEEE 754 双精度浮点 (double)', category: 'Type' },
    'string': { description: '字符串 (t_string 16B)。≤23字节 SSO 内联', category: 'Type' },
    'bool': { description: '布尔类型 (bool)', category: 'Type' },
    'void': { description: '无返回值', category: 'Type' },
    'never': { description: '永不返回 (exit/throw)', category: 'Type' },
    'array': { description: '有序映射 (t_array*)。128槽复用池+1.5x增长', category: 'Type' },
    'mixed': { description: '动态类型 (t_var 标签联合体)。有运行时开销', category: 'Type' },
    'callable': { description: '可调用类型 (t_callback)。闭包/C函数指针', category: 'Type' },
    'null': { description: '空值', category: 'Constant' },
    'true': { description: '布尔真', category: 'Constant' },
    'false': { description: '布尔假', category: 'Constant' },
    'list': { description: '数组解构: list($a, $b) = [1, 2]，支持键名 "key"=>$var', category: 'Built-in' },
    'isset': { description: '检查变量是否已设置', category: 'Built-in' },
    'empty': { description: '检查变量是否为空', category: 'Built-in' },
    'unset': { description: '销毁变量', category: 'Built-in' },
    'exit': { description: '终止程序: exit($code)', category: 'Built-in' },
    'die': { description: 'exit() 别名', category: 'Built-in' },
    'error': { description: '触发异常: error($msg) 等价于 throw new Exception($msg)，可被 try-catch 捕获', category: 'Built-in' },
    'eval': { description: '❌ TinyPHP 不支持 eval() — AOT 无运行时解释器', category: 'Unsupported' },
    'yield': { description: '✅ 生成器: yield $v / yield $k => $v / yield from $gen。基于 minicoro stackless 协程', category: 'Generator' },
    'Generator': { description: '✅ 生成器类型。方法: current/key/next/send/getReturn/throw。函数含 yield 自动返回 Generator', category: 'Generator' },
    'Thread': { description: '🔧 多线程类 (tinycthread 封装,Thread-Local 运行时无锁竞争)。Thread::create/join', category: 'Concurrency' },
    'Mutex': { description: '🔧 互斥锁类 (tinycthread 封装)', category: 'Concurrency' },
    'CondVar': { description: '🔧 条件变量类 (tinycthread 封装)', category: 'Concurrency' },
    'WaitGroup': { description: '🔧 WaitGroup (类似 Go,等待一组线程完成)', category: 'Concurrency' },
    'Parallel': { description: '🔧 数据并行类: Parallel::for / Parallel::map (连续分片,线程失败降级内联)', category: 'Concurrency' },
    'Resource': { description: '✅ 资源基类 (handle/type/ptr 字段,模拟 PHP zend_resource)', category: 'OOP' },
    'File': { description: '✅ 文件类 (extends Resource,替代 PHP fopen resource,RAII 自动 fclose)', category: 'OOP' },
    'Exception': { description: '✅ 异常基类。子类沿父链匹配,catch(Exception $e) 捕获所有', category: 'Exception' },
    'DIRECTORY_SEPARATOR': { description: '编译期替换为平台路径分隔符 (/ 或 \\)', category: 'Constant' },
    'C': { description: '🔧 C 互操作命名空间: C->func() 调用 / C.Type 类型注解 / (C.Type) 强制转换', category: 'C Interop' },
    'AnnotationEntry': { description: '✅ 注解 entry 内置类（C 结构体，非用户类）。每个注解使用编译期收集为一个 `AnnotationEntry` 实例。\n\n**属性**: `$data: array`（位置参数数组）、`$type: string`（`method`/`static_method`/`class`/`function`）、`$name: string`（限定名如 `Ns\\Class->method`）\n\n**方法**: `call(...$args): mixed`（调用目标方法/静态方法/函数，class 目标报错）、`newInstance(...$args): object`（实例化目标类，非 class 目标报错）\n\n**访问**: 通过注解常量静态索引，如 `ROUTE[0]->call(...)`、`ROUTE[0]->name`。编译期零开销直接展开为静态指针或直接调用。**不支持动态索引** `ROUTE[$i]`（编译期无法确定目标）。', category: 'OOP' },
    'Export': { description: '🔧 动态库导出注解 `#[Export("c_function_name")]`。标记独立函数导出为 C 函数，配合 `-shared` 编译选项生成可被外部 C 代码调用的动态库（`.dll`/`.so`/`.dylib`）。\n\n**规则**: 仅可用于独立函数（`function`），用于方法报语法错误；参数为字符串字面量（合法 C 标识符，全局唯一）；非 `-shared` 模式下静默忽略。\n\n**类型约束**: 参数/返回值允许 `int`/`float`/`bool`/`string`/`void`/`C.Type`，**禁止 `array`**。`string` 直接暴露 `t_string*`。\n\n与 `#[Attribute]` 注解系统**独立**：不经过声明，不收集到注解常量数组，仅控制 C 符号导出。可与用户注解共存于同一函数。', category: 'C Interop' },
};

// ============================================================================
// TinyPHP 内置函数文档（基于 FUNCTIONS.md，230+ 函数）
// ============================================================================

interface FuncDoc {
    description: string;
    signature: string;
    params: { name: string; description: string }[];
    returnType: string;
}

const functionDocs: Record<string, FuncDoc> = {
    // ---- 输出函数 (std/output.h) ----
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
    'exit': {
        description: '终止程序并返回退出码',
        signature: 'exit(int $code = 0): never',
        params: [{ name: '$code', description: '退出码（可选，默认0）' }],
        returnType: 'never'
    },
    'die': {
        description: 'exit() 别名',
        signature: 'die(int $code = 0): never',
        params: [{ name: '$code', description: '退出码（可选，默认0）' }],
        returnType: 'never'
    },
    'error': {
        description: '触发错误并终止程序',
        signature: 'error(string $message): never',
        params: [{ name: '$message', description: '错误消息' }],
        returnType: 'never'
    },

    // ---- 类型函数 (std/type.h) ----
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
    'is_numeric': {
        description: '检查是否为数字或数字字符串',
        signature: 'is_numeric(mixed $value): bool',
        params: [{ name: '$value', description: '要检查的值' }],
        returnType: 'bool'
    },
    'gettype': {
        description: '获取变量类型名称（"int"/"float"/"string"/"bool"/"array"/"NULL"等）',
        signature: 'gettype(mixed $value): string',
        params: [{ name: '$value', description: '要检查的值' }],
        returnType: 'string'
    },
    'intval': {
        description: '将值转换为 int',
        signature: 'intval(mixed $value): int',
        params: [{ name: '$value', description: '要转换的值' }],
        returnType: 'int'
    },
    'floatval': {
        description: '将值转换为 float',
        signature: 'floatval(mixed $value): float',
        params: [{ name: '$value', description: '要转换的值' }],
        returnType: 'float'
    },
    'strval': {
        description: '将值转换为 string',
        signature: 'strval(mixed $value): string',
        params: [{ name: '$value', description: '要转换的值' }],
        returnType: 'string'
    },
    'boolval': {
        description: '将值转换为 bool（PHP 假值规则）',
        signature: 'boolval(mixed $value): bool',
        params: [{ name: '$value', description: '要转换的值' }],
        returnType: 'bool'
    },
    'getenv': {
        description: '获取环境变量值',
        signature: 'getenv(string $key): string|false',
        params: [{ name: '$key', description: '环境变量名' }],
        returnType: 'string|false'
    },
    'putenv': {
        description: '设置环境变量',
        signature: 'putenv(string $assignment): bool',
        params: [{ name: '$assignment', description: '格式 "key=value"' }],
        returnType: 'bool'
    },

    // ---- 字符串函数 (std/string.h) ----
    'strlen': {
        description: '返回字符串长度',
        signature: 'strlen(string $string): int',
        params: [{ name: '$string', description: '目标字符串' }],
        returnType: 'int'
    },
    'trim': {
        description: '去除首尾空白（仅 ASCII 空白）',
        signature: 'trim(string $string): string',
        params: [{ name: '$string', description: '目标字符串' }],
        returnType: 'string'
    },
    'ltrim': {
        description: '去除左侧空白',
        signature: 'ltrim(string $string): string',
        params: [{ name: '$string', description: '目标字符串' }],
        returnType: 'string'
    },
    'rtrim': {
        description: '去除右侧空白',
        signature: 'rtrim(string $string): string',
        params: [{ name: '$string', description: '目标字符串' }],
        returnType: 'string'
    },
    'substr': {
        description: '截取子串，支持负偏移和长度',
        signature: 'substr(string $string, int $offset, int $length = null): string',
        params: [
            { name: '$string', description: '目标字符串' },
            { name: '$offset', description: '起始偏移（负值从末尾）' },
            { name: '$length', description: '长度（可选）' }
        ],
        returnType: 'string'
    },
    'strpos': {
        description: '查找子串首次出现位置，未找到返回 -1',
        signature: 'strpos(string $haystack, string $needle): int',
        params: [
            { name: '$haystack', description: '被搜索字符串' },
            { name: '$needle', description: '要搜索的子串' }
        ],
        returnType: 'int'
    },
    'str_contains': {
        description: '检查字符串是否包含子串',
        signature: 'str_contains(string $haystack, string $needle): bool',
        params: [
            { name: '$haystack', description: '被搜索字符串' },
            { name: '$needle', description: '要搜索的子串' }
        ],
        returnType: 'bool'
    },
    'str_starts_with': {
        description: '检查字符串是否以指定前缀开头',
        signature: 'str_starts_with(string $haystack, string $needle): bool',
        params: [
            { name: '$haystack', description: '被搜索字符串' },
            { name: '$needle', description: '前缀' }
        ],
        returnType: 'bool'
    },
    'str_ends_with': {
        description: '检查字符串是否以指定后缀结尾',
        signature: 'str_ends_with(string $haystack, string $needle): bool',
        params: [
            { name: '$haystack', description: '被搜索字符串' },
            { name: '$needle', description: '后缀' }
        ],
        returnType: 'bool'
    },
    'ord': {
        description: '返回字符串首字符的 ASCII 码',
        signature: 'ord(string $string): int',
        params: [{ name: '$string', description: '目标字符串' }],
        returnType: 'int'
    },
    'chr': {
        description: '返回 ASCII 码对应的字符',
        signature: 'chr(int $ascii): string',
        params: [{ name: '$ascii', description: 'ASCII 码值' }],
        returnType: 'string'
    },
    'strtolower': {
        description: '转换为小写',
        signature: 'strtolower(string $string): string',
        params: [{ name: '$string', description: '目标字符串' }],
        returnType: 'string'
    },
    'strtoupper': {
        description: '转换为大写',
        signature: 'strtoupper(string $string): string',
        params: [{ name: '$string', description: '目标字符串' }],
        returnType: 'string'
    },
    'ucfirst': {
        description: '首字母大写',
        signature: 'ucfirst(string $string): string',
        params: [{ name: '$string', description: '目标字符串' }],
        returnType: 'string'
    },
    'lcfirst': {
        description: '首字母小写',
        signature: 'lcfirst(string $string): string',
        params: [{ name: '$string', description: '目标字符串' }],
        returnType: 'string'
    },
    'sprintf': {
        description: '格式化字符串（基于 snprintf）',
        signature: 'sprintf(string $format, ...$values): string',
        params: [
            { name: '$format', description: '格式字符串' },
            { name: '...$values', description: '格式化参数' }
        ],
        returnType: 'string'
    },
    'number_format': {
        description: '格式化数字为千分位表示',
        signature: 'number_format(float $number, int $decimals = 0): string',
        params: [
            { name: '$number', description: '要格式化的数字' },
            { name: '$decimals', description: '小数位数' }
        ],
        returnType: 'string'
    },
    'str_replace': {
        description: '替换字符串中的子串',
        signature: 'str_replace(string $search, string $replace, string $subject): string',
        params: [
            { name: '$search', description: '要搜索的子串' },
            { name: '$replace', description: '替换值' },
            { name: '$subject', description: '目标字符串' }
        ],
        returnType: 'string'
    },
    'substr_count': {
        description: '统计子串出现次数',
        signature: 'substr_count(string $haystack, string $needle): int',
        params: [
            { name: '$haystack', description: '被搜索字符串' },
            { name: '$needle', description: '要搜索的子串' }
        ],
        returnType: 'int'
    },
    'strtr': {
        description: '按映射表翻译字符',
        signature: 'strtr(string $string, string $from, string $to): string',
        params: [
            { name: '$string', description: '目标字符串' },
            { name: '$from', description: '源字符集' },
            { name: '$to', description: '目标字符集' }
        ],
        returnType: 'string'
    },
    'implode': {
        description: '将数组元素连接为字符串',
        signature: 'implode(string $glue, array $array): string',
        params: [
            { name: '$glue', description: '连接符' },
            { name: '$array', description: '数组' }
        ],
        returnType: 'string'
    },
    'explode': {
        description: '按分隔符拆分字符串为数组',
        signature: 'explode(string $separator, string $string): array',
        params: [
            { name: '$separator', description: '分隔符' },
            { name: '$string', description: '目标字符串' }
        ],
        returnType: 'array'
    },
    'str_repeat': {
        description: '重复字符串 n 次',
        signature: 'str_repeat(string $string, int $times): string',
        params: [
            { name: '$string', description: '目标字符串' },
            { name: '$times', description: '重复次数' }
        ],
        returnType: 'string'
    },
    'str_split': {
        description: '将字符串拆分为数组',
        signature: 'str_split(string $string, int $length = 1): array',
        params: [
            { name: '$string', description: '目标字符串' },
            { name: '$length', description: '每段长度（可选，默认1）' }
        ],
        returnType: 'array'
    },
    'str_pad': {
        description: '填充字符串到指定长度',
        signature: 'str_pad(string $string, int $length, string $pad = " ", int $type = STR_PAD_RIGHT): string',
        params: [
            { name: '$string', description: '目标字符串' },
            { name: '$length', description: '目标长度' },
            { name: '$pad', description: '填充字符' },
            { name: '$type', description: '填充类型' }
        ],
        returnType: 'string'
    },
    'strrev': {
        description: '反转字符串',
        signature: 'strrev(string $string): string',
        params: [{ name: '$string', description: '目标字符串' }],
        returnType: 'string'
    },
    'str_shuffle': {
        description: '随机打乱字符串（Fisher-Yates）',
        signature: 'str_shuffle(string $string): string',
        params: [{ name: '$string', description: '目标字符串' }],
        returnType: 'string'
    },
    'addslashes': {
        description: '添加转义符（\' " \\ NUL）',
        signature: 'addslashes(string $string): string',
        params: [{ name: '$string', description: '目标字符串' }],
        returnType: 'string'
    },
    'stripslashes': {
        description: '去除转义符',
        signature: 'stripslashes(string $string): string',
        params: [{ name: '$string', description: '目标字符串' }],
        returnType: 'string'
    },
    'bin2hex': {
        description: '将二进制字符串转换为十六进制表示',
        signature: 'bin2hex(string $string): string',
        params: [{ name: '$string', description: '二进制字符串' }],
        returnType: 'string'
    },
    'hex2bin': {
        description: '将十六进制字符串转换为二进制',
        signature: 'hex2bin(string $hex_string): string',
        params: [{ name: '$hex_string', description: '十六进制字符串' }],
        returnType: 'string'
    },

    // ---- HTML/Base64/URL (std/html.h) ----
    'htmlspecialchars': {
        description: '转换特殊字符为 HTML 实体（& " \' < >）',
        signature: 'htmlspecialchars(string $string): string',
        params: [{ name: '$string', description: '目标字符串' }],
        returnType: 'string'
    },
    'nl2br': {
        description: '将换行符转换为 <br> 标签',
        signature: 'nl2br(string $string): string',
        params: [{ name: '$string', description: '目标字符串' }],
        returnType: 'string'
    },
    'base64_encode': {
        description: 'Base64 编码',
        signature: 'base64_encode(string $data): string',
        params: [{ name: '$data', description: '要编码的数据' }],
        returnType: 'string'
    },
    'base64_decode': {
        description: 'Base64 解码',
        signature: 'base64_decode(string $data): string',
        params: [{ name: '$data', description: '要解码的数据' }],
        returnType: 'string'
    },
    'urlencode': {
        description: 'URL 编码',
        signature: 'urlencode(string $string): string',
        params: [{ name: '$string', description: '要编码的字符串' }],
        returnType: 'string'
    },
    'urldecode': {
        description: 'URL 解码',
        signature: 'urldecode(string $string): string',
        params: [{ name: '$string', description: '要解码的字符串' }],
        returnType: 'string'
    },
    'parse_url': {
        description: '解析 URL 为关联数组（scheme/host/port/path/query）',
        signature: 'parse_url(string $url): array',
        params: [{ name: '$url', description: '要解析的 URL' }],
        returnType: 'array'
    },
    'parse_str': {
        description: '将 query string 解析为关联数组',
        signature: 'parse_str(string $string): array',
        params: [{ name: '$string', description: 'query string' }],
        returnType: 'array'
    },
    'http_build_query': {
        description: '将数组构建为 query string',
        signature: 'http_build_query(array $data): string',
        params: [{ name: '$data', description: '关联数组' }],
        returnType: 'string'
    },

    // ---- 数组函数 (array.h + std/array_extra.h) ----
    'array_push': {
        description: '在数组末尾追加元素',
        signature: 'array_push(array &$array, mixed $value): int',
        params: [
            { name: '&$array', description: '目标数组' },
            { name: '$value', description: '要追加的值' }
        ],
        returnType: 'int'
    },
    'array_pop': {
        description: '弹出数组最后一个元素',
        signature: 'array_pop(array &$array): mixed',
        params: [{ name: '&$array', description: '目标数组' }],
        returnType: 'mixed'
    },
    'array_shift': {
        description: '移除数组第一个元素',
        signature: 'array_shift(array &$array): mixed',
        params: [{ name: '&$array', description: '目标数组' }],
        returnType: 'mixed'
    },
    'array_unshift': {
        description: '在数组开头插入元素',
        signature: 'array_unshift(array &$array, mixed $value): int',
        params: [
            { name: '&$array', description: '目标数组' },
            { name: '$value', description: '要插入的值' }
        ],
        returnType: 'int'
    },
    'in_array': {
        description: '检查值是否在数组中',
        signature: 'in_array(mixed $needle, array $haystack): bool',
        params: [
            { name: '$needle', description: '要搜索的值' },
            { name: '$haystack', description: '目标数组' }
        ],
        returnType: 'bool'
    },
    'array_search': {
        description: '搜索值并返回键名',
        signature: 'array_search(mixed $needle, array $haystack): int|string|false',
        params: [
            { name: '$needle', description: '要搜索的值' },
            { name: '$haystack', description: '目标数组' }
        ],
        returnType: 'int|string|false'
    },
    'array_key_exists': {
        description: '检查键名是否存在',
        signature: 'array_key_exists(mixed $key, array $array): bool',
        params: [
            { name: '$key', description: '要检查的键' },
            { name: '$array', description: '目标数组' }
        ],
        returnType: 'bool'
    },
    'array_keys': {
        description: '返回所有键名组成的新数组',
        signature: 'array_keys(array $array): array',
        params: [{ name: '$array', description: '目标数组' }],
        returnType: 'array'
    },
    'array_values': {
        description: '返回所有值组成的新数组',
        signature: 'array_values(array $array): array',
        params: [{ name: '$array', description: '目标数组' }],
        returnType: 'array'
    },
    'array_key_first': {
        description: '返回第一个键名，空数组返回 -1',
        signature: 'array_key_first(array $array): int',
        params: [{ name: '$array', description: '目标数组' }],
        returnType: 'int'
    },
    'array_key_last': {
        description: '返回最后一个键名，空数组返回 -1',
        signature: 'array_key_last(array $array): int',
        params: [{ name: '$array', description: '目标数组' }],
        returnType: 'int'
    },
    'array_merge': {
        description: '合并两个数组',
        signature: 'array_merge(array $array1, array $array2): array',
        params: [
            { name: '$array1', description: '第一个数组' },
            { name: '$array2', description: '第二个数组' }
        ],
        returnType: 'array'
    },
    'array_chunk': {
        description: '将数组拆分为多个子数组',
        signature: 'array_chunk(array $array, int $size): array',
        params: [
            { name: '$array', description: '目标数组' },
            { name: '$size', description: '每块大小' }
        ],
        returnType: 'array'
    },
    'array_slice': {
        description: '截取数组的一部分',
        signature: 'array_slice(array $array, int $offset, int $length = null): array',
        params: [
            { name: '$array', description: '目标数组' },
            { name: '$offset', description: '起始偏移' },
            { name: '$length', description: '长度（可选）' }
        ],
        returnType: 'array'
    },
    'array_combine': {
        description: '用键数组和值数组创建新数组',
        signature: 'array_combine(array $keys, array $values): array',
        params: [
            { name: '$keys', description: '键数组' },
            { name: '$values', description: '值数组' }
        ],
        returnType: 'array'
    },
    'array_unique': {
        description: '移除数组中的重复值',
        signature: 'array_unique(array $array): array',
        params: [{ name: '$array', description: '目标数组' }],
        returnType: 'array'
    },
    'array_diff': {
        description: '返回差集（在第一个数组但不在第二个数组中的值）',
        signature: 'array_diff(array $array1, array $array2): array',
        params: [
            { name: '$array1', description: '第一个数组' },
            { name: '$array2', description: '第二个数组' }
        ],
        returnType: 'array'
    },
    'array_intersect': {
        description: '返回交集（同时存在于两个数组中的值）',
        signature: 'array_intersect(array $array1, array $array2): array',
        params: [
            { name: '$array1', description: '第一个数组' },
            { name: '$array2', description: '第二个数组' }
        ],
        returnType: 'array'
    },
    'array_count_values': {
        description: '统计数组中每个值出现的次数',
        signature: 'array_count_values(array $array): array',
        params: [{ name: '$array', description: '目标数组' }],
        returnType: 'array'
    },
    'array_flip': {
        description: '交换数组的键和值',
        signature: 'array_flip(array $array): array',
        params: [{ name: '$array', description: '目标数组' }],
        returnType: 'array'
    },
    'sort': {
        description: '按值排序数组（原地，不保键）',
        signature: 'sort(array &$array): bool',
        params: [{ name: '&$array', description: '目标数组' }],
        returnType: 'bool'
    },
    'rsort': {
        description: '按值逆序排序',
        signature: 'rsort(array &$array): bool',
        params: [{ name: '&$array', description: '目标数组' }],
        returnType: 'bool'
    },
    'ksort': {
        description: '按键排序',
        signature: 'ksort(array &$array): bool',
        params: [{ name: '&$array', description: '目标数组' }],
        returnType: 'bool'
    },
    'krsort': {
        description: '按键逆序排序',
        signature: 'krsort(array &$array): bool',
        params: [{ name: '&$array', description: '目标数组' }],
        returnType: 'bool'
    },
    'asort': {
        description: '按值排序并保键',
        signature: 'asort(array &$array): bool',
        params: [{ name: '&$array', description: '目标数组' }],
        returnType: 'bool'
    },
    'arsort': {
        description: '按值逆序排序并保键',
        signature: 'arsort(array &$array): bool',
        params: [{ name: '&$array', description: '目标数组' }],
        returnType: 'bool'
    },
    'shuffle': {
        description: '随机打乱数组（Fisher-Yates）',
        signature: 'shuffle(array &$array): bool',
        params: [{ name: '&$array', description: '目标数组' }],
        returnType: 'bool'
    },
    'array_rand': {
        description: '随机取出一个或多个键名',
        signature: 'array_rand(array $array, int $num = 1): int|array',
        params: [
            { name: '$array', description: '目标数组' },
            { name: '$num', description: '取出数量（默认1）' }
        ],
        returnType: 'int|array'
    },
    'current': {
        description: '返回当前指针位置的值',
        signature: 'current(array &$array): mixed',
        params: [{ name: '&$array', description: '目标数组' }],
        returnType: 'mixed'
    },
    'key': {
        description: '返回当前指针位置的键名',
        signature: 'key(array &$array): int|string|null',
        params: [{ name: '&$array', description: '目标数组' }],
        returnType: 'int|string|null'
    },
    'next': {
        description: '将指针移到下一位并返回值',
        signature: 'next(array &$array): mixed',
        params: [{ name: '&$array', description: '目标数组' }],
        returnType: 'mixed'
    },
    'prev': {
        description: '将指针移到上一位并返回值',
        signature: 'prev(array &$array): mixed',
        params: [{ name: '&$array', description: '目标数组' }],
        returnType: 'mixed'
    },
    'end': {
        description: '将指针移到末尾并返回值',
        signature: 'end(array &$array): mixed',
        params: [{ name: '&$array', description: '目标数组' }],
        returnType: 'mixed'
    },
    'reset': {
        description: '将指针移到开头并返回值',
        signature: 'reset(array &$array): mixed',
        params: [{ name: '&$array', description: '目标数组' }],
        returnType: 'mixed'
    },
    'range': {
        description: '创建包含指定范围元素的数组',
        signature: 'range(int|float $start, int|float $end, int|float $step = 1): array',
        params: [
            { name: '$start', description: '起始值' },
            { name: '$end', description: '结束值' },
            { name: '$step', description: '步长（可选）' }
        ],
        returnType: 'array'
    },
    'array_fill': {
        description: '用指定值填充数组',
        signature: 'array_fill(int $start, int $count, mixed $value): array',
        params: [
            { name: '$start', description: '起始键' },
            { name: '$count', description: '数量' },
            { name: '$value', description: '填充值' }
        ],
        returnType: 'array'
    },
    'array_reverse': {
        description: '反转数组',
        signature: 'array_reverse(array $array): array',
        params: [{ name: '$array', description: '目标数组' }],
        returnType: 'array'
    },
    'array_column': {
        description: '返回数组中指定列的值',
        signature: 'array_column(array $array, mixed $column): array',
        params: [
            { name: '$array', description: '二维数组' },
            { name: '$column', description: '列名或键' }
        ],
        returnType: 'array'
    },
    'max': {
        description: '返回数组中的最大值',
        signature: 'max(array $array): mixed',
        params: [{ name: '$array', description: '目标数组' }],
        returnType: 'mixed'
    },
    'min': {
        description: '返回数组中的最小值',
        signature: 'min(array $array): mixed',
        params: [{ name: '$array', description: '目标数组' }],
        returnType: 'mixed'
    },
    'array_sum': {
        description: '计算数组所有值的和',
        signature: 'array_sum(array $array): int|float',
        params: [{ name: '$array', description: '目标数组' }],
        returnType: 'int|float'
    },
    'array_product': {
        description: '计算数组所有值的乘积',
        signature: 'array_product(array $array): int|float',
        params: [{ name: '$array', description: '目标数组' }],
        returnType: 'int|float'
    },
    'array_is_list': {
        description: '检查数组是否为列表（key=0,1,2...）',
        signature: 'array_is_list(array $array): bool',
        params: [{ name: '$array', description: '目标数组' }],
        returnType: 'bool'
    },

    // ---- 数学函数 (std/math.h + tphp_math.h) ----
    'abs': {
        description: '返回绝对值',
        signature: 'abs(int|float $number): int|float',
        params: [{ name: '$number', description: '目标数值' }],
        returnType: 'int|float'
    },
    'round': {
        description: '四舍五入',
        signature: 'round(float $number, int $precision = 0): float',
        params: [
            { name: '$number', description: '目标数值' },
            { name: '$precision', description: '小数位数（可选）' }
        ],
        returnType: 'float'
    },
    'ceil': {
        description: '向上取整',
        signature: 'ceil(float $number): float',
        params: [{ name: '$number', description: '目标数值' }],
        returnType: 'float'
    },
    'floor': {
        description: '向下取整',
        signature: 'floor(float $number): float',
        params: [{ name: '$number', description: '目标数值' }],
        returnType: 'float'
    },
    'sqrt': {
        description: '计算平方根',
        signature: 'sqrt(float $number): float',
        params: [{ name: '$number', description: '目标数值' }],
        returnType: 'float'
    },
    'pow': {
        description: '计算幂',
        signature: 'pow(int|float $base, int|float $exponent): int|float',
        params: [
            { name: '$base', description: '底数' },
            { name: '$exponent', description: '指数' }
        ],
        returnType: 'int|float'
    },
    'pi': {
        description: '返回圆周率 π',
        signature: 'pi(): float',
        params: [],
        returnType: 'float'
    },
    'fmod': {
        description: '浮点取模',
        signature: 'fmod(float $x, float $y): float',
        params: [
            { name: '$x', description: '被除数' },
            { name: '$y', description: '除数' }
        ],
        returnType: 'float'
    },
    'intdiv': {
        description: '整数除法',
        signature: 'intdiv(int $dividend, int $divisor): int',
        params: [
            { name: '$dividend', description: '被除数' },
            { name: '$divisor', description: '除数' }
        ],
        returnType: 'int'
    },
    'deg2rad': {
        description: '角度转弧度',
        signature: 'deg2rad(float $degrees): float',
        params: [{ name: '$degrees', description: '角度值' }],
        returnType: 'float'
    },
    'rad2deg': {
        description: '弧度转角度',
        signature: 'rad2deg(float $radians): float',
        params: [{ name: '$radians', description: '弧度值' }],
        returnType: 'float'
    },
    'sin': { description: '正弦', signature: 'sin(float $x): float', params: [{ name: '$x', description: '弧度值' }], returnType: 'float' },
    'cos': { description: '余弦', signature: 'cos(float $x): float', params: [{ name: '$x', description: '弧度值' }], returnType: 'float' },
    'tan': { description: '正切', signature: 'tan(float $x): float', params: [{ name: '$x', description: '弧度值' }], returnType: 'float' },
    'asin': { description: '反正弦', signature: 'asin(float $x): float', params: [{ name: '$x', description: '-1 到 1 之间' }], returnType: 'float' },
    'acos': { description: '反余弦', signature: 'acos(float $x): float', params: [{ name: '$x', description: '-1 到 1 之间' }], returnType: 'float' },
    'atan': { description: '反正切', signature: 'atan(float $x): float', params: [{ name: '$x', description: '目标数值' }], returnType: 'float' },
    'sinh': { description: '双曲正弦', signature: 'sinh(float $x): float', params: [{ name: '$x', description: '目标数值' }], returnType: 'float' },
    'cosh': { description: '双曲余弦', signature: 'cosh(float $x): float', params: [{ name: '$x', description: '目标数值' }], returnType: 'float' },
    'tanh': { description: '双曲正切', signature: 'tanh(float $x): float', params: [{ name: '$x', description: '目标数值' }], returnType: 'float' },
    'exp': { description: '计算 e 的幂', signature: 'exp(float $x): float', params: [{ name: '$x', description: '指数' }], returnType: 'float' },
    'log': { description: '自然对数', signature: 'log(float $x): float', params: [{ name: '$x', description: '目标数值' }], returnType: 'float' },
    'log10': { description: '以10为底的对数', signature: 'log10(float $x): float', params: [{ name: '$x', description: '目标数值' }], returnType: 'float' },
    'is_finite': { description: '检查是否为有限数', signature: 'is_finite(float $x): bool', params: [{ name: '$x', description: '目标数值' }], returnType: 'bool' },
    'is_infinite': { description: '检查是否为无穷大', signature: 'is_infinite(float $x): bool', params: [{ name: '$x', description: '目标数值' }], returnType: 'bool' },
    'is_nan': { description: '检查是否为 NaN', signature: 'is_nan(float $x): bool', params: [{ name: '$x', description: '目标数值' }], returnType: 'bool' },

    // ---- 进制转换 (conv.h) ----
    'bindec': { description: '二进制转十进制', signature: 'bindec(string $binary_string): int', params: [{ name: '$binary_string', description: '二进制字符串' }], returnType: 'int' },
    'hexdec': { description: '十六进制转十进制', signature: 'hexdec(string $hex_string): int', params: [{ name: '$hex_string', description: '十六进制字符串' }], returnType: 'int' },
    'octdec': { description: '八进制转十进制', signature: 'octdec(string $octal_string): int', params: [{ name: '$octal_string', description: '八进制字符串' }], returnType: 'int' },
    'decbin': { description: '十进制转二进制', signature: 'decbin(int $number): string', params: [{ name: '$number', description: '十进制数' }], returnType: 'string' },
    'decoct': { description: '十进制转八进制', signature: 'decoct(int $number): string', params: [{ name: '$number', description: '十进制数' }], returnType: 'string' },
    'dechex': { description: '十进制转十六进制', signature: 'dechex(int $number): string', params: [{ name: '$number', description: '十进制数' }], returnType: 'string' },
    'base_convert': { description: '任意进制转换', signature: 'base_convert(string $number, int $frombase, int $tobase): string', params: [{ name: '$number', description: '数字字符串' }, { name: '$frombase', description: '源进制' }, { name: '$tobase', description: '目标进制' }], returnType: 'string' },

    // ---- 断言 (std/ctrl.h) ----
    'assert_true': { description: '断言条件为真，失败则 exit(2)', signature: 'assert_true(bool $condition): void', params: [{ name: '$condition', description: '断言条件' }], returnType: 'void' },
    'assert_false': { description: '断言条件为假', signature: 'assert_false(bool $condition): void', params: [{ name: '$condition', description: '断言条件' }], returnType: 'void' },
    'assert_eq_int': { description: '断言两个 int 相等', signature: 'assert_eq_int(int $a, int $b): void', params: [{ name: '$a', description: '第一个值' }, { name: '$b', description: '第二个值' }], returnType: 'void' },
    'assert_eq_float': { description: '断言两个 float 相等', signature: 'assert_eq_float(float $a, float $b): void', params: [{ name: '$a', description: '第一个值' }, { name: '$b', description: '第二个值' }], returnType: 'void' },
    'assert_eq_str': { description: '断言两个 string 相等', signature: 'assert_eq_str(string $a, string $b): void', params: [{ name: '$a', description: '第一个值' }, { name: '$b', description: '第二个值' }], returnType: 'void' },

    // ---- 随机数 (rand.h) ----
    'rand': { description: '生成随机整数（CSPRNG）', signature: 'rand(int $min = 0, int $max = PHP_INT_MAX): int', params: [{ name: '$min', description: '最小值（可选）' }, { name: '$max', description: '最大值（可选）' }], returnType: 'int' },
    'mt_rand': { description: '生成随机整数（代理到 random_int）', signature: 'mt_rand(int $min = 0, int $max = PHP_INT_MAX): int', params: [{ name: '$min', description: '最小值（可选）' }, { name: '$max', description: '最大值（可选）' }], returnType: 'int' },
    'random_int': { description: '密码学安全随机整数', signature: 'random_int(int $min, int $max): int', params: [{ name: '$min', description: '最小值' }, { name: '$max', description: '最大值' }], returnType: 'int' },
    'random_bytes': { description: '密码学安全随机字节', signature: 'random_bytes(int $length): string', params: [{ name: '$length', description: '字节数' }], returnType: 'string' },

    // ---- 字符检测 (ctype, std/ctrl.h) ----
    'ctype_alnum': { description: '检查是否为字母或数字', signature: 'ctype_alnum(string $text): bool', params: [{ name: '$text', description: '目标字符串' }], returnType: 'bool' },
    'ctype_alpha': { description: '检查是否为纯字母', signature: 'ctype_alpha(string $text): bool', params: [{ name: '$text', description: '目标字符串' }], returnType: 'bool' },
    'ctype_cntrl': { description: '检查是否为控制字符', signature: 'ctype_cntrl(string $text): bool', params: [{ name: '$text', description: '目标字符串' }], returnType: 'bool' },
    'ctype_digit': { description: '检查是否为纯数字', signature: 'ctype_digit(string $text): bool', params: [{ name: '$text', description: '目标字符串' }], returnType: 'bool' },
    'ctype_graph': { description: '检查是否为可打印字符（除空格）', signature: 'ctype_graph(string $text): bool', params: [{ name: '$text', description: '目标字符串' }], returnType: 'bool' },
    'ctype_lower': { description: '检查是否为小写字母', signature: 'ctype_lower(string $text): bool', params: [{ name: '$text', description: '目标字符串' }], returnType: 'bool' },
    'ctype_print': { description: '检查是否为可打印字符（含空格）', signature: 'ctype_print(string $text): bool', params: [{ name: '$text', description: '目标字符串' }], returnType: 'bool' },
    'ctype_punct': { description: '检查是否为标点符号', signature: 'ctype_punct(string $text): bool', params: [{ name: '$text', description: '目标字符串' }], returnType: 'bool' },
    'ctype_space': { description: '检查是否为空白字符', signature: 'ctype_space(string $text): bool', params: [{ name: '$text', description: '目标字符串' }], returnType: 'bool' },
    'ctype_upper': { description: '检查是否为大写字母', signature: 'ctype_upper(string $text): bool', params: [{ name: '$text', description: '目标字符串' }], returnType: 'bool' },
    'ctype_xdigit': { description: '检查是否为十六进制字符', signature: 'ctype_xdigit(string $text): bool', params: [{ name: '$text', description: '目标字符串' }], returnType: 'bool' },

    // ---- JSON (os/json.h) ----
    'json_encode': { description: '将值编码为 JSON 字符串', signature: 'json_encode(mixed $value): string', params: [{ name: '$value', description: '要编码的值' }], returnType: 'string' },
    'json_decode': { description: '将 JSON 字符串解码为值', signature: 'json_decode(string $json): mixed', params: [{ name: '$json', description: 'JSON 字符串' }], returnType: 'mixed' },
    'json_validate': { description: '验证 JSON 字符串是否有效', signature: 'json_validate(string $json): bool', params: [{ name: '$json', description: 'JSON 字符串' }], returnType: 'bool' },

    // ---- Hash (hash.h) ----
    'md5': { description: '计算 MD5 哈希（RFC 1321）', signature: 'md5(string $data): string', params: [{ name: '$data', description: '要哈希的数据' }], returnType: 'string' },
    'sha1': { description: '计算 SHA-1 哈希（FIPS 180-4）', signature: 'sha1(string $data): string', params: [{ name: '$data', description: '要哈希的数据' }], returnType: 'string' },
    'sha256': { description: '计算 SHA-256 哈希', signature: 'sha256(string $data): string', params: [{ name: '$data', description: '要哈希的数据' }], returnType: 'string' },
    'sha512': { description: '计算 SHA-512 哈希', signature: 'sha512(string $data): string', params: [{ name: '$data', description: '要哈希的数据' }], returnType: 'string' },
    'crc32': { description: '计算 CRC32 校验和', signature: 'crc32(string $data): int', params: [{ name: '$data', description: '要计算的数据' }], returnType: 'int' },

    // ---- 日期时间 (os/times.h) ----
    'time': { description: '返回当前 Unix 时间戳', signature: 'time(): int', params: [], returnType: 'int' },
    'date': { description: '格式化时间戳为日期字符串', signature: 'date(string $format, int $timestamp = 0): string', params: [{ name: '$format', description: '日期格式' }, { name: '$timestamp', description: '时间戳（可选）' }], returnType: 'string' },
    'sleep': { description: '暂停指定秒数', signature: 'sleep(int $seconds): int', params: [{ name: '$seconds', description: '秒数' }], returnType: 'int' },
    'usleep': { description: '暂停指定微秒数', signature: 'usleep(int $microseconds): void', params: [{ name: '$microseconds', description: '微秒数' }], returnType: 'void' },
    'hrtime': { description: '高精度时间（纳秒级，返回单个纳秒整数）', signature: 'hrtime(): int', params: [], returnType: 'int' },
    'microtime': { description: '返回当前时间（浮点秒）', signature: 'microtime(): float', params: [], returnType: 'float' },
    'mktime': { description: '从日期时间组件创建时间戳', signature: 'mktime(int $hour, int $minute, int $second, int $month, int $day, int $year): int', params: [{ name: '$hour', description: '小时' }, { name: '$minute', description: '分钟' }, { name: '$second', description: '秒' }, { name: '$month', description: '月' }, { name: '$day', description: '日' }, { name: '$year', description: '年' }], returnType: 'int' },
    'strtotime': { description: '解析日期字符串为时间戳', signature: 'strtotime(string $datetime): int', params: [{ name: '$datetime', description: '日期字符串（Y-m-d H:i:s）' }], returnType: 'int' },
    'uniqid': { description: '生成唯一 ID', signature: 'uniqid(string $prefix = ""): string', params: [{ name: '$prefix', description: '前缀（可选）' }], returnType: 'string' },

    // ---- 文件 I/O (os/file.h) ----
    'file_get_contents': { description: '读取文件全部内容为字符串', signature: 'file_get_contents(string $filename): string', params: [{ name: '$filename', description: '文件路径' }], returnType: 'string' },
    'file_put_contents': { description: '将数据写入文件（覆盖）', signature: 'file_put_contents(string $filename, string $data): int', params: [{ name: '$filename', description: '文件路径' }, { name: '$data', description: '要写入的数据' }], returnType: 'int' },

    // ---- UTF-8 (std/utf8.h) ----
    'mb_strlen': { description: '返回 UTF-8 字符串长度（字符数）', signature: 'mb_strlen(string $string): int', params: [{ name: '$string', description: 'UTF-8 字符串' }], returnType: 'int' },
    'mb_substr': { description: '截取 UTF-8 子串', signature: 'mb_substr(string $string, int $start, int $length = null): string', params: [{ name: '$string', description: 'UTF-8 字符串' }, { name: '$start', description: '起始位置' }, { name: '$length', description: '长度（可选）' }], returnType: 'string' },
    'mb_strpos': { description: '在 UTF-8 字符串中查找子串位置', signature: 'mb_strpos(string $haystack, string $needle): int', params: [{ name: '$haystack', description: '被搜索字符串' }, { name: '$needle', description: '要搜索的子串' }], returnType: 'int' },

    // ---- isset/empty/unset (内建语法) ----
    'isset': {
        description: '检查变量是否已设置且非 null。指针类型 → ptr != NULL；值类型 → 编译期 true',
        signature: 'isset(mixed $var): bool',
        params: [{ name: '$var', description: '要检查的变量' }],
        returnType: 'bool'
    },
    'empty': {
        description: '检查变量是否为空。int→==0, string→is_falsy, float/bool 同',
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

    // ---- pcre 正则表达式 (ext/pcre, NFA VM 引擎) ----
    'preg_match': {
        description: '执行正则表达式匹配（NFA VM 引擎）。返回匹配结果数组，未匹配返回空数组',
        signature: 'preg_match(string $pattern, string $subject): array',
        params: [
            { name: '$pattern', description: '正则表达式（含分隔符 /.../）' },
            { name: '$subject', description: '目标字符串' }
        ],
        returnType: 'array'
    },
    'preg_match_all': {
        description: '全局正则匹配，返回所有匹配结果',
        signature: 'preg_match_all(string $pattern, string $subject): array',
        params: [
            { name: '$pattern', description: '正则表达式' },
            { name: '$subject', description: '目标字符串' }
        ],
        returnType: 'array'
    },
    'preg_replace': {
        description: '正则替换。返回替换后的字符串',
        signature: 'preg_replace(string $pattern, string $replacement, string $subject, int $limit): string',
        params: [
            { name: '$pattern', description: '正则表达式' },
            { name: '$replacement', description: '替换字符串' },
            { name: '$subject', description: '目标字符串' },
            { name: '$limit', description: '最大替换次数（-1=无限）' }
        ],
        returnType: 'string'
    },
    'preg_split': {
        description: '用正则分割字符串，返回数组',
        signature: 'preg_split(string $pattern, string $subject, int $limit, int $flags): array',
        params: [
            { name: '$pattern', description: '正则表达式' },
            { name: '$subject', description: '目标字符串' },
            { name: '$limit', description: '最大分割数（-1=无限）' },
            { name: '$flags', description: '标志位（PREG_SPLIT_NO_EMPTY/PREG_SPLIT_DELIM_CAPTURE）' }
        ],
        returnType: 'array'
    },
    'preg_grep': {
        description: '返回数组中匹配模式的元素',
        signature: 'preg_grep(string $pattern, array $array, int $flags): array',
        params: [
            { name: '$pattern', description: '正则表达式' },
            { name: '$array', description: '输入数组' },
            { name: '$flags', description: '标志位（PREG_GREP_INVERT 返回不匹配项）' }
        ],
        returnType: 'array'
    },
    'preg_quote': {
        description: '转义正则特殊字符',
        signature: 'preg_quote(string $str, string $delimiter): string',
        params: [
            { name: '$str', description: '要转义的字符串' },
            { name: '$delimiter', description: '分隔符（也会被转义）' }
        ],
        returnType: 'string'
    },
    'preg_last_error': {
        description: '返回最后一次正则操作的错误码',
        signature: 'preg_last_error(): int',
        params: [],
        returnType: 'int'
    },
    'preg_last_error_msg': {
        description: '返回最后一次正则操作的错误描述',
        signature: 'preg_last_error_msg(): string',
        params: [],
        returnType: 'string'
    },

    // ---- iconv 字符集转换 ----
    'iconv': {
        description: '将字符串从源编码转换为目标编码',
        signature: 'iconv(string $from_encoding, string $to_encoding, string $string): string',
        params: [
            { name: '$from_encoding', description: '源编码' },
            { name: '$to_encoding', description: '目标编码' },
            { name: '$string', description: '要转换的字符串' }
        ],
        returnType: 'string'
    },
    'iconv_strlen': {
        description: '返回指定编码下字符串的字符数',
        signature: 'iconv_strlen(string $string): int',
        params: [{ name: '$string', description: '目标字符串' }],
        returnType: 'int'
    },
    'iconv_strpos': {
        description: '查找子串首次出现位置（字符计数）',
        signature: 'iconv_strpos(string $haystack, string $needle): int',
        params: [
            { name: '$haystack', description: '目标字符串' },
            { name: '$needle', description: '查找子串' }
        ],
        returnType: 'int'
    },
    'iconv_substr': {
        description: '截取子串（按字符计数）',
        signature: 'iconv_substr(string $string, int $offset, int $length): string',
        params: [
            { name: '$string', description: '目标字符串' },
            { name: '$offset', description: '起始位置' },
            { name: '$length', description: '截取长度' }
        ],
        returnType: 'string'
    },
    'iconv_get_encoding': {
        description: '获取当前 iconv 内部编码',
        signature: 'iconv_get_encoding(): string',
        params: [],
        returnType: 'string'
    },
    'iconv_set_encoding': {
        description: '设置 iconv 内部编码',
        signature: 'iconv_set_encoding(string $type, string $encoding): bool',
        params: [
            { name: '$type', description: '编码类型' },
            { name: '$encoding', description: '编码名称' }
        ],
        returnType: 'bool'
    },
    'iconv_mime_encode': {
        description: '编码 MIME 头字段',
        signature: 'iconv_mime_encode(string $field_name, string $field_value): string',
        params: [
            { name: '$field_name', description: '字段名' },
            { name: '$field_value', description: '字段值' }
        ],
        returnType: 'string'
    },
    'iconv_mime_decode': {
        description: '解码 MIME 头字段',
        signature: 'iconv_mime_decode(string $encoded_string): string',
        params: [{ name: '$encoded_string', description: '编码的字符串' }],
        returnType: 'string'
    },

    // ---- filter 过滤器 ----
    'filter_var': {
        description: '用指定过滤器过滤变量。验证过滤器返回过滤后的值或 false，净化过滤器返回净化后的值',
        signature: 'filter_var(mixed $value, int $filter, int $flags): mixed',
        params: [
            { name: '$value', description: '要过滤的值' },
            { name: '$filter', description: '过滤器 ID（FILTER_VALIDATE_*/FILTER_SANITIZE_*）' },
            { name: '$flags', description: '标志位（FILTER_FLAG_*）' }
        ],
        returnType: 'mixed'
    },
    'filter_list': {
        description: '返回所有可用过滤器名称数组',
        signature: 'filter_list(): array',
        params: [],
        returnType: 'array'
    },
    'filter_id': {
        description: '根据过滤器名称获取过滤器 ID',
        signature: 'filter_id(string $name): int',
        params: [{ name: '$name', description: '过滤器名称' }],
        returnType: 'int'
    },

    // ---- password 密码哈希 ----
    'password_hash': {
        description: '创建密码哈希（仅支持 bcrypt，cost 硬编码 10）',
        signature: 'password_hash(string $password, int $algo, array $options): string',
        params: [
            { name: '$password', description: '原始密码' },
            { name: '$algo', description: '算法（目前仅支持 PASSWORD_BCRYPT）' },
            { name: '$options', description: '选项（cost 等）' }
        ],
        returnType: 'string'
    },
    'password_verify': {
        description: '验证密码与哈希是否匹配',
        signature: 'password_verify(string $password, string $hash): bool',
        params: [
            { name: '$password', description: '原始密码' },
            { name: '$hash', description: '密码哈希' }
        ],
        returnType: 'bool'
    },

    // ---- pcntl 进程控制 (POSIX 专属, 需 #import pcntl) ----
    'pcntl_fork': {
        description: '创建子进程。父进程返回子进程 PID，子进程返回 0',
        signature: 'pcntl_fork(): int',
        params: [],
        returnType: 'int'
    },
    'pcntl_waitpid': {
        description: '等待指定子进程状态变化',
        signature: 'pcntl_waitpid(int $pid, int &$status, int $flags): int',
        params: [
            { name: '$pid', description: '子进程 PID' },
            { name: '$status', description: '状态（引用传递）' },
            { name: '$flags', description: '等待标志' }
        ],
        returnType: 'int'
    },
    'pcntl_wait': {
        description: '等待任意子进程状态变化',
        signature: 'pcntl_wait(int &$status): int',
        params: [{ name: '$status', description: '状态（引用传递）' }],
        returnType: 'int'
    },
    'pcntl_exec': {
        description: '在当前进程空间执行程序（替换当前进程）',
        signature: 'pcntl_exec(string $path): void',
        params: [{ name: '$path', description: '可执行文件路径' }],
        returnType: 'void'
    },
    'pcntl_alarm': {
        description: '设置 SIGALRM 定时器',
        signature: 'pcntl_alarm(int $seconds): int',
        params: [{ name: '$seconds', description: '秒数（0=取消）' }],
        returnType: 'int'
    },
    'pcntl_get_last_error': {
        description: '返回最后一次 pcntl 操作的错误码',
        signature: 'pcntl_get_last_error(): int',
        params: [],
        returnType: 'int'
    },
    'pcntl_strerror': {
        description: '根据错误码返回错误描述',
        signature: 'pcntl_strerror(int $error_code): string',
        params: [{ name: '$error_code', description: '错误码' }],
        returnType: 'string'
    },

    // ---- posix 系统 (POSIX 专属, 需 #import posix) ----
    'posix_getpid': { description: '返回当前进程 PID', signature: 'posix_getpid(): int', params: [], returnType: 'int' },
    'posix_getppid': { description: '返回父进程 PID', signature: 'posix_getppid(): int', params: [], returnType: 'int' },
    'posix_getuid': { description: '返回当前进程实际用户 ID', signature: 'posix_getuid(): int', params: [], returnType: 'int' },
    'posix_geteuid': { description: '返回当前进程有效用户 ID', signature: 'posix_geteuid(): int', params: [], returnType: 'int' },
    'posix_getgid': { description: '返回当前进程实际组 ID', signature: 'posix_getgid(): int', params: [], returnType: 'int' },
    'posix_getegid': { description: '返回当前进程有效组 ID', signature: 'posix_getegid(): int', params: [], returnType: 'int' },
    'posix_getcwd': { description: '返回当前工作目录路径', signature: 'posix_getcwd(): string', params: [], returnType: 'string' },
    'posix_isatty': { description: '检查文件描述符是否为终端', signature: 'posix_isatty(int $fd): int', params: [{ name: '$fd', description: '文件描述符' }], returnType: 'int' },
    'posix_kill': { description: '向进程发送信号', signature: 'posix_kill(int $pid, int $sig): int', params: [{ name: '$pid', description: '目标 PID' }, { name: '$sig', description: '信号编号' }], returnType: 'int' },
    'posix_strerror': { description: '根据错误码返回错误描述', signature: 'posix_strerror(int $errno): string', params: [{ name: '$errno', description: '错误码' }], returnType: 'string' },
    'posix_get_last_error': { description: '返回最后一次 posix 操作的错误码', signature: 'posix_get_last_error(): int', params: [], returnType: 'int' },
    'posix_ttyname': { description: '返回终端设备名', signature: 'posix_ttyname(int $fd): string', params: [{ name: '$fd', description: '文件描述符' }], returnType: 'string' },
    'posix_uname': { description: '返回系统信息数组（sysname/nodename/release/version/machine）', signature: 'posix_uname(): array', params: [], returnType: 'array' },
    'posix_times': { description: '返回进程时间使用情况数组', signature: 'posix_times(): array', params: [], returnType: 'array' },

    // ---- exif EXIF 元数据 (需 #import exif, 纯 phpc 实现) ----
    'exif_imagetype': {
        description: '检测图像类型，返回 IMAGETYPE_* 常量',
        signature: 'exif_imagetype(string $filename): int',
        params: [{ name: '$filename', description: '图像文件路径' }],
        returnType: 'int'
    },
    'exif_read_data': {
        description: '从图像文件读取 EXIF 头信息，返回关联数组',
        signature: 'exif_read_data(string $filename): array',
        params: [{ name: '$filename', description: '图像文件路径' }],
        returnType: 'array'
    },
    'exif_thumbnail': {
        description: '读取嵌入的缩略图数据',
        signature: 'exif_thumbnail(string $filename): array',
        params: [{ name: '$filename', description: '图像文件路径' }],
        returnType: 'array'
    },
    'exif_tagname': {
        description: '根据索引返回 EXIF 标签名',
        signature: 'exif_tagname(int $index): string',
        params: [{ name: '$index', description: 'EXIF 标签索引' }],
        returnType: 'string'
    },
    'exif_make_test_jpeg': { description: '生成测试用 JPEG 数据（测试辅助）', signature: 'exif_make_test_jpeg(): string', params: [], returnType: 'string' },
    'exif_make_test_jpeg_ex': { description: '生成扩展测试用 JPEG 数据（含 EXIF，测试辅助）', signature: 'exif_make_test_jpeg_ex(): string', params: [], returnType: 'string' },
    'exif_make_test_tiff': { description: '生成测试用 TIFF 数据（测试辅助）', signature: 'exif_make_test_tiff(): string', params: [], returnType: 'string' },
    'exif_make_test_header': { description: '生成测试用图像头（测试辅助）', signature: 'exif_make_test_header(): string', params: [], returnType: 'string' },

    // ---- calendar 日历转换 (纯 tphp 实现, 基于 JD) ----
    'gregoriantojd': { description: '公历转儒略日', signature: 'gregoriantojd(int $month, int $day, int $year): int', params: [{ name: '$month', description: '月' }, { name: '$day', description: '日' }, { name: '$year', description: '年' }], returnType: 'int' },
    'jdtogregorian': { description: '儒略日转公历，返回 ["month","day","year"]', signature: 'jdtogregorian(int $jd): array', params: [{ name: '$jd', description: '儒略日' }], returnType: 'array' },
    'juliantojd': { description: '儒略历转儒略日', signature: 'juliantojd(int $month, int $day, int $year): int', params: [{ name: '$month', description: '月' }, { name: '$day', description: '日' }, { name: '$year', description: '年' }], returnType: 'int' },
    'jdtojulian': { description: '儒略日转儒略历，返回 ["month","day","year"]', signature: 'jdtojulian(int $jd): array', params: [{ name: '$jd', description: '儒略日' }], returnType: 'array' },
    'jewishtojd': { description: '犹太历转儒略日', signature: 'jewishtojd(int $month, int $day, int $year): int', params: [{ name: '$month', description: '月' }, { name: '$day', description: '日' }, { name: '$year', description: '年' }], returnType: 'int' },
    'jdtojewish': { description: '儒略日转犹太历，返回 ["month","day","year"]', signature: 'jdtojewish(int $jd): array', params: [{ name: '$jd', description: '儒略日' }], returnType: 'array' },
    'jdtojewish_str': { description: '儒略日转犹太历字符串（含希伯来月份名）', signature: 'jdtojewish_str(int $jd): string', params: [{ name: '$jd', description: '儒略日' }], returnType: 'string' },
    'jewish_month_name': { description: '返回犹太历月份名', signature: 'jewish_month_name(int $month): string', params: [{ name: '$month', description: '月份编号' }], returnType: 'string' },
    'frenchtojd': { description: '法国共和历转儒略日', signature: 'frenchtojd(int $month, int $day, int $year): int', params: [{ name: '$month', description: '月' }, { name: '$day', description: '日' }, { name: '$year', description: '年' }], returnType: 'int' },
    'jdtofrench': { description: '儒略日转法国共和历', signature: 'jdtofrench(int $jd): array', params: [{ name: '$jd', description: '儒略日' }], returnType: 'array' },
    'cal_days_in_month': { description: '返回指定日历某月天数', signature: 'cal_days_in_month(int $calendar, int $month, int $year): int', params: [{ name: '$calendar', description: '日历类型（CAL_*）' }, { name: '$month', description: '月' }, { name: '$year', description: '年' }], returnType: 'int' },
    'cal_from_jd': { description: '儒略日转指定日历的日期信息数组', signature: 'cal_from_jd(int $jd, int $calendar): array', params: [{ name: '$jd', description: '儒略日' }, { name: '$calendar', description: '日历类型' }], returnType: 'array' },
    'cal_to_jd': { description: '指定日历日期转儒略日', signature: 'cal_to_jd(int $calendar, int $month, int $day, int $year): int', params: [{ name: '$calendar', description: '日历类型' }, { name: '$month', description: '月' }, { name: '$day', description: '日' }, { name: '$year', description: '年' }], returnType: 'int' },
    'cal_info': { description: '返回指定日历的信息数组', signature: 'cal_info(int $calendar): array', params: [{ name: '$calendar', description: '日历类型' }], returnType: 'array' },
    'easter_date': { description: '返回指定年份复活节的 Unix 时间戳', signature: 'easter_date(int $year): int', params: [{ name: '$year', description: '年份' }], returnType: 'int' },
    'easter_days': { description: '返回当年春分后到复活节的天数', signature: 'easter_days(int $year): int', params: [{ name: '$year', description: '年份' }], returnType: 'int' },

    // ---- fileinfo MIME 检测 ----
    'finfo_open': {
        description: '创建 fileinfo 资源（魔数检测）',
        signature: 'finfo_open(int $flags, string $magic_file): Resource',
        params: [
            { name: '$flags', description: '标志位（FILEINFO_*）' },
            { name: '$magic_file', description: '魔数文件路径（可空）' }
        ],
        returnType: 'Resource'
    },
    'finfo_file': {
        description: '返回文件 MIME 信息',
        signature: 'finfo_file(Resource $finfo, string $filename, int $flags): string',
        params: [
            { name: '$finfo', description: 'finfo 资源' },
            { name: '$filename', description: '文件路径' },
            { name: '$flags', description: '标志位' }
        ],
        returnType: 'string'
    },
    'finfo_buffer': {
        description: '返回字符串内容的 MIME 信息',
        signature: 'finfo_buffer(Resource $finfo, string $data, int $flags): string',
        params: [
            { name: '$finfo', description: 'finfo 资源' },
            { name: '$data', description: '要检测的内容' },
            { name: '$flags', description: '标志位' }
        ],
        returnType: 'string'
    },
    'finfo_close': {
        description: '关闭 fileinfo 资源',
        signature: 'finfo_close(Resource $finfo): void',
        params: [{ name: '$finfo', description: 'finfo 资源' }],
        returnType: 'void'
    },
    'finfo_set_flags': {
        description: '设置 fileinfo 选项',
        signature: 'finfo_set_flags(Resource $finfo, int $flags): bool',
        params: [
            { name: '$finfo', description: 'finfo 资源' },
            { name: '$flags', description: '标志位' }
        ],
        returnType: 'bool'
    },
    'mime_content_type': {
        description: '检测文件 MIME 类型',
        signature: 'mime_content_type(string $filename): string',
        params: [{ name: '$filename', description: '文件路径' }],
        returnType: 'string'
    },

    // ---- zlib 压缩/解压 (内置 zlib 1.3.2) ----
    'gzcompress': { description: '压缩字符串（zlib 格式）', signature: 'gzcompress(string $data, int $level, int $encoding): string', params: [{ name: '$data', description: '数据' }, { name: '$level', description: '压缩级别（-1~9）' }, { name: '$encoding', description: '编码格式（ZLIB_ENCODING_*）' }], returnType: 'string' },
    'gzuncompress': { description: '解压 gzcompress 压缩的数据', signature: 'gzuncompress(string $data, int $max_length, int $encoding): string', params: [{ name: '$data', description: '压缩数据' }, { name: '$max_length', description: '最大长度（0=无限）' }, { name: '$encoding', description: '编码格式' }], returnType: 'string' },
    'gzencode': { description: '创建 gzip 压缩数据', signature: 'gzencode(string $data, int $level, int $encoding): string', params: [{ name: '$data', description: '数据' }, { name: '$level', description: '压缩级别' }, { name: '$encoding', description: '编码格式' }], returnType: 'string' },
    'gzdecode': { description: '解码 gzip 数据（自动检测格式）', signature: 'gzdecode(string $data, int $max_length): string', params: [{ name: '$data', description: 'gzip 数据' }, { name: '$max_length', description: '最大长度' }], returnType: 'string' },
    'gzdeflate': { description: '原始 DEFLATE 压缩', signature: 'gzdeflate(string $data, int $level, int $encoding): string', params: [{ name: '$data', description: '数据' }, { name: '$level', description: '压缩级别' }, { name: '$encoding', description: '编码格式' }], returnType: 'string' },
    'gzinflate': { description: '解压原始 DEFLATE 数据', signature: 'gzinflate(string $data, int $max_length): string', params: [{ name: '$data', description: 'DEFLATE 数据' }, { name: '$max_length', description: '最大长度' }], returnType: 'string' },
    'zlib_encode': { description: '通用编码接口（由 encoding 指定格式）', signature: 'zlib_encode(string $data, int $encoding, int $level): string', params: [{ name: '$data', description: '数据' }, { name: '$encoding', description: '编码格式' }, { name: '$level', description: '压缩级别' }], returnType: 'string' },
    'zlib_decode': { description: '通用解码接口（自动检测格式）', signature: 'zlib_decode(string $data, int $max_length): string', params: [{ name: '$data', description: '压缩数据' }, { name: '$max_length', description: '最大长度' }], returnType: 'string' },
    'gzopen': { description: '打开 gz 文件', signature: 'gzopen(string $filename, string $mode): Resource', params: [{ name: '$filename', description: '文件名' }, { name: '$mode', description: '打开模式（同 fopen，可附加压缩级别如 wb9）' }], returnType: 'Resource' },
    'gzclose': { description: '关闭 gz 文件', signature: 'gzclose(Resource $stream): bool', params: [{ name: '$stream', description: 'gz 文件资源' }], returnType: 'bool' },
    'gzread': { description: '读取 gz 文件数据', signature: 'gzread(Resource $stream, int $length): string', params: [{ name: '$stream', description: '资源' }, { name: '$length', description: '读取长度' }], returnType: 'string' },
    'gzwrite': { description: '写入 gz 文件数据', signature: 'gzwrite(Resource $stream, string $data, int $length): int', params: [{ name: '$stream', description: '资源' }, { name: '$data', description: '数据' }, { name: '$length', description: '写入长度（0=全部）' }], returnType: 'int' },
    'gzputs': { description: 'gzwrite 别名', signature: 'gzputs(Resource $stream, string $data, int $length): int', params: [{ name: '$stream', description: '资源' }, { name: '$data', description: '数据' }, { name: '$length', description: '写入长度' }], returnType: 'int' },
    'gzeof': { description: '检查是否到达 gz 文件尾', signature: 'gzeof(Resource $stream): bool', params: [{ name: '$stream', description: '资源' }], returnType: 'bool' },
    'gzgets': { description: '从 gz 文件读取一行', signature: 'gzgets(Resource $stream, int $length): string', params: [{ name: '$stream', description: '资源' }, { name: '$length', description: '最大长度（0=缓冲区大小）' }], returnType: 'string' },
    'gzgetc': { description: '从 gz 文件读取单个字符', signature: 'gzgetc(Resource $stream): string', params: [{ name: '$stream', description: '资源' }], returnType: 'string' },
    'gzrewind': { description: '重置 gz 文件到开头', signature: 'gzrewind(Resource $stream): bool', params: [{ name: '$stream', description: '资源' }], returnType: 'bool' },
    'gzseek': { description: '定位 gz 文件位置', signature: 'gzseek(Resource $stream, int $offset, int $whence): int', params: [{ name: '$stream', description: '资源' }, { name: '$offset', description: '偏移' }, { name: '$whence', description: '定位方式（SEEK_SET/SEEK_CUR）' }], returnType: 'int' },
    'gztell': { description: '返回 gz 文件当前位置', signature: 'gztell(Resource $stream): int', params: [{ name: '$stream', description: '资源' }], returnType: 'int' },
    'gzpassthru': { description: '读取 gz 文件剩余数据并输出到 stdout', signature: 'gzpassthru(Resource $stream): int', params: [{ name: '$stream', description: '资源' }], returnType: 'int' },
    'gzflush': { description: '刷新 gz 文件输出缓冲区', signature: 'gzflush(Resource $stream, int $flush): bool', params: [{ name: '$stream', description: '资源' }, { name: '$flush', description: 'flush 模式（ZLIB_*）' }], returnType: 'bool' },
    'gzfile': { description: '读取整个 gz 文件到数组（每行一个元素）', signature: 'gzfile(string $filename): array', params: [{ name: '$filename', description: '文件名' }], returnType: 'array' },
    'readgzfile': { description: '读取整个 gz 文件并输出到 stdout', signature: 'readgzfile(string $filename): int', params: [{ name: '$filename', description: '文件名' }], returnType: 'int' },
    'deflate_init': { description: '创建压缩上下文（流式压缩）', signature: 'deflate_init(int $encoding, int $level): Resource', params: [{ name: '$encoding', description: '编码格式' }, { name: '$level', description: '压缩级别' }], returnType: 'Resource' },
    'deflate_add': { description: '增量压缩数据块', signature: 'deflate_add(Resource $context, string $data, int $flush_mode): string', params: [{ name: '$context', description: '压缩上下文' }, { name: '$data', description: '数据块' }, { name: '$flush_mode', description: 'flush 模式' }], returnType: 'string' },
    'inflate_init': { description: '创建解压上下文（流式解压）', signature: 'inflate_init(int $encoding): Resource', params: [{ name: '$encoding', description: '编码格式（0=自动检测）' }], returnType: 'Resource' },
    'inflate_add': { description: '增量解压数据块', signature: 'inflate_add(Resource $context, string $data, int $flush_mode): string', params: [{ name: '$context', description: '解压上下文' }, { name: '$data', description: '数据块' }, { name: '$flush_mode', description: 'flush 模式' }], returnType: 'string' },
    'inflate_get_status': { description: '返回 zlib 状态码', signature: 'inflate_get_status(Resource $context): int', params: [{ name: '$context', description: '解压上下文' }], returnType: 'int' },
    'inflate_get_read_len': { description: '返回已解压的总字节数', signature: 'inflate_get_read_len(Resource $context): int', params: [{ name: '$context', description: '解压上下文' }], returnType: 'int' },

    // ---- zip 归档读写 (内置 zlib, 手写 ZIP 容器) ----
    'zip_open': { description: '打开/创建 ZIP 归档', signature: 'zip_open(string $filename, int $flags): Resource', params: [{ name: '$filename', description: '文件名' }, { name: '$flags', description: '标志位（ZIP_*）' }], returnType: 'Resource' },
    'zip_close': { description: '关闭 ZIP 归档（写入模式刷盘）', signature: 'zip_close(Resource $zip): bool', params: [{ name: '$zip', description: 'ZIP 资源' }], returnType: 'bool' },
    'zip_num_files': { description: '返回 ZIP 中文件总数', signature: 'zip_num_files(Resource $zip): int', params: [{ name: '$zip', description: 'ZIP 资源' }], returnType: 'int' },
    'zip_get_error_string': { description: '返回最后错误描述', signature: 'zip_get_error_string(Resource $zip): string', params: [{ name: '$zip', description: 'ZIP 资源' }], returnType: 'string' },
    'zip_locate': { description: '按名查找条目索引（未找到返回 -1）', signature: 'zip_locate(Resource $zip, string $name): int', params: [{ name: '$zip', description: 'ZIP 资源' }, { name: '$name', description: '条目名' }], returnType: 'int' },
    'zip_read': { description: '返回所有条目列表', signature: 'zip_read(Resource $zip): array', params: [{ name: '$zip', description: 'ZIP 资源' }], returnType: 'array' },
    'zip_stat': { description: '获取单个条目信息', signature: 'zip_stat(Resource $zip, int $index): array', params: [{ name: '$zip', description: 'ZIP 资源' }, { name: '$index', description: '条目索引' }], returnType: 'array' },
    'zip_entry_name': { description: '返回条目名', signature: 'zip_entry_name(Resource $zip, int $index): string', params: [{ name: '$zip', description: 'ZIP 资源' }, { name: '$index', description: '条目索引' }], returnType: 'string' },
    'zip_entry_filesize': { description: '返回条目原始大小', signature: 'zip_entry_filesize(Resource $zip, int $index): int', params: [{ name: '$zip', description: 'ZIP 资源' }, { name: '$index', description: '条目索引' }], returnType: 'int' },
    'zip_entry_compressedsize': { description: '返回条目压缩后大小', signature: 'zip_entry_compressedsize(Resource $zip, int $index): int', params: [{ name: '$zip', description: 'ZIP 资源' }, { name: '$index', description: '条目索引' }], returnType: 'int' },
    'zip_entry_compressionmethod': { description: '返回压缩方法名（"Stored"/"Deflated"）', signature: 'zip_entry_compressionmethod(Resource $zip, int $index): string', params: [{ name: '$zip', description: 'ZIP 资源' }, { name: '$index', description: '条目索引' }], returnType: 'string' },
    'zip_entry_open': { description: '打开条目准备读取', signature: 'zip_entry_open(Resource $zip, int $index): bool', params: [{ name: '$zip', description: 'ZIP 资源' }, { name: '$index', description: '条目索引' }], returnType: 'bool' },
    'zip_entry_read': { description: '读取条目内容', signature: 'zip_entry_read(Resource $zip, int $index, int $length): string', params: [{ name: '$zip', description: 'ZIP 资源' }, { name: '$index', description: '条目索引' }, { name: '$length', description: '读取长度（0=全部）' }], returnType: 'string' },
    'zip_entry_close': { description: '关闭当前条目', signature: 'zip_entry_close(Resource $zip): bool', params: [{ name: '$zip', description: 'ZIP 资源' }], returnType: 'bool' },
    'zip_add_file': { description: '添加文件到 ZIP', signature: 'zip_add_file(Resource $zip, string $name, string $data, int $flags, int $comp_method): bool', params: [{ name: '$zip', description: 'ZIP 资源' }, { name: '$name', description: '条目名' }, { name: '$data', description: '文件内容' }, { name: '$flags', description: '标志位' }, { name: '$comp_method', description: '压缩方法（ZIP_CM_*）' }], returnType: 'bool' },
    'zip_add_dir': { description: '添加目录（以 / 结尾）', signature: 'zip_add_dir(Resource $zip, string $dirname, int $flags): bool', params: [{ name: '$zip', description: 'ZIP 资源' }, { name: '$dirname', description: '目录名' }, { name: '$flags', description: '标志位' }], returnType: 'bool' },
    'zip_delete': { description: '删除条目（不支持修改已有归档，抛异常）', signature: 'zip_delete(Resource $zip, int $index): bool', params: [{ name: '$zip', description: 'ZIP 资源' }, { name: '$index', description: '条目索引' }], returnType: 'bool' },
    'zip_rename': { description: '重命名条目（不支持修改已有归档，抛异常）', signature: 'zip_rename(Resource $zip, int $index, string $new_name): bool', params: [{ name: '$zip', description: 'ZIP 资源' }, { name: '$index', description: '条目索引' }, { name: '$new_name', description: '新名称' }], returnType: 'bool' },

    // ---- stream Socket Stream (跨平台, 需 #import stream) ----
    'stream_close': { description: '关闭 socket fd', signature: 'stream_close(int $fd): void', params: [{ name: '$fd', description: 'socket 文件描述符' }], returnType: 'void' },
    'stream_last_error': { description: '返回最后一次 socket 操作的错误码', signature: 'stream_last_error(): int', params: [], returnType: 'int' },
    'stream_strerror': { description: '根据错误码返回错误描述', signature: 'stream_strerror(int $err): string', params: [{ name: '$err', description: '错误码' }], returnType: 'string' },
    'stream_set_blocking': { description: '设置阻塞/非阻塞模式', signature: 'stream_set_blocking(int $fd, bool $enable): bool', params: [{ name: '$fd', description: '文件描述符' }, { name: '$enable', description: 'true=阻塞, false=非阻塞' }], returnType: 'bool' },
    'stream_set_read_buffer': { description: '设置读缓冲区大小', signature: 'stream_set_read_buffer(int $fd, int $buffer): int', params: [{ name: '$fd', description: '文件描述符' }, { name: '$buffer', description: '缓冲区大小' }], returnType: 'int' },
    'stream_set_write_buffer': { description: '设置写缓冲区大小', signature: 'stream_set_write_buffer(int $fd, int $buffer): int', params: [{ name: '$fd', description: '文件描述符' }, { name: '$buffer', description: '缓冲区大小' }], returnType: 'int' },
    'stream_set_timeout': { description: '设置读写超时', signature: 'stream_set_timeout(int $fd, int $seconds, int $microseconds): bool', params: [{ name: '$fd', description: '文件描述符' }, { name: '$seconds', description: '秒' }, { name: '$microseconds', description: '微秒' }], returnType: 'bool' },
    'stream_isatty': { description: '检查是否为终端', signature: 'stream_isatty(int $fd): bool', params: [{ name: '$fd', description: '文件描述符' }], returnType: 'bool' },
    'stream_select': { description: '多路复用等待（poll 风格）', signature: 'stream_select(array $read, array $write, array $except, int $tv_sec, int $tv_usec): int', params: [{ name: '$read', description: '可读 fd 数组' }, { name: '$write', description: '可写 fd 数组' }, { name: '$except', description: '异常 fd 数组' }, { name: '$tv_sec', description: '秒' }, { name: '$tv_usec', description: '微秒' }], returnType: 'int' },
    'stream_get_contents': { description: '读取全部内容', signature: 'stream_get_contents(int $fd, int $length, int $offset): string', params: [{ name: '$fd', description: '文件描述符' }, { name: '$length', description: '长度（-1=全部）' }, { name: '$offset', description: '偏移（-1=当前位置）' }], returnType: 'string' },
    'stream_get_line': { description: '读取一行（到指定结束符）', signature: 'stream_get_line(int $fd, int $length, string $ending): string', params: [{ name: '$fd', description: '文件描述符' }, { name: '$length', description: '最大长度' }, { name: '$ending', description: '结束符' }], returnType: 'string' },
    'stream_get_meta_data': { description: '返回流元数据数组', signature: 'stream_get_meta_data(int $fd): array', params: [{ name: '$fd', description: '文件描述符' }], returnType: 'array' },
    'stream_socket_server': { description: '创建服务端 socket', signature: 'stream_socket_server(int $domain, int $type, int $protocol): int', params: [{ name: '$domain', description: '协议族（STREAM_PF_*）' }, { name: '$type', description: 'socket 类型（STREAM_SOCK_*）' }, { name: '$protocol', description: '协议（STREAM_IPPROTO_*）' }], returnType: 'int' },
    'stream_socket_accept': { description: '接受客户端连接', signature: 'stream_socket_accept(int $server_fd): int', params: [{ name: '$server_fd', description: '服务端 fd' }], returnType: 'int' },
    'stream_socket_client': { description: '创建客户端 socket 并连接', signature: 'stream_socket_client(int $domain, int $type, int $protocol, string $addr, int $port): int', params: [{ name: '$domain', description: '协议族' }, { name: '$type', description: 'socket 类型' }, { name: '$protocol', description: '协议' }, { name: '$addr', description: '地址' }, { name: '$port', description: '端口' }], returnType: 'int' },
    'stream_socket_recvfrom': { description: '接收数据（UDP 或对端地址）', signature: 'stream_socket_recvfrom(int $fd, int $len, int $flags, string &$addr): string', params: [{ name: '$fd', description: '文件描述符' }, { name: '$len', description: '最大长度' }, { name: '$flags', description: '标志位' }, { name: '$addr', description: '对端地址（引用）' }], returnType: 'string' },
    'stream_socket_sendto': { description: '发送数据到指定地址', signature: 'stream_socket_sendto(int $fd, string $data, int $flags, string $addr, int $port): int', params: [{ name: '$fd', description: '文件描述符' }, { name: '$data', description: '数据' }, { name: '$flags', description: '标志位' }, { name: '$addr', description: '目标地址' }, { name: '$port', description: '目标端口' }], returnType: 'int' },
    'stream_socket_get_name': { description: '返回 socket 的本地或对端地址', signature: 'stream_socket_get_name(int $fd, bool $want_peer): string', params: [{ name: '$fd', description: '文件描述符' }, { name: '$want_peer', description: 'true=对端, false=本地' }], returnType: 'string' },
    'stream_socket_shutdown': { description: '关闭 socket 的读/写方向', signature: 'stream_socket_shutdown(int $fd, int $how): bool', params: [{ name: '$fd', description: '文件描述符' }, { name: '$how', description: '方向（STREAM_SHUT_*）' }], returnType: 'bool' },
    'stream_socket_enable_crypto': { description: '启用/禁用 TLS（需 openssl 扩展）', signature: 'stream_socket_enable_crypto(int $fd, int $enable, int $method): int', params: [{ name: '$fd', description: '文件描述符' }, { name: '$enable', description: 'STREAM_CRYPTO_ENABLE/DISABLE' }, { name: '$method', description: 'TLS 方法（STREAM_CRYPTO_METHOD_*）' }], returnType: 'int' },
    'stream_socket_pair': { description: '创建一对相互连接的 socket（用于进程间通信）', signature: 'stream_socket_pair(int $domain, int $type, int $protocol): array', params: [{ name: '$domain', description: '协议族' }, { name: '$type', description: 'socket 类型' }, { name: '$protocol', description: '协议' }], returnType: 'array' },

    // ---- openssl TLS/SSL (基于 mbedTLS 3.6.6, 当前暂停) ----
    'openssl_ctx_new': { description: '创建 SSL Context（需 openssl 扩展）', signature: 'openssl_ctx_new(): Resource', params: [], returnType: 'Resource' },
    'openssl_ctx_free': { description: '释放 SSL Context', signature: 'openssl_ctx_free(Resource $ctx): void', params: [{ name: '$ctx', description: 'SSL Context' }], returnType: 'void' },
    'openssl_ctx_use_certificate_file': { description: '加载证书文件到 Context', signature: 'openssl_ctx_use_certificate_file(Resource $ctx, string $file, int $type): bool', params: [{ name: '$ctx', description: 'Context' }, { name: '$file', description: '证书文件' }, { name: '$type', description: '文件类型（X509_FILETYPE_*）' }], returnType: 'bool' },
    'openssl_ctx_use_private_key_file': { description: '加载私钥文件到 Context', signature: 'openssl_ctx_use_private_key_file(Resource $ctx, string $file, int $type): bool', params: [{ name: '$ctx', description: 'Context' }, { name: '$file', description: '私钥文件' }, { name: '$type', description: '文件类型' }], returnType: 'bool' },
    'openssl_ctx_set_verify': { description: '设置验证模式', signature: 'openssl_ctx_set_verify(Resource $ctx, int $mode): void', params: [{ name: '$ctx', description: 'Context' }, { name: '$mode', description: '验证模式（SSL_VERIFY_*）' }], returnType: 'void' },
    'openssl_ctx_set_options': { description: '设置 SSL 选项', signature: 'openssl_ctx_set_options(Resource $ctx, int $options): void', params: [{ name: '$ctx', description: 'Context' }, { name: '$options', description: '选项（SSL_OP_*）' }], returnType: 'void' },
    'openssl_ssl_new': { description: '创建 SSL Connection', signature: 'openssl_ssl_new(Resource $ctx): Resource', params: [{ name: '$ctx', description: 'SSL Context' }], returnType: 'Resource' },
    'openssl_ssl_free': { description: '释放 SSL Connection', signature: 'openssl_ssl_free(Resource $ssl): void', params: [{ name: '$ssl', description: 'SSL Connection' }], returnType: 'void' },
    'openssl_ssl_set_fd': { description: '绑定 socket fd 到 SSL Connection', signature: 'openssl_ssl_set_fd(Resource $ssl, int $fd): bool', params: [{ name: '$ssl', description: 'SSL Connection' }, { name: '$fd', description: 'socket fd' }], returnType: 'bool' },
    'openssl_ssl_connect': { description: '客户端 TLS 握手', signature: 'openssl_ssl_connect(Resource $ssl): int', params: [{ name: '$ssl', description: 'SSL Connection' }], returnType: 'int' },
    'openssl_ssl_accept': { description: '服务端 TLS 握手', signature: 'openssl_ssl_accept(Resource $ssl): int', params: [{ name: '$ssl', description: 'SSL Connection' }], returnType: 'int' },
    'openssl_ssl_read': { description: 'TLS 加密读取', signature: 'openssl_ssl_read(Resource $ssl, int $length): string', params: [{ name: '$ssl', description: 'SSL Connection' }, { name: '$length', description: '最大长度' }], returnType: 'string' },
    'openssl_ssl_write': { description: 'TLS 加密写入', signature: 'openssl_ssl_write(Resource $ssl, string $data): int', params: [{ name: '$ssl', description: 'SSL Connection' }, { name: '$data', description: '数据' }], returnType: 'int' },
    'openssl_ssl_shutdown': { description: 'TLS 关闭握手', signature: 'openssl_ssl_shutdown(Resource $ssl): int', params: [{ name: '$ssl', description: 'SSL Connection' }], returnType: 'int' },
    'openssl_ssl_get_cipher_name': { description: '返回当前使用的加密套件名', signature: 'openssl_ssl_get_cipher_name(Resource $ssl): string', params: [{ name: '$ssl', description: 'SSL Connection' }], returnType: 'string' },
    'openssl_ssl_get_version': { description: '返回 TLS 版本', signature: 'openssl_ssl_get_version(Resource $ssl): string', params: [{ name: '$ssl', description: 'SSL Connection' }], returnType: 'string' },
    'openssl_error_string': { description: '返回最后一次 OpenSSL 错误描述', signature: 'openssl_error_string(): string', params: [], returnType: 'string' },
    'openssl_encrypt': { description: '对称加密', signature: 'openssl_encrypt(string $data, string $method, string $key, int $options, string $iv): string', params: [{ name: '$data', description: '明文' }, { name: '$method', description: '加密方法' }, { name: '$key', description: '密钥' }, { name: '$options', description: '选项（OPENSSL_*）' }, { name: '$iv', description: '初始向量' }], returnType: 'string' },
    'openssl_decrypt': { description: '对称解密', signature: 'openssl_decrypt(string $data, string $method, string $key, int $options, string $iv): string', params: [{ name: '$data', description: '密文' }, { name: '$method', description: '解密方法' }, { name: '$key', description: '密钥' }, { name: '$options', description: '选项' }, { name: '$iv', description: '初始向量' }], returnType: 'string' },
    'openssl_random_pseudo_bytes': { description: '生成密码学安全的随机字节', signature: 'openssl_random_pseudo_bytes(int $length): string', params: [{ name: '$length', description: '字节数' }], returnType: 'string' },
    'openssl_digest': { description: '计算摘要（哈希）', signature: 'openssl_digest(string $data, string $method, bool $raw_output): string', params: [{ name: '$data', description: '数据' }, { name: '$method', description: '摘要方法' }, { name: '$raw_output', description: '是否返回原始二进制' }], returnType: 'string' },

    // ---- 其他函数 ----
    'print_r': {
        description: '打印变量可读信息（无 $return 参数）',
        signature: 'print_r(mixed $value): void',
        params: [{ name: '$value', description: '要打印的值' }],
        returnType: 'void'
    },
    'strtr2': {
        description: '字符映射替换（从->到），逐字符替换',
        signature: 'strtr2(string $string, string $from, string $to): string',
        params: [
            { name: '$string', description: '目标字符串' },
            { name: '$from', description: '源字符集' },
            { name: '$to', description: '目标字符集' }
        ],
        returnType: 'string'
    },
};

// ============================================================================
// C 互操作函数文档（基于 FUNCTIONS.md）
// ============================================================================

const cInteropDocs: Record<string, string> = {
    'c_int': '**c_int(expr)** → int32_t (宏,零开销)\n将 PHP int 转换为 C int32_t',
    'c_float': '**c_float(expr)** → double (宏,零开销)\n将 PHP float 转换为 C double',
    'c_str': '**c_str(expr)** → const char* (static inline,STR_PTR 单次求值)\n将 PHP string 转换为 C 字符串指针',
    'c_void_ptr': '**c_void_ptr(expr)** → void* (宏,显式类型标记)\n透传任意指针类型',
    'php_int': '**php_int(expr)** → t_int (宏,零开销)\n将 C int 转换为 PHP int',
    'php_float': '**php_float(expr)** → t_float (宏,零开销)\n将 C double 转换为 PHP float',
    'php_str': '**php_str(expr)** → t_string (static inline,深拷贝)\n将 C 字符串（const char*）转换为 PHP string',
    'php_str_ptr': '**php_str_ptr(expr)** → t_string (宏,接受 void*)\n等价于 php_str',
    'php_str_clone': '**php_str_clone(expr)** → t_string (宏,深拷贝)\n同 php_str,语义化命名',
    'phpc_arr_int': '**phpc_arr_int(t_array*)** → int32_t* (malloc)\n数组 → C int 数组；类型不匹配抛 tp_throw',
    'phpc_arr_dbl': '**phpc_arr_dbl(t_array*)** → double* (malloc)\n数组 → C double 数组；类型不匹配抛 tp_throw',
    'phpc_arr_str': '**phpc_arr_str(t_array*)** → char** (malloc)\n数组 → C 字符串数组；类型不匹配抛 tp_throw',
    'phpc_new_arr_int': '**phpc_new_arr_int(ptr, len)** → t_array*\nC int 数组 → PHP 数组',
    'phpc_new_arr_dbl': '**phpc_new_arr_dbl(ptr, len)** → t_array*\nC double 数组 → PHP 数组',
    'phpc_new_arr_str': '**phpc_new_arr_str(ptr, len)** → t_array*\nC 字符串数组 → PHP 数组',
    'phpc_new_arr': '**phpc_new_arr()** → t_array*\n创建空 PHP 数组',
    'phpc_obj': '**phpc_obj(t_object*)** → void* (借用语义)\n获取对象原始指针',
    'phpc_new_obj': '**phpc_new_obj(ptr, cls)** → t_object* (接管语义)\n包装 C 指针为对象（接管所有权）',
    'phpc_unregister_obj': '**phpc_unregister_obj(obj)** → void\n解除注册，防 double-free',
    'phpc_obj_steal': '**phpc_obj_steal(obj)** → void\n标记分离，C 库可安全 free',
    'phpc_fn': '**phpc_fn(cb)** → void*\n获取回调函数指针',
    'phpc_env': '**phpc_env(cb)** → void*\n获取回调环境指针',
    'phpc_fn_i32': '**phpc_fn_i32(cb)** → int32_t(*)(int32_t, void*)\n获取 int32_t 签名回调',
    'phpc_fn_i64': '**phpc_fn_i64(cb)** → int64_t(*)(int64_t, void*)\n获取 int64_t 签名回调',
    'phpc_fn_f64': '**phpc_fn_f64(cb)** → double(*)(double, void*)\n获取 double 签名回调',
    'phpc_thunk': '**phpc_thunk(name, cb)** → void\n按 #callback 签名生成 thunk',
    'phpc_env_pin': '**phpc_env_pin(cb)** → void*\n固定 env，异步回调安全',
    'phpc_env_unpin': '**phpc_env_unpin(env)** → void\n解除固定',
    'phpc_auto': '**phpc_auto(ptr)** → void* (通用 C 指针自动注册)\n程序结束/异常自动 free',
    'phpc_free': '**phpc_free(ptr)** → void\nfree(ptr) + 注销注册防 double-free + 自动置零变量防 UAF',
    'phpc_free_str_arr': '**phpc_free_str_arr(p, len)** → void\n释放字符串数组 + 自动置零',
    'phpc_assert_ptr': '**phpc_assert_ptr(p, name)** → void\n断言非 NULL，否则抛 tp_throw',
    'phpc_ptr_to_int': '**phpc_ptr_to_int(ptr)** → t_int\nvoid* → t_int (用 intptr_t 保证可移植性)',
    'phpc_int_to_ptr': '**phpc_int_to_ptr(v)** → void*\nt_int → void* (函数内部转回调用 C 库)',
    'defer': '**defer EXPR;** / **defer echo STMT;** / **defer { ... }** — Zig 风格作用域清理\n\n注册清理代码，在函数退出时按 LIFO（后进先出）顺序执行。\n\n**函数级作用域**：PHP 无块作用域，defer 为函数级（非块级）。所有 defer 在函数退出时统一执行。\n**编译期展开**：defer 代码在编译期展开到所有 `return` 点和 fall-through 尾部，**零运行时开销**。\n**return 路径**：先求值 return 表达式到临时变量 `__defer_ret`，执行 defer 清理，再返回临时变量（避免 use-after-free）。\n**异常路径限制**：`try-catch` 的 `longjmp` 路径**不执行** defer。如需异常路径清理，请在 `finally` 块中手动处理。\n\n**典型用途**：\n- C 指针释放：`defer C->free($buf);`\n- 资源关闭：`defer C->fclose($fp);`\n- 调试输出：`defer echo "exit\\n";`\n- 多语句清理：`defer { C->free($a); C->free($b); }`',
};

// ============================================================================
// 预处理器指令文档
// ============================================================================

const preprocessorDocs: Record<string, string> = {
    '#include': '**#include [OS] "file.h"** 或 **#include [OS] <sys.h>**\n\n嵌入 C 头文件到生成的 C 代码中。\n\n**可选平台前缀**: `Windows`, `Linux`, `MacOS`, `Darwin`\n\n示例:\n- `#include "common.h"` — 所有平台\n- `#include Windows "win.h"` — 仅 Windows\n- `#include Linux <sys/io.h>` — 仅 Linux',
    '#flag': '**#flag [GCC|Clang|TCC] [Windows|Linux|MacOS|Darwin] -D... -l...**\n\n编译器/平台过滤的编译和链接标志。最多两个前缀（编译器+平台，顺序不限）。\n\n示例:\n- `#flag -O2 -lm` — 所有平台\n- `#flag GCC -D_GNU_SOURCE` — 仅 GCC\n- `#flag Clang Linux -fsanitize=address` — Clang + Linux',
    '#callback': '**#callback ret_type name(params)**\n声明 C 回调函数签名，供 `phpc_thunk` 生成 thunk 使用。\n\n示例: `#callback void on_event(int $code)`',
    '#import': '**#import name**\n按需引入扩展（自动加载 ext/name/src/*.php + *.c）\n\n**可用扩展**: `pcntl` (POSIX 进程控制), `posix` (POSIX 系统), `pcre` (正则表达式), `exif` (EXIF 元数据)\n\n示例: `#import pcntl`',
    '#cstruct': '**#cstruct Name { C.type field; ... }**\n声明 C 结构体字段布局。`$p->field` 编译期展开为 `((Name*)$p)->field`，无需 C getter/setter。\n\n**字段格式**: `C.type name` 或 `StructName name`（嵌套值类型）\n\n示例:\n```\n#cstruct Point {\n    C.double x;\n    C.double y;\n}\n```',
    '#debug': '**#debug text**\n仅在 --debug 模式下输出（用于测试预期输出）\n\n`#debug ~ text` — 近似匹配（时间/时区相关）',
    '#if': '**#if condition**\n\n条件编译开始。条件表达式支持 `!`、`&&`、`||`、`()` 组合和标识符（大小写不敏感）。\n\n**标识符**: `Windows`/`Win`/`Linux`/`MacOS`/`Darwin`/`Mac` (OS)、`TCC`/`TinyC`/`GCC`/`Clang` (编译器)、`x86_64`/`amd64`/`x64`/`aarch64`/`arm64` (架构)、`debug`/`prod` (模式)。未知标识符视为 `false`。\n\n可出现在**顶层**（包裹 #include/#flag/#callback/#cstruct/class/function/const/enum）和**函数体内**（包裹任意语句）。非命中分支的 token 直接跳过（不解析、不类型检查、不生成 C 代码），与 V 语言 `$if` 默认行为一致。',
    '#elseif': '**#elseif condition**\n\n条件编译分支（别名 `#elif`）。与 `#if` 配合使用，条件表达式语法同 `#if`。',
    '#else': '**#else**\n\n条件编译 else 分支。与 `#if` / `#elseif` 配合使用。',
    '#endif': '**#endif**\n\n条件编译结束标记。每个 `#if` 必须有对应的 `#endif`。',
};

// ============================================================================
// C 类型注解文档（C.Type 命名空间，借鉴 vlang 设计）
// ============================================================================

const cTypeDocs: Record<string, string> = {
    'C.int': '**C.int** → `int`\nC int 类型注解',
    'C.double': '**C.double** → `double`\nC double 类型注解',
    'C.float': '**C.float** → `float`\nC float 类型注解',
    'C.char': '**C.char** → `char`\nC char 类型注解',
    'C.bool': '**C.bool** → `bool`\nC bool 类型注解',
    'C.void': '**C.void** → `void`\nC void 类型注解',
    'C.int8': '**C.int8** → `int8_t`\n8 位有符号整数',
    'C.int16': '**C.int16** → `int16_t`\n16 位有符号整数',
    'C.int32': '**C.int32** → `int32_t`\n32 位有符号整数',
    'C.int64': '**C.int64** → `int64_t`\n64 位有符号整数',
    'C.uint8': '**C.uint8** → `uint8_t`\n8 位无符号整数',
    'C.uint16': '**C.uint16** → `uint16_t`\n16 位无符号整数',
    'C.uint32': '**C.uint32** → `uint32_t`\n32 位无符号整数',
    'C.uint64': '**C.uint64** → `uint64_t`\n64 位无符号整数',
    'C.size_t': '**C.size_t** → `size_t`\nC size_t 类型',
    'C.void*': '**C.void*** → `void*`\nC void 指针（用 * 后缀表示指针）',
    'C.char*': '**C.char*** → `char*`\nC 字符串指针',
    'C.int*': '**C.int*** → `int*`\nC int 指针',
};

// ============================================================================
// TinyPHP 扩展常量文档（基于 FUNCTIONS.md 各扩展常量表）
// ============================================================================

interface ConstantDoc {
    description: string;
    value: string;      // 值的字符串表示（用于 Hover 显示）
    category: string;   // 分类
}

const constantDocs: Record<string, ConstantDoc> = {
    // ---- Filter 常量 ----
    'FILTER_VALIDATE_INT': { value: '257', description: '验证 int', category: 'Filter' },
    'FILTER_VALIDATE_BOOL': { value: '258', description: '验证 bool', category: 'Filter' },
    'FILTER_VALIDATE_FLOAT': { value: '259', description: '验证 float', category: 'Filter' },
    'FILTER_VALIDATE_REGEXP': { value: '272', description: '验证正则表达式', category: 'Filter' },
    'FILTER_VALIDATE_URL': { value: '273', description: '验证 URL', category: 'Filter' },
    'FILTER_VALIDATE_EMAIL': { value: '274', description: '验证 email', category: 'Filter' },
    'FILTER_VALIDATE_IP': { value: '275', description: '验证 IP 地址', category: 'Filter' },
    'FILTER_VALIDATE_MAC': { value: '276', description: '验证 MAC 地址', category: 'Filter' },
    'FILTER_VALIDATE_DOMAIN': { value: '277', description: '验证域名', category: 'Filter' },
    'FILTER_SANITIZE_STRING': { value: '513', description: '净化字符串（去除标签）', category: 'Filter' },
    'FILTER_SANITIZE_ENCODED': { value: '514', description: 'URL 编码净化', category: 'Filter' },
    'FILTER_SANITIZE_SPECIAL_CHARS': { value: '515', description: '净化特殊字符', category: 'Filter' },
    'FILTER_SANITIZE_EMAIL': { value: '517', description: '净化 email（去除非法字符）', category: 'Filter' },
    'FILTER_SANITIZE_URL': { value: '518', description: '净化 URL', category: 'Filter' },
    'FILTER_SANITIZE_NUMBER_INT': { value: '519', description: '净化为整数（去除符号外字符）', category: 'Filter' },
    'FILTER_SANITIZE_NUMBER_FLOAT': { value: '520', description: '净化为浮点数', category: 'Filter' },
    'FILTER_SANITIZE_ADD_SLASHES': { value: '523', description: '添加斜杠转义', category: 'Filter' },
    'FILTER_SANITIZE_FULL_SPECIAL_CHARS': { value: '522', description: '净化全部特殊字符（等价 htmlspecialchars）', category: 'Filter' },
    'FILTER_FLAG_ALLOW_OCTAL': { value: '1', description: '允许八进制（配合 FILTER_VALIDATE_INT）', category: 'Filter' },
    'FILTER_FLAG_ALLOW_HEX': { value: '2', description: '允许十六进制（配合 FILTER_VALIDATE_INT）', category: 'Filter' },
    'FILTER_FLAG_STRIP_LOW': { value: '4', description: '去除 ASCII <32 字符', category: 'Filter' },
    'FILTER_FLAG_STRIP_HIGH': { value: '8', description: '去除 ASCII >127 字符', category: 'Filter' },
    'FILTER_FLAG_ENCODE_LOW': { value: '16', description: '编码 ASCII <32 字符', category: 'Filter' },
    'FILTER_FLAG_ENCODE_HIGH': { value: '32', description: '编码 ASCII >127 字符', category: 'Filter' },
    'FILTER_FLAG_ENCODE_AMP': { value: '64', description: '编码 & 为 &amp;', category: 'Filter' },
    'FILTER_FLAG_NO_ENCODE_QUOTES': { value: '128', description: '不编码引号', category: 'Filter' },
    'FILTER_FLAG_EMPTY_STRING_NULL': { value: '256', description: '空字符串返回 null', category: 'Filter' },
    'FILTER_FLAG_ALLOW_THOUSAND': { value: '8192', description: '允许千位分隔符', category: 'Filter' },
    'FILTER_FLAG_ALLOW_SCIENTIFIC': { value: '16384', description: '允许科学计数法', category: 'Filter' },
    'FILTER_FLAG_PATH_REQUIRED': { value: '0x100000', description: '要求 URL 含路径', category: 'Filter' },
    'FILTER_FLAG_QUERY_REQUIRED': { value: '0x200000', description: '要求 URL 含查询串', category: 'Filter' },
    'FILTER_FLAG_IPV4': { value: '0x100000', description: '仅 IPv4', category: 'Filter' },
    'FILTER_FLAG_IPV6': { value: '0x200000', description: '仅 IPv6', category: 'Filter' },

    // ---- Pcre 常量 ----
    'PREG_PATTERN_ORDER': { value: '1', description: '结果按模式排序（preg_match_all）', category: 'Pcre' },
    'PREG_SET_ORDER': { value: '2', description: '结果按匹配排序（preg_match_all）', category: 'Pcre' },
    'PREG_SPLIT_NO_EMPTY': { value: '1', description: 'preg_split 仅返回非空片段', category: 'Pcre' },
    'PREG_SPLIT_DELIM_CAPTURE': { value: '2', description: 'preg_split 捕获分隔符', category: 'Pcre' },
    'PREG_GREP_INVERT': { value: '1', description: 'preg_grep 返回不匹配项', category: 'Pcre' },
    'PREG_NO_ERROR': { value: '0', description: '无错误', category: 'Pcre' },
    'PREG_INTERNAL_ERROR': { value: '1', description: '内部错误', category: 'Pcre' },
    'PREG_BACKTRACK_LIMIT_ERROR': { value: '2', description: '回溯上限错误', category: 'Pcre' },
    'PREG_RECURSION_LIMIT_ERROR': { value: '3', description: '递归上限错误', category: 'Pcre' },

    // ---- Zlib 常量 — 编码格式 ----
    'ZLIB_ENCODING_RAW': { value: '-15', description: '原始 DEFLATE（RFC 1951）', category: 'Zlib' },
    'ZLIB_ENCODING_GZIP': { value: '31', description: 'gzip 格式（RFC 1952）', category: 'Zlib' },
    'ZLIB_ENCODING_DEFLATE': { value: '15', description: 'zlib 格式（RFC 1950）', category: 'Zlib' },
    'FORCE_GZIP': { value: '31', description: 'ZLIB_ENCODING_GZIP 别名', category: 'Zlib' },
    'FORCE_DEFLATE': { value: '15', description: 'ZLIB_ENCODING_DEFLATE 别名', category: 'Zlib' },
    // ---- Zlib 常量 — 压缩级别 ----
    'ZLIB_NO_COMPRESSION': { value: '0', description: '不压缩', category: 'Zlib' },
    'ZLIB_BEST_SPEED': { value: '1', description: '最快速度', category: 'Zlib' },
    'ZLIB_BEST_COMPRESSION': { value: '9', description: '最小体积', category: 'Zlib' },
    'ZLIB_DEFAULT_COMPRESSION': { value: '-1', description: '默认级别（=6）', category: 'Zlib' },
    // ---- Zlib 常量 — flush 模式 ----
    'ZLIB_NO_FLUSH': { value: '0', description: '不刷新', category: 'Zlib' },
    'ZLIB_PARTIAL_FLUSH': { value: '1', description: '部分刷新', category: 'Zlib' },
    'ZLIB_SYNC_FLUSH': { value: '2', description: '同步刷新（deflate_add/inflate_add 默认）', category: 'Zlib' },
    'ZLIB_FULL_FLUSH': { value: '3', description: '完全刷新', category: 'Zlib' },
    'ZLIB_FINISH': { value: '4', description: '结束输入', category: 'Zlib' },
    'ZLIB_BLOCK': { value: '5', description: '块模式', category: 'Zlib' },
    // ---- Zlib 常量 — 压缩策略 ----
    'ZLIB_FILTERED': { value: '1', description: '过滤策略', category: 'Zlib' },
    'ZLIB_HUFFMAN_ONLY': { value: '2', description: '仅 Huffman', category: 'Zlib' },
    'ZLIB_RLE': { value: '3', description: 'RLE 策略', category: 'Zlib' },
    'ZLIB_FIXED': { value: '4', description: '固定 Huffman', category: 'Zlib' },
    'ZLIB_DEFAULT_STRATEGY': { value: '0', description: '默认策略', category: 'Zlib' },
    // ---- Zlib 常量 — 状态码 ----
    'ZLIB_OK': { value: '0', description: '成功', category: 'Zlib' },
    'ZLIB_STREAM_END': { value: '1', description: '流结束', category: 'Zlib' },
    'ZLIB_NEED_DICT': { value: '2', description: '需要字典', category: 'Zlib' },
    'ZLIB_ERRNO': { value: '-1', description: '系统错误', category: 'Zlib' },
    'ZLIB_STREAM_ERROR': { value: '-2', description: '流错误', category: 'Zlib' },
    'ZLIB_DATA_ERROR': { value: '-3', description: '数据错误', category: 'Zlib' },
    'ZLIB_MEM_ERROR': { value: '-4', description: '内存错误', category: 'Zlib' },
    'ZLIB_BUF_ERROR': { value: '-5', description: '缓冲区错误', category: 'Zlib' },
    'ZLIB_VERSION_ERROR': { value: '-6', description: '版本不兼容', category: 'Zlib' },
    // ---- Zlib 常量 — 其他 ----
    'ZLIB_VERSION': { value: '"1.3.2"', description: 'zlib 版本字符串', category: 'Zlib' },
    'ZLIB_VERNUM': { value: '0x1320', description: 'zlib 版本号', category: 'Zlib' },

    // ---- Zip 常量 — 打开模式 ----
    'ZIP_CREATE': { value: '1', description: '创建新文件', category: 'Zip' },
    'ZIP_EXCL': { value: '2', description: '排他创建（存在则失败）', category: 'Zip' },
    'ZIP_CHECKCONS': { value: '4', description: '检查一致性', category: 'Zip' },
    'ZIP_TRUNCATE': { value: '8', description: '截断（覆盖）', category: 'Zip' },
    'ZIP_RDONLY': { value: '16', description: '只读', category: 'Zip' },
    // ---- Zip 常量 — 标志位 ----
    'ZIP_FL_OVERWRITE': { value: '1', description: '覆盖现有文件', category: 'Zip' },
    'ZIP_FL_NOCASE': { value: '2', description: '不区分大小写', category: 'Zip' },
    'ZIP_FL_NODIR': { value: '4', description: '不为目录创建条目', category: 'Zip' },
    'ZIP_FL_COMPRESSED': { value: '8', description: '读取压缩数据', category: 'Zip' },
    'ZIP_FL_UNCHANGED': { value: '16', description: '使用原始数据', category: 'Zip' },
    // ---- Zip 常量 — 压缩方法 ----
    'ZIP_CM_DEFAULT': { value: '-1', description: '默认压缩方法', category: 'Zip' },
    'ZIP_CM_STORE': { value: '0', description: '不压缩（Stored）', category: 'Zip' },
    'ZIP_CM_DEFLATE': { value: '8', description: 'DEFLATE 压缩', category: 'Zip' },

    // ---- Stream 常量 — Socket 类型 ----
    'STREAM_SOCK_STREAM': { value: '1', description: 'TCP 流 socket', category: 'Stream' },
    'STREAM_SOCK_DGRAM': { value: '2', description: 'UDP 数据报 socket', category: 'Stream' },
    'STREAM_SOCK_RAW': { value: '3', description: '原始 socket', category: 'Stream' },
    'STREAM_SOCK_RDM': { value: '4', description: '可靠数据报', category: 'Stream' },
    'STREAM_SOCK_SEQPACKET': { value: '5', description: '顺序包 socket', category: 'Stream' },
    // ---- Stream 常量 — 协议族 ----
    'STREAM_PF_INET': { value: '2', description: 'IPv4', category: 'Stream' },
    'STREAM_PF_INET6': { value: '10', description: 'IPv6', category: 'Stream' },
    'STREAM_PF_UNIX': { value: '1', description: 'Unix 域 socket', category: 'Stream' },
    // ---- Stream 常量 — IP 协议 ----
    'STREAM_IPPROTO_IP': { value: '0', description: 'IP 协议', category: 'Stream' },
    'STREAM_IPPROTO_TCP': { value: '6', description: 'TCP', category: 'Stream' },
    'STREAM_IPPROTO_UDP': { value: '17', description: 'UDP', category: 'Stream' },
    'STREAM_IPPROTO_ICMP': { value: '1', description: 'ICMP', category: 'Stream' },
    'STREAM_IPPROTO_RAW': { value: '255', description: '原始 IP', category: 'Stream' },
    // ---- Stream 常量 — Crypto (TLS) ----
    'STREAM_CRYPTO_METHOD_TLS_CLIENT': { value: '57', description: 'TLS 客户端（任意版本）', category: 'Stream' },
    'STREAM_CRYPTO_METHOD_TLS_SERVER': { value: '56', description: 'TLS 服务端（任意版本）', category: 'Stream' },
    'STREAM_CRYPTO_METHOD_SSLv2_CLIENT': { value: '0', description: 'SSLv2 客户端（已废弃）', category: 'Stream' },
    'STREAM_CRYPTO_METHOD_SSLv3_CLIENT': { value: '0', description: 'SSLv3 客户端（已废弃）', category: 'Stream' },
    'STREAM_CRYPTO_METHOD_SSLv23_CLIENT': { value: '57', description: 'SSLv23 客户端（TLS 别名）', category: 'Stream' },
    'STREAM_CRYPTO_METHOD_SSLv2_SERVER': { value: '0', description: 'SSLv2 服务端（已废弃）', category: 'Stream' },
    'STREAM_CRYPTO_METHOD_SSLv3_SERVER': { value: '0', description: 'SSLv3 服务端（已废弃）', category: 'Stream' },
    'STREAM_CRYPTO_METHOD_SSLv23_SERVER': { value: '56', description: 'SSLv23 服务端（TLS 别名）', category: 'Stream' },
    'STREAM_CRYPTO_PROTO_TLSv1_0': { value: '1', description: 'TLS 1.0', category: 'Stream' },
    'STREAM_CRYPTO_PROTO_TLSv1_1': { value: '2', description: 'TLS 1.1', category: 'Stream' },
    'STREAM_CRYPTO_PROTO_TLSv1_2': { value: '4', description: 'TLS 1.2', category: 'Stream' },
    'STREAM_CRYPTO_PROTO_TLSv1_3': { value: '8', description: 'TLS 1.3', category: 'Stream' },
    'STREAM_CRYPTO_ENABLE': { value: '1', description: '启用 TLS', category: 'Stream' },
    'STREAM_CRYPTO_DISABLE': { value: '0', description: '禁用 TLS', category: 'Stream' },
    // ---- Stream 常量 — shutdown 模式 ----
    'STREAM_SHUT_RD': { value: '0', description: '关闭读方向', category: 'Stream' },
    'STREAM_SHUT_WR': { value: '1', description: '关闭写方向', category: 'Stream' },
    'STREAM_SHUT_RDWR': { value: '2', description: '关闭读写方向', category: 'Stream' },

    // ---- OpenSSL 常量 — SSL 选项 ----
    'SSL_OP_NO_SSLv2': { value: '0x01000000', description: '禁用 SSLv2', category: 'OpenSSL' },
    'SSL_OP_NO_SSLv3': { value: '0x02000000', description: '禁用 SSLv3', category: 'OpenSSL' },
    'SSL_OP_NO_TLSv1': { value: '0x04000000', description: '禁用 TLSv1.0', category: 'OpenSSL' },
    'SSL_OP_NO_TLSv1_1': { value: '0x10000000', description: '禁用 TLSv1.1', category: 'OpenSSL' },
    'SSL_OP_NO_TLSv1_2': { value: '0x08000000', description: '禁用 TLSv1.2', category: 'OpenSSL' },
    'SSL_OP_NO_TLSv1_3': { value: '0x20000000', description: '禁用 TLSv1.3', category: 'OpenSSL' },
    'SSL_OP_NO_COMPRESSION': { value: '0x00020000', description: '禁用压缩', category: 'OpenSSL' },
    'SSL_OP_SINGLE_DH_USE': { value: '0x00100000', description: '单次 DH 使用', category: 'OpenSSL' },
    // ---- OpenSSL 常量 — 验证模式 ----
    'SSL_VERIFY_NONE': { value: '0x00', description: '不验证', category: 'OpenSSL' },
    'SSL_VERIFY_PEER': { value: '0x01', description: '验证对端证书', category: 'OpenSSL' },
    'SSL_VERIFY_FAIL_IF_NO_PEER_CERT': { value: '0x02', description: '无证书则失败', category: 'OpenSSL' },
    // ---- OpenSSL 常量 — 文件/密钥类型 ----
    'X509_FILETYPE_PEM': { value: '1', description: 'PEM 格式', category: 'OpenSSL' },
    'X509_FILETYPE_ASN1': { value: '2', description: 'ASN1 格式', category: 'OpenSSL' },
    'X509_FILETYPE_DEFAULT': { value: '3', description: '默认格式', category: 'OpenSSL' },
    'SSL_FILETYPE_PEM': { value: '1', description: 'PEM 密钥格式', category: 'OpenSSL' },
    'SSL_FILETYPE_ASN1': { value: '2', description: 'ASN1 密钥格式', category: 'OpenSSL' },
    // ---- OpenSSL 常量 — 加密算法 ----
    'OPENSSL_DUMMY_ALGO': { value: '0', description: '无算法（占位）', category: 'OpenSSL' },
    'OPENSSL_RAW_DATA': { value: '1', description: '原始数据（不做 base64）', category: 'OpenSSL' },
    'OPENSSL_ZERO_PADDING': { value: '2', description: '零填充', category: 'OpenSSL' },

    // ---- Calendar 常量 ----
    'CAL_GREGORIAN': { value: '0', description: '公历（Gregorian）', category: 'Calendar' },
    'CAL_JULIAN': { value: '1', description: '儒略历（Julian）', category: 'Calendar' },
    'CAL_JEWISH': { value: '2', description: '犹太历（Jewish/Hebrew）', category: 'Calendar' },
    'CAL_FRENCH': { value: '3', description: '法国共和历', category: 'Calendar' },
    'CAL_JEWISH_ADD_ALAFIM_GERESH': { value: '4', description: '犹太历添加 Alafim Geresh', category: 'Calendar' },
    'CAL_NUM_CALS': { value: '4', description: '日历类型数量', category: 'Calendar' },
    'CAL_EASTER_DEFAULT': { value: '0', description: '默认复活节算法', category: 'Calendar' },
    'CAL_EASTER_ROMAN': { value: '1', description: '罗马复活节算法', category: 'Calendar' },
    'CAL_EASTER_ALWAYS_GREGORIAN': { value: '2', description: '始终用公历算复活节', category: 'Calendar' },
    'CAL_EASTER_ALWAYS_JULIAN': { value: '3', description: '始终用儒略历算复活节', category: 'Calendar' },

    // ---- Exif 常量 — 图像类型 ----
    'IMAGETYPE_GIF': { value: '1', description: 'GIF 图像', category: 'Exif' },
    'IMAGETYPE_JPEG': { value: '2', description: 'JPEG 图像', category: 'Exif' },
    'IMAGETYPE_PNG': { value: '3', description: 'PNG 图像', category: 'Exif' },
    'IMAGETYPE_BMP': { value: '6', description: 'BMP 图像', category: 'Exif' },
    'IMAGETYPE_TIFF_II': { value: '7', description: 'TIFF（Intel 字节序）', category: 'Exif' },
    'IMAGETYPE_TIFF_MM': { value: '8', description: 'TIFF（Motorola 字节序）', category: 'Exif' },
    'IMAGETYPE_WEBP': { value: '18', description: 'WebP 图像', category: 'Exif' },
    // ---- Exif 常量 — EXIF 数据类型 ----
    'EXIF_TYPE_BYTE': { value: '1', description: 'BYTE 类型', category: 'Exif' },
    'EXIF_TYPE_ASCII': { value: '2', description: 'ASCII 类型', category: 'Exif' },
    'EXIF_TYPE_SHORT': { value: '3', description: 'SHORT 类型', category: 'Exif' },
    'EXIF_TYPE_LONG': { value: '4', description: 'LONG 类型', category: 'Exif' },
    'EXIF_TYPE_RATIONAL': { value: '5', description: 'RATIONAL 类型', category: 'Exif' },
    'EXIF_TYPE_UNDEFINED': { value: '7', description: 'UNDEFINED 类型', category: 'Exif' },
    'EXIF_TYPE_SLONG': { value: '9', description: 'SLONG 类型', category: 'Exif' },
    'EXIF_TYPE_SRATIONAL': { value: '10', description: 'SRATIONAL 类型', category: 'Exif' },

    // ---- Fileinfo 常量 ----
    'FILEINFO_NONE': { value: '0', description: '无特殊标志', category: 'Fileinfo' },
    'FILEINFO_SYMLINK': { value: '2', description: '跟随符号链接', category: 'Fileinfo' },
    'FILEINFO_DEVICES': { value: '8', description: '检测设备文件', category: 'Fileinfo' },
    'FILEINFO_MIME_TYPE': { value: '16', description: '返回 MIME 类型', category: 'Fileinfo' },
    'FILEINFO_CONTINUE': { value: '32', description: '返回全部匹配（不止第一个）', category: 'Fileinfo' },
    'FILEINFO_PRESERVE_ATIME': { value: '128', description: '保留 atime', category: 'Fileinfo' },
    'FILEINFO_RAW': { value: '256', description: '返回原始值（不做净化）', category: 'Fileinfo' },
    'FILEINFO_MIME_ENCODING': { value: '1024', description: '返回 MIME 编码', category: 'Fileinfo' },
    'FILEINFO_MIME': { value: '1040', description: '返回 MIME 类型+编码', category: 'Fileinfo' },
    'FILEINFO_EXTENSION': { value: '16777216', description: '返回文件扩展名', category: 'Fileinfo' },

    // ---- Iconv 常量 ----
    'ICONV_IMPL': { value: '"iconv"', description: 'iconv 实现名称', category: 'Iconv' },
    'ICONV_VERSION': { value: '"1.0"', description: 'iconv 版本', category: 'Iconv' },

    // ---- Seek 常量（用于 gzseek） ----
    'SEEK_SET': { value: '0', description: '从文件头定位', category: 'Seek' },
    'SEEK_CUR': { value: '1', description: '从当前位置定位', category: 'Seek' },
    'SEEK_END': { value: '2', description: '从文件尾定位', category: 'Seek' },
};

// ============================================================================
// TinyPHP 类方法文档（基于 FUNCTIONS.md + GRAMMAR.md §14.4）
// ============================================================================

interface ClassMethodDoc {
    className: string;
    methodName: string;
    description: string;
    signature: string;
    params: { name: string; description: string }[];
    returnType: string;
    isStatic: boolean;
    isProperty: boolean;  // true 表示是属性而非方法
}

const classMethodDocs: ClassMethodDoc[] = [
    // ---- Generator 类方法 ----
    { className: 'Generator', methodName: 'current', description: '返回当前 yield 的值', signature: 'current(): mixed', params: [], returnType: 'mixed', isStatic: false, isProperty: false },
    { className: 'Generator', methodName: 'key', description: '返回当前 yield 的键', signature: 'key(): mixed', params: [], returnType: 'mixed', isStatic: false, isProperty: false },
    { className: 'Generator', methodName: 'next', description: '推进生成器到下一个 yield', signature: 'next(): void', params: [], returnType: 'void', isStatic: false, isProperty: false },
    { className: 'Generator', methodName: 'send', description: '向生成器发送值并推进到下一个 yield，返回 yield 的值', signature: 'send(mixed $value): mixed', params: [{ name: '$value', description: '发送给生成器的值（作为上一个 yield 表达式的结果）' }], returnType: 'mixed', isStatic: false, isProperty: false },
    { className: 'Generator', methodName: 'valid', description: '检查生成器是否还有更多值', signature: 'valid(): bool', params: [], returnType: 'bool', isStatic: false, isProperty: false },
    { className: 'Generator', methodName: 'getReturn', description: '返回生成器的 return 值（生成器结束后可用）', signature: 'getReturn(): mixed', params: [], returnType: 'mixed', isStatic: false, isProperty: false },
    { className: 'Generator', methodName: 'rewind', description: '倒回生成器到第一个 yield（仅在未启动时可用）', signature: 'rewind(): void', params: [], returnType: 'void', isStatic: false, isProperty: false },

    // ---- Thread 类方法 ----
    { className: 'Thread', methodName: '__construct', description: '创建线程，传入线程函数（闭包）', signature: '__construct(callable $fn)', params: [{ name: '$fn', description: '线程执行的闭包' }], returnType: '', isStatic: false, isProperty: false },
    { className: 'Thread', methodName: 'start', description: '启动线程', signature: 'start(): bool', params: [], returnType: 'bool', isStatic: false, isProperty: false },
    { className: 'Thread', methodName: 'join', description: '等待线程结束并回收资源', signature: 'join(): int', params: [], returnType: 'int', isStatic: false, isProperty: false },
    { className: 'Thread', methodName: 'detach', description: '分离线程（不再可 join）', signature: 'detach(): bool', params: [], returnType: 'bool', isStatic: false, isProperty: false },
    { className: 'Thread', methodName: 'yield', description: '让出 CPU 时间片（静态方法）', signature: 'static yield(): void', params: [], returnType: 'void', isStatic: true, isProperty: false },
    { className: 'Thread', methodName: 'sleep', description: '当前线程休眠指定秒数（静态方法）', signature: 'static sleep(float $seconds): void', params: [{ name: '$seconds', description: '休眠秒数（支持小数）' }], returnType: 'void', isStatic: true, isProperty: false },
    { className: 'Thread', methodName: 'id', description: '返回当前线程 ID（静态方法）', signature: 'static id(): int', params: [], returnType: 'int', isStatic: true, isProperty: false },

    // ---- Mutex 类方法 ----
    { className: 'Mutex', methodName: '__construct', description: '创建互斥锁', signature: '__construct(bool $recursive = false)', params: [{ name: '$recursive', description: '是否允许递归加锁（同线程多次 lock）' }], returnType: '', isStatic: false, isProperty: false },
    { className: 'Mutex', methodName: 'lock', description: '加锁（阻塞直到获取）', signature: 'lock(): bool', params: [], returnType: 'bool', isStatic: false, isProperty: false },
    { className: 'Mutex', methodName: 'tryLock', description: '尝试加锁（非阻塞，失败返回 false）', signature: 'tryLock(): bool', params: [], returnType: 'bool', isStatic: false, isProperty: false },
    { className: 'Mutex', methodName: 'unlock', description: '解锁', signature: 'unlock(): bool', params: [], returnType: 'bool', isStatic: false, isProperty: false },

    // ---- CondVar 类方法 ----
    { className: 'CondVar', methodName: '__construct', description: '创建条件变量', signature: '__construct()', params: [], returnType: '', isStatic: false, isProperty: false },
    { className: 'CondVar', methodName: 'wait', description: '等待条件变量（需先持有 Mutex，调用时释放 Mutex，被唤醒时重新获取）', signature: 'wait(Mutex $m): bool', params: [{ name: '$m', description: '关联的 Mutex（调用时释放，返回时重新获取）' }], returnType: 'bool', isStatic: false, isProperty: false },
    { className: 'CondVar', methodName: 'signal', description: '唤醒一个等待的线程', signature: 'signal(): bool', params: [], returnType: 'bool', isStatic: false, isProperty: false },
    { className: 'CondVar', methodName: 'broadcast', description: '唤醒所有等待的线程', signature: 'broadcast(): bool', params: [], returnType: 'bool', isStatic: false, isProperty: false },

    // ---- WaitGroup 类方法 ----
    { className: 'WaitGroup', methodName: '__construct', description: '创建 WaitGroup（类似 Go）', signature: '__construct()', params: [], returnType: '', isStatic: false, isProperty: false },
    { className: 'WaitGroup', methodName: 'add', description: '增加等待计数', signature: 'add(int $delta): void', params: [{ name: '$delta', description: '计数增量（通常为 1，可为负表示完成）' }], returnType: 'void', isStatic: false, isProperty: false },
    { className: 'WaitGroup', methodName: 'done', description: '标记一个等待完成（计数减 1）', signature: 'done(): void', params: [], returnType: 'void', isStatic: false, isProperty: false },
    { className: 'WaitGroup', methodName: 'wait', description: '阻塞直到计数归零', signature: 'wait(): void', params: [], returnType: 'void', isStatic: false, isProperty: false },

    // ---- Exception 类方法 ----
    { className: 'Exception', methodName: 'getMessage', description: '返回异常消息', signature: 'getMessage(): string', params: [], returnType: 'string', isStatic: false, isProperty: false },
    { className: 'Exception', methodName: 'getCode', description: '返回异常代码', signature: 'getCode(): int', params: [], returnType: 'int', isStatic: false, isProperty: false },
    { className: 'Exception', methodName: 'getFile', description: '返回抛出异常的文件路径', signature: 'getFile(): string', params: [], returnType: 'string', isStatic: false, isProperty: false },
    { className: 'Exception', methodName: 'getLine', description: '返回抛出异常的行号', signature: 'getLine(): int', params: [], returnType: 'int', isStatic: false, isProperty: false },
    { className: 'Exception', methodName: 'getPrevious', description: '返回前一个异常（异常链），无则返回 null', signature: 'getPrevious(): Exception', params: [], returnType: 'Exception', isStatic: false, isProperty: false },

    // ---- Resource 类方法 ----
    { className: 'Resource', methodName: 'getType', description: '返回资源类型名称', signature: 'getType(): string', params: [], returnType: 'string', isStatic: false, isProperty: false },
    { className: 'Resource', methodName: 'isOpen', description: '检查资源是否仍打开', signature: 'isOpen(): bool', params: [], returnType: 'bool', isStatic: false, isProperty: false },
    { className: 'Resource', methodName: 'close', description: '关闭资源（RAII 析构时自动调用）', signature: 'close(): void', params: [], returnType: 'void', isStatic: false, isProperty: false },

    // ---- AnnotationEntry 类属性与方法（GRAMMAR.md §14.4） ----
    { className: 'AnnotationEntry', methodName: 'data', description: '位置参数数组（注解使用时传入的参数）', signature: '$data: array', params: [], returnType: 'array', isStatic: false, isProperty: true },
    { className: 'AnnotationEntry', methodName: 'type', description: '目标类型：method / static_method / class / function', signature: '$type: string', params: [], returnType: 'string', isStatic: false, isProperty: true },
    { className: 'AnnotationEntry', methodName: 'name', description: '限定名：Ns\\Class->method / Ns\\Class::staticMethod / Ns\\func / Ns\\Class', signature: '$name: string', params: [], returnType: 'string', isStatic: false, isProperty: true },
    { className: 'AnnotationEntry', methodName: 'call', description: '调用目标方法/静态方法/函数（class 目标报错）。编译期零开销直接调用', signature: 'call(...$args): mixed', params: [{ name: '...$args', description: '调用参数' }], returnType: 'mixed', isStatic: false, isProperty: false },
    { className: 'AnnotationEntry', methodName: 'newInstance', description: '实例化目标类（非 class 目标报错）。返回精确类类型', signature: 'newInstance(...$args): object', params: [{ name: '...$args', description: '构造参数' }], returnType: 'object', isStatic: false, isProperty: false },
];

// ============================================================================
// 不支持特性的诊断提示
// ============================================================================

export const unsupportedFeatures: Record<string, string> = {
    'eval': 'eval() 不被 TinyPHP 支持 — AOT 编译无运行时解释器',
    'include': 'include/require 不被 TinyPHP 支持 — 使用 #include 预处理器指令',
    'require': 'include/require 不被 TinyPHP 支持 — 使用 #include 预处理器指令',
    '__call': '魔术方法 __call 不被 TinyPHP 支持 — 无动态分发',
    '__get': '魔术方法 __get 不被 TinyPHP 支持 — 无动态分发',
    '__set': '魔术方法 __set 不被 TinyPHP 支持 — 无动态分发',
    '__callStatic': '魔术方法 __callStatic 不被 TinyPHP 支持 — 无动态分发',
    '__toString': '__toString 不被 TinyPHP 支持 — 需运行时动态分发',
    '__invoke': '__invoke 不被 TinyPHP 支持 — 需运行时动态分发',
    '__clone': 'clone/__clone 不被 TinyPHP 支持 — COS 对象无通用深拷贝',
    '__debugInfo': '__debugInfo 不被 TinyPHP 支持',
    '__sleep': '__sleep/__wakeup 不被 TinyPHP 支持 — 需运行时序列化支持',
    '__wakeup': '__sleep/__wakeup 不被 TinyPHP 支持 — 需运行时序列化支持',
    '__serialize': '__serialize/__unserialize 不被 TinyPHP 支持',
    '__unserialize': '__serialize/__unserialize 不被 TinyPHP 支持',
    '__isset': '__isset/__unset 不被 TinyPHP 支持 — 无动态分发',
    '__unset': '__isset/__unset 不被 TinyPHP 支持 — 无动态分发',
    '__set_state': '__set_state 不被 TinyPHP 支持',
    'assert': 'assert($str) 不被 TinyPHP 支持 — 使用 assert_true/assert_false 系列',
    'create_function': 'create_function() 不被 TinyPHP 支持 — AOT 无运行时解释器',
    'compact': 'compact() 不被 TinyPHP 支持 — 无运行时符号表',
    'extract': 'extract() 不被 TinyPHP 支持 — 无运行时符号表',
    'debug_backtrace': 'debug_backtrace() 不被 TinyPHP 支持 — 无运行时调用栈',
    'get_defined_vars': 'get_defined_vars() 不被 TinyPHP 支持 — 无运行时符号表',
    'func_get_args': 'func_get_args() 不被 TinyPHP 支持（定参函数）— 可变参数函数 ...$args 中可用',
    'call_user_func': 'call_user_func() 不被 TinyPHP 支持 — 编译时不知函数名',
    'call_user_func_array': 'call_user_func_array() 不被 TinyPHP 支持',
    'set_error_handler': 'set_error_handler() 不被 TinyPHP 支持 — 无运行时错误处理器',
    'register_shutdown_function': 'register_shutdown_function() 不被 TinyPHP 支持',
    '$GLOBALS': '$GLOBALS 不被 TinyPHP 支持 — 无全局符号表',
    'ReflectionClass': 'Reflection API 不被 TinyPHP 支持 — 无运行时内省',
    'ReflectionMethod': 'Reflection API 不被 TinyPHP 支持',
    'ReflectionProperty': 'Reflection API 不被 TinyPHP 支持',
    'ReflectionFunction': 'Reflection API 不被 TinyPHP 支持',
    'clone': 'clone 关键字不被 TinyPHP 支持 — 需 __clone 动态分发',
    'declare': 'declare() 在 TinyPHP 中无意义 — AOT 已是强类型',
    '??=': '??= 不被 TinyPHP 实现 — 使用 $a = $a ?? $b 展开',
    'Throwable': 'catch (Throwable $e) 不被 TinyPHP 支持 — Throwable 是接口无 vtable,使用 catch (Exception $e)',
    'Closure::bind': 'Closure::bind/bindTo/call/fromCallable 不被 TinyPHP 支持 — 闭包作用域编译期固定',
    'Closure::call': 'Closure::call 不被 TinyPHP 支持',
    'Closure::fromCallable': 'Closure::fromCallable 不被 TinyPHP 支持',
    '__COMPILER_HALT_OFFSET__': '__COMPILER_HALT_OFFSET__ 不被 TinyPHP 支持 — 无运行时文件加载',
};

// ============================================================================
// 补全项生成
// ============================================================================

let completionItems: CompletionItem[] | null = null;

export function getCompletionItems(prefix?: string): CompletionItem[] {
    let all = completionItems;
    if (!all) {
        all = buildCompletionItems();
        completionItems = all;
    }
    if (!prefix) return all;
    const lower = prefix.toLowerCase();
    return all.filter(item => item.label.toLowerCase().startsWith(lower));
}

function buildCompletionItems(): CompletionItem[] {
    let items: CompletionItem[] = [];

    // ---- 预处理器指令 ----
    for (let [name, doc] of Object.entries(preprocessorDocs)) {
        items.push({
            label: name,
            kind: CompletionItemKind.Keyword,
            detail: 'TinyPHP Preprocessor',
            insertText: name === '#include' ? '#include ${1|,Windows ,Linux ,MacOS ,Darwin |}"${2:file}"'
                : name === '#flag' ? '#flag ${1|,GCC ,Clang ,TCC ,Windows ,Linux ,MacOS ,Darwin |}${2:-Dflag}'
                : name === '#callback' ? '#callback ${1:type} ${2:name}(${3:params})'
                : name === '#import' ? '#import ${1:module}'
                : name === '#cstruct' ? '#cstruct ${1:Name} {\n\tC.${2:double} ${3:field};\n}'
                : name === '#debug' ? '#debug ${1:message}'
                : name,
            insertTextFormat: InsertTextFormat.Snippet,
            data: 'preprocessor'
        });
    }

    // ---- C 类型注解 (C.Type) ----
    for (let [name, doc] of Object.entries(cTypeDocs)) {
        items.push({
            label: name,
            kind: CompletionItemKind.TypeParameter,
            detail: 'TinyPHP C Type',
            data: 'c-type'
        });
    }

    // ---- 关键字 ----
    for (let [keyword, doc] of Object.entries(keywordDocs)) {
        items.push({
            label: keyword,
            kind: CompletionItemKind.Keyword,
            detail: `TinyPHP ${doc.category}`,
            data: 'keyword'
        });
    }

    // ---- 内置函数 ----
    for (let [func, doc] of Object.entries(functionDocs)) {
        items.push({
            label: func,
            kind: CompletionItemKind.Function,
            detail: doc.signature,
            insertText: doc.params.length > 0 ? `${func}($1)` : `${func}()`,
            insertTextFormat: InsertTextFormat.Snippet,
            data: 'function'
        });
    }

    // ---- C 互操作函数 ----
    for (let [name] of Object.entries(cInteropDocs)) {
        items.push({
            label: name,
            kind: CompletionItemKind.Function,
            detail: 'TinyPHP C Interop',
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

    // ---- 扩展常量（Filter/Pcre/Zlib/Zip/Stream/OpenSSL/Calendar/Exif/Fileinfo/Iconv/Seek）----
    for (let [name, doc] of Object.entries(constantDocs)) {
        items.push({
            label: name,
            kind: CompletionItemKind.Constant,
            detail: `${doc.value} (${doc.category})`,
            insertText: name,
            data: 'constant'
        });
    }

    // ---- 类方法/属性签名（Generator/Thread/Mutex/CondVar/WaitGroup/Exception/Resource/AnnotationEntry）----
    for (let m of classMethodDocs) {
        const sep = m.isStatic ? '::' : '->';
        items.push({
            label: `${m.className}${sep}${m.methodName}`,
            kind: m.isProperty ? CompletionItemKind.Property : CompletionItemKind.Method,
            detail: m.signature,
            insertText: m.methodName,
            insertTextFormat: InsertTextFormat.PlainText,
            data: 'class-method'
        });
    }

    // ---- 代码片段 ----
    items.push(...getSnippetCompletions());

    return items;
}

function getSnippetCompletions(): CompletionItem[] {
    return [
        // ---- 类型声明 ----
        {
            label: 'class',
            kind: CompletionItemKind.Snippet,
            detail: 'TinyPHP class entry',
            insertText: ['class ${1:Main}', '{', '\tpublic function main(): void', '\t{', '\t\t${0:echo "hello\\n";}', '\t}', '}'].join('\n'),
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
            label: 'abstract',
            kind: CompletionItemKind.Snippet,
            detail: 'abstract class',
            insertText: ['abstract class ${1:ClassName}', '{', '\t${0}', '}'].join('\n'),
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'interface',
            kind: CompletionItemKind.Snippet,
            detail: 'interface declaration',
            insertText: ['interface ${1:InterfaceName}', '{', '\t${0}', '}'].join('\n'),
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'trait',
            kind: CompletionItemKind.Snippet,
            detail: 'trait declaration',
            insertText: ['trait ${1:TraitName}', '{', '\tpublic function ${2:method}(): ${3:void}', '\t{', '\t\t${0}', '\t}', '}'].join('\n'),
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'enum',
            kind: CompletionItemKind.Snippet,
            detail: 'enum with backing type',
            insertText: ['enum ${1:Color}: ${2|int|string}', '{', '\tcase ${3:Red} = ${4:"red"};', '\tcase ${5:Green} = ${6:"green"};', '\tcase ${7:Blue} = ${8:"blue"};', '}'].join('\n'),
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'enumi',
            kind: CompletionItemKind.Snippet,
            detail: 'enum with int backing',
            insertText: ['enum ${1:Status}: int', '{', '\tcase ${2:Pending} = 0;', '\tcase ${3:Active} = 1;', '\tcase ${4:Deleted} = 2;', '}'].join('\n'),
            insertTextFormat: InsertTextFormat.Snippet,
        },
        // ---- 函数声明 ----
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
            label: 'closure',
            kind: CompletionItemKind.Snippet,
            detail: 'closure with use',
            insertText: ['function (${1:params}) use (${2:vars})${3:: ${4:void}}', '{', '\t${0}', '}'].join('\n'),
            insertTextFormat: InsertTextFormat.Snippet,
        },
        // ---- 控制流 ----
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
            label: 'elseif',
            kind: CompletionItemKind.Snippet,
            detail: 'if-elseif-else',
            insertText: ['if (${1:condition}) {', '\t${2}', '} elseif (${3:condition}) {', '\t${4}', '} else {', '\t${0}', '}'].join('\n'),
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
            label: 'foreachv',
            kind: CompletionItemKind.Snippet,
            detail: 'foreach (value only)',
            insertText: 'foreach (\\$${1:array} as \\$${2:value}) {\n\t${0}\n}',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'while',
            kind: CompletionItemKind.Snippet,
            detail: 'while loop',
            insertText: ['while (${1:condition}) {', '\t${0}', '}'].join('\n'),
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'dowhile',
            kind: CompletionItemKind.Snippet,
            detail: 'do-while loop',
            insertText: ['do {', '\t${0}', '} while (${1:condition});'].join('\n'),
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
        // ---- 异常 ----
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
            label: 'throw',
            kind: CompletionItemKind.Snippet,
            detail: 'throw exception',
            insertText: 'throw new ${1:Exception}("${2:message}");${0}',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        // ---- 命名空间 ----
        {
            label: 'ns',
            kind: CompletionItemKind.Snippet,
            detail: 'namespace',
            insertText: 'namespace ${1:App\\\\Module};\n\n${0}',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'use',
            kind: CompletionItemKind.Snippet,
            detail: 'use import',
            insertText: 'use ${1:App\\\\ClassName};${0}',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'usegroup',
            kind: CompletionItemKind.Snippet,
            detail: 'use group import',
            insertText: 'use ${1:App}\\\\{${2:ClassA}, ${3:ClassB}};${0}',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        // ---- 解构 ----
        {
            label: 'list',
            kind: CompletionItemKind.Snippet,
            detail: 'list destructure',
            insertText: 'list(\\$${1:a}, \\$${2:b}) = \\$${0:array};',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'arrlist',
            kind: CompletionItemKind.Snippet,
            detail: 'array destructure',
            insertText: '[\\$${1:a}, \\$${2:b}] = \\$${0:array};',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        // ---- C 互操作 ----
        {
            label: 'C->',
            kind: CompletionItemKind.Snippet,
            detail: 'C interop call',
            insertText: 'C->${1:func}(${0})',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'cint',
            kind: CompletionItemKind.Snippet,
            detail: 'c_int cast',
            insertText: 'c_int(${0:expr})',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'cfloat',
            kind: CompletionItemKind.Snippet,
            detail: 'c_float cast',
            insertText: 'c_float(${0:expr})',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'cstr',
            kind: CompletionItemKind.Snippet,
            detail: 'c_str cast',
            insertText: 'c_str(${0:expr})',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        // ---- 调试 ----
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
        // ---- 预处理器 ----
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
            insertText: '#callback ${1:type} ${2:name}(${3:params})',
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
        if (cdoc) return cdoc;
        return null;
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
    if (doc) {
        return `### \`${name}\`\n\n${doc.description}\n\n*${doc.category}*`;
    }
    let pdoc = preprocessorDocs[name];
    if (pdoc) return pdoc;
    return null;
}

export function getTypeDocumentation(name: string): string | null {
    return keywordDocs[name]?.description || null;
}

export function getCInteropDocumentation(name: string): string | null {
    return cInteropDocs[name] || null;
}

export function getCTypeDocumentation(name: string): string | null {
    return cTypeDocs[name] || null;
}

export function getPreprocessorDocumentation(name: string): string | null {
    return preprocessorDocs[name] || null;
}

export function getConstantDocumentation(name: string): string | null {
    const doc = constantDocs[name];
    if (!doc) return null;
    return `**${name}** = \`${doc.value}\`\n\n${doc.description}\n\n*Category: ${doc.category}*`;
}

export function getClassMethodDocumentation(className: string, methodName: string): string | null {
    const doc = classMethodDocs.find(d => d.className === className && d.methodName === methodName);
    if (!doc) return null;
    const sep = doc.isStatic ? '::' : '->';
    let md = `### ${className}${sep}${methodName}\n\n${doc.description}\n\n`;
    md += `\`${doc.signature}\`\n\n`;
    if (doc.params.length > 0) {
        md += '**参数:**\n\n';
        for (const p of doc.params) md += `- \`${p.name}\` — ${p.description}\n`;
    }
    md += `\n**返回值:** \`${doc.returnType || 'void'}\``;
    return md;
}

export function getAllConstants(): { name: string; value: string; description: string; category: string }[] {
    return Object.entries(constantDocs).map(([name, doc]) => ({ name, ...doc }));
}

// 获取函数返回类型（用于 Inlay Hint 推导 $x = func() 的类型）
export function getFunctionReturnType(name: string): string | null {
    let doc = functionDocs[name];
    if (!doc) return null;
    let rt = doc.returnType;
    if (!rt || rt === 'void' || rt === 'never' || rt === 'mixed') return null;
    return rt;
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
