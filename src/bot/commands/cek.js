const { isSessionValid } = require("../../services/authService");

module.exports = async (msg) => {
  const bot = require("../telegramBot");
  const valid = await isSessionValid(msg.chat.id);
  bot.sendMessage(msg.chat.id, valid ? "✅ Session aktif" : "⚠️ Session tidak aktif");
};
