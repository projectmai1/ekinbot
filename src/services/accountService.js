const fs = require("fs");
const config = require("../config");

function getAccountPath(chatId) {
  return `${config.ACCOUNT_DIR}/${chatId}.json`;
}

function saveAccount(chatId, data) {
  fs.writeFileSync(getAccountPath(chatId), JSON.stringify(data, null, 2));
}

function loadAccount(chatId) {
  const path = getAccountPath(chatId);
  if (!fs.existsSync(path)) return null;
  return JSON.parse(fs.readFileSync(path));
}

module.exports = {
  saveAccount,
  loadAccount,
};
