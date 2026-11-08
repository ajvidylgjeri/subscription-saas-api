const router = require('express').Router();
const { pool, withTransaction } = require('../db');
const { ah, HttpError } = require('../utils');
const { authenticate } = require('../middleware/auth');
const { FREE_PLAN_ID, PERIOD_DAYS, getCurrent, resolvePlan } = require('../subscriptionService');

// GET /plans  (public)
router.get('/plans', ah(async (req, res) => {
  const [plans] = await pool.query('SELECT id, name, price, features FROM plans ORDER BY level');
  res.json({ plans });
}));

// GET /subscription  - view current subscription
router.get('/subscription', authenticate, ah(async (req, res) => {
  const cur = await getCurrent(pool, req.user.id);
  if (!cur) throw new HttpError(404, 'User not found');
  res.json({
    plan: cur.plan, price: cur.price, features: cur.features,
    subscription: cur.subscription_id
      ? { id: cur.subscription_id, status: cur.status, start_date: cur.start_date, end_date: cur.end_date }
      : null,
  });
}));

// POST /subscribe  { plan_id | plan }
router.post('/subscribe', authenticate, ah(async (req, res) => {
  const result = await withTransaction(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id=? FOR UPDATE', [req.user.id]); // serialise per-user changes
    const plan = await resolvePlan(conn, req.body);
    if (plan.id === FREE_PLAN_ID) throw new HttpError(400, 'The Free plan is the default; cancel your subscription to return to it');
    const cur = await getCurrent(conn, req.user.id);
    if (cur.subscription_id) throw new HttpError(409, 'You already have an active subscription. Use PUT /upgrade-plan to change plan');
    await conn.query(
      'INSERT INTO subscriptions (user_id, plan_id, start_date, end_date, status) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), ?)',
      [req.user.id, plan.id, PERIOD_DAYS, 'active']
    );
    await conn.query('UPDATE users SET current_plan_id=? WHERE id=?', [plan.id, req.user.id]);
    return getCurrent(conn, req.user.id);
  });
  res.status(201).json({ message: `Subscribed to ${result.plan}`, plan: result.plan, start_date: result.start_date, end_date: result.end_date });
}));

// PUT /upgrade-plan  { plan_id | plan }  - upgrade OR downgrade between paid plans
router.put('/upgrade-plan', authenticate, ah(async (req, res) => {
  const out = await withTransaction(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id=? FOR UPDATE', [req.user.id]);
    const target = await resolvePlan(conn, req.body);
    const cur = await getCurrent(conn, req.user.id);
    if (!cur.subscription_id) throw new HttpError(400, 'No active subscription. Use POST /subscribe first');
    if (target.id === FREE_PLAN_ID) throw new HttpError(400, 'To move to the Free plan use POST /cancel-subscription');
    if (target.id === cur.plan_id) throw new HttpError(400, `You are already on the ${cur.plan} plan`);
    const direction = target.level > cur.level ? 'upgraded' : 'downgraded';
    await conn.query('UPDATE subscriptions SET plan_id=? WHERE id=?', [target.id, cur.subscription_id]);
    await conn.query('UPDATE users SET current_plan_id=? WHERE id=?', [target.id, req.user.id]);
    return { direction, from: cur.plan, to: target.name };
  });
  res.json({ message: `Plan ${out.direction} from ${out.from} to ${out.to}`, ...out });
}));

// POST /cancel-subscription  - ends the subscription; user returns to Free immediately
router.post('/cancel-subscription', authenticate, ah(async (req, res) => {
  await withTransaction(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id=? FOR UPDATE', [req.user.id]);
    const cur = await getCurrent(conn, req.user.id);
    if (!cur.subscription_id) throw new HttpError(400, 'You have no active subscription');
    await conn.query("UPDATE subscriptions SET status='cancelled' WHERE id=?", [cur.subscription_id]);
    await conn.query('UPDATE users SET current_plan_id=? WHERE id=?', [FREE_PLAN_ID, req.user.id]);
  });
  res.json({ message: 'Subscription cancelled. You are back on the free plan.' });
}));

module.exports = router;
