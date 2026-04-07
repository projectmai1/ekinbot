const fs = require("fs");
const config = require("../config");

function getSessionPath(chatId) {
  return `${config.SESSION_DIR}/${chatId}.json`;
}

function getCookiePath(chatId) {
  return `${config.SESSION_DIR}/${chatId}-cookies.json`;
}

async function saveCookies(context, chatId) {
  const cookies = await context.cookies();
  fs.writeFileSync(getCookiePath(chatId), JSON.stringify(cookies));
}

function loadCookies(chatId) {
  const path = getCookiePath(chatId);
  if (!fs.existsSync(path)) return null;
  return JSON.parse(fs.readFileSync(path));
}

function buildCookieHeader(cookies) {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

module.exports = {
  getSessionPath,
  getCookiePath,
  saveCookies,
  loadCookies,
  buildCookieHeader,
};
