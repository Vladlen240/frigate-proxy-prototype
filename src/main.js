import './styles.css';
import data from './data.json';
import { icon, hydrateIcons } from './icons.js';

/* ==========================================================================
   Утилиты
   ========================================================================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const nf = new Intl.NumberFormat('ru-RU');
const rub = (n) => `${nf.format(Math.round(n))} ₽`;
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
const plural = (n, [one, few, many]) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};
const formatDate = (iso) =>
  new Date(`${iso}T12:00:00`)
    .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/\s?г\.$/, '');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const scrollBehavior = () => (reducedMotion.matches ? 'auto' : 'smooth');
const mqSmall = window.matchMedia('(max-width: 767px)');
const mqNoSidebar = window.matchMedia('(max-width: 959px)');

const types = data.types;
const typeById = Object.fromEntries(types.map((t) => [t.id, t]));
const periodById = Object.fromEntries(data.periods.map((p) => [p.id, p]));
const countryById = Object.fromEntries(data.countries.map((c) => [c.id, c]));

/* Подсказка «i» к термину и пометка «вопрос к владельцу» */
const tip = (key) => {
  const text = data.terms[key];
  return `<button type="button" class="tip" data-tip="${esc(text)}" aria-label="Подсказка: ${esc(text)}">i</button>`;
};
const ask = (text) =>
  `<button type="button" class="ask" data-tip="${esc(`Вопрос к владельцу: ${text}`)}" aria-label="Вопрос к владельцу сайта: ${esc(text)}">?</button>`;

const ASK_TEXTS = {
  test: data.test.question,
  refund: 'Условия замены и возврата нерабочего прокси нужно уточнить у владельца.',
};

/* ==========================================================================
   Цены и наличие
   ========================================================================== */
const countriesFor = (typeId) => data.countries.filter((c) => c.stock[typeId] !== undefined);
const stockOf = (country, typeId = state.type) => country?.stock[typeId] ?? 0;
const isMobileType = (typeId = state.type) => typeById[typeId].kind === 'mobile';

function unitPrice(typeId, countryId, periodId) {
  const base = data.prices[typeId]?.[periodId];
  if (base == null) return null;
  const factor = countryById[countryId]?.priceFactor ?? 1;
  return factor === 1 ? base : Math.round((base * factor) / 10) * 10;
}

const priceFrom = (typeId) => Math.min(...Object.values(data.prices[typeId]).filter((v) => v != null));
const kindFrom = (kind) => Math.min(...types.filter((t) => t.kind === kind).map((t) => priceFrom(t.id)));
const recoName = (t) => (t.kind === 'server' ? 'Серверные прокси IPv4' : `${t.tableName} прокси`);

/* ==========================================================================
   Состояние конфигуратора
   ========================================================================== */
const state = {
  type: types.find((t) => t.popular)?.id ?? types[0].id,
  country: null,
  operator: null,
  city: null,
  period: data.defaultPeriod,
  qty: 1,
  coupon: '',
};
const cart = [];

const bestCity = (op) => op.cities.reduce((a, b) => (b.signal > a.signal ? b : a));

function selectCountry(country) {
  state.country = country.id;
  if (isMobileType() && country.operators?.length) {
    const op = country.operators[0];
    state.operator = op.name;
    state.city = bestCity(op).name;
  } else {
    state.operator = null;
    state.city = null;
  }
  state.qty = clamp(state.qty, 1, Math.max(1, stockOf(country)));
}

/* Дефолты по ТЗ: страна с наибольшим наличием, 30 дней, 1 шт. */
function selectType(typeId) {
  state.type = typeId;
  const best = countriesFor(typeId).reduce((a, b) => (stockOf(b, typeId) > stockOf(a, typeId) ? b : a));
  selectCountry(best);
  if (data.prices[typeId][state.period] == null) state.period = data.defaultPeriod;
}

const typesLabel = (list) => {
  const mobile = types.filter((t) => t.kind === 'mobile').map((t) => t.id);
  if (list.length === mobile.length && mobile.every((id) => list.includes(id))) return 'мобильные прокси';
  return list.map((id) => typeById[id].name.replace(/^./, (c) => c.toLowerCase())).join(', ');
};

function checkCoupon(raw, s = state) {
  const code = (raw || '').trim().toUpperCase();
  if (!code) return { ok: false, empty: true };
  const promo = data.promos.find((p) => p.code === code);
  if (!promo) return { ok: false, level: 'error', msg: 'Такого купона нет — проверьте написание.' };
  if (new Date(`${promo.validUntil}T23:59:59`) < new Date())
    return { ok: false, level: 'error', msg: 'Срок действия купона истёк.' };
  if (promo.types && !promo.types.includes(s.type))
    return { ok: false, promo, level: 'warn', msg: `Купон ${code} действует только на ${typesLabel(promo.types)}.` };
  if (promo.periods && !promo.periods.includes(s.period))
    return {
      ok: false,
      promo,
      level: 'warn',
      msg: `Купон ${code} действует при аренде на ${promo.periods.map((p) => periodById[p].label).join(', ')}.`,
    };
  if (promo.minQty && s.qty < promo.minQty)
    return { ok: false, promo, level: 'warn', msg: `Купон ${code} действует от ${promo.minQty} шт.` };
  return { ok: true, promo, level: 'ok', msg: `Купон ${code} применён: −${promo.discount}%` };
}

function calc(s = state) {
  const unit = unitPrice(s.type, s.country, s.period);
  const subtotal = unit * s.qty;
  const check = checkCoupon(s.coupon, s);
  const discount = check.ok ? Math.round((subtotal * check.promo.discount) / 100) : 0;
  return { unit, subtotal, discount, total: subtotal - discount, check };
}

/* ==========================================================================
   Статичные блоки из data.json
   ========================================================================== */
const payIconsHtml = () =>
  `<span class="sr-only">Способы оплаты:</span>` +
  data.payments.methods.map((m) => `<span class="pay-icon">${icon(m.icon)}${esc(m.label)}</span>`).join('') +
  `<span class="pay-icon pay-icon--more">+${data.payments.more} ${plural(data.payments.more, ['способ', 'способа', 'способов'])}</span>`;

const reviewsTotal = data.reviewPlatforms.reduce((s, p) => s + p.count, 0);
const ratingAvg = data.reviewPlatforms.reduce((s, p) => s + p.rating * p.count, 0) / reviewsTotal;
const ratingStr = ratingAvg.toFixed(1).replace('.', ',');
const reviewsRounded = `${Math.floor(reviewsTotal / 1000) * 1000}+`;

function renderStatic() {
  $$('[data-pay-icons]').forEach((el) => (el.innerHTML = payIconsHtml()));
  // Первый экран: оценка над заголовком
  $('#hero-rating').innerHTML = `<span class="star" aria-hidden="true">★★★★★</span> <b>${ratingStr}</b> · ${reviewsRounded} отзывов`;

  // Полоса доверия
  const { years, clients, sold } = data.stats;
  $('#trust-title').textContent = `Нам доверяют ${nf.format(clients)} ${plural(clients, ['клиент', 'клиента', 'клиентов'])}`;
  $('#trust-list').innerHTML = `
    <li class="trust__item">
      <a class="trust__rating" href="#reviews"><span class="star" aria-hidden="true">★</span><b>${ratingStr}</b> · ${reviewsRounded} отзывов</a>
      ${ask('Средняя оценка по площадкам посчитана по примерным данным.')}
    </li>
    <li class="trust__item"><b>${years} лет</b> на рынке</li>
    <li class="trust__item"><b>${esc(sold)}</b> проданных прокси</li>`;

  // Бегущая строка: площадки отзывов, оплата и совместимый софт — всё, что уже есть на сайте
  const ticker = [
    ...data.reviewPlatforms.map(
      (p) => `<span class="marquee__logo" style="background:${p.color}" aria-hidden="true">${esc(p.letter)}</span>${esc(p.name)} <b>${p.rating.toFixed(1).replace('.', ',')}</b>`,
    ),
    ...data.payments.methods.map((m) => `${icon(m.icon)}${esc(m.full)}`),
    ...data.worksWith.map((n) => `${icon('check')}${esc(n)}`),
  ];
  const items = ticker.map((t) => `<li class="marquee__item">${t}</li>`).join('');
  // Второй комплект — для бесшовной прокрутки, скрыт от скринридеров
  $('#works-with').innerHTML = items + items.replace(/<li /g, '<li aria-hidden="true" ');

  // Отзывы — сводка
  $('#reviews-lead').textContent = `Средняя оценка ${ratingStr} из 5 — ${nf.format(reviewsTotal)} отзывов на четырёх площадках.`;
  $('#platforms').innerHTML = data.reviewPlatforms
    .map(
      (p) => `<li><a class="platform" href="#" data-stub="Отзывы на площадке ${esc(p.name)}">
        <span class="platform__logo" style="background:${p.color}" aria-hidden="true">${esc(p.letter)}</span>
        <span><span class="platform__name">${esc(p.name)}</span>
        <span class="platform__meta"><span class="star" aria-hidden="true">★</span> <b>${p.rating.toFixed(1).replace('.', ',')}</b> · ${nf.format(p.count)} ${plural(p.count, ['отзыв', 'отзыва', 'отзывов'])}</span></span>
      </a></li>`,
    )
    .join('');
  $('#review-promo').textContent = data.reviewPromo.text;

  // ProxyFarm, партнёрка, поддержка
  const f = data.farm;
  $('#farm-list').innerHTML = f.benefits.map((b) => `<li><span data-icon="check"></span><span>${esc(b)}</span></li>`).join('');
  $('#farm-price').innerHTML = `<b>${rub(f.pricePerModem)}</b> за модем в месяц`;
  $('#farm-price-note').textContent = `−${f.yearDiscount}% при оплате за год`;
  $('#farm-trial').textContent = `Попробовать ${f.trialDays} дней бесплатно`;
  $('#partner-text').textContent = `До ${data.partnerProgram.percent}% с каждой оплаты приглашённых клиентов.`;

  const mins = data.support.responseMinutes;
  $('#support-title').innerHTML = `Остались вопросы? Ответим в течение ${mins} ${plural(mins, ['минуты', 'минут', 'минут'])}${ask('Среднее время ответа поддержки.')}`;
  $$('[data-support-minutes]').forEach((el) => (el.textContent = mins));
  $('#support-email').href = `mailto:${data.support.email}`;

  $$('[data-term]').forEach((el) => (el.outerHTML = tip(el.dataset.term)));
  $$('[data-ask]').forEach((el) => (el.outerHTML = ask(ASK_TEXTS[el.dataset.ask])));
}

