<!-- /scripts/isc-pdf.js — build 2025-08-14a -->
<script>
/* global jspdf */
(function () {
  const BUILD = "isc-pdf 2025-08-14a";

  // Safe JSON
  function getJSON(key, fb) { try { return JSON.parse(localStorage.getItem(key)) ?? fb; } catch { return fb; } }

  // Compose the two ISC paragraphs directly from localStorage (keeps wording in sync across pages)
  function buildIscCopy() {
    const plan = (localStorage.getItem("selectedPlan") || "Listed Property Basic").trim();
    const fd   = getJSON("formData", {});
    const signed = getJSON("signedISC", {});

    const isFSBO   = plan === "FSBO Plus";
    const fullAddr = (fd.address || "").trim() || "[full address]";
    const short    = fullAddr.split(",")[0] || "[short address]";
    const apn      = (fd.apn || "").trim();
    const apnMode  = (fd.apnMode || "").trim(); // "agent" hides APN on listed flows
    const name     = (fd.name || signed.name || "[name]");
    const phone    = fd.agentPhone || (isFSBO ? "[owner/seller phone]" : "[agent phone]");
    const email    = fd.brokerage  || "[owner/seller email]"; // reused field for FSBO email in Box 2

    const cType = fd.commissionType || "%";
    const cVal  = (fd.commission || "").trim();
    const commDisplay = cType === "$"
      ? (cVal ? ("$" + Number(cVal).toLocaleString()) : "[commission]")
      : (cVal ? (cVal + "%") : "[commission]");
    const commSuffix  = (cType === "%") ? " of the total purchase price" : "";

    let p1 = "", p2 = "";
    if (isFSBO) {
      p1 = `I, ${name}, am the owner/seller of ${fullAddr}${apn ? `, # ${apn}` : ""}. ${short} is listed for sale by owner (Me). My phone number is ${phone}. My email address is ${email}.`;
      p2 = `Let it be known: if a buyer’s agent/broker facilitates the sale of ${short}, you (the escrow holder/closing agent) are irrevocably instructed to credit/compensate the buyer’s broker a commission not to exceed ${commDisplay}${commDisplay ? commSuffix : ""}.`;
    } else {
      const showParcel = !!apn && apnMode !== "agent";
      const brokerage  = fd.brokerage || "[listing brokerage]";
      const agent      = fd.agent || "[listing agent]";
      p1 = `I, ${name}, am the owner/seller of ${fullAddr}${showParcel ? `, # ${apn}` : ""}. ${short} is listed for sale by ${brokerage}, ${agent}, listing agent, ${phone}.`;
      p2 = `Let it be known: if a buyer’s agent/broker facilitates the sale of ${short}, you (the escrow holder/closing agent) are irrevocably instructed to credit/compensate the buyer’s broker – first, by debiting the listing brokerage (if there is an agreement for broker-to-broker compensation) and second by debiting me, the seller – a commission not to exceed ${commDisplay}${commDisplay ? commSuffix : ""}.`;
    }

    const sigName = signed.name || name || "";
    const sigDate = signed.date || new Date().toISOString().slice(0,10);

    return { isFSBO, p1, p2, sigName, sigDate, short, fullAddr };
  }

  function exportPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("PDF engine not loaded. Make sure jsPDF is included on this page.");
      return;
    }
    const { jsPDF } = window.jspdf;

    const { p1, p2, sigName, sigDate, short } = buildIscCopy();

    const doc = new jsPDF({ unit: "pt", format: "letter" }); // 612 x 792
    const marginL = 54, marginR = 54;
    const pageW = doc.internal.pageSize.getWidth();
    let y = 64;

    function line(txt, leading=16) {
      const maxW = pageW - marginL - marginR;
      const lines = doc.splitTextToSize(txt, maxW);
      lines.forEach(ln => { doc.text(ln, marginL, y); y += leading; });
    }
    function gap(px=10){ y += px; }

    // Title + subtitle
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Irrevocable Seller Communication", pageW/2, y, { align: "center" });
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("For escrow/closing agent use.", pageW/2, y, { align: "center" });
    y += 14;

    // Body
    gap(8);
    doc.setFont("helvetica","normal");
    doc.setFontSize(11);
    line("To the escrow holder/closing agent,");
    gap(8);
    line(p1);
    gap(6);
    line(p2);

    // Signature row
    gap(18);
    doc.setFont("helvetica","normal"); doc.setFontSize(12);
    doc.text(sigName || "[Name]", marginL, y);
    doc.setFontSize(9); doc.text("Electronic Signature", marginL, y + 12);
    doc.setFontSize(11); doc.text(sigDate, pageW - marginR, y, { align: "right" }); y += 24;

    // Footer (no counters / no printed timestamp)
    const footerY = 792 - 40;
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text("GuaranteedCommission.com · Document for escrow/closing agent", marginL, footerY);

    const safeShort = (short || "listing").trim().replace(/\s+/g,"_");
    const fname = `ISC_${safeShort}_${sigDate}.pdf`;
    doc.save(fname);
  }

  // Public API
  window.gcIscPdf = {
    build: buildIscCopy,
    export: exportPDF,
    _buildId: BUILD
  };

  // Auto-wire any element with [data-isc-pdf] to export
  function autoWire() {
    document.querySelectorAll("[data-isc-pdf]").forEach(el => {
      if (el.__gc_wired) return;
      el.__gc_wired = true;
      el.addEventListener("click", (e) => {
        e.preventDefault();
        exportPDF();
      });
    });
  }
  document.addEventListener("DOMContentLoaded", autoWire);
})();
</script>
