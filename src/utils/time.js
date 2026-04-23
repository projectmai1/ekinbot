function calculateWorkHours(start, end) {
  const [sh, sm, ss] = start.split(":").map(Number);
  const [eh, em, es] = end.split(":").map(Number);

  const startDate = new Date(0, 0, 0, sh, sm, ss);
  const endDate = new Date(0, 0, 0, eh, em, es);

  const diffMs = endDate - startDate;
  return diffMs / (1000 * 60 * 60);
}

function getJakartaTime() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
}

// =============================
// ✅ TAMBAHAN BARU
// =============================

// function calculateWorkDurationWithBreak(times) {
//   if (!times || times.length < 2) return 0;

//   const toSeconds = (t) => {
//     const [h, m, s] = t.split(":").map(Number);
//     return h * 3600 + m * 60 + s;
//   };

//   let totalSeconds = 0;

//   // hitung pasangan masuk-keluar
//   for (let i = 0; i < times.length; i += 2) {
//     if (times[i + 1]) {
//       totalSeconds += toSeconds(times[i + 1]) - toSeconds(times[i]);
//     }
//   }

//   // potong istirahat (12:00–13:00)
//   const breakStart = 12 * 3600;
//   const breakEnd = 13 * 3600;

//   const firstIn = toSeconds(times[0]);
//   const lastOut = toSeconds(times[times.length - 1]);

//   if (firstIn < breakEnd && lastOut > breakStart) {
//     totalSeconds -= 3600;
//   }

//   return totalSeconds / 3600;
// }

function calculateWorkDurationWithBreak(times, isFriday = false) {
  if (!times || times.length < 2) return 0;

  const toSeconds = (t) => {
    const [h, m, s] = t.split(":").map(Number);
    return h * 3600 + m * 60 + s;
  };

  let totalSeconds = 0;

  for (let i = 0; i < times.length; i += 2) {
    if (times[i + 1]) {
      totalSeconds += toSeconds(times[i + 1]) - toSeconds(times[i]);
    }
  }

  const breakStart = isFriday ? 11.5 * 3600 : 12 * 3600;
  const breakEnd = 13 * 3600;

  const breakDuration = isFriday ? 5400 : 3600; // 1.5 jam vs 1 jam

  const firstIn = toSeconds(times[0]);
  const lastOut = toSeconds(times[times.length - 1]);

  // 🔍 cek apakah sudah ada jeda manual (sekitar jam istirahat)
  let hasManualBreak = false;

  for (let i = 1; i < times.length - 1; i += 2) {
    const out = toSeconds(times[i]);
    const nextIn = toSeconds(times[i + 1]);

    // jika keluar sebelum/sekitar istirahat dan masuk lagi setelahnya
    if (out <= breakEnd && nextIn >= breakStart) {
      hasManualBreak = true;
      break;
    }
  }

  // ⛔ hanya potong istirahat kalau BELUM ada break manual
  if (!hasManualBreak && firstIn < breakEnd && lastOut > breakStart) {
    totalSeconds -= breakDuration;
  }

  return totalSeconds / 3600;
}

function predictGoHomeTime(times, targetHours = 7.5) {
  if (!times || times.length === 0) return null;

  const toSeconds = (t) => {
    const [h, m, s] = t.split(":").map(Number);
    return h * 3600 + m * 60 + s;
  };

  const fromSeconds = (sec) => {
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    return `${h}:${m}`;
  };

  let worked = 0;

  for (let i = 0; i < times.length; i += 2) {
    if (times[i + 1]) {
      worked += toSeconds(times[i + 1]) - toSeconds(times[i]);
    }
  }

  const lastIn = toSeconds(times[times.length - 1]);

  let remaining = targetHours * 3600 - worked;

  // jika masih sebelum istirahat → tambahkan 1 jam
  if (lastIn < 12 * 3600) {
    remaining += 3600;
  }

  return fromSeconds(lastIn + remaining);
}

function getTargetWorkHours(custom = null) {
  if (custom) return Number(custom);

  if (process.env.TARGET_JAM_KERJA) {
    return Number(process.env.TARGET_JAM_KERJA);
  }

  return 7.5; // fallback default
}

module.exports = {
  calculateWorkHours,
  getJakartaTime,
  calculateWorkDurationWithBreak,
  predictGoHomeTime,
  getTargetWorkHours,
};
