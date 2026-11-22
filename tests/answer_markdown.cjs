const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../web/app.js'), 'utf8');
const render = vm.runInNewContext(source.slice(source.indexOf('const escape ='), source.indexOf('const icon =')) +
  '\nanswerMarkdown', { URL });
const result = render([
  '**План** на неделю', '', '- Сначала задача', '- Затем *подготовка*', '',
  '| Дело | Срок |', '| --- | --- |', '| Сдать | Сегодня |', '',
  '[Справка](https://example.org/help)', '',
  '<img src=x onerror=alert(1)> [XSS](javascript:alert%281%29) [data](data:text/html,%3Cscript%3E)',
].join('\n'));
for (const html of ['<strong>План</strong>', '<ul><li>', '<em>подготовка</em>', '<table>',
  'href="https://example.org/help"', '&lt;img']) assert.ok(result.includes(html), html);
assert.doesNotMatch(result, /<img|href="(?:javascript|data):/i);
console.log('Answer Markdown formatting and escaping passed.');
