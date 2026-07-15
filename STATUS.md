# vscode-tinyphp 扩展完善状态

> 基于 `C:\project\php\TinyPHP` 项目的 GRAMMAR.md 与 FUNCTIONS.md 进行对齐完善。
>
> 更新时间：2026-07-14（v3：参考 Intelephense 改进 + 变量=函数调用 Inlay Hint + 格式化策略升级）

---

## 一、已完成

### 1. 语法高亮（`syntaxes/tinyphp.tmLanguage.json`）

| 特性 | 状态 | 说明 |
|---|---|---|
| 基础 PHP 语法 | ✅ | 变量、字符串、数字、关键字、注释、PHP 标签 |
| Heredoc/Nowdoc（含 HTML/CSS/JS 嵌入） | ✅ | `<<<HTML`、`<<<'HTML'`、`<<<'CSS'`、`<<<'JS'` |
| 预处理器指令 `#include` | ✅ | 支持 `"file"` 与 `<file>` 两种形式 + OS 平台过滤 |
| 预处理器指令 `#flag` | ✅ | 支持 GCC/Clang/TCC/Windows/Linux/MacOS/Darwin 过滤 |
| 预处理器指令 `#cstruct` | ✅ | 含 `cstruct-fields` 子模式（C 类型 + 字段名） |
| 预处理器指令 `#callback`/`#import`/`#debug` | ✅ | 基础匹配 |
| 注解系统 `#[Attribute(p: type)] const NAME = [];` | ✅ | 注解声明语法 |
| 注解使用 `#[Name(args)]` | ✅ | 支持命名空间限定 `Ns\Name` |
| C 互操作 `C->func()` | ✅ | C 函数调用 |
| C 互操作 `C->CONST` | ✅ | 无括号常量/枚举/宏访问 |
| C 互操作 `C.Type` | ✅ | 类型注解（含 `*` 指针后缀） |
| C 互操作 `(C.Type) cast` | ✅ | 强制转换 |
| C 互操作函数 `phpc_*` 系列 | ✅ | 30+ 函数全部高亮 |
| C 互操作函数 `c_int/c_float/c_str/...` | ✅ | 类型桥接函数 |
| Pipe 操作符 `\|>` | ✅ | |
| Nullsafe 操作符 `?->` | ✅ | |
| Spread 操作符 `...` | ✅ | |
| Coalesce 操作符 `??` | ✅ | |
| 八进制字面量 `0o777` | ✅ | |
| 下划线分隔数字 `0xFF_FF`、`1_000_000` | ✅ | |
| 内置类高亮 | ✅ | Generator/Thread/Mutex/CondVar/WaitGroup/Parallel/Resource/File/Exception |

### 2. 诊断（`server/src/server.ts`）

基于 GRAMMAR.md 的"❌ 不支持"与"❌ 不做"表准确化，修正了之前大量误报。

