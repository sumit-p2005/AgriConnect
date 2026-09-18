let acStep = 1;
let acPicked = { centerId: null, centerName: "", date: null, slotId: null, spotsLeft: null };
let acFarmerLoc = { lat: 31.25, lng: 75.70 };
let acLeafletMap = null;
let acNeedTransport = "no";

document.addEventListener("DOMContentLoaded", async () => {
  acRequireLogin();
  setupTransportChoices();
  await getFarmerLocationAndCenters();
});

function setupTransportChoices() {
  document.querySelectorAll("#transportChoices .icon-choice").forEach(el => {
    el.addEventListener("click", () => {
      document.querySelectorAll("#transportChoices .icon-choice").forEach(x => x.classList.remove("selected"));
      el.classList.add("selected");
      acNeedTransport = el.dataset.val;
      document.getElementById("transportDetails").classList.toggle("hidden", acNeedTransport !== "yes");
    });
  });
}

function acUseCurrentLocation() {
  const farmer = acFarmer();
  const addrInput = document.getElementById("pickupAddress");
  if (!addrInput) return;

  if (farmer?.village || farmer?.district) {
    addrInput.value = `${farmer.village || "Farm"}, ${farmer.district || "Punjab"} (GPS: ${acFarmerLoc.lat.toFixed(4)}, ${acFarmerLoc.lng.toFixed(4)})`;
  } else {
    addrInput.value = `Live Location (GPS: ${acFarmerLoc.lat.toFixed(4)}, ${acFarmerLoc.lng.toFixed(4)})`;
  }
}

function showStep(n) {
  [1, 2, 3, 4].forEach(i => document.getElementById(`step${i}`).classList.toggle("hidden", i !== n));
  document.getElementById("stepConfirm").classList.add("hidden");
  document.querySelectorAll("#progressDots .dot").forEach((d, i) => d.classList.toggle("active", i === n - 1));
  const titles = ["step_center", "step_date", "step_slot", "step_details"];
  document.getElementById("stepTitle").setAttribute("data-i18n", titles[n - 1]);
  acApplyStrings();
  acStep = n;
  document.getElementById("errorBox").classList.add("hidden");
  if (n === 1 && acLeafletMap) {
    setTimeout(() => { acLeafletMap.invalidateSize(); }, 300);
  }
}

function acBookBack() {
  if (acStep === 1) { location.href = "home.html"; return; }
  showStep(acStep - 1);
}

async function getFarmerLocationAndCenters() {
  const farmer = acFarmer();
  if (farmer?.location?.lat && farmer?.location?.lng) {
    acFarmerLoc = { lat: farmer.location.lat, lng: farmer.location.lng };
  }

  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        acFarmerLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        loadNearbyCenters();
      },
      () => { loadNearbyCenters(); },
      { timeout: 5000 }
    );
  } else {
    loadNearbyCenters();
  }
}

async function loadNearbyCenters() {
  try {
    const centers = (await acHttp.get(`/farmer/centers/nearby?lat=${acFarmerLoc.lat}&lng=${acFarmerLoc.lng}`)).data;
    renderCenterList(centers);
    initLeafletMap(centers);
  } catch (e) { showErr(e); }
}