/* ==========================================================================
   4. Подбор по задаче
   ========================================================================== */
function renderTasks() {
  $('#tasks').innerHTML = data.tasks
    .map(
      (t) => `<button type="button" class="task" data-task="${t.id}" aria-pressed="false" aria-controls="reco">
        <span class="task__icon">${icon(t.icon)}</span><span>${esc(t.title)}</span></button>`,
    )
    .join('');
}

function showReco(taskId) {
  const task = data.tasks.find((t) => t.id === taskId);
  const t = typeById[task.type];
  $$('.task').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.task === taskId)));
  const facts = [
    `Скорость до ${t.speed}`,
    `${t.connections} подключений`,
    t.usersPerIp === '1' ? 'IP только у вас' : `${t.usersPerIp} пользователей на IP`,
    t.ipChange === 'Статичный' ? 'Статичный IP' : 'Смена IP по таймеру или ссылке',
  ];
  const alt = task.alt
    ? `<p class="reco__alt">${esc(task.alt.text)} <button type="button" class="linklike" data-open-config="${task.alt.type}">${esc(typeById[task.alt.type].tableName.toLowerCase())}</button>.</p>`
    : '';
  $('#reco').innerHTML = `
    <div class="reco__card">
      <div>
        <p class="reco__eyebrow">Рекомендуем для задачи «${esc(task.title)}»${ask('Пары «задача → тип прокси» нужно согласовать.')}</p>
        <h3 class="reco__title">${esc(recoName(t))}</h3>
        <p class="reco__why">${esc(task.why)}${task.term ? tip(task.term) : ''}</p>
        <ul class="reco__facts">${facts.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        ${alt}
      </div>
      <div class="reco__side">
        <p class="reco__price">от <b>${rub(priceFrom(t.id))}</b></p>
        <button type="button" class="btn btn--primary btn--lg btn--block" data-open-config="${t.id}">Выбрать этот вариант</button>
        <a class="link" href="#compare">Сравнить все типы</a>
      </div>
    </div>`;
  syncHeaderCta();
}

/* ==========================================================================
   5. Сравнение
   ========================================================================== */
const compareRows = [
  ['Для кого', (t) => esc(t.audience)],
  ['Скорость до', (t) => esc(t.speed) + (t.speedQuestion ? `*${ask(t.speedQuestion)}` : '')],
  ['Подключений', (t) => esc(t.connections)],
  ['Пользователей на IP', (t) => esc(t.usersPerIp)],
  [`Смена IP${tip('rotation')}`, (t) => esc(t.ipChange)],
  [
    `Смена TCP-отпечатка${tip('tcp')}`,
    (t) =>
      t.tcp
        ? '<span class="yes"><span aria-hidden="true">✓</span><span class="sr-only">есть</span></span>'
        : '<span class="no"><span aria-hidden="true">—</span><span class="sr-only">нет</span></span>',
  ],
  ['Трафик', (t) => esc(t.traffic)],
  ['Цена от', (t) => `<span class="compare__price">${rub(priceFrom(t.id))}</span>${t.priceQuestion ? ask(t.priceQuestion) : ''}`],
];

const chooseBtn = (t, extra = '') =>
  `<button type="button" class="btn ${t.popular ? 'btn--primary' : 'btn--outline'} btn--block ${extra}" data-open-config="${t.id}" aria-label="Выбрать: ${esc(t.tableName)}">Выбрать</button>`;
const popularBadge = '<span class="badge badge--primary">Популярный выбор</span>';

function renderCompare() {
  const pop = (t) => (t.popular ? ' class="is-popular"' : '');
  $('#compare-table').innerHTML = `
    <table class="compare">
      <caption class="sr-only">Сравнение типов прокси</caption>
      <thead><tr>
        <th scope="col"><span class="sr-only">Параметр</span></th>
        ${types.map((t) => `<th scope="col"${pop(t)}>${t.popular ? popularBadge : ''}<span style="display:block">${esc(t.tableName)}</span></th>`).join('')}
      </tr></thead>
      <tbody>
        ${compareRows.map(([label, cell]) => `<tr><th scope="row">${label}</th>${types.map((t) => `<td${pop(t)}>${cell(t)}</td>`).join('')}</tr>`).join('')}
      </tbody>
      <tfoot><tr><td></td>${types.map((t) => `<td${pop(t)}>${chooseBtn(t)}</td>`).join('')}</tr></tfoot>
    </table>`;

  // Mobile: каждая колонка таблицы — вертикальная карточка
  $('#compare-cards').innerHTML = types
    .map(
      (t) => `<article class="ccard${t.popular ? ' is-popular' : ''}" role="listitem">
        <div class="ccard__head">
          <h3 class="ccard__title">${esc(t.tableName)}</h3>
          ${t.popular ? popularBadge : `<span class="badge badge--neutral">от ${rub(priceFrom(t.id))}</span>`}
        </div>
        <dl>${compareRows
          .slice(0, -1)
          .map(([label, cell]) => `<div><dt>${label}</dt><dd>${cell(t)}</dd></div>`)
          .join('')}
          <div><dt>Цена от</dt><dd>${compareRows.at(-1)[1](t)}</dd></div>
        </dl>
        ${chooseBtn(t)}
      </article>`,
    )
    .join('');

  const ipv4 = types.find((t) => t.speedQuestion);
  $('#compare-footnote').textContent = ipv4 ? `* Вопрос к владельцу: ${ipv4.speedQuestion}` : '';
}

/* ==========================================================================
   6. Конфигуратор
   ========================================================================== */
function renderTabs() {
  $('#type-tabs').innerHTML = types
    .map((t) => {
      const sel = t.id === state.type;
      return `<button type="button" class="tab" role="tab" id="tab-${t.id}" data-type="${t.id}" aria-selected="${sel}" aria-controls="config-panel" tabindex="${sel ? 0 : -1}">
        <span>${esc(t.name)}</span><span class="tab__price">от ${rub(priceFrom(t.id))}</span></button>`;
    })
    .join('');
  $('#config-panel').setAttribute('aria-labelledby', `tab-${state.type}`);
}

function renderPanel() {
  const panel = $('#config-panel');
  const t = state.type;
  const country = countryById[state.country];

  // Запоминаем фокус, чтобы клавиатурная навигация не сбрасывалась при перерисовке
  const a = document.activeElement;
  let restore = null;
  if (a && panel.contains(a)) {
    if (a.name) restore = `[name="${a.name}"][value="${CSS.escape(a.value)}"]`;
    else if (a.dataset.qty) restore = `[data-qty="${a.dataset.qty}"]`;
    else if (a.id) restore = `#${a.id}`;
  }

  let n = 0;
  const step = (title, body, extra = '') =>
    `<fieldset class="step"><legend class="step__legend"><span class="step__num" aria-hidden="true">${++n}</span>${title}${extra}</legend>${body}</fieldset>`;

  const countries = countriesFor(t)
    .map((c) => {
      const st = stockOf(c, t);
      const off = st === 0;
      return `<label class="choice${off ? ' is-disabled' : ''}">
        <input type="radio" name="country" value="${c.id}"${c.id === state.country ? ' checked' : ''}${off ? ' disabled' : ''}>
        <span class="choice__body"><span class="flag" style="background:${c.flag}" aria-hidden="true"></span><span>${esc(c.name)}</span>
        <span class="choice__meta">${off ? 'нет в наличии' : `· <span class="sr-only">свободно </span>${st}`}</span></span>
      </label>`;
    })
    .join('');

  let html = step('Страна', `<div class="choices">${countries}</div>`);

  if (isMobileType(t) && country.operators) {
    const ops = country.operators
      .map(
        (op) => `<label class="choice"><input type="radio" name="operator" value="${esc(op.name)}"${op.name === state.operator ? ' checked' : ''}>
          <span class="choice__body">${esc(op.name)}</span></label>`,
      )
      .join('');
    const op = country.operators.find((o) => o.name === state.operator);
    const cities = op.cities
      .map(
        (c) => `<label class="city"><input type="radio" name="city" value="${esc(c.name)}"${c.name === state.city ? ' checked' : ''}>
          <span class="city__body"><span class="city__name">${esc(c.name)}</span>
          <span class="city__signal">${c.signal}%<span class="sr-only"> качество сигнала</span></span>
          <span class="signal-bar${c.signal < 80 ? ' is-mid' : ''}" aria-hidden="true"><span style="width:${c.signal}%"></span></span></span></label>`,
      )
      .join('');
    html += step(
      'Оператор и город',
      `<p class="step__sublabel" id="op-label">Оператор</p>
       <div class="choices" role="radiogroup" aria-labelledby="op-label">${ops}</div>
       <p class="step__sublabel" id="city-label">Город и качество сигнала${tip('signal')}</p>
       <div class="cities" role="radiogroup" aria-labelledby="city-label">${cities}</div>`,
    );
  }

  const segs = data.periods
    .map((p) => {
      const price = unitPrice(t, state.country, p.id);
      const off = price == null;
      const perDay = !off && p.days > 1 ? `<span class="seg__per">≈ ${rub(price / p.days)} в день</span>` : '';
      const badge = !off && p.best ? '<span class="badge badge--good">выгоднее</span>' : '';
      return `<label class="seg${off ? ' is-disabled' : ''}">
        <input type="radio" name="period" value="${p.id}"${p.id === state.period ? ' checked' : ''}${off ? ' disabled' : ''}>
        <span class="seg__body">${badge}<span class="seg__label">${p.label}</span>
        <span class="seg__price">${off ? 'недоступно' : rub(price)}</span>${perDay}</span></label>`;
    })
    .join('');
  const hasOff = data.periods.some((p) => unitPrice(t, state.country, p.id) == null);
  html += step('Срок аренды', `<div class="segs">${segs}</div>`, hasOff ? ask(data.periodQuestion) : '');

  const max = stockOf(country, t);
  html += step(
    'Количество',
    `<div class="qty">
      <div class="stepper">
        <button type="button" data-qty="-1" aria-label="Уменьшить количество"${state.qty <= 1 ? ' disabled' : ''}>−</button>
        <input type="number" id="qty-input" min="1" max="${max}" value="${state.qty}" inputmode="numeric" aria-label="Количество, штук">
        <button type="button" data-qty="1" aria-label="Увеличить количество"${state.qty >= max ? ' disabled' : ''}>+</button>
      </div>
      <span class="qty__hint">Свободно: ${max} шт.</span>
    </div>`,
  );

  panel.innerHTML = html;

  // На mobile сроки — горизонтальная лента: держим выбранный срок в поле зрения
  const segRow = $('.segs', panel);
  const checkedSeg = $('input[name="period"]:checked', panel)?.closest('.seg');
  if (segRow && checkedSeg && segRow.scrollWidth > segRow.clientWidth) {
    const sr = segRow.getBoundingClientRect();
    const cr = checkedSeg.getBoundingClientRect();
    if (cr.right > sr.right || cr.left < sr.left) segRow.scrollLeft += cr.right - sr.right + 4;
  }

  if (restore) {
    let el = panel.querySelector(restore);
    if (!el || el.disabled) el = $('#qty-input');
    el?.focus({ preventScroll: true });
  }
}

