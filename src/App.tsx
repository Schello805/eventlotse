import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import {
  Bell,
  ArrowDown,
  ArrowUp,
  Archive,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Clock3,
  Copy,
  Download,
  Euro,
  FileText,
  GripVertical,
  KanbanSquare,
  LayoutDashboard,
  Lock,
  Mail,
  MapPin,
  Music,
  Printer,
  Plus,
  RotateCcw,
  Save,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import { useLocalStorage } from './hooks/useLocalStorage'
import './App.css'

type Role = 'Admin' | 'Helfer'
type Status = 'todo' | 'doing' | 'done'
type LegalPageKey = 'impressum' | 'datenschutz' | 'cookies'

type Member = {
  id: string
  name: string
  email: string
  role: Role
  note?: string
}

type Task = {
  id: string
  title: string
  ownerIds: string[]
  due: string
  status: Status
  notes: string
  files: string[]
  comments: string[]
}

type ActionCard = {
  id: string
  title: string
  category: string
  owners: string[]
  deadline: string
  tasks: Task[]
  notes: string
}

type BudgetLine = {
  id: string
  label: string
  type: 'income' | 'expense'
  amount: number
}

type RunItem = {
  id: string
  time: string
  title: string
  owner: string
}

type EventPlan = {
  id: string
  name: string
  motto: string
  targetGroup: string
  guests: number
  date: string
  location: string
  mapUrl: string
  contact: string
  photoUrl: string
  archived: boolean
  members: Member[]
  actions: ActionCard[]
  budget: BudgetLine[]
  infrastructure: string[]
  runsheet: RunItem[]
  actNotes: string
  wiki: string[]
}

type EventTemplate = {
  id: string
  name: string
  description: string
  motto?: string
  targetGroup?: string
  guests?: number
  actions: { title: string; category: string; tasks: string[] }[]
  infrastructure: string[]
  runsheet: { time: string; title: string; owner: string }[]
  budget: { label: string; type: 'income' | 'expense'; amount: number }[]
  wiki: string[]
}

type AppSettings = {
  baseUrl: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass?: string
  smtpFrom: string
  smtpTls: boolean
  reminderLeadDays: number
  allowUserEventCreation: boolean
  eventTemplates: EventTemplate[]
}

type AuditEntry = {
  id: string
  at: string
  actor: string
  action: string
}

type StoredFile = {
  id: string
  task_id?: string
  original_name: string
  mime_type: string
  size_bytes: number
  created_at: string
}

type EventTab = 'overview' | 'tasks' | 'team' | 'infrastructure' | 'schedule'

type ToastState = {
  message: string
  actionLabel?: string
  onAction?: () => void
} | null
type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type TaskFilter = 'all' | 'open' | 'overdue' | 'mine' | 'unassigned'

const repoUrl = 'https://github.com/Schello805/eventlotse'
const storageKey = 'eventlotse.workspace.v2'
const settingsStorageKey = 'eventlotse.settings.v1'
const templateStorageKey = 'eventlotse.templates.v1'
const auditStorageKey = 'eventlotse.audit.v1'

const builtInEventTemplates: EventTemplate[] = [
  {
    id: 'template-hochzeit',
    name: 'Hochzeit',
    description: 'Feier mit Empfang, Essen, Musik, Ablaufplan, Technik und Fotoalbum.',
    motto: 'Hochzeitsfeier',
    targetGroup: 'Familie, Freunde und geladene Gäste',
    guests: 80,
    actions: [
      { title: 'Location & Aufbau', category: 'Logistik', tasks: ['Bestuhlung planen', 'Dekoration vorbereiten', 'Aufbau-Team einteilen'] },
      { title: 'Essen & Getränke', category: 'Versorgung', tasks: ['Catering abstimmen', 'Getränke kalkulieren', 'Kühlung klären'] },
      { title: 'Musik & Programm', category: 'Booking', tasks: ['DJ oder Band bestätigen', 'Eröffnungstanz einplanen', 'Reden und Beiträge sammeln'] },
      { title: 'Foto & Erinnerungen', category: 'Dokumentation', tasks: ['Fotograf klären', 'Fotoalbum-Link anlegen', 'Upload-Hinweis an Gäste vorbereiten'] },
    ],
    infrastructure: ['Licht', 'Bar', 'Sanitär', 'Parken'],
    runsheet: [
      { time: '14:00', title: 'Aufbau & Dekoration', owner: 'Team' },
      { time: '17:00', title: 'Empfang', owner: 'offen' },
      { time: '19:00', title: 'Essen', owner: 'Catering' },
      { time: '21:00', title: 'Musik & Tanz', owner: 'DJ/Band' },
    ],
    budget: [
      { label: 'Catering', type: 'expense', amount: 0 },
      { label: 'Musik', type: 'expense', amount: 0 },
      { label: 'Dekoration', type: 'expense', amount: 0 },
    ],
    wiki: ['Notfallkontakte sammeln', 'Fotoalbum-Link nach der Feier teilen'],
  },
  {
    id: 'template-tanzevent',
    name: 'Tanzevent',
    description: 'Wiederkehrende Tanzveranstaltung mit Musik, Einlass, Technik, Bar und Aufbau.',
    motto: 'Tanzabend',
    targetGroup: 'Tanzgruppe, Freunde und Gäste',
    guests: 60,
    actions: [
      { title: 'Musik & Tanzfläche', category: 'Booking', tasks: ['Playlist/DJ klären', 'Tanzfläche prüfen', 'Soundcheck planen'] },
      { title: 'Aufbau', category: 'Logistik', tasks: ['Tische wegräumen', 'Licht aufbauen', 'Beschilderung vorbereiten'] },
      { title: 'Bar & Getränke', category: 'Versorgung', tasks: ['Getränke einkaufen', 'Bar-Schicht planen', 'Kasse/Wechselgeld klären'] },
      { title: 'Einladung', category: 'Gäste', tasks: ['Einladung versenden', 'Zusagen sammeln', 'Hinweise zu Schuhen/Parken teilen'] },
    ],
    infrastructure: ['PA-Anlage', 'Licht', 'Bar', 'Parken'],
    runsheet: [
      { time: '17:00', title: 'Aufbau', owner: 'Team' },
      { time: '18:30', title: 'Soundcheck', owner: 'Musik' },
      { time: '19:30', title: 'Einlass', owner: 'offen' },
      { time: '20:00', title: 'Tanzbeginn', owner: 'Musik' },
    ],
    budget: [
      { label: 'Getränke', type: 'expense', amount: 0 },
      { label: 'Musik/Technik', type: 'expense', amount: 0 },
    ],
    wiki: ['Standard-Aufbauplan prüfen', 'Fotoalbum-Link für Gäste vorbereiten'],
  },
  {
    id: 'template-vereinsfest',
    name: 'Vereinsfest',
    description: 'Kleines bis mittleres Fest mit Aufbau, Ausschank, Genehmigungen und Schichten.',
    motto: 'Vereinsfest',
    targetGroup: 'Mitglieder, Familien und Nachbarschaft',
    guests: 120,
    actions: [
      { title: 'Genehmigungen', category: 'Recht', tasks: ['Ausschank prüfen', 'GEMA klären', 'Lärmschutzzeiten notieren'] },
      { title: 'Schichtplan', category: 'Team', tasks: ['Aufbau-Schicht', 'Bar-Schicht', 'Abbau-Schicht'] },
      { title: 'Infrastruktur', category: 'Logistik', tasks: ['Biertische organisieren', 'Strom prüfen', 'Sanitär klären'] },
    ],
    infrastructure: ['Biertische', 'Bar', 'Stromplan', 'GEMA', 'Ausschank', 'Sanitär'],
    runsheet: [
      { time: '09:00', title: 'Aufbau', owner: 'Team' },
      { time: '14:00', title: 'Beginn', owner: 'offen' },
      { time: '22:00', title: 'Abbau', owner: 'Team' },
    ],
    budget: [
      { label: 'Getränke/Essen', type: 'expense', amount: 0 },
      { label: 'Spenden/Sponsoring', type: 'income', amount: 0 },
    ],
    wiki: ['Lessons Learned nach dem Fest ergänzen'],
  },
]

const actionTemplates = [
  { title: 'Aufbau', category: 'Logistik', help: 'Alles, was vor Ort aufgebaut, angeliefert oder vorbereitet werden muss.' },
  { title: 'Abbau', category: 'Logistik', help: 'Rückbau, Reinigung, Rückgabe und letzte Kontrolle nach der Veranstaltung.' },
  { title: 'Musik & Programm', category: 'Booking', help: 'DJs, Bands, Redner oder andere Programmpunkte inklusive Kontakt und Absprachen.' },
  { title: 'Flyer & Design', category: 'Marketing', help: 'Gestaltung, Freigabe, Druck und Verteilung von Flyern oder digitalen Einladungen.' },
  { title: 'Einladungen', category: 'Gäste', help: 'Gästeliste, Zu- und Absagen, Zielgruppe und wichtige Hinweise an Gäste.' },
  { title: 'Catering', category: 'Versorgung', help: 'Essen, Getränke, Einkauf, Ausgabe, Kühlung und Pfand.' },
  { title: 'GEMA & Genehmigungen', category: 'Recht', help: 'Musiknutzung, Ausschank, Lärm, Genehmigungen und Auflagen.' },
  { title: 'Technik', category: 'Infrastruktur', help: 'Ton, Licht, Strom, Kabel, Bühne, WLAN und technische Pläne.' },
  { title: 'Schichtplan', category: 'Team', help: 'Wer hilft wann bei Aufbau, Kasse, Bar, Einlass oder Abbau?' },
  { title: 'Zeitplan', category: 'Ablauf', help: 'Minutengenauer Plan für den Veranstaltungstag.' },
]

const infrastructureOptions = [
  'PA-Anlage',
  'Licht',
  'Biertische',
  'Bar',
  'Stromplan',
  'GEMA',
  'Ausschank',
  'Sanitär',
  'Parken',
]

const infrastructureTaskTemplates: Record<string, string[]> = {
  'PA-Anlage': [
    'Strombedarf und Anschlüsse klären',
    'Anzahl Lautsprecher festlegen',
    'Anzahl Mikrofone und Stative festlegen',
    'Mischpult, Kabel und Adapter prüfen',
    'Transport, Aufbau, Soundcheck und Abbau einteilen',
  ],
  Licht: [
    'Benötigte Lichtstimmung festlegen',
    'Lichtanlage, Stative und Strom planen',
    'Aufbaupositionen und Kabelwege klären',
    'Bedienung während des Events festlegen',
    'Abbau und Rückgabe organisieren',
  ],
  Biertische: [
    'Anzahl Biertische und Bänke berechnen',
    'Transportfahrzeug und Abholzeit klären',
    'Aufbauplan für Sitzbereiche erstellen',
    'Rückgabe und Reinigung organisieren',
  ],
  Bar: [
    'Barfläche und Ausstattung festlegen',
    'Getränke, Kühlung und Gläser planen',
    'Kasse, Wechselgeld und Pfand klären',
    'Bar-Schichten einteilen',
  ],
  Stromplan: [
    'Stromquellen und Sicherungen prüfen',
    'Kabelwege und Stolperstellen planen',
    'Mehrfachstecker und Verlängerungen organisieren',
    'Notfallkontakt für Stromausfall festlegen',
  ],
  GEMA: [
    'Musiknutzung prüfen',
    'GEMA-Anmeldung vorbereiten',
    'Setlist oder Musikprogramm dokumentieren',
    'Gebühren und Zahlungsfrist prüfen',
  ],
  Ausschank: [
    'Ausschankgenehmigung prüfen',
    'Jugendschutz und Verantwortliche festlegen',
    'Getränkeliste und Preise abstimmen',
    'Hygiene und Reinigung klären',
  ],
  Sanitär: [
    'Sanitärbedarf nach Gästezahl prüfen',
    'Toilettenstandort und Beschilderung planen',
    'Reinigung und Verbrauchsmaterial organisieren',
    'Barrierefreiheit prüfen',
  ],
  Parken: [
    'Parkflächen und Zufahrt prüfen',
    'Beschilderung und Einweiser planen',
    'Anwohner- oder Rettungswege freihalten',
    'Parkhinweise an Gäste kommunizieren',
  ],
}

const defaultSettings: AppSettings = {
  baseUrl: 'https://eventlotse.example.org',
  smtpHost: 'smtp.example.org',
  smtpPort: 587,
  smtpUser: 'info@example.org',
  smtpPass: '',
  smtpFrom: 'Eventlotse <info@example.org>',
  smtpTls: true,
  reminderLeadDays: 3,
  allowUserEventCreation: false,
  eventTemplates: builtInEventTemplates,
}

const eventFormSchema = z.object({
  templateId: z.string().optional(),
  name: z.string().trim().min(1, 'Eventname fehlt.'),
  motto: z.string().trim().optional(),
  targetGroup: z.string().trim().optional(),
  guests: z.number().min(0).default(0),
  date: z.string().optional(),
  location: z.string().trim().optional(),
})

const settingsSchema = z.object({
  baseUrl: z.string().url('Bitte eine gültige Base URL eingeben.'),
  smtpHost: z.string().trim().min(1, 'SMTP Host fehlt.'),
  smtpPort: z.number().min(1).max(65535),
  smtpUser: z.string().trim().min(1, 'SMTP Benutzer fehlt.'),
  smtpPass: z.string().optional(),
  smtpFrom: z.string().trim().min(1, 'Absender fehlt.'),
  smtpTls: z.boolean().default(true),
  reminderLeadDays: z.number().min(0).max(30).default(3),
  allowUserEventCreation: z.boolean().default(false),
})

type EventFormValues = z.infer<typeof eventFormSchema>
type SettingsFormValues = z.infer<typeof settingsSchema>
type EventFormInput = z.input<typeof eventFormSchema>
type SettingsFormInput = z.input<typeof settingsSchema>

const uid = () => crypto.randomUUID()
const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'event'

function buildInfrastructureActionCard(item: string, eventDate = '', ownerId = ''): ActionCard {
  return {
    id: uid(),
    title: item,
    category: 'Infrastruktur',
    owners: ownerId ? [ownerId] : [],
    deadline: eventDate,
    notes: 'Automatisch aus der Infrastruktur-Checkliste erzeugt. Hauptverantwortliche Person koordiniert die Unteraufgaben.',
    tasks: (infrastructureTaskTemplates[item] || [`${item} organisieren`, `${item} Aufbau klären`, `${item} Abbau klären`]).map((title) => ({
      id: uid(),
      title,
      ownerIds: ownerId ? [ownerId] : [],
      due: eventDate,
      status: 'todo',
      notes: '',
      files: [],
      comments: ['Aus Infrastrukturbedarf angelegt. Verantwortliche und Details nach SMART ergänzen.'],
    })),
  }
}

const blockedUploadExtensions = new Set([
  '.app',
  '.bat',
  '.cmd',
  '.com',
  '.dll',
  '.dmg',
  '.exe',
  '.jar',
  '.js',
  '.jse',
  '.msi',
  '.ps1',
  '.scr',
  '.sh',
  '.vb',
  '.vbs',
  '.wsf',
])

const emptyEvents: EventPlan[] = []
const legacyDemoEventNames = new Set(['Sommerfest am See', 'Hofkonzert', 'Geburtstag 40'])

function isBlockedUploadFile(fileName: string) {
  const extension = fileName.toLowerCase().slice(fileName.lastIndexOf('.'))
  return blockedUploadExtensions.has(extension)
}

function readCookie(name: string) {
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || ''
}

function secureFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  const csrfToken = readCookie('eventlotse_csrf')
  if (csrfToken) headers.set('X-Eventlotse-CSRF', decodeURIComponent(csrfToken))
  return fetch(input, { ...init, headers, credentials: 'include' })
}

