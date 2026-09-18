const mongoose = require("mongoose");

const slotSchema = new mongoose.Schema({
  centerId: { type: mongoose.Schema.Types.ObjectId, ref: "Center", required: true },
  date: { type: String, required: true }, // "YYYY-MM-DD"
  startTime: { type: String, required: true }, // "06:00"
  endTime: { type: String, required: true },   // "08:00"
  capacity: { type: Number, required: true },
  bookedCount: { type: Number, default: 0 },
  status: { type: String, enum: ["open", "closed"], default: "open" }
});

slotSchema.index({ centerId: 1, date: 1, startTime: 1 });

module.exports = mongoose.model("Slot", slotSchema);
