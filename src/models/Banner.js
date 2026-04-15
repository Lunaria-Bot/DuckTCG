const { Schema, model } = require("mongoose");

const BannerSchema = new Schema({
  bannerId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  anime: { type: String, required: true },
  imageUrl: { type: String, default: null },

  type: {
    type: String,
    enum: ["regular", "pickup"],
    required: true,
  },

  featuredCards: [{ type: String, ref: "Card" }],

  pool: {
    common: [{ type: String }],
    rare: [{ type: String }],
    special: [{ type: String }],
    exceptional: [{ type: String }],
  },

  rates: {
    common: { type: Number, default: 60 },
    rare: { type: Number, default: 25 },
    special: { type: Number, default: 12 },
    exceptional: { type: Number, default: 3 },
  },

  pity: {
    hardPity: { type: Number, default: 90 },
    softPityStart: { type: Number, default: 75 },
  },

  isActive: { type: Boolean, default: true },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = model("Banner", BannerSchema);