function renderSummary() {
  const t = typeById[state.type];
  const c = countryById[state.country];
  const p = periodById[state.period];
  const r = calc();

  const rows = [
    ['Тип', t.name],
    ['Страна', c.name],
  ];
  if (state.operator) rows.push(['Оператор', state.operator], ['Город', state.city]);
  rows.push(['Срок', p.label], ['Количество', `${state.qty} шт.`]);
  $('#summary-list').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');

  $('#sum-unit').textContent = rub(r.unit);
  $('#sum-perday').textContent = p.days > 1 ? `(≈ ${rub(r.unit / p.days)} в день)` : '';
  $('#sum-total').textContent = rub(r.total);
  $('#sum-old').textContent = r.discount ? rub(r.subtotal) : '';

  const msg = $('#coupon-msg');
  msg.className = 'coupon__msg';
  if (r.check.empty) {
    msg.textContent = '';
  } else {
    msg.classList.add(`is-${r.check.level}`);
    const text = r.check.ok ? `${r.check.msg} (−${rub(r.discount)})` : r.check.msg;
    msg.innerHTML = `${esc(text)} <button type="button" class="linklike" data-coupon-clear>Убрать</button>`;
  }

  $('#sticky-total').textContent = rub(r.total);
  $('#sticky-old').textContent = r.discount ? rub(r.subtotal) : '';
  $('#sticky-meta').textContent = `${t.name} · ${c.name} · ${p.label} · ${state.qty} шт.`;
}

function updateConfig({ tabs = false } = {}) {
  if (tabs) renderTabs();
  renderPanel();
  renderSummary();
  renderQuickbuy();
}

/* ==========================================================================
   Выпадающий список: на ПК — панель под полем, на mobile — шторка снизу.
   Паттерн listbox: стрелки, Home/End, Enter/Пробел, Esc.
   ========================================================================== */
const dropdowns = {};

function renderDropdown(field, { id, label, options, value, onChange }) {
  dropdowns[id] = { options, onChange };
  const cur = options.find((o) => o.value === value) ?? options[0];
  const opt = (o) => {
    if (o.group) return `<li class="dd__group" role="presentation">${esc(o.group)}</li>`;
    const sel = o.value === cur.value;
    // Нет в наличии / недоступно — приглушено и с заметной меткой
    const meta = o.disabled
      ? `<span class="dd__meta dd__meta--off">${icon('ban')}${esc(o.meta)}</span>`
      : o.meta
        ? `<span class="dd__meta">${esc(o.meta)}</span>`
        : '';
    return `<li class="dd__option" role="option" id="${id}-opt-${o.value}" data-value="${o.value}" aria-selected="${sel}"${o.disabled ? ' aria-disabled="true"' : ''}>
      ${o.flag ? `<span class="flag" style="background:${o.flag}" aria-hidden="true"></span>` : ''}
      <span class="dd__opt-label">${esc(o.label)}</span>
      ${meta}
      ${sel ? `<span class="dd__check" aria-hidden="true">${icon('check')}</span>` : ''}
    </li>`;
  };
  field.innerHTML = `
    <div class="dd" data-dd="${id}">
      <span class="quickbuy__label" id="${id}-label">${esc(label)}</span>
      <button type="button" class="dd__button" id="${id}-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-list" aria-labelledby="${id}-label ${id}-btn">
        ${cur.flag ? `<span class="flag" style="background:${cur.flag}" aria-hidden="true"></span>` : ''}
        <span class="dd__value">${esc(cur.display ?? cur.label)}</span>
        <span class="dd__chevron" aria-hidden="true">${icon('chevron')}</span>
      </button>
      <div class="dd__popup" id="${id}-popup" hidden>
        <div class="dd__sheet-head"><span>${esc(label)}</span>
          <button type="button" class="icon-btn icon-btn--plain dd__close" aria-label="Закрыть">${icon('close')}</button></div>
        <ul class="dd__list" role="listbox" id="${id}-list" tabindex="-1" aria-labelledby="${id}-label">${options.map(opt).join('')}</ul>
      </div>
    </div>`;
}

let openDd = null;

function ddEnabled(dd) {
  return $$('.dd__option:not([aria-disabled="true"])', dd);
}

function setActive(dd, li) {
  const list = $('.dd__list', dd);
  $$('.dd__option.is-active', dd).forEach((x) => x.classList.remove('is-active'));
  if (!li) return;
  li.classList.add('is-active');
  list.setAttribute('aria-activedescendant', li.id);
  // Прокручиваем только сам список — scrollIntoView сдвинул бы и страницу
  const top = li.offsetTop - list.offsetTop;
  if (top < list.scrollTop) list.scrollTop = top;
  else if (top + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + li.offsetHeight - list.clientHeight;
}

function openDropdown(dd) {
  if (openDd && openDd !== dd) closeDropdown(false);
  openDd = dd;
  const popup = $('.dd__popup', dd);
  popup.hidden = false;
  $('.dd__button', dd).setAttribute('aria-expanded', 'true');
  if (mqSmall.matches) {
    $('#dd-backdrop').hidden = false;
    document.body.classList.add('dd-open');
  }
  else fitPopup(dd);
  const list = $('.dd__list', dd);
  setActive(dd, $('.dd__option[aria-selected="true"]', dd) || ddEnabled(dd)[0]);
  list.focus({ preventScroll: true });
}

/* Панель списка не выходит за границы первого экрана:
   открывается туда, где больше места, и при нехватке прокручивается внутри */
function fitPopup(dd) {
  const popup = $('.dd__popup', dd);
  const list = $('.dd__list', dd);
  const bounds = dd.closest('.hero')?.getBoundingClientRect();
  if (!bounds) return;
  popup.classList.remove('dd__popup--up');
  list.style.maxHeight = '';
  const field = dd.closest('.quickbuy__field').getBoundingClientRect();
  const GAP = 12;
  const MARGIN = 16;
  const chrome = popup.offsetHeight - list.clientHeight; // отступы и рамка панели
  const natural = list.scrollHeight + chrome;
  const below = bounds.bottom - field.bottom - GAP - MARGIN;
  const above = field.top - bounds.top - GAP - MARGIN;
  // Вниз — по умолчанию: вверх только когда снизу не помещается даже короткий список
  const MIN_DOWN = 200;
  const up = natural > below && below < MIN_DOWN && above > below;
  popup.classList.toggle('dd__popup--up', up);
  const room = up ? above : below;
  if (natural > room) list.style.maxHeight = `${Math.max(room - chrome, 120)}px`;
}

function closeDropdown(focusButton = true) {
  if (!openDd) return;
  const dd = openDd;
  openDd = null;
  $('.dd__popup', dd).hidden = true;
  $('.dd__button', dd).setAttribute('aria-expanded', 'false');
  $('#dd-backdrop').hidden = true;
  document.body.classList.remove('dd-open');
  if (focusButton) $('.dd__button', dd).focus({ preventScroll: true });
}

function chooseOption(dd, li) {
  if (!li || li.getAttribute('aria-disabled') === 'true') return;
  const id = dd.dataset.dd;
  closeDropdown(false);
  dropdowns[id].onChange(li.dataset.value);
  // Поле перерисовалось — возвращаем фокус на новую кнопку
  $(`#${id}-btn`)?.focus({ preventScroll: true });
}

function bindDropdowns() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.dd__button');
    if (btn) {
      const dd = btn.closest('.dd');
      if (openDd === dd) closeDropdown();
      else openDropdown(dd);
      return;
    }
    const li = e.target.closest('.dd__option');
    if (li) return chooseOption(li.closest('.dd'), li);
    if (e.target.closest('.dd__close') || e.target.id === 'dd-backdrop') return closeDropdown();
    if (openDd && !e.target.closest('.dd')) closeDropdown(false);
  });
  document.addEventListener('keydown', (e) => {
    const btn = e.target.closest?.('.dd__button');
    if (btn && ['ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      openDropdown(btn.closest('.dd'));
      return;
    }
    if (!openDd || !e.target.closest?.('.dd__list')) return;
    const items = ddEnabled(openDd);
    const active = $('.dd__option.is-active', openDd);
    let i = items.indexOf(active);
    if (e.key === 'ArrowDown') i = Math.min(i + 1, items.length - 1);
    else if (e.key === 'ArrowUp') i = Math.max(i - 1, 0);
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = items.length - 1;
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      return chooseOption(openDd, active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      return closeDropdown();
    } else if (e.key === 'Tab') return closeDropdown(false);
    else return;
    e.preventDefault();
    setActive(openDd, items[i]);
  });
  mqSmall.addEventListener('change', () => closeDropdown(false));
  window.addEventListener('resize', () => openDd && !mqSmall.matches && fitPopup(openDd));
}

