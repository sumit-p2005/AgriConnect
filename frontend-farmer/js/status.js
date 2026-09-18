/* Shared status -> icon/badge-class/label-key mapping, used across pages. */
const AC_STATUS_META = {
  confirmed:      { icon: "✅", cls: "badge-green", key: "status_confirmed" },
  waitlisted:     { icon: "⏳", cls: "badge-gold",  key: "status_waitlisted" },
  arrived:        { icon: "🚶", cls: "badge-blue",  key: "status_arrived" },
  quality_check:  { icon: "🔍", cls: "badge-blue",  key: "status_quality_check" },
  approved:       { icon: "📝", cls: "badge-blue",  key: "status_approved" },
  paid:           { icon: "💰", cls: "badge-green", key: "status_paid" },
  completed:      { icon: "🎉", cls: "badge-green", key: "status_completed" },
  rejected:       { icon: "❌", cls: "badge-red",   key: "status_rejected" },
  cancelled:      { icon: "🚫", cls: "badge-red",   key: "status_cancelled" }
};

function acBadge(status) {
  const m = AC_STATUS_META[status] || { icon: "•", cls: "badge-gold", key: status };
  return `<span class="badge ${m.cls}">${m.icon} ${t(m.key)}</span>`;
}

const AC_TIMELINE_ORDER = ["confirmed", "arrived", "quality_check", "approved", "paid", "completed"];

function acTimelineHtml(booking) {
  const terminalBad = booking.status === "rejected" || booking.status === "cancelled";
  const currentIndex = AC_TIMELINE_ORDER.indexOf(booking.status);
  const steps = [
    { key: "confirmed", icon: "✅", textKey: "timeline_booked" },
    { key: "arrived", icon: "🚶", textKey: "timeline_arrived" },
    { key: "quality_check", icon: "🔍", textKey: "timeline_quality" },
    { key: "approved", icon: "📝", textKey: "timeline_approved" },
    { key: "paid", icon: "💰", textKey: "timeline_paid" },
    { key: "completed", icon: "🎉", textKey: "timeline_completed" }
  ];

  let html = "";
  steps.forEach((s, i) => {
    let stateCls = "";
    if (!terminalBad) {
      if (i < currentIndex) stateCls = "done";
      else if (i === currentIndex) stateCls = "current";
    }
    html += `
      <div class="tl-step ${stateCls}">
        <div class="tl-dot-col">
          <div class="tl-dot">${s.icon}</div>
          ${i < steps.length - 1 ? '<div class="tl-line"></div>' : ""}
        </div>
        <div class="tl-text">
          <div class="title">${t(s.key)}</div>
          ${stateCls === "current" ? `<div class="desc">${t(s.textKey)}</div>` : ""}
        </div>
      </div>`;
  });

  if (terminalBad) {
    html += `
      <div class="tl-step rejected">
        <div class="tl-dot-col"><div class="tl-dot">${booking.status === "rejected" ? "❌" : "🚫"}</div></div>
        <div class="tl-text">
          <div class="title">${t(booking.status === "rejected" ? "status_rejected" : "status_cancelled")}</div>
          ${booking.qualityCheck?.remarks ? `<div class="desc">${booking.qualityCheck.remarks}</div>` : ""}
        </div>
      </div>`;
  }
  return html;
}
