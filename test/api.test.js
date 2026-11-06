'use strict';
process.env.NO_RATE_LIMIT = '1'; process.env.GEOCODE = 'off';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { open } = require('../server/db');
const { createApp } = require('../server/app');

let server, base;
const db = open(':memory:');
const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-'));
test.before(async () => { server = createApp(db, { uploadDir: uploads }).listen(0); await new Promise(r => server.on('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json, res };
  };
}
const JHB = { lat: -26.1076, lng: 28.0567 };
async function signup(email, name = 'Thando Test') {
  const c = client(); const r = await c('POST', '/api/auth/register', { name, email, password: 'correct horse 9', phone: '082 123 4567' });
  assert.equal(r.status, 201); return c;
}

test('auth: register, wrong password, login, unauthenticated access, logout', async () => {
  const c = await signup('a@example.com');
  assert.equal((await c('GET', '/api/me')).json.user.phone, '+27821234567');
  assert.equal((await c('POST', '/api/auth/register', { name: 'X Y', email: 'a@example.com', password: 'correct horse 9' })).status, 409);
  const anon = client();
  assert.equal((await anon('GET', '/api/contacts')).status, 401);
  assert.equal((await anon('POST', '/api/auth/login', { email: 'a@example.com', password: 'nope nope nope' })).status, 401);
  assert.equal((await anon('POST', '/api/auth/login', { email: 'A@example.com', password: 'correct horse 9' })).status, 200);
  await anon('POST', '/api/auth/logout'); assert.equal((await anon('GET', '/api/contacts')).status, 401);
  assert.equal((await client()('POST', '/api/auth/register', { name: 'Ab', email: 'bad', password: 'short' })).status, 400);
});

test('security: cross-site origin is blocked', async () => {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' });
  assert.equal(res.status, 403);
  const csp = (await fetch(base + '/')).headers.get('content-security-policy') || '';
  assert.match(csp, /script-src 'self'/);
  // no-referrer makes OpenStreetMap reject tile requests, which leaves the map blank
  assert.equal((await fetch(base + '/')).headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  // OpenStreetMap serves tiles from the bare host; a *.tile wildcard alone does not match it and the map goes blank
  assert.match(csp, /img-src[^;]* https:\/\/tile\.openstreetmap\.org/);
});

test('contacts: validation, limit and isolation between users', async () => {
  const c = await signup('b@example.com'), d = await signup('c@example.com');
  assert.equal((await c('POST', '/api/contacts', { name: 'Mum', phone: 'abc' })).status, 400);
  for (let i = 0; i < 5; i++) assert.equal((await c('POST', '/api/contacts', { name: 'Mum ' + i, phone: `08212345${60 + i}` })).status, 201);
  assert.equal((await c('POST', '/api/contacts', { name: 'Extra', phone: '0821234599' })).status, 400);
  assert.equal((await d('GET', '/api/contacts')).json.contacts.length, 0);
  const id = (await c('GET', '/api/contacts')).json.contacts[0].id;
  await d('DELETE', '/api/contacts/' + id); assert.equal((await c('GET', '/api/contacts')).json.contacts.length, 5);
});

test('reports feed the engine; a lone reporter cannot trigger an alert; coordinates are rounded', async () => {
  const people = []; for (let i = 0; i < 4; i++) people.push(await signup(`r${i}@example.com`));
  assert.equal((await people[0]('POST', '/api/reports', { category: 'nonsense', ...JHB })).status, 400);
  assert.equal((await people[0]('POST', '/api/reports', { category: 'harassment' })).status, 400);
  await people[0]('POST', '/api/reports', { category: 'harassment', details: 'x', lat: JHB.lat + 0.0004, lng: JHB.lng });
  let st = (await people[0]('GET', `/api/status?lat=${JHB.lat}&lng=${JHB.lng}`)).json;
  assert.equal(st.alertsNearby, 0); assert.equal(st.status.label, 'No active alerts');
  for (const [i, cat] of ['harassment', 'stalking', 'harassment'].entries()) await people[i + 1]('POST', '/api/reports', { category: cat, ...JHB });
  await people[1]('POST', '/api/reports', { category: 'assault', ...JHB });
  st = (await people[0]('GET', `/api/status?lat=${JHB.lat}&lng=${JHB.lng}`)).json;
  assert.ok(st.alertsNearby >= 1); assert.notEqual(st.status.level, 'Low');
  const al = (await people[0]('GET', `/api/alerts?lat=${JHB.lat}&lng=${JHB.lng}`)).json.alerts;
  assert.ok(al.length >= 1); assert.match(al[0].body, /not confirmed wrongdoing/);
  const map = (await people[0]('GET', `/api/map?lat=${JHB.lat}&lng=${JHB.lng}`)).json.cells;
  assert.ok(map.some(c => c.alert));
  const row = db.prepare('SELECT lat,lng FROM reports ORDER BY id LIMIT 1').get();
  assert.equal(row.lat, Math.round((JHB.lat + 0.0004) * 1000) / 1000);
  assert.deepEqual(Object.keys(map[0]).sort(), ['alert', 'bounds', 'cell', 'center', 'level', 'momentum', 'n']); // no raw reports leak
});

test('report photo: jpeg only, owner only', async () => {
  const c = await signup('p@example.com'), o = await signup('q@example.com');
  assert.equal((await c('POST', '/api/reports', { category: 'other', ...JHB, photo: 'data:image/png;base64,AAAA' })).status, 400);
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
  const r = await c('POST', '/api/reports', { category: 'other', ...JHB, photo: jpeg }); assert.equal(r.status, 201);
  assert.equal((await c('GET', `/api/reports/${r.json.id}/photo`)).status, 200);
  assert.equal((await o('GET', `/api/reports/${r.json.id}/photo`)).status, 404);
});

test('SOS: manual SMS fallback, public tracking page shows first name only, end stops sharing', async () => {
  const c = await signup('s@example.com', 'Thando Mokoena');
  await c('POST', '/api/contacts', { name: 'Mum', phone: '0829998888' });
  const sos = await c('POST', '/api/sos', JHB); assert.equal(sos.status, 201);
  assert.equal(sos.json.notified.mode, 'manual'); assert.match(sos.json.notified.smsLink, /^sms:\+27829998888\?&body=/);
  const pub = client(); // no login: this is what the contact sees
  const t = (await pub('GET', '/api/track/' + sos.json.token)).json;
  assert.equal(t.active, true); assert.equal(t.name, 'Thando'); assert.equal(t.position.lat, JHB.lat);
  assert.equal(JSON.stringify(t).includes('Mokoena'), false);
  assert.equal((await c('POST', `/api/track/${sos.json.token}/ping`, { lat: -26.2, lng: 28.1 })).status, 200);
  assert.equal((await pub('GET', '/api/track/' + sos.json.token)).json.position.lat, -26.2);
  assert.equal((await pub('POST', `/api/track/${sos.json.token}/ping`, { lat: 1, lng: 1 })).status, 401);
  assert.equal((await c('GET', '/api/sos/active')).json.sos.id, sos.json.id);
  const end = await c('POST', `/api/sos/${sos.json.id}/end`, { reason: 'false_alarm' }); assert.equal(end.status, 200);
  const after = (await pub('GET', '/api/track/' + sos.json.token)).json;
  assert.equal(after.active, false); assert.equal(after.position, undefined);
  assert.equal((await pub('GET', '/api/track/nope')).status, 404);
});

test('SOS with Twilio configured sends one SMS per contact and reports failures honestly', async () => {
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM: '+15005550006' });
  const real = global.fetch, calls = [];
  global.fetch = async (url, opts) => {
    if (String(url).includes('api.twilio.com')) { calls.push(opts.body.get('To')); return { ok: opts.body.get('To') !== '+27820000002' }; }
    return real(url, opts);
  };
  try {
    const c = await signup('t@example.com');
    await c('POST', '/api/contacts', { name: 'Amy', phone: '0820000001' }); await c('POST', '/api/contacts', { name: 'Bea', phone: '0820000002' });
    const sos = (await c('POST', '/api/sos', JHB)).json;
    assert.deepEqual(calls.sort(), ['+27820000001', '+27820000002']);
    assert.equal(sos.notified.mode, 'twilio'); assert.equal(sos.notified.sent, 1); assert.equal(sos.notified.failed, 1);
    assert.ok(sos.notified.smsLink, 'manual fallback offered when any send failed');
  } finally { global.fetch = real; for (const k of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM']) delete process.env[k]; }
});

test('journey sharing: start, ping, stop, expiry', async () => {
  const c = await signup('j@example.com'); const pub = client();
  const t = (await c('POST', '/api/track/start', { ...JHB, notify: false })).json;
  assert.equal((await c('GET', '/api/track/mine/active')).json.track.token, t.token);
  assert.equal((await pub('GET', '/api/track/' + t.token)).json.kind, 'journey');
  await c('POST', `/api/track/${t.token}/stop`);
  assert.equal((await c('POST', `/api/track/${t.token}/ping`, { lat: 1, lng: 1 })).status, 410);
  const t2 = (await c('POST', '/api/track/start', { ...JHB, notify: false })).json;
  db.prepare('UPDATE tracks SET expires_at = ? WHERE token = ?').run(Date.now() - 1000, t2.token);
  assert.equal((await pub('GET', '/api/track/' + t2.token)).json.active, false);
});

test('community: join required, flags hide a post, delete account removes data', async () => {
  const a = await signup('m1@example.com'), b = await signup('m2@example.com'), x = await signup('m3@example.com'), y = await signup('m4@example.com');
  assert.equal((await a('POST', '/api/posts', { body: 'hello' })).status, 403);
  for (const u of [a, b, x, y]) await u('POST', '/api/community/join');
  await a('POST', '/api/posts', { body: 'Walking home from Park Station at 6, anyone else?' });
  const id = (await b('GET', '/api/community')).json.posts[0].id;
  assert.equal((await a('POST', `/api/posts/${id}/flag`)).status, 404); // cannot flag own post
  for (const u of [b, x, y]) await u('POST', `/api/posts/${id}/flag`);
  assert.equal((await b('GET', '/api/community')).json.posts.length, 0);
  assert.equal((await a('DELETE', '/api/me', { password: 'wrong wrong' })).status, 403);
  assert.equal((await a('DELETE', '/api/me', { password: 'correct horse 9' })).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM users WHERE email = 'm1@example.com'").get().c, 0);
});

test('helplines include the verified national numbers', async () => {
  const j = (await client()('GET', '/api/helplines')).json.helplines.map(h => h.number);
  for (const n of ['112', '10111', '10177', '0800 428 428']) assert.ok(j.includes(n), n);
});
