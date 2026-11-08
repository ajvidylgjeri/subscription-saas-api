# Subscription-based SaaS Backend

Express + MySQL + JWT. Users sign up (Free plan by default), subscribe to Basic/Premium, upgrade/downgrade, cancel — and routes are guarded by the user's **current plan**.

## Setup

```bash
npm install
cp .env.example .env        # then edit DB_PASSWORD and JWT_SECRET
mysql -u root -p < sql/schema.sql
npm start                   # or: npm run dev
```
Requires Node 18+ and MySQL 8.0.16+ (CHECK constraints). Send the token as `Authorization: Bearer <token>`.
Passwords are hashed with bcrypt (bcryptjs); auth uses JWT; every error is JSON `{ "error": "..." }`.

## Endpoints

| Method | Path | Access | Description |
|---|---|---|---|
| POST | /signup | public | `{name,email,password}` → user + JWT (Free plan) |
| POST | /login | public | `{email,password}` → JWT |
| GET | /plans | public | Free / Basic / Premium with price + features |
| POST | /subscribe | logged in | `{plan}` or `{plan_id}` – start a 30-day paid subscription |
| PUT | /upgrade-plan | logged in | Switch between paid plans (response says upgraded / downgraded) |
| GET | /subscription | logged in | View current plan + subscription dates |
| POST | /cancel-subscription | logged in | Cancel; user returns to Free |
| GET | /dashboard | logged in | Any plan |
| GET | /profile | logged in | Any plan |
| GET | /content | logged in | Free → limited items, paid → all items |
| GET | /premium-content | **premium only** | 403 with `required_plan` for Free/Basic |

## Design notes
- **Access control**: `requirePlan(level)` middleware reads the plan from the DB on every request (not from the JWT), so upgrades/cancellations apply instantly.
- Subscriptions expire lazily: an expired subscription is marked `expired` and the user drops to Free the next time they hit the API.
- Subscribe/upgrade/cancel run inside DB transactions with a per-user row lock, so double clicks can't create two active subscriptions.
- Schema deviation: `users.current_plan_id` (FK) instead of a plan-name string, so plan data lives in one place.

## Try it
```bash
curl -X POST localhost:3000/signup -H 'Content-Type: application/json' -d '{"name":"Ann","email":"ann@test.com","password":"password123"}'
curl localhost:3000/premium-content -H "Authorization: Bearer $TOKEN"        # 403 on Free
curl -X POST localhost:3000/subscribe -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"plan":"premium"}'
curl localhost:3000/premium-content -H "Authorization: Bearer $TOKEN"        # 200
```
