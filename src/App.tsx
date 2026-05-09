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
  CalendarDays,
  Check,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  Clock3,
  Download,
  Euro,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  Lock,
  Mail,
  MapPin,
  Music,
  Power,
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

type Role = 'Admin' | 'Helfer' | 'Künstler'
type Status = 'todo' | 'doing' | 'done'
type LegalPageKey = 'impressum' | 'datenschutz' | 'cookies'

type Member = {
  id: string
  name: string
  email: string
  role: Role
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
  members: Member[]
  actions: ActionCard[]
  budget: BudgetLine[]
  infrastructure: string[]
  runsheet: RunItem[]
  actNotes: string
  wiki: string[]
}

type AdminUser = {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
  lastLogin: string
}

type AppSettings = {
  baseUrl: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass?: string
  smtpFrom: string
  smtpTls: boolean
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

type EventTab = 'overview' | 'tasks' | 'team' | 'schedule'

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
const usersStorageKey = 'eventlotse.users.v1'
const auditStorageKey = 'eventlotse.audit.v1'

const actionTemplates = [
  { title: 'Aufbau', category: 'Logistik', help: 'Alles, was vor Ort aufgebaut, angeliefert oder vorbereitet werden muss.' },
  { title: 'Abbau', category: 'Logistik', help: 'Rückbau, Reinigung, Rückgabe und letzte Kontrolle nach der Veranstaltung.' },
  { title: 'Musik & Künstler', category: 'Booking', help: 'DJs, Bands, Redner oder andere Programmpunkte inklusive Kontakt und Absprachen.' },
  { title: 'Flyer & Design', category: 'Marketing', help: 'Gestaltung, Freigabe, Druck und Verteilung von Flyern oder digitalen Einladungen.' },
  { title: 'Einladungen', category: 'Gäste', help: 'Gästeliste, Zu- und Absagen, Zielgruppe und wichtige Hinweise an Gäste.' },
  { title: 'Catering', category: 'Versorgung', help: 'Essen, Getränke, Einkauf, Ausgabe, Kühlung und Pfand.' },
  { title: 'GEMA & Genehmigungen', category: 'Recht', help: 'Musiknutzung, Ausschank, Lärm, Genehmigungen und Auflagen.' },
  { title: 'Technik', category: 'Infrastruktur', help: 'Ton, Licht, Strom, Kabel, Bühne, WLAN und technische Pläne.' },
  { title: 'Schichtplan', category: 'Team', help: 'Wer hilft wann bei Aufbau, Kasse, Bar, Einlass oder Abbau?' },
  { title: 'Runsheet', category: 'Ablauf', help: 'Minutengenauer Plan für den Veranstaltungstag.' },
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

const defaultSettings: AppSettings = {
  baseUrl: 'https://eventlotse.example.org',
  smtpHost: 'smtp.example.org',
  smtpPort: 587,
  smtpUser: 'info@example.org',
  smtpPass: '',
  smtpFrom: 'Eventlotse <info@example.org>',
  smtpTls: true,
}

const eventFormSchema = z.object({
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
})

const userFormSchema = z.object({
  name: z.string().trim().optional(),
  email: z.string().email('Bitte eine gültige E-Mail-Adresse eingeben.'),
  role: z.enum(['Admin', 'Helfer', 'Künstler']),
})

type EventFormValues = z.infer<typeof eventFormSchema>
type SettingsFormValues = z.infer<typeof settingsSchema>
type UserFormValues = z.infer<typeof userFormSchema>
type EventFormInput = z.input<typeof eventFormSchema>
type SettingsFormInput = z.input<typeof settingsSchema>
type UserFormInput = z.input<typeof userFormSchema>

const uid = () => crypto.randomUUID()

const emptyEvents: EventPlan[] = []
const legacyDemoEventNames = new Set(['Sommerfest am See', 'Hofkonzert', 'Geburtstag 40'])

function normalizeRole(role: string): Role {
  if (role === 'Admin' || role === 'Helfer' || role === 'Künstler') return role
  return role === 'Act' ? 'Künstler' : 'Helfer'
}

function normalizeEvent(event: EventPlan): EventPlan {
  return {
    ...event,
    members: event.members.map((member) => ({ ...member, role: normalizeRole(member.role) })),
  }
}

function isLegacyDemoEvent(event: EventPlan) {
  const emails = event.members.map((member) => member.email)
  return legacyDemoEventNames.has(event.name) && emails.some((email) => email.endsWith('@example.de'))
}

function normalizeAdminUser(user: AdminUser): AdminUser {
  return {
    ...user,
    role: normalizeRole(user.role),
  }
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

function defaultUsers(events: EventPlan[]): AdminUser[] {
  const users = new Map<string, AdminUser>()
  events.forEach((event) => {
    event.members.forEach((member) => {
      users.set(member.email, {
        id: member.id,
        name: member.name,
        email: member.email,
        role: normalizeRole(member.role),
        active: true,
        lastLogin: member.role === 'Admin' ? 'heute' : 'noch nie',
      })
    })
  })
  return [...users.values()]
}

function App() {
  const [events, setEvents] = useLocalStorage<EventPlan[]>(storageKey, loadEvents())
  const [adminUsers, setAdminUsers] = useLocalStorage<AdminUser[]>(usersStorageKey, defaultUsers(loadEvents()))
  const [settings, setSettings] = useLocalStorage<AppSettings>(settingsStorageKey, defaultSettings)
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
  const [session, setSession] = useState({ email: 'info@schellenberger.biz', role: 'Helfer' as Role, authenticated: false })
  const [loginPassword, setLoginPassword] = useState('')
  const [toast, setToast] = useState<ToastState>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  useEffect(() => {
    const normalizedEvents = events.map(normalizeEvent)
    if (JSON.stringify(normalizedEvents) !== JSON.stringify(events)) {
      setEvents(normalizedEvents)
    }
  }, [events, setEvents])

  useEffect(() => {
    const normalizedUsers = adminUsers.map(normalizeAdminUser)
    if (JSON.stringify(normalizedUsers) !== JSON.stringify(adminUsers)) {
      setAdminUsers(normalizedUsers)
    }
  }, [adminUsers, setAdminUsers])

  const loadRemoteData = useCallback(async () => {
    const response = await fetch('/api/bootstrap', { credentials: 'include' })
    if (!response.ok) return
    const data = await response.json()
    if (Array.isArray(data.events)) setEvents(data.events.map(normalizeEvent).filter((event: EventPlan) => !isLegacyDemoEvent(event)))
    if (Array.isArray(data.users)) setAdminUsers(data.users.map(normalizeAdminUser))
    if (data.settings) setSettings(data.settings)
    if (Array.isArray(data.auditLog)) setAuditLog(data.auditLog)
  }, [setAdminUsers, setAuditLog, setEvents, setSettings])

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then(async (data) => {
        if (!data?.user) return
        setSession({ email: data.user.email, role: data.user.role, authenticated: true })
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
    fetch(`/api/events/${next.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(next),
    })
      .then((response) => setSaveState(response.ok ? 'saved' : 'error'))
      .catch(() => setSaveState('error'))
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
      setSession({ email: data.user.email, role: data.user.role, authenticated: true })
      setLoginPassword('')
      await loadRemoteData()
      notify('Anmeldung erfolgreich.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Anmeldung nicht möglich. Bitte Server und Zugangsdaten prüfen.')
    }
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined)
    setSession({ email: 'info@schellenberger.biz', role: 'Helfer', authenticated: false })
    notify('Du bist abgemeldet.')
  }

  const addEvent = (data: EventFormValues) => {
    const next: EventPlan = {
      id: uid(),
      name: data.name,
      motto: data.motto || 'Noch kein Motto',
      targetGroup: data.targetGroup || 'Privater Kreis',
      guests: data.guests,
      date: data.date || '',
      location: data.location || '',
      mapUrl: '',
      contact: '',
      members: [{ id: uid(), name: 'Michael', email: session.email, role: 'Admin' }],
      actions: [],
      budget: [],
      infrastructure: [],
      runsheet: [],
      actNotes: '',
      wiki: [],
    }
    setEvents((current) => [next, ...current])
    setAdminUsers((current) =>
      current.some((user) => user.email === session.email)
        ? current
        : [
            ...current,
            { id: uid(), name: 'Michael', email: session.email, role: 'Admin', active: true, lastLogin: 'heute' },
          ],
    )
    addAudit(`Event "${next.name}" wurde angelegt.`)
    notify(`Event "${next.name}" wurde angelegt.`)
    fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
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
          {session.authenticated && session.role === 'Admin' && <Link to="/admin"><Settings size={15} /> Admin</Link>}
        </nav>
        <GlobalSearch events={events} />
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
          <Route path="/" element={<Dashboard events={events} addEvent={addEvent} notify={notify} />} />
          <Route
            path="/admin"
            element={
              session.authenticated && session.role === 'Admin' ? (
                <AdminPage
                  session={session}
                  users={adminUsers}
                  settings={settings}
                  auditLog={auditLog}
                  setUsers={setAdminUsers}
                  setSettings={setSettings}
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
            element={<EventRoute events={events} session={session} saveState={saveState} updateEvent={updateEvent} notify={notify} />}
          />
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
  addEvent,
  notify,
}: {
  events: EventPlan[]
  addEvent: (data: EventFormValues) => EventPlan
  notify: (message: string, actionLabel?: string, onAction?: () => void) => void
}) {
  const navigate = useNavigate()
  const eventForm = useForm<EventFormInput, unknown, EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
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
  const openTasks = events.reduce(
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

  return (
    <section className="home-dashboard">
      <div className="home-hero">
        <div>
          <span className="eyebrow dark"><ShieldCheck size={14} /> Privates Event-Operations-Dashboard</span>
          <h1>Alle Veranstaltungen auf einen Blick.</h1>
          <p>
            Plane Aufbau, Abbau, Booking, Flyer, Budget, Infrastruktur und Runsheet in einer selbst hostbaren App.
          </p>
          <p className="help-text">Frische Installationen starten leer. Lege zuerst ein Event an, danach öffnet sich der restliche Workflow.</p>
        </div>
        <div className="home-stats" aria-label="Dashboard Kennzahlen">
          <Stat icon={<CalendarDays />} label="Events" value={String(events.length)} />
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
          <p className="help-text">Diese Basisdaten reichen für die erste Eventkarte. Details wie Team, Infrastruktur und Ablauf ergänzt du später im Event.</p>
          <form onSubmit={eventForm.handleSubmit(submitEvent)}>
            <label className="field">
              <span>Eventname</span>
              <input placeholder="z.B. Hoffest, Geburtstag, Vereinsabend" {...eventForm.register('name')} />
              {eventForm.formState.errors.name && <small className="form-error">{eventForm.formState.errors.name.message}</small>}
            </label>
            <label className="field">
              <span>Motto</span>
              <input placeholder="z.B. Akustikabend im Innenhof" {...eventForm.register('motto')} />
              <small className="help-text">Optional. Eine kurze Beschreibung reicht völlig.</small>
            </label>
            <label className="field">
              <span>Zielgruppe</span>
              <input placeholder="z.B. Familie, Freunde, Nachbarschaft" {...eventForm.register('targetGroup')} />
            </label>
            <div className="two-col">
              <label className="field">
                <span>Gäste grob geschätzt</span>
                <input type="number" min="0" placeholder="0" {...eventForm.register('guests', { valueAsNumber: true })} />
              </label>
              <label className="field">
                <span>Datum</span>
                <input type="date" {...eventForm.register('date')} />
              </label>
            </div>
            <label className="field">
              <span>Ort</span>
              <input placeholder="z.B. Alter Hof, Vereinsheim, Garten" {...eventForm.register('location')} />
            </label>
            <button className="primary" type="submit"><Plus size={16} /> Anlegen</button>
          </form>
        </section>

        <section className="event-overview">
          <div className="section-head">
            <div>
              <h2>Eventkarten</h2>
              <p className="help-text">Die Countdown-Farbe zeigt die Dringlichkeit: grün über 30 Tage, gelb 7 bis 30 Tage, rot unter 7 Tage.</p>
            </div>
          </div>
          {events.length === 0 ? (
            <EmptyState
              title="Noch keine Events"
              text="Lege dein erstes Event links im Akkordeon an. Danach erscheinen hier die Arbeitskarten."
            />
          ) : (
            <div className="event-card-grid">
              {events.map((event) => (
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
  session,
  saveState,
  updateEvent,
  notify,
}: {
  events: EventPlan[]
  session: { email: string; role: Role }
  saveState: SaveState
  updateEvent: (event: EventPlan) => void
  notify: (message: string, actionLabel?: string, onAction?: () => void) => void
}) {
  const { eventId } = useParams()
  const event = events.find((entry) => entry.id === eventId)

  if (!event) {
    return <Navigate to="/" replace />
  }

  return <EventWorkspace event={event} session={session} saveState={saveState} updateEvent={updateEvent} notify={notify} />
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
            <p>Noch kein Runsheet.</p>
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
  session,
  saveState,
  updateEvent,
  notify,
}: {
  event: EventPlan
  session: { email: string; role: Role }
  saveState: SaveState
  updateEvent: (event: EventPlan) => void
  notify: (message: string, actionLabel?: string, onAction?: () => void) => void
}) {
  const [newMember, setNewMember] = useState('')
  const [budgetDraft, setBudgetDraft] = useState({ label: '', amount: '', type: 'expense' as 'income' | 'expense' })
  const [runDraft, setRunDraft] = useState({ time: '', title: '', owner: '' })
  const [wikiDraft, setWikiDraft] = useState('')
  const [activeTab, setActiveTab] = useState<EventTab>('overview')
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all')
  const [files, setFiles] = useState<StoredFile[]>([])
  const isAdmin = session.role === 'Admin'
  const currentMember = event.members.find((member) => member.email === session.email)
  const openTaskCount = event.actions.flatMap((action) => action.tasks).filter((task) => task.status !== 'done').length

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
    updateEvent({
      ...event,
      actions: [
        ...event.actions,
        {
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
        },
      ],
    })
    notify(`Aktion "${title}" wurde hinzugefügt.`)
  }

  const addMember = async () => {
    if (!newMember.trim()) return
    const email = newMember.trim()
    try {
      const response = await fetch(`/api/events/${event.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, role: 'Helfer' }),
      })
      if (response.ok) {
        const data = await response.json()
        updateEvent(data.event)
        setNewMember('')
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
          name: email.split('@')[0],
          email,
          role: 'Helfer',
        },
      ],
    })
    setNewMember('')
    notify(`${email} wurde lokal zum Event-Team hinzugefügt. Einladungsmails brauchen den Server.`)
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

  const deleteFile = async (fileId: string) => {
    const response = await fetch(`/api/files/${fileId}`, { method: 'DELETE', credentials: 'include' })
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

  const addWikiEntry = () => {
    if (!wikiDraft.trim()) return
    updateEvent({ ...event, wiki: [...event.wiki, wikiDraft.trim()] })
    setWikiDraft('')
    notify('Wiki-Notiz wurde ergänzt.')
  }

  return (
    <section className="event-workspace">
      <Link className="ghost back-button" to="/">Zurück zum Dashboard</Link>
      <div className="event-hero">
        <div>
          <span className="eyebrow"><CalendarDays size={14} /> {event.date || 'Datum offen'}</span>
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

      <NextSteps event={event} isAdmin={isAdmin} setActiveTab={setActiveTab} />

      <div className="event-tabs" role="tablist" aria-label="Eventbereiche">
        <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>Übersicht</button>
        <button className={activeTab === 'tasks' ? 'active' : ''} onClick={() => setActiveTab('tasks')}>Aufgaben <span>{openTaskCount}</span></button>
        <button className={activeTab === 'team' ? 'active' : ''} onClick={() => setActiveTab('team')}>Team</button>
        <button className={activeTab === 'schedule' ? 'active' : ''} onClick={() => setActiveTab('schedule')}>Ablauf</button>
      </div>

      {activeTab === 'overview' && (
        <div className="dashboard-grid">
          <section className="panel span-2">
            <div className="section-head">
              <h2>Event-Steckbrief</h2>
              <HelpHint text="Der Steckbrief ist die gemeinsame Orientierung: Motto, Zielgruppe, Lageplan und Kontakt vor Ort." />
              <div className="button-row">
                <a className="ghost" href={`/api/events/${event.id}/calendar.ics`}><CalendarDays size={16} /> iCal</a>
                <a className="ghost" href={`/api/events/${event.id}/export/tasks.csv`}><Download size={16} /> CSV</a>
                <a className="ghost" href={`/api/events/${event.id}/export/tasks.xlsx`}><Download size={16} /> XLSX</a>
                <a className="ghost" href={`/api/events/${event.id}/export/runsheet.pdf`}><FileText size={16} /> PDF</a>
                <button className="ghost" onClick={exportJson}><Download size={16} /> JSON</button>
              </div>
            </div>
            <div className="profile-grid">
              <EditableField label="Motto" help="Kurzer Arbeitstitel oder Leitidee, damit alle wissen, worum es geht." value={event.motto} onChange={(motto) => updateEvent({ ...event, motto })} disabled={!isAdmin} />
              <EditableField label="Zielgruppe" help="Wer soll kommen? Zum Beispiel Familie, Nachbarschaft, Vereinsmitglieder oder eingeladene Gäste." value={event.targetGroup} onChange={(targetGroup) => updateEvent({ ...event, targetGroup })} disabled={!isAdmin} />
              <EditableField label="Karten-Link" help="Link zu Google Maps, Apple Karten oder einem Lageplan." value={event.mapUrl} onChange={(mapUrl) => updateEvent({ ...event, mapUrl })} disabled={!isAdmin} />
              <EditableField label="Kontakt vor Ort" help="Person, Telefonnummer oder Hinweis für Schlüssel, Zugang und Strom." value={event.contact} onChange={(contact) => updateEvent({ ...event, contact })} disabled={!isAdmin} />
            </div>
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
              <li><Clock3 size={15} /> {event.runsheet.length} Ablaufpunkte im Runsheet.</li>
            </ul>
          </section>
        </div>
      )}

      {activeTab === 'tasks' && (
        <section className="action-section">
          <details className="panel accordion-panel" open={event.actions.length === 0}>
            <summary>Aktionen hinzufügen</summary>
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
              <div className="action-grid">
                {event.actions.map((action) => (
                  <ActionBoard
                    key={action.id}
                    eventId={event.id}
                    action={action}
                    members={event.members}
                    currentMemberId={currentMember?.id || ''}
                    taskFilter={taskFilter}
                    canEdit={isAdmin || action.owners.some((owner) => owner === currentMember?.id)}
                    notify={notify}
                    updateAction={(next) =>
                      updateEvent({
                        ...event,
                        actions: event.actions.map((entry) => (entry.id === action.id ? next : entry)),
                      })
                    }
                  />
                ))}
              </div>
            </>
          )}
          <FileManager files={files} onDelete={deleteFile} />
        </section>
      )}

      {activeTab === 'team' && (
        <div className="dashboard-grid">
          <section className="panel">
            <div className="section-head">
              <h2>Team</h2>
              <HelpHint text="Personen mit Zugriff auf dieses Event. Admins steuern alles, Helfer bearbeiten zugewiesene Aufgaben, Künstler sehen vor allem relevante Ablaufdaten." />
              <Mail size={18} />
            </div>
            <div className="member-list">
              {event.members.map((member) => (
                <span className="member-pill" key={member.id}>
                  <b>{member.name.slice(0, 2).toUpperCase()}</b>
                  {member.email}
                </span>
              ))}
            </div>
            {isAdmin && (
              <div className="inline-form">
                <input value={newMember} onChange={(change) => setNewMember(change.target.value)} placeholder="helfer@email.de" />
                <button className="icon-button" onClick={addMember} aria-label="Mithelfer hinzufügen"><Plus size={18} /></button>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="section-head">
              <h2>Infrastruktur</h2>
              <HelpHint text="Checkliste für Dinge, die vor Ort vorhanden, organisiert oder genehmigt sein müssen." />
            </div>
            <div className="check-grid">
              {infrastructureOptions.map((item) => (
                <label key={item}>
                  <input
                    type="checkbox"
                    checked={event.infrastructure.includes(item)}
                    onChange={() => {
                      const exists = event.infrastructure.includes(item)
                      updateEvent({
                        ...event,
                        infrastructure: exists
                          ? event.infrastructure.filter((entry) => entry !== item)
                          : [...event.infrastructure, item],
                      })
                    }}
                    disabled={!isAdmin}
                  />
                  {item}
                </label>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'schedule' && (
        <>
          <MobileSetupPanel event={event} />
          <section className="lower-grid">
            <InfoPanel icon={<ClipboardList />} title="Runsheet" help="Minutengenauer Tagesplan: Aufbau, Soundcheck, Einlass, Programmpunkte und Abbau." items={event.runsheet.map((item) => `${item.time} · ${item.title} · ${item.owner}`)} emptyText="Noch kein Ablaufplan. Lege die wichtigsten Zeiten für Aufbau, Einlass, Künstler und Abbau an." />
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
                <h2>Künstler & Booking</h2>
                <HelpHint text="Früher oft als „Act“ bezeichnet: gemeint sind DJs, Bands, Redner oder andere Programmpunkte." />
                <Music size={18} />
              </div>
              <textarea value={event.actNotes} onChange={(change) => updateEvent({ ...event, actNotes: change.target.value })} placeholder="Kontakte, Gage, Ankunft, Tech-Rider, Absprachen..." disabled={!isAdmin} />
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
  users,
  settings,
  auditLog,
  setUsers,
  setSettings,
  addAudit,
  notify,
}: {
  session: { email: string; role: Role; authenticated: boolean }
  users: AdminUser[]
  settings: AppSettings
  auditLog: AuditEntry[]
  setUsers: (next: AdminUser[] | ((current: AdminUser[]) => AdminUser[])) => void
  setSettings: (next: AppSettings | ((current: AppSettings) => AppSettings)) => void
  addAudit: (action: string) => void
  notify: (message: string, actionLabel?: string, onAction?: () => void) => void
}) {
  const [toast, setToast] = useState<ToastState>(null)
  const [testMailTo, setTestMailTo] = useState(settings.smtpUser || 'info@schellenberger.biz')
  const [testMailPending, setTestMailPending] = useState(false)
  const [passwordDraft, setPasswordDraft] = useState({ currentPassword: '', newPassword: '', repeatPassword: '' })
  const settingsForm = useForm<SettingsFormInput, unknown, SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: settings,
  })
  const userForm = useForm<UserFormInput, unknown, UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: { name: '', email: '', role: 'Helfer' },
  })

  const addUser = async (data: UserFormValues) => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.message || 'Benutzer konnte nicht gespeichert werden.')
      setUsers((current) => [...current.filter((user) => user.id !== result.user.id), result.user])
      addAudit(`Benutzer "${result.user.email}" wurde hinzugefügt.`)
      notify(`Benutzer "${result.user.email}" wurde hinzugefügt.`)
      userForm.reset({ name: '', email: '', role: 'Helfer' })
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Benutzer konnte nicht gespeichert werden.')
    }
  }

  const updateUser = async (userId: string, patch: Partial<AdminUser>) => {
    setUsers((current) => current.map((user) => (user.id === userId ? { ...user, ...patch } : user)))
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.message || 'Benutzer konnte nicht aktualisiert werden.')
      setUsers((current) => current.map((user) => (user.id === userId ? result.user : user)))
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Benutzer konnte nicht aktualisiert werden.')
    }
  }

  const deleteUser = async (user: AdminUser) => {
    if (!window.confirm(`Benutzer ${user.email} wirklich löschen?`)) return
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE', credentials: 'include' })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.message || 'Benutzer konnte nicht gelöscht werden.')
      setUsers((current) => current.filter((entry) => entry.id !== user.id))
      addAudit(`Benutzer "${user.email}" wurde gelöscht.`)
      setToast({ message: `Benutzer ${user.email} gelöscht.` })
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Benutzer konnte nicht gelöscht werden.')
    }
  }

  const resetPassword = async (user: AdminUser) => {
    try {
      const response = await fetch(`/api/admin/users/${user.id}/reset-password`, { method: 'POST', credentials: 'include' })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.message || 'Passwort-Reset konnte nicht versendet werden.')
      addAudit(`Passwort-Reset für "${user.email}" wurde versendet.`)
      notify(`Passwort-Reset für "${user.email}" wurde per E-Mail versendet.`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Passwort-Reset konnte nicht versendet werden.')
    }
  }

  const saveSettings = async (data: SettingsFormValues) => {
    const nextSettings = { ...data, smtpPass: data.smtpPass ? '********' : settings.smtpPass }
    setSettings(nextSettings)
    addAudit('Systemeinstellungen wurden gespeichert.')
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
      const response = await fetch('/api/admin/test-mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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

  const changeOwnPassword = async () => {
    if (passwordDraft.newPassword !== passwordDraft.repeatPassword) {
      notify('Die neuen Passwörter stimmen nicht überein.')
      return
    }
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
    const response = await fetch('/api/admin/reminders/run', { method: 'POST', credentials: 'include' })
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
          <h1>System, Mail und Benutzer verwalten.</h1>
          <p>Konfiguriere SMTP, Base URL, Benutzerzugänge und prüfe Änderungen im Auditlog.</p>
          <p className="help-text">Diese Einstellungen brauchst du meist nur beim Setup oder bei Wartung. Deshalb bleiben technische Bereiche als Akkordeon kompakt.</p>
        </div>
        <div className="admin-summary">
          <Stat icon={<Users />} label="Benutzer" value={String(users.length)} />
          <Stat icon={<ShieldCheck />} label="Aktiv" value={String(users.filter((user) => user.active).length)} />
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
            <h2>Benutzerverwaltung</h2>
            <HelpHint text="Hier verwaltest du globale Benutzer. Eventzugriff entsteht zusätzlich über die Teamliste im jeweiligen Event." />
            <UserCog size={18} />
          </div>
          <form className="user-create-row" onSubmit={userForm.handleSubmit(addUser)}>
            <input placeholder="Name" {...userForm.register('name')} />
            <label className="field inline-error-field">
              <input placeholder="E-Mail" {...userForm.register('email')} />
              {userForm.formState.errors.email && <small className="form-error">{userForm.formState.errors.email.message}</small>}
            </label>
            <select {...userForm.register('role')}>
              <option>Admin</option>
              <option>Helfer</option>
              <option>Künstler</option>
            </select>
            <button className="primary" type="submit"><Plus size={16} /> Hinzufügen</button>
          </form>
          <div className="user-table" role="table" aria-label="Benutzerverwaltung">
            <div className="user-row user-row-head" role="row">
              <span>Name</span>
              <span>E-Mail</span>
              <span>Rolle</span>
              <span>Status</span>
              <span>Aktionen</span>
            </div>
            {users.map((user) => (
              <div className="user-row" role="row" key={user.id}>
                <input value={user.name} onChange={(event) => updateUser(user.id, { name: event.target.value })} />
                <span>{user.email}</span>
                <select value={user.role} onChange={(event) => updateUser(user.id, { role: event.target.value as Role })}>
                  <option>Admin</option>
                  <option>Helfer</option>
                  <option>Künstler</option>
                </select>
                <button
                  className={user.active ? 'status-button active' : 'status-button'}
                  onClick={() => {
                    updateUser(user.id, { active: !user.active })
                    addAudit(`Benutzer "${user.email}" wurde ${user.active ? 'deaktiviert' : 'aktiviert'}.`)
                  }}
                >
                  <Power size={14} /> {user.active ? 'aktiv' : 'inaktiv'}
                </button>
                <div className="user-actions">
                  <button className="icon-button" onClick={() => resetPassword(user)} aria-label={`Passwort für ${user.email} zurücksetzen`}>
                    <RotateCcw size={16} />
                  </button>
                  <button className="icon-button danger" onClick={() => deleteUser(user)} aria-label={`${user.email} löschen`}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
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

  return (
    <article className="action-card">
      <div className="section-head">
        <div>
          <span className="eyebrow"><KanbanSquare size={14} /> {action.category}</span>
          <h3>{action.title}</h3>
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
                draggable={canEdit}
                onDragStart={(event) => event.dataTransfer.setData('text/plain', task.id)}
              >
                <input
                  value={task.title}
                  onChange={(change) =>
                    updateAction({
                      ...action,
                      tasks: action.tasks.map((entry) => (entry.id === task.id ? { ...entry, title: change.target.value } : entry)),
                    })
                  }
                  disabled={!canEdit}
                />
                <div className="task-meta-row">
                  <small>Fällig: {task.due || 'offen'}</small>
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
                    placeholder="Notizen, Absprachen oder Einkaufsliste..."
                    disabled={!canEdit}
                  />
                </details>
                <div className="owner-row">
                  {members.slice(0, 4).map((member) => (
                    <span className="avatar" title={member.email} key={member.id}>{member.name.slice(0, 2).toUpperCase()}</span>
                  ))}
                </div>
                <label className="file-drop">
                  <Upload size={15} />
                  <span>{task.files.length ? task.files.join(', ') : 'Datei merken'}</span>
                  <input
                    type="file"
                    onChange={(change) => {
                      const file = change.target.files?.[0]
                      if (!file) return
                      const formData = new FormData()
                      formData.append('file', file)
                      formData.append('eventId', eventId)
                      formData.append('taskId', task.id)
                      fetch('/api/uploads', {
                        method: 'POST',
                        credentials: 'include',
                        body: formData,
                      }).catch(() => undefined)
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
    <span className="help-icon" title={text} aria-label={text}>
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
