document.addEventListener("DOMContentLoaded", () => {
  const stripe = Stripe("pk_test_51RiGoUPTiT2zuxx0T2Jk2YSvCjeHeQLb8KJnNs8gPwLtGq3AxqydjA4wcHknoee1GMB9zlKLG093DIAIE61KLqyw00hEmYRmhD");

  const selectedPlan = localStorage.getItem("selectedPlan");
  const upgradeToPlus = localStorage.getItem("upgradeToPlus") === "true";
  const banner = localStorage.getItem("banner") === "true";
  const premium = localStorage.getItem("premium") === "true";
  const pin = localStorage.getItem("pin") === "true";
  const confidential = localStorage.getItem("confidential") === "true";

  const lineItems = [];

  // Base plan pricing
  if (selectedPlan === "Listed Property Plus") {
    lineItems.push({ price: "price_1RsQFlPTiT2zuxx0414nGtTu", quantity: 1 });
  }

  if (selectedPlan === "FSBO Plus") {
    lineItems.push({ price: "price_1RsQJbPTiT2zuxx0w3GUIdxJ", quantity: 1 });
  }

  if (selectedPlan === "Listed Property Basic" && upgradeToPlus) {
    lineItems.push({ price: "price_1RsQFlPTiT2zuxx0414nGtTu", quantity: 1 }); // Upgrade to Plus
  }

  // Upsells
  if (banner) {
    lineItems.push({ price: "price_1RsQTOPTiT2zuxx0TLCwAthR", quantity: 1 });
  }

  if (pin) {
    lineItems.push({ price: "price_1RsQknPTiT2zuxx0Av9skJyW", quantity: 1 });
  } else if (premium) {
    lineItems.push({ price: "price_1RsQbjPTiT2zuxx0hA6p5H4h", quantity: 1 });
  }

  if (confidential) {
    lineItems.push({ price: "price_1RsRP4PTiT2zuxx0eoOGEDvm", quantity: 1 });
  }

  document.querySelector("button").addEventListener("click", async () => {
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
