'use strict';
/* SaveHer: screens and router */
const PUBLIC = ['welcome', 'signin', 'signup'];
const TABS = [['home', 'Home', 'home'], ['map', 'Map', 'map'], ['alerts', 'Alerts', 'bell'], ['support', 'Support', 'support'], ['profile', 'Profile', 'user']];
const SIDE = [['home', 'Dashboard', 'home'], ['map', 'Map', 'map'], ['alerts', 'Alerts', 'bell'], ['report', 'Reports', 'book'], ['tips', 'Safety Tips', 'shield'], ['support', 'Support', 'support'], ['profile', 'Settings', 'gear']];
const JHB = [-26.2041, 28.0473];
let badge = 0, ctx = { cleanup: [] };
const first = () => (S.user ? S.user.name.split(' ')[0] : '');
const levelWord = l => l === 'High' ? 'Risk' : l === 'Elevated' ? 'Caution' : 'No alerts';
const errBox = () => raw('<p class="err" role="alert" aria-live="polite"></p>');
const setErr = (v, m) => { const e = $('.err', v); if (e) e.textContent = m || ''; };
const busy = (btn, on, label) => { btn.disabled = on; if (label) btn.dataset.l = btn.dataset.l || btn.innerHTML; btn.innerHTML = on ? 'Please wait…' : (btn.dataset.l || btn.innerHTML); };
const ARROW_L = raw(icon('arrow').s.replace('class="i ', 'style="transform:scaleX(-1)" class="i '));
const back = (title, to = '#/home') => html`<div class="top"><a class="iconbtn" href="${to}" aria-label="Back">${ARROW_L}</a><h1>${title}</h1></div>`;

function shell() {
  const on = location.hash.replace('#/', '').split('?')[0] || 'home';
  const signed = !!S.user && !PUBLIC.includes(on);
  $('#app').classList.toggle('bare', !signed); // signed-out screens are one centred column, with no sidebar column reserved
  $('#side').style.display = signed ? '' : 'none'; $('#tabs').style.display = signed ? '' : 'none';
  if (!signed) return;
  const b = badge ? raw(`<span class="badge" aria-label="${badge} alerts">${badge}</span>`) : '';
  mount($('#side'), html`<div class="brand">${LOGO(30)} SaveHer</div>${SIDE.map(([r, l, i]) => html`<a class="nav ${r === on ? 'on' : ''}" href="#/${r}" ${r === on ? raw('aria-current="page"') : ''}>${icon(i)} ${l}${r === 'alerts' && badge ? html` <span class="badge" style="position:static;margin-left:auto">${badge}</span>` : ''}</a>`)}
    <a class="help" href="#/support">${icon('support')}<span><b>Need help?</b><br><span class="small mute">Helplines and contacts</span></span></a>`);
  mount($('#tabs'), html`${TABS.map(([r, l, i]) => html`<a href="#/${r}" class="${r === on ? 'on' : ''}" ${r === on ? raw('aria-current="page"') : ''}>${icon(i)}${l}${r === 'alerts' ? b : ''}</a>`)}`);
}

// If location is already allowed but the first GPS fix has not landed yet, wait for it and redraw once instead of leaving a "turn on location" prompt
function autoLocate(alive, redraw) {
  if (S.pos || S.geo !== 'granted' || ctx.located) return;
  ctx.located = true; getPos({ timeout: 10000, maxAge: 60000 }).then(() => alive() && redraw()).catch(() => {});
}
async function loadAreaData() { // status + alerts for the current position (null if no position)
  if (!S.pos) return null;
  const q = `lat=${S.pos.lat}&lng=${S.pos.lng}`;
  const [st, al] = await Promise.all([api('GET', `/api/status?${q}`), api('GET', `/api/alerts?${q}`)]);
  badge = st.alertsNearby; shell(); return { status: st.status, alerts: al.alerts };
}
const locBanner = () => html`<div class="banner">${icon('pin')}<div class="grow"><b>Turn on location</b><br><span class="small">SaveHer checks your area and shares your location in an emergency.</span></div><button class="btn small" id="enloc">Allow</button></div>`;
function wireLoc(view, redraw) {
  const b = $('#enloc', view); if (!b) return;
  b.onclick = async () => { b.disabled = true; try { await getPos(); redraw(); } catch (e) { toast(e.message); b.disabled = false; } };
}

// ---------------- welcome / auth ----------------
const welcome = view => mount(view, html`<div class="welcome">${LOGO(130)}<h1>Save<span>Her</span></h1><p><b>Safe. Alert. Empowered.</b></p><p class="mute">Your safety,<br>our priority.</p>${SKY}
  <div class="stack" style="width:100%"><a class="btn block" href="#/signup">Get Started ${icon('arrow')}</a><a class="btn glass block" href="#/signin">Sign In</a></div></div>`);

