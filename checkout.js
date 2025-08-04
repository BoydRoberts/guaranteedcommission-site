document.addEventListener("DOMContentLoaded", async () => {
  const stripe = Stripe("pk_test_YOUR_PUBLIC_KEY"); // Replace with your Stripe public key

  const plan = localStorage.getItem('selectedPlan');
  const banner = localStorage.getItem('banner') === 'true';
  const premium = localStorage.getItem('premium') === 'true';
  const pin = localStorage.getItem('pin') === 'true';

  let priceId = null;
  let addons = [];

  // Set base priceId for selected plan
  if (plan === 'Listed Property Plus') priceId = 'price_XXXXXXXX'; // Replace with Stripe price ID
  if (plan === 'FSBO Plus') priceId = 'price_YYYYYYYY'; // Replace with Stripe price ID
  if (plan === 'Listed Property Basic') priceId = 'price_FREE'; // Optional: or redirect around checkout

  // Add-on price IDs (replace with your actual Stripe Price IDs)
  if (banner) addons.push('price_BANNER');
  if (premium && !pin) addons.push('price_PREMIUM');
  if (pin) addons.push('price_PIN'); // includes premium

  document.querySelector("button").addEventListener("click", async () => {
    const lineItems = [];

    if (priceId && priceId !== 'price_FREE') {
      lineItems.push({ price: priceId, quantity: 1 });
    }

    addons.forEach(addonId => {
      lineItems.push({ price: addonId, quantity: 1 });
    });

    const { error } = await stripe.redirectToCheckout({
      lineItems,
      mode: 'payment',
      successUrl: window.location.origin + '/submit.html',
      cancelUrl: window.location.href
    });

    if (error) alert(error.message);
  });
});
