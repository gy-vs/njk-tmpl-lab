'use strict';

// Repro: keyword arguments (Jinja2 style) are silently mishandled by most
// builtin filters, tests and globals, and the internal `__keywords` marker
// leaks into the kwargs object handed to user-registered functions.
//
// Usage: ROOT=<repo root> node repro/905.cjs
// Every check prints one line prefixed with "ok" or "BAD".

const path = require('path');

const ROOT = process.env.ROOT || path.resolve(__dirname, '..');
const nunjucks = require(path.join(ROOT, 'nunjucks', 'index.js'));

const users = [
  {name: 'ann', age: 20},
  {name: 'bob', age: 30}
];

let failed = 0;

function report(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) {
    failed++;
  }
  console.log(
    (ok ? 'ok' : 'BAD') + ' ' + name +
    (ok ? '' : ' -- expected ' + JSON.stringify(expected) +
      ', got ' + JSON.stringify(actual)));
}

function render(tpl, ctx) {
  const env = new nunjucks.Environment(null, {autoescape: false});
  return env.renderString(tpl, ctx || {users: users});
}

function renderAsync(env, tpl, ctx) {
  return new Promise((resolve, reject) => {
    env.renderString(tpl, ctx, (err, res) => {
      if (err) {
        reject(err);
      } else {
        resolve(res);
      }
    });
  });
}

async function main() {
  // --- builtin filters: keyword form must match the positional form ---

  report('truncate kwargs',
    render('{{ "hello world" | truncate(length=9, end="~", killwords=true) }}'),
    'hello wor~');

  report('truncate positional',
    render('{{ "hello world" | truncate(9, true, "~") }}'),
    'hello wor~');

  report('truncate mixed positional+kwargs',
    render('{{ "hello world" | truncate(9, end="~") }}'),
    'hello~');

  report('default kwargs',
    render('{{ none | default(default_value="n/a", boolean=true) }}'),
    'n/a');

  report('indent kwargs',
    render('{{ "a\\nb" | indent(width=2, first=true) }}'),
    '  a\n  b');

  report('round precision kwarg',
    render('{{ 2.567 | round(precision=1) }}'),
    '2.6');

  report('round method kwarg',
    render('{{ 2.561 | round(1, method="floor") }}'),
    '2.5');

  report('join d kwarg',
    render('{{ ["a", "b"] | join(d="-") }}'),
    'a-b');

  report('join attribute kwarg',
    render('{{ users | join(", ", attribute="name") }}'),
    'ann, bob');

  report('replace count kwarg',
    render('{{ "aaa" | replace("a", "b", count=2) }}'),
    'bba');

  report('sum attribute+start kwargs',
    render('{{ users | sum(attribute="age", start=1) }}'),
    '51');

  // --- builtin tests ---

  report('divisibleby num kwarg',
    render('{{ 9 is divisibleby(num=3) }}'),
    'true');

  // --- globals ---

  report('joiner sep kwarg',
    render('{% set j = joiner(sep=" | ") %}' +
      '{% for u in users %}{{ j() }}{{ u.name }}{% endfor %}'),
    'ann | bob');

  // --- user-registered functions/filters: no __keywords leak ---

  const envGlobal = new nunjucks.Environment(null, {autoescape: false});
  envGlobal.addGlobal('debugArgs', function debugArgs() {
    return JSON.stringify(Array.prototype.slice.call(arguments));
  });
  report('custom global kwargs object',
    envGlobal.renderString('{{ debugArgs(1, mode="x") }}'),
    '[1,{"mode":"x"}]');

  const envAsync = new nunjucks.Environment(null, {autoescape: false});
  let asyncKwargs = null;
  envAsync.addFilter('remote', function remote(input, kwargs, cb) {
    asyncKwargs = JSON.stringify(kwargs);
    cb(null, input);
  }, true);
  await renderAsync(envAsync, '{{ "x" | remote(lang="zh") }}');
  report('custom async filter kwargs object', asyncKwargs, '{"lang":"zh"}');

  // --- already-working forms; must keep working ---

  const keepPairs = [
    ['{{ "hello world" | truncate(9, true, "~") }}', 'hello wor~'],
    ['{{ none | default("n/a", true) }}', 'n/a'],
    ['{{ "a\\nb" | indent(2, true) }}', '  a\n  b'],
    ['{{ 2.567 | round(1) }}', '2.6'],
    ['{{ ["a", "b"] | join("-") }}', 'a-b'],
    ['{{ "aaa" | replace("a", "b", 2) }}', 'bba'],
    ['{{ users | sum("age", 1) }}', '51'],
    ['{{ [3, 1, 2] | sort(reverse=true) | join(",") }}', '3,2,1'],
    ['{{ "0x4d32" | int(base=16) }}', '19762']
  ];
  const keepActual = keepPairs.map((p) => render(p[0])).join('|');
  const keepExpected = keepPairs.map((p) => p[1]).join('|');
  report('positional forms and sort/int kwargs (must stay ok)',
    keepActual, keepExpected);

  console.log((failed === 0 ? 'ok' : 'BAD') + ' summary: ' + failed +
    ' failing check(s)');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
