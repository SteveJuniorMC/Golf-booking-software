/* ==========================================================================
   Pro shop tee sheet
   One row per tee time for the whole day, plus the counter actions a shop
   actually needs: add a walk-up, check a group in, cancel, block a time.
   Reads the same store the golfer booking page writes to.
   ========================================================================== */

(function () {
  'use strict';

  var T = window.TeeDemo;

  var state = {
    dateKey: T.todayKey(),
    filter: 'all',
    target: null      // { time, open } while a dialog is open
  };

  var el = {
    rows: document.getElementById('rows'),
    dateLabel: document.getElementById('date-label'),
    heading: document.getElementById('sheet-heading'),
    filter: document.getElementById('filter'),
    dialog: document.getElementById('booking-dialog'),
    dialogForm: document.getElementById('booking-form'),
    dialogSub: document.getElementById('dialog-sub'),
    dialogError: document.getElementById('dialog-error'),
    sizeChoices: document.getElementById('d-size-choices'),
    blockDialog: document.getElementById('block-dialog'),
    blockForm: document.getElementById('block-form'),
    blockSub: document.getElementById('block-sub'),
    groupDialog: document.getElementById('group-dialog'),
    gTitle: document.getElementById('g-title'),
    gSub: document.getElementById('g-sub'),
    gLines: document.getElementById('g-lines'),
    gCheckin: document.getElementById('g-checkin'),
    gCancelBooking: document.getElementById('g-cancel-booking')
  };

  T.paintChrome();
  document.getElementById('storage-warning').hidden = T.storageWorks();
  render();

  /* ---------- Day navigation and filters ---------------------------------- */

  document.getElementById('prev-day').addEventListener('click', function () {
    state.dateKey = T.addDays(state.dateKey, -1);
    render();
  });
  document.getElementById('next-day').addEventListener('click', function () {
    state.dateKey = T.addDays(state.dateKey, 1);
    render();
  });
  document.getElementById('today').addEventListener('click', function () {
    state.dateKey = T.todayKey();
    render();
  });
  el.filter.addEventListener('change', function () {
    state.filter = el.filter.value;
    render();
  });
  document.getElementById('print').addEventListener('click', function () {
    window.print();
  });
  document.getElementById('reset').addEventListener('click', function () {
    if (window.confirm('Reset the demo? This clears every booking made during the demo and restores the starting tee sheet.')) {
      T.reset();
      render();
    }
  });

  /* ---------- Render ------------------------------------------------------ */

  function render() {
    var rows = T.day(state.dateKey);
    var totals = T.totals(state.dateKey);
    var isToday = state.dateKey === T.todayKey();

    el.dateLabel.textContent = T.formatLong(state.dateKey) + (isToday ? ' (today)' : '');
    el.heading.textContent =
      T.formatLong(state.dateKey) + ' · ' +
      (T.isWeekend(state.dateKey) ? 'Weekend rates' : 'Weekday rates') + ' · ' +
      'First tee ' + T.formatTime(T.COURSE.firstTee) + ', last tee ' + T.formatTime(T.COURSE.lastTee);

    document.getElementById('stat-players').textContent = totals.players;
    document.getElementById('stat-booked').textContent = totals.booked;
    document.getElementById('stat-open').textContent = totals.openSlots;
    document.getElementById('stat-fill').textContent = totals.fillRate + '%';
    document.getElementById('stat-revenue').textContent = T.money(totals.revenue);
    document.getElementById('stat-online').textContent =
      totals.players ? Math.round((totals.online / totals.players) * 100) + '%' : '0%';

    document.getElementById('printed-at').textContent = new Date().toLocaleString();

    var visible = rows.filter(function (row) {
      if (state.filter === 'booked') return row.players > 0 || row.blocked;
      if (state.filter === 'open') return !row.blocked && row.open > 0;
      return true;
    });

    var lastHour = null;
    el.rows.innerHTML = visible.map(function (row) {
      var hour = row.time.slice(0, 2);
      var newHour = hour !== lastHour;
      lastHour = hour;
      return renderRow(row, newHour);
    }).join('');

    if (!visible.length) {
      el.rows.innerHTML = '<tr><td colspan="5" style="padding:1.5rem;font-weight:700">' +
        'No tee times match that filter.</td></tr>';
    }
  }

  function renderRow(row, newHour) {
    var classes = ['row'];
    if (newHour) classes.push('row--hour');
    if (row.blocked) classes.push('row--blocked');
    else if (row.open === 0) classes.push('row--full');
    else if (row.players === 0) classes.push('row--open');

    var allIn = row.groups.length > 0 && row.groups.every(function (g) { return g.status === 'checked-in'; });

    var status;
    if (row.blocked) status = '<span class="badge badge--blocked">Blocked</span>';
    else if (allIn) status = '<span class="badge badge--in">Checked in</span>';
    else if (row.players === 0) status = '<span class="badge badge--open">Open</span>';
    else if (row.open > 0) status = '<span class="badge badge--partial">' + row.open + ' left</span>';
    else status = '<span class="badge badge--full">Full</span>';

    // Every tee time renders as the same four-column strip of spots, so the
    // rows stay a uniform height no matter what is booked on them. Details
    // and per-group actions live in the dialog a click on a group opens.
    var spots = [];
    var feesCell;

    if (row.blocked) {
      spots.push('<span class="spot spot--blocked" style="grid-column:span 4">' +
        '<span class="spot__name">Blocked</span>' +
        '<span class="spot__meta">' + T.escapeHtml(row.note || 'Blocked by the pro shop') + '</span>' +
      '</span>');
      feesCell = '<span class="muted">—</span>';
    } else {
      row.groups.forEach(function (g) {
        var checkedIn = g.status === 'checked-in';
        var meta = (checkedIn ? '<b class="spot__in">IN</b> · ' : '') +
          g.size + ' player' + (g.size === 1 ? '' : 's') + ' · ' + g.holes + ' holes · ' +
          (g.cart ? 'Cart' : 'Walk') + ' · ' + (g.source === 'online' ? 'Online' : 'Shop');
        spots.push('<button type="button" class="spot spot--group' + (checkedIn ? ' spot--checked' : '') + '" ' +
          'style="grid-column:span ' + g.size + '" ' +
          'data-action="details" data-time="' + row.time + '" data-group="' + g.id + '">' +
          '<span class="spot__name">' + T.escapeHtml(g.name) + '</span>' +
          '<span class="spot__meta">' + meta + '</span>' +
        '</button>');
      });
      if (row.open > 0) {
        spots.push('<button type="button" class="spot spot--open" ' +
          'style="grid-column:span ' + row.open + '" ' +
          'data-action="add" data-time="' + row.time + '">' +
          '<span class="spot__name">Open</span>' +
          '<span class="spot__meta">' + row.open + ' spot' + (row.open === 1 ? '' : 's') + ' — add booking</span>' +
        '</button>');
      }
      feesCell = row.groups.length ? '<strong>' + T.money(row.revenue) + '</strong>' : '<span class="muted">—</span>';
    }

    var action = '';
    if (row.blocked) action = btn('unblock', row.time, '', 'Unblock');
    else if (!row.groups.length) action = btn('block', row.time, '', 'Block');

    return '<tr class="' + classes.join(' ') + '">' +
      '<td class="col-time">' + row.label + '</td>' +
      '<td>' + status + '</td>' +
      '<td><div class="spots">' + spots.join('') + '</div></td>' +
      '<td>' + feesCell + '</td>' +
      '<td class="col-actions"><div class="actions">' + action + '</div></td>' +
    '</tr>';
  }

  function btn(action, time, groupId, label) {
    return '<button class="btn btn--small" ' +
      'data-action="' + action + '" data-time="' + time + '" data-group="' + (groupId || '') + '">' +
      T.escapeHtml(label) + '</button>';
  }

  /* ---------- Row actions ------------------------------------------------- */

  el.rows.addEventListener('click', function (e) {
    var button = e.target.closest('[data-action]');
    if (!button) return;

    var action = button.getAttribute('data-action');
    var time = button.getAttribute('data-time');
    var groupId = button.getAttribute('data-group');

    if (action === 'add') return openBookingDialog(time);
    if (action === 'block') return openBlockDialog(time);
    if (action === 'details') return openGroupDialog(time, groupId);

    if (action === 'unblock') {
      T.setBlocked(state.dateKey, time, false);
      return render();
    }
  });

  /* ---------- Group details dialog ---------------------------------------- */

  function groupAt(time, groupId) {
    return T.slotAt(state.dateKey, time).groups.filter(function (g) { return g.id === groupId; })[0];
  }

  function openGroupDialog(time, groupId) {
    var group = groupAt(time, groupId);
    if (!group) return;
    state.target = { time: time, groupId: groupId };

    el.gTitle.textContent = group.name;
    el.gSub.textContent = T.formatTime(time) + ' · ' + T.formatLong(state.dateKey);

    var rows = [
      ['Status', group.status === 'checked-in' ? 'Checked in' : 'Booked'],
      ['Players', String(group.size)],
      ['Holes', group.holes + ' holes'],
      ['Cart', group.cart ? 'Riding' : 'Walking'],
      ['Booked', group.source === 'online' ? 'Online' : 'Pro shop'],
      ['Confirmation', group.conf]
    ];
    if (group.phone) rows.push(['Phone', group.phone]);
    if (group.email) rows.push(['Email', group.email]);
    if (group.note) rows.push(['Note', group.note]);

    el.gLines.innerHTML = rows.map(function (r) {
      return '<div class="line"><span class="muted">' + r[0] + '</span><span><strong>' +
             T.escapeHtml(r[1]) + '</strong></span></div>';
    }).join('') +
    '<div class="line line--total"><span>Due at the course</span><span>' +
      T.money(T.groupTotal(state.dateKey, time, group)) + '</span></div>';

    el.gCheckin.hidden = group.status === 'checked-in';
    el.groupDialog.showModal();
  }

  document.getElementById('g-close').addEventListener('click', function () {
    el.groupDialog.close();
  });

  el.gCheckin.addEventListener('click', function () {
    T.setGroupStatus(state.dateKey, state.target.time, state.target.groupId, 'checked-in');
    el.groupDialog.close();
    render();
  });

  el.gCancelBooking.addEventListener('click', function () {
    var group = groupAt(state.target.time, state.target.groupId);
    if (group && window.confirm('Cancel ' + group.name + ' at ' + T.formatTime(state.target.time) + '?')) {
      T.cancelGroup(state.dateKey, state.target.time, state.target.groupId);
      el.groupDialog.close();
      render();
    }
  });

  /* ---------- Add booking dialog ------------------------------------------ */

  function openBookingDialog(time) {
    var slot = T.slotAt(state.dateKey, time);
    state.target = { time: time, open: slot.open };

    el.dialogError.hidden = true;
    el.dialogForm.reset();
    document.getElementById('d-name').value = '';

    el.dialogSub.textContent =
      T.formatTime(time) + ' · ' + T.formatLong(state.dateKey) + ' · ' +
      slot.open + ' spot' + (slot.open === 1 ? '' : 's') + ' open · ' +
      'green fee ' + T.money(T.greenFee(state.dateKey, time, 18)) + ' per player (18 holes)';

    // Only offer party sizes that actually fit on this tee time.
    var html = '';
    for (var n = 1; n <= slot.open; n++) {
      html += '<label class="choice"><input type="radio" name="d-size" value="' + n + '"' +
              (n === Math.min(2, slot.open) ? ' checked' : '') + '><span>' + n + '</span></label>';
    }
    el.sizeChoices.innerHTML = html;

    el.dialog.showModal();
    document.getElementById('d-name').focus();
  }

  document.getElementById('dialog-cancel').addEventListener('click', function () {
    el.dialog.close();
  });

  el.dialogForm.addEventListener('submit', function (e) {
    e.preventDefault();

    var name = document.getElementById('d-name').value.trim();
    if (!name) {
      el.dialogError.textContent = 'Add a name for the booking.';
      el.dialogError.hidden = false;
      return;
    }

    var size = Number((document.querySelector('input[name="d-size"]:checked') || {}).value || 1);
    var holes = Number(document.querySelector('input[name="d-holes"]:checked').value);
    var cart = document.querySelector('input[name="d-cart"]:checked').value === 'yes';

    try {
      T.book(state.dateKey, state.target.time, {
        name: name,
        size: size,
        holes: holes,
        cart: cart,
        phone: document.getElementById('d-phone').value.trim(),
        email: '',
        note: document.getElementById('d-note').value.trim(),
        source: 'proshop'
      });
    } catch (err) {
      el.dialogError.textContent = err.message;
      el.dialogError.hidden = false;
      return;
    }

    el.dialog.close();
    render();
  });

  /* ---------- Block dialog ------------------------------------------------ */

  function openBlockDialog(time) {
    state.target = { time: time };
    el.blockSub.textContent = T.formatTime(time) + ' · ' + T.formatLong(state.dateKey);
    el.blockDialog.showModal();
  }

  document.getElementById('block-cancel').addEventListener('click', function () {
    el.blockDialog.close();
  });

  el.blockForm.addEventListener('submit', function (e) {
    e.preventDefault();
    T.setBlocked(state.dateKey, state.target.time, true, document.getElementById('b-reason').value.trim());
    el.blockDialog.close();
    render();
  });
})();