| 诊断项 | 严重级别 | 说明 |
|---|---|---|
| `<?php` 开头标签 | Warning | TinyPHP 不需要 |
| 短标签 `<?=` | Warning | 不支持 |
| 括号/大括号不平衡 | Warning | 全文件检查 |
| `const` 无类型 | Error | TinyPHP 要求显式类型 |
| 属性无类型声明 | Error | TinyPHP 要求显式属性类型 |
| `include`/`require`/`include_once`/`require_once` | Error | 无运行时文件加载，用 `#include` |
| 动态调用 `$fn()`/`$obj->$m()`/`call_user_func` | Error | 编译时不知函数名 |
| `__call`/`__get`/`__set`/`__callStatic` | Error | 无动态分发 |
| 扩展魔术方法（`__toString`/`__invoke`/`__clone`/`__debugInfo`/`__sleep`/`__wakeup`/`__serialize`/`__unserialize`/`__isset`/`__unset`/`__set_state`） | Error | 需运行时动态分发或序列化 |
| `Reflection*` 全系列 | Error | 运行时内省 |
| `debug_backtrace`/`debug_print_backtrace` | Error | 运行时栈帧 |
| `func_get_args` 等（定参函数） | Error | 参数已固化为 C 形参 |
| `assert($str)` | Error | 用 `assert_true/assert_false/assert_eq_*` |
| `create_function` | Error | 无运行时解释器 |
| `compact`/`extract`/`get_defined_vars` | Error | 依赖运行时符号表 |
| `$$var`/`${expr}` | Error | 编译时不知变量名 |
| `$GLOBALS` | Error | 无运行时全局符号表 |
| `eval` | Error | AOT 无运行时解释器 |
| `clone` 关键字 | Error | 需 `__clone` 动态分发 |
| `declare()` | Info | TinyPHP 已是强类型 AOT，无意义 |
| `??=` 空合并赋值 | Warning | 用 `$a = $a ?? $b` 展开 |
| `catch (Throwable $e)` | Error | Throwable 是接口无 vtable，用 Exception |
| `Closure::bind`/`->bindTo`/`Closure::call`/`Closure::fromCallable` | Error | 闭包作用域编译期固定 |
| `static` 返回类型 | Warning | AOT 下语义等同 self |
| DNF/intersection 类型 `A&B` | Error | 实现复杂，破坏类型固定优势 |
| `\u{XXXX}` Unicode 转义 | Warning | C 不支持 `\u{}` 语法 |
| First-class callable `strlen(...)` | Warning | 用闭包或直接调用替代 |
| 命名参数 `func(name: $value)` | Warning | AOT 无意义 |
| `__COMPILER_HALT_OFFSET__` | Error | 无运行时文件加载 |
| `final` 方法修饰符 | Error | 仅支持 `final class` |
| `implements ArrayAccess/Iterator/IteratorAggregate/Stringable` | Warning | 接口语义未实现（仅记录） |
| `print` 语句 | Info | 用 `echo` 替代 |
| 可变参数 `...$args`（在函数签名中） | Warning | 需动态栈构造 |
| Nullable 类型 `?int`/`?string` 等 | Error | 破坏类型固定优势 |
| 函数参数无类型 | Information | 类型可选，建议写以便编译期检查（GRAMMAR.md §6） |
| `namespace A { }` 块形式 | Warning | 不支持大括号形式 |
| 全局/命名空间常量无类型 | Information | 类型可选（省略时按字面量推导），建议写 |
| 类内常量无类型 | Warning | 类常量类型必填（GRAMMAR.md §3.3） |

### 3. 代码片段（`snippets/tinyphp.json`）

新增 30+ 个覆盖 TinyPHP 独有特性的代码片段：

| 分类 | 片段前缀 | 说明 |
|---|---|---|
| 类声明 | `class`/`classe`/`classc`/`classcp`/`abstract`/`interface`/`trait`/`enum`/`enumi` | 完整类结构 |
| 函数 | `function`/`pubf`/`prif`/`statf`/`fn`/`closure` | 基础函数 |
| **块体箭头函数** | `fnb` | TinyPHP 扩展 `fn(): type => { stmts }` |
| **带类型箭头函数** | `fnt` | `fn(int $x): int => $x*2` |
| 控制流 | `if`/`ifelse`/`elseif`/`for`/`foreach`/`foreachv`/`while`/`dowhile`/`switch`/`match`/`try`/`trycf`/`throw` | |
| 命名空间 | `ns`/`use`/`usegroup` | |
| 解构 | `list`/`arrlist` | |
| 输出 | `echo`/`vd` | |
| **Property Hook** | `prophook`/`prophookb` | PHP 8.4 短形式 + 块体 |
| **Pipe 操作符** | `pipe`/`pipechain` | `|>` 单步与链式 |
| **Spread** | `spread` | 数组展开 |
| **Generator** | `gen`/`yield`/`yieldkv`/`yieldfrom` | 生成器函数与 yield |
| **注解** | `attrd`/`attr`/`export`/`attrcall`/`attrnew` | 声明/使用/Export/调用/newInstance |
| **静态局部变量** | `staticvar` | |
| **字符串** | `heredoc`/`nowdoc` | |
| **error() 函数** | `error` | 等价 `throw new Exception` |
| **Type\|Exception 返回类型** | `throws` | |
| **C 互操作** | `C`/`cint`/`cfloat`/`cstr`/`cvptr`/`phpstrc`/`phpcauto`/`phpcfree`/`phpcassert`/`cast`/`ccast`/`vdecl`/`cdecl` | |
| **多线程** | `thread` | Thread 类骨架 |
| **use 导入** | `usefn`/`useconst`/`usefngroup` | function/const 导入 |
| 预处理器 | `#include`/`#include<`/`#callback`/`#flag`/`#import`/`#debug`/`#cstruct` | 全部支持 OS/CC 选项 |

