// /scripts/auth-state.js
// Phase 1: Shared auth state helper for GuaranteedCommission.com
//
// TRANSITION MODE: localStorage is PRIMARY, Firebase Auth is SECONDARY.
// During Phases 1-4, all pages still read/write localStorage directly.
// This file sets up the Firebase Auth listener in the background so that
// when Phase 5 flips the priority, every page using these exports
// will seamlessly switch to Firebase Auth without code changes.
//
// Usage (future — no page imports this yet):
//   import { isLoggedIn, getLoggedInEmail, waitForAuthInit, onAuthReady } from "/scripts/auth-state.js";

import { auth } from "/scripts/firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// =========================================================================
// INTERNAL STATE
// =========================================================================
let _isAuthReady = false;
let _currentUser = null;
let _authReadyCallbacks = [];

// =========================================================================
// FIREBASE AUTH LISTENER (runs in background, does NOT control pages yet)
// =========================================================================
onAuthStateChanged(auth, (user) => {
  _currentUser = user || null;
  _isAuthReady = true;

  console.log("[auth-state] onAuthStateChanged:", user ? user.email : "signed out");

  // Flush any pending waitForAuthInit() promises
  while (_authReadyCallbacks.length > 0) {
    const cb = _authReadyCallbacks.shift();
    try { cb(); } catch (e) { console.warn("[auth-state] callback error:", e); }
  }
});

// =========================================================================
// waitForAuthInit()
// Returns a Promise that resolves once Firebase Auth has responded.
// Includes a 3-second timeout so pages never hang on slow connections.
// =========================================================================
export function waitForAuthInit() {
  if (_isAuthReady) return Promise.resolve();

  return new Promise((resolve) => {
    // Register callback for when auth fires
    _authReadyCallbacks.push(resolve);

    // Safety timeout: resolve anyway after 3 seconds
    setTimeout(() => {
      if (!_isAuthReady) {
        console.warn("[auth-state] Auth init timed out after 3s — falling back to localStorage");
        _isAuthReady = true;
        resolve();
      }
    }, 3000);
  });
}

// =========================================================================
// isLoggedIn()  [SYNCHRONOUS — drop-in replacement for existing checks]
//
// TRANSITION MODE (Phases 1-4):
//   Reads localStorage first. This matches the current behavior of every
//   page on the site. Firebase Auth state is ignored for now.
//
// PRODUCTION MODE (Phase 5+):
//   Flip the priority: check _currentUser first, localStorage second.
//   (We will update this function when all pages are migrated.)
// =========================================================================
export function isLoggedIn() {
  // PRIMARY: localStorage (current system — keeps all existing pages working)
  const localEmail = (localStorage.getItem('loggedInEmail') || '').trim();
  if (localEmail.length > 0) return true;

  // SECONDARY: Firebase Auth (future — captures users who logged in via Firebase)
  if (_isAuthReady && _currentUser && _currentUser.email) return true;

  return false;
}

// =========================================================================
// getLoggedInEmail()  [ASYNC — waits for auth init before responding]
//
// Same priority as isLoggedIn(): localStorage first, Firebase second.
// Returns empty string if no user is found.
// =========================================================================
export async function getLoggedInEmail() {
  await waitForAuthInit();

  // PRIMARY: localStorage
  const localEmail = (localStorage.getItem('loggedInEmail') || '').trim();
  if (localEmail) return localEmail;

  // SECONDARY: Firebase Auth
  if (_currentUser && _currentUser.email) return _currentUser.email;

  return '';
}

// =========================================================================
// onAuthReady(callback)
// Convenience wrapper: runs callback once Firebase Auth has initialized.
// If auth is already ready, fires immediately.
// Callback receives the Firebase user (or null).
// =========================================================================
export function onAuthReady(callback) {
  if (typeof callback !== 'function') return;

  if (_isAuthReady) {
    try { callback(_currentUser); } catch (e) { console.warn("[auth-state] onAuthReady error:", e); }
    return;
  }

  _authReadyCallbacks.push(() => {
    try { callback(_currentUser); } catch (e) { console.warn("[auth-state] onAuthReady error:", e); }
  });
}

// =========================================================================
// getFirebaseUser()
// Exposes the raw Firebase Auth user for pages that need it directly
// (e.g., checking emailVerified status in Phase 3).
// Returns null if not signed in or auth hasn't initialized.
// =========================================================================
export function getFirebaseUser() {
  return _currentUser;
}

// =========================================================================
// isEmailVerified()
// Helper for Phase 3+: checks if the Firebase Auth user has verified
// their email. Returns false if not signed in via Firebase.
// =========================================================================
export function isEmailVerified() {
  if (_currentUser && typeof _currentUser.emailVerified === 'boolean') {
    return _currentUser.emailVerified;
  }
  return false;
}

console.log("[auth-state] loaded — transition mode (localStorage primary, Firebase secondary)");
