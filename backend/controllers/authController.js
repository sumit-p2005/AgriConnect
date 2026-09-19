const bcrypt = require("bcryptjs");
const Farmer = require("../models/Farmer");
const Admin = require("../models/Admin");
const { signToken } = require("../middleware/auth");
const { generateSvgCaptcha, verifyCaptcha } = require("../services/captchaService");

/**
 * Auth Controller (MVC)
 * Handles Captcha generation & verification, Farmer Auth, and Admin Auth.
 */

exports.getCaptcha = (req, res) => {
  try {
    const captcha = generateSvgCaptcha();
    res.json(captcha);
  } catch (err) {
    res.status(500).json({ error: "Failed to generate captcha: " + err.message });
  }
};

exports.farmerRegister = async (req, res) => {
  try {
    const { phone, password, name, village, district, state, primaryCrop, storageCapability } = req.body;
    if (!phone || !password || !name) {
      return res.status(400).json({ error: "Phone, password, and name are required." });
    }

    const existing = await Farmer.findOne({ phone });
    if (existing) {
      return res.status(400).json({ error: "An account already exists with this phone number." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const farmer = await Farmer.create({
      phone,
      passwordHash,
      name,
      village: village || "Punjab Village",
      district: district || "Phagwara",
      state: state || "Punjab",
      primaryCrop: primaryCrop || "Wheat",
      storageCapability: storageCapability || "none",
      location: { lat: 31.22 + Math.random() * 0.08, lng: 75.75 + Math.random() * 0.08 }
    });

    const token = signToken({ id: farmer._id, role: "farmer", phone: farmer.phone });
    res.json({
      token,
      farmer: {
        id: farmer._id,
        name: farmer.name,
        phone: farmer.phone,
        village: farmer.village,
        district: farmer.district,
        primaryCrop: farmer.primaryCrop,
        storageCapability: farmer.storageCapability
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.farmerLogin = async (req, res) => {
  try {
    const { phone, password, captchaId, captchaAnswer } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: "Phone and password are required." });
    }

    // Captcha validation (if supplied)
    if (captchaId) {
      const isCaptchaValid = verifyCaptcha(captchaId, captchaAnswer);
      if (!isCaptchaValid) {
        return res.status(400).json({ error: "Incorrect Captcha answer. Please try again." });
      }
    }

    const farmer = await Farmer.findOne({ phone });
    if (!farmer) {
      return res.status(401).json({ error: "No farmer account found with this phone number." });
    }

    const isMatch = await bcrypt.compare(password, farmer.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Incorrect password. Please try again." });
    }

    const token = signToken({ id: farmer._id, role: "farmer", phone: farmer.phone });
    res.json({
      token,
      farmer: {
        id: farmer._id,
        name: farmer.name,
        phone: farmer.phone,
        village: farmer.village,
        district: farmer.district,
        primaryCrop: farmer.primaryCrop,
        storageCapability: farmer.storageCapability
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.adminLogin = async (req, res) => {
  try {
    const { phone, password, captchaId, captchaAnswer } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: "Phone and password are required." });
    }

    if (captchaId) {
      const isCaptchaValid = verifyCaptcha(captchaId, captchaAnswer);
      if (!isCaptchaValid) {
        return res.status(400).json({ error: "Incorrect Captcha. Please solve the security check." });
      }
    }

    const admin = await Admin.findOne({ phone, active: true });
    if (!admin) {
      return res.status(401).json({ error: "No active admin found with this phone number." });
    }

    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    const token = signToken({ id: admin._id, role: "admin", centerId: admin.centerId, adminRole: admin.role });
    res.json({
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        phone: admin.phone,
        role: admin.role,
        centerId: admin.centerId
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
