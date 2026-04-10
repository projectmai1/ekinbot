const { chromium } = require("playwright");
const config = require("../config");
const { getSessionPath, getCookiePath, loadCookies, saveCookies, buildCookieHeader } = require("./sessionService");
const { generateOTP } = require("../utils/otp");
const { loadAccount } = require("./accountService");
const { decrypt } = require("./encryptionService");
const { loginInProgress, otpResolverMap } = require("../state/memoryState");
const axios = require("axios");
const bot = require("../bot/telegramBot");

async function isSessionValid(chatId) {
  const cookies = loadCookies(chatId);
  if (!cookies) {
    console.log(`❌ No cookies for ${chatId}`);
    return false;
  }

  try {
    const response = await axios.get("https://e-kinerja.babelprov.go.id/v1/index.php", {
      headers: {
        Cookie: buildCookieHeader(cookies),
        "User-Agent": "Mozilla/5.0",
      },
      maxRedirects: 0,
      validateStatus: (status) => status < 400,
    });

    if (response.data.includes("site/login")) {
      console.log(`❌ Session expired for ${chatId}`);
      return false;
    }

    console.log(`✅ Session valid for ${chatId}`);
    return true;
  } catch (error) {
    console.log(`❌ Session check error for ${chatId}:`, error.message);
    return false;
  }
}

