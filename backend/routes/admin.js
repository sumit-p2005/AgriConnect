const express = require("express");
const { requireAuth } = require("../middleware/auth");
const adminController = require("../controllers/adminController");

const router = express.Router();
router.use(requireAuth("admin"));

// Control Room Metrics & Queue
router.get("/dashboard/stats", adminController.getDashboardStats);
router.get("/queue", adminController.getQueue);
router.patch("/bookings/:id/status", adminController.updateBookingStatus);

// Centers & Slots
router.get("/centers", adminController.getCenters);
router.post("/centers", adminController.createCenter);
router.put("/centers/:id", adminController.updateCenter);
router.get("/slots", adminController.getSlots);
router.post("/slots", adminController.createSlot);
router.delete("/slots/:id", adminController.deleteSlot);

// Bulk Lots (Farmer Link)
router.get("/bulk-lots", adminController.getBulkLots);
router.post("/bulk-lots/cluster", adminController.clusterBulkLots);
router.post("/bulk-lots/:id/settle", adminController.settleBulkLot);

// Transport Dispatch
router.get("/transport/requests", adminController.getTransportRequests);
router.post("/transport/requests/:id/assign", adminController.assignTransportPartner);

module.exports = router;
