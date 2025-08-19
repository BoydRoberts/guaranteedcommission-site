// /checkout.js — updated for server-created Checkout Sessions (2025-08-20)
document.addEventListener("DOMContentLoaded", () => {
  console.log("[checkout.js] build 2025-08-20");

  // Stripe.js initialized with your publishable key (safe on client)
  const stripe = Stripe(
    (typeof process !== "undefined" && process.env && process.env.STRIPE_PUBLIC_KEY)
      ? process.env.STRIPE_PUBLIC_KEY
      : "pk_test_REPLACE_WITH_YOUR_PUBLISHABLE_KEY"
  );

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const getJSON = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const setJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  // Confidence line at top of checkout
  (function renderWhoRow(){
    const fd = getJSON("formData", {});
    const email = localStorage.getItem("loggedInEmail") || "";
    const phone = fd.phone || "";
    const commission = fd.commission ? (fd.commission + (fd.commissionType || "%")) : "";
    const bits = [];
    if (fd.address) bits.push(fd.address);
    if (fd.name) bits.push(fd.name);
    if (email) bits.push(email);
    if (phone) bits.push(phone);
    if (commission) bits.push("Commission: " + commission);
    if (!bits.length) return;
    $("whoLine").textContent = bits.join(" • ");
    $("whoRow").classList.remove("hidden");
  })();

  // ---------- load checkout data ----------
  let data = getJSON("checkoutData", null);
  if (!data) {
    const plan = localStorage.getItem("selectedPlan") || "Listed Property Basic";
    data = {
      plan,
      base: plan === "FSBO Plus" ? 100 : (plan === "Listed Property Plus" ? 20 : 0),
      upgrades: { upgradeToPlus:false, banner:false, premium:false, pin:false, confidential:false },
      prices:  { plus:20, banner:10, premium:10, pin:50, fsbo:100, confidential:100 },
      total: 0
    };
  }

  // ---------- compute totals ----------
  function recompute(d) {
    let plan = d.plan;
    let base = d.base;

    if (plan === "Listed Property Basic" && d.upgrades.upgradeToPlus) {
      plan = "Listed Property Plus";
      base = d.prices.plus;
      localStorage.setItem("selectedPlan", "Listed Property Plus");
    }

    let total = base;
    if (d.upgrades.banner) total += d.prices.banner;
    if (d.upgrades.pin) total += d.prices.pin; 
    else if (d.upgrades.premium) total += d.prices.premium;
    if (d.upgrades.confidential && plan === "FSBO Plus") total += d.prices.confidential;

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
    if (data.plan === "FSBO Plus" && data.upgrades.confidential) sel.push(`Confidential FSBO Upgrade ($${data.prices.confidential})`);

    const ul = $("selectedList");
    ul.innerHTML = sel.length ? sel.map(s => `<li>${s}</li>`).join("") : `<li class="text-gray-400">None</li>`;

    if ((data.total || 0) <= 0) {
      $("goSignatureZero").classList.remove("hidden");
      $("payNowBtn").classList.add("hidden");
    } else {
      $("goSignatureZero").classList.add("hidden");
      $("payNowBtn").classList.remove("hidden");
    }
  }

  // ---------- last-chance toggles ----------
  function renderLastChance() {
    const box = $("upsellChoices");
    box.innerHTML = "";

    const isBasic = data.plan === "Listed Property Basic";
    const isFSBO  = data.plan === "FSBO Plus";

    const toggles = [];
    if (isBasic && !data.upgrades.upgradeToPlus) toggles.push({ key:"upgradeToPlus", label:"Upgrade to Listed Property Plus", price:data.prices.plus });
    if (!data.upgrades.banner)  toggles.push({ key:"banner",  label:"Banner",  price:data.prices.banner });
    if (!data.upgrades.premium && !data.upgrades.pin) toggles.push({ key:"premium", label:"Premium Placement", price:data.prices.premium });
    if (!data.upgrades.pin)     toggles.push({ key:"pin",     label:"Pin Placement", price:data.prices.pin });
    if (isFSBO && !data.upgrades.confidential) toggles.push({ key:"confidential", label:"Confidential FSBO Upgrade", price:data.prices.confidential });

    if (!toggles.length) {
      box.innerHTML = '<p class="text-gray-500">No additional upgrades available.</p>';
      return;
    }

    box.innerHTML = toggles.map(t => `
      <label class="flex items-center justify-between border rounded-lg px-3 py-2 bg-white">
        <div>
          <span class="font-medium">${t.label}</span>
          <span class="text-gray-500"> — $${t.price}</span>
        </div>
        <input type="checkbox" class="h-4 w-4" data-key="${t.key}" />
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
    if ((data.total || 0) <= 0) {
      window.location.href = "/signature.html";
      return;
    }

    // Build payload for our serverless API
    const payload = {
      lineItems: [],
      successUrl: window.location.origin + "/signature.html",
      cancelUrl:  window.location.origin + "/checkout.html"
    };

    const PRICE_IDS = {
      PLUS:         "price_1RsQFlPTiT2zuxx0414nGtTu",
      FSBO_PLUS:    "price_1RsQJbPTiT2zuxx0w3GUIdxJ",
      BANNER:       "price_1RsQTOPTiT2zuxx0TLCwAthR",
      PREMIUM:      "price_1RsQbjPTiT2zuxx0hA6p5H4h",
      PIN:          "price_1RsQknPTiT2zuxx0Av9skJyW",
      CONFIDENTIAL: "price_1RsRP4PTiT2zuxx0eoOGEDvm"
    };

    const isFSBO = data.plan === "FSBO Plus";
    const isPlus = data.plan === "Listed Property Plus";
    const isBasic= data.plan === "Listed Property Basic";

    if (isFSBO && (data.base ?? data.prices.fsbo) > 0) payload.lineItems.push({ price: PRICE_IDS.FSBO_PLUS, quantity: 1 });
    else if (isPlus && (data.base ?? data.prices.plus) > 0) payload.lineItems.push({ price: PRICE_IDS.PLUS, quantity: 1 });
    else if (isBasic && data.upgrades.upgradeToPlus) payload.lineItems.push({ price: PRICE_IDS.PLUS, quantity: 1 });

    if (data.upgrades.banner) payload.lineItems.push({ price: PRICE_IDS.BANNER, quantity: 1 });
    if (data.upgrades.pin)    payload.lineItems.push({ price: PRICE_IDS.PIN, quantity: 1 });
    else if (data.upgrades.premium) payload.lineItems.push({ price: PRICE_IDS.PREMIUM, quantity: 1 });
    if (isFSBO && data.upgrades.confidential) payload.lineItems.push({ price: PRICE_IDS.CONFIDENTIAL, quantity: 1 });

    let resp;
    try {
      resp = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      alert("Network error contacting payment server.");
      return;
    }

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      alert("Payment could not start: " + (err.error || resp.statusText));
      return;
    }

    const dataResp = await resp.json();
    if (dataResp.url) {
      window.location.href = dataResp.url;
    } else {
      alert("Payment could not start (no URL returned).");
    }
  });

  // ---------- initial paint ----------
  renderSummary();
  renderLastChance();
});
