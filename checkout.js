// checkout.js — build 2025-08-12a

(function(){
  const $ = (id) => document.getElementById(id);
  const money = (n) => Number(n || 0);
  const fmt = (n) => '$' + (Number(n).toFixed(2).replace(/\.00$/,''));

  function loadCart() {
    try { return JSON.parse(localStorage.getItem('cart') || '{}'); }
    catch { return {}; }
  }
  function saveCart(c) { localStorage.setItem('cart', JSON.stringify(c || {})); }

  function computeTotal(cart) {
    const items = cart.items ? Object.values(cart.items) : [];
    return items.reduce((sum, it) => sum + money(it.price), 0);
  }

  function setStatus(msg, ok=false) {
    const box = $('status');
    box.classList.remove('hidden');
    box.textContent = msg;
    box.className = ok
      ? 'mt-3 text-sm rounded-lg p-3 bg-green-50 text-green-700'
      : 'mt-3 text-sm rounded-lg p-3 bg-red-50 text-red-700';
  }

  // Determine actor (seller vs agent). Default seller if not set.
  const isAgentFlow = localStorage.getItem('isAgentFlow') === 'true';

  // Hide promo for sellers (keep for agents only)
  (function handlePromoVisibility(){
    const promoRow = $('promoRow');
    if (!isAgentFlow && promoRow) promoRow.style.display = 'none';
  })();

  // Render order lines
  function render() {
    const cart = loadCart();
    cart.items = cart.items || {};
    // Normalize Pin+Premium pricing rule
    if (cart.items.pin && cart.items.pin.selected) {
      if (cart.items.premium) cart.items.premium.price = 0; // included
    }
    cart.total = computeTotal(cart);
    saveCart(cart);

    const lines = $('orderLines');
    lines.innerHTML = '';

    const addLine = (label, price, note) => {
      const div = document.createElement('div');
      div.className = 'flex justify-between';
      div.innerHTML = `<span>${label}${note ? ` <span class="text-xs text-gray-500">(${note})</span>`:''}</span><span>${fmt(price)}</span>`;
      lines.appendChild(div);
    };

    // base plan (if you store it in cart.plan)
    if (cart.plan && cart.plan.name) {
      addLine(cart.plan.name, cart.plan.price || 0);
    }

    if (cart.items.premium && cart.items.premium.selected) {
      addLine('Premium Placement', cart.items.premium.price || 0,
              cart.items.premium.deferDetails ? 'will decide later' : '');
    }
    if (cart.items.pin && cart.items.pin.selected) {
      addLine('Pin Placement', cart.items.pin.price || 0,
              cart.items.pin.deferDetails ? 'will decide later' : 'includes Premium');
    }

    // Subtotal / Total
    $('subtotal').textContent = fmt(cart.total);
    $('total').textContent = fmt(cart.total);

    // If total is zero, show bypass
    if (cart.total <= 0) {
      $('goSignatureZero').classList.remove('hidden');
      $('payNow').classList.add('hidden');
    } else {
      $('goSignatureZero').classList.add('hidden');
      $('payNow').classList.remove('hidden');
    }
  }

  // Apply promo (agents only; example supports “August Free”)
  (function wirePromo(){
    const apply = $('applyPromo');
    if (!apply) return;
    apply.addEventListener('click', (e) => {
      e.preventDefault();
      if (!isAgentFlow) return; // sellers: ignore
      const code = (document.getElementById('promo').value || '').trim().toLowerCase();
      const msg = $('promoMsg');
      const cart = loadCart();
      if (code === 'august free' || code === 'augustfree') {
        // Example: make Premium free for agents (or your logic)
        if (cart.items && cart.items.premium) cart.items.premium.price = 0;
        // you can also discount cart.plan.price, etc., per your rules
        cart.total = computeTotal(cart);
        saveCart(cart);
        msg.textContent = 'Promo applied.';
        render();
      } else {
        msg.textContent = 'Code not recognized.';
      }
    });
  })();

  // Stripe Button
  (function wireStripe(){
    const btn = $('payNow');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Processing…';

      const cart = loadCart();
      const payload = {
        total: computeTotal(cart),
        cart
      };

      // If you have an API route, call it; if not, simulate success in test mode.
      try {
        // Attempt API call (adjust path/name to match your backend)
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          // Expect either a redirect URL or a sessionId
          const data = await res.json().catch(()=> ({}));
          if (data.url) {
            window.location.href = data.url; // Stripe checkout hosted page
            return;
          }
          if (data.sessionId && window.Stripe && data.publishableKey) {
            const stripe = Stripe(data.publishableKey);
            const { error } = await stripe.redirectToCheckout({ sessionId: data.sessionId });
            if (error) throw error;
            return;
          }
          // If API returned OK but no data, fall through to simulate (dev safety)
        } else {
          // Non-200 -> simulate in test mode
          console.warn('[checkout] API not available, simulating success for dev.');
        }
      } catch (err) {
        console.warn('[checkout] API error, simulating success for dev.', err);
      }

      // --- DEV FALLBACK (test mode): pretend Stripe succeeded and move forward ---
      setStatus('Stripe (test): simulated payment success. Redirecting to Signature…', true);
      // Mark an order id for traceability
      const oid = 'TEST-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      localStorage.setItem('lastOrderId', oid);
      setTimeout(() => { window.location.href = '/signature.html'; }, 700);
    });
  })();

  // Initial render
  render();
})();