### 4. 补全/Hover/Signature（`server/src/tinyphp-parser.ts`）

| 数据源 | 状态 | 说明 |
|---|---|---|
| `keywordDocs` | ✅ | 50+ 关键字文档，含 TinyPHP 独有（Generator/Thread/Mutex/CondVar/WaitGroup/Parallel/Resource/File/Exception/error/C/DIRECTORY_SEPARATOR） |
| `functionDocs` | ✅ 部分 | 约 130 个内置函数（详见下文未完成列表） |
| `cInteropDocs` | ✅ | 30+ C 互操作函数完整文档（含开销说明：宏零开销/static inline） |
| `cTypeDocs` | ✅ | 18 个 C 类型注解（C.int/C.double/C.int32/C.uint64/C.void*/C.char* 等） |
| `preprocessorDocs` | ✅ | 6 个预处理器指令文档 |
| `unsupportedFeatures` | ✅ | 不支持特性提示表 |
| 补全项 `data` 字段分类 | ✅ | function/keyword/c-interop/c-type/preprocessor/type/constant |
| `onCompletionResolve` | ✅ | 全部分支已实现（含 c-type 新增） |
| `onHover` | ✅ | 函数/关键字/类型/C 类型/C 互操作函数全部支持 |
| `onSignatureHelp` | ✅ | 内置函数签名提示 + 参数活跃位置 |

### 5. 编译验证

| 步骤 | 状态 |
|---|---|
| `tsc -b`（客户端） | ✅ 通过 |
| `tsc -b server/tsconfig.json`（服务端） | ✅ 通过（修复了 `Object possibly 'undefined'` 类型错误） |
| `webpack --mode development` | ✅ 通过 |

### 6. v3 新增（参考 Intelephense）

