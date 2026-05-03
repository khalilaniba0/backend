const baseStyles = 'font-family: Arial, sans-serif; background-color: #f6f8fb; padding: 24px; color: #1f2937;';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapEmail({ title, subtitle, body }) {
  return `
    <div style="${baseStyles}">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <tr>
          <td style="padding: 24px 28px; background: #0f2a47; color: #ffffff;">
            <h1 style="margin: 0; font-size: 22px; line-height: 1.3;">Talentia ATS</h1>
            <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.9;">${title}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 28px;">
            <p style="margin: 0 0 14px; font-size: 15px; line-height: 1.6;">${subtitle}</p>
            ${body}
          </td>
        </tr>
      </table>
    </div>
  `;
}

exports.invitationEmailHtml = ({ nom_entreprise, lien, expires_hours }) => wrapEmail({
  title: "Invitation d'acces",
  subtitle: `Vous avez été invité à rejoindre l'espace recruteur de <strong>${escapeHtml(nom_entreprise)}</strong> sur l'ATS Talentia.`,
  body: `
    <p style="margin: 0 0 22px; font-size: 15px; line-height: 1.6;">Pour activer votre compte et configurer votre mot de passe, veuillez cliquer sur le lien ci-dessous :</p>
    <p style="margin: 0 0 22px;">
      <a href="${escapeHtml(lien)}" style="display: inline-block; padding: 12px 18px; background: #007bff; color: #ffffff; text-decoration: none; font-weight: 600; border-radius: 8px;">Activer mon compte</a>
    </p>
    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #4b5563;">Ce lien est valide pendant ${expires_hours} heures.</p>
  `
});

exports.entrepriseValidationEmailHtml = ({ nom_entreprise }) => wrapEmail({
  title: 'Entreprise validee',
  subtitle: `Votre demande d'inscription pour <strong>${escapeHtml(nom_entreprise)}</strong> a été acceptée.`,
  body: `
    <p style="margin: 0; font-size: 15px; line-height: 1.6;">Votre compte administrateur est maintenant activé. Vous pouvez vous connecter à la plateforme et commencer à gérer votre entreprise.</p>
  `
});

exports.entrepriseRejetEmailHtml = ({ nom_entreprise, motif }) => wrapEmail({
  title: 'Entreprise rejetee',
  subtitle: `Votre demande d'inscription pour <strong>${escapeHtml(nom_entreprise)}</strong> a été refusée.`,
  body: `
    <p style="margin: 0 0 14px; font-size: 15px; line-height: 1.6;">Motif du rejet :</p>
    <div style="padding: 14px 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; color: #374151; font-size: 14px; line-height: 1.6;">${escapeHtml(motif)}</div>
    <p style="margin: 16px 0 0; font-size: 15px; line-height: 1.6;">Si vous pensez qu'il s'agit d'une erreur, vous pouvez contacter le support pour obtenir des précisions.</p>
  `
});
