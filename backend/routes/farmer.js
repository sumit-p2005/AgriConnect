const express = require("express");
const Farmer = require("../models/Farmer");
const Crop = require("../models/Crop");
const Center = require("../models/Center");
const Slot = require("../models/Slot");
const Booking = require("../models/Booking");
const BulkLot = require("../models/BulkLot");
const TransportRequest = require("../models/TransportRequest");
const TransportPartner = require("../models/TransportPartner");
const { requireAuth } = require("../middleware/auth");
const { calculatePriorityScore, reorderSlotQueue } = require("../services/scheduler");
const { notify } = require("../services/notify");
const { haversineDistance } = require("../services/clustering");
const { sendSms } = require("../services/smsService");

const router = express.Router();
router.use(requireAuth("farmer"));

// ---------- Reference data ----------
router.get("/crops", async (req, res) => {
  res.json(await Crop.find().sort({ name: 1 }));
});

router.get("/centers", async (req, res) => {
  res.json(await Center.find({ active: true }).sort({ name: 1 }));
});

// ---------- Nearest Procurement Centres (Haversine distance ranking) ----------
router.get("/centers/nearby", async (req, res) => {
  const lat = parseFloat(req.query.lat) || 31.25;
  const lng = parseFloat(req.query.lng) || 75.70;

  const centers = await Center.find({ active: true });
  const sorted = centers.map(c => {
    const cLat = c.location?.lat ?? 31.25;
    const cLng = c.location?.lng ?? 75.70;
    const distanceKm = +haversineDistance(lat, lng, cLat, cLng).toFixed(2);
    return {
      _id: c._id,
      name: c.name,
      address: c.address,
      location: c.location,
      acceptedCrops: c.acceptedCrops,
      capacityPerHour: c.capacityPerHour,
      currentLoad: c.currentLoad,
      distanceKm
    };
  }).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 5);

  res.json(sorted);
});

router.get("/centers/:id/slots", async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "date query param required (YYYY-MM-DD)." });
  const slots = await Slot.find({ centerId: req.params.id, date, status: "open" }).sort({ startTime: 1 });
  res.json(slots.map(s => ({
    id: s._id, startTime: s.startTime, endTime: s.endTime,
    capacity: s.capacity, bookedCount: s.bookedCount,
    spotsLeft: Math.max(s.capacity - s.bookedCount, 0)
  })));
});

router.get("/price/:cropType", async (req, res) => {
  const crop = await Crop.findOne({ name: new RegExp(`^${req.params.cropType}$`, "i") });
  if (!crop) return res.status(404).json({ error: "No price reference for this crop yet." });
  const dayIndex = Math.floor(Date.now() / 86400000);
  const wobble = ((dayIndex + crop.name.length) % 7) - 3;
  const price = Math.round(crop.basePricePerQuintal * (1 + wobble / 100));
  res.json({ crop: crop.name, nameHi: crop.nameHi, pricePerQuintal: price, asOf: new Date().toISOString().slice(0, 10) });
});

// ---------- Create booking (triggers AI Scheduler + SMS Notification) ----------
router.post("/bookings", async (req, res) => {
  try {
    const { centerId, slotId, cropType, variety, quantity, harvestWindowDays, storageCapability } = req.body;
    if (!centerId || !slotId || !cropType || !quantity) {
      return res.status(400).json({ error: "Centre, slot, crop and quantity are required." });
    }

    const farmer = await Farmer.findById(req.user.id);
    const center = await Center.findById(centerId);
    if (!center) return res.status(404).json({ error: "Procurement centre not found." });
    const crop = await Crop.findOne({ name: new RegExp(`^${cropType}$`, "i") });

    const claimed = await Slot.findOneAndUpdate(
      { _id: slotId, $expr: { $lt: ["$bookedCount", "$capacity"] } },
      { $inc: { bookedCount: 1 } },
      { new: true }
    );
    const status = claimed ? "confirmed" : "waitlisted";

    const { score, breakdown } = calculatePriorityScore(
      { quantity, harvestWindowDays, storageCapability },
      crop,
      center,
      cropType
    );

    const booking = await Booking.create({
      farmerId: farmer._id,
      centerId,
      slotId,
      cropType,
      variety,
      quantity,
      harvestWindowDays: harvestWindowDays || 3,
      storageCapability: storageCapability || farmer.storageCapability || "none",
      priorityScore: score,
      scoreBreakdown: breakdown,
      status
    });

    await Center.updateOne({ _id: centerId }, { $inc: { currentLoad: 1 } });
    await reorderSlotQueue(Booking, slotId);
    const fresh = await Booking.findById(booking._id);

    const msg = status === "confirmed"
      ? `AgriConnect: Slot confirmed at ${center.name}. Your token is #${fresh.tokenNumber}. We'll remind you before your turn.`
      : `AgriConnect: Slot full. You're on waitlist at ${center.name} — we'll notify you when a spot opens.`;
    
    await notify(farmer.phone, msg);
    await sendSms(farmer.phone, msg); // Live / Mock SMS trigger
    fresh.notificationsLog.push({ message: msg });
    await fresh.save();

    res.json(fresh);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/bookings", async (req, res) => {
  const bookings = await Booking.find({ farmerId: req.user.id })
    .populate("centerId", "name address location")
    .populate("slotId", "date startTime endTime")
    .sort({ createdAt: -1 });
  res.json(bookings);
});

router.get("/bookings/:id", async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, farmerId: req.user.id })
    .populate("centerId", "name address location")
    .populate("slotId", "date startTime endTime");
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  res.json(booking);
});

