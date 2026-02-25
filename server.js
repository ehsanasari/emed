const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');

const app = express();
const db = new sqlite3.Database('emed.db');

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'emed-secret-key';

app.use(cors());
app.use(express.json());

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function runCallback(err) {
      if (err) return reject(err);
      return resolve({ id: this.lastID, changes: this.changes });
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      return resolve(row);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      return resolve(rows);
    });
  });

const initializeDatabase = async () => {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'operator', 'viewer')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    center_name TEXT,
    device_name TEXT,
    letter_number TEXT,
    letter_date TEXT,
    datpa TEXT,
    referral_number TEXT,
    proforma_number TEXT,
    referral_direction TEXT,
    parliament_representative TEXT,
    requested_count INTEGER DEFAULT 0,
    received_status INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    received_letter_date TEXT,
    received_letter_number TEXT,
    pmq TEXT,
    non_purchase_reason TEXT,
    description TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
  )`);

  const adminUser = await get('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!adminUser) {
    const hash = await bcrypt.hash('admin123', 10);
    await run('INSERT INTO users(username, password, role) VALUES(?, ?, ?)', ['admin', hash, 'admin']);
    console.log('Default admin user created: admin / admin123');
  }
};

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'توکن ورود ارسال نشده است.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ message: 'توکن نامعتبر است.' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'شما دسترسی لازم برای این عملیات را ندارید.' });
  }
  return next();
};

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'نام کاربری و رمز عبور الزامی است.' });
    }

    const user = await get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(401).json({ message: 'نام کاربری یا رمز اشتباه است.' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'نام کاربری یا رمز اشتباه است.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.json({
      message: 'ورود موفق',
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (error) {
    return res.status(500).json({ message: 'خطا در ورود به سیستم', error: error.message });
  }
});

app.post('/users', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ message: 'نام کاربری، رمز عبور و نقش الزامی است.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await run('INSERT INTO users(username, password, role) VALUES(?, ?, ?)', [
      username,
      hash,
      role,
    ]);

    return res.status(201).json({ id: result.id, username, role });
  } catch (error) {
    return res.status(500).json({ message: 'خطا در ایجاد کاربر', error: error.message });
  }
});

const filterableFields = {
  center_name: 'center_name',
  device_name: 'device_name',
  letter_number: 'letter_number',
  letter_date: 'letter_date',
  datpa: 'datpa',
  referral_number: 'referral_number',
  proforma_number: 'proforma_number',
  referral_direction: 'referral_direction',
  parliament_representative: 'parliament_representative',
  requested_count: 'requested_count',
  received_status: 'received_status',
  delivered_count: 'delivered_count',
  received_letter_date: 'received_letter_date',
  received_letter_number: 'received_letter_number',
  pmq: 'pmq',
  non_purchase_reason: 'non_purchase_reason',
  description: 'description',
};

const buildWhereClause = (query) => {
  const conditions = [];
  const params = [];

  Object.entries(filterableFields).forEach(([queryKey, column]) => {
    if (query[queryKey] !== undefined && query[queryKey] !== '') {
      if (['requested_count', 'received_status', 'delivered_count'].includes(queryKey)) {
        conditions.push(`${column} = ?`);
        params.push(Number(query[queryKey]));
      } else {
        conditions.push(`${column} LIKE ?`);
        params.push(`%${query[queryKey]}%`);
      }
    }
  });

  if (query.q) {
    const searchableColumns = [
      'center_name',
      'device_name',
      'letter_number',
      'datpa',
      'referral_number',
      'proforma_number',
      'referral_direction',
      'parliament_representative',
      'received_letter_number',
      'pmq',
      'non_purchase_reason',
      'description',
    ];

    conditions.push(`(${searchableColumns.map((col) => `${col} LIKE ?`).join(' OR ')})`);
    searchableColumns.forEach(() => params.push(`%${query.q}%`));
  }

  if (query.date_from) {
    conditions.push('letter_date >= ?');
    params.push(query.date_from);
  }

  if (query.date_to) {
    conditions.push('letter_date <= ?');
    params.push(query.date_to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
};

app.post('/records', authenticate, authorize('admin', 'operator'), async (req, res) => {
  try {
    const payload = req.body;
    const result = await run(
      `INSERT INTO records (
        center_name, device_name, letter_number, letter_date, datpa,
        referral_number, proforma_number, referral_direction, parliament_representative,
        requested_count, received_status, delivered_count, received_letter_date,
        received_letter_number, pmq, non_purchase_reason, description, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.center_name || '',
        payload.device_name || '',
        payload.letter_number || '',
        payload.letter_date || '',
        payload.datpa || '',
        payload.referral_number || '',
        payload.proforma_number || '',
        payload.referral_direction || '',
        payload.parliament_representative || '',
        Number(payload.requested_count || 0),
        payload.received_status ? 1 : 0,
        Number(payload.delivered_count || 0),
        payload.received_letter_date || '',
        payload.received_letter_number || '',
        payload.pmq || '',
        payload.non_purchase_reason || '',
        payload.description || '',
        req.user.id,
      ]
    );

    const created = await get('SELECT * FROM records WHERE id = ?', [result.id]);
    return res.status(201).json(created);
  } catch (error) {
    return res.status(500).json({ message: 'خطا در ثبت اطلاعات', error: error.message });
  }
});

