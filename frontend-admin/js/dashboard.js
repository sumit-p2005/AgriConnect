document.addEventListener("DOMContentLoaded", async () => {
  adRequireLogin();
  document.getElementById("shell").innerHTML = `
    ${adSidebar("dashboard.html")}
    <div class="main">
      <div class="pagehead">
        <div><h1>Dashboard</h1><div class="sub">Live procurement & logistics overview</div></div>
        <div class="filters">
          <select id="centerFilter"><option value="">All centres</option></select>
          <input type="date" id="dateFilter" value="${adToday()}">
          <button class="btn" onclick="loadDashboard()">Refresh</button>
        </div>
      </div>
      <div class="tiles" id="tiles"></div>

      <!-- Pending Transport Requests Panel -->
      <div class="panel" style="border-left: 4px solid var(--gold-500, #eab308);">
        <div class="panel-head" style="display:flex;justify-content:space-between;align-items:center;">
          <div>🚛 Pending Transport Requests <span class="badge badge-amber" id="transportCountBadge">0</span></div>
          <button class="btn btn-xs" onclick="loadTransportRequests()">Refresh Fleet</button>
        </div>
        <div style="overflow-x:auto">
          <table>
            <thead><tr><th>Farmer</th><th>Pickup Address</th><th>Crop / Qty</th><th>Status</th><th>Assigned Fleet</th><th>Action</th></tr></thead>
            <tbody id="transportBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Needs Attention Panel -->
      <div class="panel">
        <div class="panel-head">
          Needs Attention <span class="badge badge-amber">sorted by AI priority score</span>
        </div>
        <div style="overflow-x:auto">
          <table>
            <thead><tr><th>Token</th><th>Farmer</th><th>Centre</th><th>Crop</th><th>Qty</th><th>Score</th><th>Status</th><th>Action</th></tr></thead>
            <tbody id="attentionBody"></tbody>
          </table>
        </div>
      </div>

      <!-- SMS Notifications Log Panel -->
      <div class="panel">
        <div class="panel-head">📩 Live SMS & Notification Dispatch Log</div>
        <div style="max-height:220px;overflow-y:auto;font-family:monospace;font-size:13px;" id="smsLogBody"></div>
      </div>
    </div>
  `;
  await loadCenters();
  await loadDashboard();
  await loadTransportRequests();
  await loadSmsLogs();
});

async function loadCenters() {
  const centers = (await adHttp.get("/admin/centers")).data;
  const sel = document.getElementById("centerFilter");
  sel.innerHTML = `<option value="">All centres</option>` + centers.map(c => `<option value="${c._id}">${c.name}</option>`).join("");
}

async function loadDashboard() {
  const centerId = document.getElementById("centerFilter").value;
  const date = document.getElementById("dateFilter").value;
  const res = (await adHttp.get("/admin/dashboard", { params: { centerId, date } })).data;

  const tileDefs = [
    ["Total bookings", res.totalBookings, ""],
    ["Confirmed", res.byStatus.confirmed || 0, ""],
    ["Waitlisted", res.byStatus.waitlisted || 0, ""],
    ["Completed", res.byStatus.completed || 0, ""],
    ["Pending Transport", res.pendingTransportCount || 0, ""],
    ["Total qty (kg)", res.totalQuantity, ""],
    ["Total value (Rs.)", res.totalValue, ""]
  ];
  document.getElementById("tiles").innerHTML = tileDefs.map(([l, v]) => `
    <div class="tile"><div class="label">${l}</div><div class="value">${v}</div></div>`).join("");

  document.getElementById("attentionBody").innerHTML = res.needsAttention.map(b => `
    <tr>
      <td class="mono">#${b.tokenNumber}</td>
      <td>${b.farmerId?.name || "-"}<br><span class="mono" style="color:var(--slate-500)">${b.farmerId?.phone || ""}</span></td>
      <td>${b.centerId?.name || "-"}</td>
      <td>${b.cropType}</td>
      <td>${b.quantity}kg</td>
      <td><span class="score-chip">${b.priorityScore?.toFixed(2)}</span></td>
      <td>${adBadge(b.status)}</td>
      <td><a class="btn btn-xs" href="queue.html?open=${b._id}&centerId=${b.centerId?._id || ""}&date=${b.slotId?.date || ""}">Act →</a></td>
    </tr>`).join("") || `<tr><td colspan="8" style="text-align:center;color:var(--slate-500)">Nothing needs attention right now.</td></tr>`;
}

async function loadTransportRequests() {
  try {
    const list = (await adHttp.get("/admin/transport-requests")).data;
    const pending = list.filter(r => r.status === "requested");
    document.getElementById("transportCountBadge").textContent = pending.length;

    const tbody = document.getElementById("transportBody");
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--slate-500)">No transport requests recorded.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(r => `
      <tr>
        <td><b>${r.farmerId?.name || "Farmer"}</b><br><span class="mono" style="font-size:12px;">${r.farmerId?.phone || ""}</span></td>
        <td>${r.pickupLocation?.address || "Farm pickup"}</td>
        <td>${r.bookingId?.cropType || "-"} (${r.estimatedWeightKg}kg)</td>
        <td><span class="badge ${r.status === 'assigned' ? 'badge-green' : 'badge-amber'}">${r.status.toUpperCase()}</span></td>
        <td>${r.assignedPartnerId ? `<b>${r.assignedPartnerId.vehicleNumber}</b> (${r.assignedPartnerId.driverName})` : '<span style="color:#94a3b8">Unassigned</span>'}</td>
        <td>
          ${r.status === 'requested' ? `
            <button class="btn btn-xs" onclick="assignVehicle('${r._id}')">⚡ Auto Assign Nearest</button>
          ` : `
            <span style="color:#10b981;font-weight:700;">✅ Driver En Route</span>
          `}
        </td>
      </tr>
    `).join("");
  } catch (e) { console.warn("Transport requests load error:", e); }
}

async function assignVehicle(reqId) {
  try {
    const res = await adHttp.post(`/admin/transport-requests/${reqId}/assign`, {});
    alert(`Vehicle Assigned: ${res.data.assignedPartnerId?.vehicleNumber} (${res.data.assignedPartnerId?.driverName})`);
    loadTransportRequests();
    loadSmsLogs();
  } catch (e) {
    alert(adErr(e));
  }
}

async function loadSmsLogs() {
  try {
    const logs = (await adHttp.get("/admin/sms-logs")).data;
    const box = document.getElementById("smsLogBody");
    if (!logs.length) {
      box.innerHTML = `<div style="padding:10px;color:#94a3b8">No SMS dispatches recorded yet.</div>`;
      return;
    }
    box.innerHTML = logs.map(l => `
      <div style="padding:6px 10px;border-bottom:1px solid #334155;display:flex;justify-content:space-between;">
        <span>📱 <b>${l.phone}</b>: ${l.message}</span>
        <span style="color:${l.status === 'sent' ? '#34d399' : '#fbbf24'}">[${l.status.toUpperCase()}] ${new Date(l.sentAt).toLocaleTimeString()}</span>
      </div>
    `).join("");
  } catch (e) { console.warn("SMS logs load error:", e); }
}
