const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongoServer = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/agriconnect";
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
    console.log("[db] connected ->", uri);
  } catch (err) {
    if (!mongoServer) {
      console.log("[db] Standard MongoDB connection failed. Starting embedded MongoDB with persistence...");
      const dbPath = path.join(__dirname, "../.mongo_data");
      if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });

      try {
        mongoServer = await MongoMemoryServer.create({
          instance: {
            port: 27017,
            dbName: "agriconnect",
            dbPath: dbPath,
            storageEngine: "wiredTiger"
          }
        });
      } catch (e) {
        mongoServer = await MongoMemoryServer.create({
          instance: {
            dbName: "agriconnect",
            dbPath: dbPath,
            storageEngine: "wiredTiger"
          }
        });
      }
    }
    const memUri = mongoServer.getUri();
    await mongoose.connect(memUri);
    console.log("[db] connected to embedded MongoDB ->", memUri);
  }
}

module.exports = connectDB;
