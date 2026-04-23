const express = require("express");
const config = require("./config");
const bot = require("./bot/telegramBot");
const fs = require("fs");
const { setWebhook } = require("./services/webhookService");

const { runPerformanceMonitor } = require("./scheduler/performanceMonitor");

const app = express();
app.use(express.json());

// ==========================
// INIT DIRECTORY
// ==========================
if (!fs.existsSync(config.SESSION_DIR)) {
  fs.mkdirSync(config.SESSION_DIR);
}

if (!fs.existsSync(config.ACCOUNT_DIR)) {
  fs.mkdirSync(config.ACCOUNT_DIR);
}

// ==========================
// LOAD BOT COMMANDS
// ==========================
require("./bot");

// ==========================
// WEBHOOK TELEGRAM
// ==========================
app.post("/bot", (req, res) => {
  console.log("📩 Update:", JSON.stringify(req.body, null, 2));
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ==========================
// SCHEDULER (ATTENDANCE + PERFORMANCE)
// ==========================
setInterval(
  async () => {
    console.log("⏰ Running scheduled attendance & performance monitor...");

    try {
      const { checkTodayAttendance } = require("./services/attendanceService");

      // ==========================
      // ATTENDANCE LOOP
      // ==========================
      const files = fs.readdirSync(config.SESSION_DIR);

      if (!files.length) {
        console.log("📭 Tidak ada session user");
        return;
      }

      for (const file of files) {
        if (!file.endsWith(".json") || file.includes("-cookies")) continue;

        const chatId = file.replace(".json", "");

        console.log(`👤 Checking attendance for ${chatId}`);

        try {
          await checkTodayAttendance(chatId);
        } catch (err) {
          console.error(`❌ Attendance error (${chatId}):`, err.message);
        }
      }

      // ==========================
      // PERFORMANCE (TERPISAH)
      // ==========================
      await runPerformanceMonitor();
    } catch (error) {
      console.error("❌ Scheduler error:", error.message);
    }
  },
  10 * 60 * 1000, // setiap 10 menit
);

// ==========================
// START SERVER
// ==========================
const PORT = config.PORT;
async function startApp() {
  console.log("🌍 APP_ENV:", process.env.APP_ENV);
  await setWebhook();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Bot aktif di http://0.0.0.0:${PORT}`);
  });
}

startApp();
