'use strict';
// Smoke test of the real front end in jsdom against a real server: every screen renders without errors,
// user text is escaped, SOS press-and-hold triggers a real alert, and the offline fallback appears.
process.env.NO_RATE_LIMIT = '1'; process.env.GEOCODE = 'off';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { JSDOM } = require('jsdom');
const { open } = require('../server/db');
const { createApp } = require('../server/app');
const E = require('../server/engine');

const db = open(':memory:'); let server, base, dom, w;
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await wait(25); } throw new Error('timeout waiting: ' + fn); };
const text = () => w.document.getElementById('view').textContent;
const go = async (hash, probe) => { w.location.hash = hash; await until(() => probe ? text().includes(probe) : true); };

test.before(async () => {
  const MIN = 60000, now = Date.now(); const [cl, cg] = E.cellCenter(E.cellOf(-26.1076, 28.0567));
  for (let i = 1; i <= 4; i++) db.prepare('INSERT INTO users(name,email,pass_salt,pass_hash,created_at) VALUES(?,?,?,?,?)').run('D' + i, `d${i}@x.invalid`, 'x', 'x', now);
  [['harassment', 150, 1], ['suspicious', 80, 2], ['harassment', 40, 3], ['stalking', 30, 4], ['harassment', 20, 2], ['assault', 10, 1]].forEach(([c, a, u]) =>
    db.prepare('INSERT INTO reports(user_id,category,lat,lng,cell,is_demo,created_at) VALUES(?,?,?,?,?,1,?)').run(u, c, cl, cg, E.cellOf(cl, cg), now - a * MIN));
  server = createApp(db, { uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ui-')) }).listen(0); await new Promise(r => server.on('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const errors = []; let cookie = '';
  dom = new JSDOM(fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8').replace(/<script src="\/vendor\/leaflet.js"><\/script>/, ''),
    { url: base + '/', runScripts: 'outside-only', pretendToBeVisual: true });
  w = dom.window;
  w.eval('window.L=undefined'); // map drawing is not testable in jsdom; Leaflet is stubbed below
  const deep = new Proxy(function () {}, { get: (t, k) => k === 'divIcon' ? o => o : deep, apply: () => deep }); w.L = deep; // any chain like L.control.attribution(...).addTo(map) is a no-op
  w.fetch = async (u, o = {}) => { const r = await fetch(new URL(u, base), { ...o, headers: { ...(o.headers || {}), Cookie: cookie } }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return r; };
  w.navigator.geolocation = { getCurrentPosition: ok => ok({ coords: { latitude: -26.1076, longitude: 28.0567, accuracy: 12 } }), watchPosition: () => 1, clearWatch() {} };
  w.navigator.vibrate = () => true; w.Element.prototype.scrollTo = () => {}; w.scrollTo = () => {}; w.prompt = () => {};
  w.addEventListener('error', e => errors.push(e.message)); w.errors = errors;
  // one eval: top-level const in separate evals would not be shared the way separate <script> tags share them in a browser
  w.eval(['lib.js', 'screens.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8')).join('\n') + '\nwindow.__t = { SOS, S, Track };');
  await until(() => text().includes('Get Started'));
});
test.after(() => { w.close(); server.close(); });

test('welcome → sign up with a hostile name: renders as text, lands on the support screen', async () => {
  await go('#/signup', 'Create your account');
  const f = w.document.querySelector('form');
  const q = n => f.elements[n]; q('name').value = '<img src=x onerror=window.pwned=1>Thando'; q('email').value = 'thando@example.com'; q('phone').value = '082 555 1234'; q('password').value = 'a long password 1';
  f.dispatchEvent(new w.Event('submit', { cancelable: true }));
  await until(() => text().includes('Emergency Contacts'));
  assert.equal(w.pwned, undefined); assert.equal(w.document.querySelector('#view img'), null);
  assert.match(text(), /Welcome, <img/); // shown literally, not executed
});

test('add a trusted contact; home shows status and the real alert from nearby reports', async () => {
  const f = w.document.getElementById('cform'); f.elements.name.value = 'Mama'; f.elements.relationship.value = 'Mother'; f.elements.phone.value = '083 111 2222';
  f.dispatchEvent(new w.Event('submit', { cancelable: true })); await until(() => text().includes('+27831112222'));
  await go('#/home', 'Latest Alerts'); assert.match(text(), /Turn on location/); w.document.getElementById('enloc').click();
  await until(() => /Safety Status: (Risk|Caution)/.test(text()));
  assert.match(text(), /Increased .* reports (near|in your area)/); assert.doesNotMatch(text(), /Safety Status: No alerts[\s\S]*Increased/);
  assert.match(text(), /Demo data|No alerts near you|Increased/);
});

test('every screen renders without a JS error', async () => {
  for (const [h, probe] of [['#/alerts', 'Alerts'], ['#/map', 'Safety Map'], ['#/report', 'Report an Incident'], ['#/tips', 'Trust Your Instincts'], ['#/track', 'Share your live location'], ['#/support', 'Helplines'], ['#/profile', 'Delete my account']]) {
    await go(h, probe); await wait(80);
  }
  assert.deepEqual(w.errors, []);
});

test('report: pick a category and submit with the device location', async () => {
  await go('#/report', 'Report an Incident');
  w.document.querySelector('[data-k="stalking"]').click(); assert.equal(w.document.querySelector('[data-k="stalking"]').getAttribute('aria-pressed'), 'true');
  w.document.getElementById('go').click(); await until(() => w.location.hash === '#/home');
  assert.equal(db.prepare("SELECT COUNT(*) c FROM reports WHERE category='stalking' AND is_demo=0").get().c, 1);
});

test('SOS: holding the button for 3s sends a real alert and shows the manual SMS path', async () => {
  await go('#/sos', 'Hold for 3 seconds');
  const b = w.document.getElementById('sos'); b.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
  await wait(1000); b.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true })); await wait(100);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM sos_events').get().c, 0, 'released early: nothing sent');
  b.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
  await until(() => text().includes('SOS is active'), 6000);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM sos_events').get().c, 1);
  assert.match(text(), /have not been alerted yet/);
  assert.match(w.document.querySelector('a[href^="sms:"]').getAttribute('href'), /^sms:\+27831112222/);
  assert.equal(w.document.querySelector('a[href="tel:112"]') !== null, true);
  w.document.getElementById('false').click(); await until(() => w.location.hash === '#/home');
  assert.equal(db.prepare("SELECT status FROM sos_events").get().status, 'cancelled');
});

test('SOS while the server is unreachable still gives her call 112 and a text-my-contacts link', async () => {
  const real = w.fetch; w.fetch = async () => { throw new Error('net'); };
  await go('#/sos', 'Hold for 3 seconds'); w.__t.SOS.state = null; w.__t.SOS.trigger();
  await until(() => text().includes('could not reach'), 6000);
  assert.ok(w.document.querySelector('a[href^="sms:"]')); assert.ok(w.document.querySelector('a[href="tel:112"]'));
  w.fetch = real;
});
