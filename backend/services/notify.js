/**
 * notify() - mock notification provider.
 * In production, swap the body of this function for a Twilio / MSG91 /
 * Gupshup API call. Every call site elsewhere in the app stays the same.
 * For the prototype we log to the server console AND push the message
 * onto the booking's notificationsLog so the farmer app can visibly show
 * "SMS sent" in the tracking timeline -- proof the notification fired.
 */
async function notify(phone, message) {
  console.log(`[SMS -> ${phone}] ${message}`);
  return { sent: true, provider: "mock", phone, message, at: new Date() };
}

module.exports = { notify };
