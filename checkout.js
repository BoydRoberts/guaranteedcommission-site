// /checkout.js - build 2026-01-17 (Fix: Plus base-price loophole; preserve all existing logic)
document.addEventListener("DOMContentLoaded", function() {
  console.log("[checkout.js] build 2025-12-27 - whoLine cosmetic");

  var $ = function(id) { return document.getElementById(id); };
  var getJSON = function(k, fb) { try { return JSON.parse(localStorage.getItem(k)) || fb; } catch(e) { return fb; } };

  // Stripe configuration
  var STRIPE_PUBLISHABLE_KEY =
    (window.GC_CONFIG && window.GC_CONFIG.STRIPE_PUBLISHABLE_KEY) ||
    "pk_test_51RiGoUPTiT2zuxx0T2Jk2YSvCjeHeQLb8KJnNs8gPwLtGq3AxqydjA4wcHknoee1GMB9zlKLG093DIAIE61KLqyw00hEmYRmhD";

  if (!window.GC_CONFIG || !window.GC_CONFIG.STRIPE_PUBLISHABLE_KEY) {
    console.warn("[checkout] Missing GC_CONFIG. Using fallback Stripe key.");
  }

  var stripe = null;
  try { stripe = Stripe(STRIPE_PUBLISHABLE_KEY); } catch (e) { console.error("Stripe init error:", e); }

  // Price IDs
  var PRICE_IDS =
    (window.GC_CONFIG && window.GC_CONFIG.PRICE_IDS) ||
    {
      PLUS:         "price_1RsQFlPTiT2zuxx0414nGtTu",
      FSBO_PLUS:    "price_1RsQJbPTiT2zuxx0w3GUIdxJ",
      BANNER:       "price_1RsQTOPTiT2zuxx0TLCwAthR",
      PREMIUM:      "price_1RsQbjPTiT2zuxx0hA6p5H4h",
      PIN:          "price_1RsQknPTiT2zuxx0Av9skJyW",
      CONFIDENTIAL: "price_1RsRP4PTiT2zuxx0eoOGEDvm",
      CHANGE_COMMISSION_LISTED: "price_1STqWzPTiT2zuxx0ZKLMFpuE",
      CHANGE_COMMISSION_FSBO: "price_1STqakPTiT2zuxx0zS0nEjDT"
    };

  if (!window.GC_CONFIG || !window.GC_CONFIG.PRICE_IDS) {
    console.warn("[checkout] Missing GC_CONFIG.PRICE_IDS. Using fallback price IDs.");
  }

  // Context
  var formData     = getJSON("formData", {});
  var agentListing = getJSON("agentListing", {});
  var planLS       = (localStorage.getItem("selectedPlan") || "Listed Property Basic").trim();
  var role         = (localStorage.getItem("userRole") || "").trim();

  var isFSBOPlan = function(p) { return typeof p === "string" && p.includes("FSBO"); };

  var hasSellerEmail = !!(formData && (formData.fsboEmail || formData.ownerEmail || formData.sellerEmail));
  var hasAgentData = !!(agentListing && (agentListing.agentEmail || agentListing.brokerage));
  var roleIsAgent = (role === "listing_agent" || role === "buyers_agent");
  var likelySellerFlow = hasSellerEmail || (!hasAgentData && !roleIsAgent);

  // Who row (Dec-18 detailed style)
  (function renderWhoRow(){
    if (!$("whoLine")) return;
    var addr = formData.address || "[Full Address]";
    var name = formData.name || "[Name]";
    var type = (agentListing && agentListing.commissionType) || (formData && formData.commissionType) || "%";
    var raw  = (agentListing && agentListing.commission != null) ? agentListing.commission : ((formData && formData.commission != null) ? formData.commission : "");
    var comm = raw ? (type === "$" ? "$" + Math.round(Number(raw)).toLocaleString() : raw + "%") : "[commission]";

    if (isFSBOPlan(planLS)) {
      var email = formData.fsboEmail || formData.ownerEmail || "[owner/seller email]";
      var phone = formData.phone || formData.agentPhone || "[owner/seller phone]";
      $("whoLine").textContent =
        ["", name, addr, ""].join(" * ") + "\n" +
        ["", phone, email, comm, ""].join(" * ");
    } else {
      var brokerage = formData.brokerage || "[Listing Brokerage]";
      var agent     = formData.agent || "[Listing Agent]";
      var agentPh   = formData.phone || formData.agentPhone || "[Listing Agent phone]";
      var agentEmail = formData.agentEmail || "[Listing Agent email]";
      $("whoLine").textContent =
        ["", name, addr, ""].join(" * ") + "\n" +
        ["", agent, brokerage, agentPh, agentEmail, comm, ""].join(" * ");
    }
    $("whoLine").style.whiteSpace = "pre-line";
    var whoRow = $("whoRow");
    if (whoRow) whoRow.classList.remove("hidden");
  })();

  // checkoutData normalize
  var data = getJSON("checkoutData", null);
  if (!data) {
    var plan = planLS;
    data = {
      plan: plan,
      base: isFSBOPlan(plan) ? 100 : (plan === "Listed Property Plus" ? 20 : 0),
      upgrades: { upgradeToPlus:false, banner:false, premium:false, pin:false, confidential:false, changeCommission:false },
      prices:  { plus:20, banner:10, premium:10, pin:50, fsbo:100, confidential:100, changeCommissionListed:10, changeCommissionFSBO:50 },
      meta: {},
      total: 0,
      payer: "seller"
    };
  } else {
    if (Array.isArray(data.upgrades)) {
      var arr = data.upgrades.map(function(s) { return (s||"").toLowerCase(); });
      data.upgrades = {
        upgradeToPlus: arr.some(function(s) { return s.includes("upgrade to listed property plus"); }),
        banner:        arr.some(function(s) { return s.includes("banner"); }),
        premium:       arr.some(function(s) { return s.includes("premium"); }),
        pin:           arr.some(function(s) { return s.includes("pin"); }),
        confidential:  arr.some(function(s) { return s.includes("confidential"); }),
        changeCommission: arr.some(function(s) { return s.includes("change commission"); })
      };
    } else {
      var defaultUpgrades = { upgradeToPlus:false, banner:false, premium:false, pin:false, confidential:false, changeCommission:false };
      for (var key in defaultUpgrades) {
        if (!(key in (data.upgrades || {}))) {
          data.upgrades = data.upgrades || {};
          data.upgrades[key] = defaultUpgrades[key];
        }
      }
    }

    var defaultPrices = { plus:20, banner:10, premium:10, pin:50, fsbo:100, confidential:100, changeCommissionListed:10, changeCommissionFSBO:50 };
    data.prices = data.prices || {};
    for (var pk in defaultPrices) {
      if (!(pk in data.prices)) data.prices[pk] = defaultPrices[pk];
    }
    if (typeof data.base !== "number") {
      data.base = isFSBOPlan(data.plan) ? data.prices.fsbo
           : (data.plan === "Listed Property Plus") ? (data.prices.plus || 20)
           : 0;
    }
    if (!data.payer) data.payer = "seller";
    if (!data.meta) data.meta = {};
  }

  if (likelySellerFlow) data.payer = "seller";
  else if (!data.payer && role === "listing_agent") data.payer = "agent";

  // Hard reset for new Basic seller checkouts (Dec-18 behavior)
  (function hardResetNewBasicSellerCheckout(){
    var ups = data.upgrades || {};
    var hasMetaFlags = data.meta && (data.meta.fromSellerDetail || data.meta.fromChangeCommission);
    var hasUpsells = !!(ups.upgradeToPlus || ups.banner || ups.premium || ups.pin || ups.confidential || ups.changeCommission);

    if (likelySellerFlow && !hasMetaFlags && !hasUpsells && !isFSBOPlan(planLS)) {
      data.plan = "Listed Property Basic";
      data.base = 0;
      data.total = 0;
      data.upgrades = {
        upgradeToPlus: false,
        banner: false,
        premium: false,
        pin: false,
        confidential: false,
        changeCommission: false
      };
      data.meta = {};
      localStorage.setItem("selectedPlan", "Listed Property Basic");
      localStorage.setItem("checkoutData", JSON.stringify(data));
      console.log("[checkout] Hard reset: Seller with no upsells -> Basic $0");
    }
  })();

  function isAgentNovemberPromoActive() {
    try {
      var now = new Date();
      return data.payer === "agent" && now.getFullYear() === 2025;
    } catch(e) { return false; }
  }

  function isChangeCommissionEnabled() {
    return !!(data.meta && data.meta.fromChangeCommission === true);
  }

  // ✅ Paid upgrades from Firestore (synced into meta by checkout.html)
  function paid() {
    var pu = (data.meta && data.meta.paidUpgrades && typeof data.meta.paidUpgrades === "object") ? data.meta.paidUpgrades : {};
    return pu || {};
  }

  // Pricing recompute (FIXED: Plus base price only $0 if already paid in Firestore)
  function recompute(d) {
    var freshPlan = (localStorage.getItem("selectedPlan") || "").trim();
    var plan = freshPlan || d.plan || "Listed Property Basic";

    if (d.payer === "agent" && d.upgrades.changeCommission) d.upgrades.changeCommission = false;
    if (d.upgrades.changeCommission && !isChangeCommissionEnabled()) d.upgrades.changeCommission = false;

    var isUpgradeFromSellerDetail = !!(d.meta && d.meta.fromSellerDetail === true);
    var isCommissionChangeFlow = isChangeCommissionEnabled();
    var isUpgradingToPlus = !isFSBOPlan(plan) && plan === "Listed Property Basic" && d.upgrades.upgradeToPlus;
    var promo = isAgentNovemberPromoActive();

    var base = 0;

    // Paid upgrades snapshot (from Firestore via meta)
    var pu = paid();
    // We treat "upgradeToPlus" as the canonical paid flag for Plus.
    // (If your Firestore uses a different flag later, add it here without removing this.)
    var plusAlreadyPaid = !!(pu && pu.upgradeToPlus);

    if (isCommissionChangeFlow) {
      base = 0;

    } else if (isFSBOPlan(plan)) {
      base = isUpgradeFromSellerDetail ? 0 : (d.prices.fsbo || 100);

    } else if (isUpgradingToPlus) {
      // User is upgrading from Basic to Plus inside checkout
      base = promo ? 0 : (plusAlreadyPaid ? 0 : (d.prices.plus || 20));
      plan = "Listed Property Plus";
      localStorage.setItem("selectedPlan", "Listed Property Plus");

    } else if (plan === "Listed Property Plus") {
      // IMPORTANT FIX:
      // Previously, seller-detail origin could force base to 0.
      // Now, base is 0 ONLY if Plus is already paid in Firestore, OR promo/agent/freeFlag conditions apply.
      var freeFlag = !!(d.meta && (d.meta.novemberAgentFree || d.meta.octoberAgentFree));

      if (promo || d.payer === "agent" || freeFlag) {
        base = 0;
      } else {
        base = plusAlreadyPaid ? 0 : (d.prices.plus || 20);
      }

      // If Plus is not paid yet and seller is in Plus, force the upgrade flag on
      // so UI cannot "downgrade" to avoid payment.
      if (!plusAlreadyPaid && d.payer === "seller") {
        d.upgrades.upgradeToPlus = true;
      }

    } else {
      base = 0;
    }

    var total = base;

    var bannerPrice  = promo ? 0 : (d.prices.banner  || 10);
    var premiumPrice = promo ? 0 : (d.prices.premium || 10);
    var pinPrice     = promo ? 0 : (d.prices.pin     || 50);

    if (d.upgrades.banner && !(pu && pu.banner)) total += bannerPrice;
    if (d.upgrades.pin && !(pu && pu.pin)) total += pinPrice;
    else if (d.upgrades.premium && !(pu && pu.premium) && !(pu && pu.pin)) total += premiumPrice;

    if (isFSBOPlan(plan)) {
      if (d.upgrades.confidential) total += (d.prices.confidential || 100);
      else d.upgrades.confidential = false;
    }

    if (d.upgrades.changeCommission && isChangeCommissionEnabled()) {
      var isFSBO = isFSBOPlan(plan);
      var changeCommPrice = isFSBO ? (d.prices.changeCommissionFSBO || 50) : (d.prices.changeCommissionListed || 10);
      total += changeCommPrice;
    }

    d.plan  = plan;
    d.base  = base;
    d.total = total;
    return d;
  }

  data = recompute(data);
  localStorage.setItem("checkoutData", JSON.stringify(data));

  function renderSummary() {
    // Selected Plan should match cost in recompute (FIX)
    if ($("planName")) $("planName").textContent = data.plan + " ($" + (data.base || 0) + ")";
    if ($("basePrice")) $("basePrice").textContent = (data.base || 0);
    if ($("totalAmount")) $("totalAmount").textContent = (data.total || 0);

    var promo = isAgentNovemberPromoActive();
    var pu = paid();
    var sel = [];

    if (data.upgrades.upgradeToPlus) sel.push("Upgrade to Listed Property Plus (" + (promo ? "$0 - November promo" : "$" + (data.prices.plus || 20)) + ")");

    var bannerPrice  = promo ? 0 : (data.prices.banner  || 10);
    var premiumPrice = promo ? 0 : (data.prices.premium || 10);
    var pinPrice     = promo ? 0 : (data.prices.pin     || 50);

    if (pu.banner || data.upgrades.banner) sel.push((pu.banner ? "Banner (Already paid)" : ("Banner ($" + bannerPrice + ")")));
    if (pu.pin || data.upgrades.pin) sel.push((pu.pin ? "Pin Placement (Already paid)" : ("Pin Placement ($" + pinPrice + ")")));
    else if (pu.premium || data.upgrades.premium) sel.push((pu.premium ? "Premium Placement (Already paid)" : ("Premium Placement ($" + premiumPrice + ")")));

    if (isFSBOPlan(data.plan) && (pu.confidential || data.upgrades.confidential)) sel.push(pu.confidential ? "Confidential FSBO Upgrade (Already paid)" : ("Confidential FSBO Upgrade ($" + (data.prices.confidential || 100) + ")"));

    if (data.upgrades.changeCommission && data.payer === "seller" && isChangeCommissionEnabled()) {
      var isFSBO = isFSBOPlan(data.plan);
      var price = isFSBO ? (data.prices.changeCommissionFSBO || 50) : (data.prices.changeCommissionListed || 10);
      sel.push("Change Commission ($" + price + ")");
    }

    if ($("selectedList")) {
      $("selectedList").innerHTML = sel.length ? sel.map(function(s){return "<li>"+s+"</li>";}).join("") : "<li class=\"text-gray-400\">None</li>";
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

  function renderLastChance() {
    var box = $("upsellChoices");
    if (!box) return;

    var plan = data.plan || "Listed Property Basic";
    var promo = isAgentNovemberPromoActive();
    var isFSBO = isFSBOPlan(plan);
    var isCommissionChange = isChangeCommissionEnabled();
    var pu = paid();

    // Determine if Plus must be charged (seller, not paid yet)
    var plusNotPaid = !isFSBO && (plan === "Listed Property Plus") && !(pu && pu.upgradeToPlus) && data.payer === "seller" && !promo && !isCommissionChange;
    if (plusNotPaid) {
      // Force upgrade flag on (prevents downgrade + keeps total correct)
      data.upgrades.upgradeToPlus = true;
      localStorage.setItem("checkoutData", JSON.stringify(data));
    }

    var toggles = [];

    if (!isFSBO) {
      toggles.push({
        key:"upgradeToPlus",
        label: (plan === "Listed Property Plus" ? "Listed Property Plus (Selected Plan)" : "Upgrade to Listed Property Plus"),
        price: promo ? 0 : (data.prices.plus || 20),
        checked: (plan === "Listed Property Plus") || !!data.upgrades.upgradeToPlus,
        // If Plus is selected but not yet paid, disable so they can't uncheck and dodge payment
        disabled: isCommissionChange || plusNotPaid || (pu && pu.upgradeToPlus) || (plan === "Listed Property Plus" && (pu && pu.upgradeToPlus)),
        note: (pu && pu.upgradeToPlus) ? "(Already paid)" : (plusNotPaid ? "(Required for checkout)" : (isCommissionChange ? "(Not available during commission changes)" : ""))
      });
    }

    toggles.push({ key:"banner", label:"Banner", price: promo ? 0 : (data.prices.banner || 10), checked: !!pu.banner || !!data.upgrades.banner, disabled: !!pu.banner, note: pu.banner ? "(Already paid)" : "" });

    var premiumPaid = !!pu.premium || !!pu.pin;
    toggles.push({ key:"premium", label:"Premium Placement", price: promo ? 0 : (data.prices.premium || 10), checked: premiumPaid || (!!data.upgrades.premium && !data.upgrades.pin), disabled: premiumPaid, note: premiumPaid ? "(Already paid)" : "" });

    toggles.push({ key:"pin", label:"Pin Placement", price: promo ? 0 : (data.prices.pin || 50), checked: !!pu.pin || !!data.upgrades.pin, disabled: !!pu.pin, note: pu.pin ? "(Already paid)" : "(includes Premium)" });

    if (isFSBO) {
      toggles.push({ key:"confidential", label:"Confidential FSBO Upgrade", price:(data.prices.confidential||100), checked: !!pu.confidential || !!data.upgrades.confidential, disabled: !!pu.confidential, note: pu.confidential ? "(Already paid)" : "" });
    }

    if (data.payer === "seller") {
      var changePrice = isFSBO ? (data.prices.changeCommissionFSBO || 50) : (data.prices.changeCommissionListed || 10);
      toggles.push({ key:"changeCommission", label:"Change Commission", price: changePrice, checked: !!data.upgrades.changeCommission, disabled: !isCommissionChange, note: "" });
    }

    box.innerHTML = toggles.map(function(t){
      var dis = t.disabled ? "disabled" : "";
      var disCls = t.disabled ? "opacity-50 cursor-not-allowed" : "";
      var chk = t.checked ? "checked" : "";
      var noteHtml = t.note ? ("<div class=\"text-[11px] text-gray-500\">" + t.note + "</div>") : "";
      return (
        "<label class=\"flex items-center justify-between border rounded-lg px-3 py-2 bg-white "+disCls+"\">" +
          "<div><span class=\"font-medium\">"+t.label+"</span><span class=\"text-gray-500\"> - $"+t.price+"</span>"+noteHtml+"</div>" +
          "<input type=\"checkbox\" class=\"h-4 w-4\" data-key=\""+t.key+"\" "+chk+" "+dis+"/>" +
        "</label>"
      );
    }).join("");

    var checks = box.querySelectorAll("input[type=checkbox]:not([disabled])");
    for (var i=0;i<checks.length;i++){
      checks[i].addEventListener("change", function(e){
        var k = e.target.getAttribute("data-key");
        var checked = e.target.checked;

        data.upgrades = data.upgrades || {};
        if (k === "upgradeToPlus") {
          data.upgrades.upgradeToPlus = checked;
          if (checked) {
            data.plan = "Listed Property Plus";
            localStorage.setItem("selectedPlan", "Listed Property Plus");
          } else {
            data.plan = "Listed Property Basic";
            data.base = 0;
            localStorage.setItem("selectedPlan", "Listed Property Basic");
          }
        }
        if (k === "banner") data.upgrades.banner = checked;
        if (k === "premium") data.upgrades.premium = checked && !data.upgrades.pin;
        if (k === "pin") { data.upgrades.pin = checked; if (checked) data.upgrades.premium = true; }
        if (k === "confidential") data.upgrades.confidential = checked && isFSBOPlan(data.plan);
        if (k === "changeCommission") data.upgrades.changeCommission = checked && isChangeCommissionEnabled();

        data = recompute(data);
        localStorage.setItem("checkoutData", JSON.stringify(data));
        renderSummary();
        renderLastChance();
      });
    }
  }

  // Pay Now
  if ($("payNowBtn")) {
    $("payNowBtn").addEventListener("click", async function() {
      var btn = $("payNowBtn");
      btn.disabled = true;
      btn.textContent = "Creating checkout...";

      try {
        if (!stripe) throw new Error("Stripe not available on this page.");

        var listingId = (localStorage.getItem("lastListingId") || "").trim();
        var isCommissionChange = isChangeCommissionEnabled();
        var isUpgradeFromSellerDetail = !!(data.meta && data.meta.fromSellerDetail === true);

        var successSignature =
          window.location.origin + "/signature.html" +
          (listingId ? "?id=" + encodeURIComponent(listingId) + "&session_id={CHECKOUT_SESSION_ID}"
                    : "?session_id={CHECKOUT_SESSION_ID}");

        var successSignatureCC =
          window.location.origin + "/signature.html" +
          (listingId ? "?id=" + encodeURIComponent(listingId) + "&cc=1&session_id={CHECKOUT_SESSION_ID}"
                    : "?cc=1&session_id={CHECKOUT_SESSION_ID}");

        var successSellerDetail =
          window.location.origin + "/seller-detail.html" +
          (listingId ? "?id=" + encodeURIComponent(listingId) + "&session_id={CHECKOUT_SESSION_ID}&upgraded=true"
                    : "?session_id={CHECKOUT_SESSION_ID}&upgraded=true");

        var successAgent =
          window.location.origin + "/agent-detail.html" +
          (listingId ? "?id=" + encodeURIComponent(listingId) + "&session_id={CHECKOUT_SESSION_ID}"
                    : "?session_id={CHECKOUT_SESSION_ID}");

        var successUrl;
        if (data.payer === "agent") successUrl = successAgent;
        else if (isCommissionChange) successUrl = successSignatureCC;
        else if (isUpgradeFromSellerDetail) successUrl = successSellerDetail;
        else successUrl = successSignature;

        if ((data.total || 0) <= 0) {
          window.location.href = successUrl;
          return;
        }

        var promo = isAgentNovemberPromoActive();
        var isFSBO = isFSBOPlan(data.plan);
        var items = [];
        var pu = paid();

        if (isFSBO && (data.base || 0) > 0) items.push({ price: PRICE_IDS.FSBO_PLUS, quantity: 1 });

        if (!isFSBO && data.plan === "Listed Property Plus" && !promo && !isCommissionChange && (data.base || 0) > 0) {
          items.push({ price: PRICE_IDS.PLUS, quantity: 1 });
        }

        if (data.upgrades.banner && !pu.banner && !promo) items.push({ price: PRICE_IDS.BANNER, quantity: 1 });
        if (data.upgrades.pin && !pu.pin && !promo) items.push({ price: PRICE_IDS.PIN, quantity: 1 });
        else if (data.upgrades.premium && !pu.premium && !pu.pin && !promo) items.push({ price: PRICE_IDS.PREMIUM, quantity: 1 });
        if (isFSBO && data.upgrades.confidential && !pu.confidential) items.push({ price: PRICE_IDS.CONFIDENTIAL, quantity: 1 });

        if (data.upgrades.changeCommission && data.payer === "seller" && isCommissionChange) {
          var priceId = isFSBO ? PRICE_IDS.CHANGE_COMMISSION_FSBO : PRICE_IDS.CHANGE_COMMISSION_LISTED;
          items.push({ price: priceId, quantity: 1 });
        }

        if (!items.length) throw new Error("No line items found for a non-zero total. (Data mismatch)");

        var resp = await fetch("/api/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lineItems: items,
            successUrl: successUrl,
            cancelUrl: window.location.origin + "/checkout.html"
          })
        });

        var ct  = resp.headers.get("content-type") || "";
        var out = ct.includes("application/json") ? await resp.json() : { error: "Non-JSON server response" };
        if (!resp.ok) throw new Error(out.error || "Server failed to create session.");

        if (out.url) { window.location.href = out.url; return; }
        if (out.id)  {
          var result = await stripe.redirectToCheckout({ sessionId: out.id });
          if (result.error) throw new Error(result.error.message || "Stripe redirect failed.");
          return;
        }
        throw new Error("Server returned neither url nor id.");
      } catch (err) {
        console.error("[checkout] payment error:", err);
        alert(err.message || "Payment could not start.");
      } finally {
        var btn2 = $("payNowBtn");
        if (btn2) {
          btn2.disabled = false;
          btn2.textContent = "Pay Now with Stripe";
        }
      }
    });
  }

  if (!localStorage.getItem("originalPlan")) localStorage.setItem("originalPlan", planLS);

  renderSummary();
  renderLastChance();
});
