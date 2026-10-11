export async function sendTelegram(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return {
      ok: false,
      skipped: true,
      reason: 'Telegram credentials missing'
    };
  }

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: String(text),
        disable_web_page_preview: true
      })
    }
  );

  const data = await response.json();

  if (!response.ok || !data?.ok) {
    throw new Error(
      `Telegram send failed: ${JSON.stringify(data)}`
    );
  }

  return {
    ok: true,
    messageId: data?.result?.message_id || null
  };
}
