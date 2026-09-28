CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id   TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'admin'
                        CHECK (role IN ('admin', 'superadmin')),
  is_active     INTEGER NOT NULL DEFAULT 1
                        CHECK (is_active IN (0, 1)),
  created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id   TEXT    NOT NULL UNIQUE,
  first_name    TEXT,
  last_name     TEXT,
  username      TEXT,
  view_as_user  INTEGER NOT NULL DEFAULT 0
                        CHECK (view_as_user IN (0, 1)),
  created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS devices (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  model                     TEXT    NOT NULL UNIQUE,
  description               TEXT,
  device_image_file_id      TEXT,
  device_image_message_id   TEXT,
  is_available              INTEGER NOT NULL DEFAULT 1
                                    CHECK (is_available IN (0, 1)),
  is_deleted                INTEGER NOT NULL DEFAULT 0
                                    CHECK (is_deleted IN (0, 1)),
  created_at                TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS troubleshooting_guides (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id     INTEGER NOT NULL,
  problem_type  TEXT    NOT NULL
                        CHECK (problem_type IN ('PRINT', 'ANTENNA', 'CHARGER')),
  description   TEXT    NOT NULL,
  updated_by    TEXT,
  created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (device_id, problem_type),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS pos_requests (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id   TEXT    NOT NULL,
  device_id          INTEGER NOT NULL,
  device_model       TEXT    NOT NULL,
  applicant_type     TEXT    NOT NULL
                             CHECK (applicant_type IN ('individual', 'legal')),
  nationality        TEXT,
  full_name          TEXT,
  company_name       TEXT,
  phone_number       TEXT    NOT NULL,
  description        TEXT,
  status             TEXT    NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'reviewed', 'cancelled')),
  source_update_id   INTEGER,
  created_at         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE IF NOT EXISTS repair_requests (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id   TEXT    NOT NULL,
  device_id          INTEGER NOT NULL,
  problem_type       TEXT    NOT NULL
                             CHECK (problem_type IN ('PRINT', 'ANTENNA', 'CHARGER')),
  full_name          TEXT,
  phone_number       TEXT    NOT NULL,
  description        TEXT,
  status             TEXT    NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'reviewed', 'cancelled')),
  source_update_id   INTEGER,
  created_at         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE IF NOT EXISTS settings (
  id                             INTEGER PRIMARY KEY CHECK (id = 1),
  welcome_message                TEXT,
  welcome_image_file_id          TEXT,
  welcome_image_message_id       TEXT,
  admin_welcome_image_file_id    TEXT,
  admin_welcome_image_message_id TEXT,
  about_contact_description      TEXT,
  about_contact_image_file_id    TEXT,
  about_contact_image_message_id TEXT,
  new_warranty                   TEXT,
  used_warranty                  TEXT,
  intro_legal                    TEXT,
  note_iranian                   TEXT,
  note_foreign                   TEXT,
  updated_at                     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by                     TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS sessions (
  telegram_id  TEXT PRIMARY KEY,
  mode         TEXT NOT NULL,
  step         TEXT NOT NULL,
  data_json    TEXT NOT NULL DEFAULT '{}',
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS audit_logs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_telegram_id   TEXT    NOT NULL,
  admin_name          TEXT,
  admin_username      TEXT,
  action              TEXT    NOT NULL,
  target              TEXT,
  details             TEXT,
  created_at          TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS login_logs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_telegram_id   TEXT    NOT NULL,
  admin_name          TEXT,
  admin_username      TEXT,
  role                TEXT,
  created_at          TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS processed_updates (
  update_id    INTEGER PRIMARY KEY,
  status       TEXT    NOT NULL DEFAULT 'processing'
                       CHECK (status IN ('processing', 'completed', 'failed')),
  last_error   TEXT,
  created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS rate_limits (
  telegram_id   TEXT PRIMARY KEY,
  count         INTEGER NOT NULL DEFAULT 1 CHECK (count > 0),
  window_start  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

INSERT OR IGNORE INTO settings (
  id, welcome_message, about_contact_description,
  new_warranty, used_warranty, intro_legal, note_iranian, note_foreign
)
VALUES (
  1,
  'ادمین گرامی،
لطفا برای تغییر متن پیشفرض،
از بخش «شخصی سازی» اقدام نمایید.',
  'ادمین گرامی،
لطفا برای تغییر متن پیشفرض،
از بخش «شخصی سازی» اقدام نمایید.',
  'ادمین گرامی،
لطفا برای تغییر متن پیشفرض،
از بخش «شخصی سازی» اقدام نمایید.',
  'ادمین گرامی،
لطفا برای تغییر متن پیشفرض،
از بخش «شخصی سازی» اقدام نمایید.',
  'ادمین گرامی،
لطفا برای تغییر متن پیشفرض،
از بخش «شخصی سازی» اقدام نمایید.',
  'ادمین گرامی،
لطفا برای تغییر متن پیشفرض،
از بخش «شخصی سازی» اقدام نمایید.',
  'ادمین گرامی،
لطفا برای تغییر متن پیشفرض،
از بخش «شخصی سازی» اقدام نمایید.'
);

CREATE INDEX IF NOT EXISTS idx_devices_active
  ON devices(is_deleted, model);

CREATE INDEX IF NOT EXISTS idx_pos_status
  ON pos_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_repair_status
  ON repair_requests(status, created_at);

CREATE INDEX IF NOT EXISTS idx_pos_created
  ON pos_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_repair_created
  ON repair_requests(created_at);

CREATE INDEX IF NOT EXISTS idx_pos_user_device
  ON pos_requests(telegram_user_id, device_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_repair_user_device
  ON repair_requests(telegram_user_id, device_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_processed_updates_updated
  ON processed_updates(status, updated_at);

CREATE INDEX IF NOT EXISTS idx_sessions_updated
  ON sessions(updated_at);
CREATE INDEX IF NOT EXISTS idx_rate_limits_updated
  ON rate_limits(updated_at);

CREATE INDEX IF NOT EXISTS idx_audit_admin
  ON audit_logs(admin_telegram_id, created_at);
CREATE INDEX IF NOT EXISTS idx_login_admin
  ON login_logs(admin_telegram_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_source_update
  ON pos_requests(source_update_id)
  WHERE source_update_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_source_update
  ON repair_requests(source_update_id)
  WHERE source_update_id IS NOT NULL;
