document.addEventListener("DOMContentLoaded", async () => {
  adRequireLogin();
  document.getElementById("shell").innerHTML = `
    ${adSidebar("bulklots.html")}
    <div class="main">
      <div class="pagehead">
        <div><h1>Bulk Lots</h1><div class="sub">Farmer Link — nearby farmers auto-grouped for broker-free bulk pricing</div></div>
      </div>
      <div class="panel">
        <div class="panel-head">
          Run clustering
          <span class="sub" style="font-weight:400">groups farmers within 15km with harvest dates within 3 days, min. group size 3</span>
        </div>
        <div class="filters" style="padding:12px 16px">
          <input type="text" id="clusterCrop" placeholder="Crop type e.g. Tomato">
          <button class="btn btn-primary" onclick="runCluster()"><i class="fa-solid fa-handshake" aria-label="recluster"></i> Recluster now</button>
          <span id="clusterResult" class="mono" style="align-self:center"></span>
        </div>
      </div>
      <div id="lotsContainer"></div>
    </div>
  `;
  await loadLots();
});

async function runCluster() {
  const cropType = document.getElementById("clusterCrop").value.trim();
  if (!cropType) return;
  try {
    const res = (await adHttp.post("/admin/bulk-lots/cluster", { cropType })).data;
    document.getElementById("clusterResult").textContent = `${res.groupsFormed} new group(s) formed`;
    loadLots();
  } catch (e) { alert(adErr(e)); }
}

async function loadLots() {
  const lots = (await adHttp.get("/admin/bulk-lots")).data;
  const box = document.getElementById("lotsContainer");
  if (!lots.length) {
    box.innerHTML = `<div class="panel"><div style="padding:20px;text-align:center;color:var(--slate-500)">No bulk lots yet. Run clustering for a crop above.</div></div>`;
    return;
  }
  box.innerHTML = lots.map(lot => {
    const advantagePct = lot.soloPricePerQuintal
      ? Math.round(((lot.pricePerQuintal - lot.soloPricePerQuintal) / lot.soloPricePerQuintal) * 100) : 0;
    return `
    <div class="panel">
      <div class="panel-head">
        ${lot.cropType} lot · ${lot.members.length} farmers · ${lot.totalQuantity}kg
        <span>
          <span class="badge ${lot.status === "paid" ? "badge-green" : lot.status === "sold" ? "badge-blue" : "badge-amber"}">${lot.status}</span>
          ${lot.status !== "paid" ? `<button class="btn btn-xs btn-green" onclick="settleLot('${lot._id}')">Settle Payment</button>` : ""}
        </span>
      </div>
      <div style="padding:12px 16px" class="mono">
        Solo price: Rs.${lot.soloPricePerQuintal}/quintal &nbsp;→&nbsp; Group price: Rs.${lot.pricePerQuintal}/quintal
        <span class="badge badge-green">+${advantagePct}%</span> &nbsp; Total value: Rs.${lot.totalValue}
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>Farmer</th><th>Village</th><th>Qty</th><th>Share</th><th>Payout</th></tr></thead>
          <tbody>
            ${lot.members.map(m => `
              <tr>
                <td>${m.farmerId?.name || "-"}</td>
                <td>${m.farmerId?.village || "-"}</td>
                <td>${m.quantity}kg</td>
                <td>${Math.round(m.share * 100)}%</td>
                <td class="mono">Rs.${m.amount}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
  }).join("");
}

async function settleLot(id) {
  if (!confirm("Settle payment and mark this lot as paid?")) return;
  await adHttp.post(`/admin/bulk-lots/${id}/settle`);
  loadLots();
}
