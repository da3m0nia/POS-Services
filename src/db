/* ============================================================
 * POS Services — D1 Database Helpers
 * ============================================================ */

export async function one(db, sql, ...args) {
  return db.prepare(sql).bind(...args).first();
}

export async function all(db, sql, ...args) {
  const r = await db.prepare(sql).bind(...args).all();
  return r.results || [];
}

export async function run(db, sql, ...args) {
  return db.prepare(sql).bind(...args).run();
}

/* ============================================================
 * Sessions
 * ============================================================ */

export async function sessionGet(db, id) {
  const row = await one(db, "SELECT * FROM sessions WHERE telegram_id=?", String(id));
  if (!row) return null;

  let data = {};
  try {
    data = JSON.parse(row.data_json || "{}");
  } catch {
    data = {};
  }
  return { ...row, data };
}

export async function sessionSet(db, id, mode, step, data = {}) {
  await run(
    db,
    `INSERT INTO sessions(telegram_id,mode,step,data_json,updated_at)
     VALUES(?,?,?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(telegram_id) DO UPDATE SET
       mode=excluded.mode,
       step=excluded.step,
       data_json=excluded.data_json,
       updated_at=CURRENT_TIMESTAMP`,
    String(id),
    mode,
    step,
    JSON.stringify(data)
  );
}

export async function sessionClear(db, id) {
  await run(db, "DELETE FROM sessions WHERE telegram_id=?", String(id));
}

export async function sessionPush(db, id, nextStep, nextData = {}) {
  const cur = await sessionGet(db, id);
  if (!cur) return;

  const prevHistory = Array.isArray(cur.data?.__history) ? cur.data.__history : [];

  const snapshot = { ...cur.data };
  delete snapshot.__history;
  delete snapshot.__prompt_msg_id;

  const history = [...prevHistory, { step: cur.step, data: snapshot }].slice(-20);

  const newData = { ...nextData };
  delete newData.__history;
  delete newData.__prompt_msg_id;

  await sessionSet(db, id, cur.mode, nextStep, { ...newData, __history: history });
}

export async function sessionBack(db, id) {
  const cur = await sessionGet(db, id);
  if (!cur) return null;

  const history = Array.isArray(cur.data?.__history) ? [...cur.data.__history] : [];
  if (!history.length) return null;

  const last = history.pop();
  const newData = { ...last.data, __history: history };

  await sessionSet(db, id, cur.mode, last.step, newData);
  return { mode: cur.mode, step: last.step, data: newData };
}

/* ============================================================
 * Users
 * ============================================================ */

export async function upsertUser(db, user) {
  await run(
    db,
    `INSERT INTO users(telegram_id,first_name,last_name,username,updated_at)
     VALUES(?,?,?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(telegram_id) DO UPDATE SET
       first_name=excluded.first_name,
       last_name=excluded.last_name,
       username=excluded.username,
       updated_at=CURRENT_TIMESTAMP`,
    String(user.id),
    user.first_name || "",
    user.last_name || "",
    user.username || ""
  );
}

export async function setViewAsUser(db, telegramId, isUser) {
  await run(
    db,
    "UPDATE users SET view_as_user=?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?",
    isUser ? 1 : 0,
    String(telegramId)
  );
}

export async function getViewAsUser(db, telegramId) {
  const row = await one(
    db,
    "SELECT view_as_user FROM users WHERE telegram_id=?",
    String(telegramId)
  );
  return Boolean(row?.view_as_user);
}

/* ============================================================
 * Webhook idempotency
 * ============================================================ */

