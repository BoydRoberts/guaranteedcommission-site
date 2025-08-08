document.addEventListener("DOMContentLoaded", () => {
  const stripe = Stripe("pk_test_51RiGoUPTiT2zuxx0T2Jk2YSvCjeHeQLb8KJnNs8gPwLtGq3AxqydjA4wcHknoee1GMB9zlKLG093DIAIE61KLqyw00hEmYRmhD");

  // Get checkout data from localStorage
  const checkoutData = JSON.parse(localStorage.getItem("checkoutData") || "{}");

  if (!checkoutData.plan || typeof checkoutData.total !== "number") {
    alert("Error: Checkout data is missing. Please restart the process.");
    window.location.href = "/";
    return;
  }

  const plan = checkoutData.plan;
  const upgrades = checkoutData.upgrades || [];
  const total = checkoutData.total;

  // Stripe Price IDs mapping
  const priceIDs = {
    plans: {
      "Listed Property Plus": "price_1RsQFlPTiT2zuxx0414nGtTu",
      "FSBO Plus": "price_1RsQJbPTiT2zuxx0w3GUIdxJ"
    },
    upgrades: {
      "Upgrade to Listed Property Plus ($20)": "price_1RsQFlPTiT2zuxx0414nGtTu",
      "Banner ($10)": "price_1RsQTOPTiT2zuxx0TLCwAthR",
      "Premium Placement ($10)": "price_1RsQbjPTiT2zuxx0hA6p5H4h",
      "Pin Placement ($50, includes Premium)": "price_1RsQknPTiT2zuxx0Av9skJyW",
      "Confidential FSBO Upgrade ($100)": "price_1RsRP4PTiT2zuxx0eoOGEDvm"
    }
  };

  // Build Stripe line items
  const lineItems = [];

  // Add base plan if it's paid
  if (plan === "Listed Property Plus" || plan === "FSBO Plus") {
    lineItems.push({ price: priceIDs.plans[plan], quantity: 1 });
  } else if (plan === "Listed Property Basic" && upgrades.includes("Upgrade to Listed Property Plus ($20)")) {
    lineItems.push({ price: priceIDs.upgrades["Upgrade to Listed Property Plus ($20)"], quantity: 1 });
  }

  // Add any other upgrades
  upgrades.forEach(up => {
    // Avoid adding the upgrade to Plus twice
    if (up === "Upgrade to Listed Property Plus ($20)" && plan === "Listed Property Basic") {
      return; // already handled above
    }
    if (priceIDs.upgrades[up]) {
      lineItems.push({ price: priceIDs.upgrades[up], quantity: 1 });
    }
  });

  // Handle click to pay
  document.getElementById("payButton").addEventListener("click", async () => {
    if (lineItems.length === 0) {
      alert("Nothing selected to purchase.");
      return;
    }

    const { error } = await stripe.redirectToCheckout({
      lineItems,
      mode: "payment",
      successUrl: window.location.origin + "/signature.html",
      cancelUrl: window.location.href
    });

    if (error) {
      alert("Error: " + error.message);
    }
  });
});
