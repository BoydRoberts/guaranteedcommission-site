// /scripts/intake-followups.js  (build 2025-08-12a)
(function () {
  const CART_KEY = 'cart';
  const FLAGS_KEY = 'intakeFollowups';
  const $ = (sel, ctx=document) => ctx.querySelector(sel);

  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch { return fallback; }
  }
  function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  function loadCart() { return load(CART_KEY, {}); }
  function saveCart(c) { save(CART_KEY, c || {}); }
  function loadFlags() { return load(FLAGS_KEY, {}); }
  function saveFlags(f) { save(FLAGS_KEY, f || {}); }

  function ensureContainers() {
    // Create a lightweight container near the top of the page without assuming page structure
    let host = document.getElementById('intake-followups');
    if (!host) {
      host = document.createElement('div');
      host.id = 'intake-followups';
      host.style.maxWidth = '52rem';
      host.style.margin = '1rem auto';
      host.style.padding = '0 1rem';
      document.body.insertBefore(host, document.body.firstChild);
    }
    return host;
  }

  function card({ id, title, bodyHTML }) {
    const wrap = document.createElement('section');
    wrap.id = id;
    wrap.className = 'gc-card';
    wrap.innerHTML = `
      <div style="background:#fff;border-radius:1rem;box-shadow:0 1px 6px rgba(0,0,0,0.08);padding:1rem 1.25rem;margin-bottom:1rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:.75rem;">
          <h2 style="font-size:1rem;font-weight:600;margin:0;">${title}</h2>
          <span style="font-size:11px;color:#6b7280;background:#f3f4f6;border-radius:.375rem;padding:.125rem .375rem;">intake-followups 2025-08-12a</span>
        </div>
        <div style="margin-top:.5rem;font-size:.9rem;color:#374151;">${bodyHTML}</div>
      </div>
    `;
    return wrap;
  }

  function render() {
    const host = ensureContainers();
    host.innerHTML = ''; // idempotent render

    const flags = loadFlags();
    const cart = loadCart();
    cart.items = cart.items || {};

    const premiumSelected = !!(cart.items.premium && cart.items.premium.selected);
    const pinSelected = !!(cart.items.pin && cart.items.pin.selected);

    // PREMIUM CARD (visible only if Premium is selected OR Pin is selected—Pin includes Premium)
    if (premiumSelected || pinSelected) {
      const defer = !!(
        (cart.items.premium && cart.items.premium.deferDetails) ||
        (cart.items.pin && cart.items.pin.deferDetails && premiumSelected) // if premium separate
      );

      const el = card({
        id: 'gc-premium-card',
        title: 'Premium Placement – Details',
        bodyHTML: `
          <label style="display:flex;gap:.5rem;align-items:flex-start;margin-top:.25rem;">
            <input id="gc-premium-defer" type="checkbox" ${defer ? 'checked' : ''}/>
            <span><strong>I will do this later.</strong>
              <span style="color:#6b7280">Pay was recorded. You can provide info any time before going live.</span>
            </span>
          </label>
          <div id="gc-premium-now" style="margin-top:.75rem;${defer ? 'display:none;' : ''}">
            <p style="font-size:.85rem;color:#6b7280;margin:0 0 .25rem 0;">
              No specific inputs are required for Premium. If you have internal notes, add them here (optional).
            </p>
            <textarea id="gc-premium-notes" rows="2" style="width:100%;border:1px solid #e5e7eb;border-radius:.5rem;padding:.5rem;"></textarea>
          </div>
          <div style="margin-top:.75rem;display:flex;gap:.5rem;justify-content:flex-end;">
            <button id="gc-premium-save" style="border:1px solid #e5e7eb;border-radius:.5rem;padding:.4rem .75rem;font-weight:500;">Save</button>
          </div>
        `
      });
      host.appendChild(el);

      // Wire
      const chk = $('#gc-premium-defer', el);
      const now = $('#gc-premium-now', el);
      const notes = $('#gc-premium-notes', el);
      const btn = $('#gc-premium-save', el);

      // preload notes if any
      const savedNotes = (cart.items.premium && cart.items.premium.notes) || '';
      if (notes) notes.value = savedNotes;

      chk.addEventListener('change', () => {
        now.style.display = chk.checked ? 'none' : 'block';
      });

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        // Persist defer flag and notes
        cart.items.premium = cart.items.premium || { selected: true, price: premiumSelected ? (cart.items.premium?.price || 10) : 0 };
        cart.items.premium.deferDetails = !!chk.checked;
        if (notes) cart.items.premium.notes = notes.value || '';

        // Sync helper flags for other pages
        const f = loadFlags();
        f.deferPremiumDetails = cart.items.premium.deferDetails === true;
        saveFlags(f);
        saveCart(cart);
        toast('Premium details saved.');
      });
    }

    // PIN CARD (visible only if Pin is selected)
    if (pinSelected) {
      const defer = !!(cart.items.pin && cart.items.pin.deferDetails);
      const el2 = card({
        id: 'gc-pin-card',
        title: 'Pin Placement – Details',
        bodyHTML: `
          <label style="display:flex;gap:.5rem;align-items:flex-start;margin-top:.25rem;">
            <input id="gc-pin-defer" type="checkbox" ${defer ? 'checked' : ''}/>
            <span><strong>I will do this later.</strong>
              <span style="color:#6b7280">Pay was recorded. Decide your pin specifics later.</span>
            </span>
          </label>
          <div id="gc-pin-now" style="margin-top:.75rem;${defer ? 'display:none;' : ''}">
            <label for="gc-pin-notes" style="font-size:.9rem;font-weight:500;">Pin placement notes (optional)</label>
            <textarea id="gc-pin-notes" rows="2" placeholder="e.g., Emphasize [your neighborhood/area] during launch"
              style="width:100%;border:1px solid #e5e7eb;border-radius:.5rem;padding:.5rem;margin-top:.25rem;"></textarea>
          </div>
          <div style="margin-top:.75rem;display:flex;gap:.5rem
