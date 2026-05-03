const { transporter, smtpEstConfigure, resolveFromAddress } = require('../config/mailer');
const {
  entrepriseValidationEmailHtml,
  entrepriseRejetEmailHtml
} = require('./emailTemplates');

function emailEstConfigure() {
  return smtpEstConfigure();
}

function buildPasswordResetTemplate(resetUrl) {
  return `
    <div style="font-family: Arial, sans-serif; background-color: #f6f8fb; padding: 24px; color: #1f2937;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <tr>
          <td style="padding: 24px 28px; background: #0f2a47; color: #ffffff;">
            <h1 style="margin: 0; font-size: 22px; line-height: 1.3;">Talentia ATS</h1>
            <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.9;">Reinitialisation de mot de passe</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 28px;">
            <p style="margin: 0 0 14px; font-size: 15px; line-height: 1.6;">
              Vous avez demande la reinitialisation de votre mot de passe.
            </p>
            <p style="margin: 0 0 22px; font-size: 15px; line-height: 1.6;">
              Cliquez sur le bouton ci-dessous pour definir un nouveau mot de passe.
            </p>
            <p style="margin: 0 0 22px;">
              <a href="${resetUrl}" style="display: inline-block; background: #007bff; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 18px; border-radius: 8px;">
                Reinitialiser mon mot de passe
              </a>
            </p>
            <p style="margin: 0 0 10px; font-size: 14px; line-height: 1.6; color: #4b5563;">
              Ce lien expire dans 1 heure.
            </p>
            <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #6b7280; word-break: break-all;">
              Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br />
              <a href="${resetUrl}" style="color: #007bff;">${resetUrl}</a>
            </p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

async function sendPasswordResetEmail(to, resetUrl) {
  if (!emailEstConfigure()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Configuration email manquante pour l\'envoi des messages.');
    }

    console.warn('[mailer] Envoi email ignore en local: configuration SMTP non renseignee.');
    console.info(`[mailer] Lien de reinitialisation (mode local): ${resetUrl}`);
    return;
  }

  const mailOptions = {
    from: resolveFromAddress('Talentia ATS'),
    to,
    subject: 'Talentia ATS - Reinitialisation de votre mot de passe',
    text: `Vous avez demande une reinitialisation de mot de passe. Le lien suivant expire dans 1 heure : ${resetUrl}`,
    html: buildPasswordResetTemplate(resetUrl)
  };

  await transporter.sendMail(mailOptions);
}

async function sendEntrepriseValidationEmail(to, nomEntreprise) {
  if (!emailEstConfigure()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Configuration email manquante pour l\'envoi des messages.');
    }

    console.warn('[mailer] Envoi email ignore en local: configuration SMTP non renseignee.');
    console.info(`[mailer] Validation entreprise pour ${nomEntreprise}: ${to}`);
    return;
  }

  const mailOptions = {
    from: resolveFromAddress('Talentia ATS'),
    to,
    subject: 'Talentia ATS - Votre entreprise a été validée',
    text: `Votre demande d'inscription pour ${nomEntreprise} a été acceptée. Votre compte administrateur est maintenant activé.`,
    html: entrepriseValidationEmailHtml({ nom_entreprise: nomEntreprise })
  };

  await transporter.sendMail(mailOptions);
}

async function sendEntrepriseRejectionEmail(to, nomEntreprise, motif) {
  if (!emailEstConfigure()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Configuration email manquante pour l\'envoi des messages.');
    }

    console.warn('[mailer] Envoi email ignore en local: configuration SMTP non renseignee.');
    console.info(`[mailer] Rejet entreprise pour ${nomEntreprise}: ${to}`);
    return;
  }

  const mailOptions = {
    from: resolveFromAddress('Talentia ATS'),
    to,
    subject: 'Talentia ATS - Votre demande d\'inscription a été refusée',
    text: `Votre demande d'inscription pour ${nomEntreprise} a été refusée. Motif: ${motif}`,
    html: entrepriseRejetEmailHtml({ nom_entreprise: nomEntreprise, motif })
  };

  await transporter.sendMail(mailOptions);
}

module.exports = {
  sendPasswordResetEmail,
  sendEntrepriseValidationEmail,
  sendEntrepriseRejectionEmail
};
