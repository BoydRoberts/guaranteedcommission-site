document.addEventListener("DOMContentLoaded", () => {
  // Stripe publishable key (TEST)
  const stripe = Stripe("pk_test_51RiGoUPTiT2zuxx0T2Jk2YSvCjeHeQLb8KJnNs8gPwLtGq3AxqydjA4wcHknoee1GMB9zlKLG093DIAIE61KLqyw00hEmYRmhD");

  // Elements
  const planNameEl = document.getElementById("planName");
  const upgradeListEl = document.getElementById("upgradeList");
  const totalAmountEl = document.getElementById("totalAmount");
  const stripePayBtn = document.getElementById("stripePayBtn");
  const continueBtn = document.getElementById("continueBtn");
  const freeNote = document.getElementById("freeNote");
  const backBtn = document.getElementById("backBtn");
  const debugEl = document.getElementById("debug");

  // Load checkout data (single source of truth)
  const checkoutData = JSON.parse(localStorage.getItem("checkoutData") || "{}");
  const selectedPlan = checkoutData.plan || localStorage.getItem("selectedPlan") || "Listed Property Basic";
  const upgrades = Array.isArray(checkoutData.upgrades) ? checkoutData.upgrades : [];
  const total = typeof checkoutData.totalCost === "number" ? checkoutData.totalCost : 0;

  // Render summary
  planNameEl.textContent = selectedPlan;
  if (upgrades.length) {
    upgradeListEl.innerHTML = upgrades.map(u => `<li>${u}</li>`).join("");
  } else {
    upgradeListEl.innerHTML = `<li>None</li>`;
  }
  totalAmountEl.textContent = total;

  // Price IDs map (Stripe Dashboard)
  const priceMap = {
    // Base plans / upgrades
    "Listed Property Plus": "price_1RsQFlPTiT2zuxx0414nGtTu",   // $20
    "FSBO Plus": "price_1RsQJbPTiT2zuxx0w3GUIdxJ",              // $100
    // A-la-carte upsells
    "Banner": "price_1RsQTOPTiT2zuxx0TLCwAthR",                 // $10
    "Premium Placement": "price_1RsQbjPTiT2zuxx0hA6p5H4h",      // $10
    "Pin Placement": "price_1RsQknPTiT2zuxx0Av9skJyW",          // $50 (includes Premium free)
    "Confidential FSBO Upgrade": "price_1RsRP4PTiT2zuxx0eoOGEDvm" // $100
  };

  // Build Stripe line items from normalized upgrades
  const lineItems = [];

  // Base plan delta: If plan is exactly "Listed Property Plus" or "FSBO Plus" (not Basic), charge it.
  if (selectedPlan === "Listed Property Plus") {
    lineItems.push({ price: priceMap["Listed Property Plus"], quantity: 1 });
  } else if (selectedPlan === "FSBO Plus") {
    lineItems.push({ price: priceMap["FSBO Plus"], quantity: 1 });
  }
  // If plan is "Listed Property Basic" but user chose "Upgrade to Listed Property Plus", normalize to LPP
  if (upgrades.some(u => u.toLowerCase().includes("upgrade to listed property plus"))) {
    lineItems.push({ price: priceMap["Listed Property Plus"], quantity: 1 });
  }

  // Upsells
  if (upgrades.some(u => u.toLowerCase().startsWith("banner"))) {
    lineItems.push({ price: priceMap["Banner"], quantity: 1 });
  }

  // Pin includes Premium; only add Premium if user selected Premium and not Pin
  const hasPin = upgrades.some(u => u.toLowerCase().startsWith("pin placement"));
  const hasPremium = upgrades.some(u => u.toLowerCase().startsWith("premium placement"));
  if (hasPin) {
    lineItems.push({ price: priceMap["Pin Placement"], quantity: 1 });
  } else if (hasPremium) {
    lineItems.push({ price: priceMap["Premium Placement"], quantity: 1 });
  }

  if (upgrades.some(u => u.toLowerCase().startsWith("confidential fsbo upgrade"))) {
    lineItems.push({ price: priceMap["Confidential FSBO Upgrade"], quantity: 1 });
  }

  // 🔎 Debug logging
  console.debug("🧾 checkoutData:", checkoutData);
  console.debug("🧾 derived lineItems:", lineItems);

  // Free order handling
  const isFreeOrder = total <= 0 || lineItems.length === 0;

  function goToSignature() {
    // Set post-signature context if not already set
    const planType = selectedPlan.includes("FSBO") ? "fsbo" : "listed";
    localStorage.setItem("postSignatureOptions", planType);
    window.location.href = "/signature.html";
  }

  if (isFreeOrder) {
    // Hide Stripe, show continue
    stripePayBtn.classList.add("hidden");
    freeNote.classList.remove("hidden");
    continueBtn.classList.remove("hidden");
    continueBtn.addEventListener("click", goToSignature);
  } else {
    // Paid order: wire Stripe
    stripePayBtn.classList.remove("hidden");
    continueBtn.classList.add("hidden");
    freeNote.classList.add("hidden");

    stripePayBtn.addEventListener("click", async () => {
      try {
        const { error } = await stripe.redirectToCheckout({
          lineItems,
          mode: "payment",
          successUrl: window.location.origin + "/signature.html",
          cancelUrl: window.location.href
        });
        if (error) {
          alert("Stripe error: " + error.message);
        }
      } catch (e) {
        console.error(e);
        alert("Unexpected error starting Stripe checkout.");
      }
    });
  }

  // Back
  backBtn.addEventListener("click", () => {
    window.location.href = "/upsell.html";
  });

  // Optional: show debug blob (toggle by removing 'hidden' class)
  // debugEl.classList.remove("hidden");
  debugEl.textContent = JSON.stringify({ checkoutData, lineItems }, null, 2);
});
