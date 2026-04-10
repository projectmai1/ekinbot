const axios = require("axios");
const cheerio = require("cheerio");
const { loadCookies, buildCookieHeader } = require("./sessionService");
const { ensureLogin } = require("./authService");
const { getJakartaTime, calculateWorkHours, calculateWorkDurationWithBreak, predictGoHomeTime, getTargetWorkHours } = require("../utils/time");
const { attendanceReminderState } = require("../state/memoryState");

async function checkTodayAttendance(chatId) {
  const TARGET_JAM = getTargetWorkHours();
  const bot = require("../bot/telegramBot");
  const cookies = loadCookies(chatId);
  if (!cookies) return;

  const now = getJakartaTime();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const today = now.toLocaleDateString("sv-SE");
  const todayDate = new Date();
  const isFriday = todayDate.getDay() === 5;

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

    // 🔔 Belum absen masuk
    if ((!waktuText || waktuText.includes("Tidak Ada")) && (hour > 7 || (hour === 7 && minute >= 45))) {
      if (!state.masuk) {
        await bot.sendMessage(chatId, "🔔 Sudah lewat 07:45 dan Anda belum absen masuk.");
        state.masuk = true;
      }
      return;
    }

    const times = waktuText.split(",").map((t) => t.trim());

    // 🔔 Belum absen pulang
    if (times.length === 1) {
      const prediksi = predictGoHomeTime(times, TARGET_JAM, isFriday);

      if ((hour > 16 || (hour === 16 && minute >= 30)) && !state.pulang) {
        await bot.sendMessage(chatId, `🔔 Anda belum absen pulang.\nMasuk: ${times[0]}\nEstimasi cukup jam (${TARGET_JAM} jam): ${prediksi}`);
        state.pulang = true;
      }
      return;
    }

    // ⚠️ Cek jam kerja kurang
    if (times.length >= 2) {
      const durasi = calculateWorkDurationWithBreak(times, isFriday);

      if (durasi < TARGET_JAM && !state.kurangJam) {
        await bot.sendMessage(chatId, `⚠️ Jam kerja kurang dari ${TARGET_JAM} jam!\nTotal: ${durasi.toFixed(2)} jam`);
        state.kurangJam = true;
      }
    }
  } catch (err) {
    console.log("ATTENDANCE ERROR:", err.message);
  }
}

async function getAttendanceReport(chatId, bulan = null) {
  const TARGET_JAM = getTargetWorkHours();
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

      const times = waktu.split(",").map((t) => t.trim());

      const isFriday = hari.toLowerCase().includes("jum");
      let durasi = 0;
      if (times.length >= 2) {
        durasi = calculateWorkDurationWithBreak(times, isFriday);
      }

      const durasiText = durasi ? ` - (${durasi.toFixed(2).replace(".", ",")} jam)` : "";

      rincian += `📅 *${tanggal}* (${hari})${durasiText}\n`;
      rincian += `⏰ ${waktu}\n`;

      // 🔥 Prediksi pulang jika belum absen
      if (times.length === 1) {
        const prediksi = predictGoHomeTime(times, TARGET_JAM, isFriday);

        if (prediksi) {
          rincian += `🏁 Estimasi Pulang : ${prediksi} (${TARGET_JAM} jam)\n`;
        }
      }

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

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
    });
  } catch (err) {
    console.log("REKAP ERROR:", err.message);
    await bot.sendMessage(chatId, "❌ Gagal mengambil rekap kehadiran");
  }
}

module.exports = {
  checkTodayAttendance,
  getAttendanceReport,
};
