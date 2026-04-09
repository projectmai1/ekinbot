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
  if (!tanggalString) return false;
  return tanggalString.replace("🆕", "").trim() === getTanggalHariIni();
}

// ==========================
// GET REPORT (UNTUK /kinerja)
// ==========================
async function getDailyPerformanceReport(chatId) {
  const bot = require("../bot/telegramBot");

  try {
    const isValid = await ensureLogin(chatId);
    if (!isValid) {
      return bot.sendMessage(chatId, "⚠️ Silakan login dengan /login");
    }

    const cookieHeader = buildCookieHeader(loadCookies(chatId));

    const url = "https://e-kinerja.babelprov.go.id/v1/index.php?r=kinerja%2Fkegiatan-harian%2Findex-v4";

    const res = await axios.get(url, {
      headers: { Cookie: cookieHeader },
    });

    if (res.data.includes("site/login")) {
      return bot.sendMessage(chatId, "⚠️ Session expired");
    }

    const $ = cheerio.load(res.data);

    let hasToday = false;
    let total = 0;

    $("table.table-bordered tr").each((i, row) => {
      const cols = $(row).find("td");
      if (cols.length >= 8) {
        total++;
        const tanggal = $(cols[2]).text().trim();
        if (isHariIni(tanggal)) hasToday = true;
      }
    });

    let msg = `📊 *STATUS KINERJA*\n\n`;
    msg += `Total entri: ${total}\n`;
    msg += `Hari ini: ${hasToday ? "✅ Sudah isi" : "❌ Belum isi"}\n`;

    await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
  } catch (err) {
    console.log("REPORT ERROR:", err.message);
  }
}

// ==========================
// AUTO FILL
// ==========================
async function autoFillKinerjaTambahan(chatId) {
  const bot = require("../bot/telegramBot");

  try {
    await ensureLogin(chatId);
    const cookieHeader = buildCookieHeader(loadCookies(chatId));

    const createUrl = "https://e-kinerja.babelprov.go.id/v1/index.php?r=kinerja%2Fkegiatan-harian%2Fcreate-v4&id_kegiatan_harian_jenis=2";

    const page = await axios.get(createUrl, {
      headers: { Cookie: cookieHeader },
    });

    const $ = cheerio.load(page.data);

    const csrf = $('input[name="_csrf"]').val() || $('meta[name="csrf-token"]').attr("content");

    if (!csrf) return;

    const form = new URLSearchParams();
    form.append("_csrf", csrf);
    form.append("KegiatanHarian[uraian]", "Melaksanakan tugas tambahan kedinasan lainnya");
    form.append("KegiatanHarian[realisasi]", "1");

    await axios.post(createUrl, form, {
      headers: {
        Cookie: cookieHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    await bot.sendMessage(chatId, "🤖 Auto kinerja tambahan diisi");
  } catch (err) {
    console.log("AUTO ERROR:", err.message);
  }
}

// ==========================
// CHECK + REMINDER
// ==========================
async function checkTodayPerformance(chatId) {
  const bot = require("../bot/telegramBot");

  const cookies = loadCookies(chatId);
  if (!cookies) return;

  const now = getJakartaTime();
  const hour = now.getHours();
  const today = now.toLocaleDateString("sv-SE");

  if (hour < 8 || hour >= 23) {
    if (hour >= 23) delete performanceReminderState[chatId];
    return;
  }

  if (!performanceReminderState[chatId]) {
    performanceReminderState[chatId] = {
      tanggal: today,
      reminderCount: 0,
      lastReminderHour: null,
      sudahAutoIsi: false,
    };
  }

  if (performanceReminderState[chatId].tanggal !== today) {
    performanceReminderState[chatId] = {
      tanggal: today,
      reminderCount: 0,
      lastReminderHour: null,
      sudahAutoIsi: false,
    };
  }

  try {
    await ensureLogin(chatId);

    const cookieHeader = buildCookieHeader(loadCookies(chatId));

    const res = await axios.get("https://e-kinerja.babelprov.go.id/v1/index.php?r=kinerja%2Fkegiatan-harian%2Findex-v4", { headers: { Cookie: cookieHeader } });

    const $ = cheerio.load(res.data);

    let hasToday = false;

    $("table.table-bordered tr").each((i, row) => {
      const cols = $(row).find("td");
      if (cols.length >= 8) {
        const tanggal = $(cols[2]).text().trim();
        if (isHariIni(tanggal)) {
          hasToday = true;
          return false;
        }
      }
    });

    // AUTO FILL
    if (hour >= 16 && !hasToday && !performanceReminderState[chatId].sudahAutoIsi) {
      await autoFillKinerjaTambahan(chatId);
      performanceReminderState[chatId].sudahAutoIsi = true;
    }

    // REMINDER
    if (!hasToday) {
      if (performanceReminderState[chatId].reminderCount >= 3) return;

      if (performanceReminderState[chatId].lastReminderHour && hour - performanceReminderState[chatId].lastReminderHour < 2) return;

      await bot.sendMessage(chatId, "📝 Jangan lupa isi kinerja hari ini");

      performanceReminderState[chatId].reminderCount++;
      performanceReminderState[chatId].lastReminderHour = hour;
    }
  } catch (err) {
    console.log("CHECK ERROR:", err.message);
  }
}

// ==========================
// EXPORT (FIX ERROR 🔥)
// ==========================
module.exports = {
  getDailyPerformanceReport, // 🔥 ini yang bikin /kinerja hidup lagi
  checkTodayPerformance,
  getTanggalHariIni,
  isHariIni,
  autoFillKinerjaTambahan,
};
