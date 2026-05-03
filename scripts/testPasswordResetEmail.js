require('dotenv').config();
const { sendPasswordResetEmail } = require('../utils/mailer');
const { smtpEstConfigure } = require('../config/mailer');

async function main() {
  const to = String(process.argv[2] || '').trim();
  const mode = String(process.argv[3] || 'rh').trim().toLowerCase();

  if (!to) {
    console.error('Usage: npm run test:mail -- <email-destination> [rh|candidat]');
    process.exit(1);
  }

  const prefix = mode === 'candidat' ? '/candidat/reset-password' : '/reset-password';
  const baseUrl = String(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const demoToken = 'demo-token-local';
  const resetUrl = `${baseUrl}${prefix}/${demoToken}`;

  console.log(`[test-mail] Envoi vers: ${to}`);
  console.log(`[test-mail] URL de reset utilisee: ${resetUrl}`);

  if (!smtpEstConfigure()) {
    console.warn('[test-mail] SMTP_HOST/SMTP_USER/SMTP_PASS manquants ou placeholders. Aucun email reel ne sera envoye.');
  }

  await sendPasswordResetEmail(to, resetUrl);
  console.log('[test-mail] Terminee. Verifie la boite de reception et Spam.');
}

main().catch((error) => {
  console.error('[test-mail] Echec envoi email:', error.message);
  process.exit(1);
});
