/* «Фьюжн» — поведение компонентов. Без зависимостей. Подключается на всех страницах.
   API: window.FZ. Разметка подключается через data-атрибуты, см. design-system.html. */
(function () {
  'use strict';
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const NBSP = ' ';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('fz:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('fz:' + k, JSON.stringify(v)); } catch (e) { /* приватный режим */ } }
  };

  // Бизнес-правила по умолчанию; страницы могут подменить их данными из settings.json
  const RULES = {
    open: '12:00', close: '23:00', ordersUntil: '22:00', minSum: 500,
    progressive: [{ from: 1000, percent: 3 }, { from: 2000, percent: 5 }, { from: 3000, percent: 7 }, { from: 10000, percent: 15 }]
  };

  const price = n => Math.round(n).toLocaleString('ru-RU').replace(/\s/g, NBSP) + NBSP + '₽';
  const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
  const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  /* --- Статус работы */
  function workStatus(now = new Date(), r = RULES) {
    const m = now.getHours() * 60 + now.getMinutes();
    if (m >= mins(r.open) && m < mins(r.ordersUntil)) return { state: 'open', text: `Работаем до ${r.close}` };
    if (m >= mins(r.ordersUntil) && m < mins(r.close)) return { state: 'last', text: `Заказы на сегодня приняты до ${r.ordersUntil} — оформите ко времени` };
    return { state: 'closed', text: `Закрыто — примем заказ ко времени с ${r.open}` };
  }
  function renderStatus() {
    const s = workStatus();
    $$('[data-work-status]').forEach(el => {
      el.className = el.className.replace(/status--\w+/g, '').trim() + ' status status--' + s.state;
      if (!el.hasAttribute('data-static')) el.textContent = el.dataset.short !== undefined ? ({ open: 'Открыто', last: 'Только ко времени', closed: 'Закрыто' })[s.state] : s.text;
    });
    return s;
  }

  /* --- Скидки (не суммируются: берём одну, самую выгодную) */
  function discountFor(sum, r = RULES) {
    let cur = null, next = null;
    for (const step of r.progressive) { if (sum >= step.from) cur = step; else { next = step; break; } }
    return { current: cur, next, amount: cur ? Math.round(sum * cur.percent / 100) : 0 };
  }

  /* --- Анимация числа */
  function animateNumber(el, to, fmt = price) {
    const from = Number(el.dataset.value || 0);
    el.dataset.value = to;
    if (reduce.matches || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), d = 360;
    const step = t => { const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  /* --- Тосты */
  function toast(text, opts = {}) {
    let box = $('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast' + (opts.type === 'error' ? ' toast--error' : '');
    t.innerHTML = `<svg class="icon" aria-hidden="true"><use href="${FZ.sprite}#${opts.type === 'error' ? 'i-alert' : 'i-check'}"/></svg><span></span>`;
    t.querySelector('span').textContent = text;
    if (opts.action) { const b = document.createElement('button'); b.className = 'toast__action'; b.type = 'button'; b.textContent = opts.action.label; b.onclick = () => { opts.action.onClick(); close(); }; t.appendChild(b); }
    box.appendChild(t);
    const close = () => { t.classList.add('is-out'); setTimeout(() => t.remove(), 200); };
    setTimeout(close, opts.duration || 3200);
    return close;
  }

  /* --- Модальные окна / bottom sheet: фокус-ловушка, Esc, клик по фону, блок прокрутки */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function openOverlay(content, { label = '', size = '' } = {}) {
    const opener = document.activeElement;
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="modal ${size ? 'modal--' + size : ''}" role="dialog" aria-modal="true" ${label ? `aria-label="${label.replace(/"/g, '&quot;')}"` : ''}><button class="btn btn--ghost btn--icon modal__close" type="button" aria-label="Закрыть"><svg class="icon" aria-hidden="true"><use href="${FZ.sprite}#i-close"/></svg></button></div>`;
    const modal = ov.firstElementChild;
    if (typeof content === 'string') modal.insertAdjacentHTML('beforeend', content); else modal.appendChild(content);
    document.body.appendChild(ov);
    root.classList.add('no-scroll');
    $$('body > *:not(.overlay):not(.toasts)').forEach(n => n.setAttribute('inert', ''));
    const close = () => {
      ov.classList.add('is-closing');
      setTimeout(() => { ov.remove(); if (!$('.overlay')) { root.classList.remove('no-scroll'); $$('[inert]').forEach(n => n.removeAttribute('inert')); } opener && opener.focus && opener.focus(); }, reduce.matches ? 0 : 160);
      document.removeEventListener('keydown', onKey);
    };
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') { const f = $$(FOCUSABLE, modal); if (!f.length) return; const first = f[0], last = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.modal__close,[data-close]')) close(); });
    // Свайп вниз закрывает bottom sheet на телефоне
    let y0 = null;
    modal.addEventListener('pointerdown', e => { if (window.innerWidth < 768 && modal.scrollTop <= 0 && e.clientY - modal.getBoundingClientRect().top < 80) { y0 = e.clientY; modal.classList.add('is-dragging'); modal.setPointerCapture(e.pointerId); } });
    modal.addEventListener('pointermove', e => { if (y0 !== null) modal.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; });
    modal.addEventListener('pointerup', e => { if (y0 === null) return; const dy = e.clientY - y0; y0 = null; modal.classList.remove('is-dragging'); modal.style.transform = ''; if (dy > 120) close(); });
    setTimeout(() => { const f = $(FOCUSABLE.split(', ').map(s => s + ':not(.modal__close)').join(','), modal) || modal.querySelector('.modal__close'); f && f.focus(); }, 30);
    enhance(modal);
    return { el: modal, close };
  }

  function confirmDialog({ title, text = '', ok = 'Удалить', cancel = 'Отмена', danger = true }) {
    return new Promise(resolve => {
      const html = `<div class="confirm"><h2 class="confirm__title">${title}</h2>${text ? `<p class="t-muted">${text}</p>` : ''}<div class="confirm__actions"><button class="btn btn--outline" type="button" data-r="0">${cancel}</button><button class="btn ${danger ? '' : 'btn--ink'}" type="button" data-r="1">${ok}</button></div></div>`;
      const o = openOverlay(html, { label: title, size: 'sm' });
      let done = false;
      o.el.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) { done = true; resolve(b.dataset.r === '1'); o.close(); } });
      const mo = new MutationObserver(() => { if (!document.body.contains(o.el)) { mo.disconnect(); if (!done) resolve(false); } });
      mo.observe(document.body, { childList: true });
    });
  }

  /* --- Корзина */
  const cart = {
    items: store.get('cart', {}),
    count() { return Object.values(this.items).reduce((a, i) => a + i.qty, 0); },
    sum() { return Object.values(this.items).reduce((a, i) => a + i.qty * i.price, 0); },
    qty(id) { return this.items[id] ? this.items[id].qty : 0; },
    set(id, qty, meta = {}) {
      if (qty <= 0) delete this.items[id]; else this.items[id] = Object.assign({}, this.items[id], meta, { id, qty });
      store.set('cart', this.items);
      document.dispatchEvent(new CustomEvent('fz:cart', { detail: { id, qty } }));
    },
    clear() { this.items = {}; store.set('cart', {}); document.dispatchEvent(new CustomEvent('fz:cart', { detail: {} })); }
  };
  function renderCartBadges(bump) {
    const c = cart.count(), s = cart.sum();
    $$('[data-cart-count]').forEach(el => { el.textContent = c; el.hidden = c === 0 && el.hasAttribute('data-hide-empty'); });
    $$('[data-cart-sum]').forEach(el => animateNumber(el, s));
    $$('.fab-cart[data-auto]').forEach(f => { f.classList.toggle('is-hidden', c === 0); if (bump && c) { f.classList.remove('bump'); void f.offsetWidth; f.classList.add('bump'); } });
    $$('[data-progress="min"]').forEach(p => setProgress(p, s, RULES.minSum));
    $$('[data-progress="discount"]').forEach(p => setDiscount(p, s));
  }
  function setProgress(p, s, target) {
    const left = Math.max(0, target - s), pct = Math.min(100, s / target * 100);
    p.style.setProperty('--p', pct.toFixed(1));
    p.classList.toggle('progress--done', left === 0);
    const lab = $('[data-progress-label]', p);
    if (lab) lab.innerHTML = left ? `Закажите ещё на <b>${price(left)}</b> — минимальная сумма ${price(target)}` : 'Минимальная сумма набрана — доставка бесплатная';
  }
  function setDiscount(p, s) {
    const d = discountFor(s), max = RULES.progressive[2].from;
    const pct = Math.min(100, s / max * 100);
    p.style.setProperty('--p', pct.toFixed(1));
    const lab = $('[data-progress-label]', p);
    if (lab) lab.innerHTML = d.next ? `Ещё <b>${price(d.next.from - s)}</b> — и скидка ${d.next.percent}%` + (d.current ? ` <span class="t-muted">(сейчас ${d.current.percent}%)</span>` : '') : `Ваша скидка <b>${d.current.percent}%</b> — максимальная`;
    $$('[data-step]', p).forEach(el => el.classList.toggle('is-reached', s >= Number(el.dataset.step)));
  }

  /* Кнопка «Добавить» → счётчик */
  function counterHTML(q, brand) {
    return `<div class="counter ${brand ? 'counter--brand' : ''}" role="group" aria-label="Количество"><button class="counter__btn" type="button" data-dec aria-label="Убрать одну порцию"><svg class="icon" aria-hidden="true"><use href="${FZ.sprite}#i-minus"/></svg></button><span class="counter__val" aria-live="polite">${q}</span><button class="counter__btn" type="button" data-inc aria-label="Добавить ещё порцию"><svg class="icon" aria-hidden="true"><use href="${FZ.sprite}#i-plus"/></svg></button></div>`;
  }
  function renderBuy(box) {
    const id = box.dataset.buy, q = cart.qty(id);
    const p = Number(box.dataset.price);
    const label = box.dataset.label || 'Добавить';
    // В узкой карточке «Нет в наличии» не помещается — там короткая надпись; на странице блюда и в окне полная
    if (box.dataset.unavailable !== undefined) { box.innerHTML = box.dataset.size === 'lg' ? `<button class="btn" type="button" disabled>Нет в наличии</button>` : `<button class="btn btn--sm" type="button" disabled>Закончилось</button>`; return; }
    const wantCounter = q > 0;
    const hasCounter = !!$('.counter', box);
    if (wantCounter && hasCounter) { const v = $('.counter__val', box); if (v.textContent !== String(q)) { v.textContent = q; v.classList.remove('bump'); void v.offsetWidth; v.classList.add('bump'); } return; }
    if (wantCounter) { box.innerHTML = counterHTML(q, box.dataset.brand !== undefined); return; }
    box.innerHTML = `<button class="btn ${box.dataset.size === 'lg' ? '' : 'btn--sm'} dish__add" type="button" data-inc aria-label="${label}: ${box.dataset.name || ''}, ${price(p)}"><svg class="icon" aria-hidden="true"><use href="${FZ.sprite}#i-plus"/></svg><span class="btn__label">${label}</span></button>`;
  }
  document.addEventListener('click', e => {
    const box = e.target.closest('[data-buy]');
    if (!box) return;
    const inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]');
    if (!inc && !dec) return;
    e.preventDefault();
    const id = box.dataset.buy, q = cart.qty(id);
    const meta = { name: box.dataset.name, price: Number(box.dataset.price), img: box.dataset.img || '', weight: box.dataset.weight || '' };
    if (inc) {
      cart.set(id, q + 1, meta);
      if (q === 0) { flyToCart(box); toast(`«${meta.name}» в корзине`, { action: box.dataset.noLink === undefined ? { label: 'Перейти', onClick: () => { location.href = FZ.cartUrl; } } : null }); }
    } else if (q === 1 && box.dataset.confirmRemove !== undefined) {
      confirmDialog({ title: 'Удалить из заказа?', text: `«${meta.name}» пропадёт из корзины.` }).then(ok => { if (ok) cart.set(id, 0); });
    } else cart.set(id, q - 1, meta);
  });
  document.addEventListener('fz:cart', e => { $$('[data-buy]').forEach(renderBuy); renderCartBadges(e.detail && e.detail.qty); });

  /* Полёт блюда в корзину */
  function flyToCart(from) {
    if (reduce.matches) return;
    const target = $$('[data-cart-target]').find(el => el.offsetParent !== null);
    const card = from.closest('.dish, .dish-detail, [data-fly-root]');
    const src = card && (card.querySelector('img') || card.querySelector('.ph'));
    if (!target || !src) return;
    const a = src.getBoundingClientRect(), b = target.getBoundingClientRect();
    const size = Math.min(a.width, a.height, 120);
    const f = document.createElement('div');
    f.className = 'fly';
    f.style.cssText = `left:${a.left + a.width / 2 - size / 2}px;top:${a.top + a.height / 2 - size / 2}px;width:${size}px;height:${size}px;`;
    f.appendChild(src.cloneNode(true)); f.firstChild.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    document.body.appendChild(f);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    f.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * .5}px, ${dy * .5 - 80}px) scale(.6)`, opacity: 1, offset: .55 },
      { transform: `translate(${dx}px, ${dy}px) scale(.15)`, opacity: .4 }
    ], { duration: 640, easing: 'cubic-bezier(.3,0,.8,.15)' }).onfinish = () => f.remove();
  }

  /* --- Сегментный переключатель */
  function initSeg(seg) {
    const btns = $$('.seg__btn', seg);
    let thumb = $('.seg__thumb', seg);
    if (!thumb) { thumb = document.createElement('span'); thumb.className = 'seg__thumb'; thumb.setAttribute('aria-hidden', 'true'); seg.prepend(thumb); }
    const place = () => { const a = btns.find(b => b.getAttribute('aria-pressed') === 'true') || btns[0]; thumb.style.width = a.offsetWidth + 'px'; thumb.style.transform = `translateX(${a.offsetLeft - 4}px)`; };
    btns.forEach(b => b.addEventListener('click', () => { btns.forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); place(); seg.dispatchEvent(new CustomEvent('change', { detail: b.dataset.value, bubbles: true })); }));
    new ResizeObserver(place).observe(seg); place();
  }

  /* --- Табы (стрелки влево/вправо) */
  function initTabs(t) {
    const tabs = $$('[role="tab"]', t);
    const select = tab => { tabs.forEach(x => { const on = x === tab; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; const p = document.getElementById(x.getAttribute('aria-controls')); if (p) p.hidden = !on; }); };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', e => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return; e.preventDefault(); let j = i; do { j = (j + d + tabs.length) % tabs.length; } while (tabs[j].disabled); tabs[j].focus(); select(tabs[j]); });
    });
    select(tabs.find(x => x.getAttribute('aria-selected') === 'true') || tabs[0]);
  }

  /* --- Маска телефона +7 (___) ___-__-__ */
  function initPhone(inp) {
    const fmt = v => { let d = v.replace(/\D/g, ''); if (d.startsWith('8')) d = '7' + d.slice(1); if (!d.startsWith('7')) d = '7' + d; d = d.slice(0, 11); const p = d.slice(1); let s = '+7'; if (p.length) s += ' (' + p.slice(0, 3); if (p.length >= 3) s += ') ' + p.slice(3, 6); if (p.length >= 6) s += '-' + p.slice(6, 8); if (p.length >= 8) s += '-' + p.slice(8, 10); return s; };
    inp.setAttribute('inputmode', 'tel'); inp.setAttribute('autocomplete', 'tel'); inp.placeholder = inp.placeholder || '+7 (___) ___-__-__';
    inp.addEventListener('focus', () => { if (!inp.value) inp.value = '+7 ('; });
    inp.addEventListener('blur', () => { if (inp.value.replace(/\D/g, '').length <= 1) inp.value = ''; });
    inp.addEventListener('input', () => { inp.value = fmt(inp.value); inp.removeAttribute('aria-invalid'); const err = inp.closest('.field') && $('.field__error', inp.closest('.field')); if (err) err.hidden = true; });
  }
  const phoneValid = v => v.replace(/\D/g, '').length === 11 && /^7[3489]/.test(v.replace(/\D/g, ''));

  /* --- SMS-код */
  function initOtp(box) {
    const cells = $$('input', box);
    cells.forEach((c, i) => {
      c.setAttribute('inputmode', 'numeric'); c.setAttribute('maxlength', '1'); c.placeholder = ' '; if (i === 0) c.setAttribute('autocomplete', 'one-time-code');
      c.addEventListener('input', () => { c.value = c.value.replace(/\D/g, '').slice(-1); box.removeAttribute('aria-invalid'); if (c.value && cells[i + 1]) cells[i + 1].focus(); if (cells.every(x => x.value)) box.dispatchEvent(new CustomEvent('complete', { detail: cells.map(x => x.value).join(''), bubbles: true })); });
      c.addEventListener('keydown', e => { if (e.key === 'Backspace' && !c.value && cells[i - 1]) cells[i - 1].focus(); });
      c.addEventListener('paste', e => { const d = (e.clipboardData.getData('text') || '').replace(/\D/g, ''); if (!d) return; e.preventDefault(); cells.forEach((x, j) => { x.value = d[j] || ''; }); (cells[d.length] || cells[cells.length - 1]).focus(); if (d.length >= cells.length) box.dispatchEvent(new CustomEvent('complete', { detail: d.slice(0, cells.length), bubbles: true })); });
    });
  }
  function timer(el, sec, done) {
    let s = sec; const tick = () => { el.textContent = `Отправить код повторно через ${s} ${plural(s, 'секунду', 'секунды', 'секунд')}`; if (s-- <= 0) { clearInterval(id); done && done(); } };
    const id = setInterval(tick, 1000); tick(); return () => clearInterval(id);
  }

  /* --- Сторис */
  function openStories(list, start) {
    let i = start, raf, t0, paused = false, elapsed = 0;
    const D = 5000;
    const v = document.createElement('div');
    v.className = 'story-viewer'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true'); v.setAttribute('aria-label', 'Акции');
    document.body.appendChild(v); root.classList.add('no-scroll');
    const opener = document.activeElement;
    const close = () => { cancelAnimationFrame(raf); v.remove(); root.classList.remove('no-scroll'); document.removeEventListener('keydown', key); opener && opener.focus(); };
    const show = () => {
      const s = list[i]; s.el.classList.add('is-seen'); store.set('story:' + s.id, 1);
      v.innerHTML = `<div class="story-viewer__frame" style="--story-bg:${s.bg};--story-fg:${s.fg}"><div class="story-viewer__bars">${list.map((_, j) => `<div class="story-viewer__bar"><i style="width:${j < i ? 100 : 0}%"></i></div>`).join('')}</div><button class="btn btn--ghost btn--icon story-viewer__close" type="button" aria-label="Закрыть" style="--btn-fg:currentColor;--btn-bg-h:rgba(255,255,255,.15)"><svg class="icon" aria-hidden="true"><use href="${FZ.sprite}#i-close"/></svg></button><div class="story-viewer__nav"><button type="button" aria-label="Предыдущая"></button><button type="button" aria-label="Следующая"></button></div><div class="story-viewer__content"><p class="t-overline">${s.kicker || 'Акция'}</p><h2 class="story-viewer__title">${s.title}</h2><p class="story-viewer__text">${s.text}</p>${s.cta ? `<a class="btn story-viewer__cta" href="${s.href || '#'}">${s.cta}</a>` : ''}</div></div>`;
      $('.story-viewer__close', v).onclick = close;
      const [prev, next] = $$('.story-viewer__nav button', v);
      prev.onclick = () => go(-1); next.onclick = () => go(1);
      const frame = $('.story-viewer__frame', v);
      frame.addEventListener('pointerdown', () => { paused = true; }); frame.addEventListener('pointerup', () => { paused = false; t0 = performance.now() - elapsed; });
      elapsed = 0; t0 = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
      next.focus({ preventScroll: true });
    };
    const tick = now => { if (!paused) { elapsed = now - t0; const bar = $$('.story-viewer__bar i', v)[i]; if (bar) bar.style.width = Math.min(100, elapsed / D * 100) + '%'; if (elapsed >= D) return go(1); } raf = requestAnimationFrame(tick); };
    const go = d => { i += d; if (i < 0) i = 0; if (i >= list.length) return close(); show(); };
    const key = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    document.addEventListener('keydown', key);
    show();
  }
  function initStories(box) {
    const items = $$('[data-story]', box).map(el => ({ el, id: el.dataset.story, title: el.dataset.title, text: el.dataset.text, kicker: el.dataset.kicker, cta: el.dataset.cta, href: el.dataset.href, bg: el.style.getPropertyValue('--story-bg') || 'var(--color-brand)', fg: el.style.getPropertyValue('--story-fg') || '#fff' }));
    items.forEach((s, i) => { if (store.get('story:' + s.id)) s.el.classList.add('is-seen'); s.el.addEventListener('click', () => openStories(items, i)); });
  }

  /* --- Навигация по меню: подсветка текущего раздела */
  function initScrollspy(nav) {
    const links = $$('a[href^="#"]', nav), map = new Map();
    links.forEach(a => { const s = document.getElementById(a.getAttribute('href').slice(1)); if (s) map.set(s, a); });
    const io = new IntersectionObserver(es => { es.forEach(e => { if (e.isIntersecting) { links.forEach(l => l.removeAttribute('aria-current')); const a = map.get(e.target); a.setAttribute('aria-current', 'true'); a.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduce.matches ? 'auto' : 'smooth' }); } }); }, { rootMargin: '-35% 0px -60% 0px' });
    map.forEach((_, s) => io.observe(s));
  }

  /* --- Тема */
  function initTheme(btn) {
    const apply = t => { if (t) root.setAttribute('data-theme', t); else root.removeAttribute('data-theme'); btn.setAttribute('aria-label', t === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'); $('use', btn) && $('use', btn).setAttribute('href', `${FZ.sprite}#${t === 'dark' ? 'i-sun' : 'i-moon'}`); };
    apply(store.get('theme', null));
    btn.addEventListener('click', () => { const dark = root.getAttribute('data-theme') === 'dark' || (!root.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches); const t = dark ? 'light' : 'dark'; store.set('theme', t); apply(t); });
  }

  /* --- Появление при прокрутке */
  function initReveal(scope) {
    if (reduce.matches || !('IntersectionObserver' in window)) return;
    root.classList.add('js-motion');
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal', scope).forEach((el, i) => { el.style.transitionDelay = (Number(el.dataset.delay) || 0) + 'ms'; const r = el.getBoundingClientRect(); if (r.top < innerHeight) el.classList.add('is-in'); else io.observe(el); });
  }

  /* --- Переключаемые чипы и прочее */
  function enhance(scope = document) {
    $$('.seg', scope).forEach(s => { if (!s.dataset.ready) { s.dataset.ready = 1; initSeg(s); } });
    $$('[data-tabs]', scope).forEach(t => { if (!t.dataset.ready) { t.dataset.ready = 1; initTabs(t); } });
    $$('input[data-phone]', scope).forEach(i => { if (!i.dataset.ready) { i.dataset.ready = 1; initPhone(i); } });
    $$('[data-otp]', scope).forEach(o => { if (!o.dataset.ready) { o.dataset.ready = 1; initOtp(o); } });
    $$('[data-buy]', scope).forEach(renderBuy);
  }
  document.addEventListener('click', e => {
    const chip = e.target.closest('[data-toggle-pressed]');
    if (chip) chip.setAttribute('aria-pressed', chip.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    const single = e.target.closest('[data-single] > [aria-pressed]');
    if (single) $$('[aria-pressed]', single.parentElement).forEach(x => x.setAttribute('aria-pressed', x === single ? 'true' : 'false'));
  });

  const FZ = window.FZ = {
    sprite: (document.currentScript && document.currentScript.dataset.sprite) || 'assets/icons/sprite.svg',
    cartUrl: 'cart.html',
    rules: RULES, price, plural, workStatus, renderStatus, discountFor, animateNumber, toast, openOverlay, confirm: confirmDialog,
    cart, flyToCart, phoneValid, timer, openStories, enhance, store, $, $$
  };

  /* Типограф для текста, который появляется после загрузки (карточка блюда, поиск, корзина, статусы).
     Те же правила, что в сборке: предлоги и союзы не висят в конце строки. */
  const NB = ' ';
  const reShort = /(?<![\p{L}\d-])([а-яёa-z]{1,2}|для|без|над|под|при|про|или|как|что|это|уже|ещё|еще|все|всё|его|где|чем)[ ]+(?=[\p{L}\d«"(№])/giu;
  const typo = s => s.replace(reShort, '$1' + NB).replace(/(?<=\d)[ ]+(?=[₽%а-яё]|\d{3}(?!\d))/giu, NB)
    .replace(/№[ ]+(?=\d)/g, '№' + NB).replace(/[ ]+([—–])(?= )/g, NB + '$1').replace(/(?<=\p{L})[ ]+(бы|ли|же)(?!\p{L})/gu, NB + '$1');
  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|INPUT|CODE|PRE)$/;
  function typoTree(node) {
    if (node.nodeType === 3) { const v = typo(node.nodeValue); if (v !== node.nodeValue) node.nodeValue = v; return; }
    if (node.nodeType !== 1 || SKIP.test(node.nodeName) || node.isContentEditable) return;
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, { acceptNode: t => (t.parentNode && SKIP.test(t.parentNode.nodeName)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    for (let t = w.nextNode(); t; t = w.nextNode()) { const v = typo(t.nodeValue); if (v !== t.nodeValue) t.nodeValue = v; }
  }
  FZ.typo = typo;
  function initTypo() {
    try { new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(typoTree))).observe(document.body, { childList: true, subtree: true }); } catch (e) { /* старые браузеры: остаётся типограф сборки */ }
  }

  /* Затухание у краёв горизонтально прокручиваемых рядов: видно, что дальше есть ещё вкладки */
  function initFades() {
    const rows = $$('.chips, .catnav__sections');
    const upd = el => {
      const max = el.scrollWidth - el.clientWidth;
      el.classList.toggle('has-fade-start', max > 1 && el.scrollLeft > 2);
      el.classList.toggle('has-fade-end', max > 1 && el.scrollLeft < max - 2);
    };
    rows.forEach(el => { upd(el); el.addEventListener('scroll', () => upd(el), { passive: true }); });
    window.addEventListener('resize', () => rows.forEach(upd));
    if (window.ResizeObserver) { const ro = new ResizeObserver(es => es.forEach(e => upd(e.target))); rows.forEach(el => ro.observe(el)); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => rows.forEach(upd));
  }

  function boot() {
    root.classList.add('js');
    initTypo();
    initFades();
    enhance();
    renderStatus(); setInterval(renderStatus, 60000);
    renderCartBadges(false);
    $$('[data-stories]').forEach(initStories);
    $$('[data-scrollspy]').forEach(initScrollspy);
    $$('[data-theme-toggle]').forEach(initTheme);
    initReveal(document);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
