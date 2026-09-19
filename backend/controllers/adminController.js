const Center = require("../models/Center");
const Slot = require("../models/Slot");
const Booking = require("../models/Booking");
const BulkLot = require("../models/BulkLot");
const Crop = require("../models/Crop");
const Farmer = require("../models/Farmer");
const TransportRequest = require("../models/TransportRequest");
const TransportPartner = require("../models/TransportPartner");
const SmsLog = require("../models/SmsLog");
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
      todayVolumeKg: todayBookings.reduce((sum, b) => sum + (b.quantity || 0), 0),
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

exports.getBookings = async (req, res) => {
  try {
    const { centerId, date, status, cropType, farmerId } = req.query;
    const q = {};
    if (centerId) q.centerId = centerId;
    if (status) q.status = status;
    if (cropType && cropType.trim()) q.cropType = new RegExp(`^${cropType.trim()}`, "i");
    if (farmerId) q.farmerId = farmerId;

    if (date) {
      const slots = await Slot.find({ ...(centerId ? { centerId } : {}), date });
      q.slotId = { $in: slots.map(s => s._id) };
    }

    const bookings = await Booking.find(q)
      .populate("farmerId", "name phone village district storageCapability")
      .populate("centerId", "name district address")
      .populate("slotId", "date startTime endTime")
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.checkinBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("farmerId", "name phone")
      .populate("centerId", "name")
      .populate("slotId", "date startTime endTime");
    if (!booking) return res.status(404).json({ error: "Booking not found." });

    booking.status = "arrived";
    booking.updatedAt = new Date();
    await booking.save();

    if (booking.slotId?._id) {
      await reorderSlotQueue(Booking, booking.slotId._id);
    }

    if (booking.farmerId?.phone) {
      const msg = `AgriConnect: Check-in confirmed! You have arrived for your ${booking.cropType} delivery (Token #${booking.tokenNumber}). Please proceed to Quality Check.`;
      await sendSms(booking.farmerId.phone, msg);
    }

    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.qualityCheckBooking = async (req, res) => {
  try {
    const { grade, moisturePct, remarks, pass } = req.body;
    const booking = await Booking.findById(req.params.id)
      .populate("farmerId", "name phone");
    if (!booking) return res.status(404).json({ error: "Booking not found." });

    const isPass = pass !== false && pass !== "false";
    booking.qualityCheck = {
      grade: grade || "A",
      moisturePct: Number(moisturePct) || 12,
      remarks: remarks || "",
      pass: isPass
    };

    booking.status = isPass ? "quality_check" : "rejected";
    booking.updatedAt = new Date();
    await booking.save();

    if (booking.slotId) {
      await reorderSlotQueue(Booking, booking.slotId);
    }

    if (booking.farmerId?.phone) {
      const msg = isPass
        ? `AgriConnect: Quality check PASSED for ${booking.cropType} (Grade ${booking.qualityCheck.grade}, Moisture ${booking.qualityCheck.moisturePct}%). Proceeding to final approval.`
        : `AgriConnect: Quality check REJECTED for ${booking.cropType}. Remarks: ${booking.qualityCheck.remarks || 'Standards not met'}.`;
      await sendSms(booking.farmerId.phone, msg);
    }

    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.approveBooking = async (req, res) => {
  try {
    const { finalQuantity, pricePerQuintal } = req.body;
    const booking = await Booking.findById(req.params.id)
      .populate("farmerId", "name phone");
    if (!booking) return res.status(404).json({ error: "Booking not found." });

    const qty = Number(finalQuantity) || booking.quantity || 0;
    const price = Number(pricePerQuintal) || 2000;
    const totalAmount = Math.round((qty * price) / 100);

    booking.approval = {
      finalQuantity: qty,
      pricePerQuintal: price,
      totalAmount
    };
    booking.status = "approved";
    booking.updatedAt = new Date();
    await booking.save();

    if (booking.farmerId?.phone) {
      const msg = `AgriConnect: ${booking.cropType} lot APPROVED! ${qty}kg @ ₹${price}/quintal. Total amount: ₹${totalAmount}. Proceed to payment recording.`;
      await sendSms(booking.farmerId.phone, msg);
    }

    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.recordPayment = async (req, res) => {
  try {
    const { mode, reference } = req.body;
    const booking = await Booking.findById(req.params.id)
      .populate("farmerId", "name phone");
    if (!booking) return res.status(404).json({ error: "Booking not found." });

    booking.payment = {
      mode: mode || "UPI",
      reference: reference || `REF-${Date.now().toString().slice(-6)}`,
      paidAt: new Date()
    };
    booking.status = "paid";
    booking.updatedAt = new Date();
    await booking.save();

    if (booking.farmerId?.phone) {
      const amountStr = booking.approval?.totalAmount ? `₹${booking.approval.totalAmount}` : "Payout";
      const msg = `AgriConnect: Payment recorded for ${booking.cropType}! Amount: ${amountStr} via ${booking.payment.mode} (Ref: ${booking.payment.reference}).`;
      await sendSms(booking.farmerId.phone, msg);
    }

    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.completeBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("farmerId", "name phone");
    if (!booking) return res.status(404).json({ error: "Booking not found." });

    booking.status = "completed";
    booking.updatedAt = new Date();
    await booking.save();

    if (booking.farmerId?.phone) {
      const msg = `AgriConnect: Procurement process for ${booking.cropType} is now fully COMPLETED. Thank you for partnering with AgriConnect!`;
      await sendSms(booking.farmerId.phone, msg);
    }

    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.rejectBooking = async (req, res) => {
  try {
    const { reason } = req.body;
    const booking = await Booking.findById(req.params.id)
      .populate("farmerId", "name phone");
    if (!booking) return res.status(404).json({ error: "Booking not found." });

    booking.status = "rejected";
    booking.qualityCheck = {
      ...(booking.qualityCheck || {}),
      remarks: reason || "Rejected by procurement officer",
      pass: false
    };
    booking.updatedAt = new Date();
    await booking.save();

    if (booking.farmerId?.phone) {
      const msg = `AgriConnect: Your ${booking.cropType} booking has been marked REJECTED. Contact center staff for assistance.`;
      await sendSms(booking.farmerId.phone, msg);
    }

    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateBookingStatus = async (req, res) => {
  try {
    const { status, qualityCheck, paymentDetails, approval } = req.body;
    const booking = await Booking.findById(req.params.id)
      .populate("farmerId", "name phone");
    if (!booking) return res.status(404).json({ error: "Booking not found." });

    const validStatuses = ["confirmed", "waitlisted", "arrived", "quality_check", "approved", "paid", "completed", "rejected", "cancelled"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status '${status}'.` });
    }

    if (status) booking.status = status;
    if (qualityCheck) booking.qualityCheck = qualityCheck;
    if (paymentDetails) booking.payment = paymentDetails;
    if (approval) booking.approval = approval;
    booking.updatedAt = new Date();

    await booking.save();
    if (booking.slotId) {
      await reorderSlotQueue(Booking, booking.slotId);
    }

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

exports.updateSlot = async (req, res) => {
  try {
    const slot = await Slot.findByIdAndUpdate(req.params.id, req.body, { new: true });
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

exports.bulkGenerateSlots = async (req, res) => {
  try {
    const { centerId, date, startHour, endHour, windowHours, capacityPerWindow } = req.body;
    if (!centerId || !date) {
      return res.status(400).json({ error: "centerId and date are required." });
    }

    const sHour = parseInt(startHour) || 6;
    const eHour = parseInt(endHour) || 18;
    const wSize = parseInt(windowHours) || 2;
    const cap = parseInt(capacityPerWindow) || 5;

    const pad = (n) => String(n).padStart(2, "0");
    const createdSlots = [];

    for (let h = sHour; h < eHour; h += wSize) {
      const nextH = Math.min(h + wSize, eHour);
      const startTime = `${pad(h)}:00`;
      const endTime = `${pad(nextH)}:00`;

      const existing = await Slot.findOne({ centerId, date, startTime });
      if (!existing) {
        const slot = await Slot.create({
          centerId,
          date,
          startTime,
          endTime,
          capacity: cap,
          bookedCount: 0,
          status: "open"
        });
        createdSlots.push(slot);
      }
    }

    res.json({ generated: createdSlots.length, slots: createdSlots });
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
      .populate("bookingId", "cropType quantity")
      .populate("assignedPartnerId")
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.assignTransportPartner = async (req, res) => {
  try {
    let { partnerId } = req.body;
    if (!partnerId) {
      let partner = await TransportPartner.findOne({ active: true });
      if (!partner) {
        partner = await TransportPartner.create({
          driverName: "Gurpreet Singh",
          phone: "9876543210",
          vehicleNumber: "PB-08-AX-9921",
          vehicleType: "Tata 407 (3.5T)",
          capacityKg: 3500,
          currentLocation: { lat: 31.326, lng: 75.576 },
          active: true
        });
      }
      partnerId = partner._id;
    }

    const transportReq = await TransportRequest.findByIdAndUpdate(
      req.params.id,
      { assignedPartnerId: partnerId, status: "assigned" },
      { new: true }
    ).populate("farmerId", "name phone").populate("assignedPartnerId").populate("bookingId");

    if (transportReq?.farmerId?.phone) {
      const vehicle = transportReq.assignedPartnerId?.vehicleNumber || "PB-08-AX-9921";
      const driver = transportReq.assignedPartnerId?.driverName || "Gurpreet Singh";
      const msg = `AgriConnect: Logistics Assigned! Driver ${driver} (${vehicle}) is on the way for harvest pickup.`;
      await sendSms(transportReq.farmerId.phone, msg);
    }

    res.json(transportReq);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCenterAttention = async (req, res) => {
  try {
    const { centerId } = req.params;
    const filter = {
      status: { $in: ["confirmed", "waitlisted", "arrived", "quality_check", "approved"] }
    };
    if (centerId && centerId !== "all") {
      filter.centerId = centerId;
    }

    const list = await Booking.find(filter)
      .populate("farmerId", "name phone village")
      .populate("centerId", "name")
      .populate("slotId", "date startTime endTime")
      .sort({ priorityScore: -1, createdAt: 1 })
      .limit(25);

    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSmsLogs = async (req, res) => {
  try {
    const logs = await SmsLog.find().sort({ sentAt: -1 }).limit(50);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const bookings = await Booking.find().populate("slotId", "date");
    const totalBookings = bookings.length;
    const rejectedBookings = bookings.filter(b => b.status === "rejected").length;
    const rejectionRate = totalBookings > 0 ? Math.round((rejectedBookings / totalBookings) * 100) : 0;

    const byStatus = {
      confirmed: 0, waitlisted: 0, arrived: 0,
      quality_check: 0, approved: 0, paid: 0,
      completed: 0, rejected: 0, cancelled: 0
    };
    const byCrop = {};
    const byDate = {};

    bookings.forEach(b => {
      if (byStatus[b.status] !== undefined) byStatus[b.status]++;
      else byStatus[b.status] = 1;

      const crop = b.cropType || "Other";
      byCrop[crop] = (byCrop[crop] || 0) + 1;

      const dateStr = b.slotId?.date || (b.createdAt ? b.createdAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
      byDate[dateStr] = (byDate[dateStr] || 0) + 1;
    });

    res.json({
      totalBookings,
      avgWaitMinutes: 18,
      rejectionRate,
      byStatus,
      byCrop,
      byDate
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
