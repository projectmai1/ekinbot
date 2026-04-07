const { ensureLogin } = require("../../services/authService");
const { getAttendanceReport } = require("../../services/attendanceService");

module.exports = async (msg, match) => {
  const bot = require("../telegramBot");
  const chatId = msg.chat.id;
  const bulan = match[1] ? parseInt(match[1]) : null;

  const valid = await ensureLogin(chatId);
  if (!valid) {
    return bot.sendMessage(chatId, "⚠️ Session tidak aktif.");
  }

  await getAttendanceReport(chatId, bulan);
};