function authScreen(view, mode) {
  const up = mode === 'signup';
  mount(view, html`<div class="stack" style="padding-top:20px"><div class="center">${LOGO(64)}<h2 style="margin-top:8px;font-size:24px">${up ? 'Create your account' : 'Welcome back'}</h2><p class="mute">${up ? 'It takes a minute. Your details stay private.' : 'Sign in to SaveHer'}</p></div>
  <form class="auth" novalidate>
    ${up ? html`<label class="f">Your name<input name="name" autocomplete="name" required></label>` : ''}
    <label class="f">Email<input name="email" type="email" autocomplete="email" inputmode="email" required></label>
    ${up ? html`<label class="f">Mobile number (optional)<input name="phone" type="tel" autocomplete="tel" placeholder="082 123 4567"></label>` : ''}
    <label class="f">Password${up ? ' (8+ characters)' : ''}<input name="password" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" required></label>
    ${errBox()}<button class="btn block">${up ? 'Create account' : 'Sign in'}</button></form>
  <p class="center mute">${up ? html`Already have an account? <a class="tl" href="#/signin"><b>Sign in</b></a>` : html`New here? <a class="tl" href="#/signup"><b>Create an account</b></a>`}</p></div>`);
  $('form', view).onsubmit = async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const btn = $('button', e.target); setErr(view); busy(btn, true, 1);
    try { const r = await api('POST', `/api/auth/${up ? 'register' : 'login'}`, f); S.user = r.user; await afterLogin(); location.hash = up ? '#/support?welcome=1' : '#/home'; }
    catch (er) { setErr(view, er.message); busy(btn, false); }
  };
}
async function afterLogin() {
  try { S.contacts = (await api('GET', '/api/contacts')).contacts; store.set('sh_contacts', S.contacts); } catch {}
  Track.resume(); await checkPermission();
  if (S.geo === 'granted') getPos({ timeout: 8000, maxAge: 60000 }).catch(() => {}); // only if she already allowed it; never prompts unasked
}

// ---------------- home ----------------
async function home(view) {
  const my = ctx, alive = () => ctx === my; // late async results must never paint over a screen she has moved on from
  view.className = 'home';
  let data = null, loading = !!S.pos, err = '';
  const draw = () => {
    if (!alive()) return;
    const st = data && data.status, lvl = st ? st.level : 'none', alerts = data ? data.alerts : [];
    const noPos = !S.pos;
    mount(view, html`
      <div class="top mobile-top"><div class="grow"><h1>Hello, ${first()} 👋</h1><p class="mute small">${noPos ? 'Location is off' : loading ? 'Checking your area…' : st ? st.label : ''}</p></div>
        <a class="iconbtn" href="#/alerts" aria-label="Alerts, ${badge} nearby">${icon('bell')}${badge ? html`<span class="badge" style="top:-2px;right:-2px">${badge}</span>` : ''}</a></div>
      <section class="hero"><div><h1>Your safety.<br><span>Our priority.</span></h1><p class="mute" style="margin-bottom:16px">Stay informed. Stay protected.</p><a class="btn" href="#/tips">Explore Safety Tips ${icon('arrow')}</a></div>${SKY}</section>
      ${noPos ? locBanner() : ''}
      ${S.contacts.length === 0 ? html`<a class="banner" href="#/support" style="text-decoration:none">${icon('users')}<div class="grow"><b>Add a trusted contact</b><br><span class="small">SOS needs someone to alert. Add at least one person.</span></div>${icon('chev')}</a>` : ''}
      ${S.cfg.demo ? html`<div class="banner demo">${icon('warn')}<span class="small"><b>Demo data.</b> The reports on the map and in alerts are sample data for Johannesburg, not real incidents.</span></div>` : ''}
      <a class="status ${lvl}" href="#/map"><span class="ic">${icon(lvl === 'none' ? 'shield' : lvl === 'Low' ? 'check' : 'warn')}</span><span class="grow"><b>Safety Status: ${loading ? 'Checking…' : st ? st.label : 'Unknown'}</b><p>${err || (st ? st.detail : noPos ? 'Turn on location to see your area.' : '')}</p></span>${icon('chev')}</a>
      <div class="stats">
        <a class="card" href="#/support" style="text-decoration:none"><p class="mute small">Trusted contacts</p><h2>${S.contacts.length ? S.contacts.length + (S.contacts.length === 1 ? ' person' : ' people') : 'None yet'}</h2></a>
        <div class="card"><p class="mute small">Recent alerts</p><h2>${data ? alerts.length : '…'} nearby</h2></div>
        <div class="card"><p class="mute small">Community</p><h2 id="cstat">…</h2></div></div>
      <div class="tiles col-l">
        <div class="tile sos" id="sostile" role="button" tabindex="0" aria-label="SOS. Press and hold for 3 seconds to send an emergency alert."><span class="fill"></span>${icon('siren')}<b style="font-size:22px">SOS</b><span class="small">Hold for 3s</span></div>
        <a class="tile link-tile t-pin" href="#/track">${icon('pin')}<b>Share Location</b></a>
        <a class="tile link-tile t-shield" href="#/report">${icon('shield')}<b>Report Incident</b></a>
        <a class="tile link-tile t-book" href="#/tips">${icon('book')}<b>Safety Tips</b></a></div>
      <div class="card col-r"><div class="row" style="margin-bottom:6px"><h2 class="grow">Latest Alerts</h2><a class="small mute tl" href="#/alerts">View All</a></div>
        ${loading ? raw('<div class="spin"></div>') : alerts.length ? alerts.slice(0, 3).map(a => html`<a href="#/alerts" class="alert-row" style="text-decoration:none"><span class="ic ${a.level}">${icon('warn')}</span><span class="grow"><b>${a.title}</b><br><span class="small mute">${ago(a.at)}</span></span>${icon('chev')}</a>`) : html`<p class="empty">No alerts near you right now.</p>`}</div>`);
    wireLoc(view, async () => { loading = true; draw(); await refresh(); });
    const tile = $('#sostile', view), fill = $('.fill', tile);
    holdToActivate(tile, { onProgress: p => { fill.style.height = p * 100 + '%'; }, onDone: () => { fill.style.height = 0; SOS.trigger(); } });
  };
  const refresh = async () => { try { data = await loadAreaData(); } catch (e) { err = e.message; } loading = false; draw(); };
  autoLocate(alive, () => { loading = true; draw(); refresh(); });
  draw(); refresh();
  api('GET', '/api/community').then(c => { if (!alive()) return; const e = $('#cstat', view); if (e) e.textContent = `${c.members} members · ${c.reportsWeek} reports this week`; }).catch(() => {});
}

