# Changelog

## v0.4.38

- Header-Kennzahl „Gäste geplant“ zu „Gäste“ zurückbenannt.
- Gästezahl bleibt leer, wenn keine konkrete Zielgruppe gesetzt ist.
- Helferanzahl als eigene Header-Kennzahl ergänzt.

## v0.4.37

- Aufgabenkarte auf ein einziges Bemerkungsfeld reduziert.
- Bestehende alte Aufgabenkommentare werden im verbleibenden Bemerkungsfeld angezeigt.

## v0.4.36

- Drag-&-Drop auf Touch-Geräten zusätzlich per Pointer-Erkennung deaktiviert, auch auf Tablets mit großem Viewport.
- Header-Beschriftung zu „Gäste geplant“ geändert, damit klar ist: Das ist die geschätzte Gästezahl, nicht die Teamgröße.

## v0.4.35

- Native Drag-Leiste auf Smartphones ausgeblendet, damit mobile Browser keine Task-ID als Suchtext öffnen.
- Mobile Statusbuttons „Offen“, „In Arbeit“ und „Erledigt“ direkt auf Aufgabenkarte ergänzt.

## v0.4.34

- Mobiles Event-Untermenü von horizontalem Scrollen auf sichtbares 2-Spalten-Menü umgestellt.
- Touch-Flächen der Event-Tabs auf Smartphones vergrößert.

## v0.4.33

- Doppelte Passwortänderung aus dem Adminbereich entfernt; Passwort und E-Mail liegen im Profil.
- Entfernte Event-Helfer ohne weitere Event-Zugehörigkeit werden aus der Nutzertabelle bereinigt.
- E-Mail-Änderungen können verwaiste Helfer-Adressen übernehmen, statt daran zu scheitern.

## v0.4.32

- Startassistent im Event zu einer vollständigen Setup-Checkliste erweitert.
- Event-Ersteller werden nach dem Anlegen direkt ins neue Event geführt.
- „Aktionen“ in der Oberfläche zu verständlicheren „Arbeitsbereichen“ umbenannt.
- Helfer starten im Event mit einer reduzierten Ansicht „Meine Aufgaben“.
- Unteraufgaben können per SMART-orientierter Eingabe angelegt werden.
- Benachrichtigungen zeigen relevante offene Punkte und führen direkt in den passenden Arbeitsbereich.
- E-Mail-Benachrichtigungen für neue Zuweisungen, Statusänderungen und geänderte Anhänge mit direktem Aufgabenlink ergänzt.
- Template-Workflow-Ausbau in der Roadmap vorgemerkt.

## v0.4.31

- Profilbereich kann eine E-Mail-Änderung anfordern.
- Neue E-Mail-Adresse wird erst nach Verifikation per Bestätigungslink übernommen.
- Event-Team-Einträge werden nach bestätigter E-Mail-Änderung synchronisiert.

## v0.4.30

- Tooltips werden jetzt als feste Overlay-Hinweise angezeigt und nicht mehr von Karten oder Panels abgeschnitten.
- Flyer-Upload im Event-Steckbrief ergänzt.
- Kleine Flyer-Vorschau für hochgeladene Bilddateien ergänzt.

## v0.4.29

- Aufgaben-Akkordeons können jetzt vollständig zugeklappt werden.
- Button „Alle zuklappen“ im Aufgabenfilter ergänzt.

## v0.4.28

- Aufgaben-Detailfelder klar beschriftet, damit SMART-Beschreibung und optionale Bemerkung nicht mehr wie doppelte Kommentarfelder wirken.

## v0.4.27

- Aufgabenbeschreibung in Kanban-Karten deutlich vergrößert.
- Bearbeitungsfelder in Aufgaben mit mehr Abstand lesbarer gemacht.
- Upload-Schaltfläche in „Anhang hochladen“ umbenannt.
- Infrastruktur-Verantwortliche können direkt im Infrastruktur-Tab neu angelegt und zugewiesen werden.

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
