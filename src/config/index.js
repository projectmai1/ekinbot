require("dotenv").config();

const ENV = process.env.APP_ENV || "development";

const WEBHOOK_URL = ENV === "production" ? process.env.WEBHOOK_PROD : process.env.WEBHOOK_DEV;

const config = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  APP_ENV: ENV,
  WEBHOOK_URL,
  TAHUN: process.env.EKINERJA_TAHUN || "2026",
  ENC_KEY: process.env.ENCRYPTION_KEY,
  PORT: process.env.PORT || 8000,
  SESSION_DIR: "./sessions",
  ACCOUNT_DIR: "./accounts",
};

if (!config.BOT_TOKEN || !config.ENC_KEY) {
  console.error("BOT_TOKEN / ENCRYPTION_KEY belum diisi");
  process.exit(1);
}

module.exports = config;
