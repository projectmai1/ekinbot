const bot = require("./telegramBot");
const commands = require("./commands");
const messageHandler = require("./messageHandler");

// Register commands dengan polling yang lebih baik
const registeredCommands = new Set();

function registerCommand(pattern, handler) {
  bot.onText(pattern, async (msg, match) => {
    const chatId = msg.chat.id;
    console.log(`📨 Command received: ${pattern}, Chat ID: ${chatId}`);

    // Cegah eksekusi ganda untuk command yang sama dalam waktu singkat
    const key = `${chatId}-${pattern}`;
    if (registeredCommands.has(key)) {
      console.log(`⏳ Command ${pattern} for ${chatId} already processing, skipping...`);
      return;
    }

    registeredCommands.add(key);
    setTimeout(() => registeredCommands.delete(key), 2000); // Hapus setelah 2 detik

    try {
      await handler(msg, match);
    } catch (error) {
      console.error(`❌ Error in command ${pattern}:`, error);
    }
  });
}

// Register semua command
registerCommand(/\/start/, commands.start);
registerCommand(/\/login/, commands.login);
registerCommand(/\/settotp/, commands.settotp);
registerCommand(/\/cek/, commands.cek);
registerCommand(/\/logout/, commands.logout);
registerCommand(/\/rekap(?:\s+(\d+))?/, commands.rekap);
registerCommand(/\/kinerja/, commands.kinerja);
registerCommand(/\/tambahkinerja/, commands.tambahkinerja);

// Test reminder command (manual trigger)
registerCommand(/\/testreminder/, async (msg) => {
  const chatId = msg.chat.id;
  console.log(`🧪 Manual reminder test triggered by ${chatId}`);

  try {
    const { checkTodayAttendance } = require("../services/attendanceService");
    await checkTodayAttendance(chatId);
    await bot.sendMessage(chatId, "✅ Test reminder executed");
    console.log(`✅ Manual reminder test completed for ${chatId}`);
  } catch (error) {
    console.error(`❌ Manual reminder test error for ${chatId}:`, error.message);
    await bot.sendMessage(chatId, `❌ Test reminder failed: ${error.message}`);
  }
});

// Test kinerja command
registerCommand(/\/testkinerja/, async (msg) => {
  const chatId = msg.chat.id;
  console.log(`🧪 Manual kinerja test triggered by ${chatId}`);

  try {
    const { checkTodayPerformance } = require("../services/dailyPerformanceService");
    await checkTodayPerformance(chatId);
    await bot.sendMessage(chatId, "✅ Test kinerja reminder executed");
    console.log(`✅ Manual kinerja test completed for ${chatId}`);
  } catch (error) {
    console.error(`❌ Manual kinerja test error for ${chatId}:`, error.message);
    await bot.sendMessage(chatId, `❌ Test kinerja failed: ${error.message}`);
  }
});

// Debug kinerja command
registerCommand(/\/debugkinerja/, async (msg) => {
  const chatId = msg.chat.id;
  console.log(`🔧 Debug kinerja triggered by ${chatId}`);

  try {
    const { loadCookies, buildCookieHeader } = require("../services/sessionService");
    const cookies = loadCookies(chatId);

    if (!cookies) {
      return bot.sendMessage(chatId, "❌ No cookies found");
    }

    const cookieHeader = buildCookieHeader(cookies);
    const cookieCount = cookies.length;

    await bot.sendMessage(
      chatId,
      `🔧 *DEBUG INFO*\n\n` +
        `🍪 Cookies: ${cookieCount}\n` +
        `📁 Session: ${cookies ? "✅ Ada" : "❌ Tidak ada"}\n` +
        `🔗 URL: https://e-kinerja.babelprov.go.id/v1/index.php?r=kinerja%2Fkegiatan-harian%2Findex-v4\n\n` +
        `Coba akses manual via browser dengan login terlebih dahulu.`,
      { parse_mode: "Markdown" },
    );
  } catch (error) {
    console.error(`❌ Debug error for ${chatId}:`, error.message);
    await bot.sendMessage(chatId, `❌ Debug failed: ${error.message}`);
  }
});

