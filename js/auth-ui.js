/* ==========================================================================
   Sign up / sign in / reset password form behaviour.
   Each page calls exactly one of the exported wire* functions.
   Firebase error codes are translated into plain words.
   ========================================================================== */

import { auth } from './firebase-init.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';

function plainWords(err) {
  const code = err && err.code ? err.code : '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'That email already has an account — sign in instead.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return "That email and password don't match. Check both and try again.";
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return "That doesn't look like an email address.";
    case 'auth/weak-password':
      return 'Use at least 8 characters for your password.';
    case 'auth/missing-password':
      return 'Type your password.';
    case 'auth/too-many-requests':
      return 'Too many tries in a row — wait a minute, then try again.';
    case 'auth/network-request-failed':
      return "Couldn't reach the server — check your connection and try again.";
    default:
      return 'Something went wrong — try again.';
  }
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = false;
}

/** Disable the button and swap its label while a request is in flight. */
async function withBusy(button, busyLabel, task) {
  const restingLabel = button.textContent;
  button.disabled = true;
  button.textContent = busyLabel;
  try {
    await task();
  } finally {
    button.disabled = false;
    button.textContent = restingLabel;
  }
}

/** signup.html — creating the account leads straight into course setup. */
export function wireSignup(form, emailInput, passwordInput, errorBox, submitButton) {
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorBox.hidden = true;

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email) return showError(errorBox, 'Type the email you want to sign in with.');
    if (password.length < 8) return showError(errorBox, 'Use at least 8 characters for your password.');

    withBusy(submitButton, 'Creating your account…', async function () {
      try {
        await createUserWithEmailAndPassword(auth, email, password);
        window.location.replace('setup.html');
      } catch (err) {
        showError(errorBox, plainWords(err));
      }
    });
  });
}

/** login.html — the sheet's own guard sends unfinished setups to the wizard. */
export function wireLogin(form, emailInput, passwordInput, errorBox, submitButton) {
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorBox.hidden = true;

    withBusy(submitButton, 'Signing in…', async function () {
      try {
        await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
        window.location.replace('sheet.html');
      } catch (err) {
        showError(errorBox, plainWords(err));
      }
    });
  });
}

/** reset.html — the same sent message either way, so addresses can't be probed. */
export function wireReset(form, emailInput, errorBox, sentBox, submitButton) {
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorBox.hidden = true;

    const email = emailInput.value.trim();
    if (!email) return showError(errorBox, 'Type the email you signed up with.');

    withBusy(submitButton, 'Sending…', async function () {
      try {
        await sendPasswordResetEmail(auth, email);
      } catch (err) {
        // Deliberately fall through: user-not-found must read the same as sent.
        if (err && err.code === 'auth/network-request-failed') {
          return showError(errorBox, plainWords(err));
        }
      }
      sentBox.hidden = false;
      form.hidden = true;
    });
  });
}
