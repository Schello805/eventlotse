# Changelog

## v0.4.26

- Normalisierte PostgreSQL-Tabellen für Aktionen, Aufgaben, Infrastruktur, Zeitplan und Budget ergänzt.
- Migration synchronisiert bestehende Event-JSON-Daten in die neuen Tabellen.
- Helfer dürfen serverseitig nur verantwortete Aktionsgruppen oder eigene Unteraufgaben ändern.
- Event-Templates erzeugen Infrastruktur-Aufgaben automatisch beim Event-Anlegen.
- Erinnerungsvorlauf für bald fällige Aufgaben konfigurierbar gemacht.
- Zusätzliche Tests für Datenmodell, Rechte und Erinnerungen ergänzt.

## v0.4.25

- Infrastruktur-Haken erzeugen automatisch passende Aufgabenpakete im Aufgaben-Tab.
- Hauptverantwortliche Person pro Infrastrukturgruppe auswählbar.
- Kanban-Aufgaben haben eine sichtbare Ziehleiste zum Verschieben zwischen den Spalten.

## v0.4.24

- Hilfe-Icon im Event-Steckbrief direkt an die Überschrift gesetzt.
- Exportvarianten im Steckbrief in ein platzsparendes Dropdown-Menü verschoben.

## v0.4.23

- CSRF-Schutz für angemeldete Schreibzugriffe ergänzt.
- Upload-Härtung erweitert: blockierte Endungen plus Signaturprüfung für ausführbare Dateien.
- Automatische Node-Tests für Event-Rechte und Upload-Sicherheit ergänzt.
- Smoke-Check für Produktionsbuild ergänzt.
- Vollständige Backup-/Restore-Skripte für Datenbank, Uploads und Umgebungskonfiguration ergänzt.
- Account-Datenexport im Profil ergänzt; Helfer können den eigenen Account löschen.
- Self-Hosting-, Sicherheits- und Datenschutzdokumentation aktualisiert.

## v0.4.22

- Event als Vorlage speichern.
- Profildaten in Event-Teams synchronisieren.
- Aufgaben kopieren/löschen.
- Mobile Ansicht und Zeitplan-Druck verbessert.
