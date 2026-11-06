'use strict';
/* SaveHer: shared helpers (escaping templates, icons, API, location, live-tracking manager) */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
class Raw { constructor(s) { this.s = s; } }
const raw = s => new Raw(s);
// html`...` escapes every interpolated value unless it is wrapped in raw() or is a nested html`` result
const html = (strs, ...vals) => new Raw(strs.reduce((o, s, i) => o + s + (i < vals.length ? (Array.isArray(vals[i]) ? vals[i].map(v => v instanceof Raw ? v.s : esc(v)).join('') : vals[i] instanceof Raw ? vals[i].s : esc(vals[i])) : ''), ''));
const mount = (el, tpl) => { el.innerHTML = tpl instanceof Raw ? tpl.s : esc(tpl); };

const ICONS = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0', support: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', check: 'M5 12.5l4.5 4.5L19 7.5',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2', send: 'M21 3L10 14M21 3l-7 18-4-7-7-4z',
  nav: 'M3 11l18-8-8 18-2-8z', pin: 'M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M9 7h6', warn: 'M12 3l10 18H2zM12 10v5M12 18v.5', cam: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  x: 'M6 6l12 12M18 6L6 18', chev: 'M9 6l6 6-6 6', arrow: 'M5 12h14M13 6l6 6-6 6', gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 .8-1.5-1L15 4h-4l-.5 2.8-1.5 1-2-.8-2 4 2 1v2l-2 1 2 4 2-.8 1.5 1L11 20h4l.5-2.8 1.5-1 2 .8 2-4-2-1z',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M17 11a3 3 0 1 0 0-6M18 14.5c2.5.4 4 2 4 5', heart: 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', share: 'M4 12v8h16v-8M12 3v13M7 8l5-5 5 5', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM6 6l12 12',
  more: 'M6 12h.01M12 12h.01M18 12h.01', plus: 'M12 5v14M5 12h14', crown: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z', siren: 'M6 18v-6a6 6 0 0 1 12 0v6M4 18h16M12 3v2M4.5 6l1.5 1.5M19.5 6L18 7.5', msg: 'M4 5h16v11H9l-5 4z',
};
const icon = (n, extra = '') => raw(`<svg class="i ${extra}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n] || ''}"/></svg>`);

const LOGO = (size = 72) => raw(`<svg width="${size}" height="${size * 1.12}" viewBox="0 0 64 72" role="img" aria-label="SaveHer logo"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6bc1"/><stop offset="1" stop-color="#9b3bff"/></linearGradient></defs>
<path d="M32 4L58 14v20c0 18-12 30-26 36C18 64 6 52 6 34V14z" fill="rgba(255,46,154,.12)" stroke="url(#lg)" stroke-width="3.5" stroke-linejoin="round"/>
<path d="M40 22c-4-4-12-3-15 3-2 4-1 8 1 11-3 1-5 4-5 8" fill="none" stroke="url(#lg)" stroke-width="3" stroke-linecap="round"/>
<rect x="24" y="36" width="16" height="12" rx="2.5" fill="url(#lg)"/><path d="M27 36v-3a5 5 0 0 1 10 0v3" fill="none" stroke="url(#lg)" stroke-width="3"/></svg>`);
const SKY = (() => { // deterministic skyline that always spans the full width
  let x = 0, i = 0, d = 'M0 90V';
  const H = [34, 52, 28, 60, 40, 72, 30, 48, 64, 36, 56, 26, 44, 68, 32, 50, 38, 58, 30, 46];
  const rects = []; while (x < 400) { const w = 14 + (i * 7) % 13, h = H[i % H.length]; rects.push(`<rect x="${x}" y="${90 - h}" width="${w + 1}" height="${h}"/>`); if (h > 55) rects.push(`<rect x="${x + w / 2 - 1}" y="${90 - h - 10}" width="2" height="10"/>`); x += w; i++; }
  return raw(`<svg class="sky" viewBox="0 0 400 90" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b13cff" stop-opacity=".8"/><stop offset="1" stop-color="#1a0732"/></linearGradient></defs><g fill="url(#sk)">${rects.join('')}</g></svg>`);
})();

