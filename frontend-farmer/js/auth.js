let selectedStorage = "none";
let currentCaptchaId = null;

async function loadCaptcha() {
  const box = document.getElementById("captchaSvgBox");
  if (!box) return;
  box.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color:var(--green-700)"></i>';
  try {
    const res = await acHttp.get("/auth/captcha");
    currentCaptchaId = res.data.id;
    box.innerHTML = res.data.svg;
    const ansInput = document.getElementById("captchaAnswer");
    if (ansInput) {
      ansInput.value = "";
      ansInput.placeholder = res.data.hint || "Enter answer";
    }
  } catch (e) {
    box.innerHTML = '<span style="color:#ef4444;font-size:12px;">Failed to load</span>';
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (acToken()) { window.location.href = "home.html"; return; }
  loadCaptcha();
  document.querySelectorAll("#storageChoices .icon-choice").forEach(el => {
    el.addEventListener("click", () => {
      document.querySelectorAll("#storageChoices .icon-choice").forEach(x => x.classList.remove("selected"));
      el.classList.add("selected");
      selectedStorage = el.dataset.val;
    });
  });
  const firstStorage = document.querySelector("#storageChoices .icon-choice");
  if (firstStorage) firstStorage.classList.add("selected");
});

function showRegister() {
  document.getElementById("loginForm").classList.add("hidden");
  document.getElementById("registerForm").classList.remove("hidden");
}
function showLogin() {
  document.getElementById("registerForm").classList.add("hidden");
  document.getElementById("loginForm").classList.remove("hidden");
  loadCaptcha();
}
function showError(msg) {
  const box = document.getElementById("errorBox");
  box.textContent = msg;
  box.classList.remove("hidden");
}

async function doLogin() {
  const phone = document.getElementById("loginPhone").value.trim();
  const password = document.getElementById("loginPassword").value;
  const captchaAnswer = document.getElementById("captchaAnswer")?.value.trim();

  if (!phone || !password) {
    return showError("Please enter both phone number and password.");
  }
  if (!captchaAnswer) {
    return showError("Please complete the Security Check captcha.");
  }

  try {
    const res = await acHttp.post("/auth/farmer/login", {
      phone,
      password,
      captchaId: currentCaptchaId,
      captchaAnswer
    });
    acSetSession(res.data.token, res.data.farmer);
    window.location.href = "home.html";
  } catch (e) {
    showError(acErrorMsg(e));
    loadCaptcha(); // refresh captcha on failure
  }
}

async function doRegister() {
  const body = {
    name: document.getElementById("regName").value.trim(),
    phone: document.getElementById("regPhone").value.trim(),
    password: document.getElementById("regPassword").value,
    village: document.getElementById("regVillage").value.trim(),
    district: document.getElementById("regDistrict").value.trim(),
    state: document.getElementById("regState").value.trim(),
    primaryCrop: document.getElementById("regCrop").value.trim(),
    storageCapability: selectedStorage
  };
  if (!body.name || !body.phone || !body.password) return showError("Please fill name, phone and password.");
  try {
    const res = await acHttp.post("/auth/farmer/register", body);
    acSetSession(res.data.token, res.data.farmer);
    window.location.href = "home.html";
  } catch (e) { showError(acErrorMsg(e)); }
}
