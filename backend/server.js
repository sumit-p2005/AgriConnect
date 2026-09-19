require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const Center = require("./models/Center");
const seed = require("./seed");

const authRoutes = require("./routes/auth");
const farmerRoutes = require("./routes/farmer");
const adminRoutes = require("./routes/admin");
const grievanceRoutes = require("./routes/grievance");
const { errorHandler } = require("./middleware/errorHandler");

const app = express();
app.use(cors());
app.use(express.json());

// Ensure DB connection for API requests (serverless friendly)
app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (e) {
    console.error("[db middleware error]:", e.message);
    res.status(500).json({ error: "Database connection failed." });
  }
});

// API Routes
app.get("/api/health", (req, res) => res.json({ ok: true, service: "AgriConnect API (MVC Restructured)" }));
app.use("/api/auth", authRoutes);
app.use("/api/farmer", farmerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/grievance", grievanceRoutes);

// Static Frontends
app.use("/farmer", express.static(path.join(__dirname, "../frontend-farmer")));
app.use("/admin", express.static(path.join(__dirname, "../frontend-admin")));

// Root Hub / Portal Page
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AgriConnect — Portal</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
        body { background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; max-width: 650px; width: 100%; padding: 40px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
        .badge { display: inline-block; background: #065f46; color: #34d399; font-weight: 700; font-size: 12px; padding: 4px 12px; border-radius: 9999px; margin-bottom: 16px; letter-spacing: 0.05em; }
        h1 { font-size: 32px; font-weight: 800; color: #ffffff; margin-bottom: 8px; }
        p.sub { color: #94a3b8; font-size: 15px; margin-bottom: 32px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 32px; }
        @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
        .btn-card { background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 24px; text-decoration: none; color: white; transition: all 0.2s ease; display: flex; flex-direction: column; gap: 10px; }
        .btn-card:hover { transform: translateY(-3px); border-color: #10b981; box-shadow: 0 10px 20px -5px rgba(16, 185, 129, 0.2); }
        .btn-card .icon { font-size: 32px; }
        .btn-card h3 { font-size: 18px; color: #f8fafc; }
        .btn-card p { font-size: 13px; color: #94a3b8; line-height: 1.4; }
        .creds { background: #0f172a; border-radius: 8px; padding: 16px; font-size: 13px; color: #cbd5e1; border: 1px solid #1e293b; }
        .creds code { background: #334155; color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
      </style>
    </head>
    <body>
      <div class="card">
        <span class="badge">● AGRICONNECT LIVE</span>
        <h1>🌾 AgriConnect Hub</h1>
        <p class="sub">AI-Driven Smallholder Agricultural Procurement Platform (SIH 2026)</p>
        
        <div class="grid">
          <a href="/farmer/" class="btn-card">
            <span class="icon">🚜</span>
            <h3>Farmer App</h3>
            <p>Mobile web interface for crop slot booking, queue tracking & bulk lot grouping.</p>
          </a>
          <a href="/admin/" class="btn-card">
            <span class="icon">💻</span>
            <h3>Admin Dashboard</h3>
            <p>Procurement control room for queue management, quality check & analytics.</p>
          </a>
        </div>

        <div class="creds">
          <strong>🔑 Demo Logins:</strong><br><br>
          • <strong>Farmer:</strong> Phone <code>7000000010</code> | Password <code>farmer123</code><br>
          • <strong>Admin Staff:</strong> Phone <code>9000000001</code> | Password <code>admin123</code><br>
          • <strong>Supervisor:</strong> Phone <code>9000000002</code> | Password <code>admin123</code>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Centralized error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  connectDB()
    .then(async () => {
      try {
        const centerCount = await Center.countDocuments();
        if (centerCount === 0) {
          console.log("[server] No data found in database. Auto-seeding initial demo data...");
          await seed();
        }
      } catch (e) {
        console.error("[server] Seed check error:", e.message);
      }
      app.listen(PORT, () => {
        console.log("==================================================");
        console.log(`🚀 AgriConnect API & Frontends running at:`);
        console.log(`   ► Portal Hub:    http://localhost:${PORT}/`);
        console.log(`   ► Farmer App:    http://localhost:${PORT}/farmer/`);
        console.log(`   ► Admin App:     http://localhost:${PORT}/admin/`);
        console.log(`   ► Backend API:   http://localhost:${PORT}/api/health`);
        console.log("==================================================");
      });
    })
    .catch((e) => {
      console.error("[db] connection failed:", e.message);
    });
}

module.exports = app;
