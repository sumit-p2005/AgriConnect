/* Shared status -> icon/badge-class/label-key mapping, used across pages. */
const AC_STATUS_META = {
  confirmed:      { icon: '<i class="fa-solid fa-circle-check" aria-label="confirmed"></i>', cls: "badge-green", key: "status_confirmed" },
  waitlisted:     { icon: '<i class="fa-solid fa-clock" aria-label="waitlisted"></i>', cls: "badge-gold",  key: "status_waitlisted" },
  arrived:        { icon: '<i class="fa-solid fa-person-walking" aria-label="arrived"></i>', cls: "badge-blue",  key: "status_arrived" },
  quality_check:  { icon: '<i class="fa-solid fa-magnifying-glass" aria-label="quality check"></i>', cls: "badge-blue",  key: "status_quality_check" },
  approved:       { icon: '<i class="fa-solid fa-file-signature" aria-label="approved"></i>', cls: "badge-blue",  key: "status_approved" },
  paid:           { icon: '<i class="fa-solid fa-indian-rupee-sign" aria-label="paid"></i>', cls: "badge-green", key: "status_paid" },
  completed:      { icon: '<i class="fa-solid fa-circle-check" aria-label="completed"></i>', cls: "badge-green", key: "status_completed" },
  rejected:       { icon: '<i class="fa-solid fa-circle-xmark" aria-label="rejected"></i>', cls: "badge-red",   key: "status_rejected" },
  cancelled:      { icon: '<i class="fa-solid fa-ban" aria-label="cancelled"></i>', cls: "badge-red",   key: "status_cancelled" }
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
    { key: "confirmed", icon: '<i class="fa-solid fa-circle-check" aria-label="confirmed"></i>', textKey: "timeline_booked" },
    { key: "arrived", icon: '<i class="fa-solid fa-person-walking" aria-label="arrived"></i>', textKey: "timeline_arrived" },
    { key: "quality_check", icon: '<i class="fa-solid fa-magnifying-glass" aria-label="quality check"></i>', textKey: "timeline_quality" },
    { key: "approved", icon: '<i class="fa-solid fa-file-signature" aria-label="approved"></i>', textKey: "timeline_approved" },
    { key: "paid", icon: '<i class="fa-solid fa-indian-rupee-sign" aria-label="paid"></i>', textKey: "timeline_paid" },
    { key: "completed", icon: '<i class="fa-solid fa-circle-check" aria-label="completed"></i>', textKey: "timeline_completed" }
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
    const badIcon = booking.status === "rejected"
      ? '<i class="fa-solid fa-circle-xmark" aria-label="rejected"></i>'
      : '<i class="fa-solid fa-ban" aria-label="cancelled"></i>';
    html += `
      <div class="tl-step rejected">
        <div class="tl-dot-col"><div class="tl-dot">${badIcon}</div></div>
        <div class="tl-text">
          <div class="title">${t(booking.status === "rejected" ? "status_rejected" : "status_cancelled")}</div>
          ${booking.qualityCheck?.remarks ? `<div class="desc">${booking.qualityCheck.remarks}</div>` : ""}
        </div>
      </div>`;
  }
  return html;
}
