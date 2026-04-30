const { Schema, model } = require("mongoose");

const AuditLogSchema = new Schema({
  // Who
  performedBy: { type: String, required: true }, // username
  role:        { type: String, required: true },

  // What
  action:      { type: String, required: true }, // "create" | "update" | "delete"
  resource:    { type: String, required: true }, // "card" | "banner" | "raid" | "player"
  resourceId:  { type: String, required: true }, // bannerId / cardId / etc

  // Snapshots for rollback
  before:      { type: Schema.Types.Mixed, default: null },
  after:       { type: Schema.Types.Mixed, default: null },

  // Label for display
  description: { type: String, required: true },

  rolledBack:  { type: Boolean, default: false },
  rolledBackBy:{ type: String, default: null },
  rolledBackAt:{ type: Date, default: null },
}, { timestamps: true });

module.exports = model("AuditLog", AuditLogSchema);
