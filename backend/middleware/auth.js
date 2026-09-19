const jwt = require("jsonwebtoken");

function sign(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET || "dev_secret", { expiresIn: "7d" });
}

function requireAuth(role) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Login required." });
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
      if (role && payload.role !== role) {
        return res.status(403).json({ error: "Not allowed for this account type." });
      }
      req.user = payload; // { id, role, name, ... }
      next();
    } catch {
      return res.status(401).json({ error: "Session expired, please log in again." });
    }
  };
}

module.exports = { sign, signToken: sign, requireAuth };
