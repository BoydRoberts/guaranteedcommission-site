document.addEventListener("DOMContentLoaded", () => {
  console.log("[checkout.js] build 2025-08-11e");

  // --- Stripe (test) ---
  const stripe = Stripe("pk_test_51RiGoUPTiT2zuxx0T2Jk2YSvCjeHeQLb8KJnNs8gPwLtGq3AxqydjA4wcHknoee1GMB9zlKLG093DIAIE61KLqyw00hEmYRmhD");

  // --- helpers ---
  const $ = (sel) => document.querySelector(sel);
  const getJSON = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const setJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  // --- source of truth from upsell + checkout page ---
  let checkoutData = getJSON("checkoutData", null);
  if (!checkoutData) {
    // Defensive fallback (shouldn't happen in normal flow)
    const plan = localStorage.getItem("selectedPlan") || "Listed Property Basic";
    checkoutData = {
      plan,
      base: plan === "FSBO Plus" ? 100 : (plan === "Listed Property Plus" ? 20 : 0),
      upgrades: { upgradeToPlus:false, banner:false, premium:false, pin:false, confidential:false },
      prices:  { plus:20, banner:10, premium:10, pin:50, fsbo:100, confidential:100 },
      meta: {},
      total: 0
    };
    setJSON("checkoutData", checkoutData);
  }

  // --- promo code logic (agent promo) ---
  const promoCodeRaw = (localStorage.getItem("promoCode") || "").trim();
  const promoIsAugustFree = /^august\s*free$/i.test(promoCodeRaw);

  // If promo, make ALL upgrades free EXCEPT Confidential FSBO ($100)
  // Base plans still cost their usual amount (FSBO base 100, Plus base 20)
  function applyPromoToPrices(data) {
    const p = { ...data.prices };
    if (promoIsAugustFree) {
      p.plus = 0;
      p.banner = 0;
      p.premium = 0;
      p.pin = 0;
      // Confidential not free:
      // p.confidential stays as-is
    }
    return p;
  }

  // --- recompute total with promo-aware prices ---
  function computeTotal(data) {
    const isFSBO = data.plan === "FSBO Plus";
    const isPlus = data.plan === "Listed Property Plus";
    const isBasic = data.plan === "Listed Property Basic";

    const prices = applyPromoToPrices(data);

    // Derive base
    let base = 0;
    if (isFSBO) base = data.base ?? prices.fsbo;            // FSBO Plus base
    else if (isPlus) base = data.base ?? prices.plus;       // Listed Property Plus base
    else base = 0;                                          // Basic base is $0

    // If Basic + upgradeToPlus, the plan will remain "Listed Property Basic" in data,
    // but we charge Plus base (respecting promo). (We do NOT forcibly rename the plan here.)
    if (isBasic && data.upgrades.upgradeToPlus) {
      base = prices.plus;
    }

    let total = base;

    if (data.upgrades.banner)  total += prices.banner;
    if (data.upgrades.pin)     total += prices.pin;         // includes premium
    else if (data.upgrades.premium) total += prices.premium;
    if (data.upgrades.confidential) total += prices.confidential;

    data.total = total;
    data.prices = prices; // persist the promo-adjusted prices used for this calc
    return data;
  }

  checkoutData = computeTotal(checkoutData);
  setJSON("checkoutData", checkoutData);

  // --- Stripe price IDs ---
  const PRICE_IDS = {
    PLUS:         "price_1RsQFlPTiT2zuxx0414nGtTu", // $20 Listed Property Plus
    FSBO_PLUS:    "price_1RsQJbPTiT2zuxx0w3GUIdxJ", // $100 FSBO Plus (base)
    BANNER:       "price_1RsQTOPTiT2zuxx0TLCwAthR", // $10 Banner
    PREMIUM:      "price_1RsQbjPTiT2zuxx0hA6p5H4h", // $10 Premium
    PIN:          "price_1RsQknPTiT2zuxx0Av9skJyW", // $50 Pin (implies premium)
    CONFIDENTIAL: "price_1RsRP4PTiT2zuxx0eoOGEDvm"  // $100 Confidential FSBO
  };

  function buildLineItems(data) {
    const items = [];
    const isFSBO = data.plan === "FSBO Plus";
    const isPlus = data.plan === "Listed Property Plus";
    const isBasic = data.plan === "Listed Property Basic";

    // Base plan
    if (isFSBO) {
      if ((data.base ?? data.prices.fsbo) > 0) {
        items.push({ price: PRICE_IDS.FSBO_PLUS, quantity: 1 });
      }
    } else if (isPlus) {
      if ((data.base ?? data.prices.plus) > 0) {
        items.push({ price: PRICE_IDS.PLUS, quantity: 1 });
      }
    } else if (isBasic && data.upgrades.upgradeToPlus) {
      // Upgrading Basic -> Plus (respect promo; if promo zero, skip)
      if (data.prices.plus > 0) {
        items.push({ price: PRICE_IDS.PLUS, quantity: 1 });
      }
    }

    // Upsells (respect promo-altered prices; only add if > 0)
    if (data.upgrades.banner && data.prices.banner > 0) {
      items.push({ price: PRICE_IDS.BANNER, quantity: 1 });
    }

    if (data.upgrades.pin) {
      if (data.prices.pin > 0) items.push({ price: PRICE_IDS.PIN, quantity: 1 });
      // Premium is implied with pin, so we do NOT add PREMIUM separately.
    } else if (data.upgrades.premium && data.prices.premium > 0) {
      items.push({ price: PRICE_IDS.PREMIUM, quantity: 1 });
    }

    if (data.upgrades.confidential && data.prices.confidential > 0) {
      items.push({ price: PRICE_IDS.CONFIDENTIAL, quantity: 1 });
    }

    return items;
  }

  // Wire Pay button
  $("#payNowBtn")?.addEventListener("click", async () => {
    // Recompute once more in case the user toggled last-chance options just now
    checkoutData = computeTotal(getJSON("checkoutData", checkoutData));
    setJSON("checkoutData", checkoutData);

    // If total is zero, skip Stripe and go sign
    if ((checkoutData.total || 0) <= 0) {
      console.log("[checkout.js] $0 total — skipping Stripe and going to /signature.html");
      console.log("[checkout.js] final checkoutData:", checkoutData);
      window.location.href = "/signature.html";
      return;
    }

    // Build Stripe line items
    const lineItems = buildLineItems(checkoutData);

    // Debug dump before redirect
    console.log("[checkout.js] final checkoutData:", checkoutData);
    console.log("[checkout.js] final lineItems:", lineItems);

    if (!lineItems.length) {
      alert("Nothing selected to purchase.");
      return;
    }

    const { error } = await stripe.redirectToCheckout({
      lineItems,
      mode: "payment",
      successUrl: window.location.origin + "/signature.html",
      cancelUrl: window.location.origin + "/checkout.html"
    });

    if (error) {
      alert("Stripe error: " + error.message);
    }
  });
});
