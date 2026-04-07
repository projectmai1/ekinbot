const { loginFlow } = require("../../state/memoryState");

module.exports = async (msg) => {
  const bot = require("../telegramBot");
  const chatId = msg.chat.id;

  // Cek apakah sudah ada login flow yang aktif
  if (loginFlow[chatId]) {
    return bot.sendMessage(chatId, "⚠️ Login sedang berlangsung. Selesaikan proses login saat ini terlebih dahulu.");
  }

  // Inisialisasi login flow
  loginFlow[chatId] = {
    step: "username",
    timestamp: Date.now(),
  };

  console.log(`🚀 Login flow started for ${chatId}`);

  // Berikan jeda kecil sebelum mengirim pesan pertama
  await new Promise((resolve) => setTimeout(resolve, 300));

  return bot.sendMessage(chatId, "👤 *Masukkan Username* Anda:\n\n" + "Contoh: `1234567890` atau `user@email.com`", { parse_mode: "Markdown" });
};
