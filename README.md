# SaveHer

Safe. Alert. Empowered. A personal safety app for South Africa: SOS, live location sharing with trusted contacts,
a community safety map, incident reporting, safety tips and support. Evolved from the SHE-Shield prototype: its
"Threat Momentum" risk engine now runs on real community reports instead of a scripted scenario.

Mobile-first web app (installable PWA) with a Node.js + Express + SQLite backend. No build step.

## Run it

Needs Node 22.13 or newer.

```bash
npm install
npm run seed      # optional: sample Johannesburg reports so the map and alerts have something to show
npm start         # http://localhost:8000
npm test          # 22 tests: engine, API, security rules, and the real UI in jsdom
```

Location, vibration and "Add to home screen" need HTTPS on a real phone (localhost is exempt). Deploy to Render with
`render.yaml`, or anywhere that runs Node. Set `PUBLIC_URL` so the live-location links are correct.

## What is real

| Screen | What it does |
|---|---|
| Sign up / sign in | Accounts, scrypt password hashing, httpOnly session cookie, rate limits, delete-my-account |
| Home | Safety status for her current location from the engine, latest alerts, SOS (hold 3 s), share location |
| SOS | Hold 3 s: gets GPS, creates an SOS, starts live tracking, texts every trusted contact a private tracking link. "I'm safe" and "False alarm" notify contacts. If the server is unreachable it falls back to a pre-filled SMS from her own phone, plus Call 112 / 10111 |
| Live tracking | `watchPosition` pings the server; contacts open `/t/<secret>` (no account) and see her moving on a map. First name only. Ends when she stops or on expiry, and the data is purged a day later |
| Safety map | OpenStreetMap + engine cells (Caution / Risk) + nearby police stations and hospitals pulled live from OpenStreetMap |
| Alerts | Area alerts with plain-language reasons and a confidence level |
| Report incident | Category, details, optional photo (resized on device, JPEG only, visible only to her). Stored to about 100 m, never exact |
| Safety tips / Support | Tips, trusted contacts (max 5), community feed with flagging (3 flags hides a post), verified SA helplines |

## Decisions worth knowing

- **It never says "you're safe".** The mockup says "All Clear". No reports does not mean no danger, so the app says
  "No active alerts" and says why. Alerts only fire when several different people report a rising pattern;
  one person cannot create an alert by repeating reports.
- **SMS is the one thing that needs your account.** A browser cannot silently text anyone. Add Twilio credentials
  (`.env.example`) and the server sends SMS itself. Without them the app is honest about it and opens a pre-filled SMS.
  With Twilio and a partial failure, she still gets the manual link for the contacts who were missed.
- **Demo data is labelled.** `npm run seed` adds flagged sample reports and the UI shows a "Demo data" banner.
  `npm run seed -- --clear` removes them.
- **Engine thresholds are assumptions**, all in `server/engine.js` `CONFIG` (cell size about 1.1 km, 3 h windows,
  uncorroborated reports count half, a person counts at most twice per cell). Tune them against real data.

## Before real users

- Re-verify `server/helplines.js` (numbers change; the GBV Command Centre line has had outages).
- Add moderation for community posts and a way to review reports. Photos are stored on disk and never public.
- Privacy: this holds sensitive location data. Write a POPIA privacy notice, and decide retention (currently: tracks purged
  24 h after ending, SOS records 30 days, reports kept until the user deletes her account).
- OpenStreetMap tile and Nominatim/Overpass servers have fair-use policies. For real traffic use a commercial tile provider and your own geocoder.
- `node:sqlite` is still marked experimental in Node. For heavy load move to Postgres (Supabase) behind the same queries.
- A web app cannot trigger SOS with the screen locked or the app closed. For that, build the React Native / Expo version
  (power-button or volume-button triggers, background location). The API here is ready to serve it.