| 特性 | 文件 | 说明 |
|---|---|---|
| **onEnterRules 语言配置** | `language-configuration.json` | 参考 Intelephense 添加 6 条 onEnterRules：`/** */` 自动缩进、`/** ` 续行 `* `、` * ` 续行 `* `、` */` 删除前导 `*`、` *-----*/` 删除前导、if/else if/else/for/foreach/while 单行后自动 outdent |
| **Middleware 设置合并** | `src/middleware.ts`（新增）、`src/extension.ts` | 参考 Intelephense 的 `createMiddleware()` 模式，在 LSP `workspace/configuration` 请求中合并 VSCode 的 `files.associations`（值为 `tinyphp`/`php` 的扩展名）和 `files.exclude` 到 TinyPHP 服务端，使 VSCode 设置与 TinyPHP 服务端保持同步 |
| **格式化策略升级（PHP-FIG PER-CS）** | `server/src/tinyphp-formatter.ts` | `applySpacingRules` 完全重写为 10 阶段：紧贴操作符（`->`/`::`/`++`/`--`/数组访问）→ 控制关键字与大括号 → 组合操作符（`===`/`!==`/`<=>`/`==`/`!=`/`<=`/`>=`/`&&`/`\|\|`/`??`/`\|>`/`=>`）→ 二元算术位操作符（`+`/`-`/`*`/`/`/`%`/`<`/`>`/`&`/`\|`/`^`/`<<`/`>>`）→ 赋值 `=` → 一元 `!` 紧贴 → `instanceof` → 三元 `? :` → 分隔符 `,`/`;` → 关键字多空格压缩 → 函数调用紧贴 |
| **变量 = 表达式 Inlay Hint** | `server/src/server.ts`、`server/src/tinyphp-parser.ts` | `inferTypeFromLiteral` 扩展为完整表达式推导器：① 字面量（int/float/string/bool/array）② 函数调用（通过 `TinyPHP.getFunctionReturnType()` 查表 + 命名约定推导 `is_*`/`str_*`/`array_*` 等）③ `new ClassName(...)` → 类名 ④ 复合表达式递归推导：算术（`+`/`-`/`*`/`/`/`%`/`**` 幂运算，int+int=int，含 float 则 float）、字符串连接（`.` → string）、比较（`==`/`!=`/`<`/`>`/`===`/`!==`/`<=>` → bool）、逻辑（`&&`/`\|\|`/`!` → bool）、位操作（`<<`/`>>`/`&`/`\|`/`^` → int）、三元（`expr ? a : b` 递归推导两分支类型）、match 表达式（`match($v){...}` 递归推导所有分支类型，数值混合→float）、空合并（`??` 取右侧）、管道（`\|>` 取最右侧）、括号 unwrap、PHP 常量识别（`PHP_EOL`/`M_PI`/`E_ALL` 等）。包含字符串字面量保护机制（避免操作符扫描误判字符串内字符）和操作符边界检查（避免 `1.5` 中的 `.` 被误判为字符串连接、`++` 被误判为 `+`、`**` 被误判为 `*`）。支持单行和跨多行表达式（match/array 等跨行结构） |
| **未使用变量/常量诊断** | `server/src/server.ts` | 新增 `checkUnusedSymbols` 函数：扫描所有局部变量定义（`$var = ...`、`Type $var = ...`、`static $var = ...`）和全局/命名空间常量定义（`const NAME = ...`），检测是否在后续代码中被引用。识别使用场景：① 表达式中引用（`echo $name`、`$name + 1`）② 复合赋值（`$name +=`、`.=` 等）③ = 右侧引用（`$other = $name`）④ 控制结构（`if ($name)`、`foreach ($arr as $name)`）⑤ 函数调用（`foo($name)`）。跳过：函数参数、类属性、`$_` 开头的占位变量。诊断级别 Information + DiagnosticTag.Unnecessary 标记（VSCode 中显示为灰色删除线） |

---

## 二、未完成 / 待完善

### 1. 函数文档覆盖不全（约 130/281+，覆盖率 ~46%）

当前 `functionDocs` 已覆盖类别：
- ✅ 输出函数（var_dump/count/exit/die/error）
- ✅ 类型函数（is_*/gettype/intval/floatval/strval/boolval/getenv/putenv）
- ✅ 字符串函数（strlen/substr/strpos/str_*/sprintf/implode/explode 等 30+）
- ✅ HTML/Base64/URL（htmlspecialchars/urlencode/urldecode/parse_url/parse_str/http_build_query）
- ✅ 数组函数（40+ 个，含 sort/in_array/array_merge/array_column 等）
- ✅ 数学函数（abs/round/ceil/floor/sqrt/pow/三角函数/双曲函数/exp/log 等 25+）
- ✅ 进制转换（bindec/hexdec/octdec/decbin/decoct/dechex/base_convert）
- ✅ 断言（assert_true/assert_false/assert_eq_*）
- ✅ 随机数（rand/mt_rand/random_int/random_bytes）
- ✅ ctype 字符检测（11 个 ctype_*）
- ✅ JSON（json_encode/json_decode/json_validate）
- ✅ Hash（md5/sha1/sha256/sha512/crc32）
- ✅ 日期时间（time/date/sleep/usleep/hrtime/microtime/mktime/strtotime/uniqid）
- ✅ 文件 I/O（file_get_contents/file_put_contents）
- ✅ UTF-8（mb_strlen/mb_substr/mb_strpos）
- ✅ isset/empty/unset