/* ==========================================================================
   Быстрый заказ на первом экране.
   Прокси — та же модель состояния, что у конфигуратора; лицензия ProxyFarm — свой мини-расчёт.
   ========================================================================== */
const FARM = 'farm';
const farmState = { modems: 1, plan: data.farm.plans[0].id };
let qbMode = 'proxy';

function farmCalc() {
  const plan = data.farm.plans.find((p) => p.id === farmState.plan);
  const subtotal = data.farm.pricePerModem * farmState.modems * plan.months;
  const discount = Math.round((subtotal * (plan.discount ?? 0)) / 100);
  return { plan, subtotal, discount, total: subtotal - discount };
}

function renderQuickbuy() {
  const farm = qbMode === FARM;
  const typeOptions = [
    { group: 'Прокси' },
    ...types.map((x) => ({ value: x.id, label: x.name, meta: `от ${rub(priceFrom(x.id))}` })),
    { group: 'Софт для прокси-ферм' },
    { value: FARM, label: data.farm.name, meta: `${rub(data.farm.pricePerModem)}/модем` },
  ];
  renderDropdown($('#qb-type-field'), {
    id: 'qb-type',
    label: 'Тариф',
    options: typeOptions,
    value: farm ? FARM : state.type,
    onChange: (v) => {
      if (v === FARM) qbMode = FARM;
      else {
        qbMode = 'proxy';
        selectType(v);
        updateConfig({ tabs: true });
      }
      renderQuickbuy();
    },
  });

  // У лицензии ProxyFarm два поля — Тариф и Срок, модемы — счётчиком в стоимости (как количество у прокси)
  $('#quickbuy').classList.toggle('is-farm', farm);

  // Второе поле — страна
  const second = $('#qb-second-field');
  if (!farm) {
    renderDropdown(second, {
      id: 'qb-country',
      label: 'Страна',
      options: countriesFor(state.type).map((c) => {
        const st = stockOf(c, state.type);
        return { value: c.id, label: c.name, flag: c.flag, meta: st === 0 ? 'нет в наличии' : `${st} шт.`, disabled: st === 0 };
      }),
      value: state.country,
      onChange: (v) => {
        selectCountry(countryById[v]);
        updateConfig();
      },
    });
  }

  // Оператор и город — отдельное поле; у IPv4 их нет, у лицензии поле скрыто
  const opField = $('#qb-op-field');
  const opCountry = countryById[state.country];
  if (!farm && isMobileType() && opCountry.operators) {
    const opOptions = opCountry.operators.flatMap((o) => [
      { group: o.name },
      ...o.cities.map((c) => ({ value: `${o.name}|${c.name}`, label: c.name, display: `${o.name}, ${c.name}`, meta: `сигнал ${c.signal}%` })),
    ]);
    renderDropdown(opField, {
      id: 'qb-op',
      label: 'Оператор и город',
      options: opOptions,
      value: `${state.operator}|${state.city}`,
      onChange: (v) => {
        const [op, city] = v.split('|');
        state.operator = op;
        state.city = city;
        updateConfig();
      },
    });
  } else if (!farm) {
    opField.innerHTML = `
      <span class="quickbuy__label">Оператор и город</span>
      <span class="qb-static">Не требуется для IPv4</span>`;
  }

  // Срок аренды (для лицензии — срок подписки)
  const periodOptions = farm
    ? data.farm.plans.map((p) => ({
        value: p.id,
        label: p.label,
        meta: `${rub(data.farm.pricePerModem * p.months * (1 - (p.discount ?? 0) / 100))}${p.discount ? ` · −${p.discount}%` : ''}`,
      }))
    : data.periods.map((p) => {
        const price = unitPrice(state.type, state.country, p.id);
        return {
          value: p.id,
          label: p.label,
          meta: price == null ? 'недоступно' : `${rub(price)}${p.best ? ' · выгоднее' : ''}`,
          disabled: price == null,
        };
      });
  renderDropdown($('#qb-third-field'), {
    id: 'qb-period',
    label: 'Срок аренды',
    options: periodOptions,
    value: farm ? farmState.plan : state.period,
    onChange: (v) => {
      if (qbMode === FARM) {
        farmState.plan = v;
        renderQuickbuy();
      } else {
        state.period = v;
        updateConfig();
      }
    },
  });

  // Общая стоимость: сумма, цена за единицу и количество. Купон вводится при оформлении
  const extra = $('#qb-extra');
  $('#qb-total-label').textContent = 'Общая стоимость:';
  if (farm) {
    const r = farmCalc();
    $('#qb-total').textContent = rub(r.total);
    $('#qb-old').textContent = r.discount ? rub(r.subtotal) : '';
    $('#qb-unit').textContent = `(${rub(data.farm.pricePerModem)} за модем в месяц)`;
    extra.innerHTML = `
      ${stepperHtml('modems', farmState.modems, data.farm.maxModems, null, 'Количество модемов')}
      <span class="qb-qty-unit">${plural(farmState.modems, ['модем', 'модема', 'модемов'])}</span>`;
    $('#qb-buy').textContent = 'Купить лицензию';
  } else {
    const r = calc();
    const max = stockOf(countryById[state.country]);
    $('#qb-total').textContent = rub(r.total);
    $('#qb-old').textContent = r.discount ? rub(r.subtotal) : '';
    $('#qb-unit').textContent = state.qty > 1 ? `(${state.qty} × ${rub(r.unit)})` : `(${rub(r.unit)} за шт.)`;
    extra.innerHTML = `
      ${stepperHtml('qty', state.qty, max, null, 'Количество, шт.')}
      <span class="qb-qty-unit">шт.${r.check.ok ? ` · купон ${esc(r.check.promo.code)}` : ''}</span>`;
    $('#qb-buy').textContent = 'Купить прокси';
  }
}

/* Счётчик − N + для количества прокси и числа модемов */
function stepperHtml(kind, value, max, labelledBy, label) {
  const by = labelledBy ? `aria-labelledby="${labelledBy}"` : `aria-label="${label}"`;
  return `<span class="qb-stepper qb-stepper--${kind}" role="group" ${by}>
    <button type="button" data-step="${kind}" data-delta="-1" aria-label="Меньше"${value <= 1 ? ' disabled' : ''}>−</button>
    <input type="number" data-step-input="${kind}" min="1" max="${max}" value="${value}" inputmode="numeric" ${by}>
    <button type="button" data-step="${kind}" data-delta="1" aria-label="Больше"${value >= max ? ' disabled' : ''}>+</button>
  </span>`;
}

function setStep(kind, value) {
  if (kind === 'modems') {
    farmState.modems = clamp(value || 1, 1, data.farm.maxModems);
    renderQuickbuy();
  } else {
    state.qty = clamp(value || 1, 1, stockOf(countryById[state.country]));
    updateConfig();
  }
}

function farmItem() {
  const r = farmCalc();
  return { kind: FARM, modems: farmState.modems, plan: r.plan.id, qty: farmState.modems, subtotal: r.subtotal, discount: r.discount, total: r.total };
}

function bindQuickbuy() {
  const form = $('#quickbuy');
  form.addEventListener('change', (e) => {
    const kind = e.target.dataset.stepInput;
    if (kind) setStep(kind, parseInt(e.target.value, 10));
  });
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    const kind = b.dataset.step;
    const cur = kind === 'modems' ? farmState.modems : state.qty;
    setStep(kind, cur + Number(b.dataset.delta));
    const again = $(`[data-step="${kind}"][data-delta="${b.dataset.delta}"]`);
    (again && !again.disabled ? again : $(`[data-step-input="${kind}"]`))?.focus({ preventScroll: true });
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (qbMode === FARM) openCheckout([farmItem()], 'farm');
    else openCheckout([itemFromState()], 'config');
  });
}

function setType(typeId, { focusTab = false } = {}) {
  selectType(typeId);
  updateConfig({ tabs: true });
  scrollTabIntoView();
  if (focusTab) $(`#tab-${typeId}`).focus({ preventScroll: true });
}

function flashTabs() {
  const tabs = $('#type-tabs');
  tabs.classList.remove('is-flash');
  void tabs.offsetWidth;
  tabs.classList.add('is-flash');
  scrollTabIntoView();
}

function scrollTabIntoView() {
  const tabs = $('#type-tabs');
  const sel = $(`#tab-${state.type}`);
  if (tabs.scrollWidth <= tabs.clientWidth) return;
  const left = tabs.scrollLeft + sel.getBoundingClientRect().left - tabs.getBoundingClientRect().left - 8;
  tabs.scrollTo({ left, behavior: scrollBehavior() });
}

function goToConfig() {
  $('#buy').scrollIntoView({ behavior: scrollBehavior() });
  flashTabs();
  $(`#tab-${state.type}`).focus({ preventScroll: true });
}

function openConfig(typeId) {
  setType(typeId);
  goToConfig();
}

function applyPromo(promoId) {
  const p = data.promos.find((x) => x.id === promoId);
  const notes = [];
  if (p.types && !p.types.includes(state.type)) selectType(p.applyType);
  if (p.periods && !p.periods.includes(state.period)) {
    state.period = p.periods[0];
    notes.push(`срок ${periodById[state.period].label}`);
  }
  if (p.minQty && state.qty < p.minQty) {
    state.qty = Math.min(p.minQty, stockOf(countryById[state.country]));
    notes.push(`количество ${state.qty} шт.`);
  }
  state.coupon = p.code;
  $('#coupon-input').value = p.code;
  updateConfig({ tabs: true });
  goToConfig();
  toast(`Купон ${p.code} применён${notes.length ? ` · выбрали ${notes.join(', ')}` : ''}`);
}

