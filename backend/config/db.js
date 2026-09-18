const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");

// Cache connection across Vercel serverless function invocations
let cached = global._mongoose;
if (!cached) {
  cached = global._mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  const uri = process.env.MONGODB_URI;
  const isVercel = !!(process.env.VERCEL || process.env.AWS_EXECUTION_ENV);

  if (uri) {
    if (!cached.promise) {
      cached.promise = mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000
      }).then((m) => {
        console.log("[db] connected -> MONGODB_URI (Atlas)");
        return m;
      });
    }
    try {
      cached.conn = await cached.promise;
      return cached.conn;
    } catch (e) {
      cached.promise = null;
      console.error("[db] Atlas connection error:", e.message);
      throw e;
    }
  }

  // Local development fallback: ONLY reached when MONGODB_URI is completely unset
  if (!isVercel) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    if (!global._mongoServer) {
      console.log("[db] MONGODB_URI unset. Starting embedded MongoMemoryServer (local dev only)...");
      try {
        const dbPath = path.join(__dirname, "../.mongo_data");
        if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });
        global._mongoServer = await MongoMemoryServer.create({
          instance: { dbName: "agriconnect", dbPath, storageEngine: "wiredTiger" }
        });
      } catch (err) {
        global._mongoServer = await MongoMemoryServer.create({ instance: { dbName: "agriconnect" } });
      }
    }
    const memUri = global._mongoServer.getUri();
    await mongoose.connect(memUri);
    console.log("[db] connected -> MongoMemoryServer:", memUri);
    cached.conn = mongoose.connection;
    return cached.conn;
  }

  throw new Error("MONGODB_URI environment variable is required for production deployment.");
}

module.exports = connectDB;