**未覆盖的函数类别**（需补充到 `functionDocs`）：

| 类别 | 函数数 | 缺失函数 | 优先级 |
|---|---|---|---|
| HTML/Base64/URL 补充 | ~3 | `base64_encode`、`base64_decode`、`htmlspecialchars_decode` | 中 |
| 文件 I/O 扩展 | ~10 | `file_exists`/`is_file`/`is_dir`/`filesize`/`unlink`/`rename`/`mkdir`/`rmdir`/`file`/`fopen`(若支持) | 高 |
| 数学函数补充 | ~3 | `mt_getrandmax`/`getrandmax`/`mt_srand` | 低 |
| iconv 字符集转换 | 8 | `iconv`/`iconv_strlen`/`iconv_substr`/`iconv_strpos`/`iconv_strrpos`/`iconv_mime_encode`/`iconv_mime_decode`/`iconv_get_encoding` | 中 |
| pcntl 进程控制（需 `#import pcntl`） | 7 | `pcntl_fork`/`pcntl_wait`/`pcntl_waitpid`/`pcntl_signal`/`pcntl_exec`/`pcntl_wexitstatus`/`pcntl_wifexited` | 中 |
| posix 系统（需 `#import posix`） | 14 | `posix_getpid`/`posix_getppid`/`posix_getuid`/`posix_geteuid`/`posix_getgid`/`posix_getegid`/`posix_strerror`/`posix_errno`/... | 中 |
| pcre 正则表达式（需 `#import pcre`） | 8 | `preg_match`/`preg_match_all`/`preg_replace`/`preg_replace_callback`/`preg_split`/`preg_grep`/`preg_quote`/`preg_last_error` | **高** |
| filter 过滤器 | 3 | `filter_var`/`filter_input`/`filter_list` | 中 |
| password 密码哈希 | 2 | `password_hash`/`password_verify` | 中 |
| exif EXIF 元数据（需 `#import exif`，纯 phpc 实现） | 4 | `exif_read_data`/`exif_thumbnail`/`exif_imagetype`/`exif_tagname` | 低 |
| print_r 等其他 | ~3 | `print_r`/`var_export`/`debug_zval_refcount` | 低 |

### 2. 类方法文档缺失

`keywordDocs` 仅有类名文档，**类的方法签名未提供**：

| 类 | 缺失方法 |
|---|---|
| `Generator` | `current()`/`key()`/`next()`/`send()`/`throw()`/`getReturn()`/`rewind()`/`valid()` |
| `Thread` | `Thread::create()`/`Thread::join()`/`Thread::start()`/`Thread::isStarted()`/`Thread::getId()` |
| `Mutex` | `Mutex::lock()`/`Mutex::unlock()`/`Mutex::trylock()`/`Mutex::timedlock()` |
| `CondVar` | `CondVar::signal()`/`CondVar::wait()`/`CondVar::broadcast()`/`CondVar::timedwait()` |
| `WaitGroup` | `WaitGroup::add()`/`WaitGroup::done()`/`WaitGroup::wait()` |
| `Parallel` | `Parallel::for()`/`Parallel::map()` |
| `File` | `File::open()`/`File::read()`/`File::write()`/`File::close()`/`File::eof()`/`File::seek()`/`File::tell()`/`File::flush()` |
| `Resource` | `Resource::getType()`/`Resource::getHandle()`/`Resource::getPtr()` |
| `Exception` | `getMessage()`/`getCode()`/`getFile()`/`getLine()`/`getTrace()`/`getPrevious()` |

### 3. 注解系统补全缺失

GRAMMAR.md §14 中的注解 entry 访问形式未提供补全：

- `ROUTE[0]->data` — 注解 entry 属性访问
- `ROUTE[0]->type` — 注解类型
- `ROUTE[0]->name` — 注解名称
- `ROUTE[0]->call(...$args)` — 调用方法/静态方法/函数
- `ROUTE[0]->newInstance(...$args)` — 实例化类

