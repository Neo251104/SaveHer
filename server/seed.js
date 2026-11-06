'use strict';
// Demo data for showcasing SaveHer in Johannesburg. Every row is flagged is_demo and the app says so.
// Run again any time to refresh timestamps:  npm run seed      Remove it:  npm run seed -- --clear
const path = require('path');
const crypto = require('crypto');
const { open } = require('./db');
const E = require('./engine');

const db = open(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'saveher.db'));
db.prepare('DELETE FROM reports WHERE is_demo = 1').run();
if (process.argv.includes('--clear')) { db.prepare("DELETE FROM users WHERE email LIKE 'demo%@saveher.invalid'").run(); console.log('Demo data removed.'); process.exit(0); }

const ids = [];
for (let i = 1; i <= 6; i++) { // unloginable accounts so the engine sees distinct reporters
  const email = `demo${i}@saveher.invalid`;
  let u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!u) { const r = db.prepare('INSERT INTO users(name,email,pass_salt,pass_hash,created_at) VALUES(?,?,?,?,?)').run(`Demo ${i}`, email, 'x', crypto.randomBytes(32).toString('hex'), Date.now()); u = { id: Number(r.lastInsertRowid) }; }
  ids.push(u.id);
}
const MIN = 60000, now = Date.now(), jit = () => (Math.random() - 0.5) * 0.006;
// [name, lat, lng, [[category, minutesAgo], ...]]
const AREAS = [
  ['Sandton', -26.1076, 28.0567, [['suspicious', 200], ['harassment', 150], ['suspicious', 80], ['harassment', 55], ['stalking', 35], ['harassment', 20], ['assault', 12]]],
  ['Braamfontein', -26.1929, 28.0305, [['harassment', 230], ['suspicious', 190], ['harassment', 100], ['suspicious', 70], ['other', 40]]],
  ['Rosebank', -26.1467, 28.0436, [['suspicious', 250], ['harassment', 240], ['stalking', 230], ['harassment', 215], ['suspicious', 25]]],
  ['Midrand', -25.9992, 28.1263, [['suspicious', 120]]],
];
const ins = db.prepare('INSERT INTO reports(user_id,category,details,lat,lng,cell,verified,is_demo,created_at) VALUES(?,?,?,?,?,?,0,1,?)');
let n = 0;
for (const [, lat, lng, list] of AREAS) {
  const [cla, cln] = E.cellCenter(E.cellOf(lat, lng));
  list.forEach(([cat, ago], i) => { const la = cla + jit() * .8, ln = cln + jit() * .8; ins.run(ids[i % ids.length], cat, null, la, ln, E.cellOf(la, ln), now - ago * MIN); n++; });
}
console.log(`Seeded ${n} demo reports across ${AREAS.length} areas.`);
