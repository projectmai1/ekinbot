const kinerjaInputService = require("../../services/kinerjaInputService");
const { kinerjaInputFlow } = require("../../state/memoryState");

module.exports = async (msg) => {
  const bot = require("../telegramBot");
  const chatId = msg.chat.id;

  try {
    // Cek session dulu
    const cookies = require("../../services/sessionService").loadCookies(chatId);
    if (!cookies) {
      return bot.sendMessage(chatId, "⚠️ Session tidak ditemukan. Silakan login dengan /login");
    }

    // Mulai flow
    kinerjaInputFlow[chatId] = {
      step: "jenis",
      jenis: null,
      data: {},
      formData: null,
    };

    // Tampilkan pilihan jenis kinerja
    await bot.sendMessage(
      chatId,
      "📝 *TAMBAH KINERJA HARIAN*\n\n" + "Pilih jenis kinerja:\n" + "1️⃣ *Kinerja Utama* - Dari SKP (Indikator Kinerja)\n" + "2️⃣ *Kinerja Tambahan* - Non-SKP (Tugas Tambahan/Rapat)\n\n" + "Balas dengan angka pilihan (1 atau 2):",
      { parse_mode: "Markdown" },
    );
  } catch (error) {
    console.error("Error in /tambahkinerja:", error);
    await bot.sendMessage(chatId, `❌ Gagal memulai input kinerja: ${error.message}`);
  }
};
