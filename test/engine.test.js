'use strict';
const test = require('node:test');
const assert = require('node:assert');
const E = require('../server/engine');

const MIN = 60000, now = Date.now(), cell = E.cellOf(-26.1076, 28.0567);
const R = (user, category, minsAgo, verified = 0) => ({ cell, user_id: user, category, verified, created_at: now - minsAgo * MIN });

test('no reports: low, stable, no alert, and never described as "safe"', () => {
  const s = E.cellState(cell, [], now);
  assert.equal(s.level, 'Low'); assert.equal(s.alert, false);
  const a = E.areaStatus([s], now);
  assert.equal(a.label, 'No active alerts'); assert.match(a.detail, /not a guarantee/);
});

test('one person repeating reports cannot create an alert', () => {
  const spam = Array.from({ length: 10 }, (_, i) => R(1, 'assault', 5 + i));
  const s = E.cellState(cell, spam, now);
  assert.equal(s.confidence, 'Low'); // one reporter
  assert.ok(s.score <= E.CONFIG.perUserCap * 3 * E.CONFIG.unverifiedWeight + 1e-9 || s.score <= 6);
  assert.equal(s.alert, false);
});

test('several people reporting a rising pattern raises an alert', () => {
  const reports = [R(1, 'harassment', 20), R(2, 'harassment', 40), R(3, 'suspicious', 60), R(4, 'harassment', 90), R(2, 'stalking', 30)];
  const s = E.cellState(cell, reports, now);
  assert.equal(s.momentum, 'Increasing'); assert.ok(['Elevated', 'High'].includes(s.level));
  assert.ok(['Medium', 'High'].includes(s.confidence)); assert.equal(s.alert, true);
});

test('a falling pattern is reported as Decreasing and does not alert', () => {
  const old = [R(1, 'harassment', 200), R(2, 'harassment', 210), R(3, 'harassment', 220), R(4, 'assault', 230)];
  const s = E.cellState(cell, [...old, R(5, 'other', 10)], now);
  assert.equal(s.momentum, 'Decreasing'); assert.equal(s.alert, false);
});

test('reports older than two windows are ignored', () => {
  assert.equal(E.cellState(cell, [R(1, 'assault', 1000), R(2, 'assault', 1001)], now).nRecent, 0);
});

test('cell helpers round-trip', () => {
  const c = E.cellOf(-26.1076, 28.0567), [la, ln] = E.cellCenter(c);
  assert.equal(E.cellOf(la, ln), c); assert.equal(E.neighbours(c, 1).length, 9);
});
