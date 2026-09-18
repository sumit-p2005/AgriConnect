let adCenters = [];

document.addEventListener("DOMContentLoaded", async () => {
  adRequireLogin();
  document.getElementById("shell").innerHTML = `
    ${adSidebar("slots.html")}
    <div class="main">
      <div class="pagehead">
        <div><h1>Centres &amp; Slots</h1><div class="sub">Manage procurement centres and their time-window slots</div></div>
        <button class="btn btn-primary" onclick="openAddCenterModal()">+ Add Centre</button>
      </div>

      <div class="panel">
        <div class="panel-head">Procurement Centres</div>
        <div style="overflow-x:auto">
          <table>
            <thead><tr><th>Name</th><th>Address</th><th>Accepted Crops</th><th>Cap/hr</th><th>Load</th><th>Storage (kg)</th><th>Active</th><th>Action</th></tr></thead>
            <tbody id="centersBody"></tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">Slots</div>
        <div class="filters" style="padding:12px 16px 0">
          <select id="slotCenterFilter"></select>
          <input type="date" id="slotDateFilter" value="${adToday()}">
          <button class="btn" onclick="loadSlots()">Refresh</button>
          <button class="btn btn-primary" onclick="openGenerateModal()">+ Bulk-generate slots</button>
        </div>
        <div style="overflow-x:auto">
          <table>
            <thead><tr><th>Date</th><th>Time</th><th>Capacity</th><th>Booked</th><th>Status</th><th>Action</th></tr></thead>
            <tbody id="slotsBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  await loadCenters();
  await loadSlots();
});

async function loadCenters() {
  adCenters = (await adHttp.get("/admin/centers")).data;
  document.getElementById("centersBody").innerHTML = adCenters.map(c => `
    <tr>
      <td>${c.name}</td>
      <td>${c.address || "-"}</td>
      <td>${(c.acceptedCrops || []).join(", ")}</td>
      <td class="mono">${c.capacityPerHour}</td>
      <td class="mono">${c.currentLoad}</td>
      <td class="mono">${c.storageCapacityKg}</td>
      <td>${c.active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-gray">Inactive</span>'}</td>
      <td><button class="btn btn-xs" onclick="toggleCenter('${c._id}', ${!c.active})">${c.active ? "Deactivate" : "Activate"}</button></td>
    </tr>`).join("");

  const sel = document.getElementById("slotCenterFilter");
  sel.innerHTML = adCenters.map(c => `<option value="${c._id}">${c.name}</option>`).join("");
}

async function toggleCenter(id, active) {
  await adHttp.put(`/admin/centers/${id}`, { active });
  loadCenters();
}

async function loadSlots() {
  const centerId = document.getElementById("slotCenterFilter").value;
  const date = document.getElementById("slotDateFilter").value;
  if (!centerId) return;
  const slots = (await adHttp.get("/admin/slots", { params: { centerId, date } })).data;
  document.getElementById("slotsBody").innerHTML = slots.map(s => `
    <tr>
      <td>${s.date}</td>
      <td>${s.startTime} - ${s.endTime}</td>
      <td class="mono">${s.capacity}</td>
      <td class="mono">${s.bookedCount}</td>
      <td>${s.status === "open" ? '<span class="badge badge-green">Open</span>' : '<span class="badge badge-gray">Closed</span>'}</td>
      <td>
        <button class="btn btn-xs" onclick="toggleSlot('${s._id}', '${s.status === "open" ? "closed" : "open"}')">${s.status === "open" ? "Close" : "Open"}</button>
        <button class="btn btn-xs btn-danger" onclick="deleteSlot('${s._id}')">Delete</button>
      </td>
    </tr>`).join("") || `<tr><td colspan="6" style="text-align:center;color:var(--slate-500)">No slots yet — bulk-generate some above.</td></tr>`;
}

async function toggleSlot(id, status) {
  await adHttp.put(`/admin/slots/${id}`, { status });
  loadSlots();
}
async function deleteSlot(id) {
  if (!confirm("Delete this slot?")) return;
  await adHttp.delete(`/admin/slots/${id}`);
  loadSlots();
}

function getModalRoot() {
  let el = document.getElementById("modalRoot");
  if (!el) {
    el = document.createElement("div");
    el.id = "modalRoot";
    document.body.appendChild(el);
  }
  return el;
}

function openAddCenterModal() {
  getModalRoot().innerHTML = `
  <div class="modal-backdrop"><div class="modal">
    <h3>Add Procurement Centre</h3>
    <label>Name</label><input id="cName">
    <label>Address</label><input id="cAddress">
    <label>Accepted crops (comma separated)</label><input id="cCrops" placeholder="Wheat, Tomato">
    <label>Capacity per hour</label><input id="cCap" type="number" value="20">
    <label>Storage capacity (kg)</label><input id="cStorage" type="number" value="5000">
    <div class="actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitCenter()">Save</button>
    </div>
  </div></div>`;
}
async function submitCenter() {
  const body = {
    name: document.getElementById("cName").value,
    address: document.getElementById("cAddress").value,
    acceptedCrops: document.getElementById("cCrops").value.split(",").map(s => s.trim()).filter(Boolean),
    capacityPerHour: parseInt(document.getElementById("cCap").value) || 20,
    storageCapacityKg: parseInt(document.getElementById("cStorage").value) || 5000,
    active: true
  };
  await adHttp.post("/admin/centers", body);
  closeModal();
  loadCenters();
}

function openGenerateModal() {
  getModalRoot().innerHTML = `
  <div class="modal-backdrop"><div class="modal">
    <h3>Bulk-generate Slots</h3>
    <label>Date</label><input type="date" id="gDate" value="${adToday()}">
    <label>Start hour (24h)</label><input type="number" id="gStart" value="6">
    <label>End hour (24h)</label><input type="number" id="gEnd" value="18">
    <label>Window size (hours)</label><input type="number" id="gWindow" value="2">
    <label>Capacity per window</label><input type="number" id="gCap" value="5">
    <div class="actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitGenerate()">Generate</button>
    </div>
  </div></div>`;
}
async function submitGenerate() {
  const body = {
    centerId: document.getElementById("slotCenterFilter").value,
    date: document.getElementById("gDate").value,
    startHour: parseInt(document.getElementById("gStart").value),
    endHour: parseInt(document.getElementById("gEnd").value),
    windowHours: parseInt(document.getElementById("gWindow").value),
    capacityPerWindow: parseInt(document.getElementById("gCap").value)
  };
  await adHttp.post("/admin/slots/bulk-generate", body);
  closeModal();
  document.getElementById("slotDateFilter").value = body.date;
  loadSlots();
}
function closeModal() { getModalRoot().innerHTML = ""; }
