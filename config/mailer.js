const nodemailer = require('nodemailer');

function estValeurPlaceholder(value) {
  const valeur = String(value || '').trim();
  return !valeur || valeur.includes('A_REMPLIR') || /^<.+>$/.test(valeur);
}

function smtpEstConfigure() {
  return !estValeurPlaceholder(process.env.SMTP_HOST)
    && !estValeurPlaceholder(process.env.SMTP_USER)
    && !estValeurPlaceholder(process.env.SMTP_PASS);
}

function resolveFromAddress(displayName = 'Talentia ATS') {
  const smtpFrom = String(process.env.SMTP_FROM || '').trim();
  if (!estValeurPlaceholder(smtpFrom)) {
    return smtpFrom;
  }

  const smtpUser = String(process.env.SMTP_USER || '').trim();
  if (!estValeurPlaceholder(smtpUser)) {
    return `${displayName} <${smtpUser}>`;
  }

  return `${displayName} <no-reply@localhost>`;
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

module.exports = {
  transporter,
  smtpEstConfigure,
  resolveFromAddress
};