// ---------------- SOS ----------------
function sosScreen(view) {
  const draw = () => {
    const s = SOS.state;
    if (s && s.pending) return mount(view, html`${back('Emergency SOS')}<div class="empty"><div class="spin"></div><p>Sending your alert and location…</p></div><a class="btn danger block" href="tel:112">${icon('phone')} Call 112 now</a>`);
    if (s && s.error) {
      mount(view, html`${back('Emergency SOS')}<div class="sent warn"><b>We could not reach SaveHer’s server</b><p>${s.error}</p></div><div class="qa"><a class="btn danger" href="tel:112">${icon('phone')} Call 112</a><a class="btn glass" href="tel:10111">${icon('phone')} Call police 10111</a>${s.smsLink ? html`<a class="btn" href="${s.smsLink}">${icon('send')} Text my trusted contacts</a>` : ''}<button class="btn ghost" id="retry">Try SOS again</button></div>`);
      $('#retry', view).onclick = () => { SOS.state = null; SOS.trigger(); };
      return;
    }
    if (s && s.id) {
      const n = s.notified, all = n.mode === 'twilio' && n.sent === n.total && n.total > 0, none = n.total === 0;
      mount(view, html`${back('Emergency SOS')}
        <div class="sent ${all ? '' : 'warn'}"><div class="row">${icon(all ? 'check' : 'warn')}<b style="font-size:18px">SOS is active</b></div>
          <p style="margin-top:6px">${none ? 'You have no trusted contacts yet, so nobody was alerted. Call 112 now.' : all ? `Your ${n.total} trusted contact${n.total > 1 ? 's were' : ' was'} texted your live location.` : n.mode === 'twilio' ? `${n.sent} of ${n.total} contacts were texted. Send the rest yourself below.` : 'Your contacts have not been alerted yet. Tap the button below to text them your live link.'}</p>
          ${s.noPos ? html`<p class="small" style="margin-top:6px">We could not get a GPS fix. Your location will update as soon as your phone finds it.</p>` : ''}</div>
        <div class="qa"><a class="btn danger" href="tel:112">${icon('phone')} Call 112</a><a class="btn glass" href="tel:10111">${icon('phone')} Call police 10111</a>
          ${n.smsLink ? html`<a class="btn" href="${n.smsLink}">${icon('send')} Text my contacts now</a>` : ''}
          <button class="btn glass" id="sharelink">${icon('share')} Share live link</button></div>
        <div class="card row">${icon('nav')}<div class="grow"><b>Sharing live location</b><p class="small mute" id="sosfresh">${Track.t && Track.t.failing ? 'Trying to reconnect…' : 'Updating every few seconds. Keep this screen open if you can.'}</p></div></div>
        <div class="row"><button class="btn glass grow" id="safe">I’m safe now</button><button class="btn ghost grow" id="false">False alarm</button></div>`);
      $('#sharelink', view).onclick = () => shareLink(s.url);
      $('#safe', view).onclick = () => SOS.end('safe').then(() => { toast('Your contacts were told you are safe.'); location.hash = '#/home'; });
      $('#false', view).onclick = () => SOS.end('false_alarm').then(() => { toast('Cancelled. Your contacts were told it was a false alarm.'); location.hash = '#/home'; });
      return;
    }
    mount(view, html`${back('Emergency SOS')}
      <p class="center mute">Press and hold for 3 seconds. Your trusted contacts get a text with your live location.</p>
      <button class="sosbtn" id="sos" aria-label="SOS. Press and hold for 3 seconds."><svg class="ring" viewBox="0 0 256 256" aria-hidden="true"><circle cx="128" cy="128" r="118" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-dasharray="741.4" stroke-dashoffset="741.4" id="ringp"/></svg>
        <span class="lbl">${icon('siren')}<b>SOS</b><span class="small">Hold for 3 seconds</span></span></button>
      ${S.contacts.length === 0 ? html`<a class="banner" href="#/support" style="text-decoration:none">${icon('users')}<span class="small"><b>No trusted contacts yet.</b> Add someone so SOS can alert them.</span></a>` : ''}
      <p class="center">Or use quick actions:</p>
      <div class="qa"><a class="btn glass" href="tel:112">${icon('phone')} Call 112</a><button class="btn glass" id="qalert">${icon('msg')} Send Alert</button><a class="btn glass" href="#/track">${icon('nav')} Start Live Tracking</a><a class="btn ghost" href="#/home" style="justify-content:center">Cancel</a></div>
      <p class="small mute center">Works best with location on. If you cannot use the app, dial 112 from any phone.</p>`);
    const b = $('#sos', view), ring = $('#ringp', view);
    holdToActivate(b, { onProgress: p => { ring.style.strokeDashoffset = 741.4 * (1 - p); }, onDone: () => SOS.trigger() });
    $('#qalert', view).onclick = async e => {
      if (!S.contacts.length) { toast('Add a trusted contact first.'); location.hash = '#/support'; return; }
      e.target.disabled = true;
      try { const p = await getPos().catch(() => null); const r = await api('POST', '/api/notify', p ? { lat: p.lat, lng: p.lng } : {});
        if (r.notified.mode === 'manual' && r.notified.smsLink) location.href = r.notified.smsLink; else toast(`Alert sent to ${r.notified.sent} contact${r.notified.sent === 1 ? '' : 's'}.`);
      } catch (er) { toast(er.message); } e.target.disabled = false;
    };
  };
  const h = () => { if (ctx.name === 'sos') draw(); };
  window.addEventListener('sos-update', h); ctx.cleanup.push(() => window.removeEventListener('sos-update', h));
  const t = setInterval(() => { const e = $('#sosfresh'); if (e && Track.t) e.textContent = Track.t.failing ? 'Trying to reconnect…' : `Last update ${S.pos ? ago(S.pos.at) : 'pending'}. Keep this screen open if you can.`; }, 4000);
  ctx.cleanup.push(() => clearInterval(t));
  draw();
}
async function shareLink(url) {
  try { if (navigator.share) return await navigator.share({ title: 'My live location', text: 'Follow my live location on SaveHer:', url }); } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); toast('Link copied.'); } catch { prompt('Copy this link:', url); }
}

