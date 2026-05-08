import nodemailer from 'nodemailer'
import { config } from './config.js'

export function createTransport() {
  if (!config.smtp.host) {
    return nodemailer.createTransport({ jsonTransport: true })
  }

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  })
}

function baseTemplate({ title, intro, sections, buttonUrl, buttonLabel }) {
  const sectionHtml = sections
    .map((section) => `
      <tr>
        <td style="padding:12px 0;border-top:1px solid #e5e7eb">
          <strong style="display:block;color:#0f172a">${section.label}</strong>
          <span style="color:#475569">${section.value || 'Noch offen'}</span>
        </td>
      </tr>
    `)
    .join('')

  return `
    <!doctype html>
    <html lang="de">
      <body style="margin:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#172033">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fa;padding:24px">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #dce2ea;border-radius:12px;overflow:hidden">
                <tr>
                  <td style="padding:22px 24px;background:#0f766e;color:#fff">
                    <h1 style="margin:0;font-size:24px">${title}</h1>
                    <p style="margin:8px 0 0;color:#d9f7ef">${intro}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 24px">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${sectionHtml}</table>
                    <p style="margin:22px 0">
                      <a href="${buttonUrl}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:11px 16px;border-radius:8px;font-weight:bold">${buttonLabel}</a>
                    </p>
                    <p style="margin:0;color:#64748b;font-size:13px">Diese Mail wurde von Eventlotse versendet. Falls du diese Einladung nicht erwartet hast, kannst du sie ignorieren.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `
}

export function invitationMail({ to, event, inviter }) {
  const url = `${config.publicBaseUrl}/events/${event.id}`
  return {
    from: config.smtp.from,
    to,
    subject: `Einladung zu "${event.name}" in Eventlotse`,
    html: baseTemplate({
      title: `Du wurdest zu "${event.name}" eingeladen`,
      intro: `${inviter} möchte mit dir dieses Event organisieren.`,
      buttonUrl: url,
      buttonLabel: 'Event öffnen',
      sections: [
        { label: 'Datum', value: event.date },
        { label: 'Ort', value: event.location },
        { label: 'Motto', value: event.motto },
        { label: 'Gäste grob geschätzt', value: event.guests ? `ca. ${event.guests}` : '' },
      ],
    }),
  }
}

export function testMail(to) {
  return {
    from: config.smtp.from,
    to,
    subject: 'Eventlotse Testmail',
    html: baseTemplate({
      title: 'Eventlotse Mailversand funktioniert',
      intro: 'Diese Testmail bestätigt, dass SMTP grundsätzlich erreichbar ist.',
      buttonUrl: config.publicBaseUrl,
      buttonLabel: 'Eventlotse öffnen',
      sections: [
        { label: 'Base URL', value: config.publicBaseUrl },
        { label: 'SMTP Host', value: config.smtp.host || 'JSON-Testtransport in Entwicklung' },
        { label: 'Zeitpunkt', value: new Date().toLocaleString('de-DE') },
      ],
    }),
  }
}
