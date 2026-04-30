const { Schema, model } = require("mongoose");

const RaidParticipantSchema = new Schema({
  userId: { type: String, required: true },
  username: { type: String, required: true },
  damageDealt: { type: Number, default: 0 },
  goldEarned: { type: Number, default: 0 },
  droppedPull: { type: Boolean, default: false },
}, { _id: false });

const RaidSchema = new Schema({
  raidId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  anime: { type: String, required: true },
  imageUrl: { type: String, default: null },

  maxHp: { type: Number, required: true },
  currentHp: { type: Number, required: true },

  status: {
    type: String,
    enum: ["active", "defeated", "expired"],
    default: "active",
  },

  participants: { type: [RaidParticipantSchema], default: [] },

  startsAt: { type: Date, default: Date.now },
  endsAt: { type: Date, required: true },
  defeatedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = model("Raid", RaidSchema);
