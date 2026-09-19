/**
 * FARMER LINK CLUSTERING ENGINE
 * ------------------------------------------------------------------
 * Groups nearby farmers who are selling the same crop in a similar
 * harvest window into one bulk-sellable lot ("BulkLot"), so smallholders
 * get a better price together (+8% premium) than any one of them would get selling
 * solo to a broker. Pure geometry + date-window logic.
 * ------------------------------------------------------------------
 */

const DISTANCE_THRESHOLD_KM = 25; // 25 km pooling radius
const HARVEST_WINDOW_DAYS = 4;    // 4 day harvest window compatibility
const MIN_GROUP_SIZE = 2;         // 2 or more farmers to pool
const BULK_PRICE_ADVANTAGE = 0.08; // bulk lots sell ~8% above solo/broker mandi rate

function haversineDistance(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return 0;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * candidates: array of { farmerId, location:{lat,lng}, harvestDateTs, quantity, bookingId }
 * returns: array of groups, each an array of candidate objects (length >= MIN_GROUP_SIZE)
 */
function clusterFarmers(candidates) {
  const pool = candidates.map((c) => ({ ...c, grouped: false }));
  const groups = [];

  for (const anchor of pool) {
    if (anchor.grouped) continue;
    const group = [anchor];
    for (const other of pool) {
      if (other === anchor || other.grouped) continue;
      const dist = haversineDistance(
        anchor.location?.lat || 31.25, anchor.location?.lng || 75.70,
        other.location?.lat || 31.25, other.location?.lng || 75.70
      );
      const dayGap = Math.abs(anchor.harvestDateTs - other.harvestDateTs) / 86400000;
      if (dist <= DISTANCE_THRESHOLD_KM && dayGap <= HARVEST_WINDOW_DAYS) {
        group.push(other);
      }
    }
    if (group.length >= MIN_GROUP_SIZE) {
      group.forEach((f) => (f.grouped = true));
      groups.push(group);
    }
  }
  return groups;
}

/**
 * Build the members array + proportional shares for a BulkLot, given a
 * solo mandi reference price per quintal.
 */
function buildLotEconomics(group, soloPricePerQuintal) {
  const totalQuantity = group.reduce((s, f) => s + f.quantity, 0);
  const pricePerQuintal = +(soloPricePerQuintal * (1 + BULK_PRICE_ADVANTAGE)).toFixed(2);
  const totalValue = +((totalQuantity / 100) * pricePerQuintal).toFixed(2);

  const members = group.map((f) => {
    const share = f.quantity / (totalQuantity || 1);
    const amount = +((share * totalValue)).toFixed(2);
    return {
      farmerId: f.farmerId,
      bookingId: f.bookingId,
      quantity: f.quantity,
      share: +share.toFixed(4),
      amount
    };
  });

  // Fix rounding remainder: settle onto largest share
  const sumAmounts = members.reduce((s, m) => s + m.amount, 0);
  const remainder = +(totalValue - sumAmounts).toFixed(2);
  if (Math.abs(remainder) >= 0.01 && members.length > 0) {
    const biggest = members.reduce((a, b) => (b.quantity > a.quantity ? b : a));
    biggest.amount = +(biggest.amount + remainder).toFixed(2);
  }

  return { totalQuantity, pricePerQuintal, totalValue, members };
}

/**
 * Auto-clusters pending bookings for a given crop or farmer.
 * Automatically called on booking creation or on-demand pooling.
 */
async function autoClusterForCrop(cropType, models, notifyFn, smsFn) {
  const { Booking, BulkLot, Crop, Farmer } = models;
  if (!cropType) return null;

  const crop = await Crop.findOne({ name: new RegExp(`^${cropType}$`, "i") });
  const soloPrice = crop ? crop.basePricePerQuintal : 2200;

  // Find unpooled active bookings for this crop
  const bookings = await Booking.find({
    cropType: new RegExp(`^${cropType}$`, "i"),
    status: { $in: ["confirmed", "waitlisted"] },
    bulkLotId: null
  }).populate("farmerId", "name phone location village district");

  if (bookings.length < MIN_GROUP_SIZE) return null;

  const candidates = bookings
    .filter(b => b.farmerId)
    .map(b => ({
      farmerId: b.farmerId._id,
      bookingId: b._id,
      location: b.farmerId.location || { lat: 31.25, lng: 75.70 },
      harvestDateTs: Date.now() + (b.harvestWindowDays || 3) * 86400000,
      quantity: b.quantity
    }));

  const groups = clusterFarmers(candidates);
  const createdLots = [];

  for (const group of groups) {
    const economics = buildLotEconomics(group, soloPrice);
    const lot = await BulkLot.create({
      cropType,
      members: economics.members,
      totalQuantity: economics.totalQuantity,
      pricePerQuintal: economics.pricePerQuintal,
      soloPricePerQuintal: soloPrice,
      totalValue: economics.totalValue,
      status: "forming"
    });

    await Booking.updateMany(
      { _id: { $in: group.map(g => g.bookingId) } },
      { bulkLotId: lot._id }
    );

    if (smsFn) {
      for (const m of economics.members) {
        const f = await Farmer.findById(m.farmerId);
        if (f && f.phone) {
          const msg = `AgriConnect: You've been pooled with ${group.length - 1} nearby farmers for ${cropType}! +8% bulk bonus active. Check "My Group" in app.`;
          try {
            await smsFn(f.phone, msg);
          } catch (err) {
            console.warn("SMS error in cluster:", err);
          }
        }
      }
    }
    createdLots.push(lot);
  }

  return createdLots;
}

module.exports = {
  haversineDistance,
  clusterFarmers,
  buildLotEconomics,
  autoClusterForCrop,
  DISTANCE_THRESHOLD_KM,
  HARVEST_WINDOW_DAYS,
  MIN_GROUP_SIZE,
  BULK_PRICE_ADVANTAGE
};
