/* ============================================================
 * POS Services — Telegram API Client
 * ============================================================ */

import { safeError } from "./utils.js";

function apiUrl(env, method) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const CAPTION_LIMIT = 1024;

/* ============================================================
 * Unicode-safe truncation
 * ------------------------------------------------------------
 * `Array.from` splits on code points, not grapheme clusters, so
 * ZWJ sequences (e.g. family emoji) can be cut mid-sequence and
 * rejected by Telegram. Intl.Segmenter is available on all
 * current Workers runtimes; the fallback is defensive only.
 * ============================================================ */

const segmenter =
  typeof Intl !== "undefined" && Intl.Segmenter
    ? new Intl.Segmenter("fa", { granularity: "grapheme" })
    : null;

function truncate(s, n) {
  const str = String(s ?? "");
  if (str.length <= n) return str;

  if (segmenter) {
    const segments = [...segmenter.segment(str)];
    if (segments.length <= n) return str;
    return segments.slice(0, n).map((x) => x.segment).join("");
  }

  // Fallback: code-point-aware truncation.
  const arr = Array.from(str);
  return arr.length <= n ? str : arr.slice(0, n).join("");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ============================================================
 * Core request function with retry/backoff
 * ============================================================ */

export async function tg(env, method, payload = {}, options = {}) {
  const maxAttempts = Number(options.retries ?? 3);
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response;
    try {
      response = await fetch(apiUrl(env, method), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts) {
        await sleep(300 * attempt);
        continue;
      }
      throw e;
    }

    let data;
    try {
      data = await response.json();
    } catch {
      if (attempt < maxAttempts && RETRYABLE.has(response.status)) {
        await sleep(300 * attempt);
        continue;
      }
      throw new Error(`Telegram returned non-JSON response (${response.status})`);
    }

    if (response.ok && data.ok) return data.result;

    const description = data?.description || `Telegram HTTP ${response.status}`;
    const code = data?.error_code ?? response.status;
    const retryAfter = Number(data?.parameters?.retry_after || 0);

    if (attempt < maxAttempts && RETRYABLE.has(code)) {
      if (code === 429 && retryAfter > 3) {
        const err = new Error(description);
        err.telegramCode = code;
        err.telegramParameters = data?.parameters;
        throw err;
      }
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : 300 * attempt;
      await sleep(waitMs);
      continue;
    }

    const err = new Error(description);
    err.telegramCode = code;
    err.telegramParameters = data?.parameters;
    throw err;
  }

  throw lastErr || new Error(`Telegram request failed: ${method}`);
}

/* ============================================================
 * Keyboard + button builders
 * ============================================================ */

export function kb(rows) {
  return { inline_keyboard: rows };
}

export function btn(text, data) {
  return {
    text: truncate(text, 64),
    callback_data: truncate(data, 64),
  };
}

/* ============================================================
 * Safe deletion + button fallback
 * ============================================================ */

async function safeDelete(env, chatId, messageId) {
  if (!messageId) return;
  try {
    await tg(env, "deleteMessage", { chat_id: chatId, message_id: messageId });
  } catch { /* ignore */ }
}

function isButtonError(e) {
  if (Number(e?.telegramCode) !== 400) return false;
  const m = String(e?.message || "");
  return /BUTTON|URL/i.test(m);
}

function stripRichButtons(keyboard) {
  if (!keyboard?.inline_keyboard) return null;
  const rows = keyboard.inline_keyboard
    .map((row) => row.filter((b) => b && b.callback_data))
    .filter((row) => row.length);
  return rows.length ? { inline_keyboard: rows } : null;
}

async function tgWithButtonFallback(env, method, payload) {
  try {
    return await tg(env, method, payload);
  } catch (e) {
    if (!isButtonError(e) || !payload?.reply_markup) throw e;

    console.error(
      `[telegram] ${method} rejected reply_markup, retrying plain:`,
      safeError(e)
    );

    const stripped = stripRichButtons(payload.reply_markup);
    const retryPayload = { ...payload };
    if (stripped) {
      retryPayload.reply_markup = stripped;
    } else {
      delete retryPayload.reply_markup;
    }

    return tg(env, method, retryPayload);
  }
}

/* ============================================================
 * High-level helpers
 * ============================================================ */

export async function sendPhoto(env, chatId, photo, caption = "", extra = {}) {
  return tg(env, "sendPhoto", {
    chat_id: chatId,
    photo,
    ...(caption ? { caption, parse_mode: "HTML" } : {}),
    ...extra,
  });
}

export async function answerCallback(env, callbackQueryId) {
  return tg(env, "answerCallbackQuery", { callback_query_id: callbackQueryId });
}

export async function editMessageMedia(env, chatId, messageId, media, extra = {}) {
  return tg(env, "editMessageMedia", {
    chat_id: chatId,
    message_id: messageId,
    media,
    ...extra,
  });
}

/**
 * Re-host an uploaded photo into the private channel so the bot
 * owns a durable `file_id`. Returns the new file_id + message_id.
 */
