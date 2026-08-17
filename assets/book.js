/* ==========================================================================
   Customer booking page
   Three steps on one page: pick a time, enter details, see the confirmation.
   Everything written here goes into the shared store, so the pro shop tee
   sheet picks it up immediately.
   ========================================================================== */

(function () {
  'use strict';

  var T = window.TeeDemo;

  var state = {
    dateKey: T.todayKey(),
    players: 2,
    holes: 18,
    part: 'all',
    pick: null       // { time, label, price }
  };

  var el = {
    steps: document.getElementById('steps'),
    dateInput: document.getElementById('date-input'),
    dateText: document.getElementById('date-text'),
    prevDay: document.getElementById('prev-day'),
    nextDay: document.getElementById('next-day'),
    results: document.getElementById('results'),
    resultsEmpty: document.getElementById('results-empty'),
    resultsSummary: document.getElementById('results-summary'),
    stepSearch: document.getElementById('step-search'),
    stepDetails: document.getElementById('step-details'),
    stepDone: document.getElementById('step-done'),
    detailHeading: document.getElementById('detail-heading'),
    detailSub: document.getElementById('detail-sub'),
    detailLines: document.getElementById('detail-lines'),
    detailError: document.getElementById('detail-error'),
    form: document.getElementById('detail-form'),
    doneConf: document.getElementById('done-conf'),
    doneLines: document.getElementById('done-lines'),
    doneHeadline: document.getElementById('done-headline')
  };

  /* ---------- Setup ------------------------------------------------------- */

  T.paintChrome();
  document.querySelectorAll('[data-cart-rate]').forEach(function (n) {
    n.textContent = T.money(T.COURSE.rates.cartPerPlayer);
  });
  document.getElementById('policy-text').textContent = T.COURSE.policy;
  document.getElementById('done-policy').textContent = T.COURSE.policy;

  buildDateNav();
  bindFilters();
  startOnFirstOpenDay();
  setDate(state.dateKey);

  /* ---------- Step 1: search --------------------------------------------- */

  function buildDateNav() {
    el.dateInput.min = T.todayKey();
    el.prevDay.addEventListener('click', function () { setDate(T.addDays(state.dateKey, -1)); });
    el.nextDay.addEventListener('click', function () { setDate(T.addDays(state.dateKey, 1)); });

    // The date input sits invisibly over the label; a click should open the
    // native calendar right away instead of just focusing the field.
    el.dateInput.addEventListener('click', function () {
      if (el.dateInput.showPicker) {
        try { el.dateInput.showPicker(); } catch (e) { /* falls back to native behaviour */ }
      }
    });
    el.dateInput.addEventListener('change', function () {
      setDate(el.dateInput.value || state.dateKey);
    });
  }

  /** Change the selected day, keep the nav in sync, and refresh the list. */
  function setDate(key) {
    var today = T.todayKey();
    if (key < today) key = today;   // keys are YYYY-MM-DD, so string order is date order
    state.dateKey = key;

    var name = key === today ? 'Today'
             : key === T.addDays(today, 1) ? 'Tomorrow'
             : T.formatLong(key).split(',')[0];
    el.dateText.innerHTML =
      '<b>' + name + '</b><small>' + T.formatShort(key).date + ', ' + key.slice(0, 4) + ' &#9662;</small>';
    el.dateInput.value = key;
    el.prevDay.disabled = key <= today;

    renderResults();
  }

  /**
   * Open on the first day that still has tee times. Late in the evening today
   * is already gone, and landing on an empty list is a bad first impression.
   */
  function startOnFirstOpenDay() {
    for (var i = 0; i < 7; i++) {
      var key = T.addDays(T.todayKey(), i);
      if (availableSlots(key).length) {
        state.dateKey = key;
        break;
      }
    }
  }

  function bindFilters() {
    document.querySelectorAll('input[name="players"]').forEach(function (input) {
      input.addEventListener('change', function () {
        state.players = Number(input.value);
        renderResults();
      });
    });
    document.querySelectorAll('input[name="holes"]').forEach(function (input) {
      input.addEventListener('change', function () {
        state.holes = Number(input.value);
        renderResults();
      });
    });
    document.querySelectorAll('input[name="part"]').forEach(function (input) {
      input.addEventListener('change', function () {
        state.part = input.value;
        renderResults();
      });
    });
  }

  /** Times a golfer may still book: enough open spots, and not in the past. */
  function availableSlots(dateKey) {
    dateKey = dateKey || state.dateKey;
    var isToday = dateKey === T.todayKey();
    var now = new Date();
    var cutoff = now.getHours() * 60 + now.getMinutes() + 30;   // 30 min lead time

    return T.day(dateKey).filter(function (slot) {
      if (slot.blocked) return false;
      if (slot.open < state.players) return false;
      if (state.part !== 'all' && slot.part !== state.part) return false;
      if (isToday && T.minutesOf(slot.time) < cutoff) return false;
      return true;
    });
  }

  function renderResults() {
    var slots = availableSlots();

    el.resultsSummary.textContent =
      slots.length + ' tee time' + (slots.length === 1 ? '' : 's') + ' for ' +
      state.players + ' player' + (state.players === 1 ? '' : 's') + ' · ' +
      state.holes + ' holes · ' + T.formatLong(state.dateKey);

    el.resultsEmpty.hidden = slots.length > 0;

    el.results.innerHTML = slots.map(function (slot) {
      var price = T.greenFee(state.dateKey, slot.time, state.holes);
      var tags = [];
      if (T.isTwilight(slot.time)) tags.push('Twilight rate');
      if (slot.open < 4) tags.push(slot.open + ' spot' + (slot.open === 1 ? '' : 's') + ' left');
      else tags.push('Full tee time open');

      return '' +
        '<li class="time-card">' +
          '<div>' +
            '<div class="time-card__time">' + slot.label + '</div>' +
            '<div class="time-card__meta">' + tags.join(' · ') + '</div>' +
          '</div>' +
          '<div class="time-card__right">' +
            '<div class="time-card__price">' + T.money(price) + '</div>' +
            '<div class="time-card__meta">per player</div>' +
            '<button class="btn btn--primary btn--small" style="margin-top:.5rem" ' +
                    'data-book="' + slot.time + '">Reserve</button>' +
          '</div>' +
        '</li>';
    }).join('');
  }

  el.results.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-book]');
    if (!btn) return;
    startDetails(btn.getAttribute('data-book'));
  });

  /* ---------- Step 2: details -------------------------------------------- */

  function startDetails(time) {
    state.pick = {
      time: time,
      label: T.formatTime(time),
      price: T.greenFee(state.dateKey, time, state.holes)
    };

    el.detailHeading.textContent = state.pick.label + ' · ' + state.holes + ' holes';
    el.detailSub.textContent =
      T.formatLong(state.dateKey) + ' · ' + state.players +
      ' player' + (state.players === 1 ? '' : 's') + ' · ' + T.COURSE.name;

    el.detailError.hidden = true;
    renderTotals(el.detailLines, currentCart());
    showStep(2);
  }

  function currentCart() {
    var chosen = document.querySelector('input[name="cart"]:checked');
    return !chosen || chosen.value === 'yes';
  }

  document.querySelectorAll('input[name="cart"]').forEach(function (input) {
    input.addEventListener('change', function () {
      renderTotals(el.detailLines, currentCart());
    });
  });

  function renderTotals(target, cart) {
    var green = state.pick.price * state.players;
    var carts = cart ? T.COURSE.rates.cartPerPlayer * state.players : 0;
    var rows = [
      ['Green fee — ' + T.money(state.pick.price) + ' × ' + state.players, T.money(green)],
      [cart ? 'Cart — ' + T.money(T.COURSE.rates.cartPerPlayer) + ' × ' + state.players : 'Cart — walking',
       cart ? T.money(carts) : T.money(0)]
    ];

    target.innerHTML =
      rows.map(function (r) {
        return '<div class="line"><span>' + r[0] + '</span><span>' + r[1] + '</span></div>';
      }).join('') +
      '<div class="line line--total"><span>Due at the course</span><span>' + T.money(green + carts) + '</span></div>';
  }

  document.getElementById('back-to-times').addEventListener('click', function () {
    showStep(1);
  });

  el.form.addEventListener('submit', function (e) {
    e.preventDefault();

    var name = el.form.name.value.trim();
    var phone = el.form.phone.value.trim();
    var email = el.form.email.value.trim();
    var cart = currentCart();

    var problems = [];
    if (!name) problems.push('a name');
    if (!phone) problems.push('a mobile number');
    if (!email || email.indexOf('@') < 1) problems.push('a valid email address');

    if (problems.length) {
      el.detailError.textContent = 'Please add ' + problems.join(', ') + '.';
      el.detailError.hidden = false;
      el.detailError.scrollIntoView({ block: 'center' });
      return;
    }

    var group;
    try {
      group = T.book(state.dateKey, state.pick.time, {
        name: name,
        size: state.players,
        holes: state.holes,
        cart: cart,
        phone: phone,
        email: email,
        note: el.form.note.value.trim(),
        source: 'online'
      });
    } catch (err) {
      // Someone took the last spot while this golfer was typing.
      el.detailError.textContent = err.message + ' Please pick another time.';
      el.detailError.hidden = false;
      renderResults();
      return;
    }

    finish(group, cart);
  });

  /* ---------- Step 3: confirmation --------------------------------------- */

  function finish(group, cart) {
    el.doneConf.textContent = group.conf;
    el.doneHeadline.textContent =
      state.pick.label + ' on ' + T.formatLong(state.dateKey) + ' is reserved for ' +
      state.players + ' player' + (state.players === 1 ? '' : 's') + '. ' +
      'A confirmation is on its way to ' + group.email + '.';

    var green = state.pick.price * state.players;
    var carts = cart ? T.COURSE.rates.cartPerPlayer * state.players : 0;

    el.doneLines.innerHTML = [
      ['Course', T.COURSE.name],
      ['Date', T.formatLong(state.dateKey)],
      ['Tee time', state.pick.label],
      ['Players', String(state.players)],
      ['Holes', state.holes + ' holes'],
      ['Cart', cart ? 'Riding' : 'Walking'],
      ['Booked under', group.name]
    ].map(function (r) {
      return '<div class="line"><span class="muted">' + r[0] + '</span><span><strong>' +
             T.escapeHtml(r[1]) + '</strong></span></div>';
    }).join('') +
    '<div class="line line--total"><span>Due at the course</span><span>' + T.money(green + carts) + '</span></div>';

    showStep(3);
  }

  document.getElementById('book-another').addEventListener('click', function () {
    el.form.reset();
    renderResults();
    showStep(1);
  });

  /* ---------- Step chrome ------------------------------------------------- */

  function showStep(n) {
    el.stepSearch.hidden = n !== 1;
    el.stepDetails.hidden = n !== 2;
    el.stepDone.hidden = n !== 3;

    el.steps.querySelectorAll('li').forEach(function (li) {
      if (Number(li.getAttribute('data-step')) === n) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });

    window.scrollTo({ top: 0 });
  }
})();
