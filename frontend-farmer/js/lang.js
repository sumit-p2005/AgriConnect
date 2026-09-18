/* Multi-language string-table i18n (English, Hindi, Punjabi, Marathi) */
const AC_LANGS = {
  en: "js/lang/en.json",
  hi: "js/lang/hi.json",
  pa: "js/lang/pa.json",
  mr: "js/lang/mr.json"
};
let AC_STRINGS = {};

async function acLoadLang() {
  const lang = localStorage.getItem("ac_lang") || "en";
  try {
    const res = await fetch(AC_LANGS[lang] || AC_LANGS.en);
    AC_STRINGS = await res.json();
  } catch (e) {
    console.warn("Failed loading lang dictionary:", e);
  }
  document.documentElement.lang = lang;
  acApplyStrings();
}

function t(key) {
  return AC_STRINGS[key] || key;
}

function acApplyStrings() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const k = el.getAttribute("data-i18n");
    if (k && AC_STRINGS[k]) el.textContent = AC_STRINGS[k];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const k = el.getAttribute("data-i18n-placeholder");
    if (k && AC_STRINGS[k]) el.setAttribute("placeholder", AC_STRINGS[k]);
  });
  document.querySelectorAll(".lang-select").forEach(sel => {
    sel.value = localStorage.getItem("ac_lang") || "en";
  });
}

function acSetLang(lang) {
  localStorage.setItem("ac_lang", lang);
  acLoadLang();
}

function acToggleLang() {
  const order = ["en", "hi", "pa", "mr"];
  const cur = localStorage.getItem("ac_lang") || "en";
  const idx = order.indexOf(cur);
  const next = order[(idx + 1) % order.length];
  acSetLang(next);
}

function acRenderLangControl() {
  const cur = localStorage.getItem("ac_lang") || "en";
  return `
    <select class="lang-select" onchange="acSetLang(this.value)" style="background:#166534;color:white;border:1px solid #22c55e;border-radius:8px;padding:4px 8px;font-weight:600;font-size:13px;cursor:pointer;">
      <option value="en" ${cur === "en" ? "selected" : ""}>English</option>
      <option value="hi" ${cur === "hi" ? "selected" : ""}>हिंदी</option>
      <option value="pa" ${cur === "pa" ? "selected" : ""}>ਪੰਜਾਬੀ</option>
      <option value="mr" ${cur === "mr" ? "selected" : ""}>मराठी</option>
    </select>
  `;
}

document.addEventListener("DOMContentLoaded", acLoadLang);
