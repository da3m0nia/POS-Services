/* ============================================================
 * POS Services — User Flows
 * ============================================================
 * Handles: device catalogue, POS purchase requests, repair
 * requests, warranty pages, and the About / Contact screen.
 * ============================================================ */

import {
  all,
  one,
  run,
  sessionBack,
  sessionClear,
  sessionGet,
  sessionPush,
  sessionSet,
  checkActionRateLimit,
} from "./db.js";
import { btn, kb, renderScreen, tg } from "./telegram.js";
import {
  MAX,
  PROBLEM_TYPES,
  esc,
  faDigits,
  hasPersianDigits,
  isCancelText,
  normalizePhone,
  paginate,
  problemFa,
  safeError,
  safePage,
  trimText,
  userMenu,
  userNavRow,
  userHomeRow,
} from "./utils.js";
import { adminRecipients } from "./auth.js";

const DEVICES_PAGE_SIZE = 8;

/* ============================================================
 * Shared helpers
 * ============================================================ */

async function loadApplicantSettings(env) {
  const s = await one(
    env.DB,
    "SELECT intro_legal, note_iranian, note_foreign FROM settings WHERE id=1"
  );
  return {
    intro_legal: s?.intro_legal || "",
    note_iranian: s?.note_iranian || "",
    note_foreign: s?.note_foreign || "",
  };
}

async function savePromptMsgId(env, userId, msgId) {
  if (!msgId) return;
  const s = await sessionGet(env.DB, String(userId));
  if (!s) return;
  await sessionSet(env.DB, String(userId), s.mode, s.step, {
    ...s.data,
    __prompt_msg_id: msgId,
  });
}

async function deleteUserMsg(env, chat, msgId) {
  if (!msgId) return;
  try {
    await tg(env, "deleteMessage", { chat_id: chat, message_id: msgId });
  } catch { /* ignore */ }
}

async function userAnswer(env, chat, text, keyboard, opts = {}, withImage = false) {
  let imageFileId = null;
  if (opts.imageFileId !== undefined) {
    imageFileId = opts.imageFileId || null;
  } else if (withImage) {
    const s = await one(
      env.DB,
      "SELECT welcome_image_file_id FROM settings WHERE id=1"
    );
    imageFileId = s?.welcome_image_file_id || null;
  }
  return renderScreen(env, chat, text, keyboard, opts, imageFileId);
}

/* ============================================================
 * Screens — Home, About, Confirmation
 * ============================================================ */

async function showHome(env, chat, opts = {}) {
  const s = await one(env.DB, "SELECT welcome_message FROM settings WHERE id=1");
  const rawText = String(s?.welcome_message || "").trim();
  const text = rawText ? esc(rawText) : "🏠 <b>منوی اصلی</b>";
  return userAnswer(env, chat, text, userMenu(), opts, true);
}

async function returnToHomeInline(env, chat, opts, requestId, isRepair) {
  const label = isRepair
    ? "درخواست پشتیبانی فنی ثبت شد"
    : "درخواست شما ثبت شد";

  const s = await one(env.DB, "SELECT welcome_message FROM settings WHERE id=1");
  const rawText = String(s?.welcome_message || "").trim();
  const welcome = rawText ? esc(rawText) : "🏠 <b>منوی اصلی</b>";

  const text =
    `✅ <b>${label}</b>\n` +
    `🆔 <b>شماره درخواست:</b> #${faDigits(requestId)}\n` +
    `👥 <b>کارشناسان آن را بررسی خواهند کرد</b>\n\n` +
    `━━━━━━━━━━━━━\n\n` +
    welcome;

  return userAnswer(env, chat, text, userMenu(), opts, false);
}

async function showAbout(env, chat, opts = {}) {
  const s = await one(env.DB, "SELECT * FROM settings WHERE id=1");
  const rawText = String(s?.about_contact_description || "").trim();
  const body = rawText ? esc(rawText) : "📄 <b>ثبت‌نشده</b>";
  const text = "📞 <b>درباره‌ما - تماس‌باما</b>\n\n" + body;

  return userAnswer(
    env, chat, text, userMenu(),
    { ...opts, imageFileId: s?.about_contact_image_file_id || null },
    false
  );
}

export async function userStart(env, chat, user) {
  await sessionClear(env.DB, String(user.id));
  return showHome(env, chat);
}

/* ============================================================
 * POS flow — step screens
 * ============================================================ */

async function askApplicantType(env, chat, userId, deviceId, opts = {}) {
  const d = await one(
    env.DB,
    "SELECT id,model FROM devices WHERE id=? AND is_deleted=0",
    deviceId
  );
  if (!d) {
    return userAnswer(env, chat, "❓ <b>دستگاه پیدا نشد</b>", userMenu(), opts, false);
  }

  const s = await sessionGet(env.DB, userId);
  const fromPage = Number(s?.data?.from_page) || 1;
  const fromDevice = Boolean(s?.data?.from_device);
  const backCb = fromDevice
    ? (fromPage > 1 ? `u:device:${d.id}:${fromPage}` : `u:device:${d.id}`)
    : (fromPage > 1 ? `u:request:p:${fromPage}` : "u:request");

  const res = await userAnswer(
    env,
    chat,
    `💳 <b>مدل دستگاه انتخاب‌شده:</b> <b>${esc(d.model)}</b>\n\n👥 <b>لطفا نوع پذیرنده را انتخاب کنید:</b>`,
    kb([
      [btn("👤 پذیرنده حقیقی", "u:individual")],
      [btn("🏢 پذیرنده حقوقی", "u:legal")],
      userNavRow(backCb),
    ]),
    opts,
    false
  );
  await savePromptMsgId(env, userId, res?.message_id);
  return res;
}

async function askIntro(env, chat, userId, opts = {}) {
  const s = await loadApplicantSettings(env);
  const res = await userAnswer(
    env,
    chat,
    `${esc(s.intro_legal)}\n\n📋 <b>برای ادامه و تکمیل فرم، «✅ ادامه» را بزنید</b>`,
    kb([[btn("✅ ادامه", "u:intro:continue")], userNavRow("u:back")]),
    opts,
    false
  );
  await savePromptMsgId(env, userId, res?.message_id);
  return res;
}

