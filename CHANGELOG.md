# Changelog

## [0.1.0] - Initial Release

### Added
- Syntax highlighting for TinyPHP language
- Language configuration (bracket matching, auto-closing, indentation rules)
- Language Server Protocol (LSP) support:
  - Diagnostics (syntax errors, unsupported features, unbalanced braces)
  - Autocomplete (keywords, functions, types, snippets)
  - Hover information (built-in functions, keywords, types)
  - Signature help (function parameter hints)
  - Document symbols (classes, functions, namespaces)
  - Go to definition (functions, classes, variables)
- Code snippets (35+ snippets for common patterns)
- TinyPHP-specific features:
  - Preprocessor directives (#include, #callback, #flag, #import, #debug)
  - C interop types (c_int, c_float, c_str, c_bool)
  - PHP-C bridge types (php_int, php_float, php_str, php_bool)
  - C interop function call syntax (C->func())
- Comprehensive built-in function documentation
- Keyword hover documentation
