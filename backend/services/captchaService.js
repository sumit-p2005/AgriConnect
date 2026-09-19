const crypto = require("crypto");

/**
 * Self-contained visual arithmetic & alphanumeric SVG captcha generator.
 * Zero external dependencies, runs offline, fast and lightweight.
 */
const captchaStore = new Map();
const TTL_MS = 5 * 60 * 1000; // 5 minutes validity

// Periodically clean up expired captchas
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of captchaStore.entries()) {
    if (now - data.createdAt > TTL_MS) {
      captchaStore.delete(id);
    }
  }
}, 60000);

function generateSvgCaptcha() {
  const id = crypto.randomBytes(16).toString("hex");
  
  // 50% chance of simple math, 50% 4-character code
  const isMath = Math.random() > 0.3;
  let text = "";
  let answer = "";

  if (isMath) {
    const a = Math.floor(Math.random() * 8) + 1; // 1 to 8
    const b = Math.floor(Math.random() * 8) + 1; // 1 to 8
    const op = Math.random() > 0.5 ? "+" : "-";
    if (op === "+") {
      text = `${a} + ${b} = ?`;
      answer = String(a + b);
    } else {
      const max = Math.max(a, b);
      const min = Math.min(a, b);
      text = `${max} - ${min} = ?`;
      answer = String(max - min);
    }
  } else {
    const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    for (let i = 0; i < 4; i++) {
      text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    answer = text.toLowerCase();
  }

  // Generate SVG with subtle organic distortion & styling
  const width = 140;
  const height = 44;
  
  // Colors matching agricultural theme
  const colors = ["#14532d", "#166534", "#15803d", "#047857", "#0f766e", "#b45309"];
  const charElements = text.split("").map((ch, i) => {
    const x = 16 + i * (width / (text.length + 1.2));
    const y = 28 + (Math.random() * 6 - 3);
    const rot = (Math.random() * 16 - 8);
    const color = colors[Math.floor(Math.random() * colors.length)];
    return `<text x="${x}" y="${y}" font-family="Poppins, Arial, sans-serif" font-size="20" font-weight="700" fill="${color}" transform="rotate(${rot}, ${x}, ${y})">${ch}</text>`;
  }).join("");

  // Noise lines and dots
  const line1 = `<line x1="5" y1="${Math.random()*40}" x2="135" y2="${Math.random()*40}" stroke="#dcfce7" stroke-width="2" />`;
  const line2 = `<line x1="5" y1="${Math.random()*40}" x2="135" y2="${Math.random()*40}" stroke="#fef3c7" stroke-width="1.5" />`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:#f8fafc;border-radius:8px;border:1.5px solid #e2e8f0;user-select:none;">
    <rect width="100%" height="100%" fill="#f8fafc" rx="8" />
    ${line1}
    ${line2}
    ${charElements}
  </svg>`;

  captchaStore.set(id, {
    answer: answer.toLowerCase().trim(),
    createdAt: Date.now()
  });

  return {
    id,
    svg,
    hint: isMath ? "Solve equation" : "Enter characters"
  };
}

function verifyCaptcha(id, userInput) {
  if (!id || !userInput) return false;
  const entry = captchaStore.get(id);
  if (!entry) return false;

  const isValid = entry.answer === String(userInput).toLowerCase().trim();
  captchaStore.delete(id); // single-use token
  return isValid;
}

module.exports = {
  generateSvgCaptcha,
  verifyCaptcha
};
