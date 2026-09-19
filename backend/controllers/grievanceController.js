const Grievance = require("../models/Grievance");
const Farmer = require("../models/Farmer");
const { sendSms } = require("../services/smsService");

/**
 * Grievance Controller (MVC)
 */

exports.submitGrievance = async (req, res) => {
  try {
    const { bookingId, type, description } = req.body;
    if (!type || !description) {
      return res.status(400).json({ error: "Grievance type and description are required." });
    }

    const grievance = await Grievance.create({
      farmerId: req.user.id,
      bookingId: bookingId || null,
      type,
      description,
      status: "open"
    });

    const farmer = await Farmer.findById(req.user.id);
    if (farmer?.phone) {
      const msg = `AgriConnect: Your grievance (${type}) has been registered. Reference: #${grievance._id.toString().slice(-6)}.`;
      await sendSms(farmer.phone, msg);
    }

    res.json(grievance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getFarmerGrievances = async (req, res) => {
  try {
    const list = await Grievance.find({ farmerId: req.user.id })
      .populate("bookingId")
      .sort({ createdAt: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.adminGetGrievances = async (req, res) => {
  try {
    const list = await Grievance.find()
      .populate("farmerId", "name phone village district")
      .populate("bookingId")
      .sort({ createdAt: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.adminResolveGrievance = async (req, res) => {
  try {
    const { status, resolutionNotes } = req.body;
    const grievance = await Grievance.findByIdAndUpdate(
      req.params.id,
      { status: status || "resolved", resolutionNotes },
      { new: true }
    ).populate("farmerId", "name phone");

    if (!grievance) return res.status(404).json({ error: "Grievance not found." });

    if (grievance.farmerId?.phone) {
      const msg = `AgriConnect: Your grievance #${grievance._id.toString().slice(-6)} status is now ${grievance.status.toUpperCase()}.`;
      await sendSms(grievance.farmerId.phone, msg);
    }

    res.json(grievance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