function bindConfig() {
  const tabs = $('#type-tabs');
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[role="tab"]');
    if (b && b.dataset.type !== state.type) setType(b.dataset.type);
  });
  tabs.addEventListener('keydown', (e) => {
    const ids = types.map((t) => t.id);
    let i = ids.indexOf(state.type);
    if (e.key === 'ArrowRight') i = (i + 1) % ids.length;
    else if (e.key === 'ArrowLeft') i = (i - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = ids.length - 1;
    else return;
    e.preventDefault();
    setType(ids[i], { focusTab: true });
    scrollTabIntoView();
  });

  const panel = $('#config-panel');
  panel.addEventListener('change', (e) => {
    const el = e.target;
    if (el.name === 'country') selectCountry(countryById[el.value]);
    else if (el.name === 'operator') {
      const op = countryById[state.country].operators.find((o) => o.name === el.value);
      state.operator = op.name;
      state.city = bestCity(op).name;
    } else if (el.name === 'city') state.city = el.value;
    else if (el.name === 'period') state.period = el.value;
    else if (el.id === 'qty-input') state.qty = clamp(parseInt(el.value, 10) || 1, 1, stockOf(countryById[state.country]));
    else return;
    updateConfig();
  });
  // Ввод количества с клавиатуры: пересчитываем итог сразу, не перерисовывая поле
  panel.addEventListener('input', (e) => {
    if (e.target.id !== 'qty-input') return;
    const max = stockOf(countryById[state.country]);
    const v = parseInt(e.target.value, 10);
    if (v >= 1 && v <= max) {
      state.qty = v;
      renderSummary();
      $('[data-qty="-1"]').disabled = v <= 1;
      $('[data-qty="1"]').disabled = v >= max;
    }
  });
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-qty]');
    if (!b) return;
    state.qty = clamp(state.qty + Number(b.dataset.qty), 1, stockOf(countryById[state.country]));
    updateConfig();
  });

  $('#coupon-form').addEventListener('submit', (e) => {
    e.preventDefault();
    state.coupon = $('#coupon-input').value.trim().toUpperCase();
    $('#coupon-input').value = state.coupon;
    renderSummary();
    if (!state.coupon) {
      const msg = $('#coupon-msg');
      msg.className = 'coupon__msg is-error';
      msg.textContent = 'Введите код купона.';
    }
  });
  $('#summary').addEventListener('click', (e) => {
    if (!e.target.closest('[data-coupon-clear]')) return;
    state.coupon = '';
    $('#coupon-input').value = '';
    renderSummary();
    $('#coupon-input').focus();
  });

  $('#buy-btn').addEventListener('click', () => openCheckout([itemFromState()], 'config'));
  $('#sticky-buy').addEventListener('click', () => openCheckout([itemFromState()], 'config'));
  $('#cart-add-btn').addEventListener('click', addToCart);
}

/* ==========================================================================
   Корзина и оформление
   ========================================================================== */
function itemFromState() {
  const r = calc();
  return {
    type: state.type,
    country: state.country,
    operator: state.operator,
    city: state.city,
    period: state.period,
    qty: state.qty,
    subtotal: r.subtotal,
    discount: r.discount,
    total: r.total,
    coupon: r.check.ok ? r.check.promo.code : null,
  };
}

const itemTitle = (it) => (it.kind === FARM ? data.farm.name : typeById[it.type].name);