function normalizeRole(role: string): Role {
  if (role === 'Admin' || role === 'Helfer') return role
  return 'Helfer'
}

function normalizeEvent(event: EventPlan): EventPlan {
  return {
    ...event,
    photoUrl: event.photoUrl || '',
    archived: Boolean(event.archived),
    members: event.members.map((member) => ({ ...member, role: normalizeRole(member.role) })),
  }
}

function isLegacyDemoEvent(event: EventPlan) {
  const emails = event.members.map((member) => member.email)
  return legacyDemoEventNames.has(event.name) && emails.some((email) => email.endsWith('@example.de'))
}

function normalizeTemplate(template: Partial<EventTemplate> = {}): EventTemplate {
  return {
    id: template.id || uid(),
    name: String(template.name || 'Neue Vorlage').trim(),
    description: String(template.description || '').trim(),
    motto: template.motto || '',
    targetGroup: template.targetGroup || '',
    guests: Number(template.guests || 0),
    actions: Array.isArray(template.actions)
      ? template.actions.map((action) => ({
          title: String(action.title || 'Aufgabe').trim(),
          category: String(action.category || 'Allgemein').trim(),
          tasks: Array.isArray(action.tasks) ? action.tasks.map((task) => String(task).trim()).filter(Boolean) : [],
        })).filter((action) => action.title)
      : [],
    infrastructure: Array.isArray(template.infrastructure) ? template.infrastructure.map(String).filter(Boolean) : [],
    runsheet: Array.isArray(template.runsheet)
      ? template.runsheet.map((item) => ({
          time: String(item.time || ''),
          title: String(item.title || ''),
          owner: String(item.owner || ''),
        })).filter((item) => item.time || item.title || item.owner)
      : [],
    budget: Array.isArray(template.budget)
      ? template.budget.map((item) => ({
          label: String(item.label || ''),
          type: item.type === 'income' ? ('income' as const) : ('expense' as const),
          amount: Number(item.amount || 0),
        })).filter((item) => item.label)
      : [],
    wiki: Array.isArray(template.wiki) ? template.wiki.map(String).filter(Boolean) : [],
  }
}

function normalizeTemplates(templates: unknown): EventTemplate[] {
  return Array.isArray(templates) && templates.length ? templates.map((template) => normalizeTemplate(template as Partial<EventTemplate>)) : builtInEventTemplates
}

function loadEvents() {
  const raw = localStorage.getItem(storageKey)
  if (!raw) return emptyEvents

  try {
    return (JSON.parse(raw) as EventPlan[]).map(normalizeEvent).filter((event) => !isLegacyDemoEvent(event))
  } catch {
    return emptyEvents
  }
}

