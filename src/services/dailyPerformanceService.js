const axios = require("axios");
const cheerio = require("cheerio");
const { loadCookies, buildCookieHeader } = require("./sessionService");
const { ensureLogin } = require("./authService");
const { getJakartaTime } = require("../utils/time");
const { performanceReminderState } = require("../state/memoryState");

// ==========================
// UTIL TANGGAL
// ==========================
function getTanggalHariIni() {
  const now = getJakartaTime();
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  return `${day} ${monthNames[month - 1]} ${year}`;
}

function isHariIni(tanggalString) {
  if (!tanggalString || typeof tanggalString !== "string") return false;
  const cleanTanggal = tanggalString.replace("🆕", "").trim();
  return cleanTanggal === getTanggalHariIni();
}

// ==========================
// AUTO FILL KINERJA TAMBAHAN
// ==========================
async function autoFillKinerjaTambahan(chatId) {
  const bot = require("../bot/telegramBot");

  try {
    console.log(`🤖 Auto fill kinerja tambahan: ${chatId}`);

    await ensureLogin(chatId);
    const cookies = loadCookies(chatId);
    const cookieHeader = buildCookieHeader(cookies);

    // 1. GET halaman create (ambil CSRF)
    const createUrl = "https://e-kinerja.babelprov.go.id/v1/index.php?r=kinerja%2Fkegiatan-harian%2Fcreate-v4&id_kegiatan_harian_jenis=2";

    const page = await axios.get(createUrl, {
      headers: { Cookie: cookieHeader },
    });

    const $ = cheerio.load(page.data);

    let csrfToken = $('input[name="_csrf"]').val() || $('meta[name="csrf-token"]').attr("content");

    if (!csrfToken) {
      console.log("❌ CSRF tidak ditemukan");
      return;
    }

    // 2. POST data
    const form = new URLSearchParams();

    form.append("_csrf", csrfToken);
    form.append("KegiatanHarian[uraian]", "Melaksanakan tugas tambahan kedinasan lainnya");
    form.append("KegiatanHarian[realisasi]", "1");

    const postUrl = "https://e-kinerja.babelprov.go.id/v1/index.php?r=kinerja%2Fkegiatan-harian%2Fcreate-v4&id_kegiatan_harian_jenis=2";

    await axios.post(postUrl, form, {
      headers: {
        Cookie: cookieHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    console.log(`✅ Auto kinerja tambahan berhasil: ${chatId}`);

    await bot.sendMessage(chatId, "🤖 *AUTO KINERJA*\n\nSistem otomatis mengisi *kinerja tambahan* karena Anda belum mengisi hingga pukul 16:00.", { parse_mode: "Markdown" });
  } catch (err) {
    console.log("AUTO FILL ERROR:", err.message);
  }
}

// ==========================
// CHECK & REMINDER
// ==========================
async function checkTodayPerformance(chatId) {
  const bot = require("../bot/telegramBot");

  const cookies = loadCookies(chatId);
  if (!cookies) return;

  const now = getJakartaTime();
  const today = now.toLocaleDateString("sv-SE");
  const hour = now.getHours();
  const minute = now.getMinutes();

  // hanya jam kerja
  if (hour < 8 || hour >= 23) {
    if (hour >= 23 && performanceReminderState[chatId]) {
      delete performanceReminderState[chatId];
    }
    return;
  }

  // init state
  if (!performanceReminderState[chatId]) {
    performanceReminderState[chatId] = {
      tanggal: today,
      telahDiingatkan: false,
      reminderCount: 0,
      lastReminderHour: null,
      sudahAutoIsi: false,
    };
  }

  // reset harian
  if (performanceReminderState[chatId].tanggal !== today) {
    performanceReminderState[chatId] = {
      tanggal: today,
      telahDiingatkan: false,
      reminderCount: 0,
      lastReminderHour: null,
      sudahAutoIsi: false,
    };
  }

  try {
    await ensureLogin(chatId);

    const cookieHeader = buildCookieHeader(loadCookies(chatId));

    const url = "https://e-kinerja.babelprov.go.id/v1/index.php?r=kinerja%2Fkegiatan-harian%2Findex-v4";

    const response = await axios.get(url, {
      headers: { Cookie: cookieHeader },
    });

    if (response.data.includes("site/login")) return;

    const $ = cheerio.load(response.data);

    let hasPerformanceToday = false;

    $("table.table-bordered tr").each((i, row) => {
      const cols = $(row).find("td");
      if (cols.length >= 8) {
        const tanggal = $(cols[2]).text().trim();
        if (isHariIni(tanggal)) {
          hasPerformanceToday = true;
          return false;
        }
      }
    });

    // ==========================
    // AUTO FILL JAM 16
    // ==========================
    if (hour >= 16 && !hasPerformanceToday && !performanceReminderState[chatId].sudahAutoIsi) {
      await autoFillKinerjaTambahan(chatId);
      performanceReminderState[chatId].sudahAutoIsi = true;
    }

    // ==========================
    // REMINDER
    // ==========================
    if (!hasPerformanceToday) {
      if (performanceReminderState[chatId].reminderCount >= 3) return;

      if (performanceReminderState[chatId].lastReminderHour !== null && hour - performanceReminderState[chatId].lastReminderHour < 2) return;

      let msg = `📝 *REMINDER KINERJA*\n\n`;
      msg += `Anda belum mengisi kinerja hari ini.\n\n`;

      if (hour >= 21) msg += `⚠️ Hampir habis!\n`;
      else if (hour >= 18) msg += `⏰ Waktu menipis\n`;

      msg += `👉 [Isi Sekarang](https://e-kinerja.babelprov.go.id/v1/index.php?r=kinerja%2Fkegiatan-harian%2Fcreate-v4)\n`;

      await bot.sendMessage(chatId, msg, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });

      performanceReminderState[chatId].reminderCount++;
      performanceReminderState[chatId].lastReminderHour = hour;
    } else {
      performanceReminderState[chatId].telahDiingatkan = true;
    }
  } catch (err) {
    console.log("CHECK ERROR:", err.message);
  }
}

module.exports = {
  checkTodayPerformance,
  getTanggalHariIni,
  isHariIni,
  autoFillKinerjaTambahan,
};
