'use strict';
// Sends SMS to trusted contacts. With Twilio credentials in the environment the server sends them itself;
// without them the app falls back to a pre-filled SMS on the user's own phone ("manual" mode).
const DEFAULT_CC = process.env.DEFAULT_COUNTRY_CODE || '27'; // South Africa

function toE164(raw) {
  let s = String(raw || '').replace(/[\s\-()]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
  if (/^0\d{9}$/.test(s)) return '+' + DEFAULT_CC + s.slice(1);
  return null;
}

const configured = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN &&
  (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID));

async function sendOne(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const form = new URLSearchParams({ To: to, Body: body });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
  else form.set('From', process.env.TWILIO_FROM);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error('twilio ' + res.status);
}

async function notifyContacts(contacts, body) {
  const numbers = contacts.map(c => c.phone);
  const smsLink = numbers.length ? `sms:${numbers.join(',')}?&body=${encodeURIComponent(body)}` : null;
  if (!configured()) return { mode: 'manual', total: numbers.length, sent: 0, failed: 0, smsLink };
  const results = await Promise.allSettled(numbers.map(n => sendOne(n, body)));
  const sent = results.filter(r => r.status === 'fulfilled').length;
  // if some failed, still hand the user the manual link so nobody is left unreached
  return { mode: 'twilio', total: numbers.length, sent, failed: numbers.length - sent, smsLink: sent < numbers.length ? smsLink : null };
}

module.exports = { toE164, notifyContacts, configured };
