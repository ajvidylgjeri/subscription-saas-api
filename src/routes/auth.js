const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { ah, HttpError, validateSignup, signToken } = require('../utils');
const { FREE_PLAN_ID } = require('../subscriptionService');

// POST /signup  { name, email, password }  -> new users start on the Free plan
router.post('/signup', ah(async (req, res) => {
  const { name, email, password } = validateSignup(req.body);
  const hash = await bcrypt.hash(password, 10);
  const [r] = await pool.query(
    'INSERT INTO users (name, email, password, current_plan_id) VALUES (?, ?, ?, ?)',
    [name, email, hash, FREE_PLAN_ID]
  );
  const user = { id: r.insertId, role: 'user' };
  res.status(201).json({ message: 'Account created', user: { id: user.id, name, email, plan: 'free' }, token: signToken(user) });
}));

// POST /login  { email, password }
router.post('/login', ah(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') throw new HttpError(400, 'email and password are required');
  const [rows] = await pool.query('SELECT id, name, email, password, role FROM users WHERE email=?', [email.trim().toLowerCase()]);
  const user = rows[0];
  // Same error for unknown email and wrong password (no account enumeration).
  if (!user || !(await bcrypt.compare(password, user.password))) throw new HttpError(401, 'Invalid email or password');
  res.json({ message: 'Login successful', user: { id: user.id, name: user.name, email: user.email }, token: signToken(user) });
}));

module.exports = router;