const itemMeta = (it) =>
  it.kind === FARM
    ? `${it.modems} ${plural(it.modems, ['модем', 'модема', 'модемов'])} · ${data.farm.plans.find((p) => p.id === it.plan).label}`
    : [
    countryById[it.country].name,
    it.city ? `${it.operator}, ${it.city}` : null,
    periodById[it.period].label,
    `${it.qty} шт.`,
    it.coupon ? `купон ${it.coupon}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

const itemPrice = (it) => `${it.discount ? `<s class="muted">${rub(it.subtotal)}</s><br>` : ''}${rub(it.total)}`;

function addToCart() {
  cart.push(itemFromState());
  updateCartCount(true);
  toast(`Добавлено в корзину: ${typeById[state.type].name}, ${state.qty} шт.`);
}

function updateCartCount(bump = false) {
  const count = $('#cart-count');
  count.textContent = cart.length;
  $('#cart-btn').setAttribute('aria-label', `Корзина, товаров: ${cart.length}`);
  if (bump) {
    count.classList.remove('is-bump');
    void count.offsetWidth;
    count.classList.add('is-bump');
  }
}

function renderCart() {
  const body = $('#cart-body');
  if (!cart.length) {
    body.innerHTML = `<p class="cart-empty">Корзина пуста.</p>
      <button type="button" class="btn btn--primary btn--block" data-close data-goto="buy">Перейти к выбору прокси</button>`;
    return;
  }
  const total = cart.reduce((s, it) => s + it.total, 0);
  body.innerHTML = `
    ${cart
      .map(
        (it, i) => `<div class="cart-item">
          <div><div>${esc(itemTitle(it))}</div><div class="order-item__meta">${esc(itemMeta(it))}</div></div>
          <div class="order-item__price">${itemPrice(it)}</div>
          <button type="button" class="linklike cart-item__remove" data-cart-remove="${i}">Удалить</button>
        </div>`,
      )
      .join('')}
    <div class="cart-total"><span>Итого</span><span>${rub(total)}</span></div>
    <button type="button" class="btn btn--primary btn--lg btn--block" data-cart-checkout>Оформить заказ</button>`;
}

let checkoutSource = null;
let checkoutItems = [];

function renderCheckoutItems() {
  const total = checkoutItems.reduce((s, it) => s + it.total, 0);
  $('#checkout-items').innerHTML =
    checkoutItems
      .map(
        (it) => `<div class="order-item">
          <div><div>${esc(itemTitle(it))}</div><div class="order-item__meta">${esc(itemMeta(it))}</div></div>
          <div class="order-item__price">${itemPrice(it)}</div></div>`,
      )
      .join('') + `<div class="order-total"><span>К оплате</span><span>${rub(total)}</span></div>`;
  $('#checkout-pay').textContent = `Оплатить ${rub(total)}`;
}

function openCheckout(items, source) {
  checkoutItems = items;
  checkoutSource = source;
  renderCheckoutItems();
  resetForm('#checkout-form', '#checkout-success');
  // Купон в оформлении — только для заказа прокси из конфигуратора или первого экрана
  const coupon = $('#checkout-coupon');
  coupon.hidden = source !== 'config';
  coupon.open = Boolean(state.coupon) && source === 'config';
  $('#checkout-coupon-input').value = state.coupon;
  showCheckoutCoupon();
  openDialog($('#checkout-dialog'));
  // На mobile не открываем клавиатуру сразу — сначала человек видит заказ и сумму
  if (!mqSmall.matches) $('#checkout-email').focus();
}

function showCheckoutCoupon() {
  const msg = $('#checkout-coupon-msg');
  const r = calc();
  msg.className = 'coupon__msg';
  if (r.check.empty) msg.textContent = '';
  else {
    msg.classList.add(`is-${r.check.level}`);
    msg.textContent = r.check.ok ? `${r.check.msg} (−${rub(r.discount)})` : r.check.msg;
  }
}

function applyCheckoutCoupon() {
  state.coupon = $('#checkout-coupon-input').value.trim().toUpperCase();
  $('#checkout-coupon-input').value = state.coupon;
  $('#coupon-input').value = state.coupon;
  updateConfig();
  checkoutItems = [itemFromState()];
  renderCheckoutItems();
  showCheckoutCoupon();
}

function renderPayOptions() {
  const opts = [
    ...data.payments.methods,
    { id: 'other', full: `Ещё ${data.payments.more} способов`, icon: 'more' },
  ];
  $('#pay-options').innerHTML = opts
    .map(
      (m, i) => `<label class="pay-option"><input type="radio" name="pay" value="${m.id}"${i === 0 ? ' checked' : ''}>
        <span class="pay-option__body">${icon(m.icon)}${esc(m.full ?? m.label)}</span></label>`,
    )
    .join('');
}

function resetForm(formSel, successSel) {
  const form = $(formSel);
  form.hidden = false;
  $(successSel).hidden = true;
  $$('.field__error', form).forEach((el) => (el.textContent = ''));
  $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
}

function validateEmail(input, err) {
  const v = input.value.trim();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  input.setAttribute('aria-invalid', String(!ok));
  err.textContent = ok ? '' : v ? 'Похоже, в адресе ошибка. Пример: name@mail.ru' : 'Введите e-mail — на него придут доступы.';
  return ok;
}

function validateConsent(cb, err) {
  cb.setAttribute('aria-invalid', String(!cb.checked));
  err.textContent = cb.checked ? '' : 'Нужно согласие на обработку данных.';
  return cb.checked;
}

function bindCheckout() {
  renderPayOptions();
  $('#checkout-coupon-apply').addEventListener('click', applyCheckoutCoupon);
  $('#checkout-coupon-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyCheckoutCoupon();
    }
  });
  $('#checkout-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = $('#checkout-email');
    const consent = $('#checkout-consent');
    const okEmail = validateEmail(email, $('#checkout-email-err'));
    const okConsent = validateConsent(consent, $('#checkout-consent-err'));
    if (!okEmail) return email.focus();
    if (!okConsent) return consent.focus();

    const pay = $('#pay-options input:checked');
    const payLabel = pay.closest('label').textContent.trim();
    const qty = checkoutItems.reduce((s, it) => s + it.qty, 0);
    const what = checkoutItems.every((it) => it.kind === FARM) ? 'Ключ лицензии ProxyFarm придёт' : `Доступы к ${qty} прокси придут`;
    $('#checkout-success-text').textContent = `${what} на ${email.value.trim()} в течение 5 минут после оплаты (${payLabel}).`;
    $('#checkout-form').hidden = true;
    $('#checkout-success').hidden = false;
    $('#checkout-success [data-close]').focus();
    if (checkoutSource === 'cart') {
      cart.length = 0;
      updateCartCount();
    }
  });

  $('#cart-btn').addEventListener('click', () => {
    renderCart();
    openDialog($('#cart-dialog'));
  });
  $('#cart-body').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-cart-remove]');
    if (rm) {
      cart.splice(Number(rm.dataset.cartRemove), 1);
      updateCartCount();
      renderCart();
      ($('#cart-body button') || $('#cart-dialog [data-close]')).focus();
    }
    if (e.target.closest('[data-cart-checkout]')) {
      $('#cart-dialog').close();
      openCheckout([...cart], 'cart');
    }
  });
}

/* ==========================================================================
   Модалка теста
   ========================================================================== */
let testType = state.type;

function openTest() {
  $('#test-types').innerHTML = types
    .map(
      (t) => `<label class="test-type"><input type="radio" name="test-type" value="${t.id}"${t.id === state.type ? ' checked' : ''}>
        <span class="test-type__body">${esc(t.name)}<small>${esc(t.audience)}</small></span></label>`,
    )
    .join('');
  $('#test-fine').innerHTML = `Тест на ${data.test.durationMinutes} минут, без оплаты и привязки карты.${ask(data.test.question)}`;
  resetForm('#test-form', '#test-success');
  openDialog($('#test-dialog'));
  $('#test-types input:checked').focus();
}

function bindTest() {
  $('#test-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = $('#test-email');
    const consent = $('#test-consent');
    const okEmail = validateEmail(email, $('#test-email-err'));
    const okConsent = validateConsent(consent, $('#test-consent-err'));
    if (!okEmail) return email.focus();
    if (!okConsent) return consent.focus();
    testType = $('#test-types input:checked').value;
    $('#test-success-text').textContent = `Доступ к прокси «${typeById[testType].name}» на ${data.test.durationMinutes} минут отправили на ${email.value.trim()}. Если письма нет — проверьте папку «Спам».`;
    $('#test-form').hidden = true;
    $('#test-success').hidden = false;
    $('#test-success [data-close]').focus();
  });
}

/* ==========================================================================
   Диалоги, тосты, подсказки
   ========================================================================== */
function openDialog(d) {
  if (!d.open) d.showModal();
  syncSticky();
}

const openDialogEl = () => $('dialog[open]');

/* Тост и подсказка должны быть над модалкой (top layer), поэтому переносим их внутрь открытого диалога */
function hostFor(el) {
  return el?.closest('dialog') || openDialogEl() || document.body;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  const host = hostFor(null);
  if (t.parentElement !== host) host.append(t);
  t.textContent = msg;
  t.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-visible'), 3000);
}

const srStatus = (msg) => {
  $('#sr-status').textContent = '';
  setTimeout(() => ($('#sr-status').textContent = msg), 50);
};

const tipEl = $('#tooltip');
let tipFor = null;

function showTip(btn) {
  const host = hostFor(btn);
  if (tipEl.parentElement !== host) host.append(tipEl);
  tipFor = btn;
  tipEl.textContent = btn.dataset.tip;
  tipEl.className = `tooltip${btn.classList.contains('ask') ? ' tooltip--ask' : ''}`;
  tipEl.hidden = false;
  const r = btn.getBoundingClientRect();
  const w = tipEl.offsetWidth;
  const h = tipEl.offsetHeight;
  const vw = document.documentElement.clientWidth;
  const left = clamp(r.left + r.width / 2 - w / 2, 8, vw - w - 8);
  let top = r.top - h - 8;
  if (top < 72) top = r.bottom + 8;
  tipEl.style.left = `${left}px`;
  tipEl.style.top = `${top}px`;
}

function hideTip() {
  tipEl.hidden = true;
  tipFor = null;
}

function bindTips() {
  document.addEventListener('mouseover', (e) => {
    const b = e.target.closest('.tip, .ask');
    if (b && b !== tipFor) showTip(b);
  });
  document.addEventListener('mouseout', (e) => {
    const b = e.target.closest('.tip, .ask');
    if (b && !b.contains(e.relatedTarget) && document.activeElement !== b) hideTip();
  });
  document.addEventListener('focusin', (e) => {
    const b = e.target.closest?.('.tip, .ask');
    if (b) showTip(b);
    else if (tipFor) hideTip();
  });
  window.addEventListener('scroll', () => tipFor && hideTip(), { passive: true });
}

/* ==========================================================================
   Шапка: меню, «Ещё», язык, основная кнопка
   ========================================================================== */
function setMenu(open) {
  const nav = $('#nav');
  const burger = $('#burger');
  nav.classList.toggle('is-open', open);
  document.body.classList.toggle('menu-open', open);
  burger.setAttribute('aria-expanded', String(open));
  burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  if (open) $('.nav__link', nav).focus();
}

function setMore(open) {
  const btn = $('.nav__more-btn');
  btn.setAttribute('aria-expanded', String(open));
  $('#more-menu').hidden = !open;
}

function bindHeader() {
  $('#burger').addEventListener('click', () => setMenu(!$('#nav').classList.contains('is-open')));
  $('#nav').addEventListener('click', (e) => {
    if (e.target.closest('a[href^="#"]:not([data-stub])')) setMenu(false);
  });
  $('.nav__more-btn').addEventListener('click', () => setMore($('#more-menu').hidden));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav__more')) setMore(false);
  });
  window.matchMedia('(min-width: 1120px)').addEventListener('change', (e) => e.matches && setMenu(false));

  $$('[data-lang]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.lang === 'en') toast('Английская версия в прототипе не переведена');
    }),
  );
}

/* Одна основная кнопка на экран: «Купить» в шапке становится основной,
   только когда в видимой области нет другой основной кнопки */
let ctaRaf = 0;
function syncHeaderCta() {
  cancelAnimationFrame(ctaRaf);
  ctaRaf = requestAnimationFrame(() => {
    const top = $('.header').getBoundingClientRect().bottom;
    const vh = window.innerHeight;
    const stickyOn = $('#sticky-bar').classList.contains('is-visible');
    const busy =
      stickyOn ||
      $$('main .btn--primary').some((b) => {
        if (!b.offsetParent) return false;
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.bottom > top && r.top < vh;
      });
    const cta = $('#header-cta');
    cta.classList.toggle('btn--primary', !busy);
    cta.classList.toggle('btn--outline', busy);
  });
}

/* ==========================================================================
   Прилипающая панель итога (mobile)
   ========================================================================== */
let configInView = false;
let actionsInView = false;

function syncSticky() {
  const bar = $('#sticky-bar');
  const show = mqNoSidebar.matches && configInView && !actionsInView && !openDialogEl();
  bar.classList.toggle('is-visible', show);
  bar.setAttribute('aria-hidden', String(!show));
  $('#sticky-buy').tabIndex = show ? 0 : -1;
  document.body.classList.toggle('has-sticky-bar', show);
  syncHeaderCta();
}

function bindSticky() {
  new IntersectionObserver(
    ([en]) => {
      configInView = en.isIntersecting;
      syncSticky();
    },
    { rootMargin: '-64px 0px -80px 0px' },
  ).observe($('.config'));
  new IntersectionObserver(
    ([en]) => {
      actionsInView = en.isIntersecting;
      syncSticky();
    },
    { threshold: 0.6 },
  ).observe($('#summary-actions'));
  mqNoSidebar.addEventListener('change', syncSticky);
  $$('dialog').forEach((d) => d.addEventListener('close', syncSticky));
}

/* ==========================================================================
   Отзывы: карусель
   ========================================================================== */
function renderReviews() {
  const list = [...data.reviews].sort((a, b) => b.date.localeCompare(a.date));
  $('#review-track').innerHTML = list
    .map(
      (r, i) => `<article class="review" aria-label="Отзыв: ${esc(r.name)}">
        <div class="review__head">
          <div><p class="review__name">${esc(r.name)}</p><p class="review__date">${formatDate(r.date)}</p></div>
          <span class="badge badge--neutral">${esc(r.source)}</span>
        </div>
        <span class="review__stars" role="img" aria-label="Оценка ${r.rating} из 5">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
        <p class="review__text" id="review-text-${i}">${esc(r.text)}</p>
        <button type="button" class="linklike review__more" aria-expanded="false" aria-controls="review-text-${i}" hidden>Читать полностью</button>
      </article>`,
    )
    .join('');
}

function checkClamp() {
  $$('.review').forEach((card) => {
    const p = $('.review__text', card);
    const b = $('.review__more', card);
    if (p.classList.contains('is-expanded')) return;
    b.hidden = p.scrollHeight <= p.clientHeight + 1;
  });
}

function bindCarousel() {
  const track = $('#review-track');
  const prev = $('#rev-prev');
  const next = $('#rev-next');
  const total = data.reviews.length;
  const metrics = () => {
    const card = $('.review', track);
    const cs = getComputedStyle(track);
    const gap = parseFloat(cs.columnGap) || 16;
    const inner = track.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const step = card.getBoundingClientRect().width + gap;
    return { step, visible: Math.max(1, Math.floor((inner + gap + 1) / step)) };
  };
  const update = () => {
    const { step, visible } = metrics();
    const first = Math.round(track.scrollLeft / step);
    const last = Math.min(total, first + visible);
    $('#rev-status').textContent = visible > 1 ? `${first + 1}–${last} из ${total}` : `${first + 1} из ${total}`;
    prev.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
  };
  prev.addEventListener('click', () => track.scrollBy({ left: -metrics().step, behavior: scrollBehavior() }));
  next.addEventListener('click', () => track.scrollBy({ left: metrics().step, behavior: scrollBehavior() }));
  let t;
  track.addEventListener(
    'scroll',
    () => {
      clearTimeout(t);
      t = setTimeout(update, 80);
    },
    { passive: true },
  );
  track.addEventListener('click', (e) => {
    const b = e.target.closest('.review__more');
    if (!b) return;
    const p = $(`#${b.getAttribute('aria-controls')}`);
    const open = p.classList.toggle('is-expanded');
    b.setAttribute('aria-expanded', String(open));
    b.textContent = open ? 'Свернуть' : 'Читать полностью';
  });
  update();
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      update();
      checkClamp();
    }, 120);
  });
}

