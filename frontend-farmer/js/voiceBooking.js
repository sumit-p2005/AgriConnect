/**
 * Dynamic Spoken Dialogue Booking Flow (State Machine)
 * Web Speech API (SpeechRecognition + speechSynthesis)
 * Strictly scoped domain vocabulary (No external NLU stack)
 */

const VoiceBookingState = {
  IDLE: "IDLE",
  GREETING: "GREETING",
  ASK_CROP: "ASK_CROP",
  ASK_QUANTITY: "ASK_QUANTITY",
  ASK_HARVEST_WINDOW: "ASK_HARVEST_WINDOW",
  ASK_STORAGE: "ASK_STORAGE",
  ASK_CENTER: "ASK_CENTER",
  ASK_DATE: "ASK_DATE",
  ASK_SLOT: "ASK_SLOT",
  ASK_TRANSPORT: "ASK_TRANSPORT",
  CONFIRM_SUMMARY: "CONFIRM_SUMMARY",
  SUBMIT: "SUBMIT",
  SUCCESS: "SUCCESS"
};

class VoiceBookingEngine {
  constructor() {
    this.state = VoiceBookingState.IDLE;
    this.rec = null;
    this.retryCount = 0;
    this.maxRetries = 2;
    this.data = {
      cropType: "",
      quantity: 100,
      harvestWindowDays: 3,
      storageCapability: "none",
      center: null,
      centerCandidates: [],
      centerIndex: 0,
      date: "",
      slot: null,
      slotCandidates: [],
      needTransport: false,
      pickupAddress: ""
    };
    this.lang = localStorage.getItem("ac_lang") === "hi" ? "hi-IN" : "en-IN";
  }

  // --- Speech Output (TTS) ---
  speak(text, onEnd) {
    if (!("speechSynthesis" in window)) {
      if (onEnd) onEnd();
      return;
    }
    window.speechSynthesis.cancel();
    const ut = new SpeechSynthesisUtterance(text);
    ut.lang = this.lang;
    ut.rate = 0.95;
    if (onEnd) {
      ut.onend = () => { onEnd(); };
      ut.onerror = () => { onEnd(); };
    }
    window.speechSynthesis.speak(ut);
  }

