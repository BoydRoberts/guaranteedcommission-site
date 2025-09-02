// /scripts/firebase-init.js
// Loads Firebase SDKs (web, no build tools) and initializes your app once.
// You can import { app, auth, db } anywhere via:  import { app, auth, db } from '/scripts/firebase-init.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ⬇️ Replace the object below with YOUR firebaseConfig from the console
const firebaseConfig = {
  // apiKey: "YOUR_KEY",
  // authDomain: "YOUR_DOMAIN",
  // projectId: "YOUR_PROJECT_ID",
  // storageBucket: "YOUR_BUCKET",
  // messagingSenderId: "YOUR_SENDER_ID",
  // appId: "YOUR_APP_ID"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Optional: expose globally for quick testing in DevTools
window.gc = { app, auth, db };
console.log('[firebase] initialized:', app.name);
