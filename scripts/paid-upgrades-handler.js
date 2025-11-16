// /scripts/paid-upgrades-handler.js
// Handles updating Firestore with paid upgrades after successful Stripe checkout
// Include this in signature.html and agent-detail.html

export async function updatePaidUpgradesAfterPayment() {
  try {
    console.log("[paid-upgrades] Checking for payment success...");
    
    // Check if this is a return from Stripe (has session_id in URL)
    const url = new URL(window.location.href);
    const sessionId = url.searchParams.get("session_id");
    
    if (!sessionId) {
      console.log("[paid-upgrades] No session_id found, skipping upgrade tracking");
      return;
    }

    const listingId = (localStorage.getItem("lastListingId") || "").trim();
    if (!listingId) {
      console.warn("[paid-upgrades] No listingId found");
      return;
    }

    // Get checkout data
    const getJSON = (k, fb) => { 
      try { return JSON.parse(localStorage.getItem(k)) ?? fb; } 
      catch { return fb; } 
    };
    const checkoutData = getJSON("checkoutData", {});
    
    if (!checkoutData || !checkoutData.upgrades) {
      console.warn("[paid-upgrades] No checkout data found");
      return;
    }

    // Import Firestore
    const { db } = await import("/scripts/firebase-init.js");
    if (!db) {
      console.warn("[paid-upgrades] Firestore not available");
      return;
    }
    
    const { doc, getDoc, updateDoc, serverTimestamp } = 
      await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

    // Check if we've already processed this payment
    const processingKey = `payment_processed:${sessionId}`;
    if (localStorage.getItem(processingKey)) {
      console.log("[paid-upgrades] Payment already processed, skipping");
      return;
    }

    // Get current listing data to check if upgrades are already recorded
    const listingRef = doc(db, "listings", listingId);
    const listingSnap = await getDoc(listingRef);
    
    if (!listingSnap.exists()) {
      console.warn("[paid-upgrades] Listing not found:", listingId);
      return;
    }

    const currentData = listingSnap.data();
    const currentPaidUpgrades = currentData.paidUpgrades || {};

    // Build paidUpgrades object based on what was purchased
    const paidUpgrades = {
      banner: !!checkoutData.upgrades?.banner || !!currentPaidUpgrades.banner,
      premium: !!checkoutData.upgrades?.premium || !!checkoutData.upgrades?.pin || !!currentPaidUpgrades.premium,
      pin: !!checkoutData.upgrades?.pin || !!currentPaidUpgrades.pin,
      confidential: !!checkoutData.upgrades?.confidential || !!currentPaidUpgrades.confidential
    };

    // Prepare update object
    const updateData = {
      paidUpgrades,
      updatedAt: serverTimestamp()
    };

    // If plan was upgraded to Plus, update that too
    const isFSBOPlan = (p) => typeof p === "string" && p.includes("FSBO");
    const upgraded = (checkoutData?.plan || "").includes("Listed Property Plus")
                  || checkoutData?.upgrades?.upgradeToPlus
                  || checkoutData?.upgrades?.banner
                  || checkoutData?.upgrades?.premium
                  || checkoutData?.upgrades?.pin;

    if (upgraded && !isFSBOPlan(checkoutData.plan)) {
      updateData.plan = "Listed Property Plus";
    }

    // Update the listing document
    await updateDoc(listingRef, updateData);
    
    // Mark this payment as processed
    localStorage.setItem(processingKey, "true");
    
    console.log("[paid-upgrades] ✅ Successfully updated paidUpgrades:", paidUpgrades);
    if (updateData.plan) {
      console.log("[paid-upgrades] ✅ Updated plan to:", updateData.plan);
    }

    return true;
  } catch (e) {
    console.error("[paid-upgrades] Failed to update paid upgrades:", e);
    return false;
  }
}

// Auto-run if imported as a module
if (typeof window !== 'undefined') {
  window.updatePaidUpgradesAfterPayment = updatePaidUpgradesAfterPayment;
}
