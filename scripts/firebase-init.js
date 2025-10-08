// /scripts/firebase-init.js
// Loads Firebase SDKs (web, no build tools) and initializes your app once.
// You can import { app, auth, db } anywhere via:  import { app, auth, db } from '/scripts/firebase-init.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2ajOd_C8rfjOogqnGo-bZrD8kvjQ8XT4",
  authDomain: "guaranteedcommission-d4d91.firebaseapp.com",
  projectId: "guaranteedcommission-d4d91",
storageBucket: "guaranteedcommission-d4d91.appspot.com",
  messagingSenderId: "900066461936",
  appId: "1:900066461936:web:31c07e0bc2fd47414b9a35"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Optional: expose globally for quick testing in DevTools
window.gc = { app, auth, db };
console.log('[firebase] initialized:', app.name);
