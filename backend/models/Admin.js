const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["centre_staff", "district_supervisor"], default: "centre_staff" },
  centerId: { type: mongoose.Schema.Types.ObjectId, ref: "Center", default: null }
});

module.exports = mongoose.model("Admin", adminSchema);
