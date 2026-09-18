const mongoose = require("mongoose");

const centerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: String,
  location: {
    lat: { type: Number, default: 30.9 },
    lng: { type: Number, default: 75.6 }
  },
  acceptedCrops: [String],
  capacityPerHour: { type: Number, default: 20 },
  currentLoad: { type: Number, default: 0 }, // updated as bookings come in for today
  storageCapacityKg: { type: Number, default: 5000 },
  active: { type: Boolean, default: true }
});

module.exports = mongoose.model("Center", centerSchema);
