let acAllBookings = [];
let acCurrentBooking = null;

document.addEventListener("DOMContentLoaded", async () => {
  acRequireLogin();
  await loadList();
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  if (id) openDetail(id);
});

async function loadList() {
  try {
    acAllBookings = (await acHttp.get("/farmer/bookings")).data;
    const list = document.getElementById("bookingList");
    if (!acAllBookings.length) {
      list.innerHTML = `<div class="card muted center-text">${t("no_bookings")}</div>`;
      return;
    }
    list.innerHTML = acAllBookings.map(b => `
      <div class="card" style="cursor:pointer" onclick="openDetail('${b._id}')">
        <h3>${b.cropType} · ${b.quantity}kg</h3>
        <div class="muted">${b.centerId?.name || ""} · ${b.slotId?.date || ""} ${b.slotId?.startTime || ""}</div>
        ${acBadge(b.status)}
      </div>`).join("");
  } catch (e) { showErr(e); }
}

function acBookingsBack() {
  if (!document.getElementById("detailView").classList.contains("hidden")) {
    document.getElementById("detailView").classList.add("hidden");
    document.getElementById("listView").classList.remove("hidden");
    history.replaceState(null, "", "bookings.html");
  } else {
    location.href = "home.html";
  }
}

async function openDetail(id) {
  try {
    const b = (await acHttp.get(`/farmer/bookings/${id}`)).data;
    acCurrentBooking = b;
    document.getElementById("listView").classList.add("hidden");
    document.getElementById("detailView").classList.remove("hidden");

    document.getElementById("detailHeader").innerHTML = `
      <h3>${b.cropType} ${b.variety ? "(" + b.variety + ")" : ""} · ${b.quantity}kg</h3>
      <div class="muted">${b.centerId?.name || ""}</div>
      <div class="muted">${b.slotId?.date || ""} · ${b.slotId?.startTime || ""}-${b.slotId?.endTime || ""}</div>
      <div style="margin-top:8px">${acBadge(b.status)} &nbsp; <i class="fa-solid fa-ticket" aria-label="token"></i> #${b.tokenNumber || "-"}</div>
    `;

    document.getElementById("timelineBox").innerHTML = acTimelineHtml(b);

    // Fetch Transport Request if any
    try {
      const tReq = (await acHttp.get(`/farmer/bookings/${id}/transport`)).data;
      const tc = document.getElementById("transportCard");
      if (tReq) {
        tc.classList.remove("hidden");
        const partner = tReq.assignedPartnerId;
        tc.innerHTML = `
          <h3><i class="fa-solid fa-truck" aria-label="transport request"></i> Transportation Request</h3>
          <div class="badge badge-gold" style="margin-bottom:8px;">${tReq.status.toUpperCase()}</div>
          <div>Pickup: <b>${tReq.pickupLocation?.address || "Farm Location"}</b></div>
          ${partner ? `
            <div style="margin-top:8px;padding:10px;background:var(--green-100);border-radius:10px;color:var(--green-900);">
              <div><i class="fa-solid fa-truck" aria-label="vehicle"></i> Vehicle: <b>${partner.vehicleNumber}</b></div>
              <div><i class="fa-solid fa-id-card" aria-label="driver"></i> Driver: <b>${partner.driverName}</b></div>
              <div><i class="fa-solid fa-phone" aria-label="phone"></i> Phone: <b>${partner.driverPhone}</b></div>
            </div>
          ` : `
            <div class="muted" style="font-size:13px;margin-top:4px;">Waiting for admin to assign vehicle...</div>
          `}
        `;
      } else {
        tc.classList.add("hidden");
      }
    } catch (tErr) {
      document.getElementById("transportCard").classList.add("hidden");
    }

    const qc = document.getElementById("qualityCard");
    if (b.qualityCheck && b.qualityCheck.grade) {
      qc.classList.remove("hidden");
      qc.innerHTML = `<h3><i class="fa-solid fa-magnifying-glass" aria-label="quality check"></i> Quality Check</h3>
        <div>Grade: <b>${b.qualityCheck.grade}</b></div>
        <div>Moisture: ${b.qualityCheck.moisturePct ?? "-"}%</div>
        <div class="muted">${b.qualityCheck.remarks || ""}</div>`;
    } else qc.classList.add("hidden");

    const ap = document.getElementById("approvalCard");
    if (b.approval && b.approval.totalAmount) {
      ap.classList.remove("hidden");
      ap.innerHTML = `<h3><i class="fa-solid fa-file-signature" aria-label="approved"></i> Approved</h3>
        <div>${b.approval.finalQuantity}kg @ Rs.${b.approval.pricePerQuintal}/quintal</div>
        <div style="font-weight:800;font-size:20px;color:var(--green-700)">Rs.${b.approval.totalAmount}</div>`;
    } else ap.classList.add("hidden");

    const pay = document.getElementById("paymentCard");
    if (b.payment && b.payment.reference) {
      pay.classList.remove("hidden");
      pay.innerHTML = `<h3><i class="fa-solid fa-indian-rupee-sign" aria-label="payment"></i> Payment</h3>
        <div>Mode: ${b.payment.mode}</div>
        <div>Reference: ${b.payment.reference}</div>`;
    } else pay.classList.add("hidden");

    document.getElementById("notifLog").innerHTML = (b.notificationsLog || [])
      .slice().reverse().map(n => `<div style="margin-bottom:6px"><i class="fa-solid fa-envelope" aria-label="message"></i> ${n.message}</div>`).join("") || "-";

    document.getElementById("cancelBtn").classList.toggle("hidden", !["confirmed", "waitlisted"].includes(b.status));
  } catch (e) { showErr(e); }
}

async function cancelCurrentBooking() {
  if (!acCurrentBooking) return;
  if (!confirm("Cancel this booking?")) return;
  try {
    const result = await acWriteWithFallback("post", `/farmer/bookings/${acCurrentBooking._id}/cancel`, {});
    if (result.queued) {
      alert(t("will_send_offline"));
    } else {
      openDetail(acCurrentBooking._id);
      loadList();
    }
  } catch (e) { showErr(e); }
}

function showErr(e) {
  const box = document.getElementById("errorBox");
  box.textContent = acErrorMsg(e);
  box.classList.remove("hidden");
}
