Checkout · JS
Copy

// /checkout.js — build 2025-11-16 (Added Commission History & Paid Upgrades Tracking)
document.addEventListener("DOMContentLoaded", () => {
  console.log("[checkout.js] build 2025-11-16 with Change Commission & Paid Upgrades Tracking");

  const $ = (id) => document.getElementById(id);
  const getJSON = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };

  // Stripe (test)
  const STRIPE_PUBLISHABLE_KEY = "pk_test_51RiGoUPTiT2zuxx0T2Jk2YSvCjeHeQLb8KJnNs8gPwLtGq3AxqydjA4wcHknoee1GMB9zlKLG093DIAIE61KLqyw00hEmYRmhD";
  let stripe = null;
  try { stripe = Stripe(STRIPE_PUBLISHABLE_KEY); } catch (e) { console.error("Stripe init error:", e); }

  // Context
  const formData     = getJSON("formData", {});
  const agentListing = getJSON("agentListing", {});
  const planLS       = (localStorage.getItem("selectedPlan") || "Listed Property Basic").trim();
  const role         = (localStorage.getItem("userRole") || "").trim();

  const isFSBOPlan = (p) => typeof p === "string" && p.includes("FSBO");
  const likelySellerFlow =
    !!(formData && (formData.fsboEmail || formData.ownerEmail || formData.sellerEmail)) ||
    planLS === "Listed Property Basic" || isFSBOPlan(planLS);

  // Who row (pure display)
  (function renderWhoRow(){
    if (!$("whoLine")) return;
    const addr = formData.address || "[Full Address]";
    const name = formData.name || "[Name]";
    const type = (agentListing?.commissionType || formData?.commissionType || "%");
    const raw  = (agentListing?.commission ?? formData?.commission ?? "");
    const comm = raw ? (type === "$" ? "$" + Math.round(Number(raw)).toLocaleString() : `${raw}%`) : "[commission]";

    if (isFSBOPlan(planLS)) {
      const email = formData.fsboEmail || formData.ownerEmail || "[owner/seller email]";
      const phone = formData.phone || formData.agentPhone || "[owner/seller phone]";
      $("whoLine").textContent = [addr, name, email, phone, comm].join(" • ");
    } else {
      const brokerage = formData.brokerage || "[Listing Brokerage]";
      const agent     = formData.agent || "[Listing Agent]";
      const agentPh   = formData.phone || formData.agentPhone || "[Listing Agent phone]";
      $("whoLine").textContent = [addr, name, brokerage, agent, agentPh, comm].join(" • ");
    }
    $("whoRow")?.classList.remove("hidden");
  })();

  // ---- checkoutData normalize
  let data = getJSON("checkoutData", null);
  if (!data) {
    const plan = planLS;
    data = {
      plan,
      base: isFSBOPlan(plan) ? 100 : (plan === "Listed Property Plus" ? 20 : 0),
      upgrades: { upgradeToPlus:false, banner:false, premium:false, pin:false, confidential:false, changeCommission:false },
      prices:  { plus:20, banner:10, premium:10, pin:50, fsbo:100, confidential:100, changeCommissionListed:10, changeCommissionFSBO:50 },
      meta: {},
      total: 0,
      payer: "seller"
    };
  } else {
    // upgrades -> canonical object
    if (Array.isArray(data.upgrades)) {
      const arr = data.upgrades.map(s => (s||"").toLowerCase());
      data.upgrades = {
        upgradeToPlus: arr.some(s => s.includes("upgrade to listed property plus")),
        banner:        arr.some(s => s.includes("banner")),
        premium:       arr.some(s => s.includes("premium")),
        pin:           arr.some(s => s.includes("pin")),
        confidential:  arr.some(s => s.includes("confidential")),
        changeCommission: arr.some(s => s.includes("change commission"))
      };
    } else {
      data.upgrades = Object.assign(
        { upgradeToPlus:false, banner:false, premium:false, pin:false, confidential:false, changeCommission:false },
        data.upgrades || {}
      );
    }
    // price table
    data.prices = Object.assign(
      { plus:20, banner:10, premium:10, pin:50, fsbo:100, confidential:100, changeCommissionListed:10, changeCommissionFSBO:50 },
      data.prices || {}
    );
    // base
    if (typeof data.base !== "number") {
      data.base = isFSBOPlan(data.plan) ? data.prices.fsbo
           : (data.plan === "Listed Property Plus") ? (data.prices.plus ?? 20)
           : 0;
    }
    if (!data.payer) data.payer = "seller";
  }

  // Decide payer (so seller BASIC $0 routes to signature)
  if (likelySellerFlow) {
    data.payer = "seller";
  } else if (!data.payer && role === "listing_agent") {
    data.payer = "agent";
  }

  // ---- STRONG NORMALIZATION (permanent Basic $0 for Box2/no-upsells)
  (function enforceSellerBasicIfNoUpsells(){
    const noUpsells =
      !data.upgrades.upgradeToPlus && !data.upgrades.banner && !data.upgrades.premium && 
      !data.upgrades.pin && !data.upgrades.confidential && !data.upgrades.changeCommission;

    if (likelySellerFlow && !isFSBOPlan(planLS) && noUpsells) {
      data.plan = "Listed Property Basic";
      data.base = 0;
      localStorage.setItem("selectedPlan", "Listed Property Basic");
    }
    localStorage.setItem("checkoutData", JSON.stringify(data));
  })();

  // Agent-only November promo (agent = free in November)
  function isAgentNovemberPromoActive() {
    try {
      const now = new Date();
      return data.payer === "agent" && now.getFullYear() === 2025 && now.getMonth() === 10; // Nov = 10
    } catch { return false; }
  }

  // Pricing + totals
  function recompute(d) {
    let plan = d.plan || planLS;
    let base = (typeof d.base === "number") ? d.base
             : (isFSBOPlan(plan) ? (d.prices.fsbo ?? 100)
             : (plan === "Listed Property Plus" ? (d.prices.plus ?? 20) : 0));

    const promo = isAgentNovemberPromoActive();

    // If Basic and user chooses upgradeToPlus at checkout
    if (!isFSBOPlan(plan) && plan === "Listed Property Basic" && d.upgrades.upgradeToPlus) {
      plan = "Listed Property Plus";
      base = promo ? 0 : (d.prices.plus ?? 20);
      localStorage.setItem("selectedPlan", "Listed Property Plus");
    }

    // If already Plus, ensure seller pays base unless agent-promo or explicit free meta
    if (!isFSBOPlan(plan) && plan === "Listed Property Plus") {
      const freeFlag = !!(d.meta && (d.meta.novemberAgentFree || d.meta.octoberAgentFree));
      if ((base == null || base === 0) && !promo && d.payer !== "agent" && !freeFlag) {
        base = d.prices.plus ?? 20;
      }
      if (promo) base = 0;
    }

    let total = base || 0;

    const bannerPrice  = promo ? 0 : (d.prices.banner  ?? 10);
    const premiumPrice = promo ? 0 : (d.prices.premium ?? 10);
    const pinPrice     = promo ? 0 : (d.prices.pin     ?? 50);

    if (d.upgrades.banner)  total += bannerPrice;
    if (d.upgrades.pin)     total += pinPrice;
    else if (d.upgrades.premium) total += premiumPrice;

    if (isFSBOPlan(plan)) {
      if (d.upgrades.confidential) total += (d.prices.confidential ?? 100);
      else d.upgrades.confidential = false;
    }

    // Change Commission pricing
    if (d.upgrades.changeCommission) {
      const isFSBO = isFSBOPlan(plan);
      const changeCommPrice = isFSBO ? (d.prices.changeCommissionFSBO ?? 50) : (d.prices.changeCommissionListed ?? 10);
      total += changeCommPrice;
    }

    d.plan  = plan;
    d.base  = base;
    d.total = total;
    return d;
  }

  data = recompute(data);
  localStorage.setItem("checkoutData", JSON.stringify(data));

  // Summary UI
  function renderSummary() {
    $("planName")    && ($("planName").textContent    = data.plan);
    $("basePrice")   && ($("basePrice").textContent   = (data.base || 0));
    $("totalAmount") && ($("totalAmount").textContent = (data.total || 0));

    const promo = isAgentNovemberPromoActive();
    const sel = [];
    if (data.upgrades.upgradeToPlus) {
      sel.push(`Upgrade to Listed Property Plus (${promo ? "$0 — November promo" : "$" + (data.prices.plus ?? 20)})`);
    }
    const bannerPrice  = promo ? 0 : (data.prices.banner  ?? 10);
    const premiumPrice = promo ? 0 : (data.prices.premium ?? 10);
    const pinPrice     = promo ? 0 : (data.prices.pin     ?? 50);

    if (data.upgrades.banner)  sel.push(`Banner ($${bannerPrice})`);
    if (data.upgrades.pin)     sel.push(`Pin Placement ($${pinPrice})`);
    else if (data.upgrades.premium) sel.push(`Premium Placement ($${premiumPrice})`);
    if (isFSBOPlan(data.plan) && data.upgrades.confidential) sel.push(`Confidential FSBO Upgrade ($${data.prices.confidential})`);
    
    // Change Commission in summary
    if (data.upgrades.changeCommission) {
      const isFSBO = isFSBOPlan(data.plan);
      const price = isFSBO ? (data.prices.changeCommissionFSBO ?? 50) : (data.prices.changeCommissionListed ?? 10);
      sel.push(`Change Commission ($${price})`);
    }

    if ($("selectedList")) {
      $("selectedList").innerHTML = sel.length ? sel.map(s => `<li>${s}</li>`).join("") : `<li class="text-gray-400">None</li>`;
    }

    if ($("goSignatureZero") && $("payNowBtn")) {
      if ((data.total || 0) <= 0) {
        $("goSignatureZero").classList.remove("hidden");
        $("payNowBtn").classList.add("hidden");
      } else {
        $("goSignatureZero").classList.add("hidden");
        $("payNowBtn").classList.remove("hidden");
      }
    }
  }

  // Toggles (last-chance)
  function renderLastChance() {
    const box = $("upsellChoices");
    if (!box) return;

    const isBasic = data.plan === "Listed Property Basic";
    const isFSBO = isFSBOPlan(data.plan);
    const promo   = isAgentNovemberPromoActive();

    const toggles = [];
    if (isBasic) {
      toggles.push({
        key:"upgradeToPlus",
        label:"Upgrade to Listed Property Plus",
        price: promo ? 0 : (data.prices.plus ?? 20),
        note:  promo ? "(November promo — free for agents)" : "",
        checked: !!data.upgrades.upgradeToPlus
      });
    }

    const bannerPrice  = promo ? 0 : (data.prices.banner  ?? 10);
    const premiumPrice = promo ? 0 : (data.prices.premium ?? 10);
    const pinPrice     = promo ? 0 : (data.prices.pin     ?? 50);

    toggles.push({ key:"banner",  label:"Banner",            price: bannerPrice,  checked: !!data.upgrades.banner });
    toggles.push({ key:"premium", label:"Premium Placement", price: premiumPrice, checked: !!data.upgrades.premium && !data.upgrades.pin });
    toggles.push({ key:"pin",     label:"Pin Placement",     price: pinPrice,     checked: !!data.upgrades.pin, note:"(includes Premium)" });
    
    if (isFSBO) {
      toggles.push({ key:"confidential", label:"Confidential FSBO Upgrade", price: data.prices.confidential ?? 100, checked: !!data.upgrades.confidential });
    }

    // Change Commission in last-chance upsells
    const changeCommPrice = isFSBO ? (data.prices.changeCommissionFSBO ?? 50) : (data.prices.changeCommissionListed ?? 10);
    toggles.push({ 
      key: "changeCommission", 
      label: "Change Commission", 
      price: changeCommPrice, 
      checked: !!data.upgrades.changeCommission,
      note: "(One-time commission change)"
    });

    box.innerHTML = toggles.map(t => `
      <label class="flex items-center justify-between border rounded-lg px-3 py-2 bg-white">
        <div>
          <span class="font-medium">${t.label}</span>
          <span class="text-gray-500"> — $${t.price}</span>
          ${t.note ? `<div class="text-[11px] text-gray-500">${t.note}</div>` : ``}
        </div>
        <input type="checkbox" class="h-4 w-4" data-key="${t.key}" ${t.checked ? "checked": ""}/>
      </label>
    `).join("");

    Array.from(box.querySelectorAll('input[type="checkbox"]')).forEach(cb => {
      cb.addEventListener("change", (e) => {
        const k = e.target.getAttribute("data-key");
        const checked = e.target.checked;
        data.upgrades = data.upgrades || {};
        if (k === "upgradeToPlus") {
          data.upgrades[k] = checked;
          if (checked) {
            data.plan = "Listed Property Plus";
            localStorage.setItem("selectedPlan", "Listed Property Plus");
          } else {
            data.plan = "Listed Property Basic";
            data.base = 0;
            localStorage.setItem("selectedPlan", "Listed Property Basic");
          }
        } else if (k === "banner") {
          data.upgrades.banner = checked;
        } else if (k === "premium") {
          data.upgrades.premium = checked && !data.upgrades.pin;
        } else if (k === "pin") {
          data.upgrades.pin = checked;
          if (checked) data.upgrades.premium = true;
        } else if (k === "confidential") {
          data.upgrades.confidential = checked && isFSBOPlan(data.plan);
        } else if (k === "changeCommission") {
          data.upgrades.changeCommission = checked;
        }
        data = recompute(data);
        localStorage.setItem("checkoutData", JSON.stringify(data));
        renderSummary();
        renderLastChance();
      });
    });
  }

  // Back
  $("backBtn")?.addEventListener("click", () => { window.location.href = "/upsell.html"; });

  // Pay Now
  $("payNowBtn")?.addEventListener("click", async () => {
    const btn = $("payNowBtn");
    btn.disabled = true;
    btn.textContent = "Creating checkout…";

    try {
      if (!stripe) throw new Error("Stripe not available on this page.");

      const listingId       = (localStorage.getItem("lastListingId") || "").trim();
      const successSignature= window.location.origin + "/signature.html"    + (listingId ? `?id=${encodeURIComponent(listingId)}` : "");
      const successAgent    = window.location.origin + "/agent-detail.html" + (listingId ? `?id=${encodeURIComponent(listingId)}` : "");

      // Zero total → route immediately (seller→signature, agent→agent-detail)
      if ((data.total || 0) <= 0) {
        window.location.href = (data.payer === "agent") ? successAgent : successSignature;
        return;
      }

      // Price IDs (test)
      const PRICE_IDS = {
        PLUS:         "price_1RsQFlPTiT2zuxx0414nGtTu",
        FSBO_PLUS:    "price_1RsQJbPTiT2zuxx0w3GUIdxJ",
        BANNER:       "price_1RsQTOPTiT2zuxx0TLCwAthR",
        PREMIUM:      "price_1RsQbjPTiT2zuxx0hA6p5H4h",
        PIN:          "price_1RsQknPTiT2zuxx0Av9skJyW",
        CONFIDENTIAL: "price_1RsRP4PTiT2zuxx0eoOGEDvm",
        // Change Commission Price IDs
        CHANGE_COMMISSION_LISTED: "price_1STqWzPTiT2zuxx0ZKLMFpuE",
        CHANGE_COMMISSION_FSBO: "price_1STqakPTiT2zuxx0zS0nEjDT"
      };

      const promo   = isAgentNovemberPromoActive();
      const isFSBO  = isFSBOPlan(data.plan);
      const isPlus  = data.plan === "Listed Property Plus";
      const isBasic = data.plan === "Listed Property Basic";

      const items = [];

      if (isFSBO && (data.base ?? data.prices.fsbo) > 0) {
        items.push({ price: PRICE_IDS.FSBO_PLUS, quantity: 1 });
      } else if (isPlus) {
        const shouldChargePlus = (data.base ?? 0) > 0 && !promo;
        if (shouldChargePlus) items.push({ price: PRICE_IDS.PLUS, quantity: 1 });
      } else if (isBasic && data.upgrades.upgradeToPlus && !promo) {
        items.push({ price: PRICE_IDS.PLUS, quantity: 1 });
      }

      if (data.upgrades.banner && !promo)   items.push({ price: PRICE_IDS.BANNER,  quantity: 1 });
      if (data.upgrades.pin) {
        if (!promo) items.push({ price: PRICE_IDS.PIN, quantity: 1 });
      } else if (data.upgrades.premium) {
        if (!promo) items.push({ price: PRICE_IDS.PREMIUM, quantity: 1 });
      }
      if (isFSBO && data.upgrades.confidential) items.push({ price: PRICE_IDS.CONFIDENTIAL, quantity: 1 });

      // Change Commission to Stripe items
      if (data.upgrades.changeCommission) {
        const priceId = isFSBO ? PRICE_IDS.CHANGE_COMMISSION_FSBO : PRICE_IDS.CHANGE_COMMISSION_LISTED;
        items.push({ price: priceId, quantity: 1 });
      }

      if (!items.length && (data.total || 0) > 0) {
        // Safety: if total > 0 but no items, bill Plus
        items.push({ price: PRICE_IDS.PLUS, quantity: 1 });
      }

      const successUrl = (data.payer === "agent") ? successAgent : successSignature;

      const resp = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineItems: items,
          successUrl,
          cancelUrl: window.location.origin + "/checkout.html"
        })
      });

      const ct  = resp.headers.get("content-type") || "";
      const out = ct.includes("application/json") ? await resp.json() : { error: "Non-JSON server response" };
      if (!resp.ok) throw new Error(out.error || "Server failed to create session.");

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
      const btn2 = $("payNowBtn"); if (btn2) { btn2.disabled = false; btn2.textContent = "Pay Now with Stripe"; }
    }
  });

  // Note: Paid upgrades are tracked in signature.html/agent-detail.html after Stripe redirect
  // Users go directly to those pages after payment, not back to checkout.html

  if (!localStorage.getItem("originalPlan")) {
    localStorage.setItem("originalPlan", planLS);
  }

  renderSummary();
  renderLastChance();
});
