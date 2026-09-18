document.addEventListener("DOMContentLoaded", async () => {
  acRequireLogin();
  const farmer = acFarmer();
  document.getElementById("farmerName").textContent = farmer?.name?.split(" ")[0] || "";

  try {
    const bookings = (await acHttp.get("/farmer/bookings")).data;
    const active = bookings.find(b => !["completed", "rejected", "cancelled"].includes(b.status));
    const box = document.getElementById("activeBookingCard");
    if (active) {
      box.innerHTML = `
        <div class="card" onclick="location.href='bookings.html?id=${active._id}'" style="cursor:pointer">
          <h3>${active.cropType} · ${active.quantity}kg</h3>
          <div class="muted">${active.centerId?.name || ""}</div>
          ${acBadge(active.status)}
          <div style="margin-top:10px;font-size:14px;" class="muted">
            <i class="fa-solid fa-ticket" aria-label="token"></i> ${t("your_token")}: <b>#${active.tokenNumber || "-"}</b>
          </div>
        </div>`;
    } else {
      box.innerHTML = `<div class="card muted center-text">${t("no_bookings")}</div>`;
    }
  } catch (e) { /* ignore on home screen */ }

  try {
    const lot = (await acHttp.get("/farmer/my-group")).data;
    const teaser = document.getElementById("groupTeaser");
    if (lot) {
      teaser.innerHTML = `
        <div class="card" onclick="location.href='group.html'" style="cursor:pointer; border:2px solid var(--gold-500)">
          <h3><i class="fa-solid fa-handshake" aria-label="group"></i> ${t("my_group")}</h3>
          <div class="muted">${lot.cropType} · ${lot.members.length} ${t("group_members").toLowerCase()}</div>
        </div>`;
    }
  } catch (e) {}
});
