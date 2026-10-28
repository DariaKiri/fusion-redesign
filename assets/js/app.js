/* «Фьюжн» — общий код всех страниц: адрес/точка, меню-шторка, поиск, карточка блюда,
   cookies + Яндекс Метрика, расчёт скидки. Зависит от ui.js (window.FZ). */
(function () {
  'use strict';
  const FZ = window.FZ, { $, $$, store, price } = FZ;
  const BASE = document.documentElement.dataset.base || '';
  const S = BASE + 'assets/icons/sprite.svg';
  FZ.base = BASE; FZ.cartUrl = BASE + 'cart.html';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="${S}#${id}"/></svg>`;
  FZ.esc = esc; FZ.icon = icon;

  /* ---------- Данные (меню и настройки грузятся один раз) */
  let menuP, settingsP;
  // Фото блюд лежат в assets/img/dishes и записаны от корня сайта; на страницах блюд нужен префикс ../
  FZ.img = s => (s && !/^(https?:|data:|blob:|\/)/.test(s)) ? BASE + s : s;
  FZ.menu = () => menuP || (menuP = fetch(BASE + 'data/menu.json').then(r => r.json()).then(m => {
    m.items = []; m.subsList = [];
    m.sections.forEach(s => s.subs.forEach(u => { m.subsList.push({ ...u, section: s.id, sectionTitle: s.title }); u.items.forEach(i => { i.subTitle = u.title; m.items.push(i); }); }));
    m.byId = Object.fromEntries(m.items.map(i => [i.id, i])); m.bySlug = Object.fromEntries(m.items.map(i => [i.slug, i]));
    // Блюдо с вариантами (вкус, начинка): в корзине и заказах живут id вариантов, старые адреса ведут на общую карточку
    m.items.forEach(i => (i.variants || []).forEach(v => { m.byId[v.id] = Object.assign({}, i, v, { variantOf: i.slug, variants: null }); m.bySlug[v.slug] = i; }));
    return m;
  }));
  FZ.settings = () => settingsP || (settingsP = fetch(BASE + 'data/settings.json').then(r => r.json()));

  /* ---------- Точки (копия settings.json для мгновенной отрисовки шапки) */
  const POINTS = {
    lenina: { title: 'Фьюжн на Ленина', short: 'Ленина, 122', city: 'balakovo', address: 'ул. Ленина, 122', zone: 'Жилгород', phone: '+7 (000) 000-00-01', tel: '+70000000001', delivery: true },
    trnavskaya: { title: 'Фьюжн на Трнавской', short: 'Трнавская, 36/8', city: 'balakovo', address: 'ул. Трнавская, 36/8', zone: 'Новые районы', phone: '+7 (000) 000-00-02', tel: '+70000000002', delivery: true },
    greenhouse: { title: 'Рыбный ресторанчик', short: 'Степная, 25', city: 'balakovo', address: 'ул. Степная, 25', zone: null, phone: '+7 (000) 000-00-04', tel: '+70000000004', delivery: false },
    volsk: { title: 'Фьюжн в Вольске', short: 'Октябрьская, 106', city: 'volsk', address: 'ул. Октябрьская, 106', zone: 'Вольск', phone: '+7 (000) 000-00-03', tel: '+70000000003', delivery: true }
  };
  const CITY = { balakovo: 'Балаково', volsk: 'Вольск' };
  FZ.POINTS = POINTS; FZ.CITY = CITY;
  FZ.place = () => store.get('place', { mode: 'delivery', city: null, address: '', pointId: null });
  FZ.setPlace = p => { store.set('place', p); renderPlace(); document.dispatchEvent(new CustomEvent('fz:place', { detail: p })); };
  function renderPlace() {
    const p = FZ.place(), pt = p.pointId && POINTS[p.pointId];
    let title = 'Куда доставляем?', sub = 'Выберите адрес или кафе', eta = 'Доставим за ~60 мин';
    if (p.mode === 'pickup' && pt) { title = `Самовывоз: ${pt.short}`; sub = `${CITY[pt.city]} · приготовим за ~30 мин`; eta = 'Приготовим за ~30 мин'; }
    else if (p.mode === 'delivery' && p.address) { title = `${CITY[p.city] || ''}, ${p.address}`; sub = 'Доставим за ~60 мин · бесплатно'; }
    $$('[data-place-title]').forEach(e => { e.textContent = title; });
    $$('[data-place-sub]').forEach(e => { e.textContent = sub; });
    $$('[data-place-eta]').forEach(e => { e.textContent = eta; });
    const ph = pt || POINTS.lenina;
    $$('[data-place-phone]').forEach(a => { a.href = 'tel:' + ph.tel; a.firstChild.textContent = ph.phone; });
    $$('[data-place-phone-label]').forEach(e => { e.textContent = (ph.zone || ph.short) + ' · 12:00–23:00'; });
  }

  /* ---------- Скидки: не суммируются, берём самую выгодную */
  FZ.user = () => store.get('user', null);
  function isBirthdayWindow(bd, now = new Date()) {
    if (!bd) return false;
    const [, m, d] = bd.split('-').map(Number);
    for (let k = -2; k <= 2; k++) { const t = new Date(now); t.setDate(t.getDate() + k); if (t.getMonth() + 1 === m && t.getDate() === d) return true; }
    return false;
  }
  FZ.calc = (mode = FZ.place().mode) => {
    const items = Object.values(FZ.cart.items), sum = FZ.cart.sum(), count = FZ.cart.count();
    const prog = FZ.discountFor(sum);
    const options = [];
    if (prog.current) options.push({ type: 'progressive', title: `Скидка ${prog.current.percent}% за сумму заказа`, percent: prog.current.percent });
    const u = FZ.user();
    if (mode === 'pickup' && u && isBirthdayWindow(u.birthday)) options.push({ type: 'birthday', title: 'Скидка 10% в день рождения', percent: 10 });
    const best = options.sort((a, b) => b.percent - a.percent)[0] || null;
    const discount = best ? Math.round(sum * best.percent / 100) : 0;
    return { items, sum, count, discount, best, total: sum - discount, minOk: sum >= FZ.rules.minSum, left: Math.max(0, FZ.rules.minSum - sum), next: prog.next };
  };

  /* ---------- Меню-шторка */
  function openDrawer() {
    const opener = document.activeElement;
    const d = document.createElement('div');
    d.className = 'drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Меню сайта');
    const u = FZ.user();
    const phones = Object.values(POINTS).map(p => `<a class="btn btn--outline btn--block" href="tel:${p.tel}">${esc(p.short)} · ${p.phone}</a>`).join('');
    d.innerHTML = `<div class="drawer__backdrop"></div><div class="drawer__panel"><div class="cluster" style="justify-content:space-between"><span class="header__logo" style="height:36px">${$('.header__logo .logo-full').innerHTML}</span><button class="btn btn--ghost btn--icon" type="button" data-x aria-label="Закрыть меню">${icon('i-close')}</button></div>
      <span class="status" data-work-status style="margin-top:var(--space-4);justify-self:start"></span>
      <nav class="drawer__nav" aria-label="Меню сайта">${[['menu.html', 'Меню'], ['promo.html', 'Акции'], ['delivery.html', 'Доставка и оплата'], ['about.html', 'О нас'], ['contacts.html', 'Контакты'], ['reviews.html', 'Отзывы'], ['profile.html', u ? 'Профиль' : 'Войти']].map(([h, t]) => `<a href="${BASE}${h}">${t}${icon('i-chevron-right')}</a>`).join('')}</nav>
      <div class="drawer__phones"><p class="t-overline t-muted">Позвонить в кафе</p>${phones}</div>
      <button class="btn btn--ghost" type="button" data-theme-switch style="justify-self:start;margin-top:var(--space-4)">${icon('i-moon')}<span>Тёмная тема</span></button></div>`;
    document.body.appendChild(d); document.documentElement.classList.add('no-scroll'); FZ.renderStatus();
    const close = () => { d.remove(); document.documentElement.classList.remove('no-scroll'); document.removeEventListener('keydown', key); opener && opener.focus(); };
    const key = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    d.addEventListener('click', e => {
      if (e.target.closest('[data-x]') || e.target.classList.contains('drawer__backdrop')) close();
      const t = e.target.closest('[data-theme-switch]');
      if (t) { const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches); const v = dark ? 'light' : 'dark'; store.set('theme', v); document.documentElement.setAttribute('data-theme', v); t.querySelector('span').textContent = v === 'dark' ? 'Светлая тема' : 'Тёмная тема'; }
    });
    $('[data-x]', d).focus();
  }
  const savedTheme = store.get('theme', null); if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

  /* ---------- Поиск: латиница → кириллица, опечатки, название и состав */
  const LAT = [['sch', 'щ'], ['sh', 'ш'], ['ch', 'ч'], ['zh', 'ж'], ['kh', 'х'], ['ts', 'ц'], ['ph', 'ф'], ['yu', 'ю'], ['ya', 'я'], ['yo', 'ё'], ['a', 'а'], ['b', 'б'], ['c', 'к'], ['d', 'д'], ['e', 'е'], ['f', 'ф'], ['g', 'г'], ['h', 'х'], ['i', 'и'], ['j', 'й'], ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'], ['o', 'о'], ['p', 'п'], ['q', 'к'], ['r', 'р'], ['s', 'с'], ['t', 'т'], ['u', 'у'], ['v', 'в'], ['w', 'в'], ['x', 'кс'], ['y', 'ы'], ['z', 'з']];
  const ALIAS = { philadelphia: 'филадельфия', philadelfia: 'филадельфия', california: 'калифорния', unagi: 'унаги', sake: 'сяке', tom: 'том', yam: 'ям', ramen: 'рамен', udon: 'удон', tempura: 'темпура', spicy: 'спайси', cheesecake: 'чизкейк' };
  const norm = s => { s = String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[a-z]+/g, w => ALIAS[w] || w); if (/[a-z]/.test(s)) LAT.forEach(([l, c]) => { s = s.split(l).join(c); }); return s.replace(/ё/g, 'е').replace(/[^а-яa-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim(); };
  const lev = (a, b) => { if (Math.abs(a.length - b.length) > 1) return 2; const m = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) m[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; };
  FZ.search = (menu, q) => {
    const n = norm(q); if (!n) return { cats: [], dishes: [] };
    const toks = n.split(' ');
    const score = i => {
      const name = norm(i.name), all = name + ' ' + norm(i.composition) + ' ' + norm(i.subTitle) + ' ' + norm((i.variants || []).map(v => v.label + ' ' + (v.composition || '')).join(' '));
      if (!toks.every(t => all.includes(t))) return 0;
      return name.startsWith(n) ? 4 : name.includes(n) ? 3 : toks.every(t => name.includes(t)) ? 2 : 1;
    };
    let dishes = menu.items.map(i => [i, score(i)]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    let fuzzy = false;
    if (!dishes.length) {
      dishes = menu.items.filter(i => { const words = norm(i.name + ' ' + i.composition).split(' '); return toks.every(t => t.length < 4 ? words.some(w => w.startsWith(t)) : words.some(w => lev(w.slice(0, t.length + 1), t) <= 1 || lev(w, t) <= 1)); });
      fuzzy = dishes.length > 0;
    }
    const cats = menu.subsList.filter(u => norm(u.title).includes(n) || norm(u.sectionTitle).includes(n));
    return { cats, dishes: dishes.slice(0, 24), fuzzy, total: dishes.length };
  };
  const hl = (s, q) => { const t = String(q).trim(); if (!t || /[a-z]/i.test(t)) return esc(s); const i = s.toLowerCase().replace(/ё/g, 'е').indexOf(t.toLowerCase().replace(/ё/g, 'е')); return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + t.length)) + '</mark>' + esc(s.slice(i + t.length)); };
  const thumb = i => `<span class="search__thumb"><span class="ph"></span>${i.image ? `<img src="${esc(FZ.img(i.image))}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>`;
  FZ.renderSearch = (box, menu, q) => {
    if (!q.trim()) {
      const recs = menu.items.filter(i => i.tags.includes('hit')).slice(0, 6);
      box.innerHTML = `<p class="search__group-title">Нет времени искать? Доверьтесь рекомендациям</p><div class="search__results">${recs.map(i => `<a class="search__item" href="${BASE}dish/${i.slug}.html" data-open-dish="${i.slug}">${thumb(i)}<span><span>${esc(i.name)}</span><br><span class="t-caption t-muted">${esc(i.subTitle)} · ${i.weight}&#8239;г</span></span><span class="price-sm">${price(i.price)}</span></a>`).join('')}</div>`;
      return;
    }
    const r = FZ.search(menu, q);
    if (!r.cats.length && !r.dishes.length) {
      box.innerHTML = `<div class="empty" style="padding-block:var(--space-6)"><svg class="empty__art" viewBox="0 0 24 24" aria-hidden="true"><use href="${S}#i-search"/></svg><p class="empty__title">Ничего не нашлось</p><p class="empty__text">По запросу «${esc(q)}» блюд нет. Проверьте написание или загляните в хиты.</p><div class="cluster" style="justify-content:center">${['Филадельфия', 'Калифорния', 'Угорь', 'Том ям'].map(x => `<button class="chip" type="button" data-q="${x}">${x}</button>`).join('')}</div></div>`;
      return;
    }
    box.innerHTML = `<div class="search__results">${r.fuzzy ? `<p class="t-body-sm t-muted">Похоже, вы искали это:</p>` : ''}${r.cats.length ? `<div><p class="search__group-title">Категории</p><div class="chips" style="flex-wrap:wrap">${r.cats.map(c => `<a class="chip" href="${BASE}menu.html#sub-${c.id}">${hl(c.title, q)}</a>`).join('')}</div></div>` : ''}${r.dishes.length ? `<div><p class="search__group-title">Блюда · ${r.total}</p>${r.dishes.map(i => `<a class="search__item" href="${BASE}dish/${i.slug}.html" data-open-dish="${i.slug}">${thumb(i)}<span><span>${hl(i.name, q)}</span><br><span class="t-caption t-muted">${esc(i.subTitle)} · ${i.weight}&#8239;г</span></span><span class="price-sm">${price(i.price)}</span></a>`).join('')}</div>` : ''}</div>`;
  };
  function openSearch() {
    const o = FZ.openOverlay(`<div class="modal__body search"><h2 class="t-h3">Поиск по меню</h2><div class="input-wrap"><svg class="icon" aria-hidden="true"><use href="${S}#i-search"/></svg><input class="input input--lg" type="search" placeholder="Например, «фила» или «угорь»" aria-label="Поиск по меню" autocomplete="off" data-sq></div><div data-sr aria-live="polite"><p class="t-muted">Загружаю меню…</p></div></div>`, { label: 'Поиск по меню' });
    const inp = $('[data-sq]', o.el), box = $('[data-sr]', o.el);
    FZ.menu().then(m => { FZ.renderSearch(box, m, ''); let t; inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => FZ.renderSearch(box, m, inp.value), 120); }); o.el.addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) { inp.value = b.dataset.q; FZ.renderSearch(box, m, inp.value); inp.focus(); } if (e.target.closest('[data-open-dish]')) o.close(); }); });
    setTimeout(() => inp.focus(), 40);
  }

  /* ---------- Карточка блюда: модальное окно / bottom sheet */
  const ordered = () => { const s = new Set(); store.get('orders', []).forEach(o => o.items.forEach(i => s.add(i.id))); return s; };
  FZ.ordered = ordered;
  const TAGS = { hit: ['tag--hit', 'Хит', 'i-hit'], new: ['tag--new', 'Новое', 'i-new'], spicy: ['tag--spicy', 'Острое', 'i-spicy'], veg: ['tag--veg', 'Вегетарианское', 'i-veg'] };
  FZ.tagHtml = t => `<span class="tag ${TAGS[t][0]}">${icon(TAGS[t][2])}${TAGS[t][1]}</span>`;
  // Переключатель вариантов: вкус чизкейка, начинка цезаря
  FZ.variantsHTML = (i, cur) => {
    if (!i.variants) return '';
    const label = esc(i.variantLabel || 'Вариант');
    const data = v => { const n = v.nutrition || i.nutrition; return `data-v-id="${v.id}" data-v-name="${esc(v.name)}" data-v-price="${v.price}" data-v-weight="${v.weight}" data-v-img="${esc(v.image || '')}" data-v-comp="${esc(v.composition || '')}" data-v-nutri="${n.kcal},${n.protein},${n.fat},${n.carbs}"`; };
    if (i.variants.length > 4) return `<label class="variant-pick"><span class="dish-detail__label">${label}</span><select class="variant-select" data-v-select>${i.variants.map(v => `<option value="${v.id}" ${v.id === cur.id ? 'selected' : ''} ${data(v)}>${esc(v.label)}</option>`).join('')}</select></label>`;
    return `<div class="variants" role="radiogroup" aria-label="${label}">${i.variants.map(v => `<button class="variant" type="button" role="radio" aria-checked="${v.id === cur.id}" ${data(v)}>${esc(v.label)}</button>`).join('')}</div>`;
  };
  FZ.dishHTML = (i, menu, vid) => {
    const v = i.variants ? (i.variants.find(x => x.id === vid) || i.variants[0]) : null;
    const d = v ? Object.assign({}, i, v, { image: v.image || i.image }) : i;
    const n = d.nutrition || i.nutrition, ids = v ? i.variants.map(x => x.id) : [i.id];
    const wasOrdered = FZ.user() && ids.some(x => ordered().has(x));
    const upsell = menu.items.filter(x => x.sub === 'sousy').slice(0, 3);
    return `<div class="modal__body"><div class="dish-detail" data-fly-root${v ? ` data-variant-root data-dish-slug="${i.slug}"` : ''}>
      <div class="dish-detail__media"><span class="ph" aria-hidden="true"></span>${d.image ? `<img src="${esc(FZ.img(d.image))}" alt="${esc(i.name)}" onerror="this.remove()">` : ''}</div>
      <div class="dish-detail__info">
        <div class="cluster" style="--cluster-gap:6px">${FZ.avoidTag(d)}${i.tags.map(FZ.tagHtml).join('')}${wasOrdered ? `<span class="tag tag--ordered">${icon('i-repeat')}Уже заказывали</span>` : ''}${FZ.favBtn(i.id, true)}</div>
        <h2 class="t-h1">${esc(i.name)}</h2>
        ${FZ.variantsHTML(i, d)}
        ${i.story ? `<p class="dish-detail__story">${esc(i.story)}</p>` : ''}
        ${i.available ? '' : `<div class="banner banner--warning">${icon('i-alert')}<div class="banner__body"><p class="banner__title">Временно недоступно</p><p>Блюдо закончилось на кухне.</p></div></div>`}
        ${d.composition ? `<div><p class="dish-detail__label">Состав</p><p>${esc(d.composition)}</p></div>` : ''}
        <div><p class="dish-detail__label">КБЖУ на 100 г · примерно</p><div class="nutri"><div><b>${n.kcal}</b><span>ккал</span></div><div><b>${n.protein}</b><span>белки, г</span></div><div><b>${n.fat}</b><span>жиры, г</span></div><div><b>${n.carbs}</b><span>углеводы, г</span></div></div></div>
        <p class="t-caption t-muted">${d.weight}&#8239;г${i.serves ? ' · ' + i.serves : ''} · <a href="${BASE}dish/${i.slug}.html">страница блюда</a></p>
        <div><p class="dish-detail__label">С этим берут</p><div class="stack" style="--stack-gap:var(--space-2)">${upsell.map(u => `<div class="dish dish--compact" data-fly-root><div class="dish__media"><span class="ph"></span></div><div class="dish__body"><p class="dish__title">${esc(u.name)}</p><p class="dish__meta">${u.weight}&#8239;г · ${price(u.price)}</p></div><div class="dish__foot"><div data-buy="${u.id}" data-name="${esc(u.name)}" data-price="${u.price}" data-no-link></div></div></div>`).join('')}</div></div>
        <div class="dish-detail__buy"><span class="price-lg">${price(d.price)}</span><div data-buy="${d.id}" data-name="${esc(d.name)}" data-price="${d.price}" data-weight="${d.weight}" ${d.image ? `data-img="${esc(d.image)}"` : ''} data-brand data-size="lg" ${i.available ? '' : 'data-unavailable'}></div></div>
      </div></div></div>`;
  };
  FZ.openDish = slug => FZ.menu().then(m => {
    const i = m.bySlug[slug]; if (!i) return;
    const prev = location.href;
    history.replaceState(null, '', '#dish-' + slug);
    const o = FZ.openOverlay(FZ.dishHTML(i, m), { label: i.name });
    const mo = new MutationObserver(() => { if (!document.body.contains(o.el)) { mo.disconnect(); if (location.hash === '#dish-' + slug) history.replaceState(null, '', prev.split('#')[0]); } });
    mo.observe(document.body, { childList: true });
  });

  /* «Уже заказывали» на карточках */
  function markOrdered() {
    if (!FZ.user()) return;
    const ids = ordered();
    $$('.dish[data-id]').forEach(c => { if ([c.dataset.id, ...(c.dataset.variantIds || '').split(' ')].some(x => ids.has(x)) && !c.querySelector('.tag--ordered')) { const box = c.querySelector('.dish__tags'); box && box.insertAdjacentHTML('afterbegin', `<span class="tag tag--ordered">${icon('i-repeat')}Уже заказывали</span>`); c.dataset.tags += ' ordered'; } });
  }

  /* ---------- Избранное и «Не ем»: хранятся в браузере гостя */
  FZ.AVOID = [
    ['salmon', 'Лосось', ['лосос']], ['eel', 'Угорь', ['угор', 'угр']], ['tuna', 'Тунец', ['тунец', 'тунц']], ['fish', 'Другая рыба', ['окун', 'судак', 'рыб', 'масля']],
    ['shrimp', 'Креветки', ['кревет']], ['crab', 'Краб', ['краб']], ['squid', 'Кальмар', ['кальмар']], ['mussels', 'Мидии', ['миди']],
    ['roe', 'Икра', ['икр', 'масаго', 'тобико']], ['cheese', 'Сыр', ['сыр', 'пармезан', 'моцарел']], ['egg', 'Яйцо и омлет', ['омлет', 'яйц', 'тамаго']],
    ['sesame', 'Кунжут', ['кунжут']], ['nuts', 'Орехи', ['орех', 'арахис', 'кешью']], ['mayo', 'Майонез', ['майонез']], ['spicy', 'Острое', ['спайси', 'остр', 'чили']],
    ['avocado', 'Авокадо', ['авокад']], ['cucumber', 'Огурец', ['огур']], ['mushrooms', 'Грибы', ['гриб', 'шиитаке', 'шампиньон']], ['onion', 'Лук', ['лук']],
    ['garlic', 'Чеснок', ['чеснок', 'чесноч']], ['pork', 'Свинина и бекон', ['свин', 'бекон']], ['chicken', 'Курица', ['куриц', 'курин']], ['beef', 'Говядина', ['говяд']]
  ];
  FZ.favs = () => new Set(store.get('favs', []));
  FZ.avoid = () => Object.assign({ items: [], hide: false }, store.get('avoid', {}));
  let menuCache = null;
  const avoidHits = i => {
    const a = FZ.avoid(); if (!i || !a.items.length) return [];
    const words = String(i.composition || '').toLowerCase().replace(/ё/g, 'е').split(/[^а-яa-z]+/).filter(Boolean);
    return FZ.AVOID.filter(([k, , stems]) => a.items.includes(k) && (words.some(w => stems.some(st => w.startsWith(st))) || (k === 'spicy' && (i.tags || []).includes('spicy')))).map(x => x[1].toLowerCase());
  };
  FZ.avoidTag = i => { const h = avoidHits(i); return h.length ? `<span class="tag tag--avoid" title="Есть: ${esc(h.join(', '))}">${icon('i-ban')}Есть: ${esc(h.slice(0, 2).join(', '))}${h.length > 2 ? ' +' + (h.length - 2) : ''}</span>` : ''; };
  FZ.favBtn = (id, inline) => { const on = FZ.favs().has(id); return `<button class="fav-btn${inline ? ' fav-btn--inline' : ''}" type="button" data-fav="${id}" aria-pressed="${on}" aria-label="${on ? 'Убрать из избранного' : 'Добавить в избранное'}">${icon(on ? 'i-heart-fill' : 'i-heart')}</button>`; };
  FZ.toggleFav = id => {
    const f = FZ.favs(); const on = !f.has(id); on ? f.add(id) : f.delete(id); store.set('favs', [...f]);
    $$(`[data-fav="${id}"]`).forEach(b => { b.outerHTML = FZ.favBtn(id, b.classList.contains('fav-btn--inline')); });
    $$(`.dish[data-id="${id}"]`).forEach(c => { const t = (c.dataset.tags || '').split(' ').filter(x => x && x !== 'fav'); if (on) t.push('fav'); c.dataset.tags = t.join(' '); });
    FZ.toast(on ? 'Добавили в избранное' : 'Убрали из избранного');
    document.dispatchEvent(new CustomEvent('fz:prefs'));
  };
  FZ.markPrefs = () => {
    const favs = FZ.favs();
    const run = m => {
      $$('.dish[data-id]:not(.dish--compact)').forEach(c => {
        const id = c.dataset.id, media = c.querySelector('.dish__media');
        if (media && !media.querySelector('.fav-btn')) media.insertAdjacentHTML('beforeend', FZ.favBtn(id));
        let tags = (c.dataset.tags || '').split(' ').filter(x => x && x !== 'fav' && x !== 'avoid');
        if (favs.has(id)) tags.push('fav');
        const box = c.querySelector('.dish__tags'); box && box.querySelectorAll('.tag--avoid').forEach(x => x.remove());
        const tag = m ? FZ.avoidTag(m.byId[id]) : '';
        if (tag) { tags.push('avoid'); box && box.insertAdjacentHTML('afterbegin', tag); }
        c.dataset.tags = tags.join(' ');
      });
      $$('[data-dish-tags]').forEach(box => { box.querySelectorAll('.tag--avoid').forEach(x => x.remove()); const tag = m ? FZ.avoidTag(m.byId[box.dataset.dishTags]) : ''; if (tag) box.insertAdjacentHTML('afterbegin', tag); if (!box.querySelector('.fav-btn')) box.insertAdjacentHTML('beforeend', FZ.favBtn(box.dataset.dishTags, true)); });
      document.dispatchEvent(new CustomEvent('fz:prefs'));
    };
    run(menuCache);
    if (!menuCache && FZ.avoid().items.length) FZ.menu().then(m => { menuCache = m; run(m); });
  };
  document.addEventListener('click', e => { const b = e.target.closest('[data-fav]'); if (b) { e.preventDefault(); e.stopPropagation(); FZ.toggleFav(b.dataset.fav); } }, true);
  FZ.openAvoid = () => {
    const a = FZ.avoid();
    const o = FZ.openOverlay(`<div class="modal__body avoid"><h2 class="t-h3">Что вы не едите?</h2><p class="t-body-sm t-muted">Отметьте продукты, на которые аллергия или которые просто не нравятся. На карточках блюд с ними появится метка «Есть: …». Настройка сохранится в этом браузере.</p>
      <div class="chips" style="flex-wrap:wrap" role="group" aria-label="Продукты">${FZ.AVOID.map(([k, t]) => `<button class="chip" type="button" data-avoid="${k}" aria-pressed="${a.items.includes(k)}">${esc(t)}</button>`).join('')}</div>
      <label class="check"><input type="checkbox" data-avoid-hide ${a.hide ? 'checked' : ''}> <span>Скрыть такие блюда из меню</span></label>
      <div class="cluster"><button class="btn" type="button" data-avoid-save>Сохранить</button><button class="btn btn--ghost" type="button" data-avoid-clear>Сбросить</button></div></div>`, { label: 'Что вы не едите?', size: 'sm' });
    o.el.addEventListener('click', e => {
      const c = e.target.closest('[data-avoid]'); if (c) c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      if (e.target.closest('[data-avoid-clear]')) $$('[data-avoid]', o.el).forEach(x => x.setAttribute('aria-pressed', 'false'));
      if (e.target.closest('[data-avoid-save]')) {
        const items = $$('[data-avoid][aria-pressed="true"]', o.el).map(x => x.dataset.avoid);
        store.set('avoid', { items, hide: $('[data-avoid-hide]', o.el).checked });
        o.close(); FZ.markPrefs(); FZ.toast(items.length ? 'Отметили блюда с этими продуктами' : 'Настройка сброшена');
      }
    });
  };

  /* ---------- Cookies и Яндекс Метрика (запуск только после согласия) */
  function loadMetrika() {
    if (window.ym) return;
    (function (m, e, t, r, i, k, a) { m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); }; m[i].l = 1 * new Date(); k = e.createElement(t), a = e.getElementsByTagName(t)[0], k.async = 1, k.src = r, a.parentNode.insertBefore(k, a); })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
    window.ym(98377084, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true });
  }
  function cookieBanner(force) {
    const c = store.get('consent', null);
    if (c === 'all') loadMetrika();
    if (c && !force) return;
    $('.cookie') && $('.cookie').remove();
    const b = document.createElement('div');
    b.className = 'cookie'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Согласие на cookies');
    b.innerHTML = `<p class="t-body-sm">Мы используем cookies: необходимые — чтобы работали корзина и вход, аналитические (Яндекс Метрика) — чтобы делать сайт удобнее. Аналитика включится только с вашего согласия. <a href="${BASE}cookies.html">Подробнее</a></p><div class="cookie__actions"><button class="btn btn--sm btn--ink" type="button" data-c="all">Принять все</button><button class="btn btn--sm btn--outline" type="button" data-c="necessary">Только необходимые</button></div>`;
    document.body.appendChild(b);
    b.addEventListener('click', e => { const v = e.target.closest('[data-c]'); if (!v) return; store.set('consent', v.dataset.c); if (v.dataset.c === 'all') loadMetrika(); b.remove(); });
  }

  /* ---------- Выбор варианта: в окне блюда перерисовываем окно, в карточке и на странице меняем цену, вес, состав, фото и кнопку */
  // Вариантов немного — кнопки (button[data-v-id]), больше четырёх — выпадающий список (select[data-v-select] > option[data-v-id])
  const applyVariant = (root, v, focusSel) => {
    if (root.dataset.dishSlug) {
      FZ.menu().then(m => { const i = m.bySlug[root.dataset.dishSlug], body = root.closest('.modal__body'); if (!i || !body) return; const t = document.createElement('div'); t.innerHTML = FZ.dishHTML(i, m, v.vId); const nb = t.firstElementChild; body.replaceWith(nb); FZ.enhance(nb); const nv = nb.querySelector(focusSel); nv && nv.focus(); });
      return;
    }
    $$('button[data-v-id]', root).forEach(b => b.setAttribute('aria-checked', b.dataset.vId === v.vId ? 'true' : 'false'));
    const buy = $('[data-v-buy]', root);
    if (buy) { buy.dataset.buy = v.vId; buy.dataset.name = v.vName; buy.dataset.price = v.vPrice; buy.dataset.weight = v.vWeight; if (v.vImg) buy.dataset.img = v.vImg; buy.innerHTML = ''; FZ.enhance(root); }
    $$('[data-v-price-out]', root).forEach(el => { el.textContent = price(Number(v.vPrice)); });
    $$('[data-v-weight-out]', root).forEach(el => { el.textContent = v.vWeight + ' г'; });
    $$('[data-v-comp-out]', root).forEach(el => { el.textContent = v.vComp; });
    if (v.vImg) $$('[data-v-img-out]', root).forEach(el => { el.src = FZ.img(v.vImg); });
    const nb = v.vNutri ? v.vNutri.split(',') : null; if (nb) $$('[data-v-nutri-out] b', root).forEach((el, k) => { el.textContent = nb[k]; });
  };
  document.addEventListener('click', e => {
    const vb = e.target.closest('button[data-v-id]'); if (!vb) return;
    const root = vb.closest('[data-variant-root]'); if (!root) return;
    e.preventDefault();
    if (vb.getAttribute('aria-checked') === 'true') return;
    applyVariant(root, vb.dataset, `button[data-v-id="${vb.dataset.vId}"]`);
  });
  // «Назад» на странице блюда: если пришли с нашего сайта — возвращаем туда же, иначе ссылка ведёт в раздел меню
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-back]'); if (!a) return;
    let same = false; try { same = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch (_) {}
    if (same && history.length > 1) { e.preventDefault(); history.back(); }
  });
  document.addEventListener('change', e => {
    const sel = e.target.closest('[data-v-select]'); if (!sel) return;
    const root = sel.closest('[data-variant-root]'), o = sel.selectedOptions[0]; if (!root || !o) return;
    applyVariant(root, o.dataset, '[data-v-select]');
  });

  /* ---------- Галерея */
  document.addEventListener('click', e => {
    if (e.target.closest('[data-open-search]')) { e.preventDefault(); openSearch(); return; }
    if (e.target.closest('[data-open-drawer]')) { openDrawer(); return; }
    if (e.target.closest('[data-cookie-settings]')) { cookieBanner(true); return; }
    const lb = e.target.closest('[data-lightbox]');
    if (lb) { FZ.openOverlay(`<div class="lightbox"><img src="${esc(lb.dataset.lightbox)}" alt="${esc(lb.querySelector('img') ? lb.querySelector('img').alt : '')}"></div>`, { label: 'Фото' }); return; }
    const d = e.target.closest('[data-open-dish]');
    if (d && !e.metaKey && !e.ctrlKey && !e.shiftKey && document.body.dataset.page !== 'dish') { e.preventDefault(); FZ.openDish(d.dataset.openDish); }
  });

  // Это концепт для портфолио, а не сайт кафе: говорим об этом на каждой странице
  function conceptBar() {
    if (document.querySelector('.concept-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'concept-bar'; bar.setAttribute('role', 'note');
    bar.innerHTML = '<b>Концепт редизайна</b><span>Я сделала этот сайт для портфолио, это не официальный сайт кафе «Фьюжн». Заказ можно оформить целиком, но он никуда не отправится.</span>';
    document.body.prepend(bar);
  }
  function boot() {
    conceptBar(); renderPlace(); markOrdered(); FZ.markPrefs(); cookieBanner(false);
    if (location.hash.startsWith('#dish-')) FZ.openDish(decodeURIComponent(location.hash.slice(6)));
    const u = FZ.user(); $$('[data-profile-link]').forEach(a => a.setAttribute('aria-label', u ? 'Профиль' : 'Войти'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
