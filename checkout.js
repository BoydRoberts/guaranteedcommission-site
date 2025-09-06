// /checkout.js — build 2025-09-01a (adds Sept 2025 agent promo: Upgrade to Plus = $0)
/*
  Promo behavior:
  - Active when:
      - Payer is "agent"
      - Current date in Sept 2025 (inclusive)
  - Effects:
      - UI shows Upgrade to Plus as $0 (and marks as September promo)
      - Totals do NOT include the PLUS price
      - Stripe line items do NOT include the PLUS item
  - All other prices unchanged
*/

document.addEventListener("DOMContentLoaded", () => {
  console.log("[checkout.js] build 2025-09-01a");

  const $ = (id) => document.getElementById(id);
  const getJSON = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };

  // Publishable key (test)
  const STRIPE_PUBLISHABLE_KEY = "pk_test_51RiGoUPTiT2zuxx0T2Jk2YSvCjeHeQLb8KJnNs8gPwLtGq3AxqydjA4wcHknoee1GMB9zlKLG093DIAIE61KLqyw00hEmYRmhD";
  let stripe = null;
  try { stripe = Stripe(STRIPE_PUBLISHABLE_KEY); } catch (e) { console.error("Stripe init error:", e); }

  // ---- Who line (no ~$) ----
  const formData = getJSON("formData", {});
  const agentListing = getJSON("agentListing", {});
  const planLS = (localStorage.getItem("selectedPlan") || "Listed Property Basic").trim();

  const commissionDisplay = () => {
    const type = (agentListing?.commissionType || formData?.commissionType || "%");
    const raw  = (agentListing?.commission ?? formData?.commission ?? "");
    if (!raw) return "[commission]";
    const n = Number(raw);
    return type === "$" ? "$" + Math.round(n).toLocaleString() : `${raw}%`;
  };

  (function renderWhoRow(){
    const addr = formData.address || "[Full Address]";
    const name = formData.name || "[Name]";
    const comm = commissionDisplay();
    if (planLS.includes("FSBO")) {
      const email = formData.fsboEmail || "[owner/seller email]";
      const phone = formData.phone || formData.agentPhone || "[owner/seller phone]";
      $("whoLine").textContent = [addr, name, email, phone, comm].join(" • ");
    } else {
      const brokerage = formData.brokerage || "[Listing Brokerage]";
      const agent     = formData.agent || "[Listing Agent]";
      const agentPh   = formData.phone || formData.agentPhone || "[Listing Agent phone]";
      $("whoLine").textContent = [addr, name, brokerage, agent, agentPh, comm].join(" • ");
    }
    $("whoRow").classList.remove("hidden");
  })();

  // ---- checkoutData normalize ----
  let data = getJSON("checkoutData", null);
  if (!data) {
    const plan = planLS;
    data = {
      plan,
      base: plan === "FSBO Plus" ? 100 : (plan === "Listed Property Plus" ? 20 : 0),
      upgrades: { upgradeToPlus:false, banner:false, premium:false, pin:false, confidential:false },
      prices:  { plus:20, banner:10, premium:10, pin:50, fsbo:100, confidential:100 },
      meta: {},
      total: 0,
      payer: "seller" // default unless set elsewhere
    };
  } else {
    if (Array.isArray(data.upgrades)) {
      const arr = data.upgrades.map(s => (s||"").toLowerCase());
      data.upgrades = {
        upgradeToPlus: arr.some(s => s.includes("upgrade to listed property plus")),
        banner:        arr.some(s => s.includes("banner")),
        premium:       arr.some(s => s.includes("premium placement")),
        pin:           arr.some(s => s.includes("pin placement")),
        confidential:  arr.some(s => s.includes("confidential"))
      };
    } else {
      data.upgrades = Object.assign(
        { upgradeToPlus:false, banner:false, premium:false, pin:false, confidential:false },
        data.upgrades || {}
      );
    }
    data.prices = Object.assign(
      { plus:20, banner:10, premium:10, pin:50, fsbo:100, confidential:100 },
      data.prices || {}
    );
    if (typeof data.base !== "number") {
      data.base = (data.plan === "FSBO Plus" ? data.prices.fsbo : (data.plan === "Listed Property Plus" ? data.prices.plus : 0));
    }
    if (!data.payer) data.payer = "seller";
  }

  // ---- September agent promo helper ----
  function isAgentSeptemberPromoActive() {
    try {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth(); // 0=Jan ... 8=Sep
      // Active only in September 2025
      return (data.payer === "agent") && (y === 2025) && (m === 8);
    } catch { return false; }
  }

  // ---- totals ----
  function recompute(d) {
    let plan = d.plan;
    let base = d.base;

    const promo = isAgentSeptemberPromoActive();

    // Handle a Basic plan that upgrades to Plus
    if (plan === "Listed Property Basic" && d.upgrades.upgradeToPlus) {
      plan = "Listed Property Plus";
      // If September agent promo: base for Plus becomes $0
      base = promo ? 0 : d.prices.plus;
      localStorage.setItem("selectedPlan", "Listed Property Plus");
    }

    // If originally Plus (no upgrade checkbox), honor promo base for agents in Sept
    if (plan === "Listed Property Plus" && promo) {
      base = 0;
    }

    let total = base;

    // Banner
    if (d.upgrades.banner) total += d.prices.banner;

    // Pin / Premium
    if (d.upgrades.pin)     total += d.prices.pin;
    else if (d.upgrades.premium) total += d.prices.premium;

    // Confidential is FSBO only
    if (plan === "FSBO Plus") {
      if (d.upgrades.confidential) total += d.prices.confidential;
    } else {
      d.upgrades.confidential = false;
    }

    d.plan = plan; d.base = base; d.total = total;
    return d;
  }
  data = recompute(data);
  localStorage.setItem("checkoutData", JSON.stringify(data));

  // ---- summary ----
  function renderSummary() {
    $("planName").textContent = data.plan;
    $("basePrice").textContent = (data.base || 0);
    $("totalAmount").textContent = (data.total || 0);

    const promo = isAgentSeptemberPromoActive();
    const sel = [];
    if (data.upgrades.upgradeToPlus) {
      if (promo) sel.push(`Upgrade to Listed Property Plus ($0 — September promo)`);
      else sel.push(`Upgrade to Listed Property Plus ($${data.prices.plus})`);
    }
    if (data.upgrades.banner) sel.push(`Banner ($${data.prices.banner})`);
    if (data.upgrades.pin) sel.push(`Pin Placement ($${data.prices.pin})`);
    else if (data.upgrades.premium) sel.push(`Premium Placement ($${data.prices.premium})`);
    if (data.plan === "FSBO Plus" && data.upgrades.confidential) sel.push(`Confidential FSBO Upgrade ($${data.prices.confidential})`);
    $("selectedList").innerHTML = sel.length ? sel.map(s => `<li>${s}</li>`).join("") : `<li class="text-gray-400">None</li>`;

    if ((data.total || 0) <= 0) {
      $("goSignatureZero").classList.remove("hidden");
      $("payNowBtn").classList.add("hidden");
    } else {
      $("goSignatureZero").classList.add("hidden");
      $("payNowBtn").classList.remove("hidden");
    }
  }

  // ---- toggles ----
  function renderLastChance() {
    const box = $("upsellChoices");
    box.innerHTML = "";

    const isBasic = data.plan === "Listed Property Basic";
    const isFSBO  = data.plan === "FSBO Plus";
    const promo   = isAgentSeptemberPromoActive();

    const toggles = [];
    if (isBasic) {
      // Upgrade to Plus toggle — show $0 if promo active
      toggles.push({
        key:"upgradeToPlus",
        label:"Upgrade to Listed Property Plus",
        price: promo ? 0 : data.prices.plus,
        note: promo ? "(September promo — free for agents)" : "",
        checked:data.upgrades.upgradeToPlus
      });
    }
    toggles.push({ key:"banner",  label:"Banner",  price:data.prices.banner,  checked:data.upgrades.banner });
    toggles.push({ key:"premium", label:"Premium Placement", price:data.prices.premium, checked:data.upgrades.premium && !data.upgrades.pin });
    toggles.push({ key:"pin",     label:"Pin Placement", price:data.prices.pin, checked:data.upgrades.pin, note:"(includes Premium free)" });
    if (isFSBO) toggles.push({ key:"confidential", label:"Confidential FSBO Upgrade", price:data.prices.confidential, checked:data.upgrades.confidential });

    box.innerHTML = toggles.map(t => `
      <label class="flex items-center justify-between border rounded-lg px-3 py-2 bg-white">
        <div>
          <span class="font-medium">${t.label}</span>
          <span class="text-gray-500"> — $${t.price}</span>
          ${t.note ? `<div class="text-[11px] text-gray-500">${t.note}</div>` : ``}
        </div>
        <input type="checkbox" class="h-4 w-4" data-key="${t.key}" ${t.checked ? 'checked':''}/>
      </label>
    `).join("");

    box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener("change", (e) => {
        const k = e.target.getAttribute("data-key");
        const checked = e.target.checked;

        if (k === "upgradeToPlus") {
          data.upgrades.upgradeToPlus = checked;
          if (checked) {
            data.plan = "Listed Property Plus";
            // base will be set by recompute (and $0 if promo)
            localStorage.setItem("selectedPlan", "Listed Property Plus");
          } else {
            const originallyBasic = (localStorage.getItem("originalPlan") || "Listed Property Basic");
            if (originallyBasic === "Listed Property Basic") {
              data.plan = "Listed Property Basic";
              data.base = 0;
              localStorage.setItem("selectedPlan", "Listed Property Basic");
            }
          }
        } else if (k === "banner") {
          data.upgrades.banner = checked;
        } else if (k === "premium") {
          data.upgrades.premium = checked && !data.upgrades.pin;
        } else if (k === "pin") {
          data.upgrades.pin = checked;
          if (checked) data.upgrades.premium = true;
        } else if (k === "confidential") {
          data.upgrades.confidential = (data.plan === "FSBO Plus") ? checked : false;
        }

        data = recompute(data);
        localStorage.setItem("checkoutData", JSON.stringify(data));
        renderSummary();
        renderLastChance();
      });
    });
  }

  $("backBtn").addEventListener("click", () => {
    window.location.href = "/upsell.html";
  });

  // ---- Pay Now: build lineItems and call server ----
  $("payNowBtn").addEventListener("click", async () => {
    const btn = $("payNowBtn");
    btn.disabled = true;
    btn.textContent = "Creating checkout…";

    try {
      if (!stripe) throw new Error("Stripe not available on this page.");
      if ((data.total || 0) <= 0) { window.location.href = "/signature.html"; return; }

      // Stripe Price IDs (test)
      const PRICE_IDS = {
        PLUS:         "price_1RsQFlPTiT2zuxx0414nGtTu",
        FSBO_PLUS:    "price_1RsQJbPTiT2zuxx0w3GUIdxJ",
        BANNER:       "price_1RsQTOPTiT2zuxx0TLCwAthR",
        PREMIUM:      "price_1RsQbjPTiT2zuxx0hA6p5H4h",
        PIN:          "price_1RsQknPTiT2zuxx0Av9skJyW",
        CONFIDENTIAL: "price_1RsRP4PTiT2zuxx0eoOGEDvm"
      };

      const promo = isAgentSeptemberPromoActive();

      // Build lineItems per current plan/upgrades
      const items = [];
      const isFSBO = data.plan === "FSBO Plus";
      const isPlus = data.plan === "Listed Property Plus";
      const isBasic= data.plan === "Listed Property Basic";

      // Base plan / upgrade to plus
      if (isFSBO && (data.base ?? data.prices.fsbo) > 0) {
        items.push({ price: PRICE_IDS.FSBO_PLUS, quantity: 1 });
      } else if (isPlus) {
        // If we are Plus due to upgrade or selected plan:
        // Only charge for PLUS if promo is NOT active
        const shouldChargePlus = (data.base ?? 0) > 0 && !promo;
        if (shouldChargePlus) items.push({ price: PRICE_IDS.PLUS, quantity: 1 });
      } else if (isBasic && data.upgrades.upgradeToPlus && !promo) {
        // Upgrading in Basic path: charge only if not promo
        items.push({ price: PRICE_IDS.PLUS, quantity: 1 });
      }

      if (data.upgrades.banner)  items.push({ price: PRICE_IDS.BANNER,  quantity: 1 });
      if (data.upgrades.pin)     items.push({ price: PRICE_IDS.PIN,     quantity: 1 });
      else if (data.upgrades.premium) items.push({ price: PRICE_IDS.PREMIUM, quantity: 1 });

      if (isFSBO && data.upgrades.confidential) items.push({ price: PRICE_IDS.CONFIDENTIAL, quantity: 1 });

      if (!items.length) throw new Error("No purchasable line items.");

      const payload = {
        lineItems: items,
        successUrl: window.location.origin + "/signature.html",
        cancelUrl:  window.location.origin + "/checkout.html"
      };

      const resp = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const ct = resp.headers.get('content-type') || '';
      const out = ct.includes('application/json') ? await resp.json() : { error: "Non-JSON server response" };
      if (!resp.ok) throw new Error(out.error || "Server failed to create session.");

      // Support both { url } and { id } returns
      if (out.url) { window.location.href = out.url; return; }
      if (out.id)  {
        const { error } = await stripe.redirectToCheckout({ sessionId: out.id });
        if (error) throw new Error(error.message || "Stripe redirect failed.");
        return;
      }

      throw new Error("Server returned neither url nor id.");
    } catch (err) {
      console.error("[checkout] payment error:", err);
      alert(err.message || "Payment could not start.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Pay Now with Stripe";
    }
  });

  // ---- initial paint ----
  if (!localStorage.getItem("originalPlan")) {
    localStorage.setItem("originalPlan", planLS);
  }
  renderSummary();
  renderLastChance();
});
