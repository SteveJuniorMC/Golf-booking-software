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
    blockSub: document.getElementById('block-sub')
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
      el.rows.innerHTML = '<tr><td colspan="8" style="padding:1.5rem;font-weight:700">' +
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

    var groupsCell, holesCell, cartCell, feesCell;

    if (row.blocked) {
      groupsCell = '<span class="muted">' + T.escapeHtml(row.note || 'Blocked') + '</span>';
      holesCell = cartCell = feesCell = '<span class="muted">—</span>';
    } else if (!row.groups.length) {
      groupsCell = '<span class="muted">Open — 4 spots</span>';
      holesCell = cartCell = feesCell = '<span class="muted">—</span>';
    } else {
      groupsCell = row.groups.map(function (g) {
        var badges = [
          '<span class="badge badge--ghost">' + (g.source === 'online' ? 'Online' : 'Pro shop') + '</span>'
        ];
        if (g.status === 'checked-in') badges.push('<span class="badge badge--in">In</span>');
        return '<div class="group">' +
          '<span class="group__name">' + T.escapeHtml(g.name) + '</span> ' + badges.join(' ') +
          '<div class="group__meta">' +
            g.size + ' player' + (g.size === 1 ? '' : 's') +
            (g.phone ? ' · ' + T.escapeHtml(g.phone) : '') +
            ' · <span class="mono">' + g.conf + '</span>' +
            (g.note ? '<br>' + T.escapeHtml(g.note) : '') +
          '</div>' +
        '</div>';
      }).join('');

      holesCell = joinGroups(row.groups, function (g) { return String(g.holes); });
      cartCell = joinGroups(row.groups, function (g) { return g.cart ? 'Cart' : 'Walk'; });
      feesCell = '<strong>' + T.money(row.revenue) + '</strong>';
    }

    var actions = [];
    if (row.blocked) {
      actions.push(btn('unblock', row.time, '', 'Unblock'));
    } else {
      if (row.open > 0) actions.push(btn('add', row.time, '', 'Add booking', true));
      row.groups.forEach(function (g) {
        if (g.status !== 'checked-in') {
          actions.push(btn('checkin', row.time, g.id, 'Check in' + (row.groups.length > 1 ? ' ' + firstWord(g.name) : '')));
        }
        actions.push(btn('cancel', row.time, g.id, 'Cancel' + (row.groups.length > 1 ? ' ' + firstWord(g.name) : ''), false, true));
      });
      if (!row.groups.length) actions.push(btn('block', row.time, '', 'Block'));
    }

    return '<tr class="' + classes.join(' ') + '">' +
      '<td class="col-time">' + row.label + '</td>' +
      '<td>' + status + '</td>' +
      '<td>' + groupsCell + '</td>' +
      '<td><strong>' + row.players + '</strong><span class="muted">/4</span></td>' +
      '<td>' + holesCell + '</td>' +
      '<td>' + cartCell + '</td>' +
      '<td>' + feesCell + '</td>' +
      '<td class="col-actions"><div class="actions">' + actions.join('') + '</div></td>' +
    '</tr>';
  }

  function btn(action, time, groupId, label, primary, danger) {
    return '<button class="btn btn--small' + (primary ? ' btn--primary' : '') + (danger ? ' btn--danger' : '') + '" ' +
      'data-action="' + action + '" data-time="' + time + '" data-group="' + (groupId || '') + '">' +
      T.escapeHtml(label) + '</button>';
  }

  function firstWord(name) { return String(name).split(' ')[0]; }

  /** "18" when both groups play 18, "18 / 9" when they differ. */
  function joinGroups(groups, read) {
    var values = groups.map(read);
    var same = values.every(function (v) { return v === values[0]; });
    return same ? values[0] : values.join(' / ');
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

    if (action === 'unblock') {
      T.setBlocked(state.dateKey, time, false);
      return render();
    }
    if (action === 'checkin') {
      T.setGroupStatus(state.dateKey, time, groupId, 'checked-in');
      return render();
    }
    if (action === 'cancel') {
      var slot = T.slotAt(state.dateKey, time);
      var group = slot.groups.filter(function (g) { return g.id === groupId; })[0];
      if (group && window.confirm('Cancel ' + group.name + ' at ' + T.formatTime(time) + '?')) {
        T.cancelGroup(state.dateKey, time, groupId);
        render();
      }
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
