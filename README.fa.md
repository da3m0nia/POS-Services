<div align="center" dir="ltr">

<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg" alt="JavaScript" width="90" />
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cloudflare/cloudflare-original.svg" alt="Cloudflare" width="90" />

# POS Services

**ربات تلگرام مدیریت دستگاه‌های کارتخوان (POS)**
ساخته‌شده روی **Cloudflare Workers** + **D1** · نوشته‌شده با **JavaScript** مدرن

[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/docs/Web/JavaScript)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)
[![Telegram Bot API](https://img.shields.io/badge/Telegram-Bot%20API-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red?style=for-the-badge)](#مجوز)

</div>

---

<div dir="rtl">

یک ربات تلگرام Production-Ready و Serverless که به مشتریان امکان می‌دهد دستگاه‌های کارتخوان را مرور کنند، درخواست خرید و تعمیر ثبت کنند و اطلاعات گارانتی و تماس را ببینند — همزمان یک داشبورد کامل برای ادمین‌ها فراهم می‌کند تا درخواست‌ها را مدیریت، دستگاه‌ها را کنترل، لاگ‌ها را بازبینی و محتوای ربات را شخصی‌سازی کنند.

---

## فهرست مطالب

- [ویژگی‌ها](#ویژگیها)
- [معماری](#معماری)
- [تکنولوژی‌ها](#تکنولوژیها)
- [ساختار پروژه](#ساختار-پروژه)
- [پیش‌نیازها](#پیشنیازها)
- [نصب](#نصب)
- [پیکربندی](#پیکربندی)
- [دیتابیس](#دیتابیس)
- [استقرار](#استقرار)
- [تنظیم Webhook](#تنظیم-webhook)
- [اندپوینت‌های HTTP](#اندپوینتهای-http)
- [جریان کاربر](#جریان-کاربر)
- [جریان ادمین](#جریان-ادمین)
- [امنیت](#امنیت)
- [مانیتورینگ](#مانیتورینگ)
- [نگهداری](#نگهداری)
- [توسعه](#توسعه)
- [مجوز](#مجوز)

---

## ویژگی‌ها

### 👤 بخش کاربر

- **رابط فارسی** با پشتیبانی RTL و تاریخ شمسی (جلالی).
- **کاتالوگ دستگاه‌ها** — مرور صفحه‌بندی‌شده، تصویر، توضیحات و وضعیت موجودی.
- **درخواست خرید کارتخوان** — فرم چندمرحله‌ای با نوع پذیرنده، تابعیت، اطلاعات تماس و توضیحات.
- **درخواست تعمیرات** — انتخاب دستگاه و نوع مشکل، راهنمای عیب‌یابی و ارتقاء به تیکت پشتیبانی.
- **اطلاعات گارانتی** برای دستگاه‌های آکبند و استوک.
- **صفحه درباره‌ما / تماس‌باما** با متن و تصویر قابل‌تنظیم.
- **منوهای Inline، ناوبری بازگشت و صفحه‌های Edit-in-place** — پیام‌ها جایگزین می‌شوند و روی هم انبار نمی‌شوند.
- **اعتبارسنجی ورودی** برای شماره تلفن، اعداد فارسی و محدودیت طول متن.

### 🛠️ بخش ادمین

- **داشبورد** — آمار تجمیعی: مجموع وضعیت‌ها، درخواست‌های امروز و ۷ روز اخیر (به وقت تهران).
- **مدیریت درخواست‌ها** — فیلتر بر اساس وضعیت، جستجوی متنی، جزئیات هر درخواست با اطلاعات تماس قابل کپی و تغییر وضعیت با یک کلیک که به کاربر اطلاع می‌دهد.
- **ارسال یادداشت** به کاربران مستقیماً از صفحه‌ی جزئیات درخواست.
- **مدیریت دستگاه‌ها** — افزودن، حذف نرم، تغییر موجودی، ویرایش توضیحات، آپلود تصویر و مدیریت راهنماهای عیب‌یابی.
- **شخصی‌سازی محتوا** — پیام و تصویر خوش‌آمدگویی، تصویر داشبورد ادمین، صفحه درباره‌ما، متون گارانتی و متن معرفی/توضیحات پذیرنده.
- **پنل امنیتی** — لیست ادمین‌ها (Super Admin + حداکثر ۹ ادمین)، لاگ ورودها و لاگ تغییرات با فیلتر بر اساس ادمین.
- **نقش Super Admin** با حالت «مشاهده به‌عنوان کاربر».
- **خروجی CSV درون ربات** برای درخواست‌های کارتخوان و تعمیرات (حداکثر ۲۵۰ ردیف).

### ⚙️ بخش پلتفرم

- **پردازش Idempotent برای Webhook** — حذف تکراری‌ها بر اساس `update_id` با بازیابی از قفل‌های قدیمی.
- **محدودسازی نرخ چندلایه** — ۳۰ درخواست در دقیقه برای هر کاربر به‌صورت سراسری، به‌علاوه‌ی ۵ درخواست در دقیقه روی ثبت درخواست.
- **وضعیت Session** با تاریخچه‌ی محدود برای ناوبری بازگشت.
- **استفاده مجدد از مدیا از طریق کانال خصوصی تلگرام** — تصاویر آپلودشده مجدداً در کانال ذخیره می‌شوند تا ربات `file_id` بادوام داشته باشد.
- **برش امن Unicode** — برچسب دکمه‌ها هرگز ایموجی‌های ZWJ را نصف نمی‌کند.
- **Fallback دکمه‌ها** — اگر تلگرام `reply_markup` را رد کند (مثلاً کلاینت قدیمی که `copy_text` ندارد)، با کیبورد ساده‌شده مجدداً تلاش می‌شود.
- **مقاوم‌سازی در برابر CSV Injection** و **HTML Escaping** در سراسر پروژه.
- **مقایسه‌ی توکن به‌صورت Constant-Time** در همه‌ی احراز هویت‌های HTTP.
- **هشدار خودکار به Super Admin** هنگام مشاهده‌ی موج خطا (۵ خطا در ۵ دقیقه).
- **پاک‌سازی زمان‌بندی‌شده** با Cron — آپدیت‌ها، Sessionها، لاگ‌های audit و ورود، محدودیت‌های نرخ.

---

## معماری

```
┌──────────────────┐       HTTPS         ┌──────────────────────────┐
│  Telegram Bot    │  ───────────────▶   │   Cloudflare Worker      │
│  API             │  ◀───────────────   │   (src/index.js)         │
└──────────────────┘   webhook + API     └────────────┬─────────────┘
                                                      │
                                                      │ D1 binding
                                                      ▼
                                        ┌──────────────────────────┐
                                        │  Cloudflare D1 (SQLite)  │
                                        │  - sessions              │
                                        │  - devices               │
                                        │  - pos_requests          │
                                        │  - repair_requests       │
                                        │  - settings, users, ...  │
                                        └──────────────────────────┘

┌──────────────────┐
│  Private Channel │  ← میزبان مجدد تصاویر آپلودشده
└──────────────────┘
```

هر Update ورودی:

۱. با `TELEGRAM_WEBHOOK_SECRET` تأیید می‌شود.
۲. از طریق `processed_updates` حذف تکراری می‌شود.
۳. بر اساس نقش (`superadmin` / `admin` / `user`) به هندلر مناسب مسیردهی می‌شود.
۴. به‌عنوان `completed` یا `failed` ثبت می‌شود تا پردازش قابل‌تلاش مجدد باشد.

---

## تکنولوژی‌ها

| لایه | تکنولوژی |
|---|---|
| Runtime | [Cloudflare Workers](https://workers.cloudflare.com/) |
| دیتابیس | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) |
| زبان | JavaScript (ES Modules) |
| Bot API | Telegram Bot API |
| CLI | [Wrangler v3](https://developers.cloudflare.com/wrangler/) |
| زمان‌بندی | Cloudflare Cron Triggers |

**هیچ Dependency Runtime خارجی وجود ندارد.** تنها `devDependency` پروژه Wrangler است.

---

## ساختار پروژه

```
.
├── src/
│   ├── index.js          # ورودی Worker — روتر HTTP، Webhook، Cron
│   ├── telegram.js       # کلاینت Bot API، Retry، رندر یکپارچه‌ی صفحه
│   ├── db.js             # ابزارهای D1 — کوئری‌ها، Sessionها، Idempotency، محدودیت نرخ
│   ├── auth.js           # تشخیص نقش، ثبت Audit و Login، هشدارها
│   ├── user.js           # جریان‌های کاربر (کاتالوگ، POS، تعمیرات، گارانتی، درباره‌ما)
│   ├── admin.js          # داشبورد ادمین و همه‌ی جریان‌های مدیریتی
│   └── utils.js          # ثابت‌ها، کیبوردها، HTML Escaping، تاریخ جلالی
├── migrations/
│   └── 0001_initial.sql
├── wrangler.toml         # (در .gitignore) — پیکربندی واقعی Worker
├── wrangler.toml.example # قالب برای نصب‌های جدید
├── CHANGELOG.md
├── package.json
├── README.md
└── README.fa.md
```

---

## پیش‌نیازها

- یک [حساب Cloudflare](https://dash.cloudflare.com/sign-up) با Workers و D1 فعال.
- [Node.js](https://nodejs.org/) نسخه‌ی **۱۸ یا بالاتر** به‌همراه npm.
- یک **ربات تلگرام** ساخته‌شده از [@BotFather](https://t.me/BotFather) — توکن را ذخیره کنید.
- یک **کانال خصوصی تلگرام** که ربات در آن ادمین باشد (برای میزبانی تصاویر آپلودشده).
- **شناسه‌ی عددی تلگرام** شما (مثلاً از [@userinfobot](https://t.me/userinfobot)) برای `SUPER_ADMIN_ID`.

---

## نصب

```bash
# ۱. کلون کردن مخزن
git clone <your-repo-url> pos-services
cd pos-services

# ۲. نصب پیش‌نیاز توسعه (Wrangler)
npm install

# ۳. ورود به Cloudflare
npx wrangler login

# ۴. ساخت دیتابیس D1
npx wrangler d1 create pos-services-db
# database_id چاپ‌شده را در wrangler.toml کپی کنید
```

سپس `wrangler.toml` را تنظیم کنید (بخش [پیکربندی](#پیکربندی)) و Migrationها را اعمال کنید:

```bash
npm run db:migrate
```

---

## پیکربندی

### `wrangler.toml`

از `wrangler.toml.example` به `wrangler.toml` کپی کنید و مقادیر را پر کنید:

```toml
name = "pos-services"
main = "src/index.js"
compatibility_date = "2024-11-01"
workers_dev = true

[vars]
PUBLIC_WEBHOOK_URL = "https://pos-services.<YOUR-SUBDOMAIN>.workers.dev/telegram/webhook"
DROP_PENDING_UPDATES = "false"

[[d1_databases]]
binding = "DB"
database_name = "pos-services-db"
database_id = "<YOUR-DATABASE-UUID>"
migrations_dir = "migrations"

[triggers]
crons = ["0 3 * * *"]   # پاک‌سازی روزانه ساعت ۰۳:۰۰ UTC (۰۶:۳۰ تهران)

[observability]
enabled = true
```

### Secretها

هرگز Secretها را در `wrangler.toml` قرار ندهید. از `wrangler secret put` استفاده کنید:

| Secret | کاربرد |
|---|---|
| `TELEGRAM_BOT_TOKEN` | توکن Bot API از BotFather. |
| `TELEGRAM_WEBHOOK_SECRET` | رشته‌ی تصادفی؛ تلگرام آن را در هدر `X-Telegram-Bot-Api-Secret-Token` بازمی‌گرداند. |
| `WEBHOOK_SETUP_TOKEN` | توکن Bearer/Header/Query برای محافظت از `/setup-webhook` و `/webhook-info`. |
| `SUPER_ADMIN_ID` | شناسه‌ی تلگرام شما. نقش Super Admin را به‌صورت خودکار می‌دهد. |
| `PRIVATE_CHANNEL_ID` | شناسه‌ی کانال (به شکل `-100...`) که تصاویر آپلودشده در آن ذخیره می‌شوند. |

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put WEBHOOK_SETUP_TOKEN
npx wrangler secret put SUPER_ADMIN_ID
npx wrangler secret put PRIVATE_CHANNEL_ID
```

> برای تولید مقادیر قوی و تصادفی: `openssl rand -hex 32`.

---

## دیتابیس

اسکیمای دیتابیس در `migrations/0001_initial.sql` قرار دارد و جدول‌های زیر را می‌سازد:

| جدول | کاربرد |
|---|---|
| `admins` | لیست ادمین‌ها (نام، شناسه تلگرام، نقش، وضعیت فعال). |
| `users` | کش کاربران تلگرام (با `view_as_user` برای Super Admin). |
| `devices` | کاتالوگ دستگاه‌های کارتخوان (با حذف نرم، تصویر و موجودی). |
| `troubleshooting_guides` | متن راهنما برای هر دستگاه و هر نوع مشکل. |
| `pos_requests` | درخواست‌های خرید. |
| `repair_requests` | تیکت‌های تعمیرات. |
| `settings` | پیکربندی تک‌ردیفی. |
| `sessions` | وضعیت فرم‌های چندمرحله‌ای به‌ازای هر شناسه تلگرام. |
| `audit_logs` | رد پای اقدامات ادمین. |
| `login_logs` | تاریخچه‌ی `/start` ادمین‌ها (Throttle: یکی در ۵ دقیقه). |
| `processed_updates` | Idempotency وب‌هوک. |
| `rate_limits` | شمارنده‌های Fixed-Window (سراسری + به‌ازای هر اقدام). |

همه‌ی جدول‌ها در حالت `STRICT` هستند و `CHECK` constraints با enumهای برنامه هماهنگ‌اند.

### اعمال Migrationها

```bash
npm run db:migrate         # D1 ریموت (Production)
npm run db:migrate:local   # Miniflare محلی
```

---

## استقرار

```bash
npm run deploy   # استقرار Worker
npm run tail     # مشاهده‌ی زنده‌ی لاگ‌ها
```

پس از استقرار، URL `workers.dev` که Wrangler چاپ می‌کند را یادداشت کنید — همان را در `PUBLIC_WEBHOOK_URL` قرار دهید.

---

## تنظیم Webhook

پس از استقرار Worker و تنظیم Secretها، Webhook را برای تلگرام ثبت کنید. این کار **کاملاً از مرورگر** قابل انجام است — بدون نیاز به `curl` یا CLI.

### 🔗 مرورگر (روش پیشنهادی)

لینک زیر را در مرورگر باز کنید:

```
https://pos-services.<YOUR-SUBDOMAIN>.workers.dev/setup-webhook?token=<WEBHOOK_SETUP_TOKEN>
```

Worker پاسخ JSON برمی‌گرداند که ثبت را تأیید می‌کند:

```json
{
  "ok": true,
  "webhook_url": "https://pos-services.<YOUR-SUBDOMAIN>.workers.dev/telegram/webhook",
  "allowed_updates": ["message", "callback_query"]
}
```

برای بررسی وضعیت فعلی Webhook:

```
https://pos-services.<YOUR-SUBDOMAIN>.workers.dev/webhook-info?token=<WEBHOOK_SETUP_TOKEN>
```

> **نکته:** هر دو لینک را در مرورگر Bookmark کنید (یا در Password Manager ذخیره کنید) تا ثبت مجدد Webhook بعد از چرخش Secretها تنها یک کلیک باشد.

### 🧪 ترمینال (روش جایگزین)

```bash
# ثبت
curl -X POST "https://pos-services.<YOUR-SUBDOMAIN>.workers.dev/setup-webhook" \
  -H "Authorization: Bearer $WEBHOOK_SETUP_TOKEN"

# بررسی
curl "https://pos-services.<YOUR-SUBDOMAIN>.workers.dev/webhook-info" \
  -H "Authorization: Bearer $WEBHOOK_SETUP_TOKEN"
```

### ✅ تأیید عملکرد

از حساب ثبت‌شده به‌عنوان `SUPER_ADMIN_ID` به ربات `/start` بفرستید. باید مستقیم وارد داشبورد شوید (یا اگر در حالت user-view هستید، role chooser را ببینید).

> **امنیت:** توکن در Query String ممکن است در History مرورگر، Referrer و لاگ‌های سرور ظاهر شود. لینک مرورگر را فقط روی دستگاه مطمئن استفاده کنید و در صورت استفاده روی دستگاه عمومی، `WEBHOOK_SETUP_TOKEN` را چرخش دهید.

---

## اندپوینت‌های HTTP

| متد | مسیر | احراز هویت | توضیحات |
|---|---|---|---|
| `GET` | `/health` | — | بررسی سلامت + D1. برمی‌گرداند `{ ok, db: "up"\|"down", ts }`. در صورت قطعی D1 کد ۵۰۳ می‌دهد. |
| `GET`/`POST` | `/setup-webhook` | `WEBHOOK_SETUP_TOKEN` | ثبت Webhook تلگرام. |
| `GET`/`POST` | `/webhook-info` | `WEBHOOK_SETUP_TOKEN` | پروکسی `getWebhookInfo`. |
| `POST` | `/telegram/webhook` | `TELEGRAM_WEBHOOK_SECRET` | دریافت Updateهای تلگرام. |
| `*` | بقیه | — | رشته‌ی کوتاه وضعیت. |

> **نکته:** خروجی CSV **از داخل خود ربات** قابل دریافت است (دکمه‌ی «📥 دانلود CSV»، حداکثر ۲۵۰ ردیف). اندپوینت‌های قدیمی `/export/pos.csv` و `/export/repair.csv` در نسخه‌ی ۱.۰.۱ برای سازگاری با بودجه‌ی CPU پلن رایگان Cloudflare حذف شده‌اند.

احراز هویت برای اندپوینت‌های setup **هر کدام** از روش‌های زیر را می‌پذیرد:

- `Authorization: Bearer <token>`
- `X-Webhook-Setup-Token: <token>`
- پارامتر Query: `?token=<token>`

---

## جریان کاربر

### منوی اصلی

```
🏠 صفحه اصلی
├── 💳 کاتالوگ دستگاه‌ها          → لیست صفحه‌بندی → جزئیات دستگاه → درخواست
├── 🛒 درخواست کارتخوان           → نوع پذیرنده → تابعیت / معرفی → فرم
├── 🛠️ پشتیبانی و تعمیرات          → دستگاه → مشکل → راهنما → ارتقاء به تیکت
├── 🛡️ خدمات و گارانتی            → آکبند / استوک
└── 📞 درباره‌ما / تماس‌باما
```

### جریان درخواست کارتخوان

```
انتخاب دستگاه
   └── نوع پذیرنده (حقیقی | حقوقی)
         ├── حقیقی → تابعیت (ایرانی | اتباع خارجی) → یادداشت → نام → تلفن → توضیحات
         └── حقوقی → معرفی → نام → شرکت → تلفن → توضیحات
                                                        └── ثبت + اطلاع‌رسانی به ادمین‌ها
```

### جریان تعمیرات

```
انتخاب دستگاه → نوع مشکل → راهنمای عیب‌یابی
                                ├── «مشکلم برطرف شد» → صفحه اصلی
                                └── «درخواست پشتیبانی» → نام → تلفن → توضیحات → ثبت
```

هر دو جریان ثبت شامل موارد زیر هستند:

- محدودیت نرخ به‌ازای هر کاربر (۵ در دقیقه).
- تشخیص تکراری از طریق `source_update_id` و پنجره‌ی ۱۰ دقیقه‌ای در حالت Pending.
- اطلاع‌رسانی به ادمین‌ها با `ctx.waitUntil` (بدون مسدود کردن).
- پیام خطای کاربرپسند هنگام هر خطای D1.

---

## جریان ادمین

```
🏠 داشبورد مدیریت
├── 📊 آمار (مجموع وضعیت‌ها، امروز، ۷ روز)
├── 🛒 درخواست‌های کارتخوان  → فیلتر، جستجو، جزئیات، وضعیت، یادداشت، CSV
├── 🛠️ درخواست‌های تعمیرات   → فیلتر، جستجو، جزئیات، وضعیت، یادداشت، CSV
├── 💳 مدیریت دستگاه‌ها        → افزودن / ویرایش / تغییر موجودی / تصویر / راهنما / حذف نرم
├── ⚙️ امنیت                   → ادمین‌ها، لاگ ورود، لاگ تغییرات (با فیلتر ادمین)
└── 🎨 شخصی‌سازی              → خوش‌آمد، درباره‌ما، گارانتی‌ها، متن‌های پذیرنده
```

### مدل نقش‌ها

| نقش | اختیارات |
|---|---|
| `user` | فقط جریان‌های کاربر نهایی. |
| `admin` | کل داشبورد به‌جز مدیریت ادمین‌ها و شناسه‌های Super Admin. |
| `superadmin` | همه‌چیز، به‌همراه حالت «مشاهده به‌عنوان کاربر» و دسترسی به شناسه‌های حساس. |

- Super Admin فقط با Secret `SUPER_ADMIN_ID` تعیین می‌شود — بدون نیاز به ردیف در دیتابیس.
- دکمه‌ی `a:rolechooser` فقط برای Super Admin نمایش داده می‌شود.
- کاربران غیر از Super Admin شناسه‌های Super Admin را در لاگ‌ها به‌صورت `🔒 مخفی` می‌بینند.
- حداکثر **۹ ادمین** در جدول `admins` (به‌همراه Super Admin = مجموعاً ۱۰).

---

## امنیت

| حوزه | اقدام حفاظتی |
|---|---|
| **ذخیره‌ی Secretها** | همه از طریق `wrangler secret`؛ `wrangler.toml` در `.gitignore` است. |
| **احراز هویت Webhook** | تأیید هدر `X-Telegram-Bot-Api-Secret-Token` با مقایسه‌ی Constant-Time. |
| **احراز هویت Setup** | Bearer، Header یا `?token=` — همه با Constant-Time. |
| **حملات Timing** | از `constantTimeEqual` برای هر مقایسه‌ی توکن استفاده می‌شود. |
| **HTML Injection** | همه‌ی متن‌ها پیش از رندر با `parse_mode: "HTML"` از `esc()` عبور می‌کنند. |
| **CSV Injection** | سلول‌های شروع‌شده با `=`, `+`, `-`, `@`, `\t`, `\r` با `'` پیشوند می‌گیرند. |
| **محدودیت نرخ** | ۳۰ در دقیقه سراسری، ۵ در دقیقه روی ثبت درخواست. |
| **Idempotency** | `processed_updates` با بازیابی قفل قدیمی (پنجره‌ی ۲ دقیقه‌ای). |
| **اعتبارسنجی ورودی** | نرمال‌سازی شماره تلفن (فقط ارقام ASCII)، محدودیت طول، بررسی فرمت شناسه. |
| **مدیریت PII** | `safeError()` هرگز Payload درخواست را لاگ نمی‌کند — فقط پیام خطا + کد تلگرام. |
| **هدرهای امنیتی** | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`. |
| **فقط چت خصوصی** | پیام‌های گروه/کانال قبل از پردازش حذف می‌شوند. |
| **هشدار خطا** | موج خطاها (۵ خطا در ۵ دقیقه) هشدار خودکار به Super Admin می‌فرستد. |

> **توکن در Query String** (برای راه‌اندازی از مرورگر) یک بده‌بستان آگاهانه است: راحتی در ازای دیده‌شدن در History/لاگ‌ها. پس از استفاده روی دستگاه عمومی، `WEBHOOK_SETUP_TOKEN` را چرخش دهید.

---

## مانیتورینگ

- **`[observability]`** فعال است — لاگ‌های ساختاریافته در داشبورد Cloudflare ظاهر می‌شوند.
- **`npm run tail`** لاگ‌های زنده‌ی Worker مستقر را پخش می‌کند.
- **`/health`** در صورت قطعی D1 کد ۵۰۳ برمی‌گرداند — مانیتورهای بیرونی را به این آدرس وصل کنید.
- **`processed_updates`** آخرین خطای هر Update ناموفق را ثبت می‌کند.
- **`audit_logs`** تمام تغییرات ادمین را با Actor، Action، Target و Details ثبت می‌کند.
- **`login_logs`** رویدادهای `/start` ادمین‌ها را ثبت می‌کند (Throttle شده).
- **هشدارهای Super Admin** به‌صورت خودکار در موج خطاها فعال می‌شوند.

---

## نگهداری

### پاک‌سازی زمان‌بندی‌شده

یک Cron Trigger روزانه ساعت **۰۳:۰۰ UTC (۰۶:۳۰ تهران)** اجرا می‌شود و موارد زیر را پاک می‌کند:

| جدول | مدت نگهداری |
|---|---|
| `processed_updates` (تکمیل‌شده) | ۷ روز |
| `processed_updates` (ناموفق) | ۳۰ روز |
| `processed_updates` (گیر کرده در `processing`) | ۱ روز |
| `sessions` | ۲ روز |
| `audit_logs` | ۹۰ روز |
| `login_logs` | ۹۰ روز |
| `rate_limits` | ۱ روز |

پنجره‌های نگهداری از طریق `cleanupOldRows()` در `src/db.js` قابل تنظیم هستند.

### افزودن Migration جدید

```bash
# فایل migrations/0002_your_change.sql را بسازید، سپس:
npm run db:migrate
```

### چرخش Secretها

```bash
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
# سپس لینک مرورگر /setup-webhook را مجدداً باز کنید تا تلگرام secret_token جدید را بگیرد
```

---

## توسعه

```bash
npm run dev                # اجرای Miniflare + D1 محلی
npm run db:migrate:local   # اعمال Migrationها روی دیتابیس محلی
npm run deploy             # استقرار روی Cloudflare
npm run tail               # پخش لاگ‌های Production
```

### اسکریپت‌های موجود

| اسکریپت | توضیح |
|---|---|
| `npm run dev` | اجرای `wrangler dev` (Miniflare + D1 محلی). |
| `npm run deploy` | استقرار Worker. |
| `npm run tail` | پخش زنده‌ی لاگ‌های Worker مستقر. |
| `npm run db:migrate` | اعمال Migrationها روی D1 ریموت. |
| `npm run db:migrate:local` | اعمال Migrationها روی D1 محلی. |

### تست ربات به‌صورت محلی

۱. دستور `npm run dev` را اجرا کنید.
۲. پورت محلی را از طریق یک تونل در دسترس قرار دهید (مثلاً `cloudflared tunnel --url http://localhost:8787`).
۳. `PUBLIC_WEBHOOK_URL` را به URL تونل اشاره دهید.
۴. لینک `https://<TUNNEL-URL>/setup-webhook?token=<WEBHOOK_SETUP_TOKEN>` را در مرورگر باز کنید.

> **نکته:** در طول توسعه‌ی محلی می‌توانید با خیال راحت `DROP_PENDING_UPDATES = "true"` را قرار دهید تا Backlog تلگرام که در زمان Off بودن Worker جمع شده، دور ریخته شود.

---

## مجوز

این پروژه اختصاصی است. تمامی حقوق محفوظ می‌باشد.

</div>
