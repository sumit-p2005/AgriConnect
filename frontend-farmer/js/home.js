document.addEventListener("DOMContentLoaded", async () => {
  acRequireLogin();
  const farmer = acFarmer();
  document.getElementById("farmerName").textContent = farmer?.name?.split(" ")[0] || "Farmer";

  try {
    const bookings = (await acHttp.get("/farmer/bookings")).data;
    const active = bookings.find(b => !["completed", "rejected", "cancelled"].includes(b.status));
    const box = document.getElementById("activeBookingCard");
    
    if (active) {
      box.innerHTML = `
        <div class="card" onclick="location.href='bookings.html?id=${active._id}'" style="cursor:pointer;border-left: 4px solid var(--green-600);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              <h3>${active.cropType} · ${active.quantity}kg</h3>
              <div class="muted" style="margin-bottom:8px;"><i class="fa-solid fa-building"></i> ${active.centerId?.name || "Procurement Centre"}</div>
            </div>
            ${acBadge(active.status)}
          </div>
          <div style="margin-top:8px;font-size:14.5px;padding-top:8px;border-top:1px solid var(--border-subtle);display:flex;justify-content:space-between;" class="muted">
            <span><i class="fa-solid fa-ticket" aria-label="token"></i> Token Number:</span>
            <b style="color:var(--green-800);font-size:16px;">#${active.tokenNumber || "-"}</b>
          </div>
        </div>`;
    } else {
      box.innerHTML = `
        <div class="empty-state" style="margin:0;">
          <div class="empty-icon"><i class="fa-solid fa-calendar-day"></i></div>
          <h4>No Active Bookings</h4>
          <p>You haven't scheduled any crop deliveries yet.</p>
          <button class="btn btn-outline" style="min-height:42px;padding:8px 16px;font-size:14px;" onclick="location.href='book.html'">
            <i class="fa-solid fa-plus"></i> Schedule Delivery
          </button>
        </div>`;
    }
  } catch (e) {
    const box = document.getElementById("activeBookingCard");
    if (box) {
      box.innerHTML = `
        <div class="empty-state" style="margin:0;">
          <div class="empty-icon"><i class="fa-solid fa-calendar-day"></i></div>
          <h4>Ready to Book</h4>
          <p>Book your upcoming harvest slot at your nearest mandi.</p>
          <button class="btn btn-outline" style="min-height:42px;padding:8px 16px;font-size:14px;" onclick="location.href='book.html'">
            <i class="fa-solid fa-plus"></i> Schedule Delivery
          </button>
        </div>`;
    }
  }

  try {
    const lot = (await acHttp.get("/farmer/my-group")).data;
    const teaser = document.getElementById("groupTeaser");
    if (lot) {
      teaser.innerHTML = `
        <div class="card" onclick="location.href='group.html'" style="cursor:pointer; border-left: 4px solid var(--gold-500);background:var(--gold-50);">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <h3><i class="fa-solid fa-handshake" style="color:var(--gold-600);"></i> Farmer Link Group</h3>
            <span class="badge badge-gold">Active Lot</span>
          </div>
          <p class="muted" style="margin:4px 0 10px;">${lot.cropType} pooled with ${lot.members?.length || 0} nearby farmers for better broker-free rates.</p>
          <div style="font-weight:700;color:var(--green-800);font-size:14px;">View Group Details →</div>
        </div>`;
    } else if (teaser) {
      teaser.innerHTML = `
        <div class="card" onclick="location.href='group.html'" style="cursor:pointer;">
          <h3><i class="fa-solid fa-handshake" style="color:var(--gold-500);"></i> Farmer Link Pooling</h3>
          <p class="muted" style="margin:4px 0 10px;">Automatically pool crops with nearby farmers for bulk transport & premium pricing.</p>
          <div style="font-weight:700;color:var(--green-700);font-size:14px;">Learn How It Works →</div>
        </div>`;
    }
  } catch (e) {}
});
