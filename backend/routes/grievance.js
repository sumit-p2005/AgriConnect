const express = require("express");
const { requireAuth } = require("../middleware/auth");
const grievanceController = require("../controllers/grievanceController");

const router = express.Router();

// Farmer submissions & view
router.post("/", requireAuth("farmer"), grievanceController.submitGrievance);
router.get("/my", requireAuth("farmer"), grievanceController.getFarmerGrievances);

// Admin review & resolution
router.get("/", requireAuth("admin"), grievanceController.adminGetGrievances);
router.patch("/:id", requireAuth("admin"), grievanceController.adminResolveGrievance);

module.exports = router;
