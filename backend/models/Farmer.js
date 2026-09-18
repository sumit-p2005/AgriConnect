const mongoose = require("mongoose");

const farmerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  village: String,
  district: String,
  state: String,
  primaryCrop: String,
  storageCapability: { type: String, enum: ["none", "short-term", "long-term"], default: "none" },
  location: {
    lat: { type: Number, default: 30.9 },
    lng: { type: Number, default: 75.6 }
  },
  reputationScore: { type: Number, default: 80 }, // 0-100, simple friendly badge
  onTimeArrivals: { type: Number, default: 0 },
  totalArrivals: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Farmer", farmerSchema);
