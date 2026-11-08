const router = require('express').Router();
const { pool } = require('../db');
const { ah, HttpError } = require('../utils');
const { authenticate } = require('../middleware/auth');
const { getCurrent, requirePlan } = require('../subscriptionService');

router.use(authenticate); // every route below needs a valid JWT

const ARTICLES = [
  { id: 1, title: 'Getting started', tier: 'free' },
  { id: 2, title: 'Core concepts', tier: 'free' },
  { id: 3, title: 'Advanced workflows', tier: 'paid' },
  { id: 4, title: 'Automation recipes', tier: 'paid' },
  { id: 5, title: 'Team collaboration', tier: 'paid' },
  { id: 6, title: 'Performance tuning', tier: 'paid' },
];

// GET /dashboard  - only logged-in users
router.get('/dashboard', ah(async (req, res) => {
  const cur = await getCurrent(pool, req.user.id);
  res.json({ message: `Welcome back, ${cur.name}!`, plan: cur.plan, features: cur.features });
}));

// GET /profile  - all logged-in users
router.get('/profile', ah(async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, email, created_at FROM users WHERE id=?', [req.user.id]);
  if (!rows.length) throw new HttpError(404, 'User not found');
  const cur = await getCurrent(pool, req.user.id);
  res.json({ ...rows[0], plan: cur.plan });
}));

// GET /content  - free users: limited (free tier only); paid users: everything
router.get('/content', ah(async (req, res) => {
  const cur = await getCurrent(pool, req.user.id);
  const items = cur.level === 0 ? ARTICLES.filter((a) => a.tier === 'free') : ARTICLES;
  res.json({ plan: cur.plan, access: cur.level === 0 ? 'limited' : 'full', items });
}));

// GET /premium-content  - only premium users (plan guard middleware)
router.get('/premium-content', requirePlan(2, 'premium'), (req, res) => {
  res.json({ message: 'Welcome to the premium area', plan: req.plan.plan, items: ['Exclusive masterclass', 'Priority roadmap votes', 'Private community'] });
});

module.exports = router;
