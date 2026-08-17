# Tee Time Booking — two part demo

A working demo of a simple tee time booking system for golf courses, in two halves:

1. **`book.html` — the golfer booking page.** Pick a day, party size, and holes; see live
   availability and pricing; book with a name, phone, and email; get a confirmation number.
2. **`teesheet.html` — the pro shop tee sheet.** Every tee time for the day on one screen, with
   online bookings and walk-ups together, check-in, cancellations, maintenance blocks, day
   totals, and a clean print layout.

`index.html` is the front door to send to a lead — it explains both halves and suggests a short
walkthrough.

The two halves share one data layer, so **a tee time booked on the public page shows up on the pro
shop sheet**. That is the point of the demo.

## Live demo

<https://stevejuniormc.github.io/Golf-booking-software/>

Every push to `claude/golf-tee-booking-demo-pudsgd` republishes the site via
`.github/workflows/pages.yml`. The site is served from the repo root exactly as the files sit
here — there is no build step.

## Running it locally

No build step, no dependencies, no server-side code. Either:

```bash
# recommended — full behaviour including saved changes
python3 -m http.server 8000
# then open http://localhost:8000
```

or just double-click `index.html`. Opening the files straight from disk works, but some browsers
block local storage on `file://` URLs, in which case changes are kept in memory only and are
forgotten on reload. The tee sheet warns you when that happens.

To send it to a lead, drop the folder on any static host (GitHub Pages, Netlify, S3) and share the
link.

## Design

Deliberately plain: black on white, heavy borders, large type, system fonts. Color appears only
where it carries meaning — open, spots left, full, checked in, blocked — and every one of those
states is labelled in words too, so the sheet still reads correctly in black and white and when
printed.

## Files

```
index.html          demo front door
book.html           part 1 — golfer booking page
teesheet.html       part 2 — pro shop tee sheet
assets/base.css     shared stylesheet
assets/data.js      shared data layer: course setup, pricing, demo bookings, storage
assets/book.js      booking page behaviour
assets/sheet.js     tee sheet behaviour
```

## Demo data

Bookings are generated from the date with a seeded random number generator, so the sheet looks the
same every time you open it — prime morning times busy, twilight quiet, weekends fuller than
weekdays. Anything you change during a demo is layered on top and saved in the browser.
**Reset demo** on the tee sheet clears those changes and restores the starting sheet.

## Configuring it for a specific course

Everything a course would change first lives in the `COURSE` object at the top of
`assets/data.js`:

| Setting | What it controls |
| --- | --- |
| `name`, `tagline`, `phone` | Shown across both pages |
| `firstTee`, `lastTee`, `intervalMinutes` | How many tee times a day exist (default 6:30 AM–6:00 PM, every 10 min) |
| `slotSize` | Players per tee time (default 4) |
| `rates.weekday18`, `rates.weekend18` | Base green fees |
| `rates.nineHoleFactor` | 9 hole price as a share of 18 (default 0.6) |
| `rates.twilightAfter`, `rates.twilightFactor` | When twilight starts and its discount |
| `rates.cartPerPlayer` | Cart fee per player |
| `policy` | Cancellation text shown to golfers |

Change those values and both pages follow.

## What a production version would add

The demo intentionally stops short of the parts that need a backend. The next steps would be a
server and database so bookings are shared across devices, payment capture, confirmation emails
and SMS reminders, staff logins, member rates and recurring league blocks, and reporting across
seasons.
