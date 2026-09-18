document.addEventListener("DOMContentLoaded", async () => {
  adRequireLogin();
  document.getElementById("shell").innerHTML = `
    ${adSidebar("analytics.html")}
    <div class="main">
      <div class="pagehead">
        <div><h1>Analytics</h1><div class="sub">Throughput, wait time and rejection rate across all centres</div></div>
      </div>
      <div class="tiles" id="tiles"></div>
      <div class="panel">
        <div class="panel-head">Bookings by status</div>
        <div style="padding:16px" id="statusChart"></div>
      </div>
      <div class="panel">
        <div class="panel-head">Bookings by crop</div>
        <div style="padding:16px" id="cropChart"></div>
      </div>
      <div class="panel">
        <div class="panel-head">Bookings by date</div>
        <div style="padding:16px" id="dateChart"></div>
      </div>
    </div>
  `;
  const res = (await adHttp.get("/admin/analytics")).data;

  document.getElementById("tiles").innerHTML = `
    <div class="tile"><div class="label">Total bookings</div><div class="value">${res.totalBookings}</div></div>
    <div class="tile"><div class="label">Avg. wait time</div><div class="value">${res.avgWaitMinutes}m</div></div>
    <div class="tile"><div class="label">Rejection rate</div><div class="value">${res.rejectionRate}%</div></div>
  `;

  renderBarChart("statusChart", res.byStatus);
  renderBarChart("cropChart", res.byCrop);
  renderBarChart("dateChart", res.byDate);
});

function renderBarChart(elId, dataObj) {
  const entries = Object.entries(dataObj);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  document.getElementById(elId).innerHTML = entries.map(([label, val]) => `
    <div class="chart-bar-row">
      <div class="chart-label">${label}</div>
      <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${(val / max) * 100}%"></div></div>
      <div class="chart-value">${val}</div>
    </div>`).join("") || `<div style="color:var(--slate-500)">No data yet.</div>`;
}
