/* HappyLight: вимикач, конфігуратор, магазин, кошик, оформлення. Без innerHTML: DOM будується вузлами. */
(() => {
  'use strict';

  // ---------- помічники ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const NF = new Intl.NumberFormat('uk-UA');
  const money = n => NF.format(Math.round(n)) + ' грн';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Створює елемент: el('div', {class:'x', onclick:fn}, [дочірні або текст]) */
  function el(tag, attrs = {}, kids = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of [].concat(kids)) if (c !== null && c !== undefined && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return n;
  }
  const svgEl = (tag, attrs = {}) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  const icon = id => { const s = svgEl('svg', { 'aria-hidden': 'true' }); s.append(svgEl('use', { href: '#' + id })); return s; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* сховище недоступне: працюємо в пам'яті */ } }
  };
  const prettyName = s => s.replace(/\s*Крок:\s*(\d+)\s*см/i, ', крок $1 см').replace(/\s*шаг:\s*(\d+)\s*см/i, ', крок $1 см').replace(/\s+/g, ' ').trim();

  const TG = 'https://t.me/zhukbogdan';
  const PHONE = '+380 63 710 06 36';
  const GARLAND_CATS = new Set(['r25', 'f4', 'm4', 'm1', 'belt', 'loppy']);

  let DB = { cats: [], products: [] };
  const byId = new Map();

  // ---------- верхня панель, меню, поява ----------
  const top = $('.top');
  const onTop = () => top.classList.toggle('solid', scrollY > 40);
  addEventListener('scroll', onTop, { passive: true }); onTop();

  const menu = $('#menu');
  const burger = $('[data-open-menu]');
  let lastFocus = null;
  function openMenu() { lastFocus = document.activeElement; menu.classList.add('open'); burger.setAttribute('aria-expanded', 'true'); document.body.classList.add('lock'); $('[data-close-menu]', menu).focus(); }
  function closeMenu() { if (!menu.classList.contains('open')) return; menu.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); document.body.classList.remove('lock'); lastFocus?.focus?.(); }
  burger.addEventListener('click', openMenu);
  menu.addEventListener('click', e => { if (e.target.closest('[data-close-menu]')) closeMenu(); });

  const revealIO = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const items = $$('.r', e.target);
    items.forEach((x, i) => { x.style.transitionDelay = Math.min(i, 8) * 80 + 'ms'; });
    e.target.classList.add('in');
    setTimeout(() => items.forEach(x => { x.style.transitionDelay = ''; }), 1600);
    revealIO.unobserve(e.target);
  }), { threshold: 0.08 });
  $$('[data-reveal]').forEach(s => revealIO.observe(s));
  document.addEventListener('visibilitychange', () => document.body.classList.toggle('paused', document.hidden));

  // бігучий рядок: дублюємо вміст для безшовного циклу
  const ticker = $('[data-ticker]');
  if (ticker) $$('span', ticker).forEach(s => { const c = s.cloneNode(true); c.setAttribute('aria-hidden', 'true'); ticker.append(c); });

  // ---------- hero: вимикач світла ----------
  const hero = $('#hero');
  const sw = $('[data-switch]');
  const swLabel = $('[data-switch-label]');
  function originFromSwitch() {
    const h = hero.getBoundingClientRect(), b = sw.getBoundingClientRect();
    hero.style.setProperty('--mx', ((b.left + b.width / 2 - h.left) / h.width * 100).toFixed(1) + '%');
    hero.style.setProperty('--my', ((b.top + b.height / 2 - h.top) / h.height * 100).toFixed(1) + '%');
  }
  function setLight(on, flick = false) {
    if (on) { originFromSwitch(); hero.classList.remove('peek'); }
    hero.classList.toggle('on', on);
    hero.classList.toggle('flick', on && flick && !reduced());
    sw.setAttribute('aria-pressed', String(on));
    sw.setAttribute('aria-label', on ? 'Вимкнути світло' : 'Увімкнути світло');
    swLabel.textContent = on ? 'Увімкнено' : 'Світло';
  }
  sw.addEventListener('click', () => setLight(!hero.classList.contains('on'), true));
  // поки світло вимкнене, курсор «підсвічує» терасу
  hero.addEventListener('pointermove', e => {
    if (hero.classList.contains('on') || e.pointerType !== 'mouse') return;
    const r = hero.getBoundingClientRect();
    hero.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
    hero.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    hero.classList.add('peek');
  });
  hero.addEventListener('pointerleave', () => hero.classList.remove('peek'));
  if (reduced()) setLight(true); else setTimeout(() => { if (!hero.classList.contains('on')) setLight(true, true); }, 1100);

  // ---------- кошик: стан ----------
  /** @type {{id:string, vi:number, ai:number[], q:number}[]} */
  let cart = store.get('hl-cart-v1', []);
  const lineKey = l => `${l.id}|${l.vi}|${l.ai.join('.')}`;
  function unitPrice(p, vi, ai) {
    const base = p.variants.length ? (p.variants[vi]?.p ?? 0) : (p.price ?? 0);
    const extra = p.addons.reduce((s, a, i) => s + (a.o[ai[i] ?? 0]?.p ?? 0), 0);
    return base + extra;
  }
  function unitOld(p, vi, ai) {
    const o = p.variants.length ? p.variants[vi]?.o : p.old;
    if (!o) return null;
    return o + p.addons.reduce((s, a, i) => s + (a.o[ai[i] ?? 0]?.p ?? 0), 0);
  }
  function describe(p, vi, ai) {
    const parts = [];
    if (p.variants.length) parts.push(p.variants[vi].l);
    if (p.unit) parts.push(`ціна за ${p.unit}`);
    // опцію показуємо, якщо її змінили з типової або вона платна
    p.addons.forEach((a, i) => { const j = ai[i] ?? 0; const o = a.o[j]; if (o && (j > 0 || o.p > 0)) parts.push(`${a.t}: ${o.l}`); });
    return parts.join(' · ');
  }
  const cartValid = () => { cart = cart.filter(l => byId.has(l.id) && l.q > 0); };
  const cartTotal = () => cart.reduce((s, l) => { const p = byId.get(l.id); return s + (p ? unitPrice(p, l.vi, l.ai) * l.q : 0); }, 0);
  const cartCount = () => cart.reduce((s, l) => s + l.q, 0);
  function saveCart() { store.set('hl-cart-v1', cart); renderBadges(); }
  function renderBadges(bump = false) {
    const n = cartCount();
    $$('[data-count]').forEach(b => { b.textContent = String(n); b.classList.toggle('on', n > 0); if (bump) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); } });
  }
  function addToCart(id, vi, ai, q = 1) {
    const line = { id, vi, ai: ai.slice(), q };
    const ex = cart.find(l => lineKey(l) === lineKey(line));
    if (ex) ex.q = Math.min(99, ex.q + q); else cart.push(line);
    saveCart(); renderBadges(true);
    const p = byId.get(id);
    toast(`Додано: ${prettyName(p.name)}`);
  }

  // ---------- тост ----------
  const toastEl = $('[data-toast]');
  let toastT = 0;
  function toast(text) {
    $('[data-toast-text]').textContent = text;
    toastEl.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 3800);
  }

  // ---------- діалоги: спільне ----------
  const scrim = $('[data-scrim]');
  let openDlg = null, dlgOpener = null;
  function showDlg(d) {
    if (openDlg && openDlg !== d) hideDlg(openDlg, false);
    dlgOpener = dlgOpener || document.activeElement;
    scrim.hidden = false; requestAnimationFrame(() => scrim.classList.add('on'));
    d.classList.add('open'); openDlg = d; document.body.classList.add('lock');
    toastEl.classList.remove('on');
    setTimeout(() => (d.querySelector('[autofocus]') || d.querySelector('.x'))?.focus(), 60);
  }
  function hideDlg(d = openDlg, restore = true) {
    if (!d) return;
    d.classList.remove('open');
    if (d === sheet && location.hash.startsWith('#p-')) { try { history.replaceState(null, '', location.pathname + location.search); } catch { /* без історії */ } }
    openDlg = null;
    scrim.classList.remove('on'); setTimeout(() => { if (!openDlg) scrim.hidden = true; }, 350);
    document.body.classList.remove('lock');
    if (restore) { dlgOpener?.focus?.(); dlgOpener = null; }
  }
  scrim.addEventListener('click', () => hideDlg());
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (openDlg) hideDlg(); else closeMenu(); }
    if (e.key === 'Tab') {
      const box = openDlg || (menu.classList.contains('open') ? menu : null);
      if (!box) return;
      const f = $$('a[href],button:not([disabled]),input:not([type=hidden]):not(.hp input),select,textarea', box).filter(x => x.offsetParent !== null && !x.closest('.hp'));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  $$('[data-close]').forEach(b => b.addEventListener('click', () => hideDlg()));

  // ---------- елементи вибору (радіо-кнопки-чіпи) ----------
  let uid = 0;
  function optGroup(name, items, checkedIdx, onChange, extraClass = '') {
    const box = el('div', { class: 'opts ' + extraClass, role: 'radiogroup' });
    items.forEach((it, i) => {
      const id = `o${++uid}`;
      const inp = el('input', { type: 'radio', name, id, value: String(i), checked: i === checkedIdx, onchange: () => onChange(i) });
      box.append(el('div', { class: 'opt' }, [inp, el('label', { for: id }, [it.label, it.small ? el('small', { text: it.small }) : null])]));
    });
    return box;
  }
  function addonSelects(p, ai, onChange) {
    return p.addons.map((a, i) => {
      const sel = el('select', { onchange: e => onChange(i, +e.target.value) });
      a.o.forEach((o, j) => sel.append(el('option', { value: String(j), selected: (ai[i] ?? 0) === j, text: o.p ? `${o.l} (+${money(o.p)})` : o.l })));
      return el('label', { class: 'field' }, [a.t, sel]);
    });
  }
  const variantItems = p => p.variants.map(v => v.m ? { label: `${v.m} м`, small: v.l.split(' · ')[1] || '' } : { label: v.l });

  // ---------- діалог товару ----------
  const sheet = $('[data-sheet]');
  const ps = { p: null, vi: 0, ai: [], q: 1 };
  function renderSheetSum() {
    const { p, vi, ai, q } = ps;
    const sum = $('[data-p-sum]', sheet); sum.textContent = '';
    const old = unitOld(p, vi, ai);
    if (old && old > unitPrice(p, vi, ai)) sum.append(el('s', { text: money(old * q) }));
    sum.append(money(unitPrice(p, vi, ai) * q));
    $('[data-p-qty]', sheet).textContent = String(q);
  }
  function openProduct(id, opener) {
    const p = byId.get(id); if (!p) return;
    dlgOpener = opener || document.activeElement;
    Object.assign(ps, { p, vi: 0, ai: p.addons.map(() => 0), q: 1 });
    const img = $('[data-p-img]', sheet);
    if (p.img) { img.src = p.img; img.alt = prettyName(p.name); img.hidden = false; } else img.hidden = true;
    $('[data-p-name]', sheet).textContent = prettyName(p.name);
    $('[data-p-descr]', sheet).textContent = [p.descr, p.unit ? `Ціна вказана за ${p.unit}.` : ''].filter(Boolean).join(' ');
    const vbox = $('[data-p-variants]', sheet); vbox.textContent = '';
    if (p.variants.length > 1) {
      vbox.append(el('div', { class: 'field' }, [p.vt || 'Варіант']));
      vbox.append(optGroup('pv', variantItems(p), 0, i => { ps.vi = i; renderSheetSum(); }, p.variants[0].m ? 'len' : ''));
    }
    const abox = $('[data-p-addons]', sheet); abox.textContent = '';
    abox.append(...addonSelects(p, ps.ai, (i, v) => { ps.ai[i] = v; renderSheetSum(); }));
    const perks = $('[data-p-perks]', sheet); perks.textContent = '';
    ['Відправка Новою Поштою за 1–3 робочі дні', 'Оплата при отриманні або на рахунок']
      .concat(p.cats.some(c => GARLAND_CATS.has(c)) && !p.cats.includes('bez') ? ['Гарантія на лампи 2 роки'] : [])
      .forEach(t => perks.append(el('li', { text: t })));
    renderSheetSum();
    try { history.replaceState(null, '', '#p-' + id); } catch { /* історія недоступна у вбудованому перегляді */ }
    showDlg(sheet);
  }
  sheet.addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (!b) return; ps.q = Math.max(1, Math.min(99, ps.q + +b.dataset.q)); renderSheetSum(); });
  $('[data-p-form]', sheet).addEventListener('submit', e => { e.preventDefault(); addToCart(ps.p.id, ps.vi, ps.ai, ps.q); hideDlg(); });

  // ---------- магазин: чіпи й сітка ----------
  const grid = $('[data-grid]');
  const chips = $('[data-chips]');
  let curCat = 'all';
  function card(p, showTag) {
    const many = p.variants.length > 1;
    const price = el('div', { class: 'pr' }, [many ? el('small', { text: 'від' }) : null, money(p.price || 0), p.old && p.old > p.price ? el('s', { text: money(p.old) }) : null]);
    const needsChoice = many || p.addons.length > 0;
    const addBtn = el('button', { class: 'add', type: 'button', 'aria-label': needsChoice ? `Обрати: ${prettyName(p.name)}` : `У кошик: ${prettyName(p.name)}` }, [icon(needsChoice ? 'i-plus' : 'i-cart')]);
    addBtn.addEventListener('click', e => { e.stopPropagation(); if (needsChoice) openProduct(p.id, addBtn); else addToCart(p.id, 0, [], 1); });
    const nameBtn = el('button', { type: 'button', text: prettyName(p.name) });
    nameBtn.addEventListener('click', () => openProduct(p.id, nameBtn));
    const cat = DB.cats.find(c => c.id === p.cats[0]);
    const meta = p.unit ? `Ціна за ${p.unit}${p.descr ? ' · ' + p.descr : ''}` : many ? `${p.variants.length} ${p.vt ? (p.vt.toLowerCase().startsWith('довжин') ? 'варіантів довжини' : 'варіантів') : 'варіантів'}` : (p.descr || '');
    return el('article', { class: 'card' }, [
      el('div', { class: 'im' }, [p.img ? el('img', { src: p.img, alt: '', loading: 'lazy', width: 800, height: 800 }) : null, showTag && cat ? el('span', { class: 'tag', text: cat.short }) : null]),
      el('div', { class: 'bd' }, [el('h3', {}, [nameBtn]), meta ? el('p', { class: 'meta', text: meta }) : null, el('div', { class: 'ft' }, [price, addBtn])])
    ]);
  }
  function renderGrid() {
    const list = curCat === 'all' ? DB.products : DB.products.filter(p => p.cats.includes(curCat));
    grid.textContent = '';
    const frag = document.createDocumentFragment();
    list.forEach(p => frag.append(card(p, curCat === 'all')));
    grid.append(frag);
    $$('.chip', chips).forEach(c => c.setAttribute('aria-pressed', String(c.dataset.cat === curCat)));
  }
  function setCat(id, scroll) {
    curCat = id; renderGrid();
    if (scroll) $('#shop').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' });
  }
  function renderChips() {
    chips.textContent = '';
    const mk = (id, label, n) => el('button', { class: 'chip', type: 'button', dataset: { cat: id }, 'aria-pressed': 'false', onclick: () => setCat(id, false) }, [label, el('span', { class: 'c', text: String(n) })]);
    chips.append(mk('all', 'Усі', DB.products.length));
    DB.cats.forEach(c => chips.append(mk(c.id, c.short, DB.products.filter(p => p.cats.includes(c.id)).length)));
    const mc = $('[data-menu-cats]'); mc.textContent = '';
    DB.cats.forEach(c => mc.append(el('a', { href: '#shop', text: c.short, onclick: () => { closeMenu(); setCat(c.id, false); } })));
  }

  // ---------- конфігуратор ----------
  const FAM = {
    r25: { label: 'Розжарювання 25 Вт', small: 'найтепліше світло, є диммер', glow: '#ffae42', core: '#ffd27a', r: 30, a: .95, fil: true },
    f4: { label: 'Філамент LED 4 Вт', small: 'видно нитку, економні', glow: '#ffbf5e', core: '#ffe2a6', r: 26, a: .85, fil: true },
    m4: { label: 'Матові LED 4 Вт', small: 'м’яке рівне світло', glow: '#ffd79a', core: '#fff1d6', r: 26, a: .8, fil: false },
    m1: { label: 'Економні LED 1 Вт', small: 'найекономніші', glow: '#ffd79a', core: '#fff3df', r: 18, a: .6, fil: false }
  };
  const cfgForm = $('[data-cfg]');
  const cs = { fam: null, place: null, step: null, len: null, ai: [], dim: 100 };
  const cfgProducts = () => DB.products.filter(p => p.cfg);
  const pick = () => cfgProducts().find(p => p.cfg.fam === cs.fam && p.cfg.place === cs.place && p.cfg.step === cs.step);
  function normalizeCfg() {
    const all = cfgProducts();
    const fams = Object.keys(FAM).filter(f => all.some(p => p.cfg.fam === f));
    if (!fams.includes(cs.fam)) cs.fam = fams[0];
    const places = ['out', 'in'].filter(pl => all.some(p => p.cfg.fam === cs.fam && p.cfg.place === pl));
    if (!places.includes(cs.place)) cs.place = places[0];
    const steps = [50, 75, 100].filter(s => all.some(p => p.cfg.fam === cs.fam && p.cfg.place === cs.place && p.cfg.step === s));
    if (!steps.includes(cs.step)) cs.step = steps[0];
    const p = pick();
    const metres = p.variants.map(v => v.m);
    if (!metres.includes(cs.len)) cs.len = metres.includes(10) ? 10 : metres[0];
    // опції зберігаємо за назвою, якщо в новому товарі є така сама
    const prev = cs.addonsByTitle || {};
    cs.ai = p.addons.map(a => { const j = prev[a.t]; return j !== undefined && j < a.o.length ? j : 0; });
    return { fams, places, steps, p };
  }
  function rememberAddons(p) { cs.addonsByTitle = Object.fromEntries(p.addons.map((a, i) => [a.t, cs.ai[i]])); }
  // після перебудови групи повертаємо фокус на обраний варіант (клавіатура не губиться)
  const refocus = name => requestAnimationFrame(() => $(`[data-cfg] input[name="${name}"]:checked`)?.focus({ preventScroll: true }));
  function renderCfg() {
    const { fams, places, steps, p } = normalizeCfg();
    const fbox = $('[data-cfg-family]'); fbox.textContent = '';
    fbox.append(...optGroup('fam', fams.map(f => ({ label: FAM[f].label, small: FAM[f].small })), fams.indexOf(cs.fam), i => { rememberAddons(pick()); cs.fam = fams[i]; renderCfg(); refocus('fam'); }, 'lamps').childNodes);
    fbox.setAttribute('role', 'radiogroup');
    const pbox = $('[data-cfg-place]'); pbox.textContent = '';
    pbox.append(...optGroup('place', places.map(x => ({ label: x === 'out' ? 'На вулиці' : 'У приміщенні', small: x === 'out' ? 'волога, перепади температури' : 'дешевше' })), places.indexOf(cs.place), i => { rememberAddons(pick()); cs.place = places[i]; renderCfg(); refocus('place'); }).childNodes);
    const sbox = $('[data-cfg-step]'); sbox.textContent = '';
    sbox.append(...optGroup('step', steps.map(s => ({ label: `${s} см`, small: s === 50 ? 'густо' : s === 75 ? 'класика' : 'рідше, дешевше' })), steps.indexOf(cs.step), i => { rememberAddons(pick()); cs.step = steps[i]; renderCfg(); refocus('step'); }).childNodes);
    const lbox = $('[data-cfg-len]'); lbox.textContent = '';
    lbox.append(...optGroup('len', p.variants.map(v => ({ label: `${v.m} м`, small: v.l.split(' · ')[1] })), p.variants.findIndex(v => v.m === cs.len), i => { cs.len = p.variants[i].m; renderTotal(); drawScene(); }).childNodes);
    const abox = $('[data-cfg-addons]'); abox.textContent = '';
    abox.append(...addonSelects(p, cs.ai, (i, v) => { cs.ai[i] = v; renderTotal(); drawScene(); }));
    renderTotal(); drawScene();
  }
  function renderTotal() {
    const p = pick(); const vi = p.variants.findIndex(v => v.m === cs.len);
    const box = $('[data-cfg-price]'); box.textContent = '';
    const old = unitOld(p, vi, cs.ai), now = unitPrice(p, vi, cs.ai);
    if (old && old > now) box.append(el('s', { text: money(old) }));
    box.append(money(now));
    const v = p.variants[vi];
    $('[data-cfg-sub]').textContent = `${v.m} м · ${v.l.split(' · ')[1]} · ${cs.place === 'out' ? 'вулична' : 'внутрішня'}`;
    $('[data-cfg-price2]').textContent = money(now);
  }
  cfgForm.addEventListener('submit', e => {
    e.preventDefault();
    const p = pick(); addToCart(p.id, p.variants.findIndex(v => v.m === cs.len), cs.ai, 1);
  });
  // калькулятор довжини: найближча довжина з запасом на провис
  const calc = $('[data-calc]');
  calc.addEventListener('input', () => {
    const out = $('[data-calc-out]');
    const m = parseFloat(String(calc.value).replace(',', '.'));
    if (!(m > 0)) { out.textContent = ''; return; }
    const p = pick();
    const need = m * 1.1;
    const v = p.variants.find(x => x.m >= need);
    if (!v) { out.textContent = 'Більше 100 м: напишіть нам, зробимо під розмір.'; return; }
    cs.len = v.m;
    out.textContent = `Беріть ${v.m} м з запасом на провис.`;
    renderCfg();
  });
  // яскравість (якщо обрано диммер)
  $('[data-dim-range]').addEventListener('input', e => { cs.dim = +e.target.value; drawScene(); });

  function drawScene() {
    const p = pick(); if (!p) return;
    const f = FAM[cs.fam];
    const svg = $('[data-scene-svg]'); svg.textContent = '';
    const out = cs.place === 'out';
    const colorAddon = p.addons.findIndex(a => /^колір( дроту)?$/i.test(a.t.trim()));
    const whiteWire = colorAddon >= 0 && /біл/i.test(p.addons[colorAddon].o[cs.ai[colorAddon]]?.l || '');
    const dimAddon = p.addons.findIndex(a => /яскрав/i.test(a.t));
    const hasDim = dimAddon >= 0 && cs.ai[dimAddon] > 0;
    $('[data-dim]').hidden = !hasDim;
    const k = (hasDim ? cs.dim : 100) / 100;
    const glowTone = p.addons.some((a, i) => /світіння/i.test(a.t) && /нейтр/i.test(a.o[cs.ai[i]]?.l || '')) ? { glow: '#fff4e2', core: '#ffffff' } : f;
    const defs = svgEl('defs');
    const sky = svgEl('linearGradient', { id: 'sky', x1: 0, y1: 0, x2: 0, y2: 1 });
    (out ? [[0, '#0f1330'], [.55, '#2b2a5a'], [.8, '#6a4a6a'], [1, '#2a1e2c']] : [[0, '#2a1d1a'], [1, '#160f10']]).forEach(([o, c]) => sky.append(svgEl('stop', { offset: o, 'stop-color': c })));
    const rg = svgEl('radialGradient', { id: 'g' });
    rg.append(svgEl('stop', { offset: 0, 'stop-color': glowTone.glow, 'stop-opacity': (.9 * k).toFixed(2) }), svgEl('stop', { offset: .35, 'stop-color': glowTone.glow, 'stop-opacity': (.35 * k).toFixed(2) }), svgEl('stop', { offset: 1, 'stop-color': glowTone.glow, 'stop-opacity': 0 }));
    const fl = svgEl('radialGradient', { id: 'fl', cx: .5, cy: .38, r: .7 });
    fl.append(svgEl('stop', { offset: 0, 'stop-color': glowTone.glow, 'stop-opacity': (.28 * f.a * k).toFixed(2) }), svgEl('stop', { offset: 1, 'stop-color': glowTone.glow, 'stop-opacity': 0 }));
    defs.append(sky, rg, fl); svg.append(defs);
    svg.append(svgEl('rect', { width: 800, height: 600, fill: 'url(#sky)' }));
    if (out) {
      // зорі й силует даху та дерев
      for (let i = 0; i < 26; i++) svg.append(svgEl('circle', { cx: (i * 137) % 800, cy: (i * 59) % 210 + 10, r: i % 3 ? .8 : 1.3, fill: '#fff', opacity: .5 }));
      svg.append(svgEl('path', { d: 'M0 470 L120 430 L180 445 L260 400 L330 440 L420 420 L520 450 L600 410 L700 440 L800 425 L800 600 L0 600Z', fill: '#0b0c18' }));
      svg.append(svgEl('rect', { x: 0, y: 520, width: 800, height: 80, fill: '#16120f' }));
    } else {
      for (let y = 0; y < 600; y += 34) for (let x = (y / 34) % 2 ? -40 : 0; x < 800; x += 80) svg.append(svgEl('rect', { x: x + 2, y: y + 2, width: 76, height: 30, rx: 3, fill: '#3a2620', opacity: .35 }));
      svg.append(svgEl('rect', { x: 0, y: 520, width: 800, height: 80, fill: '#1c1411' }));
    }
    svg.append(svgEl('rect', { x: 0, y: 0, width: 800, height: 600, fill: 'url(#fl)' }));
    // провід-ланцюгова лінія; кількість ламп відповідає кроку на відрізку 5 м
    const n = Math.floor(500 / cs.step) + 1;
    const x0 = 40, x1 = 760, y0 = 150, sag = 90;
    const at = t => [x0 + (x1 - x0) * t, y0 + sag * 4 * t * (1 - t)];
    svg.append(svgEl('path', { d: `M${x0} ${y0} Q400 ${y0 + sag * 2} ${x1} ${y0}`, fill: 'none', stroke: whiteWire ? '#e9e4da' : '#08080c', 'stroke-width': 3 }));
    for (let i = 0; i < n; i++) {
      const [x, y] = at(i / (n - 1));
      const g = svgEl('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` });
      g.append(svgEl('circle', { cx: 0, cy: 34, r: f.r * 2.4, fill: 'url(#g)' }));
      g.append(svgEl('rect', { x: -5, y: 0, width: 10, height: 14, rx: 2, fill: whiteWire ? '#e9e4da' : '#14141a' }));
      g.append(svgEl('ellipse', { cx: 0, cy: 30, rx: f.r * .42, ry: f.r * .58, fill: glowTone.core, opacity: (.35 + .65 * k).toFixed(2) }));
      if (f.fil) g.append(svgEl('path', { d: 'M-3 40 L-3 30 Q0 24 3 30 L3 40', fill: 'none', stroke: '#fff7e0', 'stroke-width': 1.2, opacity: (.4 + .6 * k).toFixed(2) }));
      svg.append(g);
    }
    const v = p.variants.find(x => x.m === cs.len);
    $('[data-scene-title]').textContent = FAM[cs.fam].label;
    $('[data-scene-count]').textContent = v ? `${v.l} · ` : '';
  }

  // ---------- кошик: шухляда ----------
  const drawer = $('[data-drawer]');
  const dBody = $('[data-drawer-body]');
  const dFoot = $('[data-drawer-foot]');
  const dTitle = $('[data-drawer-title]');
  function openCart(opener) { dlgOpener = opener || document.activeElement; renderCart(); showDlg(drawer); }
  document.addEventListener('click', e => { const b = e.target.closest('[data-open-cart]'); if (b) { closeMenu(); openCart(b); } });

  function renderCart() {
    cartValid(); dTitle.textContent = 'Кошик'; dBody.textContent = ''; dFoot.textContent = '';
    if (!cart.length) {
      dBody.append(el('div', { class: 'done' }, [el('h3', { text: 'Кошик порожній' }), el('p', { class: 'note', text: 'Зберіть гірлянду в конфігураторі або оберіть готову в магазині.' }), el('a', { class: 'btn btn-ink', href: '#build', onclick: () => hideDlg(undefined, false), text: 'Зібрати гірлянду' })]));
      return;
    }
    cart.forEach(l => {
      const p = byId.get(l.id);
      const qty = el('div', { class: 'qty', role: 'group', 'aria-label': 'Кількість' }, [
        el('button', { type: 'button', 'aria-label': 'Менше', text: '−', onclick: () => { l.q = Math.max(1, l.q - 1); saveCart(); renderCart(); } }),
        el('output', { text: String(l.q) }),
        el('button', { type: 'button', 'aria-label': 'Більше', text: '+', onclick: () => { l.q = Math.min(99, l.q + 1); saveCart(); renderCart(); } })
      ]);
      dBody.append(el('div', { class: 'line' }, [
        p.img ? el('img', { src: p.img, alt: '', width: 72, height: 72, loading: 'lazy' }) : el('span'),
        el('div', {}, [el('h3', { text: prettyName(p.name) }), el('p', { class: 'v', text: describe(p, l.vi, l.ai) }), el('div', { class: 'ctl' }, [qty, el('button', { class: 'rm', type: 'button', text: 'Прибрати', onclick: () => { cart = cart.filter(x => x !== l); saveCart(); renderCart(); } })])]),
        el('div', { class: 'lp num', text: money(unitPrice(p, l.vi, l.ai) * l.q) })
      ]));
    });
    dFoot.append(
      el('div', { class: 'sumrow' }, ['Разом', el('b', { text: money(cartTotal()) })]),
      el('p', { class: 'note', text: 'Доставка Новою Поштою за тарифом перевізника, оплачує отримувач. Самовивіз у Дніпрі безкоштовно.' }),
      el('button', { class: 'btn btn-ink btn-block', type: 'button', text: 'Оформити замовлення', onclick: renderCheckout })
    );
  }

  // ---------- оформлення ----------
  const draft = store.get('hl-co-v1', {});
  function field(label, input, err) { return el('label', { class: 'field' }, [label, input, el('span', { class: 'err', 'data-err': err })]); }
  function renderCheckout() {
    dTitle.textContent = 'Оформлення'; dBody.textContent = ''; dFoot.textContent = '';
    const f = el('form', { class: 'co', novalidate: true, autocomplete: 'on' });
    const name = el('input', { name: 'name', autocomplete: 'name', required: true, maxlength: 60, value: draft.name || '', autofocus: true });
    const phone = el('input', { name: 'phone', type: 'tel', inputmode: 'tel', autocomplete: 'tel', required: true, maxlength: 20, placeholder: '+380', value: draft.phone || '' });
    f.append(el('fieldset', {}, [el('legend', { text: 'Контакти' }), field('Ім’я та прізвище', name, 'name'), field('Телефон', phone, 'phone')]));

    const DEL = [{ v: 'np', l: 'Відділення або поштомат Нової Пошти' }, { v: 'courier', l: 'Кур’єр Нової Пошти' }, { v: 'pickup', l: 'Самовивіз, Дніпро', s: 'вул. Юрія Кондратюка, 4' }];
    let del = DEL.some(d => d.v === draft.del) ? draft.del : 'np';
    const delBox = el('div');
    const city = el('input', { name: 'city', autocomplete: 'address-level2', maxlength: 80, value: draft.city || '' });
    const branch = el('input', { name: 'branch', maxlength: 120, value: draft.branch || '' });
    const addrWrap = el('div', { class: 'co' });
    const payBox = el('div');
    let pay = draft.pay || 'cod';
    const total = cartTotal();
    function renderDel() {
      addrWrap.textContent = '';
      if (del === 'np') addrWrap.append(field('Місто', city, 'city'), field('Номер відділення або поштомату', branch, 'branch'));
      if (del === 'courier') addrWrap.append(field('Місто', city, 'city'), field('Вулиця, будинок, квартира', branch, 'branch'));
      const PAY = del === 'pickup'
        ? [{ v: 'cash', l: 'Готівкою при самовивозі' }, { v: 'iban', l: 'На рахунок ФОП', s: 'реквізити надішлемо' }]
        : [{ v: 'cod', l: 'При отриманні', s: `комісія НП ≈ ${money(20 + total * 0.02)}` }, { v: 'iban', l: 'На рахунок ФОП', s: 'реквізити надішлемо' }];
      if (!PAY.some(p => p.v === pay)) pay = PAY[0].v;
      payBox.textContent = '';
      payBox.append(optGroup('pay', PAY.map(p => ({ label: p.l, small: p.s })), PAY.findIndex(p => p.v === pay), i => { pay = PAY[i].v; }));
    }
    delBox.append(optGroup('del', DEL.map(d => ({ label: d.l, small: d.s })), DEL.findIndex(d => d.v === del), i => { del = DEL[i].v; renderDel(); }));
    renderDel();
    f.append(el('fieldset', {}, [el('legend', { text: 'Доставка' }), delBox, addrWrap]));
    f.append(el('fieldset', {}, [el('legend', { text: 'Оплата' }), payBox]));
    const comment = el('textarea', { name: 'comment', maxlength: 500, value: draft.comment || '' });
    comment.value = draft.comment || '';
    f.append(field('Коментар (необов’язково)', comment, 'comment'));
    // пастка для ботів: поле приховане від людей
    f.append(el('div', { class: 'hp', 'aria-hidden': 'true' }, [el('label', {}, ['Не заповнюйте', el('input', { name: 'website', tabindex: '-1', autocomplete: 'off' })])]));
    const formErr = el('p', { class: 'err', role: 'alert' });
    f.append(formErr);
    dBody.append(el('button', { class: 'back', type: 'button', text: '← Назад до кошика', onclick: renderCart }), f);

    const submit = el('button', { class: 'btn btn-amber btn-block', type: 'submit', text: `Підтвердити замовлення · ${money(total)}` });
    submit.setAttribute('form', 'co-form'); f.id = 'co-form';
    dFoot.append(
      el('div', { class: 'sumrow' }, ['До сплати', el('b', { text: money(total) })]),
      submit,
      el('p', { class: 'note', text: 'Без реєстрації. Менеджер зв’яжеться для підтвердження. Повернення протягом 14 днів, крім виробів під ваш розмір.' })
    );

    const saveDraft = () => { Object.assign(draft, { name: name.value, phone: phone.value, city: city.value, branch: branch.value, comment: comment.value, del, pay }); store.set('hl-co-v1', draft); };
    f.addEventListener('input', e => { saveDraft(); const t = e.target; if (t.getAttribute('aria-invalid') === 'true') { t.setAttribute('aria-invalid', 'false'); const s = t.nextElementSibling; if (s?.dataset.err) s.textContent = ''; } });
    f.addEventListener('change', saveDraft);
    phone.addEventListener('blur', () => { const n = normPhone(phone.value); if (n) phone.value = n.replace(/^(\+380)(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5'); });

    f.addEventListener('submit', async e => {
      e.preventDefault();
      if (f.website?.value) return;
      const errs = {};
      if (name.value.trim().length < 2) errs.name = 'Вкажіть ім’я';
      if (!normPhone(phone.value)) errs.phone = 'Номер у форматі +380 XX XXX XX XX';
      if (del !== 'pickup' && city.value.trim().length < 2) errs.city = 'Вкажіть місто';
      if (del !== 'pickup' && branch.value.trim().length < 1) errs.branch = del === 'np' ? 'Вкажіть номер відділення' : 'Вкажіть адресу';
      $$('[data-err]', f).forEach(s => { s.textContent = errs[s.dataset.err] || ''; const inp = s.previousElementSibling; if (inp) inp.setAttribute('aria-invalid', String(!!errs[s.dataset.err])); });
      const firstBad = Object.keys(errs)[0];
      if (firstBad) { f.elements[firstBad]?.focus(); return; }
      saveDraft();
      const order = {
        items: cart.map(l => ({ id: l.id, vi: l.vi, ai: l.ai, q: l.q })),
        customer: { name: name.value.trim(), phone: normPhone(phone.value) },
        delivery: { type: del, city: del === 'pickup' ? '' : city.value.trim(), point: del === 'pickup' ? '' : branch.value.trim() },
        payment: pay, comment: comment.value.trim(), website: '', clientTotal: total
      };
      submit.disabled = true; submit.textContent = 'Надсилаємо…'; formErr.textContent = '';
      try {
        const res = await fetch('api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
        cart = []; saveCart();
        renderDone(data.id, data.total ?? total, pay);
      } catch (err) {
        renderFallback(order);
      }
    });
  }
  function normPhone(v) {
    const d = String(v).replace(/\D/g, '');
    if (/^380\d{9}$/.test(d)) return '+' + d;
    if (/^0\d{9}$/.test(d)) return '+38' + d;
    return '';
  }
  function orderText(o) {
    const lines = o.items.map(it => { const p = byId.get(it.id); return `• ${prettyName(p.name)}${p.variants.length ? ' · ' + describe(p, it.vi, it.ai) : ''} × ${it.q} = ${money(unitPrice(p, it.vi, it.ai) * it.q)}`; });
    const D = { np: 'Нова Пошта, відділення', courier: 'Нова Пошта, кур’єр', pickup: 'Самовивіз, Дніпро' };
    const P = { cod: 'при отриманні', iban: 'на рахунок ФОП', cash: 'готівкою' };
    return ['Замовлення з сайту HappyLight', ...lines, `Разом: ${money(cartTotal())}`, `${o.customer.name}, ${o.customer.phone}`, `Доставка: ${D[o.delivery.type]}${o.delivery.city ? ', ' + o.delivery.city : ''}${o.delivery.point ? ', ' + o.delivery.point : ''}`, `Оплата: ${P[o.payment]}`, o.comment ? `Коментар: ${o.comment}` : ''].filter(Boolean).join('\n');
  }
  function renderDone(id, total, pay) {
    dTitle.textContent = 'Дякуємо!'; dBody.textContent = ''; dFoot.textContent = '';
    dBody.append(el('div', { class: 'done', role: 'status' }, [
      icon('i-ok'), el('h3', { text: `Замовлення ${id} прийнято` }),
      el('p', { text: `Сума ${money(total)}. Менеджер зв’яжеться з вами для підтвердження${pay === 'iban' ? ' і надішле реквізити для оплати' : ''}.` }),
      el('p', { class: 'note', text: `Питання: ${PHONE} або Telegram.` }),
      el('a', { class: 'btn btn-ink', href: TG, target: '_blank', rel: 'noopener noreferrer', text: 'Написати в Telegram' })
    ]));
  }
  function renderFallback(o) {
    const text = orderText(o);
    dTitle.textContent = 'Майже готово'; dBody.textContent = ''; dFoot.textContent = '';
    const pre = el('pre', { text });
    const copy = el('button', { class: 'btn btn-ink', type: 'button', text: 'Скопіювати замовлення' });
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); copy.textContent = 'Скопійовано'; }
      catch { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); copy.textContent = 'Виділено, скопіюйте вручну'; }
    });
    dBody.append(el('div', { class: 'done' }, [
      el('h3', { text: 'Не вдалося надіслати автоматично' }),
      el('p', { class: 'note', text: 'Ваш кошик збережено. Скопіюйте замовлення і надішліть нам у Telegram, або подзвоніть.' }),
      pre, copy,
      el('a', { class: 'btn btn-amber', href: TG, target: '_blank', rel: 'noopener noreferrer', text: 'Відкрити Telegram' }),
      el('p', { class: 'num', text: PHONE })
    ]));
  }

  // ---------- старт: каталог ----------
  async function boot() {
    try {
      const res = await fetch('data/catalog.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('catalog ' + res.status);
      DB = await res.json();
      DB.products.forEach(p => byId.set(p.id, p));
      if (DB.demo) document.body.prepend(el('div', { class: 'demo-bar', role: 'note', text: 'Демо для погодження: каталог тимчасовий, частина цін і фото умовні' }));
      cartValid(); renderBadges();
      renderChips(); renderGrid();
      if (cfgProducts().length) renderCfg(); else $('#build').hidden = true;
      const m = location.hash.match(/^#p-([\w-]+)$/);
      if (m && byId.has(m[1])) openProduct(m[1]);
    } catch (e) {
      $('[data-empty]').hidden = false;
      $('#build').hidden = true;
    }
  }
  boot();
})();
