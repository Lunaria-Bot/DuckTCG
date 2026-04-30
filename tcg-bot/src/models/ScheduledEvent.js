const { Schema, model } = require("mongoose");

const ScheduledEventSchema = new Schema({
  title:       { type: String, required: true },
  type:        { type: String, enum: ["banner", "event", "raid", "maintenance", "other"], default: "event" },
  description: { type: String, default: "" },
  startDate:   { type: Date, required: true },
  endDate:     { type: Date, default: null },
  color:       { type: String, default: "#7c3aed" },
  bannerId:    { type: String, default: null }, // link to a banner if type=banner
  createdBy:   { type: String, required: true },
}, { timestamps: true });

module.exports = model("ScheduledEvent", ScheduledEventSchema);
