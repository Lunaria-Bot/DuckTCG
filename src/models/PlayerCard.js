const { Schema, model } = require("mongoose");

const PlayerCardSchema = new Schema({
  userId: { type: String, required: true, index: true },
  cardId: { type: String, required: true, ref: "Card" },

  acquiredAt: { type: Date, default: Date.now },

  level: { type: Number, default: 1, min: 1, max: 125 },
  exp: { type: Number, default: 0 },
  isAscended: { type: Boolean, default: false },

  cachedStats: {
    damage: { type: Number, default: 0 },
    mana: { type: Number, default: 0 },
    hp: { type: Number, default: 0 },
    combatPower: { type: Number, default: 0 },
  },

  isInTeam: { type: Boolean, default: false },
  isFavorite: { type: Boolean, default: false },
  isBurned: { type: Boolean, default: false },
}, { timestamps: true });

PlayerCardSchema.index({ userId: 1, cardId: 1 });
PlayerCardSchema.index({ userId: 1, isBurned: 1 });

module.exports = model("PlayerCard", PlayerCardSchema);
