const axios = require("axios");
const cheerio = require("cheerio");
const { loadCookies, buildCookieHeader } = require("./sessionService");
const { ensureLogin } = require("./authService");
const { getJakartaTime, calculateWorkHours } = require("../utils/time");
const { attendanceReminderState } = require("../state/memoryState");

async function checkTodayAttendance(chatId) {
  const bot = require("../bot/telegramBot");
  const cookies = loadCookies(chatId);
  if (!cookies) return;

  const now = getJakartaTime();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const today = now.toLocaleDateString("sv-SE");

  if (!attendanceReminderState[chatId]) {
    attendanceReminderState[chatId] = {
      tanggal: today,
      masuk: false,
      pulang: false,
      kurangJam: false,
    };
  }

  if (attendanceReminderState[chatId].tanggal !== today) {
    attendanceReminderState[chatId] = {
      tanggal: today,
      masuk: false,
      pulang: false,
      kurangJam: false,
    };
  }

  try {
    const response = await axios.get("https://e-kinerja.babelprov.go.id/v1/index.php?r=absensi%2Fpegawai%2Fview", {
      headers: {
        Cookie: buildCookieHeader(cookies),
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (response.data.includes("site/login")) {
      await ensureLogin(chatId);
      return;
    }

    const $ = cheerio.load(response.data);

    const row = $(`tr.tanggal-${today}`);

    if (!row.length) return;

    const waktuText = row.find("td").eq(2).text().trim();
    const state = attendanceReminderState[chatId];

    if ((!waktuText || waktuText.includes("Tidak Ada")) && (hour > 7 || (hour === 7 && minute >= 45))) {
      if (!state.masuk) {
        await bot.sendMessage(chatId, "🔔 Sudah lewat 07:45 dan Anda belum absen masuk.");
        state.masuk = true;
      }
      return;
    }

    const times = waktuText.split(",").map((t) => t.trim());

    if (times.length === 1 && (hour > 16 || (hour === 16 && minute >= 30))) {
      if (!state.pulang) {
        await bot.sendMessage(chatId, `🔔 Sudah lewat 16:30 dan Anda belum absen pulang.\nMasuk: ${times[0]}`);
        state.pulang = true;
      }
      return;
    }

    if (times.length === 2) {
      const diff = calculateWorkHours(times[0], times[1]);

      if (diff < 7.5 && !state.kurangJam) {
        await bot.sendMessage(chatId, `⚠️ Jam kerja kurang dari 7,5 jam!\n` + `Masuk: ${times[0]}\n` + `Pulang: ${times[1]}\n` + `Total: ${diff.toFixed(2)} jam`);
        state.kurangJam = true;
      }
    }
  } catch (err) {
    console.log("ATTENDANCE ERROR:", err.message);
  }
}

async function getAttendanceReport(chatId, bulan = null) {
  const bot = require("../bot/telegramBot");
  const cookies = loadCookies(chatId);
  if (!cookies) {
    return bot.sendMessage(chatId, "⚠️ Session tidak ditemukan. Silakan login.");
  }

  try {
    const now = getJakartaTime();
    const bulanParam = bulan || now.getMonth() + 1;
    const tahun = now.getFullYear();

    const url = `https://e-kinerja.babelprov.go.id/v1/index.php?r=absensi%2Fpegawai%2Fview` + `&PegawaiSearch%5Bbulan%5D=${bulanParam}` + `&FilterForm%5Btahun%5D=${tahun}`;

    const response = await axios.get(url, {
      headers: {
        Cookie: buildCookieHeader(cookies),
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (response.data.includes("site/login")) {
      const relogin = await ensureLogin(chatId);
      if (!relogin) {
        return bot.sendMessage(chatId, "⚠️ Session expired dan gagal login ulang.");
      }
      return getAttendanceReport(chatId, bulan);
    }

    const $ = cheerio.load(response.data);

    const hariKerja = $(".small-box.bg-primary h3").first().text().trim() || "-";
    const hadirKerja = $(".small-box.bg-green h3").first().text().trim() || "-";
    const tidakHadir = $(".small-box.bg-red h3").first().text().trim() || "-";

    let rincian = "";

    $("tr.tanggal").each((i, el) => {
      const cols = $(el).find("td");

      const tanggal = $(cols[0]).text().trim();
      const hari = $(cols[1]).text().trim();
      const waktu = $(cols[2]).text().trim();
      const potongan = $(cols[3]).text().trim();
      const keterangan = $(cols[4]).text().trim();

      if (!waktu || waktu.includes("Tidak Ada Jam Kerja") || waktu.includes("Hari Libur")) {
        return;
      }

      rincian += `📅 *${tanggal}* (${hari})\n`;
      rincian += `⏰ ${waktu}\n`;

      if (potongan) {
        rincian += `💸 Potongan : ${potongan}\n`;
      }

      if (keterangan) {
        rincian += `📝 Ket.     : ${keterangan}\n`;
      }

      rincian += `\n`;
    });

    const message =
      `📊 *REKAP KEHADIRAN ${bulanParam}/${tahun}*\n\n` +
      `🗓 Hari Kerja : ${hariKerja}\n` +
      `✅ Hadir      : ${hadirKerja}\n` +
      `❌ Tidak Hadir: ${tidakHadir}\n\n` +
      `──────────────\n` +
      `📋 *RINCIAN KEHADIRAN*\n\n` +
      rincian.substring(0, 3500);

    await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  } catch (err) {
    console.log("REKAP ERROR:", err.message);
    await bot.sendMessage(chatId, "❌ Gagal mengambil rekap kehadiran");
  }
}

// Ekspor langsung sebagai object
module.exports = {
  checkTodayAttendance,
  getAttendanceReport,
};
