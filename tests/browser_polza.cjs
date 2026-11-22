const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.SVOZ_TEST_URL || 'http://127.0.0.1:8001';
const output = path.resolve(__dirname, '../contest/screenshots');
const usage = [];
const errors = [];

async function login(browser, account, width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 500) errors.push(response.status() + ' ' + response.url());
  });
  await page.goto(base);
  await page.getByLabel('Логин', { exact: true }).fill(account);
  await page.getByLabel('Пароль', { exact: true }).fill('SvozDemo2026!');
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.locator('.shell').waitFor();
  return page;
}

async function consent(page) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Разрешаю обработку этих данных').check();
  await dialog.getByRole('button', { name: 'Включить ИИ', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
}

async function ask(page, button) {
  const [response] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/ai/chat'), { timeout: 35000 }),
    button.click(),
  ]);
  assert.equal(response.status(), 200);
  const result = await response.json();
  usage.push(result.usage);
  assert.equal(result.transport, 'tool');
  return result;
}

async function shot(page, name) {
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  assert.equal(fits, true);
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' });
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    if (!process.argv.includes('--staff-only')) {
      const student = await login(browser, 'student1', 360, 850);
      await student.goto(base + '/#ask/lesson/2');
      await student.getByRole('button', { name: 'Настроить ИИ' }).click();
      await consent(student);
      await student.getByRole('button', { name: 'Включить тёмную тему' }).click();
      await student.getByLabel('Ваш вопрос').fill('Предложи создать заметку к этому занятию: взять распечатку эскиза.');
      const note = await ask(student, student.getByRole('button', { name: 'Спросить СВОЗ' }));
      assert.equal(note.proposal?.kind, 'note');
      await student.getByRole('button', { name: 'Проверить и сохранить' }).click();
      await shot(student, '11-polza-note-mobile-dark');
      await student.getByRole('dialog').getByRole('button', { name: 'Подтвердить', exact: true }).click();
      await student.getByText('Сохранено', { exact: true }).waitFor();

    }
    const dean = await login(browser, 'dean', 768, 1000);
    await dean.goto(base + '/#ticket/1');
    await dean.getByText('Помощник СВОЗ по заявке', { exact: true }).click();
    await dean.getByRole('button', { name: 'Подключить помощника' }).click();
    await consent(dean);
    const panel = dean.locator('.staff-ai');
    await panel.locator('[data-action="staff-ai:reply"]').waitFor({state: 'attached'});
    if (await panel.getAttribute('open') === null) {
      await panel.locator('summary').click();
    }
    await ask(dean, panel.locator('[data-action="staff-ai:reply"]'));
    await panel.getByRole('button', { name: 'Вставить в поле ответа' }).waitFor();
    await shot(dean, '12-polza-staff-draft-light');
    await panel.getByRole('button', { name: 'Вставить в поле ответа' }).click();
    assert.ok(await dean.getByLabel('Сообщение', { exact: true }).inputValue());
    assert.deepEqual(errors, []);
    console.log('Live browser Polza: student confirmation and staff draft; 360/768 px, dark/light.', JSON.stringify(usage));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
