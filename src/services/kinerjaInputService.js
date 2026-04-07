const axios = require("axios");
const cheerio = require("cheerio");
const { loadCookies, buildCookieHeader } = require("./sessionService");
const { ensureLogin } = require("./authService");

class KinerjaInputService {
  constructor() {
    this.state = {};
  }

  async getKinerjaForm(chatId, jenis = 1) {
    const cookies = loadCookies(chatId);
    if (!cookies) {
      throw new Error("Session tidak ditemukan. Silakan login.");
    }

    const cookieHeader = buildCookieHeader(cookies);
    const url = `https://e-kinerja.babelprov.go.id/v1/index.php?r=kinerja%2Fkegiatan-harian%2Fcreate-v4&id_kegiatan_harian_jenis=${jenis}`;

    console.log(`📝 Mengambil form kinerja untuk ${chatId}, jenis: ${jenis}`);

    const response = await axios.get(url, {
      headers: {
        Cookie: cookieHeader,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: "https://e-kinerja.babelprov.go.id/v1/index.php",
      },
      timeout: 30000,
    });

    if (response.data.includes("site/login")) {
      console.log(`❌ Session expired saat mengambil form`);
      throw new Error("Session expired. Silakan login ulang.");
    }

    const $ = cheerio.load(response.data);

    // Ambil CSRF token
    const csrfToken = $('input[name="_csrf"]').val();
    if (!csrfToken) {
      throw new Error("Tidak dapat mengambil token keamanan (CSRF).");
    }

    // Ambil daftar berdasarkan jenis
    let options = [];
    if (jenis === 1) {
      // Untuk kinerja utama: ambil indikator kinerja
      $("#kegiatanharian-id_kegiatan_tahunan option").each((index, element) => {
        const value = $(element).attr("value");
        const text = $(element).text().trim();
        if (value && value !== "" && text && text !== "- Indikator Kinerja Individu -") {
          options.push({
            id: value,
            text: text.length > 100 ? text.substring(0, 100) + "..." : text,
            fullText: text,
            type: "indikator",
          });
        }
      });
    } else if (jenis === 2) {
      // Untuk kinerja tambahan: ambil jenis kegiatan tambahan
      $("#kegiatanharian-id_kegiatan_harian_tambahan option").each((index, element) => {
        const value = $(element).attr("value");
        const text = $(element).text().trim();
        if (value && value !== "" && text && text !== "- Pilih Kegiatan Tambahan -") {
          options.push({
            id: value,
            text: text,
            fullText: text,
            type: "kegiatan_tambahan",
          });
        }
      });
    }

    // Ambil nilai default jam
    const jamMulaiDefault = $("#kegiatanharian-jam_mulai").val() || "08:00";
    const jamSelesaiDefault = $("#kegiatanharian-jam_selesai").val() || "16:00";

    // Ambil nomor SKP (hanya untuk jenis 1)
    const nomorSkpLengkap = $("#kegiatanharian-nomorskplengkap").text() || "";

    console.log(`✅ Form loaded: ${options.length} options untuk jenis ${jenis}`);

    return {
      jenis,
      csrfToken,
      options, // Bisa berupa indikator atau jenis kegiatan tambahan
      jamMulaiDefault,
      jamSelesaiDefault,
      nomorSkpLengkap,
      url: response.request.res.responseUrl || url,
    };
  }

