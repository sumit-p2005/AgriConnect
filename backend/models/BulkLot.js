const mongoose = require("mongoose");

const bulkLotSchema = new mongoose.Schema({
  cropType: { type: String, required: true },
  members: [{
    farmerId: { type: mongoose.Schema.Types.ObjectId, ref: "Farmer" },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
    quantity: Number,
    share: Number,      // proportion of totalQuantity
    amount: Number       // payout once settled
  }],
  totalQuantity: { type: Number, default: 0 },
  pricePerQuintal: { type: Number, default: 0 },      // negotiated bulk price
  soloPricePerQuintal: { type: Number, default: 0 },  // mock mandi solo reference for comparison
  totalValue: { type: Number, default: 0 },
  status: { type: String, enum: ["forming", "sold", "paid"], default: "forming" },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("BulkLot", bulkLotSchema);