### 4. LSP 功能性缺陷

| 功能 | 现状 | 待改进 |
|---|---|---|
| 诊断引擎 | **基于正则逐行扫描** | 易误报/漏报，长期应改为基于 AST（可移植 TinyPHP 的 `Lexer.php`/`Parser.php` 到 TS，或调用 TinyPHP 编译器做外部诊断） |
| Go to Definition | 基于正则查找同名符号 | 不区分作用域，命名空间解析不准；建议改 AST |
| Document Symbols | 基于正则提取类/函数/常量 | 不支持嵌套类成员结构 |
| Find References | **未启用**（`referencesProvider: false`） | 可基于 AST 启用 |
| Rename | **未启用** | 同上 |
| 格式化器 | ✅ 已升级为 PHP-FIG PER-CS 风格（10 阶段空格规则） | 仍非 AST 格式化，复杂场景可能不理想 |
| Workspace Symbols | **未启用** | 可补充 |
| 语义高亮（Semantic Tokens） | **未启用** | 可基于 AST 提供 |
| Code Actions / Quick Fix | **未启用** | 如 `print` → `echo`、`declare()` 删除等可一键修复 |
| Inlay Hints | ✅ 已启用 | 为无类型参数/全局常量/无类型局部变量赋值（含函数调用）显示灰色推导类型提示 |
| Inlay Hints 配置 | ✅ | `tinyphp.inlayHints.enable/showParameterTypes/showConstantTypes` 三项配置 |
| Configuration 同步 | ✅ 已启用 | `middleware.ts` 在 `workspace/configuration` 请求中合并 VSCode `files.associations`/`files.exclude` |

### 5. 已知误报风险

| 诊断 | 风险 | 说明 |
|---|---|---|
| 命名参数检测 | 高 | 启发式正则可能误报 `match`/`switch` 中的 `key:` 形式；当前已排除部分关键字但仍可能误报 |
| `print` 检测 | 中 | 可能误报函数定义 `function print()`、变量名 `$print`、`printable` 等场景；已加排除但仍需测试 |
| First-class callable 检测 | 中 | `strlen(...)` 与可变参数 `function(...$args)` 易混淆；当前用 `!/\bfunction\s/.test(line)` 排除但不完美 |
| `implements` 检测 | 低 | 当前仅检测 4 个接口名，不区分 trait `use` 场景 |
| 字符串内注释检测 | 高 | **正则无法识别字符串字面量内的内容**，例如 `"eval is bad"` 会误报为 `eval`；需 AST 解决 |

### 6. 文档/帮助未覆盖

- 缺少 `#[Export]` + `-shared` 动态库导出语法文档（GRAMMAR.md §15）
- 缺少 `AnnotationEntry` 内置类文档（GRAMMAR.md §14.4）
- 缺少 `#cstruct` 嵌套值类型示例
- `cTypeDocs` 未覆盖自定义结构体 `C.Point*` 形式（需 AST 才能动态识别）

---

## 三、后续建议优先级

### P0（高优先级，影响开发体验）
1. **补全 pcre 函数**（`preg_match`/`preg_replace` 等 8 个）— 项目中最常用扩展
2. **补全文件 I/O 扩展函数**（`file_exists`/`is_file`/`unlink` 等）— 几乎每个项目都用
3. **解决字符串内误报问题** — 改 AST 或至少在诊断前剥离字符串字面量

### P1（中优先级，提升专业度）
4. 补全类方法签名（Generator/Thread/File/Exception 等）
5. 补全 iconv/filter/password 函数
6. 补全注解 entry 访问补全（`ROUTE[0]->call/newInstance`）
7. ~~启用配置同步（middleware.ts 已就位）~~ ✅ v3 已完成
8. 增加 Quick Fix（`print`→`echo`、`declare()` 删除、`clone` 提示改用 `new`）

