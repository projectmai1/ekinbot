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

    // Mulai flow langsung dengan jenis=2 (Kinerja Tambahan)
    kinerjaInputFlow[chatId] = {
      step: "jenis",
      jenis: 2, // Langsung set ke Kinerja Tambahan
      data: {},
      formData: null,
    };

    // Langsung ke step loading_indikator
    await bot.sendMessage(chatId, "🔄 Mengambil daftar kegiatan tambahan...");

    // Ambil form data untuk jenis=2
    const formData = await kinerjaInputService.getKinerjaForm(chatId, 2);
    kinerjaInputFlow[chatId].formData = formData;

    // Tampilkan daftar opsi
    let message = `📋 *Pilih Jenis Kegiatan Tambahan:*\n\n`;

    if (formData.options.length === 0) {
      message = "❌ Tidak ada kegiatan tambahan yang tersedia.";
      delete kinerjaInputFlow[chatId];
      await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
      return;
    }

    formData.options.forEach((opt, index) => {
      message += `${index + 1}. ${opt.text}\n`;
    });

    message += `\nBalas dengan *angka* pilihan Anda (1-${formData.options.length}):`;
    kinerjaInputFlow[chatId].step = "pilih_indikator";

    await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error in /tambahkinerjatambahan:", error);
    await bot.sendMessage(chatId, `❌ Gagal memulai input kinerja tambahan: ${error.message}`);
  }
};
