'use strict';

const nodemailer = require('nodemailer');
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function gmailConfiguration() {
  const user = String(process.env.GMAIL_USER || '').trim();
  const appPassword = String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g, '');
  const missing = [];
  if (!user) missing.push('GMAIL_USER');
  if (!appPassword) missing.push('GMAIL_APP_PASSWORD');
  if (missing.length) throw new Error(`Fehlende Gmail-Konfiguration: ${missing.join(', ')}`);
  if (!EMAIL_PATTERN.test(user)) throw new Error('GMAIL_USER ist keine gültige E-Mail-Adresse.');

  return {
    transport: {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass: appPassword }
    },
    from: {
      name: String(process.env.MAIL_FROM_NAME || 'Bewerbungsportal').replace(/[\r\n]+/g, ' ').trim().slice(0, 100),
      address: user
    }
  };
}

function genericSmtpConfiguration() {
  const required = ['SMTP_HOST', 'SMTP_PORT', 'MAIL_FROM'];
  const missing = required.filter((key) => !String(process.env[key] || '').trim());
  if (missing.length) throw new Error(`Fehlende SMTP-Konfiguration: ${missing.join(', ')}`);

  const user = String(process.env.SMTP_USER || '').trim();
  const password = String(process.env.SMTP_PASS || '');
  if (Boolean(user) !== Boolean(password)) {
    throw new Error('SMTP_USER und SMTP_PASS müssen gemeinsam konfiguriert werden.');
  }

  return {
    transport: {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      auth: user
        ? { user, pass: password }
        : undefined
    },
    from: process.env.MAIL_FROM
  };
}

function mailConfiguration() {
  const provider = String(process.env.MAIL_PROVIDER || 'smtp').trim().toLowerCase();
  if (provider === 'gmail') return gmailConfiguration();
  if (provider === 'smtp') return genericSmtpConfiguration();
  throw new Error('MAIL_PROVIDER muss "gmail" oder "smtp" sein.');
}

function row(label, value) {
  if (!value) return '';
  return `<tr><th style="text-align:left;padding:6px 12px 6px 0;vertical-align:top">${escapeHtml(label)}</th><td style="padding:6px 0">${escapeHtml(value)}</td></tr>`;
}

function buildHtml(fields) {
  const fullName = `${fields.firstName} ${fields.lastName}`.trim();
  return `
    <h2>Neue Bewerbung von ${escapeHtml(fullName)}</h2>
    <table style="border-collapse:collapse">
      ${row('Stelle', fields.jobTitle)}
      ${row('Unternehmen', fields.company)}
      ${row('Name', fullName)}
      ${row('E-Mail', fields.email)}
      ${row('Telefon', fields.phone)}
      ${row('Adresse', [fields.street, fields.postalCode, fields.city, fields.country].filter(Boolean).join(', '))}
      ${row('LinkedIn', fields.linkedIn)}
      ${row('Aktuelle Position', fields.currentTitle)}
      ${row('Kenntnisse', fields.skills)}
      ${row('Sprachen', fields.languages)}
    </table>
    <h3>Anschreiben</h3>
    <p style="white-space:pre-wrap">${escapeHtml(fields.coverLetter || '—')}</p>
  `;
}

async function sendApplicationMail({ targetEmail, fields, files }) {
  const config = mailConfiguration();
  const transporter = nodemailer.createTransport(config.transport);
  const applicant = `${fields.firstName} ${fields.lastName}`.trim();
  const context = [fields.jobTitle, fields.company].filter(Boolean).join(' – ');

  return transporter.sendMail({
    from: config.from,
    to: targetEmail,
    replyTo: fields.email,
    subject: `Neue Bewerbung: ${applicant}${context ? ` – ${context}` : ''}`,
    html: buildHtml(fields),
    text: [
      `Neue Bewerbung von ${applicant}`,
      `Stelle: ${fields.jobTitle || '—'}`,
      `Unternehmen: ${fields.company || '—'}`,
      `E-Mail: ${fields.email}`,
      `Telefon: ${fields.phone || '—'}`,
      `Aktuelle Position: ${fields.currentTitle || '—'}`,
      `Kenntnisse: ${fields.skills || '—'}`,
      `Sprachen: ${fields.languages || '—'}`,
      '',
      'Anschreiben:',
      fields.coverLetter || '—'
    ].join('\n'),
    attachments: files
  });
}

module.exports = { sendApplicationMail, buildHtml, mailConfiguration };