async function askNationality(env, chat, userId, opts = {}) {
  const res = await userAnswer(
    env,
    chat,
    "🌐 <b>تابعیت را انتخاب کنید:</b>",
    kb([
      [btn("🇮🇷 ایرانی", "u:nat:iran")],
      [btn("🌍 اتباع خارجی", "u:nat:foreign")],
      userNavRow("u:back"),
    ]),
    opts,
    false
  );
  await savePromptMsgId(env, userId, res?.message_id);
  return res;
}

async function askNote(env, chat, userId, noteText, opts = {}) {
  const res = await userAnswer(
    env,
    chat,
    `${esc(noteText)}\n\n📋 <b>برای ادامه و تکمیل فرم، «✅ ادامه» را بزنید</b>`,
    kb([[btn("✅ ادامه", "u:nat:continue")], userNavRow("u:back")]),
    opts,
    false
  );
  await savePromptMsgId(env, userId, res?.message_id);
  return res;
}

async function askFullName(env, chat, userId, opts = {}) {
  const res = await userAnswer(
    env,
    chat,
    "✍️ <b>نام و نام خانوادگی را وارد کنید:</b>",
    kb([[btn("⏭️ رد کردن", "u:name:skip")], userNavRow("u:back")]),
    opts,
    false
  );
  await savePromptMsgId(env, userId, res?.message_id);
  return res;
}

async function askCompanyName(env, chat, userId, opts = {}) {
  const res = await userAnswer(
    env,
    chat,
    "🏢 <b>نام شرکت را وارد کنید:</b>",
    kb([[btn("⏭️ رد کردن", "u:company:skip")], userNavRow("u:back")]),
    opts,
    false
  );
  await savePromptMsgId(env, userId, res?.message_id);
  return res;
}

async function askPhone(env, chat, userId, opts = {}) {
  const res = await userAnswer(
    env,
    chat,
    "📞 <b>شماره تلفن را وارد کنید:</b> <b>(فقط اعداد انگلیسی)</b>",
    kb([userNavRow("u:back")]),
    opts,
    false
  );
  await savePromptMsgId(env, userId, res?.message_id);
  return res;
}

async function askDescription(env, chat, userId, isRepair, opts = {}) {
  const text = isRepair
    ? "📝 <b>شرح کوتاهی از مشکل یا درخواست خود را بنویسید، در غیر اینصورت «⏭️ رد کردن» را بزنید</b>"
    : "📝 <b>در صورت نیاز توضیحات تکمیلی را بنویسید، در غیر اینصورت «⏭️ رد کردن» را بزنید</b>";
  const res = await userAnswer(
    env,
    chat,
    text,
    kb([[btn("⏭️ رد کردن", "u:desc:skip")], userNavRow("u:back")]),
    opts,
    false
  );
  await savePromptMsgId(env, userId, res?.message_id);
  return res;
}

/* ============================================================
 * Repair flow — step screens
 * ============================================================ */

async function askRepairProblem(env, chat, userId, deviceId, opts = {}) {
  const d = await one(
    env.DB,
    "SELECT id,model FROM devices WHERE id=? AND is_deleted=0",
    deviceId
  );
  if (!d) {
    return userAnswer(env, chat, "❓ <b>دستگاه پیدا نشد</b>", userMenu(), opts, false);
  }

  const s = await sessionGet(env.DB, userId);
  const fromPage = Number(s?.data?.from_page) || 1;
  const backCb = fromPage > 1 ? `u:repair:p:${fromPage}` : "u:repair";

  const res = await userAnswer(
    env,
    chat,
    `💳 <b>مدل دستگاه انتخاب‌شده:</b> <b>${esc(d.model)}</b>\n\n🛠️ <b>مشکل دستگاه شما در چه زمینه‌ای می‌باشد:</b>`,
    kb([
      ...PROBLEM_TYPES.map((p) => [btn(problemFa[p], `u:p:${p}`)]),
      userNavRow(backCb),
    ]),
    opts,
    false
  );
  await savePromptMsgId(env, userId, res?.message_id);
  return res;
}

/* ============================================================
 * Step renderer (used after session back-navigation)
 * ============================================================ */

async function renderUserStep(env, chat, userId, session, opts = {}) {
  if (!session) return showHome(env, chat, opts);
  const { mode, step, data = {} } = session;

  if (mode === "pos") {
    if (step === "applicant_type")
      return askApplicantType(env, chat, userId, data.device_id, opts);
    if (step === "intro") return askIntro(env, chat, userId, opts);
    if (step === "nationality") return askNationality(env, chat, userId, opts);
    if (step === "note") {
      const s = await loadApplicantSettings(env);
      const note = data.nationality === "ایرانی" ? s.note_iranian : s.note_foreign;
      return askNote(env, chat, userId, note, opts);
    }
    if (step === "full_name") return askFullName(env, chat, userId, opts);
    if (step === "company_name") return askCompanyName(env, chat, userId, opts);
    if (step === "phone") return askPhone(env, chat, userId, opts);
    if (step === "description") return askDescription(env, chat, userId, false, opts);
  }

  if (mode === "repair") {
    if (step === "problem")
      return askRepairProblem(env, chat, userId, data.device_id, opts);
    if (step === "full_name") return askFullName(env, chat, userId, opts);
    if (step === "phone") return askPhone(env, chat, userId, opts);
    if (step === "description") return askDescription(env, chat, userId, true, opts);
  }

  await sessionClear(env.DB, userId);
  return showHome(env, chat, opts);
}

/* ============================================================
 * Device listings
 * ============================================================ */