export async function beginUpdate(db, updateId) {
  const id = Number(updateId);
  if (!Number.isInteger(id)) return true;

  const insertResult = await run(
    db,
    `INSERT OR IGNORE INTO processed_updates(update_id,status)
     VALUES(?, 'processing')`,
    id
  );

  if (insertResult?.meta?.changes === 1) return true;

  const row = await one(
    db,
    "SELECT status, updated_at FROM processed_updates WHERE update_id=?",
    id
  );
  if (!row) return true;
  if (row.status === "completed") return false;

  if (row.status === "processing") {
    const stale = await one(
      db,
      `SELECT CASE WHEN updated_at <= datetime('now','-2 minutes') THEN 1 ELSE 0 END AS stale
       FROM processed_updates WHERE update_id=?`,
      id
    );
    if (stale?.stale !== 1) return false;
  }

  await run(
    db,
    `UPDATE processed_updates
     SET status='processing', updated_at=CURRENT_TIMESTAMP, last_error=NULL
     WHERE update_id=?`,
    id
  );
  return true;
}

export async function completeUpdate(db, updateId) {
  if (!Number.isInteger(Number(updateId))) return;
  await run(
    db,
    `UPDATE processed_updates
     SET status='completed', updated_at=CURRENT_TIMESTAMP, last_error=NULL
     WHERE update_id=?`,
    Number(updateId)
  );
}

export async function failUpdate(db, updateId, error) {
  if (!Number.isInteger(Number(updateId))) return;
  await run(
    db,
    `UPDATE processed_updates
     SET status='failed', updated_at=CURRENT_TIMESTAMP, last_error=?
     WHERE update_id=?`,
    String(error || "").slice(0, 500),
    Number(updateId)
  );
}

/* ============================================================
 * Rate limiting
 * ============================================================ */

async function checkOneLimit(db, key, maxCount, windowMinutes) {
  try {
    const insertRes = await run(
      db,
      `INSERT OR IGNORE INTO rate_limits(telegram_id, count, window_start, updated_at)
       VALUES(?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      key
    );
    if (insertRes?.meta?.changes === 1) return true;

    const resetRes = await run(
      db,
      `UPDATE rate_limits
       SET count = 1, window_start = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = ?
         AND (strftime('%s','now') - strftime('%s', window_start)) >= ? * 60`,
      key,
      windowMinutes
    );
    if (resetRes?.meta?.changes === 1) return true;

    const incRes = await run(
      db,
      `UPDATE rate_limits
       SET count = count + 1, updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = ? AND count < ?`,
      key,
      maxCount
    );
    return incRes?.meta?.changes === 1;
  } catch (e) {
    console.error("rate limit check failed (fail-open):", e?.message || e);
    return true;
  }
}

export async function checkRateLimit(db, telegramId) {
  const globalKey = `${telegramId}:__global__:1m`;
  return checkOneLimit(db, globalKey, 30, 1);
}

export async function checkActionRateLimit(db, telegramId, action, maxCount, windowMinutes) {
  const key = `${telegramId}:${action}:${windowMinutes}m`;
  return checkOneLimit(db, key, maxCount, windowMinutes);
}

/* ============================================================
 * Scheduled cleanup
 * ============================================================ */

export async function cleanupOldRows(
  db,
  { updatesDays = 7, sessionsDays = 2, auditDays = 90, loginDays = 90 } = {}
) {
  await run(
    db,
    `DELETE FROM processed_updates
     WHERE status = 'completed'
       AND updated_at < datetime('now', ?)`,
    `-${updatesDays} days`
  );

  await run(
    db,
    `DELETE FROM processed_updates
     WHERE status = 'failed'
       AND updated_at < datetime('now', '-30 days')`
  );

  await run(
    db,
    `DELETE FROM processed_updates
     WHERE status = 'processing'
       AND updated_at < datetime('now', '-1 day')`
  );

  await run(
    db,
    `DELETE FROM sessions WHERE updated_at < datetime('now', ?)`,
    `-${sessionsDays} days`
  );
  await run(
    db,
    `DELETE FROM audit_logs WHERE created_at < datetime('now', ?)`,
    `-${auditDays} days`
  );
  await run(
    db,
    `DELETE FROM login_logs WHERE created_at < datetime('now', ?)`,
    `-${loginDays} days`
  );
  await run(
    db,
    `DELETE FROM rate_limits WHERE updated_at < datetime('now', '-1 day')`
  );
}
