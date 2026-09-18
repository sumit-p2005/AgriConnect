const API_BASE = window.location.origin.includes("localhost") ? "http://localhost:5000/api" : "/api";

function adToken() { return localStorage.getItem("ad_token"); }
function adSetSession(token, admin) {
  localStorage.setItem("ad_token", token);
  localStorage.setItem("ad_admin", JSON.stringify(admin));
}
function adAdmin() { try { return JSON.parse(localStorage.getItem("ad_admin")); } catch { return null; } }
function adLogout() { localStorage.removeItem("ad_token"); localStorage.removeItem("ad_admin"); window.location.href = "index.html"; }
function adRequireLogin() { if (!adToken()) window.location.href = "index.html"; }

const adHttp = axios.create({ baseURL: API_BASE });
adHttp.interceptors.request.use(cfg => {
  const tok = adToken();
  if (tok) cfg.headers.Authorization = `Bearer ${tok}`;
  return cfg;
});
function adErr(e) { return e?.response?.data?.error || "Network problem. Is the backend running?"; }

function adToday(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

const AD_STATUS_BADGE = {
  confirmed: "badge-blue", waitlisted: "badge-amber", arrived: "badge-blue",
  quality_check: "badge-blue", approved: "badge-blue", paid: "badge-green",
  completed: "badge-green", rejected: "badge-red", cancelled: "badge-gray"
};
function adBadge(status) {
  return `<span class="badge ${AD_STATUS_BADGE[status] || "badge-gray"}">${status.replace("_", " ")}</span>`;
}

function adSidebar(active) {
  const items = [
    ["dashboard.html", "📊", "Dashboard"],
    ["queue.html", "🚶", "Live Queue"],
    ["bookings.html", "📋", "All Bookings"],
    ["slots.html", "🏭", "Centres & Slots"],
    ["bulklots.html", "🤝", "Bulk Lots"],
    ["analytics.html", "📈", "Analytics"]
  ];
  const admin = adAdmin();
  return `
  <div class="sidebar">
    <div class="brand">AgriConnect
      <span class="role">${admin ? admin.name : ""}</span>
    </div>
    <nav>
      ${items.map(([href, icon, label]) => `<a class="${href === active ? "active" : ""}" href="${href}">${icon} ${label}</a>`).join("")}
    </nav>
    <div class="logout"><button onclick="adLogout()">🚪 Logout</button></div>
  </div>`;
}
