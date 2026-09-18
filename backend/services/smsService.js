const axios = require("axios");
const SmsLog = require("../models/SmsLog");

async function sendSms(phone, message) {
  const apiKey = process.env.SMS_API_KEY;
  let status = "mocked";

  if (apiKey) {
    try {
      await axios.post("https://www.fast2sms.com/dev/bulkV2", {
        route: "v3",
        sender_id: "TXTIND",
        message: message,
        language: "english",
        flash: 0,
        numbers: phone
      }, {
        headers: { authorization: apiKey }
      });
      status = "sent";
    } catch (e) {
      console.warn("[sms] Live SMS Gateway request failed, falling back to mock log:", e.message);
    }
  }

  console.log(`[SMS -> ${phone}]: ${message}`);
  const log = await SmsLog.create({ phone, message, status });
  return log;
}

module.exports = { sendSms };
