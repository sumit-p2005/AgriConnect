let adLastBookings = [];

document.addEventListener("DOMContentLoaded", async () => {
  adRequireLogin();
  document.getElementById("shell").innerHTML = `
    ${adSidebar("bookings.html")}
    <div class="main">
      <div class="pagehead">
        <div><h1>All Bookings</h1><div class="sub">Full procurement record</div></div>
        <button class="btn" onclick="exportCsv()">⬇ Export CSV</button>
      </div>
      <div class="filters">
        <select id="centerFilter"><option value="">All centres</option></select>
        <input type="date" id="dateFilter">
        <select id="statusFilter">
          <option value="">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="waitlisted">Waitlisted</option>
          <option value="arrived">Arrived</option>
          <option value="quality_check">Quality checked</option>
          <option value="approved">Approved</option>
          <option value="paid">Paid</option>
          <option value="completed">Completed</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input type="text" id="cropFilter" placeholder="Crop type">
        <button class="btn btn-primary" onclick="loadBookings()">Apply</button>
      </div>
      <div class="panel">
        <div style="overflow-x:auto">
          <table>
            <thead><tr>
              <th>Date</th><th>Centre</th><th>Farmer</th><th>Village</th><th>Crop</th><th>Qty</th>
              <th>Token</th><th>Score</th><th>Status</th><th>Amount</th>
            </tr></thead>
            <tbody id="bookingsBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  const centers = (await adHttp.get("/admin/centers")).data;
  document.getElementById("centerFilter").innerHTML += centers.map(c => `<option value="${c._id}">${c.name}</option>`).join("");
  await loadBookings();
});

async function loadBookings() {
  const params = {
    centerId: document.getElementById("centerFilter").value,
    date: document.getElementById("dateFilter").value,
    status: document.getElementById("statusFilter").value,
    cropType: document.getElementById("cropFilter").value
  };
  const bookings = (await adHttp.get("/admin/bookings", { params })).data;
  adLastBookings = bookings;
  document.getElementById("bookingsBody").innerHTML = bookings.map(b => `
    <tr>
      <td>${b.slotId?.date || "-"}</td>
      <td>${b.centerId?.name || "-"}</td>
      <td>${b.farmerId?.name || "-"}</td>
      <td>${b.farmerId?.village || "-"}</td>
      <td>${b.cropType}</td>
      <td>${b.quantity}kg</td>
      <td class="mono">#${b.tokenNumber}</td>
      <td><span class="score-chip">${b.priorityScore?.toFixed(2)}</span></td>
      <td>${adBadge(b.status)}</td>
      <td class="mono">${b.approval?.totalAmount ? "Rs." + b.approval.totalAmount : "-"}</td>
    </tr>`).join("") || `<tr><td colspan="10" style="text-align:center;color:var(--slate-500)">No bookings match these filters.</td></tr>`;
}

function exportCsv() {
  const rows = [["Date", "Centre", "Farmer", "Phone", "Village", "Crop", "Qty(kg)", "Token", "Score", "Status", "Amount"]];
  adLastBookings.forEach(b => rows.push([
    b.slotId?.date || "", b.centerId?.name || "", b.farmerId?.name || "", b.farmerId?.phone || "",
    b.farmerId?.village || "", b.cropType, b.quantity, b.tokenNumber, b.priorityScore, b.status,
    b.approval?.totalAmount || ""
  ]));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `agriconnect_bookings_${adToday()}.csv`; a.click();
  URL.revokeObjectURL(url);
}
