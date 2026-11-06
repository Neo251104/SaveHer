'use strict';
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const E = require('./engine');
const { toE164, notifyContacts, configured } = require('./notify');
const HELPLINES = require('./helplines');

const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const CATEGORIES = Object.keys(E.SEVERITY);
const DEFAULT_SOS = 'I need help. Please call me or come to my location.';
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const rid = n => crypto.randomBytes(n).toString('base64url');
const num = v => (v === undefined || v === '' ? NaN : Number(v));
const validPos = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const firstName = n => String(n).split(' ')[0];

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
}
function checkPassword(pw, salt, hash) {
  const a = Buffer.from(crypto.scryptSync(pw, salt, 64).toString('hex')), b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createApp(db, opts = {}) {
  const uploadDir = opts.uploadDir || path.join(__dirname, '..', 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  const prod = process.env.NODE_ENV === 'production';
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // ---------- security headers ----------
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org; " +
        "connect-src 'self' https://overpass-api.de; style-src 'self' 'unsafe-inline'; script-src 'self'; " +
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      // OpenStreetMap rejects tile requests that carry no Referer, so send the origin only (never a path: tracking links hold a secret)
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
    });
    if (prod) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
  app.use(express.json({ limit: '2mb' }));

  // ---------- tiny in-memory rate limiter ----------
  const hits = new Map();
  const limit = (name, max, windowMs, byUser = false) => (req, res, next) => {
    if (process.env.NO_RATE_LIMIT) return next();
    const key = `${name}:${byUser && req.user ? 'u' + req.user.id : req.ip}`, now = Date.now();
    const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Too many attempts. Please wait a moment and try again.' });
    arr.push(now); hits.set(key, arr); next();
  };
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some(t => now - t < HOUR)) hits.delete(k); }, 10 * MIN).unref();

  // ---------- CSRF guard + session loading ----------
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET') {
      const origin = req.get('origin');
      if (origin) { try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Cross-site request blocked.' }); } catch { return res.status(403).json({ error: 'Bad origin.' }); } }
      if (req.headers['content-length'] > 0 && !req.is('application/json')) return res.status(415).json({ error: 'JSON required.' });
    }
    const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || '');
    if (m) {
      const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`).get(sha(m[1]), Date.now());
      if (row) req.user = row;
    }
    next();
  });
  const need = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Please sign in.' });
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const baseUrl = req => process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

  function startSession(res, userId) {
    const token = rid(32);
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(sha(token), userId, Date.now() + 30 * DAY);
    res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: prod, maxAge: 30 * DAY, path: '/' });
  }
  const publicUser = u => {
    const contacts = db.prepare('SELECT COUNT(*) c FROM contacts WHERE user_id = ?').get(u.id).c;
    return { id: u.id, name: u.name, email: u.email, phone: u.phone, sosMessage: u.sos_message || '', defaultSosMessage: DEFAULT_SOS, community: !!u.community, contacts };
  };

  // ---------- auth ----------
  app.post('/api/auth/register', limit('reg', 10, HOUR), (req, res) => {
    const name = clean(req.body.name, 60), email = clean(req.body.email, 120).toLowerCase(), pw = String(req.body.password || '');
    const phone = req.body.phone ? toE164(req.body.phone) : null;
    if (name.length < 2) return res.status(400).json({ error: 'Enter your name.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (pw.length < 8 || pw.length > 200) return res.status(400).json({ error: 'Use a password with at least 8 characters.' });
    if (req.body.phone && !phone) return res.status(400).json({ error: 'Enter a valid phone number, like 082 123 4567.' });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'That email already has an account. Try signing in.' });
    const { salt, hash } = hashPassword(pw);
    const r = db.prepare('INSERT INTO users(name,email,phone,pass_salt,pass_hash,created_at) VALUES(?,?,?,?,?,?)').run(name, email, phone, salt, hash, Date.now());
    startSession(res, Number(r.lastInsertRowid));
    res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid)) });
  });
  app.post('/api/auth/login', limit('login', 10, 15 * MIN), (req, res) => {
    const email = clean(req.body.email, 120).toLowerCase(), pw = String(req.body.password || '');
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const ok = u ? checkPassword(pw, u.pass_salt, u.pass_hash) : (hashPassword(pw), false); // constant-ish time
    if (!ok) return res.status(401).json({ error: 'Email or password is not right.' });
    startSession(res, u.id);
    res.json({ user: publicUser(u) });
  });
  app.post('/api/auth/logout', (req, res) => {
    const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || '');
    if (m) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(m[1]));
    res.clearCookie('sid', { path: '/' }); res.json({ ok: true });
  });

  // ---------- profile ----------
  app.get('/api/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));
  app.patch('/api/me', need, (req, res) => {
    const b = req.body, u = req.user;
    const name = b.name !== undefined ? clean(b.name, 60) : u.name;
    const phone = b.phone !== undefined ? (b.phone ? toE164(b.phone) : null) : u.phone;
    if (name.length < 2) return res.status(400).json({ error: 'Enter your name.' });
    if (b.phone && !phone) return res.status(400).json({ error: 'Enter a valid phone number.' });
    const sos = b.sosMessage !== undefined ? clean(b.sosMessage, 140) : u.sos_message;
    db.prepare('UPDATE users SET name=?, phone=?, sos_message=? WHERE id=?').run(name, phone, sos || null, u.id);
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) });
  });
  app.delete('/api/me', need, limit('del', 5, HOUR, true), (req, res) => {
    if (!checkPassword(String(req.body.password || ''), req.user.pass_salt, req.user.pass_hash)) return res.status(403).json({ error: 'Password is not right.' });
    for (const r of db.prepare('SELECT photo FROM reports WHERE user_id = ? AND photo IS NOT NULL').all(req.user.id)) fs.rm(path.join(uploadDir, r.photo), { force: true }, () => {});
    db.prepare('DELETE FROM reports WHERE user_id = ?').run(req.user.id); // reports are personal data too
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    res.clearCookie('sid', { path: '/' }); res.json({ ok: true });
  });

  // ---------- trusted contacts ----------
  const contactsOf = id => db.prepare('SELECT id,name,phone,relationship FROM contacts WHERE user_id = ? ORDER BY id').all(id);
  app.get('/api/contacts', need, (req, res) => res.json({ contacts: contactsOf(req.user.id) }));
  app.post('/api/contacts', need, (req, res) => {
    const name = clean(req.body.name, 60), phone = toE164(req.body.phone), rel = clean(req.body.relationship, 40);
    if (name.length < 2) return res.status(400).json({ error: 'Enter your contact’s name.' });
    if (!phone) return res.status(400).json({ error: 'Enter a valid phone number, like 082 123 4567.' });
    if (contactsOf(req.user.id).length >= 5) return res.status(400).json({ error: 'You can add up to 5 trusted contacts.' });
    db.prepare('INSERT INTO contacts(user_id,name,phone,relationship,created_at) VALUES(?,?,?,?,?)').run(req.user.id, name, phone, rel || null, Date.now());
    res.status(201).json({ contacts: contactsOf(req.user.id) });
  });
  app.delete('/api/contacts/:id', need, (req, res) => {
    db.prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
    res.json({ contacts: contactsOf(req.user.id) });
  });

  // ---------- area safety (engine) ----------
  const now2W = () => Date.now() - 2 * E.CONFIG.windowMin * MIN;
  function statesAround(lat, lng, radius) {
    const centre = E.cellOf(lat, lng), cells = E.neighbours(centre, radius);
    const ph = cells.map(() => '?').join(',');
    const rows = db.prepare(`SELECT user_id, category, verified, created_at, cell FROM reports WHERE cell IN (${ph}) AND created_at > ?`).all(...cells, now2W());
    return cells.map(c => E.cellState(c, rows));
  }
  function readPos(req, res) {
    const lat = num(req.query.lat), lng = num(req.query.lng);
    if (!validPos(lat, lng)) { res.status(400).json({ error: 'Location is needed.' }); return null; }
    return [lat, lng];
  }
  app.get('/api/status', need, (req, res) => {
    const p = readPos(req, res); if (!p) return;
    const st = statesAround(p[0], p[1], 1);
    res.json({ status: E.areaStatus(st), alertsNearby: st.filter(s => s.alert).length });
  });

  const geocode = process.env.GEOCODE !== 'off';
  async function placeName(cell, allowFetch) {
    const hit = db.prepare('SELECT name, fetched_at FROM place_names WHERE cell = ?').get(cell);
    if (hit && Date.now() - hit.fetched_at < 30 * DAY) return hit.name;
    if (!geocode || !allowFetch) return null;
    try {
      const [la, ln] = E.cellCenter(cell);
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=${la}&lon=${ln}`,
        { headers: { 'User-Agent': `SaveHer/1.0 (${process.env.CONTACT_EMAIL || 'contact not set'})` }, signal: AbortSignal.timeout(2500) });
      if (!r.ok) return null;
      const a = (await r.json()).address || {};
      const name = a.suburb || a.neighbourhood || a.city_district || a.town || a.village || a.city || null;
      db.prepare('INSERT OR REPLACE INTO place_names(cell,name,fetched_at) VALUES(?,?,?)').run(cell, name, Date.now());
      return name;
    } catch { return null; }
  }
  app.get('/api/alerts', need, wrap(async (req, res) => {
    const p = readPos(req, res); if (!p) return;
    const list = statesAround(p[0], p[1], 2).filter(s => s.alert || s.level !== 'Low').sort((a, b) => (b.latest || 0) - (a.latest || 0)).slice(0, 12);
    let fetches = 2; // be gentle with the free geocoder
    const alerts = [];
    for (const s of list) {
      const cached = await placeName(s.cell, false);
      const name = cached || (fetches-- > 0 ? await placeName(s.cell, true) : null) || null;
      const what = E.LABEL[s.topCategory] || 'safety';
      alerts.push({
        id: s.cell, level: s.level, momentum: s.momentum, confidence: s.confidence, at: s.latest, place: name,
        title: `${s.momentum === 'Increasing' ? 'Increased' : 'Recent'} ${what} reports ${name ? 'near ' + name : 'in your area'}`,
        body: E.describe(s), center: E.cellCenter(s.cell),
      });
    }
    res.json({ alerts });
  }));
  app.get('/api/map', need, (req, res) => {
    const p = readPos(req, res); if (!p) return;
    const cells = statesAround(p[0], p[1], 4).filter(s => s.nRecent > 0).map(s => ({
      cell: s.cell, bounds: E.cellBounds(s.cell), center: E.cellCenter(s.cell), level: s.level, momentum: s.momentum, alert: s.alert, n: s.nRecent }));
    res.json({ cells, updatedAt: Date.now() });
  });

  // ---------- incident reports ----------
  app.post('/api/reports', need, limit('report', 10, HOUR, true), (req, res) => {
    const b = req.body, lat = num(b.lat), lng = num(b.lng), category = String(b.category || '');
    if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Choose what happened.' });
    if (!validPos(lat, lng)) return res.status(400).json({ error: 'We need your location to place the report. Turn on location and try again.' });
    let photo = null;
    if (b.photo) {
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.photo));
      const buf = m ? Buffer.from(m[1], 'base64') : null;
      if (!buf || buf.length > 1.5e6 || buf[0] !== 0xff || buf[1] !== 0xd8) return res.status(400).json({ error: 'Photo must be a JPEG under 1.5 MB.' });
      photo = rid(18) + '.jpg'; fs.writeFileSync(path.join(uploadDir, photo), buf);
    }
    const rl = Math.round(lat * 1000) / 1000, rn = Math.round(lng * 1000) / 1000; // about 100 m: never store exact spot
    const r = db.prepare('INSERT INTO reports(user_id,category,details,lat,lng,cell,photo,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(req.user.id, category, clean(b.details, 500) || null, rl, rn, E.cellOf(rl, rn), photo, Date.now());
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  app.get('/api/reports/mine', need, (req, res) => res.json({ reports: db.prepare(
    'SELECT id,category,details,created_at,photo IS NOT NULL AS hasPhoto FROM reports WHERE user_id = ? ORDER BY id DESC LIMIT 30').all(req.user.id) }));
  app.get('/api/reports/:id/photo', need, (req, res) => { // only the person who filed it can see their photo
    const r = db.prepare('SELECT photo FROM reports WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
    if (!r || !r.photo) return res.status(404).end();
    res.set('Cache-Control', 'private, max-age=3600').type('jpeg').sendFile(path.join(uploadDir, r.photo));
  });

  // ---------- SOS, check-ins and live location ----------
  const trackActive = t => t && t.active && t.expires_at > Date.now();
  function newTrack(userId, kind, lat, lng, hours) {
    const token = rid(16), now = Date.now();
    db.prepare('INSERT INTO tracks(token,user_id,kind,started_at,expires_at,last_lat,last_lng,last_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(token, userId, kind, now, now + hours * HOUR, Number.isFinite(lat) ? lat : null, Number.isFinite(lng) ? lng : null, Number.isFinite(lat) ? now : null);
    if (Number.isFinite(lat)) db.prepare('INSERT INTO track_points(token,lat,lng,at) VALUES(?,?,?,?)').run(token, lat, lng, now);
    return token;
  }
  const stopTrack = token => db.prepare('UPDATE tracks SET active = 0 WHERE token = ?').run(token);

  app.post('/api/sos', need, limit('sos', 10, HOUR, true), wrap(async (req, res) => {
    const lat = num(req.body.lat), lng = num(req.body.lng), u = req.user;
    const token = newTrack(u.id, 'sos', lat, lng, 8), url = `${baseUrl(req)}/t/${token}`;
    const body = `${u.sos_message || DEFAULT_SOS} ${u.name} triggered an SOS on SaveHer. Live location: ${url}`;
    const result = await notifyContacts(contactsOf(u.id), body);
    const r = db.prepare('INSERT INTO sos_events(user_id,token,lat,lng,notified,created_at) VALUES(?,?,?,?,?,?)')
      .run(u.id, token, Number.isFinite(lat) ? lat : null, Number.isFinite(lng) ? lng : null, result.sent, Date.now());
    res.status(201).json({ id: Number(r.lastInsertRowid), token, url, notified: result });
  }));
  app.get('/api/sos/active', need, (req, res) => {
    const s = db.prepare(`SELECT s.id, s.token, s.created_at FROM sos_events s JOIN tracks t ON t.token = s.token
      WHERE s.user_id = ? AND s.status = 'active' AND t.active = 1 AND t.expires_at > ? ORDER BY s.id DESC LIMIT 1`).get(req.user.id, Date.now());
    res.json({ sos: s ? { ...s, url: `${baseUrl(req)}/t/${s.token}` } : null });
  });
  app.post('/api/sos/:id/end', need, wrap(async (req, res) => {
    const s = db.prepare("SELECT * FROM sos_events WHERE id = ? AND user_id = ? AND status = 'active'").get(Number(req.params.id), req.user.id);
    if (!s) return res.status(404).json({ error: 'No active SOS found.' });
    const status = req.body.reason === 'false_alarm' ? 'cancelled' : 'resolved';
    db.prepare('UPDATE sos_events SET status = ? WHERE id = ?').run(status, s.id); stopTrack(s.token);
    const msg = status === 'cancelled' ? `False alarm from ${req.user.name}: she is safe. Sorry for the scare.` : `Update from ${req.user.name}: she is safe now. Location sharing has stopped.`;
    res.json({ ok: true, notified: await notifyContacts(contactsOf(req.user.id), msg) });
  }));
  app.post('/api/notify', need, limit('notify', 20, HOUR, true), wrap(async (req, res) => {
    const lat = num(req.body.lat), lng = num(req.body.lng);
    const where = validPos(lat, lng) ? ` Location: https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}` : '';
    res.json({ notified: await notifyContacts(contactsOf(req.user.id), `${req.user.name} is asking you to check in on her.${where} (SaveHer)`) });
  }));

  app.post('/api/track/start', need, limit('track', 20, HOUR, true), wrap(async (req, res) => {
    const lat = num(req.body.lat), lng = num(req.body.lng), hours = Math.min(12, Math.max(1, Number(req.body.hours) || 4));
    const token = newTrack(req.user.id, 'journey', lat, lng, hours), url = `${baseUrl(req)}/t/${token}`;
    const contacts = contactsOf(req.user.id);
    const result = req.body.notify === false ? null : await notifyContacts(contacts, `${req.user.name} is sharing her live location with you on SaveHer: ${url}`);
    res.status(201).json({ token, url, contacts: contacts.length, notified: result });
  }));
  app.post('/api/track/:token/ping', need, (req, res) => {
    const t = db.prepare('SELECT * FROM tracks WHERE token = ? AND user_id = ?').get(req.params.token, req.user.id);
    const lat = num(req.body.lat), lng = num(req.body.lng);
    if (!trackActive(t)) return res.status(410).json({ error: 'Sharing has ended.' });
    if (!validPos(lat, lng)) return res.status(400).json({ error: 'Bad position.' });
    const now = Date.now();
    db.prepare('UPDATE tracks SET last_lat=?, last_lng=?, last_acc=?, last_at=? WHERE token=?').run(lat, lng, num(req.body.accuracy) || null, now, t.token);
    db.prepare('INSERT INTO track_points(token,lat,lng,at) VALUES(?,?,?,?)').run(t.token, lat, lng, now);
    db.prepare('DELETE FROM track_points WHERE token = ? AND id NOT IN (SELECT id FROM track_points WHERE token = ? ORDER BY id DESC LIMIT 200)').run(t.token, t.token);
    res.json({ ok: true, expiresAt: t.expires_at });
  });
  app.post('/api/track/:token/stop', need, (req, res) => {
    db.prepare('UPDATE tracks SET active = 0 WHERE token = ? AND user_id = ?').run(req.params.token, req.user.id);
    db.prepare("UPDATE sos_events SET status = 'resolved' WHERE token = ? AND user_id = ? AND status = 'active'").run(req.params.token, req.user.id);
    res.json({ ok: true });
  });
  app.get('/api/track/mine/active', need, (req, res) => {
    const t = db.prepare("SELECT token, kind, started_at, expires_at FROM tracks WHERE user_id = ? AND kind = 'journey' AND active = 1 AND expires_at > ? ORDER BY started_at DESC LIMIT 1").get(req.user.id, Date.now());
    res.json({ track: t ? { ...t, url: `${baseUrl(req)}/t/${t.token}` } : null });
  });
  // Public: anyone holding the secret link. First name only; nothing is shown once sharing has ended.
  app.get('/api/track/:token', limit('trackview', 240, HOUR), (req, res) => {
    res.set('Cache-Control', 'no-store');
    const t = db.prepare('SELECT t.*, u.name FROM tracks t JOIN users u ON u.id = t.user_id WHERE t.token = ?').get(req.params.token);
    if (!t) return res.status(404).json({ error: 'This link is not valid.' });
    if (!trackActive(t)) return res.json({ active: false, name: firstName(t.name) });
    const trail = db.prepare('SELECT lat,lng,at FROM track_points WHERE token = ? ORDER BY id DESC LIMIT 60').all(t.token).reverse();
    res.json({ active: true, name: firstName(t.name), kind: t.kind, startedAt: t.started_at, expiresAt: t.expires_at,
      position: t.last_lat == null ? null : { lat: t.last_lat, lng: t.last_lng, accuracy: t.last_acc, at: t.last_at }, trail });
  });

  // ---------- community ----------
  app.get('/api/community', need, (req, res) => {
    const members = db.prepare('SELECT COUNT(*) c FROM users WHERE community = 1').get().c;
    const reportsWeek = db.prepare('SELECT COUNT(*) c FROM reports WHERE is_demo = 0 AND created_at > ?').get(Date.now() - 7 * DAY).c;
    const joined = !!req.user.community;
    const posts = joined ? db.prepare(`SELECT p.id, p.body, p.created_at, p.user_id, u.name FROM posts p JOIN users u ON u.id = p.user_id
      WHERE p.hidden = 0 ORDER BY p.id DESC LIMIT 30`).all().map(p => ({ id: p.id, body: p.body, at: p.created_at, author: firstName(p.name), mine: p.user_id === req.user.id })) : [];
    res.json({ joined, members, reportsWeek, posts });
  });
  app.post('/api/community/join', need, (req, res) => { db.prepare('UPDATE users SET community = 1 WHERE id = ?').run(req.user.id); res.json({ ok: true }); });
  app.post('/api/community/leave', need, (req, res) => { db.prepare('UPDATE users SET community = 0 WHERE id = ?').run(req.user.id); res.json({ ok: true }); });
  app.post('/api/posts', need, limit('post', 20, HOUR, true), (req, res) => {
    if (!req.user.community) return res.status(403).json({ error: 'Join the community to post.' });
    const body = clean(req.body.body, 400);
    if (body.length < 2) return res.status(400).json({ error: 'Write something first.' });
    db.prepare('INSERT INTO posts(user_id,body,created_at) VALUES(?,?,?)').run(req.user.id, body, Date.now());
    res.status(201).json({ ok: true });
  });
  app.post('/api/posts/:id/flag', need, (req, res) => {
    const id = Number(req.params.id), p = db.prepare('SELECT user_id FROM posts WHERE id = ?').get(id);
    if (!p || p.user_id === req.user.id) return res.status(404).json({ error: 'Not found.' });
    db.prepare('INSERT OR IGNORE INTO post_flags(post_id,user_id) VALUES(?,?)').run(id, req.user.id);
    if (db.prepare('SELECT COUNT(*) c FROM post_flags WHERE post_id = ?').get(id).c >= 3) db.prepare('UPDATE posts SET hidden = 1 WHERE id = ?').run(id);
    res.json({ ok: true });
  });
  app.delete('/api/posts/:id', need, (req, res) => { db.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id); res.json({ ok: true }); });

  // ---------- misc ----------
  app.get('/api/helplines', (req, res) => res.json({ helplines: HELPLINES }));
  app.get('/api/config', (req, res) => res.json({ smsMode: configured() ? 'twilio' : 'manual', demo: db.prepare('SELECT COUNT(*) c FROM reports WHERE is_demo = 1').get().c > 0 }));
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // ---------- static ----------
  const pub = path.join(__dirname, '..', 'public');
  app.get('/t/:token', (req, res) => { res.set('Cache-Control', 'no-store').sendFile(path.join(pub, 'track.html')); });
  app.get('/sw.js', (req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(pub, 'sw.js')));
  app.use(express.static(pub, { maxAge: '1h', setHeaders: (res, p) => { if (p.endsWith('.html')) res.set('Cache-Control', 'no-cache'); } }));

  app.use((err, req, res, next) => { // eslint-disable-line
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That file is too large.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad request.' });
    console.error(err); res.status(500).json({ error: 'Something went wrong on our side. Try again.' });
  });

  app.cleanup = () => { // privacy: location data is deleted a day after sharing ends
    const cut = Date.now() - DAY;
    db.prepare('DELETE FROM tracks WHERE expires_at < ? OR (active = 0 AND COALESCE(last_at, started_at) < ?)').run(cut, cut);
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    db.prepare('DELETE FROM sos_events WHERE created_at < ?').run(Date.now() - 30 * DAY);
  };
  return app;
}
module.exports = { createApp };
