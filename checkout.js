document.addEventListener("DOMContentLoaded", async () => {
  const stripe = Stripe("pk_test_51RiGoUPTiT2zuxx0T2Jk2YSvCjeHeQLb8KJnNs8gPwLtGq3AxqydjA4wcHknoee1GMB9zlKLG093DIAIE61KLqyw00hEmYRmhD");

  const plan = localStorage.getItem('selectedPlan');
  const banner = localStorage.getItem('banner') === 'true';
  const premium = localStorage.getItem('premium') === 'true';
  const pin = localStorage.getItem('pin') === 'true';
  const confidential = localStorage.getItem('confidential') === 'true';

  let priceId = null;
  const addons = [];

  // Set base plan price
  if (plan === 'Listed Property Plus') priceId = 'price_1RsQFlPTiT2zuxx0414nGtTu';
  if (plan === 'FSBO Plus') priceId = 'price_1RsQJbPTiT2zuxx0w3GUIdxJ';

  // Add optional upgrades
  if (banner) addons.push('price_1RsQTOPTiT2zuxx0TLCwAthR');
  if (premium && !pin) addons.push('price_1RsQbjPTiT2zuxx0hA6p5H4h');
  if (pin) addons.push('price_1RsQknPTiT2zuxx0Av9skJyW');
  if (plan === 'FSBO Plus' && confidential) addons.push('price_1RsRP4PTiT2zuxx0eoOGEDvm');

  document.querySelector("button").addEventListener("click", async () => {
    // If plan is free, skip payment
    if (plan === 'Listed Property Basic') {
      window.location.href = '/submit.html';
      return;
    }

    const lineItems = [];

    if (priceId) {
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
