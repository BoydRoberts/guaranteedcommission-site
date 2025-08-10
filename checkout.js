document.addEventListener("DOMContentLoaded", () => {
  const stripe = Stripe("pk_test_51RiGoUPTiT2zuxx0T2Jk2YSvCjeHeQLb8KJnNs8gPwLtGq3AxqydjA4wcHknoee1GMB9zlKLG093DIAIE61KLqyw00hEmYRmhD");

  // Read from localStorage
  const checkoutData = JSON.parse(localStorage.getItem("checkoutData") || "{}");
  console.log("[DEBUG] Loaded checkoutData:", checkoutData);

  const lineItems = [];

  // Base plan
  if (checkoutData.plan === "Listed Property Plus") {
    lineItems.push({ price: "price_1RsQFlPTiT2zuxx0414nGtTu", quantity: 1 });
  } 
  if (checkoutData.plan === "FSBO Plus") {
    lineItems.push({ price: "price_1RsQJbPTiT2zuxx0w3GUIdxJ", quantity: 1 });
  }

  // If upgrading from Basic
  if (checkoutData.plan === "Listed Property Basic" && checkoutData.upgrades.includes("Upgrade to Listed Property Plus ($20)")) {
    lineItems.push({ price: "price_1RsQFlPTiT2zuxx0414nGtTu", quantity: 1 });
  }

  // Upsells
  if (checkoutData.upgrades.includes("Banner ($10)")) {
    lineItems.push({ price: "price_1RsQTOPTiT2zuxx0TLCwAthR", quantity: 1 });
  }
  if (checkoutData.upgrades.includes("Pin Placement ($50, includes Premium)")) {
    lineItems.push({ price: "price_1RsQknPTiT2zuxx0Av9skJyW", quantity: 1 });
  } else if (checkoutData.upgrades.includes("Premium Placement ($10)")) {
    lineItems.push({ price: "price_1RsQbjPTiT2zuxx0hA6p5H4h", quantity: 1 });
  }
  if (checkoutData.upgrades.includes("Confidential FSBO Upgrade ($100)")) {
    lineItems.push({ price: "price_1RsRP4PTiT2zuxx0eoOGEDvm", quantity: 1 });
  }

  console.log("[DEBUG] Final Stripe lineItems:", lineItems);

  document.getElementById("proceedPaymentBtn").addEventListener("click", async () => {
    if (checkoutData.totalCost === 0) {
      alert("No payment required. Proceeding to signature page...");
      window.location.href = "/signature.html";
      return;
    }

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
