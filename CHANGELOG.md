# Changelog

## [0.1.1] - 2026-08-08

### Fixed
- 修正 README 构建步骤：原 `npm run compile` 产出的 `out/` 被 `.vscodeignore` 排除，改为显式编译服务端 `tsc -b server/tsconfig.json` 产出 `server/out`
- 补充 Bun 环境下 `npx vsce package` 崩溃的说明与规避方案（`vsce` 内部 `tar` → `duplexify` → `stream-shift` 链在 Bun 运行时不兼容）

## [0.1.0] - Initial Release

### 语法高亮
- 完整 PHP 语法（类、函数、控制流、字符串插值、heredoc/nowdoc，含 HTML/CSS/JS 嵌入）
- TinyPHP 预处理器指令（`#include` / `#callback` / `#flag` / `#import` / `#debug` / `#cstruct`，支持 OS/CC 过滤）
- C 互操作（`C->func()` / `C->CONST` / `C.Type` 类型注解 / `(C.Type) cast` 强制转换 / `phpc_*` 30+ 函数）
- PHP-C 桥接类型（`c_int` / `c_float` / `c_str` / `c_bool` / `php_int` / `php_float` / `php_str`）
- 注解系统（`#[Attribute(p: type)] const NAME = [];` 声明 + `#[Name(args)]` 使用，支持命名空间限定）
- 操作符（`|>` pipe / `?->` nullsafe / `...` spread / `??` coalesce）
- 字面量增强（八进制 `0o777`、下划线分隔 `1_000_000` / `0xFF_FF`）
- 内置类高亮（Generator / Thread / Mutex / CondVar / WaitGroup / Parallel / Resource / File / Exception）

### 诊断
- 30+ 条诊断规则，对齐 TinyPHP GRAMMAR.md 的不支持特性表
- 覆盖：`eval` / `$$var` / `?int` 可空类型 / `clone` / `__call` 等魔术方法 / `Reflection*` / `debug_backtrace` / `include`-`require` / `compact`-`extract` / DNF 交叉类型 / 命名参数 / first-class callable 等
- 大括号不匹配检查、短标签 `<?=` 提醒、`const`/属性无类型 Error
- 未使用变量/常量诊断（`DiagnosticTag.Unnecessary` 灰色删除线标记）

### 智能感知 (IntelliSense)
- 自动补全：关键字、内置函数（~130 个）、C 互操作函数（30+）、C 类型注解（18 个）、预处理指令、代码片段
- 悬停信息：函数文档、关键字说明、C 类型/C互操作函数文档（含开销说明）
- 签名帮助：内置函数参数提示 + 活跃参数高亮
- Inlay Hints：无类型参数/常量/局部变量赋值显示推导类型（含完整表达式推导：算术/字符串连接/比较/逻辑/位操作/三元/match/空合并/管道）
- 文档符号大纲（类、函数、命名空间）
- 跳转到定义（函数、类、变量）

### 代码片段
- 35+ 模板覆盖：类声明、函数、控制流、命名空间、解构、输出
- TinyPHP 独有：Property Hook、Pipe 操作符、Spread、Generator、注解（声明/使用/Export/调用/newInstance）、静态局部变量、error() 函数、Type|Exception 返回类型
- C 互操作片段：`C` / `cint` / `cfloat` / `cstr` / `cvptr` / `phpstrc` / `phpcauto` / `phpcfree` / `phpcassert` / `cast` / `ccast` / `vdecl` / `cdecl`
- 多线程：Thread 类骨架
- 预处理器：全部指令含 OS/CC 选项

### 格式化
- PHP-FIG PER-CS 风格 10 阶段空格规则（紧贴操作符 → 组合操作符 → 二元算术位 → 一元 → instanceof → 三元 → 分隔符 → 关键字压缩 → 函数调用紧贴）
- 字符串/注释保护占位符机制，避免误格式化字面量内容

### 编辑器集成
- 语言配置：括号匹配、自动闭合、缩进规则
- onEnterRules（参考 Intelephense）：`/** */` 自动缩进、`/**`/` * ` 续行、` */` 删除前导 `*`、if/else/for/foreach/while 单行后 outdent
- Middleware 设置同步：合并 VSCode `files.associations` / `files.exclude` 到 LSP 服务端
- Emmet 支持（`tinyphp` → `html`）

### 配置项
- `tinyphp.runtime` / `tinyphp.maxMemory` / `tinyphp.trace.server`
- 分功能开关：`diagnostics` / `completion` / `hover` / `signatureHelp` / `inlayHints.*`
- `tinyphp.files.exclude` / `tinyphp.files.associations`
- Untrusted workspace 限制 `runtime` / `maxMemory`；Virtual workspace 限定仅打开文件
