/* ==========================================================================
   Course setup wizard — and, for a course that already finished it, the
   Course settings editor. Four steps, all state in the form itself, one
   setDoc when Finish is pressed.
   ========================================================================== */

import { db } from './firebase-init.js';
import { requireAuth } from './guard.js';
import { formatTime, minutesOf } from './lib/teetime.js';
import {
  doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';

const RATE_ROWS = ['eighteen', 'nine', 'twilight'];
const RATE_COLS = ['weekdayWalk', 'weekdayRide', 'weekendWalk', 'weekendRide'];

const DEFAULT_RATES = {
  eighteen: { weekdayWalk: 45, weekdayRide: 60, weekendWalk: 65, weekendRide: 80 },
  nine:     { weekdayWalk: 25, weekdayRide: 35, weekendWalk: 35, weekendRide: 45 },
  twilight: { weekdayWalk: 30, weekdayRide: 40, weekendWalk: 40, weekendRide: 50 }
};

/* Zones most US courses live in, pinned to the top of the list. */
const PINNED_ZONES = [
  ['America/New_York', 'Eastern — New York'],
  ['America/Chicago', 'Central — Chicago'],
  ['America/Denver', 'Mountain — Denver'],
  ['America/Phoenix', 'Arizona — Phoenix'],
  ['America/Los_Angeles', 'Pacific — Los Angeles'],
  ['America/Anchorage', 'Alaska — Anchorage'],
  ['Pacific/Honolulu', 'Hawaii — Honolulu']
];

const STEP_LABELS = ['', 'Next: tee times →', 'Next: green fees →', 'Next: time zone →', ''];

let step = 1;
let mode = 'new';           // 'new' | 'settings'
let existing = null;        // the current course doc data in settings mode
let uid = null;

const el = {
  kicker: document.getElementById('kicker'),
  headerSub: document.getElementById('header-sub'),
  error: document.getElementById('error'),
  form: document.getElementById('wizard'),
  back: document.getElementById('back'),
  next: document.getElementById('next'),
  name: document.getElementById('c-name'),
  phone: document.getElementById('c-phone'),
  first: document.getElementById('t-first'),
  last: document.getElementById('t-last'),
  countStrong: document.querySelector('#count-line strong'),
  countMuted: document.querySelector('#count-line .muted'),
  twilightRow: document.getElementById('twilight-row'),
  twilightHint: document.getElementById('twilight-hint'),
  twilightAfterField: document.getElementById('twilight-after-field'),
  twilightAfter: document.getElementById('t-twilight'),
  tz: document.getElementById('c-tz'),
  tzNow: document.getElementById('tz-now'),
  review: document.getElementById('review')
};

const sections = Array.from(document.querySelectorAll('[data-step]'));

function radio(name) {
  const checked = document.querySelector('input[name="' + name + '"]:checked');
  return checked ? checked.value : '';
}
function setRadio(name, value) {
  const input = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
  if (input) input.checked = true;
}
function rateInput(row, col) { return document.getElementById('r-' + row + '-' + col); }

function fail(message) {
  el.error.textContent = message;
  el.error.hidden = false;
  el.error.scrollIntoView({ block: 'nearest' });
  return false;
}

/* ---------- Reading the form ---------- */

function readRates() {
  const rates = {};
  for (const row of RATE_ROWS) {
    rates[row] = {};
    for (const col of RATE_COLS) {
      rates[row][col] = Math.round(Number(rateInput(row, col).value));
    }
  }
  rates.twilight.enabled = radio('tw') === 'yes';
  rates.twilight.after = el.twilightAfter.value || '15:00';
  return rates;
}

function readCourse() {
  return {
    name: el.name.value.trim(),
    phone: el.phone.value.trim(),
    timezone: el.tz.value,
    firstTee: el.first.value,
    lastTee: el.last.value,
    intervalMinutes: Number(radio('interval')),
    slotSize: Number(radio('slot')),
    backNine: radio('bn') === 'yes',
    rates: readRates(),
    setupComplete: true
  };
}

function slotsPerDay() {
  const first = minutesOf(el.first.value || '00:00');
  const last = minutesOf(el.last.value || '00:00');
  const interval = Number(radio('interval'));
  if (last < first) return 0;
  return Math.floor((last - first) / interval) + 1;
}

/* ---------- Validation per step ---------- */

function validateStep(n) {
  el.error.hidden = true;
  if (n === 1) {
    if (!el.name.value.trim()) return fail('Give your course a name — it goes at the top of your sheet.');
  }
  if (n === 2) {
    if (!el.first.value || !el.last.value) return fail('Set both the first and the last tee time.');
    if (minutesOf(el.last.value) < minutesOf(el.first.value) + Number(radio('interval'))) {
      return fail('The last tee time has to be after the first one.');
    }
  }
  if (n === 3) {
    const rows = radio('tw') === 'yes' ? RATE_ROWS : ['eighteen', 'nine'];
    for (const row of rows) {
      for (const col of RATE_COLS) {
        const v = rateInput(row, col).value;
        if (v === '' || Number(v) < 0 || !isFinite(Number(v))) {
          return fail('Fill in every price — whole dollars, 0 is allowed.');
        }
      }
    }
    if (radio('tw') === 'yes' && !el.twilightAfter.value) {
      return fail('Set the time your twilight rate starts.');
    }
  }
  return true;
}

/* ---------- Step display ---------- */

function goto(n) {
  step = n;
  for (const s of sections) s.hidden = Number(s.dataset.step) !== n;
  el.back.hidden = n === 1;
  if (n === 4) {
    el.next.textContent = mode === 'settings' ? 'Save changes' : 'Finish setup — open my tee sheet';
    renderReview();
    tickClock();
  } else {
    el.next.textContent = STEP_LABELS[n];
  }
  el.kicker.textContent = mode === 'settings'
    ? 'Course settings · Step ' + n + ' of 4'
    : 'Course setup · Step ' + n + ' of 4';
  el.error.hidden = true;
  window.scrollTo(0, 0);
}

function updateCountLine() {
  const n = slotsPerDay();
  el.countStrong.textContent = "That's " + n + ' tee time' + (n === 1 ? '' : 's') + ' a day.';
  el.countMuted.textContent = el.first.value && el.last.value
    ? '(' + formatTime(el.first.value) + ' to ' + formatTime(el.last.value) + ', every ' + radio('interval') + ' minutes.)'
    : '';
}

function updateTwilightVisibility() {
  const off = radio('tw') === 'no';
  el.twilightRow.hidden = off;
  el.twilightAfterField.hidden = off;
  el.twilightHint.hidden = off;
}

/* ---------- Time zone picker ---------- */

function fillTimezones(selected) {
  const all = (typeof Intl.supportedValuesOf === 'function')
    ? Intl.supportedValuesOf('timeZone') : PINNED_ZONES.map(function (z) { return z[0]; });
  const pinnedIds = PINNED_ZONES.map(function (z) { return z[0]; });
  let html = '';
  for (const z of PINNED_ZONES) {
    html += '<option value="' + z[0] + '">' + z[1] + '</option>';
  }
  html += '<option disabled>———————————</option>';
  for (const z of all) {
    if (!pinnedIds.includes(z)) html += '<option value="' + z + '">' + z.replace(/_/g, ' ') + '</option>';
  }
  el.tz.innerHTML = html;
  el.tz.value = selected;
  if (!el.tz.value) el.tz.value = 'America/New_York';
}

function tickClock() {
  try {
    const now = new Intl.DateTimeFormat('en-US', {
      timeZone: el.tz.value, hour: 'numeric', minute: '2-digit'
    }).format(new Date());
    el.tzNow.textContent = 'Right now at your course: ' + now + '.';
  } catch (e) {
    el.tzNow.textContent = '';
  }
}

/* ---------- Review ---------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function priceLine(row) {
  const r = readRates()[row];
  return '<strong>$' + r.weekdayWalk + ' walk / $' + r.weekdayRide + ' ride</strong> weekday · ' +
         '<strong>$' + r.weekendWalk + ' / $' + r.weekendRide + '</strong> weekend';
}

function renderReview() {
  const c = readCourse();
  const lines = [
    ['Course', '<strong>' + esc(c.name) + '</strong>' + (c.phone ? ' · ' + esc(c.phone) : ''), 1],
    ['Tee times', '<strong>' + formatTime(c.firstTee) + ' – ' + formatTime(c.lastTee) + ', every ' +
      c.intervalMinutes + ' minutes</strong> · ' + c.slotSize + ' players per time', 2],
    ['Back nine', c.backNine ? '<strong>10th-tee starts on</strong>' : '<strong>No 10th-tee starts</strong>', 2],
    ['18 holes', priceLine('eighteen'), 3],
    ['9 holes', priceLine('nine'), 3],
    ['Twilight', c.rates.twilight.enabled
      ? '<strong>From ' + formatTime(c.rates.twilight.after) + ':</strong> ' + priceLine('twilight')
      : '<strong>No twilight rate</strong>', 3]
  ];
  el.review.innerHTML = lines.map(function (l) {
    return '<div class="line"><span class="muted">' + l[0] + '</span><span>' + l[1] +
      ' &nbsp;<a href="#" data-goto="' + l[2] + '">Edit</a></span></div>';
  }).join('');
}

/* ---------- Prefill ---------- */

function prefill(c) {
  el.name.value = c.name || '';
  el.phone.value = c.phone || '';
  el.first.value = c.firstTee || '06:30';
  el.last.value = c.lastTee || '18:00';
  setRadio('interval', String(c.intervalMinutes || 10));
  setRadio('slot', String(c.slotSize || 4));
  setRadio('bn', c.backNine ? 'yes' : 'no');
  const rates = c.rates || DEFAULT_RATES;
  for (const row of RATE_ROWS) {
    for (const col of RATE_COLS) {
      const fallback = DEFAULT_RATES[row][col];
      const v = rates[row] && typeof rates[row][col] === 'number' ? rates[row][col] : fallback;
      rateInput(row, col).value = v;
    }
  }
  const tw = rates.twilight || {};
  setRadio('tw', tw.enabled === false ? 'no' : 'yes');
  el.twilightAfter.value = tw.after || '15:00';
}

/* ---------- Save ---------- */

async function save() {
  const c = readCourse();
  c.updatedAt = serverTimestamp();
  if (mode === 'settings') {
    c.createdAt = existing.createdAt || serverTimestamp();
    c.tourDone = existing.tourDone === true;
  } else {
    c.createdAt = serverTimestamp();
    c.tourDone = false;
  }
  await setDoc(doc(db, 'courses', uid), c);
  window.location.replace('sheet.html');
}

/* ---------- Wire-up ---------- */

requireAuth(async function (user) {
  uid = user.uid;
  const snap = await getDoc(doc(db, 'courses', uid));
  if (snap.exists() && snap.data().setupComplete === true) {
    mode = 'settings';
    existing = snap.data();
    el.headerSub.textContent = 'Course settings';
    prefill(existing);
  } else {
    prefill({ rates: DEFAULT_RATES });
  }
  fillTimezones((existing && existing.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone);
  updateCountLine();
  updateTwilightVisibility();
  goto(1);
});

el.form.addEventListener('submit', function (e) {
  e.preventDefault();
  if (!validateStep(step)) return;
  if (step < 4) return goto(step + 1);
  el.next.disabled = true;
  save().catch(function (err) {
    el.next.disabled = false;
    fail(err && err.code === 'permission-denied'
      ? "Something in the form isn't valid — go back and check each step."
      : "Couldn't save — check your connection and try again.");
  });
});

el.back.addEventListener('click', function () { if (step > 1) goto(step - 1); });

el.review && el.review.addEventListener('click', function (e) {
  const link = e.target.closest('[data-goto]');
  if (!link) return;
  e.preventDefault();
  goto(Number(link.getAttribute('data-goto')));
});

for (const id of ['t-first', 't-last']) {
  document.getElementById(id).addEventListener('change', updateCountLine);
}
document.querySelectorAll('input[name="interval"]').forEach(function (input) {
  input.addEventListener('change', updateCountLine);
});
document.querySelectorAll('input[name="tw"]').forEach(function (input) {
  input.addEventListener('change', updateTwilightVisibility);
});
el.tz.addEventListener('change', tickClock);
setInterval(function () { if (step === 4) tickClock(); }, 30000);
