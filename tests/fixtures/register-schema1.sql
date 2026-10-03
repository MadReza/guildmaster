-- A schema-1 register as step 1 of bin/gm wrote it (PR #13), dumped with sqlite3 .dump.
-- tests/run.sh loads it to check the schema-2 migration keeps every row.
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE focus(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'ticket',
  repo TEXT NOT NULL,
  camp TEXT NOT NULL UNIQUE,
  branch TEXT NOT NULL,
  phase TEXT,
  opened_at TEXT NOT NULL
);
INSERT INTO focus VALUES(1,'appt-v2','ticket','/fixture/repo','/fixture/hall/camps/appt-v2','feature/CRM-8965','build','2026-10-03T01:50:17Z');
CREATE TABLE ticket(
  key TEXT PRIMARY KEY,
  focus_id INTEGER NOT NULL REFERENCES focus(id)
);
INSERT INTO ticket VALUES('CRM-8965',1);
CREATE TABLE message(
  id INTEGER PRIMARY KEY,
  focus_id INTEGER REFERENCES focus(id),
  at TEXT NOT NULL,
  session_id TEXT,
  prompt_id TEXT,
  words TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (disposition IN ('posting','addition','command','unplaced')),
  posting_id INTEGER REFERENCES posting(id),
  sorted_at TEXT
);
INSERT INTO message VALUES(1,1,'2026-10-03T01:50:18Z','s1','p1','the owner field is empty after save, fix it','posting',1,'2026-10-03T01:50:18Z');
INSERT INTO message VALUES(2,1,'2026-10-03T01:50:18Z','s1','p2','#1 also the edit form','addition',1,'2026-10-03T01:50:18Z');
CREATE TABLE posting(
  id INTEGER PRIMARY KEY,
  focus_id INTEGER NOT NULL REFERENCES focus(id),
  num INTEGER NOT NULL,
  slug TEXT NOT NULL,
  words TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('received','queued','active','parked','needs-you','done','failed','closed')),
  park_why TEXT,
  park_until TEXT,
  message_id INTEGER REFERENCES message(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (focus_id, num)
);
INSERT INTO posting VALUES(1,1,1,'fix-owner-empty','the owner field is empty after save, fix it','done',NULL,NULL,1,'2026-10-03T01:50:18Z','2026-10-03T01:50:19Z');
INSERT INTO posting VALUES(2,1,2,'save-button-grey-safari','the save button is grey on Safari','parked','waits for dev deploy','2000-01-01',NULL,'2026-10-03T01:50:18Z','2026-10-03T01:50:18Z');
CREATE TABLE event(
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  focus_id INTEGER REFERENCES focus(id),
  posting_id INTEGER REFERENCES posting(id),
  session_id TEXT,
  verb TEXT,
  detail TEXT,
  line TEXT
);
INSERT INTO event VALUES(1,'2026-10-03T01:50:17Z','patron','focus.opened',1,NULL,NULL,NULL,'repo /fixture/repo, branch feature/CRM-8965, camp /fixture/hall/camps/appt-v2','appt-v2 opened on feature/CRM-8965');
INSERT INTO event VALUES(2,'2026-10-03T01:50:18Z','gm','phase',1,NULL,NULL,'phase','intake','appt-v2 phase: intake (1/8)');
INSERT INTO event VALUES(3,'2026-10-03T01:50:18Z','patron','notice',1,1,'s1','received',NULL,'appt-v2#1 owner-field-empty-after received ("the owner field is empty after save, fix it")');
INSERT INTO event VALUES(4,'2026-10-03T01:50:18Z','patron','posting.addition',1,1,'s1',NULL,NULL,'appt-v2#1 owner-field-empty-after addition from the patron');
INSERT INTO event VALUES(5,'2026-10-03T01:50:18Z','party-leader','notice',1,1,NULL,'started',NULL,'appt-v2#1 fix-owner-empty started ("the owner field is empty after save, fix it")');
INSERT INTO event VALUES(6,'2026-10-03T01:50:18Z','party-leader','notice',1,1,NULL,'update','looked at both forms','appt-v2#1 fix-owner-empty update: looked at both forms ("the owner field is empty after save, fix it")');
INSERT INTO event VALUES(7,'2026-10-03T01:50:18Z','party-leader','notice',1,2,NULL,'received',NULL,'appt-v2#2 save-button-grey-safari received ("the save button is grey on Safari")');
INSERT INTO event VALUES(8,'2026-10-03T01:50:18Z','party-leader','notice',1,2,NULL,'parked','waits for dev deploy','appt-v2#2 save-button-grey-safari parked: waits for dev deploy (until 2000-01-01) ("the save button is grey on Safari")');
INSERT INTO event VALUES(9,'2026-10-03T01:50:19Z','party-leader','phase',1,NULL,NULL,'phase','build','appt-v2 phase: build (3/8)');
INSERT INTO event VALUES(10,'2026-10-03T01:50:19Z','party-leader','notice',1,1,NULL,'done','fixed in abc123','appt-v2#1 fix-owner-empty done: fixed in abc123 ("the owner field is empty after save, fix it")');
CREATE TABLE guard(
  session_id TEXT PRIMARY KEY,
  blocks INTEGER NOT NULL DEFAULT 0
);
INSERT INTO guard VALUES('s1',0);
CREATE INDEX posting_state ON posting(focus_id, state);
CREATE INDEX message_focus ON message(focus_id, sorted_at);
CREATE INDEX event_focus ON event(focus_id, id);
CREATE INDEX event_posting ON event(posting_id, id);
COMMIT;
PRAGMA user_version=1;