/* ==========================================================================
   Акции
   ========================================================================== */
function renderPromos() {
  const now = new Date();
  const cards = data.promos.map((p) => {
    const left = Math.ceil((new Date(`${p.validUntil}T23:59:59`) - now) / 864e5);
    return `<article class="promo">
      <h3 class="promo__title">${esc(p.title)}</h3>
      <p class="promo__cond">${esc(p.condition)}</p>
      <div class="promo__code">
        <code id="code-${p.id}">${esc(p.code)}</code>
        <button type="button" class="promo__copy" data-copy="${esc(p.code)}" aria-describedby="code-${p.id}">Скопировать</button>
      </div>
      <p class="promo__valid">Действует до ${formatDate(p.validUntil)}${left > 0 ? ` · осталось ${left} ${plural(left, ['день', 'дня', 'дней'])}` : ''}</p>
      <button type="button" class="btn btn--outline btn--block" data-apply-promo="${p.id}">Применить</button>
    </article>`;
  });
  const pp = data.partnerPromo;
  cards.push(`<article class="promo promo--partner">
    <span class="badge badge--partner">Партнёр</span>
    <h3 class="promo__title">${esc(pp.title)}</h3>
    <p class="promo__cond">${esc(pp.text)}</p>
    <a class="btn btn--outline btn--block" href="${esc(pp.url)}" target="_blank" rel="noopener sponsored">${esc(pp.cta)}<span class="sr-only"> (откроется в новой вкладке)</span></a>
  </article>`);
  $('#promos').innerHTML = cards.join('');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/* ==========================================================================
   Чат
   ========================================================================== */
function setChat(open) {
  const panel = $('#chat-panel');
  panel.hidden = !open;
  $('#chat-fab').setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('chat-open', open);
  if (open) {
    fitChatToViewport();
    $('#chat-input').focus();
  } else {
    $('#chat-fab').focus();
  }
}

/* На mobile чат на весь экран; поле ввода держим над виртуальной клавиатурой */
function fitChatToViewport() {
  const panel = $('#chat-panel');
  const vv = window.visualViewport;
  if (mqSmall.matches && vv) {
    panel.style.height = `${vv.height}px`;
    panel.style.top = `${vv.offsetTop}px`;
  } else {
    panel.style.height = '';
    panel.style.top = '';
  }
}

function bindChat() {
  $('#chat-close').addEventListener('click', () => setChat(false));
  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#chat-input');
    const text = input.value.trim();
    if (!text) return;
    const log = $('#chat-log');
    log.insertAdjacentHTML('beforeend', `<p class="chat-msg chat-msg--me">${esc(text)}</p>`);
    input.value = '';
    log.scrollTop = log.scrollHeight;
    setTimeout(() => {
      log.insertAdjacentHTML(
        'beforeend',
        `<p class="chat-msg">Спасибо! Оператор ответит здесь в течение ${data.support.responseMinutes} минут. (В прототипе чат не подключён.)</p>`,
      );
      log.scrollTop = log.scrollHeight;
    }, 700);
  });
  window.visualViewport?.addEventListener('resize', () => !$('#chat-panel').hidden && fitChatToViewport());
  window.visualViewport?.addEventListener('scroll', () => !$('#chat-panel').hidden && fitChatToViewport());
  mqSmall.addEventListener('change', fitChatToViewport);
}

/* ==========================================================================
   Глобальные обработчики
   ========================================================================== */
function bindGlobal() {
  document.addEventListener('click', async (e) => {
    const t = e.target;

    const tipBtn = t.closest('.tip, .ask');
    if (tipBtn) {
      e.preventDefault();
      showTip(tipBtn);
      return;
    }
    if (tipFor) hideTip();

    const cfg = t.closest('[data-open-config]');
    if (cfg) {
      e.preventDefault();
      cfg.closest('dialog')?.close();
      openConfig(cfg.dataset.openConfig);
      return;
    }

    if (t.closest('[data-open-test]')) {
      e.preventDefault();
      openTest();
      return;
    }

    const chatBtn = t.closest('[data-open-chat]');
    if (chatBtn) {
      setChat(chatBtn.id === 'chat-fab' ? $('#chat-panel').hidden : true);
      return;
    }

    const stub = t.closest('[data-stub]');
    if (stub) {
      e.preventDefault();
      toast(`«${stub.dataset.stub}» — отдельная страница, в прототипе не реализована`);
      return;
    }

    // Ссылки на сравнение сразу раскрывают таблицу
    if (t.closest('a[href="#compare"]')) $('#compare-all').open = true;

    const task = t.closest('[data-task]');
    if (task) {
      showReco(task.dataset.task);
      return;
    }

    const copy = t.closest('[data-copy]');
    if (copy) {
      const code = copy.dataset.copy;
      await copyText(code);
      copy.textContent = 'Скопировано ✓';
      copy.classList.add('is-copied');
      srStatus(`Купон ${code} скопирован`);
      clearTimeout(copy._timer);
      copy._timer = setTimeout(() => {
        copy.textContent = 'Скопировать';
        copy.classList.remove('is-copied');
      }, 2000);
      return;
    }

    const apply = t.closest('[data-apply-promo]');
    if (apply) {
      applyPromo(apply.dataset.applyPromo);
      return;
    }

    if (t.closest('[data-close]')) {
      const d = t.closest('dialog');
      d.close();
      const goto = t.closest('[data-goto]');
      if (goto) $(`#${goto.dataset.goto}`).scrollIntoView({ behavior: scrollBehavior() });
      if (t.closest('[data-goto-buy]')) openConfig(testType);
    }
  });

  // Клик по подложке закрывает модалку
  $$('dialog').forEach((d) =>
    d.addEventListener('click', (e) => {
      if (e.target === d) d.close();
    }),
  );

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (tipFor) hideTip();
    if (!$('#more-menu').hidden) setMore(false);
    if ($('#nav').classList.contains('is-open')) {
      setMenu(false);
      $('#burger').focus();
    }
    if (!$('#chat-panel').hidden && !openDialogEl()) setChat(false);
  });

  window.addEventListener('scroll', syncHeaderCta, { passive: true });
  window.addEventListener('resize', syncHeaderCta);
}

/* ==========================================================================
   Преимущества: окно из 3 карточек (ПК) — широкая активная и две следующие.
   На mobile — вертикальный аккордеон
   ========================================================================== */
let featIndex = 0;
let featTimer = 0;
let featPaused = false;
let featVisible = false;
const FEAT_WINDOW = 3;

function renderFeatures() {
  $('#features').innerHTML = data.benefits
    .map(
      (b, i) => `<article class="feature" data-feat="${i}">
        <button type="button" class="feature__head" id="feat-btn-${i}" aria-expanded="false" aria-controls="feat-body-${i}">
          <span class="feature__num">/${String(i + 1).padStart(2, '0')}</span>
          <span class="feature__title feature__title--full">${esc(b.title)}</span>
          <span class="feature__title feature__title--short" aria-hidden="true">${b.short.split('|').map(esc).join('<br>')}</span>
        </button>
        <div class="feature__body" id="feat-body-${i}" role="region" aria-labelledby="feat-btn-${i}">
          <p>${esc(b.text)}</p>
          ${b.cta === 'test' ? '<button type="button" class="feature__link" data-open-test>Получить тест →</button>' : ''}
        </div>
      </article>`,
    )
    .join('');
  setFeature(0);
}

function setFeature(i) {
  const n = data.benefits.length;
  featIndex = (i + n) % n;
  $$('.feature').forEach((f, k) => {
    const pos = (k - featIndex + n) % n; // 0 — активная, 1–2 — следующие в окне
    const on = pos === 0;
    f.classList.toggle('is-active', on);
    f.classList.toggle('is-off', pos >= FEAT_WINDOW);
    f.style.order = String(pos);
    $('.feature__head', f).setAttribute('aria-expanded', String(on));
  });
  placeFeatureNav();
}

/* Стрелки (ПК): под первой свёрнутой карточкой, нижний край — вровень с активной */
function placeFeatureNav() {
  const nav = $('#feat-prev').parentElement;
  const wrap = nav.parentElement;
  const next = $$('.feature:not(.is-active):not(.is-off)').sort((a, b) => Number(a.style.order) - Number(b.style.order))[0];
  const act = $('.feature.is-active');
  if (!next || !act || getComputedStyle(nav).position !== 'absolute') return;
  const w = wrap.getBoundingClientRect();
  nav.style.left = `${next.getBoundingClientRect().left - w.left}px`;
  nav.style.top = `${act.getBoundingClientRect().bottom - w.top - nav.offsetHeight}px`;
}

function scheduleFeature() {
  clearTimeout(featTimer);
  if (reducedMotion.matches || featPaused || !featVisible) return;
  featTimer = setTimeout(() => {
    setFeature(featIndex + 1);
    scheduleFeature();
  }, 6500);
}

function bindFeatures() {
  const box = $('#features');
  box.addEventListener('click', (e) => {
    const head = e.target.closest('.feature__head');
    if (!head) return;
    setFeature(Number(head.closest('.feature').dataset.feat));
    scheduleFeature();
  });
  window.addEventListener('resize', placeFeatureNav);
  document.fonts?.ready.then(placeFeatureNav);
  $('#feat-prev').addEventListener('click', () => {
    setFeature(featIndex - 1);
    scheduleFeature();
  });
  $('#feat-next').addEventListener('click', () => {
    setFeature(featIndex + 1);
    scheduleFeature();
  });
  // Пауза, пока пользователь читает или работает с клавиатуры
  const pause = (v) => () => {
    featPaused = v;
    scheduleFeature();
  };
  box.addEventListener('pointerenter', pause(true));
  box.addEventListener('pointerleave', pause(false));
  box.addEventListener('focusin', pause(true));
  box.addEventListener('focusout', pause(false));
  new IntersectionObserver(([en]) => {
    featVisible = en.isIntersecting;
    scheduleFeature();
  }).observe(box);
}

