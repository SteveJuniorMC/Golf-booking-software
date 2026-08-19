/* ==========================================================================
   Course settings — every field from the setup wizard on one page, one Save.
   The wizard (setup.js) is for first-time setup only; accounts that finished
   it edit here.
   ========================================================================== */

import { db } from './firebase-init.js';
import { requireAuth } from './guard.js';
import { formatTime, minutesOf } from './lib/teetime.js';
import {
  doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';

const RATE_ROWS = ['eighteen', 'nine', 'twilight'];
const RATE_COLS = ['weekdayWalk', 'weekdayRide', 'weekendWalk', 'weekendRide'];

const PINNED_ZONES = [
  ['America/New_York', 'Eastern — New York'],
  ['America/Chicago', 'Central — Chicago'],
  ['America/Denver', 'Mountain — Denver'],
  ['America/Phoenix', 'Arizona — Phoenix'],
  ['America/Los_Angeles', 'Pacific — Los Angeles'],
  ['America/Anchorage', 'Alaska — Anchorage'],
  ['Pacific/Honolulu', 'Hawaii — Honolulu']
];

let uid = null;
let existing = null;

const el = {};
for (const id of ['error', 'settings-form', 'save', 'c-name', 'c-phone', 't-first', 't-last',
  'count-line', 'twilight-row', 'twilight-hint', 'twilight-after-field', 't-twilight',
  'c-tz', 'tz-now']) {
  el[id] = document.getElementById(id);
}

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

/* ---------- Form <-> course object ---------- */

function prefill(c) {
  el['c-name'].value = c.name || '';
  el['c-phone'].value = c.phone || '';
  el['t-first'].value = c.firstTee;
  el['t-last'].value = c.lastTee;
  setRadio('interval', String(c.intervalMinutes));
  setRadio('slot', String(c.slotSize));
  setRadio('bn', c.backNine ? 'yes' : 'no');
  for (const row of RATE_ROWS) {
    for (const col of RATE_COLS) {
      rateInput(row, col).value = c.rates[row][col];
    }
  }
  setRadio('tw', c.rates.twilight.enabled ? 'yes' : 'no');
  el['t-twilight'].value = c.rates.twilight.after;
}

function readCourse() {
  const rates = {};
  for (const row of RATE_ROWS) {
    rates[row] = {};
    for (const col of RATE_COLS) {
      rates[row][col] = Math.round(Number(rateInput(row, col).value));
    }
  }
  rates.twilight.enabled = radio('tw') === 'yes';
  rates.twilight.after = el['t-twilight'].value || '15:00';
  return {
    name: el['c-name'].value.trim(),
    phone: el['c-phone'].value.trim(),
    timezone: el['c-tz'].value,
    firstTee: el['t-first'].value,
    lastTee: el['t-last'].value,
    intervalMinutes: Number(radio('interval')),
    slotSize: Number(radio('slot')),
    backNine: radio('bn') === 'yes',
    rates: rates,
    setupComplete: true
  };
}

function validate() {
  el.error.hidden = true;
  if (!el['c-name'].value.trim()) return fail('Give your course a name — it goes at the top of your sheet.');
  if (!el['t-first'].value || !el['t-last'].value) return fail('Set both the first and the last tee time.');
  if (minutesOf(el['t-last'].value) < minutesOf(el['t-first'].value) + Number(radio('interval'))) {
    return fail('The last tee time has to be after the first one.');
  }
  const rows = radio('tw') === 'yes' ? RATE_ROWS : ['eighteen', 'nine'];
  for (const row of rows) {
    for (const col of RATE_COLS) {
      const v = rateInput(row, col).value;
      if (v === '' || Number(v) < 0 || !isFinite(Number(v))) {
        return fail('Fill in every price — whole dollars, 0 is allowed.');
      }
    }
  }
  if (radio('tw') === 'yes' && !el['t-twilight'].value) {
    return fail('Set the time your twilight rate starts.');
  }
  return true;
}

/* ---------- Live niceties ---------- */

function updateCountLine() {
  const first = el['t-first'].value, last = el['t-last'].value;
  const interval = Number(radio('interval'));
  const strong = el['count-line'].querySelector('strong');
  const muted = el['count-line'].querySelector('.muted');
  if (!first || !last || minutesOf(last) < minutesOf(first)) {
    strong.textContent = ''; muted.textContent = '';
    return;
  }
  const n = Math.floor((minutesOf(last) - minutesOf(first)) / interval) + 1;
  strong.textContent = "That's " + n + ' tee time' + (n === 1 ? '' : 's') + ' a day.';
  muted.textContent = '(' + formatTime(first) + ' to ' + formatTime(last) + ', every ' + interval + ' minutes.)';
}

function updateTwilightVisibility() {
  const off = radio('tw') === 'no';
  el['twilight-row'].hidden = off;
  el['twilight-after-field'].hidden = off;
  el['twilight-hint'].hidden = off;
}

function fillTimezones(selected) {
  const all = (typeof Intl.supportedValuesOf === 'function')
    ? Intl.supportedValuesOf('timeZone') : PINNED_ZONES.map(function (z) { return z[0]; });
  const pinnedIds = PINNED_ZONES.map(function (z) { return z[0]; });
  let html = '';
  for (const z of PINNED_ZONES) html += '<option value="' + z[0] + '">' + z[1] + '</option>';
  html += '<option disabled>———————————</option>';
  for (const z of all) {
    if (!pinnedIds.includes(z)) html += '<option value="' + z + '">' + z.replace(/_/g, ' ') + '</option>';
  }
  el['c-tz'].innerHTML = html;
  el['c-tz'].value = selected;
  if (!el['c-tz'].value) el['c-tz'].value = 'America/New_York';
}

function tickClock() {
  try {
    const now = new Intl.DateTimeFormat('en-US', {
      timeZone: el['c-tz'].value, hour: 'numeric', minute: '2-digit'
    }).format(new Date());
    el['tz-now'].textContent = 'Right now at your course: ' + now + '.';
  } catch (e) {
    el['tz-now'].textContent = '';
  }
}

/* ---------- Wire-up ---------- */

requireAuth(async function (user) {
  uid = user.uid;
  const snap = await getDoc(doc(db, 'courses', uid));
  if (!snap.exists() || snap.data().setupComplete !== true) {
    window.location.replace('setup.html');
    return;
  }
  existing = snap.data();
  prefill(existing);
  fillTimezones(existing.timezone);
  updateCountLine();
  updateTwilightVisibility();
  tickClock();
});

el['settings-form'].addEventListener('submit', function (e) {
  e.preventDefault();
  if (!validate()) return;
  const c = readCourse();
  c.createdAt = existing.createdAt || serverTimestamp();
  c.tourDone = existing.tourDone === true;
  c.updatedAt = serverTimestamp();
  el.save.disabled = true;
  setDoc(doc(db, 'courses', uid), c)
    .then(function () { window.location.replace('sheet.html'); })
    .catch(function (err) {
      el.save.disabled = false;
      fail(err && err.code === 'permission-denied'
        ? "Something in the form isn't valid — check each field."
        : "Couldn't save — check your connection and try again.");
    });
});

for (const id of ['t-first', 't-last']) {
  el[id].addEventListener('change', updateCountLine);
}
document.querySelectorAll('input[name="interval"]').forEach(function (input) {
  input.addEventListener('change', updateCountLine);
});
document.querySelectorAll('input[name="tw"]').forEach(function (input) {
  input.addEventListener('change', updateTwilightVisibility);
});
el['c-tz'].addEventListener('change', tickClock);
setInterval(tickClock, 30000);
