const { Schema, model } = require("mongoose");

const ScheduledMessageSchema = new Schema({
  title:       { type: String, required: true },
  channelId:   { type: String, required: true },
  content:     { type: String, default: "" },
  embedTitle:  { type: String, default: "" },
  embedDesc:   { type: String, default: "" },
  embedColor:  { type: String, default: "#7c3aed" },
  embedImage:  { type: String, default: "" },
  scheduledAt: { type: Date, required: true },
  sent:        { type: Boolean, default: false },
  sentAt:      { type: Date, default: null },
  createdBy:   { type: String, required: true },
}, { timestamps: true });

module.exports = model("ScheduledMessage", ScheduledMessageSchema);