  // --- UI Toast & Transcript Updates ---
  updateUI(promptText, liveTranscript = "", isLoading = false) {
    let overlay = document.getElementById("voiceModalOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "voiceModalOverlay";
      overlay.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px);
        z-index: 99999; display: flex; flex-direction: column;
        align-items: center; justify-content: center; padding: 20px;
        color: white; font-family: 'Inter', sans-serif;
      `;
      document.body.appendChild(overlay);
    }
    overlay.style.display = "flex";

    const statusBadge = isLoading
      ? `<span style="background:#0284c7; color:#e0f2fe; font-size:12px; font-weight:700; padding:4px 10px; border-radius:999px;"><i class="fa-solid fa-spinner fa-spin" aria-label="loading"></i> FETCHING DATA...</span>`
      : `<span style="background:#065f46; color:#34d399; font-size:12px; font-weight:700; padding:4px 10px; border-radius:999px;"><i class="fa-solid fa-microphone" aria-label="voice assistant"></i> SPOKEN DIALOGUE FLOW</span>`;

    overlay.innerHTML = `
      <div style="background: #1e293b; border: 2px solid #10b981; border-radius: 20px; max-width: 440px; width: 100%; padding: 24px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
          ${statusBadge}
          <span style="font-size:11px; color:#94a3b8;">Best in Chrome</span>
        </div>
        
        <div style="font-size: 18px; font-weight: 700; margin: 16px 0; color: #f8fafc; line-height: 1.4;">
          ${promptText}
        </div>

        <div style="background: #0f172a; border-radius: 12px; padding: 12px; font-size: 13px; color: #38bdf8; min-height: 48px; display:flex; align-items:center; justify-content: center; border: 1px solid #334155; margin-bottom: 16px;">
          <i class="fa-solid fa-comments" aria-label="transcript" style="margin-right:6px;"></i> Heard: "${liveTranscript || (isLoading ? "Fetching data from server..." : "Listening...")}"
        </div>

        <div style="font-size: 12px; color: #94a3b8; margin-bottom: 16px;">
          State: <b style="color:#10b981;">${this.state}</b> | Say <b>"cancel"</b> or <b>"stop"</b> to exit anytime
        </div>

        <button onclick="window.acVoiceEngine.stop()" style="background:#ef4444; color:white; border:none; padding:10px 20px; border-radius:12px; font-weight:700; font-size:14px; cursor:pointer; width:100%;">
          <i class="fa-solid fa-circle-xmark" aria-label="cancel"></i> Cancel Voice Booking
        </button>
      </div>
    `;
  }

  closeUI() {
    const overlay = document.getElementById("voiceModalOverlay");
    if (overlay) overlay.style.display = "none";
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  // --- Recognition Listener ---
  listen(onResult) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert("Voice Assistant requires Google Chrome.");
      this.stop();
      return;
    }

    if (this.rec) {
      try { this.rec.stop(); } catch (e) {}
    }

    this.rec = new SpeechRec();
    this.rec.lang = this.lang;
    this.rec.continuous = false;
    this.rec.interimResults = false;

    this.rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript.trim();
      // Universal Cancel Command Check
      if (this.isCancelCommand(transcript)) {
        this.speak("Cancelling voice booking.", () => { this.stop(); });
        return;
      }
      onResult(transcript);
    };

    this.rec.onerror = (err) => {
      console.warn("Speech recognition error:", err);
      this.handleRetry("I didn't catch that. Please speak again.");
    };

    try {
      this.rec.start();
    } catch (e) {
      console.warn("Recognition start failed:", e);
    }
  }

  isCancelCommand(text) {
    const t = text.toLowerCase();
    return t.includes("cancel") || t.includes("stop") || t.includes("exit") || t.includes("quit") || t.includes("रुको") || t.includes("बंद") || t.includes("रद्द");
  }

  // --- Retry & Fallback Logic ---
  handleRetry(promptMessage, fallbackCallback) {
    this.retryCount += 1;
    if (this.retryCount > this.maxRetries) {
      const msg = "Switching to on-screen form for this step.";
      this.speak(msg, () => {
        this.stop();
        if (fallbackCallback) fallbackCallback();
      });
    } else {
      this.speak(promptMessage, () => {
        this.updateUI(promptMessage);
        this.listen((t) => this.processState(t));
      });
    }
  }

  // --- Vocabulary Matchers ---
  matchCrop(text) {
    const t = text.toLowerCase();
    const map = {
      tomato: "Tomato", tamatar: "Tomato", टमाटर: "Tomato",
      spinach: "Spinach", palak: "Spinach", पालक: "Spinach",
      mango: "Mango", aam: "Mango", आम: "Mango",
      onion: "Onion", pyaz: "Onion", प्याज: "Onion",
      potato: "Potato", aalu: "Potato", आलू: "Potato",
      wheat: "Wheat", gehun: "Wheat", गेहूं: "Wheat", 게ੂੰ: "Wheat",
      rice: "Rice", chawal: "Rice", चावल: "Rice",
      mustard: "Mustard", sarson: "Mustard", सरसों: "Mustard"
    };
    for (const k in map) {
      if (t.includes(k)) return map[k];
    }
    return null;
  }

  parseNumber(text) {
    const digits = text.match(/\d+/);
    if (digits) return parseInt(digits[0], 10);
    const t = text.toLowerCase();
    const wordMap = {
      "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
      "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10,
      "hundred": 100, "सौ": 100, "thousand": 1000, "हजार": 1000, "हज़ार": 1000
    };
    if (t.includes("five hundred") || t.includes("पाँच सौ") || t.includes("पांच सौ")) return 500;
    if (t.includes("one thousand") || t.includes("एक हजार")) return 1000;
    if (t.includes("two hundred") || t.includes("दो सौ")) return 200;
    if (t.includes("one hundred") || t.includes("एक सौ")) return 100;
    for (const k in wordMap) {
      if (t.includes(k)) return wordMap[k];
    }
    return null;
  }

  matchYesNo(text) {
    const t = text.toLowerCase();
    const yesWords = ["yes", "yeah", "yep", "ha", "haan", "जी", "हाँ", "हा", "सही", "okay", "sure", "confirm", "पक्का"];
    const noWords = ["no", "nope", "nah", "na", "nahi", "नहीं", "नाही", "गलत", "ना"];
    for (const w of yesWords) if (t.includes(w)) return true;
    for (const w of noWords) if (t.includes(w)) return false;
    return null;
  }

  matchStorage(text) {
    const t = text.toLowerCase();
    if (t.includes("no") || t.includes("none") || t.includes("नहीं") || t.includes("कोई नहीं")) return "none";
    if (t.includes("short") || t.includes("कम") || t.includes("थोड")) return "short-term";
    if (t.includes("long") || t.includes("ज्यादा") || t.includes("लंबे")) return "long-term";
    return null;
  }

  // --- STATE MACHINE CONTROLLER ---
  start() {
    this.state = VoiceBookingState.GREETING;
    this.retryCount = 0;
    const promptText = "Let's book your slot. What crop are you bringing?";
    this.updateUI(promptText);
    this.speak(promptText, () => {
      this.state = VoiceBookingState.ASK_CROP;
      this.listen((t) => this.processState(t));
    });
  }

  stop() {
    this.state = VoiceBookingState.IDLE;
    if (this.rec) { try { this.rec.stop(); } catch (e) {} this.rec = null; }
    this.closeUI();
  }

  async processState(transcript) {
    this.updateUI(this.getCurrentPrompt(), transcript);

    switch (this.state) {
      case VoiceBookingState.ASK_CROP: {
        const crop = this.matchCrop(transcript);
        if (crop) {
          this.data.cropType = crop;
          this.retryCount = 0;
          this.state = VoiceBookingState.ASK_QUANTITY;
          const prompt = `Got it, ${crop}. How many kilograms, roughly?`;
          this.updateUI(prompt, transcript);
          this.speak(prompt, () => this.listen((t) => this.processState(t)));
        } else {
          this.handleRetry("I didn't catch the crop. Please say Tomato, Wheat, Rice, Spinach, or Onion.");
        }
        break;
      }

      case VoiceBookingState.ASK_QUANTITY: {
        const qty = this.parseNumber(transcript);
        if (qty && qty > 0) {
          this.data.quantity = qty;
          this.retryCount = 0;
          this.state = VoiceBookingState.ASK_HARVEST_WINDOW;
          const prompt = `${qty} kilograms of ${this.data.cropType}. How many days until it needs to be sold?`;
          this.updateUI(prompt, transcript);
          this.speak(prompt, () => this.listen((t) => this.processState(t)));
        } else {
          this.handleRetry("Please state the quantity in kilograms, for example 500.");
        }
        break;
      }

      case VoiceBookingState.ASK_HARVEST_WINDOW: {
        const days = this.parseNumber(transcript) || 3;
        this.data.harvestWindowDays = days;
        this.retryCount = 0;
        this.state = VoiceBookingState.ASK_STORAGE;
        const prompt = "Do you have storage — none, short-term, or long-term?";
        this.updateUI(prompt, transcript);
        this.speak(prompt, () => this.listen((t) => this.processState(t)));
        break;
      }

      case VoiceBookingState.ASK_STORAGE: {
        const st = this.matchStorage(transcript);
        if (st) {
          this.data.storageCapability = st;
          this.retryCount = 0;
          // Load nearby centers for center selection
          await this.initCenterSelection();
        } else {
          this.handleRetry("Please say none, short-term, or long-term.");
        }
        break;
      }

      case VoiceBookingState.ASK_CENTER: {
        const ans = this.matchYesNo(transcript);
        if (ans === true) {
          this.data.center = this.data.centerCandidates[this.data.centerIndex];
          this.retryCount = 0;
          this.state = VoiceBookingState.ASK_DATE;
          const prompt = "Which day — today or tomorrow?";
          this.updateUI(prompt, transcript);
          this.speak(prompt, () => this.listen((t) => this.processState(t)));
        } else if (ans === false) {
          this.data.centerIndex += 1;
          if (this.data.centerIndex < this.data.centerCandidates.length && this.data.centerIndex < 3) {
            const nextCenter = this.data.centerCandidates[this.data.centerIndex];
            const prompt = `Next centre is ${nextCenter.name}, ${nextCenter.distanceKm} km away. Book here?`;
            this.updateUI(prompt, transcript);
            this.speak(prompt, () => this.listen((t) => this.processState(t)));
          } else {
            this.handleRetry("No more nearby centers. Switching to list.", () => { location.href = "book.html"; });
          }
        } else {
          this.handleRetry("Please say yes to select this centre, or no for next.");
        }
        break;
      }

      case VoiceBookingState.ASK_DATE: {
        const t = transcript.toLowerCase();
        const d = new Date();
        if (t.includes("tomorrow") || t.includes("कल")) {
          d.setDate(d.getDate() + 1);
        }
        this.data.date = d.toISOString().slice(0, 10);
        this.retryCount = 0;
        await this.initSlotSelection();
        break;
      }

      case VoiceBookingState.ASK_SLOT: {
        if (this.data.slotCandidates.length > 0) {
          this.data.slot = this.data.slotCandidates[0]; // pick top available open slot
        }
        this.retryCount = 0;
        this.state = VoiceBookingState.ASK_TRANSPORT;
        const prompt = "Do you need transportation pickup to the centre?";
        this.updateUI(prompt, transcript);
        this.speak(prompt, () => this.listen((t) => this.processState(t)));
        break;
      }

      case VoiceBookingState.ASK_TRANSPORT: {
        const tr = this.matchYesNo(transcript);
        this.data.needTransport = !!tr;
        this.retryCount = 0;
        this.state = VoiceBookingState.CONFIRM_SUMMARY;
        
        const summaryPrompt = `Please confirm: ${this.data.quantity}kg of ${this.data.cropType} at ${this.data.center?.name} on ${this.data.date}. Transport: ${this.data.needTransport ? 'Yes' : 'No'}. Should I confirm this booking?`;
        this.updateUI(summaryPrompt, transcript);
        this.speak(summaryPrompt, () => this.listen((t) => this.processState(t)));
        break;
      }

      case VoiceBookingState.CONFIRM_SUMMARY: {
        const isConfirmed = this.matchYesNo(transcript);
        if (isConfirmed === true) {
          await this.executeSubmit();
        } else if (isConfirmed === false) {
          this.speak("Booking cancelled. You can change details on screen.", () => this.stop());
        } else {
          this.handleRetry("Please say yes to confirm your booking, or no to cancel.");
        }
        break;
      }
    }
  }

  async initCenterSelection() {
    this.updateUI("Finding nearby procurement centres...", "", true);
    try {
      const farmer = typeof acFarmer === "function" ? acFarmer() : null;
      const lat = farmer?.location?.lat || 31.25;
      const lng = farmer?.location?.lng || 75.70;
      const res = await acHttp.get(`/farmer/centers/nearby?lat=${lat}&lng=${lng}`);
      this.data.centerCandidates = res.data;
      this.data.centerIndex = 0;

      if (this.data.centerCandidates.length) {
        const top = this.data.centerCandidates[0];
        this.state = VoiceBookingState.ASK_CENTER;
        const prompt = `The nearest centre is ${top.name}, ${top.distanceKm} kilometers away. Should I book there?`;
        this.updateUI(prompt);
        this.speak(prompt, () => this.listen((t) => this.processState(t)));
      } else {
        this.stop();
      }
    } catch (e) {
      this.stop();
    }
  }

  async initSlotSelection() {
    this.updateUI("Checking available time slots...", "", true);
    try {
      const res = await acHttp.get(`/farmer/centers/${this.data.center._id}/slots`, { params: { date: this.data.date } });
      this.data.slotCandidates = res.data;

      if (this.data.slotCandidates.length) {
        const topSlot = this.data.slotCandidates[0];
        this.data.slot = topSlot;
        const prompt = `Slot ${topSlot.startTime} to ${topSlot.endTime} has ${topSlot.spotsLeft} spots left. Selected this slot. Do you need transportation?`;
        this.state = VoiceBookingState.ASK_TRANSPORT;
        this.updateUI(prompt);
        this.speak(prompt, () => this.listen((t) => this.processState(t)));
      } else {
        this.speak("No open slots for this date.", () => this.stop());
      }
    } catch (e) {
      this.stop();
    }
  }

  async executeSubmit() {
    this.state = VoiceBookingState.SUBMIT;
    this.updateUI("Submitting your booking...", "", true);

    try {
      const bRes = await acHttp.post("/farmer/bookings", {
        centerId: this.data.center._id,
        slotId: this.data.slot.id || this.data.slot._id,
        cropType: this.data.cropType,
        variety: "Standard",
        quantity: this.data.quantity,
        harvestWindowDays: this.data.harvestWindowDays,
        storageCapability: this.data.storageCapability
      });

      const booking = bRes.data;

      if (this.data.needTransport) {
        await acHttp.post("/farmer/transport-requests", {
          bookingId: booking._id,
          pickupLocation: {
            lat: 31.25, lng: 75.70, address: "Farmer Location"
          },
          estimatedWeightKg: this.data.quantity
        });
      }

      this.state = VoiceBookingState.SUCCESS;
      const successText = `Booked successfully! Your token number is #${booking.tokenNumber}.`;
      this.updateUI(successText);
      this.speak(successText, () => {
        setTimeout(() => {
          this.stop();
          location.href = `bookings.html?id=${booking._id}`;
        }, 2000);
      });
    } catch (e) {
      this.speak("Booking failed. Please try again on screen.", () => this.stop());
    }
  }

  getCurrentPrompt() {
    switch (this.state) {
      case VoiceBookingState.ASK_CROP: return "What crop are you bringing?";
      case VoiceBookingState.ASK_QUANTITY: return "How many kilograms?";
      case VoiceBookingState.ASK_HARVEST_WINDOW: return "Days until sold?";
      case VoiceBookingState.ASK_STORAGE: return "Storage facility?";
      case VoiceBookingState.ASK_CENTER: return "Select nearest center?";
      case VoiceBookingState.ASK_DATE: return "Which day (today/tomorrow)?";
      case VoiceBookingState.ASK_SLOT: return "Pick time slot";
      case VoiceBookingState.ASK_TRANSPORT: return "Need transport?";
      case VoiceBookingState.CONFIRM_SUMMARY: return "Confirm booking summary?";
      default: return "Listening...";
    }
  }
}

window.acVoiceEngine = new VoiceBookingEngine();

function acStartVoiceBooking() {
  window.acVoiceEngine.start();
}
