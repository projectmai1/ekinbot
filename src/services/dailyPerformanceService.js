const axios = require("axios");
const cheerio = require("cheerio");
const { loadCookies, buildCookieHeader } = require("./sessionService");
const { ensureLogin } = require("./authService");
const { getJakartaTime } = require("../utils/time");
const { performanceReminderState } = require("../state/memoryState");

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function delayRandom() {
  const ms = 2000 + Math.random() * 4000; // 2–6 detik (lebih ringan)
  await delay(ms);
}

// Fungsi untuk mendapatkan tanggal hari ini dalam format yang konsisten dengan e-kinerja
function getTanggalHariIni() {
  const now = getJakartaTime();
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // Format: "6 Februari 2026" (sesuai dengan format e-kinerja)
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  return `${day} ${monthNames[month - 1]} ${year}`;
}

// Fungsi untuk mengecek apakah string tanggal adalah hari ini
function isHariIni(tanggalString) {
  if (!tanggalString || typeof tanggalString !== "string") return false;

  // Bersihkan string tanggal dari karakter tambahan
  const cleanTanggal = tanggalString.replace("🆕", "").trim();
  const todayFormatted = getTanggalHariIni();

  // Lakukan perbandingan eksak
  return cleanTanggal === todayFormatted;
}

// Fungsi untuk parsing tanggal dari berbagai format
function parseTanggal(tanggalStr) {
  if (!tanggalStr) return null;

  // Coba format: "6 Februari 2026"
  const parts = tanggalStr.split(" ");
  if (parts.length >= 3) {
    const day = parseInt(parts[0]);
    const monthStr = parts[1];
    const year = parseInt(parts[2]);

    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const monthIndex = monthNames.indexOf(monthStr);

    if (monthIndex !== -1 && !isNaN(day) && !isNaN(year)) {
      return new Date(year, monthIndex, day);
    }
  }

  // Coba format: "2026-02-06"
  const isoMatch = tanggalStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1]);
    const month = parseInt(isoMatch[2]) - 1;
    const day = parseInt(isoMatch[3]);
    return new Date(year, month, day);
  }

  return null;
}

