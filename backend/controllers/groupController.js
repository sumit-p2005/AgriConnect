const BulkLot = require("../models/BulkLot");
const Booking = require("../models/Booking");
const Farmer = require("../models/Farmer");
const Crop = require("../models/Crop");
const { autoClusterForCrop, haversineDistance } = require("../services/clustering");
const { sendSms } = require("../services/smsService");

/**
 * Group & Pooling Controller (MVC)
 * Manages Farmer Link collective selling and AI bulk pooling.
 */

exports.getMyGroup = async (req, res) => {
  try {
    const lot = await BulkLot.findOne({ "members.farmerId": req.user.id })
      .populate("members.farmerId", "name phone village district location")
      .sort({ createdAt: -1 });

    if (!lot) {
      return res.json(null);
    }
    res.json(lot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getNearbyPoolOpportunities = async (req, res) => {
  try {
    const farmer = await Farmer.findById(req.user.id);
    if (!farmer) return res.status(401).json({ error: "Farmer not found" });

    const farmerLoc = farmer.location || { lat: 31.25, lng: 75.70 };

    // Find all active unpooled bookings from other farmers
    const unpooledBookings = await Booking.find({
      farmerId: { $ne: req.user.id },
      status: { $in: ["confirmed", "waitlisted"] },
      bulkLotId: null
    }).populate("farmerId", "name village district location phone");

    // Group by crop type and filter within 25km
    const opportunities = [];
    const groupedByCrop = {};

    for (const b of unpooledBookings) {
      if (!b.farmerId) continue;
      const bLoc = b.farmerId.location || { lat: 31.25, lng: 75.70 };
      const dist = +haversineDistance(farmerLoc.lat, farmerLoc.lng, bLoc.lat, bLoc.lng).toFixed(1);

      if (dist <= 25) {
        if (!groupedByCrop[b.cropType]) {
          groupedByCrop[b.cropType] = {
            cropType: b.cropType,
            farmersCount: 0,
            totalQuantity: 0,
            villages: new Set(),
            farmers: []
          };
        }
        groupedByCrop[b.cropType].farmersCount += 1;
        groupedByCrop[b.cropType].totalQuantity += b.quantity;
        if (b.farmerId.village) groupedByCrop[b.cropType].villages.add(b.farmerId.village);
        groupedByCrop[b.cropType].farmers.push({
          name: b.farmerId.name,
          village: b.farmerId.village,
          quantity: b.quantity,
          distanceKm: dist
        });
      }
    }

    for (const cropType of Object.keys(groupedByCrop)) {
      const g = groupedByCrop[cropType];
      const crop = await Crop.findOne({ name: new RegExp(`^${cropType}$`, "i") });
      const soloPrice = crop ? crop.basePricePerQuintal : 2200;
      const poolPrice = +(soloPrice * 1.08).toFixed(2);
      const extraPerQuintal = +(poolPrice - soloPrice).toFixed(2);

      opportunities.push({
        cropType,
        nearbyFarmersCount: g.farmersCount,
        combinedVolumeKg: g.totalQuantity,
        villages: Array.from(g.villages),
        soloPricePerQuintal: soloPrice,
        poolPricePerQuintal: poolPrice,
        extraPerQuintal,
        samples: g.farmers.slice(0, 3)
      });
    }

    res.json(opportunities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.triggerAutoPool = async (req, res) => {
  try {
    const farmer = await Farmer.findById(req.user.id);
    if (!farmer) return res.status(401).json({ error: "Farmer not found" });

    // Check if farmer has any unpooled active booking
    const myBookings = await Booking.find({
      farmerId: req.user.id,
      status: { $in: ["confirmed", "waitlisted"] },
      bulkLotId: null
    });

    if (myBookings.length === 0) {
      // If no unpooled booking, check primary crop
      const cropToCluster = req.body.cropType || farmer.primaryCrop || "Wheat";
      const created = await autoClusterForCrop(cropToCluster, { Booking, BulkLot, Crop, Farmer }, null, sendSms);
      const myLot = await BulkLot.findOne({ "members.farmerId": req.user.id })
        .populate("members.farmerId", "name phone village district");
      return res.json({ success: true, lot: myLot, lotsCreated: created ? created.length : 0 });
    }

    let lotsFormed = 0;
    for (const b of myBookings) {
      const created = await autoClusterForCrop(b.cropType, { Booking, BulkLot, Crop, Farmer }, null, sendSms);
      if (created) lotsFormed += created.length;
    }

    const myLot = await BulkLot.findOne({ "members.farmerId": req.user.id })
      .populate("members.farmerId", "name phone village district");

    res.json({
      success: true,
      lot: myLot,
      message: myLot ? "Successfully pooled with neighboring farmers!" : "Pool forming. More farmers needed in your zone."
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
