const express = require("express");
const bcrypt = require("bcryptjs");
const Farmer = require("../models/Farmer");
const Crop = require("../models/Crop");
const Center = require("../models/Center");
const Slot = require("../models/Slot");
const Booking = require("../models/Booking");
const BulkLot = require("../models/BulkLot");
const TransportRequest = require("../models/TransportRequest");
const TransportPartner = require("../models/TransportPartner");
const SmsLog = require("../models/SmsLog");
const { requireAuth } = require("../middleware/auth");
const { reorderSlotQueue } = require("../services/scheduler");
const { clusterFarmers, buildLotEconomics, haversineDistance } = require("../services/clustering");
const { notify } = require("../services/notify");
const { sendSms } = require("../services/smsService");

const router = express.Router();
router.use(requireAuth("admin"));

async function logAndNotify(booking, message) {
  const farmer = await Farmer.findById(booking.farmerId);
  if (farmer) {
    await notify(farmer.phone, message);
    await sendSms(farmer.phone, message);
  }
  booking.notificationsLog.push({ message });
}

// ---------- Dashboard stats ----------
router.get("/dashboard", async (req, res) => {
  const { centerId, date } = req.query;
  const match = {};
  if (centerId) match.centerId = centerId;
  if (date) {
    const slots = await Slot.find({ date }).select("_id");
    match.slotId = { $in: slots.map(s => s._id) };
  }

  const bookings = await Booking.find(match);
  const byStatus = {};
  let totalQuantity = 0, totalValue = 0;
  bookings.forEach(b => {
    byStatus[b.status] = (byStatus[b.status] || 0) + 1;
    totalQuantity += b.quantity || 0;
    totalValue += b.approval?.totalAmount || 0;
  });

  const needsAttention = await Booking.find({
    ...match,
    status: { $in: ["confirmed", "arrived", "quality_check", "approved"] }
  })
    .populate("farmerId", "name phone")
    .populate("centerId", "name")
    .populate("slotId", "date startTime endTime")
    .sort({ priorityScore: -1, tokenNumber: 1 })
    .limit(25);

  const pendingTransportCount = await TransportRequest.countDocuments({ status: "requested" });

  res.json({ byStatus, totalQuantity, totalValue, totalBookings: bookings.length, needsAttention, pendingTransportCount });
});

// ---------- Live queue (physical line view) ----------
router.get("/queue", async (req, res) => {
  const { centerId, date } = req.query;
  if (!centerId || !date) return res.status(400).json({ error: "centerId and date are required." });
  const slots = await Slot.find({ centerId, date }).sort({ startTime: 1 });
  const slotIds = slots.map(s => s._id);
  const bookings = await Booking.find({
    slotId: { $in: slotIds },
    status: { $in: ["confirmed", "waitlisted", "arrived", "quality_check", "approved"] }
  })
    .populate("farmerId", "name phone")
    .populate("slotId", "startTime endTime")
    .sort({ tokenNumber: 1 });
  res.json(bookings);
});

// ---------- Full bookings table ----------
router.get("/bookings", async (req, res) => {
  const { centerId, date, status, cropType } = req.query;
  const filter = {};
  if (centerId) filter.centerId = centerId;
  if (status) filter.status = status;
  if (cropType) filter.cropType = new RegExp(`^${cropType}$`, "i");
  if (date) {
    const slots = await Slot.find({ date }).select("_id");
    filter.slotId = { $in: slots.map(s => s._id) };
  }
  const bookings = await Booking.find(filter)
    .populate("farmerId", "name phone village")
    .populate("centerId", "name")
    .populate("slotId", "date startTime endTime")
    .sort({ createdAt: -1 });
  res.json(bookings);
});

// ---------- Lifecycle actions ----------
router.post("/bookings/:id/checkin", async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  if (booking.status !== "confirmed") return res.status(400).json({ error: "Only confirmed bookings can be checked in." });
  booking.status = "arrived";
  await logAndNotify(booking, "AgriConnect: You've been checked in. Please wait for quality check.");
  await booking.save();
  res.json(booking);
});

router.post("/bookings/:id/quality-check", async (req, res) => {
  const { grade, moisturePct, remarks, pass } = req.body;
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  if (booking.status !== "arrived") return res.status(400).json({ error: "Booking must be checked in first." });
  booking.qualityCheck = { grade, moisturePct, remarks, pass: !!pass };
  booking.status = pass ? "quality_check" : "rejected";
  const msg = pass
    ? `AgriConnect: Quality check passed (Grade ${grade}). Moving to approval.`
    : `AgriConnect: Quality check did not pass. Reason: ${remarks || "see centre officer"}.`;
  await logAndNotify(booking, msg);
  await booking.save();
  res.json(booking);
});

