/*
 * Optional security messages outside the app (free):
 *   Telegram:  TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID   (make a bot with @BotFather)
 *   Email:     BREVO_API_KEY + ALERT_EMAIL + ALERT_FROM_EMAIL  (Brevo free plan, sender address verified in Brevo)
 * When none are set, alerts are still shown on the admin dashboard. Never throws, never waits more than a few seconds.
 */
async function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    console.error('[notify] could not send', (e as Error).message);
  } finally { clearTimeout(t); }
}

export async function sendSecurityMessage(subject: string, text: string) {
  const jobs: Promise<void>[] = [];
  const tg = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (tg && chat && /^[\w:-]+$/.test(tg)) jobs.push(post(`https://api.telegram.org/bot${tg}/sendMessage`, { chat_id: chat, text: `${subject}\n\n${text}`, disable_web_page_preview: true }));
  const key = process.env.BREVO_API_KEY;
  const to = process.env.ALERT_EMAIL;
  const from = process.env.ALERT_FROM_EMAIL;
  if (key && to && from) {
    jobs.push(post('https://api.brevo.com/v3/smtp/email', {
      sender: { email: from, name: 'Cloud Packers CRM' },
      to: to.split(',').map((e) => ({ email: e.trim() })).filter((x) => x.email),
      subject, textContent: text,
    }, { 'api-key': key }));
  }
  await Promise.all(jobs);
}
