'use strict';
/* Public live-location page for people a woman has chosen to share with. No account needed. */
const token = location.pathname.split('/').pop();
const view = document.getElementById('view');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ago = ms => { const s = Math.max(0, (Date.now() - ms) / 1000); return s < 10 ? 'just now' : s < 60 ? `${Math.floor(s)}s ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)}h ago`; };
let map, marker, circle, trail, built = false, timer;

function build() {
  view.innerHTML = `<div class="top"><h1 id="title" class="grow"></h1></div>
  <div class="mapwrap"><div id="tmap"></div></div>
  <div class="card"><b id="fresh"></b><p class="small mute" id="sub"></p></div>
  <div class="row"><a class="btn danger grow" href="tel:112">Call 112</a><a class="btn glass grow" href="tel:10111">Police 10111</a></div>
  <a class="btn glass" id="gm" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
  <p class="small mute center">This private link was shared with you on SaveHer. It stops working when she stops sharing. If you think she is in danger, call the police and give them this location.</p>`;
  map = L.map('tmap', { attributionControl: false }).setView([-26.2, 28.05], 16); L.control.attribution({ prefix: false }).addTo(map);
  let ok = 0, bad = 0;
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
  tiles.on('tileload', () => { ok++; });
  tiles.on('tileerror', () => { if (++bad === 2 && !ok) { const n = document.createElement('div'); n.className = 'mapnote'; n.textContent = 'The street map could not load. Her position is still shown as a dot, and you can open it in Google Maps below.'; document.getElementById('tmap').parentElement.append(n); } });
  marker = L.marker([0, 0], { icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) });
  circle = L.circle([0, 0], { radius: 30, color: '#ff2e9a', weight: 1, fillOpacity: .12 }); trail = L.polyline([], { color: '#ff2e9a', weight: 3, opacity: .6 }).addTo(map);
  setTimeout(() => map.invalidateSize(), 50); built = true;
}
function ended(name, msg) {
  view.innerHTML = `<div class="welcome"><h1 style="font-size:28px">${esc(msg)}</h1><p class="mute">${name ? esc(name) + ' has stopped sharing her location, so nothing is shown here any more.' : 'Ask her to share a new link if you still need to find her.'}</p><a class="btn danger" href="tel:112">Call 112</a></div>`;
  clearInterval(timer);
}
async function poll() {
  let r;
  try { r = await fetch('/api/track/' + encodeURIComponent(token), { cache: 'no-store' }); } catch { const f = document.getElementById('sub'); if (f) f.textContent = 'You seem to be offline. Retrying…'; return; }
  if (r.status === 404) return ended(null, 'This link is not valid');
  const d = await r.json();
  if (!d.active) return ended(d.name, 'Location sharing has ended');
  if (!built) build();
  document.getElementById('title').textContent = `${d.name} is sharing her live location`;
  document.title = `${d.name}: live location | SaveHer`;
  if (d.position) {
    const p = [d.position.lat, d.position.lng];
    if (!map.hasLayer(marker)) { marker.addTo(map); circle.addTo(map); map.setView(p, 16); }
    marker.setLatLng(p); circle.setLatLng(p).setRadius(Math.max(15, d.position.accuracy || 30)); map.panTo(p, { animate: true });
    trail.setLatLngs(d.trail.map(t => [t.lat, t.lng]));
    const stale = Date.now() - d.position.at > 120000;
    document.getElementById('fresh').textContent = `Updated ${ago(d.position.at)}`;
    document.getElementById('sub').textContent = stale ? 'No recent update. Her phone may be offline or low on battery. This is her last known position.' : (d.kind === 'sos' ? 'She pressed SOS. Please check on her now.' : 'Sharing her journey with you.');
    document.getElementById('gm').href = `https://maps.google.com/?q=${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  } else { document.getElementById('fresh').textContent = 'Waiting for her first location…'; document.getElementById('sub').textContent = 'Her phone is still finding a GPS signal.'; }
}
poll(); timer = setInterval(poll, 5000);