function App() {
  const [events, setEvents] = useLocalStorage<EventPlan[]>(storageKey, loadEvents())
  const [settings, setSettings] = useLocalStorage<AppSettings>(settingsStorageKey, defaultSettings)
  const [eventTemplates, setEventTemplates] = useLocalStorage<EventTemplate[]>(templateStorageKey, builtInEventTemplates)
  const [auditLog, setAuditLog] = useLocalStorage<AuditEntry[]>(
    auditStorageKey,
    [
      {
        id: uid(),
        at: new Date().toLocaleString('de-DE'),
        actor: 'System',
        action: 'Eventlotse wurde initialisiert.',
      },
    ],
  )
  const [session, setSession] = useState({ email: 'info@schellenberger.biz', name: '', profileNote: '', role: 'Helfer' as Role, authenticated: false })
  const [canCreateEvents, setCanCreateEvents] = useState(false)
  const [loginPassword, setLoginPassword] = useState('')
  const [toast, setToast] = useState<ToastState>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  useEffect(() => {
    const normalizedEvents = events.map(normalizeEvent)
    if (JSON.stringify(normalizedEvents) !== JSON.stringify(events)) {
      setEvents(normalizedEvents)
    }
  }, [events, setEvents])

  const loadRemoteData = useCallback(async () => {
    const response = await fetch('/api/bootstrap', { credentials: 'include' })
    if (!response.ok) return
    const data = await response.json()
    if (Array.isArray(data.events)) setEvents(data.events.map(normalizeEvent).filter((event: EventPlan) => !isLegacyDemoEvent(event)))
    if (data.settings) setSettings({ ...defaultSettings, ...data.settings, eventTemplates: normalizeTemplates(data.settings.eventTemplates) })
    if (Array.isArray(data.templates)) setEventTemplates(normalizeTemplates(data.templates))
    setCanCreateEvents(Boolean(data.permissions?.canCreateEvents))
    if (Array.isArray(data.auditLog)) setAuditLog(data.auditLog)
  }, [setAuditLog, setEventTemplates, setEvents, setSettings])

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then(async (data) => {
        if (!data?.user) return
        setSession({ email: data.user.email, name: data.user.name || '', profileNote: data.user.profileNote || '', role: normalizeRole(data.user.role), authenticated: true })
        await loadRemoteData()
      })
      .catch(() => undefined)
  }, [loadRemoteData])

  const addAudit = (action: string) => {
    setAuditLog((current) => [
      { id: uid(), at: new Date().toLocaleString('de-DE'), actor: session.email, action },
      ...current,
    ].slice(0, 60))
  }

  const updateEvent = (next: EventPlan) => {
    setEvents((current) => current.map((event) => (event.id === next.id ? next : event)))
    addAudit(`Event "${next.name}" wurde aktualisiert.`)
    setSaveState('saving')
    secureFetch(`/api/events/${next.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    })
      .then((response) => setSaveState(response.ok ? 'saved' : 'error'))
      .catch(() => setSaveState('error'))
  }

  const deleteEvent = async (eventId: string) => {
    const event = events.find((entry) => entry.id === eventId)
    if (!event) return
    const response = await secureFetch(`/api/events/${eventId}`, { method: 'DELETE' }).catch(() => null)
    if (!response?.ok) {
      notify('Event konnte nicht gelöscht werden.')
      return
    }
    setEvents((current) => current.filter((entry) => entry.id !== eventId))
    addAudit(`Event "${event.name}" wurde gelöscht.`)
    notify(`Event "${event.name}" wurde gelöscht.`)
  }

  const notify = (message: string, actionLabel?: string, onAction?: () => void) => {
    setToast({ message, actionLabel, onAction })
  }

  const login = async () => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: session.email, password: loginPassword }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.message || 'Login fehlgeschlagen. Prüfe E-Mail, Passwort und Serverstatus.')
      setSession({ email: data.user.email, name: data.user.name || '', profileNote: data.user.profileNote || '', role: normalizeRole(data.user.role), authenticated: true })
      setLoginPassword('')
      await loadRemoteData()
      notify('Anmeldung erfolgreich.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Anmeldung nicht möglich. Bitte Server und Zugangsdaten prüfen.')
    }
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined)
    setSession({ email: 'info@schellenberger.biz', name: '', profileNote: '', role: 'Helfer', authenticated: false })
    setCanCreateEvents(false)
    notify('Du bist abgemeldet.')
  }

  const addEvent = (data: EventFormValues) => {
    if (!session.authenticated) {
      notify('Bitte melde dich an, bevor du ein Event anlegst.')
      throw new Error('Login erforderlich.')
    }
    if (!canCreateEvents) {
      notify('Nur Admins dürfen neue Events erstellen.')
      throw new Error('Keine Berechtigung.')
    }
    const template = eventTemplates.find((entry) => entry.id === data.templateId)
    const memberId = uid()
    const templateActions = template?.actions.map((action) => ({
      id: uid(),
      title: action.title,
      category: action.category,
      owners: [],
      deadline: data.date || '',
      notes: '',
      tasks: action.tasks.map((task) => ({
        id: uid(),
        title: task,
        ownerIds: [],
        due: data.date || '',
        status: 'todo' as Status,
        notes: '',
        files: [],
        comments: [],
      })),
    })) || []
    const templateInfrastructureActions = (template?.infrastructure || [])
      .filter((item) => !templateActions.some((action) => action.title === item && action.category === 'Infrastruktur'))
      .map((item) => buildInfrastructureActionCard(item, data.date || '', memberId))
    const next: EventPlan = {
      id: uid(),
      name: data.name,
      motto: data.motto || template?.motto || 'Noch kein Motto',
      targetGroup: data.targetGroup || template?.targetGroup || 'Privater Kreis',
      guests: data.guests || template?.guests || 0,
      date: data.date || '',
      location: data.location || '',
      mapUrl: '',
      contact: '',
      photoUrl: '',
      archived: false,
      members: [{ id: memberId, name: session.name || 'Michael', email: session.email, role: 'Admin' }],
      actions: [...templateActions, ...templateInfrastructureActions],
      budget: template?.budget.map((line) => ({ ...line, id: uid() })) || [],
      infrastructure: template?.infrastructure || [],
      runsheet: template?.runsheet.map((item) => ({ ...item, id: uid() })) || [],
      actNotes: '',
      wiki: template?.wiki || [],
    }
    setEvents((current) => [next, ...current])
    addAudit(`Event "${next.name}" wurde angelegt.`)
    notify(`Event "${next.name}" wurde angelegt.`)
    secureFetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.event) {
          setEvents((current) => current.map((event) => (event.id === next.id ? normalizeEvent(data.event) : event)))
        }
      })
      .catch(() => undefined)
    return next
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/" aria-label="Eventlotse Start">
          <img className="brand-mark" src="/logo.png" alt="" />
          <span>
            <strong>Eventlotse</strong>
            <small>Selbst gehostete Eventplanung</small>
          </span>
        </Link>
        <nav className="app-nav" aria-label="Hauptnavigation">
          <Link to="/"><LayoutDashboard size={15} /> Dashboard</Link>
          {session.authenticated && <Link to="/profil"><UserCog size={15} /> Profil</Link>}
          {session.authenticated && session.role === 'Admin' && <Link to="/admin"><Settings size={15} /> Admin</Link>}
        </nav>
        <GlobalSearch events={session.authenticated ? events : []} />
        <AuthControl
          session={session}
          password={loginPassword}
          setPassword={setLoginPassword}
          setEmail={(email) => setSession({ ...session, email })}
          login={login}
          logout={logout}
        />
      </header>

      <main className="workspace dashboard-mode">
        <Routes>
          <Route path="/" element={<Dashboard events={events} templates={eventTemplates} session={session} canCreateEvents={canCreateEvents} addEvent={addEvent} notify={notify} />} />
          <Route
            path="/admin"
            element={
              session.authenticated && session.role === 'Admin' ? (
                <AdminPage
                  session={session}
                  settings={settings}
                  templates={eventTemplates}
                  auditLog={auditLog}
                  setSettings={setSettings}
                  setTemplates={setEventTemplates}
                  addAudit={addAudit}
                  notify={notify}
                />
              ) : (
                <AdminLocked />
              )
            }
          />
          <Route
            path="/events/:eventId"
            element={
              <EventRoute
                events={events}
                templates={eventTemplates}
                setTemplates={setEventTemplates}
                session={session}
                saveState={saveState}
                updateEvent={updateEvent}
                deleteEvent={deleteEvent}
                notify={notify}
              />
            }
          />
          <Route path="/profil" element={session.authenticated ? <ProfilePage session={session} setSession={setSession} notify={notify} /> : <LoginRequired />} />
          <Route path="/impressum" element={<LegalPage page="impressum" />} />
          <Route path="/datenschutz" element={<LegalPage page="datenschutz" />} />
          <Route path="/cookies" element={<LegalPage page="cookies" />} />
          <Route path="/invite/:token" element={<InvitePage notify={notify} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <Footer />
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}

function Dashboard({
  events,
  templates,
  session,
  canCreateEvents,
  addEvent,
  notify,
}: {
  events: EventPlan[]
  templates: EventTemplate[]
  session: { email: string; role: Role; authenticated: boolean }
  canCreateEvents: boolean
  addEvent: (data: EventFormValues) => EventPlan
  notify: (message: string, actionLabel?: string, onAction?: () => void) => void
}) {
  const navigate = useNavigate()
  const eventForm = useForm<EventFormInput, unknown, EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      templateId: '',
      name: '',
      motto: '',
      targetGroup: '',
      guests: 0,
      date: '',
      location: '',
    },
  })
  const userCount = new Set(events.flatMap((event) => event.members.map((member) => member.email))).size
  const locationCount = new Set(events.map((event) => event.location).filter(Boolean)).size
  const activeEvents = events.filter((event) => !event.archived)
  const archivedEvents = events.filter((event) => event.archived)
  const openTasks = activeEvents.reduce(
    (sum, event) => sum + event.actions.flatMap((action) => action.tasks).filter((task) => task.status !== 'done').length,
    0,
  )
  const eventWarnings = (event: EventPlan) => {
    const tasks = event.actions.flatMap((action) => action.tasks)
    const today = new Date().toISOString().slice(0, 10)
    return [
      ...(!event.location ? ['Ort fehlt'] : []),
      ...(tasks.some((task) => task.status !== 'done' && task.due && task.due < today) ? ['Überfällig'] : []),
      ...(tasks.some((task) => task.status !== 'done' && task.ownerIds.length === 0) ? ['Ohne Verantwortliche'] : []),
    ]
  }
  const submitEvent = (data: EventFormValues) => {
    const event = addEvent(data)
    eventForm.reset()
    notify(`Event "${event.name}" ist bereit. Ergänze jetzt Aufgaben oder Team.`, 'Event öffnen', () => navigate(`/events/${event.id}`))
  }

  if (!session.authenticated) {
    return <LoginRequired />
  }

  return (
    <section className="home-dashboard">
      <div className="home-hero">
        <div>
          <span className="eyebrow dark"><ShieldCheck size={14} /> Privates Event-Operations-Dashboard</span>
          <h1>Alle Veranstaltungen auf einen Blick.</h1>
          <p>
            Plane Aufbau, Abbau, Booking, Flyer, Budget, Infrastruktur und Zeitplan in einer selbst hostbaren App.
          </p>
          <p className="help-text">Frische Installationen starten leer. Lege zuerst ein Event an, danach öffnet sich der restliche Workflow.</p>
        </div>
        <div className="home-stats" aria-label="Dashboard Kennzahlen">
          <Stat icon={<CalendarDays />} label="Events" value={String(activeEvents.length)} />
          <Stat icon={<Users />} label="Nutzer" value={String(userCount)} />
          <Stat icon={<MapPin />} label="Orte" value={String(locationCount)} />
          <Stat icon={<KanbanSquare />} label="Offene Aufgaben" value={String(openTasks)} />
        </div>
      </div>

      <div className="home-layout">
        <section className="panel create-panel">
          <div className="section-head">
            <h2>Event erstellen</h2>
            <HelpHint text="Dieses Formular bleibt bewusst immer sichtbar, damit du jederzeit schnell ein neues Event anlegen kannst." />
          </div>
          {canCreateEvents ? (
            <p className="help-text">Diese Basisdaten reichen für die erste Eventkarte. Details wie Team, Infrastruktur und Ablauf ergänzt du später im Event.</p>
          ) : (
            <p className="help-text">Dein Konto darf aktuell keine neuen Events erstellen. Ein Admin kann dich zu Events einladen oder die Erstellung im Adminbereich freischalten.</p>
          )}
          <form onSubmit={eventForm.handleSubmit(submitEvent)} aria-disabled={!canCreateEvents}>
            <label className="field">
              <span>Vorlage</span>
              <select {...eventForm.register('templateId')} disabled={!canCreateEvents}>
                <option value="">Ohne Vorlage starten</option>
                {templates.map((template) => (
                  <option value={template.id} key={template.id}>{template.name}</option>
                ))}
              </select>
              <small className="help-text">Optional. Eine Vorlage füllt Aufgaben, Infrastruktur, Budget und Ablauf automatisch vor.</small>
            </label>
            <label className="field">
              <span>Eventname</span>
              <input placeholder="z.B. Hoffest, Geburtstag, Vereinsabend" disabled={!canCreateEvents} {...eventForm.register('name')} />
              {eventForm.formState.errors.name && <small className="form-error">{eventForm.formState.errors.name.message}</small>}
            </label>
            <label className="field">
              <span>Motto</span>
              <input placeholder="z.B. Akustikabend im Innenhof" disabled={!canCreateEvents} {...eventForm.register('motto')} />
              <small className="help-text">Optional. Eine kurze Beschreibung reicht völlig.</small>
            </label>
            <label className="field">
              <span>Zielgruppe</span>
              <input placeholder="z.B. Familie, Freunde, Nachbarschaft" disabled={!canCreateEvents} {...eventForm.register('targetGroup')} />
            </label>
            <div className="two-col">
              <label className="field">
                <span>Gäste grob geschätzt</span>
                <input type="number" min="0" placeholder="0" disabled={!canCreateEvents} {...eventForm.register('guests', { valueAsNumber: true })} />
              </label>
              <label className="field">
                <span>Datum</span>
                <input type="date" disabled={!canCreateEvents} {...eventForm.register('date')} />
              </label>
            </div>
            <label className="field">
              <span>Ort</span>
              <input placeholder="z.B. Alter Hof, Vereinsheim, Garten" disabled={!canCreateEvents} {...eventForm.register('location')} />
            </label>
            <button className="primary" type="submit" disabled={!canCreateEvents}><Plus size={16} /> Anlegen</button>
          </form>
        </section>

        <section className="event-overview">
          <div className="section-head">
            <div>
              <h2>Eventkarten</h2>
              <p className="help-text">Die Countdown-Farbe zeigt die Dringlichkeit: grün über 30 Tage, gelb 7 bis 30 Tage, rot unter 7 Tage.</p>
            </div>
          </div>
          {activeEvents.length === 0 ? (
            <EmptyState
              title="Noch keine Events"
              text="Lege dein erstes Event links im Akkordeon an. Danach erscheinen hier die Arbeitskarten."
            />
          ) : (
            <div className="event-card-grid">
              {activeEvents.map((event) => (
                <button className="event-card" key={event.id} onClick={() => navigate(`/events/${event.id}`)}>
                  <div className="event-card-topline">
                    <span className="event-date">{formatDate(event.date)}</span>
                    <CountdownBadge eventDate={event.date} />
                  </div>
                  <strong>{event.name}</strong>
                  <span>{event.motto}</span>
                  <dl>
                    <div>
                      <dt>Organisation</dt>
                      <dd>{event.members.length} Personen</dd>
                    </div>
                    <div>
                      <dt>Ort</dt>
                      <dd>{event.location || 'offen'}</dd>
                    </div>
                    <div>
                      <dt>Gäste</dt>
                      <dd>ca. {event.guests}</dd>
                    </div>
                  </dl>
                  {eventWarnings(event).length > 0 && (
                    <div className="event-warnings">
                      {eventWarnings(event).slice(0, 3).map((warning) => <span key={warning}>{warning}</span>)}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
          {archivedEvents.length > 0 && (
            <details className="archive-box">
              <summary><Archive size={16} /> Archivierte Events ({archivedEvents.length})</summary>
              <div className="event-card-grid compact">
                {archivedEvents.map((event) => (
                  <button className="event-card archived" key={event.id} onClick={() => navigate(`/events/${event.id}`)}>
                    <strong>{event.name}</strong>
                    <span>{formatDate(event.date)} · {event.location || 'Ort offen'}</span>
                  </button>
                ))}
              </div>
            </details>
          )}
        </section>
      </div>
    </section>
  )
}

function AuthControl({
  session,
  password,
  setPassword,
  setEmail,
  login,
  logout,
}: {
  session: { email: string; role: Role; authenticated: boolean }
  password: string
  setPassword: (password: string) => void
  setEmail: (email: string) => void
  login: () => void
  logout: () => void
}) {
  if (session.authenticated) {
    return (
      <div className="auth-status" aria-label="Angemeldeter Benutzer">
        <Lock size={14} />
        <span>{session.email}</span>
        <strong>{session.role}</strong>
        <button className="link-button" type="button" onClick={logout}>Logout</button>
      </div>
    )
  }

  return (
    <details className="auth-menu">
      <summary><Lock size={14} /> Anmelden</summary>
      <form
        className="auth-menu-panel"
        onSubmit={(event) => {
          event.preventDefault()
          login()
        }}
      >
        <label className="field">
          <span>E-Mail</span>
          <input aria-label="Login E-Mail" value={session.email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="field">
          <span>Passwort</span>
          <input
            aria-label="Passwort"
            type="password"
            placeholder="Passwort"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className="primary" type="submit">Anmelden</button>
        <p className="help-text">Adminfunktionen sind erst nach erfolgreicher Anmeldung sichtbar.</p>
      </form>
    </details>
  )
}

function AdminLocked() {
  return (
    <section className="panel">
      <div className="section-head">
        <h2>Adminbereich geschützt</h2>
        <ShieldCheck size={18} />
      </div>
      <p>Die Admin-Einstellungen sind nur für angemeldete Admin-Benutzer sichtbar.</p>
      <p className="help-text">Melde dich mit den Installationsdaten an. Danach kannst du das Passwort in der Adminseite ändern.</p>
    </section>
  )
}

function LoginRequired() {
  return (
    <section className="login-required">
      <div className="login-copy">
        <span className="eyebrow dark"><ShieldCheck size={14} /> Geschützter Eventlotse</span>
        <h1>Private Veranstaltungen sicher planen.</h1>
        <p>Eventlotse bündelt Event-Steckbrief, Aufgaben, Team, Infrastruktur, Ablaufplan, Budget, Dateien und Fotoalbum-Links in einer selbst gehosteten App.</p>
        <p className="help-text">Melde dich oben rechts an, um deine Veranstaltungen zu sehen oder ein neues Event anzulegen.</p>
      </div>
      <div className="login-feature-grid">
        <div><KanbanSquare size={18} /><strong>Aufgaben</strong><span>Kanban, Verantwortliche, Fälligkeiten und Dateien.</span></div>
        <div><Users size={18} /><strong>Team</strong><span>Einladungen, Rollen und Zugriff pro Event.</span></div>
        <div><Clock3 size={18} /><strong>Ablauf</strong><span>Zeitplan, Aufbau, Abbau und Programmpunkte.</span></div>
        <div><ShieldCheck size={18} /><strong>Self-Hosting</strong><span>PostgreSQL, Auditlog, SMTP und eigene Domain.</span></div>
      </div>
    </section>
  )
}

function ProfilePage({
  session,
  setSession,
  notify,
}: {
  session: { email: string; name?: string; profileNote?: string; role: Role; authenticated: boolean }
  setSession: (session: { email: string; name: string; profileNote: string; role: Role; authenticated: boolean }) => void
  notify: (message: string, actionLabel?: string, onAction?: () => void) => void
}) {
  const [passwordDraft, setPasswordDraft] = useState({ currentPassword: '', newPassword: '', repeatPassword: '' })
  const [profileDraft, setProfileDraft] = useState({ name: session.name || '', profileNote: session.profileNote || '' })

  const changePassword = async () => {
    if (passwordDraft.newPassword !== passwordDraft.repeatPassword) {
      notify('Die neuen Passwörter stimmen nicht überein.')
      return
    }
    try {
      const response = await secureFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordDraft.currentPassword,
          newPassword: passwordDraft.newPassword,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.message || 'Passwort konnte nicht geändert werden.')
      setPasswordDraft({ currentPassword: '', newPassword: '', repeatPassword: '' })
      notify('Passwort wurde geändert.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Passwort konnte nicht geändert werden.')
    }
  }

  const saveProfile = async () => {
    try {
      const response = await secureFetch('/api/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileDraft),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.message || 'Profil konnte nicht gespeichert werden.')
      setSession({ email: data.user.email, name: data.user.name || '', profileNote: data.user.profileNote || '', role: normalizeRole(data.user.role), authenticated: true })
      notify('Profil wurde gespeichert.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Profil konnte nicht gespeichert werden.')
    }
  }

  const deleteOwnAccount = async () => {
    if (session.role === 'Admin') {
      notify('Admin-Accounts können nicht im Profil gelöscht werden. Das schützt dich vor versehentlichem Aussperren.')
      return
    }
    if (!window.confirm('Eigenen Account wirklich löschen? Danach verlierst du den Zugriff auf deine Event-Einladungen.')) return
    const response = await secureFetch('/api/account', { method: 'DELETE' })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      notify(data?.message || 'Account konnte nicht gelöscht werden.')
      return
    }
    setSession({ email: 'info@schellenberger.biz', name: '', profileNote: '', role: 'Helfer', authenticated: false })
    notify('Dein Account wurde gelöscht.')
  }

  return (
    <section className="profile-page">
      <div className="panel">
        <div className="section-head">
          <div>
            <h2>Profil</h2>
            <p className="help-text">Dein persönlicher Zugang zu Eventlotse.</p>
          </div>
          <UserCog size={18} />
        </div>
        <div className="profile-summary">
          <span>E-Mail</span>
          <strong>{session.email}</strong>
          <span>Rolle</span>
          <strong>{session.role}</strong>
        </div>
        <div className="profile-edit-form">
          <label className="field">
            <span>Name</span>
            <input value={profileDraft.name} onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })} placeholder="Dein Name" />
          </label>
          <label className="field">
            <span>Funktion / Kommentar</span>
            <textarea value={profileDraft.profileNote} onChange={(event) => setProfileDraft({ ...profileDraft, profileNote: event.target.value })} placeholder="z.B. Technik, Bar, Aufbau, Ansprechpartner vor Ort" />
          </label>
          <button className="primary profile-save-button" type="button" onClick={saveProfile}><Save size={16} /> Profil speichern</button>
        </div>
      </div>
      <div className="panel">
        <div className="section-head">
          <h2>Passwort ändern</h2>
          <Lock size={18} />
        </div>
        <div className="admin-form">
          <label className="field">
            <span>Aktuelles Passwort</span>
            <input type="password" value={passwordDraft.currentPassword} onChange={(event) => setPasswordDraft({ ...passwordDraft, currentPassword: event.target.value })} />
          </label>
          <label className="field">
            <span>Neues Passwort</span>
            <input type="password" value={passwordDraft.newPassword} onChange={(event) => setPasswordDraft({ ...passwordDraft, newPassword: event.target.value })} />
          </label>
          <label className="field">
            <span>Neues Passwort wiederholen</span>
            <input type="password" value={passwordDraft.repeatPassword} onChange={(event) => setPasswordDraft({ ...passwordDraft, repeatPassword: event.target.value })} />
          </label>
          <button className="primary profile-save-button" type="button" onClick={changePassword}><Save size={16} /> Passwort speichern</button>
        </div>
      </div>
      <div className="panel">
        <div className="section-head">
          <div>
            <h2>Datenschutz</h2>
            <p className="help-text">Hier kannst du deine gespeicherten Accountdaten exportieren. Helfer können den eigenen Account löschen, Admins nutzen dafür bewusst die Server-Wartung.</p>
          </div>
          <ShieldCheck size={18} />
        </div>
        <div className="button-row left">
          <a className="ghost" href="/api/account/export"><Download size={16} /> Meine Daten exportieren</a>
          <button className="ghost danger" type="button" onClick={deleteOwnAccount} disabled={session.role === 'Admin'}><Trash2 size={16} /> Account löschen</button>
        </div>
      </div>
    </section>
  )
}

function InvitePage({ notify }: { notify: (message: string, actionLabel?: string, onAction?: () => void) => void }) {
  const { token } = useParams()
  const navigate = useNavigate()
  const [invite, setInvite] = useState<{ email: string; event?: { id: string; name: string; date?: string; location?: string } } | null>(null)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/invites/${token}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('Einladung ungültig.'))))
      .then(setInvite)
      .catch((failure) => setError(failure.message))
  }, [token])

  const acceptInvite = async () => {
    if (password !== repeat) {
      setError('Die Passwörter stimmen nicht überein.')
      return
    }
    const response = await fetch(`/api/invites/${token}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      setError(data?.message || 'Einladung konnte nicht angenommen werden.')
      return
    }
    notify('Einladung angenommen. Du bist jetzt angemeldet.')
    navigate(invite?.event?.id ? `/events/${invite.event.id}` : '/')
  }

  return (
    <section className="panel invite-page">
      <div className="section-head">
        <h2>Einladung annehmen</h2>
        <Mail size={18} />
      </div>
      {error && <p className="form-error">{error}</p>}
      {invite ? (
        <>
          <p>Du wurdest mit <strong>{invite.email}</strong>{invite.event ? ` zu "${invite.event.name}"` : ''} eingeladen.</p>
          <p className="help-text">Setze ein eigenes Passwort. Danach kannst du dich mit deiner E-Mail-Adresse anmelden.</p>
          <div className="admin-form">
            <label className="field">
              <span>Passwort</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <label className="field">
              <span>Passwort wiederholen</span>
              <input type="password" value={repeat} onChange={(event) => setRepeat(event.target.value)} />
            </label>
            <button className="primary" type="button" onClick={acceptInvite}>Einladung annehmen</button>
          </div>
        </>
      ) : !error ? (
        <p>Einladung wird geprüft...</p>
      ) : null}
    </section>
  )
}

