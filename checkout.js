// /checkout.js - build 2025-12-18-v6 (Allow unchecking Plus, fix commission change pricing)
document.addEventListener("DOMContentLoaded", function() {
  console.log("[checkout.js] build 2025-12-18-v6 - Allow unchecking Plus, fix commission change pricing");

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

  // Who row
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
      $("whoLine").textContent = [addr, name, email, phone, comm].join(" * ");
    } else {
      var brokerage = formData.brokerage || "[Listing Brokerage]";
      var agent     = formData.agent || "[Listing Agent]";
      var agentPh   = formData.phone || formData.agentPhone || "[Listing Agent phone]";
      $("whoLine").textContent = [addr, name, brokerage, agent, agentPh, comm].join(" * ");
    }
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
      if (!(pk in data.prices)) {
        data.prices[pk] = defaultPrices[pk];
      }
    }
    if (typeof data.base !== "number") {
      data.base = isFSBOPlan(data.plan) ? data.prices.fsbo
           : (data.plan === "Listed Property Plus") ? (data.prices.plus || 20)
           : 0;
    }
    if (!data.payer) data.payer = "seller";
    if (!data.meta) data.meta = {};
  }

  if (likelySellerFlow) {
    data.payer = "seller";
  } else if (!data.payer && role === "listing_agent") {
    data.payer = "agent";
  }

  // Hard reset for new Basic seller checkouts
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

  // ✅ FIX: Pricing - prevent double-charging Plus during commission changes
  function recompute(d) {
    var freshPlan = (localStorage.getItem("selectedPlan") || "").trim();
    var plan = freshPlan || d.plan || "Listed Property Basic";
    
    if (d.payer === "agent" && d.upgrades.changeCommission) {
      d.upgrades.changeCommission = false;
    }

    if (d.upgrades.changeCommission && !isChangeCommissionEnabled()) {
      d.upgrades.changeCommission = false;
    }
    
    var isUpgradeFromSellerDetail = !!(d.meta && d.meta.fromSellerDetail === true);
    
    // ✅ FIX: Check if this is a commission change flow
    var isCommissionChangeFlow = isChangeCommissionEnabled();
    
    var isUpgradingToPlus = !isFSBOPlan(plan) && plan === "Listed Property Basic" && d.upgrades.upgradeToPlus;
    
    var promo = isAgentNovemberPromoActive();
    
    var base = 0;
    
    // ✅ FIX: For commission changes, ALWAYS set base to $0
    if (isCommissionChangeFlow) {
      base = 0;
      console.log("[checkout] Commission change flow: base = $0");
    } else if (isFSBOPlan(plan)) {
      base = isUpgradeFromSellerDetail ? 0 : (d.prices.fsbo || 100);
    } else if (isUpgradingToPlus) {
      base = promo ? 0 : (d.prices.plus || 20);
      plan = "Listed Property Plus";
      localStorage.setItem("selectedPlan", "Listed Property Plus");
    } else if (plan === "Listed Property Plus") {
      if (isUpgradeFromSellerDetail) {
        base = 0;
      } else {
        var freeFlag = !!(d.meta && (d.meta.novemberAgentFree || d.meta.octoberAgentFree));
        base = (promo || d.payer === "agent" || freeFlag) ? 0 : (d.prices.plus || 20);
      }
    } else {
      base = 0;
    }

    var total = base;

    var bannerPrice  = promo ? 0 : (d.prices.banner  || 10);
    var premiumPrice = promo ? 0 : (d.prices.premium || 10);
    var pinPrice     = promo ? 0 : (d.prices.pin     || 50);

    var paidUpgrades = (d.meta && d.meta.paidUpgrades) || {};
    
    if (d.upgrades.banner && !paidUpgrades.banner) total += bannerPrice;
    if (d.upgrades.pin && !paidUpgrades.pin) total += pinPrice;
    else if (d.upgrades.premium && !paidUpgrades.premium && !paidUpgrades.pin) total += premiumPrice;

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
    var planNameEl = $("planName");
    var basePriceEl = $("basePrice");
    var totalAmountEl = $("totalAmount");
    
    if (planNameEl) planNameEl.textContent = data.plan;
    if (basePriceEl) basePriceEl.textContent = (data.base || 0);
    if (totalAmountEl) totalAmountEl.textContent = (data.total || 0);

    var promo = isAgentNovemberPromoActive();
    var sel = [];
    if (data.upgrades.upgradeToPlus) {
      sel.push("Upgrade to Listed Property Plus (" + (promo ? "$0 - November promo" : "$" + (data.prices.plus || 20)) + ")");
    }
    var bannerPrice  = promo ? 0 : (data.prices.banner  || 10);
    var premiumPrice = promo ? 0 : (data.prices.premium || 10);
    var pinPrice     = promo ? 0 : (data.prices.pin     || 50);

    if (data.upgrades.banner)  sel.push("Banner ($" + bannerPrice + ")");
    if (data.upgrades.pin)     sel.push("Pin Placement ($" + pinPrice + ")");
    else if (data.upgrades.premium) sel.push("Premium Placement ($" + premiumPrice + ")");
    if (isFSBOPlan(data.plan) && data.upgrades.confidential) sel.push("Confidential FSBO Upgrade ($" + data.prices.confidential + ")");
    
    if (data.upgrades.changeCommission && data.payer === "seller" && isChangeCommissionEnabled()) {
      var isFSBO = isFSBOPlan(data.plan);
      var price = isFSBO ? (data.prices.changeCommissionFSBO || 50) : (data.prices.changeCommissionListed || 10);
      sel.push("Change Commission ($" + price + ")");
    }

    var selectedListEl = $("selectedList");
    if (selectedListEl) {
      if (sel.length) {
        selectedListEl.innerHTML = sel.map(function(s) { return "<li>" + s + "</li>"; }).join("");
      } else {
        selectedListEl.innerHTML = "<li class=\"text-gray-400\">None</li>";
      }
    }

    var goSignatureZeroEl = $("goSignatureZero");
    var payNowBtnEl = $("payNowBtn");
    if (goSignatureZeroEl && payNowBtnEl) {
      if ((data.total || 0) <= 0) {
        goSignatureZeroEl.classList.remove("hidden");
        payNowBtnEl.classList.add("hidden");
      } else {
        goSignatureZeroEl.classList.add("hidden");
        payNowBtnEl.classList.remove("hidden");
      }
    }
  }

  // ✅ FIX: ALWAYS show Plus option, allow unchecking (but disable during commission changes)
  function renderLastChance() {
    var box = $("upsellChoices");
    if (!box) return;

    var currentPlan = data.plan || "Listed Property Basic";
    var isBasic = currentPlan === "Listed Property Basic";
    var isPlus = currentPlan === "Listed Property Plus";
    var isFSBO = isFSBOPlan(currentPlan);
    var promo   = isAgentNovemberPromoActive();
    
    // ✅ NEW: Check if this is a commission change - disable Plus if so
    var isCommissionChange = isChangeCommissionEnabled();

    var toggles = [];
    
    // ✅ FIX: ALWAYS show Plus (even if already Plus), but disable during commission changes
    if (!isFSBO) {
      var plusLabel = isPlus ? "Listed Property Plus (Current Plan)" : "Upgrade to Listed Property Plus";
      var plusNote = "";
      
      if (isCommissionChange) {
        plusNote = "(Not available during commission changes)";
      } else if (isPlus) {
        plusNote = "(Uncheck to downgrade to Basic)";
      } else if (promo) {
        plusNote = "(November promo - free for agents)";
      }
      
      toggles.push({
        key:"upgradeToPlus",
        label: plusLabel,
        price: promo ? 0 : (data.prices.plus || 20),
        note: plusNote,
        checked: isPlus || !!data.upgrades.upgradeToPlus,
        disabled: isCommissionChange  // ✅ Disable during commission changes
      });
    }

    var bannerPrice  = promo ? 0 : (data.prices.banner  || 10);
    var premiumPrice = promo ? 0 : (data.prices.premium || 10);
    var pinPrice     = promo ? 0 : (data.prices.pin     || 50);

    toggles.push({ key:"banner",  label:"Banner",            price: bannerPrice,  checked: !!data.upgrades.banner, disabled: false, note: "" });
    toggles.push({ key:"premium", label:"Premium Placement", price: premiumPrice, checked: !!data.upgrades.premium && !data.upgrades.pin, disabled: false, note: "" });
    toggles.push({ key:"pin",     label:"Pin Placement",     price: pinPrice,     checked: !!data.upgrades.pin, note:"(includes Premium)", disabled: false });
    
    if (isFSBO) {
      toggles.push({ key:"confidential", label:"Confidential FSBO Upgrade", price: data.prices.confidential || 100, checked: !!data.upgrades.confidential, disabled: false, note: "" });
    }

    if (data.payer === "seller") {
      var changeCommPrice = isFSBO ? (data.prices.changeCommissionFSBO || 50) : (data.prices.changeCommissionListed || 10);
      var isEnabled = isChangeCommissionEnabled();
      
      toggles.push({ 
        key: "changeCommission", 
        label: "Change Commission", 
        price: changeCommPrice, 
        checked: isEnabled ? !!data.upgrades.changeCommission : false,
        disabled: !isEnabled,
        note: isEnabled ? "(One-time commission change)" : "(Available after listing is created)"
      });
    }

    var html = "";
    for (var i = 0; i < toggles.length; i++) {
      var t = toggles[i];
      var disabledAttr = t.disabled ? "disabled" : "";
      var disabledClass = t.disabled ? "opacity-50 cursor-not-allowed" : "";
      var checkedAttr = t.checked ? "checked" : "";
      
      html += "<label class=\"flex items-center justify-between border rounded-lg px-3 py-2 bg-white " + disabledClass + "\">";
      html += "<div>";
      html += "<span class=\"font-medium\">" + t.label + "</span>";
      html += "<span class=\"text-gray-500\"> - $" + t.price + "</span>";
      if (t.note) {
        html += "<div class=\"text-[11px] text-gray-500\">" + t.note + "</div>";
      }
      html += "</div>";
      html += "<input type=\"checkbox\" class=\"h-4 w-4\" data-key=\"" + t.key + "\" " + checkedAttr + " " + disabledAttr + "/>";
      html += "</label>";
    }
    box.innerHTML = html;

    var checkboxes = box.querySelectorAll("input[type=\"checkbox\"]:not([disabled])");
    for (var j = 0; j < checkboxes.length; j++) {
      checkboxes[j].addEventListener("change", function(e) {
        var k = e.target.getAttribute("data-key");
        var checked = e.target.checked;
        data.upgrades = data.upgrades || {};
        
        // ✅ FIX: Handle Plus - allow unchecking
        if (k === "upgradeToPlus") {
          data.upgrades[k] = checked;
          if (checked) {
            data.plan = "Listed Property Plus";
            localStorage.setItem("selectedPlan", "Listed Property Plus");
          } else {
            // ✅ Uncheck Plus -> revert to Basic
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
          if (isChangeCommissionEnabled()) {
            data.upgrades.changeCommission = checked;
          }
        }
        data = recompute(data);
        localStorage.setItem("checkoutData", JSON.stringify(data));
        renderSummary();
        renderLastChance();
      });
    }
  }

  var backBtnEl = $("backBtn");
  if (backBtnEl) {
    backBtnEl.addEventListener("click", function() { window.location.href = "/upsell.html"; });
  }

  var payNowBtnEl = $("payNowBtn");
  if (payNowBtnEl) {
    payNowBtnEl.addEventListener("click", async function() {
      var btn = $("payNowBtn");
      btn.disabled = true;
      btn.textContent = "Creating checkout...";

      try {
        if (!stripe) throw new Error("Stripe not available on this page.");

        var listingId = (localStorage.getItem("lastListingId") || "").trim();
        
        var isCommissionChange = isChangeCommissionEnabled();
        var isUpgradeFromSellerDetail = !!(data.meta && data.meta.fromSellerDetail === true);
        
        var successSignature = window.location.origin + "/signature.html" + (listingId ? "?id=" + encodeURIComponent(listingId) + "&session_id={CHECKOUT_SESSION_ID}" : "?session_id={CHECKOUT_SESSION_ID}");
        var successSellerDetail = window.location.origin + "/seller-detail.html" + (listingId ? "?id=" + encodeURIComponent(listingId) + "&session_id={CHECKOUT_SESSION_ID}&upgraded=true" : "?session_id={CHECKOUT_SESSION_ID}&upgraded=true");
        var successAgent = window.location.origin + "/agent-detail.html" + (listingId ? "?id=" + encodeURIComponent(listingId) + "&session_id={CHECKOUT_SESSION_ID}" : "?session_id={CHECKOUT_SESSION_ID}");

        var successUrl;
        if (data.payer === "agent") {
          successUrl = successAgent;
        } else if (isCommissionChange) {
          successUrl = successSignature;
        } else if (isUpgradeFromSellerDetail) {
          successUrl = successSellerDetail;
        } else {
          successUrl = successSignature;
        }

        if ((data.total || 0) <= 0) {
          window.location.href = successUrl;
          return;
        }

        var promo   = isAgentNovemberPromoActive();
        var isFSBO  = isFSBOPlan(data.plan);
        var isPlus  = data.plan === "Listed Property Plus";
        var isBasic = data.plan === "Listed Property Basic";
        var isUpgradingToPlus = data.upgrades && data.upgrades.upgradeToPlus;

        var items = [];

        if (isFSBO && (data.base || 0) > 0) {
          items.push({ price: PRICE_IDS.FSBO_PLUS, quantity: 1 });
        } 
        else if ((isPlus || isUpgradingToPlus) && !promo && !isCommissionChange) {
          var shouldChargePlus = (data.base || 0) > 0 || isUpgradingToPlus;
          var isUpgradeFromSellerDetail = !!(data.meta && data.meta.fromSellerDetail === true);
          if (isUpgradeFromSellerDetail && !isUpgradingToPlus) {
            shouldChargePlus = false;
          }
          if (shouldChargePlus) items.push({ price: PRICE_IDS.PLUS, quantity: 1 });
        }

        var paidUpgrades = (data.meta && data.meta.paidUpgrades) || {};

        if (data.upgrades.banner && !paidUpgrades.banner && !promo) {
          items.push({ price: PRICE_IDS.BANNER, quantity: 1 });
        }
        if (data.upgrades.pin && !paidUpgrades.pin) {
          if (!promo) items.push({ price: PRICE_IDS.PIN, quantity: 1 });
        } else if (data.upgrades.premium && !paidUpgrades.premium && !paidUpgrades.pin) {
          if (!promo) items.push({ price: PRICE_IDS.PREMIUM, quantity: 1 });
        }
        if (isFSBO && data.upgrades.confidential) items.push({ price: PRICE_IDS.CONFIDENTIAL, quantity: 1 });

        if (data.upgrades.changeCommission && data.payer === "seller" && isCommissionChange) {
          var priceId = isFSBO ? PRICE_IDS.CHANGE_COMMISSION_FSBO : PRICE_IDS.CHANGE_COMMISSION_LISTED;
          items.push({ price: priceId, quantity: 1 });
        }

        if (!items.length && (data.total || 0) > 0) {
          items.push({ price: PRICE_IDS.PLUS, quantity: 1 });
        }

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

  if (!localStorage.getItem("originalPlan")) {
    localStorage.setItem("originalPlan", planLS);
  }

  renderSummary();
  renderLastChance();
});
