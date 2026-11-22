const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SVOZ_TEST_URL || 'http://127.0.0.1:8001';

async function run() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: process.env.SVOZ_HOST_RULE ? ['--host-resolver-rules=' + process.env.SVOZ_HOST_RULE] : [],
  });
  try {
    const page = await browser.newPage({viewport:{width:360,height:850}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/ai/chat', route => route.fulfill({json:{
      answer:'**План** на неделю\n\n1. Сделать срочное\n2. Начать подготовку\n\n[Справка](https://example.org/help)\n\n' +
        '<img src=x onerror="window.injected=true"> [XSS](javascript:alert%281%29)\n\n' +
        '| Учебное дело | Срок |\n| --- | --- |\n| СверхдлинноеНаименованиеДляПроверкиПереноса | Сегодня |',
      proposal:null, sources:[],
    }}));
    await page.goto(base);
    await page.locator('[name=login]').fill('student1');
    await page.locator('[name=password]').fill('SvozDemo2026!');
    await page.getByRole('button',{name:'Войти'}).click();
    await page.getByRole('heading',{name:'Сегодня',exact:true}).waitFor();
    await page.locator('a[href="#ask"]').filter({visible:true}).first().click();
    await page.getByRole('heading',{name:'Помощник СВОЗ',exact:true}).waitFor();
    await page.getByRole('button',{name:'Настроить ИИ'}).click();
    await page.getByLabel('Разрешаю обработку этих данных').check();
    await page.getByRole('dialog').getByRole('button',{name:'Включить ИИ',exact:true}).click();
    const suggestions = page.locator('.ai-quick button');
    await suggestions.first().waitFor();
    assert.equal(await suggestions.count(),4);
    await suggestions.first().click();
    assert.match(await page.getByLabel('Ваш вопрос').inputValue(),/подготов|сроч/);
    await page.getByRole('button',{name:'Спросить СВОЗ'}).click();
    const answer = page.locator('.answer-content');
    await answer.locator('strong').waitFor();
    assert.equal(await answer.locator('ol li').count(),2);
    assert.equal(await answer.getByRole('link',{name:'Справка'}).getAttribute('href'),'https://example.org/help');
    assert.equal(await answer.locator('img, a[href^="javascript:"]').count(),0);
    assert.equal(await answer.getByRole('table').count(),1);
    assert.equal(await page.evaluate(()=>window.injected),undefined);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
    await page.getByRole('button',{name:'Включить тёмную тему'}).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
    assert.deepEqual(errors,[]);
    console.log('Chromium: prompt shortcuts, Markdown, XSS, light/dark and 360 px passed.');
  } finally { await browser.close(); }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