async function showAvailableDevices(env, chat, forRequest = false, page = 1, opts = {}) {
  const where = forRequest
    ? "is_deleted=0 AND is_available=1"
    : "is_deleted=0";

  const totalRow = await one(
    env.DB,
    `SELECT COUNT(*) AS n FROM devices WHERE ${where}`
  );
  const total = Number(totalRow?.n || 0);

  if (!total) {
    return userAnswer(
      env, chat,
      forRequest
        ? "⚠️ <b>درحال حاضر دستگاهی برای ثبت درخواست موجود نیست</b>"
        : "📭 <b>دستگاهی ثبت نشده است</b>",
      userMenu(),
      opts,
      true
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / DEVICES_PAGE_SIZE));
  const p = safePage(page, totalPages);
  const offset = (p - 1) * DEVICES_PAGE_SIZE;

  const rows = await all(
    env.DB,
    `SELECT id,model,is_available FROM devices
     WHERE ${where}
     ORDER BY id DESC LIMIT ? OFFSET ?`,
    DEVICES_PAGE_SIZE, offset
  );

  const header = forRequest
    ? "🛒 <b>درخواست دستگاه</b>\n\n👇 <b>لطفاً مدل دستگاه مدنظر خود را انتخاب کنید:</b>"
    : "💳 <b>لیست دستگاه‌ها</b>\n\n👇 <b>لطفاً مدل دستگاه را برای مشاهده تصویر و مشخصات انتخاب کنید:</b>";

  const subtitle = totalPages > 1
    ? `\n\n📄 <b>صفحه ${faDigits(p)} از ${faDigits(totalPages)}</b>\n` +
      `📦 <b>مجموع: ${faDigits(total)}</b>`
    : "";

  const prefix = forRequest ? "u:request" : "u:devices";

  return userAnswer(
    env, chat,
    `${header}${subtitle}`,
    kb([
      ...rows.map((d) => [
        btn(
          `${d.model}${d.is_available ? " 🟢" : " 🔴"}`,
          `u:${forRequest ? "reqdevice" : "device"}:${d.id}:${p}`
        ),
      ]),
      ...paginate(prefix, p, totalPages),
      userHomeRow(),
    ]),
    opts,
    true
  );
}

async function showRepairDevices(env, chat, page = 1, opts = {}) {
  const totalRow = await one(
    env.DB,
    "SELECT COUNT(*) AS n FROM devices WHERE is_deleted=0"
  );
  const total = Number(totalRow?.n || 0);

  if (!total) {
    return userAnswer(
      env, chat,
      "📭 <b>دستگاهی ثبت نشده است</b>",
      userMenu(), opts, true
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / DEVICES_PAGE_SIZE));
  const p = safePage(page, totalPages);
  const offset = (p - 1) * DEVICES_PAGE_SIZE;

  const rows = await all(
    env.DB,
    `SELECT id,model,is_available FROM devices
     WHERE is_deleted=0 ORDER BY id DESC LIMIT ? OFFSET ?`,
    DEVICES_PAGE_SIZE, offset
  );

  const subtitle = totalPages > 1
    ? `\n\n📄 <b>صفحه ${faDigits(p)} از ${faDigits(totalPages)}</b>\n` +
      `📦 <b>مجموع: ${faDigits(total)}</b>`
    : "";

  return userAnswer(
    env,
    chat,
    `🛠️ <b>پشتیبانی و تعمیرات</b>\n\n👇 <b>لطفاً مدل دستگاه خود را انتخاب کنید:</b>${subtitle}`,
    kb([
      ...rows.map((d) => [
        btn(
          `${d.model}${d.is_available ? " 🟢" : " 🔴"}`,
          `u:repairdev:${d.id}:${p}`
        ),
      ]),
      ...paginate("u:repair", p, totalPages),
      userHomeRow(),
    ]),
    opts,
    true
  );
}

async function showDevice(env, chat, id, fromPage = 1, opts = {}) {
  const d = await one(
    env.DB,
    "SELECT * FROM devices WHERE id=? AND is_deleted=0",
    id
  );
  if (!d)
    return userAnswer(env, chat, "❓ <b>دستگاه پیدا نشد</b>", userMenu(), opts, false);

  const p = Number(fromPage) || 1;
  const backCb = p > 1 ? `u:devices:p:${p}` : "u:devices";

  const descPart = d.description
    ? `<b>${esc(d.description)}</b>`
    : `📄 <b>ثبت‌نشده</b>`;

  const text =
    `💳 <b>${esc(d.model)}</b>\n` +
    `${d.is_available ? "🟢 <b>موجود</b>" : "🔴 <b>ناموجود</b>"}\n\n` +
    descPart;

  const rows = [];
  if (d.is_available) {
    rows.push([btn(`🛒 درخواست دستگاه مدل ${d.model}`, `u:reqdevice:${d.id}:${p}:d`)]);
  }
  rows.push(userNavRow(backCb));

  return userAnswer(
    env, chat, text, kb(rows),
    { ...opts, imageFileId: d.device_image_file_id || null },
    false
  );
}

/* ============================================================
 * Submission — POS
 * ============================================================ */

