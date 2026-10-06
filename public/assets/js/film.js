/* Секція-фільм «Від заходу до вечора»: відео перемотується скролом (лише десктоп). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const smoothstep = (p, e0, e1) => { const t = clamp((p - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  const sec = $('.film');
  if (!sec) return;
  const stage = $('[data-film-stage]', sec);
  const video = $('#film');
  const posterLayer = $('.poster', stage);
  const posterEnd = $('.poster-end', stage);
  let ring = $('.ring', stage);
  const ringArc = $('[data-ring]', stage);
  const VIDEO_URL = 'assets/hero-scrub.mp4';
  const VIDEO_BYTES = 6708047;
  const POSTER = 'assets/hero-poster.jpg';
  const ENDING = 'assets/hero-ending.jpg';

  // розбивка заголовків на слова (лише textContent)
  sec.querySelectorAll('[data-split]').forEach(h => {
    const text = h.textContent.trim(); h.textContent = '';
    const sr = document.createElement('span'); sr.className = 'sr'; sr.textContent = text;
    const vis = document.createElement('span'); vis.setAttribute('aria-hidden', 'true');
    const words = text.split(/\s+/);
    words.forEach((w, i) => {
      const s = document.createElement('span'); s.className = 'w'; s.textContent = w;
      s.style.setProperty('--th', (i / words.length * 0.5).toFixed(3));
      vis.append(s); if (i < words.length - 1) vis.append(' ');
    });
    h.append(sr, vis);
  });

  const bands = [...stage.querySelectorAll('.band')].map(b => ({ el: b, a: +b.dataset.a, b: +b.dataset.b, op: -1, k: -1 }));
  const RAMP_VH = 20;
  const range = () => Math.max(1, sec.offsetHeight - innerHeight);
  const rampProg = () => Math.min(0.25, (RAMP_VH / 100 * innerHeight) / range());
  const progress = () => clamp(-sec.getBoundingClientRect().top / range(), 0, 1);

  let onScreen = false, scrubOn = false, target = 0, shown = 0, rafId = null, lastTick = 0, lastP = -1;

  function updateCaptions(p) {
    const rp = rampProg();
    bands.forEach((b, i) => {
      const f = Math.min(rp, (b.b - b.a) / 3);
      const inn = smoothstep(p, b.a, b.a + f);
      const out = i === bands.length - 1 ? 1 : 1 - smoothstep(p, b.b - f, b.b);
      const op = inn * out;
      const k = clamp((p - b.a) / Math.min(rp, (b.b - b.a) * 0.35), 0, 1);
      if (Math.abs(op - b.op) > 0.004 || (op === 0) !== (b.op === 0)) { b.op = op; b.el.style.opacity = op.toFixed(3); b.el.style.visibility = op < 0.01 ? 'hidden' : 'visible'; }
      if (Math.abs(k - b.k) > 0.008 || (k === 1) !== (b.k === 1)) { b.k = k; b.el.style.setProperty('--k', k.toFixed(3)); }
    });
    if (Math.abs(p - lastP) > 0.005) { lastP = p; stage.style.setProperty('--p', p.toFixed(3)); }
  }

  // завантаження відео як Blob з чесним кільцем прогресу
  let started = false;
  function startBlobFetch() { if (started) return; started = true; loadBlob().catch(failVideo); }
  async function loadBlob() {
    if (location.protocol === 'file:') throw new Error('file protocol');
    const ctrl = new AbortController();
    let watchdog = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(VIDEO_URL, { priority: 'low', signal: ctrl.signal });
    if (!res.ok || !res.body) throw new Error('video ' + res.status);
    const total = Number(res.headers.get('Content-Length')) || VIDEO_BYTES;
    const reader = res.body.getReader();
    const chunks = []; let got = 0, lastRing = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(watchdog); watchdog = setTimeout(() => ctrl.abort(), 20000);
      chunks.push(value); got += value.length;
      const now = performance.now();
      if (ringArc && now - lastRing > 100) { lastRing = now; ringArc.style.strokeDashoffset = String(Math.round(126 * (1 - Math.min(1, got / total)))); }
    }
    clearTimeout(watchdog);
    if (ringArc) ringArc.style.strokeDashoffset = '0';
    video.src = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
    video.load();
    video.addEventListener('canplay', () => { requestSeek(progress() * video.duration); stage.classList.add('video-ready'); }, { once: true });
  }
  function failVideo() {
    if (ring) { ring.remove(); ring = null; }
    posterEnd.style.backgroundImage = "url('" + ENDING + "')";
    stage.classList.add('video-failed');
  }
  video.addEventListener('error', () => { clearTimeout(seekTimer); seekBusy = false; pendingTime = null; if (started) failVideo(); });

  let inited = false;
  function initOnce() {
    if (inited) return; inited = true;
    posterLayer.style.backgroundImage = "url('" + POSTER + "')";
    const img = new Image(); img.onload = startBlobFetch; img.onerror = startBlobFetch; img.src = POSTER;
    setTimeout(startBlobFetch, 4000);
  }

  // шлюз перемотки без дедлоків
  let seekBusy = false, pendingTime = null, seekTimer = null;
  const SEEK_EPS = 0.001, SEEK_TIMEOUT = 300;
  function releaseSeek() { clearTimeout(seekTimer); seekBusy = false; if (pendingTime !== null) { const t = pendingTime; pendingTime = null; requestSeek(t); } }
  function requestSeek(t) {
    if (!video.duration) return;
    t = Math.min(video.duration - 0.001, Math.max(0, t));
    if (seekBusy) { pendingTime = t; return; }
    if (Math.abs(video.currentTime - t) < SEEK_EPS) return;
    seekBusy = true; clearTimeout(seekTimer); seekTimer = setTimeout(releaseSeek, SEEK_TIMEOUT);
    video.currentTime = t;
  }
  video.addEventListener('seeked', releaseSeek);

  function tick(now) {
    const dt = Math.min(100, lastTick ? now - lastTick : 16.667); lastTick = now;
    shown += (target - shown) * (1 - Math.pow(1 - 0.16, dt / 16.667));
    if (Math.abs(target - shown) < 0.0005) { shown = target; rafId = null; lastTick = 0; } else rafId = requestAnimationFrame(tick);
    if (video.duration) requestSeek(shown * video.duration);
    updateCaptions(shown);
  }
  function onScroll() { target = progress(); if (rafId === null && onScreen) rafId = requestAnimationFrame(tick); }

  // відео вантажимо, лише коли секція наближається (не з'їдає трафік на старті)
  new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    if (onScreen && scrubOn) { initOnce(); onScroll(); }
  }, { rootMargin: '150% 0px' }).observe(sec);

  const GATES = ['(max-width: 720px)', '(orientation: portrait) and (max-width: 1024px)', '(orientation: portrait) and (pointer: coarse)', '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)', '(prefers-reduced-motion: reduce)'];
  function enable() { if (scrubOn) return; scrubOn = true; addEventListener('scroll', onScroll, { passive: true }); bands.forEach(b => { b.op = -1; b.k = -1; }); if (onScreen) initOnce(); updateCaptions(progress()); onScroll(); }
  function disable() { if (!scrubOn) return; scrubOn = false; removeEventListener('scroll', onScroll); if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; } }
  const apply = () => (GATES.some(q => matchMedia(q).matches) ? disable() : enable());
  GATES.forEach(q => matchMedia(q).addEventListener('change', apply));
  addEventListener('resize', () => { bands.forEach(b => { b.op = -1; b.k = -1; }); if (scrubOn) { updateCaptions(shown); onScroll(); } }, { passive: true });
  apply();
})();
