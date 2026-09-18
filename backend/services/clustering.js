/**
 * FARMER LINK CLUSTERING ENGINE
 * ------------------------------------------------------------------
 * Groups nearby farmers who are selling the same crop in a similar
 * harvest window into one bulk-sellable lot ("BulkLot"), so smallholders
 * get a better price together than any one of them would get selling
 * solo to a broker. Pure geometry + date-window logic, no external AI call.
 * ------------------------------------------------------------------
 */

const DISTANCE_THRESHOLD_KM = 15;
const HARVEST_WINDOW_DAYS = 3;
const MIN_GROUP_SIZE = 3;
const BULK_PRICE_ADVANTAGE = 0.08; // bulk lots sell ~8% above solo/broker mandi rate

function haversineDistance(lat1, lng1, lat2, lng2) {
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
        anchor.location.lat, anchor.location.lng,
        other.location.lat, other.location.lng
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
 * solo mandi reference price per quintal. Any rounding remainder from the
 * split is settled onto the single largest share so the total always
 * matches exactly (no paisa lost or invented).
 */
function buildLotEconomics(group, soloPricePerQuintal) {
  const totalQuantity = group.reduce((s, f) => s + f.quantity, 0);
  const pricePerQuintal = +(soloPricePerQuintal * (1 + BULK_PRICE_ADVANTAGE)).toFixed(2);
  const totalValue = +((totalQuantity / 100) * pricePerQuintal).toFixed(2);

  const members = group.map((f) => {
    const share = f.quantity / totalQuantity;
    const amount = +((share * totalValue)).toFixed(2);
    return {
      farmerId: f.farmerId,
      bookingId: f.bookingId,
      quantity: f.quantity,
      share: +share.toFixed(4),
      amount
    };
  });

  // Fix rounding leakage: settle remainder onto the largest share.
  const sumAmounts = members.reduce((s, m) => s + m.amount, 0);
  const remainder = +(totalValue - sumAmounts).toFixed(2);
  if (Math.abs(remainder) >= 0.01) {
    const biggest = members.reduce((a, b) => (b.quantity > a.quantity ? b : a));
    biggest.amount = +(biggest.amount + remainder).toFixed(2);
  }

  return { totalQuantity, pricePerQuintal, totalValue, members };
}

module.exports = {
  haversineDistance,
  clusterFarmers,
  buildLotEconomics,
  DISTANCE_THRESHOLD_KM,
  HARVEST_WINDOW_DAYS,
  MIN_GROUP_SIZE,
  BULK_PRICE_ADVANTAGE
};
