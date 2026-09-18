const mongoose = require("mongoose");

const cropSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  nameHi: { type: String, default: "" },
  perishabilityScore: { type: Number, required: true }, // 0 storable -> 1 highly perishable
  basePricePerQuintal: { type: Number, required: true }  // mock mandi reference price (Rs.)
});

module.exports = mongoose.model("Crop", cropSchema);
