/* ==========================================================================
   The first-login tour: a highlight box and a card of big words, stepped
   with Next/Back, skippable with Esc or the Skip link. The sheet calls
   startTour() on first login and again whenever Help is pressed.
   ========================================================================== */

function steps(backNine) {
  const list = [
    { target: null, title: 'This is your tee sheet.',
      body: "Every tee time for today is on this one page. It's free, and it stays free. One minute of tour, then it's all yours." },
    { target: '#date-nav', title: 'Pick a day.',
      body: 'Arrows move one day. Click the date to open a calendar — handy when someone calls to book next week.' },
    { target: '.spot--open', title: 'Add a booking.',
      body: 'Click any open space to add a walk-up or phone booking. You only ever type a name — everything else is two taps.', optional: true },
    { target: '.spot--group', title: 'Everything about a group is one click.',
      body: 'Click a group to check them in when they arrive, fix a detail, move them to another time or day, or cancel.', optional: true }
  ];
  if (backNine) {
    list.push({ target: '#sheet', title: 'Front and back.',
      body: 'Groups going off the 10th tee live in the Back nine strip. On a tablet, the Front/Back buttons switch between them.' });
  }
  list.push(
    { target: '#filter', title: 'Cut the noise.',
      body: "Show booked-only when you're working the day, open-only when someone's on the phone." },
    { target: '#block-range', title: 'Block times.',
      body: 'Maintenance, leagues, outings: block one time from its row, or a whole stretch with Block times.' },
    { target: '#print', title: 'Paper still works.',
      body: 'Print puts a clean copy on the counter for the starter.' },
    { target: '#help', title: "That's the whole tour.",
      body: 'Watch it again any time from Help. Go run your day.' }
  );
  return list;
}

/**
 * Run the tour. options: { backNine: bool, onDone: fn } — onDone fires once,
 * however the tour ends.
 */
export function startTour(options) {
  if (document.getElementById('tour-card')) return;   // one at a time

  const all = steps(!!options.backNine)
    .filter(function (s) { return !s.optional || document.querySelector(s.target); });
  let i = 0;
  let finished = false;

  const spot = document.createElement('div');
  spot.className = 'tour-spot';
  spot.hidden = true;

  const card = document.createElement('div');
  card.className = 'tour-card';
  card.id = 'tour-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'tour-title');
  card.innerHTML =
    '<div class="tour-card__head" id="tour-title"></div>' +
    '<div class="tour-card__body"><p id="tour-body"></p></div>' +
    '<div class="tour-card__foot">' +
      '<span class="tour-step" id="tour-step"></span>' +
      '<div class="btn-row">' +
        '<button class="tour-skip" id="tour-skip" type="button">Skip tour</button>' +
        '<button class="btn btn--small" id="tour-back" type="button">&larr; Back</button>' +
        '<button class="btn btn--small btn--primary" id="tour-next" type="button">Next &rarr;</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(spot);
  document.body.appendChild(card);

  function show() {
    const s = all[i];
    card.querySelector('#tour-title').textContent = s.title;
    card.querySelector('#tour-body').textContent = s.body;
    card.querySelector('#tour-step').textContent = 'Step ' + (i + 1) + ' of ' + all.length;
    card.querySelector('#tour-back').style.visibility = i === 0 ? 'hidden' : 'visible';
    card.querySelector('#tour-next').textContent = i === all.length - 1 ? 'Done' : 'Next →';

    const target = s.target && document.querySelector(s.target);
    if (!target) {
      spot.hidden = true;
      card.classList.add('tour-card--center');
      card.style.left = card.style.top = card.style.transform = '';
      card.style.boxShadow = '0 0 0 9999px rgba(0,0,0,.55)';
      return;
    }
    card.style.boxShadow = 'none';
    target.scrollIntoView({ block: 'center' });
    const r = target.getBoundingClientRect();
    spot.hidden = false;
    spot.style.left = (r.left - 6) + 'px';
    spot.style.top = (r.top - 6) + 'px';
    spot.style.width = (r.width + 12) + 'px';
    spot.style.height = (r.height + 12) + 'px';
    card.classList.remove('tour-card--center');
    card.style.transform = 'none';
    let top = r.bottom + 18;
    if (top + 240 > window.innerHeight) top = Math.max(12, r.top - 260);
    card.style.top = top + 'px';
    card.style.left = Math.min(Math.max(12, r.left), Math.max(12, window.innerWidth - 460)) + 'px';
  }

  function end() {
    if (finished) return;
    finished = true;
    spot.remove();
    card.remove();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', show);
    if (options.onDone) options.onDone();
  }

  function onKey(e) { if (e.key === 'Escape') end(); }

  card.querySelector('#tour-next').addEventListener('click', function () {
    if (i === all.length - 1) return end();
    i++; show();
  });
  card.querySelector('#tour-back').addEventListener('click', function () {
    if (i > 0) { i--; show(); }
  });
  card.querySelector('#tour-skip').addEventListener('click', end);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', show);

  show();
}
