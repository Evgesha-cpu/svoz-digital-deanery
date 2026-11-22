const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.SVOZ_TEST_URL || 'http://127.0.0.1:8001';
const output = path.resolve(__dirname, process.env.SVOZ_SCREENSHOTS ? '../contest/screenshots' : '../test-results');
const password = 'SvozDemo2026!';
const errors = [];

async function open(browser, width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error' && !/status of (401|404)\b/.test(message.text())) errors.push(message.text());
  });
  page.on('response', response => {
    const status = response.status();
    const route = new URL(response.url()).pathname;
    const expected = (status === 401 && route === '/api/dashboard') ||
      (status === 404 && /^\/api\/requests\/\d+$/.test(route));
    if (status >= 400 && !expected) errors.push(status + ' ' + route);
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  return page;
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' });
}

async function fit(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
    `Horizontal overflow at ${page.viewportSize().width}px`);
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    await workflows(browser);
    assert.deepEqual(errors, [], 'Browser or server errors');
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
async function login(page, account) {
  await page.getByLabel('Логин', { exact: true }).fill(account);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.locator('.shell').waitFor();
}

const heading = (page, name) => page.getByRole('heading', { name, exact: true }).waitFor();
const visit = async (page, hash, name) => {
  await page.goto(base + '/#' + hash);
  await heading(page, name);
  await fit(page);
};

async function workflows(browser) {
  const student = await open(browser, 1440, 1000);
  await screenshot(student, '01-login-desktop');
  await login(student, 'student1');
  await visit(student, 'today', 'Сегодня');
  await screenshot(student, '02-today-desktop');
  await visit(student, 'schedule', 'Расписание');
  await student.getByRole('button', { name: 'Неделя', exact: true }).click();
  await student.locator('.skip').focus();
  await student.keyboard.press('Enter');
  assert.equal(new URL(student.url()).hash, '#schedule');
  assert.equal(await student.locator('#main-content').evaluate(el => document.activeElement === el), true);
  await screenshot(student, '09-schedule-week-desktop');
  const mobile = await open(browser, 360, 820);
  await login(mobile, 'student1');
  await visit(mobile, 'today', 'Сегодня');
  await screenshot(mobile, '03-today-mobile-360');
  await mobile.getByRole('link', { name: 'Детали переноса' }).click();
  await heading(mobile, 'Занятие перенесено');
  await fit(mobile);
  await screenshot(mobile, '04-schedule-change-mobile');
  const note = 'Взять черновик презентации · ' + Date.now().toString().slice(-4);
  await mobile.getByRole('button', { name: 'Добавить', exact: true }).click();
  await mobile.getByLabel('Текст', { exact: true }).fill(note);
  await mobile.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await mobile.getByText(note, { exact: true }).waitFor();
  await mobile.reload();
  await mobile.getByText(note, { exact: true }).waitFor();

  await mobile.setViewportSize({ width: 390, height: 844 });
  await visit(mobile, 'study', 'Учёба');
  await heading(mobile, 'Навигатор по учёбе');
  await mobile.locator('a[href^="#subject/"]').first().click();
  await heading(mobile, 'Оценки и сроки');
  const task = 'Подготовить примеры к контрольной · ' + Date.now().toString().slice(-4);
  await mobile.getByRole('button', { name: 'Добавить', exact: true }).click();
  await mobile.getByLabel('Вид записи').selectOption('task');
  await mobile.getByLabel('Текст', { exact: true }).fill(task);
  await mobile.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await mobile.getByText(task, { exact: true }).waitFor();
  await mobile.reload();
  await mobile.getByText(task, { exact: true }).waitFor();
  await mobile.locator('button[data-action="theme"]').first().click();
  assert.equal(await mobile.locator('html').getAttribute('data-theme'), 'dark');
  await visit(mobile, 'study', 'Учёба');
  await screenshot(mobile, '05-study-dark-mobile-390');

  await mobile.setViewportSize({ width: 360, height: 820 });
  await visit(mobile, 'requests', 'Заявки');
  await mobile.locator('a[href="#new-request/study"]').click();
  const subject = 'Справка для участия в проекте · ' + Date.now().toString().slice(-4);
  await mobile.getByLabel('Тема', { exact: true }).fill(subject);
  await mobile.getByLabel('Текст заявки').fill('Прошу подготовить справку об обучении.');
  await mobile.getByRole('button', { name: 'Проверить заявку' }).click();
  await heading(mobile, 'Проверьте заявку');
  await fit(mobile);
  await mobile.getByRole('button', { name: 'Отправить заявку' }).click();
  await heading(mobile, subject);
  const ticket = new URL(mobile.url()).hash.slice(1);
  assert.match(ticket, /^ticket\/\d+$/);

  const staff = await open(browser, 1440, 980);
  await login(staff, 'dean');
  await visit(staff, 'requests', 'Обращения');
  await staff.getByRole('link').filter({ hasText: subject }).click();
  await heading(staff, subject);
  await staff.getByLabel('Изменить статус').selectOption({ label: 'В работе' });
  await staff.getByRole('button', { name: 'Обновить статус' }).click();
  await staff.locator('#toast').getByText('Статус обновлён', { exact: true }).waitFor();
  const reply = 'Справка принята в работу. Ответим здесь.';
  await staff.getByLabel('Сообщение', { exact: true }).fill(reply);
  await staff.getByRole('button', { name: 'Отправить сообщение' }).click();
  await staff.getByText(reply, { exact: true }).waitFor();
  await screenshot(staff, '06-staff-reply-desktop');

  await visit(mobile, 'notifications', 'Уведомления');
  await mobile.locator('article').filter({ hasText: reply }).getByRole('button', { name: 'Открыть заявку' }).click();
  await heading(mobile, subject);
  await mobile.getByText(reply, { exact: true }).waitFor();
  await fit(mobile);
  await mobile.waitForFunction(() => document.querySelector('#toast').textContent === '');
  await screenshot(mobile, '07-student-ticket-mobile');
  await visit(mobile, 'ask', 'Найти или спросить СВОЗ');
  await mobile.getByLabel('Что хотите найти?').fill('справку');
  await mobile.getByRole('link', { name: /Как получить справку/ }).waitFor();
  await mobile.getByRole('button', { name: 'Настроить ИИ' }).click();
  await heading(mobile, 'Включить ИИ-помощник');
  await fit(mobile);
  await screenshot(mobile, '10-ai-consent-mobile');
  await mobile.getByLabel('Разрешаю обработку этих данных').check();
  await mobile.getByRole('dialog').getByRole('button', { name: 'Включить ИИ', exact: true }).click();
  await mobile.getByRole('button', { name: 'Выключить ИИ' }).waitFor();
  await mobile.getByRole('button', { name: 'Выключить ИИ' }).click();
  await mobile.getByRole('button', { name: 'Настроить ИИ' }).waitFor();

  const second = await open(browser, 768, 1024);
  await login(second, 'student2');
  await visit(second, 'profile', 'Профиль');
  await second.getByText('Марк Демонстрационный', { exact: true }).waitFor();
  await screenshot(second, '08-second-profile-768');
  await second.goto(base + '/#' + ticket);
  await second.getByText('Заявка не найдена.', { exact: true }).waitFor();
  assert.equal(await second.getByText(reply, { exact: true }).count(), 0);
  console.log('Browser E2E passed: 3 accounts, lesson transfer, personal records, request and reply, notification, isolation, themes, 360/390/768 px.');
}
