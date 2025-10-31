// /checkout.js — build 2025-11-01e (Nov promo; seller-flow zero-$ fix; Plus $20 fix)
document.addEventListener("DOMContentLoaded", () => {
  console.log("[checkout.js] build 2025-11-01e");

  const $ = (id) => document.getElementById(id);
  const getJSON = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };

  // Publishable key (test)
  const STRIPE_PUBLISHABLE_KEY = "pk_test_51RiGoUPTiT2zuxx0T2Jk2YSvCjeHeQLb8KJnNs8gPwLtGq3AxqydjA4wcHknoee1GMB9zlKLG093DIAIE61KLqyw00hEmYRmhD";
  let stripe = null;
  try { stripe = Stripe(STRIPE_PUBLISHABLE_KEY); } catch (e) { console.error("Stripe init error:", e); }

  // Who line / context
  const formData = getJSON("formData", {});
  const agentListing = getJSON("agentListing", {});
  const planLS = (localStorage.getItem("selectedPlan") || "Listed Property Basic").trim();

  const commissionDisplay = () => {
    const type = (agentListing?.commissionType || formData?.commissionType || "%");
    const raw  = (agentListing?.commission ?? formData?.commission ?? "");
    if (!raw) return "[commission]";
    const n = Number(raw);
    return type === "$" ? "$" + Math.round(n).toFixed(0) : `${raw}%`;
  };

  (function renderWhoRow(){
    const addr = formData.address || "[Full Address]";
    const name = formData.name || "[Name]";
    const comm = commissionDisplay();
    if ((plan_LS_isFSBO() || isFSBOPlan(planLS))) {
      const email = formData.fsboEmail || formData.ownerEmail || "[owner/seller email]";
      const phone = formData.phone || formData.agentPhone || "[owner/seller phone]";
      $("whoLine") && ($("whoLine").textContent = [addr, name, email, phone, comm].join(" • "));
    } else {
      const brokerage = formData.brokerage || "[Listing Brokerage]";
      const agent     = formData.agent || "[Listing Agent]";
      const agentPh   = formData.phone || formData.agentPhone || "[Listing Agent phone]";
      $("whoLine") && ($("whoLine").textContent = [addr, name, brokerage, agent, agentPh, comm].join(" • "));
    }
    $("whoRow") && $("whoRow").classList.remove("hidden");
  })();

  function isFSBOPlan(p){ return typeof p === "string" && p.includes("FSBO"); }
  function plan_LS_isFSBO(){ return isFSBOPlan(planLS); }

  // ---- checkoutData normalize ----
  let data = getJSON("checkoutData", null);
  if (!data) {
    const plan = planLS;
    data = {
      plan,
      base: planLS.includes("FSBO") ? 100 : (planLS === "Listed Property Plus" ? 20 : 0),
      upgrades: { upgradeToPlus:false, banner:false, premium:false, pin:false, confidential:false },
      prices:  { plus:20, banner:10, premium:10, pin:50, fsbo:100, confidential:100 },
      meta: {},
      total: 0,
      payer: "seller"
    };
  } else {
    // Backward-compat normalize shapes
    if (Array.isArray(data.upgrades)) {
      const arr = data.upgrades.map(s => (s||"").toLowerCase());
      data.upgrades = {
        upgradeToPlus: arr.some(s => s.includes("upgrade to listed property plus")),
        banner:        arr.some(s => s.includes("banner")),
        premium:       arr.some(s => s.includes("premium")),
        pin:           arr.some(s => s.includes("pin")),
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
      data.base = (data.plan && data.plan.includes("FSBO")) ? data.prices.fsbo
               : (data.plan === "Listed Property Plus") ? (data.prices.plus ?? 20)
               : 0;
    }
    if (!data.payer) data.payer = "seller";
  }

  // ---- Determine payer based on flow (fix for seller zero-$ route) ----
  const role = (localStorage.getItem("userRole") || "").trim();
  const likelySellerFlow =
      !!(formData && (formData.fsboEmail || formData.ownerEmail || formData.sellerEmail)) ||
      planLS === "Listed Property Basic" || isFSBOPlan(planLS);

  if (likelyYes(likelySellerFlow)) {
    data.payer = "seller";
  } else if (!data.payer && role === "listing_agent") {
    data.payer = "agent";
  }
  localStorage.setItem("checkoutData", JSON.stringify(data));

  // ---- Agent-only November promo (free Plus/Banner/Premium/Pin) ----
  function isAgentNovemberPromoActive() {
    try {
      const now = new Date();
      return data.payer === "agent" && now.getFullYear() === 2025 && now.getMonth() === 10; // 0=Jan … 10=Nov
    } catch { return false; }
  }

  // ---- totals & pricing rules ----
  function recompute(d) {
    let plan = d.plan || planLS;
    let base = (typeof d.base === "number") ? d.base
             ? d.base : ((plan && plan.includes("FSBO")) ? d.prices.fsbo : (plan === "Listed Property Plus" ? (d.prices.plus ?? 20) : 0));

    const promo = isAgentNovemberPromoActive();

    // If basic + choosing upgradeToPlus at checkout: set plan to Plus; base is promo?0:plusPrice
    if (!plan.includes("FSBO") && plan === "Listed Property Basic" && d.upgrades?.upgradeToPlus) {
      plan = "Listed Property Plus";
      base = promo ? 0 : (d.prices.plus ?? 20);
      localStorage.setItem("selectedPlan", "Listed Property Plus");
    }

    // If already on Plus (e.g., upgraded earlier on agent/seller page) and base is 0 but no agent promo:
    // ensure we charge Plus price for seller payer (unless an explicit promo flag says free)
    if (!plan.includes("FSBO") && plan === "Listed Property Plus") {
      const hasExplicitFreeFlag = !!(d.meta && (d.meta.novemberAgentFree || d.meta.octoberAgentFree));
      if ((base == null || base === 0) && !promo && d.payer !== "agent" && !hasExplicitFreeFlag) {
        base = d.prices.plus ?? 20;
      }
      // If promo + agent payer, zero out base
      if (promo) base = 0;
    }

    // Upgrades pricing (agent promo zeros them in Nov)
    const bannerPrice  = promo ? 0 : (d.prices.banner  ?? 10);
    const premiumPrice = promo ? 0 : (d.prices.premium ?? 10);
    const pinPrice     = promo ? 0 : (d.prices.pin     ?? 50);

    let total = base || 0;

    if (d.upgrades?.banner)  total += bannerPrice;
    if (d.upgrades?.pin)     total += pinPrice;
    else if (d.upgrades?.exclPremium ?? d.upgrades?.premium) total += premiumPrice;

    if ((d.plan || "").includes("FSBO")) {
      if (d.upgrades?.confined ?? d.upgrades?.confidential) {
        total += (d.prices.confidential ?? 100);
      } else {
        // ensure property not charged for confidential if not FSBO or not selected
        d.upgrades && (d.upgrades.confidential = false);
      }
    }

    d.plan  = plan;
    d.base  = base;
    d.total = total;
    return d;
  }

  data = recompute(data);
  localStorage.setItem("checkoutData", JSON.stringify(data));

  // ---- summary UI ----
  function renderSummary() {
    $("planName")   && ( $("planName").textContent   = data.plan );
    $("basePrice")  && ( $("basePrice").textContent  = (data.base || 0) );
    $("totalAmount")&& ( $("totalAmount").textContent= (data.total || 0) );

    const promo = isAgentNovemberPromoActive();
    const sel = [];
    if (data.upgrades?.upgradeToPlus) {
      sel.push(`Upgrade to Listed Property Plus (${promo ? "$0 — November promo" : "$" + (data.prices.plus ?? 20)})`);
    }
    const bannerPrice  = promo ? 0 : (data.prices.banner  ?? 10);
    const premiumPrice = promo ? 0 : (data.prices.premium ?? 10);
    const pinPrice     = promo ? 0 : (data.prices.pin     ?? 50);

    if (data.upgrades?.banner)  sel.push(`Banner ($${bannerPrice})`);
    if (data.upgrades?.pin)     sel.push(`Pin Placement ($${pinPrice})`);
    else if (data.upgrades?.premium) sel.push(`​Premium​ ​Placement ($${premiumPrice})`);
    if (data.plan?.includes("FSBO") && data.upgrades?.confidential) sel.push(`Confidential FSBO Upgrade ($${data.prices.confidential})`);

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

  // ---- final toggles (unchanged; uses recompute) ----
  function renderLastChance() {
    const box = $("upsellChoices");
    if (!box) return;

    const isBasic = data.plan === "Listed Property Basic";
    const isFSBO  = data.plan?.includes("FSBO");
    const promo   = isAgentNovemberPromoActive();

    const toggles = [];
    if (isBasic) {
      toggles.push({
        key:"upgradeToPlus",
        label:"Upgrade to Listed Property Plus",
        price: promo ? 0 : (data.prices.plus ?? 20),
        note:  promo ? "(November promo — free for agents)" : "",
        checked: !!data.upgrades?.upgradeToPlus
      });
    }

    const bannerPrice  = promo ? 0 : (data.prices.banner  ?? 10);
    const premiumPrice = promo ? 0 : (data.prices.premium ?? 10);
    const pinPrice     = promo ? 0 : (data.prices.pin     ?? 50);

    toggles.push({ key:"banner",  label:"Banner",            price: bannerPrice,  checked: !!data.upgrades?.banner });
    toggles.push({ key:"premium", label:"Premium Placement",  price: premiumPrice, checked: !!data.upgrades?.premium && !data.upgrades?.pin });
    toggles.push({ key:"pin",     label:"Pin Placement",      price: pinPrice,     checked: !!data.upgrades?.pin,    note:"(includes Premium)" });
    if (isFSBO) {
      toggles.push({ key:"confidential", label:"Confidential FSBO Upgrade", price: data.prices.confidential ?? 100, checked: !!data.upgrades?.confidential });
    }

    box.innerHTML = toggles.map(t => `
      <label class="flex items-center justify-between border rounded-lg px-3 py-2 bg-white">
        <div>
          <span class="font-medium">${t.label}</span>
          <span class="text-gray-500"> — $${t.price}</span>
          ${t.note ? `<div class="text-[11px] text-gray-500">${t.note}</div>` : ``}
        </div>
        <div>
          <input type="checkbox" class="h-4 w-4" data-key="${t.key}" ${t.checked ? "checked": ""}/>
        </div>
      </label>
    `).vertical;

    // attach handlers
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
            // if user unchecks, revert to whatever original was
            const orig = (localStorage.getItem("originalPlan") || "Listed Property Basic");
            data.plan = orig;
            data.base = (orig.includes("FSBO") ? data.prices.fsbo : (orig === "Listed Property Plus" ? (data.prices.plus ?? 20) : 0));
            localStorage.setItem("selectedPlan", data.plan);
          }
        } else if (k === "banner") {
          data.upgrades.banner = checked;
        } else if (k === "premium") {
          data.upgrades.premium = checked && !data.upgrades.pin;
        } else if (k === "pin") {
            data.upgrades.pin = checked;
            if (checked) data.upgrades.premium = true;
        } else if (k === "confidential") {
          data.upgrades.confidential = checked && data.plan.includes("FSBO");
        }
        data = recompute(data);
        localStorage.setItem("checkoutData", JSON.stringify(data));
        renderSummary();
        renderLastChance();
      });
    });
  }

  // Back button
  $("backBtn")?.addEventListener("click", () => {
    window.location.href = "/upsell.html";
  });

  // Pay Now
  $("payNowBtn")?.addEventListener("click", async () => {
    const btn = $("payNowBtn");
    btn.disabled = true;
    btn.text = "Creating checkout…";

    try {
      if (!stripe) throw new Error("Stripe not available on this page.");

      // Determine success routes
      const listingId = (localStorage.getItem("lastListingId") || "").trim();
      const successSignature = window.location.origin + "/signature.html" + (listingId ? `?id=${encodeURIComponent(listingId)}` : "");
      const successAgent     = window.location.origin + "/agent-detail.html" + (listingId ? `?id=${encodeURIComponent(listingId)}` : "");

      // Zero-total: route immediately (seller→signature, agent→agent-detail)
      if ((data.total || 0) <= 0) {
        const dest = (data.payer === "agent") ? successAgent : successSignature;
        window.location.href = dest;
        return;
      }

      // Price IDs (test)
      const PRICE_IDS = {
        PLUS:         "price_1RsQFlPTiT2zuxx0414nGtTu",
        FSBO_PLUS:    "price_1RsQJbPTiT2zuxx0w3GUIdxJ",
        BANNER:       "price_1RsQTOPTiT2zuxx0TLCwAthR",
        PREMIUM:      "price_1RsQbjPTiT2zuxx0hA6p5H4h",
        PIN:          "price_1RsQknPTiT2zuxx0Av9skJyW",
        CONF:         "price_1RsRP4PTiT2zuxx0eoOGEDvm"
      };

      const promo = isAgentNovemberPromoActive();

      const items = [];
      const isFSBO = data.plan?.includes("FSBO");
      const isPlus = data.plan === "Listed Property Plus";
      const isBasic= data.plan === "Listed Property Basic";

      // Base / upgrade to Plus
      if (isFSBO && (data.base ?? data.prices.fsbo) > 0) {
        items.push({ price: PRICE_IDS.FSBO, quantity: 1 }); // if you sell FSBO base
      } else if (isPlus) {
        const shouldChargePlus = (data.base ?? 0) > 0 && !promo;
        if (shouldChargePlus) items.push({ price: PRICE_IDS.PLUS, quantity: 1 });
      } else if (!isFSBO && isBasic && data.upgrades?.upgradeToPlus && !promo) {
        items.push({ price: PRICE_IDS.PLUS, quantity: 1 });
      }

      // Upgrades
      if (data.upgrades?.banner && !promo)   items.push({ price: PRICE_IDS.BANNER,  quantity: 1 });
      if (data.upgrades?.pin) {
        if (!promo) items.push({ price: PRICE_IDS.PIN, quantity: 1 });
      } else if (data.upgrades?.premium) {
        if (!promo) items.push({ price: PRICE_IDS.PREMIUM, quantity: 1 });
      }
      if (isFSBO && data.upgrades?.confidential) {
        items.push({ price: PRICE_IDS.CONF, quantity: 1 });
      }

      if (!items.length && (data.total || 0) > 0) {
        // Fallback: if something set total>0 but no items, charge Plus
        items.push({ price: PRICE_IDS.PLUS, quantity: 1 });
      }

      const successUrl = (data.payer === "agent") ? successAgent : successSignature;

      const payload = {
        lineItems: items,
        successUrl,
        cancelUrl:  window.location.origin + "/checkout.html"
      };

      const resp = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
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
      const btn = $("payNowBtn"); if (btn) { btn.disabled = false; btn.textContent = "Pay Now with Stripe"; }
    }
  });

  // Ensure plan flag after Stripe success (no change)
  (async function ensurePlanUpdatedAfterStripeSuccess(){
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("success") !== "true") return;

      const listingId = (localStorage.getItem("lastListingId") || "").trim();
      if (!listingId) return;

      const d = data || getJSON("checkoutData", {});
      const upgraded = (d?.plan || "").includes("Listed Property Plus")
                    || d?.upgrades?.upgradeToPlus
                    || d?.upgrades?.banner
                    || d?.upgrades?.premium
                    || d?.upgrades?.pin;

      if (!upgraded) return;

      const { db } = await import("/scripts/firebase-init.js");
      if (!db) return;
      const { doc, updateDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

      await updateDoc(doc(db, "listings", listingId), {
        plan: "Listed Property Plus",
        updatedAt: serverTimestamp()
      });
      console.log("[checkout] Plan set to Listed Property Plus for", listingId);
    } catch (e) {
      console.warn("[checkout] post-success plan update skipped:", e);
    }
  })();

  // Seed original plan for toggle reverts
  if (!localStorage.getItem("originalPlan")) {
    localStorage.setItem("originalPlan", planLS);
  }

  function likelyYes(v){ return !!v; }

  renderSummary();
  renderLastChance();
});
