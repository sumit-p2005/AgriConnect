const Center = require("../models/Center");
const Slot = require("../models/Slot");
const Booking = require("../models/Booking");
const BulkLot = require("../models/BulkLot");
const Crop = require("../models/Crop");
const Farmer = require("../models/Farmer");
const TransportRequest = require("../models/TransportRequest");
const TransportPartner = require("../models/TransportPartner");
const { reorderSlotQueue } = require("../services/scheduler");
const { clusterFarmers, buildLotEconomics } = require("../services/clustering");
const { sendSms } = require("../services/smsService");

/**
 * Admin Controller (MVC)
 * Procurement Center Control Room & Logistics Operations.
 */

exports.getDashboardStats = async (req, res) => {
  try {
    const centerFilter = req.user.adminRole === "centre_staff" && req.user.centerId
      ? { centerId: req.user.centerId }
      : {};

    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySlots = await Slot.find({ ...centerFilter, date: todayStr });
    const slotIds = todaySlots.map(s => s._id);

    const [todayBookings, totalFarmers, activeCenters, activeLots] = await Promise.all([
      Booking.find({ slotId: { $in: slotIds } }),
      Farmer.countDocuments(),
      Center.countDocuments({ active: true }),
      BulkLot.countDocuments({ status: "forming" })
    ]);

    const stats = {
      todayBookingsCount: todayBookings.length,
      todayVolumeKg: todayBookings.reduce((sum, b) => sum + b.quantity, 0),
      todayCompletedCount: todayBookings.filter(b => b.status === "completed").length,
      todayWaitlistedCount: todayBookings.filter(b => b.status === "waitlisted").length,
      totalFarmers,
      activeCenters,
      activeLots
    };

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getQueue = async (req, res) => {
  try {
    const { centerId, date, slotId } = req.query;
    const q = {};
    if (centerId) q.centerId = centerId;
    if (slotId) q.slotId = slotId;

    if (date && !slotId) {
      const slots = await Slot.find({ ...(centerId ? { centerId } : {}), date });
      q.slotId = { $in: slots.map(s => s._id) };
    }

    const bookings = await Booking.find(q)
      .populate("farmerId", "name phone village district storageCapability")
      .populate("centerId", "name")
      .populate("slotId", "date startTime endTime")
      .sort({ queuePosition: 1, priorityScore: -1, createdAt: 1 });

    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateBookingStatus = async (req, res) => {
  try {
    const { status, qualityCheck, paymentDetails } = req.body;
    const booking = await Booking.findById(req.params.id)
      .populate("farmerId", "name phone");
    if (!booking) return res.status(404).json({ error: "Booking not found." });

    const validStatuses = ["confirmed", "waitlisted", "arrived", "quality_check", "approved", "paid", "completed", "rejected", "cancelled"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status '${status}'.` });
    }

    if (status) booking.status = status;
    if (qualityCheck) booking.qualityCheck = qualityCheck;
    if (paymentDetails) booking.paymentDetails = paymentDetails;

    await booking.save();
    await reorderSlotQueue(Booking, booking.slotId);

    // Send Status Alert SMS to Farmer
    if (booking.farmerId?.phone) {
      const msg = `AgriConnect: Your booking status for ${booking.cropType} is now ${booking.status.toUpperCase()}.`;
      await sendSms(booking.farmerId.phone, msg);
    }

    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCenters = async (req, res) => {
  try {
    const centers = await Center.find().sort({ name: 1 });
    res.json(centers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createCenter = async (req, res) => {
  try {
    const center = await Center.create(req.body);
    res.json(center);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateCenter = async (req, res) => {
  try {
    const center = await Center.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(center);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSlots = async (req, res) => {
  try {
    const { centerId, date } = req.query;
    const q = {};
    if (centerId) q.centerId = centerId;
    if (date) q.date = date;
    const slots = await Slot.find(q).populate("centerId", "name").sort({ date: 1, startTime: 1 });
    res.json(slots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createSlot = async (req, res) => {
  try {
    const slot = await Slot.create(req.body);
    res.json(slot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteSlot = async (req, res) => {
  try {
    await Slot.findByIdAndDelete(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getBulkLots = async (req, res) => {
  try {
    const lots = await BulkLot.find()
      .populate("members.farmerId", "name phone village")
      .sort({ createdAt: -1 });
    res.json(lots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.clusterBulkLots = async (req, res) => {
  try {
    const { cropType } = req.body;
    if (!cropType) return res.status(400).json({ error: "cropType is required." });

    const crop = await Crop.findOne({ name: new RegExp(`^${cropType}$`, "i") });
    const soloPrice = crop ? crop.basePricePerQuintal : 2200;

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
        location: b.farmerId.location || { lat: 31.25, lng: 75.70 },
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
        if (farmer?.phone) {
          const msg = `AgriConnect: You've been pooled with ${group.length - 1} nearby farmers for ${cropType}! Check "My Group".`;
          await sendSms(farmer.phone, msg);
        }
      }
      createdLots.push(lot);
    }

    res.json({ groupsFormed: createdLots.length, lots: createdLots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.settleBulkLot = async (req, res) => {
  try {
    const lot = await BulkLot.findById(req.params.id);
    if (!lot) return res.status(404).json({ error: "Bulk lot not found." });
    lot.status = "paid";
    await lot.save();

    for (const m of lot.members) {
      const farmer = await Farmer.findById(m.farmerId);
      if (farmer?.phone) {
        const msg = `AgriConnect: Bulk lot settled! ₹${m.amount} payment credited for your ${m.quantity}kg share.`;
        await sendSms(farmer.phone, msg);
      }
    }

    res.json(lot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getTransportRequests = async (req, res) => {
  try {
    const requests = await TransportRequest.find()
      .populate("farmerId", "name phone village district")
      .populate("centerId", "name")
      .populate("assignedPartnerId")
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.assignTransportPartner = async (req, res) => {
  try {
    const { partnerId } = req.body;
    const transportReq = await TransportRequest.findByIdAndUpdate(
      req.params.id,
      { assignedPartnerId: partnerId, status: "assigned" },
      { new: true }
    ).populate("farmerId", "name phone");

    if (transportReq?.farmerId?.phone) {
      const msg = `AgriConnect: Pickup vehicle assigned for your harvest delivery.`;
      await sendSms(transportReq.farmerId.phone, msg);
    }

    res.json(transportReq);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
