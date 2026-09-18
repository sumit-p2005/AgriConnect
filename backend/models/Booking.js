const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: "Farmer", required: true },
  centerId: { type: mongoose.Schema.Types.ObjectId, ref: "Center", required: true },
  slotId: { type: mongoose.Schema.Types.ObjectId, ref: "Slot", required: true },

  cropType: { type: String, required: true },
  variety: String,
  quantity: { type: Number, required: true }, // kg
  harvestWindowDays: { type: Number, default: 3 },
  storageCapability: { type: String, enum: ["none", "short-term", "long-term"], default: "none" },

  // --- AI Scheduler output ---
  priorityScore: { type: Number, default: 0 },
  scoreBreakdown: { type: Object, default: {} },
  tokenNumber: { type: Number, default: 0 },

  status: {
    type: String,
    enum: [
      "waitlisted", "confirmed", "arrived", "quality_check",
      "approved", "paid", "completed", "rejected", "cancelled"
    ],
    default: "confirmed"
  },

  qualityCheck: {
    grade: String,
    moisturePct: Number,
    remarks: String,
    pass: Boolean
  },
  approval: {
    finalQuantity: Number,
    pricePerQuintal: Number,
    totalAmount: Number
  },
  payment: {
    mode: String,
    reference: String,
    paidAt: Date
  },

  notificationsLog: [{ message: String, at: { type: Date, default: Date.now } }],

  bulkLotId: { type: mongoose.Schema.Types.ObjectId, ref: "BulkLot", default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Booking", bookingSchema);
