// /scripts/paid-upgrades-handler.js
// Single source of truth for finalizing paid upgrades after Stripe payment
// Idempotent - safe to call multiple times using payment_processed flag
//
// This handler processes PAID UPGRADES only:
// - banner, premium, pin, confidential, plus upgrade
//
// Commission changes are finalized in signature.html when the seller signs the new ISC.
// This ensures commission updates happen at the legally correct moment (signature time).

import { db } from "/scripts/firebase-init.js";
import {
  doc, getDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Finalizes paid upgrades after Stripe checkout
 * 
 * This function:
 * - Reads session_id from URL
 * - Reads lastListingId from localStorage
 * - Reads checkoutData from localStorage
 * - Loads the listing from Firestore
 * - Merges upgrades into paidUpgrades (doesn't overwrite existing)
 * - Processes: banner, premium, pin, confidential, plus upgrade
 * - Upgrades plan to Plus only if upgradeToPlus is true OR checkoutData.plan is Plus
 * - For commission change, does NOT auto-upgrade to Plus (unless upgradeToPlus is also true)
 * - Marks as processed using localStorage flag
 * 
 * NOTE: Commission changes are NOT written to Firestore here. They are finalized
 * in signature.html when the seller signs the new ISC. This ensures commission
 * updates happen at the legally correct moment.
 * 
 * @returns {Promise<{processed: boolean, error?: string}>}
 */
export async function updatePaidUpgradesAfterPayment() {
  try {
    // Read session_id from URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    
    if (!sessionId) {
      console.log('[paid-upgrades] No session_id in URL - nothing to process');
      return { processed: false };
    }

    // Check if already processed (idempotency)
    const processedKey = `payment_processed:${sessionId}`;
    if (localStorage.getItem(processedKey) === 'true') {
      console.log('[paid-upgrades] Already processed session:', sessionId);
      return { processed: false, alreadyProcessed: true };
    }

    // Read listingId from localStorage
    const listingId = localStorage.getItem('lastListingId');
    if (!listingId) {
      console.warn('[paid-upgrades] No lastListingId in localStorage');
      return { processed: false, error: 'No listing ID found' };
    }

    // Read checkoutData from localStorage
    let checkoutData = {};
    try {
      const checkoutDataRaw = localStorage.getItem('checkoutData');
      if (checkoutDataRaw) {
        checkoutData = JSON.parse(checkoutDataRaw);
      }
    } catch (e) {
      console.warn('[paid-upgrades] Could not parse checkoutData:', e);
    }

    console.log('[paid-upgrades] Processing payment for listing:', listingId);
    console.log('[paid-upgrades] checkoutData:', checkoutData);

    // Load current listing from Firestore
    const listingRef = doc(db, 'listings', listingId);
    const listingSnap = await getDoc(listingRef);
    
    if (!listingSnap.exists()) {
      console.error('[paid-upgrades] Listing not found:', listingId);
      return { processed: false, error: 'Listing not found' };
    }

    const currentData = listingSnap.data();
    const currentPlan = currentData.plan || 'Listed Property Basic';
    const existingPaidUpgrades = currentData.paidUpgrades || {};
    
    console.log('[paid-upgrades] Current plan:', currentPlan);
    console.log('[paid-upgrades] Existing paidUpgrades:', existingPaidUpgrades);

    // Determine what was purchased from checkoutData
    const upgrades = checkoutData.upgrades || {};
    const meta = checkoutData.meta || {};
    
    // Build new paidUpgrades object by MERGING with existing
    const newPaidUpgrades = { ...existingPaidUpgrades };
    
    if (upgrades.banner) {
      newPaidUpgrades.banner = true;
      console.log('[paid-upgrades] Adding banner upgrade');
    }
    
    if (upgrades.premium) {
      newPaidUpgrades.premium = true;
      console.log('[paid-upgrades] Adding premium upgrade');
    }
    
    if (upgrades.pin) {
      newPaidUpgrades.pin = true;
      newPaidUpgrades.premium = true; // Pin includes Premium
      console.log('[paid-upgrades] Adding pin upgrade (includes premium)');
    }
    
    if (upgrades.confidential) {
      newPaidUpgrades.confidential = true;
      console.log('[paid-upgrades] Adding confidential upgrade');
    }

    // Check if paidUpgrades actually changed
    const paidUpgradesChanged =
      JSON.stringify(existingPaidUpgrades) !== JSON.stringify(newPaidUpgrades);

    // Prepare update object
    const updateData = {
      updatedAt: serverTimestamp()
    };

    if (paidUpgradesChanged) {
      updateData.paidUpgrades = newPaidUpgrades;
      console.log('[paid-upgrades] paidUpgrades changed, will update');
    } else {
      console.log('[paid-upgrades] paidUpgrades unchanged, skipping that field');
    }

    // Handle plan upgrade to Plus
    // Upgrade to Plus if:
    // 1. upgradeToPlus was purchased, OR
    // 2. checkoutData.plan is "Listed Property Plus"
    // BUT NOT if this was ONLY a commission change (unless upgradeToPlus is also true)
    
    const shouldUpgradeToPlusExplicit = upgrades.upgradeToPlus === true;
    const checkoutPlanIsPlus = checkoutData.plan === 'Listed Property Plus';
    const isCommissionChangeOnly = upgrades.changeCommission === true && 
                                    meta.fromChangeCommission === true &&
                                    !shouldUpgradeToPlusExplicit;
    
    if ((shouldUpgradeToPlusExplicit || checkoutPlanIsPlus) && !isCommissionChangeOnly) {
      if (currentPlan === 'Listed Property Basic') {
        updateData.plan = 'Listed Property Plus';
        localStorage.setItem('selectedPlan', 'Listed Property Plus');
        console.log('[paid-upgrades] Upgrading plan from Basic to Plus');
      }
    } else if (isCommissionChangeOnly) {
      console.log('[paid-upgrades] Commission change purchase - NOT auto-upgrading plan');
    }

    // NOTE: Commission change is NOT handled here - it's finalized in signature.html
    // when the seller signs the new ISC. This handler only processes paid upgrades
    // (banner, premium, pin, confidential, plus upgrade).

    // Write to Firestore only if something changed (more than just updatedAt)
    if (Object.keys(updateData).length > 1) {
      console.log('[paid-upgrades] Writing to Firestore:', updateData);
      await updateDoc(listingRef, updateData);
    } else {
      console.log('[paid-upgrades] Nothing to update in Firestore (skipping write)');
    }

    // Mark as processed (idempotency flag)
    localStorage.setItem(processedKey, 'true');
    console.log('[paid-upgrades] Marked session as processed:', sessionId);

    // Clear upgrade flags from checkoutData only if we actually processed something
    // (i.e., wrote paidUpgrades or plan to Firestore)
    if (paidUpgradesChanged || updateData.plan) {
      if (checkoutData.upgrades) {
        checkoutData.upgrades = {
          upgradeToPlus: false,
          banner: false,
          premium: false,
          pin: false,
          confidential: false,
          changeCommission: false
        };
      }
      if (checkoutData.meta) {
        checkoutData.meta.fromSellerDetail = false;
        // NOTE: We do NOT clear fromChangeCommission, newCommission, or newCommissionType here.
        // Those are cleared by signature.html after the commission is finalized.
      }
      localStorage.setItem('checkoutData', JSON.stringify(checkoutData));
      console.log('[paid-upgrades] Cleared upgrade flags from checkoutData');
    } else {
      console.log('[paid-upgrades] Nothing processed, leaving checkoutData unchanged');
    }

    return { 
      processed: true, 
      upgrades: newPaidUpgrades,
      plan: updateData.plan || currentPlan
    };

  } catch (error) {
    console.error('[paid-upgrades] Error processing payment:', error);
    return { processed: false, error: error.message };
  }
}

/**
 * Check if a payment session has already been processed
 * @param {string} sessionId - Stripe session ID
 * @returns {boolean}
 */
export function isPaymentProcessed(sessionId) {
  if (!sessionId) return false;
  return localStorage.getItem(`payment_processed:${sessionId}`) === 'true';
}

/**
 * Clear the processed flag for a session (useful for testing)
 * @param {string} sessionId - Stripe session ID
 */
export function clearProcessedFlag(sessionId) {
  if (sessionId) {
    localStorage.removeItem(`payment_processed:${sessionId}`);
    console.log('[paid-upgrades] Cleared processed flag for session:', sessionId);
  }
}

// Auto-run if imported as a module (for backward compatibility)
if (typeof window !== 'undefined') {
  window.updatePaidUpgradesAfterPayment = updatePaidUpgradesAfterPayment;
}
