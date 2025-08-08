document.addEventListener("DOMContentLoaded", () => {
  // ⛳ Your Stripe *test* publishable key
  const stripe = Stripe("pk_test_51RiGoUPTiT2zuxx0T2Jk2YSvCjeHeQLb8KJnNs8gPwLtGq3AxqydjA4wcHknoee1GMB9zlKLG093DIAIE61KLqyw00hEmYRmhD");

  // Read the normalized checkout payload we build earlier in the flow
  const checkoutData = JSON.parse(localStorage.getItem("checkoutData") || "{}");
  const selectedPlan = checkoutData.plan || localStorage.getItem("selectedPlan") || "Listed Property Basic";
  const upgrades = Array.isArray(checkoutData.upgrades) ? checkoutData.upgrades : [];
  const totalCost = Number(checkoutData.totalCost || 0);
  const payer = checkoutData.payer === "agent" ? "agent" : "seller"; // default seller

  // Decide where to send the user after payment
  // - Agent payer: go back to agent-detail to continue editing unlocked features
  // - Seller payer: proceed to signature
  const successUrl = window.location.origin + (payer === "agent" ? "/agent-detail.html" : "/signature.html");
  const cancelUrl = window.location.href;

  // Map plan/upgrades -> Stripe Price IDs
  // (Keep these in sync with your Stripe Dashboard)
  const PRICE_IDS = {
    PLUS: "price_1RsQFlPTiT2zuxx0414nGtTu",         // $20 Listed Property Plus
    FSBO_PLUS: "price_1RsQJbPTiT2zuxx0w3GUIdxJ",    // $100 FSBO Plus
    BANNER: "price_1RsQTOPTiT2zuxx0TLCwAthR",       // $10 Banner
    PREMIUM: "price_1RsQbjPTiT2zuxx0hA6p5H4h",      // $10 Premium Placement
    PIN: "price_1RsQknPTiT2zuxx0Av9skJyW",          // $50 Pin Placement (includes Premium)
    CONFIDENTIAL: "price_1RsRP4PTiT2zuxx0eoOGEDvm"  // $100 Confidential FSBO Upgrade
  };

  const lineItems = [];

  // Base plan
  if (selectedPlan === "Listed Property Plus") {
    lineItems.push({ price: PRICE_IDS.PLUS, quantity: 1 });
  } else if (selectedPlan === "FSBO Plus") {
    lineItems.push({ price: PRICE_IDS.FSBO_PLUS, quantity: 1 });
  }
  // (Listed Property Basic has no base charge)

  // Upgrades (we match by substring so the labels can stay human-friendly)
  const addIfChosen = (labelSubstr, priceId) => {
    if (upgrades.some(u => u.toLowerCase().includes(labelSubstr))) {
      lineItems.push({ price: priceId, quantity: 1 });
    }
  };

  addIfChosen("banner", PRICE_IDS.BANNER);
  if (upgrades.some(u => u.toLowerCase().includes("pin placement"))) {
    addIfChosen("pin placement", PRICE_IDS.PIN);
  } else {
    addIfChosen("premium placement", PRICE_IDS.PREMIUM);
  }
  addIfChosen("confidential fsbo", PRICE_IDS.CONFIDENTIAL);

  // 🧪 Debug: show what we're about to send
  console.log("[checkout.js] checkoutData:", checkoutData);
  console.log("[checkout.js] computed lineItems:", lineItems);
  console.log("[checkout.js] payer:", payer, "successUrl:", successUrl);

  // Handle $0 scenarios gracefully (e.g., Basic with no upsells)
  const payBtn = document.getElementById("payNowBtn") || document.querySelector("button");
  if (!payBtn) return;

  payBtn.addEventListener("click", async () => {
    // If total is explicitly zero, skip Stripe and go straight to successUrl
    if (totalCost === 0 || lineItems.length === 0) {
      console.log("[checkout.js] Skipping Stripe (free checkout). Redirecting to:", successUrl);
      window.location.href = successUrl;
      return;
    }

    const { error } = await stripe.redirectToCheckout({
      lineItems,
      mode: "payment",
      successUrl,
      cancelUrl
    });

    if (error) {
      alert("Stripe error: " + error.message);
      console.error(error);
    }
  });
});
