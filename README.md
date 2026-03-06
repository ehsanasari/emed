# emed - مدیریت حواله و تحویل تجهیزات پزشکی

این پروژه یک API کامل برای مدیریت حواله/تحویل تجهیزات پزشکی با پایگاه‌داده SQLite است و قابلیت‌های زیر را پوشش می‌دهد:

- ثبت اطلاعات توسط اپراتور
- جستجو بر اساس هر فیلد و جستجوی ترکیبی
- ویرایش و حذف اطلاعات
- گزارش‌گیری آماری و داشبورد
- فیلتر تاریخ
- خروجی Excel
- سطح دسترسی کاربران (admin / operator / viewer)

## نصب و اجرا

```bash
npm install
npm start
```

سرور به صورت پیش‌فرض روی `http://localhost:3001` اجرا می‌شود.

## ورود اولیه

در اولین اجرا، یک کاربر پیش‌فرض ساخته می‌شود:

- username: `admin`
- password: `admin123`

## احراز هویت

### `POST /auth/login`

```json
{
  "username": "admin",
  "password": "admin123"
}
```

پاسخ شامل `token` از نوع JWT است. برای APIهای محافظت‌شده، هدر زیر را ارسال کنید:

```http
Authorization: Bearer <token>
```

## مدیریت کاربران

### `POST /users` (فقط admin)

ایجاد کاربر با نقش‌های `admin`، `operator` یا `viewer`.

## مدیریت رکوردها

### `POST /records` (admin, operator)
ثبت رکورد جدید با فیلدهای زیر:

- `center_name` نام مرکز
- `device_name` نام دستگاه
- `letter_number` شماره نامه (حواله)
- `letter_date` تاریخ نامه
- `datpa` داتپا
- `referral_number` شماره حواله
- `proforma_number` شماره پیش‌فاکتور
- `referral_direction` جهت حواله
- `parliament_representative` نماینده مجلس
- `requested_count` تعداد درخواستی
- `received_status` اعلام وصول شده است؟ (boolean)
- `delivered_count` تعداد تحویل گرفته شده
- `received_letter_date` تاریخ نامه اعلام وصول
- `received_letter_number` شماره نامه اعلام وصول
- `pmq` PMQ
- `non_purchase_reason` علت عدم خرید
- `description` توضیحات

### `GET /records`
لیست رکوردها با صفحه‌بندی و فیلتر.

پارامترهای مهم:

- `page`, `pageSize`
- `q` جستجوی عمومی ترکیبی
- فیلتر تک‌فیلدی با کلیدهای بالا (مثلاً `center_name=...`)
- `date_from`, `date_to` برای فیلتر تاریخ (`letter_date`)

### `GET /records/:id`
دریافت یک رکورد.

### `PUT /records/:id` (admin, operator)
ویرایش رکورد.

### `DELETE /records/:id` (فقط admin)
حذف رکورد.

## داشبورد و گزارش

### `GET /reports/dashboard`
خروجی آماری شامل:

- تعداد کل رکوردها
- مجموع تعداد درخواستی
- مجموع تعداد تحویل‌گرفته‌شده
- تعداد اعلام وصول شده/نشده
- ۱۰ مرکز برتر بر اساس تعداد رکورد
- ۱۰ دستگاه برتر بر اساس تعداد رکورد

این endpoint نیز تمام فیلترهای `GET /records` را می‌پذیرد.

### `GET /reports/export.xlsx`
خروجی اکسل با اعمال فیلترهای جستجو.

## بررسی سریع کد

```bash
npm run check
```
