/* Voice Assistant using Web Speech API (SpeechRecognition + speechSynthesis) */
let acVoiceRec = null;
let acVoiceSpeaking = false;

function acSpeak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const ut = new SpeechSynthesisUtterance(text);
  const curLang = localStorage.getItem("ac_lang") || "en";
  ut.lang = curLang === "hi" ? "hi-IN" : "en-IN";
  ut.rate = 0.95;
  window.speechSynthesis.speak(ut);
}

function acShowVoiceToast(text, duration = 4000) {
  let toast = document.getElementById("acVoiceToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "acVoiceToast";
    toast.style.cssText = "position:fixed;bottom:75px;left:50%;transform:translateX(-50%);background:#0f172a;color:#f8fafc;padding:12px 20px;border-radius:24px;border:1px solid #10b981;box-shadow:0 10px 25px rgba(0,0,0,0.4);font-size:14px;z-index:9999;max-width:90%;text-align:center;font-weight:600;";
    document.body.appendChild(toast);
  }
  toast.innerHTML = `🎙️ ${text}`;
  toast.style.display = "block";
  if (duration > 0) {
    setTimeout(() => { toast.style.display = "none"; }, duration);
  }
}

function acInitVoice() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    alert("Voice Assistant requires Google Chrome or Web Speech API support.");
    return;
  }

  if (acVoiceRec) {
    acVoiceRec.stop();
    acVoiceRec = null;
    acShowVoiceToast("Voice Assistant stopped.", 2000);
    return;
  }

  acVoiceRec = new SpeechRec();
  const curLang = localStorage.getItem("ac_lang") || "en";
  acVoiceRec.lang = curLang === "hi" ? "hi-IN" : "en-IN";
  acVoiceRec.continuous = false;
  acVoiceRec.interimResults = false;

  acVoiceRec.onstart = () => {
    acShowVoiceToast("Listening... Say 'Book a slot', 'Check my status', or 'Nearest centre'", 0);
  };

  acVoiceRec.onresult = async (event) => {
    const transcript = event.results[0][0].transcript.toLowerCase().trim();
    acShowVoiceToast(`Heard: "${transcript}"`, 3000);

    if (transcript.includes("book") || transcript.includes("slot") || transcript.includes("बुक")) {
      acSpeak("Opening slot booking page.");
      setTimeout(() => { location.href = "book.html"; }, 1200);
    } else if (transcript.includes("status") || transcript.includes("check") || transcript.includes("स्टेटस")) {
      try {
        const bookings = (await acHttp.get("/farmer/bookings")).data;
        const active = bookings.find(b => !["completed", "rejected", "cancelled"].includes(b.status));
        if (active) {
          const txt = `Your active booking for ${active.cropType} is ${active.status}. Your token number is ${active.tokenNumber || "not assigned yet"}.`;
          acSpeak(txt);
          acShowVoiceToast(txt, 5000);
        } else {
          acSpeak("You have no active bookings at the moment.");
          acShowVoiceToast("No active bookings.", 3000);
        }
      } catch (e) {
        acSpeak("Unable to fetch status right now.");
      }
    } else if (transcript.includes("centre") || transcript.includes("center") || transcript.includes("nearest") || transcript.includes("केंद्र")) {
      try {
        const farmer = acFarmer();
        const lat = farmer?.location?.lat || 31.25;
        const lng = farmer?.location?.lng || 75.70;
        const centers = (await acHttp.get(`/farmer/centers/nearby?lat=${lat}&lng=${lng}`)).data;
        if (centers.length) {
          const nearest = centers[0];
          const txt = `The nearest centre is ${nearest.name}, about ${nearest.distanceKm} kilometers away.`;
          acSpeak(txt);
          acShowVoiceToast(txt, 5000);
        }
      } catch (e) {
        acSpeak("Unable to find nearby centers.");
      }
    } else {
      acSpeak("Sorry, I didn't recognize that command. Please try saying 'book a slot' or 'check status'.");
    }
  };

  acVoiceRec.onerror = (e) => {
    acShowVoiceToast(`Voice error: ${e.error}`, 3000);
    acVoiceRec = null;
  };

  acVoiceRec.onend = () => {
    acVoiceRec = null;
  };

  acVoiceRec.start();
}
