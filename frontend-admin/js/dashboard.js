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
          <button class="btn btn-primary" onclick="loadDashboard()"><i class="fa-solid fa-arrows-rotate"></i> Refresh</button>
        </div>
      </div>
      <div class="tiles" id="tiles"></div>

      <!-- Pending Transport Requests Panel -->
      <div class="panel" style="border-left: 4px solid var(--gold-500, #eab308);">
        <div class="panel-head" style="display:flex;justify-content:space-between;align-items:center;">
          <div><i class="fa-solid fa-truck" aria-label="transport"></i> Pending Transport Requests <span class="badge badge-amber" id="transportCountBadge">0</span></div>
          <button class="btn btn-xs" onclick="loadTransportRequests()"><i class="fa-solid fa-rotate"></i> Refresh Fleet</button>
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
        <div class="panel-head" style="display:flex;justify-content:space-between;align-items:center;">
          <div>Needs Attention <span class="badge badge-amber">sorted by AI priority score</span></div>
          <button class="btn btn-xs" onclick="loadAttention()"><i class="fa-solid fa-rotate"></i> Refresh Queue</button>
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
        <div class="panel-head" style="display:flex;justify-content:space-between;align-items:center;">
          <div><i class="fa-solid fa-envelope" aria-label="sms logs"></i> Live SMS & Notification Dispatch Log</div>
          <button class="btn btn-xs" onclick="loadSmsLogs()"><i class="fa-solid fa-rotate"></i> Refresh SMS</button>
        </div>
        <div style="max-height:220px;overflow-y:auto;font-family:monospace;font-size:13px;" id="smsLogBody"></div>
      </div>
    </div>
  `;
  await loadCenters();
  await loadDashboard();
});

async function loadCenters() {
  try {
    const centers = (await adHttp.get("/admin/centers")).data;
    const select = document.getElementById("centerFilter");
    if (!select) return;
    select.innerHTML = `<option value="">All centres</option>` + centers.map(c => `<option value="${c._id}">${c.name} (${c.district || c.address || ''})</option>`).join("");
    select.onchange = () => { loadDashboard(); };
  } catch (e) { console.warn("Centers load error:", e); }
}

async function loadDashboard() {
  try {
    const stats = (await adHttp.get("/admin/dashboard/stats")).data;
    const tiles = document.getElementById("tiles");
    if (tiles && stats) {
      tiles.innerHTML = `
        <div class="tile"><div class="label">Today's Bookings</div><div class="value">${stats.todayBookingsCount || 0}</div></div>
        <div class="tile"><div class="label">Today's Volume</div><div class="value">${(stats.todayVolumeKg || 0).toLocaleString()} kg</div></div>
        <div class="tile"><div class="label">Completed Today</div><div class="value">${stats.todayCompletedCount || 0}</div></div>
        <div class="tile"><div class="label">Total Registered Farmers</div><div class="value">${stats.totalFarmers || 0}</div></div>
        <div class="tile"><div class="label">Active Centres</div><div class="value">${stats.activeCenters || 0}</div></div>
        <div class="tile"><div class="label">Active Bulk Lots</div><div class="value">${stats.activeLots || 0}</div></div>
      `;
    }
  } catch (e) { console.warn("Dashboard stats error:", e); }

  await Promise.all([
    loadAttention(),
    loadTransportRequests(),
    loadSmsLogs()
  ]);
}

async function loadAttention() {
  const centerId = document.getElementById("centerFilter")?.value;
  try {
    const endpoint = centerId ? `/admin/centers/${centerId}/attention` : `/admin/centers/all/attention`;
    const list = (await adHttp.get(endpoint)).data;
    const body = document.getElementById("attentionBody");
    if (!body) return;
    if (!list || !list.length) {
      body.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#94a3b8">No items need attention right now.</td></tr>`;
      return;
    }
    body.innerHTML = list.map(b => `
      <tr>
        <td><b>#${b.tokenNumber || '-'}</b></td>
        <td>${b.farmerId?.name || "-"}<br><span style="font-size:11px;color:#94a3b8">${b.farmerId?.phone || ''}</span></td>
        <td>${b.centerId?.name || "-"}</td>
        <td>${b.cropType}</td>
        <td>${b.quantity}kg</td>
        <td><span class="score-chip">${(b.priorityScore || 0).toFixed(2)}</span></td>
        <td>${adBadge(b.status)}</td>
        <td><button class="btn btn-xs btn-primary" onclick="location.href='queue.html?centerId=${b.centerId?._id || ''}'">Process</button></td>
      </tr>
    `).join("");
  } catch (e) { console.warn("Attention load error:", e); }
}

async function loadTransportRequests() {
  try {
    const reqs = (await adHttp.get("/admin/transport-requests")).data;
    const countBadge = document.getElementById("transportCountBadge");
    if (countBadge) countBadge.textContent = reqs.filter(r => r.status === 'requested').length;

    const body = document.getElementById("transportBody");
    if (!body) return;
    if (!reqs.length) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#94a3b8">No transport requests pending.</td></tr>`;
      return;
    }
    body.innerHTML = reqs.map(r => `
      <tr>
        <td><b>${r.farmerId?.name || 'Farmer'}</b><br><span style="font-size:12px;color:#94a3b8">${r.farmerId?.phone || ''}</span></td>
        <td>${r.pickupLocation?.address || 'Farm Location'}</td>
        <td>${r.bookingId?.cropType || 'Crop'} (${r.estimatedWeightKg || r.bookingId?.quantity || 0}kg)</td>
        <td><span class="badge ${r.status === 'assigned' ? 'badge-green' : 'badge-amber'}">${r.status.toUpperCase()}</span></td>
        <td>${r.assignedPartnerId ? `<b>${r.assignedPartnerId.vehicleNumber}</b> (${r.assignedPartnerId.driverName})` : '<span style="color:#94a3b8">Unassigned</span>'}</td>
        <td>
          ${r.status === 'requested' ? `
            <button class="btn btn-xs btn-primary" onclick="assignVehicle('${r._id}')"><i class="fa-solid fa-bolt" aria-label="auto assign"></i> Auto Assign Nearest</button>
          ` : `
            <span style="color:#10b981;font-weight:700;"><i class="fa-solid fa-circle-check" aria-label="en route"></i> Driver En Route</span>
          `}
        </td>
      </tr>
    `).join("");
  } catch (e) { console.warn("Transport requests load error:", e); }
}

async function assignVehicle(reqId) {
  try {
    const res = await adHttp.post(`/admin/transport-requests/${reqId}/assign`, {});
    const partner = res.data?.assignedPartnerId;
    alert(`Vehicle Assigned: ${partner?.vehicleNumber || 'PB-08-AX-9921'} (${partner?.driverName || 'Gurpreet Singh'})`);
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
    if (!box) return;
    if (!logs.length) {
      box.innerHTML = `<div style="padding:10px;color:#94a3b8">No SMS dispatches recorded yet.</div>`;
      return;
    }
    box.innerHTML = logs.map(l => `
      <div style="padding:6px 10px;border-bottom:1px solid #334155;display:flex;justify-content:space-between;align-items:center;">
        <span><i class="fa-solid fa-mobile-screen" aria-label="phone"></i> <b>${l.phone}</b>: ${l.message}</span>
        <span style="color:${l.status === 'sent' ? '#34d399' : '#fbbf24'};font-size:11px;">[${l.status.toUpperCase()}] ${new Date(l.sentAt).toLocaleTimeString()}</span>
      </div>
    `).join("");
  } catch (e) { console.warn("SMS logs load error:", e); }
}