### P2（低优先级，长期演进）
9. 补全 pcntl/posix/exif 扩展函数
10. 将诊断引擎从正则升级为 AST（移植 TinyPHP 的 Parser 到 TS，或调用 TinyPHP 编译器）
11. 启用 Find References / Rename / Semantic Tokens
12. ~~改进格式化器（PSR-12 风格）~~ ✅ v3 已升级为 PHP-FIG PER-CS 风格

---

## 四、文件改动清单

| 文件 | 改动类型 | 说明 |
|---|---|---|
| `syntaxes/tinyphp.tmLanguage.json` | 修改 | 新增 annotations/cstruct-fields 仓库；扩展 c-interop（C->CONST/C.Type/(C.Type)）；新增操作符 `|>`/`?->`/`...`/`??`；扩展 phpc_* 函数列表；扩展内置类 |
| `server/src/server.ts` | 修改 | 移除 yield 误报；新增 15+ 诊断；类块追踪区分类常量/全局常量诊断；参数无类型改 Information 级别；新增 Inlay Hints 功能（`connection.languages.inlayHint.on`）为无类型参数/全局常量显示灰色推导类型；升级 vscode-languageserver 9.0.1 → 10.1.0（protocol 3.18.2 支持 InlayHint API）；v3：`inferTypeFromLiteral` 扩展为完整表达式推导器（字面量/函数调用/new/算术/字符串连接/比较/逻辑/位操作/三元/空合并/管道/括号 unwrap/PHP 常量识别），新增 `inferTypeFromExpression`/`inferSimpleType`/`findTopLevelOperator`/`findTopLevelTernary`/`isOperatorBoundary`/`unwrapOuterParens`/`protectStringLiterals`/`restoreStringLiterals`/`inferConstantType` 等辅助函数 |
| `snippets/tinyphp.json` | 修改 | 新增 30+ 片段（Property Hook/Pipe/Generator/注解/C 互操作/Thread 等） |
| `server/src/tinyphp-parser.ts` | 修改 | 修正 yield/Generator/error 文档；新增 Thread/Mutex/CondVar/WaitGroup/Parallel/Resource/File/Exception/C/DIRECTORY_SEPARATOR 关键字；扩展 cInteropDocs（30+）；新增 cTypeDocs（18）；扩展 preprocessorDocs（#cstruct）；扩展 unsupportedFeatures；新增 getCTypeDocumentation 导出函数；buildCompletionItems 添加 C 类型注解补全项；v3：新增 `getFunctionReturnType` 导出函数 |
| `server/src/tinyphp-formatter.ts` | 修改 | 完全重写：字符串/注释保护（占位符机制）+ `=>`/`,`/`=` 周围空格规则 + 关键字压缩多空格 + `foo (` → `foo(` 修正；删除破坏性的 `replace(/ {2,}/g, ' ')`；v3：`applySpacingRules` 重构为 10 阶段 PHP-FIG PER-CS 风格（紧贴操作符 / 组合操作符 / 二元算术位操作符 / 一元紧贴 / instanceof / 三元 / 分隔符等） |
| `language-configuration.json` | 修改（v3） | 新增 6 条 onEnterRules：`/** */` 自动缩进、`/**` 续行、` * ` 续行、` */` 删除前导 `*`、if/else/for/foreach/while 单行后 outdent |
| `src/middleware.ts` | 新增（v3） | 参考 Intelephense `createMiddleware()` 模式：在 `workspace/configuration` 请求中合并 VSCode `files.associations`（值 `tinyphp`/`php`）和 `files.exclude` 设置到 TinyPHP LSP 服务端 |
| `src/extension.ts` | 修改（v3） | 引入 `createMiddleware()` 并传入 `clientOptions.middleware`；`deactivate()` 调用 `middleware.dispose()` |

---

## 五、验证方法

```powershell
# 1. 编译客户端
npm run compile

# 2. 编译服务端
npx tsc -b server/tsconfig.json

# 3. 打包客户端
npm run webpack

# 4. 调试启动
# 按 F5 在 VSCode 中启动扩展开发宿主，打开 .tphp 文件测试
```

所有编译步骤均已验证通过（exit code 0）。
