// checkout.js — build 2025-08-12b
(function () {
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => '$' + (Number(n || 0).toFixed(2).replace(/\.00$/, ''));

  // Read from either checkoutData (preferred) or cart (fallback)
  function getCheckoutModel() {
    let cd = null;
    try { cd = JSON.parse(localStorage.getItem('checkoutData') || 'null'); } catch {}
    if (cd && typeof cd === 'object') return { source: 'checkoutData', data: cd };

    // Fallback: synthesize from cart
    let cart = {};
    try { cart = JSON.parse(localStorage.getItem('cart') || '{}'); } catch {}
    cart.items = cart.items || {};
    const planName = (cart.plan && cart.plan.name) ||
                     localStorage.getItem('selectedPlan') ||
                     'Listed Property Basic';

    const prices = { plus: 20, banner: 10, premium: 10, pin: 50, confidential: 100, fsbo: 100 };
    let base = 0;
    if (planName === 'FSBO Plus') base = prices.fsbo;
    else if (planName === 'Listed Property Plus') base = prices.plus;

    // derive upsells from items
    const upgrades = {
      upgradeToPlus: planName === 'Listed Property Basic' && (cart.items.premium || cart.items.banner || cart.items.pin) ? false : false,
      banner: !!(cart.items.banner && cart.items.banner.selected),
      premium: !!(cart.items.premium && cart.items.premium.selected),
      pin: !!(cart.items.pin && cart.items.pin.selected),
      confidential: !!(cart.items.confidential && cart.items.confidential.selected),
    };

    const model = {
      plan: planName,
      base,
      upgrades,
      prices,
      meta: {}
    };

    // compute total with pin-includes-premium rule
    let total = base;
    if (upgrades.banner) total += prices.banner;
    if (upgrades.pin) total += prices.pin;
    else if (upgrades.premium) total += prices.premium;
    if (upgrades.confidential) total += prices.confidential;
    model.total = total;

    return { source: 'cart', data: model };
  }

  function setStatus(msg, ok = false) {
    const box = $('status');
    box.classList.remove('hidden');
    box.textContent = msg;
    box.className = ok
      ? 'mt-3 text-sm rounded-lg p-3 bg-green-50 text-green-700'
      : 'mt-3 text-sm rounded-lg p-3 bg-red-50 text-red-700';
  }

  function render() {
    const { data } = getCheckoutModel();

    // If Basic + upgradeToPlus=true, normalize plan & base (covers older flows)
    if (data.plan === 'Listed Property Basic' && data.upgrades && data.upgrades.upgradeToPlus) {
      data.plan = 'Listed Property Plus';
      data.base = (data.prices && data.prices.plus) || 20;
      localStorage.setItem('selectedPlan', 'Listed Property Plus');
    }

    // Build lines
    $('planRow').innerHTML = `
      <div class="flex justify-between">
        <span>${data.plan}</span>
        <span>${fmt(data.base || 0)}</span>
      </div>
    `;

    const lines = $('orderLines');
    lines.innerHTML = '';

    function addLine(label, price, note) {
      const div = document.createElement('div');
      div.className = 'flex justify-between';
      div.innerHTML = `
        <span>${label}${note ? ` <span class="text-xs text-gray-500">(${note})</span>` : ''}</span>
        <span>${fmt(price)}</span>
      `;
      lines.appendChild(div);
    }

    // Upsells
    if (data.upgrades) {
      if (data.upgrades.banner) addLine('Banner', 10);
      if (data.upgrades.pin) addLine('Pin Placement', 50, 'includes Premium');
      else if (data.upgrades.premium) addLine('Premium Placement', 10);
      if (data.upgrades.confidential) addLine('Confidential FSBO Upgrade', 100);
    }

    // Totals
    const subtotal = Number(data.base || 0) +
      (data.upgrades?.banner ? 10 : 0) +
      (data.upgrades?.pin ? 50 : (data.upgrades?.premium ? 10 : 0)) +
      (data.upgrades?.confidential ? 100 : 0);

    $('subtotal').textContent = fmt(subtotal);
    $('total').textContent = fmt(subtotal);

    // Zero-total bypass
    if (subtotal <= 0) {
      $('continueNoPay').classList.remove('hidden');
      $('payNow').classList.add('hidden');
    } else {
      $('continueNoPay').classList.add('hidden');
      $('payNow').classList.remove('hidden');
    }
  }

  async function attemptStripeCheckout(payload) {
    // If you have an API route, this will hit it. If not, caller will handle fallback.
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Non-200 from /api/checkout');
    const data = await res.json().catch(() => ({}));
    if (data.url) {
      window.location.href = data.url; // Stripe hosted checkout page
      return true;
    }
    if (data.sessionId && data.publishableKey && window.Stripe) {
      const stripe = Stripe(data.publishableKey);
      const { error } = await stripe.redirect
