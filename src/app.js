const express = require("express");
const config = require("./config");
const bot = require("./bot/telegramBot");
const fs = require("fs");

const app = express();
app.use(express.json());

// Buat direktori jika belum ada
if (!fs.existsSync(config.SESSION_DIR)) fs.mkdirSync(config.SESSION_DIR);
if (!fs.existsSync(config.ACCOUNT_DIR)) fs.mkdirSync(config.ACCOUNT_DIR);

// Setup bot commands dan handlers
require("./bot");

// Webhook endpoint
app.post("/bot", (req, res) => {
  console.log("📩 Update:", JSON.stringify(req.body, null, 2)); // 🔥 DI SINI
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Jalankan scheduler untuk attendance dan performance
setInterval(
  async () => {
    console.log("⏰ Running scheduled attendance and performance monitor...");
    try {
      // Import services
      const { checkTodayAttendance } = require("./services/attendanceService");
      const { checkTodayPerformance } = require("./services/dailyPerformanceService");

      // Baca semua session files
      const files = fs.readdirSync(config.SESSION_DIR);

      for (const file of files) {
        if (!file.endsWith(".json") || file.includes("-cookies")) continue;

        const chatId = file.replace(".json", "");
        console.log(`👤 Checking attendance and performance for ${chatId}`);

        try {
          await checkTodayAttendance(chatId);
          await checkTodayPerformance(chatId);
        } catch (error) {
          console.error(`❌ Error checking for ${chatId}:`, error.message);
        }
      }
    } catch (error) {
      console.error("❌ Scheduler error:", error.message);
    }
  },
  10 * 60 * 1000,
); // cek setiap 10 menit

const PORT = config.PORT;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Bot aktif di http://0.0.0.0:${PORT}`);
});
