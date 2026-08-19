# YourTeeSheet

A free digital tee sheet for golf pro shops, live at **https://yourteesheet.web.app**.

A course pro signs up with an email and password, answers a five-minute setup wizard
(tee times, green fees, time zone), takes a one-minute tour, and runs their daily tee
sheet from the counter: walk-ups and phone bookings, check-ins, edits, moves,
maintenance blocks, and a clean printout for the starter. The tee sheet is free
forever; a golfer-facing online-booking add-on is planned as a separate paid product.

## Stack

Plain HTML/JS/CSS — no build step, no npm. Firebase JS SDK v12.4.0 loaded as ES
modules from the official CDN. Backend is Firebase: email/password Auth, Firestore
with security rules, and Hosting (project `studio-6494679748-de621`, site
`yourteesheet`).

## Pages

| Page | What it is |
| --- | --- |
| `index.html` | Marketing landing page (loads no Firebase) |
| `signup.html` / `login.html` / `reset.html` | Account pages |
| `setup.html` | First-run course setup wizard (4 steps) |
| `settings.html` | Everything from the wizard on one page, for quick edits |
| `sheet.html` | The tee sheet app |
| `demo/teesheet.html` | Public live demo of the sheet on seeded localStorage data |

`demo/book.html` (the old golfer booking demo) is kept in the repo for the future
booking add-on but is **not deployed** (see the hosting ignore list) and no longer
matches `demo/assets/data.js`, which now uses the product's walk/ride rate model.
The `mockups/` folder holds the pre-build design mockups; also not deployed.

## JavaScript layout

- `js/lib/teetime.js` — pure helpers: dates, times, slot keys, pricing, `dayRows()`.
- `js/firebase-init.js` — Firebase app/auth/db with offline persistence.
- `js/guard.js` — page guards (auth required, setup required, bounce signed-in users).
- `js/store.js` — TeeStore: live snapshot listeners plus transactional mutations
  (book, edit, cancel, check-in, block/unblock, block range, move across days).
- `js/sheet.js`, `js/setup.js`, `js/settings.js`, `js/auth-ui.js`, `js/tour.js` —
  one controller per page; `js/tour.js` is the first-login overlay tour.

## Data model

One Firestore doc per course, keyed by the owner's auth uid; one doc per course per
day, holding a `slots` map keyed `F09:40` / `B10:20` (front/back tee + time). Only
slots with content exist. A slot is `{ blocked, note, groups[] }`; a blocked slot
with groups means "no further bookings" — the groups stay. Every write is a
transaction that re-checks capacity, so two counter devices can't oversell a time.
Rules (`firestore.rules`) fence everything to the owning uid and type-check the
course document.

## Design rules

Black on white, heavy borders, 18px+ system type, no decorative color. Color only
carries meaning — green = open, gray = checked in, red = blocked — and every state
is also written in words, so the sheet reads correctly in black-and-white print.
No extreme bold weights (semibold for display type). The audience is course pros
who may not be computer people: big buttons, plain words, dollar amounts instead of
percentages.

## Local development

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

`localhost` is an authorized domain, so auth and Firestore work against the live
project. Test with throwaway `stevejuniormc+tN@gmail.com` accounts and delete them
(and their `courses/{uid}` docs) from the console afterwards.

## Deploy

```bash
firebase deploy --only hosting            # the site
firebase deploy --only firestore:rules    # security rules
```
