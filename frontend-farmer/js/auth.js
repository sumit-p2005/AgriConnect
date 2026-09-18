let selectedStorage = "none";

document.addEventListener("DOMContentLoaded", () => {
  if (acToken()) { window.location.href = "home.html"; return; }
  document.querySelectorAll("#storageChoices .icon-choice").forEach(el => {
    el.addEventListener("click", () => {
      document.querySelectorAll("#storageChoices .icon-choice").forEach(x => x.classList.remove("selected"));
      el.classList.add("selected");
      selectedStorage = el.dataset.val;
    });
  });
  document.querySelector("#storageChoices .icon-choice").classList.add("selected");
});

function showRegister() {
  document.getElementById("loginForm").classList.add("hidden");
  document.getElementById("registerForm").classList.remove("hidden");
}
function showLogin() {
  document.getElementById("registerForm").classList.add("hidden");
  document.getElementById("loginForm").classList.remove("hidden");
}
function showError(msg) {
  const box = document.getElementById("errorBox");
  box.textContent = msg;
  box.classList.remove("hidden");
}

async function doLogin() {
  const phone = document.getElementById("loginPhone").value.trim();
  const password = document.getElementById("loginPassword").value;
  try {
    const res = await acHttp.post("/auth/farmer/login", { phone, password });
    acSetSession(res.data.token, res.data.farmer);
    window.location.href = "home.html";
  } catch (e) { showError(acErrorMsg(e)); }
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
