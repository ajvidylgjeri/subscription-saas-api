const { pool } = require('./db');
const { HttpError } = require('./utils');

const FREE_PLAN_ID = 1;
const PERIOD_DAYS = 30;

/** Lazily expire finished subscriptions and drop the user back to the free plan. */
async function expireStale(conn, userId) {
  const [r] = await conn.query(
    "UPDATE subscriptions SET status='expired' WHERE user_id=? AND status='active' AND end_date <= NOW()",
    [userId]
  );
  if (r.affectedRows) await conn.query('UPDATE users SET current_plan_id=? WHERE id=?', [FREE_PLAN_ID, userId]);
}

/** Current plan + active subscription (if any) for a user. */
async function getCurrent(conn, userId) {
  await expireStale(conn, userId);
  const [rows] = await conn.query(
    `SELECT u.id AS user_id, u.name, u.email,
            p.id AS plan_id, p.name AS plan, p.price, p.level, p.features,
            s.id AS subscription_id, s.start_date, s.end_date, s.status
       FROM users u
       JOIN plans p ON p.id = u.current_plan_id
       LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active'
      WHERE u.id = ?`,
    [userId]
  );
  return rows[0] || null;
}

/** Accepts { plan_id } or { plan: "premium" }. */
async function resolvePlan(conn, body) {
  const { plan_id: planId, plan } = body || {};
  let rows;
  if (planId !== undefined) [rows] = await conn.query('SELECT * FROM plans WHERE id=?', [Number(planId)]);
  else if (typeof plan === 'string') [rows] = await conn.query('SELECT * FROM plans WHERE name=?', [plan.toLowerCase()]);
  else throw new HttpError(400, 'Provide plan_id or plan (name)');
  if (!rows.length) throw new HttpError(404, 'Plan not found');
  return rows[0];
}

/** Guard factory: allow only users whose CURRENT plan level >= minLevel (checked against the DB, not the token). */
function requirePlan(minLevel, planName) {
  return async (req, res, next) => {
    try {
      const cur = await getCurrent(pool, req.user.id);
      if (!cur) return next(new HttpError(401, 'User no longer exists'));
      if (cur.level < minLevel) {
        return next(new HttpError(403, `This content requires the ${planName} plan`, {
          your_plan: cur.plan,
          required_plan: planName,
        }));
      }
      req.plan = cur;
      next();
    } catch (e) {
      next(e);
    }
  };
}

module.exports = { FREE_PLAN_ID, PERIOD_DAYS, getCurrent, resolvePlan, requirePlan };
