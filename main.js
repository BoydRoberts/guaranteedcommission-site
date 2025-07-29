// Phone formatter
document.addEventListener("input", function (e) {
  if (e.target.id === "agentPhone" || e.target.id === "sellerPhone") {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length >= 4 && val.length <= 6) {
      val = val.replace(/(\d{3})(\d+)/, '$1-$2');
    } else if (val.length > 6) {
      val = val.replace(/(\d{3})(\d{3})(\d+)/, '$1-$2-$3');
    }
    e.target.value = val;
  }
});

// Form switcher
function showForm(type) {
  const title = document.querySelector("#formBlock h2");
  if (type === "fsbo") {
    title.textContent = "FSBO Communication Form";
  } else {
    title.textContent = "Listed Property Communication Form";
  }
}

// Investor button modal
document.getElementById("investorBtn").addEventListener("click", function () {
  alert("Accredited Investor Verification Form would open here.");
});
