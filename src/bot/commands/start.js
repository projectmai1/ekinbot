const bot = require("../telegramBot");

module.exports = (msg) => {
  bot.sendMessage(msg.chat.id, `🤖 *BOT e-KINERJA LEVEL 2*\n\n` + `/login → Login akun\n` + `/settotp → Simpan secret TOTP\n` + `/cek → Cek session\n` + `/logout → Hapus session`, { parse_mode: "Markdown" });
};
