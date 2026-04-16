const { Schema, model } = require("mongoose");

const TeamMemberSchema = new Schema({
  username:  { type: String, required: true, unique: true },
  password:  { type: String, required: true }, // bcrypt hash
  role:      { type: String, enum: ["admin", "editor"], default: "editor" },
  createdBy: { type: String, default: "system" },
  isActive:  { type: Boolean, default: true },
}, { timestamps: true });

module.exports = model("TeamMember", TeamMemberSchema);
