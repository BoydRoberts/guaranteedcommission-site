// /checkout.js
document.addEventListener("DOMContentLoaded", () => {
  // --- 1) Init Stripe (test key) ---
  const stripe = Stripe("pk_test_51RiGoUPTiT2zuxx0T2Jk2YSvCjeHeQLb8KJnNs8gPwLtGq3AxqydjA4wcHknoee1GMB9zlKLG093DIAIE61KLqyw00hEmYRmhD");

  // --- 2) Load checkoutData produced by checkout.html ---
  let checkoutData = JSON.parse(localStorage.getItem("checkoutData") || "{}");

  // Defensive defaults
  let {
    selectedPlan = "Listed Property Basic",
    upgradeToPlus = false,
    banner = false,
    premium = false,
    pin = false,
    confidential = false,
    baseCost = 0,
    total = 0
  } = checkoutData;

  // --- 3) Read promo code (set on agent-detail page) ---
  const rawPromo = (localStorage.getItem("agentPromoCode") || "").trim();

  const isAugust2025 = (() => {
    const now = new Date();
    // JS month is 0-indexed: 7 = August
    return now.getUTCFullYear() === 2025 && now.getUTCMonth() === 7;
  })();

  const isAugustFree = (code) => {
    if (!code) return false;
    const normalized = code.replace(/\s+/g, "").toLowerCase(); // "August Free" or "AUGUSTFREE"
    return (normalized === "augustfree") && isAugust2025;
  };

  const promoApplied = isAugustFree(rawPromo);

  // --- 4) If promo applies, override selections to be FREE ---
  if (promoApplied) {
    // Upgrade logic:
    // - If Basic → force upgrade to Listed Property Plus
    // - If Plus → keep Plus
    // - If FSBO Plus → leave as-is (promo targets agent upgrades; keep extras free)
    if (selectedPlan === "Listed Property Basic") {
      selectedPlan = "Listed Property Plus";
      upgradeToPlus = true;
    }

    // Free upgrades for agents: Banner + Pin (which includes Premium)
    banner = true;
    pin = true;
    premium = true; // explicitly true so downstream UI shows Premium too

    // Confidential is NOT auto-added by promo (only applies to FSBO flow if user chose it)
    // If they had chosen it already, we zero it out too by making total $0.

    // Zero out pricing entirely
    baseCost = 0;
    total = 0;

    // Persist the override so subsequent pages see the promo result
    checkoutData = {
      ...checkoutData,
      selectedPlan,
      upgradeToPlus,
      banner,
      premium,
      pin,
      confidential,
      baseCost,
      total,
      promoApplied: true,
      promoCode: rawPromo
    };
    localStorage.setItem("checkoutData", JSON.stringify(checkoutData));
  }

  // --- 5) Map products to Stripe Price IDs ---
  const PRICE_IDS = {
    LISTED_PLUS: "price_1RsQFlPTiT2zuxx0414nGtTu",      // $20
    FSBO_PLUS:   "price_1RsQJbPTiT2zuxx0w3GUIdxJ",      // $100
    BANNER:      "price_1RsQTOPTiT2zuxx0TLCwAthR",      // $10
    PREMIUM:     "price_1RsQbjPTiT2zuxx0hA6p5H4h",      // $10
    PIN:         "price_1RsQknPTiT2zuxx0Av9skJyW",      // $50 (includes Premium)
    CONFIDENTIAL:"price_1RsRP4PTiT2zuxx0eoOGEDvm"       // $100
  };

  // --- 6) Build Stripe line items based on final selections ---
  const lineItems = [];

  if (!promoApplied) {
    // Only add line items if no promo override
    if (selectedPlan === "Listed Property Plus" && baseCost === 20) {
      lineItems.push({ price: PRICE_IDS.LISTED_PLUS, quantity: 1 });
    }
    if (selectedPlan === "FSBO Plus" && baseCost === 100) {
      lineItems.push({ price: PRICE_IDS.FSBO_PLUS, quantity: 1 });
    }
    if (banner) {
      lineItems.push({ price: PRICE_IDS.BANNER, quantity: 1 });
    }
    if (pin) {
      lineItems.push({ price: PRICE_IDS.PIN, quantity: 1 });
    } else if (premium) {
      lineItems.push({ price: PRICE_IDS.PREMIUM, quantity: 1 });
    }
    if (confidential) {
      lineItems.push({ price: PRICE_IDS.CONFIDENTIAL, quantity: 1 });
    }
  }

  // --- 7) Debug log so we can verify everything in the console ---
  console.debug("[checkout.js] rawPromo:", rawPromo, "promoApplied:", promoApplied);
  console.debug("[checkout.js] checkoutData (final):", checkoutData);
  console.debug("[checkout.js] computed lineItems:", lineItems);

  // --- 8) Handle $0 total: skip Stripe and move forward immediately ---
  if (!total || total === 0 || lineItems.length === 0) {
    if (promoApplied) {
      alert("Agent Promo Applied: “August Free”. Your upgrades are free this month. Proceeding to signature.");
    }
    window.location.href = "/signature.html";
    return;
  }

  // --- 9) Attach handler to the "Pay Now with Stripe" button ---
  const payBtn = document.getElementById("payNowButton");
  if (!payBtn) {
    console.warn("[checkout.js] payNowButton not found on page.");
    return;
  }

  payBtn.addEventListener("click", async () => {
    try {
      const { error } = await stripe.redirectToCheckout({
        lineItems,
        mode: "payment",
        successUrl: window.location.origin + "/signature.html",
        cancelUrl: window.location.href
      });

      if (error) {
        alert("Stripe error: " + error.message);
        console.error("[checkout.js] Stripe error:", error);
      }
    } catch (e) {
      alert("Unexpected error during checkout.");
      console.error("[checkout.js] Unexpected error:", e);
    }
  });
});