// ---------- Cancel booking -> triggers waitlist promotion ----------
router.post("/bookings/:id/cancel", async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, farmerId: req.user.id });
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  if (!["confirmed", "waitlisted"].includes(booking.status)) {
    return res.status(400).json({ error: "This booking can no longer be cancelled." });
  }

  const wasConfirmed = booking.status === "confirmed";
  booking.status = "cancelled";
  await booking.save();

  if (wasConfirmed) {
    await Slot.updateOne({ _id: booking.slotId }, { $inc: { bookedCount: -1 } });
    const waitlisted = await Booking.find({ slotId: booking.slotId, status: "waitlisted" })
      .sort({ priorityScore: -1, createdAt: 1 })
      .limit(1);
    if (waitlisted.length) {
      const promoted = waitlisted[0];
      await Slot.updateOne({ _id: booking.slotId }, { $inc: { bookedCount: 1 } });
      promoted.status = "confirmed";
      await promoted.save();
      const farmer = await Farmer.findById(promoted.farmerId);
      const msg = `AgriConnect: A spot opened up! Your slot is now confirmed. Token will be updated shortly.`;
      await notify(farmer.phone, msg);
      await sendSms(farmer.phone, msg);
      promoted.notificationsLog.push({ message: msg });
      await promoted.save();
    }
  }

  await reorderSlotQueue(Booking, booking.slotId);
  res.json(await Booking.findById(booking._id));
});

// ---------- Transportation Requests ----------
router.post("/transport-requests", async (req, res) => {
  try {
    const { bookingId, pickupLocation, estimatedWeightKg } = req.body;
    if (!bookingId) return res.status(400).json({ error: "bookingId is required." });

    const farmer = await Farmer.findById(req.user.id);
    const booking = await Booking.findOne({ _id: bookingId, farmerId: farmer._id });
    if (!booking) return res.status(404).json({ error: "Booking not found." });

    const reqDoc = await TransportRequest.create({
      bookingId,
      farmerId: farmer._id,
      pickupLocation: pickupLocation || {
        lat: farmer.location?.lat || 31.25,
        lng: farmer.location?.lng || 75.70,
        address: `${farmer.village || "Farmer Location"}, ${farmer.district || "Punjab"}`
      },
      estimatedWeightKg: estimatedWeightKg || booking.quantity || 100,
      status: "requested"
    });

    const msg = `AgriConnect: Transport request created for ${booking.cropType} (${booking.quantity}kg). We will assign a pickup vehicle soon.`;
    await sendSms(farmer.phone, msg);

    res.json(reqDoc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/bookings/:id/transport", async (req, res) => {
  const reqDoc = await TransportRequest.findOne({ bookingId: req.params.id, farmerId: req.user.id })
    .populate("assignedPartnerId");
  res.json(reqDoc);
});

// ---------- My Group (Farmer Link) ----------
router.get("/my-group", async (req, res) => {
  const lot = await BulkLot.findOne({ "members.farmerId": req.user.id }).sort({ createdAt: -1 });
  if (!lot) return res.json(null);
  res.json(lot);
});

// ---------- Profile ----------
router.get("/profile", async (req, res) => {
  const farmer = await Farmer.findById(req.user.id).select("-passwordHash");
  if (!farmer) return res.status(401).json({ error: "Farmer profile not found. Please log in again." });
  res.json(farmer);
});

module.exports = router;