/* ==========================================================================
   Типы прокси: вкладки с описанием и цифрами
   ========================================================================== */
let productType = types.find((t) => t.popular)?.id ?? types[0].id;

/* Все тарифы сайта: 4 типа прокси + лицензия ProxyFarm */
const productTabs = () => [
  ...types.map((t) => ({ id: t.id, name: t.tableName, price: `от ${rub(priceFrom(t.id))}` })),
  { id: FARM, name: data.farm.name, price: `${rub(data.farm.pricePerModem)} за модем` },
];

function renderFarmProduct(panel) {
  const f = data.farm;
  const stats = [
    ['Цена', `${rub(f.pricePerModem)} за модем в месяц`],
    ['При оплате за год', `−${f.yearDiscount}%`],
    ['Пробный период', `${f.trialDays} дней бесплатно`],
    ['Модемов', `от 1 до ${f.maxModems}`],
  ];
  panel.innerHTML = `
    <div class="product__main">
      <span class="badge badge--neutral">Софт для прокси-ферм</span>
      <h3 class="product__title">${esc(f.name)}</h3>
      <p class="product__desc">${esc(f.desc)}</p>
      <p class="product__best-title">Что даёт:</p>
      <ul class="product__best">${f.benefits.map((b) => `<li>${icon('check')}${esc(b)}</li>`).join('')}</ul>
      <div class="product__actions">
        <button type="button" class="btn btn--primary btn--xl" data-buy-farm>Купить лицензию</button>
        <a class="btn btn--outline btn--xl" href="#" data-stub="Регистрация в ProxyFarm">Попробовать ${f.trialDays} дней бесплатно</a>
      </div>
    </div>
    <ul class="product__stats">
      ${stats.map(([k, v]) => `<li class="stat"><span class="stat__label">${k}</span><span class="stat__value">${v}</span></li>`).join('')}
    </ul>`;
}

/* «Купить лицензию» из типов — переключает форму первого экрана на ProxyFarm */
function openFarmBuy() {
  qbMode = FARM;
  renderQuickbuy();
  $('#hero').scrollIntoView({ behavior: scrollBehavior() });
  $('#qb-buy').focus({ preventScroll: true });
}

function renderProduct() {
  $('#product-tabs').innerHTML = productTabs()
    .map((t) => {
      const sel = t.id === productType;
      return `<button type="button" class="ptab" role="tab" id="ptab-${t.id}" data-ptype="${t.id}" aria-selected="${sel}" aria-controls="product-panel" tabindex="${sel ? 0 : -1}">
        <span>${esc(t.name)}</span><span class="ptab__price">${t.price}</span></button>`;
    })
    .join('');
  const panel = $('#product-panel');
  panel.setAttribute('aria-labelledby', `ptab-${productType}`);
  if (productType === FARM) {
    renderFarmProduct(panel);
    syncHeaderCta();
    return;
  }
  const t = typeById[productType];
  const stats = [
    ['Скорость до', esc(t.speed) + (t.speedQuestion ? ask(t.speedQuestion) : '')],
    ['Подключений', esc(t.connections)],
    ['Пользователей на IP', esc(t.usersPerIp)],
    ['Трафик', esc(t.traffic)],
    [`Смена IP${tip('rotation')}`, esc(t.ipChange)],
    [`TCP-отпечаток${tip('tcp')}`, t.tcp ? 'Меняется' : 'Не меняется'],
  ];
  panel.innerHTML = `
    <div class="product__main">
      ${t.popular ? '<span class="badge badge--primary">Популярный выбор</span>' : ''}
      <h3 class="product__title">${esc(recoName(t))}</h3>
      <p class="product__desc">${esc(t.desc)}</p>
      <p class="product__best-title">Лучше всего для:</p>
      <ul class="product__best">${t.bestFor.map((b) => `<li>${icon('check')}${esc(b)}</li>`).join('')}</ul>
      <div class="product__actions">
        <button type="button" class="btn btn--primary btn--xl" data-open-config="${t.id}">Купить от ${rub(priceFrom(t.id))}</button>
        <button type="button" class="btn btn--outline btn--xl" data-open-test>Бесплатный тест</button>
      </div>
    </div>
    <ul class="product__stats">
      ${stats.map(([k, v]) => `<li class="stat"><span class="stat__label">${k}</span><span class="stat__value">${v}</span></li>`).join('')}
    </ul>`;
  syncHeaderCta();
}

function bindProduct() {
  const tabs = $('#product-tabs');
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ptype]');
    if (!b) return;
    productType = b.dataset.ptype;
    renderProduct();
  });
  $('#product-panel').addEventListener('click', (e) => {
    if (e.target.closest('[data-buy-farm]')) openFarmBuy();
  });
  tabs.addEventListener('keydown', (e) => {
    const ids = productTabs().map((t) => t.id);
    let i = ids.indexOf(productType);
    if (e.key === 'ArrowRight') i = (i + 1) % ids.length;
    else if (e.key === 'ArrowLeft') i = (i - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = ids.length - 1;
    else return;
    e.preventDefault();
    productType = ids[i];
    renderProduct();
    $(`#ptab-${productType}`).focus();
  });
}

/* ==========================================================================
   Первый экран: интерактивная сетка — «пакеты» бегут по линиям, узлы подсвечиваются у курсора
   ========================================================================== */
function initHeroCanvas() {
  const hero = $('#hero');
  const canvas = $('#hero-canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const GAP = 56;
  const PACKETS = 9;
  let w = 0;
  let h = 0;
  let cols = 0;
  let rows = 0;
  let packets = [];
  const pointer = { x: -9999, y: -9999 };
  let raf = 0;
  let last = 0;
  let visible = true;

  const spawn = () => {
    const horiz = Math.random() < 0.5;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const len = horiz ? w : h;
    return {
      horiz,
      lane: Math.floor(Math.random() * (horiz ? rows : cols)),
      dir,
      pos: dir > 0 ? -Math.random() * 200 : len + Math.random() * 200,
      speed: 70 + Math.random() * 110,
      len,
    };
  };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = hero.clientWidth;
    h = hero.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / GAP) + 1;
    rows = Math.ceil(h / GAP) + 1;
    packets = reducedMotion.matches ? [] : Array.from({ length: PACKETS }, spawn);
    draw(0);
  }

  function draw(dt) {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < cols; i++) {
      ctx.moveTo(i * GAP + 0.5, 0);
      ctx.lineTo(i * GAP + 0.5, h);
    }
    for (let j = 0; j < rows; j++) {
      ctx.moveTo(0, j * GAP + 0.5);
      ctx.lineTo(w, j * GAP + 0.5);
    }
    ctx.stroke();

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = i * GAP;
        const y = j * GAP;
        const d = Math.hypot(x - pointer.x, y - pointer.y);
        const a = d < 200 ? 1 - d / 200 : 0;
        if (a > 0) {
          ctx.fillStyle = `rgba(140,220,100,${0.12 + a * 0.7})`;
          ctx.beginPath();
          ctx.arc(x, y, 1.5 + a * 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.09)';
          ctx.fillRect(x - 1, y - 1, 2, 2);
        }
      }
    }

    for (const p of packets) {
      p.pos += p.dir * p.speed * dt;
      const x = p.horiz ? p.pos : p.lane * GAP;
      const y = p.horiz ? p.lane * GAP : p.pos;
      const tx = p.horiz ? x - p.dir * 70 : x;
      const ty = p.horiz ? y : y - p.dir * 70;
      const g = ctx.createLinearGradient(tx, ty, x, y);
      g.addColorStop(0, 'rgba(110,200,70,0)');
      g.addColorStop(1, 'rgba(150,235,105,0.85)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx + 0.5, ty + 0.5);
      ctx.lineTo(x + 0.5, y + 0.5);
      ctx.stroke();
    }
    packets = packets.filter((p) => p.pos > -260 && p.pos < p.len + 260);
    while (!reducedMotion.matches && packets.length < PACKETS) packets.push(spawn());
  }

  function frame(t) {
    const dt = last ? Math.min((t - last) / 1000, 0.05) : 0;
    last = t;
    draw(dt);
    raf = requestAnimationFrame(frame);
  }

  function sync() {
    cancelAnimationFrame(raf);
    last = 0;
    if (visible && !document.hidden && !reducedMotion.matches) raf = requestAnimationFrame(frame);
    else draw(0);
  }

  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    if (reducedMotion.matches) draw(0);
  });
  hero.addEventListener('pointerleave', () => {
    pointer.x = pointer.y = -9999;
    if (reducedMotion.matches) draw(0);
  });
  new ResizeObserver(resize).observe(hero);
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    sync();
  }).observe(hero);
  // Пока низ первого экрана на виду — кнопка чата на mobile уезжает, чтобы не закрывать ссылки
  new IntersectionObserver(([en]) => document.body.classList.toggle('hero-in-view', en.isIntersecting)).observe($('.hero__bottom'));
  document.addEventListener('visibilitychange', sync);
  reducedMotion.addEventListener('change', () => {
    resize();
    sync();
  });
  resize();
  sync();
}

/* ==========================================================================
   Старт
   ========================================================================== */
hydrateIcons();
renderStatic();
renderTasks();
renderCompare();
renderReviews();
renderPromos();
renderFeatures();
renderProduct();
selectType(state.type);
updateConfig({ tabs: true });
hydrateIcons();

bindHeader();
bindQuickbuy();
bindDropdowns();
bindFeatures();
bindProduct();
initHeroCanvas();
bindConfig();
bindCheckout();
bindTest();
bindTips();
bindChat();
bindCarousel();
bindSticky();
bindGlobal();
syncHeaderCta();
checkClamp();
document.fonts?.ready.then(checkClamp);
