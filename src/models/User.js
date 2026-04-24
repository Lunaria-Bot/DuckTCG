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
  bio: { type: String, default: null, maxlength: 150 },
  guild: { type: String, default: null, maxlength: 50 },
  isPremium:       { type: Boolean, default: false },
  premiumUntil:    { type: Date, default: null },   // Premium expiry date
  rollLimit:       { type: Number, default: 5 },    // max rolls per /roll command

  // ── Items inventory ───────────────────────────────────────────────────────
  items: {
    lesserQiPill:  { type: Number, default: 0 },    // recharges Dantian to full
    gearBox:       { type: Number, default: 0 },    // random gear reward
    petTreatBox:   { type: Number, default: 0 },    // pet treat reward
    specialCardBox:{ type: Number, default: 0 },    // roll special-rarity card
  },

  // ── Shop limits ───────────────────────────────────────────────────────────
  shopLimits: {
    rollUpgradeBought: { type: Boolean, default: false }, // one-time roll upgrade
    factionPassLastBought: { type: Date, default: null },  // monthly faction pass
    lesserQiPillWeekly: { type: Number, default: 0 },      // weekly pill purchase count
    lesserQiPillWeekReset: { type: Date, default: null },  // week reset date
  },

  // ── Faction ───────────────────────────────────────────────────────────────
  faction: { type: String, enum: ["heavenly_demon", "orthodox", null], default: null },
  factionPoints: { type: Number, default: 0 },         // resets on faction change
  factionJoinedAt: { type: Date, default: null },       // when they joined current faction

  // ── Notification settings ─────────────────────────────────────────────────
  notifications: {
    qiFull:      { type: Boolean, default: false },
    dantianFull: { type: Boolean, default: false },
    questDone:   { type: Boolean, default: false },
  },
  // Tracks whether we already sent the "full" DM — resets when value drops below max
  notifiedFull: {
    qi:      { type: Boolean, default: false },
    dantian: { type: Boolean, default: false },
  },
  // ── Mana system ──────────────────────────────────────────────────────────
  mana: {
    // Inner Qi — used for rolling, cooldown after depleted
    qi:          { type: Number, default: 10 },
    lastQiUpdate: { type: Date, default: null },   // current inner qi (Lv1=10, Lv25=40)
    qiCooldownUntil: { type: Date, default: null }, // null = ready

    // Dantian — stored mana, passive regen
    dantian:          { type: Number, default: 40 },   // current stored (Lv1=40, Lv25=100)
    lastDantianUpdate: { type: Date, default: Date.now },
  },

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