app.get('/records', authenticate, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || 20)));
    const offset = (page - 1) * pageSize;

    const { whereClause, params } = buildWhereClause(req.query);
    const rows = await all(
      `SELECT * FROM records ${whereClause} ORDER BY letter_date DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const countResult = await get(`SELECT COUNT(*) as total FROM records ${whereClause}`, params);

    return res.json({
      data: rows,
      page,
      pageSize,
      total: countResult.total,
      totalPages: Math.ceil(countResult.total / pageSize),
    });
  } catch (error) {
    return res.status(500).json({ message: 'خطا در دریافت اطلاعات', error: error.message });
  }
});

app.get('/records/:id', authenticate, async (req, res) => {
  try {
    const record = await get('SELECT * FROM records WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ message: 'رکورد یافت نشد.' });
    return res.json(record);
  } catch (error) {
    return res.status(500).json({ message: 'خطا در دریافت رکورد', error: error.message });
  }
});

app.put('/records/:id', authenticate, authorize('admin', 'operator'), async (req, res) => {
  try {
    const payload = req.body;
    const result = await run(
      `UPDATE records SET
        center_name = ?, device_name = ?, letter_number = ?, letter_date = ?, datpa = ?,
        referral_number = ?, proforma_number = ?, referral_direction = ?, parliament_representative = ?,
        requested_count = ?, received_status = ?, delivered_count = ?, received_letter_date = ?,
        received_letter_number = ?, pmq = ?, non_purchase_reason = ?, description = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        payload.center_name || '',
        payload.device_name || '',
        payload.letter_number || '',
        payload.letter_date || '',
        payload.datpa || '',
        payload.referral_number || '',
        payload.proforma_number || '',
        payload.referral_direction || '',
        payload.parliament_representative || '',
        Number(payload.requested_count || 0),
        payload.received_status ? 1 : 0,
        Number(payload.delivered_count || 0),
        payload.received_letter_date || '',
        payload.received_letter_number || '',
        payload.pmq || '',
        payload.non_purchase_reason || '',
        payload.description || '',
        req.params.id,
      ]
    );

    if (!result.changes) return res.status(404).json({ message: 'رکورد یافت نشد.' });

    const updated = await get('SELECT * FROM records WHERE id = ?', [req.params.id]);
    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ message: 'خطا در ویرایش اطلاعات', error: error.message });
  }
});

app.delete('/records/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await run('DELETE FROM records WHERE id = ?', [req.params.id]);
    if (!result.changes) return res.status(404).json({ message: 'رکورد یافت نشد.' });
    return res.json({ message: 'رکورد با موفقیت حذف شد.' });
  } catch (error) {
    return res.status(500).json({ message: 'خطا در حذف اطلاعات', error: error.message });
  }
});

app.get('/reports/dashboard', authenticate, async (req, res) => {
  try {
    const { whereClause, params } = buildWhereClause(req.query);

    const totals = await get(
      `SELECT
        COUNT(*) AS total_records,
        SUM(requested_count) AS total_requested,
        SUM(delivered_count) AS total_delivered,
        SUM(CASE WHEN received_status = 1 THEN 1 ELSE 0 END) AS total_received,
        SUM(CASE WHEN received_status = 0 THEN 1 ELSE 0 END) AS total_not_received
      FROM records ${whereClause}`,
      params
    );

    const byCenter = await all(
      `SELECT center_name, COUNT(*) AS count
       FROM records ${whereClause}
       GROUP BY center_name
       ORDER BY count DESC
       LIMIT 10`,
      params
    );

    const byDevice = await all(
      `SELECT device_name, COUNT(*) AS count
       FROM records ${whereClause}
       GROUP BY device_name
       ORDER BY count DESC
       LIMIT 10`,
      params
    );

    return res.json({ totals, byCenter, byDevice });
  } catch (error) {
    return res.status(500).json({ message: 'خطا در تهیه داشبورد آماری', error: error.message });
  }
});

app.get('/reports/export.xlsx', authenticate, async (req, res) => {
  try {
    const { whereClause, params } = buildWhereClause(req.query);
    const rows = await all(`SELECT * FROM records ${whereClause} ORDER BY id DESC`, params);

    const mapped = rows.map((row) => ({
      'شناسه': row.id,
      'نام مرکز': row.center_name,
      'نام دستگاه': row.device_name,
      'شماره نامه (حواله)': row.letter_number,
      'تاریخ نامه': row.letter_date,
      داتپا: row.datpa,
      'شماره حواله': row.referral_number,
      'شماره پیش‌فاکتور': row.proforma_number,
      'جهت حواله': row.referral_direction,
      'نماینده مجلس': row.parliament_representative,
      'تعداد درخواستی': row.requested_count,
      'اعلام وصول شده است؟': row.received_status ? 'بله' : 'خیر',
      'تعداد تحویل گرفته شده': row.delivered_count,
      'تاریخ نامه اعلام وصول': row.received_letter_date,
      'شماره نامه اعلام وصول': row.received_letter_number,
      PMQ: row.pmq,
      'علت عدم خرید': row.non_purchase_reason,
      توضیحات: row.description,
      'ایجاد شده در': row.created_at,
      'آخرین ویرایش': row.updated_at,
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(mapped);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Records');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="emed-report.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ message: 'خطا در خروجی اکسل', error: error.message });
  }
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
