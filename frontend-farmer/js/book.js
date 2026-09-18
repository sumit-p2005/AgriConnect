let acStep = 1;
let acPicked = { centerId: null, centerName: "", date: null, slotId: null, spotsLeft: null };
let acFarmerLoc = { lat: 31.25, lng: 75.70 };
let acLeafletMap = null;
let acNeedTransport = "no";

document.addEventListener("DOMContentLoaded", async () => {
  acRequireLogin();
  setupTransportChoices();
  prefillFarmerProfileData();
  await getFarmerLocationAndCenters();
});

function prefillFarmerProfileData() {
  const farmer = acFarmer();
  if (farmer?.primaryCrop) {
    acSelectCrop(farmer.primaryCrop);
  }
  if (farmer?.village || farmer?.district) {
    const addrInput = document.getElementById("pickupAddress");
    if (addrInput) {
      addrInput.value = `${farmer.village || ""}, ${farmer.district || ""}`.trim();
    }
  }
}

function acSelectCrop(cropName) {
  const input = document.getElementById("cropType");
  if (input) input.value = cropName;
  document.querySelectorAll(".crop-card").forEach(el => {
    el.classList.toggle("selected", el.dataset.crop.toLowerCase() === cropName.toLowerCase());
  });
}

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

  const stepTitles = [
    { badge: "Step 1 of 4", title: "Select Procurement Centre", key: "step_center" },
    { badge: "Step 2 of 4", title: "Choose Delivery Date", key: "step_date" },
    { badge: "Step 3 of 4", title: "Pick Time Window", key: "step_slot" },
    { badge: "Step 4 of 4", title: "Crop & Transport Details", key: "step_details" }
  ];

  const current = stepTitles[n - 1];
  const badgeEl = document.getElementById("stepBadge");
  const titleEl = document.getElementById("stepIndicatorTitle");
  if (badgeEl) badgeEl.innerHTML = `<i class="fa-solid fa-list-check"></i> ${current.badge}`;
  if (titleEl) titleEl.textContent = current.title;

  document.getElementById("stepTitle").setAttribute("data-i18n", current.key);
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
    html: "<div style='background-color:#f59e0b;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 8px rgba(0,0,0,0.5);'></div>",
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
  L.marker([acFarmerLoc.lat, acFarmerLoc.lng], { icon: farmerIcon })
    .addTo(acLeafletMap)
    .bindPopup("<b><i class=\"fa-solid fa-user-pin\" aria-label=\"you are here\"></i> You are here</b>");

  // Center markers
  centers.forEach(c => {
    if (c.location && c.location.lat && c.location.lng) {
      const centerIcon = L.divIcon({
        className: "custom-div-icon",
        html: "<div style='background-color:#16a34a;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 8px rgba(0,0,0,0.5);'></div>",
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      const marker = L.marker([c.location.lat, c.location.lng], { icon: centerIcon }).addTo(acLeafletMap);
      marker.bindPopup(`
        <div style="font-size:13.5px;font-weight:700;">${c.name}</div>
        <div style="font-size:12px;color:#64748b;margin:3px 0;"><i class="fa-solid fa-location-dot" aria-label="location"></i> ${c.distanceKm} km away</div>
        <button onclick="pickCenter('${c._id}', '${c.name.replace(/'/g, "")}')" style="margin-top:6px;background:#166534;color:white;border:none;padding:5px 10px;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;">Select Centre</button>
      `);
    }
  });
}

function renderCenterList(centers) {
  const list = document.getElementById("centerList");
  if (!centers.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><i class="fa-solid fa-building-circle-xmark"></i></div>
      <h4>No Centres Found</h4>
      <p>Could not locate nearby active procurement centres.</p>
    </div>`;
    return;
  }
  list.innerHTML = centers.map(c => `
    <div class="list-item" onclick="pickCenter('${c._id}', '${c.name.replace(/'/g, "")}')">
      <div>
        <div style="font-weight:700;font-size:16px;">${c.name}</div>
        <div class="muted" style="font-size:13px;margin:2px 0;">${c.address || ""}</div>
        <div style="color:var(--green-700);font-size:13px;font-weight:700;margin-top:4px;">
          <i class="fa-solid fa-location-dot" aria-label="location"></i> ${c.distanceKm} km away
        </div>
      </div>
      <div style="font-size:24px;color:var(--green-700);"><i class="fa-solid fa-chevron-right" aria-label="select"></i></div>
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
      <div>
        <div style="font-weight:700;font-size:16px;">${label}</div>
        <div class="muted" style="font-size:13.5px;">${iso}</div>
      </div>
      <div style="font-size:24px;color:var(--green-700);"><i class="fa-solid fa-calendar-check" aria-label="date"></i></div>
    </div>`;
  }).join("");
  list.innerHTML = options;
}

async function pickDate(iso) {
  acPicked.date = iso;
  const list = document.getElementById("slotList");
  list.innerHTML = `
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
  `;
  showStep(3);

  try {
    const slots = (await acHttp.get(`/farmer/centers/${acPicked.centerId}/slots`, { params: { date: iso } })).data;
    if (!slots.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i class="fa-solid fa-clock"></i></div>
          <h4>No Open Slots</h4>
          <p>No available delivery windows for ${iso}. Please choose another day.</p>
          <button class="btn btn-outline" onclick="showStep(2)">Pick Another Date</button>
        </div>`;
    } else {
      list.innerHTML = slots.map(s => {
        const pct = Math.round((s.spotsLeft / s.capacity) * 100);
        return `
        <div class="list-item" style="display:block" onclick="pickSlot('${s.id}', ${s.spotsLeft})">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-weight:700;font-size:16px;">${s.startTime} – ${s.endTime}</div>
            <div class="badge badge-green">${s.spotsLeft} ${t("spots_left")}</div>
          </div>
          <div class="spots-bar"><div class="spots-bar-fill" style="width:${pct}%"></div></div>
        </div>`;
      }).join("");
    }
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

/* ---------- One-shot Speech Recognition for Quantity Field ---------- */
function acVoiceFillQuantity() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = document.getElementById("micQtyBtn");
  const feedback = document.getElementById("voiceFeedback");

  if (!SpeechRec) {
    alert("Voice input is supported in Google Chrome browser.");
    return;
  }

  const rec = new SpeechRec();
  rec.lang = localStorage.getItem("ac_lang") === "hi" ? "hi-IN" : "en-IN";
  rec.continuous = false;
  rec.interimResults = false;

  btn.classList.add("listening");
  if (feedback) feedback.textContent = "🎙️ Listening for quantity number...";

  rec.onresult = (e) => {
    btn.classList.remove("listening");
    const transcript = e.results[0][0].transcript.trim().toLowerCase();
    
    // Parse spoken numbers
    let qty = null;
    const digits = transcript.match(/\d+/);
    if (digits) {
      qty = parseInt(digits[0], 10);
    } else {
      const map = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
        "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10,
        "hundred": 100, "सौ": 100, "five hundred": 500, "पाँच सौ": 500, "thousand": 1000, "हजार": 1000
      };
      for (const k in map) {
        if (transcript.includes(k)) { qty = map[k]; break; }
      }
    }

    if (qty && qty > 0) {
      document.getElementById("quantity").value = qty;
      if (feedback) feedback.textContent = `✓ Recognized: ${qty} kg`;
    } else {
      if (feedback) feedback.textContent = `Could not recognize number from "${transcript}". Please use stepper.`;
    }
  };

  rec.onerror = () => {
    btn.classList.remove("listening");
    if (feedback) feedback.textContent = "Voice listening stopped. Please enter number manually.";
  };

  try {
    rec.start();
  } catch (err) {
    btn.classList.remove("listening");
  }
}

async function submitBooking() {
  const cropType = document.getElementById("cropType").value.trim();
  const variety = document.getElementById("variety").value.trim();
  const quantity = parseInt(document.getElementById("quantity").value) || 0;
  const harvestWindowDays = parseInt(document.getElementById("harvestWindow").value) || 3;
  if (!cropType || !quantity) return showErrMsg("Please select a crop type and enter quantity.");

  try {
    const res = await acHttp.post("/farmer/bookings", {
      centerId: acPicked.centerId,
      slotId: acPicked.slotId,
      cropType,
      variety: variety || "Standard",
      quantity,
      harvestWindowDays
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
            address: pickupAddr || "Farm Location"
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
  document.getElementById("stepIndicatorBar").classList.add("hidden");
  document.getElementById("progressDots").classList.add("hidden");

  const waitlisted = booking.status === "waitlisted";
  document.getElementById("confirmIcon").innerHTML = waitlisted
    ? '<i class="fa-solid fa-clock" aria-label="waitlisted"></i>'
    : '<i class="fa-solid fa-circle-check" aria-label="success"></i>';
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
