const { Schema, model } = require("mongoose");

const CardSchema = new Schema({
  cardId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  anime: { type: String, required: true },
  imageUrl: { type: String, required: true },

  rarity: {
    type: String,
    enum: ["common", "rare", "special", "exceptional"],
    required: true,
  },

  role: {
    type: String,
    enum: ["dps", "support", "tank"],
    required: true,
  },

  baseStats: {
    damage: { type: Number, default: 100 },
    mana: { type: Number, default: 100 },
    hp: { type: Number, default: 100 },
  },

  totalPrints: { type: Number, default: 0 },

  bannerType: {
    type: String,
    enum: ["regular", "pickup"],
    default: "regular",
  },
  pickupBannerId: { type: String, default: null },

  isAvailable: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = model("Card", CardSchema);
