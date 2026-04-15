const mongoose = require("mongoose");
const logger = require("../utils/logger");

let isConnected = false;

async function connectMongo() {
  if (isConnected) return;
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    logger.info("MongoDB connected");
  } catch (err) {
    logger.error("MongoDB connection failed:", err);
    process.exit(1);
  }
}

module.exports = { connectMongo };