  async submitKinerja(chatId, data) {
    const cookies = loadCookies(chatId);
    if (!cookies) {
      throw new Error("Session tidak ditemukan.");
    }

    const cookieHeader = buildCookieHeader(cookies);

    // URL untuk submit
    const url = `https://e-kinerja.babelprov.go.id/v1/index.php?r=kinerja%2Fkegiatan-harian%2Fcreate-v4&id_kegiatan_harian_jenis=${data.jenis}`;

    console.log(`🚀 Submitting kinerja for ${chatId}`);
    console.log(`📊 Data:`, {
      jenis: data.jenis,
      uraianLength: data.uraian?.length,
      realisasi: data.realisasi,
      jamMulai: data.jam_mulai,
      jamSelesai: data.jam_selesai,
    });

    // Siapkan form data berdasarkan jenis
    const formData = new URLSearchParams();
    formData.append("_csrf", data.csrfToken);

    if (data.jenis === 1) {
      // Kinerja Utama (SKP)
      formData.append("KegiatanHarian[nomorSkpLengkap]", data.nomorSkpLengkap || "");
      formData.append("KegiatanHarian[id_kegiatan_tahunan]", data.id_kegiatan_tahunan);
      formData.append("KegiatanHarian[id_kegiatan_harian_tambahan]", ""); // Kosong untuk kinerja utama
    } else if (data.jenis === 2) {
      // Kinerja Tambahan
      formData.append("KegiatanHarian[id_kegiatan_harian_tambahan]", data.id_kegiatan_harian_tambahan);
      formData.append("KegiatanHarian[id_kegiatan_tahunan]", ""); // Kosong untuk kinerja tambahan
    }

    formData.append("KegiatanHarian[uraian]", data.uraian);
    formData.append("KegiatanHarian[realisasi]", data.realisasi);
    formData.append("KegiatanHarian[jam_mulai]", data.jam_mulai);
    formData.append("KegiatanHarian[jam_selesai]", data.jam_selesai);
    formData.append("referrer", data.referrer || "https://e-kinerja.babelprov.go.id/v1/index.php?r=kinerja%2Fkegiatan-harian%2Findex-v4");

    const response = await axios.post(url, formData.toString(), {
      headers: {
        Cookie: cookieHeader,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: url,
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://e-kinerja.babelprov.go.id",
      },
      maxRedirects: 5,
      validateStatus: (status) => status < 500,
      timeout: 30000,
    });

    console.log(`📨 Response status: ${response.status}`);
    console.log(`📨 Response URL: ${response.request.res.responseUrl}`);

    // Cek apakah submit berhasil (berpindah ke halaman index atau ada pesan sukses)
    const $ = cheerio.load(response.data);

    // Cek error messages
    const errors = $(".help-block-error")
      .map((i, el) => $(el).text().trim())
      .get();

    if (errors.length > 0) {
      console.log(`❌ Errors found:`, errors);
      throw new Error(errors.join(", "));
    }

    // Cek apakah redirect ke halaman index
    if (response.request.res.responseUrl.includes("index-v4")) {
      console.log(`✅ Successfully redirected to index`);
      return { success: true, message: "Kinerja berhasil disimpan" };
    }

    // Cek apakah ada pesan sukses
    if (response.data.includes("berhasil disimpan") || response.data.includes("success") || $(".alert-success").length > 0) {
      console.log(`✅ Success message found`);
      return { success: true, message: "Kinerja berhasil disimpan" };
    }

    // Jika tidak ada indikasi sukses, anggap gagal
    console.log(`❌ No success indicators found`);
    throw new Error("Gagal menyimpan kinerja. Tidak ada konfirmasi sukses.");
  }

  startFlow(chatId, jenis = 1) {
    this.state[chatId] = {
      step: "jenis",
      jenis: jenis,
      data: {},
    };
    return this.state[chatId];
  }

  nextStep(chatId, input) {
    const state = this.state[chatId];
    if (!state) return null;

    switch (state.step) {
      case "jenis":
        state.step = "indikator";
        state.data.jenis = parseInt(input) || 1;
        return state;

      case "indikator":
        state.step = "uraian";
        state.data.indikatorId = input;
        return state;

      case "uraian":
        state.step = "realisasi";
        state.data.uraian = input;
        return state;

      case "realisasi":
        state.step = "jam_mulai";
        state.data.realisasi = input;
        return state;

      case "jam_mulai":
        state.step = "jam_selesai";
        state.data.jam_mulai = input;
        return state;

      case "jam_selesai":
        state.step = "konfirmasi";
        state.data.jam_selesai = input;
        return state;

      case "konfirmasi":
        state.step = "complete";
        return state;

      default:
        return null;
    }
  }

  getCurrentStep(chatId) {
    return this.state[chatId];
  }

  clearFlow(chatId) {
    delete this.state[chatId];
  }
}

module.exports = new KinerjaInputService();
