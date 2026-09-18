# AgriConnect — SIH 2026 Prototype (PS 26032)

A smallholder-first agricultural procurement platform. Replaces first-come-first-served
queues with an **AI scheduling engine** and auto-groups nearby farmers into
**bulk-sellable lots** for better, broker-free prices.

Two frontends (farmer mobile app in English + Hindi, admin desktop control room) talking
to one Node/Express/MongoDB backend that runs two rule-based AI engines automatically in
the background — no external LLM calls, fully explainable, and fast enough to demo live.

---

## 1. What makes this "AI"

Both engines are **transparent, weighted-scoring algorithms** — the kind a judge can
see the exact math for, not a black box.

### Dynamic Procurement Scheduler (`backend/services/scheduler.js`)
Every time a farmer books a slot, the engine scores the request 0–1 using:

| Factor | Weight |
|---|---|
| Crop perishability | 0.30 |
| Harvest-window urgency | 0.20 |
| Quantity | 0.15 |
| Storage capability (inverse) | 0.15 |
| Centre congestion | 0.10 |
| Centre capacity headroom | 0.10 |

The score decides the farmer's **token number** (queue position) within their slot —
a truckload of tomatoes with no storage jumps ahead of a truckload of wheat sitting in a
farmer's own warehouse, even if the wheat farmer booked first. A **6-hour max-wait cap**
stops any single farmer being pushed back forever by a stream of higher-priority new
arrivals.

### Farmer Link Clustering (`backend/services/clustering.js`)
Groups farmers selling the same crop within **15km** of each other and within **3 days**
of harvest into a `BulkLot` (minimum group size 3), then splits an ~8% bulk-price
advantage over the solo mandi rate proportionally across members — with any rounding
remainder settled onto the largest share so the total always matches exactly.

Both engines fire automatically from the backend; the UI on both apps is built to make
their output visible (priority score, token order, cluster membership, price advantage)
so it's obvious to a judge that something real is happening, not just trusted to work.

---

## 2. Tech stack

- **Frontend (both apps):** HTML, CSS, vanilla JavaScript, Axios. No framework, no build step.
- **Backend:** Node.js + Express.js (single REST API)
- **Database:** MongoDB via Mongoose
- **Auth:** JWT + bcrypt
- **Notifications & payments:** mocked (console-logged "SMS" + manual payment recording)
  so the demo never depends on a paid third-party account — swap in Twilio/MSG91 and
  Razorpay later without touching call sites.

---

## 3. Folder structure

```
agriconnect/
├── backend/                  Node/Express/MongoDB API + the two AI engines
│   ├── server.js
│   ├── seed.js                ← populates demo data, run this first
│   ├── config/db.js
│   ├── models/                Farmer, Admin, Crop, Center, Slot, Booking, BulkLot
│   ├── services/               scheduler.js, clustering.js, notify.js  (the "AI")
│   ├── middleware/auth.js
│   └── routes/                 auth.js, farmer.js, admin.js
├── frontend-farmer/           Mobile-styled web app for farmers (English + Hindi)
│   ├── index.html, home.html, book.html, bookings.html,
│   │   group.html, price.html, grievance.html, profile.html
│   ├── css/style.css
│   └── js/                     api.js, lang.js, status.js, + one file per page
│       └── lang/en.json, hi.json
└── frontend-admin/            Desktop control-room dashboard for procurement officers
    ├── index.html, dashboard.html, queue.html, bookings.html,
    │   slots.html, bulklots.html, analytics.html
    ├── css/style.css
    └── js/                      api.js + one file per page
```

---

## 4. Running it

### Backend
```bash
cd backend
npm install
cp .env.example .env        # edit MONGODB_URI if not using local MongoDB
npm run seed                # populates centres, crops, admins, demo farmers + bookings
npm start                   # http://localhost:5000
```
You need a MongoDB instance reachable at `MONGODB_URI` — either run MongoDB locally
(`mongod`) or point it at a free MongoDB Atlas cluster.

### Farmer app
Open `frontend-farmer/index.html` directly in a browser, or serve it statically:
```bash
cd frontend-farmer
npx serve .        # or: python3 -m http.server 5500
```
Demo login: **7000000010** / **farmer123** (or register a new farmer from the app).

### Admin dashboard
Open `frontend-admin/index.html` directly, or serve it statically the same way.

Demo logins:
- Centre staff: **9000000001** / **admin123**
- District supervisor: **9000000002** / **admin123**

> Both frontends call the API at `http://localhost:5000/api` — change `API_BASE` at the
> top of `js/api.js` in each frontend if you deploy the backend elsewhere.

---

## 5. Suggested demo script (5 minutes)

1. **Show the problem** — open the admin **Live Queue** for "Phagwara Mandi Yard" today;
   point out the seeded 08:00 slot already has 4 farmers in it with a *tomato* farmer
   and a *wheat* farmer who booked **after** two other farmers, yet sits near the top —
   because of `priorityScore`, not arrival order. Open the booking detail to show the
   score breakdown.
2. **Book live as a farmer** — in the farmer app, register/login, book a slot for a
   highly perishable crop (Tomato) with "no storage" and a 1-day harvest window. Refresh
   the admin Live Queue — the new booking's token number visibly slots in ahead of
   lower-priority wheat/rice bookings in the same slot.
3. **Run the full lifecycle** — in admin Live Queue: Mark Arrived → Quality Check (pass)
   → Approve (enter price) → Record Payment → Mark Complete. Flip back to the farmer
   app's booking detail to show the status timeline and "SMS" notification log updating
   at each step.
4. **Show Farmer Link** — in admin **Bulk Lots**, type a crop (e.g. "Wheat" or "Tomato")
   and click "Recluster now" — a group of 3+ nearby seeded farmers forms instantly with
   an ~8% price advantage and a proportional payout split. Open the farmer app's
   **My Group** screen for one of those farmers to show it from their side.
5. **Show the dashboard & analytics** — admin **Dashboard** for live stats and the
   "Needs Attention" queue sorted by AI score; **Analytics** for throughput/rejection
   rate; **Bookings** for the CSV export.
6. **Show inclusion features** — the farmer app's language switcher (English/Hindi) and
   the "Book by phone call" entry point on the home screen, called out as the intended
   IVR integration point for smartphone-less farmers.

---

## 6. Scoped out of this prototype (documented, not built)

To keep the codebase simple and legible for a hackathon review, the following from the
original vision are intentionally out of scope for this build, with an honest note on
each: real SMS/WhatsApp delivery (mocked to console + in-app log), a live payment
gateway (manual mode+reference recording instead of Razorpay), OTP login, IVR backend,
offline-first PWA sync beyond a basic retry queue, KYC/Aadhaar verification, multi-role
permission scoping beyond the two seeded admin roles, and a persisted grievance backend
(currently a local demo stub). Each is a natural next milestone once the two AI engines
and the core booking/tracking loop — the actual novelty of this idea — are validated.
