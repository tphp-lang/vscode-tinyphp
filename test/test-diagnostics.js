'use strict';

// Standalone test for diagnostic regex patterns (no LSP dependency)
// Run: node test/test-diagnostics.js

let passed = 0;
let failed = 0;

function assert(condition, testName, detail) {
    if (condition) {
        passed++;
        console.log(`  PASS: ${testName}`);
    } else {
        failed++;
        console.log(`  FAIL: ${testName} — ${detail || ''}`);
    }
}

// ============================================================
// Bug 1: yield detection (was \bysield\b)
// ============================================================
console.log('\n[Fix 1] yield detection regex');

const yieldRegex = /\byield\b/;
assert(yieldRegex.test('        yield $gen;'), 'yield keyword in code');
assert(yieldRegex.test('return yield $gen;'), 'yield after return');
assert(!yieldRegex.test('        ysield $gen;'), 'typo "ysield" should NOT match');
assert(!yieldRegex.test('this_is_not_yield'), 'non-yield word should NOT match');
assert(!yieldRegex.test(''), 'empty line should NOT match');

// ============================================================
// Bug 2: magic method range (__call, __get, __set, __callStatic)
// ============================================================
console.log('\n[Fix 2] magic method detection + range');

const magicRegex = /function\s+(__call|__get|__set|__callStatic)\b/;
const testCases2 = [
    { line: '    public function __call($name, $args) {}', expected: '__call' },
    { line: '    public function __get($name) {}', expected: '__get' },
    { line: '    public function __set($name, $val) {}', expected: '__set' },
    { line: '    public static function __callStatic($name, $args) {}', expected: '__callStatic' },
];
for (const tc of testCases2) {
    const m = tc.line.match(magicRegex);
    assert(m !== null, `detect ${tc.expected}`, `regex returned null`);
    if (m) {
        assert(m[1] === tc.expected, `captured name is ${tc.expected}`, `got "${m[1]}"`);
        const idx = tc.line.indexOf(m[1]);
        const rangeLen = m[1].length;
        assert(rangeLen === tc.expected.length, `range length = ${tc.expected.length} for ${tc.expected}`, `got ${rangeLen}`);
    }
}
assert(!magicRegex.test('    public function __toString() {}'), '__toString should NOT match');
assert(!magicRegex.test('    function myFunc() {}'), 'normal function should NOT match');

// ============================================================
// Bug 3: nullable type range (?int, ?string, etc.)
// ============================================================
console.log('\n[Fix 3] nullable type detection + range');

const nullableRegex = /\?\s*(int|float|string|bool)\b/;
const nullableTests = [
    { input: '?int', expected: '?int' },
    { input: '? float', expected: '? float' },
    { input: '?string', expected: '?string' },
    { input: '? bool', expected: '? bool' },
    { input: '?int|null', expected: '?int' },
];
for (const tc of nullableTests) {
    const m = tc.input.match(nullableRegex);
    assert(m !== null, `match "${tc.input}"`, 'returned null');
    if (m) {
        assert(m[0] === tc.expected, `full match = "${tc.expected}"`, `got "${m[0]}"`);
        assert(m[0].length > 1, `range covers full type (len=${m[0].length})`, 'len <= 1');
    }
}
assert(!nullableRegex.test('int'), 'bare "int" should NOT match');
assert(!nullableRegex.test('$x'), 'variable should NOT match');

// ============================================================
// Bug 4: untyped parameter detection regex
// ============================================================
console.log('\n[Fix 4] untyped parameter regex');

function checkUntyped(paramsStr) {
    // Simulate the logic from server.ts line 317
    const untypedParams = paramsStr.match(/(?:^|,)\s*(\$[a-zA-Z_]\w*)/g);
    if (!untypedParams) return [];
    const untyped = [];
    for (const p of untypedParams) {
        const clean = p.replace(/^[,\s]+/, '').trim();
        if (!new RegExp('\\w+\\s+' + clean.replace('$', '\\$')).test(paramsStr)) {
            untyped.push(clean);
        }
    }
    return untyped;
}