async function submitPos(env, chat, userId, updateId, data, ctx, opts = {}) {
  const device = await one(
    env.DB,
    "SELECT id,model,is_available FROM devices WHERE id=? AND is_deleted=0",
    data.device_id
  );
  if (!device || !device.is_available) {
    await sessionClear(env.DB, userId);
    return userAnswer(
      env, chat,
      "⚠️ <b>این دستگاه دیگر موجود نیست</b>",
      userMenu(), opts, false
    );
  }

  const allowed = await checkActionRateLimit(env.DB, userId, "request", 5, 1);
  if (!allowed) {
    return userAnswer(
      env, chat,
      "⚠️ <b>تعداد درخواست‌های شما زیاد است</b>\n" +
      "شما در ۱ دقیقه گذشته ۵ درخواست ثبت کرده‌اید\n" +
      "لطفاً ۱ دقیقه صبر کنید و دوباره تلاش کنید",
      kb([userHomeRow()]),
      opts, false
    );
  }

  const updateNum = Number(updateId);
  const hasUpdate = Number.isInteger(updateNum);

  let result;
  try {
    result = await run(
      env.DB,
      `INSERT INTO pos_requests(
         telegram_user_id,device_id,device_model,applicant_type,nationality,
         full_name,company_name,phone_number,description,status,source_update_id
       ) VALUES(?,?,?,?,?,?,?,?,?,'pending',?)`,
      userId,
      data.device_id,
      device.model,
      data.applicant_type,
      data.nationality || null,
      data.full_name || null,
      data.company_name || null,
      data.phone_number,
      data.description || null,
      hasUpdate ? updateNum : null
    );
  } catch (e) {
    /* Duplicate submission — either same update_id, or the same user
     * re-submitting for the same device within 10 minutes. */
    if (/UNIQUE constraint/i.test(String(e?.message || ""))) {
      const existing = await one(
        env.DB,
        `SELECT id FROM pos_requests
         WHERE source_update_id = ?
            OR (telegram_user_id = ?
                AND device_id = ?
                AND status = 'pending'
                AND created_at >= datetime('now', '-10 minutes'))
         ORDER BY id DESC LIMIT 1`,
        hasUpdate ? updateNum : -1,
        userId,
        data.device_id
      );

      await sessionClear(env.DB, userId);
      const requestId = existing?.id;

      return userAnswer(
        env, chat,
        requestId
          ? `ℹ️ <b>درخواست شما قبلاً ثبت شده است</b>\n\n` +
            `🆔 <b>شماره درخواست:</b> #${faDigits(requestId)}`
          : `⚠️ <b>درخواست شما در حال پردازش است</b>\nلطفاً چند لحظه صبر کنید`,
        userMenu(), opts, false
      );
    }

    /* Any other D1 error — surface a friendly message instead of
     * leaving the user with a silent failure. */
    console.error("submitPos failed:", safeError(e));
    await sessionClear(env.DB, userId);
    return userAnswer(
      env, chat,
      "⚠️ <b>ثبت درخواست موقتاً ناموفق بود</b>\n" +
      "لطفاً چند لحظه دیگر دوباره تلاش کنید",
      userMenu(), opts, false
    );
  }

  await sessionClear(env.DB, userId);
  const requestId = result.meta?.last_row_id || "";

  await returnToHomeInline(env, chat, opts, requestId, false);

  const adminText =
    `🛒 <b>درخواست جدید کارتخوان</b>\n` +
    `🔢 <b>شماره:</b> #${faDigits(requestId)}\n` +
    `💳 <b>مدل دستگاه:</b> ${esc(device.model)}\n` +
    `👥 <b>نوع:</b> ${data.applicant_type === "legal" ? "🏢 حقوقی" : "👤 حقیقی"}\n` +
    `✍️ <b>نام و نام خانوادگی:</b> ${esc(data.full_name || "-")}\n` +
    (data.applicant_type === "legal"
      ? `🏢 <b>نام شرکت:</b> ${esc(data.company_name || "-")}\n`
      : `🌐 <b>تابعیت:</b> ${esc(data.nationality || "-")}\n`) +
    `📞 <b>شماره تلفن:</b> ${esc(data.phone_number)}\n` +
    `📝 <b>توضیحات:</b> ${esc(data.description || "-")}`;

  const recipients = await adminRecipients(env);
  const button = btn("👁️ مشاهده درخواست", `a:posreq:${requestId}:1:all`);

  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(notifyAdminsSafe(env, recipients, adminText, button));
  } else {
    await notifyAdminsSafe(env, recipients, adminText, button);
  }
}

/* ============================================================
 * Submission — Repair
 * ============================================================ */

async function submitRepair(env, chat, userId, updateId, data, ctx, opts = {}) {
  const device = await one(
    env.DB,
    "SELECT id,model FROM devices WHERE id=? AND is_deleted=0",
    data.device_id
  );
  if (!device) {
    await sessionClear(env.DB, userId);
    return userAnswer(env, chat, "❓ <b>دستگاه پیدا نشد</b>", userMenu(), opts, false);
  }

  const allowed = await checkActionRateLimit(env.DB, userId, "request", 5, 1);
  if (!allowed) {
    return userAnswer(
      env, chat,
      "⚠️ <b>تعداد درخواست‌های شما زیاد است</b>\n" +
      "شما در ۱ دقیقه گذشته ۵ درخواست ثبت کرده‌اید\n" +
      "لطفاً ۱ دقیقه صبر کنید و دوباره تلاش کنید",
      kb([userHomeRow()]),
      opts, false
    );
  }

  const updateNum = Number(updateId);
  const hasUpdate = Number.isInteger(updateNum);

  let result;
  try {
    result = await run(
      env.DB,
      `INSERT INTO repair_requests(
         telegram_user_id,device_id,problem_type,full_name,phone_number,
         description,status,source_update_id
       ) VALUES(?,?,?,?,?,?,'pending',?)`,
      userId,
      data.device_id,
      data.problem_type,
      data.full_name || null,
      data.phone_number,
      data.description || null,
      hasUpdate ? updateNum : null
    );
  } catch (e) {
    if (/UNIQUE constraint/i.test(String(e?.message || ""))) {
      const existing = await one(
        env.DB,
        `SELECT id FROM repair_requests
         WHERE source_update_id = ?
            OR (telegram_user_id = ?
                AND device_id = ?
                AND status = 'pending'
                AND created_at >= datetime('now', '-10 minutes'))
         ORDER BY id DESC LIMIT 1`,
        hasUpdate ? updateNum : -1,
        userId,
        data.device_id
      );

      await sessionClear(env.DB, userId);
      const requestId = existing?.id;

      return userAnswer(
        env, chat,
        requestId
          ? `ℹ️ <b>درخواست شما قبلاً ثبت شده است</b>\n\n` +
            `🆔 <b>شماره درخواست:</b> #${faDigits(requestId)}`
          : `⚠️ <b>درخواست شما در حال پردازش است</b>\nلطفاً چند لحظه صبر کنید`,
        userMenu(), opts, false
      );
    }

    console.error("submitRepair failed:", safeError(e));
    await sessionClear(env.DB, userId);
    return userAnswer(
      env, chat,
      "⚠️ <b>ثبت درخواست موقتاً ناموفق بود</b>\n" +
      "لطفاً چند لحظه دیگر دوباره تلاش کنید",
      userMenu(), opts, false
    );
  }

  await sessionClear(env.DB, userId);
  const requestId = result.meta?.last_row_id || "";
  await returnToHomeInline(env, chat, opts, requestId, true);

  const adminText =
    `🛠️ <b>درخواست جدید تعمیرات</b>\n` +
    `🔢 <b>شماره:</b> #${faDigits(requestId)}\n` +
    `💳 <b>مدل دستگاه:</b> ${esc(device.model)}\n` +
    `🛠️ <b>مشکل:</b> ${esc(problemFa[data.problem_type] || data.problem_type)}\n` +
    `✍️ <b>نام و نام خانوادگی:</b> ${esc(data.full_name || "-")}\n` +
    `📞 <b>شماره تلفن:</b> ${esc(data.phone_number)}\n` +
    `📝 <b>توضیحات:</b> ${esc(data.description || "-")}`;

  const recipients = await adminRecipients(env);
  const button = btn("👁️ مشاهده درخواست", `a:repairreq:${requestId}:1:all`);

  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(notifyAdminsSafe(env, recipients, adminText, button));
  } else {
    await notifyAdminsSafe(env, recipients, adminText, button);
  }
}

