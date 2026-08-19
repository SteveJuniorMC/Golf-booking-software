/* ==========================================================================
   TeeStore — every read and write the sheet makes.

   Reads are live: onSnapshot listeners on the course doc and on one day doc
   at a time. Writes are transactions that re-read the day inside the
   transaction and re-check capacity, so two counter devices can't oversell
   a tee time; the loser gets a friendly Error to show in the dialog.

   A day document is { slots: { "F09:40": {blocked, note, groups[]} },
   updatedAt } and only slots with content exist — every mutation rewrites
   the slots map whole, dropping keys that emptied out.
   ========================================================================== */

import { db } from './firebase-init.js';
import {
  doc, getDoc, onSnapshot, runTransaction, serverTimestamp, updateDoc
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { slotKey, confCode } from './lib/teetime.js';

let uid = null;

export function init(userUid) { uid = userUid; }

function courseRef() { return doc(db, 'courses', uid); }
function dayRef(dateKey) { return doc(db, 'courses', uid, 'days', dateKey); }

/* ---------- Live reads ---------- */

export function listenCourse(onData) {
  return onSnapshot(courseRef(), function (snap) {
    onData(snap.exists() ? snap.data() : null);
  });
}

/** onData(dayData|null, fromCache). Returns the unsubscribe function. */
export function listenDay(dateKey, onData) {
  return onSnapshot(dayRef(dateKey), { includeMetadataChanges: true }, function (snap) {
    onData(snap.exists() ? snap.data() : null, snap.metadata.fromCache);
  });
}

/** One-shot read of a day, for the move dialog's open-times search. */
export async function getDay(dateKey) {
  const snap = await getDoc(dayRef(dateKey));
  return snap.exists() ? snap.data() : null;
}

/** Remember that the pro finished (or skipped) the tour. */
export async function markTourDone() {
  await updateDoc(courseRef(), { tourDone: true });
}

/* ---------- The transaction shell every write goes through ---------- */

function emptySlot() { return { blocked: false, note: '', groups: [] }; }

function seatsTaken(slot) {
  return (slot.groups || []).reduce(function (sum, g) { return sum + g.size; }, 0);
}

function openSeats(course, slot) {
  return slot.blocked ? 0 : Math.max(0, course.slotSize - seatsTaken(slot));
}

/** Drop a slot key whose slot holds nothing worth storing. */
function compact(slots, key) {
  const slot = slots[key];
  if (slot && !slot.blocked && (!slot.groups || slot.groups.length === 0)) delete slots[key];
}

/**
 * Run mutate(slots) inside a transaction on one day. mutate edits the plain
 * slots object in place and may throw an Error with a message fit to show.
 */
async function withDay(dateKey, mutate) {
  await runTransaction(db, async function (tx) {
    const snap = await tx.get(dayRef(dateKey));
    const slots = snap.exists() ? Object.assign({}, snap.data().slots) : {};
    mutate(slots);
    tx.set(dayRef(dateKey), { slots: slots, updatedAt: serverTimestamp() });
  });
}

function spotsWord(n) { return n + ' spot' + (n === 1 ? '' : 's'); }

/* ---------- Mutations ---------- */

/**
 * Add a group to a tee time. details: {name, size, holes, cart, phone, note}.
 * Returns the group that was written.
 */
export async function bookGroup(course, dateKey, tee, time, details) {
  const key = slotKey(tee, time);
  const group = {
    id: crypto.randomUUID(),
    name: details.name,
    size: Number(details.size),
    holes: Number(details.holes),
    cart: !!details.cart,
    phone: details.phone || '',
    email: '',
    source: 'proshop',
    status: 'booked',
    note: details.note || '',
    conf: confCode(dateKey + time + details.name + Date.now()),
    createdAt: Date.now()
  };
  await withDay(dateKey, function (slots) {
    const slot = slots[key] || emptySlot();
    if (slot.blocked) throw new Error('That tee time is blocked.');
    const open = openSeats(course, slot);
    if (group.size > open) throw new Error('Only ' + spotsWord(open) + ' left on that tee time.');
    slots[key] = { blocked: false, note: slot.note || '', groups: (slot.groups || []).concat([group]) };
  });
  return group;
}

/** Change a group's details in place; re-checks room if the party grew. */
export async function editGroup(course, dateKey, tee, time, groupId, changes) {
  const key = slotKey(tee, time);
  await withDay(dateKey, function (slots) {
    const slot = slots[key];
    const group = slot && (slot.groups || []).find(function (g) { return g.id === groupId; });
    if (!group) throw new Error('That booking is no longer on this tee time.');
    const othersTaken = seatsTaken(slot) - group.size;
    const newSize = Number(changes.size);
    if (newSize > course.slotSize - othersTaken) {
      throw new Error('Only ' + spotsWord(course.slotSize - othersTaken) + ' on that tee time — a party of ' + newSize + " won't fit.");
    }
    Object.assign(group, {
      name: changes.name,
      size: newSize,
      holes: Number(changes.holes),
      cart: !!changes.cart,
      phone: changes.phone || '',
      note: changes.note || ''
    });
  });
}

export async function cancelGroup(dateKey, tee, time, groupId) {
  const key = slotKey(tee, time);
  await withDay(dateKey, function (slots) {
    const slot = slots[key];
    if (!slot) return;
    slot.groups = (slot.groups || []).filter(function (g) { return g.id !== groupId; });
    compact(slots, key);
  });
}

export async function setGroupStatus(dateKey, tee, time, groupId, status) {
  const key = slotKey(tee, time);
  await withDay(dateKey, function (slots) {
    const slot = slots[key];
    if (!slot) return;
    slot.groups = (slot.groups || []).map(function (g) {
      return g.id === groupId ? Object.assign({}, g, { status: status }) : g;
    });
  });
}

/**
 * Close (or reopen) the unbooked space on one tee time. Groups already on
 * the time are never touched — a block with groups on it just stops any
 * further bookings. Only blockRange() removes groups, behind its own
 * confirmation.
 */
export async function setBlocked(dateKey, tee, time, blocked, note) {
  const key = slotKey(tee, time);
  await withDay(dateKey, function (slots) {
    const slot = slots[key] || emptySlot();
    if (blocked) {
      slots[key] = { blocked: true, note: note || '', groups: slot.groups || [] };
    } else {
      slots[key] = { blocked: false, note: '', groups: slot.groups || [] };
      compact(slots, key);
    }
  });
}

/** Block every listed time on one tee, in one transaction. */
export async function blockRange(dateKey, tee, times, note) {
  await withDay(dateKey, function (slots) {
    for (const time of times) {
      slots[slotKey(tee, time)] = { blocked: true, note: note || 'Blocked by the pro shop', groups: [] };
    }
  });
}

/**
 * Move a group to another time — possibly on another day or tee. One
 * transaction covers both day docs, so the group can't be lost or doubled.
 */
export async function moveGroup(course, from, to) {
  // from: {dateKey, tee, time, groupId}   to: {dateKey, tee, time}
  const fromKey = slotKey(from.tee, from.time);
  const toKey = slotKey(to.tee, to.time);
  const sameDay = from.dateKey === to.dateKey;

  await runTransaction(db, async function (tx) {
    const fromSnap = await tx.get(dayRef(from.dateKey));
    const toSnap = sameDay ? fromSnap : await tx.get(dayRef(to.dateKey));

    const fromSlots = fromSnap.exists() ? Object.assign({}, fromSnap.data().slots) : {};
    const toSlots = sameDay ? fromSlots : (toSnap.exists() ? Object.assign({}, toSnap.data().slots) : {});

    const fromSlot = fromSlots[fromKey];
    const group = fromSlot && (fromSlot.groups || []).find(function (g) { return g.id === from.groupId; });
    if (!group) throw new Error('That booking is no longer where it was.');

    const toSlot = toSlots[toKey] || emptySlot();
    if (toSlot.blocked) throw new Error('That tee time is blocked.');
    const open = openSeats(course, toSlot);
    if (group.size > open) throw new Error('Only ' + spotsWord(open) + ' left on that tee time.');

    fromSlot.groups = fromSlot.groups.filter(function (g) { return g.id !== from.groupId; });
    compact(fromSlots, fromKey);
    toSlots[toKey] = { blocked: false, note: toSlot.note || '', groups: (toSlot.groups || []).concat([group]) };

    tx.set(dayRef(from.dateKey), { slots: fromSlots, updatedAt: serverTimestamp() });
    if (!sameDay) tx.set(dayRef(to.dateKey), { slots: toSlots, updatedAt: serverTimestamp() });
  });
}
