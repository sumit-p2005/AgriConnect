/* Thin Axios wrapper + auth storage + a tiny offline queue-and-retry
   for the two write actions a farmer does most (book / cancel), so a
   patchy rural connection doesn't lose the action silently. */
const API_BASE = typeof API_BASE_URL !== "undefined" ? API_BASE_URL : (window.location.origin.includes("localhost") ? "http://localhost:5000/api" : `${window.location.origin}/api`);

function acToken() { return localStorage.getItem("ac_token"); }
function acSetSession(token, farmer) {
  localStorage.setItem("ac_token", token);
  localStorage.setItem("ac_farmer", JSON.stringify(farmer));
}
function acFarmer() { try { return JSON.parse(localStorage.getItem("ac_farmer")); } catch { return null; } }
function acLogout() { localStorage.removeItem("ac_token"); localStorage.removeItem("ac_farmer"); window.location.href = "index.html"; }
function acRequireLogin() { if (!acToken()) window.location.href = "index.html"; }

const acHttp = axios.create({ baseURL: API_BASE });
acHttp.interceptors.request.use(cfg => {
  const tok = acToken();
  if (tok) cfg.headers.Authorization = `Bearer ${tok}`;
  return cfg;
});

acHttp.interceptors.response.use(
  res => res,
  err => {
    if (err?.response?.status === 401) {
      acLogout();
    }
    return Promise.reject(err);
  }
);

function acErrorMsg(e) {
  if (e?.response?.data?.error) return e.response.data.error;
  if (e?.response?.status === 401) return "Session expired. Please log in again.";
  if (e?.message && !e.message.includes("Network")) return e.message;
  return "Network problem. Please check your connection and try again.";
}

/* ---------- Offline queue for write actions ---------- */
const AC_QUEUE_KEY = "ac_offline_queue";
function acQueueGet() { try { return JSON.parse(localStorage.getItem(AC_QUEUE_KEY)) || []; } catch { return []; } }
function acQueueSet(q) { localStorage.setItem(AC_QUEUE_KEY, JSON.stringify(q)); }

function acQueueAction(method, url, data) {
  const q = acQueueGet();
  q.push({ method, url, data, at: Date.now() });
  acQueueSet(q);
}

async function acFlushQueue() {
  const q = acQueueGet();
  if (!q.length) return;
  const remaining = [];
  for (const item of q) {
    try {
      await acHttp.request({ method: item.method, url: item.url, data: item.data });
    } catch {
      remaining.push(item); // still failing, keep for next attempt
    }
  }
  acQueueSet(remaining);
}

/* Try an action online; if it fails due to being offline, queue it and
   tell the caller so the UI can show "will send when back online". */
async function acWriteWithFallback(method, url, data) {
  if (!navigator.onLine) {
    acQueueAction(method, url, data);
    return { queued: true };
  }
  try {
    const res = await acHttp.request({ method, url, data });
    return { queued: false, data: res.data };
  } catch (e) {
    if (!navigator.onLine) {
      acQueueAction(method, url, data);
      return { queued: true };
    }
    throw e;
  }
}

window.addEventListener("online", acFlushQueue);
document.addEventListener("DOMContentLoaded", () => {
  if (navigator.onLine) acFlushQueue();
  const banner = document.getElementById("offlineBanner");
  function syncBanner() {
    if (!banner) return;
    banner.classList.toggle("hidden", navigator.onLine);
  }
  window.addEventListener("online", syncBanner);
  window.addEventListener("offline", syncBanner);
  syncBanner();
});