async function notifyAdminsSafe(env, recipients, text, callbackButton) {
  await Promise.allSettled(
    recipients.map((recipient) =>
      tg(env, "sendMessage", {
        chat_id: recipient,
        text: String(text),
        parse_mode: "HTML",
        reply_markup: kb([[callbackButton]]),   // ✅ FIXED: double array
      }).catch((e) => console.error("admin notify failed:", safeError(e)))
    )
  );
}

/* ============================================================
 * Callback dispatcher
 * ============================================================ */

export async function userCallback(
  env, chat, user, data, updateId, ctx,
  editMessageId = null, wasPhoto = false
) {
  const userId = String(user.id);
  const opts = editMessageId ? { editMessageId, wasPhoto } : {};

  if (data === "n:noop") return;

  /* Session hygiene: preserve the session for actions that are part
   * of a multi-step flow. All other callbacks start fresh. */
  const USER_KEEP_SESSION = new Set([
    "u:back",
    "u:individual",
    "u:legal",
    "u:intro:continue",
    "u:nat:iran",
    "u:nat:foreign",
    "u:nat:continue",
    "u:name:skip",
    "u:company:skip",
    "u:desc:skip",
    "u:repairform",
  ]);

  function userKeepsSession(d) {
    if (USER_KEEP_SESSION.has(d)) return true;
    if (d.startsWith("u:p:")) return true;
    return false;
  }

  if (data.startsWith("u:") && !userKeepsSession(data)) {
    await sessionClear(env.DB, userId);
  }

  if (data === "u:home") {
    await sessionClear(env.DB, userId);
    return showHome(env, chat, opts);
  }

  if (data === "u:back") {
    const restored = await sessionBack(env.DB, userId);
    if (!restored) {
      await sessionClear(env.DB, userId);
      return showHome(env, chat, opts);
    }
    return renderUserStep(env, chat, userId, restored, opts);
  }

  /* ---- Device browsing ---- */
  if (data === "u:devices")
    return showAvailableDevices(env, chat, false, 1, opts);
  if (data.startsWith("u:devices:p:"))
    return showAvailableDevices(
      env, chat, false,
      Number(data.slice("u:devices:p:".length)),
      opts
    );

  if (data === "u:request")
    return showAvailableDevices(env, chat, true, 1, opts);
  if (data.startsWith("u:request:p:"))
    return showAvailableDevices(
      env, chat, true,
      Number(data.slice("u:request:p:".length)),
      opts
    );

  if (data.startsWith("u:device:")) {
    const parts = data.slice("u:device:".length).split(":");
    const id = parts[0];
    const fromPage = parts[1] ? Number(parts[1]) : 1;
    if (!/^\d+$/.test(id))
      return userAnswer(
        env, chat, "⚠️ <b>شناسه دستگاه نامعتبر است</b>", userMenu(), opts, false
      );
    return showDevice(env, chat, id, fromPage, opts);
  }

  /* ---- Start POS request ---- */
  if (data.startsWith("u:reqdevice:")) {
    const parts = data.slice("u:reqdevice:".length).split(":");
    const id = parts[0];
    const fromPage = parts[1] ? Number(parts[1]) : 1;
    const fromDevice = parts[2] === "d";
    if (!/^\d+$/.test(id))
      return userAnswer(
        env, chat, "⚠️ <b>شناسه دستگاه نامعتبر است</b>", userMenu(), opts, false
      );

    const d = await one(
      env.DB,
      "SELECT id,model,is_available FROM devices WHERE id=? AND is_deleted=0",
      id
    );
    if (!d || !d.is_available) {
      return userAnswer(
        env, chat,
        "⚠️ <b>این دستگاه در حال حاضر موجود نیست</b>",
        userMenu(), opts, false
      );
    }

    await sessionSet(env.DB, userId, "pos", "applicant_type", {
      device_id: String(d.id),
      from_page: fromPage,
      from_device: fromDevice,
      __history: [],
    });
    return askApplicantType(env, chat, userId, String(d.id), opts);
  }

  /* ---- POS flow transitions ---- */
  if (data === "u:individual" || data === "u:legal") {
    const applicantType = data === "u:individual" ? "individual" : "legal";
    const s = await sessionGet(env.DB, userId);
    if (!s || s.mode !== "pos" || s.step !== "applicant_type" || !s.data?.device_id) {
      return userAnswer(
        env, chat,
        "⚠️ <b>درخواست شما منقضی شده است</b>",
        userMenu(), opts, false
      );
    }

    const next = { ...s.data, applicant_type: applicantType };

    if (applicantType === "individual") {
      await sessionPush(env.DB, userId, "nationality", next);
      return askNationality(env, chat, userId, opts);
    }

    await sessionPush(env.DB, userId, "intro", next);
    return askIntro(env, chat, userId, opts);
  }

  if (data === "u:intro:continue") {
    const s = await sessionGet(env.DB, userId);
    if (!s || s.mode !== "pos" || s.step !== "intro") {
      return userAnswer(
        env, chat,
        "⚠️ <b>درخواست شما منقضی شده است</b>",
        userMenu(), opts, false
      );
    }
    await sessionPush(env.DB, userId, "full_name", s.data);
    return askFullName(env, chat, userId, opts);
  }

  if (data === "u:nat:iran" || data === "u:nat:foreign") {
    const s = await sessionGet(env.DB, userId);
    if (
      !s || s.mode !== "pos" ||
      s.data?.applicant_type !== "individual" ||
      s.step !== "nationality"
    ) {
      return userAnswer(
        env, chat,
        "⚠️ <b>درخواست شما منقضی شده است</b>",
        userMenu(), opts, false
      );
    }
    const nat = data === "u:nat:iran" ? "ایرانی" : "اتباع خارجی";

    await sessionPush(env.DB, userId, "note", { ...s.data, nationality: nat });
    const settings = await loadApplicantSettings(env);
    const note = nat === "ایرانی" ? settings.note_iranian : settings.note_foreign;
    return askNote(env, chat, userId, note, opts);
  }

  if (data === "u:nat:continue") {
    const s = await sessionGet(env.DB, userId);
    if (!s || s.mode !== "pos" || s.step !== "note" || !s.data?.nationality) {
      return userAnswer(
        env, chat,
        "⚠️ <b>درخواست شما منقضی شده است</b>",
        userMenu(), opts, false
      );
    }
    await sessionPush(env.DB, userId, "full_name", s.data);
    return askFullName(env, chat, userId, opts);
  }

  if (data === "u:name:skip") {
    const s = await sessionGet(env.DB, userId);
    if (!s || !["pos", "repair"].includes(s.mode) || s.step !== "full_name") {
      return userAnswer(
        env, chat,
        "⚠️ <b>درخواست شما منقضی شده است</b>",
        userMenu(), opts, false
      );
    }
    const d2 = { ...s.data, full_name: "" };
    if (s.mode === "pos" && d2.applicant_type === "legal") {
      await sessionPush(env.DB, userId, "company_name", d2);
      return askCompanyName(env, chat, userId, opts);
    }
    await sessionPush(env.DB, userId, "phone", d2);
    return askPhone(env, chat, userId, opts);
  }

  if (data === "u:company:skip") {
    const s = await sessionGet(env.DB, userId);
    if (
      !s || s.mode !== "pos" ||
      s.step !== "company_name" ||
      s.data?.applicant_type !== "legal"
    ) {
      return userAnswer(
        env, chat,
        "⚠️ <b>اطلاعات درخواست نامعتبر است</b>\n" +
        "<b>لطفا دوباره تلاش کنید</b>",
        userMenu(), opts, false
      );
    }
    const d2 = { ...s.data, company_name: "" };
    await sessionPush(env.DB, userId, "phone", d2);
    return askPhone(env, chat, userId, opts);
  }

  if (data === "u:desc:skip") {
    const s = await sessionGet(env.DB, userId);
    if (!s || !["pos", "repair"].includes(s.mode) || s.step !== "description") {
      return userAnswer(
        env, chat,
        "⚠️ <b>درخواست شما منقضی شده است</b>",
        userMenu(), opts, false
      );
    }
    const d2 = { ...s.data, description: "" };
    if (s.mode === "pos") {
      return submitPos(env, chat, userId, updateId, d2, ctx, opts);
    }
    return submitRepair(env, chat, userId, updateId, d2, ctx, opts);
  }

  /* ---- Repair flow ---- */
  if (data === "u:repair")
    return showRepairDevices(env, chat, 1, opts);
  if (data.startsWith("u:repair:p:"))
    return showRepairDevices(
      env,
      chat,
      Number(data.slice("u:repair:p:".length)),
      opts
    );

  if (data.startsWith("u:repairdev:")) {
    const parts = data.slice("u:repairdev:".length).split(":");
    const id = parts[0];
    const fromPage = parts[1] ? Number(parts[1]) : 1;
    if (!/^\d+$/.test(id))
      return userAnswer(
        env, chat, "⚠️ <b>شناسه دستگاه نامعتبر است</b>", userMenu(), opts, false
      );

    const d = await one(
      env.DB,
      "SELECT id,model FROM devices WHERE id=? AND is_deleted=0",
      id
    );
    if (!d)
      return userAnswer(env, chat, "❓ <b>دستگاه پیدا نشد</b>", userMenu(), opts, false);

    await sessionSet(env.DB, userId, "repair", "problem", {
      device_id: String(d.id),
      from_page: fromPage,
      __history: [],
    });
    return askRepairProblem(env, chat, userId, String(d.id), opts);
  }

  if (data.startsWith("u:p:")) {
    const p = data.slice("u:p:".length);
    if (!PROBLEM_TYPES.includes(p))
      return userAnswer(
        env, chat, "⚠️ <b>نوع مشکل نامعتبر است</b>", userMenu(), opts, false
      );

    const s = await sessionGet(env.DB, userId);
    if (!s || s.mode !== "repair" || s.step !== "problem" || !s.data?.device_id) {
      return userAnswer(
        env, chat, "⚠️ <b>درخواست شما منقضی شده است</b>", userMenu(), opts, false
      );
    }

    const device = await one(
      env.DB,
      "SELECT id FROM devices WHERE id=? AND is_deleted=0",
      s.data.device_id
    );
    if (!device) {
      await sessionClear(env.DB, userId);
      return userAnswer(
        env, chat,
        "⚠️ <b>این دستگاه در حال حاضر موجود نیست</b>",
        userMenu(), opts, false
      );
    }

    /* Push the problem step onto history so "Back" from the guide
     * returns to the problem picker for the same device. */
    const next = { ...s.data, problem_type: p };
    await sessionPush(env.DB, userId, "problem", next);

    const guide = await one(
      env.DB,
      "SELECT description FROM troubleshooting_guides WHERE device_id=? AND problem_type=?",
      next.device_id,
      p
    );

    const PROBLEM_EMOJI = { PRINT: "🖨️", ANTENNA: "📡", CHARGER: "🔋" };
    const PROBLEM_PLAIN = {
      PRINT: "مشکل چاپ",
      ANTENNA: "مشکل آنتن",
      CHARGER: "مشکل شارژر",
    };

    const pEmoji = PROBLEM_EMOJI[p] || "";
    const pText = PROBLEM_PLAIN[p] || p;

    const guidePart = guide?.description
      ? `<b>${esc(guide.description)}</b>`
      : `📄 <b>ثبت‌نشده</b>`;

    const res = await userAnswer(
      env,
      chat,
      `${pEmoji} <b>${esc(pText)}</b>\n\n${guidePart}`,
      kb([
        [btn("✅ مشکلم برطرف شد", "u:home")],
        [btn("🛠️ درخواست پشتیبانی فنی", "u:repairform")],
        userNavRow("u:back"),
      ]),
      opts,
      false
    );
    await savePromptMsgId(env, userId, res?.message_id);
    return res;
  }

  if (data === "u:repairform") {
    const s = await sessionGet(env.DB, userId);
    if (
      !s || s.mode !== "repair" || s.step !== "problem" ||
      !s.data?.device_id || !s.data?.problem_type
    ) {
      return userAnswer(
        env, chat,
        "⚠️ <b>ابتدا مدل دستگاه و نوع مشکل را انتخاب کنید</b>",
        userMenu(), opts, false
      );
    }

    const device = await one(
      env.DB,
      "SELECT id FROM devices WHERE id=? AND is_deleted=0",
      s.data.device_id
    );
    if (!device) {
      await sessionClear(env.DB, userId);
      return userAnswer(
        env, chat,
        "⚠️ <b>این دستگاه در حال حاضر موجود نیست</b>",
        userMenu(), opts, false
      );
    }

    await sessionPush(env.DB, userId, "full_name", s.data);
    return askFullName(env, chat, userId, opts);
  }

  /* ---- Warranty + About ---- */
  if (data === "u:warranty") {
    return userAnswer(
      env,
      chat,
      "🛡️ <b>خدمات و گارانتی</b>",
      kb([
        [btn("📦 دستگاه‌های آکبند", "u:warranty:new")],
        [btn("♻️ دستگاه‌های استوک", "u:warranty:used")],
        userHomeRow(),
      ]),
      opts,
      true
    );
  }

  if (data === "u:warranty:new") {
    const s = await one(env.DB, "SELECT new_warranty FROM settings WHERE id=1");
    return userAnswer(
      env, chat,
      `📦 <b>دستگاه‌های آکبند</b>\n\n<b>${esc(s?.new_warranty || "")}</b>`,
      kb([userNavRow("u:warranty")]), opts, false
    );
  }

  if (data === "u:warranty:used") {
    const s = await one(env.DB, "SELECT used_warranty FROM settings WHERE id=1");
    return userAnswer(
      env, chat,
      `♻️ <b>دستگاه‌های استوک</b>\n\n<b>${esc(s?.used_warranty || "")}</b>`,
      kb([userNavRow("u:warranty")]), opts, false
    );
  }

  if (data === "u:about") {
    return showAbout(env, chat, opts);
  }

  return userAnswer(
    env, chat, "⚠️ <b>گزینه نامعتبر است</b>", userMenu(), opts, false
  );
}

