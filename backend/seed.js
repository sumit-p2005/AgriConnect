/**
 * Seed script - populates enough demo data that the AI scheduler and the
 * Farmer Link clustering engine both have something interesting to do the
 * moment you open the app, instead of demoing against an empty database.
 *
 * Run:  npm run seed
 */
require("dotenv").config();
const bcrypt = require("bcryptjs");
const connectDB = require("./config/db");

const Farmer = require("./models/Farmer");
const Admin = require("./models/Admin");
const Crop = require("./models/Crop");
const Center = require("./models/Center");
const Slot = require("./models/Slot");
const Booking = require("./models/Booking");
const BulkLot = require("./models/BulkLot");
const TransportRequest = require("./models/TransportRequest");
const TransportPartner = require("./models/TransportPartner");
const SmsLog = require("./models/SmsLog");

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function run() {
  await connectDB();
  console.log("[seed] clearing old data...");
  await Promise.all([
    Farmer.deleteMany({}), Admin.deleteMany({}), Crop.deleteMany({}),
    Center.deleteMany({}), Slot.deleteMany({}), Booking.deleteMany({}), BulkLot.deleteMany({}),
    TransportRequest.deleteMany({}), TransportPartner.deleteMany({}), SmsLog.deleteMany({})
  ]);


  console.log("[seed] crops...");
  const crops = await Crop.insertMany([
    { name: "Tomato", nameHi: "टमाटर", perishabilityScore: 0.95, basePricePerQuintal: 1200 },
    { name: "Spinach", nameHi: "पालक", perishabilityScore: 0.92, basePricePerQuintal: 1500 },
    { name: "Mango", nameHi: "आम", perishabilityScore: 0.75, basePricePerQuintal: 4000 },
    { name: "Onion", nameHi: "प्याज", perishabilityScore: 0.45, basePricePerQuintal: 1800 },
    { name: "Potato", nameHi: "आलू", perishabilityScore: 0.35, basePricePerQuintal: 1400 },
    { name: "Wheat", nameHi: "गेहूं", perishabilityScore: 0.10, basePricePerQuintal: 2275 },
    { name: "Rice", nameHi: "चावल", perishabilityScore: 0.15, basePricePerQuintal: 2183 },
    { name: "Mustard", nameHi: "सरसों", perishabilityScore: 0.15, basePricePerQuintal: 5650 }
  ]);

  console.log("[seed] centres...");
  const centers = await Center.insertMany([
    {
      name: "Phagwara Mandi Yard", address: "GT Road, Phagwara, Punjab",
      location: { lat: 31.224, lng: 75.771 },
      acceptedCrops: ["Tomato", "Wheat", "Rice", "Potato", "Mustard"],
      capacityPerHour: 24, currentLoad: 0, storageCapacityKg: 8000, active: true
    },
    {
      name: "Jalandhar Procurement Centre", address: "Ladowali Road, Jalandhar, Punjab",
      location: { lat: 31.326, lng: 75.579 },
      acceptedCrops: ["Onion", "Potato", "Wheat", "Spinach"],
      capacityPerHour: 18, currentLoad: 0, storageCapacityKg: 6000, active: true
    },
    {
      name: "Kapurthala Collection Point", address: "Sultanpur Road, Kapurthala, Punjab",
      location: { lat: 31.379, lng: 75.383 },
      acceptedCrops: ["Mango", "Tomato", "Mustard", "Rice"],
      capacityPerHour: 15, currentLoad: 0, storageCapacityKg: 4000, active: true
    }
  ]);

  console.log("[seed] admins...");
  const pass = await bcrypt.hash("admin123", 10);
  await Admin.insertMany([
    { name: "Officer Ramesh (Centre Staff)", phone: "9000000001", passwordHash: pass, role: "centre_staff", centerId: centers[0]._id },
    { name: "Supervisor Anjali (District)", phone: "9000000002", passwordHash: pass, role: "district_supervisor", centerId: null }
  ]);

  console.log("[seed] transport partners (fleet)...");
  await TransportPartner.insertMany([
    { vehicleNumber: "PB-09-A-1024", driverName: "Sukhdev Singh", driverPhone: "9876500001", capacityKg: 2000, currentLocation: { lat: 31.22, lng: 75.76 }, available: true },
    { vehicleNumber: "PB-08-C-5050", driverName: "Harpreet Sharma", driverPhone: "9876500002", capacityKg: 3500, currentLocation: { lat: 31.33, lng: 75.58 }, available: true },
    { vehicleNumber: "PB-36-B-8812", driverName: "Jaswant Verma", driverPhone: "9876500003", capacityKg: 1500, currentLocation: { lat: 31.38, lng: 75.39 }, available: true },
    { vehicleNumber: "PB-10-F-9900", driverName: "Gurdas Ram", driverPhone: "9876500004", capacityKg: 5000, currentLocation: { lat: 31.28, lng: 75.65 }, available: true }
  ]);


  console.log("[seed] slots (today + tomorrow, every centre)...");
  const dates = [todayStr(0), todayStr(1)];
  const slotDocs = [];
  for (const center of centers) {
    for (const date of dates) {
      for (let h = 6; h < 18; h += 2) {
        slotDocs.push({
          centerId: center._id, date,
          startTime: `${String(h).padStart(2, "0")}:00`,
          endTime: `${String(h + 2).padStart(2, "0")}:00`,
          capacity: 5, bookedCount: 0, status: "open"
        });
      }
    }
  }
  const slots = await Slot.insertMany(slotDocs);
  const slotFor = (centerId, date, startTime) =>
    slots.find(s => String(s.centerId) === String(centerId) && s.date === date && s.startTime === startTime);

  console.log("[seed] demo farmers...");
  const farmerPass = await bcrypt.hash("farmer123", 10);
  const villages = [
    { village: "Sansarpur", district: "Jalandhar", state: "Punjab", lat: 31.30, lng: 75.60 },
    { village: "Nakodar", district: "Jalandhar", state: "Punjab", lat: 31.12, lng: 75.47 },
    { village: "Adampur", district: "Jalandhar", state: "Punjab", lat: 31.43, lng: 75.70 },
    { village: "Begowal", district: "Kapurthala", state: "Punjab", lat: 31.52, lng: 75.35 },
    { village: "Bholath", district: "Kapurthala", state: "Punjab", lat: 31.53, lng: 75.30 }
  ];
  const names = [
    "Gurpreet Singh", "Manjit Kaur", "Harbans Lal", "Simran Kaur", "Baldev Singh",
    "Ranjit Singh", "Amarjit Kaur", "Surinder Pal", "Kuldeep Singh", "Jasbir Kaur",
    "Charan Singh", "Rupinder Kaur", "Tarsem Lal", "Navjot Singh", "Paramjit Kaur",
    "Balwinder Singh"
  ];
  const cropChoices = ["Tomato", "Wheat", "Onion", "Mango", "Potato", "Mustard"];
  const storageChoices = ["none", "short-term", "long-term"];

  const farmers = [];
  for (let i = 0; i < names.length; i++) {
    const v = villages[i % villages.length];
    const jitter = () => (Math.random() - 0.5) * 0.08; // ~ +/- a few km
    farmers.push(await Farmer.create({
      name: names[i],
      phone: `70000000${String(i + 10).padStart(2, "0")}`,
      passwordHash: farmerPass,
      village: v.village, district: v.district, state: v.state,
      primaryCrop: cropChoices[i % cropChoices.length],
      storageCapability: storageChoices[i % storageChoices.length],
      location: { lat: v.lat + jitter(), lng: v.lng + jitter() },
      reputationScore: 70 + (i % 30)
    }));
  }

  console.log("[seed] demo bookings (mixed priority for scheduler demo)...");
  const { calculatePriorityScore, reorderSlotQueue } = require("./services/scheduler");
  const bookingSlot = slotFor(centers[0]._id, dates[0], "08:00"); // everyone piles into the same slot on purpose

  const demoRequests = [
    { farmer: farmers[0], cropType: "Wheat", quantity: 1800, harvestWindowDays: 10, storageCapability: "long-term" },
    { farmer: farmers[1], cropType: "Tomato", quantity: 300, harvestWindowDays: 1, storageCapability: "none" },
    { farmer: farmers[2], cropType: "Wheat", quantity: 900, harvestWindowDays: 8, storageCapability: "short-term" },
    { farmer: farmers[3], cropType: "Tomato", quantity: 500, harvestWindowDays: 2, storageCapability: "none" }
  ];

  for (const r of demoRequests) {
    const crop = crops.find(c => c.name === r.cropType);
    const claimed = await Slot.findOneAndUpdate(
      { _id: bookingSlot._id, $expr: { $lt: ["$bookedCount", "$capacity"] } },
      { $inc: { bookedCount: 1 } }, { new: true }
    );
    const status = claimed ? "confirmed" : "waitlisted";
    const { score, breakdown } = calculatePriorityScore(r, crop, centers[0], r.cropType);
    await Booking.create({
      farmerId: r.farmer._id, centerId: centers[0]._id, slotId: bookingSlot._id,
      cropType: r.cropType, variety: "Standard", quantity: r.quantity,
      harvestWindowDays: r.harvestWindowDays, storageCapability: r.storageCapability,
      priorityScore: score, scoreBreakdown: breakdown, status,
      notificationsLog: [{ message: "AgriConnect: Slot booked (seed data)." }]
    });
  }
  await reorderSlotQueue(Booking, bookingSlot._id);

  // Extra confirmed bookings across farmers/crops for clustering + dashboard variety
  console.log("[seed] extra bookings for clustering + dashboard variety...");
  for (let i = 4; i < farmers.length; i++) {
    const f = farmers[i];
    const crop = crops.find(c => c.name === f.primaryCrop) || crops[0];
    const center = centers.find(c => c.acceptedCrops.includes(crop.name)) || centers[0];
    const centerSlots = slots.filter(s => String(s.centerId) === String(center._id) && s.date === dates[i % 2]);
    const targetSlot = centerSlots[i % centerSlots.length];
    const claimed = await Slot.findOneAndUpdate(
      { _id: targetSlot._id, $expr: { $lt: ["$bookedCount", "$capacity"] } },
      { $inc: { bookedCount: 1 } }, { new: true }
    );
    const status = claimed ? "confirmed" : "waitlisted";
    const harvestWindowDays = 1 + (i % 5);
    const storageCapability = storageChoices[i % storageChoices.length];
    const quantity = 200 + (i * 57) % 900;
    const { score, breakdown } = calculatePriorityScore(
      { quantity, harvestWindowDays, storageCapability }, crop, center, crop.name
    );
    await Booking.create({
      farmerId: f._id, centerId: center._id, slotId: targetSlot._id,
      cropType: crop.name, variety: "Standard", quantity,
      harvestWindowDays, storageCapability,
      priorityScore: score, scoreBreakdown: breakdown, status,
      notificationsLog: [{ message: "AgriConnect: Slot booked (seed data)." }]
    });
    await reorderSlotQueue(Booking, targetSlot._id);
  }

  console.log("[seed] done!");
  console.log("--------------------------------------------------");
  console.log("Admin logins:      9000000001 / admin123 (centre staff)");
  console.log("                   9000000002 / admin123 (district supervisor)");
  console.log("Demo farmer login: 7000000010 / farmer123  (Gurpreet Singh)");
  console.log("Register your own farmer from the app too!");
  console.log("--------------------------------------------------");
}

if (require.main === module) {
  run().catch(e => { console.error(e); process.exit(1); });
} else {
  module.exports = run;
}

