const mongoose = require("mongoose");

const smsLogSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  message: { type: String, required: true },
  status: { type: String, enum: ["sent", "mocked"], default: "mocked" },
  sentAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("SmsLog", smsLogSchema);
