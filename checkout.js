// /checkout.js — build 2025-08-24c (agent payment success → back to agent-detail; others unchanged)
document.addEventListener("DOMContentLoaded", () => {
  console.log("[checkout.js] build 2025-08-24c");

  const $ = (id) => document.getElementById(id);
  const getJSON = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };

  const STRIPE_PUBLISHABLE_KEY = "pk_test_51RiGoUPTiT2zuxx0T2Jk2YSvCjeHeQLb8KJnNs8gPwLtGq3AxqydjA4wcHknoee1GMB9zlKLG093DIAIE61KLqyw00hEmYRmhD";
  let stripe = null; try { stripe = Stripe(STRIPE_PUBLISHABLE_KEY); } catch {}

  const formData = getJSON("formData", {});
  const agentListing = getJSON("agentListing", {});
  const selectedPlanLS = (localStorage.getItem("selectedPlan") || "Listed Property Basic").trim();
  const originalPlanLS = (localStorage.getItem("originalPlan") || selectedPlanLS).trim();

  // Who line (unchanged)
  (function(){
    const addr = formData.address || "[Full Address]";
    const name = formData.name || "[Name]";
    const type = (agentListing?.commissionType || formData?.commissionType || "%");
    const raw  = (agentListing?.commission ?? formData?.commission ?? "");
    const comm = raw ? (type === "$" ? "$" + Math.round(Number(raw)).toLocaleString() : `${raw}%`) : "[commission]";
    if (selectedPlanLS.includes("FSBO")) {
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

  // checkoutData normalize (unchanged baseline)
  let data = getJSON("checkoutData", null);
  if (!data) {
    data = {
      plan: selectedPlanLS,
      base: selectedPlanLS.includes("FSBO") ? 100 : (selectedPlanLS === "Listed Property Plus" ? 20 : 0),
      upgrades: { upgradeToPlus:false, downgradeToBasic:false, banner:false, premium:false, pin:false, confidential:false },
      prices:  { plus:20, banner:10, premium:10, pin:50, fsbo:100, confidential:100 },
      meta: {},
      total: 0,
      payer: "seller"
    };
  } else {
    data.plan = selectedPlanLS;
    data.upgrades = Object.assign({ upgradeToPlus:false, downgradeToBasic:false, banner:false, premium:false, pin:false, confidential:false }, data.upgrades||{});
    data.prices  = Object.assign({ plus:20, banner:10, premium:10, pin:50, fsbo:100, confidential:100 }, data.prices||{});
    if (typeof data.base !== "number") data.base = selectedPlanLS.includes("FSBO") ? data.prices.fsbo : (selectedPlanLS === "Listed Property Plus" ? data.prices.plus : 0);
    if (!data.payer) data.payer = "seller";
  }

  // Recompute + render (same as your working build)
  function recompute(d){
    const IS_FSBO = d.plan === "FSBO Plus" || selectedPlanLS.includes("FSBO");
    const IS_PLUS = d.plan === "Listed Property Plus";
    const IS_BASIC= d.plan === "Listed Property Basic";

    if (IS_FSBO) {
      d.plan = "FSBO Plus"; d.base = d.prices.fsbo;
      d.upgrades.upgradeToPlus = false; d.upgrades.downgradeToBasic = false;
    } else if (IS_PLUS) {
      if (d.upgrades.downgradeToBasic) { d.plan = "Listed Property Basic"; d.base = 0; localStorage.setItem("selectedPlan","Listed Property Basic"); }
      else { d.plan = "Listed Property Plus"; d.base = d.prices.plus; localStorage.setItem("selectedPlan","Listed Property Plus"); }
      d.upgrades.upgradeToPlus = false;
    } else {
      if (d.upgrades.upgradeToPlus) { d.plan = "Listed Property Plus"; d.base = d.prices.plus; localStorage.setItem("selectedPlan","Listed Property Plus"); }
      else { d.plan = "Listed Property Basic"; d.base = 0; localStorage.setItem("selectedPlan","Listed Property Basic"); }
      d.upgrades.downgradeToBasic = false;
    }

    let total = d.base;
    if (d.upgrades.banner)  total += d.prices.banner;
    if (d.upgrades.pin)     total += d.prices.pin;
    else if (d.upgrades.premium) total += d.prices.premium;

    if (d.plan === "FSBO Plus") { if (d.upgrades.confidential) total += d.prices.confidential; }
    else { d.upgrades.confidential = false; }

    d.total = total;
    return d;
  }
  data = recompute(data);
  localStorage.setItem("checkoutData", JSON.stringify(data));

  function renderSummary(){
    $("planName").textContent  = data.plan;
    $("basePrice").textContent = (data.base || 0);
    $("totalAmount").textContent= (data.total || 0);

    const sel=[];
    if (originalPlanLS === "Listed Property Basic" && data.upgrades.upgradeToPlus) sel.push(`Upgrade to Listed Property Plus ($${data.prices.plus})`);
    if (originalPlanLS === "Listed Property Plus"  && data.upgrades.downgradeToBasic) sel.push(`Downgrade to Listed Property Basic (FREE)`);
    if (data.upgrades.banner)  sel.push(`Banner ($${data.prices.banner})`);
    if (data.upgrades.pin)     sel.push(`Pin Placement ($${data.prices.pin})`);
    else if (data.upgrades.premium) sel.push(`Premium Placement ($${data.prices.premium})`);
    if (data.plan === "FSBO Plus" && data.upgrades.confidential) sel.push(`Confidential FSBO Upgrade ($${data.prices.confidential})`);

    $("selectedList").innerHTML = sel.length ? sel.map(s=>`<li>${s}</li>`).join("") : `<li class="text-gray-400">None</li>`;
    if ((data.total||0)<=0){ $("goSignatureZero").classList.remove("hidden"); $("payNowBtn").classList.add("hidden"); }
    else{ $("goSignatureZero").classList.add("hidden"); $("payNowBtn").classList.remove("hidden"); }
  }

  function renderLastChance(){
    const box = $("upsellChoices"); box.innerHTML = "";
    const IS_FSBO = data.plan === "FSBO Plus";
    const IS_PLUS = data.plan === "Listed Property Plus";
    const IS_BASIC= data.plan === "Listed Property Basic";
    const toggles = [];

    if (!IS_FSBO) {
      if (IS_PLUS) toggles.push({ key:"downgradeToBasic", label:"Downgrade to Listed Property Basic — FREE", price:0, checked: !!data.upgrades.downgradeToBasic });
      if (IS_BASIC) toggles.push({ key:"upgradeToPlus", label:"Upgrade to Listed Property Plus", price:data.prices.plus, checked: !!data.upgrades.upgradeToPlus });
    }
    toggles.push({ key:"banner",  label:"Banner",  price:data.prices.banner,  checked: !!data.upgrades.banner });
    toggles.push({ key:"premium", label:"Premium Placement", price:data.prices.premium, checked: !!data.upgrades.premium });
    toggles.push({ key:"pin",     label:"Pin Placement", price:data.prices.pin, checked: !!data.upgrades.pin, note:"(includes Premium free)" });
    if (IS_FSBO) toggles.push({ key:"confidential", label:"Confidential FSBO Upgrade", price:data.prices.confidential, checked: !!data.upgrades.confidential });

    box.innerHTML = toggles.map(t=>`
      <label class="flex items-center justify-between border rounded-lg px-3 py-2 bg-white">
        <div>
          <span class="font-medium">${t.label}</span>
          ${t.price?`<span class="text-gray-500"> — $${t.price}</span>`:""}
          ${t.note?`<div class="text-[11px] text-gray-500">${t.note}</div>`:""}
        </div>
        <input type="checkbox" class="h-4 w-4" data-key="${t.key}" ${t.checked?'checked':''}/>
      </label>
    `).join("");

    box.querySelectorAll('input[type="checkbox"]').forEach(cb=>{
      cb.addEventListener("change",(e)=>{
        const k=e.target.getAttribute("data-key"), checked=e.target.checked;
        if (k==="upgradeToPlus") data.upgrades.upgradeToPlus=checked;
        else if (k==="downgradeToBasic") data.upgrades.downgradeToBasic=checked;
        else if (k==="banner") data.upgrades.banner=checked;
        else if (k==="premium") data.upgrades.premium=checked;
        else if (k==="pin"){ data.upgrades.pin=checked; if(checked) data.upgrades.premium=true; }
        else if (k==="confidential") data.upgrades.confidential = (data.plan === "FSBO Plus") ? checked : false;

        data = recompute(data);
        localStorage.setItem("checkoutData", JSON.stringify(data));
        renderSummary(); renderLastChance();
      });
    });
  }

  $("backBtn")?.addEventListener("click", () => history.back());

  $("payNowBtn")?.addEventListener("click", async () => {
    const btn=$("payNowBtn"); btn.disabled=true; btn.textContent="Creating checkout…";
    try{
      if (!stripe) throw new Error("Stripe not available on this page.");
      if ((data.total||0)<=0){ 
        // no payment due → route like a success
        const go = (data.payer === "agent") ? (location.origin + "/agent-detail.html") : (location.origin + "/signature.html");
        window.location.href = go; 
        return; 
      }

      const PRICE_IDS={ PLUS:"price_1RsQFlPTiT2zuxx0414nGtTu", FSBO_PLUS:"price_1RsQJbPTiT2zuxx0w3GUIdxJ",
                        BANNER:"price_1RsQTOPTiT2zuxx0TLCwAthR", PREMIUM:"price_1RsQbjPTiT2zuxx0hA6p5H4h",
                        PIN:"price_1RsQknPTiT2zuxx0Av9skJyW", CONFIDENTIAL:"price_1RsRP4PTiT2zuxx0eoOGEDvm" };

      const items=[];
      const isFSBOPlan = data.plan==="FSBO Plus", isPlusPlan=data.plan==="Listed Property Plus", isBasicPlan=data.plan==="Listed Property Basic";
      if (isFSBOPlan && (data.base??data.prices.fsbo)>0) items.push({price:PRICE_IDS.FSBO_PLUS, quantity:1});
      else if (isPlusPlan && (data.base??data.prices.plus)>0) items.push({price:PRICE_IDS.PLUS, quantity:1});
      else if (isBasicPlan && data.upgrades.upgradeToPlus) items.push({price:PRICE_IDS.PLUS, quantity:1});
      if (data.upgrades.banner)  items.push({price:PRICE_IDS.BANNER,  quantity:1});
      if (data.upgrades.pin)     items.push({price:PRICE_IDS.PIN,     quantity:1});
      else if (data.upgrades.premium) items.push({price:PRICE_IDS.PREMIUM, quantity:1});
      if (isFSBOPlan && data.upgrades.confidential) items.push({price:PRICE_IDS.CONFIDENTIAL, quantity:1});
      if (!items.length) throw new Error("No purchasable line items.");

      // >>> Only change here: successUrl depends on payer
      const successUrl = (data.payer === "agent")
        ? (location.origin + "/agent-detail.html")
        : (location.origin + "/signature.html");

      const payload = { lineItems: items, successUrl, cancelUrl: location.origin + "/checkout.html" };

      const resp = await fetch("/api/create-checkout-session", {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)
      });

      const out = await resp.json().catch(()=>({error:"Server response parse error"}));
      if (!resp.ok) throw new Error(out.error||"Server failed to create session.");
      if (out.url){ location.href=out.url; return; }
      if (out.id){ const {error}=await stripe.redirectToCheckout({sessionId:out.id}); if (error) throw new Error(error.message||"Stripe redirect failed."); return; }
      throw new Error("Server returned neither url nor id.");
    }catch(err){ console.error("[checkout] payment error:",err); alert(err.message||"Payment could not start."); }
    finally{ btn.disabled=false; btn.textContent="Pay Now with Stripe"; }
  });

  renderSummary(); renderLastChance();
});
