# Allo Health — Inventory Reservation System

A Next.js application implementing a race-condition-free inventory reservation system for multi-warehouse retail.

---

## Running Locally

### 1. Prerequisites

- Node.js 18+
- A hosted Postgres database (Supabase free tier recommended)

### 2. Clone & Install

```bash
git clone <your-repo>
cd allo-health-inventory
npm install
```

### 3. Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require"
CRON_SECRET="any-random-string"
```

Get your `DATABASE_URL` from:
- **Supabase**: Project Settings → Database → Connection string → URI
- **Neon**: Dashboard → Connection Details

### 4. Migrate & Seed

```bash
# Push schema to database
npm run db:push

# Seed with products, warehouses, and stock
npm run db:seed
```

### 5. Run

```bash
npm run dev
# Open http://localhost:3000
```

---

## How the Expiry Mechanism Works in Production

Reservations have a 10-minute window (`expiresAt`). There are **two expiry layers**:

### Layer 1: Lazy Cleanup on Read (development-friendly)
When `GET /api/products` is called, it checks for expired pending reservations and releases them inline before returning product data. This ensures fresh stock numbers on every product page load with zero infrastructure.

**Trade-off**: If nobody visits the products page, stock stays "tied up" in expired reservations until someone does. Acceptable for low-traffic periods.

### Layer 2: Vercel Cron Job (production)
A cron job at `/api/cron/expire-reservations` runs **every minute** via Vercel's built-in scheduler (configured in `vercel.json`). It finds all `pending` reservations where `expiresAt < now` and atomically returns their stock.

The endpoint is protected by a `CRON_SECRET` in the `Authorization` header, so only Vercel's cron service can trigger it.

**Together**: In production, stock is freed within 1 minute of expiry regardless of traffic. Lazy cleanup is a safety net.

---

## Architecture Decisions

### The Core Problem: Race Conditions on Reservation

The naive approach fails under concurrency:

```
T=0ms: Request A reads stock → 1 unit available ✓
T=1ms: Request B reads stock → 1 unit available ✓  (before A updates)
T=2ms: Request A updates reservedUnits += 1 → reservedUnits = 1
T=3ms: Request B updates reservedUnits += 1 → reservedUnits = 2  ← OVERBOOKED!
```

### The Solution: Atomic Conditional UPDATE

Instead of read-then-write, we do a single SQL statement with a WHERE condition:

```sql
UPDATE "StockLevel"
SET "reservedUnits" = "reservedUnits" + {quantity}
WHERE "productId" = {productId}
  AND "warehouseId" = {warehouseId}
  AND ("totalUnits" - "reservedUnits") >= {quantity}
```

Postgres guarantees this is atomic. The database engine serializes concurrent writes to the same row. If two requests hit simultaneously:
- One gets the lock first → updates the row → succeeds
- The second finds the condition false (stock now taken) → 0 rows affected → gets 409

**Zero race conditions. No Redis needed for this.**

### Why This Over Other Approaches

| Approach | Problem |
|---|---|
| Application-level mutex | Doesn't work across multiple server instances |
| `SELECT FOR UPDATE` | Works but more verbose; still requires the WHERE condition logic |
| Redis distributed lock | Adds infrastructure; unnecessary for Postgres |
| **Atomic UPDATE with WHERE** | ✅ Simple, reliable, scales with Postgres |

### Data Model: `totalUnits` vs `reservedUnits`

```
availableUnits = totalUnits - reservedUnits
```

- `totalUnits` = physical inventory in warehouse
- `reservedUnits` = units currently held by pending reservations
- `availableUnits` = what we show customers (derived)

When a reservation is **confirmed**: `reservedUnits` stays elevated (those units are sold).
When a reservation is **released**: `reservedUnits` decremented back (units returned to pool).

This keeps available stock accurate at all times without scanning all reservations.

---

## API Reference

| Method | Path | Status Codes | Behaviour |
|--------|------|------|-----------|
| GET | `/api/products` | 200 | Products with available stock per warehouse |
| GET | `/api/warehouses` | 200 | All warehouses |
| POST | `/api/reservations` | 201, 400, 409 | Reserve units. **409** = not enough stock |
| GET | `/api/reservations/:id` | 200, 404 | Get reservation details |
| POST | `/api/reservations/:id/confirm` | 200, 410 | Confirm payment. **410** = expired |
| POST | `/api/reservations/:id/release` | 200 | Release reservation early |
| GET | `/api/cron/expire-reservations` | 200 | Cron: release all expired (needs auth header) |

### Bonus: Idempotency

Pass `Idempotency-Key: <uuid>` on `POST /api/reservations`. If the client retries with the same key (e.g., network timeout), the server returns the original response without creating a duplicate reservation.

---

## Stack

| Tool | Purpose |
|---|---|
| Next.js 14 (App Router) | Full-stack framework |
| TypeScript | Type safety end-to-end |
| Prisma | Type-safe ORM |
| Supabase / Neon | Hosted Postgres |
| Zod | Request validation (shared API ↔ form schemas) |
| Tailwind CSS | Utility-first styling |
| Vercel | Hosting + Cron |

---

## Trade-offs & What I'd Do Differently With More Time

### Trade-offs Made

**1. Quantity hardcoded to 1 in UI**
The API supports any quantity, but the frontend always reserves 1 unit. This keeps the UI simple. A real checkout would let users pick quantity before reserving.

**2. No authentication**
There's no user identity — anyone can confirm or release any reservation by ID. In production, you'd gate confirm/release endpoints behind auth (the reservation ID would come from the user's session, not be guessable).

**3. Lazy cleanup runs on every product fetch**
This does extra DB queries on every page load. A cleaner version would only run cleanup in the background worker and trust the cron. I kept it because it makes local dev (without the cron) feel correct.

**4. `reservedUnits` accumulates after confirm**
On confirmation, I don't decrement `totalUnits`. This means the product page keeps showing 0 available (which is correct), but the accounting isn't perfectly clean. A production system would subtract from `totalUnits` on confirm to reflect the physical sale.

### With More Time

- **Pessimistic locking test**: Write a test that fires 100 concurrent reservation requests for a product with 1 unit, assert exactly 1 succeeds. This is the most important correctness proof.
- **Proper auth** with NextAuth or Clerk
- **Optimistic UI** on the product page (immediately show stock -1 after reserving, revert if it fails)
- **WebSocket or SSE** for real-time stock updates across browser tabs
- **Redis for idempotency** instead of DB unique constraint (faster, avoids DB write on retry)
- **E2E tests** with Playwright covering the full reserve → confirm / expire flow

---

## Project Structure

```
allo-health/
├── prisma/
│   ├── schema.prisma          # Data model
│   └── seed.ts                # Sample data
├── src/
│   └── app/
│       ├── page.tsx           # Product listing
│       ├── checkout/[id]/
│       │   └── page.tsx       # Checkout with countdown
│       ├── api/
│       │   ├── products/route.ts
│       │   ├── warehouses/route.ts
│       │   ├── reservations/
│       │   │   ├── route.ts           # POST (reserve)
│       │   │   └── [id]/
│       │   │       ├── route.ts       # GET
│       │   │       ├── confirm/route.ts
│       │   │       └── release/route.ts
│       │   └── cron/
│       │       └── expire-reservations/route.ts
│       └── lib/
│           └── prisma.ts      # Singleton client
├── vercel.json                # Cron schedule
└── .env.example
```