// ---------------- map ----------------
const COLORS = { Safe: '#22c55e', Caution: '#ff9f1c', Risk: '#ff3b5c' };
async function safePlaces(lat, lng) { // police stations and hospitals from OpenStreetMap
  const key = `sh_places_${lat.toFixed(2)}_${lng.toFixed(2)}`, c = store.get(key);
  if (c && Date.now() - c.at < 36e5) return c.items;
  const q = `[out:json][timeout:12];(nwr["amenity"="police"](around:3500,${lat},${lng});nwr["amenity"="hospital"](around:3500,${lat},${lng}););out center 40;`;
  const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!r.ok) throw new Error('places');
  const items = (await r.json()).elements.map(e => ({ lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon, name: (e.tags && e.tags.name) || (e.tags.amenity === 'police' ? 'Police station' : 'Hospital'), kind: e.tags.amenity })).filter(p => p.lat != null);
  store.set(key, { at: Date.now(), items }); return items;
}
const pinIcon = (color, name) => L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15], html: `<div class="pin" style="background:${color}">${icon(name).s}</div>` });
async function mapScreen(view) {
  const my = ctx, alive = () => ctx === my; // late async results must never paint over a screen she has moved on from
  autoLocate(alive, () => mapScreen(view));
  const pos = S.pos, c = pos ? [pos.lat, pos.lng] : JHB;
  let status = null;
  mount(view, html`<div class="top"><h1>Safety Map</h1><button class="iconbtn" id="loc" aria-label="Centre on my location">${icon('nav')}</button></div>
    <div class="legend" role="group" aria-label="Map layers">${Object.keys(COLORS).map(k => html`<button class="chip" aria-pressed="true" data-k="${k}"><span class="dot" style="background:${COLORS[k]}"></span>${k}</button>`)}</div>
    ${pos ? '' : locBanner()}
    <div class="mapwrap"><div id="map" role="application" aria-label="Map of nearby safety reports"></div></div>
    <div class="status none" id="areacard"><span class="ic">${icon('shield')}</span><span class="grow"><b>Checking area…</b></span></div>
    <p class="small mute">Shaded areas show patterns in community reports, not exact incident locations. Green pins are police stations and hospitals from OpenStreetMap. No shading does not mean an area is safe.</p>`);
  wireLoc(view, () => mapScreen(view));
  const map = L.map('map', { attributionControl: false }).setView(c, 14); L.control.attribution({ prefix: false }).addTo(map); ctx.cleanup.push(() => map.remove());
  baseTiles(map, $('#map'));
  setTimeout(() => map.invalidateSize(), 50);
  const groups = { Safe: L.layerGroup().addTo(map), Caution: L.layerGroup().addTo(map), Risk: L.layerGroup().addTo(map) };
  if (pos) { L.marker(c, { icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), keyboard: false }).addTo(map); }
  $$('.chip', view).forEach(b => b.onclick = () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); on ? groups[b.dataset.k].addTo(map) : map.removeLayer(groups[b.dataset.k]); });
  $('#loc', view).onclick = async () => { try { const p = await getPos(); map.setView([p.lat, p.lng], 15); } catch (e) { toast(e.message); } };
  const popup = (t, s) => { const d = document.createElement('div'); const b = document.createElement('b'); b.textContent = t; d.append(b); if (s) { d.append(document.createElement('br')); d.append(s); } return d; };
  try {
    const m = await api('GET', `/api/map?lat=${c[0]}&lng=${c[1]}`); if (!alive()) return;
    for (const z of m.cells) {
      if (z.level === 'Low' && !z.alert) continue; const g = z.level === 'High' ? 'Risk' : 'Caution', col = COLORS[g];
      L.rectangle(z.bounds, { color: col, weight: 1.5, fillColor: col, fillOpacity: .22 }).addTo(groups[g]);
      if (z.alert) L.marker(z.center, { icon: pinIcon(col, 'warn') }).bindPopup(popup(z.level === 'High' ? 'Risk: rising reports' : 'Caution: rising reports', `${z.n} recent report${z.n > 1 ? 's' : ''} in this area`)).addTo(groups[g]);
    }
  } catch (e) { if (alive()) toast(e.message); }
  if (!alive()) return;
  safePlaces(c[0], c[1]).then(items => alive() && items.forEach(p => L.marker([p.lat, p.lng], { icon: pinIcon(COLORS.Safe, 'shield') }).bindPopup(popup(p.name, p.kind === 'police' ? 'Police station' : 'Hospital')).addTo(groups.Safe))).catch(() => {});
  if (pos) try { status = (await api('GET', `/api/status?lat=${pos.lat}&lng=${pos.lng}`)).status; } catch {}
  if (!alive()) return;
  const card = $('#areacard', view); if (card) { card.className = `status ${status ? status.level : 'none'}`; mount(card, html`<span class="ic">${icon(status && status.level !== 'Low' ? 'warn' : 'shield')}</span><span class="grow"><b>Area Status: ${status ? status.label : 'Unknown'}</b><p>${status ? `${status.detail} Updated ${clock(status.updatedAt)}.` : 'Turn on location to check your area.'}</p></span>`); }
}

