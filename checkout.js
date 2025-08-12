// checkout.js — build 2025-08-12r
document.addEventListener("DOMContentLoaded", () => {
  console.log("[checkout.js] build 2025-08-12r");

  // ---------- Stripe (test) ----------
  const stripe = Stripe("pk_test_51RiGoUPTiT2zuxx0T2Jk2YSvCjeHeQLb8KJnNs8gPwLtGq3AxqydjA4wcHknoee1GMB9zlKLG093DIAIE61KLqyw00hEmYRmhD");

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const getJSON = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const setJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const fmt = (n) => (Number(n || 0)).toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0});

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

  // ---------- source of truth from upsell ----------
  // We support both the "new" boolean-upgrades object and an older "array of strings" schema.
  let data = getJSON("checkoutData", null);
  if (!data) {
    const plan = localStorage.getItem("selectedPlan") || "Listed Property Basic";
    data = {
      plan,
      base: plan === "FSBO Plus" ? 100 : (plan === "Listed Property Plus" ? 20 : 0),
      upgrades: { upgradeToPlus:false, banner:false, premium:false, pin:false, confidential:false },
      prices:  { plus:20, banner:10, premium:10, pin:50, fsbo:100, confidential:100 },
      meta: {},
      total: 0
    };
  } else {
    // If old array schema, normalize it into booleans
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
      // ensure all keys exist
      data.upgrades = Object.assign({ upgradeToPlus:false, banner:false, premium:false, pin:false, confidential:false }, data.upgrades || {});
    }
    // ensure prices exist
    data.prices = Object.assign({ plus:20, banner:10, premium:10, pin:50, fsbo:100, confidential:100 }, data.prices || {});
    data.base ??= (data.plan === "FSBO Plus" ? data.prices.fsbo : (data.plan === "Listed Property Plus" ? data.prices.plus : 0));
  }

  // ---------- compute total ----------
  function recompute(d) {
    let plan = d.plan;
    let base = d.base;

    // If Basic & chose upgradeToPlus, treat as Plus base here (and update selectedPlan for later pages)
    if (plan === "Listed Property Basic" && d.upgrades.upgradeToPlus) {
      plan = "Listed Property Plus";
      base = d.prices.plus;
      localStorage.setItem("selectedPlan", "Listed Property Plus");
    }

    let total = base;
    if (d.upgrades.banner) total += d.prices.banner;
    if (d.upgrades.pin) total += d.prices.pin;            // includes Premium
    else if (d.upgrades.premium) total += d.prices.premium;
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
    $("basePrice").textContent = (data.base||0);
    $("totalAmount").textContent = (data.total||0);

    const sel = [];
    if (data.upgrades.upgradeToPlus) sel.push(`Upgrade to Listed Property Plus ($${data.prices.plus})`);
    if (data.upgrades.banner) sel.push(`Banner ($${data.prices.banner})`);
    if (data.upgrades.pin) sel.push(`Pin Placement ($${data.prices.pin})`);
    else if (data.upgrades.premium) sel.push(`Premium Placement ($${data.prices.premium})`);
    if (data.upgrades.confidential) sel.push(`Confidential FSBO Upgrade ($${data.prices.confidential})`);

    const ul = $("selectedList");
    ul.innerHTML = sel.length ? sel.map(s => `<li>${s}</li>`).join("") : `<li class="text-gray-400">None</li>`;

    // Toggle zero-total continue
    if ((data.total || 0) <= 0) {
      $("goSignatureZero").classList.remove("hidden");
      $("payNowBtn").classList.add("hidden");
    } else {
      $("goSignatureZero").classList.add("hidden");
      $("payNowBtn").classList.remove("hidden");
    }
  }

  // ---------- last-chance toggles (no promo box) ----------
  function renderLastChance() {
    const box = $("upsellChoices");
    box.innerHTML = "";

    const isBasic = data.plan === "Listed Property Basic";
    const isFSBO  = data.plan === "FSBO Plus";

    const toggles = [];
    if (isBasic && !data.upgrades.upgradeToPlus) toggles.push({ key:"upgradeToPlus", label:"Upgrade to Listed Property Plus", price:data.prices.plus });
    if (!data.upgrades.banner)  toggles.push({ key:"banner",  label:"Banner",  price:data.prices.banner });
    if (!data.upgrades.premium && !data.upgrades.pin) toggles.push({ key:"premium", label:"Premium Placement", price:data.prices.premium });
    if (!data.upgrades.pin)     toggles.push({ key:"pin",     label:"Pin Placement", price:data.prices.pin, note:"(includes Premium free)" });
    if (isFSBO && !data.upgrades.confidential) toggles.push({ key:"confidential", label:"Confidential FSBO Upgrade", price:data.prices.confidential });

    if (!toggles.length) {
      box.innerHTML = '<p class="text-gray-500">No additional upgrades available.</p>';
      return;
    }

    box.innerHTML = toggles.map(t => `
      <label class="flex items-center justify-between border rounded px-3 py-2">
        <div>
          <span class="font-medium">${t.label}</span>
          <span class="text-gray-500"> — $${t.price}</span>
          ${t.note ? `<div class="text-[11px] text-gray-500">${t.note}</div>` : ``}
        </div>
        <input type="checkbox" class="h-4 w-4" data-key="${t.key}"/>
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
            data.base = data.prices.plus;
            localStorage.setItem("selectedPlan", "Listed Property Plus");
          }
        } else if (k === "banner") {
          data.upgrades.banner = checked;
        } else if (k === "premium") {
          data.upgrades.premium = checked;
        } else if (k === "pin") {
          data.upgrades.pin = checked;
          if (checked) data.upgrades.premium = true;
        } else if (k === "confidential") {
          data.upgrades.confidential = checked;
        }

        data = recompute(data);
        setJSON("checkoutData", data);
        renderSummary();
      });
    });
  }

  // ---------- actions ----------
  $("backBtn").addEventListener("click", () => {
    window.location.href = "/upsell.html";
  });

  $("payNowBtn").addEventListener("click", async () => {
    // Guard: if $0, skip Stripe
    if ((data.total || 0) <= 0) {
      window.location.href = "/signature.html";
      return;
    }

    // Build Stripe line items from current state
    const PRICE_IDS = {
      PLUS:         "price_1RsQFlPTiT2zuxx0414nGtTu", // $20 Listed Property Plus
      FSBO_PLUS:    "price_1RsQJbPTiT2zuxx0w3GUIdxJ", // $100 FSBO Plus
      BANNER:       "price_1RsQTOPTiT2zuxx0TLCwAthR", // $10 Banner
      PREMIUM:      "price_1RsQbjPTiT2zuxx0hA6p5H4h", // $10 Premium
      PIN:          "price_1RsQknPTiT2zuxx0Av9skJyW", // $50 Pin
      CONFIDENTIAL: "price_1RsRP4PTiT2zuxx0eoOGEDvm"  // $100 Confidential
    };

    const items = [];
    const isFSBO = data.plan === "FSBO Plus";
    const isPlus = data.plan === "Listed Property Plus";
    const isBasic= data.plan === "Listed Property Basic";

    // Base plan
    if (isFSBO && (data.base ?? data.prices.fsbo) > 0) {
      items.push({ price: PRICE_IDS.FSBO_PLUS, quantity: 1 });
    } else if (isPlus && (data.base ?? data.prices.plus) > 0) {
      items.push({ price: PRICE_IDS.PLUS, quantity: 1 });
    } else if (isBasic && data.upgrades.upgradeToPlus && data.prices.plus > 0) {
      items.push({ price: PRICE_IDS.PLUS, quantity: 1 });
    }

    // Upsells (only charge if price > 0)
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

    // Redirect to Stripe Checkout (success → Signature)
    const { error } = await stripe.redirectToCheckout({
      lineItems: items,
      mode: "payment",
      successUrl: window.location.origin + "/signature.html",
      cancelUrl:  window.location.origin + "/checkout.html"
    });

    if (error) {
      alert("Stripe error: " + error.message);
    }
  });

  // ---------- initial paint ----------
  renderSummary();
  renderLastChance();
});
