const { loginFlow } = require("../../state/memoryState");

module.exports = (msg) => {
  const bot = require("../telegramBot");
  bot.sendMessage(msg.chat.id, "🔑 Kirim secret TOTP (base32):");
  loginFlow[msg.chat.id] = { step: "totpSecret" };
};