// ---------------- alerts ----------------
async function alertsScreen(view) {
  const my = ctx, alive = () => ctx === my; // late async results must never paint over a screen she has moved on from
  autoLocate(alive, () => alertsScreen(view));
  mount(view, html`<div class="top"><h1>Alerts</h1></div>${S.cfg.demo ? html`<div class="banner demo">${icon('warn')}<span class="small"><b>Demo data.</b> Sample reports for Johannesburg.</span></div>` : ''}<div id="list"><div class="spin"></div></div>`);
  const list = $('#list', view);
  if (!S.pos) { mount(list, locBanner()); return wireLoc(view, () => alertsScreen(view)); }
  try {
    const d = await loadAreaData(); if (!alive()) return;
    mount(list, d.alerts.length ? html`<div class="stack">${d.alerts.map(a => html`<article class="card"><div class="row"><span class="abox ${a.level}">${icon('warn')}</span><div class="grow"><b>${a.title}</b><p class="small mute">${ago(a.at)} · <span class="pill ${a.level}">${levelWord(a.level)}</span></p></div></div><p class="small" style="margin-top:10px">${a.body}</p><div class="row" style="margin-top:12px"><a class="btn small glass" href="#/map">${icon('map')} View map</a><a class="btn small ghost" href="#/track">Share my journey</a></div></article>`)}</div>`
      : html`<div class="card empty">${icon('shield')}<p><b>No alerts near you right now.</b></p><p class="small">Alerts come from reports by other women in the community. No alerts does not guarantee an area is safe, so trust your instincts.</p></div>`);
  } catch (e) { if (alive()) mount(list, html`<p class="err">${e.message}</p>`); }
}

// ---------------- report ----------------
const CATS = [['harassment', 'Harassment', 'users'], ['stalking', 'Stalking', 'eye'], ['assault', 'Assault', 'shield'], ['suspicious', 'Suspicious Activity', 'warn'], ['other', 'Other', 'more']];
function shrinkImage(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, 1024 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', .78)); };
    img.onerror = () => rej(new Error('That image could not be read.')); img.src = url;
  });
}
async function reportScreen(view) {
  const my = ctx, alive = () => ctx === my; // late async results must never paint over a screen she has moved on from
  let cat = null, photo = null;
  const draw = (mine) => {
    if (!alive()) return;
    mount(view, html`${back('Report an Incident')}<p class="mute">Help keep our community safe. If you are in danger right now, <a class="tl" href="#/sos"><b>use SOS</b></a>.</p>
      <div class="cats" role="group" aria-label="What happened">${CATS.map(([k, l, i]) => html`<button type="button" class="cat" data-k="${k}" aria-pressed="${cat === k}">${icon(i)}${l}</button>`)}</div>
      <label class="f">Add details (optional)<textarea id="det" maxlength="500" placeholder="Describe what happened…"></textarea></label>
      <input type="file" id="file" accept="image/*" class="sr" tabindex="-1"><button type="button" class="upload" id="up">${photo ? html`<img src="${photo}" alt="Selected photo">` : html`${icon('cam')}<b>Upload Photo</b><span class="small mute">Tap to upload</span>`}</button>
      <p class="small mute">${icon('lock')} Your report is used as an area pattern. Your name and exact spot are never shown to others. Reports are placed within about 100 m of where you are now.</p>
      ${errBox()}<div class="cta"><button class="btn block" id="go">Submit Report ${icon('arrow')}</button></div>
      ${mine && mine.length ? html`<div class="card"><h3 style="margin-bottom:6px">Your recent reports</h3>${mine.slice(0, 5).map(r => html`<div class="contact"><div class="grow"><b>${(CATS.find(c => c[0] === r.category) || [])[1] || r.category}</b><p class="small mute">${ago(r.created_at)}${r.details ? ' · ' + r.details.slice(0, 60) : ''}</p></div></div>`)}</div>` : ''}`);
    $$('.cat', view).forEach(b => b.onclick = () => { const d = $('#det', view).value; cat = b.dataset.k; draw(mine); $('#det', view).value = d; });
    $('#up', view).onclick = () => $('#file', view).click();
    $('#file', view).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const d = $('#det', view).value; photo = await shrinkImage(f); draw(mine); $('#det', view).value = d; } catch (er) { setErr(view, er.message); } };
    $('#go', view).onclick = async e => {
      setErr(view); if (!cat) return setErr(view, 'Choose what happened.');
      const b = e.currentTarget; busy(b, true, 1);
      try { const p = await getPos(); await api('POST', '/api/reports', { category: cat, details: $('#det', view).value, lat: p.lat, lng: p.lng, photo }); toast('Thank you. Your report helps others stay aware.'); location.hash = '#/home'; }
      catch (er) { setErr(view, er.message); busy(b, false); }
    };
  };
  draw(); api('GET', '/api/reports/mine').then(r => { if (!alive()) return; const d = $('#det', view); const keep = d ? d.value : ''; if (!cat && !photo && !keep) draw(r.reports); }).catch(() => {});
}

