const express = require("express");
const { requireAuth } = require("../middleware/auth");
const farmerController = require("../controllers/farmerController");
const groupController = require("../controllers/groupController");

const router = express.Router();
router.use(requireAuth("farmer"));

// Reference Data
router.get("/crops", farmerController.getCrops);
router.get("/centers", farmerController.getCenters);
router.get("/centers/nearby", farmerController.getNearbyCenters);
router.get("/centers/:id/slots", farmerController.getCenterSlots);
router.get("/price/:cropType", farmerController.getCropPrice);

// Bookings
router.post("/bookings", farmerController.createBooking);
router.get("/bookings", farmerController.getFarmerBookings);
router.get("/bookings/:id", farmerController.getBookingById);
router.post("/bookings/:id/cancel", farmerController.cancelBooking);

// Transport
router.post("/transport-requests", farmerController.createTransportRequest);
router.get("/bookings/:id/transport", farmerController.getBookingTransport);

// Farmer Link & Group Pooling
router.get("/my-group", groupController.getMyGroup);
router.get("/my-group/opportunities", groupController.getNearbyPoolOpportunities);
router.post("/my-group/auto-pool", groupController.triggerAutoPool);

// Profile
router.get("/profile", farmerController.getFarmerProfile);

module.exports = router;