router.post("/bookings/:id/approve", async (req, res) => {
  const { finalQuantity, pricePerQuintal } = req.body;
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  if (booking.status !== "quality_check") return res.status(400).json({ error: "Booking must pass quality check first." });
  const totalAmount = +(((finalQuantity || booking.quantity) / 100) * pricePerQuintal).toFixed(2);
  booking.approval = { finalQuantity: finalQuantity || booking.quantity, pricePerQuintal, totalAmount };
  booking.status = "approved";
  await logAndNotify(booking, `AgriConnect: Approved! ${booking.approval.finalQuantity}kg @ Rs.${pricePerQuintal}/quintal = Rs.${totalAmount}.`);
  await booking.save();
  res.json(booking);
});

router.post("/bookings/:id/payment", async (req, res) => {
  const { mode, reference } = req.body;
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  if (booking.status !== "approved") return res.status(400).json({ error: "Booking must be approved before payment." });
  booking.payment = { mode, reference, paidAt: new Date() };
  booking.status = "paid";
  await logAndNotify(booking, `AgriConnect: Payment of Rs.${booking.approval.totalAmount} recorded (${mode}, ref ${reference}). Thank you!`);
  await booking.save();
  res.json(booking);
});

router.post("/bookings/:id/complete", async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  if (booking.status !== "paid") return res.status(400).json({ error: "Booking must be paid before marking complete." });
  booking.status = "completed";
  const farmer = await Farmer.findById(booking.farmerId);
  if (farmer) {
    farmer.totalArrivals += 1;
    farmer.onTimeArrivals += 1;
    farmer.reputationScore = Math.round((farmer.onTimeArrivals / farmer.totalArrivals) * 100);
    await farmer.save();
  }
  await logAndNotify(booking, "AgriConnect: Procurement complete. See you next season!");
  await booking.save();
  res.json(booking);
});

// ---------- Transport Requests Management ----------
router.get("/transport-requests", async (req, res) => {
  const requests = await TransportRequest.find()
    .populate("farmerId", "name phone village location")
    .populate("bookingId", "cropType quantity tokenNumber")
    .populate("assignedPartnerId")
    .sort({ createdAt: -1 });
  res.json(requests);
});

router.get("/transport-partners", async (req, res) => {
  res.json(await TransportPartner.find().sort({ available: -1, vehicleNumber: 1 }));
});