function initLeafletMap(centers) {
  if (!window.L) return;
  const container = document.getElementById("mapContainer");
  if (!container) return;

  if (acLeafletMap) {
    acLeafletMap.remove();
    acLeafletMap = null;
  }

  acLeafletMap = L.map("mapContainer").setView([acFarmerLoc.lat, acFarmerLoc.lng], 10);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "© OpenStreetMap"
  }).addTo(acLeafletMap);

  // Farmer marker
  const farmerIcon = L.divIcon({
    className: "custom-div-icon",
    html: "<div style='background-color:#2563eb;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 0 6px rgba(0,0,0,0.5);'></div>",
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
  L.marker([acFarmerLoc.lat, acFarmerLoc.lng], { icon: farmerIcon })
    .addTo(acLeafletMap)
    .bindPopup("<b>🧑‍🌾 You are here</b>");

  // Center markers
  centers.forEach(c => {
    if (c.location && c.location.lat && c.location.lng) {
      const centerIcon = L.divIcon({
        className: "custom-div-icon",
        html: "<div style='background-color:#16a34a;width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 0 6px rgba(0,0,0,0.5);'></div>",
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });
      const marker = L.marker([c.location.lat, c.location.lng], { icon: centerIcon }).addTo(acLeafletMap);
      marker.bindPopup(`
        <div style="font-size:13px;font-weight:700;">${c.name}</div>
        <div style="font-size:12px;color:#64748b;">📍 ${c.distanceKm} km away</div>
        <button onclick="pickCenter('${c._id}', '${c.name.replace(/'/g, "")}')" style="margin-top:6px;background:#166534;color:white;border:none;padding:4px 8px;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;">Select Centre</button>
      `);
    }
  });
}

function renderCenterList(centers) {
  const list = document.getElementById("centerList");
  list.innerHTML = centers.map(c => `
    <div class="list-item" onclick="pickCenter('${c._id}', '${c.name.replace(/'/g, "")}')">
      <div>
        <div style="font-weight:700">${c.name}</div>
        <div class="muted" style="font-size:13px">${c.address || ""}</div>
        <div style="color:var(--green-700);font-size:13px;font-weight:700;margin-top:2px;">📍 ${c.distanceKm} km away</div>
      </div>
      <div style="font-size:22px">🏭</div>
    </div>`).join("");
}

function pickCenter(id, name) {
  acPicked.centerId = id;
  acPicked.centerName = name;
  loadDates();
  showStep(2);
}

function loadDates() {
  const list = document.getElementById("dateList");
  const options = [0, 1].map(off => {
    const d = new Date(); d.setDate(d.getDate() + off);
    const iso = d.toISOString().slice(0, 10);
    const label = off === 0 ? "Today / आज" : "Tomorrow / कल";
    return `<div class="list-item" onclick="pickDate('${iso}')">
      <div><div style="font-weight:700">${label}</div><div class="muted" style="font-size:13px">${iso}</div></div>
      <div style="font-size:22px">📅</div>
    </div>`;
  }).join("");
  list.innerHTML = options;
}

async function pickDate(iso) {
  acPicked.date = iso;
  try {
    const slots = (await acHttp.get(`/farmer/centers/${acPicked.centerId}/slots`, { params: { date: iso } })).data;
    const list = document.getElementById("slotList");
    if (!slots.length) {
      list.innerHTML = `<div class="card muted center-text">No slots for this date. Try another day.</div>`;
    } else {
      list.innerHTML = slots.map(s => {
        const pct = Math.round((s.spotsLeft / s.capacity) * 100);
        return `
        <div class="list-item" style="display:block" onclick="pickSlot('${s.id}', ${s.spotsLeft})">
          <div style="display:flex;justify-content:space-between;">
            <div style="font-weight:700">${s.startTime} - ${s.endTime}</div>
            <div>${s.spotsLeft} ${t("spots_left")}</div>
          </div>
          <div class="spots-bar"><div class="spots-bar-fill" style="width:${pct}%"></div></div>
        </div>`;
      }).join("");
    }
    showStep(3);
  } catch (e) { showErr(e); }
}

function pickSlot(id, spotsLeft) {
  acPicked.slotId = id;
  acPicked.spotsLeft = spotsLeft;
  showStep(4);
}

function acStepQty(delta) {
  const el = document.getElementById("quantity");
  el.value = Math.max(10, (parseInt(el.value) || 0) + delta);
}
function acStepDays(delta) {
  const el = document.getElementById("harvestWindow");
  el.value = Math.max(1, (parseInt(el.value) || 0) + delta);
}

async function submitBooking() {
  const cropType = document.getElementById("cropType").value.trim();
  const variety = document.getElementById("variety").value.trim();
  const quantity = parseInt(document.getElementById("quantity").value) || 0;
  const harvestWindowDays = parseInt(document.getElementById("harvestWindow").value) || 3;
  if (!cropType || !quantity) return showErrMsg("Please enter crop type and quantity.");

  try {
    const res = await acHttp.post("/farmer/bookings", {
      centerId: acPicked.centerId, slotId: acPicked.slotId,
      cropType, variety, quantity, harvestWindowDays
    });
    
    const booking = res.data;

    // Handle Transport Request if selected
    if (acNeedTransport === "yes") {
      const pickupAddr = document.getElementById("pickupAddress").value.trim();
      try {
        await acHttp.post("/farmer/transport-requests", {
          bookingId: booking._id,
          pickupLocation: {
            lat: acFarmerLoc.lat,
            lng: acFarmerLoc.lng,
            address: pickupAddr || "Farmer Farm Location"
          },
          estimatedWeightKg: quantity
        });
        document.getElementById("transportStatusCard").classList.remove("hidden");
      } catch (tErr) {
        console.warn("Transport request creation error:", tErr);
      }
    }

    showConfirmation(booking);
  } catch (e) { showErr(e); }
}

function showConfirmation(booking) {
  [1, 2, 3, 4].forEach(i => document.getElementById(`step${i}`).classList.add("hidden"));
  document.getElementById("stepConfirm").classList.remove("hidden");
  document.getElementById("progressDots").classList.add("hidden");

  const waitlisted = booking.status === "waitlisted";
  document.getElementById("confirmIcon").textContent = waitlisted ? "⏳" : "✅";
  document.getElementById("confirmTitle").setAttribute("data-i18n", waitlisted ? "waitlisted_msg" : "booking_confirmed");
  document.getElementById("tokenBlock").classList.toggle("hidden", waitlisted);
  document.getElementById("tokenValue").textContent = `#${booking.tokenNumber}`;
  document.getElementById("qrImg").src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${booking._id}`;
  document.getElementById("confirmDetails").textContent =
    `${acPicked.centerName} · ${booking.cropType} · ${booking.quantity}kg`;

  const msg = encodeURIComponent(`AgriConnect booking: ${booking.cropType} ${booking.quantity}kg at ${acPicked.centerName} on ${acPicked.date}. Token #${booking.tokenNumber}.`);
  document.getElementById("waLink").href = `https://wa.me/?text=${msg}`;
  acApplyStrings();
}

function showErr(e) { showErrMsg(acErrorMsg(e)); }
function showErrMsg(msg) {
  const box = document.getElementById("errorBox");
  box.textContent = msg;
  box.classList.remove("hidden");
}