function GlobalSearch({ events }: { events: EventPlan[] }) {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const search = query.trim().toLowerCase()
  const results = search.length < 2
    ? []
    : events.flatMap((event) => {
        const haystack = [
          event.name,
          event.motto,
          event.location,
          event.targetGroup,
          ...event.members.map((member) => `${member.name} ${member.email}`),
          ...event.actions.flatMap((action) => [action.title, ...action.tasks.map((task) => task.title)]),
        ].join(' ').toLowerCase()

        return haystack.includes(search)
          ? [{ id: event.id, title: event.name, detail: `${event.location || 'Ort offen'} · ${formatDate(event.date)}` }]
          : []
      }).slice(0, 6)

  return (
    <div className="global-search">
      <Search size={15} />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Suchen..." aria-label="Globale Suche" />
      {query && <button className="clear-search" onClick={() => setQuery('')} aria-label="Suche löschen"><X size={14} /></button>}
      {results.length > 0 && (
        <div className="search-results">
          {results.map((result) => (
            <button
              key={result.id}
              onClick={() => {
                navigate(`/events/${result.id}`)
                setQuery('')
              }}
            >
              <strong>{result.title}</strong>
              <span>{result.detail}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function EventRoute({
  events,
  templates,
  setTemplates,
  session,
  saveState,
  updateEvent,
  deleteEvent,
  notify,
}: {
  events: EventPlan[]
  templates: EventTemplate[]
  setTemplates: (templates: EventTemplate[]) => void
  session: { email: string; role: Role; authenticated: boolean }
  saveState: SaveState
  updateEvent: (event: EventPlan) => void
  deleteEvent: (eventId: string) => void
  notify: (message: string, actionLabel?: string, onAction?: () => void) => void
}) {
  const { eventId } = useParams()
  if (!session.authenticated) {
    return <LoginRequired />
  }
  const event = events.find((entry) => entry.id === eventId)

  if (!event) {
    return <Navigate to="/" replace />
  }

  return (
    <EventWorkspace
      event={event}
      templates={templates}
      setTemplates={setTemplates}
      session={session}
      saveState={saveState}
      updateEvent={updateEvent}
      deleteEvent={deleteEvent}
      notify={notify}
    />
  )
}

function MobileSetupPanel({ event }: { event: EventPlan }) {
  const openTasks = event.actions.flatMap((action) => action.tasks.filter((task) => task.status !== 'done'))
  const nextItems = event.runsheet.slice(0, 4)

  return (
    <section className="panel setup-panel">
      <div className="section-head">
        <h2>Mobile Aufbauansicht</h2>
        <Smartphone size={18} />
      </div>
      <div className="setup-grid">
        <div>
          <span className="muted">Jetzt wichtig</span>
          <strong>{openTasks.length} offene Aufgaben</strong>
          <p className="help-text">Reduzierte Ansicht für Aufbau, Abbau oder schlechte Netzverbindung vor Ort.</p>
          <p>{event.location || 'Ort offen'} · {event.contact || 'Kontakt offen'}</p>
        </div>
        <div>
          <span className="muted">Nächste Zeiten</span>
          {nextItems.length === 0 ? (
            <p>Noch kein Zeitplan.</p>
          ) : (
            <ul>
              {nextItems.map((item) => <li key={item.id}>{item.time} · {item.title} · {item.owner}</li>)}
            </ul>
          )}
        </div>
        <div>
          <span className="muted">Teamkontakte</span>
          <ul>
            {event.members.slice(0, 4).map((member) => <li key={member.id}>{member.name}: {member.email}</li>)}
          </ul>
        </div>
      </div>
    </section>
  )
}

function NextSteps({
  event,
  isAdmin,
  setActiveTab,
}: {
  event: EventPlan
  isAdmin: boolean
  setActiveTab: (tab: EventTab) => void
}) {
  const openTasks = event.actions.flatMap((action) => action.tasks).filter((task) => task.status !== 'done').length
  const steps = [
    {
      done: Boolean(event.date && event.location),
      label: event.date && event.location ? 'Datum und Ort sind gesetzt.' : 'Datum und Ort ergänzen.',
      tab: 'overview' as EventTab,
    },
    {
      done: event.actions.length > 0,
      label: event.actions.length > 0 ? `${event.actions.length} Arbeitsbereich(e) angelegt.` : 'Ein bis zwei passende Aktionen auswählen.',
      tab: 'tasks' as EventTab,
    },
    {
      done: event.members.length > 1,
      label: event.members.length > 1 ? `${event.members.length} Personen im Team.` : 'Mithelfer per E-Mail hinzufügen.',
      tab: 'team' as EventTab,
    },
    {
      done: openTasks > 0,
      label: openTasks > 0 ? `${openTasks} offene Aufgabe(n) sichtbar.` : 'Erste Unteraufgabe anlegen oder vorhandene Aufgabe umbenennen.',
      tab: 'tasks' as EventTab,
    },
  ]
  const nextOpenStep = steps.find((step) => !step.done)

  if (!isAdmin && !nextOpenStep) return null

  return (
    <section className="panel guidance-panel" aria-label="Nächste Schritte">
      <div>
        <strong>{nextOpenStep ? 'Nächster sinnvoller Schritt' : 'Grundsetup sieht gut aus'}</strong>
        <p className="help-text">
          {nextOpenStep
            ? 'Für kleine Veranstaltungen reichen oft Eventdaten, ein bis zwei Aktionen und eine verantwortliche Person.'
            : 'Du kannst jetzt Details ergänzen oder direkt mit Aufgaben arbeiten.'}
        </p>
      </div>
      <div className="step-list">
        {steps.map((step) => (
          <button className={step.done ? 'step-item done' : 'step-item'} key={step.label} onClick={() => setActiveTab(step.tab)} disabled={!isAdmin && !step.done}>
            {step.done ? <CheckCircle2 size={16} /> : <CircleHelp size={16} />}
            <span>{step.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function EventWorkspace({
  event,
  templates,
  setTemplates,
  session,
  saveState,
  updateEvent,
  deleteEvent,
  notify,
}: {
  event: EventPlan
  templates: EventTemplate[]
  setTemplates: (templates: EventTemplate[]) => void
  session: { email: string; role: Role }
  saveState: SaveState
  updateEvent: (event: EventPlan) => void
  deleteEvent: (eventId: string) => void
  notify: (message: string, actionLabel?: string, onAction?: () => void) => void
}) {
  const [newMember, setNewMember] = useState({ email: '', name: '', note: '' })
  const [budgetDraft, setBudgetDraft] = useState({ label: '', amount: '', type: 'expense' as 'income' | 'expense' })
  const [runDraft, setRunDraft] = useState({ time: '', title: '', owner: '' })
  const [wikiDraft, setWikiDraft] = useState('')
  const [activeTab, setActiveTab] = useState<EventTab>('overview')
  const [openActionId, setOpenActionId] = useState('')
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all')
  const [files, setFiles] = useState<StoredFile[]>([])
  const isAdmin = session.role === 'Admin'
  const currentMember = event.members.find((member) => member.email === session.email)
  const openTaskCount = event.actions.flatMap((action) => action.tasks).filter((task) => task.status !== 'done').length
  const activeActionId = event.actions.some((action) => action.id === openActionId) ? openActionId : event.actions[0]?.id || ''

  const totals = useMemo(() => {
    return event.budget.reduce(
      (sum, line) => {
        sum[line.type] += line.amount
        return sum
      },
      { income: 0, expense: 0 },
    )
  }, [event.budget])

  useEffect(() => {
    fetch(`/api/events/${event.id}/files`, { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : { files: [] }))
      .then((data) => setFiles(data.files || []))
      .catch(() => setFiles([]))
  }, [event.id])

  const addAction = (title: string, category: string) => {
    if (event.actions.some((action) => action.title === title)) return
    const nextAction: ActionCard = {
      id: uid(),
      title,
      category,
      owners: currentMember ? [currentMember.id] : [],
      deadline: event.date,
      notes: '',
      tasks: [
        {
          id: uid(),
          title: `${title} planen`,
          ownerIds: currentMember ? [currentMember.id] : [],
          due: event.date,
          status: 'todo',
          notes: '',
          files: [],
          comments: ['Karte angelegt. Verantwortliche und Details ergänzen.'],
        },
      ],
    }
    updateEvent({
      ...event,
      actions: [...event.actions, nextAction],
    })
    setOpenActionId(nextAction.id)
    notify(`Aktion "${title}" wurde hinzugefügt.`)
  }

  const addMember = async () => {
    if (!newMember.email.trim()) return
    const email = newMember.email.trim()
    try {
      const response = await secureFetch(`/api/events/${event.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: newMember.name, note: newMember.note, role: 'Helfer' }),
      })
      if (response.ok) {
        const data = await response.json()
        updateEvent(data.event)
        setNewMember({ email: '', name: '', note: '' })
        notify(`Einladung an ${email} wurde versendet.`)
        return
      }
    } catch {
      // Fallback für lokale Entwicklung ohne Backend.
    }
    updateEvent({
      ...event,
      members: [
        ...event.members,
        {
          id: uid(),
          name: newMember.name.trim() || email.split('@')[0],
          email,
          role: 'Helfer',
          note: newMember.note.trim(),
        },
      ],
    })
    setNewMember({ email: '', name: '', note: '' })
    notify(`${email} wurde lokal zum Event-Team hinzugefügt. Einladungsmails brauchen den Server.`)
  }

  const removeMember = async (member: Member) => {
    if (member.role === 'Admin') {
      notify('Event-Admins können nicht aus dem Team entfernt werden.')
      return
    }
    try {
      const response = await secureFetch(`/api/events/${event.id}/members/${member.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.message || 'Mitglied konnte nicht entfernt werden.')
      updateEvent(data.event)
      notify(`${member.name || member.email} wurde aus diesem Event entfernt.`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Mitglied konnte nicht entfernt werden.')
    }
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(event, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${event.name.toLowerCase().replaceAll(' ', '-')}-eventlotse.json`
    link.click()
    URL.revokeObjectURL(url)
    notify('Export wurde erstellt.')
  }

  const saveEventAsTemplate = async () => {
    if (!isAdmin) {
      notify('Nur Admins können Event-Vorlagen speichern.')
      return
    }
    const template: EventTemplate = {
      id: `template-${slugify(event.name)}-${Date.now()}`,
      name: `${event.name} Vorlage`,
      description: `Aus dem Event "${event.name}" gespeichert.`,
      motto: event.motto,
      targetGroup: event.targetGroup,
      guests: event.guests,
      actions: event.actions.map((action) => ({
        title: action.title,
        category: action.category,
        tasks: action.tasks.map((task) => task.title).filter(Boolean),
      })),
      infrastructure: event.infrastructure,
      runsheet: event.runsheet.map((item) => ({ time: item.time, title: item.title, owner: item.owner })),
      budget: event.budget.map((line) => ({ label: line.label, type: line.type, amount: line.amount })),
      wiki: event.wiki,
    }
    const nextTemplates = [template, ...templates.filter((entry) => entry.id !== template.id)]
    try {
      const response = await secureFetch('/api/admin/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates: nextTemplates }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => null)
        throw new Error(error?.message || 'Vorlage konnte nicht gespeichert werden.')
      }
      const data = await response.json()
      setTemplates(normalizeTemplates(data.templates || nextTemplates))
      notify('Event wurde als Vorlage gespeichert.')
    } catch (error) {
      setTemplates(nextTemplates)
      notify(error instanceof Error ? error.message : 'Vorlage wurde lokal gespeichert.')
    }
  }

  const deleteFile = async (fileId: string) => {
    const response = await secureFetch(`/api/files/${fileId}`, { method: 'DELETE' })
    if (!response.ok) {
      notify('Datei konnte nicht gelöscht werden.')
      return
    }
    setFiles((current) => current.filter((file) => file.id !== fileId))
    notify('Datei wurde gelöscht.')
  }

  const addBudgetLine = () => {
    if (!budgetDraft.label.trim()) return
    updateEvent({
      ...event,
      budget: [
        ...event.budget,
        {
          id: uid(),
          label: budgetDraft.label.trim(),
          type: budgetDraft.type,
          amount: Number(budgetDraft.amount || 0),
        },
      ],
    })
    setBudgetDraft({ label: '', amount: '', type: 'expense' })
    notify('Budgetzeile wurde ergänzt.')
  }

  const addRunItem = () => {
    if (!runDraft.time || !runDraft.title.trim()) return
    updateEvent({
      ...event,
      runsheet: [...event.runsheet, { id: uid(), time: runDraft.time, title: runDraft.title.trim(), owner: runDraft.owner.trim() || 'offen' }]
        .sort((a, b) => a.time.localeCompare(b.time)),
    })
    setRunDraft({ time: '', title: '', owner: '' })
    notify('Ablaufpunkt wurde ergänzt.')
  }

  const updateRunItem = (itemId: string, patch: Partial<RunItem>) => {
    updateEvent({
      ...event,
      runsheet: event.runsheet.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    })
  }

  const moveRunItem = (itemId: string, direction: -1 | 1) => {
    const index = event.runsheet.findIndex((item) => item.id === itemId)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= event.runsheet.length) return
    const nextRunsheet = [...event.runsheet]
    const [item] = nextRunsheet.splice(index, 1)
    nextRunsheet.splice(targetIndex, 0, item)
    updateEvent({ ...event, runsheet: nextRunsheet })
  }

  const deleteRunItem = (itemId: string) => {
    updateEvent({ ...event, runsheet: event.runsheet.filter((item) => item.id !== itemId) })
    notify('Ablaufpunkt wurde gelöscht.')
  }

  const addWikiEntry = () => {
    if (!wikiDraft.trim()) return
    updateEvent({ ...event, wiki: [...event.wiki, wikiDraft.trim()] })
    setWikiDraft('')
    notify('Wiki-Notiz wurde ergänzt.')
  }

  const archiveEvent = () => {
    updateEvent({ ...event, archived: !event.archived })
    notify(event.archived ? 'Event wurde wieder aktiviert.' : 'Event wurde archiviert.')
  }

  const removeEvent = () => {
    if (!window.confirm(`Event "${event.name}" wirklich dauerhaft löschen?`)) return
    deleteEvent(event.id)
  }

  const infrastructureActionFor = (item: string) => event.actions.find((action) => action.title === item && action.category === 'Infrastruktur')

  const toggleInfrastructure = (item: string, checked: boolean) => {
    const actionExists = Boolean(infrastructureActionFor(item))
    const newAction = checked && !actionExists ? buildInfrastructureActionCard(item, event.date, currentMember?.id || '') : null
    updateEvent({
      ...event,
      infrastructure: checked
        ? [...event.infrastructure.filter((entry) => entry !== item), item]
        : event.infrastructure.filter((entry) => entry !== item),
      actions: newAction ? [...event.actions, newAction] : event.actions,
    })
    if (checked && !actionExists) {
      setActiveTab('tasks')
      setOpenActionId(newAction?.id || '')
      notify(`Aufgabenpaket "${item}" wurde im Aufgaben-Tab angelegt.`)
    } else if (!checked && actionExists) {
      notify(`"${item}" ist nicht mehr als Bedarf markiert. Bereits angelegte Aufgaben bleiben erhalten.`)
    }
  }

  const updateInfrastructureOwner = (item: string, ownerId: string) => {
    const existingAction = infrastructureActionFor(item)
    const nextAction = existingAction
      ? { ...existingAction, owners: ownerId ? [ownerId] : [] }
      : buildInfrastructureActionCard(item, event.date, ownerId)
    updateEvent({
      ...event,
      infrastructure: [...event.infrastructure.filter((entry) => entry !== item), item],
      actions: existingAction
        ? event.actions.map((action) => (action.id === existingAction.id ? nextAction : action))
        : [...event.actions, nextAction],
    })
    notify(`Hauptverantwortung für "${item}" wurde aktualisiert.`)
  }

  return (
    <section className="event-workspace">
      <Link className="ghost back-button" to="/">Zurück zum Dashboard</Link>
      <div className="event-hero">
        <div>
          <span className="eyebrow"><CalendarDays size={14} /> {formatDate(event.date)}</span>
          <h1>{event.name}</h1>
          <p>{event.motto}</p>
          <span className={`save-state ${saveState}`}>{saveStateLabel(saveState)}</span>
        </div>
        <div className="hero-stats" aria-label="Event Kennzahlen">
          <Stat icon={<Users />} label="Gäste" value={String(event.guests)} />
          <Stat icon={<MapPin />} label="Ort" value={event.location || 'offen'} />
          <Stat icon={<ShieldCheck />} label="Rolle" value={session.role} />
        </div>
      </div>
      {isAdmin && (
        <div className="event-admin-actions">
          <button className="ghost" type="button" onClick={archiveEvent}>
            <Archive size={16} /> {event.archived ? 'Reaktivieren' : 'Archivieren'}
          </button>
          <button className="ghost danger" type="button" onClick={removeEvent}>
            <Trash2 size={16} /> Löschen
          </button>
        </div>
      )}

      <NextSteps event={event} isAdmin={isAdmin} setActiveTab={setActiveTab} />

      <div className="event-tabs" role="tablist" aria-label="Eventbereiche">
        <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>Übersicht</button>
        <button className={activeTab === 'tasks' ? 'active' : ''} onClick={() => setActiveTab('tasks')}>Aufgaben <span>{openTaskCount}</span></button>
        <button className={activeTab === 'team' ? 'active' : ''} onClick={() => setActiveTab('team')}>Team</button>
        <button className={activeTab === 'infrastructure' ? 'active' : ''} onClick={() => setActiveTab('infrastructure')}>Infrastruktur</button>
        <button className={activeTab === 'schedule' ? 'active' : ''} onClick={() => setActiveTab('schedule')}>Ablauf</button>
      </div>

      {activeTab === 'overview' && (
        <div className="dashboard-grid">
          <section className="panel span-2">
            <div className="section-head">
              <div className="title-with-help">
                <h2>Event-Steckbrief</h2>
                <HelpHint text="Der Steckbrief ist die gemeinsame Orientierung: Motto, Zielgruppe, Lageplan und Kontakt vor Ort." />
              </div>
              <div className="button-row">
                <details className="export-menu">
                  <summary className="ghost"><Download size={16} /> Export <ChevronDown size={15} /></summary>
                  <div className="export-menu-panel">
                    <a href={`/api/events/${event.id}/calendar.ics`}><CalendarDays size={16} /> Kalenderdatei iCal</a>
                    <a href={`/api/events/${event.id}/export/tasks.csv`}><Download size={16} /> Aufgaben als CSV</a>
                    <a href={`/api/events/${event.id}/export/tasks.xlsx`}><Download size={16} /> Aufgaben als Excel</a>
                    <a href={`/api/events/${event.id}/export/runsheet.pdf`}><FileText size={16} /> Zeitplan als PDF</a>
                    <button type="button" onClick={exportJson}><Download size={16} /> Event als JSON</button>
                  </div>
                </details>
                {isAdmin && <button className="ghost" type="button" onClick={saveEventAsTemplate}><Save size={16} /> Als Vorlage speichern</button>}
              </div>
            </div>
            <div className="profile-grid">
              <EditableField label="Motto" help="Kurzer Arbeitstitel oder Leitidee, damit alle wissen, worum es geht." value={event.motto} onChange={(motto) => updateEvent({ ...event, motto })} disabled={!isAdmin} />
              <EditableField label="Zielgruppe" help="Wer soll kommen? Zum Beispiel Familie, Nachbarschaft, Vereinsmitglieder oder eingeladene Gäste." value={event.targetGroup} onChange={(targetGroup) => updateEvent({ ...event, targetGroup })} disabled={!isAdmin} />
              <EditableField label="Karten-Link" help="Link zu Google Maps, Apple Karten oder einem Lageplan." value={event.mapUrl} onChange={(mapUrl) => updateEvent({ ...event, mapUrl })} disabled={!isAdmin} />
              <EditableField label="Kontakt vor Ort" help="Person, Telefonnummer oder Hinweis für Schlüssel, Zugang und Strom." value={event.contact} onChange={(contact) => updateEvent({ ...event, contact })} disabled={!isAdmin} />
              <EditableField label="Fotoalbum-Link" help="Link zu Nextcloud, Dropbox, Google Fotos oder einem Ordner, in dem Fotos während und nach dem Event gesammelt werden." value={event.photoUrl} onChange={(photoUrl) => updateEvent({ ...event, photoUrl })} disabled={!isAdmin} />
            </div>
            {event.photoUrl && <a className="ghost album-link" href={event.photoUrl} target="_blank" rel="noreferrer">Fotoalbum öffnen</a>}
          </section>

          <section className="panel">
            <div className="section-head">
              <h2>Budget</h2>
              <HelpHint text="Schnelle Übersicht aus Einnahmen minus Ausgaben. Für kleine Events reichen wenige Zeilen." />
            </div>
            <div className="budget-total">
              <Euro size={18} />
              <strong>{(totals.income - totals.expense).toLocaleString('de-DE')} EUR</strong>
            </div>
            <p className="muted">Einnahmen {totals.income} EUR · Ausgaben {totals.expense} EUR</p>
            <div className="compact-list">
              {event.budget.map((line) => <span key={line.id}>{line.type === 'income' ? '+' : '-'} {line.label}: {line.amount.toLocaleString('de-DE')} EUR</span>)}
            </div>
            {isAdmin && (
              <div className="quick-entry">
                <input value={budgetDraft.label} onChange={(change) => setBudgetDraft({ ...budgetDraft, label: change.target.value })} placeholder="z.B. GEMA, Getränke, Spenden" />
                <input type="number" value={budgetDraft.amount} onChange={(change) => setBudgetDraft({ ...budgetDraft, amount: change.target.value })} placeholder="Betrag" />
                <select value={budgetDraft.type} onChange={(change) => setBudgetDraft({ ...budgetDraft, type: change.target.value as 'income' | 'expense' })}>
                  <option value="expense">Ausgabe</option>
                  <option value="income">Einnahme</option>
                </select>
                <button className="ghost" type="button" onClick={addBudgetLine}><Plus size={16} /> Hinzufügen</button>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="section-head">
              <h2>Benachrichtigungen</h2>
              <HelpHint text="Noch lokale Hinweise. E-Mail- und Push-Erinnerungen werden mit Backend/SMTP aktiviert." />
            </div>
            <ul className="notification-list">
              <li><Bell size={15} /> Flyer-Druck 14 Tage vor Event prüfen.</li>
              <li><Clock3 size={15} /> {event.runsheet.length} Punkte im Zeitplan.</li>
            </ul>
          </section>
        </div>
      )}

      {activeTab === 'tasks' && (
        <section className="action-section">
          <details className="panel accordion-panel" open={event.actions.length === 0}>
            <summary className="action-picker-summary">
              <span><Plus size={17} /> Aktionen hinzufügen</span>
              <small>Aufklappen und passende Arbeitsbereiche auswählen</small>
            </summary>
            <p className="help-text">Aktionen sind große Arbeitsbereiche wie Aufbau, Musik oder Catering. Du aktivierst nur, was dieses Event wirklich braucht.</p>
            <div className="template-grid">
              {actionTemplates.map(({ title, category, help }) => {
                const active = event.actions.some((action) => action.title === title)
                return (
                  <button className={active ? 'template active' : 'template'} key={title} onClick={() => addAction(title, category)} disabled={!isAdmin} title={help}>
                    <Check size={16} />
                    <span>{title}</span>
                    <small>{category}</small>
                    <em>{help}</em>
                  </button>
                )
              })}
            </div>
          </details>

          {event.actions.length === 0 ? (
            <EmptyState
              title="Noch keine Aktionen"
              text="Wähle oben passende Aktionskarten aus. Danach entsteht hier dein Aufgaben-Dashboard."
            />
          ) : (
            <>
              <div className="task-filter-bar" aria-label="Aufgabenfilter">
                {([
                  ['all', 'Alle'],
                  ['open', 'Offen'],
                  ['overdue', 'Überfällig'],
                  ['mine', 'Meine'],
                  ['unassigned', 'Ohne Verantwortliche'],
                ] as [TaskFilter, string][]).map(([value, label]) => (
                  <button key={value} className={taskFilter === value ? 'active' : ''} type="button" onClick={() => setTaskFilter(value)}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="action-stack">
                {event.actions.map((action) => (
                  <section className={activeActionId === action.id ? 'action-accordion open' : 'action-accordion'} key={action.id}>
                    <button className="action-accordion-head" type="button" onClick={() => setOpenActionId(action.id)} aria-expanded={activeActionId === action.id}>
                      <span>
                        <strong>{action.title}</strong>
                        <small>{action.category}</small>
                      </span>
                      <span className="action-accordion-meta">
                        {action.tasks.filter((task) => task.status !== 'done').length} offen · {action.tasks.length} gesamt
                        <ChevronDown size={18} />
                      </span>
                    </button>
                    {activeActionId === action.id && (
                      <ActionBoard
                        eventId={event.id}
                        action={action}
                        members={event.members}
                        currentMemberId={currentMember?.id || ''}
                        taskFilter={taskFilter}
                        canEdit={
                          isAdmin
                          || action.owners.some((owner) => owner === currentMember?.id)
                          || action.tasks.some((task) => currentMember?.id && task.ownerIds.includes(currentMember.id))
                        }
                        notify={notify}
                        updateAction={(next) =>
                          updateEvent({
                            ...event,
                            actions: event.actions.map((entry) => (entry.id === action.id ? next : entry)),
                          })
                        }
                      />
                    )}
                  </section>
                ))}
              </div>
            </>
          )}
          <FileManager files={files} onDelete={deleteFile} />
        </section>
      )}

      {activeTab === 'team' && (
        <div className="dashboard-grid">
          <section className="panel span-2">
            <div className="section-head">
              <h2>Team</h2>
              <HelpHint text="Personen mit Zugriff auf dieses Event. Teammitglieder können danach Aufgaben übernehmen und ihre Profildaten selbst pflegen." />
              <Mail size={18} />
            </div>
            <div className="member-list">
              {event.members.map((member) => (
                <span className="member-pill member-pill-wide" key={member.id}>
                  <b>{member.name.slice(0, 2).toUpperCase()}</b>
                  <span><strong>{member.name || member.email}</strong><small>{member.email}{member.note ? ` · ${member.note}` : ''}</small></span>
                  {isAdmin && member.role !== 'Admin' && (
                    <button className="icon-button danger" type="button" onClick={() => removeMember(member)} aria-label={`${member.email} entfernen`}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {isAdmin && (
              <div className="team-add-form">
                <input value={newMember.name} onChange={(change) => setNewMember({ ...newMember, name: change.target.value })} placeholder="Name, z.B. Anna Müller" />
                <input value={newMember.email} onChange={(change) => setNewMember({ ...newMember, email: change.target.value })} placeholder="helfer@email.de" />
                <input value={newMember.note} onChange={(change) => setNewMember({ ...newMember, note: change.target.value })} placeholder="Funktion/Bemerkung, z.B. Bar, Aufbau, Technik" />
                <button className="icon-button" onClick={addMember} aria-label="Mithelfer hinzufügen"><Plus size={18} /></button>
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'infrastructure' && (
        <div className="dashboard-grid">
          <section className="panel span-2">
            <div className="section-head">
              <div>
                <h2>Infrastruktur-Checkliste</h2>
                <p className="help-text">Hier markierst du, was für dieses Event gebraucht wird. Die Haken sind keine erledigten Aufgaben, sondern eine Bedarfsliste: Daraus erkennst du, worum sich jemand kümmern muss.</p>
              </div>
            </div>
            <div className="info-strip">
              <strong>So nutzt du die Liste:</strong>
              <span>Beim Anhaken legt Eventlotse automatisch ein Aufgabenpaket unter Aufgaben an. Die Hauptverantwortung gilt für die Gruppe; einzelne Unteraufgaben können später abweichend verteilt werden.</span>
            </div>
            <div className="check-grid">
              {infrastructureOptions.map((item) => {
                const selected = event.infrastructure.includes(item)
                const action = infrastructureActionFor(item)
                return (
                  <div className={selected ? 'infrastructure-item selected' : 'infrastructure-item'} key={item}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(change) => toggleInfrastructure(item, change.target.checked)}
                        disabled={!isAdmin}
                      />
                      <span>
                        <strong>{item}</strong>
                        <small>{infrastructureTaskTemplates[item]?.slice(0, 2).join(' · ')}</small>
                      </span>
                    </label>
                    <select
                      value={action?.owners[0] || ''}
                      onChange={(change) => updateInfrastructureOwner(item, change.target.value)}
                      disabled={!isAdmin}
                      aria-label={`Hauptverantwortung für ${item}`}
                    >
                      <option value="">Hauptverantwortung offen</option>
                      {event.members.map((member) => <option value={member.id} key={member.id}>{member.name || member.email}</option>)}
                    </select>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'schedule' && (
        <>
          <MobileSetupPanel event={event} />
          <section className="lower-grid">
            <section className="panel span-2">
              <div className="section-head">
                <div>
                  <h2>Zeitplan</h2>
                  <p className="help-text">Minutengenauer Tagesplan: Aufbau, Soundcheck, Einlass, Programmpunkte und Abbau. Du kannst Zeilen direkt bearbeiten, sortieren, löschen oder als PDF speichern.</p>
                </div>
                <div className="button-row">
                  <button className="ghost" type="button" onClick={() => window.print()}><Printer size={16} /> Drucken</button>
                  <a className="ghost" href={`/api/events/${event.id}/export/runsheet.pdf`}><FileText size={16} /> PDF speichern</a>
                  <ClipboardList size={18} />
                </div>
              </div>
              {event.runsheet.length === 0 ? (
                <EmptyState title="Noch kein Ablaufplan" text="Lege die wichtigsten Zeiten für Aufbau, Einlass, Programmpunkte und Abbau an." />
              ) : (
                <div className="runsheet-editor">
                  {event.runsheet.map((item, index) => (
                    <div className="runsheet-row" key={item.id}>
                      <input type="time" value={item.time} onChange={(change) => updateRunItem(item.id, { time: change.target.value })} disabled={!isAdmin} />
                      <input value={item.title} onChange={(change) => updateRunItem(item.id, { title: change.target.value })} placeholder="Programmpunkt" disabled={!isAdmin} />
                      <input value={item.owner} onChange={(change) => updateRunItem(item.id, { owner: change.target.value })} placeholder="Verantwortlich" disabled={!isAdmin} />
                      <div className="row-actions">
                        <button className="icon-button" type="button" onClick={() => moveRunItem(item.id, -1)} disabled={!isAdmin || index === 0} aria-label="Nach oben"><ArrowUp size={15} /></button>
                        <button className="icon-button" type="button" onClick={() => moveRunItem(item.id, 1)} disabled={!isAdmin || index === event.runsheet.length - 1} aria-label="Nach unten"><ArrowDown size={15} /></button>
                        <button className="icon-button danger" type="button" onClick={() => deleteRunItem(item.id)} disabled={!isAdmin} aria-label="Ablaufpunkt löschen"><Trash2 size={15} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="panel">
              <div className="section-head">
                <h2>Ablauf ergänzen</h2>
                <Clock3 size={18} />
              </div>
              <div className="quick-entry">
                <input type="time" value={runDraft.time} onChange={(change) => setRunDraft({ ...runDraft, time: change.target.value })} />
                <input value={runDraft.title} onChange={(change) => setRunDraft({ ...runDraft, title: change.target.value })} placeholder="z.B. Aufbau, Einlass, Abbau" />
                <input value={runDraft.owner} onChange={(change) => setRunDraft({ ...runDraft, owner: change.target.value })} placeholder="Wer?" />
                <button className="ghost" type="button" onClick={addRunItem}><Plus size={16} /> Hinzufügen</button>
              </div>
            </section>
            <section className="panel">
              <div className="section-head">
                <div>
                  <h2>Programmpunkte & Booking</h2>
                  <p className="help-text">Für DJs, Bands, Redner oder andere Programmpunkte: Kontakt, Gage, Ankunft, Technikbedarf und Absprachen.</p>
                </div>
                <Music size={18} />
              </div>
              <textarea
                value={event.actNotes}
                onChange={(change) => updateEvent({ ...event, actNotes: change.target.value })}
                placeholder={`Beispiel:
Amaya Luna
Kontakt: amaya@example.de
Gage: 300 EUR
Ankunft: 18:30 Uhr
Technik: 2x XLR, Monitor, Strom
Absprachen: 45 Minuten Set, Rechnung folgt`}
                disabled={!isAdmin}
              />
            </section>
            <InfoPanel icon={<FileText />} title="Wiki" help="Gemeinsames Wissen: Protokolle, Anleitungen, Lessons Learned und wiederkehrende Abläufe." items={event.wiki} emptyText="Noch keine Notizen. Sammle hier Lessons Learned, Anleitungen und Protokolle." />
            <section className="panel">
              <div className="section-head">
                <h2>Wiki-Notiz</h2>
                <FileText size={18} />
              </div>
              <div className="quick-entry">
                <input value={wikiDraft} onChange={(change) => setWikiDraft(change.target.value)} placeholder="z.B. Schlüssel liegt bei Anna" />
                <button className="ghost" type="button" onClick={addWikiEntry}><Plus size={16} /> Hinzufügen</button>
              </div>
            </section>
          </section>
        </>
      )}
    </section>
  )
}

function AdminPage({
  session,
  settings,
  templates,
  auditLog,
  setSettings,
  setTemplates,
  addAudit,
  notify,
}: {
  session: { email: string; role: Role; authenticated: boolean }
  settings: AppSettings
  templates: EventTemplate[]
  auditLog: AuditEntry[]
  setSettings: (next: AppSettings | ((current: AppSettings) => AppSettings)) => void
  setTemplates: (next: EventTemplate[] | ((current: EventTemplate[]) => EventTemplate[])) => void
  addAudit: (action: string) => void
  notify: (message: string, actionLabel?: string, onAction?: () => void) => void
}) {
  const [toast, setToast] = useState<ToastState>(null)
  const [testMailTo, setTestMailTo] = useState(settings.smtpUser || 'info@schellenberger.biz')
  const [testMailPending, setTestMailPending] = useState(false)
  const [passwordDraft, setPasswordDraft] = useState({ currentPassword: '', newPassword: '', repeatPassword: '' })
  const [templateJson, setTemplateJson] = useState('')
  const settingsForm = useForm<SettingsFormInput, unknown, SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: settings,
  })

  const saveSettings = async (data: SettingsFormValues) => {
    const nextSettings = { ...data, smtpPass: data.smtpPass ? '********' : settings.smtpPass, eventTemplates: templates }
    setSettings(nextSettings)
    addAudit('Systemeinstellungen wurden gespeichert.')
    try {
      const response = await secureFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.message || 'Systemeinstellungen konnten nicht gespeichert werden.')
      setSettings(result.settings)
      settingsForm.reset({ ...result.settings, smtpPass: '' })
      notify('Systemeinstellungen wurden gespeichert.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Systemeinstellungen konnten nicht gespeichert werden.')
    }
  }

  const sendTestMail = async () => {
    setTestMailPending(true)
    try {
      const response = await secureFetch('/api/admin/test-mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testMailTo }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => null)
        throw new Error(error?.message || 'Testmail konnte nicht versendet werden.')
      }
      notify(`Testmail an "${testMailTo}" wurde versendet.`)
      addAudit(`Testmail an "${testMailTo}" wurde versendet.`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Testmail konnte nicht gesendet werden.')
    } finally {
      setTestMailPending(false)
    }
  }

  const saveTemplates = async (nextTemplates: EventTemplate[], message = 'Event-Vorlagen wurden gespeichert.') => {
    const normalized = normalizeTemplates(nextTemplates)
    setTemplates(normalized)
    setSettings((current) => ({ ...current, eventTemplates: normalized }))
    try {
      const response = await secureFetch('/api/admin/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates: normalized }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.message || 'Event-Vorlagen konnten nicht gespeichert werden.')
      setTemplates(normalizeTemplates(result.templates))
      addAudit('Event-Vorlagen wurden gespeichert.')
      notify(message)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Event-Vorlagen konnten nicht gespeichert werden.')
    }
  }

  const editTemplateAsJson = (template: EventTemplate) => {
    setTemplateJson(JSON.stringify(template, null, 2))
    notify(`Vorlage "${template.name}" liegt unten als JSON zum Bearbeiten bereit.`)
  }

  const saveTemplateJson = () => {
    try {
      const parsed = JSON.parse(templateJson)
      const imported = normalizeTemplates(Array.isArray(parsed) ? parsed : [parsed])
      const nextTemplates = imported.reduce((current, template) => {
        const existing = current.findIndex((entry) => entry.id === template.id)
        if (existing >= 0) {
          return current.map((entry) => (entry.id === template.id ? template : entry))
        }
        return [...current, template]
      }, templates)
      saveTemplates(nextTemplates, `${imported.length} Vorlage(n) importiert oder aktualisiert.`)
      setTemplateJson('')
    } catch {
      notify('JSON konnte nicht gelesen werden. Bitte Format prüfen.')
    }
  }

  const exportTemplates = (selectedTemplates: EventTemplate[]) => {
    const blob = new Blob([JSON.stringify(selectedTemplates, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = selectedTemplates.length === 1 ? `${selectedTemplates[0].id}.json` : 'eventlotse-templates.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const importTemplateFile = async (file: File | undefined) => {
    if (!file) return
    try {
      setTemplateJson(await file.text())
      notify('Template-Datei geladen. Prüfe den JSON-Text und speichere ihn danach.')
    } catch {
      notify('Template-Datei konnte nicht gelesen werden.')
    }
  }

  const changeOwnPassword = async () => {
    if (passwordDraft.newPassword !== passwordDraft.repeatPassword) {
      notify('Die neuen Passwörter stimmen nicht überein.')
      return
    }
    try {
      const response = await secureFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordDraft.currentPassword,
          newPassword: passwordDraft.newPassword,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.message || 'Passwort konnte nicht geändert werden.')
      setPasswordDraft({ currentPassword: '', newPassword: '', repeatPassword: '' })
      notify('Passwort wurde geändert.')
      addAudit(`Admin "${session.email}" hat das eigene Passwort geändert.`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Passwort konnte nicht geändert werden.')
    }
  }

  const runReminders = async () => {
    const response = await secureFetch('/api/admin/reminders/run', { method: 'POST' })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      notify(data?.message || 'Erinnerungen konnten nicht gesendet werden.')
      return
    }
    notify(`${data.sent?.length || 0} Erinnerungsmails wurden gesendet.`)
  }

  return (
    <section className="admin-page">
      <div className="admin-hero">
        <div>
          <span className="eyebrow dark"><Settings size={14} /> Administration</span>
          <h1>System, Mail und Vorlagen verwalten.</h1>
          <p>Konfiguriere SMTP, Base URL, Template Store und prüfe Änderungen im Auditlog.</p>
          <p className="help-text">Diese Einstellungen brauchst du meist nur beim Setup oder bei Wartung. Deshalb bleiben technische Bereiche als Akkordeon kompakt.</p>
        </div>
        <div className="admin-summary">
          <Stat icon={<Users />} label="Event-Teams" value="pro Event" />
          <Stat icon={<ShieldCheck />} label="Zugriff" value="Einladung" />
          <Stat icon={<Server />} label="SMTP" value={settings.smtpHost ? 'bereit' : 'offen'} />
        </div>
      </div>

      <div className="admin-grid">
        <details className="panel admin-panel accordion-panel span-2" open>
          <summary><span>SMTP & Base URL</span><Server size={18} /></summary>
          <p className="help-text">SMTP ist der Mailserver für spätere Einladungen und Erinnerungen. Die Base URL ist die öffentliche Adresse deiner Installation.</p>
          <form className="admin-form" onSubmit={settingsForm.handleSubmit(saveSettings)}>
            <label className="field">
              <span className="label-row">Base URL <HelpHint text="Öffentliche Adresse, unter der Eventlotse später Links in E-Mails erzeugt." /></span>
              <input placeholder="https://eventlotse.example.org" {...settingsForm.register('baseUrl')} />
              {settingsForm.formState.errors.baseUrl && <small className="form-error">{settingsForm.formState.errors.baseUrl.message}</small>}
            </label>
            <label className="field">
              <span className="label-row">SMTP Host <HelpHint text="Serveradresse deines Mailanbieters, zum Beispiel smtp.example.org." /></span>
              <input placeholder="smtp.example.org" {...settingsForm.register('smtpHost')} />
            </label>
            <label className="field">
              <span className="label-row">SMTP Port <HelpHint text="Häufig 587 mit TLS/STARTTLS oder 465 für SMTPS." /></span>
              <input type="number" min="1" {...settingsForm.register('smtpPort', { valueAsNumber: true })} />
            </label>
            <label className="field">
              <span className="label-row">SMTP Benutzer <HelpHint text="Benutzername oder E-Mail-Adresse für den Mailversand." /></span>
              <input placeholder="info@example.org" {...settingsForm.register('smtpUser')} />
            </label>
            <label className="field">
              <span className="label-row">SMTP Passwort <HelpHint text="Passwort oder App-Passwort deines Mailkontos. Es wird nur beim Speichern an den Server gesendet und danach nicht wieder angezeigt." /></span>
              <input type="password" placeholder={settings.smtpPass ? 'gespeichert, bei Änderung neu eingeben' : 'SMTP Passwort'} autoComplete="new-password" {...settingsForm.register('smtpPass')} />
              <small className="help-text">Bei IONOS ist das normalerweise das Postfachpasswort oder ein App-Passwort.</small>
            </label>
            <label className="field">
              <span className="label-row">Absender <HelpHint text="Name und Adresse, die Empfänger später in Einladungen sehen." /></span>
              <input placeholder="Eventlotse <info@example.org>" {...settingsForm.register('smtpFrom')} />
            </label>
            <label className="toggle-field">
              <input type="checkbox" {...settingsForm.register('smtpTls')} />
              TLS aktivieren
            </label>
            <label className="field">
              <span className="label-row">Erinnerungsvorlauf <HelpHint text="Wie viele Tage vor Fälligkeit Aufgaben in die Erinnerungsmail aufgenommen werden." /></span>
              <input type="number" min="0" max="30" {...settingsForm.register('reminderLeadDays', { valueAsNumber: true })} />
              <small className="help-text">0 bedeutet: nur heute fällige Aufgaben. 3 erinnert heute und die nächsten drei Tage.</small>
            </label>
            <label className="toggle-field">
              <input type="checkbox" {...settingsForm.register('allowUserEventCreation')} />
              Alle angemeldeten Nutzer dürfen Events erstellen
            </label>
            <button className="primary" type="submit"><Save size={16} /> Speichern</button>
          </form>
          <div className="test-mail-box">
            <div>
              <strong>Testmail senden</strong>
              <p className="help-text">Sendet eine hübsche Eventlotse-Testmail über die gespeicherten SMTP-Daten. So merkst du sofort, ob Einladungen später ankommen.</p>
            </div>
            <div className="inline-form">
              <input value={testMailTo} onChange={(event) => setTestMailTo(event.target.value)} placeholder="empfaenger@example.de" />
              <button className="ghost" type="button" onClick={sendTestMail} disabled={testMailPending || !testMailTo.trim()}>
                <Mail size={16} /> {testMailPending ? 'Sende...' : 'Testmail'}
              </button>
            </div>
          </div>
        </details>

        <details className="panel admin-panel accordion-panel span-2">
          <summary><span>Eigenes Passwort ändern</span><Lock size={18} /></summary>
          <p className="help-text">Nach der Installation bitte das vorgegebene Admin-Passwort sofort durch ein eigenes Passwort ersetzen.</p>
          <div className="admin-form">
            <label className="field">
              <span>Aktuelles Passwort</span>
              <input type="password" value={passwordDraft.currentPassword} onChange={(event) => setPasswordDraft({ ...passwordDraft, currentPassword: event.target.value })} />
            </label>
            <label className="field">
              <span>Neues Passwort</span>
              <input type="password" value={passwordDraft.newPassword} onChange={(event) => setPasswordDraft({ ...passwordDraft, newPassword: event.target.value })} />
            </label>
            <label className="field">
              <span>Neues Passwort wiederholen</span>
              <input type="password" value={passwordDraft.repeatPassword} onChange={(event) => setPasswordDraft({ ...passwordDraft, repeatPassword: event.target.value })} />
            </label>
            <button className="primary" type="button" onClick={changeOwnPassword}><Save size={16} /> Passwort speichern</button>
          </div>
        </details>

        <section className="panel admin-panel span-2">
          <div className="section-head">
            <div>
              <h2>Template Store</h2>
              <p className="help-text">Vorlagen sind global: Admins pflegen sie hier, alle angemeldeten Nutzer können sie beim Event-Erstellen auswählen.</p>
            </div>
            <ClipboardList size={18} />
          </div>
          <div className="template-toolbar">
            <button className="ghost" type="button" onClick={() => exportTemplates(templates)}><Download size={16} /> Alle exportieren</button>
            <label className="ghost file-import-button">
              <Upload size={16} /> JSON importieren
              <input type="file" accept="application/json,.json" onChange={(event) => importTemplateFile(event.target.files?.[0])} />
            </label>
            <button className="ghost" type="button" onClick={() => saveTemplates(builtInEventTemplates, 'Standardvorlagen wurden wiederhergestellt.')}><RotateCcw size={16} /> Standardvorlagen</button>
          </div>
          <div className="template-store-list">
            {templates.map((template) => (
              <article className="template-card" key={template.id}>
                <div>
                  <strong>{template.name}</strong>
                  <p>{template.description || 'Keine Beschreibung hinterlegt.'}</p>
                  <small>{template.actions.length} Aktionen · {template.runsheet.length} Ablaufpunkte · {template.budget.length} Budgetposten</small>
                </div>
                <div className="template-actions">
                  <button className="ghost" type="button" onClick={() => editTemplateAsJson(template)}><FileText size={15} /> JSON</button>
                  <button className="ghost" type="button" onClick={() => exportTemplates([template])}><Download size={15} /> Export</button>
                  <button className="icon-button danger" type="button" onClick={() => saveTemplates(templates.filter((entry) => entry.id !== template.id), `Vorlage "${template.name}" wurde gelöscht.`)} aria-label={`${template.name} löschen`}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <label className="field">
            <span>Vorlage als JSON bearbeiten oder importieren</span>
            <textarea
              className="template-json"
              value={templateJson}
              onChange={(event) => setTemplateJson(event.target.value)}
              placeholder={`Beispiel:
{
  "id": "template-tanzabend-samstag",
  "name": "Tanzabend Samstag",
  "description": "Wiederkehrendes Tanzevent",
  "actions": [{"title": "Musik", "category": "Booking", "tasks": ["Playlist prüfen"]}],
  "infrastructure": ["PA-Anlage", "Licht"],
  "runsheet": [{"time": "19:00", "title": "Einlass", "owner": "Team"}],
  "budget": [{"label": "Getränke", "type": "expense", "amount": 0}],
  "wiki": ["Standard-Aufbauplan nutzen"]
}`}
            />
            <small className="help-text">Du kannst eine einzelne Vorlage oder eine Liste von Vorlagen einfügen. Gleiche IDs werden aktualisiert.</small>
          </label>
          <button className="primary" type="button" onClick={saveTemplateJson} disabled={!templateJson.trim()}><Save size={16} /> JSON speichern</button>
        </section>

        <section className="panel admin-panel span-2">
          <div className="section-head">
            <h2>Auditlog</h2>
            <HelpHint text="Nachvollziehbare Liste wichtiger Änderungen wie Benutzeraktionen, Passwort-Reset und Systemkonfiguration." />
            <div className="button-row">
              <button className="ghost" type="button" onClick={runReminders}><Bell size={16} /> Erinnerungen senden</button>
              <ClipboardList size={18} />
            </div>
          </div>
          <ul className="audit-list">
            {auditLog.map((entry) => (
              <li key={entry.id}>
                <time>{entry.at}</time>
                <strong>{entry.actor}</strong>
                <span>{entry.action}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </section>
  )
}

function ActionBoard({
  eventId,
  action,
  members,
  currentMemberId,
  taskFilter,
  canEdit,
  notify,
  updateAction,
}: {
  eventId: string
  action: ActionCard
  members: Member[]
  currentMemberId: string
  taskFilter: TaskFilter
  canEdit: boolean
  notify: (message: string, actionLabel?: string, onAction?: () => void) => void
  updateAction: (action: ActionCard) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const taskMatchesFilter = (task: Task) => {
    if (taskFilter === 'open') return task.status !== 'done'
    if (taskFilter === 'overdue') return task.status !== 'done' && Boolean(task.due) && task.due < today
    if (taskFilter === 'mine') return Boolean(currentMemberId) && task.ownerIds.includes(currentMemberId)
    if (taskFilter === 'unassigned') return task.status !== 'done' && task.ownerIds.length === 0
    return true
  }
  const addTask = () => {
    updateAction({
      ...action,
      tasks: [
        ...action.tasks,
        {
          id: uid(),
          title: 'Neue Unteraufgabe',
          ownerIds: [],
          due: action.deadline,
          status: 'todo',
          notes: '',
          files: [],
          comments: [],
        },
      ],
    })
    notify(`Unteraufgabe in "${action.title}" wurde angelegt.`)
  }

  const moveTask = (task: Task, status: Status) => {
    if (task.status === status) return
    updateAction({
      ...action,
      tasks: action.tasks.map((entry) => (entry.id === task.id ? { ...entry, status } : entry)),
    })
  }

  const duplicateTask = (task: Task) => {
    updateAction({
      ...action,
      tasks: [
        ...action.tasks,
        {
          ...task,
          id: uid(),
          title: `${task.title} Kopie`,
          files: [],
          comments: task.comments.length ? [...task.comments] : [],
        },
      ],
    })
    notify('Aufgabe wurde kopiert.')
  }

  const deleteTask = (task: Task) => {
    if (!window.confirm(`Aufgabe "${task.title}" wirklich löschen?`)) return
    updateAction({
      ...action,
      tasks: action.tasks.filter((entry) => entry.id !== task.id),
    })
    notify('Aufgabe wurde gelöscht.')
  }

  return (
    <article className="action-card">
      <div className="section-head">
        <div>
          <span className="eyebrow"><KanbanSquare size={14} /> Kanban</span>
          <h3>Unteraufgaben</h3>
        </div>
        <button className="icon-button" onClick={addTask} disabled={!canEdit} aria-label="Unteraufgabe hinzufügen"><Plus size={18} /></button>
      </div>
      <div className="kanban">
        {(['todo', 'doing', 'done'] as Status[]).map((status) => (
          <div
            className="lane"
            key={status}
            onDragOver={(event) => {
              if (!canEdit) return
              event.preventDefault()
            }}
            onDrop={(event) => {
              if (!canEdit) return
              const taskId = event.dataTransfer.getData('text/plain')
              const task = action.tasks.find((entry) => entry.id === taskId)
              if (task) moveTask(task, status)
            }}
          >
            <strong>{statusLabel(status)}</strong>
            {action.tasks.filter((task) => task.status === status && taskMatchesFilter(task)).length === 0 && (
              <p className="lane-empty">{emptyLaneText(status)}</p>
            )}
            {action.tasks.filter((task) => task.status === status && taskMatchesFilter(task)).map((task) => (
              <div
                className="task-card"
                key={task.id}
              >
                {canEdit && (
                  <div
                    className="task-drag-handle"
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData('text/plain', task.id)}
                    title="Aufgabe greifen und in eine andere Spalte ziehen"
                  >
                    <GripVertical size={16} />
                    <span>Ziehen nach Offen, In Arbeit oder Erledigt</span>
                  </div>
                )}
                <textarea
                  className="task-title-input"
                  value={task.title}
                  onChange={(change) =>
                    updateAction({
                      ...action,
                      tasks: action.tasks.map((entry) => (entry.id === task.id ? { ...entry, title: change.target.value } : entry)),
                    })
                  }
                  rows={2}
                  placeholder="Konkrete Aufgabe nach SMART: Was genau soll bis wann erledigt sein?"
                  disabled={!canEdit}
                />
                <div className="task-meta-row">
                  <small>Fällig: {formatDate(task.due)}</small>
                  <small>{members.find((member) => member.id === task.ownerIds[0])?.name || 'ohne Verantwortliche'}</small>
                </div>
                <details className="task-details">
                  <summary>Details bearbeiten</summary>
                  <input
                    type="date"
                    value={task.due}
                    onChange={(change) =>
                      updateAction({
                        ...action,
                        tasks: action.tasks.map((entry) => (entry.id === task.id ? { ...entry, due: change.target.value } : entry)),
                      })
                    }
                    disabled={!canEdit}
                  />
                  <select
                    value={task.ownerIds[0] || ''}
                    onChange={(change) =>
                      updateAction({
                        ...action,
                        tasks: action.tasks.map((entry) => (entry.id === task.id ? { ...entry, ownerIds: change.target.value ? [change.target.value] : [] } : entry)),
                      })
                    }
                    disabled={!canEdit}
                  >
                    <option value="">Verantwortlich offen</option>
                    {members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}
                  </select>
                  <select value={task.status} onChange={(change) => moveTask(task, change.target.value as Status)} disabled={!canEdit}>
                    <option value="todo">Offen</option>
                    <option value="doing">In Arbeit</option>
                    <option value="done">Erledigt</option>
                  </select>
                  <textarea
                    value={task.notes}
                    onChange={(change) =>
                      updateAction({
                        ...action,
                        tasks: action.tasks.map((entry) => (entry.id === task.id ? { ...entry, notes: change.target.value } : entry)),
                      })
                    }
                    placeholder={`SMART formulieren:
Spezifisch: Was genau?
Messbar: Woran erkennen wir erledigt?
Attraktiv/akzeptiert: Wer übernimmt es?
Realistisch: Was wird gebraucht?
Terminiert: Bis wann?`}
                    disabled={!canEdit}
                  />
                  <textarea
                    value={task.comments[0] || ''}
                    onChange={(change) =>
                      updateAction({
                        ...action,
                        tasks: action.tasks.map((entry) => (entry.id === task.id ? { ...entry, comments: [change.target.value, ...entry.comments.slice(1)] } : entry)),
                      })
                    }
                    placeholder="Bemerkungen: kurze Absprachen, Rückfragen oder Besonderheiten..."
                    disabled={!canEdit}
                  />
                </details>
                <div className="owner-row">
                  {members.slice(0, 4).map((member) => (
                    <span className="avatar" title={member.email} key={member.id}>{member.name.slice(0, 2).toUpperCase()}</span>
                  ))}
                </div>
                {canEdit && (
                  <div className="task-card-actions">
                    <button className="ghost" type="button" onClick={() => duplicateTask(task)}>
                      <Copy size={15} /> Kopieren
                    </button>
                    <button className="ghost danger" type="button" onClick={() => deleteTask(task)}>
                      <Trash2 size={15} /> Löschen
                    </button>
                  </div>
                )}
                <label className="file-drop">
                  <Upload size={15} />
                  <span>{task.files.length ? task.files.join(', ') : 'Datei merken'}</span>
                  <input
                    type="file"
                    onChange={async (change) => {
                      const file = change.target.files?.[0]
                      if (!file) return
                      if (isBlockedUploadFile(file.name)) {
                        notify('Diese Dateiart ist aus Sicherheitsgründen gesperrt. Bitte keine ausführbaren Dateien hochladen.')
                        change.target.value = ''
                        return
                      }
                      const formData = new FormData()
                      formData.append('file', file)
                      formData.append('eventId', eventId)
                      formData.append('taskId', task.id)
                      try {
                        const response = await secureFetch('/api/uploads', {
                          method: 'POST',
                          body: formData,
                        })
                        if (!response.ok) {
                          const error = await response.json().catch(() => null)
                          notify(error?.message || 'Datei konnte nicht hochgeladen werden.')
                          return
                        }
                      } catch {
                        notify('Datei konnte nicht hochgeladen werden.')
                        return
                      }
                      updateAction({
                        ...action,
                        tasks: action.tasks.map((entry) =>
                          entry.id === task.id ? { ...entry, files: [...entry.files, file.name] } : entry,
                        ),
                      })
                      notify(`Datei "${file.name}" wurde bei der Aufgabe vermerkt.`)
                    }}
                    disabled={!canEdit}
                  />
                </label>
              </div>
            ))}
          </div>
        ))}
      </div>
    </article>
  )
}

function FileManager({ files, onDelete }: { files: StoredFile[]; onDelete: (fileId: string) => void }) {
  return (
    <section className="panel files-panel">
      <div className="section-head">
        <h2>Dateien</h2>
        <Upload size={18} />
      </div>
      {files.length === 0 ? (
        <EmptyState title="Noch keine Dateien" text="Dateien werden direkt an Aufgaben hochgeladen und erscheinen danach hier." />
      ) : (
        <ul className="file-list">
          {files.map((file) => (
            <li key={file.id}>
              <span>
                <strong>{file.original_name}</strong>
                <small>{Math.round(file.size_bytes / 1024)} KB · {new Date(file.created_at).toLocaleString('de-DE')}</small>
              </span>
              <a className="ghost" href={`/api/files/${file.id}/download`}><Download size={15} /> Download</a>
              <button className="icon-button danger" type="button" onClick={() => onDelete(file.id)} aria-label={`${file.original_name} löschen`}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function statusLabel(status: Status) {
  return status === 'todo' ? 'Offen' : status === 'doing' ? 'In Arbeit' : 'Erledigt'
}

function saveStateLabel(state: SaveState) {
  if (state === 'saving') return 'Speichert...'
  if (state === 'saved') return 'Gespeichert'
  if (state === 'error') return 'Speichern fehlgeschlagen'
  return 'Bereit'
}

function emptyLaneText(status: Status) {
  if (status === 'todo') return 'Hier landen Aufgaben, die noch gestartet werden sollen.'
  if (status === 'doing') return 'Ziehe oder stelle Aufgaben hierher, sobald jemand daran arbeitet.'
  return 'Erledigte Aufgaben erscheinen hier als gemeinsame Fortschrittsanzeige.'
}

function formatDate(date: string) {
  if (!date) return 'Datum offen'
  const parsed = parseISO(date)
  if (!isValid(parsed)) return 'Datum offen'
  return format(parsed, 'dd.MM.yyyy', { locale: de })
}

function CountdownBadge({ eventDate }: { eventDate: string }) {
  const countdown = getCountdown(eventDate)
  return <span className={`countdown-badge ${countdown.tone}`}>{countdown.label}</span>
}

function getCountdown(date: string) {
  const parsed = parseISO(date)
  if (!date || !isValid(parsed)) {
    return { label: 'offen', tone: 'neutral' }
  }

  const days = differenceInCalendarDays(parsed, new Date())
  if (days < 0) {
    return { label: 'vorbei', tone: 'neutral' }
  }

  const label = days === 0 ? 'heute' : `${days} ${days === 1 ? 'Tag' : 'Tage'}`
  if (days > 30) return { label, tone: 'green' }
  if (days >= 7) return { label, tone: 'yellow' }
  return { label, tone: 'red' }
}

function EditableField({
  label,
  help,
  value,
  disabled,
  onChange,
}: {
  label: string
  help?: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="field">
      <span className="label-row">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
      {help && <small className="help-text">{help}</small>}
    </label>
  )
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="stat">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function InfoPanel({
  icon,
  title,
  help,
  items,
  emptyText = 'Hier erscheinen Inhalte, sobald du sie anlegst.',
}: {
  icon: ReactNode
  title: string
  help?: string
  items: string[]
  emptyText?: string
}) {
  return (
    <section className="panel">
      <div className="section-head">
        <h2>{title}</h2>
        {icon}
      </div>
      {help && <p className="help-text">{help}</p>}
      {items.length === 0 ? <EmptyState title="Noch leer" text={emptyText} /> : (
        <ul className="plain-list">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
    </section>
  )
}

function HelpHint({ text }: { text: string }) {
  return (
    <span className="help-icon" data-tooltip={text} aria-label={text} tabIndex={0}>
      <CircleHelp size={14} />
    </span>
  )
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-card">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  )
}

function Toast({ toast, onClose }: { toast: NonNullable<ToastState>; onClose: () => void }) {
  useEffect(() => {
    const timeout = window.setTimeout(onClose, toast.actionLabel ? 8000 : 5000)
    return () => window.clearTimeout(timeout)
  }, [onClose, toast.actionLabel, toast.message])

  return (
    <div className="toast">
      <span>{toast.message}</span>
      {toast.actionLabel && toast.onAction && (
        <button
          onClick={() => {
            toast.onAction?.()
            onClose()
          }}
        >
          {toast.actionLabel}
        </button>
      )}
      <button className="toast-close" onClick={onClose} aria-label="Meldung schließen"><X size={14} /></button>
    </div>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <span>Open Source von Michael Schellenberger</span>
      <a href={repoUrl} target="_blank" rel="noreferrer"><GitHubIcon /> GitHub</a>
      <span>Rev. v{__APP_VERSION__}</span>
      <Link to="/impressum">Impressum</Link>
      <Link to="/datenschutz">Datenschutz</Link>
      <Link to="/cookies">Cookiehinweise</Link>
    </footer>
  )
}

function GitHubIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" className="github-icon">
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.58 2 12.26c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49v-1.9c-2.78.62-3.37-1.22-3.37-1.22-.45-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.93.86.09-.66.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.35 9.35 0 0 1 12 6.96c.85 0 1.7.12 2.5.35 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.07.36.32.68.95.68 1.92v2.79c0 .27.18.59.69.49A10.21 10.21 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z"
      />
    </svg>
  )
}

function LegalPage({ page }: { page: LegalPageKey }) {
  const title = page === 'impressum' ? 'Impressum' : page === 'datenschutz' ? 'Datenschutz' : 'Cookiehinweise'
  const lines =
    page === 'impressum'
      ? [
          'Michael Schellenberger',
          'Ziegeleistrasse 32',
          '91572 Bechhofen',
          'E-Mail: info@schellenberger.biz',
          'Verantwortlich für den Inhalt: Michael Schellenberger.',
        ]
      : page === 'datenschutz'
        ? [
            'Verantwortlicher: Michael Schellenberger, Ziegeleistrasse 32, 91572 Bechhofen, info@schellenberger.biz.',
            'Eventlotse speichert in dieser Version Daten lokal im Browser. Beim Self-Hosting müssen Hosting, Backups, Mailversand, Nutzerverwaltung, Auditlog und Dateiablage in der Datenschutzerklärung ergänzt werden.',
            'Technisch notwendige Daten können für Anmeldung, Rollen, Events, Aufgaben, SMTP-Konfiguration und Systemprotokolle verarbeitet werden.',
          ]
        : [
            'Eventlotse setzt derzeit keine Tracking-Cookies.',
            'LocalStorage und Service Worker Cache werden technisch für App-Funktionen genutzt.',
            'Für spätere Login-, Analyse- oder Integrationsfunktionen muss dieser Hinweis aktualisiert werden.',
          ]

  return (
    <div className="legal-page">
      <Link className="ghost" to="/">Zurück zur App</Link>
      <h1>{title}</h1>
      <div className="legal-copy">
        {lines.map((line) => <p key={line}>{line}</p>)}
      </div>
      <Footer />
    </div>
  )
}

export default App
