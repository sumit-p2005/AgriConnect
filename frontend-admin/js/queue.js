document.addEventListener("DOMContentLoaded", async () => {
  adRequireLogin();
  document.getElementById("shell").innerHTML = `
    ${adSidebar("queue.html")}
    <div class="main">
      <div class="pagehead">
        <div><h1>Live Queue</h1><div class="sub">Physical line — sorted by slot time, then AI-assigned token</div></div>
        <div class="filters">
          <select id="centerFilter"></select>
          <input type="date" id="dateFilter" value="${adToday()}">
          <button class="btn" onclick="loadQueue()">Refresh</button>
        </div>
      </div>
      <div class="panel">
        <div style="overflow-x:auto">
          <table>
            <thead><tr>
              <th>Slot</th><th>Token</th><th>Farmer</th><th>Crop</th><th>Qty</th><th>Storage</th><th>Score</th><th>Status</th><th>Action</th>
            </tr></thead>
            <tbody id="queueBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  await loadCenters();
  const params = new URLSearchParams(location.search);
  if (params.get("centerId")) document.getElementById("centerFilter").value = params.get("centerId");
  if (params.get("date")) document.getElementById("dateFilter").value = params.get("date");
  await loadQueue();
});

async function loadCenters() {
  const centers = (await adHttp.get("/admin/centers")).data;
  const sel = document.getElementById("centerFilter");
  sel.innerHTML = centers.map(c => `<option value="${c._id}">${c.name}</option>`).join("");
  sel.dataset.loaded = "1";
}

let adQueueMap = {};

async function loadQueue() {
  const centerId = document.getElementById("centerFilter").value;
  const date = document.getElementById("dateFilter").value;
  if (!centerId) return;
  const bookings = (await adHttp.get("/admin/queue", { params: { centerId, date } })).data;
  adQueueMap = {};
  bookings.forEach(b => adQueueMap[b._id] = b);

  document.getElementById("queueBody").innerHTML = bookings.map(b => `
    <tr>
      <td>${b.slotId?.startTime}-${b.slotId?.endTime}</td>
      <td class="mono">#${b.tokenNumber}</td>
      <td>${b.farmerId?.name || "-"}<br><span class="mono" style="color:var(--slate-500)">${b.farmerId?.phone || ""}</span></td>
      <td>${b.cropType}</td>
      <td>${b.quantity}kg</td>
      <td>${b.storageCapability}</td>
      <td><span class="score-chip">${b.priorityScore?.toFixed(2)}</span></td>
      <td>${adBadge(b.status)}</td>
      <td>${actionButton(b)}</td>
    </tr>`).join("") || `<tr><td colspan="9" style="text-align:center;color:var(--slate-500)">No bookings for this centre/date.</td></tr>`;

  const params = new URLSearchParams(location.search);
  const openId = params.get("open");
  if (openId && adQueueMap[openId]) openModalById(openId);
}

function openModalById(id) {
  const b = adQueueMap[id];
  if (b) openModalFor(b);
}

function actionButton(b) {
  const map = {
    confirmed: `<button class="btn btn-xs btn-primary" onclick="doCheckin('${b._id}')">Mark Arrived</button>`,
    waitlisted: `<span class="badge badge-amber">Waiting for a spot</span>`,
    arrived: `<button class="btn btn-xs btn-primary" onclick="openModalById('${b._id}')">Quality Check</button>`,
    quality_check: `<button class="btn btn-xs btn-primary" onclick="openModalById('${b._id}')">Approve</button>`,
    approved: `<button class="btn btn-xs btn-primary" onclick="openModalById('${b._id}')">Record Payment</button>`,
    paid: `<button class="btn btn-xs btn-green" onclick="doComplete('${b._id}')">Mark Complete</button>`,
    completed: `<span class="badge badge-green">Done</span>`,
    rejected: `<span class="badge badge-red">Rejected</span>`,
    cancelled: `<span class="badge badge-gray">Cancelled</span>`
  };
  return map[b.status] || "-";
}

async function doCheckin(id) {
  try { await adHttp.post(`/admin/bookings/${id}/checkin`); loadQueue(); }
  catch (e) { alert(adErr(e)); }
}
async function doComplete(id) {
  try { await adHttp.post(`/admin/bookings/${id}/complete`); loadQueue(); }
  catch (e) { alert(adErr(e)); }
}

function openModalFor(b) {
  const root = document.getElementById("modalRoot");
  if (b.status === "arrived") root.innerHTML = qualityModal(b);
  else if (b.status === "quality_check") root.innerHTML = approveModal(b);
  else if (b.status === "approved") root.innerHTML = paymentModal(b);
}
function closeModal() { document.getElementById("modalRoot").innerHTML = ""; }

function qualityModal(b) {
  return `
  <div class="modal-backdrop"><div class="modal">
    <h3>Quality Check — ${b.cropType}</h3>
    <label>Grade</label>
    <select id="qcGrade"><option>A</option><option>B</option><option>C</option></select>
    <label>Moisture %</label>
    <input type="number" id="qcMoisture" value="12">
    <label>Remarks</label>
    <textarea id="qcRemarks" rows="2"></textarea>
    <label>Result</label>
    <select id="qcPass"><option value="true">Pass</option><option value="false">Fail / Reject</option></select>
    <div class="actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitQuality('${b._id}')">Save</button>
    </div>
  </div></div>`;
}
async function submitQuality(id) {
  const body = {
    grade: document.getElementById("qcGrade").value,
    moisturePct: parseFloat(document.getElementById("qcMoisture").value),
    remarks: document.getElementById("qcRemarks").value,
    pass: document.getElementById("qcPass").value === "true"
  };
  try { await adHttp.post(`/admin/bookings/${id}/quality-check`, body); closeModal(); loadQueue(); }
  catch (e) { alert(adErr(e)); }
}

function approveModal(b) {
  return `
  <div class="modal-backdrop"><div class="modal">
    <h3>Approve — ${b.cropType}</h3>
    <label>Final quantity (kg)</label>
    <input type="number" id="apQty" value="${b.quantity}">
    <label>Price per quintal (Rs.)</label>
    <input type="number" id="apPrice" value="2000">
    <div class="actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitApprove('${b._id}')">Approve</button>
    </div>
  </div></div>`;
}
async function submitApprove(id) {
  const body = {
    finalQuantity: parseFloat(document.getElementById("apQty").value),
    pricePerQuintal: parseFloat(document.getElementById("apPrice").value)
  };
  try { await adHttp.post(`/admin/bookings/${id}/approve`, body); closeModal(); loadQueue(); }
  catch (e) { alert(adErr(e)); }
}

function paymentModal(b) {
  return `
  <div class="modal-backdrop"><div class="modal">
    <h3>Record Payment</h3>
    <div class="mono" style="margin-bottom:8px">Amount due: Rs.${b.approval?.totalAmount ?? "-"}</div>
    <label>Mode</label>
    <select id="payMode"><option>UPI</option><option>NEFT</option><option>Cash</option></select>
    <label>Reference / UTR</label>
    <input type="text" id="payRef" placeholder="UTR123456">
    <div class="actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitPayment('${b._id}')">Save</button>
    </div>
  </div></div>`;
}
async function submitPayment(id) {
  const body = { mode: document.getElementById("payMode").value, reference: document.getElementById("payRef").value };
  try { await adHttp.post(`/admin/bookings/${id}/payment`, body); closeModal(); loadQueue(); }
  catch (e) { alert(adErr(e)); }
}
