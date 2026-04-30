const mongoose = require("mongoose");

const seriesSchema = new mongoose.Schema({
  seriesId:    { type: String, required: true, unique: true },
  name:        { type: String, required: true },
  description: { type: String, default: "" },
  imageUrl:    { type: String, default: null },
  isActive:    { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model("Series", seriesSchema);
