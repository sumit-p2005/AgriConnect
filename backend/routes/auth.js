const express = require("express");
const authController = require("../controllers/authController");

const router = express.Router();

// Captcha
router.get("/captcha", authController.getCaptcha);

// Farmer Auth
router.post("/farmer/register", authController.farmerRegister);
router.post("/farmer/login", authController.farmerLogin);

// Admin Auth
router.post("/admin/login", authController.adminLogin);

module.exports = router;
