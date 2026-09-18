document.addEventListener("DOMContentLoaded", async () => {
  acRequireLogin();
  const farmer = acFarmer();
  const box = document.getElementById("groupContent");

  try {
    const lot = (await acHttp.get("/farmer/my-group")).data;
    if (!lot) {
      box.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i class="fa-solid fa-handshake-angle"></i></div>
          <h4>No Active Farmer Pool</h4>
          <p>When you book a harvest delivery, our AI clustering engine automatically pools your quantity with neighboring farmers within 15km to unlock broker-free bulk premium prices.</p>
          <button class="btn btn-primary" style="max-width:240px;margin:0 auto;" onclick="location.href='book.html'">
            <i class="fa-solid fa-calendar-plus"></i> Book a Slot to Join
          </button>
        </div>`;
      return;
    }

    const mine = lot.members?.find(m => (m.farmerId?._id || m.farmerId) === farmer?.id);
    const advantagePct = lot.soloPricePerQuintal
      ? Math.round(((lot.pricePerQuintal - lot.soloPricePerQuintal) / lot.soloPricePerQuintal) * 100)
      : 0;

    box.innerHTML = `
      <div class="card" style="border-left: 4px solid var(--gold-500);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <h3><i class="fa-solid fa-handshake" style="color:var(--gold-600);"></i> ${lot.cropType} Bulk Lot</h3>
            <div class="muted">Pooled with ${lot.members?.length || 0} neighboring farmers</div>
          </div>
          <span class="badge badge-gold">${lot.status.toUpperCase()}</span>
        </div>
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-subtle);display:flex;justify-content:space-between;">
          <span>Combined Lot Volume:</span>
          <b>${lot.totalQuantity} kg</b>
        </div>
      </div>

      <div class="card">
        <h3>Price Advantage</h3>
        <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0;">
          <div>
            <div class="muted" style="font-size:13px;">Solo Mandi Rate</div>
            <div style="font-size:20px;font-weight:800;color:var(--ink);">₹${lot.soloPricePerQuintal}/q</div>
          </div>
          <div style="font-size:20px;color:var(--green-700);"><i class="fa-solid fa-arrow-right" aria-label="to"></i></div>
          <div>
            <div class="muted" style="font-size:13px;">Bulk Pool Rate</div>
            <div style="font-size:22px;font-weight:800;color:var(--green-700);">₹${lot.pricePerQuintal}/q</div>
          </div>
        </div>
        <div class="badge badge-green" style="font-size:13px;">
          <i class="fa-solid fa-arrow-trend-up"></i> +${advantagePct}% better payout than individual sale
        </div>
      </div>

      ${mine ? `
      <div class="card" style="border: 2px solid var(--gold-500);background:var(--gold-50);">
        <h3><i class="fa-solid fa-coins" style="color:var(--gold-600);"></i> Your Share & Payout</h3>
        <div style="display:flex;justify-content:space-between;margin-top:8px;">
          <span>Your Contribution:</span>
          <b>${mine.quantity} kg (${Math.round(mine.share * 100)}%)</b>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:18px;">
          <span>Expected Payout:</span>
          <b style="color:var(--green-800);font-weight:800;">₹${mine.amount}</b>
        </div>
      </div>` : ""}

      <div class="card">
        <h3><i class="fa-solid fa-users"></i> Participating Farmers</h3>
        <div style="margin-top:8px;">
          ${lot.members?.map(m => `
            <div class="list-item" style="cursor:default;margin-bottom:8px;padding:12px 14px;">
              <div><b>${(m.farmerId && m.farmerId.name) || "Local Farmer"}</b></div>
              <div class="badge badge-green">${m.quantity} kg</div>
            </div>`).join("") || ""}
        </div>
      </div>
    `;
  } catch (e) {
    box.innerHTML = `<div class="error-box">${acErrorMsg(e)}</div>`;
  }
});
