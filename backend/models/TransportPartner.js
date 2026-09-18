const mongoose = require("mongoose");

const transportPartnerSchema = new mongoose.Schema({
  vehicleNumber: { type: String, required: true },
  driverName: String,
  driverPhone: String,
  capacityKg: Number,
  currentLocation: {
    lat: { type: Number, default: 31.25 },
    lng: { type: Number, default: 75.7 }
  },
  available: { type: Boolean, default: true }
});

module.exports = mongoose.model("TransportPartner", transportPartnerSchema);