// ---------------- tips ----------------
const TIPS = {
  General: [['shield', 'Trust Your Instincts', 'If something feels wrong, leave the situation. You do not owe anyone politeness over your safety.'], ['users', 'Stay in Public', 'Avoid isolated areas. Choose well-lit, busy routes, and park close to the entrance.'], ['share', 'Keep Someone Informed', 'Tell a friend or family member your plans, and share your live location on longer trips.'], ['gear', 'Use Safety Features', 'Add trusted contacts, keep your phone charged, and know how to reach SOS quickly.']],
  Online: [['lock', 'Guard Your Location', 'Switch off live location on social apps and avoid posting where you are in real time.'], ['eye', 'Meet Safely', 'Meeting someone from online? Pick a public place, tell a friend, and arrange your own transport.'], ['ban', 'Block and Report', 'Block people who pressure or threaten you, and keep screenshots as evidence.'], ['user', 'Protect Your Accounts', 'Use strong, different passwords and turn on two-step verification.']],
  Travel: [['nav', 'Share Your Journey', 'Use Share Location when taking a taxi, e-hailing ride or walking at night.'], ['pin', 'Check the Ride', 'Match the number plate and driver to your app before you get in. Sit behind the passenger seat.'], ['phone', 'Keep Your Phone Ready', 'Keep it charged and within reach. Know 112 works from any mobile phone.'], ['map', 'Plan the Route', 'Look at the Safety Map before you go and prefer busier streets with lighting.']],
};
function tipsScreen(view) {
  let tab = 'General';
  const draw = () => {
    mount(view, html`${back('Safety Tips')}<div class="tabsel" role="group" aria-label="Topic">${Object.keys(TIPS).map(t => html`<button aria-pressed="${t === tab}" data-t="${t}">${t}</button>`)}</div>
      <div class="stack">${TIPS[tab].map(([i, t, d]) => html`<div class="card tip"><span class="ic">${icon(i)}</span><div><h3>${t}</h3><p class="small mute">${d}</p></div></div>`)}
      <div class="card center" style="background:linear-gradient(120deg,rgba(123,44,255,.35),rgba(255,46,154,.3))">${icon('crown')}<h2>You are stronger than you think.</h2></div></div>`);
    $$('[data-t]', view).forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
  };
  draw();
}