// Debug tabel command
registerCommand(/\/debugtabel/, async (msg) => {
  const chatId = msg.chat.id;
  console.log(`🔍 Debug tabel for ${chatId}`);

  try {
    const axios = require("axios");
    const cheerio = require("cheerio");
    const { loadCookies, buildCookieHeader } = require("../services/sessionService");

    const cookies = loadCookies(chatId);
    if (!cookies) {
      return bot.sendMessage(chatId, "❌ No cookies found");
    }

    const cookieHeader = buildCookieHeader(cookies);

    const response = await axios.get("https://e-kinerja.babelprov.go.id/v1/index.php?r=kinerja%2Fkegiatan-harian%2Findex-v4", {
      headers: {
        Cookie: cookieHeader,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    const $ = cheerio.load(response.data);
    const tables = $("table");

    let debugInfo = `📋 *DEBUG TABEL*\n\n`;
    debugInfo += `Jumlah tabel: ${tables.length}\n`;
    debugInfo += `URL: ${response.request?.res?.responseUrl || "N/A"}\n\n`;

    // Cari tabel yang relevan
    const targetTable = $("table.table-bordered");
    if (targetTable.length) {
      const rows = targetTable.find("tr");
      debugInfo += `📊 Tabel table-bordered ditemukan: ${rows.length} baris\n\n`;

      // Ambil contoh beberapa baris
      rows.slice(0, 5).each((j, row) => {
        const cells = $(row).find("td, th");
        debugInfo += `Baris ${j + 1}: ${cells.length} sel\n`;
        cells.each((k, cell) => {
          const cellText = $(cell).text().trim().substring(0, 50);
          debugInfo += `  Sel ${k + 1}: ${cellText}${cellText.length >= 50 ? "..." : ""}\n`;
        });
        debugInfo += `---\n`;
      });
    } else {
      debugInfo += `❌ Tabel table-bordered tidak ditemukan\n`;
    }

    if (debugInfo.length > 4000) {
      debugInfo = debugInfo.substring(0, 4000) + "\n... (terpotong)";
    }

    await bot.sendMessage(chatId, debugInfo, { parse_mode: "Markdown" });
  } catch (error) {
    console.error(`❌ Debug error:`, error.message);
    await bot.sendMessage(chatId, `❌ Debug failed: ${error.message}`);
  }
});

// Tambah kinerja tambahan command
registerCommand(/\/tambahkinerjatambahan/, async (msg) => {
  const chatId = msg.chat.id;
  console.log(`➕ Manual tambah kinerja tambahan triggered by ${chatId}`);

  try {
    // Cek session
    const cookies = require("../services/sessionService").loadCookies(chatId);
    if (!cookies) {
      return bot.sendMessage(chatId, "⚠️ Session tidak ditemukan. Silakan login dengan /login");
    }

    // Mulai flow untuk kinerja tambahan
    const { kinerjaInputFlow } = require("../state/memoryState");
    kinerjaInputFlow[chatId] = {
      step: "jenis",
      jenis: 2,
      data: {},
      formData: null,
    };

    // Langsung ke step loading_indikator
    await bot.sendMessage(chatId, "🔄 Mengambil daftar kegiatan tambahan...");

    const kinerjaInputService = require("../services/kinerjaInputService");
    const formData = await kinerjaInputService.getKinerjaForm(chatId, 2);
    kinerjaInputFlow[chatId].formData = formData;

    // Tampilkan opsi
    if (formData.options.length === 0) {
      delete kinerjaInputFlow[chatId];
      return bot.sendMessage(chatId, "❌ Tidak ada kegiatan tambahan yang tersedia.");
    }

    let message = `📋 *Pilih Jenis Kegiatan Tambahan:*\n\n`;
    formData.options.forEach((opt, index) => {
      message += `${index + 1}. ${opt.text}\n`;
    });
    message += `\nBalas dengan *angka* pilihan Anda (1-${formData.options.length}):`;

    kinerjaInputFlow[chatId].step = "pilih_indikator";
    await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error(`❌ Error in /tambahkinerjatambahan:`, error.message);
    await bot.sendMessage(chatId, `❌ Gagal: ${error.message}`);
  }
});

// Message handler for non-commands (HANYA untuk pesan yang bukan command)
bot.on("message", async (msg) => {
  // Skip jika pesan adalah command
  if (msg.text && msg.text.startsWith("/")) {
    return;
  }

  await messageHandler(msg);
});

console.log("✅ Bot commands registered");

module.exports = bot;
