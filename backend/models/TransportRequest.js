const mongoose = require("mongoose");

const transportRequestSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: "Farmer", required: true },
  pickupLocation: {
    lat: Number,
    lng: Number,
    address: String
  },
  estimatedWeightKg: Number,
  status: {
    type: String,
    enum: ["requested", "assigned", "en_route", "delivered", "cancelled"],
    default: "requested"
  },
  assignedPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: "TransportPartner", default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("TransportRequest", transportRequestSchema);
