const express = require("express");
const { requireAuth } = require("../middleware/auth");
const adminController = require("../controllers/adminController");

const router = express.Router();
router.use(requireAuth("admin"));

// Control Room Metrics & Queue
router.get("/dashboard/stats", adminController.getDashboardStats);
router.get("/queue", adminController.getQueue);

// Bookings Actions (Live Queue & Control Room)
router.get("/bookings", adminController.getBookings);
router.post("/bookings/:id/checkin", adminController.checkinBooking);
router.post("/bookings/:id/quality-check", adminController.qualityCheckBooking);
router.post("/bookings/:id/approve", adminController.approveBooking);
router.post("/bookings/:id/payment", adminController.recordPayment);
router.post("/bookings/:id/pay", adminController.recordPayment); // Alias
router.post("/bookings/:id/complete", adminController.completeBooking);
router.post("/bookings/:id/reject", adminController.rejectBooking);
router.patch("/bookings/:id/status", adminController.updateBookingStatus);

// Centers & Slots
router.get("/centers", adminController.getCenters);
router.post("/centers", adminController.createCenter);
router.put("/centers/:id", adminController.updateCenter);
router.get("/centers/:centerId/attention", adminController.getCenterAttention);

router.get("/slots", adminController.getSlots);
router.post("/slots", adminController.createSlot);
router.put("/slots/:id", adminController.updateSlot);
router.delete("/slots/:id", adminController.deleteSlot);
router.post("/slots/bulk-generate", adminController.bulkGenerateSlots);

// Bulk Lots (Farmer Link)
router.get("/bulk-lots", adminController.getBulkLots);
router.post("/bulk-lots/cluster", adminController.clusterBulkLots);
router.post("/bulk-lots/:id/settle", adminController.settleBulkLot);

// Transport Fleet & Dispatch
router.get("/transport-requests", adminController.getTransportRequests);
router.get("/transport/requests", adminController.getTransportRequests);
router.post("/transport-requests/:id/assign", adminController.assignTransportPartner);
router.post("/transport/requests/:id/assign", adminController.assignTransportPartner);

// Live SMS Logs & System Analytics
router.get("/sms-logs", adminController.getSmsLogs);
router.get("/analytics", adminController.getAnalytics);

module.exports = router;
