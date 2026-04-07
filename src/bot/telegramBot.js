const TelegramBot = require("node-telegram-bot-api");
const config = require("../config");

// Buat instance bot
const bot = new TelegramBot(config.BOT_TOKEN, { polling: false });

// Set webhook
bot.setWebHook(config.WEBHOOK_URL);

module.exports = bot;
