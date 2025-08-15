// checkout.js — build 2025-08-14b
document.addEventListener("DOMContentLoaded", () => {
  console.log("[checkout.js] build 2025-08-14b");

  // ---------- Stripe (test) ----------
  const stripe = Stripe("pk_test_51RiGoUPTiT2zuxx0T2Jk2YSvCjeHeQLb8KJnNs8gPwLtGq3AxqydjA4wcHknoee1GMB9zlKLG093DIAIE61KLqyw00hEmYRmhD");

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const getJSON = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const setJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  // Confidence line
  (function renderWhoRow(){
    const fd = getJSON("formData", {});
    const email = localStorage.getItem("loggedInEmail") || "";
    const bits = [];
    if (fd.address) bits.push(fd.address);
    if (fd.sellerName || fd.name) bits.push(fd.sellerName || fd.name);
    if (email) bits.push(email);
    if (!bits.length) return;
    $("whoLine").textContent = bits.join(" • ");
    $("whoRow").classList.remove("hidden");
  })();

  // ---------- load checkout data (supports old & new schemas) ----------
  const originalPlan = (localStorage.getItem("selectedPlan") || "Listed Property Basic").trim();
  const isFromBasic = originalPlan === "Listed Property Basic";

  let data = getJSON("checkoutData", null);
  if (!data) {
    data = {
      plan: originalPlan,
      base: originalPlan === "FSBO Plus" ? 100 : (originalPlan === "Listed Property Plus" ? 20 : 0),
      upgrades: { upgradeToPlus:false, banner:false, premium:false, pin:false, confidential:false },
      prices:  { plus:20, banner:10, premium:10, pin:50, fsbo:100, confidential:100 },
      meta: {},
      total: 0
    };
  } else {
    // normalize shapes
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
      data.upgrades = Object.assign({ upgradeToPlus:false, banner:false, premium:false, pin:false, confidential:false }, data.upgrades || {});
    }
    data.prices = Object.assign({ plus:20, banner:10, premium:10, pin:50, fsbo:100, confidential:100 }, data.prices || {});
    if (typeof data.base !== "number") {
      data.base = (data.plan === "FSBO Plus" ? data.prices.fsbo : (data.plan === "Listed Property Plus" ? data.prices.plus : 0));
    }
  }

  // Ensure we know the starting context (prevents unintended downgrades)
  data._originalPlan = originalPlan;
  setJSON("checkoutData", data);

  // ---------- compute totals ----------
  function recompute(d) {
    let plan = d.plan;
    let base = d.base;

    // If came from Basic: allow toggling Upgrade→Plus on/off
    if (isFromBasic) {
      if (d.upgrades.upgradeToPlus) {
        plan = "Listed Property Plus";
        base = d.prices.plus;
      } else {
        plan = "Listed Property Basic";
        base = 0;
      }
      localStorage.setItem("selectedPlan", plan);
    } else {
      // If original was Plus/FSBO, lock the base plan; upgrades still toggle
      plan = originalPlan;
      base = (plan === "FSBO Plus") ? d.prices.fsbo : (plan === "Listed Property Plus" ? d.prices.plus : 0);
      localStorage.setItem("selectedPlan", plan);
    }

    let total = base;
    if (d.upgrades.banner) total += d.prices.banner;
    if (d.upgrades.pin) {
      total += d.prices.pin;            // includes Premium
    } else if (d.upgrades.premium) {
      total += d.prices.premium;
    }
    if (d.upgrades.confidential) total += d.prices.confidential;

    d.plan = plan;
    d.base = base;
    d.total = total;
    return d;
  }

  data = recompute(data);
  setJSON("checkoutData", data);

  // ---------- render summary ----------
  function renderSummary() {
    $("planName").textContent = data.plan;
    $("basePrice").textContent = (data.base || 0);
    $("totalAmount").textContent = (data.total || 0);

    const sel = [];
    if (data.upgrades.upgradeToPlus) sel.push(`Upgrade to Listed Property Plus ($${data.prices.plus})`);
    if (data.upgrades.banner) sel.push(`Banner ($${data.prices.banner})`);
    if (data.upgrades.pin) sel.push(`Pin Placement ($${data.prices.pin})`);
    else if (data.upgrades.premium) sel.push(`Premium Placement ($${data.prices.premium})`);
    if (data.upgrades.confidential) sel.push(`Confidential FSBO Upgrade ($${data.prices.confidential})`);

    const ul = $("selectedList");
    ul.innerHTML = sel.length ? sel.map(s => `<li>${s}</li>`).join("") : `<li class="text-gray-400">None</li>`;

    // Toggle $0 flow
    if ((data.total || 0) <= 0) {
      $("goSignatureZero").classList.remove("hidden");
      $("payNowBtn").classList.add("hidden");
    } else {
      $("goSignatureZero").classList.add("hidden");
      $("payNowBtn").classList.remove("hidden");
    }
  }

  // ---------- last-chance toggles (two-way, can always uncheck) ----------
  function renderLastChance() {
    const box = $("upsellChoices");
    box.innerHTML = "";

    const isFSBO  = data.plan === "FSBO Plus";
    const toggles = [];

    // Only show the Upgrade→Plus toggle if the user originally selected Basic
    if (isFromBasic) {
      toggles.push({ key:"upgradeToPlus", label:"Upgrade to Listed Property Plus", price:data.prices.plus, checked: !!data.upgrades.upgradeToPlus });
    }

    toggles.push(
      { key:"banner",  label:"Banner",            price:data.prices.banner,  checked: !!data.upgrades.banner },
      { key:"premium", label:"Premium Placement", price:data.prices.premium, checked: !!data.upgrades.premium && !data.upgrades.pin },
      { key:"pin",     label:"Pin Placement",     price:data.prices.pin,     checked: !!data.upgrades.pin, note:"(includes Premium free)" }
    );

    if (isFSBO || originalPlan === "FSBO Plus") {
      toggles.push({ key:"confidential", label:"Confidential FSBO Upgrade", price:data.prices.confidential, checked: !!data.upgrades.confidential });
    }

    box.innerHTML = toggles.map(t => `
      <label class="flex items-center justify-between border rounded-lg px-3 py-2 bg-white">
        <div>
          <span class="font-medium">${t.label}</span>
          <span class="text-gray-500"> — $${t.price}</span>
          ${t.note ? `<div class="text-[11px] text-gray-500">${t.note}</div>` : ``}
        </div>
        <input type="checkbox" class="h-4 w-4" data-key="${t.key}" ${t.checked ? "checked" : ""}/>
      </label>
    `).join("");

    box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener("change", (e) => {
        const k = e.target.getAttribute("data-key");
        const checked = e.target.checked;

        if (k === "upgradeToPlus") {
          data.upgrades.upgradeToPlus = checked;
        } else if (k === "banner") {
          data.upgrades.banner = checked;
        } else if (k === "premium") {
          // Premium is independent unless Pin is on (Pin includes Premium)
          data.upgrades.premium = checked;
          if (data.upgrades.pin && !checked) {
            // If Pin is on, Premium is implicitly on (reflect UI by re-checking)
            data.upgrades.premium = true;
            e.target.checked = true;
          }
        } else if (k === "pin") {
          data.upgrades.pin = checked;
          if (checked) data.upgrades.premium = true; // Pin includes Premium
        } else if (k === "confidential") {
          data.upgrades.confidential = checked;
        }

        data = recompute(data);
        setJSON("checkoutData", data);
        renderSummary();
        // Re-render toggles to reflect dependencies (e.g., pin→premium)
        renderLastChance();
      });
    });
  }

  // ---------- actions ----------
  $("backBtn").addEventListener("click", () => {
    window.location.href = "/upsell.html";
  });

  $("payNowBtn").addEventListener("click", async () => {
    // Skip Stripe if $0 (defensive; button is hidden in this case)
    if ((data.total || 0) <= 0) {
      window.location.href = "/signature.html";
      return;
    }

    // Stripe Price IDs (your test IDs)
    const PRICE_IDS = {
      PLUS:         "price_1RsQFlPTiT2zuxx0414nGtTu", // $20 Listed Property Plus
      FSBO_PLUS:    "price_1RsQJbPTiT2zuxx0w3GUIdxJ", // $100 FSBO Plus
      BANNER:       "price_1RsQTOPTiT2zuxx0TLCwAthR", // $10 Banner
      PREMIUM:      "price_1RsQbjPTiT2zuxx0hA6p5H4h", // $10 Premium
      PIN:          "price_1RsQknPTiT2zuxx0Av9skJyW", // $50 Pin
      CONFIDENTIAL: "price_1RsRP4PTiT2zuxx0eoOGEDvm"  // $100 Confidential
    };

    const items = [];
    const isFSBOPlan = data.plan === "FSBO Plus";
    const isPlusPlan = data.plan === "Listed Property Plus";
    const isBasicPlan= data.plan === "Listed Property Basic";

    // Base
    if (isFSBOPlan && (data.base ?? data.prices.fsbo) > 0) {
      items.push({ price: PRICE_IDS.FSBO_PLUS, quantity: 1 });
    } else if (isPlusPlan && (data.base ?? data.prices.plus) > 0) {
      items.push({ price: PRICE_IDS.PLUS, quantity: 1 });
    } else if (isBasicPlan && data.upgrades.upgradeToPlus && data.prices.plus > 0) {
      items.push({ price: PRICE_IDS.PLUS, quantity: 1 });
    }

    // Upsells
    if (data.upgrades.banner && data.prices.banner > 0) items.push({ price: PRICE_IDS.BANNER, quantity: 1 });
    if (data.upgrades.pin) {
      if (data.prices.pin > 0) items.push({ price: PRICE_IDS.PIN, quantity: 1 });
    } else if (data.upgrades.premium && data.prices.premium > 0) {
      items.push({ price: PRICE_IDS.PREMIUM, quantity: 1 });
    }
    if (data.upgrades.confidential && data.prices.confidential > 0) items.push({ price: PRICE_IDS.CONFIDENTIAL, quantity: 1 });

    if (!items.length) {
      alert("Nothing selected to purchase.");
      return;
    }

    // Debug: verify payload before Stripe
    console.log("[checkout.js] checkoutData:", JSON.parse(localStorage.getItem("checkoutData") || "{}"));
    console.log("[checkout.js] Stripe lineItems:", items);

    const { error } = await stripe.redirectToCheckout({
      lineItems: items,
      mode: "payment",
      successUrl: window.location.origin + "/signature.html",
      cancelUrl:  window.location.origin + "/checkout.html"
    });

    if (error) alert("Stripe error: " + error.message);
  });

  // ---------- initial paint ----------
  renderSummary();
  renderLastChance();
});
