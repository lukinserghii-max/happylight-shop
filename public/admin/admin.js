/* Адмінка HappyLight: чернетка змін у браузері → «Зберегти на сайт» (одна нова версія каталогу). Без innerHTML. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const NF = new Intl.NumberFormat('uk-UA');
  const money = n => (n === null || n === undefined || n === '' ? '—' : NF.format(n) + ' грн');
  function el(tag, attrs = {}, kids = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'value') n.value = v;
      else if (k === 'checked') n.checked = !!v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of [].concat(kids)) if (c !== null && c !== undefined && c !== false) n.append(c instanceof Node ? c : String(c));
    return n;
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  const imgSrc = p => (p ? '../' + p : '');
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* без сховища */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* без сховища */ } }
  };

  // ---------- стан ----------
  let base = null;      // збережений каталог
  let draft = null;     // чернетка
  let ver = 'initial';
  let kvOn = false;
  let current = null;   // id товару в редакторі
  const DRAFT_KEY = 'hl-admin-draft';

  const toastEl = $('[data-toast]');
  let tT = 0;
  function toast(msg, err = false) { toastEl.textContent = msg; toastEl.classList.toggle('err', err); toastEl.classList.add('on'); clearTimeout(tT); tT = setTimeout(() => toastEl.classList.remove('on'), err ? 6000 : 3000); }

  async function api(path, opts = {}) {
    const res = await fetch('../api/admin/' + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) { const e = new Error(data.error || 'HTTP ' + res.status); e.status = res.status; throw e; }
    return data;
  }

  // ---------- облік змін ----------
  const byId = (cat, id) => cat.products.find(p => p.id === id);
  function changedIds() {
    if (!base || !draft) return [];
    const out = [];
    const bm = new Map(base.products.map(p => [p.id, JSON.stringify(p)]));
    draft.products.forEach(p => { if (bm.get(p.id) !== JSON.stringify(p)) out.push(p.id); });
    return out;
  }
  const siteChanged = () => JSON.stringify(base.site) !== JSON.stringify(draft.site) || JSON.stringify(base.cats) !== JSON.stringify(draft.cats);
  function onChange() {
    const n = changedIds().length + (siteChanged() ? 1 : 0);
    const st = $('[data-status]');
    st.textContent = n ? `Незбережених змін: ${n}` : `Усе збережено${base.updated ? ' · ' + base.updated : ''}`;
    st.classList.toggle('dirty', n > 0);
    $('[data-publish]').disabled = n === 0;
    $('[data-discard]').hidden = n === 0;
    store.set(DRAFT_KEY, n ? { ver, draft } : null);
    if (!n) store.del(DRAFT_KEY);
  }
  function recalc(p) {
    // «від»-ціна та стара ціна товару рахуються з варіантів, як на сервері
    if (p.variants.length) {
      const ps = p.variants.map(v => v.p).filter(x => typeof x === 'number');
      p.price = ps.length ? Math.min(...ps) : null;
      p.old = p.variants[0].o ?? null;
    }
  }
  const num = v => { if (v === '' || v === null || v === undefined) return null; const n = Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? Math.round(n) : null; };

  // ---------- вкладки ----------
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => {
    $$('[data-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== b.dataset.tab; });
    if (b.dataset.tab === 'history') loadHistory();
    if (b.dataset.tab === 'site') renderSite();
    if (b.dataset.tab === 'bulk') renderBulk();
  }));

  // ---------- список товарів ----------
  const catSel = $('[data-cat-filter]'), search = $('[data-search]'), onlyHidden = $('[data-only-hidden]');
  function renderFilters() {
    catSel.textContent = '';
    catSel.append(el('option', { value: '', text: `Усі розділи (${draft.products.length})` }));
    draft.cats.forEach(c => catSel.append(el('option', { value: c.id, text: `${c.title} (${draft.products.filter(p => p.cats.includes(c.id)).length})` })));
  }
  [catSel, search, onlyHidden].forEach(x => x.addEventListener('input', renderList));
  function renderList() {
    const q = search.value.trim().toLowerCase();
    const changed = new Set(changedIds());
    const list = draft.products.filter(p => (!catSel.value || p.cats.includes(catSel.value)) && (!q || p.name.toLowerCase().includes(q)) && (!onlyHidden.checked || p.hidden));
    const ul = $('[data-list]'); ul.textContent = '';
    list.forEach(p => {
      const b = el('button', { type: 'button', 'aria-current': String(p.id === current), onclick: () => openEditor(p.id) }, [
        p.img ? el('img', { src: imgSrc(p.img), alt: '', loading: 'lazy', width: 52, height: 52 }) : el('span', { class: 'noimg' }),
        el('span', {}, [el('span', { class: 'nm', text: p.name }), p.hidden ? el('span', { class: 'tagx', text: 'Приховано' }) : null, changed.has(p.id) ? el('span', { class: 'ch', text: 'Змінено' }) : null]),
        el('span', { class: 'pr', text: (p.variants.length > 1 ? 'від ' : '') + money(p.price) })
      ]);
      ul.append(el('li', {}, [b]));
    });
    if (!list.length) ul.append(el('li', { class: 'empty', text: 'Нічого не знайдено' }));
  }

  // ---------- редактор товару ----------
  function field(label, input) { return el('label', {}, [label, input]); }
  function openEditor(id) {
    current = id;
    const p = byId(draft, id);
    const ed = $('[data-editor]'); ed.textContent = '';
    $('.layout').classList.add('editing');
    const set = (fn) => e => { fn(e.target); recalc(p); onChange(); renderListSoon(); };

    const img = el('img', { src: imgSrc(p.img), alt: 'Фото товару', width: 180, height: 180 });
    const file = el('input', { type: 'file', accept: 'image/*', hidden: true });
    const imgBtn = el('button', { class: 'btn', type: 'button', text: p.img ? 'Замінити фото' : 'Додати фото', onclick: () => file.click() });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      imgBtn.disabled = true; imgBtn.textContent = 'Стискаю…';
      try {
        const { blob, preview } = await toWebp(f);
        img.src = preview;
        imgBtn.textContent = 'Завантажую…';
        const res = await fetch('../api/admin/upload', { method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: blob, credentials: 'same-origin' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
        p.img = data.url; onChange(); renderListSoon();
        toast('Фото завантажено. Збережіть зміни, щоб воно з’явилось на сайті.');
      } catch (e) { toast('Не вдалося завантажити фото: ' + e.message, true); img.src = imgSrc(p.img); }
      finally { imgBtn.disabled = false; imgBtn.textContent = 'Замінити фото'; file.value = ''; }
    });

    ed.append(el('button', { class: 'btn small back', type: 'button', text: '← До списку', onclick: () => { $('.layout').classList.remove('editing'); current = null; renderList(); } }));
    const main = el('div', { class: 'ed-main' }, [
      field('Назва', el('input', { type: 'text', value: p.name, maxlength: 200, oninput: set(t => { p.name = t.value; }) })),
      field('Опис', el('textarea', { maxlength: 2000, oninput: set(t => { p.descr = t.value; }) }, [p.descr])),
      el('label', { class: 'chk' }, [el('input', { type: 'checkbox', checked: !!p.hidden, onchange: set(t => { if (t.checked) p.hidden = true; else delete p.hidden; }) }), 'Приховати з сайту'])
    ]);
    const head = el('div', { class: 'ed-head' }, [el('div', { class: 'ed-img' }, [img, imgBtn, file]), main]);
    ed.append(head);

    // розділи
    const cats = el('div', { class: 'cats' });
    draft.cats.forEach(c => cats.append(el('label', {}, [el('input', { type: 'checkbox', checked: p.cats.includes(c.id), onchange: e => {
      if (e.target.checked) { if (!p.cats.includes(c.id)) p.cats.push(c.id); }
      else if (p.cats.length > 1) p.cats = p.cats.filter(x => x !== c.id);
      else { e.target.checked = true; toast('Товар має бути хоча б в одному розділі', true); return; }
      onChange(); renderListSoon();
    } }), c.short])));
    ed.append(el('fieldset', { class: 'sec' }, [el('legend', { text: 'Розділи' }), cats]));

    // ціни
    if (!p.variants.length) {
      ed.append(el('div', { class: 'sec row' }, [
        field('Ціна, грн', el('input', { type: 'number', min: 0, step: 1, value: p.price ?? '', oninput: set(t => { p.price = num(t.value); }) })),
        field('Стара ціна (закреслена), грн', el('input', { type: 'number', min: 0, step: 1, value: p.old ?? '', oninput: set(t => { p.old = num(t.value); }) })),
        field('Одиниця (напр. «1 метр»)', el('input', { type: 'text', value: p.unit || '', maxlength: 40, oninput: set(t => { p.unit = t.value; }) }))
      ]));
    } else {
      const tb = el('tbody');
      const draw = () => {
        tb.textContent = '';
        p.variants.forEach((v, i) => tb.append(el('tr', {}, [
          el('td', {}, [el('input', { type: 'text', value: v.l, 'aria-label': 'Назва варіанта', oninput: set(t => { v.l = t.value; }) })]),
          el('td', {}, [el('input', { type: 'number', min: 0, value: v.p ?? '', 'aria-label': 'Ціна', oninput: set(t => { v.p = num(t.value); }) })]),
          el('td', {}, [el('input', { type: 'number', min: 0, value: v.o ?? '', 'aria-label': 'Стара ціна', oninput: set(t => { v.o = num(t.value); }) })]),
          el('td', {}, [el('button', { class: 'btn small danger', type: 'button', text: '✕', 'aria-label': 'Видалити варіант', onclick: () => {
            if (p.variants.length <= 1) { toast('Має лишитися хоча б один варіант', true); return; }
            p.variants.splice(i, 1); recalc(p); onChange(); draw(); renderListSoon();
          } })])
        ])));
      };
      draw();
      ed.append(el('div', { class: 'sec' }, [
        el('h3', { text: `${p.vt || 'Варіанти'}: ціна за кожен` }),
        el('div', { class: 'tbl' }, [el('table', {}, [el('thead', {}, [el('tr', {}, [el('th', { text: 'Варіант' }), el('th', { text: 'Ціна, грн' }), el('th', { text: 'Стара ціна' }), el('th')])]), tb])]),
        el('button', { class: 'btn small', type: 'button', text: '+ Додати варіант', onclick: () => { const last = p.variants[p.variants.length - 1]; p.variants.push({ l: 'Новий варіант', p: last?.p ?? 0, o: null, m: null, n: null }); recalc(p); onChange(); draw(); } })
      ]));
    }

    // опції
    if (p.addons.length) {
      const box = el('div', { class: 'sec' }, [el('h3', { text: 'Опції (доплата)' })]);
      p.addons.forEach(a => {
        const tb = el('tbody');
        a.o.forEach(o => tb.append(el('tr', {}, [
          el('td', {}, [el('input', { type: 'text', value: o.l, 'aria-label': 'Назва опції', oninput: set(t => { o.l = t.value; }) })]),
          el('td', {}, [el('input', { type: 'number', min: 0, value: o.p, 'aria-label': 'Доплата', oninput: set(t => { o.p = num(t.value) ?? 0; }) })])
        ])));
        box.append(el('div', { class: 'card' }, [
          field('Назва групи', el('input', { type: 'text', value: a.t, oninput: set(t => { a.t = t.value; }) })),
          el('div', { class: 'tbl' }, [el('table', {}, [el('thead', {}, [el('tr', {}, [el('th', { text: 'Варіант' }), el('th', { text: '+ грн' })])]), tb])])
        ]));
      });
      ed.append(box);
    }

    ed.append(el('div', { class: 'sec row' }, [
      el('button', { class: 'btn', type: 'button', text: 'Дублювати товар', onclick: () => {
        const c = clone(p); c.id = p.id.replace(/-c\d+$/, '') + '-c' + Date.now().toString(36).slice(-4); c.name = p.name + ' (копія)'; c.hidden = true;
        draft.products.splice(draft.products.indexOf(p) + 1, 0, c); onChange(); renderList(); openEditor(c.id);
        toast('Копію створено прихованою. Відредагуйте й зніміть «Приховати».');
      } }),
      byId(base, p.id) ? el('button', { class: 'btn', type: 'button', text: 'Повернути як було', onclick: () => {
        const i = draft.products.indexOf(p); draft.products[i] = clone(byId(base, p.id)); onChange(); renderList(); openEditor(p.id);
      } }) : null
    ]));
    renderList();
  }
  let rlT = 0;
  const renderListSoon = () => { clearTimeout(rlT); rlT = setTimeout(renderList, 250); };

  // фото: стиснення в браузері до WebP 1200 px
  async function toWebp(file) {
    if (file.size > 25 * 1024 * 1024) throw new Error('файл більший за 25 МБ');
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('не вдалося стиснути'))), 'image/webp', 0.82));
    if (blob.type !== 'image/webp') throw new Error('браузер не підтримує WebP');
    return { blob, preview: c.toDataURL('image/webp', 0.5) };
  }

  // ---------- масові ціни ----------
  function renderBulk() {
    const box = $('[data-bulk-cats]'); box.textContent = '';
    draft.cats.forEach(c => box.append(el('label', {}, [el('input', { type: 'checkbox', value: c.id }), c.short])));
    $('[data-bulk-result]').textContent = '';
  }
  $('[data-bulk-preview]').addEventListener('click', () => {
    const cats = $$('[data-bulk-cats] input:checked').map(x => x.value);
    const pct = Number($('[data-bulk-pct]').value);
    const step = Number($('[data-bulk-round]').value);
    const withOld = $('[data-bulk-old]').checked, withAddons = $('[data-bulk-addons]').checked;
    const out = $('[data-bulk-result]'); out.textContent = '';
    if (!cats.length) { toast('Оберіть хоча б один розділ', true); return; }
    if (!Number.isFinite(pct) || pct === 0 || pct < -90 || pct > 300) { toast('Відсоток від −90 до 300', true); return; }
    const f = x => (x === null || x === undefined ? x : Math.max(0, Math.round(x * (1 + pct / 100) / step) * step));
    const targets = draft.products.filter(p => p.cats.some(c => cats.includes(c)));
    const rows = targets.map(p => ({ p, before: p.price, after: p.variants.length ? Math.min(...p.variants.map(v => f(v.p)).filter(x => x !== null)) : f(p.price) }));
    const tb = el('tbody');
    rows.forEach(r => tb.append(el('tr', {}, [el('td', { text: r.p.name }), el('td', { text: money(r.before) }), el('td', { class: r.after > r.before ? 'up' : 'down', text: money(r.after) })])));
    out.append(el('div', { class: 'card' }, [
      el('p', { text: `Зміниться ${rows.length} товарів (усі довжини${withOld ? ', старі ціни' : ''}${withAddons ? ', опції' : ''}). Показано ціну «від».` }),
      el('div', { class: 'tbl' }, [el('table', { class: 'diff' }, [el('thead', {}, [el('tr', {}, [el('th', { text: 'Товар' }), el('th', { text: 'Було' }), el('th', { text: 'Стане' })])]), tb])]),
      el('div', { class: 'row' }, [el('button', { class: 'btn primary', type: 'button', text: `Застосувати до ${rows.length} товарів`, onclick: () => {
        targets.forEach(p => {
          if (p.variants.length) p.variants.forEach(v => { v.p = f(v.p); if (withOld) v.o = f(v.o); });
          else { p.price = f(p.price); if (withOld) p.old = f(p.old); }
          if (withAddons) p.addons.forEach(a => a.o.forEach(o => { o.p = f(o.p) ?? 0; }));
          recalc(p);
        });
        onChange(); renderList(); out.textContent = '';
        toast(`Ціни змінено в чернетці (${rows.length} товарів). Натисніть «Зберегти на сайт».`);
      } })])
    ]));
  });

  // ---------- налаштування сайту ----------
  const ytId = s => { const m = String(s).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/) || String(s).match(/^([\w-]{11})$/); return m ? m[1] : ''; };
  function renderSite() {
    const v = $('[data-video]'); v.value = draft.site.video ? `https://www.youtube.com/watch?v=${draft.site.video}` : '';
    const hint = $('[data-video-hint]');
    const upd = () => { const id = ytId(v.value); hint.textContent = !v.value ? 'Порожньо: блок відео на сайті буде приховано.' : id ? `Відео: ${id}` : 'Не схоже на посилання YouTube'; };
    v.oninput = () => { const id = ytId(v.value); if (id || !v.value) { draft.site.video = id; onChange(); } upd(); };
    upd();
    const f = $('[data-featured]'); f.textContent = '';
    f.append(el('option', { value: '', text: 'Без виділення' }));
    draft.cats.forEach(c => f.append(el('option', { value: c.id, text: c.title, selected: draft.site.featured === c.id })));
    f.onchange = () => { draft.site.featured = f.value; onChange(); };
    const ce = $('[data-cats-edit]'); ce.textContent = '';
    draft.cats.forEach(c => ce.append(el('div', { class: 'row' }, [
      field(`Назва (${c.id})`, el('input', { type: 'text', value: c.title, maxlength: 80, oninput: e => { c.title = e.target.value; onChange(); } })),
      field('Коротка назва (плашка)', el('input', { type: 'text', value: c.short, maxlength: 40, oninput: e => { c.short = e.target.value; onChange(); } }))
    ])));
  }

  // ---------- історія ----------
  async function loadHistory() {
    const ul = $('[data-history]'); ul.textContent = '';
    if (!kvOn) { ul.append(el('li', { text: 'Історія з’явиться після першого збереження.' })); return; }
    try {
      const { items } = await api('history');
      if (!items.length) { ul.append(el('li', { text: 'Попередніх версій ще немає.' })); return; }
      items.forEach(h => {
        const btn = el('button', { class: 'btn small', type: 'button', text: 'Відновити' });
        btn.addEventListener('click', async () => {
          if (btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; btn.textContent = 'Точно відновити?'; return; }
          if (changedIds().length || siteChanged()) { toast('Спершу збережіть або скасуйте поточні зміни', true); return; }
          try { const r = await api('rollback', { method: 'POST', body: JSON.stringify({ ver: h.ver, baseVer: ver }) }); accept(r); toast('Версію відновлено'); loadHistory(); }
          catch (e) { toast('Не вдалося: ' + e.message, true); }
        });
        ul.append(el('li', {}, [el('span', { class: 'when', text: new Date(h.at).toLocaleString('uk-UA') }), el('span', { class: 'who', text: h.by }), el('span', { class: 'note', text: h.note || '' }), btn]));
      });
    } catch (e) { ul.append(el('li', { text: 'Помилка: ' + e.message })); }
  }

  // ---------- збереження ----------
  function accept(r) {
    base = r.catalog; draft = clone(base); ver = r.ver; kvOn = true;
    store.del(DRAFT_KEY); renderFilters(); renderList(); if (current && byId(draft, current)) openEditor(current); onChange();
  }
  $('[data-publish]').addEventListener('click', async () => {
    const b = $('[data-publish]');
    const n = changedIds().length;
    if (draft.products.some(p => !p.hidden && !(p.price > 0))) { toast('У видимого товару немає ціни. Перевірте зміни.', true); return; }
    b.disabled = true; b.textContent = 'Зберігаю…';
    try {
      const r = await api('catalog', { method: 'PUT', body: JSON.stringify({ catalog: draft, baseVer: ver, note: `Змінено товарів: ${n}${siteChanged() ? ', налаштування сайту' : ''}` }) });
      accept(r); toast('Збережено. На сайті з’явиться протягом хвилини.');
    } catch (e) {
      toast(e.status === 409 ? 'Хтось щойно зберіг інші зміни. Оновіть сторінку.' : 'Не збережено: ' + e.message, true);
    } finally { b.textContent = 'Зберегти на сайт'; onChange(); }
  });
  $('[data-discard]').addEventListener('click', e => {
    const b = e.currentTarget;
    if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Точно скасувати?'; setTimeout(() => { b.dataset.confirm = ''; b.textContent = 'Скасувати зміни'; }, 4000); return; }
    b.dataset.confirm = ''; b.textContent = 'Скасувати зміни';
    draft = clone(base); store.del(DRAFT_KEY); renderFilters(); renderList(); if (current) openEditor(current); onChange();
  });
  addEventListener('beforeunload', e => { if (draft && (changedIds().length || siteChanged())) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- старт ----------
  (async () => {
    try {
      const r = await api('catalog');
      base = r.catalog; ver = r.ver; kvOn = r.kv;
      const saved = store.get(DRAFT_KEY);
      draft = saved && saved.ver === ver ? saved.draft : clone(base);
      if (saved && saved.ver !== ver) store.del(DRAFT_KEY);
      renderFilters(); renderList(); onChange();
      if (saved && saved.ver === ver) toast('Відновлено незбережені зміни з минулого разу');
      if (!kvOn) toast('Сховище KV не підключено: збереження недоступне', true);
    } catch (e) {
      $('[data-status]').textContent = e.status === 401 ? 'Немає доступу' : 'Помилка завантаження';
      $('[data-editor]').textContent = e.status === 401 ? 'Увійдіть через Cloudflare Access.' : 'Не вдалося завантажити каталог: ' + e.message;
    }
  })();
})();
