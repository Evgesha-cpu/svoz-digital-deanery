'use strict';

const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const toast = document.querySelector('#toast');
const root = document.documentElement;
const statuses = ['Отправлена', 'В работе', 'Нужна информация', 'Готова', 'Отклонена'];
const demoPassword = 'SvozDemo2026!';
const nav = [
  ['today', 'Сегодня', 'home'], ['schedule', 'Расписание', 'calendar'],
  ['study', 'Учёба', 'book'], ['requests', 'Заявки', 'file'],
];
const icons = {
  home: 'M3 10 12 3l9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 21v-8h6v8',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M7 3v5m10-5v5M3 10h18m-14 5h3m4 0h3',
  book: 'M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1zm0 0v14',
  file: 'M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M14 3v5h4M8 12h7m-7 4h7',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9zm-8 12a2 2 0 0 0 4 0',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zm-4-9v2m0 14v2m9-9h-2M5 12H3m15.4-6.4-1.4 1.4M7 17l-1.4 1.4m12.8 0L17 17M7 7 5.6 5.6',
  moon: 'M20.5 15.5A9 9 0 0 1 8.5 3.5a9 9 0 1 0 12 12z',
  search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0zm-1.5 4.5 5 5',
  arrow: 'M5 12h14m-6-6 6 6-6 6', back: 'M19 12H5m6 6-6-6 6-6',
  plus: 'M12 5v14M5 12h14', check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M18 6 6 18', Edit: 'm5 13 9-9 5 5-9 9-6 2zm7-7 5 5',
  dots: 'M5 7h14M5 12h14M5 17h14', clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9-5v5l3 2',
};
const state = {};
let sessionVersion = 0;
let renderToken = 0;
function clearSession() {
  sessionVersion += 1;
  renderToken += 1;
  Object.assign(state,{data:null,day:null,mode:'day',ticketFilter:'',itemFilter:'open',ticket:null,preview:null,aiTurns:[],aiDraft:null,staffAi:new Map(),aiGeneration:0,aiPending:false});
  if (dialog.open) dialog.close();
}
clearSession();
let toastTimer;

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => (
  {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]
));
const icon = name => `<svg class="i" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="${icons[name]}"/></svg>`;
const action = (name, label, classes = '', glyph = '') => `<button type="button" data-action="${name}" class="${classes}">${glyph ? icon(glyph) : ''}${label}</button>`;
const link = (url, label, classes = '', glyph = '') => `<a href="#${url}" class="${classes}">${glyph ? icon(glyph) : ''}${label}</a>`;
const empty = message => `<p class="empty">${message}</p>`;
const chip = (label, tone = '') => `<span class="chip ${tone}">${escape(label)}</span>`;
const titleRow = (title, extra = '') => `<div class="section-head"><h2>${title}</h2>${extra}</div>`;
const errorBox = '<p class="error" role="alert" data-error></p>';
const asDate = value => new Date(`${String(value).slice(0,10)}T12:00:00Z`);
const formatDay = (value, options = {}) => value ? asDate(value).toLocaleDateString('ru-RU', {timeZone:'UTC',day:'numeric',month:'long',...options}) : '—';
const shortDate = value => formatDay(value, {month:'short'});
const sentence = value => value.charAt(0).toLocaleUpperCase('ru-RU') + value.slice(1);
function stamp(value) {
  const dt = new Date(String(value).replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(value) ? '' : 'Z'));
  return Number.isNaN(dt.valueOf()) ? escape(value) : dt.toLocaleString('ru-RU', {timeZone:'Europe/Moscow',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
}
function plusDays(value, days) {
  const dt = asDate(value);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0,10);
}
function weekDays(value) {
  const monday = plusDays(value, -((asDate(value).getUTCDay()+6)%7));
  return Array.from({length:7}, (_, i) => plusDays(monday, i));
}
function route() {
  const raw = location.hash.slice(1);
  return raw && raw !== 'main-content' ? raw.split('/').map(value => {
    try { return decodeURIComponent(value); } catch { return value; }
  }) : [state.data?.user.role === 'staff' ? 'requests' : 'today'];
}
function go(url) {
  if (location.hash === '#' + url) render();
  else location.hash = url;
}
function readTheme() {
  try { return localStorage.getItem('svoz-theme'); } catch { return null; }
}
function setTheme(mode, remember = false) {
  root.dataset.theme = mode;
  document.querySelector('meta[name=theme-color]').content = mode === 'dark' ? '#12191A' : '#F5F4EF';
  if (remember) {
    try { localStorage.setItem('svoz-theme', mode); } catch { /* theme still applies for this visit */ }
  }
}
setTheme(readTheme() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

async function api(path, method = 'GET', data) {
  const response = await fetch('/api' + path, {method, ...(data === undefined ? {} : {
    headers:{'Content-Type':'application/json'}, body:JSON.stringify(data),
  })});
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'Не удалось выполнить запрос. Попробуйте ещё раз.');
    error.status = response.status;
    throw error;
  }
  return result;
}
async function refresh() {
  const version = sessionVersion;
  const latest = await api('/dashboard');
  if (version !== sessionVersion) return;
  state.data = latest;
  state.day ??= state.data.today;
}
function announce(message) {
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.textContent = ''; }, 3800);
}
function showDialog(title, content) {
  dialog.innerHTML = `<div class="row-between dialog-head"><h2 id="dialog-title">${title}</h2><button type="button" class="icon-button" aria-label="Закрыть" data-action="close">${icon('close')}</button></div>${content}`;
  if (!dialog.open) dialog.showModal();
}
function brand(url) {
  const content = '<span class="brand-mark" aria-hidden="true"></span><span><strong>СВОЗ</strong><small>Цифровой деканат</small></span>';
  return url ? link(url, content, 'brand') : `<div class="brand">${content}</div>`;
}
function themeButton() {
  const dark = root.dataset.theme === 'dark';
  const label = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
  return `<button type="button" data-action="theme" class="icon-button" title="${label}" aria-label="${label}">${icon(dark ? 'sun' : 'moon')}</button>`;
}
function login() {
  app.innerHTML = `<main id="main-content" class="login-layout">
    <section class="card hero login-intro">${brand()}
      <h1>Цифровой деканат будущего</h1>
      <p class="lead">Учёба, расписание, справки и связь с деканатом в одном кабинете.</p>
      <p class="meta">СВОЗ — Современное Вайбоградское Обучающее Заведение. Конкурсный прототип с вымышленными данными.</p>
      <div>${themeButton()}</div>
    </section>
    <section class="card login-panel"><h2>Вход в кабинет</h2>
      <form class="form" id="login-form" data-form="login">
        <label>Логин<input name="login" autocomplete="username" required maxlength="80"></label>
        <label>Пароль<input name="password" type="password" autocomplete="current-password" required maxlength="120"></label>
        ${errorBox}<button class="primary" type="submit">Войти ${icon('arrow')}</button>
      </form>
      <div class="demo-accounts"><h3>Доступ для жюри</h3><p class="meta">Выберите роль, чтобы заполнить форму.</p>
        ${[['student1','Студент · аккаунт 1'],['student2','Студент · аккаунт 2'],['dean','Сотрудник деканата']].map(([id,label]) =>
          action('demo:' + id, `<span class="account-label">${label}<small>${id}</small></span>${icon('arrow')}`, 'button')).join('')}
      </div>
    </section></main>`;
}
function shell(section, body) {
  const {user, notifications} = state.data;
  const staff = user.role === 'staff';
  const active = section === 'lesson' ? 'schedule' : section === 'subject' ? 'study' : ['ticket','new-request'].includes(section) ? 'requests' : section;
  const shortName = user.name.trim().split(/\s+/).slice(0,2).map(word => word[0]).join('');
  const unread = notifications.filter(n => !n.read).length;
  const entries = staff ? [['requests', 'Обращения', 'file']] : nav;
  const navigation = entries.map(([id, label, glyph]) => `<a class="nav-link" href="#${id}"${active === id ? ' aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span></a>`).join('');
  app.innerHTML = `<div class="shell">
    <aside class="sidebar">${brand(staff ? 'requests' : 'today')}
      <nav aria-label="Разделы кабинета">${navigation}</nav>
      <p class="sidebar-foot">СВОЗ · Конкурсный прототип<br>Вымышленное учебное заведение</p>
    </aside>
    <div><header class="topbar">${brand(staff ? 'requests' : 'today')}
      <span class="desktop-label meta">${staff ? 'Кабинет сотрудника' : escape(user.group) + ' · Личный кабинет'}</span>
      <div class="top-actions">
        ${staff ? '' : `<a href="#ask" class="button icon-button" aria-label="Найти или спросить СВОЗ" title="Найти или спросить СВОЗ">${icon('search')}</a>`}
        <a href="#notifications" class="button icon-button" title="Уведомления" aria-label="Уведомления${unread ? ', непрочитанных ' + unread : ''}">${icon('bell')}${unread ? `<span aria-hidden="true" class="unread-dot">${unread}</span>` : ''}</a>
        ${themeButton()}<a class="button avatar" href="#profile" aria-label="Профиль" title="Профиль">${escape(shortName)}</a>
      </div></header>
      <main class="main ${staff ? 'staff' : ''}" id="main-content" tabindex="-1">${body}<footer class="main-footer">СВОЗ — вымышленное учебное заведение. Конкурсный прототип, не официальный университетский сервис.</footer></main>
    </div>${staff ? '' : `<nav class="bottom-nav" aria-label="Разделы кабинета">${navigation}</nav>`}
  </div>`;
}
const pageHead = (title, caption = '', back = '') => `<div class="page-head stack">${back}<div><h1>${title}</h1>${caption ? `<p class="muted">${caption}</p>` : ''}</div></div>`;
const backLink = (url, label) => `<div>${link(url, label, 'button quiet', 'back')}</div>`;
const statusChip = status => chip(status, status === 'Готова' ? 'success' : status === 'Нужна информация' ? 'warn' : status === 'Отклонена' ? 'danger' : 'accent');
const hasChange = lesson => !!(lesson.changed_at || lesson.old_date || lesson.old_start || lesson.old_room);
const findLesson = id => state.data.lessons.find(lesson => String(lesson.id) === String(id));
const subjects = () => Array.from(new Set([...state.data.grades, ...state.data.lessons].map(row => row.subject)));
function diff(lesson) {
  const old = `${shortDate(lesson.old_date || lesson.date)}, ${lesson.old_start || lesson.start} · ${lesson.old_room || lesson.room}`;
  const updated = `${shortDate(lesson.date)}, ${lesson.start} · ${lesson.room}`;
  return `<div class="diff"><div><small>Было</small><s>${escape(old)}</s></div>${icon('arrow')}<div><small>Стало</small><strong>${escape(updated)}</strong></div></div>`;
}
function lessonRow(lesson) {
  return `<a class="list-row list-link lesson" href="#lesson/${escape(lesson.id)}">
    <span class="lesson-time">${escape(lesson.start)}<small>${escape(lesson.end)}</small></span>
    <div><h3>${escape(lesson.subject)}</h3><p class="meta">${escape(lesson.kind)} · ${escape(lesson.teacher)}</p>
    <div class="row-wrap">${chip('Ауд. ' + lesson.room)}${hasChange(lesson) ? chip('Перенесено', 'warn') : ''}</div></div>
    <span class="arrow">${icon('arrow')}</span></a>`;
}
const lessonList = (lessons, message = 'Занятий в этот день нет.') => lessons.length ? `<div class="list">${lessons.map(lessonRow).join('')}</div>` : empty(message);
function sortedLessons() {
  return [...state.data.lessons].sort((a,b) => (a.date + a.start).localeCompare(b.date + b.start));
}
function itemRow(item) {
  const id = escape(item.id);
  const lesson = findLesson(item.lesson_id);
  const meta = [item.kind === 'task' ? 'Задача' : 'Заметка', item.subject || lesson?.subject, item.due ? shortDate(item.due) : ''].filter(Boolean).join(' · ');
  const highlight = route()[0] === 'items' && route()[1] === String(item.id);
  return `<div class="list-row item${highlight ? ' highlight' : ''}"><div class="content"><p class="${item.done ? 'done' : ''}">${escape(item.text)}</p><div class="meta">${escape(meta)}</div></div>
    <div class="item-actions">${item.kind === 'task' ? `<button type="button" data-action="toggle-item:${id}" title="${item.done ? 'Вернуть в дела' : 'Выполнить'}" aria-label="${item.done ? 'Вернуть в дела' : 'Отметить задачу выполненной'}" aria-pressed="${!!item.done}">${icon(item.done ? 'back' : 'check')}</button>` : ''}
      <button type="button" aria-label="Редактировать" title="Редактировать" data-action="edit-item:${id}">${icon('Edit')}</button>
    </div></div>`;
}
const itemList = items => items.length ? `<div class="list">${items.map(itemRow).join('')}</div>` : empty('Здесь пока нет дел или заметок.');
function ticketRow(ticket) {
  return `<a class="list-row list-link" href="#ticket/${escape(ticket.id)}"><div class="stack">
    <p class="meta">№ ${escape(ticket.id)}${ticket.student_name && state.data.user.role === 'staff' ? ' · ' + escape(ticket.student_name) : ''} · ${stamp(ticket.updated_at || ticket.created_at)}</p>
    <h3>${escape(ticket.subject)}</h3><div>${statusChip(ticket.status)}</div>
    </div><span class="arrow">${icon('arrow')}</span></a>`;
}
function todayPage() {
  const {user, today, local_time, items, requests, notifications} = state.data;
  const lessons = sortedLessons();
  const now = local_time || new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
  const next = lessons.find(l => l.date > today || (l.date === today && l.end > now));
  const unreadChange = notifications.find(n => n.kind === 'schedule' && !n.read);
  const change = lessons.find(l => l.date >= today && hasChange(l)) || (unreadChange && findLesson(unreadChange.lesson_id));
  const headline = next ? (next.date !== today ? 'Ближайшее занятие · ' + formatDay(next.date) : next.start <= now ? 'Занятие сейчас' : 'Следующая пара сегодня') : 'Расписание';
  const openItems = items.filter(i => !i.done || i.kind === 'note');
  const todayLessons = lessons.filter(l => l.date === today);
  const signal = notifications.find(n => !n.read && !n.lesson_id);
  const latest = [...requests].sort((a,b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
  return pageHead('Сегодня', escape(sentence(formatDay(today, {weekday:'long'}))) + ' · ' + escape(user.name)) + `
    <div class="dashboard">
      <section class="area-hero card hero stack" aria-label="Следующее занятие">
          <p class="kicker">${icon('clock')}${escape(headline)}</p>
          ${next ? `<p class="hero-time">${escape(next.start)}</p><h2>${escape(next.subject)}</h2><p class="meta">${escape(next.kind)} · ${escape(next.teacher)} · ауд. ${escape(next.room)}</p>
            ${link('lesson/' + next.id,'Открыть занятие','button primary','arrow')}` : `<h2>Предстоящих занятий нет</h2>${link('schedule','Открыть расписание','button','arrow')}`}
      </section>
      <section class="area-signals stack">${titleRow('На что обратить внимание')}
          ${change ? `<div class="signal change stack"><div>${chip('Перенос занятия','warn')}</div><h3>${escape(change.subject)}</h3>${diff(change)}${link('lesson/' + change.id,'Детали переноса')}</div>` : ''}
          ${signal ? `<div class="signal"><strong>${escape(signal.title)}</strong><p class="meta">${escape(signal.body)}</p>${link('notifications','К уведомлениям')}</div>` : ''}
          ${!change && !signal ? empty('Новых изменений и напоминаний нет.') : ''}
          ${link('ask','Найти или спросить СВОЗ','button','search')}
      </section>
      <section class="area-agenda stack">${titleRow('Пары сегодня',link('schedule','Расписание','button quiet','arrow'))}${lessonList(todayLessons)}</section>
      <section class="area-work stack">${titleRow('Мои дела',action('new-item','Добавить','quiet','plus'))}
          ${itemList(openItems.slice(0,4))}${link('items','Все дела и заметки','button','arrow')}
      </section>
      <section class="area-service stack">${titleRow('Связь с деканатом',link('requests','Все заявки','button quiet','arrow'))}
        ${latest ? `<div class="list">${ticketRow(latest)}</div>` : empty('Вы ещё не отправляли заявки.')}
      </section>
    </div>`;
}
function schedulePage() {
  const {today} = state.data;
  const days = weekDays(state.day);
  const lessons = sortedLessons();
  const daySection = d => `<section class="stack">${titleRow(escape(formatDay(d,{weekday:'long'})))}${lessonList(lessons.filter(l => l.date === d))}</section>`;
  return pageHead('Расписание','Занятия, аудитории и переносы') + `
    <div class="space">
      <div class="card calendar-card stack"><div class="row-between">
        <div class="segmented" aria-label="Период расписания">
          <button type="button" data-action="mode:day" aria-pressed="${state.mode === 'day'}">День</button>
          <button type="button" data-action="mode:week" aria-pressed="${state.mode === 'week'}">Неделя</button></div>
        <div class="row-wrap"><button class="icon-button" data-action="week:-7" aria-label="Предыдущая неделя" title="Предыдущая неделя">${icon('back')}</button>${action('today-date','Сегодня')}
        <button class="icon-button" data-action="week:7" aria-label="Следующая неделя" title="Следующая неделя">${icon('arrow')}</button></div>
      </div><p class="meta">${escape(shortDate(days[0]))} — ${escape(shortDate(days[6]))}</p>
      <div class="date-strip">${days.map(d => `<button type="button" data-action="date:${d}" aria-label="${escape(formatDay(d,{weekday:'long'}))}${d === today ? ', сегодня' : ''}" aria-pressed="${d === state.day}">
        <small>${asDate(d).toLocaleDateString('ru-RU',{timeZone:'UTC',weekday:'short'})}</small>${asDate(d).getUTCDate()}</button>`).join('')}</div></div>
      ${state.mode === 'day' ? daySection(state.day) : days.map(daySection).join('')}
    </div>`;
}
function lessonPage(id) {
  const l = findLesson(id);
  if (!l) return pageHead('Занятие недоступно','',backLink('schedule','Расписание'));
  const items = state.data.items.filter(i => String(i.lesson_id) === String(id));
  return pageHead(escape(l.subject), escape(formatDay(l.date,{weekday:'long'})),backLink('schedule','Расписание')) + `
    <div class="space">
      <section class="card stack"><div>${chip(l.kind,'accent')}</div><dl class="detail-grid">
        <div><dt>Время</dt><dd>${escape(l.start)} — ${escape(l.end)}</dd></div>
        <div><dt>Аудитория</dt><dd>${escape(l.room)}</dd></div>
        <div><dt>Преподаватель</dt><dd>${escape(l.teacher)}</dd></div>
      </dl><div>${link('ask/lesson/' + escape(id),'Спросить об этом занятии','button quiet','search')}</div></section>
      ${hasChange(l) ? `<section class="signal change stack"><h2>Занятие перенесено</h2>${diff(l)}${l.changed_at ? `<p class="meta">Обновлено ${stamp(l.changed_at)} (МСК)</p>` : ''}</section>` : ''}
      <section class="stack">${titleRow('Мои заметки и дела',action('new-lesson-item:' + escape(id),'Добавить','quiet','plus'))}${itemList(items)}</section>
    </div>`;
}
function gradeTone(record) {
  if (/^(сдан[оа]?|зачтено|завершено|оценено)$/i.test(record.status || '')) return 'success';
  if (/не сдан|не зачт|предстоит|к сдаче|нужно сдать/i.test(record.status || '')) return 'warn';
  return '';
}
function gradeRow(record) {
  return `<div class="list-row row-between">
    <div><strong>${escape(record.kind)}</strong>${record.due ? `<p class="meta">Срок · ${escape(formatDay(record.due))}</p>` : ''}</div>
    <div class="row-wrap">${record.status ? chip(record.status,gradeTone(record)) : ''}
    ${record.grade === null || record.grade === '' ? chip('Нет оценки') : chip(record.grade,'accent')}</div>
    </div>`;
}
function studyPage() {
  const { grades, items } = state.data;
  const isComplete = g => gradeTone(g) === 'success';
  const pending = [
    ...grades.filter(g => !isComplete(g) && (g.due || gradeTone(g) === 'warn')).map(g => ({
      title:g.subject, due:g.due, kind:g.kind, status:g.status, tone:gradeTone(g), url:'subject/' + encodeURIComponent(g.subject),
    })),
    ...items.filter(i => i.kind === 'task' && !i.done && i.due).map(i => ({
      title:i.text, due:i.due, kind:'Моя задача', url:'items/' + i.id,
    })),
  ].sort((a,b) => (a.due || '9999').localeCompare(b.due || '9999'));
  const complete = grades.filter(isComplete).length;
  return pageHead('Учёба','Оценки, зачёты, экзамены и учебные сроки') + `
    <div class="space"><section class="card stack"><h2>Учебный прогресс</h2>
      <p>${complete} из ${grades.length} учебных записей отмечены как завершённые</p>
      ${grades.length ? `<progress class="progress" aria-label="Завершено учебных записей" value="${complete}" max="${grades.length}"></progress>` : ''}
    </section>
    <div class="split">
      <section class="stack">${titleRow('Навигатор по учёбе')}
        ${pending.length ? `<div class="list">${pending.map(g => `<a class="list-row list-link" href="#${escape(g.url)}">
          <div><h3>${escape(g.title)}</h3><p class="meta">${escape(g.kind)} · ${g.due ? escape(formatDay(g.due)) : 'Срок уточняется'}</p>${g.status ? chip(g.status,g.tone) : ''}</div>
          <span class="arrow">${icon('arrow')}</span></a>`).join('')}</div>` : empty('В учебных записях нет незавершённых работ со сроком.')}
      </section>
      <section class="stack">${titleRow('Дисциплины')}
        ${subjects().length ? `<div class="list">${subjects().map(s => {
          const records = grades.filter(g => g.subject === s);
          return `<a class="list-row list-link" href="#subject/${escape(encodeURIComponent(s))}"><div><h3>${escape(s)}</h3>
            <p class="meta">${records.length ? records.map(g => escape(g.kind)).join(' · ') : 'Оценок пока нет'}</p>
            </div><span class="arrow">${icon('arrow')}</span></a>`;
        }).join('')}</div>` : empty('В кабинете пока нет дисциплин.')}
      </section>
    </div></div>`;
}
function subjectPage(subject) {
  if (!subjects().includes(subject)) return pageHead('Дисциплина недоступна','',backLink('study','Учёба'));
  const records = state.data.grades.filter(g => g.subject === subject);
  const items = state.data.items.filter(i => i.subject === subject || findLesson(i.lesson_id)?.subject === subject);
  return pageHead(escape(subject),'Учебные результаты и личные записи',backLink('study','Учёба')) + `
    <div class="space">
      <div>${link('ask/subject/' + escape(encodeURIComponent(subject)),'Спросить об этой дисциплине','button','search')}</div>
      <section class="stack">${titleRow('Оценки и сроки')}${records.length ? `<div class="list">${records.map(gradeRow).join('')}</div>` : empty('Результатов по этой дисциплине пока нет.')}</section>
      <section class="stack">${titleRow('Мои заметки и дела',action('new-subject-item:' + escape(encodeURIComponent(subject)),'Добавить','quiet','plus'))}${itemList(items)}</section>
    </div>`;
}
function itemsPage(id) {
  const items = state.data.items.filter(i => String(i.id) === id || state.itemFilter === 'all' ||
    (state.itemFilter === 'note' ? i.kind === 'note' : i.kind === 'task' && (state.itemFilter === 'done' ? i.done : !i.done)));
  return pageHead('Мои дела и заметки','',backLink('today','Сегодня')) + `<div class="space">
    <div class="row-between"><div class="row-wrap">${[['open','К выполнению'],['done','Выполнено'],['note','Заметки'],['all','Все']].map(([id,label]) =>
      `<button type="button" data-action="filter-items:${id}" aria-pressed="${state.itemFilter === id}" class="${state.itemFilter === id ? 'primary' : ''}">${label}</button>`).join('')}</div>
      ${action('new-item','Добавить','primary','plus')}</div>${itemList(items)}</div>`;
}
function itemDialog({lesson, subject, item} = {}) {
  const boundLesson = lesson ?? findLesson(item?.lesson_id);
  const boundSubject = subject ?? item?.subject ?? boundLesson?.subject;
  const choices = sortedLessons();
  const selected = (a,b) => a === b ? ' selected' : '';
  showDialog(item ? 'Редактировать запись' : 'Заметка или задача', `
    <form class="form" data-form="item" data-id="${escape(item?.id)}">
      ${item ? `<p class="meta">${item.kind === 'task' ? 'Задача' : 'Заметка'}${boundSubject ? ' · ' + escape(boundSubject) : ''}</p>` :
        `<label>Вид записи<select name="kind"><option value="note">Заметка</option><option value="task">Задача</option></select></label>`}
      <label>Текст<textarea name="text" required maxlength="2000" placeholder="Что важно записать?">${escape(item?.text)}</textarea></label>
      ${item ? '' : `<label>Дисциплина<select name="subject"><option value="">Без привязки</option>${subjects().map(s => `<option value="${escape(s)}"${selected(s,boundSubject)}>${escape(s)}</option>`).join('')}</select></label>
        <label>Занятие<select name="lesson_id"><option value="">Без привязки</option>${choices.map(l => `<option value="${escape(l.id)}"${selected(l.id,boundLesson?.id)}>${escape(shortDate(l.date) + ' · ' + l.subject + ' · ' + l.start)}</option>`).join('')}</select></label>
        <label data-due hidden>Срок задачи <small>Необязательно</small><input type="date" name="due"></label>`}
      ${errorBox}<div class="row-wrap"><button type="submit" class="primary">Сохранить</button>
      ${item ? action('delete-item:' + escape(item.id), 'Удалить', 'danger') : ''}${action('close','Отмена','quiet')}</div>
    </form>`);
}
function requestsPage() {
  const staff = state.data.user.role === 'staff';
  const tickets = [...state.data.requests].filter(r => !staff || !state.ticketFilter || r.status === state.ticketFilter)
    .sort((a,b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  return pageHead(staff ? 'Обращения' : 'Заявки',staff ? 'Очередь деканата' : 'Справки, обращения и ответы деканата') + `<div class="space">
    ${staff ? `<label class="filter">Статус<select data-select="ticket-filter"><option value="">Все статусы</option>${statuses.map(s => `<option${state.ticketFilter === s ? ' selected' : ''}>${s}</option>`).join('')}</select></label>` :
    `<section class="stack">${titleRow('Оформить заявку')}
      <div class="list">${state.data.services.map(s => `<a class="list-row list-link" href="#new-request/${escape(encodeURIComponent(s.type))}"><div><h3>${escape(s.title)}</h3><p class="meta">${escape(s.description)}</p></div><span class="arrow">${icon('arrow')}</span></a>`).join('')}</div>
    </section>`}
    <section class="stack">${titleRow(staff ? 'Входящие обращения' : 'Мои заявки')}
      ${tickets.length ? `<div class="list">${tickets.map(ticketRow).join('')}</div>` : empty(staff ? 'По этому фильтру нет обращений.' : 'Вы ещё не отправляли заявки.')}
    </section>
  </div>`;
}
function newRequestPage(type) {
  const service = state.data.services.find(s => s.type === type);
  if (!service) return pageHead('Выберите услугу','',backLink('requests','Заявки'));
  const draft = state.preview?.type === type ? state.preview : {
    type, subject:state.aiDraft?.type === type ? state.aiDraft.title || service.title : service.title,
    body:state.aiDraft?.type === type ? state.aiDraft.text : '',
  };
  return pageHead(escape(service.title),escape(service.description),backLink('requests','Заявки')) + `
    <section class="card stack">
      <p class="meta">Заявитель · ${escape(state.data.user.name)} · ${escape(state.data.user.group)}</p>
      ${state.preview?.type === type && state.preview.show ? `<h2>Проверьте заявку</h2>
        <dl class="stack"><div><dt class="meta">Тема</dt><dd><strong>${escape(draft.subject)}</strong></dd></div>
        <div><dt class="meta">Текст</dt><dd class="text-content">${escape(draft.body)}</dd></div></dl>
        <form class="form" data-form="request-send">${errorBox}<div class="row-wrap"><button type="submit" class="primary">Отправить заявку</button>${action('request-back','Редактировать','quiet')}</div></form>` :
      `<form class="form" data-form="request-preview">
        <input type="hidden" name="type" value="${escape(type)}">
        <label>Тема<input name="subject" value="${escape(draft.subject)}" required maxlength="150"></label>
        <label>Текст заявки<textarea name="body" required maxlength="2000" placeholder="Уточните, что нужно и к какому сроку.">${escape(draft.body)}</textarea></label>
        ${errorBox}<div><button type="submit" class="primary">Проверить заявку ${icon('arrow')}</button></div>
      </form>`}
    </section>`;
}
function ticketPage(ticket) {
  const {user} = state.data;
  const staff = user.role === 'staff';
  const messageDraft = state.aiDraft?.kind === 'message' && String(state.aiDraft.request_id) === String(ticket.id) ? state.aiDraft.text : '';
  return pageHead(escape(ticket.subject),'Заявка № ' + escape(ticket.id),backLink('requests',staff ? 'Обращения' : 'Заявки')) + `
    <div class="space">
      <section class="card stack">
        <div class="row-between"><h2>Заявка</h2>${statusChip(ticket.status)}</div>
        <p class="meta">${staff ? escape(ticket.student_name) + ' · ' : ''}Отправлена ${stamp(ticket.created_at)} (МСК)</p>
        <p class="text-content">${escape(ticket.body)}</p>
        ${staff ? `<form class="form" data-form="status">
          <label>Изменить статус<select name="status" required><option value="" selected disabled>Выберите новый статус</option>${statuses.slice(1).filter(s => s !== ticket.status).map(s => `<option>${s}</option>`).join('')}</select></label>
          <label>Пояснение к статусу <small>Необязательно</small><input name="body" maxlength="1000"></label>
          ${errorBox}<div><button type="submit" class="primary">Обновить статус</button></div>
          </form>` : `<div>${link('ask/request/' + escape(ticket.id),'Спросить об этой заявке','button quiet','search')}</div>`}
      </section>
      ${staff ? staffAssistant(ticket) : ''}
      <div class="split">
        <section class="card stack"><h2>Переписка</h2>
          ${ticket.messages.length ? ticket.messages.map(m => `<article class="message ${m.role === user.role ? 'mine' : ''}">
            <div class="row-between"><strong>${escape(m.author)}</strong><time class="meta">${stamp(m.created_at)}</time></div>
            <p class="text-content">${escape(m.body)}</p></article>`).join('') : empty('Ответов пока нет.')}
          <form class="form" data-form="message">
            <label>Сообщение<textarea name="body" required maxlength="2000" placeholder="Напишите уточнение или ответ.">${escape(messageDraft)}</textarea></label>
            ${errorBox}<div><button type="submit" class="primary">Отправить сообщение</button></div>
          </form>
        </section>
        <section class="card stack"><h2>История статусов</h2>
          ${ticket.history.length ? `<ol class="timeline">${ticket.history.map(h => `<li>${statusChip(h.status)}
            <p class="meta">${stamp(h.created_at)} (МСК)</p>${h.body ? `<p class="text-content">${escape(h.body)}</p>` : ''}</li>`).join('')}</ol>` : empty('Изменений статуса пока нет.')}
        </section>
      </div>
    </div>`;
}
function noticeDestination(n) {
  if (n.request_id) return 'ticket/' + n.request_id;
  if (n.item_id) return 'items/' + n.item_id;
  if (n.lesson_id) return 'lesson/' + n.lesson_id;
  return '';
}
function notificationsPage() {
  const list = state.data.notifications;
  return pageHead('Уведомления','Изменения, объявления и напоминания') + `
    <section class="stack"><div class="row-wrap">${list.some(n => !n.read) ? action('read-all','Отметить всё прочитанным', '', 'check') : ''}</div>
      ${list.length ? `<div class="list">${list.map(n => `<article class="list-row stack">
        <div class="row-between"><h3>${escape(n.title)}</h3>${n.read ? '' : chip('Новое','accent')}</div>
        <p class="text-content">${escape(n.body)}</p><p class="meta">${stamp(n.created_at)} (МСК)</p>
        <div class="row-wrap">${noticeDestination(n) ? action('notice:' + n.id,n.request_id ? 'Открыть заявку' : n.item_id ? 'Открыть задачу' : 'Открыть занятие','quiet','arrow') :
        n.read ? '' : action('notice:' + n.id,'Отметить прочитанным','quiet','check')}</div>
      </article>`).join('')}</div>` : empty('В ленте пока ничего нет.')}
    </section>`;
}
function profilePage() {
  const {user,ai} = state.data;
  const details = user.role === 'student' ? [['Факультет',user.faculty],['Направление',user.program],['Курс',user.year],['Группа',user.group]] : [['Роль','Сотрудник деканата']];
  return pageHead('Профиль',escape(user.name)) + `<div class="space">
    <section class="card stack"><h2>Учётная запись</h2><dl class="detail-grid">${details.map(([key,value]) => `<div><dt>${key}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl></section>
    <section class="card stack"><h2>Настройки</h2><div class="row-wrap">${action('theme', root.dataset.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема','',root.dataset.theme === 'dark' ? 'sun' : 'moon')}
      ${action(ai.enabled ? 'ai-off' : 'ai-consent',ai.enabled ? 'Выключить ИИ' : 'Включить ИИ')}</div></section>
    <div>${action('logout','Выйти из кабинета','danger')}</div></div>`;
}
const faq = [
  ['Как получить справку об обучении?', 'Откройте «Заявки», выберите справку и укажите, куда и к какому сроку её нужно представить.', 'requests'],
  ['Где посмотреть время и аудиторию?', 'В расписании показываются занятия на день и неделю. Новое время и аудитория указаны в карточке переноса.', 'schedule'],
  ['Где увидеть сроки экзаменов и зачётов?', 'В разделе «Учёба» откройте нужную дисциплину или найдите срок в навигаторе.', 'study'],
  ['Как ответить сотруднику деканата?', 'Откройте своё обращение в списке заявок и напишите сообщение в разделе «Переписка».', 'requests'],
];
const quickQuestions = {
  general: ['Какое у меня завтра расписание?', 'Что нужно сделать до конца недели?', 'Когда ближайший экзамен?', 'Как получить справку об обучении?'],
  lesson: ['Что изменилось в этом занятии?', 'Создай заметку, что на пару нужно принести работу'],
  subject: ['Что осталось сдать по этой дисциплине?', 'Составь план подготовки к ближайшей проверке по этой дисциплине'],
  request: ['Какой статус этой заявки?', 'Подготовь сообщение с просьбой уточнить срок ответа по этой заявке'],
};
function chatContext() {
  const [,kind,id] = route();
  if (kind === 'lesson') {
    const lesson = findLesson(id);
    if (lesson) return {kind,title:lesson.subject + ' · ' + shortDate(lesson.date),params:{lesson_id:lesson.id},url:'lesson/' + lesson.id};
  }
  if (kind === 'subject' && subjects().includes(id)) return {kind,title:id,params:{subject:id},url:'subject/' + encodeURIComponent(id)};
  if (kind === 'request') {
    const ticket = state.data.requests.find(record => String(record.id) === id);
    if (ticket) return {kind,title:'Заявка № ' + ticket.id + ' · ' + ticket.subject,params:{request_id:ticket.id},url:'ticket/' + ticket.id};
  }
  return {kind:'general',title:'',params:{}};
}
const staffPrompts = {
  reply: ['Черновик ответа', 'Подготовь краткий ответ студенту по этой заявке.'],
  summary: ['Краткое содержание', 'Кратко перескажи эту заявку и переписку.'],
  missing: ['Что уточнить', 'Укажи, каких сведений не хватает для обработки заявки.'],
  rules: ['Правила СВОЗ', 'Найди в правилах СВОЗ порядок обработки такой заявки.'],
};
function staffAssistant(ticket) {
  const {ai} = state.data;
  const result = state.staffAi.get(ticket.id);
  return `<details class="card staff-ai"${result ? ' open' : ''}>
    <summary><strong>Помощник по заявке</strong> ${chip(ai.enabled ? 'Polza AI' : 'ИИ выключен',ai.enabled ? 'accent' : '')}</summary>
    <div class="stack staff-ai-body">
      <p class="meta">Контекст ограничен этой заявкой и правилами СВОЗ. Проверяйте черновики перед отправкой.</p>
      ${!ai.available ? '<p class="notice">Polza AI сейчас недоступен. Переписка и обработка заявки работают.</p>' : ''}
      ${!ai.enabled ? `<div>${action('ai-consent','Подключить Polza AI','', 'plus')}</div>` : ai.available ? `
        <div class="row-wrap">${Object.entries(staffPrompts).map(([mode,[label]]) => action('staff-ai:' + mode,label)).join('')}</div>
        <div data-staff-ai-result class="stack" aria-live="polite">${result ? staffAiResult(result) : ''}</div>` : ''}
    </div></details>`;
}
function staffAiResult(result) {
  if (result.loading) return '<p class="notice" role="status">Polza AI готовит ответ…</p>';
  if (result.error) return `<p class="error" role="alert">${escape(result.error)}</p>`;
  return `<article class="message stack"><h3>${staffPrompts[result.mode][0]}</h3>
    <p class="text-content">${escape(result.answer)}</p>${(result.sources || []).map(aiSource).join('')}
    ${result.mode === 'reply' ? `<div>${action('staff-fill','Вставить в поле ответа','primary','arrow')}</div>` : ''}
    </article>`;
}
function askPage() {
  const {ai} = state.data;
  const context = chatContext();
  const search = `<section class="card stack">
    <h2>Поиск по кабинету</h2>
    <label>Что хотите найти?<input type="search" id="local-search" placeholder="Например, справка или расписание"></label>
    <div id="search-results" class="stack" aria-live="polite">${localResults('')}</div>
    </section>`;
  return pageHead('Найти или спросить СВОЗ','Справка по кабинету и ИИ-помощник') + `
    <div class="space">${!ai.enabled && !context.title ? search : ''}
    <section class="card stack">
      <div class="row-between"><h2>ИИ-помощник</h2>${chip(ai.enabled ? 'Включён' : 'Выключен',ai.enabled ? 'accent' : '')}</div>
      ${context.title ? `<div class="row-between notice"><p>Контекст · ${link(context.url,escape(context.title))}</p>${link('ask','Убрать контекст','button quiet')}</div>` : ''}
      ${!ai.available ? '<p class="notice">Polza AI сейчас недоступен. Поиск, расписание, заявки и остальные разделы кабинета доступны.</p>' : ''}
      ${ai.enabled ? `<p class="meta">Помощник работает с данными вашего кабинета. Проверяйте ответы перед действием.</p>
        <div>${action('ai-off','Выключить ИИ','quiet')}</div>
        ${state.aiTurns.length ? `<div class="stack" id="ai-history" aria-label="История диалога">${state.aiTurns.map((turn,index) => `<article class="message ${turn.role === 'user' ? 'mine' : ''} stack">
            <div class="row-between"><strong>${turn.role === 'user' ? 'Вы' : 'СВОЗ'}</strong>${turn.context ? chip(turn.context) : ''}</div>
            <p class="text-content">${escape(turn.text)}</p>${(turn.sources || []).map(aiSource).join('')}${turn.proposal ? aiProposal(turn.proposal,index) : ''}</article>`).join('')}</div>` : ''}
        ${ai.available ? `<div class="row-wrap ai-quick" aria-label="Примеры вопросов">
          ${quickQuestions[context.kind].map((question,index) => action('ai-example:' + index,escape(question))).join('')}</div>
          <form class="form" data-form="ai-chat"><label>Ваш вопрос<textarea name="message" required maxlength="1500" placeholder="Например: что завтра и что нужно подготовить?"></textarea></label>
            <p data-generating role="status" class="meta"${state.aiPending ? '' : ' hidden'}>Polza AI готовит ответ…</p>
            ${errorBox}<div><button class="primary" type="submit"${state.aiPending ? ' disabled' : ''}>Спросить СВОЗ ${icon('arrow')}</button></div></form>` : ''}
      ` : `<p>Помощник ответит по вашему расписанию, учебным срокам и заявкам или подготовит черновик.</p><div>${action('ai-consent','Настроить ИИ','', 'plus')}</div>`}
    </section>${ai.enabled || context.title ? search : ''}</div>`;
}
function localResults(query) {
  const term = query.trim().toLowerCase();
  const {services,lessons} = state.data;
  const rows = [...faq, ...services.map(s => [s.title,s.description,'new-request/' + encodeURIComponent(s.type)])];
  if (term) {
    rows.push(...sortedLessons().map(l => [l.subject, formatDay(l.date) + ' · ' + l.start + ' · ' + l.teacher,'lesson/' + l.id]));
    rows.push(...subjects().map(s => [s,'Дисциплина','subject/' + encodeURIComponent(s)]));
  }
  const matches = rows.filter(([title,description]) => !term || (title + ' ' + description).toLowerCase().includes(term)).slice(0,8);
  return matches.length ? `<div class="list">${matches.map(([title,description,url]) => `<a class="list-row list-link" href="#${escape(url)}"><div><strong>${escape(title)}</strong><p class="meta">${escape(description)}</p></div><span class="arrow">${icon('arrow')}</span></a>`).join('')}</div>` : empty('Совпадений нет. Попробуйте другой запрос.');
}
function aiSource(source) {
  const id = escape(encodeURIComponent(source.id));
  const record = state.data.grades.find(g => String(g.id) === String(source.id));
  const href = {lesson:'lesson/' + id, request:'ticket/' + id, item:'items/' + id, grade:record ? 'subject/' + encodeURIComponent(record.subject) : 'study'}[source.kind];
  if (href) return `<p class="meta">Источник · ${link(href, escape(source.title || 'Открыть'))}</p>`;
  return source.title ? `<p class="meta">Источник · ${escape(source.title)}</p>` : '';
}
function draftParams(draft) {
  const lesson = draft.lesson_id ? findLesson(draft.lesson_id) : null;
  const service = draft.type && state.data.services.find(s => s.type === draft.type);
  const ticket = draft.request_id && state.data.requests.find(r => String(r.id) === String(draft.request_id));
  return [lesson ? lesson.subject + ' · ' + shortDate(lesson.date) + ' · ' + lesson.start : draft.subject,
    draft.due && 'Срок: ' + formatDay(draft.due), service?.title,
    draft.request_id && 'Заявка № ' + draft.request_id + (ticket ? ' · ' + ticket.subject : ''),
  ].filter(Boolean).join(' · ');
}
function aiProposal(draft, index) {
  const captions = {note:'Черновик заметки',task:'Черновик задачи',request:'Черновик заявки',message:'Черновик сообщения'};
  const caption = captions[draft.kind];
  if (!caption) return '';
  const button = {note:'Проверить и сохранить',task:'Проверить и сохранить',request:'Открыть форму заявки',message:'Проверить перед отправкой'}[draft.kind];
  const details = draftParams(draft);
  return `<div class="signal stack"><h3>${caption}</h3>
    ${draft.title ? `<p><strong>${escape(draft.title)}</strong></p>` : ''}
    <p class="text-content">${escape(draft.text)}</p>
    ${details ? `<p class="meta">${escape(details)}</p>` : ''}
    ${draft.completed ? chip(draft.kind === 'message' ? 'Сообщение отправлено' : 'Сохранено','success') : draft.discarded ? chip('Отменено') :
      `<div class="row-wrap">${action('draft:' + index,button,'primary','arrow')}${action('discard-ai:' + index,'Отменить','quiet')}</div>`}
    </div>`;
}
function consentDialog() {
  const staff = state.data.user.role === 'staff';
  showDialog('Включить ИИ-помощник',`<form class="form" data-form="consent">
    <p>Ваш запрос обрабатывает сторонний сервис Polza AI. ${staff ? 'В сервис могут передаваться данные выбранного вымышленного обращения и его переписка.' : 'В зависимости от вопроса в сервис может передаваться часть данных вымышленного аккаунта: расписание, результаты обучения, личные записи и обращения.'}</p>
    <p class="meta">Проверяйте ответы и черновики. Действия выполняются после вашего подтверждения. ИИ можно выключить в настройках в любой момент.</p>
    <label class="check"><input name="consent" type="checkbox" required>Разрешаю обработку этих данных</label>
    ${errorBox}<div class="row-wrap"><button type="submit" class="primary">Включить ИИ</button>${action('close','Отмена','quiet')}</div>
  </form>`);
}

async function render() {
  const token = ++renderToken;
  if (!state.data) { login(); return; }
  const [page,id] = route();
  const staff = state.data.user.role === 'staff';
  let section = page;
  let body;
  if (page === 'ticket') {
    try {
      const ticket = await api('/requests/' + encodeURIComponent(id ?? ''));
      if (token !== renderToken) return;
      state.ticket = ticket;
      body = ticketPage(ticket);
    } catch (error) {
      if (token !== renderToken) return;
      if (error.status === 401) { clearSession(); login(); return; }
      body = pageHead('Заявка недоступна',escape(error.message),backLink('requests',staff ? 'Обращения' : 'Заявки'));
    }
  } else if (page === 'requests') body = requestsPage();
  else if (page === 'profile') body = profilePage();
  else if (page === 'notifications') body = notificationsPage();
  else if (staff) { section = 'requests'; body = requestsPage(); }
  else if (page === 'schedule') body = schedulePage();
  else if (page === 'lesson') body = lessonPage(id);
  else if (page === 'study') body = studyPage();
  else if (page === 'subject') body = subjectPage(id);
  else if (page === 'items') body = itemsPage(id);
  else if (page === 'ask') body = askPage();
  else if (page === 'new-request') body = newRequestPage(id);
  else { section = 'today'; body = todayPage(); }
  shell(section,body);
}
async function routeChanged() {
  if (dialog.open) dialog.close();
  const routeAtStart = location.hash;
  if (state.data && ['today','notifications','requests'].includes(route()[0])) {
    const oldSession = sessionVersion;
    try {
      const latest = await api('/dashboard');
      if (sessionVersion === oldSession) state.data = latest;
    } catch (error) {
      if (sessionVersion !== oldSession) return;
      if (error.status === 401) clearSession();
      else announce('Не удалось обновить данные. Показана предыдущая версия.');
    }
  }
  if (routeAtStart !== location.hash) return;
  await render();
  document.querySelector('#main-content')?.focus({preventScroll:true});
  scrollTo(0,0);
  document.querySelector('.item.highlight')?.scrollIntoView({block:'nearest'});
}
window.addEventListener('hashchange',routeChanged);
function formError(form,message) {
  form.querySelector('[data-error]').textContent = message;
}
function required(value, message) {
  if (!value?.trim()) throw new Error(message);
  return value.trim();
}
async function handleForm(form) {
  const values = Object.fromEntries(new FormData(form));
  const kind = form.dataset.form;
  if (kind === 'login') {
    await api('/login','POST',{login: required(values.login,'Введите логин.'),password:values.password});
    await refresh();
    go(state.data.user.role === 'staff' ? 'requests' : 'today');
    return;
  }
  if (kind === 'item') {
    const id = form.dataset.id;
    const text = required(values.text,'Введите текст записи.');
    if (id) await api('/items/' + encodeURIComponent(id),'PATCH',{text});
    else {
      const data = {kind:values.kind,text};
      if (values.lesson_id) data.lesson_id = Number(values.lesson_id);
      if (values.subject) data.subject = values.subject;
      if (values.due && values.kind === 'task') data.due = values.due;
      await api('/items','POST',data);
      if (route()[0] === 'items') state.itemFilter = values.kind === 'note' ? 'note' : 'open';
    }
    dialog.close();
    await refresh();
    await render();
    announce('Запись сохранена');
    return;
  }
  if (kind === 'request-preview') {
    state.preview = {type:values.type, subject:required(values.subject,'Введите тему заявки.'),body:required(values.body,'Введите текст заявки.'),show:true};
    await render();
    document.querySelector('[data-form="request-send"] button')?.focus();
    return;
  }
  if (kind === 'request-send') {
    const {type,subject,body} = state.preview;
    const result = await api('/requests','POST',{type,subject,body});
    state.preview = null;
    state.aiDraft = null;
    await refresh();
    go('ticket/' + result.id);
    announce('Заявка отправлена');
    return;
  }
  if (kind === 'status' || kind === 'message') {
    const id = encodeURIComponent(state.ticket.id);
    const messageInput = kind === 'status' && document.querySelector('[data-form="message"] textarea');
    const unsentMessage = messageInput?.value;
    if (kind === 'status') await api('/requests/' + id,'PATCH',{status:values.status,body:values.body?.trim() || ''});
    else {
      await api('/requests/' + id + '/messages','POST',{body:required(values.body,'Введите сообщение.')});
      state.aiDraft = null;
    }
    await refresh();
    await render();
    const newMessageInput = document.querySelector('[data-form="message"] textarea');
    if (unsentMessage !== undefined && newMessageInput && route().join('/') === 'ticket/' + id) {
      newMessageInput.value = unsentMessage;
    }
    announce(kind === 'status' ? 'Статус обновлён' : 'Сообщение отправлено');
    return;
  }
  if (kind === 'consent') {
    if (!values.consent) return;
    const reopenStaffPanel = document.querySelector('.staff-ai[open]') !== null;
    await api('/ai/consent','POST',{enabled:true});
    dialog.close();
    await refresh();
    await render();
    if (reopenStaffPanel) document.querySelector('.staff-ai')?.setAttribute('open', '');
    announce('ИИ включён');
    return;
  }
  if (kind === 'ai-chat') {
    if (state.aiPending) return;
    const version = sessionVersion;
    const generation = state.aiGeneration;
    const message = required(values.message,'Введите вопрос для помощника.');
    const context = chatContext();
    state.aiPending = true;
    form.querySelector('[data-generating]').hidden = false;
    let result;
    try {
      result = await api('/ai/chat','POST',{message,...context.params});
    } finally {
      if (version === sessionVersion && generation === state.aiGeneration) {
        state.aiPending = false;
        document.querySelector('[data-form="ai-chat"] [data-generating]')?.setAttribute('hidden','');
        const currentSubmit = document.querySelector('[data-form="ai-chat"] [type=submit]');
        if (currentSubmit) currentSubmit.disabled = false;
      }
    }
    if (version !== sessionVersion || generation !== state.aiGeneration || !state.data?.ai.enabled) return;
    state.aiTurns.push({role:'user',text:message,context:context.title},{role:'assistant',text:result.answer,sources:result.sources,proposal:result.proposal});
    if (route()[0] === 'ask') {
      await render();
      const latestAnswer = document.querySelector('#ai-history article:last-child');
      latestAnswer?.setAttribute('tabindex','-1');
      latestAnswer?.focus();
    }
  }
  if (kind === 'confirm-ai') {
    const draft = findDraft(form.dataset.id);
    if (!draft || draft.completed || draft.discarded) return;
    await api('/ai/confirm','POST',{id:draft.id});
    draft.completed = true;
    dialog.close();
    await refresh();
    await render();
    announce(draft.kind === 'message' ? 'Сообщение отправлено' : 'Запись сохранена');
  }
}
document.addEventListener('submit',async event => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const button = event.submitter || form.querySelector('[type=submit]');
  if (button?.disabled) return;
  const adjacentForm = { status:'message', message:'status' }[form.dataset.form];
  const blocked = adjacentForm && document.querySelector(`[data-form="${adjacentForm}"]`);
  if (blocked) blocked.inert = true;
  const previous = button?.innerHTML;
  const version = sessionVersion;
  if (button) { button.disabled = true; button.textContent = 'Подождите…'; }
  formError(form,'');
  try { await handleForm(form); }
  catch (error) {
    if (error.status === 401 && state.data && version === sessionVersion) {
      clearSession();
      login();
      announce('Войдите в кабинет снова');
    } else formError(form,error.message || 'Запрос не выполнен.');
  }
  finally {
    if (button) { button.disabled = false; button.innerHTML = previous; }
    if (blocked) blocked.inert = false;
  }
});
function findDraft(id) {
  return state.aiTurns.map(turn => turn.proposal).find(proposal => proposal && String(proposal.id) === String(id));
}
function staffAiPanel(ticketId) {
  return route()[0] === 'ticket' && route()[1] === String(ticketId) ? document.querySelector('.staff-ai') : null;
}
function updateStaffResult(ticketId,result) {
  state.staffAi.set(ticketId,result);
  const panel = staffAiPanel(ticketId);
  if (!panel) return;
  panel.querySelectorAll('[data-action^="staff-ai:"]').forEach(button => { button.disabled = !!result.loading; });
  const content = panel.querySelector('[data-staff-ai-result]');
  if (content) content.innerHTML = staffAiResult(result);
}
async function runStaffAssistant(mode) {
  const ticket = state.ticket;
  if (!ticket || !staffAiPanel(ticket.id) || !staffPrompts[mode] || state.staffAi.get(ticket.id)?.loading) return;
  const version = sessionVersion;
  const generation = state.aiGeneration;
  const current = () => version === sessionVersion && generation === state.aiGeneration && state.data?.ai.enabled;
  updateStaffResult(ticket.id,{mode,loading:true});
  try {
    const result = await api('/ai/chat','POST',{request_id:ticket.id,mode,message:staffPrompts[mode][1]});
    if (current()) updateStaffResult(ticket.id,{...result,mode});
  } catch (error) {
    if (error.status === 401) throw error;
    if (current()) updateStaffResult(ticket.id,{mode,error:error.message});
  }
}
function staffFill(replace = false) {
  const result = state.staffAi.get(state.ticket?.id);
  const field = document.querySelector('[data-form="message"] textarea[name="body"]');
  const reply = result?.proposal?.text || result?.answer;
  if (result?.mode !== 'reply' || !reply || !field) return;
  if (field.value.trim() && !replace) {
    showDialog('Заменить текст ответа?',`<p>В поле уже есть текст. Заменить его черновиком Polza AI?</p>
      <div class="row-wrap">${action('staff-replace','Заменить','primary')}${action('close','Отмена','quiet')}</div>`);
    return;
  }
  if (dialog.open) dialog.close();
  field.value = reply.slice(0,field.maxLength);
  field.focus();
  announce('Черновик вставлен. Проверьте текст перед отправкой.');
}
async function handleAction(name,value) {
  if (name === 'theme') {
    const dark = root.dataset.theme !== 'dark';
    setTheme(dark ? 'dark' : 'light',true);
    document.querySelectorAll('[data-action="theme"]').forEach(button => {
      const glyph = icon(dark ? 'sun' : 'moon');
      if (button.classList.contains('icon-button')) {
        const label = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
        button.innerHTML = glyph;
        button.title = label;
        button.setAttribute('aria-label',label);
      } else button.innerHTML = glyph + (dark ? 'Светлая тема' : 'Тёмная тема');
    });
    return;
  }
  if (name === 'retry') return start();
  if (name === 'demo') {
    const form = document.querySelector('#login-form');
    form.elements.login.value = value;
    form.elements.password.value = demoPassword;
    form.querySelector('[type=submit]').focus();
    return;
  }
  if (!state.data) return;
  if (name === 'close') { dialog.close(); return; }
  if (name === 'logout') {
    await api('/logout','POST',{});
    clearSession();
    history.replaceState(null,'',location.pathname + location.search);
    await render();
    return;
  }
  if (name === 'mode') state.mode = value;
  else if (name === 'week') state.day = plusDays(state.day,Number(value));
  else if (name === 'date') { state.day = value; state.mode = 'day'; }
  else if (name === 'today-date') { state.day = state.data.today; state.mode = 'day'; }
  else if (name === 'filter-items') state.itemFilter = value;
  else if (name === 'new-item') { itemDialog(); return; }
  else if (name === 'new-lesson-item') { itemDialog({lesson:findLesson(value)}); return; }
  else if (name === 'new-subject-item') { itemDialog({subject:decodeURIComponent(value)}); return; }
  else if (['edit-item','toggle-item','delete-item'].includes(name)) {
    const item = state.data.items.find(i => String(i.id) === value);
    if (!item) return;
    if (name === 'edit-item') { itemDialog({item}); return; }
    if (name === 'delete-item') {
      showDialog('Удалить запись?',`<div class="stack"><p class="text-content">${escape(item.text)}</p><div class="row-wrap">${action('confirm-delete:' + value,'Удалить','danger')}${action('close','Отмена','quiet')}</div></div>`);
      return;
    }
    await api('/items/' + encodeURIComponent(value),'PATCH',{done:!item.done});
    await refresh();
    announce(item.done ? 'Задача возвращена в дела' : 'Задача выполнена');
  } else if (name === 'confirm-delete') {
    await api('/items/' + encodeURIComponent(value),'DELETE');
    dialog.close();
    await refresh();
    announce('Запись удалена');
  } else if (name === 'request-back') state.preview.show = false;
  else if (name === 'notice' || name === 'read-all') {
    const notice = state.data.notifications.find(n => String(n.id) === value);
    if (!notice?.read) await api('/notifications/read','POST',notice ? {id:notice.id} : {});
    await refresh();
    const destination = notice && noticeDestination(notice);
    if (destination) { go(destination); return; }
  } else if (name === 'ai-consent') { consentDialog(); return; }
  else if (name === 'ai-off') {
    await api('/ai/consent','POST',{enabled:false});
    state.aiGeneration += 1;
    state.aiPending = false;
    state.aiTurns = [];
    state.aiDraft = null;
    state.staffAi.clear();
    await refresh();
    announce('ИИ выключен');
  } else if (name === 'ai-example') {
    const question = quickQuestions[chatContext().kind][Number(value)];
    const field = document.querySelector('[data-form="ai-chat"] textarea');
    if (!field || !question || state.aiPending) return;
    field.value = question;
    field.focus();
    return;
  } else if (name === 'staff-ai') {
    await runStaffAssistant(value);
    return;
  } else if (name === 'staff-fill' || name === 'staff-replace') {
    staffFill(name === 'staff-replace');
    return;
  } else if (name === 'discard-ai') {
    const draft = state.aiTurns[Number(value)]?.proposal;
    if (!draft || draft.completed || draft.discarded) return;
    if (draft.id) await api('/ai/discard','POST',{id:draft.id});
    if (state.aiDraft === draft) state.aiDraft = null;
    draft.discarded = true;
    announce('Предложение отменено');
  } else if (name === 'draft') {
    const draft = state.aiTurns[Number(value)]?.proposal;
    if (!draft || draft.completed || draft.discarded) return;
    if (['note','task','message'].includes(draft.kind)) {
      const question = {note:'Создать заметку?',task:'Создать задачу?',message:'Отправить сообщение в деканат?'}[draft.kind];
      showDialog(question,`
        <form class="form" data-form="confirm-ai" data-id="${escape(draft.id)}">
          <p class="text-content">${escape(draft.text)}</p>
          <p class="meta">${escape(draftParams(draft))}</p>
          ${errorBox}<div class="row-wrap"><button type="submit" class="primary">${draft.kind === 'message' ? 'Подтвердить и отправить' : 'Подтвердить'}</button>${action('close','Отмена','quiet')}</div>
        </form>`);
    } else if (draft.kind === 'request') {
      state.preview = null;
      state.aiDraft = draft;
      go('new-request/' + encodeURIComponent(draft.type));
    }
    return;
  }
  await render();
}
document.addEventListener('click',async event => {
  const skip = event.target.closest('.skip');
  if (skip) {
    event.preventDefault();
    const main = document.querySelector('#main-content');
    main?.setAttribute('tabindex','-1');
    main?.focus({preventScroll:true});
    main?.scrollIntoView();
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const [name,value] = button.dataset.action.split(':');
  const version = sessionVersion;
  button.disabled = true;
  try { await handleAction(name,value); }
  catch (error) {
    if (error.status === 401 && state.data && version === sessionVersion) { clearSession(); login(); }
    announce(error.message || 'Действие не завершено. Попробуйте ещё раз.');
  }
  finally {
    button.disabled = false;
    if (!button.isConnected && !dialog.open && ['theme','mode','week','date','today-date','filter-items','toggle-item','read-all','ai-off'].includes(name)) {
      const replacement = Array.from(document.querySelectorAll('[data-action]')).find(el => el.dataset.action === button.dataset.action);
      replacement?.focus({preventScroll:true});
    }
  }
});
document.addEventListener('change',event => {
  if (event.target.dataset.select === 'ticket-filter') {
    state.ticketFilter = event.target.value;
    render().then(() => document.querySelector('[data-select="ticket-filter"]')?.focus({preventScroll:true}));
  }
  if (event.target.name === 'lesson_id') {
    const lesson = findLesson(event.target.value);
    if (lesson) event.target.form.elements.subject.value = lesson.subject;
  }
  if (event.target.name === 'kind' && event.target.form?.dataset.form === 'item') {
    event.target.form.querySelector('[data-due]').hidden = event.target.value !== 'task';
  }
});
document.addEventListener('input',event => {
  if (event.target.id === 'local-search') document.querySelector('#search-results').innerHTML = localResults(event.target.value);
});
async function start() {
  try { await refresh(); await render(); }
  catch (error) {
    if (error.status === 401) { clearSession(); login(); }
    else app.innerHTML = `<main id="main-content" class="load-screen"><div class="card stack"><h1>Кабинет не загрузился</h1><p role="alert">${escape(error.message)}</p>${action('retry','Попробовать ещё раз','primary')}</div></main>`;
  }
}
start();