router.post("/transport-requests/:id/assign", async (req, res) => {
  try {
    const transportReq = await TransportRequest.findById(req.params.id)
      .populate("farmerId")
      .populate("bookingId");
    if (!transportReq) return res.status(404).json({ error: "Transport request not found." });

    let partnerId = req.body.partnerId;
    if (!partnerId) {
      const pickupLat = transportReq.pickupLocation?.lat || 31.25;
      const pickupLng = transportReq.pickupLocation?.lng || 75.70;
      const availablePartners = await TransportPartner.find({ available: true });
      if (!availablePartners.length) {
        return res.status(400).json({ error: "No available transport partners at the moment." });
      }
      availablePartners.sort((a, b) => {
        const distA = haversineDistance(pickupLat, pickupLng, a.currentLocation.lat, a.currentLocation.lng);
        const distB = haversineDistance(pickupLat, pickupLng, b.currentLocation.lat, b.currentLocation.lng);
        return distA - distB;
      });
      partnerId = availablePartners[0]._id;
    }

    const partner = await TransportPartner.findById(partnerId);
    if (!partner) return res.status(404).json({ error: "Transport partner vehicle not found." });

    transportReq.assignedPartnerId = partner._id;
    transportReq.status = "assigned";
    await transportReq.save();

    partner.available = false;
    await partner.save();

    const msg = `AgriConnect: Transport assigned! Vehicle ${partner.vehicleNumber} (Driver ${partner.driverName}, Ph: ${partner.driverPhone}) is en route to pickup your harvest.`;
    if (transportReq.farmerId?.phone) {
      await sendSms(transportReq.farmerId.phone, msg);
    }

    res.json(await TransportRequest.findById(transportReq._id).populate("assignedPartnerId").populate("farmerId"));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- SMS Logs ----------
router.get("/sms-logs", async (req, res) => {
  res.json(await SmsLog.find().sort({ sentAt: -1 }).limit(100));
});

// ---------- Centre management ----------
router.get("/centers", async (req, res) => res.json(await Center.find().sort({ name: 1 })));

router.post("/centers", async (req, res) => {
  const center = await Center.create(req.body);
  res.json(center);
});

router.put("/centers/:id", async (req, res) => {
  const center = await Center.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(center);
});

// ---------- Slot management ----------
router.get("/slots", async (req, res) => {
  const { centerId, date } = req.query;
  const filter = {};
  if (centerId) filter.centerId = centerId;
  if (date) filter.date = date;
  res.json(await Slot.find(filter).sort({ startTime: 1 }));
});

router.post("/slots/bulk-generate", async (req, res) => {
  const { centerId, date, startHour, endHour, windowHours, capacityPerWindow } = req.body;
  const slots = [];
  for (let h = startHour; h < endHour; h += windowHours) {
    const start = `${String(h).padStart(2, "0")}:00`;
    const end = `${String(Math.min(h + windowHours, endHour)).padStart(2, "0")}:00`;
    slots.push({ centerId, date, startTime: start, endTime: end, capacity: capacityPerWindow, bookedCount: 0 });
  }
  const created = await Slot.insertMany(slots);
  res.json(created);
});

router.put("/slots/:id", async (req, res) => {
  const slot = await Slot.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(slot);
});

router.delete("/slots/:id", async (req, res) => {
  await Slot.findByIdAndDelete(req.params.id);
  res.json({ deleted: true });
});

// ---------- Farmer Link clustering ----------
router.post("/bulk-lots/cluster", async (req, res) => {
  const { cropType } = req.body;
  if (!cropType) return res.status(400).json({ error: "cropType is required." });

  const crop = await Crop.findOne({ name: new RegExp(`^${cropType}$`, "i") });
  const soloPrice = crop ? crop.basePricePerQuintal : 2000;

  const bookings = await Booking.find({
    cropType: new RegExp(`^${cropType}$`, "i"),
    status: { $in: ["confirmed", "waitlisted"] },
    bulkLotId: null
  }).populate("farmerId", "location");

  const candidates = bookings
    .filter(b => b.farmerId)
    .map(b => ({
      farmerId: b.farmerId._id,
      bookingId: b._id,
      location: b.farmerId.location,
      harvestDateTs: Date.now() + (b.harvestWindowDays || 3) * 86400000,
      quantity: b.quantity
    }));

  const groups = clusterFarmers(candidates);
  const createdLots = [];

  for (const group of groups) {
    const economics = buildLotEconomics(group, soloPrice);
    const lot = await BulkLot.create({
      cropType,
      members: economics.members,
      totalQuantity: economics.totalQuantity,
      pricePerQuintal: economics.pricePerQuintal,
      soloPricePerQuintal: soloPrice,
      totalValue: economics.totalValue,
      status: "forming"
    });
    await Booking.updateMany(
      { _id: { $in: group.map(g => g.bookingId) } },
      { bulkLotId: lot._id }
    );
    for (const m of economics.members) {
      const farmer = await Farmer.findById(m.farmerId);
      if (farmer) {
        const msg = `AgriConnect: You've been grouped with ${group.length - 1} nearby farmers for better ${cropType} pricing! Check "My Group".`;
        await notify(farmer.phone, msg);
        await sendSms(farmer.phone, msg);
      }
    }
    createdLots.push(lot);
  }

  res.json({ groupsFormed: createdLots.length, lots: createdLots });
});

router.get("/bulk-lots", async (req, res) => {
  res.json(await BulkLot.find().populate("members.farmerId", "name phone village").sort({ createdAt: -1 }));
});

router.post("/bulk-lots/:id/settle", async (req, res) => {
  const lot = await BulkLot.findById(req.params.id);
  if (!lot) return res.status(404).json({ error: "Bulk lot not found." });
  lot.status = "paid";
  await lot.save();
  for (const m of lot.members) {
    const farmer = await Farmer.findById(m.farmerId);
    if (farmer) {
      const msg = `AgriConnect: Group sale settled! Rs.${m.amount} credited for your ${m.quantity}kg share.`;
      await notify(farmer.phone, msg);
      await sendSms(farmer.phone, msg);
    }
  }
  res.json(lot);
});

// ---------- Analytics ----------
router.get("/analytics", async (req, res) => {
  const bookings = await Booking.find().populate("slotId", "date");
  const byStatus = {};
  const byCrop = {};
  const byDate = {};
  let waitTotalMs = 0, waitCount = 0;

  bookings.forEach(b => {
    byStatus[b.status] = (byStatus[b.status] || 0) + 1;
    byCrop[b.cropType] = (byCrop[b.cropType] || 0) + 1;
    const d = b.slotId?.date || "unknown";
    byDate[d] = (byDate[d] || 0) + 1;
    if (b.status === "completed" || b.status === "paid") {
      waitTotalMs += (new Date(b.updatedAt) - new Date(b.createdAt));
      waitCount++;
    }
  });

  const rejectionRate = bookings.length
    ? +(((byStatus.rejected || 0) / bookings.length) * 100).toFixed(1)
    : 0;
  const avgWaitMinutes = waitCount ? Math.round(waitTotalMs / waitCount / 60000) : 0;

  res.json({ byStatus, byCrop, byDate, rejectionRate, avgWaitMinutes, totalBookings: bookings.length });
});

// ---------- Farmers list ----------
router.get("/farmers", async (req, res) => {
  res.json(await Farmer.find().select("-passwordHash").sort({ createdAt: -1 }));
});

module.exports = router;
