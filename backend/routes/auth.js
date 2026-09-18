const express = require("express");
const bcrypt = require("bcryptjs");
const Farmer = require("../models/Farmer");
const Admin = require("../models/Admin");
const { sign } = require("../middleware/auth");

const router = express.Router();

// ---------- Farmer register ----------
router.post("/farmer/register", async (req, res) => {
  try {
    const { name, phone, password, village, district, state, primaryCrop, storageCapability, lat, lng } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ error: "Name, phone and password are required." });
    }
    const existing = await Farmer.findOne({ phone });
    if (existing) return res.status(409).json({ error: "This phone number is already registered." });

    const passwordHash = await bcrypt.hash(password, 10);
    const farmer = await Farmer.create({
      name, phone, passwordHash, village, district, state, primaryCrop,
      storageCapability: storageCapability || "none",
      location: { lat: lat || 30.9, lng: lng || 75.6 }
    });

    const token = sign({ id: farmer._id, role: "farmer", name: farmer.name });
    res.json({ token, farmer: { id: farmer._id, name: farmer.name, phone: farmer.phone } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Farmer login ----------
router.post("/farmer/login", async (req, res) => {
  try {
    const { phone, password } = req.body;
    const farmer = await Farmer.findOne({ phone });
    if (!farmer) return res.status(401).json({ error: "No account found for this phone number." });
    const ok = await bcrypt.compare(password, farmer.passwordHash);
    if (!ok) return res.status(401).json({ error: "Incorrect password." });
    const token = sign({ id: farmer._id, role: "farmer", name: farmer.name });
    res.json({ token, farmer: { id: farmer._id, name: farmer.name, phone: farmer.phone } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Admin login ----------
router.post("/admin/login", async (req, res) => {
  try {
    const { phone, password } = req.body;
    const admin = await Admin.findOne({ phone });
    if (!admin) return res.status(401).json({ error: "No admin account found for this phone/ID." });
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) return res.status(401).json({ error: "Incorrect password." });
    const token = sign({ id: admin._id, role: "admin", name: admin.name, adminRole: admin.role, centerId: admin.centerId });
    res.json({ token, admin: { id: admin._id, name: admin.name, role: admin.role, centerId: admin.centerId } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
