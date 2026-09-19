document.addEventListener("DOMContentLoaded", async () => {
  acRequireLogin();
  await loadFarmerGroupView();
});

async function loadFarmerGroupView() {
  const farmer = acFarmer();
  const box = document.getElementById("groupContent");
  if (!box) return;

  box.innerHTML = `
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
  `;

  try {
    const lotRes = await acHttp.get("/farmer/my-group");
    const lot = lotRes.data;

    if (lot && lot.members && lot.members.length > 0) {
      renderActiveLotView(lot, farmer, box);
      return;
    }

    // If no active pool, check opportunities and bookings
    const oppRes = await acHttp.get("/farmer/my-group/opportunities");
    const opportunities = oppRes.data || [];
    renderUnpooledView(opportunities, farmer, box);

  } catch (e) {
    box.innerHTML = `
      <div class="error-box">
        <i class="fa-solid fa-triangle-exclamation"></i> ${acErrorMsg(e)}
      </div>
      <button class="btn btn-outline" onclick="loadFarmerGroupView()" style="margin-top:12px;">
        <i class="fa-solid fa-rotate"></i> Try Again
      </button>
    `;
  }
}

function renderActiveLotView(lot, farmer, box) {
  const mine = lot.members?.find(m => {
    const fId = m.farmerId?._id || m.farmerId?.id || m.farmerId;
    return String(fId) === String(farmer?.id || farmer?._id);
  });

  const soloRate = lot.soloPricePerQuintal || 2200;
  const poolRate = lot.pricePerQuintal || +(soloRate * 1.08).toFixed(2);
  const diffPerQ = +(poolRate - soloRate).toFixed(2);
  const myExtraEarning = mine ? Math.round((mine.quantity / 100) * diffPerQ) : 0;

  // Capacity progress (target 2000kg mini-truck load)
  const targetCapacity = Math.max(2000, lot.totalQuantity);
  const fillPct = Math.min(100, Math.round((lot.totalQuantity / targetCapacity) * 100));

  box.innerHTML = `
    <!-- Active Pool Banner -->
    <div class="card" style="border-left: 5px solid var(--gold-500);background:linear-gradient(180deg, #FFFFFF 0%, #FFFDF7 100%);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <span class="badge badge-gold" style="margin-bottom:6px;">
            <i class="fa-solid fa-circle-nodes"></i> ACTIVE BULK LOT
          </span>
          <h3 style="margin:2px 0 4px;font-size:20px;">${lot.cropType} Collective Pool</h3>
          <div class="muted" style="font-size:13.5px;">
            <i class="fa-solid fa-location-dot" style="color:var(--green-700);"></i> Pooled with ${lot.members.length} neighboring farmers
          </div>
        </div>
        <span class="badge badge-green" style="font-size:13px;text-transform:uppercase;">
          <i class="fa-solid fa-check"></i> ${lot.status}
        </span>
      </div>

      <div style="margin-top:16px;background:var(--paper);padding:14px;border-radius:12px;border:1px solid var(--border-subtle);">
        <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px;">
          <span><b>Combined Bulk Volume:</b></span>
          <span style="font-weight:800;color:var(--green-800);font-size:16px;">${lot.totalQuantity.toLocaleString()} kg</span>
        </div>
        <div class="spots-bar" style="height:10px;">
          <div class="spots-bar-fill" style="width:${fillPct}%;background:linear-gradient(90deg, var(--gold-500), var(--green-600));"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--ink-soft);margin-top:4px;">
          <span>${lot.totalQuantity} kg pooled</span>
          <span>Target ~${targetCapacity} kg mini-truckload</span>
        </div>
      </div>
    </div>

    <!-- Pricing Comparison & Premium Benefit -->
    <div class="card">
      <h3 style="margin-bottom:12px;"><i class="fa-solid fa-chart-line" style="color:var(--green-700);"></i> Guaranteed Price Advantage</h3>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;background:var(--green-50);padding:14px;border-radius:12px;border:1px solid var(--green-100);">
        <div style="text-align:center;">
          <div class="muted" style="font-size:12px;text-transform:uppercase;font-weight:700;">Solo Mandi Rate</div>
          <div style="font-size:18px;font-weight:700;color:var(--ink-soft);margin-top:2px;">₹${soloRate}/q</div>
        </div>
        <div style="font-size:18px;color:var(--green-600);"><i class="fa-solid fa-arrow-right"></i></div>
        <div style="text-align:center;">
          <div style="font-size:12px;text-transform:uppercase;font-weight:700;color:var(--green-800);">Bulk Pool Rate</div>
          <div style="font-size:22px;font-weight:800;color:var(--green-700);margin-top:2px;">₹${poolRate}/q</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13.5px;color:var(--green-800);font-weight:600;">
        <i class="fa-solid fa-circle-arrow-up" style="color:var(--green-600);"></i>
        <span>+₹${diffPerQ}/quintal (+8%) direct broker-free premium</span>
      </div>
    </div>

    <!-- Farmer Personal Share & Payout Card -->
    ${mine ? `
    <div class="card" style="border: 2px solid var(--gold-500);background:linear-gradient(180deg, var(--gold-50) 0%, #FFFFFF 100%);">
      <h3 style="color:var(--gold-600);"><i class="fa-solid fa-coins"></i> Your Contribution & Payout</h3>
      <div style="display:flex;justify-content:space-between;margin-top:10px;font-size:14.5px;">
        <span class="muted">Your harvest weight:</span>
        <b>${mine.quantity} kg (${Math.round((mine.share || (mine.quantity/lot.totalQuantity)) * 100)}% of pool)</b>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:14.5px;">
        <span class="muted">Extra bonus earned:</span>
        <b style="color:var(--green-700);">+₹${myExtraEarning.toLocaleString()}</b>
      </div>
      <hr style="border:0;border-top:1px dashed var(--gold-400);margin:12px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-weight:700;font-size:15px;">Total Expected Payout:</span>
        <span style="font-size:24px;font-weight:800;color:var(--green-800);">₹${(mine.amount || 0).toLocaleString()}</span>
      </div>
    </div>` : ""}

    <!-- Participating Farmers List -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="margin:0;"><i class="fa-solid fa-users" style="color:var(--green-700);"></i> Participating Farmers (${lot.members.length})</h3>
        <span class="badge badge-green"><i class="fa-solid fa-shield-halved"></i> Verified</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${lot.members.map((m, idx) => {
          const fObj = m.farmerId || {};
          const isMe = String(fObj._id || fObj.id || m.farmerId) === String(farmer?.id || farmer?._id);
          return `
            <div class="list-item" style="cursor:default;margin-bottom:0;padding:12px 14px;background:${isMe ? 'var(--green-50)' : 'var(--white)'};border-color:${isMe ? 'var(--green-500)' : 'var(--border-subtle)'};">
              <div>
                <div style="font-weight:700;font-size:14.5px;">
                  ${fObj.name || ("Neighboring Farmer #" + (idx + 1))}
                  ${isMe ? '<span class="badge badge-green" style="padding:2px 8px;font-size:11px;margin-left:6px;">You</span>' : ''}
                </div>
                <div class="muted" style="font-size:12.5px;margin-top:2px;">
                  <i class="fa-solid fa-location-dot"></i> ${fObj.village || fObj.district || "Nearby Village"}
                </div>
              </div>
              <div style="text-align:right;">
                <div class="badge badge-green" style="font-size:13px;font-weight:700;">${m.quantity} kg</div>
                <div style="font-size:11.5px;color:var(--ink-soft);margin-top:2px;">₹${(m.amount || 0).toLocaleString()}</div>
              </div>
            </div>`;
        }).join("")}
      </div>

      <div style="margin-top:14px;padding:10px 14px;background:var(--paper);border-radius:10px;font-size:13px;color:var(--ink-soft);display:flex;align-items:center;gap:10px;">
        <i class="fa-solid fa-truck-moving" style="color:var(--gold-600);font-size:18px;"></i>
        <span><b>Shared Logistics:</b> Single collective transport pickup saves each farmer up to 40% on trolley diesel.</span>
      </div>
    </div>
  `;
}

