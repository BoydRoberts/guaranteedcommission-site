// /scripts/firebase-init.js
// Initializes Firebase once and exports shared single-source-of-truth config.
// Import anywhere via: import { app, auth, db, storage, STORAGE_BUCKET_GS, analytics } from "/scripts/firebase-init.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
// Google Analytics
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2ajOd_C8rfjOogqnGo-bZrD8kvjQ8XT4",
  authDomain: "guaranteedcommission-d4d91.firebaseapp.com",
  projectId: "guaranteedcommission-d4d91",

  // This value is used by Firebase SDKs internally:
  storageBucket: "guaranteedcommission-d4d91.firebasestorage.app",

  messagingSenderId: "900066461936",
  appId: "1:900066461936:web:31c07e0bc2fd47414b9a35",

  // Google Analytics Measurement ID
  measurementId: "G-HYT7NYF2M5"
};

// ✅ Single source of truth for gs:// bucket usage (used by getStorage(undefined, ...))
export const STORAGE_BUCKET_GS = "gs://guaranteedcommission-d4d91.firebasestorage.app";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Optional: create a shared storage instance.
// Note: passing STORAGE_BUCKET_GS ensures we always hit the same bucket.
export const storage = getStorage(undefined, STORAGE_BUCKET_GS);

// Google Analytics: track visitors across all pages that import this file
export const analytics = getAnalytics(app);

// Optional: expose globally for quick testing in DevTools
window.gc = { app, auth, db, storage, STORAGE_BUCKET_GS, analytics };
console.log("[firebase] initialized:", app.name, "bucket:", STORAGE_BUCKET_GS, "analytics active");
