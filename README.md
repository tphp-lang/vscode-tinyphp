# TinyPHP for Visual Studio Code

VS Code IDE 插件，为 TinyPHP 语言提供全面的开发体验支持。

## 关于 TinyPHP

[TinyPHP](https://github.com/tphp-lang/TinyPHP) 是一个 PHP → C AOT (Ahead-of-Time) 编译器，将 PHP 代码编译为原生二进制。它是 PHP 8.5 的强类型子集，支持约 80% 的 PHP 特性，并添加了 C 互操作等独有扩展。

## 功能

### 语法高亮

完整的 TinyPHP 语法高亮，包括：
- 所有标准 PHP 语法（类、函数、控制流、字符串插值、heredoc/nowdoc）
- TinyPHP 预处理器指令（`#include`, `#callback`, `#flag`, `#import`, `#debug`）
- C 互操作类型（`c_int`, `c_float`, `c_str`）
- PHP-C 桥接类型（`php_int`, `php_float`, `php_str`）
- `C->func()` 调用语法

### 智能感知 (IntelliSense)

- **自动补全**: 关键字、内置函数、类型、PHP 魔术常量、代码片段
- **悬停信息**: 内置函数文档、关键字说明、类型文档
- **签名帮助**: 函数参数提示
- **代码片段**: 35+ 常用模板（class、function、foreach、try-catch 等）

### 诊断 (Diagnostics)

- 不支持特性的警告（`eval()`, `$$var`, `yield`, `?int` 可空类型）
- 大括号不匹配检查
- 短标签使用提醒

### 代码导航

- 文档符号大纲（类、函数、命名空间）
- 跳转到定义（函数、类、变量）

## 安装

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/your-org/vscode-tinyphp.git
cd vscode-tinyphp

# 安装依赖
npm install
cd server && npm install && cd ..

# 编译
npm run compile

# 打包为 .vsix
npx vsce package
```

### 开发模式

1. 在 VS Code 中打开项目
2. 按 `F5` 启动扩展开发窗口
3. 打开 `.tphp` 或 `.php` 文件进行测试

### 调试

- **仅运行扩展**: 选择 "Run Extension" 配置按 F5
- **调试服务器**: 选择 "Run Extension (Server Debug)" 按 F5，然后选择 "Attach to Server" 附加调试器

## 配置

```json
{
    "tinyphp.runtime": null,            // 自定义 Node.js 运行时路径
    "tinyphp.maxMemory": 1024,          // 语言服务器最大内存 (MB)
    "tinyphp.trace.server": "off",      // LSP 通信追踪
    "tinyphp.diagnostics.enable": true, // 启用诊断
    "tinyphp.completion.enable": true,  // 启用自动补全
    "tinyphp.hover.enable": true,       // 启用悬停信息
    "tinyphp.signatureHelp.enable": true, // 启用签名帮助
    "tinyphp.files.exclude": [          // 排除分析的文件
        "**/.git/**",
        "**/node_modules/**",
        "**/vendor/**"
    ],
    "tinyphp.files.associations": [     // 文件关联
        "*.tphp",
        "*.php",
        "*.inc"
    ]
}
```

## 项目结构

```
vscode-tinyphp/
├── package.json                          # 扩展清单
├── language-configuration.json           # 语言配置
├── syntaxes/
│   └── tinyphp.tmLanguage.json           # TextMate 语法高亮
├── snippets/
│   └── tinyphp.json                      # 代码片段
├── src/
│   ├── extension.ts                      # 扩展入口 (LSP 客户端)
│   └── middleware.ts                     # LSP 中间件
├── server/
│   ├── package.json                      # 语言服务器配置
│   ├── tsconfig.json                     # 服务器 TS 配置
│   └── src/
│       ├── server.ts                     # 语言服务器主程序
│       └── tinyphp-parser.ts             # 补全/文档数据
├── images/
│   └── tinyphp-icon.png                  # 扩展图标
└── .vscode/
    ├── launch.json                       # 调试配置
    └── tasks.json                        # 构建任务
```

## 架构

本插件采用经典的 **LSP 客户端-服务器架构**：

```
┌────────────────────────────────────────┐
│  VS Code                                │
│  ┌──────────────────────────────────┐  │
│  │  vscode-tinyphp (客户端)          │  │
│  │  - 激活/停用管理                  │  │
│  │  - LanguageClient 生命周期        │  │
│  │  - 语言配置                       │  │
│  │  - 设置合并中间件                  │  │
│  └─────────────┬────────────────────┘  │
│                │ LSP (IPC)             │
│  ┌─────────────▼────────────────────┐  │
│  │  tinyphp-language-server (服务端) │  │
│  │  - 文档验证/诊断                  │  │
│  │  - 补全引擎                       │  │
│  │  - 悬停信息                       │  │
│  │  - 签名帮助                       │  │
│  │  - 文档符号                       │  │
│  │  - 跳转定义                       │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

## 许可证

MIT License — 详见 [LICENSE.txt](LICENSE.txt)
