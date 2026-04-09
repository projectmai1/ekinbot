const fs = require("fs");
const path = require("path");
const { checkTodayPerformance } = require("../services/performanceReminderService");
const config = require("../config");

async function runPerformanceMonitor() {
  try {
    const sessionDir = config.SESSION_DIR;

    // ambil semua file session
    const files = fs.readdirSync(sessionDir);

    if (!files.length) {
      console.log("📭 Tidak ada user aktif untuk monitoring");
      return;
    }

    console.log(`👥 Monitoring ${files.length} user`);

    for (const file of files) {
      try {
        // biasanya nama file = chatId.json
        const chatId = file.replace(".json", "");

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
