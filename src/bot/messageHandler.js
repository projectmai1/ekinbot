const bot = require("./telegramBot");
const { loginFlow, otpResolverMap, kinerjaInputFlow } = require("../state/memoryState");
const { loadAccount, saveAccount } = require("../services/accountService");
const { doLogin } = require("../services/authService");
const { decrypt, encrypt } = require("../services/encryptionService");
const kinerjaInputService = require("../services/kinerjaInputService");
const Jimp = require("jimp").default;
const QrCode = require("qrcode-reader");
const axios = require("axios");

async function decodeQR(buffer) {
  const image = await Jimp.read(buffer);

  const qr = new QrCode();
  return new Promise((resolve, reject) => {
    qr.callback = (err, value) => {
      if (err) return reject(err);
      resolve(value.result);
    };
    qr.decode(image.bitmap);
  });
}

async function handleKinerjaInputFlow(chatId, text) {
  const state = kinerjaInputFlow[chatId];
  if (!state) return false;

  try {
    switch (state.step) {
      case "jenis":
        // Pilih jenis kinerja
        const jenis = parseInt(text);
        if (jenis !== 1 && jenis !== 2) {
          await bot.sendMessage(chatId, "❌ Pilihan tidak valid. Pilih 1 (Utama) atau 2 (Tambahan):");
          return true;
        }

        state.jenis = jenis;
        state.step = "loading_indikator";

        const jenisText = jenis === 1 ? "Utama" : "Tambahan";
        await bot.sendMessage(chatId, `🔄 Mengambil daftar ${jenisText}...`);

        // Ambil form data
        const formData = await kinerjaInputService.getKinerjaForm(chatId, jenis);
        state.formData = formData;

        // Tampilkan daftar opsi
        let message = `📋 *Pilih ${jenis === 1 ? "Indikator Kinerja" : "Jenis Kegiatan Tambahan"}:*\n\n`;

        if (formData.options.length === 0) {
          message = "❌ Tidak ada opsi yang tersedia. Pastikan Anda memiliki akses yang sesuai.";
          state.step = "jenis"; // Kembali ke pemilihan jenis
          await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
          return true;
        }

        formData.options.forEach((opt, index) => {
          message += `${index + 1}. ${opt.text}\n`;
        });

        message += `\nBalas dengan *angka* pilihan Anda (1-${formData.options.length}):`;
        state.step = "pilih_indikator";

        await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
        return true;

      case "pilih_indikator":
        // Pilih opsi
        const choice = parseInt(text);
        if (isNaN(choice) || choice < 1 || choice > state.formData.options.length) {
          await bot.sendMessage(chatId, `❌ Pilihan tidak valid. Pilih angka 1-${state.formData.options.length}:`);
          return true;
        }

        const selected = state.formData.options[choice - 1];

        if (state.jenis === 1) {
          state.data.id_kegiatan_tahunan = selected.id;
          state.data.indikatorText = selected.fullText;
        } else if (state.jenis === 2) {
          state.data.id_kegiatan_harian_tambahan = selected.id;
          state.data.kegiatanTambahanText = selected.fullText;
        }

        state.step = "input_uraian";

        await bot.sendMessage(
          chatId,
          `✅ ${state.jenis === 1 ? "Indikator" : "Kegiatan"} dipilih: ${selected.text}\n\n` + `📝 Sekarang, tulis *uraian* kegiatan (minimal 20 karakter):\n` + `Contoh: "Menyelesaikan laporan bulanan untuk divisi..."`,
          { parse_mode: "Markdown" },
        );
        return true;

      case "input_uraian":
        // Input uraian
        if (text.length < 20) {
          await bot.sendMessage(chatId, `❌ Uraian minimal 20 karakter. Anda menulis ${text.length} karakter.\nSilakan tulis ulang:`);
          return true;
        }

        state.data.uraian = text;
        state.step = "input_realisasi";

        await bot.sendMessage(chatId, `✅ Uraian diterima (${text.length} karakter).\n\n` + `🔢 Masukkan *realisasi* (contoh: '1 dokumen', '2 laporan', dll):`, { parse_mode: "Markdown" });
        return true;

      case "input_realisasi":
        // Input realisasi
        if (!text.trim()) {
          await bot.sendMessage(chatId, "❌ Realisasi tidak boleh kosong. Contoh: '1 dokumen', '2 laporan':");
          return true;
        }

        state.data.realisasi = text;
        state.step = "input_jam_mulai";

        await bot.sendMessage(chatId, `✅ Realisasi: ${text}\n\n` + `⏰ Masukkan *jam mulai* (format HH:MM, contoh: 08:30):\n` + `Default: ${state.formData.jamMulaiDefault}`, { parse_mode: "Markdown" });
        return true;

      case "input_jam_mulai":
        // Input jam mulai
        if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
          await bot.sendMessage(chatId, "❌ Format jam tidak valid. Gunakan format HH:MM (contoh: 08:30):");
          return true;
        }

        state.data.jam_mulai = text;
        state.step = "input_jam_selesai";

        await bot.sendMessage(chatId, `✅ Jam mulai: ${text}\n\n` + `⏰ Masukkan *jam selesai* (format HH:MM, contoh: 16:00):\n` + `Default: ${state.formData.jamSelesaiDefault}`, { parse_mode: "Markdown" });
        return true;

      case "input_jam_selesai":
        // Input jam selesai
        if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
          await bot.sendMessage(chatId, "❌ Format jam tidak valid. Gunakan format HH:MM (contoh: 16:00):");
          return true;
        }

        // Validasi: jam selesai harus setelah jam mulai
        const jamMulai = state.data.jam_mulai;
        const jamSelesai = text;

        const [mulaiJam, mulaiMenit] = jamMulai.split(":").map(Number);
        const [selesaiJam, selesaiMenit] = jamSelesai.split(":").map(Number);

        const mulaiTotal = mulaiJam * 60 + mulaiMenit;
        const selesaiTotal = selesaiJam * 60 + selesaiMenit;

        if (selesaiTotal <= mulaiTotal) {
          await bot.sendMessage(chatId, "❌ Jam selesai harus setelah jam mulai. Silakan masukkan jam selesai yang valid:");
          return true;
        }

        state.data.jam_selesai = text;
        state.step = "konfirmasi";

        // Tampilkan ringkasan
        const summary = `
📋 *RINGKASAN KINERJA HARIAN*

• *Jenis:* ${state.jenis === 1 ? "Utama" : "Tambahan"}
${state.jenis === 1 ? `• *Indikator:* ${state.data.indikatorText?.substring(0, 50)}${state.data.indikatorText?.length > 50 ? "..." : ""}` : `• *Kegiatan:* ${state.data.kegiatanTambahanText}`}
• *Uraian:* ${state.data.uraian.substring(0, 50)}${state.data.uraian.length > 50 ? "..." : ""}
• *Realisasi:* ${state.data.realisasi}
• *Jam Mulai:* ${state.data.jam_mulai}
• *Jam Selesai:* ${state.data.jam_selesai}

Apakah data sudah benar?
Balas *YA* untuk menyimpan atau *BATAL* untuk membatalkan.
        `;

        await bot.sendMessage(chatId, summary, { parse_mode: "Markdown" });
        return true;

      case "konfirmasi":
        // Konfirmasi
        if (text.toUpperCase() === "YA") {
          await bot.sendMessage(chatId, "🔄 Menyimpan kinerja harian...");

          try {
            // Siapkan data untuk submit
            const submitData = {
              jenis: state.jenis,
              csrfToken: state.formData.csrfToken,
              uraian: state.data.uraian,
              realisasi: state.data.realisasi,
              jam_mulai: state.data.jam_mulai,
              jam_selesai: state.data.jam_selesai,
              referrer: "https://e-kinerja.babelprov.go.id/v1/index.php?r=kinerja%2Fkegiatan-harian%2Findex-v4",
            };

            // Tambahkan data khusus berdasarkan jenis
            if (state.jenis === 1) {
              submitData.nomorSkpLengkap = state.formData.nomorSkpLengkap;
              submitData.id_kegiatan_tahunan = state.data.id_kegiatan_tahunan;
            } else if (state.jenis === 2) {
              submitData.id_kegiatan_harian_tambahan = state.data.id_kegiatan_harian_tambahan;
            }

            // Submit data
            const result = await kinerjaInputService.submitKinerja(chatId, submitData);

            // Hapus state
            delete kinerjaInputFlow[chatId];

            await bot.sendMessage(chatId, `✅ ${result.message}\n\n` + `Kinerja berhasil ditambahkan.\n` + `Gunakan /kinerja untuk melihat daftar terbaru.`);
          } catch (error) {
            console.error("Error submitting kinerja:", error);
            await bot.sendMessage(chatId, `❌ Gagal menyimpan kinerja: ${error.message}`);
            delete kinerjaInputFlow[chatId];
          }
        } else if (text.toUpperCase() === "BATAL") {
          delete kinerjaInputFlow[chatId];
          await bot.sendMessage(chatId, "❌ Input kinerja dibatalkan.");
        } else {
          await bot.sendMessage(chatId, "Balas *YA* untuk menyimpan atau *BATAL* untuk membatalkan.", { parse_mode: "Markdown" });
        }
        return true;

      default:
        return false;
    }
  } catch (error) {
    console.error("Error in kinerja input flow:", error);
    await bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${error.message}`);
    delete kinerjaInputFlow[chatId];
    return true;
  }
}

module.exports = async (msg) => {
  const chatId = msg.chat.id;

  // 🔥 1. HANDLE QR IMAGE DULU
  if (msg.photo && loginFlow[chatId]?.step === "totpSecretOrQR") {
    try {
      const fileId = msg.photo.slice(-1)[0].file_id;
      const fileLink = await bot.getFileLink(fileId);
      console.log("FILE LINK:", fileLink);

      // 🔥 HANDLE URL (AMAN)
      const url = typeof fileLink === "string" ? fileLink : fileLink.href;

      const response = await axios.get(url, {
        responseType: "arraybuffer",
      });

      const buffer = Buffer.from(response.data);

      const result = await decodeQR(buffer);
      console.log("QR RESULT:", result);

      // 🔥 VALIDASI TOTP
      if (!result || !result.startsWith("otpauth://")) {
        return bot.sendMessage(chatId, "❌ QR bukan TOTP yang valid");
      }

      const match = result.match(/secret=([^&]+)/);

      if (!match) {
        return bot.sendMessage(chatId, "❌ Secret tidak ditemukan dalam QR");
      }

      const secret = match[1].trim(); // 🔥 penting

      const acc = loadAccount(chatId);
      if (!acc) {
        return bot.sendMessage(chatId, "⚠️ Login dulu sebelum set TOTP");
      }

      acc.totpSecret = encrypt(secret);
      saveAccount(chatId, acc);

      delete loginFlow[chatId];

      return bot.sendMessage(chatId, "✅ TOTP berhasil disimpan dari QR");
    } catch (err) {
      console.error("QR ERROR:", err.message);

      return bot.sendMessage(chatId, "❌ Gagal membaca QR.\n\nPastikan:\n• Gambar jelas\n• QR tidak terpotong\n\nAtau kirim secret manual.");
    }
  }

  // 🔽 2. BARU lanjut ke logic lama
  const text = msg.text?.trim();

  if (!text) return;

  // ⚠️ skip command
  if (text.startsWith("/")) {
    return;
  }

  // Handle kinerja input flow
  const handled = await handleKinerjaInputFlow(chatId, text);
  if (handled) return;

  // Handle login flow
  if (loginFlow[chatId]) {
    const state = loginFlow[chatId];

    if (state.step === "username") {
      state.username = text;
      state.step = "password";

      return bot.sendMessage(chatId, `✅ Username tersimpan.\n\n🔑 Masukkan Password:`, {
        parse_mode: "Markdown",
      });
    }

    if (state.step === "password") {
      const password = text;
      const existing = loadAccount(chatId);

      const accountData = {
        username: encrypt(state.username),
        password: encrypt(password),
        totpSecret: existing?.totpSecret || null,
      };

      saveAccount(chatId, accountData);
      delete loginFlow[chatId];

      const secret = existing?.totpSecret ? decrypt(existing.totpSecret) : null;

      return doLogin(chatId, state.username, password, secret);
    }

    // 🔥 UPDATE DI SINI (support manual + QR)
    if (state.step === "totpSecretOrQR") {
      const acc = loadAccount(chatId);
      if (!acc) return bot.sendMessage(chatId, "⚠️ Login dulu sebelum set TOTP");

      acc.totpSecret = encrypt(text);
      saveAccount(chatId, acc);

      delete loginFlow[chatId];
      return bot.sendMessage(chatId, "✅ Secret TOTP disimpan");
    }
  }

  // Handle OTP
  if (otpResolverMap[chatId] && /^\d{6}$/.test(text)) {
    otpResolverMap[chatId](text);
    delete otpResolverMap[chatId];
  }
};
