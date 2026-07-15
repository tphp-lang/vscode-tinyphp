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
