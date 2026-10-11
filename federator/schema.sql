-- NEXUS-X National Federation pilot. Cloudflare D1 / SQLite.
-- Apply ONLY to a dedicated pilot D1 database, never a school inventory.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS publishers (
 publisher_id TEXT PRIMARY KEY,
 display_name TEXT NOT NULL,
 public_key TEXT NOT NULL,
 verified_by TEXT NOT NULL,
 verification_note TEXT NOT NULL DEFAULT '',
 active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1)),
 epoch INTEGER NOT NULL DEFAULT 0 CHECK(epoch >= 0),
 registered_at TEXT NOT NULL DEFAULT (datetime('now')),
 CHECK (length(publisher_id)=39),
 CHECK (length(public_key) BETWEEN 40 AND 50)
);

CREATE TABLE IF NOT EXISTS resources (
 resource_rowid INTEGER PRIMARY KEY AUTOINCREMENT,
 publisher_id TEXT NOT NULL REFERENCES publishers(publisher_id),
 resource_id TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK (revision >= 1),
 status TEXT NOT NULL CHECK (status IN ('published','withdrawn')),
 signer_public_key TEXT NOT NULL,
 record_json TEXT NOT NULL,
 title TEXT NOT NULL DEFAULT '',
 summary TEXT NOT NULL DEFAULT '',
 subject TEXT NOT NULL DEFAULT '',
 level TEXT NOT NULL DEFAULT '',
 license TEXT NOT NULL DEFAULT '',
 attribution TEXT NOT NULL DEFAULT '',
 keywords TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL,
 UNIQUE(publisher_id,resource_id)
);

CREATE TABLE IF NOT EXISTS feeds (
 publisher_id TEXT PRIMARY KEY REFERENCES publishers(publisher_id),
 public_key TEXT NOT NULL,
 signature TEXT NOT NULL,
 feed_json TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS resources_authorize_insert BEFORE INSERT ON resources
WHEN NOT EXISTS (SELECT 1 FROM publishers WHERE publisher_id=NEW.publisher_id
                  AND active=1 AND public_key=NEW.signer_public_key)
BEGIN SELECT RAISE(ABORT,'PUBLISHER_NOT_AUTHORIZED'); END;

CREATE TRIGGER IF NOT EXISTS resources_authorize_update BEFORE UPDATE ON resources
WHEN NOT EXISTS (SELECT 1 FROM publishers WHERE publisher_id=NEW.publisher_id
                  AND active=1 AND public_key=NEW.signer_public_key)
BEGIN SELECT RAISE(ABORT,'PUBLISHER_NOT_AUTHORIZED'); END;

CREATE TRIGGER IF NOT EXISTS resources_revision_guard BEFORE UPDATE ON resources
WHEN NEW.revision<OLD.revision
 OR (NEW.revision=OLD.revision AND NEW.record_json<>OLD.record_json)
 OR (OLD.status='withdrawn' AND NEW.status='published')
BEGIN SELECT RAISE(ABORT,'REVISION_CONFLICT'); END;

CREATE TRIGGER IF NOT EXISTS feeds_authorize_insert BEFORE INSERT ON feeds
WHEN NOT EXISTS (SELECT 1 FROM publishers WHERE publisher_id=NEW.publisher_id
                  AND active=1 AND public_key=NEW.public_key)
BEGIN SELECT RAISE(ABORT,'PUBLISHER_NOT_AUTHORIZED'); END;

CREATE TRIGGER IF NOT EXISTS feeds_authorize_update BEFORE UPDATE ON feeds
WHEN NOT EXISTS (SELECT 1 FROM publishers WHERE publisher_id=NEW.publisher_id
                  AND active=1 AND public_key=NEW.public_key)
BEGIN SELECT RAISE(ABORT,'PUBLISHER_NOT_AUTHORIZED'); END;

CREATE INDEX IF NOT EXISTS resources_publisher ON resources (publisher_id,resource_id);
CREATE INDEX IF NOT EXISTS resources_list ON resources (status,subject,level,resource_rowid);

CREATE VIRTUAL TABLE IF NOT EXISTS resource_fts
 USING fts5(title,summary,attribution,keywords,content='resources',content_rowid='resource_rowid',
 tokenize='unicode61 remove_diacritics 2');

CREATE TRIGGER IF NOT EXISTS resources_fts_insert AFTER INSERT ON resources BEGIN
 INSERT INTO resource_fts(rowid,title,summary,attribution,keywords)
 VALUES(NEW.resource_rowid,NEW.title,NEW.summary,NEW.attribution,NEW.keywords);
END;
CREATE TRIGGER IF NOT EXISTS resources_fts_delete AFTER DELETE ON resources BEGIN
 INSERT INTO resource_fts(resource_fts,rowid,title,summary,attribution,keywords)
 VALUES('delete',OLD.resource_rowid,OLD.title,OLD.summary,OLD.attribution,OLD.keywords);
END;
CREATE TRIGGER IF NOT EXISTS resources_fts_update AFTER UPDATE ON resources BEGIN
 INSERT INTO resource_fts(resource_fts,rowid,title,summary,attribution,keywords)
 VALUES('delete',OLD.resource_rowid,OLD.title,OLD.summary,OLD.attribution,OLD.keywords);
 INSERT INTO resource_fts(rowid,title,summary,attribution,keywords)
 VALUES(NEW.resource_rowid,NEW.title,NEW.summary,NEW.attribution,NEW.keywords);
END;
