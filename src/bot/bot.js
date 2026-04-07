const TelegramBot = require("node-telegram-bot-api");
const config = require("../config");

const bot = new TelegramBot(config.BOT_TOKEN);
bot.setWebHook(config.WEBHOOK_URL);
bot.getWebHookInfo().then(console.log);

// Import command handlers
const commands = require("./commands");

// Register commands
bot.onText(/\/start/, commands.start);
bot.onText(/\/login/, commands.login);
bot.onText(/\/settotp/, commands.settotp);
bot.onText(/\/cek/, commands.cek);
bot.onText(/\/logout/, commands.logout);
bot.onText(/\/rekap(?:\s+(\d+))?/, commands.rekap);

// Message handler for non-commands
const messageHandler = require("./messageHandler");
bot.on("message", messageHandler);

module.exports = { bot };
