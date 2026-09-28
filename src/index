/* ============================================================
 * POS Services — Worker Entry Point
 * ============================================================
 * HTTP router, Telegram webhook, idempotency, and scheduled
 * cleanup.
 *
 * Note: CSV exports are handled inside the admin bot (via
 * `admin.js`), not through HTTP endpoints. See CHANGELOG 1.0.1
 * for the rationale (free-plan CPU budget).
 * ============================================================ */

import { answerCallback, renderScreen, tg } from "./telegram.js";
import {
  failUpdate,
  beginUpdate,
  completeUpdate,
  upsertUser,
  cleanupOldRows,
  getViewAsUser,
  setViewAsUser,
  sessionClear,
  checkRateLimit,
} from "./db.js";
import { getRole, logLogin, alertSuperAdmin } from "./auth.js";
import { userStart, userCallback, userMessage } from "./user.js";
import { adminStart, adminCallback, adminMessage } from "./admin.js";
import { roleChooser } from "./utils.js";

/* ============================================================
 * HTTP helpers
 * ============================================================ */

function securityHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "geolocation=(), microphone=(), camera=()",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...securityHeaders(),
    },
  });
}

function configured(env, key) {
  return Boolean(String(env[key] || "").trim());
}

/**
 * Constant-time string comparison to avoid timing attacks
 * on secret tokens.
 */
function constantTimeEqual(a, b) {
  const aStr = String(a ?? "");
  const bStr = String(b ?? "");
  if (aStr.length !== bStr.length) return false;

  let diff = 0;
  for (let i = 0; i < aStr.length; i++) {
    diff |= aStr.charCodeAt(i) ^ bStr.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Authorize setup endpoints. Accepts any of:
 *   • Authorization: Bearer <token>
 *   • X-Webhook-Setup-Token: <token>
 *   • ?token=<token> query parameter
 */
function authorizedSetup(request, env) {
  const expected = String(env.WEBHOOK_SETUP_TOKEN || "");
  if (!expected) return false;

  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token") || "";
  const auth = request.headers.get("authorization") || "";
  const headerToken = request.headers.get("x-webhook-setup-token") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  return (
    constantTimeEqual(bearer, expected) ||
    constantTimeEqual(headerToken, expected) ||
    constantTimeEqual(queryToken, expected)
  );
}

function verifyTelegramSecret(request, env) {
  const expected = String(env.TELEGRAM_WEBHOOK_SECRET || "");
  const received = request.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!expected) return false;
  return constantTimeEqual(received, expected);
}

/* ============================================================
 * /setup-webhook
 * ============================================================ */

async function setupWebhook(request, env) {
  if (!authorizedSetup(request, env)) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!configured(env, "TELEGRAM_WEBHOOK_SECRET")) {
    return json({ ok: false, error: "TELEGRAM_WEBHOOK_SECRET is not configured" }, 500);
  }

  const url = new URL(request.url);
  const webhookUrl =
    String(env.PUBLIC_WEBHOOK_URL || "").trim() || `${url.origin}/telegram/webhook`;

  let parsedWebhookUrl;
  try {
    parsedWebhookUrl = new URL(webhookUrl);
  } catch {
    return json({ ok: false, error: "PUBLIC_WEBHOOK_URL is not a valid URL" }, 500);
  }
  if (parsedWebhookUrl.protocol !== "https:") {
    return json({ ok: false, error: "Webhook URL must use HTTPS" }, 500);
  }

  const result = await tg(env, "setWebhook", {
    url: webhookUrl,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
    max_connections: 20,
    drop_pending_updates:
      String(env.DROP_PENDING_UPDATES || "false").toLowerCase() === "true",
  });

  return json({
    ok: Boolean(result),
    webhook_url: webhookUrl,
    allowed_updates: ["message", "callback_query"],
  });
}

/* ============================================================
 * Error notification helper
 * ============================================================ */

/**
 * Try to tell the user something went wrong. Bypasses `tg()` on
 * purpose: this is called from the outer catch block, so it must
 * never throw and must never recurse into the same failure path.
 */
