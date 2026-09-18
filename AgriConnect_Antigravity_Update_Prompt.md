# AgriConnect — Feature Update Prompt (Antigravity)

> This extends the existing MVP (farmer booking + AI priority scheduler + admin
> dashboard). Do not rebuild what already works — add these five features on top of
> it, in the priority order given. If time runs short, stop after Tier 2 and mock Tier 3
> rather than half-building everything.

---

## 0. Priority tiers (build in this order)

**Tier 1 — full implementation:**
1. Maps: nearest-centre view using the farmer's live location
2. Transportation request: ask-before-booking toggle + admin assignment

**Tier 2 — scoped-down but real:**
3. Punjabi + Marathi language switcher (farmer app only, core screens only)
4. Voice assistant: a small fixed command set, Hindi/English only

**Tier 3 — mock for the demo, note as roadmap:**
5. SMS notifications: log + toast instead of a real gateway, unless real trial
   credentials are already in hand

---

## 1. Maps — nearest procurement centre

- Add a `location: { lat: Number, lng: Number }` field to the **Farmer** model (captured
  once at registration via the browser's Geolocation API, editable later) and confirm
  **Center** already has `location`.
- New endpoint `GET /api/centers/nearby?lat=&lng=` — reuse the existing Haversine
  distance function from the scheduler docs, sort centres by distance, return the
  nearest 5 with distance in km.
- Frontend: add **Leaflet.js** via CDN (no API key, no billing) with **OpenStreetMap**
  tiles. On the "book" page, request geolocation permission, show a map with the
  farmer's pin and the nearest centres as markers, and let them pick a centre directly
  from the map or the ranked list beside it.
- Same map component gets reused for the transport flow below — plot the assigned
  transport vehicle's last-known location next to the farmer's pickup point.

---

## 2. Transportation facility

**New model — TransportRequest:**
```javascript
{
  bookingId: ObjectId (ref: Booking), required,
  farmerId: ObjectId (ref: Farmer), required,
  pickupLocation: { lat: Number, lng: Number, address: String },
  estimatedWeightKg: Number,
  status: String,        // "requested" | "assigned" | "en_route" | "delivered" | "cancelled"
  assignedPartnerId: ObjectId (ref: TransportPartner),
  createdAt: Date, default: Date.now
}
```

**New model — TransportPartner** (mock fleet, mirrors a simple TMS record):
```javascript
{
  vehicleNumber: String, required,
  driverName: String,
  driverPhone: String,
  capacityKg: Number,
  currentLocation: { lat: Number, lng: Number },
  available: Boolean, default: true
}
```

**Booking flow change:** after the farmer picks a slot and enters crop details, insert
one extra step: "Do you need transportation to the centre?" (Yes/No). If Yes, capture
`pickupLocation` (default to their registered location, editable on the map) and
`estimatedWeightKg`, then create a `TransportRequest` with status `"requested"` linked
to the booking.

**Admin side:** a new small panel on the dashboard listing pending `TransportRequest`s.
One-click "Assign" picks the nearest `available` partner (straight-line distance is
fine — don't overbuild routing) and flips both records to `"assigned"`. Seed 4-5 mock
`TransportPartner` records so this panel isn't empty on first run.

---

## 3. Punjabi + Marathi

- Add `frontend/farmer/js/i18n.js` — a flat object keyed by language code (`en`, `pa`,
  `mr`), each holding the same ~25-30 string keys used across the register/book/
  my-bookings pages (labels, buttons, status names). No translation API — write the
  Punjabi and Marathi strings directly into the dictionary.
- Add a language switcher (dropdown or flag icons) in the header of every farmer page.
  Store the choice in `localStorage` so it persists across pages. On load, swap every
  element's text via a `data-i18n="key"` attribute pattern rather than templating.
- Pull **Noto Sans Gurmukhi** and **Noto Sans Devanagari** from Google Fonts (free,
  CDN) so Punjabi and Marathi script render correctly — don't rely on the system
  default font.
- Scope: farmer app only. The admin dashboard stays English — officials are the
  target user there, not smallholders, so translating it doesn't serve the actual
  inclusion goal and would double the string count for no real benefit.

---

## 4. Voice assistant (scoped)

- Use the browser's built-in **Web Speech API** — `SpeechRecognition` for input,
  `speechSynthesis` for spoken responses. No API key, Chrome-based browsers only
  (flag this as a known limitation, don't hide it).
- Fixed command set only, in English and Hindi (`lang = "en-IN"` / `"hi-IN"` on the
  recognition object) — do not attempt Punjabi/Marathi speech recognition; browser
  support for those is too unreliable to demo live. Note this explicitly as a roadmap
  item (Bhashini ASR/TTS) rather than building it now.
- Commands to support: "book a slot" (walks the farmer through the existing booking
  flow step by step via spoken prompts + confirmations), "check my status" (reads back
  their latest booking's status and token number), "nearest centre" (reads back the
  top result from the Tier-1 nearby-centres endpoint).
- Add a single mic-icon button on the farmer app header that starts/stops listening,
  with a visible transcript of what it heard so a judge can see it's not faked.

---

## 5. SMS notifications (mock unless real keys are ready)

- Add `backend/services/smsService.js` with one function,
  `sendSms(phone, message)`. If `SMS_API_KEY` is set in `.env`, call the real provider
  (Fast2SMS or MSG91) via Axios; if not set, just `console.log` the message and store
  it in a lightweight `SmsLog` collection so the admin dashboard can show a "Notifications
  sent" list even without a live gateway.
- Trigger points: booking confirmed (with token number + slot time), transport
  assigned (with vehicle number + driver phone), booking status changes to
  `"completed"` or `"rejected"`.
- Do not block on this — if `SMS_API_KEY` isn't set, everything above still works and
  looks identical in the UI (a toast + a logged entry), so the feature is demoable
  either way.

---

## 6. Updated build order

1. Maps + nearby-centres endpoint (Tier 1a) — test the ranking against your seeded
   centre coordinates before touching the UI.
2. TransportRequest + TransportPartner models, booking-flow toggle, admin assign panel
   (Tier 1b).
3. i18n dictionary + language switcher on farmer pages (Tier 2a).
4. Voice assistant with the three fixed commands (Tier 2b) — test each command in
   isolation before wiring it into the booking flow.
5. smsService with the mock fallback, wired into the three trigger points (Tier 3).
6. Full walkthrough: register → get geolocation → see nearest centre on map → book a
   slot → say yes to transport → admin assigns a partner → switch UI to Punjabi → try
   the voice "check my status" command → confirm a notification log entry appears.

Ship all six. Every feature must degrade gracefully with no external keys set — the
whole demo needs to run offline on a laptop with no live SMS/Maps-API dependency.
