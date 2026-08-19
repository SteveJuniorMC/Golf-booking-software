/* ==========================================================================
   Demo tee sheet — the finalized YourTeeSheet sheet, running on the demo's
   seeded localStorage data instead of Firestore. Same layout, same dialogs,
   same rules: green open space, dimmed check-ins, blocking through the
   dialogs (single blocks keep groups; the bulk dialog clears with a warning).
   ========================================================================== */

(function () {
  'use strict';

  var T = window.TeeDemo;

  var state = {
    dateKey: T.todayKey(),
    filter: 'all',
    target: null
  };

  var el = {};
  ['storage-warning', 'date-text', 'date-input', 'today', 'filter', 'sheet-heading', 'rows',
   'printed-at',
   'booking-dialog', 'booking-form', 'booking-title', 'booking-error', 'booking-sub',
   'booking-save', 'booking-block', 'd-name', 'd-size-choices', 'd-phone', 'd-note',
   'group-dialog', 'g-title', 'g-error', 'g-sub', 'g-lines', 'g-cancel-booking', 'g-edit',
   'g-move', 'g-checkin',
   'move-dialog', 'move-form', 'move-error', 'move-sub', 'm-date', 'm-find', 'm-times-field',
   'm-times', 'move-save',
   'block-dialog', 'block-error', 'block-sub', 'block-note', 'block-unblock',
   'block-range-dialog', 'br-form', 'br-error', 'br-sub', 'br-from', 'br-to', 'br-reason',
   'br-consequence', 'br-confirm-wrap', 'br-confirm', 'br-confirm-text', 'br-save'
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  var esc = T.escapeHtml;

  T.paintChrome();
  el['storage-warning'].hidden = T.storageWorks();
  render();

  function isPast() { return state.dateKey < T.todayKey(); }

  /* ---------- Rendering (mirrors the product sheet) ---------- */

  function render() {
    var today = T.todayKey();
    var name = state.dateKey === today ? 'Today'
             : state.dateKey === T.addDays(today, 1) ? 'Tomorrow'
             : T.formatLong(state.dateKey).split(',')[0];
    el['date-text'].innerHTML =
      '<b>' + name + '</b><small>' + T.formatShort(state.dateKey).date + ', ' +
      state.dateKey.slice(0, 4) + ' &#9662;</small>';
    el['date-input'].value = state.dateKey;
    el.today.hidden = state.dateKey === today;

    el['sheet-heading'].textContent =
      T.formatLong(state.dateKey) + ' · ' +
      (T.isWeekend(state.dateKey) ? 'Weekend rates' : 'Weekday rates') + ' · ' +
      'First tee ' + T.formatTime(T.COURSE.firstTee) + ', last tee ' + T.formatTime(T.COURSE.lastTee);

    el['printed-at'].textContent = new Date().toLocaleString();

    var past = isPast();
    var visible = T.day(state.dateKey).filter(function (row) {
      if (state.filter === 'booked') return row.players > 0 || row.blocked;
      if (state.filter === 'open') return !row.blocked && row.open > 0;
      return true;
    });

    var lastHour = null;
    el.rows.innerHTML = visible.map(function (row) {
      var hour = row.time.slice(0, 2);
      var newHour = hour !== lastHour;
      lastHour = hour;
      return renderRow(row, newHour, past);
    }).join('') ||
      '<tr><td colspan="3" style="padding:1.5rem;font-weight:700">No tee times match that filter.</td></tr>';
  }

  function renderRow(row, newHour, past) {
    var classes = ['row'];
    if (newHour) classes.push('row--hour');
    if (row.blocked && row.players === 0) classes.push('row--blocked');
    else if (row.open === 0 && row.players > 0) classes.push('row--full');
    else if (!row.blocked && row.players === 0) classes.push('row--open');

    var fees = row.groups.length
      ? '<strong>' + T.money(row.revenue) + '</strong>'
      : '<span class="muted">—</span>';

    return '<tr class="' + classes.join(' ') + '">' +
      '<td class="col-time">' + row.label + '</td>' +
      '<td><div class="spots">' + spotsHtml(row, past) + '</div></td>' +
      '<td>' + fees + '</td>' +
    '</tr>';
  }

  function spotsHtml(row, past) {
    var spots = [];
    var span = ' style="grid-column:span ';

    row.groups.forEach(function (g) {
      var checkedIn = g.status === 'checked-in';
      var meta = (checkedIn ? '<b class="spot__in">IN</b> · ' : '') +
        g.size + ' player' + (g.size === 1 ? '' : 's') + ' · ' + g.holes + ' holes · ' +
        (g.cart ? 'Riding' : 'Walking') + (g.note ? ' · ' + esc(g.note) : '');
      spots.push('<button type="button" class="spot spot--group' + (checkedIn ? ' spot--checked' : '') + '"' +
        span + g.size + '" data-action="details" data-time="' + row.time + '" data-group="' + g.id + '">' +
        '<span class="spot__name">' + esc(g.name) + '</span>' +
        '<span class="spot__meta">' + meta + '</span></button>');
    });

    if (row.blocked) {
      var remaining = T.COURSE.slotSize - row.players;
      if (remaining > 0) {
        var note = esc(row.note ||
          (row.groups.length ? 'No more bookings on this time' : 'Blocked by the pro shop'));
        spots.push(past
          ? '<span class="spot spot--blocked"' + span + remaining + '">' +
              '<span class="spot__name">Blocked</span><span class="spot__meta">' + note + '</span></span>'
          : '<button type="button" class="spot spot--blocked"' + span + remaining + '" ' +
              'data-action="blocked" data-time="' + row.time + '">' +
              '<span class="spot__name">Blocked</span><span class="spot__meta">' + note + '</span></button>');
      }
    } else if (row.open > 0) {
      var word = row.open + ' spot' + (row.open === 1 ? '' : 's');
      spots.push(past
        ? '<span class="spot spot--open spot--past"' + span + row.open + '">' +
            '<span class="spot__name">Open</span>' +
            '<span class="spot__meta">' + word + ' — went unbooked</span></span>'
        : '<button type="button" class="spot spot--open"' + span + row.open + '" ' +
            'data-action="add" data-time="' + row.time + '">' +
            '<span class="spot__name">Open</span>' +
            '<span class="spot__meta">' + word + ' — add booking</span></button>');
    }
    return spots.join('');
  }

  /* ---------- Toolbar ---------- */

  document.getElementById('prev-day').addEventListener('click', function () {
    state.dateKey = T.addDays(state.dateKey, -1); render();
  });
  document.getElementById('next-day').addEventListener('click', function () {
    state.dateKey = T.addDays(state.dateKey, 1); render();
  });
  el.today.addEventListener('click', function () {
    state.dateKey = T.todayKey(); render();
  });
  el['date-input'].addEventListener('click', function () {
    if (el['date-input'].showPicker) {
      try { el['date-input'].showPicker(); } catch (e) { /* native behaviour */ }
    }
  });
  el['date-input'].addEventListener('change', function () {
    if (el['date-input'].value) state.dateKey = el['date-input'].value;
    render();
  });
  el.filter.addEventListener('change', function () {
    state.filter = el.filter.value; render();
  });
  document.getElementById('print').addEventListener('click', function () { window.print(); });
  document.getElementById('reset').addEventListener('click', function () {
    if (window.confirm('Reset the demo? This clears every change made during the demo and restores the starting tee sheet.')) {
      T.reset();
      render();
    }
  });
  document.getElementById('block-range').addEventListener('click', openBlockRangeDialog);

  /* ---------- Row actions ---------- */

  el.rows.addEventListener('click', function (e) {
    var button = e.target.closest('[data-action]');
    if (!button) return;
    var action = button.getAttribute('data-action');
    var time = button.getAttribute('data-time');
    var groupId = button.getAttribute('data-group');
    if (action === 'add') return openBookingDialog('add', time);
    if (action === 'details') return openGroupDialog(time, groupId);
    if (action === 'blocked') return openBlockedDialog(time);
  });

  function rowFor(time) {
    return T.slotAt(state.dateKey, time);
  }
  function groupAt(time, groupId) {
    var row = rowFor(time);
    var found = null;
    if (row) row.groups.forEach(function (g) { if (g.id === groupId) found = g; });
    return found;
  }
  function whereLabel(time) {
    return T.formatTime(time) + ' · ' + T.formatLong(state.dateKey);
  }
  function priceLine(time) {
    var label = T.isTwilight(time) ? 'Twilight' : '18 holes';
    return label + ': ' + T.money(T.greenFee(state.dateKey, time, 18, false)) + ' walking / ' +
      T.money(T.greenFee(state.dateKey, time, 18, true)) + ' riding per player';
  }

  /* ---------- Add / edit booking ---------- */

  function sizeChoices(max, checked) {
    var html = '';
    for (var n = 1; n <= max; n++) {
      html += '<label class="choice"><input type="radio" name="d-size" value="' + n + '"' +
        (n === checked ? ' checked' : '') + '><span>' + n + '</span></label>';
    }
    el['d-size-choices'].innerHTML = html;
  }
  function setRadioValue(name, value) {
    var input = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (input) input.checked = true;
  }

  function openBookingDialog(mode, time, groupId) {
    if (isPast()) return;
    var row = rowFor(time);
    if (!row || row.blocked) return;

    el['booking-error'].hidden = true;
    el['booking-form'].reset();
    el['booking-block'].hidden = mode === 'edit';

    if (mode === 'edit') {
      var group = groupAt(time, groupId);
      if (!group) return;
      state.target = { mode: 'edit', time: time, groupId: groupId };
      el['booking-title'].textContent = 'Edit booking';
      el['booking-save'].textContent = 'Save changes';
      el['booking-sub'].textContent = whereLabel(time);
      sizeChoices(group.size + row.open, group.size);
      el['d-name'].value = group.name;
      el['d-phone'].value = group.phone || '';
      el['d-note'].value = group.note || '';
      setRadioValue('d-holes', String(group.holes));
      setRadioValue('d-cart', group.cart ? 'yes' : 'no');
    } else {
      state.target = { mode: 'add', time: time };
      el['booking-title'].textContent = 'Add booking';
      el['booking-save'].textContent = 'Save booking';
      el['booking-sub'].innerHTML =
        esc(whereLabel(time) + ' · ' + row.open + ' spot' + (row.open === 1 ? '' : 's') + ' open') +
        '<br>' + esc(priceLine(time));
      sizeChoices(row.open, Math.min(2, row.open));
      el['d-name'].value = '';
    }
    el['booking-dialog'].showModal();
    el['d-name'].focus();
  }

  document.getElementById('booking-cancel').addEventListener('click', function () {
    el['booking-dialog'].close();
  });

  el['booking-block'].addEventListener('click', function () {
    T.setBlocked(state.dateKey, state.target.time, true, '');
    el['booking-dialog'].close();
    render();
  });

  el['booking-form'].addEventListener('submit', function (e) {
    e.preventDefault();
    var name = el['d-name'].value.trim();
    if (!name) {
      el['booking-error'].textContent = 'Add a name for the booking.';
      el['booking-error'].hidden = false;
      return;
    }
    var details = {
      name: name,
      size: Number((document.querySelector('input[name="d-size"]:checked') || {}).value || 1),
      holes: Number(document.querySelector('input[name="d-holes"]:checked').value),
      cart: document.querySelector('input[name="d-cart"]:checked').value === 'yes',
      phone: el['d-phone'].value.trim(),
      note: el['d-note'].value.trim(),
      source: 'proshop'
    };
    try {
      if (state.target.mode === 'edit') {
        T.editGroup(state.dateKey, state.target.time, state.target.groupId, details);
      } else {
        T.book(state.dateKey, state.target.time, details);
      }
    } catch (err) {
      el['booking-error'].textContent = err.message;
      el['booking-error'].hidden = false;
      return;
    }
    el['booking-dialog'].close();
    render();
  });

  /* ---------- Group details ---------- */

  function openGroupDialog(time, groupId) {
    var group = groupAt(time, groupId);
    if (!group) return;
    state.target = { time: time, groupId: groupId };

    el['g-error'].hidden = true;
    el['g-title'].textContent = group.name;
    el['g-sub'].textContent = whereLabel(time);

    var lines = [
      ['Status', group.status === 'checked-in' ? 'Checked in' : 'Booked'],
      ['Players', String(group.size)],
      ['Holes', group.holes + ' holes'],
      ['Cart', group.cart ? 'Riding' : 'Walking'],
      ['Confirmation', group.conf]
    ];
    if (group.phone) lines.push(['Phone', group.phone]);
    if (group.note) lines.push(['Note', group.note]);

    el['g-lines'].innerHTML = lines.map(function (l) {
      return '<div class="line"><span class="muted">' + l[0] + '</span><span><strong>' +
        esc(l[1]) + '</strong></span></div>';
    }).join('') +
    '<div class="line line--total"><span>Due at the course</span><span>' +
      T.money(T.groupTotal(state.dateKey, time, group)) + '</span></div>';

    var past = isPast();
    el['g-checkin'].hidden = past || group.status === 'checked-in';
    el['g-cancel-booking'].hidden = past;
    el['g-edit'].hidden = past;
    el['g-move'].hidden = past;
    el['group-dialog'].showModal();
  }

  document.getElementById('g-close').addEventListener('click', function () {
    el['group-dialog'].close();
  });
  el['g-checkin'].addEventListener('click', function () {
    T.setGroupStatus(state.dateKey, state.target.time, state.target.groupId, 'checked-in');
    el['group-dialog'].close();
    render();
  });
  el['g-cancel-booking'].addEventListener('click', function () {
    var group = groupAt(state.target.time, state.target.groupId);
    if (!group) return el['group-dialog'].close();
    if (!window.confirm('Cancel ' + group.name + ' at ' + T.formatTime(state.target.time) + '?')) return;
    T.cancelGroup(state.dateKey, state.target.time, state.target.groupId);
    el['group-dialog'].close();
    render();
  });
  el['g-edit'].addEventListener('click', function () {
    var t = state.target;
    el['group-dialog'].close();
    openBookingDialog('edit', t.time, t.groupId);
  });
  el['g-move'].addEventListener('click', function () {
    var t = state.target;
    el['group-dialog'].close();
    openMoveDialog(t.time, t.groupId);
  });

  /* ---------- Move booking ---------- */

  function openMoveDialog(time, groupId) {
    var group = groupAt(time, groupId);
    if (!group) return;
    state.target = { time: time, groupId: groupId, group: group, toTime: null };

    el['move-error'].hidden = true;
    el['move-sub'].textContent = group.name + ' · ' + group.size + ' player' +
      (group.size === 1 ? '' : 's') + ' · now at ' + whereLabel(time);
    el['m-date'].value = state.dateKey;
    el['m-date'].min = T.todayKey();
    el['m-times-field'].hidden = true;
    el['m-times'].innerHTML = '';
    el['move-save'].disabled = true;
    el['move-save'].textContent = 'Move booking';
    el['move-dialog'].showModal();
  }

  el['m-find'].addEventListener('click', function () {
    var t = state.target;
    var toDate = el['m-date'].value;
    el['move-error'].hidden = true;
    if (!toDate || toDate < T.todayKey()) {
      el['move-error'].textContent = "Pick today or a day that's still ahead.";
      el['move-error'].hidden = false;
      return;
    }
    state.target.toDate = toDate;
    var rows = T.day(toDate).filter(function (r) {
      if (toDate === state.dateKey && r.time === t.time) return false;
      return !r.blocked && r.open >= t.group.size;
    });

    var parts = [['morning', 'Morning'], ['midday', 'Midday'], ['afternoon', 'Afternoon']];
    var html = '';
    parts.forEach(function (p) {
      var inPart = rows.filter(function (r) { return r.part === p[0]; });
      if (!inPart.length) return;
      html += '<p class="small muted" style="margin:.6rem 0 .5rem">' + p[1] + '</p>' +
        '<div class="choices">' + inPart.map(function (r) {
          return '<label class="choice"><input type="radio" name="m-time" value="' + r.time + '">' +
            '<span>' + r.label + '</span></label>';
        }).join('') + '</div>';
    });
    if (!html) {
      html = '<p style="font-weight:700">No open times that fit ' + t.group.size +
        ' player' + (t.group.size === 1 ? '' : 's') + ' on that day.</p>';
    }
    el['m-times'].innerHTML = html;
    el['m-times-field'].hidden = false;
    el['move-save'].disabled = true;
    document.querySelectorAll('input[name="m-time"]').forEach(function (input) {
      input.addEventListener('change', function () {
        el['move-save'].disabled = false;
        el['move-save'].textContent = 'Move to ' + T.formatTime(input.value);
        state.target.toTime = input.value;
      });
    });
  });

  document.getElementById('move-cancel').addEventListener('click', function () {
    el['move-dialog'].close();
  });

  el['move-form'].addEventListener('submit', function (e) {
    e.preventDefault();
    var t = state.target;
    if (!t.toTime) return;
    try {
      T.moveGroup(
        { dateKey: state.dateKey, time: t.time, groupId: t.groupId },
        { dateKey: t.toDate, time: t.toTime });
    } catch (err) {
      el['move-error'].textContent = err.message;
      el['move-error'].hidden = false;
      return;
    }
    el['move-dialog'].close();
    render();
  });

  /* ---------- Blocked time (unblock) ---------- */

  function openBlockedDialog(time) {
    if (isPast()) return;
    var row = rowFor(time);
    if (!row || !row.blocked) return;
    state.target = { time: time };
    el['block-error'].hidden = true;
    el['block-sub'].textContent = whereLabel(time);
    el['block-note'].textContent = row.note || '';
    el['block-note'].hidden = !row.note;
    el['block-dialog'].showModal();
  }

  document.getElementById('block-cancel').addEventListener('click', function () {
    el['block-dialog'].close();
  });
  el['block-unblock'].addEventListener('click', function () {
    T.setBlocked(state.dateKey, state.target.time, false);
    el['block-dialog'].close();
    render();
  });

  /* ---------- Block a range ---------- */

  function openBlockRangeDialog() {
    if (isPast()) return;
    el['br-error'].hidden = true;
    el['br-sub'].textContent = T.formatLong(state.dateKey);
    var times = T.slotTimes();
    var options = times.map(function (t) {
      return '<option value="' + t + '">' + T.formatTime(t) + '</option>';
    }).join('');
    el['br-from'].innerHTML = options;
    el['br-to'].innerHTML = options;
    el['br-to'].value = times[Math.min(5, times.length - 1)];
    updateBlockRangeConsequence();
    el['block-range-dialog'].showModal();
  }

  function blockRangeTimes() {
    var times = T.slotTimes();
    var from = times.indexOf(el['br-from'].value);
    var to = times.indexOf(el['br-to'].value);
    if (from < 0 || to < 0 || to < from) return [];
    return times.slice(from, to + 1);
  }

  function updateBlockRangeConsequence() {
    var times = blockRangeTimes();
    var groups = 0;
    T.day(state.dateKey).forEach(function (row) {
      if (times.indexOf(row.time) !== -1) groups += row.groups.length;
    });
    if (!times.length) {
      el['br-consequence'].textContent = 'The "through" time has to come after the "from" time.';
      el['br-consequence'].hidden = false;
      el['br-confirm-wrap'].hidden = true;
      el['br-save'].disabled = true;
      return;
    }
    el['br-save'].disabled = false;
    el['br-save'].textContent = 'Block ' + times.length + ' time' + (times.length === 1 ? '' : 's');
    if (groups > 0) {
      el['br-consequence'].innerHTML = 'This blocks <strong>' + times.length + ' tee time' +
        (times.length === 1 ? '' : 's') + '</strong>, and <strong>' + groups + ' booked group' +
        (groups === 1 ? '' : 's') + '</strong> on them will be removed.';
      el['br-consequence'].hidden = false;
      el['br-confirm-text'].textContent = 'I understand ' +
        (groups === 1 ? 'that group comes' : 'those ' + groups + ' groups come') + ' off the sheet';
      el['br-confirm'].checked = false;
      el['br-confirm-wrap'].hidden = false;
    } else {
      el['br-consequence'].hidden = true;
      el['br-confirm-wrap'].hidden = true;
    }
  }

  el['br-from'].addEventListener('change', updateBlockRangeConsequence);
  el['br-to'].addEventListener('change', updateBlockRangeConsequence);

  document.getElementById('br-cancel').addEventListener('click', function () {
    el['block-range-dialog'].close();
  });

  el['br-form'].addEventListener('submit', function (e) {
    e.preventDefault();
    if (!el['br-confirm-wrap'].hidden && !el['br-confirm'].checked) {
      el['br-error'].textContent = 'Tick the box to confirm removing those groups.';
      el['br-error'].hidden = false;
      return;
    }
    T.blockRange(state.dateKey, blockRangeTimes(), el['br-reason'].value.trim());
    el['block-range-dialog'].close();
    render();
  });
})();
