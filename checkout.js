// checkout.js — build 2025-08-14t (server session, no (~$) approximation)
document.addEventListener("DOMContentLoaded", () => {
  console.log("[checkout.js] build 2025-08-14t");

  const $ = (id) => document.getElementById(id);
  const getJSON = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };

  const PUBLISHABLE_KEY = "pk_test_51RiGoUPTiT2zuxx0T2Jk2YSvCjeHeQLb8KJnNs8gPwLtGq3AxqydjA4wcHknoee1GMB9zlKLG093DIAIE61KLqyw00hEmYRmhD";
  let stripe = null;
  try { stripe = Stripe(PUBLISHABLE_KEY); } catch (e) { console.error("Stripe init error:", e); }

  const formData = getJSON("formData", {});
  const planLS = (localStorage.getItem("selectedPlan") || "Listed Property Basic").trim();
  const agentListing = getJSON("agentListing", {});

  const commissionDisplay = () => {
    const type = (agentListing?.commissionType || formData?.commissionType || "%");
    const raw  = (agentListing?.commission ?? formData?.commission ?? "");
    const n = Number(raw);
    if (!raw) return "[commission]";
    return type === "$" ? "$" + Math.round(n).toLocaleString() : `${raw}%`;
  };

  (function whoRow(){
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

  let data = getJSON("checkoutData", null);
  if (!data) {
    const plan = planLS;
    data = {
      plan,
      base: plan === "FSBO Plus" ? 100 : (plan === "Listed Property Plus" ? 20 : 0),
      upgrades: { upgradeToPlus:false, banner:false, premium:false, pin:false, confidential:false },
      prices:  { plus:20, banner:10, premium:10, pin:50, fsbo:100, confidential:100 },
      meta: {},
      total: 0
    };
  }

  function recompute(d){
    let plan=d.plan, base=d.base;
    if (plan === "Listed Property Basic" && d.upgrades.upgradeToPlus) {
      plan="Listed Property Plus"; base=d.prices.plus; localStorage.setItem("selectedPlan","Listed Property Plus");
    }
    let total=base;
    if (d.upgrades.banner) total+=d.prices.banner;
    if (d.upgrades.pin) total+=d.prices.pin;
    else if (d.upgrades.premium) total+=d.prices.premium;
    if (d.upgrades.confidential) total+=d.prices.confidential;
    d.plan=plan; d.base=base; d.total=total; return d;
  }
  data = recompute(data);

  function renderSummary(){
    $("planName").textContent = data.plan;
    $("basePrice").textContent = (data.base || 0);
    $("totalAmount").textContent = (data.total || 0);
    const sel=[];
    if (data.upgrades.upgradeToPlus) sel.push(`Upgrade to Listed Property Plus ($${data.prices.plus})`);
    if (data.upgrades.banner) sel.push(`Banner ($${data.prices.banner})`);
    if (data.upgrades.pin) sel.push(`Pin Placement ($${data.prices.pin})`);
    else if (data.upgrades.premium) sel.push(`Premium Placement ($${data.prices.premium})`);
    if (data.upgrades.confidential) sel.push(`Confidential FSBO Upgrade ($${data.prices.confidential})`);
    $("selectedList").innerHTML = sel.length ? sel.map(s=>`<li>${s}</li>`).join("") : `<li class="text-gray-400">None</li>`;
    if ((data.total || 0) <= 0) { $("goSignatureZero").classList.remove("hidden"); $("payNowBtn").classList.add("hidden"); }
    else { $("goSignatureZero").classList.add("hidden"); $("payNowBtn").classList.remove("hidden"); }
  }

  function renderLastChance(){
    const box=$("upsellChoices"); box.innerHTML="";
    const isBasic=data.plan==="Listed Property Basic"; const isFSBO=data.plan==="FSBO Plus";
    const toggles=[];
    if (isBasic) toggles.push({key:"upgradeToPlus",label:"Upgrade to Listed Property Plus",price:data.prices.plus,checked:data.upgrades.upgradeToPlus});
    toggles.push({key:"banner",label:"Banner",price:data.prices.banner,checked:data.upgrades.banner});
    toggles.push({key:"premium",label:"Premium Placement",price:data.prices.premium,checked:data.upgrades.premium&&!data.upgrades.pin});
    toggles.push({key:"pin",label:"Pin Placement",price:data.prices.pin,checked:data.upgrades.pin,note:"(includes Premium free)"});
    if (isFSBO) toggles.push({key:"confidential",label:"Confidential FSBO Upgrade",price:data.prices.confidential,checked:data.upgrades.confidential});
    box.innerHTML=toggles.map(t=>`
      <label class="flex items-center justify-between border rounded-lg px-3 py-2 bg-white">
        <div>
          <span class="font-medium">${t.label}</span>
          <span class="text-gray-500"> — $${t.price}</span>
          ${t.note?`<div class="text-[11px] text-gray-500">${t.note}</div>`:``}
        </div>
        <input type="checkbox" class="h-4 w-4" data-key="${t.key}" ${t.checked?'checked':''}/>
      </label>
    `).join("");
    box.querySelectorAll('input[type="checkbox"]').forEach(cb=>{
      cb.addEventListener("change",(e)=>{
        const k=e.target.getAttribute("data-key"); const checked=e.target.checked;
        if(k==="upgradeToPlus"){ data.upgrades.upgradeToPlus=checked; if(checked){ data.plan="Listed Property Plus"; data.base=data.prices.plus; localStorage.setItem("selectedPlan","Listed Property Plus"); } else { const originallyBasic=(localStorage.getItem("originalPlan")||"Listed Property Basic"); if(originallyBasic==="Listed Property Basic"){ data.plan="Listed Property Basic"; data.base=0; localStorage.setItem("selectedPlan","Listed Property Basic"); } } }
        else if(k==="banner") data.upgrades.banner=checked;
        else if(k==="premium") data.upgrades.premium=checked&&!data.upgrades.pin;
        else if(k==="pin"){ data.upgrades.pin=checked; if(checked) data.upgrades.premium=true; }
        else if(k==="confidential") data.upgrades.confidential=checked;
        data=recompute(data); renderSummary(); renderLastChance();
      });
    });
  }

  $("backBtn").addEventListener("click", ()=>{ window.location.href="/upsell.html"; });

  $("payNowBtn").addEventListener("click", async ()=>{
    const btn=$("payNowBtn"); btn.disabled=true; btn.textContent="Creating checkout…";
    try{
      if(!stripe) throw new Error("Stripe not available on this page.");
      if((data.total||0)<=0){ window.location.href="/signature.html"; return; }
      const resp = await fetch("/api/create-checkout-session", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ plan:data.plan, upgrades:data.upgrades }) });
      const ct=resp.headers.get('content-type')||''; const out=ct.includes('application/json')?await resp.json():{error:"Non-JSON response"};
      if(!resp.ok) throw new Error(out.error||"Server failed to create session.");
      if(!out.id) throw new Error("No session id returned.");
      const { error } = await stripe.redirectToCheckout({ sessionId: out.id });
      if (error) throw new Error(error.message||"Stripe redirect failed.");
    }catch(err){ console.error("[checkout] payment error:",err); alert(err.message||"Payment could not start."); }
    finally{ btn.disabled=false; btn.textContent="Pay Now with Stripe"; }
  });

  if (!localStorage.getItem("originalPlan")) {
    localStorage.setItem("originalPlan", planLS);
  }
  renderSummary();
  renderLastChance();
  const diag=$("diag"); if(diag){ diag.textContent = JSON.stringify({ plan:data.plan, total:data.total, upgrades:data.upgrades, prices:data.prices, endpoint:"/api/create-checkout-session" }, null, 2); }
});