// ---------------- live tracking ----------------
async function trackScreen(view) {
  let mode = null, local = [], upd = null;
  const clearLocal = () => { local.forEach(f => f()); local = []; upd = null; };
  const draw = () => {
    clearLocal(); mode = Track.t ? 'active' : 'idle';
    if (mode === 'idle') {
      mount(view, html`${back('Live Tracking')}<div class="card stack center">${icon('nav')}<h2>Share your live location</h2><p class="mute small">Your trusted contacts get a private link that shows where you are on a map. It ends when you stop, or automatically after the time you choose.</p>
        <label class="f" style="text-align:left">Stop automatically after<select id="hrs"><option value="1">1 hour</option><option value="2">2 hours</option><option value="4" selected>4 hours</option><option value="8">8 hours</option></select></label>
        ${S.contacts.length ? '' : html`<a class="banner" href="#/support" style="text-decoration:none">${icon('users')}<span class="small">Add a trusted contact first, or share the link yourself.</span></a>`}
        ${errBox()}<button class="btn block" id="start">Start sharing</button></div>`);
      $('#start', view).onclick = async e => {
        const b = e.currentTarget; setErr(view); busy(b, true, 1);
        try {
          const p = await getPos(); const r = await api('POST', '/api/track/start', { lat: p.lat, lng: p.lng, hours: Number($('#hrs', view).value) });
          Track.attach({ token: r.token, url: r.url, kind: 'journey', sms: r.notified && r.notified.smsLink });
        } catch (er) { setErr(view, er.message); busy(b, false); }
      };
      return;
    }
    const t = Track.t, n = S.contacts.length;
    mount(view, html`<div class="top"><span class="row" style="gap:8px"><span class="dot" style="background:#22c55e"></span><h1>Live Tracking</h1></span><button class="btn small" id="stop">Stop Sharing</button></div>
      <div class="mapwrap"><div id="tmap"></div></div>
      <div class="card row">${icon('shield')}<div class="grow"><b>You are sharing your location</b><p class="small mute" id="tstate">${n ? `with ${n} trusted contact${n > 1 ? 's' : ''} (anyone with the link can see it)` : 'with anyone who has your link'}</p></div><span class="timer" id="clk">00:00:00</span></div>
      <div class="row"><button class="btn glass grow" id="share">${icon('share')} Share link</button>${t.sms ? html`<a class="btn grow" href="${t.sms}">${icon('send')} Text contacts</a>` : ''}</div>`);
    $('#stop', view).onclick = async () => { await Track.end(); toast('Location sharing stopped.'); };
    $('#share', view).onclick = () => shareLink(t.url);
    const c = S.pos ? [S.pos.lat, S.pos.lng] : JHB, map = L.map('tmap', { attributionControl: false }).setView(c, 16); L.control.attribution({ prefix: false }).addTo(map);
    baseTiles(map, $('#tmap'));
    const mk = L.marker(c, { icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(map);
    const acc = L.circle(c, { radius: 30, color: '#ff2e9a', weight: 1, fillOpacity: .12 }).addTo(map); setTimeout(() => map.invalidateSize(), 50);
    const tick = () => { const e = $('#clk'); if (e && Track.t) e.textContent = hms(Math.floor((Date.now() - Track.t.startedAt) / 1000)); };
    const iv = setInterval(tick, 1000); tick();
    upd = () => {
      if (S.pos) { const p = [S.pos.lat, S.pos.lng]; mk.setLatLng(p); acc.setLatLng(p).setRadius(Math.max(15, S.pos.acc || 30)); map.panTo(p); }
      const st = $('#tstate'); if (st && Track.t && Track.t.failing) st.textContent = 'Connection lost. Retrying…';
    };
    local.push(() => { clearInterval(iv); map.remove(); });
  };
  const onChange = () => { if (ctx.name !== 'track') return; const m = Track.t ? 'active' : 'idle'; if (m !== mode) draw(); else if (upd) upd(); };
  Track.listeners.add(onChange); ctx.cleanup.push(() => { Track.listeners.delete(onChange); clearLocal(); });
  draw();
}

// ---------------- support ----------------
async function supportScreen(view) {
  const my = ctx, alive = () => ctx === my; // late async results must never paint over a screen she has moved on from
  const welcomeNote = location.hash.includes('welcome=1');
  let helplines = [], comm = null;
  const draw = () => {
    if (!alive()) return;
    mount(view, html`<div class="top"><h1>Support</h1></div>
      ${welcomeNote ? html`<div class="banner">${icon('heart')}<span><b>Welcome, ${first()}.</b> Add at least one trusted contact so SOS and live tracking have someone to reach.</span></div>` : ''}
      <section class="card stack" aria-labelledby="ch"><div class="row">${icon('phone')}<h2 id="ch" class="grow">Emergency Contacts</h2></div><p class="small mute">Up to 5 people who will get your SOS and live location.</p>
        <div id="clist">${S.contacts.length ? S.contacts.map(c => html`<div class="contact"><span class="av">${c.name[0].toUpperCase()}</span><div class="grow"><b>${c.name}</b><p class="small mute">${c.relationship ? c.relationship + ' · ' : ''}${c.phone}</p></div><button class="iconbtn" data-del="${c.id}" aria-label="Remove ${c.name}">${icon('trash')}</button></div>`) : html`<p class="empty">No contacts yet.</p>`}</div>
        ${S.contacts.length < 5 ? html`<form id="cform" class="stack" novalidate><div class="row"><input name="name" placeholder="Name" aria-label="Contact name" autocomplete="off"><input name="relationship" placeholder="Relationship" aria-label="Relationship" autocomplete="off"></div><input name="phone" type="tel" placeholder="Phone, e.g. 082 123 4567" aria-label="Contact phone number"><p class="err" role="alert" id="cerr"></p><button class="btn ghost block">${icon('plus')} Add contact</button></form>` : ''}</section>
      <section class="card stack" aria-labelledby="comh"><div class="row">${icon('users')}<h2 id="comh" class="grow">Community Support</h2></div>
        ${comm ? html`<p class="small mute">${comm.members} women have joined · ${comm.reportsWeek} reports this week</p>
          ${comm.joined ? html`<form id="pform" class="stack"><textarea name="body" maxlength="400" placeholder="Share a tip or ask the community…" aria-label="Write a post" style="min-height:70px"></textarea><div class="row"><button class="btn small grow">Post</button><button type="button" class="btn small glass" id="leave">Leave</button></div></form>
            <div>${comm.posts.length ? comm.posts.map(p => html`<div class="post"><b>${p.author}</b> <span class="small mute">${ago(p.at)}</span><p>${p.body}</p><button class="link small" data-${p.mine ? 'rm' : 'flag'}="${p.id}">${p.mine ? 'Delete' : 'Report this post'}</button></div>`) : html`<p class="empty">No posts yet. Be the first.</p>`}</div>
            <p class="small mute">Be kind. Never share someone’s address or number. Posts reported by 3 people are hidden.</p>`
          : html`<p>You’re not alone. Join a supportive community of women.</p><button class="btn block" id="join">Join Community ${icon('arrow')}</button>`}` : raw('<div class="spin"></div>')}</section>
      <section class="card stack" aria-labelledby="hh"><div class="row">${icon('siren')}<h2 id="hh">Helplines</h2></div>
        ${helplines.map(h => html`<a class="contact" href="tel:${h.tel}" style="text-decoration:none"><span class="av" style="${h.urgent ? '' : 'background:var(--panel2)'}">${icon('phone')}</span><div class="grow"><b>${h.name}</b><p class="small mute">${h.note}</p></div><b>${h.number}</b></a>`)}</section>`);
    $$('[data-del]', view).forEach(b => b.onclick = async () => { try { S.contacts = (await api('DELETE', `/api/contacts/${b.dataset.del}`)).contacts; store.set('sh_contacts', S.contacts); draw(); } catch (e) { toast(e.message); } });
    const cf = $('#cform', view); if (cf) cf.onsubmit = async e => { e.preventDefault(); try { S.contacts = (await api('POST', '/api/contacts', Object.fromEntries(new FormData(cf)))).contacts; store.set('sh_contacts', S.contacts); draw(); toast('Contact added.'); } catch (er) { $('#cerr', view).textContent = er.message; } };
    const j = $('#join', view); if (j) j.onclick = async () => { await api('POST', '/api/community/join'); await loadComm(); };
    const l = $('#leave', view); if (l) l.onclick = async () => { await api('POST', '/api/community/leave'); await loadComm(); };
    const pf = $('#pform', view); if (pf) pf.onsubmit = async e => { e.preventDefault(); try { await api('POST', '/api/posts', Object.fromEntries(new FormData(pf))); await loadComm(); } catch (er) { toast(er.message); } };
    $$('[data-flag]', view).forEach(b => b.onclick = async () => { await api('POST', `/api/posts/${b.dataset.flag}/flag`).catch(() => {}); toast('Thanks. We’ll review it.'); await loadComm(); });
    $$('[data-rm]', view).forEach(b => b.onclick = async () => { await api('DELETE', `/api/posts/${b.dataset.rm}`).catch(() => {}); await loadComm(); });
  };
  const loadComm = async () => { try { comm = await api('GET', '/api/community'); } catch {} draw(); };
  draw(); api('GET', '/api/helplines').then(r => { helplines = r.helplines; draw(); loadComm(); });
}

// ---------------- profile ----------------
let installEvt = null; window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
function profileScreen(view) {
  const u = S.user;
  mount(view, html`<div class="top"><h1>Profile</h1></div>
    <div class="card row"><span class="av" style="width:56px;height:56px;font-size:22px">${u.name[0].toUpperCase()}</span><div><h2>${u.name}</h2><p class="mute small">${u.email}</p></div></div>
    <form class="card stack" id="pf" novalidate><h2>Your details</h2><label class="f">Name<input name="name" value="${u.name}" autocomplete="name"></label><label class="f">Mobile number<input name="phone" type="tel" value="${u.phone || ''}" autocomplete="tel"></label>
      <label class="f">SOS message to your contacts<textarea name="sosMessage" maxlength="140" placeholder="${u.defaultSosMessage}" style="min-height:70px">${u.sosMessage}</textarea></label>${errBox()}<button class="btn">Save changes</button></form>
    <div class="card stack"><h2>How alerts are sent</h2><p class="small mute">${S.cfg.smsMode === 'twilio' ? 'SaveHer texts your trusted contacts automatically when you press SOS or start sharing.' : 'This SaveHer server is not connected to an SMS service, so SOS opens a pre-filled text on your phone for you to send. Your live link still works for anyone you send it to.'}</p></div>
    ${installEvt ? html`<button class="btn glass" id="inst">${icon('plus')} Install SaveHer on this device</button>` : ''}
    <button class="btn glass" id="out">Sign out</button>
    <details class="card"><summary style="cursor:pointer;color:#ff90a3"><b>Delete my account</b></summary><form id="df" class="stack" style="margin-top:12px"><p class="small mute">This permanently deletes your account, contacts, reports and location data.</p><input type="password" name="password" placeholder="Enter your password" autocomplete="current-password" aria-label="Password to confirm"><p class="err" id="derr" role="alert"></p><button class="btn danger">Delete everything</button></form></details>
    <p class="small mute center">SaveHer is a support tool, not a replacement for emergency services. In danger, call 112.</p>`);
  $('#pf', view).onsubmit = async e => { e.preventDefault(); setErr(view); try { S.user = (await api('PATCH', '/api/me', Object.fromEntries(new FormData(e.target)))).user; toast('Saved.'); } catch (er) { setErr(view, er.message); } };
  $('#out', view).onclick = async () => { await Track.end(); await api('POST', '/api/auth/logout').catch(() => {}); S.user = null; S.contacts = []; ['sh_contacts', 'sh_pos', 'sh_track'].forEach(store.del); S.pos = null; badge = 0; location.hash = '#/welcome'; };
  $('#df', view).onsubmit = async e => { e.preventDefault(); try { await api('DELETE', '/api/me', { password: e.target.password.value }); Track.stop(true); S.user = null; ['sh_contacts', 'sh_pos', 'sh_track'].forEach(store.del); location.hash = '#/welcome'; toast('Your account was deleted.'); } catch (er) { $('#derr').textContent = er.message; } };
  const i = $('#inst', view); if (i) i.onclick = () => { installEvt.prompt(); installEvt = null; };
}

// ---------------- router + boot ----------------
const ROUTES = { welcome, signin: v => authScreen(v, 'signin'), signup: v => authScreen(v, 'signup'), home, sos: sosScreen, map: mapScreen, alerts: alertsScreen, report: reportScreen, tips: tipsScreen, track: trackScreen, support: supportScreen, profile: profileScreen };
function route() {
  ctx.cleanup.forEach(f => { try { f(); } catch {} }); ctx = { cleanup: [] };
  let name = location.hash.replace('#/', '').split('?')[0];
  if (!ROUTES[name]) name = S.user ? 'home' : 'welcome';
  if (!S.user && !PUBLIC.includes(name)) name = 'welcome';
  if (S.user && PUBLIC.includes(name)) name = 'home';
  if (location.hash.replace('#/', '').split('?')[0] !== name) { history.replaceState(null, '', '#/' + name); }
  ctx.name = name; const view = $('#view'); view.className = ''; view.scrollTop = 0; window.scrollTo(0, 0);
  shell(); ROUTES[name](view); view.focus({ preventScroll: true });
}
window.addEventListener('hashchange', route);
(async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  try { S.cfg = await api('GET', '/api/config'); } catch {}
  try { S.user = (await api('GET', '/api/me')).user; } catch {}
  if (S.user) await afterLogin();
  route();
  if (S.user && S.pos) loadAreaData().catch(() => {});
})();
