const fs = require("fs");
const config = require("../../config");

const getSessionPath = (chatId) => `${config.SESSION_DIR}/${chatId}.json`;
const getCookiePath = (chatId) => `${config.SESSION_DIR}/${chatId}-cookies.json`;

module.exports = (msg) => {
  const bot = require("../telegramBot");
  const chatId = msg.chat.id;
  if (fs.existsSync(getSessionPath(chatId))) fs.unlinkSync(getSessionPath(chatId));
  if (fs.existsSync(getCookiePath(chatId))) fs.unlinkSync(getCookiePath(chatId));

  bot.sendMessage(chatId, "🗑 Session dihapus");
};
