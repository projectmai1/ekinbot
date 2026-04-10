const { loginFlow } = require("../../state/memoryState");

module.exports = (msg) => {
  const bot = require("../telegramBot");

  bot.sendMessage(msg.chat.id, "🔑 Kirim *secret TOTP (base32)* ATAU upload *QR code*.", { parse_mode: "Markdown" });

  loginFlow[msg.chat.id] = { step: "totpSecretOrQR" };
};
