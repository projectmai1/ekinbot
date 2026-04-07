const { getDailyPerformanceReport } = require("../../services/dailyPerformanceService");

module.exports = async (msg) => {
  const bot = require("../telegramBot");
  const chatId = msg.chat.id;

  try {
    await bot.sendMessage(chatId, "🔄 Mengambil data kinerja harian...");
    await getDailyPerformanceReport(chatId);
  } catch (error) {
    console.error(`❌ Error in /kinerja command for ${chatId}:`, error);
    await bot.sendMessage(chatId, "❌ Gagal menjalankan perintah /kinerja. Silakan coba lagi atau /login ulang.", { parse_mode: "Markdown" });
  }
};
