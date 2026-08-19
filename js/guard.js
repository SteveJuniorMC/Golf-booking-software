/* ==========================================================================
   Page guards. Auth pages bounce signed-in pros to the sheet; app pages
   bounce signed-out visitors to login; the sheet additionally requires a
   finished course setup.
   ========================================================================== */

import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';

/** On login/signup/reset: an already-signed-in pro goes straight to the sheet. */
export function redirectIfSignedIn() {
  onAuthStateChanged(auth, function (user) {
    if (user) window.location.replace('sheet.html');
  });
}

/** On sheet/setup: no user means the login page. Calls back with the user. */
export function requireAuth(onUser) {
  onAuthStateChanged(auth, function (user) {
    if (!user) window.location.replace('login.html');
    else onUser(user);
  });
}

/**
 * On the sheet: a missing or unfinished course doc means setup isn't done.
 * Resolves with the course data, or redirects and resolves null.
 */
export async function requireCourse(uid) {
  const snap = await getDoc(doc(db, 'courses', uid));
  if (!snap.exists() || snap.data().setupComplete !== true) {
    window.location.replace('setup.html');
    return null;
  }
  return snap.data();
}