async function getDailyPerformanceReport(chatId) {
  const bot = require("../bot/telegramBot");

  try {
    // Pastikan session valid
    const isValid = await ensureLogin(chatId);
    if (!isValid) {
      return bot.sendMessage(chatId, "⚠️ Session tidak valid. Silakan login dengan /login");
    }

    // Ambil cookies
    const cookies = loadCookies(chatId);
    if (!cookies) {
      return bot.sendMessage(chatId, "⚠️ Session tidak ditemukan. Silakan login.");
    }

    const cookieHeader = buildCookieHeader(cookies);

    // Ambil tanggal hari ini
    const now = getJakartaTime();
    const todayFormatted = getTanggalHariIni();
    const formattedDate = now.toLocaleDateString("id-ID", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    console.log(`📊 Fetching daily performance for ${chatId}`);
    console.log(`📅 Today is: ${todayFormatted}`);

    // URL untuk kinerja harian
    const url = "https://e-kinerja.babelprov.go.id/v1/index.php?r=kinerja%2Fkegiatan-harian%2Findex-v4";
    await delayRandom();
    const response = await axios.get(url, {
      headers: {
        Cookie: cookieHeader,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: "https://e-kinerja.babelprov.go.id/v1/index.php",
      },
      timeout: 30000,
    });

    console.log(`✅ Response status: ${response.status}`);

    if (response.data.includes("site/login")) {
      console.log(`❌ Redirected to login page for ${chatId}`);
      return bot.sendMessage(chatId, "⚠️ Session expired. Silakan login ulang dengan /login");
    }

    const $ = cheerio.load(response.data);

    let message = `📊 *KINERJA HARIAN* - ${formattedDate}\n\n`;

    // Cari tabel dengan class table-bordered
    const table = $("table.table-bordered");

    if (table.length === 0) {
      message += "Tidak ada data kinerja harian yang ditemukan.\n";
      message += "Silakan isi kinerja harian melalui:\n";
      message += "👉 [Halaman Input Kinerja](https://e-kinerja.babelprov.go.id/v1/index.php?r=kinerja%2Fkegiatan-harian%2Fcreate-v4)";

      await bot.sendMessage(chatId, message, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });
      return;
    }

    // Variabel untuk menyimpan jenis kinerja saat ini
    let currentJenis = "";
    let hasData = false;
    let hasTodayData = false;
    let todayDataCount = 0;
    let totalDataCount = 0;

    // Iterasi setiap baris dalam tabel
    const rows = table.find("tr");

    rows.each((index, row) => {
      const $row = $(row);

      // Cek apakah baris ini adalah judul jenis (Utama/Tambahan)
      const jenisTh = $row.find('th[colspan="8"]');
      if (jenisTh.length) {
        const jenisText = jenisTh.text().trim();
        if (jenisText === "Utama" || jenisText === "Tambahan") {
          currentJenis = jenisText;
        }
        return; // Lewati baris judul
      }

      // Baris data: harus memiliki setidaknya 8 kolom (td)
      const cols = $row.find("td");
      if (cols.length >= 8) {
        hasData = true;
        totalDataCount++;

        // Ekstrak data dari kolom sesuai struktur HTML
        const no = $(cols[1]).text().trim();
        const tanggal = $(cols[2]).text().trim();
        const uraianHTML = $(cols[3]).html();
        const aspek = $(cols[4]).text().trim();
        const indikator = $(cols[5]).text().trim();
        const realisasi = $(cols[6]).text().trim();

        // Cek apakah ini data untuk hari ini dengan fungsi yang lebih akurat
        const isToday = isHariIni(tanggal);

        if (isToday) {
          hasTodayData = true;
          todayDataCount++;
          console.log(`✅ Found today's data: ${tanggal}`);
        }

        // Parse status dari uraian (ada dalam span dengan class label)
        let status = "Konsep";
        if (uraianHTML) {
          const $uraian = cheerio.load(uraianHTML);
          const statusSpan = $uraian("span.label");
          if (statusSpan.length) {
            status = statusSpan.text().trim();
          }
        }

        // Bersihkan uraian dari tag HTML dan nama
        let cleanUraian = "";
        if (uraianHTML) {
          let tempUraian = uraianHTML.replace(/<span[^>]*>.*?<\/span>/gi, "");
          tempUraian = tempUraian.replace(/<i[^>]*>.*?<\/i>/gi, "");
          tempUraian = tempUraian.split(/<br\s*\/?>/i)[0];
          cleanUraian = tempUraian.replace(/<[^>]*>/g, "");
          cleanUraian = cleanUraian.replace(/\s+/g, " ").trim();
        }

        // Format output
        message += `*Jenis Kinerja:* ${currentJenis}\n`;
        message += `*No:* ${no}\n`;
        message += `*Tanggal:* ${tanggal}`;

        // Tambahkan indikator jika ini data hari ini
        if (isToday) {
          message += ` 🆕`;
        }

        message += `\n`;
        message += `*Uraian:* ${cleanUraian}\n`;
        if (aspek && aspek !== "" && aspek !== "&nbsp;") {
          message += `*Aspek:* ${aspek}\n`;
        }
        if (indikator && indikator !== "" && indikator !== "&nbsp;") {
          message += `*Indikator Kinerja Individu:* ${indikator}\n`;
        }
        if (realisasi && realisasi !== "" && realisasi !== "&nbsp;") {
          message += `*Realisasi:* ${realisasi}\n`;
        }
        message += `*Status:* ${status}\n`;
        message += `\n──────────\n\n`;
      }
    });

    // Tampilkan summary
    message += `📋 *SUMMARY*\n`;
    message += `Total data: ${hasData ? "Ada" : "Tidak ada"}\n`;

    // Tampilkan informasi yang lebih akurat
    if (hasTodayData) {
      message += `Data hari ini: ✅ *Ada (${todayDataCount} entri)*\n\n`;
      message += `🎉 Bagus! Anda sudah mengisi kinerja untuk hari ini.\n`;
      message += `Tetap pertahankan konsistensi Anda!\n`;
    } else {
      message += `Data hari ini: ❌ *Belum ada*\n\n`;

      // Tambahkan reminder jika tidak ada data untuk hari ini
      message += `⚠️ *REMINDER*\n`;
      message += `Anda belum mengisi kinerja harian untuk hari ini (${formattedDate}).\n`;
      message += `Silakan isi melalui link berikut:\n`;
      message += `👉 [Input Kinerja Harian](https://e-kinerja.babelprov.go.id/v1/index.php?r=kinerja%2Fkegiatan-harian%2Fcreate-v4)\n\n`;

      // Hitung sisa waktu hingga jam 23:00
      const hoursLeft = 23 - now.getHours();
      const minutesLeft = 60 - now.getMinutes();

      if (hoursLeft > 0 || (hoursLeft === 0 && minutesLeft > 0)) {
        message += `⏰ *Waktu tersisa:* ${hoursLeft} jam ${minutesLeft} menit\n`;

        // Berikan saran berdasarkan waktu
        if (now.getHours() >= 21) {
          message += `💡 *Saran:* Segera isi! Hampir tutup (batas jam 23:00)!\n`;
        } else if (now.getHours() >= 18) {
          message += `💡 *Saran:* Isi sekarang sebelum malam!\n`;
        } else if (now.getHours() >= 16) {
          message += `💡 *Saran:* Isi sebelum jam 23:00\n`;
        } else {
          message += `💡 *Saran:* Isi kapan saja sebelum jam 23:00\n`;
        }
      } else {
        message += `⏰ *Waktu telah habis* (batas jam 23:00)\n`;
        message += `💡 *Saran:* Isi untuk besok atau gunakan fitur backdate jika diizinkan.\n`;
      }
    }

    // Jika tidak ada data sama sekali
    if (!hasData) {
      message += "📭 *Tidak ada data kinerja harian sama sekali.*\n\n";
      message += "Silakan isi kinerja harian melalui:\n";
      message += "👉 [Halaman Input Kinerja](https://e-kinerja.babelprov.go.id/v1/index.php?r=kinerja%2Fkegiatan-harian%2Fcreate-v4)\n";
    }

    // Truncate jika terlalu panjang
    if (message.length > 4000) {
      message = message.substring(0, 4000) + "\n... (pesan dipotong karena terlalu panjang)";
    }

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    });

    console.log(`✅ Daily performance report sent to ${chatId}`);
    console.log(`📊 Has today data: ${hasTodayData}, Count: ${todayDataCount}, Total: ${totalDataCount}`);
  } catch (err) {
    console.log("KINERJA ERROR DETAIL:", err.message);
    console.log("Status:", err.response?.status);

    let errorMessage = "❌ Gagal mengambil data kinerja harian\n";

    if (err.response?.status === 403) {
      errorMessage += "\n🔒 *Error 403 - Forbidden*\n";
      errorMessage += "Akses ditolak ke halaman kinerja.\n";
      errorMessage += "Coba login ulang dengan /login dan pastikan Anda bisa mengakses halaman kinerja via browser.";
    } else if (err.code === "ECONNREFUSED") {
      errorMessage += "\n🌐 Tidak bisa terhubung ke server e-Kinerja";
    } else {
      errorMessage += `\n📄 Error: ${err.message}`;
    }

    await bot.sendMessage(chatId, errorMessage, { parse_mode: "Markdown" });
  }
}

module.exports = {
  getDailyPerformanceReport,
  getTanggalHariIni,
  isHariIni,
};
