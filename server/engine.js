'use strict';
/* SaveHer area-risk engine (JavaScript port of the SHE-Shield "Threat Momentum" engine).
   It works on AREA-LEVEL patterns in community reports only: no individuals, no exact addresses.
   Every threshold is an explicit, tunable assumption in CONFIG. */
const CONFIG = {
  cellDeg: 0.01,                 // grid cell size in degrees (about 1.1 km)
  windowMin: 180,                // compare the last 3h with the 3h before
  increaseRatio: 1.5, increaseMinDelta: 1.5,
  decreaseRatio: 0.67, decreaseMinDelta: 1.5,
  unverifiedWeight: 0.5,         // a report no one else has corroborated counts half
  perUserCap: 2,                 // one person can add at most 2 reports per cell per window
  elevatedAt: 2.0, highAt: 4.5,
  minReportsForAlert: 3,
};
const SEVERITY = { assault: 3, harassment: 2, stalking: 2, suspicious: 1, other: 1 };
const LABEL = { assault: 'assault', harassment: 'harassment', stalking: 'stalking', suspicious: 'suspicious activity', other: 'other concerns' };
const RANK = { Low: 0, Elevated: 1, High: 2 };
const CONF = { Low: 0, Medium: 1, High: 2 };
const MIN = 60 * 1000;

const cellOf = (lat, lng) => `${Math.floor(lat / CONFIG.cellDeg)}:${Math.floor(lng / CONFIG.cellDeg)}`;
const parseCell = c => c.split(':').map(Number);
const cellCenter = c => { const [a, b] = parseCell(c); return [(a + .5) * CONFIG.cellDeg, (b + .5) * CONFIG.cellDeg]; };
const cellBounds = c => { const [a, b] = parseCell(c), d = CONFIG.cellDeg; return [[a * d, b * d], [(a + 1) * d, (b + 1) * d]]; };
function neighbours(c, r = 1) {
  const [a, b] = parseCell(c), out = [];
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) out.push(`${a + i}:${b + j}`);
  return out;
}

// reports: rows of one cell with {user_id, category, verified, created_at}
function cellState(cell, reports, now = Date.now()) {
  const W = CONFIG.windowMin * MIN;
  const inCell = reports.filter(r => r.cell === cell && r.created_at <= now && r.created_at > now - 2 * W);
  // corroborated = flagged verified, or another person reported the same category here in the same window
  const corroborated = r => !!r.verified || inCell.some(o =>
    o.user_id !== r.user_id && o.category === r.category && Math.abs(o.created_at - r.created_at) <= W);
  const capped = list => { const seen = {}; return list.filter(r => (seen[r.user_id] = (seen[r.user_id] || 0) + 1) <= CONFIG.perUserCap); };
  const recent = capped(inCell.filter(r => r.created_at > now - W));
  const prev = capped(inCell.filter(r => r.created_at <= now - W));
  const score = l => l.reduce((s, r) => s + (SEVERITY[r.category] || 1) * (corroborated(r) ? 1 : CONFIG.unverifiedWeight), 0);
  const sr = score(recent), sp = score(prev);
  const level = sr >= CONFIG.highAt ? 'High' : sr >= CONFIG.elevatedAt ? 'Elevated' : 'Low';
  let momentum;
  if (sp === 0) momentum = sr >= CONFIG.increaseMinDelta ? 'Increasing' : 'Stable';
  else if (sr / sp >= CONFIG.increaseRatio && sr - sp >= CONFIG.increaseMinDelta) momentum = 'Increasing';
  else if (sr / sp <= CONFIG.decreaseRatio && sp - sr >= CONFIG.decreaseMinDelta) momentum = 'Decreasing';
  else momentum = 'Stable';
  // confidence: enough reports, from several different people, partly corroborated
  const n = recent.length, people = new Set(recent.map(r => r.user_id)).size;
  const corr = recent.filter(corroborated).length;
  let confidence = 'Low';
  if (n >= CONFIG.minReportsForAlert) {
    const pts = (people >= 3 ? 2 : people >= 2 ? 1 : 0) + 1 + (corr / n >= 0.5 ? 1 : 0);
    confidence = pts >= 3 ? 'High' : pts >= 2 ? 'Medium' : 'Low';
  }
  const cats = {};
  recent.forEach(r => { cats[r.category] = (cats[r.category] || 0) + 1; });
  const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
  const latest = recent.reduce((m, r) => Math.max(m, r.created_at), 0) || null;
  return {
    cell, level, momentum, confidence, score: +sr.toFixed(2), prevScore: +sp.toFixed(2),
    nRecent: n, nPrev: prev.length, people, cats, topCategory: top ? top[0] : null, latest,
    alert: momentum === 'Increasing' && RANK[level] >= 1 && CONF[confidence] >= 1,
  };
}

// Plain-language status for one cell + its neighbours. Never claims an area is "safe":
// absence of reports is not evidence of safety.
function areaStatus(cells, now = Date.now()) {
  const worst = cells.reduce((w, s) => (!w || RANK[s.level] > RANK[w.level] || (RANK[s.level] === RANK[w.level] && s.score > w.score)) ? s : w, null);
  const alerts = cells.filter(s => s.alert).length;
  const level = worst ? worst.level : 'Low';
  const label = level === 'High' ? 'Risk nearby' : level === 'Elevated' ? 'Caution nearby' : 'No active alerts';
  const detail = level === 'High' ? 'Several recent reports in your area. Stay aware and keep your phone charged.'
    : level === 'Elevated' ? 'Some recent reports in your area. Consider main roads and sharing your journey.'
    : 'No active alerts in your area. Reports are community-sourced, so this is not a guarantee of safety.';
  return { level, label, detail, alerts, updatedAt: now };
}

function describe(s, hours = CONFIG.windowMin / 60) {
  const cats = Object.entries(s.cats).map(([k, v]) => `${v} ${LABEL[k] || k}`).join(', ');
  return `${s.nRecent} report${s.nRecent === 1 ? '' : 's'} in the last ${hours} hours (${cats}) compared with ${s.nPrev} in the 3 hours before. ` +
    `Confidence: ${s.confidence}. This is a pattern in community reports, not confirmed wrongdoing.`;
}

module.exports = { CONFIG, SEVERITY, LABEL, cellOf, cellCenter, cellBounds, neighbours, cellState, areaStatus, describe };
