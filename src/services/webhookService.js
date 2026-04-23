const axios = require("axios");

async function setWebhook() {
  const token = process.env.BOT_TOKEN;
  const env = process.env.APP_ENV;

  const webhookUrl = env === "production" ? process.env.WEBHOOK_PROD : process.env.WEBHOOK_DEV;

  try {
    // 🔍 cek webhook sekarang
    const info = await axios.get(`https://api.telegram.org/bot${token}/getWebhookInfo`);

    const currentUrl = info.data.result.url;

    if (currentUrl === webhookUrl) {
      console.log("✅ Webhook sudah sesuai:", webhookUrl);
      return;
    }

    // 🔁 set webhook baru
    await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, {
      url: webhookUrl,
    });

    console.log("🔗 Webhook diubah ke:", webhookUrl);
  } catch (error) {
    console.error("❌ Gagal set webhook:", error.response?.data || error.message);
  }
}

module.exports = { setWebhook };
