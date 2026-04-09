const axios = require("axios");
const cheerio = require("cheerio");
const { loadCookies, buildCookieHeader } = require("./sessionService");
const { ensureLogin } = require("./authService");
const { getJakartaTime } = require("../utils/time");
const { performanceReminderState } = require("../state/memoryState");
const { isHariIni, getTanggalHariIni } = require("./dailyPerformanceService");

async function checkTodayPerformance(chatId) {
  const bot = require("../bot/telegramBot");

  const cookies = loadCookies(chatId);
  if (!cookies) return;

  const now = getJakartaTime();
  const today = now.toLocaleDateString("sv-SE");
  const hour = now.getHours();
  const minute = now.getMinutes();

  // jam kerja
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
    };
  }

  // limit reminder
  if (performanceReminderState[chatId].reminderCount >= 3) return;

  // interval 2 jam
  const last = performanceReminderState[chatId].lastReminderHour;
  if (last !== null && hour - last < 2) return;

  try {
    await ensureLogin(chatId);

    const cookieHeader = buildCookieHeader(loadCookies(chatId));

    const url = "https://e-kinerja.babelprov.go.id/v1/index.php?r=kinerja%2Fkegiatan-harian%2Findex-v4";

    const res = await axios.get(url, {
      headers: { Cookie: cookieHeader },
    });

    if (res.data.includes("site/login")) return;

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

    // ==========================
    // AUTO FILL JAM 16
    // ==========================
    if (hour >= 0 && !hasToday && !performanceReminderState[chatId].sudahAutoIsi) {
      console.log(`🤖 Trigger auto fill untuk ${chatId}`);

      await autoFillKinerjaTambahan(chatId);

      performanceReminderState[chatId].sudahAutoIsi = true;
    }

    // ==========================
    // REMINDER
    // ==========================
    if (!hasToday) {
      let msg = `📝 *REMINDER KINERJA HARIAN* (${hour}:${minute})\n\n`;
      msg += `Hari ini Anda belum mengisi kinerja.\n\n`;

      const hoursLeft = 23 - hour;
      const minutesLeft = 60 - minute;

      if (hour >= 21) {
        msg += `⚠️ Hampir habis! (${hoursLeft}j ${minutesLeft}m)\n`;
      } else if (hour >= 18) {
        msg += `⏰ Waktu menipis (${hoursLeft}j ${minutesLeft}m)\n`;
      }

      msg += `👉 [Isi Sekarang](https://e-kinerja.babelprov.go.id/v1/index.php?r=kinerja%2Fkegiatan-harian%2Fcreate-v4)\n\n`;
      msg += `_Reminder ${performanceReminderState[chatId].reminderCount + 1}/3_`;

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
    console.log("REMINDER ERROR:", err.message);
  }
}

async function autoFillKinerjaTambahan(chatId) {
  const bot = require("../bot/telegramBot");

  try {
    console.log(`🤖 AUTO FILL START: ${chatId}`);

    await ensureLogin(chatId);

    const cookieHeader = buildCookieHeader(loadCookies(chatId));

    const url = "https://e-kinerja.babelprov.go.id/v1/index.php?r=kinerja%2Fkegiatan-harian%2Fcreate-v4&id_kegiatan_harian_jenis=2";

    // ambil halaman untuk csrf + default value
    const page = await axios.get(url, {
      headers: { Cookie: cookieHeader },
    });

    const $ = cheerio.load(page.data);

    const csrf = $('input[name="_csrf"]').val() || $('meta[name="csrf-token"]').attr("content");

    const tanggal = $("#kegiatanharian-tanggal").val();
    const jamMulai = $("#kegiatanharian-jam_mulai").val() || "08:00";
    const jamSelesai = $("#kegiatanharian-jam_selesai").val() || "09:00";

    if (!csrf) {
      console.log("❌ CSRF tidak ditemukan");
      return;
    }

    const form = new URLSearchParams();

    form.append("_csrf", csrf);
    form.append("KegiatanHarian[tanggal]", tanggal);
    form.append("KegiatanHarian[id_kegiatan_harian_tambahan]", "1"); // Tugas Tambahan
    form.append("KegiatanHarian[id_kegiatan_tahunan]", "");
    form.append("KegiatanHarian[uraian]", "Melaksanakan tugas tambahan kedinasan lainnya");
    form.append("KegiatanHarian[realisasi]", "1");
    form.append("KegiatanHarian[jam_mulai]", jamMulai);
    form.append("KegiatanHarian[jam_selesai]", jamSelesai);
    form.append("referrer", "https://e-kinerja.babelprov.go.id/");

    const res = await axios.post(url, form, {
      headers: {
        Cookie: cookieHeader,
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: url,
      },
      maxRedirects: 0,
      validateStatus: (s) => s < 500,
    });

    if (res.status === 302) {
      console.log(`✅ AUTO FILL BERHASIL: ${chatId}`);

      await bot.sendMessage(chatId, "🤖 Auto kinerja tambahan berhasil diisi");
    } else {
      console.log("❌ AUTO FILL GAGAL", res.status);
    }
  } catch (err) {
    console.log("AUTO FILL ERROR:", err.message);
  }
}

module.exports = {
  checkTodayPerformance,
};
