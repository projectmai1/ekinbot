const CryptoJS = require("crypto-js");
const config = require("../config");

function encrypt(text) {
  return CryptoJS.AES.encrypt(text, config.ENC_KEY).toString();
}

function decrypt(cipher) {
  return CryptoJS.AES.decrypt(cipher, config.ENC_KEY).toString(CryptoJS.enc.Utf8);
}

module.exports = {
  encrypt,
  decrypt,
};
