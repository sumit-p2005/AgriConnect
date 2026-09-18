document.addEventListener("DOMContentLoaded", async () => {
  acRequireLogin();
  const farmer = acFarmer();
  const box = document.getElementById("groupContent");
  try {
    const lot = (await acHttp.get("/farmer/my-group")).data;
    if (!lot) {
      box.innerHTML = `<div class="card muted center-text">${t("no_group_yet")}</div>`;
      return;
    }
    const mine = lot.members.find(m => (m.farmerId._id || m.farmerId) === farmer.id);
    const advantagePct = lot.soloPricePerQuintal
      ? Math.round(((lot.pricePerQuintal - lot.soloPricePerQuintal) / lot.soloPricePerQuintal) * 100)
      : 0;

    box.innerHTML = `
      <div class="card">
        <h3>🤝 ${lot.cropType} ${t("my_group")}</h3>
        <div class="badge badge-gold">${lot.status.toUpperCase()}</div>
        <div style="margin-top:10px">${t("combined_qty")}: <b>${lot.totalQuantity}kg</b></div>
        <div>${t("group_members")}: <b>${lot.members.length}</b></div>
      </div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;">
          <div>
            <div class="muted">${t("solo_price")}</div>
            <div style="font-size:20px;font-weight:800">Rs.${lot.soloPricePerQuintal}</div>
          </div>
          <div style="font-size:28px;align-self:center">➡️</div>
          <div>
            <div class="muted">${t("group_price")}</div>
            <div style="font-size:20px;font-weight:800;color:var(--green-700)">Rs.${lot.pricePerQuintal}</div>
          </div>
        </div>
        <div class="badge badge-green" style="margin-top:10px">+${advantagePct}% better than solo</div>
      </div>
      ${mine ? `
      <div class="card" style="border:2px solid var(--gold-500)">
        <h3>${t("your_share")}</h3>
        <div>${mine.quantity}kg (${Math.round(mine.share * 100)}%)</div>
        <div style="font-size:22px;font-weight:800;color:var(--green-700)">Rs.${mine.amount}</div>
      </div>` : ""}
      <div class="card">
        <h3>${t("group_members")}</h3>
        ${lot.members.map(m => `
          <div class="list-item" style="cursor:default">
            <div>${(m.farmerId && m.farmerId.name) || "Farmer"}</div>
            <div class="muted">${m.quantity}kg</div>
          </div>`).join("")}
      </div>
    `;
  } catch (e) {
    box.innerHTML = `<div class="error-box">${acErrorMsg(e)}</div>`;
  }
});
