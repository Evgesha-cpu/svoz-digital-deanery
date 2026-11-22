const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.SVOZ_TEST_URL || 'http://127.0.0.1:8001';
const shots = process.env.SVOZ_CAMPUS_SCREENSHOTS;
const errors = [];
const mainHeading = (page, name) => page.locator('main h1').getByText(name, {exact:true});
const button = (page, name) => page.getByRole('button', {name,exact:true});

async function login(page, role) {
  await page.locator('input[name=login]').fill(role);
  await page.locator('input[name=password]').fill('SvozDemo2026!');
  await button(page,'Войти').click();
  await page.locator('.shell').waitFor();
}
async function switchRole(page, role) {
  await page.goto(base + '/#profile');
  await page.locator('[data-action=logout]').click();
  await login(page, role);
}
async function go(page, route) {
  await page.goto(base + '/#' + route);
}
async function fit(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}
async function shot(page, name) {
  if (!shots) return;
  fs.mkdirSync(shots,{recursive:true});
  await page.screenshot({path:path.join(shots,name + '.png'),animations:'disabled'});
}
async function enterEvent(page, title) {
  const form = page.locator('[data-form=campus-editor]');
  await form.locator('[name=title]').fill(title);
  await form.locator('[name=description]').fill('Открытая встреча и обсуждение студенческих проектов.');
  await form.locator('[name=category]').selectOption('education');
  const today = await page.evaluate(async () => (await (await fetch('/api/dashboard')).json()).today);
  const date = new Date(today + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()+3);
  await form.locator('[name=starts_at]').fill(date.toISOString().slice(0,10) + 'T18:30');
  await form.locator('[name=location]').fill('Корпус А, аудитория 204');
  await form.locator('button[type=submit]').click();
  await mainHeading(page,title).waitFor();
  return new URL(page.url()).hash.slice(1);
}
async function changeStatus(page, status) {
  const action = page.locator('[data-action="campus-status:' + status + '"]');
  await action.click();
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) {
    await dialog.getByRole('button',{name:'Подтвердить',exact:true}).click();
  }
  await action.waitFor({state:'detached'});
}

async function run() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: process.env.SVOZ_HOST_RULE ? ['--host-resolver-rules='+process.env.SVOZ_HOST_RULE] : [],
  });
  try {
    const page = await browser.newPage({viewport:{width:360,height:850}});
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {if(response.status()>=500)errors.push(response.status()+' '+response.url());});
    await page.goto(base);
    await login(page,'student1');
    await go(page,'campus');
    await mainHeading(page,'Кампус').waitFor();
    await fit(page);
    await shot(page,'15-campus-events-mobile');
    await go(page,'campus-new');
    const title = 'Обмен идеями для проекта ' + Date.now().toString().slice(-5);
    const route = await enterEvent(page,title);
    assert.match(route,/^campus-event\/\d+$/);
    await switchRole(page,'dean');
    await go(page,route);
    await mainHeading(page,title).waitFor();
    await changeStatus(page,'published');
    await fit(page);
    await shot(page,'16-campus-moderation-mobile');
    await switchRole(page,'student2');
    await go(page,route);
    await button(page,'Записаться на событие').click();
    await page.getByText('Вы записаны',{exact:true}).waitFor();
    await page.reload();
    await page.getByText('Вы записаны',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Включить тёмную тему'}).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await fit(page);
    await shot(page,'17-campus-participation-dark-mobile');
    await button(page,'Отменить запись').click();
    await button(page,'Записаться на событие').waitFor();
    await go(page,'campus');
    await page.locator('[data-action="campus-tab:clubs"]').click();
    await page.locator('[data-action^="campus-club-join:"]').first().waitFor();
    await fit(page);
    await shot(page,'18-campus-clubs-dark-mobile');
    await switchRole(page,'student1');
    await go(page,'notifications');
    await page.getByText(title,{exact:false}).first().waitFor();
    await fit(page);
    assert.deepEqual(errors,[]);
    console.log('Campus Chromium: proposal, moderation, signup, persistence, withdrawal, notification, clubs, 360px, both themes.');
  } finally { await browser.close(); }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
