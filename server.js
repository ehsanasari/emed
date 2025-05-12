
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');

const app = express();
const db = new sqlite3.Database('emed.db');
app.use(cors());
app.use(bodyParser.json());

db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL
)`);

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err || !user) return res.status(401).json({ message: 'نام کاربری یا رمز اشتباه است' });

    bcrypt.compare(password, user.password, (err, result) => {
      if (result) {
        res.json({ message: 'ورود موفق', user: { id: user.id, username: user.username, role: user.role } });
      } else {
        res.status(401).json({ message: 'نام کاربری یا رمز اشتباه است' });
      }
    });
  });
});

app.listen(3001, () => {
  console.log('Server is running on http://localhost:3001');
});
