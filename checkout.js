// checkout.js — build 2025-08-14a
document.addEventListener("DOMContentLoaded", () => {
  console.log("[checkout.js] build 2025-08-14a");

  const stripe = Stripe("pk_test_51RiGoUPTiT2zuxx0T2Jk2YSvCjeHeQLb8KJnNs8gPwLtGq3AxqydjA4wcHknoee1GMB9zlKLG093DIAIE61KLqyw00hEmYRmhD");

  const $ = (id) => document.getElementById(id);
  const getJSON = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const setJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

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
      data.upgrades = Object.assign({ upgradeToPlus:false, banner:false, premium:false, pin:false, confidential:false }, data.upgrades || {});
    }
    data.prices = Object.assign({ plus:20, banner:10, premium:10, pin:50, fsbo:100, confidential:100 }, data.prices || {});
    if (typeof data.base !== "number") {
      data.base = (data.plan === "FSBO Plus" ? data.prices.fsbo : (data.plan === "Listed Property Plus" ? data.prices.plus : 0));
    }
  }

  function recompute(d) {
    // allow user to uncheck upgradeToPlus to go back to Basic
    if (d.plan === "Listed Property Basic") {
      d.base = 0;
      if (d.upgrades.upgradeToPlus) {
        d.plan = "Listed Property Plus";
        d.base = d.prices.plus;
        localStorage.setItem("selectedPlan", "Listed Property Plus");
      }
    } else if (d.plan === "Listed Property Plus") {
      // If user unchecked the upgrade flag explicitly (coming from Basic), keep Plus unless they flip plan back
      if (!d.upgrades.upgradeToPlus && (localStorage.getItem("selectedPlan") === "Listed Property Basic")) {
        d.plan = "Listed Property Basic";
        d.base = 0;
      }
    }

    // FSBO title correction if needed
    if (d.plan.toLowerCase().includes("fsbo")) d.plan = "FSBO Plus";

    let total = d.base;
    if (d.upgrades.banner) total += d.prices.banner;
    if (d.upgrades.pin) total += d.prices.pin;
    else if (d.upgrades.premium) total += d.prices.premium;
    if (d.upgrades.confidential) total += d.prices.confidential;

    d.total = total;
    return d;
  }
  data = recompute(data);
  setJSON("checkoutData", data);

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

    if ((data.total || 0) <= 0) {
      $("goSignatureZero").classList.remove("hidden");
      $("payNowBtn").classList.add("hidden");
    } else {
      $("goSignatureZero").classList.add("hidden");
      $("payNowBtn").classList.remove("hidden");
    }
  }

  function renderLastChance() {
    const box = $("upsellChoices");
    box.innerHTML = "";

    const isBasic = data.plan === "Listed Property Basic";
    const isFSBO  = data.plan === "FSBO Plus";

    const toggles = [];
    // Show Upgrade to Plus toggle if Basic OR if this upgrade flag is currently true (so it can be unchecked)
    if (isBasic || data.upgrades.upgradeToPlus) toggles.push({ key:"upgradeToPlus", label:"Upgrade to Listed Property Plus", price:data.prices.plus, checked:!!data.upgrades.upgradeToPlus });
    if (!data.upgrades.banner)  toggles.push({ key:"banner",  label:"Banner",  price:data.prices.banner, checked:false });
    if (!data.upgrades.premium && !data.upgrades.pin) toggles.push({ key:"premium", label:"Premium Placement", price:data.prices.premium, checked:false });
    toggles.push({ key:"pin", label:"Pin Placement", price:data.prices.pin, note:"(includes Premium free)", checked:!!data.upgrades.pin });
    if (isFSBO) toggles.push({ key:"confidential", label:"Confidential FSBO Upgrade", price:data.prices.confidential, checked:!!data.upgrades.confidential });

    box.innerHTML = toggles.map(t => `
      <label class="flex items-center justify-between border rounded-lg px-3 py-2 bg-white">
        <div>
          <span class="font-medium">${t.label}</span>
          <span class="text-gray-500"> — $${t.price}</span>
          ${t.note ? `<div class="text-[11px] text-gray-500">${t.note}</div>` : ``}
        </div>
        <input type="checkbox" class="h-4 w-4" data-key="${t.key}" ${t.checked ? 'checked' : ''}/>
      </label>
    `).join("");

    box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener("change", (e) => {
        const k = e.target.getAttribute("data-key");
        const checked = e.target.checked;

        if (k === "upgradeToPlus") {
          data.upgrades.upgradeToPlus = checked;
          // Flip plan if needed
          if (checked) {
            data.plan = "Listed Property Plus";
            data.base = data.prices.plus;
            localStorage.setItem("selectedPlan", "Listed Property Plus");
          } else {
            data.plan = "Listed Property Basic";
            data.base = 0;
            localStorage.setItem("selectedPlan", "Listed Property Basic");
          }
        } else if (k === "banner") {
          data.upgrades.banner = checked;
        } else if (k === "premium") {
          data.upgrades.premium = checked && !data.upgrades.pin; // suppressed if pin true
        } else if (k === "pin") {
          data.upgrades.pin = checked;
          if (checked) data.upgrades.premium = true; // include Premium
        } else if (k === "confidential") {
          data.upgrades.confidential = checked;
        }

        data = recompute(data);
        setJSON("checkoutData", data);
        renderSummary();
        renderLastChance(); // re-render so defaults reflect new state
      });
    });
  }

  $("backBtn").addEventListener("click", () => { window.location.href = "/upsell.html"; });

  $("payNowBtn").addEventListener("click", async () => {
    if ((data.total || 0) <= 0) { window.location.href = "/signature.html"; return; }

    const PRICE_IDS = {
      PLUS:         "price_1RsQFlPTiT2zuxx0414nGtTu",
      FSBO_PLUS:    "price_1RsQJbPTiT2zuxx0w3GUIdxJ",
      BANNER:       "price_1RsQTOPTiT2zuxx0TLCwAthR",
      PREMIUM:      "price_1RsQbjPTiT2zuxx0hA6p5H4h",
      PIN:          "price_1RsQknPTiT2zuxx0Av9skJyW",
      CONFIDENTIAL: "price_1RsRP4PTiT2zuxx0eoOGEDvm"
    };

    const items = [];
    const isFSBO = data.plan === "FSBO Plus";
    const isPlus = data.plan === "Listed Property Plus";
    const isBasic= data.plan === "Listed Property Basic";

    if (isFSBO && (data.base ?? data.prices.fsbo) > 0) items.push({ price: PRICE_IDS.FSBO_PLUS, quantity: 1 });
    else if (isPlus && (data.base ?? data.prices.plus) > 0) items.push({ price: PRICE_IDS.PLUS, quantity: 1 });
    else if (isBasic && data.upgrades.upgradeToPlus && data.prices.plus > 0) items.push({ price: PRICE_IDS.PLUS, quantity: 1 });

    if (data.upgrades.banner && data.prices.banner > 0) items.push({ price: PRICE_IDS.BANNER, quantity: 1 });
    if (data.upgrades.pin) {
      if (data.prices.pin > 0) items.push({ price: PRICE_IDS.PIN, quantity: 1 });
    } else if (data.upgrades.premium && data.prices.premium > 0) {
      items.push({ price: PRICE_IDS.PREMIUM, quantity: 1 });
    }
    if (isFSBO && data.upgrades.confidential && data.prices.confidential > 0) items.push({ price: PRICE_IDS.CONFIDENTIAL, quantity: 1 });

    if (!items.length) { alert("Nothing selected to purchase."); return; }

    const { error } = await stripe.redirectToCheckout({
      lineItems: items,
      mode: "payment",
      successUrl: window.location.origin + "/signature.html",
      cancelUrl:  window.location.origin + "/checkout.html"
    });

    if (error) alert("Stripe error: " + error.message);
  });

  renderSummary();
  renderLastChance();
});
