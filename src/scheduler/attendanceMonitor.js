const fs = require("fs");
const config = require("../config");
const { ensureLogin } = require("../services/authService");
const { checkTodayAttendance } = require("../services/attendanceService");

async function runAttendanceMonitor() {
  console.log(`⏰ [${new Date().toISOString()}] Running attendance monitor...`);

  try {
    const files = fs.readdirSync(config.SESSION_DIR);
    console.log(`📁 Found ${files.length} session files`);

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const chatId = file.replace(".json", "").replace("-cookies", "");

      // Hindari duplikasi karena ada file cookie dan session
      if (file.includes("-cookies")) continue;

      console.log(`🔍 Checking attendance for ${chatId}`);

      try {
        const valid = await ensureLogin(chatId);
        if (!valid) {
          console.log(`❌ Session invalid for ${chatId}`);
          continue;
        }

        console.log(`✅ Session valid for ${chatId}, checking attendance...`);

        // Panggil checkTodayAttendance
        const createAttendanceService = require("../services/attendanceService");
        const { checkTodayAttendance } = createAttendanceService(bot);
        await checkTodayAttendance(chatId);
      } catch (error) {
        console.error(`❌ Error monitoring ${chatId}:`, error.message);
      }
    }
  } catch (error) {
    console.error("❌ Attendance monitor error:", error.message);
  }
}

module.exports = {
  runAttendanceMonitor,
};
