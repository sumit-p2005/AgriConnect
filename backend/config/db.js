const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");

let mongoServer = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/agriconnect";
  const isVercel = !!(process.env.VERCEL || process.env.AWS_EXECUTION_ENV);

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log("[db] connected -> MongoDB");
  } catch (err) {
    console.warn("[db] Primary MongoDB connection failed:", err.message);

    const { MongoMemoryServer } = require("mongodb-memory-server");
    if (!mongoServer) {
      console.log("[db] Starting embedded MongoMemoryServer fallback...");
      try {
        let instanceOpts = { dbName: "agriconnect" };
        if (!isVercel) {
          const dbPath = path.join(__dirname, "../.mongo_data");
          if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });
          instanceOpts.dbPath = dbPath;
          instanceOpts.storageEngine = "wiredTiger";
        }

        mongoServer = await MongoMemoryServer.create({ instance: instanceOpts });
      } catch (memCreateErr) {
        console.warn("[db] In-memory DB creation with path failed, falling back to pure RAM:", memCreateErr.message);
        mongoServer = await MongoMemoryServer.create({ instance: { dbName: "agriconnect" } });
      }
    }
    const memUri = mongoServer.getUri();
    await mongoose.connect(memUri);
    console.log("[db] connected to embedded MongoDB ->", memUri);
  }
}

module.exports = connectDB;
