/* «Фьюжн» — логика отдельных страниц. Выбирается по <body data-page="…">.
   Данные заказов и профиля в портфолио-версии хранятся в localStorage; в бою — API поверх iiko. */
(function () {
  'use strict';
  const FZ = window.FZ, { $, $$, store, price, esc, icon } = FZ;
  const BASE = FZ.base, page = document.body.dataset.page;
  const pad = n => String(n).padStart(2, '0');
  const fmtTime = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
  const DAYS = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];
  const STATUS = [['processing', 'В обработке', 'Проверяем заказ и передаём на кухню', 'i-clock'], ['cooking', 'Готовим', 'Повара уже работают над вашим заказом', 'c-hot'], ['courier_soon', 'Курьер скоро заберёт заказ', 'Заказ собран и упакован', 'i-pickup'], ['on_the_way', 'В пути', 'Курьер едет к вам', 'i-delivery'], ['delivered', 'Заказ доставлен', 'Приятного аппетита!', 'i-check']];
  const PICKUP_STATUS = [['processing', 'В обработке', 'Проверяем заказ', 'i-clock'], ['cooking', 'Готовим', 'Повара работают над заказом', 'c-hot'], ['ready', 'Готов к выдаче', 'Можно забирать', 'i-pickup'], ['picked_up', 'Выдан', 'Приятного аппетита!', 'i-check']];
  const qs = k => new URLSearchParams(location.search).get(k);

  /* ---------- Временные слоты: только 12:00–23:00, «как можно скорее» — до 22:00 */
  function slots(mode, base = new Date()) {
    const lead = mode === 'pickup' ? 30 : 60, days = [];
    for (let d = 0; d < 3; d++) {
      const day = new Date(base); day.setDate(day.getDate() + d); day.setHours(0, 0, 0, 0);
      const list = [];
      for (let m = 12 * 60 + 30; m <= 23 * 60; m += 30) {
        const t = new Date(day); t.setMinutes(m);
        if (t - base >= lead * 60000) list.push(t);
      }
      if (list.length) days.push({ label: d === 0 ? 'Сегодня' : d === 1 ? 'Завтра' : 'Послезавтра', date: day, list });
    }
    return days;
  }
  const asapAvailable = () => FZ.workStatus().state === 'open';

  /* ---------- Главная */
  function home() {
    const b = $('[data-home-banner]');
    const s = FZ.workStatus();
    // Когда закрыто, о часах работы говорит одна зелёная плашка — статус в первом экране прячем, чтобы не повторяться
    // и стоит она на месте статуса — в начале первого экрана
    if (b && s.state !== 'open') { const st = $('.hero [data-work-status]'); if (st) { st.hidden = true; st.before(b); } b.hidden = false; b.innerHTML = `<div class="banner banner--success banner--slim">${icon('i-clock')}<p class="banner__title">${s.state === 'last' ? 'Заказ на завтра можно оформить уже сейчас' : 'Откроемся в 12:00 — заказ примем уже сейчас'}</p></div>`; }
  }
  function repeatOrder(id) {
    const o = store.get('orders', []).find(x => x.id === id); if (!o) return;
    FZ.menu().then(m => {
      let skipped = [];
      o.items.forEach(i => { const cur = m.byId[i.id]; if (!cur || !cur.available) { skipped.push(i.name); return; } FZ.cart.set(i.id, FZ.cart.qty(i.id) + i.qty, { name: cur.name, price: cur.price, img: cur.image || '', weight: cur.weight }); });
      FZ.toast(skipped.length ? `Добавили в корзину. Нет в наличии: ${skipped.join(', ')}` : 'Блюда из этого заказа добавлены в корзину', { action: { label: 'Перейти', onClick: () => { location.href = BASE + 'cart.html'; } }, duration: 4500 });
    });
  }
  document.addEventListener('click', e => { const r = e.target.closest('[data-repeat-order]'); if (r) repeatOrder(r.dataset.repeatOrder); });

  /* ---------- Меню: навигация и фильтры */
  function menuPage() {
    const nav = $('[data-catnav]'), subsBox = $('[data-catnav-subs]');
    const secs = $$('.menu-sec'), links = $$('a[data-sec]', nav);
    const setSec = id => {
      links.forEach(a => { if (a.dataset.sec === id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
      $$('[data-subs-for]', subsBox).forEach(c => { c.hidden = c.dataset.subsFor !== id; });
      subsBox.hidden = !$(`[data-subs-for="${id}"]`, subsBox);
      const a = links.find(x => x.dataset.sec === id); a && a.scrollIntoView({ block: 'nearest', inline: 'center' });
    };
    // Активный раздел — последний, чей заголовок прошёл треть экрана; у конца страницы — последний раздел
    let cur = null, tick = false;
    const pick = () => {
      tick = false;
      const vis = secs.filter(s => !s.hidden);
      if (!vis.length) return;
      let id = vis[0].id;
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 8) id = vis[vis.length - 1].id;
      else vis.forEach(s => { if (s.getBoundingClientRect().top <= innerHeight * .33) id = s.id; });
      if (id !== cur) { cur = id; setSec(id.slice(4)); }
    };
    addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(pick); } }, { passive: true });
    addEventListener('resize', pick);
    const subIo = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { $$('.chip', subsBox).forEach(c => c.toggleAttribute('aria-current', c.getAttribute('href') === '#' + e.target.id)); } }), { rootMargin: '-35% 0px -60% 0px' });
    $$('.menu-sub').forEach(s => subIo.observe(s));
    setSec(secs[0].id.slice(4)); requestAnimationFrame(pick);
    // Фильтры по меткам
    const chips = $$('[data-filter]'), reset = $('[data-filter-reset]'), empty = $('.menu-empty');
    if (FZ.user() && FZ.ordered().size) { const o = $('[data-filter="ordered"]'); if (o) o.hidden = false; }
    const apply = () => {
      const on = chips.filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.dataset.filter);
      let shown = 0;
      const hideAvoid = FZ.avoid().hide;
      $$('.dish[data-tags]').forEach(d => { const t = d.dataset.tags.split(' '); const ok = on.every(f => t.includes(f)) && !(hideAvoid && t.includes('avoid')); d.hidden = !ok; if (ok) shown++; });
      $$('.menu-sub').forEach(s => { s.hidden = !$('.dish:not([hidden])', s); });
      $$('.menu-sec').forEach(s => { s.hidden = !$('.menu-sub:not([hidden])', s); });
      reset.hidden = !on.length; empty.hidden = shown > 0;
      const favOnly = on.length === 1 && on[0] === 'fav';
      $('.empty__title', empty).textContent = favOnly ? 'В избранном пока пусто' : 'С такими фильтрами ничего нет';
      $('.empty__text', empty).textContent = favOnly ? 'Нажмите на сердечко на карточке блюда — оно появится здесь.' : 'Попробуйте убрать одну из меток.';
      const n = FZ.avoid().items.length, al = $('[data-avoid-label]'); if (al) { al.textContent = n ? `Не ем: ${n}` : 'Не ем…'; al.closest('button').setAttribute('aria-pressed', n ? 'true' : 'false'); }
      $('[data-filter-count]').textContent = on.length ? `Найдено: ${shown}` : '';
    };
    chips.forEach(c => c.addEventListener('click', () => { c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); apply(); }));
    reset.addEventListener('click', () => { chips.forEach(c => c.setAttribute('aria-pressed', 'false')); apply(); });
    document.addEventListener('fz:prefs', apply);
    const ao = $('[data-avoid-open]'); if (ao) ao.addEventListener('click', () => FZ.openAvoid());
    apply();
    const f = qs('tag'); if (f) { const c = $(`[data-filter="${f}"]`); if (c) { c.setAttribute('aria-pressed', 'true'); apply(); } }
  }

  /* ---------- Страница поиска */
  function searchPage() {
    const inp = $('#q'), box = $('#search-results');
    inp.value = qs('q') || '';
    FZ.menu().then(m => { FZ.renderSearch(box, m, inp.value); let t; inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { FZ.renderSearch(box, m, inp.value); history.replaceState(null, '', inp.value ? '?q=' + encodeURIComponent(inp.value) : location.pathname); }, 150); }); box.addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) { inp.value = b.dataset.q; FZ.renderSearch(box, m, inp.value); } }); });
    inp.focus();
  }

  /* ---------- Выбор адреса */
  const STREETS = {
    'Новые районы': ['трнавская', 'набережная леонова', 'леонова', 'proletarskaya', 'пролетарская', 'комсомольская', 'саратовское шоссе', 'шоссе', 'вокзальная', 'степная', 'академика жука', 'жука', 'чапаева', '30 лет победы', 'минская', 'ленинградская', 'брусничная', 'гагарина'],
    'Жилгород': ['ленина', 'трнавская 1', 'факел социализма', 'набережная', 'красноармейская', 'бр. захаровых', 'захаровых', 'советская', 'коммунистическая', 'дзержинского', 'титова', 'полевая', 'мичурина', 'менделеева', 'кирова', 'вокзальная 1']
  };
  function zoneFor(city, addr) {
    if (city === 'volsk') return 'Вольск';
    const a = addr.toLowerCase().replace(/ё/g, 'е').replace(/^ул\.?\s*/, '');
    for (const z of ['Жилгород', 'Новые районы']) if (STREETS[z].some(s => a.startsWith(s))) return z;
    // Демо: незнакомую улицу отдаём кафе на Ленина. В продакшне зону определяет геокодер по полигонам зон.
    return 'Жилгород';
  }
  const pointForZone = z => z === 'Жилгород' ? 'lenina' : z === 'Новые районы' ? 'trnavskaya' : z === 'Вольск' ? 'volsk' : null;
  function addressPage() {
    const p = FZ.place();
    let mode = p.mode || 'delivery', city = p.city || 'balakovo', zone = null;
    const segBtns = $$('#mode .seg__btn'), cityBtns = $$('[data-city]'), addr = $('#addr'), res = $('#zone-result'), pickList = $('#pickup-list');
    const show = () => {
      segBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.value === mode ? 'true' : 'false'));
      cityBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.city === city ? 'true' : 'false'));
      $('#delivery-box').hidden = mode !== 'delivery'; $('#pickup-box').hidden = mode !== 'pickup';
      $$('[data-zone-city]').forEach(g => g.toggleAttribute('hidden', g.dataset.zoneCity !== city));
      $$('.point[data-city]', pickList).forEach(c => { c.hidden = c.dataset.city !== city; });
      check();
    };
    const check = () => {
      if (mode !== 'delivery') return;
      zone = addr.value.trim() ? zoneFor(city, addr.value) : null;
      if (!addr.value.trim()) { res.innerHTML = `<div class="banner">${icon('i-info')}<div class="banner__body">Введите улицу и дом — подскажем, какое кафе привезёт заказ и за сколько.</div></div>`; return; }
      const pt = FZ.POINTS[pointForZone(zone)];
      res.innerHTML = `<div class="banner banner--success">${icon('i-check')}<div class="banner__body"><p class="banner__title">${zone} — доставляет кафе «${esc(pt.short)}»</p><p>Доставим за ~60 минут, бесплатно при заказе от 500 ₽.</p></div></div>`;
    };
    segBtns.forEach(b => b.addEventListener('click', () => { mode = b.dataset.value; show(); }));
    cityBtns.forEach(b => b.addEventListener('click', () => { city = b.dataset.city; zone = null; show(); }));
    addr.addEventListener('input', check);
    addr.value = p.mode === 'delivery' ? p.address : '';
    if (p.pointId) { const r = $(`input[name="pt"][value="${p.pointId}"]`); if (r) r.checked = true; }
    show();
    $('#save').addEventListener('click', () => {
      const err = $('#addr-err');
      if (mode === 'delivery') {
        if (!addr.value.trim()) { addr.setAttribute('aria-invalid', 'true'); err.hidden = false; err.textContent = 'Введите улицу и номер дома'; addr.focus(); return; }
        FZ.setPlace({ mode, city, address: addr.value.trim(), pointId: pointForZone(zone), zone });
      } else {
        const r = $('input[name="pt"]:checked'); if (!r || r.closest('.point').hidden) { FZ.toast('Выберите кафе для самовывоза', { type: 'error' }); return; }
        FZ.setPlace({ mode, city, address: '', pointId: r.value });
      }
      FZ.toast('Адрес сохранён');
      setTimeout(() => { location.href = qs('next') ? BASE + qs('next') : BASE + 'menu.html'; }, 500);
    });
  }

  /* ---------- Корзина */
  function cartPage() {
    const list = $('#cart-list'), empty = $('#cart-empty'), full = $('#cart-full');
    const render = () => {
      const c = FZ.calc(), p = FZ.place();
      empty.hidden = c.count > 0; full.hidden = c.count === 0;
      if (!c.count) return;
      list.innerHTML = c.items.map(i => `<div class="line" data-line="${i.id}"><div class="line__media"><span class="ph"></span>${i.img ? `<img src="${esc(FZ.img(i.img))}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div><div><p class="line__title">${esc(i.name)}</p><p class="line__meta">${i.weight ? i.weight + '&#8239;г · ' : ''}${price(i.price)} за шт.</p></div><div class="line__side"><span class="price-sm">${price(i.price * i.qty)}</span><div data-buy="${i.id}" data-name="${esc(i.name)}" data-price="${i.price}" data-confirm-remove data-no-link></div></div></div>`).join('');
      FZ.enhance(list);
      $('#sum-items').textContent = price(c.sum);
      $('#sum-count').textContent = `${c.count} ${FZ.plural(c.count, 'блюдо', 'блюда', 'блюд')}`;
      const dr = $('#row-discount'); dr.hidden = !c.best; if (c.best) { dr.querySelector('span').textContent = c.best.title; dr.querySelector('span:last-child').textContent = '−' + price(c.discount); }
      $('#row-delivery').hidden = p.mode === 'pickup';
      FZ.animateNumber($('#sum-total'), c.total);
      const go = $('#to-checkout'); go.setAttribute('aria-disabled', c.minOk ? 'false' : 'true'); go.classList.toggle('is-disabled', !c.minOk);
      $('#min-note').hidden = c.minOk; $('#min-note').innerHTML = `Минимальная сумма заказа — 500&#8239;₽. Добавьте ещё на <b>${price(c.left)}</b>.`;
      $('#cart-place').innerHTML = p.mode === 'pickup' && p.pointId ? `Самовывоз: ${esc(FZ.POINTS[p.pointId].short)} · <a href="${BASE}address.html?next=cart.html">изменить</a>` : p.address ? `Доставка: ${esc(FZ.CITY[p.city])}, ${esc(p.address)} · <a href="${BASE}address.html?next=cart.html">изменить</a>` : `<a href="${BASE}address.html?next=cart.html">Укажите адрес доставки или кафе</a>`;
      const prog = $('[data-progress="min"]'); if (prog) prog.hidden = c.minOk && !!c.best;
    };
    $('#to-checkout').addEventListener('click', e => { if ($('#to-checkout').getAttribute('aria-disabled') === 'true') { e.preventDefault(); FZ.toast('Минимальная сумма заказа — 500 ₽', { type: 'error' }); } });
    $('#clear').addEventListener('click', async () => { if (await FZ.confirm({ title: 'Очистить заказ?', text: 'Все блюда пропадут из корзины.', ok: 'Очистить' })) { FZ.cart.clear(); } });
    const now = new Date(); const busy = (now.getDay() === 5 || now.getDay() === 6) && now.getHours() >= 18 && now.getHours() < 21;
    $('#high-load').hidden = !busy;
    document.addEventListener('fz:cart', render); render();
  }

  /* ---------- Оформление заказа */
  function checkoutPage() {
    const c0 = FZ.calc(); if (!c0.count) { location.replace(BASE + 'cart.html'); return; }
    const form = $('#checkout'), p = FZ.place(), u = FZ.user();
    let mode = p.mode || 'delivery';
    const segBtns = $$('#co-mode .seg__btn');
    const fill = () => {
      segBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.value === mode ? 'true' : 'false'));
      $('#co-delivery').hidden = mode !== 'delivery'; $('#co-pickup').hidden = mode !== 'pickup';
      $$('#co-delivery input[required]').forEach(i => { i.disabled = mode !== 'delivery'; });
      renderTime(); renderSummary();
    };
    segBtns.forEach(b => b.addEventListener('click', () => { mode = b.dataset.value; fill(); }));
    if (p.address) $('#co-street').value = p.address;
    if (p.city) $('#co-city').value = p.city;
    if (p.pointId && mode === 'pickup') { const r = $(`input[name="co-pt"][value="${p.pointId}"]`); if (r) r.checked = true; }
    if (u) { $('#co-phone').value = u.phone || ''; $('#co-name').value = u.name || ''; }
    // Время
    const asap = $('#t-asap'), later = $('#t-later'), daySel = $('#co-day'), slotSel = $('#co-slot');
    function renderTime() {
      const ok = asapAvailable();
      asap.disabled = !ok;
      $('#asap-sub').textContent = ok ? (mode === 'pickup' ? 'Приготовим за ~30 минут' : 'Доставим за ~60 минут') : (FZ.workStatus().state === 'last' ? 'Заказы на сегодня — до 22:00' : 'Закрыто — откроемся в 12:00');
      if (!ok) later.checked = true;
      const days = slots(mode);
      daySel.innerHTML = days.map((d, i) => `<option value="${i}">${d.label}, ${d.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</option>`).join('');
      const fillSlots = () => { const d = days[daySel.value] || days[0]; slotSel.innerHTML = d.list.map(t => `<option value="${t.toISOString()}">${fmtTime(t)}</option>`).join(''); };
      daySel.onchange = fillSlots; fillSlots();
      $('#later-box').hidden = !later.checked;
    }
    [asap, later].forEach(r => r.addEventListener('change', () => { $('#later-box').hidden = !later.checked; }));
    // Оплата
    $$('input[name="pay"]').forEach(r => r.addEventListener('change', () => { $('#change-box').hidden = $('input[name="pay"]:checked').value !== 'cash'; }));
    function renderSummary() {
      const c = FZ.calc(mode);
      $('#co-items').innerHTML = c.items.map(i => `<div class="summary__row"><span>${esc(i.name)} × ${i.qty}</span><span>${price(i.price * i.qty)}</span></div>`).join('');
      $('#co-sum').textContent = price(c.sum);
      const dr = $('#co-row-discount'); dr.hidden = !c.best; if (c.best) { dr.firstElementChild.textContent = c.best.title; dr.lastElementChild.textContent = '−' + price(c.discount); }
      $('#co-row-delivery').hidden = mode === 'pickup';
      $('#co-total').textContent = price(c.total);
      $('#bd-note').hidden = !(mode === 'pickup' && !(u && u.birthday));
    }
    const phone = $('#co-phone');
    const clearErr = e => {
      const t = e.target, host = t.name === 'co-pt' ? $('#co-pickup') : t;
      if (!host || !host.id) return;
      const err = $(`[data-inline-err="#${host.id}"]`, form); if (err) err.remove();
      host.removeAttribute('aria-invalid'); host.removeAttribute('aria-describedby');
    };
    form.addEventListener('input', clearErr); form.addEventListener('change', clearErr);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const errs = [];
      $$('[aria-invalid]', form).forEach(x => x.removeAttribute('aria-invalid'));
      $$('[data-inline-err]', form).forEach(x => x.remove());
      if (!$('#co-name').value.trim()) errs.push(['#co-name', 'Как к вам обращаться?']);
      if (!FZ.phoneValid(phone.value)) errs.push(['#co-phone', 'Проверьте номер телефона']);
      if (mode === 'delivery' && !$('#co-street').value.trim()) errs.push(['#co-street', 'Укажите улицу и дом']);
      if (mode === 'pickup' && !$('input[name="co-pt"]:checked')) errs.push(['#co-pickup', 'Выберите кафе']);
      if (!$('#co-consent').checked) errs.push(['#co-consent', 'Нужно согласие на обработку персональных данных']);
      if (later.checked && !slotSel.value) errs.push(['#co-slot', 'Выберите время']);
      const box = $('#co-errors');
      if (errs.length) {
        box.hidden = true;
        errs.forEach(([sel, msg]) => {
          const el = $(sel); if (!el) return;
          el.setAttribute('aria-invalid', 'true');
          const err = document.createElement('span'); err.className = 'field__error'; err.dataset.inlineErr = sel; err.id = sel.slice(1) + '-err'; err.innerHTML = icon('i-alert', 'icon icon--sm') + esc(msg);
          const field = el.closest('.field'), check = el.closest('.check');
          if (field) field.appendChild(err); else if (check) check.insertAdjacentElement('afterend', err); else el.insertAdjacentElement('afterbegin', err);
          el.setAttribute('aria-describedby', err.id);
        });
        const first = $(errs[0][0]); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => first.focus({ preventScroll: true }), 300);
        return;
      }
      box.hidden = true;
      const c = FZ.calc(mode), pay = $('input[name="pay"]:checked').value;
      const pt = mode === 'pickup' ? $('input[name="co-pt"]:checked').value : (FZ.place().pointId || 'lenina');
      const orders = store.get('orders', []);
      const order = { id: 'o' + Date.now(), number: 2000 + orders.length + Math.floor(Math.random() * 900), createdAt: new Date().toISOString(), mode, pointId: pt,
        address: mode === 'delivery' ? `${FZ.CITY[$('#co-city').value]}, ${$('#co-street').value.trim()}${$('#co-apt').value ? ', кв. ' + $('#co-apt').value : ''}` : '',
        time: asap.checked && !asap.disabled ? 'asap' : slotSel.value, payment: pay, items: c.items.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty, img: i.img || '' })),
        sum: c.sum, discount: c.discount, discountTitle: c.best ? c.best.title : '', total: c.total, name: $('#co-name').value.trim(), phone: phone.value, comment: $('#co-comment').value.trim() };
      const btn = $('#co-submit'); btn.classList.add('is-loading');
      const finish = () => { orders.unshift(order); store.set('orders', orders); FZ.cart.clear(); location.href = BASE + 'order.html?id=' + order.id; };
      if (pay === 'card_online') {
        setTimeout(() => {
          btn.classList.remove('is-loading');
          const o = FZ.openOverlay(`<div class="confirm"><p class="t-overline t-muted">Альфа-Банк · оплата для примера</p><h2 class="confirm__title">Оплатить ${price(order.total)}?</h2><p class="t-muted">Деньги не спишутся: на настоящем сайте здесь открылась бы платёжная страница банка.</p><div class="confirm__actions"><button class="btn btn--outline" type="button" data-close>Отмена</button><button class="btn" type="button" data-pay>Оплатить</button></div></div>`, { label: 'Оплата', size: 'sm' });
          $('[data-pay]', o.el).addEventListener('click', () => { order.paid = true; finish(); });
        }, 500);
      } else setTimeout(finish, 600);
    });
    if (!u || !u.birthday) { /* подсказка про ДР показывается в renderSummary */ }
    fill();
  }

  /* ---------- Заказ принят и статус */
  function orderPage() {
    const orders = store.get('orders', []), o = orders.find(x => x.id === qs('id')) || orders[0];
    const box = $('#order');
    if (!o) { document.title = 'Заказ не найден — Фьюжн'; box.innerHTML = `<div class="empty"><h1 class="empty__title">Заказ не найден</h1><p class="empty__text">Возможно, он был оформлен на другом устройстве.</p><a class="btn" href="${BASE}menu.html">В меню</a></div>`; return; }
    const pt = FZ.POINTS[o.pointId] || FZ.POINTS.lenina, steps = o.mode === 'pickup' ? PICKUP_STATUS : STATUS;
    const when = o.time === 'asap' ? (o.mode === 'pickup' ? 'Будет готов примерно через 30 минут' : `Привезём примерно к ${fmtTime(new Date(new Date(o.createdAt).getTime() + 60 * 60000))}`) : `${o.mode === 'pickup' ? 'Приготовим к' : 'Привезём к'} ${new Date(o.time).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`;
    $('#order-num').textContent = '№ ' + o.number;
    $('#order-when').textContent = when;
    $('#order-call').href = 'tel:' + pt.tel; $('#order-call-label').textContent = `Позвонить: ${pt.short}`;
    $('#order-items').innerHTML = o.items.map(i => `<div class="summary__row"><span>${esc(i.name)} × ${i.qty}</span><span>${price(i.price * i.qty)}</span></div>`).join('') + (o.discount ? `<div class="summary__row summary__row--discount"><span>${esc(o.discountTitle)}</span><span>−${price(o.discount)}</span></div>` : '') + `<div class="summary__total"><b>Итого</b><span class="price-lg">${price(o.total)}</span></div>`;
    $('#order-meta').innerHTML = `<li>${o.mode === 'pickup' ? `Самовывоз: ${esc(pt.title)}, ${esc(pt.address)}` : `Доставка: ${esc(o.address)}`}</li><li>Оплата: ${{ card_online: o.paid ? 'картой онлайн — оплачено' : 'картой онлайн', card_courier: 'картой курьеру', cash: 'наличными' }[o.payment]}</li><li>Контейнеры — бесплатно</li>${o.comment ? `<li>Комментарий: ${esc(o.comment)}</li>` : ''}`;
    let idx = Math.min(steps.length - 1, Math.floor((Date.now() - new Date(o.createdAt)) / 12000)), delayed = false;
    const track = $('#track');
    const draw = () => {
      track.innerHTML = steps.map((s, i) => {
        const cls = i < idx ? 'is-done' : i === idx ? (delayed ? 'is-delayed' : 'is-current') : '';
        const title = i === idx && delayed ? 'Курьер задерживается' : s[1];
        const text = i === idx && delayed ? 'Извините за ожидание — курьер будет примерно через 15 минут' : (i <= idx ? s[2] : '');
        return `<div class="track__step ${cls}" ${i === idx ? 'aria-current="step"' : ''}><span class="track__dot">${i < idx ? icon('i-check') : i === idx ? icon(delayed ? 'i-clock' : s[3]) : ''}</span><div><p class="track__title">${title}</p>${text ? `<p class="track__text">${text}</p>` : ''}</div></div>`;
      }).join('');
      $('#status-live').textContent = 'Статус заказа: ' + (delayed ? 'курьер задерживается' : steps[idx][1]);
    };
    draw();
    const timer = setInterval(() => { if (delayed) return; if (idx < steps.length - 1) { idx++; draw(); } else clearInterval(timer); }, 12000);
    $('#demo-next').addEventListener('click', () => { delayed = false; if (idx < steps.length - 1) idx++; draw(); });
    $('#demo-delay').hidden = o.mode === 'pickup';
    $('#demo-delay').addEventListener('click', () => { delayed = !delayed; if (idx === 0) idx = Math.min(3, steps.length - 2); draw(); });
    $('#order-repeat').addEventListener('click', () => repeatOrder(o.id));
  }

  /* ---------- Вход по телефону */
  function loginPage() {
    const s1 = $('#step-phone'), s2 = $('#step-code'), phone = $('#login-phone'), err = $('#phone-err'), otp = $('[data-otp]');
    let stop = () => {}, tries = 3;
    const start = () => { stop(); stop = FZ.timer($('#resend'), 59, () => { $('#resend').innerHTML = '<button class="btn btn--ghost btn--sm" type="button" data-resend style="margin-left:-12px">Отправить код повторно</button>'; }); };
    $('#phone-form').addEventListener('submit', e => {
      e.preventDefault();
      if (!FZ.phoneValid(phone.value)) { phone.setAttribute('aria-invalid', 'true'); err.hidden = false; phone.focus(); return; }
      s1.hidden = true; s2.hidden = false; $('#code-phone').textContent = phone.value; $('input', otp).focus(); start();
    });
    $('#change-phone').addEventListener('click', () => { stop(); s2.hidden = true; s1.hidden = false; phone.focus(); });
    document.addEventListener('click', e => { if (e.target.closest('[data-resend]')) { start(); tries = 3; FZ.toast('Новый код отправлен'); } });
    otp.addEventListener('complete', e => {
      const ce = $('#code-err');
      if (e.detail === '1234') {
        otp.classList.add('is-ok'); ce.hidden = true; stop();
        const prev = FZ.user() || {};
        store.set('user', { phone: phone.value, name: prev.name || '', birthday: prev.birthday || null });
        if (!store.get('orders', []).length) seedDemoOrder();
        FZ.toast('Вы вошли');
        setTimeout(() => { location.href = BASE + (qs('next') || 'profile.html'); }, 500);
      } else {
        tries--; otp.setAttribute('aria-invalid', 'true'); ce.hidden = false;
        ce.textContent = tries > 0 ? `Неверный код. ${tries === 1 ? 'Осталась 1 попытка' : `Осталось ${tries} попытки`}` : 'Попытки закончились. Запросите новый код.';
        setTimeout(() => { $$('input', otp).forEach(i => { i.value = ''; i.disabled = tries <= 0; }); if (tries > 0) $('input', otp).focus(); }, 400);
      }
    });
  }
  function seedDemoOrder() {
    FZ.menu().then(m => {
      const pick = ['Филадельфия', 'Калифорния №1', 'Соус спайси', 'Мисо Эби'].map(n => m.items.find(i => i.name === n)).filter(Boolean);
      const items = pick.map(i => ({ id: i.id, name: i.name, price: i.price, qty: 1, img: i.image || '' }));
      const sum = items.reduce((a, i) => a + i.price, 0);
      const d = new Date(); d.setDate(d.getDate() - 9); d.setHours(19, 20);
      store.set('orders', [{ id: 'demo1', number: 1987, demo: true, createdAt: d.toISOString(), mode: 'delivery', pointId: 'lenina', address: 'Балаково, ул. Ленина, 1, кв. 4', time: 'asap', payment: 'card_courier', items, sum, discount: 0, total: sum, name: '', phone: '' }]);
    });
  }

  /* ---------- Профиль */
  function profilePage() {
    const u = FZ.user();
    $('#guest').hidden = !!u; $('#account').hidden = !u;
    if (!u) return;
    $('#hello').textContent = u.name ? `Здравствуйте, ${u.name}!` : 'Профиль';
    $('#p-phone').value = u.phone;
    $('#p-name').value = u.name || ''; $('#p-bd').value = u.birthday || '';
    // Заказы
    const orders = store.get('orders', []);
    $('#orders').innerHTML = orders.length ? orders.map(o => `<li class="order-card"><div class="order-card__head"><b>№ ${o.number}${o.demo ? ' <span class="tag">пример</span>' : ''}</b><span class="t-caption t-muted">${new Date(o.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · ${o.mode === 'pickup' ? 'самовывоз' : 'доставка'}</span></div><p class="order-card__items">${o.items.map(i => `${esc(i.name)}${i.qty > 1 ? ' × ' + i.qty : ''}`).join(', ')}</p><div class="cluster" style="justify-content:space-between"><span class="price">${price(o.total)}</span><span class="cluster"><a class="btn btn--sm btn--ghost" href="${BASE}order.html?id=${o.id}">Подробнее</a><button class="btn btn--sm btn--soft" type="button" data-repeat-order="${o.id}">${icon('i-repeat')}Повторить заказ</button></span></div></li>`).join('') : `<li class="empty"><p class="empty__title">Заказов пока нет</p><a class="btn" href="${BASE}menu.html">Перейти в меню</a></li>`;
    // Адреса
    const renderAddr = () => {
      const list = store.get('addresses', []);
      $('#addresses').innerHTML = list.length ? list.map((a, i) => `<li class="addr-item"><span><b>${esc(a.title || 'Адрес')}</b><br><span class="t-body-sm t-muted">${esc(FZ.CITY[a.city])}, ${esc(a.street)}${a.apt ? ', кв. ' + esc(a.apt) : ''}</span></span><span class="cluster" style="--cluster-gap:4px"><button class="btn btn--sm btn--ghost" type="button" data-use-addr="${i}">Доставить сюда</button><button class="btn btn--sm btn--ghost btn--icon" type="button" data-del-addr="${i}" aria-label="Удалить адрес">${icon('i-trash')}</button></span></li>`).join('') : '<li class="t-muted">Сохранённых адресов нет.</li>';
    };
    renderAddr();
    $('#addr-form').addEventListener('submit', e => { e.preventDefault(); const street = $('#a-street').value.trim(); if (!street) { $('#a-street').setAttribute('aria-invalid', 'true'); return; } const list = store.get('addresses', []); list.push({ title: $('#a-title').value.trim(), city: $('#a-city').value, street, apt: $('#a-apt').value.trim() }); store.set('addresses', list); e.target.reset(); renderAddr(); FZ.toast('Адрес сохранён'); });
    $('#addresses').addEventListener('click', async e => {
      const d = e.target.closest('[data-del-addr]'), use = e.target.closest('[data-use-addr]'), list = store.get('addresses', []);
      if (d && await FZ.confirm({ title: 'Удалить адрес?', text: list[d.dataset.delAddr].street })) { list.splice(d.dataset.delAddr, 1); store.set('addresses', list); renderAddr(); }
      if (use) { const a = list[use.dataset.useAddr]; FZ.setPlace({ mode: 'delivery', city: a.city, address: a.street + (a.apt ? ', кв. ' + a.apt : ''), pointId: a.city === 'volsk' ? 'volsk' : 'lenina' }); FZ.toast('Адрес выбран для доставки'); }
    });
    // Данные
    $('#data-form').addEventListener('submit', e => { e.preventDefault(); store.set('user', { ...FZ.user(), name: $('#p-name').value.trim(), birthday: $('#p-bd').value || null, news: $('#p-news').checked }); FZ.toast('Данные сохранены'); $('#hello').textContent = $('#p-name').value.trim() ? `Здравствуйте, ${$('#p-name').value.trim()}!` : 'Профиль'; });
    $('#p-news').checked = !!u.news;
    $('#logout').addEventListener('click', async () => { if (await FZ.confirm({ title: 'Выйти из профиля?', ok: 'Выйти', danger: false })) { store.set('user', null); location.href = BASE + './'; } });
  }

  /* ---------- Отзывы: вкладки по кафе */
  function reviewsPage() {
    /* Отзывы — ссылками на карточки кафе в Яндекс Картах, без встроенного виджета */
  }

  /* Карты на телефоне: свайп прокручивает страницу, двигать карту — после нажатия */
  $$('.zone-map__frame, .point__map').forEach(f => {
    if (!f.querySelector('iframe') || f.querySelector('.map-shield')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'map-shield'; b.innerHTML = '<span>Нажмите, чтобы двигать карту</span>';
    b.addEventListener('click', () => f.classList.add('is-live'));
    f.insertBefore(b, f.querySelector('.point__map-fallback'));
  });
  document.addEventListener('touchstart', e => { $$('.is-live').forEach(f => { if (!f.contains(e.target)) f.classList.remove('is-live'); }); }, { passive: true });

  const run = { index: home, menu: menuPage, search: searchPage, address: addressPage, cart: cartPage, checkout: checkoutPage, order: orderPage, login: loginPage, profile: profilePage, reviews: reviewsPage }[page];
  const go = () => run && run();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
