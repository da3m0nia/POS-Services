/* ============================================================
 * POS Services — Roles, Audit Logging, Login Logging
 * ============================================================ */

import { all, one, run } from "./db.js";

/* ============================================================
 * Super Admin detection
 * ============================================================ */

export function isSuperAdmin(env, telegramId) {
  return String(telegramId) === String(env.SUPER_ADMIN_ID || "");
}

/* ============================================================
 * Role resolution
 * ============================================================ */

/**
 * Resolve the actor's role from the database.
 * Super Admin always wins, even if a matching admins row exists.
 */
export async function getRole(env, telegramId) {
  if (isSuperAdmin(env, telegramId)) {
    return {
      role: "superadmin",
      name: "Super Admin",
      telegram_id: String(telegramId),
    };
  }

  const a = await one(
    env.DB,
    "SELECT * FROM admins WHERE telegram_id=? AND is_active=1",
    String(telegramId)
  );
  if (!a) return { role: "user" };
  return { ...a, role: a.role || "admin" };
}

/* ============================================================
 * Login logging
 * ============================================================ */

const LOGIN_THROTTLE_MINUTES = 5;

/**
 * Log an admin login. Throttled to avoid flooding the table
 * when an admin repeatedly sends /start.
 */
export async function logLogin(env, user, role) {
  if (role === "user") return;

  const uid = String(user.id);

  const last = await one(
    env.DB,
    `SELECT created_at FROM login_logs
     WHERE admin_telegram_id = ?
     ORDER BY id DESC LIMIT 1`,
    uid
  );

  if (last) {
    const lastMs = new Date(
      String(last.created_at).replace(" ", "T") + "Z"
    ).getTime();
    const diffMin = (Date.now() - lastMs) / 60000;
    if (diffMin < LOGIN_THROTTLE_MINUTES) return;
  }

  await run(
    env.DB,
    `INSERT INTO login_logs(admin_telegram_id,admin_name,admin_username,role)
     VALUES(?,?,?,?)`,
    uid,
    user.first_name || "",
    user.username || "",
    role
  );
}

/* ============================================================
 * Audit logging
 * ============================================================ */

export async function audit(env, actor, action, target = "", details = "") {
  if (!actor || actor.role === "user") return;
  await run(
    env.DB,
    `INSERT INTO audit_logs(
       admin_telegram_id,admin_name,admin_username,action,target,details
     ) VALUES(?,?,?,?,?,?)`,
    String(actor.telegram_id || ""),
    actor.name || "",
    actor.username || "",
    action,
    String(target || "").slice(0, 120),
    String(details || "").slice(0, 1000)
  );
}

/* ============================================================
 * Admin recipients for notifications
 * ============================================================ */

export async function adminRecipients(env) {
  const rows = await all(
    env.DB,
    "SELECT telegram_id FROM admins WHERE is_active=1"
  );
  const ids = new Set(rows.map((x) => String(x.telegram_id)));
  if (env.SUPER_ADMIN_ID) ids.add(String(env.SUPER_ADMIN_ID));
  return [...ids];
}

/* ============================================================
 * Super Admin alerts (for critical failures)
 * ============================================================ */

/**
 * Send an urgent message directly to the Super Admin via the
 * Telegram Bot API.
 *
 * This bypasses `tg()` on purpose: alerting must work even if the
 * caller is already handling a failure, and it must never throw.
 * Failures are logged and swallowed.
 */
export async function alertSuperAdmin(env, text) {
  const id = String(env.SUPER_ADMIN_ID || "").trim();
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!id || !token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: id,
        text: String(text).slice(0, 4000),
        parse_mode: "HTML",
        disable_notification: false,
      }),
    });
  } catch (e) {
    console.error("alertSuperAdmin failed:", e?.message || e);
  }
}
