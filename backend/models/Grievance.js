const mongoose = require("mongoose");

const GrievanceSchema = new mongoose.Schema({
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: "Farmer", required: true },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null },
  type: {
    type: String,
    enum: ["queue_delay", "weighment_dispute", "payment_delay", "transport_issue", "staff_behavior", "other"],
    default: "other"
  },
  description: { type: String, required: true },
  status: { type: String, enum: ["open", "in_progress", "resolved", "rejected"], default: "open" },
  resolutionNotes: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Grievance", GrievanceSchema);