/* ============================================================
 * Text input handler
 * ============================================================ */

export async function userMessage(env, chat, user, msg, updateId, ctx) {
  const userId = String(user.id);
  const text = String(msg?.text || "").trim();

  const s = await sessionGet(env.DB, userId);

  if (msg?.text?.startsWith("/start")) {
    await sessionClear(env.DB, userId);
    return userStart(env, chat, user);
  }

  if (text === "/aboutus" || text === "/about") {
    await sessionClear(env.DB, userId);
    return showAbout(env, chat);
  }

  if (isCancelText(msg?.text)) {
    await sessionClear(env.DB, userId);
    return userAnswer(env, chat, "❌ <b>عملیات لغو شد</b>", userMenu(), {}, false);
  }

  if (msg?.text?.startsWith("/")) {
    return userAnswer(
      env, chat, "⚠️ <b>لطفا از بین گزینه‌ها انتخاب کنید</b>", userMenu(), {}, false
    );
  }

  if (!s) {
    return userAnswer(
      env, chat, "⚠️ <b>لطفا از بین گزینه‌ها انتخاب کنید</b>", userMenu(), {}, false
    );
  }

  const promptMsgId = s.data?.__prompt_msg_id || null;
  const editOpts = promptMsgId ? { editMessageId: promptMsgId } : {};

  /* ---- POS flow ---- */
  if (s.mode === "pos") {
    const data = { ...s.data };

    if (s.step === "nationality") {
      return userAnswer(
        env, chat, "⚠️ <b>لطفا از بین گزینه‌ها انتخاب کنید</b>",
        kb([
          [btn("🇮🇷 ایرانی", "u:nat:iran")],
          [btn("🌍 اتباع خارجی", "u:nat:foreign")],
          userNavRow("u:back"),
        ]), editOpts, false
      );
    }

    if (s.step === "note") {
      return userAnswer(
        env, chat, "⚠️ <b>لطفا برای ادامه، «✅ ادامه» را بزنید</b>",
        kb([
          [btn("✅ ادامه", "u:nat:continue")],
          userNavRow("u:back"),
        ]), editOpts, false
      );
    }

    if (s.step === "full_name") {
      const t = trimText(msg?.text || "", MAX.name);
      if (!t) {
        return userAnswer(
          env, chat, "⚠️ <b>لطفا نام کامل را وارد کنید یا «⏭️ رد کردن» را بزنید</b>",
          kb([
            [btn("⏭️ رد کردن", "u:name:skip")],
            userNavRow("u:back"),
          ]), editOpts, false
        );
      }
      data.full_name = t;

      await deleteUserMsg(env, chat, msg?.message_id);

      if (data.applicant_type === "legal") {
        await sessionPush(env.DB, userId, "company_name", data);
        return askCompanyName(env, chat, userId, editOpts);
      }
      await sessionPush(env.DB, userId, "phone", data);
      return askPhone(env, chat, userId, editOpts);
    }

    if (s.step === "company_name") {
      if (data.applicant_type !== "legal") {
        await sessionClear(env.DB, userId);
        return userAnswer(
          env, chat,
          "⚠️ <b>اطلاعات درخواست نامعتبر است</b>\n" +
          "<b>لطفا دوباره تلاش کنید</b>",
          userMenu(), {}, false
        );
      }
      const t = trimText(msg?.text || "", MAX.company);
      if (!t) {
        return userAnswer(
          env, chat, "⚠️ <b>لطفا نام شرکت را وارد کنید یا «⏭️ رد کردن» را بزنید</b>",
          kb([
            [btn("⏭️ رد کردن", "u:company:skip")],
            userNavRow("u:back"),
          ]), editOpts, false
        );
      }
      data.company_name = t;

      await deleteUserMsg(env, chat, msg?.message_id);

      await sessionPush(env.DB, userId, "phone", data);
      return askPhone(env, chat, userId, editOpts);
    }

    if (s.step === "phone") {
      const candidate = msg?.contact?.phone_number || msg?.text || "";
      if (msg?.contact?.user_id && Number(msg.contact.user_id) !== Number(user.id)) {
        return userAnswer(
          env, chat, "⚠️ <b>لطفا شماره تلفن خود را وارد کنید</b>",
          null, editOpts, false
        );
      }
      if (hasPersianDigits(candidate)) {
        return userAnswer(
          env, chat,
          "⚠️ <b>لطفا شماره را با اعداد انگلیسی وارد کنید</b>\n" +
          "<b>(کیبورد را روی حالت انگلیسی بگذارید)</b>",
          kb([userNavRow("u:back")]), editOpts, false
        );
      }
      const phone = normalizePhone(candidate);
      if (!phone) {
        return userAnswer(
          env, chat,
          "⚠️ <b>شماره تلفن نامعتبر است</b>\n" +
          "<b>لطفا دوباره تلاش کنید</b>",
          kb([userNavRow("u:back")]), editOpts, false
        );
      }
      data.phone_number = phone;

      await deleteUserMsg(env, chat, msg?.message_id);

      await sessionPush(env.DB, userId, "description", data);
      return askDescription(env, chat, userId, false, editOpts);
    }

    if (s.step === "description") {
      const t = trimText(msg?.text || "", MAX.description);
      if (!t) {
        return userAnswer(
          env, chat, "⚠️ <b>لطفا متن را بنویسید یا «⏭️ رد کردن» را بزنید</b>",
          kb([
            [btn("⏭️ رد کردن", "u:desc:skip")],
            userNavRow("u:back"),
          ]), editOpts, false
        );
      }
      data.description = t;

      await deleteUserMsg(env, chat, msg?.message_id);

      return submitPos(env, chat, userId, updateId, data, ctx, editOpts);
    }
  }

  /* ---- Repair flow ---- */
  if (s.mode === "repair") {
    const data = { ...s.data };

    if (s.step === "full_name") {
      const t = trimText(msg?.text || "", MAX.name);
      if (!t) {
        return userAnswer(
          env, chat, "⚠️ <b>لطفا نام کامل را وارد کنید یا «⏭️ رد کردن» را بزنید</b>",
          kb([
            [btn("⏭️ رد کردن", "u:name:skip")],
            userNavRow("u:back"),
          ]), editOpts, false
        );
      }
      data.full_name = t;

      await deleteUserMsg(env, chat, msg?.message_id);

      await sessionPush(env.DB, userId, "phone", data);
      return askPhone(env, chat, userId, editOpts);
    }

    if (s.step === "phone") {
      const candidate = msg?.contact?.phone_number || msg?.text || "";
      if (msg?.contact?.user_id && Number(msg.contact.user_id) !== Number(user.id)) {
        return userAnswer(
          env, chat, "⚠️ <b>لطفا شماره تلفن خود را وارد کنید</b>",
          null, editOpts, false
        );
      }
      if (hasPersianDigits(candidate)) {
        return userAnswer(
          env, chat,
          "⚠️ <b>لطفا شماره را با اعداد انگلیسی وارد کنید</b>\n" +
          "<b>(کیبورد را روی حالت انگلیسی بگذارید)</b>",
          kb([userNavRow("u:back")]), editOpts, false
        );
      }
      const phone = normalizePhone(candidate);
      if (!phone) {
        return userAnswer(
          env, chat,
          "⚠️ <b>شماره تلفن نامعتبر است</b>\n" +
          "<b>لطفا دوباره تلاش کنید</b>",
          kb([userNavRow("u:back")]), editOpts, false
        );
      }
      data.phone_number = phone;

      await deleteUserMsg(env, chat, msg?.message_id);

      await sessionPush(env.DB, userId, "description", data);
      return askDescription(env, chat, userId, true, editOpts);
    }

    if (s.step === "description") {
      const t = trimText(msg?.text || "", MAX.description);
      if (!t) {
        return userAnswer(
          env, chat, "⚠️ <b>لطفا متن را بنویسید یا «⏭️ رد کردن» را بزنید</b>",
          kb([
            [btn("⏭️ رد کردن", "u:desc:skip")],
            userNavRow("u:back"),
          ]), editOpts, false
        );
      }
      data.description = t;

      await deleteUserMsg(env, chat, msg?.message_id);

      return submitRepair(env, chat, userId, updateId, data, ctx, editOpts);
    }
  }

  return userAnswer(
    env,
    chat,
    "⚠️ <b>ورودی نامعتبر است</b>\n" +
    "<b>برای انصراف، «لغو» را ارسال کنید</b>",
    kb([userNavRow("u:back")]),
    editOpts,
    false
  );
}
