const Farmer = require("../models/Farmer");
const Crop = require("../models/Crop");
const Center = require("../models/Center");
const Slot = require("../models/Slot");
const Booking = require("../models/Booking");
const BulkLot = require("../models/BulkLot");
const TransportRequest = require("../models/TransportRequest");
const TransportPartner = require("../models/TransportPartner");
const { calculatePriorityScore, reorderSlotQueue } = require("../services/scheduler");
const { haversineDistance, autoClusterForCrop } = require("../services/clustering");
const { sendSms } = require("../services/smsService");

/**
 * Farmer Controller (MVC)
 */

exports.getCrops = async (req, res) => {
  try {
    const crops = await Crop.find().sort({ name: 1 });
    res.json(crops);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCenters = async (req, res) => {
  try {
    const centers = await Center.find({ active: true }).sort({ name: 1 });
    res.json(centers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getNearbyCenters = async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCenterSlots = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "date query param required (YYYY-MM-DD)." });
    const slots = await Slot.find({ centerId: req.params.id, date, status: "open" }).sort({ startTime: 1 });
    res.json(slots.map(s => ({
      id: s._id,
      startTime: s.startTime,
      endTime: s.endTime,
      capacity: s.capacity,
      bookedCount: s.bookedCount,
      spotsLeft: Math.max(s.capacity - s.bookedCount, 0)
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCropPrice = async (req, res) => {
  try {
    const crop = await Crop.findOne({ name: new RegExp(`^${req.params.cropType}$`, "i") });
    if (!crop) return res.status(404).json({ error: "No price reference for this crop yet." });
    const dayIndex = Math.floor(Date.now() / 86400000);
    const wobble = ((dayIndex + crop.name.length) % 7) - 3;
    const price = Math.round(crop.basePricePerQuintal * (1 + wobble / 100));
    res.json({
      crop: crop.name,
      nameHi: crop.nameHi,
      pricePerQuintal: price,
      asOf: new Date().toISOString().slice(0, 10)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createBooking = async (req, res) => {
  try {
    const { centerId, slotId, cropType, variety, quantity, harvestWindowDays, storageCapability } = req.body;
    if (!centerId || !slotId || !cropType || !quantity) {
      return res.status(400).json({ error: "Centre, slot, crop, and quantity are required." });
    }

    const farmer = await Farmer.findById(req.user.id);
    const center = await Center.findById(centerId);
    if (!center) return res.status(404).json({ error: "Procurement centre not found." });

    // Deduplication check (within last 10 seconds)
    const tenSecondsAgo = new Date(Date.now() - 10000);
    const existing = await Booking.findOne({
      farmerId: req.user.id,
      centerId,
      slotId,
      cropType: new RegExp(`^${cropType}$`, "i"),
      quantity,
      createdAt: { $gte: tenSecondsAgo }
    });
    if (existing) {
      return res.json(existing);
    }

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
      variety: variety || "Standard",
      quantity,
      harvestWindowDays: harvestWindowDays || 3,
      storageCapability: storageCapability || farmer.storageCapability || "none",
      priorityScore: score,
      scoreBreakdown: breakdown,
      status
    });

    await Center.updateOne({ _id: centerId }, { $inc: { currentLoad: 1 } });
    await reorderSlotQueue(Booking, slotId);

    // Auto-Clustering evaluation in real-time
    try {
      await autoClusterForCrop(cropType, { Booking, BulkLot, Crop, Farmer }, null, sendSms);
    } catch (clusterErr) {
      console.warn("Auto-cluster warning on booking:", clusterErr);
    }

    // SMS Dispatch
    const smsText = `AgriConnect: Booking confirmed for ${cropType} (${quantity}kg) at ${center.name}. Status: ${status}.`;
    await sendSms(farmer.phone, smsText);

    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getFarmerBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ farmerId: req.user.id })
      .populate("centerId", "name address location")
      .populate("slotId", "date startTime endTime")
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, farmerId: req.user.id })
      .populate("centerId", "name address location")
      .populate("slotId", "date startTime endTime");
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, farmerId: req.user.id });
    if (!booking) return res.status(404).json({ error: "Booking not found." });

    if (["arrived", "quality_check", "approved", "paid", "completed"].includes(booking.status)) {
      return res.status(400).json({ error: `Cannot cancel a booking that is already ${booking.status}.` });
    }

    booking.status = "cancelled";
    await booking.save();

    await Slot.updateOne({ _id: booking.slotId }, { $inc: { bookedCount: -1 } });
    await Center.updateOne({ _id: booking.centerId }, { $inc: { currentLoad: -1 } });

    // Promote first waitlisted booking if any
    const nextWaitlisted = await Booking.findOne({ slotId: booking.slotId, status: "waitlisted" })
      .sort({ priorityScore: -1 });
    if (nextWaitlisted) {
      nextWaitlisted.status = "confirmed";
      await nextWaitlisted.save();
      await Slot.updateOne({ _id: booking.slotId }, { $inc: { bookedCount: 1 } });
    }

    await reorderSlotQueue(Booking, booking.slotId);
    res.json({ cancelled: true, booking });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createTransportRequest = async (req, res) => {
  try {
    const { bookingId, pickupLocation, estimatedWeightKg } = req.body;
    const booking = await Booking.findOne({ _id: bookingId, farmerId: req.user.id });
    if (!booking) return res.status(404).json({ error: "Booking not found." });

    const farmer = await Farmer.findById(req.user.id);
    const partners = await TransportPartner.find({ active: true });
    let assignedPartner = null;

    if (partners.length > 0) {
      const lat = pickupLocation?.lat || farmer.location?.lat || 31.25;
      const lng = pickupLocation?.lng || farmer.location?.lng || 75.70;
      assignedPartner = partners.map(p => ({
        partner: p,
        dist: haversineDistance(lat, lng, p.baseLocation?.lat || 31.25, p.baseLocation?.lng || 75.70)
      })).sort((a, b) => a.dist - b.dist)[0].partner;
    }

    const reqDoc = await TransportRequest.create({
      bookingId,
      farmerId: req.user.id,
      centerId: booking.centerId,
      pickupLocation: pickupLocation || { lat: 31.25, lng: 75.70, address: "Farm Location" },
      estimatedWeightKg: estimatedWeightKg || booking.quantity,
      assignedPartnerId: assignedPartner ? assignedPartner._id : null,
      status: assignedPartner ? "assigned" : "requested"
    });

    const msg = `AgriConnect: Transport pickup scheduled for ${booking.cropType} (${booking.quantity}kg).`;
    await sendSms(farmer.phone, msg);

    res.json(reqDoc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getBookingTransport = async (req, res) => {
  try {
    const reqDoc = await TransportRequest.findOne({ bookingId: req.params.id, farmerId: req.user.id })
      .populate("assignedPartnerId");
    res.json(reqDoc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getFarmerProfile = async (req, res) => {
  try {
    const farmer = await Farmer.findById(req.user.id).select("-passwordHash");
    if (!farmer) return res.status(401).json({ error: "Farmer profile not found." });
    res.json(farmer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
