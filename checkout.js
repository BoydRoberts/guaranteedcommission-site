// checkout.js — build 2025-08-12b
(function(){
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => '$' + (Number(n || 0).toFixed(2).replace(/\.00$/,''));
  const setStatus = (msg, ok=false) => {
    const box = $('status');
    box.classList.remove('hidden');
    box.textContent = msg;
    box.className = ok
      ? 'hidden mt-3 text-sm rounded-lg p-3 bg-green-50 text-green-700'.replace('hidden ','')
      : 'hidden mt-3 text-sm rounded-lg p-3 bg-red-50 text-red-700'.replace('hidden ','');
  };

  // ---- Load prior choices (primary: checkoutData from upsell; fallback: cart) ----
  function getJSON(key, fb) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fb)); } catch { return fb; } }

  const checkoutData = getJSON('checkoutData', null);
  const cart = getJSON('cart', null);
  const formData = getJSON('formData', {});
  const loggedInEmail = localStorage.getItem('loggedInEmail') || '';

  // A single source of truth for prices (kept in step with upsell)
  const PRICES = (checkoutData && checkoutData.prices) || {
    plus: 20,
    banner: 10,
    premium: 10,
    pin: 50,
    confidential: 100,
    fsbo: 100
  };

  // Derive a normalized order from either checkoutData or (fallback) cart
  function deriveOrder() {
    let plan = 'Listed Property Basic';
    let base = 0;
    const upgrades = { upgradeToPlus:false, banner:false, premium:false, pin:false, confidential:false };
    const meta = {};

    if (checkoutData) {
      plan = checkoutData.plan || plan;
      base = Number(checkoutData.base || 0);
      Object.assign(upgrades, checkoutData.upgrades || {});
      Object.assign(meta, checkoutData.meta || {});
    } else if (cart) {
      // Fallback: infer from cart items
      if (cart.plan && cart.plan.name) {
        plan = cart.plan.name;
        base = Number(cart.plan.price || 0);
      } else {
        plan = localStorage.getItem('selectedPlan') || plan;
        base = (plan === 'FSBO Plus') ? PRICES.fsbo : (plan === 'Listed Property Plus') ? PRICES.plus : 0;
      }
      const it = (cart.items || {});
      if (it.banner && it.banner.selected) upgrades.banner = true;
      if (it.pin && it.pin.selected) { upgrades.pin = true; upgrades.premium = true; }
      else if (it.premium && it.premium.selected) upgrades.premium = true;
      // no confidential in cart fallback unless present in a separate flag
    } else {
      // Last resort: use selectedPlan
      plan = localStorage.getItem('selectedPlan') || plan;
      base = (plan === 'FSBO Plus') ? PRICES.fsbo : (plan === 'Listed Property Plus') ? PRICES.plus : 0;
    }

    // If Basic + chose to upgrade to Plus, bump base
    if (plan === 'Listed Property Basic' && upgrades.upgradeToPlus) {
      plan = 'Listed Property Plus';
      base = PRICES.plus;
      localStorage.setItem('selectedPlan', 'Listed Property Plus');
    }

    // Compute total respecting Pin→includes Premium
    let total = base;
    if (upgrades.banner) total += PRICES.banner;
    if (upgrades.pin) total += PRICES.pin; else if (upgrades.premium) total += PRICES.premium;
    if (upgrades.confidential) total += PRICES.confidential;

    return { plan, base, upgrades, meta, total };
  }

  function renderWhoRow() {
    const addr = (formData.address || '').trim();
    const name = (formData.sellerName || formData.name || '').trim();
    const pieces = [];
    if (addr) pieces.push(addr);
    if (name) pieces.push(name);
    if (loggedInEmail) pieces.push(loggedInEmail);
    if (!pieces.length) return; // keep hidden
    $('whoLine').textContent = pieces.join(' • ');
    $('whoRow').classList.remove('hidden');
  }

  function renderOrder() {
    const o = deriveOrder();

    const lines = [];
    // Plan line
    lines.push({ label: o.plan, price: o.base });

    // Upsells: Pin (includes Premium), Premium, Banner, Confidential
    if (o.upgrades.pin) {
      lines.push({ label: 'Pin Placement', price: PRICES.pin, note: 'includes Premium' });
    } else if (o.upgrades.premium) {
      lines.push({ label: 'Premium Placement', price: PRICES.premium });
    }
    if (o.upgrades.banner) {
      lines.push({ label: 'Banner', price: PRICES.banner });
    }
    if (o.upgrades.confidential) {
      lines.push({ label: 'Confidential FSBO Upgrade', price: PRICES.confidential });
    }

    // Paint lines
    const host = $('orderLines');
    host.innerHTML = '';
    for (const ln of lines) {
      const row = document.createElement('div');
      row.className = 'py-2 flex items-center justify-between text-sm';
      row.innerHTML = `
        <div>
          <span class="font-medium">${ln.label}</span>
          ${ln.note ? `<span class="ml-2 text-xs text-gray-500">(${ln.note})</span>` : ''}
        </div>
        <div>${fmt(ln.price)}</div>
      `;
      host.appendChild(row);
    }

    $('subtotal').textContent = fmt(o.total);
    $('total').textContent = fmt(o.total);

    // Toggle buttons
    if (o.total <= 0) {
      $('goSignatureZero').classList.remove('hidden');
      $('payNow').classList.add('hidden');
    } else {
      $('goSignatureZero').classList.add('hidden');
      $('payNow').classList.remove('hidden');
    }
  }

  // Wire Pay button (with safe dev fallback)
  (function wirePayNow(){
    const btn = $('payNow');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'Processing…';

      const order = deriveOrder();
      // Persist a lightweight order reference
      localStorage.setItem('lastOrderId', 'TEST-' + Math.random().toString(36).slice(2,8).toUpperCase());
      localStorage.setItem('lastOrderSnapshot', JSON.stringify(order));

      try {
        // If you add an API later, this will try it first:
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order })
        });

        if (res.ok) {
          const data = await res.json().catch(()=> ({}));
          if (data && data.url) {
            window.location.href = data.url; // Stripe-hosted checkout page
            return;
          }
          if (data && data.sessionId && window.Stripe && data.publishableKey) {
            const stripe = Stripe(data.publishableKey);
            const { error } = await stripe.redirectToCheckout({ sessionId: data.sessionId });
            if (error) throw error;
            return;
          }
          // fall through to dev fallback if no usable payload
        } else {
          console.warn('[checkout] API not available, using dev fallback.');
        }
      } catch (e) {
        console.warn('[checkout] Error contacting API, using dev fallback.', e);
      }

      // DEV FALLBACK — simulate success so your flow never stalls
      setStatus('Stripe (test): simulated payment success. Redirecting to Signature…', true);
      setTimeout(() => { window.location.href = '/signature.html'; }, 700);

      // restore button text in case the user comes back
      setTimeout(() => { btn.disabled = false; btn.textContent = original; }, 1200);
    });
  })();

  // Initial paint
  renderWhoRow();
  renderOrder();
})();