export async function clonePhotoToRepo(env, photoFileId, caption = "") {
  if (!env.PRIVATE_CHANNEL_ID) {
    throw new Error("PRIVATE_CHANNEL_ID is not configured");
  }
  if (!/^-100\d+$/.test(String(env.PRIVATE_CHANNEL_ID))) {
    throw new Error("PRIVATE_CHANNEL_ID format looks invalid (expected -100...)");
  }

  const message = await sendPhoto(env, env.PRIVATE_CHANNEL_ID, photoFileId, caption, {
    disable_notification: true,
  });

  const sizes = message?.photo || [];
  const storedFileId = sizes.at(-1)?.file_id;
  if (!storedFileId || !message?.message_id) {
    throw new Error("Telegram did not return a reusable photo file_id/message_id");
  }

  return { fileId: storedFileId, messageId: message.message_id };
}

/* ============================================================
 * CSV download — send a string as a document
 * ------------------------------------------------------------
 * Telegram's `sendDocument` requires multipart/form-data, so this
 * bypasses `tg()`. Retries mirror `tg()`: up to 3 attempts, honors
 * `retry_after`, and gives up on very long backoffs to avoid
 * burning Worker CPU time.
 * ============================================================ */

export async function sendDocumentFromString(
  env,
  chatId,
  filename,
  content,
  caption = ""
) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const MAX_ATTEMPTS = 3;
  let lastErr;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append("document", blob, filename);
    if (caption) {
      formData.append("caption", caption);
      formData.append("parse_mode", "HTML");
    }

    let res, data;
    try {
      res = await fetch(
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`,
        { method: "POST", body: formData }
      );
      data = await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(400 * attempt);
        continue;
      }
      throw e;
    }

    if (data.ok) return data.result;

    const code = data.error_code ?? res.status;
    const retryAfter = Number(data?.parameters?.retry_after || 0);

    if (attempt < MAX_ATTEMPTS && RETRYABLE.has(code)) {
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : 400 * attempt;
      // Bail out if Telegram asks us to wait too long — the request
      // would likely time out anyway.
      if (waitMs > 10000) break;
      await sleep(waitMs);
      continue;
    }

    const err = new Error(data.description || "sendDocument failed");
    err.telegramCode = code;
    throw err;
  }

  throw lastErr || new Error("sendDocument failed after retries");
}

/* ============================================================
 * Unified screen renderer
 * ------------------------------------------------------------
 * Handles all transitions between text-only and photo screens
 * using edit-in-place whenever possible so messages don't pile up.
 * ============================================================ */

export async function renderScreen(
  env,
  chat,
  text,
  keyboard,
  opts = {},
  imageFileId = null
) {
  const editId = opts.editMessageId;
  const prevWasPhoto = Boolean(opts.wasPhoto);
  const textStr = String(text);
  const replyMarkup = keyboard || undefined;

  /* ---- Target screen shows a photo ---- */
  if (imageFileId) {
    if (editId && prevWasPhoto) {
      if (textStr.length <= CAPTION_LIMIT) {
        try {
          return await tgWithButtonFallback(env, "editMessageMedia", {
            chat_id: chat,
            message_id: editId,
            media: {
              type: "photo",
              media: imageFileId,
              caption: textStr,
              parse_mode: "HTML",
            },
            reply_markup: replyMarkup,
          });
        } catch (e) {
          const m = String(e?.message || e);
          if (m.includes("message is not modified")) return null;
          console.error("editMessageMedia failed, falling back:", safeError(e));
        }
      } else {
        // Caption too long for editMessageMedia — replace the photo
        // and send the text as a follow-up message.
        await safeDelete(env, chat, editId);

        try {
          await tg(env, "sendPhoto", {
            chat_id: chat,
            photo: imageFileId,
          });
        } catch (e) {
          console.error("sendPhoto (long caption) failed:", safeError(e));
        }

        return tgWithButtonFallback(env, "sendMessage", {
          chat_id: chat,
          text: textStr,
          parse_mode: "HTML",
          reply_markup: replyMarkup,
        });
      }
    }

    if (editId) {
      await safeDelete(env, chat, editId);
    }

    if (textStr.length <= CAPTION_LIMIT) {
      try {
        return await tgWithButtonFallback(env, "sendPhoto", {
          chat_id: chat,
          photo: imageFileId,
          caption: textStr,
          parse_mode: "HTML",
          reply_markup: replyMarkup,
        });
      } catch (e) {
        console.error("sendPhoto with caption failed:", safeError(e));
      }
    } else {
      try {
        await tg(env, "sendPhoto", { chat_id: chat, photo: imageFileId });
      } catch (e) {
        console.error("sendPhoto (long caption) failed:", safeError(e));
      }
    }

    return tgWithButtonFallback(env, "sendMessage", {
      chat_id: chat,
      text: textStr,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
  }

  /* ---- Target screen is text-only ---- */
  if (editId && !prevWasPhoto) {
    try {
      return await tgWithButtonFallback(env, "editMessageText", {
        chat_id: chat,
        message_id: editId,
        text: textStr,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      });
    } catch (e) {
      const m = String(e?.message || e);
      if (m.includes("message is not modified")) return null;
      console.error("editMessageText failed, deleting stale message:", safeError(e));
      await safeDelete(env, chat, editId);
    }
  }

  if (editId && prevWasPhoto) {
    await safeDelete(env, chat, editId);
  }

  return tgWithButtonFallback(env, "sendMessage", {
    chat_id: chat,
    text: textStr,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
}