async function notifyUserOfFailure(env, update) {
  try {
    const failMsg = update?.message;
    const failCb = update?.callback_query;
    const failChat = failMsg?.chat?.id ?? failCb?.message?.chat?.id;
    const failChatType = failMsg?.chat?.type ?? failCb?.message?.chat?.type;

    if (!failChat || failChatType !== "private") return;

    // Close any spinner first.
    if (failCb?.id) {
      await tg(env, "answerCallbackQuery", {
        callback_query_id: failCb.id,
        text: "⚠️ خطای موقت سرور. دوباره تلاش کنید.",
      }).catch(() => {});
    }

    await tg(env, "sendMessage", {
      chat_id: failChat,
      text:
        "⚠️ <b>خطای موقت سرور</b>\n" +
        "لطفاً چند لحظه دیگر دوباره تلاش کنید.",
      parse_mode: "HTML",
    }).catch(() => {});
  } catch { /* swallow — never mask the original error */ }
}

/**
 * Alert the Super Admin when a burst of failures is detected.
 * Fires at most once per burst (threshold crossing), not on every
 * subsequent failure.
 */
async function maybeAlertOnFailureBurst(env, e) {
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM processed_updates
       WHERE status='failed'
         AND updated_at >= datetime('now','-5 minutes')`
    ).first();

    if (Number(row?.n || 0) === 5) {
      await alertSuperAdmin(
        env,
        `🚨 <b>هشدار: ۵ خطا در ۵ دقیقه اخیر</b>\n\n` +
          `آخرین خطا:\n<code>${String(e?.message || e).slice(0, 200)}</code>`
      );
    }
  } catch { /* ignore — alerting must not break the request */ }
}

/* ============================================================
 * Worker entry point
 * ============================================================ */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    /* ---- /health ---- */
    if (request.method === "GET" && url.pathname === "/health") {
      try {
        await env.DB.prepare("SELECT 1").first();
        return json({ ok: true, db: "up", ts: Date.now() });
      } catch (e) {
        console.error("health check failed:", e?.message || e);
        return json({ ok: false, db: "down" }, 503);
      }
    }

    /* ---- /setup-webhook ---- */
    if (
      (request.method === "GET" || request.method === "POST") &&
      url.pathname === "/setup-webhook"
    ) {
      try {
        return await setupWebhook(request, env);
      } catch (e) {
        console.error("setup-webhook error:", e?.message || e);
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    /* ---- /webhook-info ---- */
    if (
      (request.method === "GET" || request.method === "POST") &&
      url.pathname === "/webhook-info"
    ) {
      if (!authorizedSetup(request, env)) {
        return new Response("Unauthorized", { status: 401 });
      }
      try {
        return json(await tg(env, "getWebhookInfo"));
      } catch (e) {
        console.error("webhook-info error:", e?.message || e);
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    /* ---- Fallthrough (non-webhook) ---- */
    if (request.method !== "POST" || url.pathname !== "/telegram/webhook") {
      return new Response("🤖 POS Services is running", { status: 200 });
    }

    /* ---- /telegram/webhook ---- */
    if (!verifyTelegramSecret(request, env)) {
      return new Response("Forbidden", { status: 403 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    const updateId = Number(update?.update_id);
    if (!(await beginUpdate(env.DB, updateId))) {
      return new Response("ok", { status: 200 });
    }

    try {
      const msg = update?.message;
      const cb = update?.callback_query;
      const chat = msg?.chat?.id ?? cb?.message?.chat?.id;
      const user = msg?.from ?? cb?.from;

      if (!chat || !user) {
        await completeUpdate(env.DB, updateId);
        return new Response("ok", { status: 200 });
      }

      /* Private chats only — applies to both messages and callbacks. */
      const chatType = msg?.chat?.type ?? cb?.message?.chat?.type;
      if (chatType && chatType !== "private") {
        await completeUpdate(env.DB, updateId);
        return new Response("ok", { status: 200 });
      }

      await upsertUser(env.DB, user);
      const role = await getRole(env, user.id);
      const isSuper = role.role === "superadmin";
      const isUserView = isSuper && (await getViewAsUser(env.DB, user.id));

      /* ---- Global rate limit ---- */
      const allowed = await checkRateLimit(env.DB, user.id);
      if (!allowed) {
        /* Answer the callback first so the inline button does not
         * spin forever. Telegram shows the text as a small toast. */
        if (cb?.id) {
          try {
            await tg(env, "answerCallbackQuery", {
              callback_query_id: cb.id,
              text: "⚠️ تعداد درخواست‌های شما زیاد است. کمی صبر کنید.",
              show_alert: false,
            });
          } catch { /* ignore */ }
        }

        if (msg?.chat?.type === "private") {
          await tg(env, "sendMessage", {
            chat_id: chat,
            text:
              "⚠️ <b>تعداد درخواست‌های شما زیاد است</b>\n" +
              "لطفاً ۱ دقیقه صبر کنید و دوباره تلاش کنید",
            parse_mode: "HTML",
          }).catch(() => {});
        }
        await completeUpdate(env.DB, updateId);
        return new Response("ok", { status: 200 });
      }

      /* ---- Callback query ---- */
      if (cb) {
        try {
          await answerCallback(env, cb.id);
        } catch (e) {
          console.error("answerCallbackQuery failed:", e?.message || e);
        }

        const cbData = String(cb.data || "");
        const editMessageId = cb?.message?.message_id ?? null;
        const wasPhoto = Boolean(cb?.message?.photo?.length);

        /* ---- Role chooser ---- */
        if (cbData.startsWith("r:role:")) {
          if (!isSuper) {
            /* Edit in place so the old buttons disappear. */
            await renderScreen(env, chat, "⛔ <b>دسترسی ندارید</b>", null, {
              editMessageId,
              wasPhoto,
            });
          } else {
            if (editMessageId) {
              try {
                await tg(env, "deleteMessage", {
                  chat_id: chat,
                  message_id: editMessageId,
                });
              } catch { /* ignore */ }
            }
            if (cbData === "r:role:user") {
              await setViewAsUser(env.DB, user.id, true);
              await sessionClear(env.DB, String(user.id));
              await userStart(env, chat, user);
            } else if (cbData === "r:role:admin") {
              await setViewAsUser(env.DB, user.id, false);
              await sessionClear(env.DB, String(user.id));
              await adminStart(env, chat, role);
            } else {
              await renderScreen(env, chat, "⚠️ <b>گزینه نامعتبر است</b>", roleChooser());
            }
          }
          await completeUpdate(env.DB, updateId);
          return new Response("ok", { status: 200 });
        }

        /* ---- Close notification (any user) ---- */
        if (cbData === "u:close") {
          if (editMessageId) {
            try {
              await tg(env, "deleteMessage", {
                chat_id: chat,
                message_id: editMessageId,
              });
            } catch { /* ignore */ }
          }
          await completeUpdate(env.DB, updateId);
          return new Response("ok", { status: 200 });
        }

        /* ---- Normal routing ---- */
        if (isSuper && isUserView) {
          await userCallback(env, chat, user, cbData, updateId, ctx, editMessageId, wasPhoto);
        } else if (role.role === "user") {
          await userCallback(env, chat, user, cbData, updateId, ctx, editMessageId, wasPhoto);
        } else {
          await adminCallback(env, chat, cbData, role, editMessageId, ctx, wasPhoto);
        }
      }
      /* ---- Text message ---- */
      else if (msg) {
        if (msg.text?.startsWith("/start")) {
          await logLogin(env, user, role.role);

          /* Clear in-progress sessions so a stale form can't leak. */
          await sessionClear(env.DB, String(user.id));

          if (isSuper && isUserView) {
            /* Super Admin in view-as-user mode → show role chooser. */
            await renderScreen(
              env,
              chat,
              "👋 <b>درود</b>\n✨ <b>خوش آمدید</b>\n\n🔀 <b>لطفاً نوع ورود خود را انتخاب کنید:</b>",
              roleChooser()
            );
          } else if (isSuper) {
            /* Super Admin in admin mode → straight to dashboard. */
            await adminStart(env, chat, role);
          } else if (role.role === "user") {
            await userStart(env, chat, user);
          } else {
            await adminStart(env, chat, role);
          }
        } else if (isSuper && isUserView) {
          await userMessage(env, chat, user, msg, updateId, ctx);
        } else if (role.role === "user") {
          await userMessage(env, chat, user, msg, updateId, ctx);
        } else {
          await adminMessage(env, chat, user, msg, role, updateId, ctx);
        }
      }

      await completeUpdate(env.DB, updateId);
      return new Response("ok", { status: 200 });
    } catch (e) {
      console.error("webhook processing error:", e?.message || e);
      await failUpdate(env.DB, updateId, e?.message || String(e));

      /* Notify the user, then alert the Super Admin on burst. */
      await notifyUserOfFailure(env, update);
      ctx.waitUntil(maybeAlertOnFailureBurst(env, e));

      return new Response("Internal Server Error", { status: 500 });
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        try {
          await cleanupOldRows(env.DB, {
            updatesDays: 7,
            sessionsDays: 2,
            auditDays: 90,
            loginDays: 90,
          });
        } catch (e) {
          console.error("scheduled cleanup failed:", e?.message || e);
        }
      })()
    );
  },
};
