require('dotenv').config();
const {
  sendEntrepriseValidationEmail,
  sendEntrepriseRejectionEmail
} = require('../utils/mailer');
const { smtpEstConfigure } = require('../config/mailer');

async function main() {
  const to = String(process.argv[2] || '').trim();
  const mode = String(process.argv[3] || 'accept').trim().toLowerCase();
  const nomEntreprise = String(process.argv[4] || 'Entreprise Demo').trim();
  const motif = String(process.argv[5] || 'Demande refusee pour dossier incomplet.').trim();

  if (!to) {
    console.error('Usage: npm run test:enterprise-mail -- <email-destination> [accept|reject] [nom-entreprise] [motif]');
    process.exit(1);
  }

  console.log(`[test-mail] Envoi vers: ${to}`);
  console.log(`[test-mail] Mode: ${mode}`);
  console.log(`[test-mail] Entreprise: ${nomEntreprise}`);

  if (!smtpEstConfigure()) {
    console.warn('[test-mail] SMTP_HOST/SMTP_USER/SMTP_PASS manquants ou placeholders. Aucun email reel ne sera envoye.');
  }

  if (mode === 'reject') {
    console.log(`[test-mail] Motif: ${motif}`);
    await sendEntrepriseRejectionEmail(to, nomEntreprise, motif);
  } else {
    await sendEntrepriseValidationEmail(to, nomEntreprise);
  }

  console.log('[test-mail] Terminee. Verifie la boite de reception et Spam.');
}

main().catch((error) => {
  console.error('[test-mail] Echec envoi email:', error.message);
  process.exit(1);
});