async function doLogin(chatId, username, password, totpSecret = null) {
  if (loginInProgress[chatId]) {
    console.log(`⏳ Login already in progress for ${chatId}`);
    return bot.sendMessage(chatId, "⏳ Login sedang berlangsung...");
  }

  const startTime = Date.now();

  loginInProgress[chatId] = true;
  console.log(`🚀 Starting login for ${chatId}, TOTP secret:`, totpSecret ? "Set" : "Not set");

  console.log("🧠 Launching browser...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  console.log("✅ Browser launched");

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log("STEP 1: buka login");
    await page.goto("https://e-kinerja.babelprov.go.id/v1/index.php?r=site/login");

    console.log("STEP 2: isi form");
    await page.fill("#loginform-username", username);
    await page.fill("#loginform-password", password);
    await page.fill("#loginform-tahun", config.TAHUN);

    await page.click("button[name='login-button']");

    // Tunggu dan tangani kedua kemungkinan: MFA atau langsung masuk
    await Promise.race([
      page.waitForSelector("#dynamicmodel-otp", { timeout: 15000 }).catch(() => null),
      page.waitForSelector(".main-sidebar", { timeout: 15000 }).catch(() => null),
      page.waitForNavigation({ waitUntil: "networkidle", timeout: 15000 }).catch(() => null),
    ]);

    console.log("Current URL after login attempt:", page.url());

    // Cek apakah perlu OTP
    if ((await page.locator("#dynamicmodel-otp").count()) > 0) {
      console.log("Masuk halaman MFA");

      let otp;

      if (totpSecret) {
        otp = generateOTP(totpSecret);
        console.log("OTP generated:", otp);
      } else {
        console.log("Requesting OTP from user...");
        await bot.sendMessage(chatId, "🔐 Masukkan OTP (6 digit)");
        otp = await new Promise((resolve) => {
          otpResolverMap[chatId] = resolve;
          setTimeout(() => {
            if (otpResolverMap[chatId]) {
              delete otpResolverMap[chatId];
              resolve(null);
            }
          }, 120000);
        });

        if (!otp) {
          console.log({
            event: "OTP_TIMEOUT",
            chatId,
            timestamp: new Date().toISOString(),
          });
          await bot.sendMessage(chatId, "⏰ Waktu input OTP habis");
          loginInProgress[chatId] = false;
          await browser.close();
          return;
        }
      }

      console.log("OTP to submit:", otp);
      await page.fill("#dynamicmodel-otp", otp);
      await page.click("button[type='submit']");

      // Tunggu setelah submit OTP
      await Promise.race([
        page.waitForSelector(".main-sidebar", { timeout: 15000 }).catch(() => null),
        page.waitForNavigation({ waitUntil: "networkidle", timeout: 15000 }).catch(() => null),
        page.waitForSelector(".alert-danger", { timeout: 10000 }).catch(() => null),
      ]);

      if ((await page.locator(".alert-danger").count()) > 0) {
        const errorMsg = (await page.locator(".alert-danger").textContent()) || "OTP salah";
        console.log("OTP salah atau expired");
        await bot.sendMessage(chatId, `❌ ${errorMsg}`);
        loginInProgress[chatId] = false;
        await browser.close();
        return;
      }
    }

    // Verifikasi login berhasil - cek beberapa indikator
    // await page.waitForLoadState("networkidle");
    await page.waitForLoadState("domcontentloaded");

    // Cek apakah benar-benar login berhasil
    const currentUrl = page.url();
    console.log("Final URL after login:", currentUrl);
    console.log("URL setelah login:", page.url());

    if (currentUrl.includes("site/login") || (await page.locator("#loginform-username").count()) > 0) {
      console.log("❌ Masih di halaman login → login gagal");
      throw new Error("Login gagal - tetap di halaman login");
    }

    console.log("Login berhasil, lanjut dashboard...");

    // Simpan session
    await context.storageState({ path: getSessionPath(chatId) });
    await saveCookies(context, chatId);
    console.log(`✅ Session saved for ${chatId}`);

    // =============================
    // 🔎 AMBIL DATA PROFIL dengan error handling yang lebih baik
    // =============================

    let nama = "-";
    let nip = "-";
    let jabatan = "-";
    let instansi = "-";

    // try {
    //   console.log("Mencoba membuka halaman profil...");
    //   await page.goto("https://e-kinerja.babelprov.go.id/v1/index.php?r=pegawai%2Fprofil", {
    //     waitUntil: "networkidle",
    //     timeout: 20000,
    //   });
    //   // Tunggu beberapa detik untuk memastikan halaman dimuat
    //   await page.waitForTimeout(3000);

    //   // Cek apakah kita di halaman profil atau diarahkan ke login
    //   if (page.url().includes("site/login")) {
    //     console.log("⚠️ Diarahkan ke halaman login saat mengakses profil");
    //     // Session mungkin tidak valid, tapi kita sudah menyimpan session sebelumnya
    //     // Lanjutkan dengan data default
    //   } else {
    //     // Coba ambil data profil
    //     await page.waitForSelector(".detail-view", { timeout: 10000 }).catch(() => {
    //       console.log("Elemen .detail-view tidak ditemukan, mencoba selector alternatif...");
    //     });

    //     // Coba berbagai selector untuk tabel profil
    //     const detailView = page.locator(".detail-view");
    //     const detailTables = page.locator("table.table");

    //     if ((await detailView.count()) > 0 || (await detailTables.count()) > 0) {
    //       // Ambil semua baris dari tabel
    //       const rows = await page.locator("table tr").all();

    //       for (const row of rows) {
    //         try {
    //           const thText = await row
    //             .locator("th")
    //             .textContent()
    //             .catch(() => "");
    //           const tdText = await row
    //             .locator("td")
    //             .textContent()
    //             .catch(() => "");

    //           if (thText.includes("Nama") || thText.includes("nama")) nama = tdText.trim();
    //           if (thText.includes("NIP") || thText.includes("nip")) nip = tdText.trim();
    //         } catch (e) {
    //           // Skip row jika error
    //         }
    //       }
    //     }

    //     // Coba ambil data jabatan dari elemen lain
    //     const jabatanElement = page.locator("text=/jabatan/i, text=/Jabatan/i").first();
    //     if ((await jabatanElement.count()) > 0) {
    //       const parent = jabatanElement.locator("..");
    //       jabatan = await parent
    //         .locator("td, span, div")
    //         .last()
    //         .textContent()
    //         .catch(() => "-");
    //     }
    //   }
    // } catch (profileError) {
    //   console.log("⚠️ Gagal mengambil data profil:", profileError.message);
    //   // Lanjutkan meskipun profil gagal, karena login sudah berhasil
    // }

    try {
      console.log("📄 Ambil data profil tanpa goto ulang...");

      // Pastikan halaman profil sudah muncul
      await page.waitForSelector(".detail-view", { timeout: 10000 });

      // Ambil semua data SEKALI (super cepat)
      const profileData = await page.evaluate(() => {
        const result = {
          nama: "-",
          nip: "-",
          jabatan: "-",
          instansi: "-",
        };

        // Ambil Nama & NIP dari tabel utama
        document.querySelectorAll(".detail-view tr").forEach((row) => {
          const th = row.querySelector("th")?.innerText || "";
          const td = row.querySelector("td")?.innerText || "";

          if (/nama/i.test(th)) result.nama = td.trim();
          if (/nip/i.test(th)) result.nip = td.trim();
        });

        // Ambil Jabatan & Instansi dari tabel riwayat (baris pertama)
        const firstRow = document.querySelector(".box-success table tbody tr");
        if (firstRow) {
          const tds = firstRow.querySelectorAll("td");

          result.jabatan = tds[1]?.innerText.trim() || "-";
          result.instansi = tds[2]?.innerText.trim() || "-";
        }

        return result;
      });

      nama = profileData.nama;
      nip = profileData.nip;
      jabatan = profileData.jabatan;
      instansi = profileData.instansi;
    } catch (profileError) {
      console.log("⚠️ Gagal mengambil data profil:", profileError.message);
    }
    // Kirim pesan sukses dengan data yang berhasil dikumpulkan
    await bot.sendMessage(
      chatId,
      `✅ *LOGIN BERHASIL*\n\n` +
        `👤 *Nama:* ${nama}\n` +
        `🆔 *NIP:* ${nip}\n` +
        `💼 *Jabatan:* ${jabatan}\n` +
        `🏢 *Instansi:* ${instansi}\n\n` +
        `🟢 Status: Online\n` +
        `📊 *Fitur yang tersedia:*\n` +
        `/rekap - Lihat rekap kehadiran\n` +
        `/kinerja - Lihat kinerja harian\n` +
        `/tambahkinerja - Tambah kinerja harian`,
      { parse_mode: "Markdown" },
    );

    console.log(`✅ Login successful for ${chatId}`);
    console.log(`⏱️ Login selesai dalam ${Date.now() - startTime} ms`);
  } catch (err) {
    console.error("❌ LOGIN ERROR:", {
      chatId,
      message: err.message,
      stack: err.stack,
    });
    await bot.sendMessage(chatId, `❌ Login gagal:\n${err.message}`);
  } finally {
    loginInProgress[chatId] = false;
    await browser.close();
    console.log(`✅ Browser closed for ${chatId}`);
  }
}

async function ensureLogin(chatId) {
  console.log(`🔍 Checking session for ${chatId}`);
  const valid = await isSessionValid(chatId);
  if (valid) return true;

  const account = loadAccount(chatId);
  if (!account) {
    console.log(`❌ No account found for ${chatId}`);
    return false;
  }

  const username = decrypt(account.username);
  const password = decrypt(account.password);
  const totpSecret = account.totpSecret ? decrypt(account.totpSecret) : null;

  console.log(`🔄 Session expired, auto relogin for ${chatId}`);
  await bot.sendMessage(chatId, "🔄 Session expired, login ulang otomatis...");
  await doLogin(chatId, username, password, totpSecret);

  // Cek ulang session setelah relogin
  return await isSessionValid(chatId);
}

module.exports = {
  isSessionValid,
  doLogin,
  ensureLogin,
};
