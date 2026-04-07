const speakeasy = require("speakeasy");

function generateOTP(secret) {
  return speakeasy.totp({
    secret: secret.replace(/\s+/g, ""),
    encoding: "base32",
  });
}

module.exports = {
  generateOTP,
};
