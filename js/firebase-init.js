/* ==========================================================================
   Firebase bootstrap. Every app page imports { app, auth, db } from here.
   The config below is the public client identifier for the project —
   security lives in firestore.rules, not in hiding these values.
   ========================================================================== */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';

export const app = initializeApp({
  apiKey: 'AIzaSyAw4NN8B6-i-CUBy1GtKeZeN2juiwJfnlA',
  authDomain: 'studio-6494679748-de621.firebaseapp.com',
  projectId: 'studio-6494679748-de621',
  storageBucket: 'studio-6494679748-de621.firebasestorage.app',
  messagingSenderId: '262962197928',
  appId: '1:262962197928:web:47cb2349c0011bf4c3199d'
});

export const auth = getAuth(app);

/* Offline cache keeps the sheet readable through connection blips, and the
   multi-tab manager lets two open tabs share it instead of fighting. */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