// Typed params should NOT be flagged
assert(checkUntyped('int $x, string $y').length === 0, 'typed params (int $x, string $y) → 0 warnings');
assert(checkUntyped('Demo $obj').length === 0, 'typed param (Demo $obj) → 0 warnings');
assert(checkUntyped('int $argc, array $argv').length === 0, 'typed params (int $argc, array $argv) → 0 warnings');

// Untyped params SHOULD be flagged
const untyped1 = checkUntyped('$x');
assert(untyped1.length === 1 && untyped1[0] === '$x', 'untyped param ($x) → 1 warning for $x');

const untyped2 = checkUntyped('$x, $y');
assert(untyped2.length === 2, 'two untyped params ($x, $y) → 2 warnings', `got ${untyped2.length}`);

// ============================================================
// Bug 5: Reflection class range
// ============================================================
console.log('\n[Fix 5] Reflection class detection + range');

const reflTests = [
    { input: 'new ReflectionClass($obj)', name: 'ReflectionClass', len: 15 },
    { input: 'new ReflectionMethod($cls, $m)', name: 'ReflectionMethod', len: 16 },
    { input: 'new ReflectionFunction($fn)', name: 'ReflectionFunction', len: 18 },
    { input: 'new ReflectionProperty($cls, $p)', name: 'ReflectionProperty', len: 18 },
];
for (const tc of reflTests) {
    const m = tc.input.match(/new\s+(Reflection\w+)/);
    assert(m !== null, `detect ${tc.name}`, 'returned null');
    if (m) {
        assert(m[1] === tc.name, `captured ${tc.name}`, `got "${m[1]}"`);
        assert(m[1].length === tc.len, `range length = ${tc.len}`, `got ${m[1].length}`);
    }
}

// ============================================================
// New unsupported feature diagnostics
// ============================================================
console.log('\n[New] Unsupported feature diagnostics');

const unsupportedTests = [
    { pattern: /\bassert\s*\(/, keyword: 'assert', label: 'assert($str)' },
    { pattern: /\bcreate_function\s*\(/, keyword: 'create_function', label: 'create_function()' },
    { pattern: /\bcompact\s*\(/, keyword: 'compact', label: 'compact()' },
    { pattern: /\bextract\s*\(/, keyword: 'extract', label: 'extract()' },
    { pattern: /\bdebug_backtrace\s*\(/, keyword: 'debug_backtrace', label: 'debug_backtrace()' },
    { pattern: /\bget_defined_vars\s*\(/, keyword: 'get_defined_vars', label: 'get_defined_vars()' },
    { pattern: /\bfunc_get_args\s*\(/, keyword: 'func_get_args', label: 'func_get_args()' },
    { pattern: /\$GLOBALS\b/, keyword: '$GLOBALS', label: '$GLOBALS' },
];

for (const tc of unsupportedTests) {
    assert(tc.pattern.test(`    ${tc.keyword}()`), `detect ${tc.label}`, `regex failed`);
    assert(tc.pattern.test(`    return ${tc.keyword}()`), `detect ${tc.label} in expression`, `regex failed`);
}

// Verify $GLOBALS detection
assert(/\$GLOBALS\b/.test('    $x = $GLOBALS["foo"];'), 'detect $GLOBALS in usage');
assert(!/\$GLOBALS\b/.test('    $global = 1;'), 'non-$GLOBALS should NOT match');

// Verify variadic detection
assert(/\.\.\.\$[a-zA-Z_]\w*/.test('function foo(int ...$args)'), 'detect ...$args');
assert(/\.\.\.\$[a-zA-Z_]\w*/.test('function foo(...$rest)'), 'detect ...$rest');
assert(!/\.\.\.\$[a-zA-Z_]\w*/.test('function foo(int $x)'), 'non-variadic should NOT match');

// Verify namespace block form detection
const nsBlockRegex = /^\s*namespace\s+\w.*\{/;
assert(nsBlockRegex.test('namespace App {'), 'detect namespace block form');
assert(!nsBlockRegex.test('namespace App;'), 'namespace semicolon form should NOT match');

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}`);

process.exit(failed > 0 ? 1 : 0);
