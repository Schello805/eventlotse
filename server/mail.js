import nodemailer from 'nodemailer'
import { query } from './db.js'
import { mailSettingsFromAppSettings, mergeAppSettings } from './settings.js'

async function getAppSettings() {
  const result = await query("SELECT value FROM settings WHERE key = 'app'")
  return mergeAppSettings(result.rows[0]?.value || {})
}

export async function getMailSettings() {
  return mailSettingsFromAppSettings(await getAppSettings())
}

export async function createTransport() {
  const settings = await getMailSettings()
  if (!settings.host) {
    return nodemailer.createTransport({ jsonTransport: true })
  }

  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.user ? { user: settings.user, pass: settings.pass } : undefined,
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

export async function invitationMail({ to, event, inviter, inviteUrl }) {
  const settings = await getMailSettings()
  return {
    from: settings.from,
    to,
    subject: `Einladung zu "${event.name}" in Eventlotse`,
    html: baseTemplate({
      title: `Du wurdest zu "${event.name}" eingeladen`,
      intro: `${inviter} möchte mit dir dieses Event organisieren.`,
      buttonUrl: inviteUrl,
      buttonLabel: 'Einladung annehmen',
      sections: [
        { label: 'Datum', value: event.date },
        { label: 'Ort', value: event.location },
        { label: 'Motto', value: event.motto },
        { label: 'Gäste grob geschätzt', value: event.guests ? `ca. ${event.guests}` : '' },
        { label: 'Was du tun sollst', value: 'Klicke auf den Button, setze dein Passwort und öffne danach dein Event.' },
      ],
    }),
  }
}

export async function testMail(to) {
  const settings = await getMailSettings()
  const appSettings = await getAppSettings()
  return {
    from: settings.from,
    to,
    subject: 'Eventlotse Testmail',
    html: baseTemplate({
      title: 'Eventlotse Mailversand funktioniert',
      intro: 'Diese Testmail bestätigt, dass SMTP grundsätzlich erreichbar ist.',
      buttonUrl: appSettings.baseUrl,
      buttonLabel: 'Eventlotse öffnen',
      sections: [
        { label: 'Base URL', value: appSettings.baseUrl },
        { label: 'SMTP Host', value: settings.host || 'JSON-Testtransport in Entwicklung' },
        { label: 'Zeitpunkt', value: new Date().toLocaleString('de-DE') },
      ],
    }),
  }
}

export async function passwordResetMail({ to, name, resetUrl, actor }) {
  const settings = await getMailSettings()
  return {
    from: settings.from,
    to,
    subject: 'Eventlotse Passwort setzen',
    html: baseTemplate({
      title: 'Passwort für Eventlotse setzen',
      intro: `${actor} hat für dich einen neuen Passwort-Link erstellt.`,
      buttonUrl: resetUrl,
      buttonLabel: 'Passwort setzen',
      sections: [
        { label: 'Benutzer', value: name || to },
        { label: 'Gültigkeit', value: 'Der Link ist 14 Tage gültig und kann danach neu erstellt werden.' },
        { label: 'Nächster Schritt', value: 'Klicke auf den Button und vergib ein eigenes Passwort mit mindestens 10 Zeichen.' },
      ],
    }),
  }
}

export async function reminderMail({ to, event, tasks }) {
  const settings = await getMailSettings()
  return {
    from: settings.from,
    to,
    subject: `Eventlotse Erinnerung: offene Aufgaben für "${event.name}"`,
    html: baseTemplate({
      title: `Offene Aufgaben für "${event.name}"`,
      intro: 'Diese Aufgaben sind bald fällig oder noch offen.',
      buttonUrl: `${config.publicBaseUrl}/events/${event.id}`,
      buttonLabel: 'Event öffnen',
      sections: tasks.map((task) => ({
        label: `${task.title} (${task.due || 'ohne Datum'})`,
        value: task.notes || 'Bitte Status prüfen und bei Bedarf aktualisieren.',
      })),
    }),
  }
}
