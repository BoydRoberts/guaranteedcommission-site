// /checkout.js
document.addEventListener("DOMContentLoaded", () => {
  // --- 1) Init Stripe (test key) ---
  const stripe = Stripe("pk_test_51RiGoUPTiT2zuxx0T2Jk2YSvCjeHeQLb8KJnNs8gPwLtGq3AxqydjA4wcHknoee1GMB9zlKLG093DIAIE61KLqyw00hEmYRmhD");

  // --- 2) Load checkoutData produced by checkout.html ---
  const checkoutData = JSON.parse(localStorage.getItem("checkoutData") || "{}");

  // Defensive defaults
  const {
    selectedPlan = "Listed Property Basic",
    upgradeToPlus = false,
    banner = false,
    premium = false,
    pin = false,
    confidential = false,
    baseCost = 0,
    total = 0
  } = checkoutData;

  // --- 3) Map products to Stripe Price IDs ---
  // Keep these centralized so it’s easy to swap to live IDs later.
  const PRICE_IDS = {
    LISTED_PLUS: "price_1RsQFlPTiT2zuxx0414nGtTu",      // $20
    FSBO_PLUS:   "price_1RsQJbPTiT2zuxx0w3GUIdxJ",      // $100
    BANNER:      "price_1RsQTOPTiT2zuxx0TLCwAthR",      // $10
    PREMIUM:     "price_1RsQbjPTiT2zuxx0hA6p5H4h",      // $10
    PIN:         "price_1RsQknPTiT2zuxx0Av9skJyW",      // $50 (includes Premium)
    CONFIDENTIAL:"price_1RsRP4PTiT2zuxx0eoOGEDvm"       // $100
  };

  // --- 4) Build Stripe line items based on the final plan & upsells ---
  const lineItems = [];

  // Base plan price item
  // If the final plan is Listed Property Plus and baseCost==20, add LP Plus price
  if (selectedPlan === "Listed Property Plus" && baseCost === 20) {
    lineItems.push({ price: PRICE_IDS.LISTED_PLUS, quantity: 1 });
  }
  // If FSBO Plus and baseCost==100, add FSBO price
  if (selectedPlan === "FSBO Plus" && baseCost === 100) {
    lineItems.push({ price: PRICE_IDS.FSBO_PLUS, quantity: 1 });
  }

  // Upsells
  if (banner) {
    lineItems.push({ price: PRICE_IDS.BANNER, quantity: 1 });
  }

  if (pin) {
    // Pin includes Premium — only charge Pin ($50)
    lineItems.push({ price: PRICE_IDS.PIN, quantity: 1 });
  } else if (premium) {
    lineItems.push({ price: PRICE_IDS.PREMIUM, quantity: 1 });
  }

  if (confidential) {
    lineItems.push({ price: PRICE_IDS.CONFIDENTIAL, quantity: 1 });
  }

  // --- 5) Debug log so we can verify everything in the console ---
  console.debug("[checkout.js] checkoutData:", checkoutData);
  console.debug("[checkout.js] computed lineItems:", lineItems);

  // --- 6) Handle $0 total: skip Stripe and move forward immediately ---
  if (!total || total === 0 || lineItems.length === 0) {
    // No charge — continue straight to signature
    // (Keeps your zero-dollar Basic flow snappy)
    window.location.href = "/signature.html";
    return;
  }

  // --- 7) Attach handler to the "Pay Now with Stripe" button ---
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
