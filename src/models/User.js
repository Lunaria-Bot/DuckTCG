const { Schema, model } = require("mongoose");

const BadgeSchema = new Schema({
  badgeId: { type: String, required: true },
  tier: { type: Number, default: 1 },
  earnedAt: { type: Date, default: Date.now },
}, { _id: false });

const TeamSlotSchema = new Schema({
  slot: { type: Number, min: 1, max: 3 },
  playerCardId: { type: Schema.Types.ObjectId, ref: "PlayerCard", default: null },
}, { _id: false });

const UserSchema = new Schema({
  userId: { type: String, required: true, unique: true },
  username: { type: String, required: true },

  currency: {
    gold: { type: Number, default: 0 },
    premiumCurrency: { type: Number, default: 0 },
    pickupTickets: { type: Number, default: 0 },
    regularTickets: { type: Number, default: 0 },
  },

  pity: {
    pickupPulls: { type: Number, default: 0 },
    regularPulls: { type: Number, default: 0 },
    pickupSoftPity: { type: Number, default: 75 },
    regularSoftPity: { type: Number, default: 75 },
  },

  team: {
    type: [TeamSlotSchema],
    default: [
      { slot: 1, playerCardId: null },
      { slot: 2, playerCardId: null },
      { slot: 3, playerCardId: null },
    ],
  },

  favoriteCardId: { type: Schema.Types.ObjectId, ref: "PlayerCard", default: null },
  combatPower: { type: Number, default: 0 },

  stats: {
    totalCardsEverObtained: { type: Number, default: 0 },
    totalGoldEverEarned: { type: Number, default: 0 },
    totalPullsDone: { type: Number, default: 0 },
    raidDamageTotal: { type: Number, default: 0 },
  },

  accountLevel: { type: Number, default: 1 },
  accountExp: { type: Number, default: 0 },
  loginStreak: { type: Number, default: 0 },
  lastLoginDate: { type: Date, default: null },
  firstJoinDate: { type: Date, default: Date.now },

  adventure: {
    isActive: { type: Boolean, default: false },
    startedAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
  },

  badges: { type: [BadgeSchema], default: [] },
}, { timestamps: true });

module.exports = model("User", UserSchema);