function renderUnpooledView(opportunities, farmer, box) {
  if (opportunities && opportunities.length > 0) {
    box.innerHTML = `
      <!-- Nearby Pools Opportunity Card -->
      <div class="card" style="border-left: 5px solid var(--green-600);background:linear-gradient(180deg, #FFFFFF 0%, #F4FBF6 100%);">
        <span class="badge badge-green" style="margin-bottom:6px;">
          <i class="fa-solid fa-sparkles"></i> POOLING OPPORTUNITIES NEARBY
        </span>
        <h3 style="margin:2px 0 6px;">Neighboring Farmers are Pooling</h3>
        <p class="muted" style="margin:0 0 14px;font-size:14px;">
          Join nearby farmers in your zone to pool your harvest delivery, get a <b>+8% bulk price premium</b>, and save on shared transport.
        </p>
        
        <button class="btn btn-primary" onclick="triggerInstantPool()" id="autoPoolBtn">
          <i class="fa-solid fa-handshake"></i> Pool with Neighbors Now
        </button>
      </div>

      <h4 style="margin:18px 0 10px;color:var(--ink);font-size:16px;">Active Pools Forming Around You:</h4>

      ${opportunities.map(opp => `
        <div class="card" style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              <h3 style="margin:0 0 4px;font-size:17px;"><i class="fa-solid fa-seedling" style="color:var(--green-600);"></i> ${opp.cropType} Pool</h3>
              <div class="muted" style="font-size:13px;">
                <i class="fa-solid fa-users"></i> ${opp.nearbyFarmersCount} farmers (${opp.villages.slice(0, 2).join(", ") || "Nearby"})
              </div>
            </div>
            <div class="badge badge-gold" style="font-weight:800;">
              +₹${opp.extraPerQuintal}/q
            </div>
          </div>
          
          <div style="display:flex;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:1px solid var(--border-subtle);font-size:13.5px;">
            <span>Current Volume: <b>${opp.combinedVolumeKg.toLocaleString()} kg</b></span>
            <span>Bulk Rate: <b style="color:var(--green-700);">₹${opp.poolPricePerQuintal}/q</b></span>
          </div>
        </div>
      `).join("")}

      <div style="text-align:center;margin-top:16px;">
        <button class="btn btn-outline" onclick="location.href='book.html'">
          <i class="fa-solid fa-calendar-plus"></i> Book a Harvest Slot to Start New Pool
        </button>
      </div>
    `;
    return;
  }

  // No active bookings or opportunities
  box.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon"><i class="fa-solid fa-handshake-angle"></i></div>
      <h4>Collective Farmer Link Pooling</h4>
      <p style="max-width:440px;margin:0 auto 18px;">
        When you book a harvest delivery, our AI clustering engine automatically pools your quantity with neighboring farmers within 25km to unlock broker-free bulk premium rates (+8%).
      </p>
      <button class="btn btn-primary" style="max-width:280px;margin:0 auto;" onclick="location.href='book.html'">
        <i class="fa-solid fa-calendar-plus"></i> Book a Harvest Slot to Pool
      </button>
    </div>

    <div class="card" style="margin-top:16px;">
      <h3 style="font-size:16px;"><i class="fa-solid fa-lightbulb" style="color:var(--gold-500);"></i> How Farmer Link Works</h3>
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:12px;font-size:13.5px;color:var(--ink-soft);">
        <div style="display:flex;gap:12px;">
          <div style="width:24px;height:24px;border-radius:50%;background:var(--green-100);color:var(--green-800);display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">1</div>
          <div><b>Book your harvest slot</b> as normal on AgriConnect.</div>
        </div>
        <div style="display:flex;gap:12px;">
          <div style="width:24px;height:24px;border-radius:50%;background:var(--green-100);color:var(--green-800);display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">2</div>
          <div>Our AI pairs you with <b>verified farmers in your village</b> selling the same crop.</div>
        </div>
        <div style="display:flex;gap:12px;">
          <div style="width:24px;height:24px;border-radius:50%;background:var(--green-100);color:var(--green-800);display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">3</div>
          <div>Get paid directly with an <b>extra +8% bulk premium</b> and shared transport pickup.</div>
        </div>
      </div>
    </div>
  `;
}

async function triggerInstantPool() {
  const btn = document.getElementById("autoPoolBtn");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting with Neighbors...';
  }
  try {
    const res = await acHttp.post("/farmer/my-group/auto-pool");
    await loadFarmerGroupView();
  } catch (e) {
    alert(acErrorMsg(e));
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-handshake"></i> Pool with Neighbors Now';
    }
  }
}
