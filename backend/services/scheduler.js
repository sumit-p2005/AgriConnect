/**
 * DYNAMIC PROCUREMENT SCHEDULER
 * ------------------------------------------------------------------
 * A rule-based weighted-scoring engine (no external LLM call). It runs
 * automatically every time a booking is created or cancelled and decides:
 *   1) priorityScore (0-1) for the booking
 *   2) tokenNumber -> the farmer's position in that slot's physical queue
 *
 * It NEVER changes which slot a farmer is confirmed into once booked (that
 * would be unfair / confusing at the gate). What it DOES control is queue
 * ORDER within the slot, so a truckload of tomatoes doesn't stand behind
 * a truckload of wheat just because the wheat farmer clicked "book" first.
 * ------------------------------------------------------------------
 */

// Named weights -> easy to tune live during a demo.
const WEIGHTS = {
  perishability: 0.30,
  harvestUrgency: 0.20,
  quantity: 0.15,
  storage: 0.15,
  congestion: 0.10,
  capacityHeadroom: 0.10
};

const MAX_WINDOW_DAYS = 14;
const MAX_QUANTITY_KG = 2000;
const STORAGE_SCORE = { none: 0, "short-term": 0.5, "long-term": 1 };

// A default perishability table, used as a fallback if a crop isn't in the DB.
const DEFAULT_PERISHABILITY = {
  tomato: 0.95, spinach: 0.95, "leafy greens": 0.9, mango: 0.75, banana: 0.7,
  onion: 0.4, potato: 0.35, wheat: 0.1, rice: 0.15, maize: 0.2, gram: 0.1, mustard: 0.15
};

function getPerishability(cropDoc, cropTypeFallback) {
  if (cropDoc && typeof cropDoc.perishabilityScore === "number") return cropDoc.perishabilityScore;
  const key = (cropTypeFallback || "").toLowerCase();
  return DEFAULT_PERISHABILITY[key] ?? 0.5;
}

/**
 * calculatePriorityScore
 * @param {Object} request { quantity, harvestWindowDays, storageCapability }
 * @param {Object} cropDoc  Crop mongoose doc (may be null)
 * @param {Object} center   Center mongoose doc { currentLoad, capacityPerHour }
 * @returns {{ score: number, breakdown: object }}
 */
function calculatePriorityScore(request, cropDoc, center, cropTypeFallback) {
  const normPerishability = getPerishability(cropDoc, cropTypeFallback);
  const normHarvestUrgency = 1 - Math.min((request.harvestWindowDays ?? 3) / MAX_WINDOW_DAYS, 1);
  const normQuantity = Math.min((request.quantity ?? 0) / MAX_QUANTITY_KG, 1);
  const normStorage = 1 - (STORAGE_SCORE[request.storageCapability] ?? 0);

  const capacityPerHour = Math.max(center?.capacityPerHour ?? 20, 1);
  const currentLoad = Math.min(center?.currentLoad ?? 0, capacityPerHour);
  const normCongestion = 1 - currentLoad / capacityPerHour;
  const normCapacityHeadroom = (capacityPerHour - currentLoad) / capacityPerHour;

  const breakdown = {
    perishability: +(WEIGHTS.perishability * normPerishability).toFixed(4),
    harvestUrgency: +(WEIGHTS.harvestUrgency * normHarvestUrgency).toFixed(4),
    quantity: +(WEIGHTS.quantity * normQuantity).toFixed(4),
    storage: +(WEIGHTS.storage * normStorage).toFixed(4),
    congestion: +(WEIGHTS.congestion * normCongestion).toFixed(4),
    capacityHeadroom: +(WEIGHTS.capacityHeadroom * normCapacityHeadroom).toFixed(4)
  };

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score: +score.toFixed(4), breakdown };
}

/**
 * reorderSlotQueue
 * Re-sorts every active (not yet arrived / not cancelled / not rejected) booking
 * in a slot by priorityScore descending, ties broken by createdAt (fair, stable),
 * and re-assigns tokenNumber 1..n. This is what makes the "AI" visible on screen:
 * a later booking with a higher score can legitimately get a smaller token number
 * than a booking made earlier with a lower score.
 *
 * MAX-WAIT CAP: any booking that has already been waiting more than MAX_WAIT_HOURS
 * is pinned to the front of the remaining queue regardless of score, so nobody
 * is starved indefinitely by always-higher-scoring new arrivals.
 */
const MAX_WAIT_HOURS = 6;

async function reorderSlotQueue(Booking, slotId) {
  const bookings = await Booking.find({
    slotId,
    status: { $in: ["confirmed", "waitlisted"] }
  });

  const now = Date.now();
  bookings.sort((a, b) => {
    const aWaitHrs = (now - new Date(a.createdAt).getTime()) / 36e5;
    const bWaitHrs = (now - new Date(b.createdAt).getTime()) / 36e5;
    const aCapped = aWaitHrs >= MAX_WAIT_HOURS;
    const bCapped = bWaitHrs >= MAX_WAIT_HOURS;
    if (aCapped !== bCapped) return aCapped ? -1 : 1;      // capped ones jump to front
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    return new Date(a.createdAt) - new Date(b.createdAt);   // stable tie-break
  });

  await Promise.all(
    bookings.map((b, i) => Booking.updateOne({ _id: b._id }, { tokenNumber: i + 1 }))
  );

  return bookings.length;
}

module.exports = { calculatePriorityScore, reorderSlotQueue, WEIGHTS, MAX_WAIT_HOURS };
