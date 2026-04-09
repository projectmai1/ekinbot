const { autoFillKinerjaTambahan } = require("../../services/dailyPerformanceService");

module.exports = {
  command: "testautokinerja",
  description: "Test auto kinerja tambahan",
  execute: async (bot, msg) => {
    const chatId = msg.chat.id;

    await autoFillKinerjaTambahan(chatId);

    bot.sendMessage(chatId, "✅ Test auto kinerja dijalankan");
  },
};
