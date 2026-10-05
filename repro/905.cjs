'use strict';

// Reproduction for issue #905: keyword arguments (Jinja2-style) passed to
// built-in filters/tests/globals are ignored or misinterpreted, and the
// synthesized keyword-args object leaks an internal `__keywords` key to
// user-registered functions and filters.
//
// Run with ROOT set to the repository root:
//   ROOT=/path/to/repo node repro/905.cjs
// Every check prints one line, marked `ok` or `BAD`. The process exits
// non-zero if anything is BAD.

const path = require('path');
const ROOT = process.env.ROOT || path.join(__dirname, '..');

const nunjucks = require(path.join(ROOT, 'nunjucks', 'index.js'));
const Environment = nunjucks.Environment;
const Loader = nunjucks.NodeResolveLoader;

const env = new Environment(new Loader(), { autoescape: false });

const users = [
  { name: 'ann', age: 20 },
  { name: 'bob', age: 30 }
];

function render(src, ctx) {
  return env.renderString(src, Object.assign({ users }, ctx));
}

let failures = 0;

function check(label, src, expected, ctx) {
  let actual;
  try {
    actual = render(src, ctx);
  } catch (e) {
    actual = 'THREW: ' + e.message;
  }
  const ok = actual === expected;
  if (!ok) {
    failures++;
  }
  console.log((ok ? 'ok  ' : 'BAD ') + label +
    ' -> ' + JSON.stringify(actual) +
    (ok ? '' : ' (expected ' + JSON.stringify(expected) + ')'));
}

// The user-registered global receives the keyword args as a plain object
// containing only the keys written in the template.
env.addGlobal('debugArgs', function debugArgs() {
  return JSON.stringify(Array.prototype.slice.call(arguments));
});

// An async filter receives the same clean keyword-args object.
env.addFilter('remote', function remote(str, kwargs, cb) {
  const query = Object.keys(kwargs || {})
    .map(k => k + '=' + kwargs[k])
    .join('&');
  cb(null, str + '?' + query);
}, true);

// ---- filters ---------------------------------------------------------------

check('truncate(length, end, killwords) keyword args',
  '{{ "hello world" | truncate(length=9, end="~", killwords=true) }}',
  'hello wor~');

check('truncate(9, end="~") mixed positional/keyword',
  '{{ "hello world" | truncate(9, end="~") }}',
  'hello~');

check('default(default_value, boolean) keyword args',
  '{{ missing | default(default_value="n/a", boolean=true) }}',
  'n/a');

check('indent(width, first) keyword args',
  '{{ "a\\nb" | indent(width=2, first=true) }}',
  '  a\n  b');

check('round(precision) keyword arg',
  '{{ 2.567 | round(precision=1) }}',
  '2.6');

check('round(1, method="floor") mixed positional/keyword',
  '{{ 2.561 | round(1, method="floor") }}',
  '2.5');

check('join(d) keyword arg',
  '{{ ["a", "b"] | join(d="-") }}',
  'a-b');

check('join(d, attribute) keyword args',
  '{{ users | join(", ", attribute="name") }}',
  'ann, bob');

check('replace("a", "b", count) keyword arg',
  '{{ "aaa" | replace("a", "b", count=2) }}',
  'bba');

check('sum(attribute, start) keyword args',
  '{{ users | sum(attribute="age", start=1) }}',
  '51');

// ---- tests -----------------------------------------------------------------

check('divisibleby(num) keyword arg',
  '{% if 9 is divisibleby(num=3) %}yes{% else %}no{% endif %}',
  'yes');

// ---- globals ---------------------------------------------------------------

check('joiner(sep) keyword arg',
  '{% set comma = joiner(sep=" | ") %}' +
  '{% for u in users %}{{ comma() }}{{ u.name }}{% endfor %}',
  'ann | bob');

// ---- user-registered callables --------------------------------------------

check('global function kwargs object has no internal keys',
  '{{ debugArgs(1, mode="x") }}',
  '[1,{"mode":"x"}]');

// ---- positional and already-working call styles must stay working ----------

check('positional args + sort(reverse=true) keyword arg (regression)',
  '{{ "hello world" | truncate(9, true, "~") }}|' +
  '{{ [1, 2, 3] | sort(reverse=true) | join(",") }}',
  'hello wor~|3,2,1');

// Report the async filter result
env.renderString('{{ "remote" | remote(lang="zh") }}', {}, (err, res) => {
  if (err) {
    failures++;
    console.log('BAD  async remote filter -> THREW: ' + err.message);
  } else {
    const ok = res === 'remote?lang=zh';
    if (!ok) {
      failures++;
    }
    console.log((ok ? 'ok  ' : 'BAD ') +
      'async filter kwargs object has no internal keys -> ' +
      JSON.stringify(res) + (ok ? '' : ' (expected "remote?lang=zh")'));
  }

  if (failures) {
    console.log('BAD  ' + failures + ' check(s) failed');
    process.exit(1);
  }
  console.log('ok  all checks passed');
});