// ---------- misc helpers ----------
let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200); }
function ago(ms) {
  if (!ms) return '';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`;
}
const clock = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const hms = s => [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, '0')).join(':');
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };
const store = { get: (k, d = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }, del: k => { try { localStorage.removeItem(k); } catch {} } };

// Base map. If the street tiles cannot load (offline, blocked network) say so instead of showing an unexplained blank map.
function baseTiles(map, el) {
  let ok = 0, bad = 0, shown = false;
  const layer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
  layer.on('tileload', () => { ok++; });
  layer.on('tileerror', () => {
    bad++; if (shown || ok > 0 || bad < 2 || !el || !el.parentElement) return; shown = true;
    const n = document.createElement('div'); n.className = 'mapnote'; n.setAttribute('role', 'status');
    n.textContent = 'The street map could not load. Check your internet connection. Shaded areas and pins still work.'; el.parentElement.append(n);
  });
  return layer;
}

// ---------- API ----------
const S = { user: null, cfg: { smsMode: 'manual', demo: false }, contacts: store.get('sh_contacts', []), geo: 'unknown', pos: store.get('sh_pos') };
async function api(method, url, body) {
  let res;
  try { res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' }); }
  catch { throw Object.assign(new Error('You appear to be offline. If you are in danger, call 112.'), { offline: true }); }
  let data = null; try { data = await res.json(); } catch {}
  if (res.status === 401 && S.user) { S.user = null; location.hash = '#/welcome'; }
  if (!res.ok) throw Object.assign(new Error((data && data.error) || 'Something went wrong.'), { status: res.status });
  return data;
}

// ---------- location ----------
function getPos({ timeout = 10000, maxAge = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { S.geo = 'unsupported'; return reject(new Error('This device does not support location.')); }
    navigator.geolocation.getCurrentPosition(p => {
      S.geo = 'granted'; S.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() };
      store.set('sh_pos', S.pos); resolve(S.pos);
    }, e => { if (e.code === 1) S.geo = 'denied'; reject(new Error(e.code === 1 ? 'Location is turned off for SaveHer. Turn it on in your browser settings.' : 'Could not find your location. Try again outdoors or with a clearer signal.')); },
    { enableHighAccuracy: true, timeout, maximumAge: maxAge });
  });
}
async function checkPermission() {
  try { const p = await navigator.permissions.query({ name: 'geolocation' }); S.geo = p.state === 'granted' ? 'granted' : p.state === 'denied' ? 'denied' : 'unknown'; p.onchange = () => { S.geo = p.state; }; } catch {}
}
const mapsLink = p => `https://maps.google.com/?q=${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

// ---------- live tracking manager (lives across screens) ----------
const Track = {
  t: null, watch: null, wake: null, lastSent: 0, listeners: new Set(),
  attach(t) { // t = {token,url,startedAt,kind}
    this.stop(true); this.t = { startedAt: Date.now(), ...t }; store.set('sh_track', this.t);
    this.watch = navigator.geolocation && navigator.geolocation.watchPosition(p => this.onPos(p), () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    this.iv = setInterval(() => { if (S.pos && Date.now() - this.lastSent > 15000) this.send(S.pos); }, 15000);
    navigator.wakeLock && navigator.wakeLock.request('screen').then(w => { this.wake = w; }).catch(() => {});
    this.emit();
  },
  onPos(p) {
    S.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() }; S.geo = 'granted';
    if (Date.now() - this.lastSent > 8000) this.send(S.pos); this.emit();
  },
  async send(p) {
    if (!this.t) return; this.lastSent = Date.now();
    try { await api('POST', `/api/track/${this.t.token}/ping`, { lat: p.lat, lng: p.lng, accuracy: p.acc }); this.t.failing = false; }
    catch (e) { if (e.status === 410) this.stop(true); else this.t && (this.t.failing = true); }
    this.emit();
  },
  async resume() {
    const saved = store.get('sh_track'); if (!saved || this.t) return;
    try { const r = await api('GET', '/api/track/mine/active'); if (r.track && r.track.token === saved.token) this.attach({ token: r.track.token, url: r.track.url, kind: r.track.kind, startedAt: r.track.started_at }); else store.del('sh_track'); } catch {}
  },
  async end() { const t = this.t; if (t) { try { await api('POST', `/api/track/${t.token}/stop`); } catch {} } this.stop(true); },
  stop() {
    if (this.watch != null) navigator.geolocation.clearWatch(this.watch); clearInterval(this.iv);
    this.wake && this.wake.release().catch(() => {}); this.watch = this.wake = null; this.t = null; store.del('sh_track'); this.emit();
  },
  emit() { this.listeners.forEach(f => f()); },
};
document.addEventListener('visibilitychange', async () => { // wake locks are released when the tab is hidden
  if (document.visibilityState === 'visible' && Track.t && navigator.wakeLock) navigator.wakeLock.request('screen').then(w => { Track.wake = w; }).catch(() => {});
});

// ---------- press-and-hold (SOS) ----------
function holdToActivate(el, { ms = 3000, onProgress, onDone }) {
  let start = 0, raf = 0, done = false, down = false;
  const frame = () => { const p = Math.min(1, (performance.now() - start) / ms); onProgress(p); if (p >= 1) { done = true; down = false; buzz([120, 60, 220]); onDone(); } else raf = requestAnimationFrame(frame); };
  const begin = () => { if (down || done) return; down = true; start = performance.now(); buzz(25); el.classList.add('holding'); raf = requestAnimationFrame(frame); };
  const cancel = () => { if (!down) return; down = false; cancelAnimationFrame(raf); onProgress(0); el.classList.remove('holding'); };
  el.addEventListener('pointerdown', e => { e.preventDefault(); begin(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, cancel));
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); begin(); } });
  el.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') cancel(); });
  el.addEventListener('blur', cancel);
}

// ---------- SOS ----------
const SOS = {
  state: null, // {id, url, notified} | {error, smsLink}
  async trigger() {
    if (this.busy) return; this.busy = true; this.state = { pending: true }; location.hash = '#/sos'; window.dispatchEvent(new Event('sos-update'));
    let pos = null; try { pos = await getPos({ timeout: 6000, maxAge: 60000 }); } catch { pos = S.pos && Date.now() - S.pos.at < 15 * 60000 ? S.pos : null; }
    try {
      const r = await api('POST', '/api/sos', pos ? { lat: pos.lat, lng: pos.lng } : {});
      this.state = { id: r.id, url: r.url, notified: r.notified, noPos: !pos };
      Track.attach({ token: r.token, url: r.url, kind: 'sos' });
    } catch (e) { // offline or server down: still help her reach people from her own phone
      const numbers = S.contacts.map(c => c.phone).join(',');
      const body = `I need help. ${S.user ? S.user.name : ''} pressed SOS in SaveHer.${pos ? ' My location: ' + mapsLink(pos) : ''}`;
      this.state = { error: e.message, smsLink: numbers ? `sms:${numbers}?&body=${encodeURIComponent(body)}` : null };
    }
    this.busy = false; window.dispatchEvent(new Event('sos-update'));
  },
  async end(reason) {
    const s = this.state; if (!s || !s.id) { this.state = null; return; }
    try { await api('POST', `/api/sos/${s.id}/end`, { reason }); } catch {}
    Track.stop(true); this.state = null; window.dispatchEvent(new Event('sos-update'));
  },
};
