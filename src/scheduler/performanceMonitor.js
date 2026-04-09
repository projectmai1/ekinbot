const fs = require("fs");
const { checkTodayPerformance } = require("../services/performanceReminderService");
const config = require("../config");

async function runPerformanceMonitor() {
  try {
    const sessionDir = config.SESSION_DIR;

    const files = fs.readdirSync(sessionDir);

    if (!files.length) {
      console.log("📭 Tidak ada user aktif untuk monitoring");
      return;
    }

    console.log(`👥 Monitoring ${files.length} file session`);

    for (const file of files) {
      // 🔥 FILTER PENTING
      if (!file.endsWith(".json") || file.includes("-cookies")) continue;

      const chatId = file.replace(".json", "");

      console.log(`👤 Checking performance for ${chatId}`);

      try {
        await checkTodayPerformance(chatId);
      } catch (err) {
        console.log("❌ Error user:", file, err.message);
      }
    }
  } catch (err) {
    console.log("❌ Performance Monitor Error:", err.message);
  }
}

module.exports = { runPerformanceMonitor };
