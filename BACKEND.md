# RichWiFi Backend Architecture

> Complete technical specification for the RichWiFi Community Hotspot platform.
> Database: **MariaDB** · Payment: **Paystack** · Token source: **MikroTik RouterOS PDF export**

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Tech Stack](#2-tech-stack)
3. [Database Schema](#3-database-schema)
4. [Paystack Integration](#4-paystack-integration)
5. [Idempotency & Race Conditions](#5-idempotency--race-conditions)
6. [MikroTik Token Import (PDF Extraction)](#6-mikrotik-token-import-pdf-extraction)
7. [Customer Token Lookup (Secure Flow)](#7-customer-token-lookup-secure-flow)
8. [Admin Authentication & RBAC](#8-admin-authentication--rbac)
9. [Analytics & Reporting](#9-analytics--reporting)
10. [Out-of-Stock Handling](#10-out-of-stock-handling)
11. [API Endpoints Reference](#11-api-endpoints-reference)
12. [Webhook Processing](#12-webhook-processing)
13. [Security Considerations](#13-security-considerations)
14. [Deployment Checklist](#14-deployment-checklist)

---

## 1. System Overview

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│  Vue SPA     │────▶│  Express API  │────▶│  MariaDB   │
│  (Frontend)  │◀────│  (Node.js)    │◀────│            │
└─────────────┘     └──────┬───────┘     └────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌─────────┐ ┌──────────┐ ┌──────────┐
         │ Paystack │ │ MikroTik │ │  SMS API  │
         │ Gateway  │ │  Router  │ │ (for OTP) │
         └─────────┘ └──────────┘ └──────────┘
```

**Data flow for a purchase:**
1. Customer selects plan + quantity → frontend calls `POST /api/orders`
2. API validates stock within a **transaction lock**
3. Tokens are **reserved** (status → `reserved`, linked to idempotency key)
4. Paystack checkout is initialized → customer completes payment
5. Paystack webhook fires → API verifies + marks order `paid`
6. Tokens status → `sold`, linked to order
7. Access codes returned to customer

---

## 2. Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Node.js 20+ | Server |
| Framework | Express.js | HTTP routing |
| Database | MariaDB 10.6+ | Persistent storage |
| DB Driver | `mariadb` (npm) | Connection pooling |
| Payment | Paystack API | Payments processing |
| PDF Parsing | `pdf-parse` | MikroTik token extraction |
| Auth | `bcryptjs` + `jsonwebtoken` | Password hashing + JWT |
| SMS | Termii / Africa's Talking | OTP delivery |
| Validation | `zod` | Request schema validation |
| Rate Limiting | `express-rate-limit` | Brute-force protection |
| Cron | `node-cron` | Reservation cleanup, stock alerts |

**Required npm packages:**
```bash
npm install express mariadb bcryptjs jsonwebtoken pdf-parse zod \
  express-rate-limit helmet cors node-cron axios dotenv
```

---

## 3. Database Schema

> Full schema: [`schema.sql`](./schema.sql)

**12 tables** designed for this platform:

| Table | Purpose |
|-------|---------|
| `admins` | Admin accounts with RBAC |
| `locations` | Hotspot physical locations |
| `plans` | Duration-based plans per location |
| `token_batches` | MikroTik PDF import records |
| `tokens` | Individual Wi-Fi access codes |
| `customers` | Extracted from Paystack payment metadata |
| `orders` | Purchase orders (linked to Paystack) |
| `order_tokens` | Many-to-many: order ↔ tokens |
| `payment_events` | Full Paystack webhook audit trail |
| `customer_otps` | OTP records for secure lookup |
| `customer_sessions` | Temporary access after OTP verification |
| `audit_log` | Who did what, when |

---

## 4. Paystack Integration

### 4.1 Initialization Flow

```javascript
// POST /api/orders — Initialize a purchase
async function initializeOrder(req, res) {
  const { locationId, planId, quantity, email, idempotencyKey } = req.body

  // 1. Idempotency check (see section 5)
  const existing = await db.query(
    'SELECT * FROM orders WHERE idempotency_key = ?',
    [idempotencyKey]
  )
  if (existing.length) return res.json(existing[0])

  // 2. Begin transaction
  const conn = await pool.getConnection()
  await conn.beginTransaction()

  try {
    // 3. Lock available tokens (SELECT ... FOR UPDATE)
    const [tokens] = await conn.query(
      `SELECT id FROM tokens
       WHERE location_id = ? AND plan_id = ? AND status = 'available'
       LIMIT ? FOR UPDATE`,
      [locationId, planId, quantity]
    )

    if (tokens.length < quantity) {
      await conn.rollback()
      return res.status(409).json({
        error: 'Insufficient stock',
        available: tokens.length,
      })
    }

    // 4. Create order
    const plan = await conn.query('SELECT price FROM plans WHERE id = ?', [planId])
    const unitPrice = plan[0].price
    const totalAmount = unitPrice * quantity

    const [orderResult] = await conn.query(
      `INSERT INTO orders
        (idempotency_key, location_id, plan_id, quantity,
         unit_price, total_amount, customer_email, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [idempotencyKey, locationId, planId, quantity, unitPrice, totalAmount, email]
    )

    // 5. Reserve tokens
    const tokenIds = tokens.map(t => t.id)
    await conn.query(
      `UPDATE tokens SET status = 'reserved', reserved_at = NOW(), reserved_by = ?
       WHERE id IN (${tokenIds.map(() => '?').join(',')})`,
      [idempotencyKey, ...tokenIds]
    )

    // 6. Link tokens to order
    const otValues = tokenIds.map(tid => [orderResult.insertId, tid])
    for (const [oid, tid] of otValues) {
      await conn.query(
        'INSERT INTO order_tokens (order_id, token_id) VALUES (?, ?)',
        [oid, tid]
      )
    }

    await conn.commit()

    // 7. Initialize Paystack transaction
    const paystackRes = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount: Math.round(totalAmount * 100), // kobo/pesewas
        reference: `RW-${Date.now().toString(36).toUpperCase()}`,
        metadata: {
          order_id: orderResult.insertId,
          idempotency_key: idempotencyKey,
          location: locationId,
          plan: planId,
          quantity,
        },
      },
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    )

    // 8. Update order with Paystack reference
    await db.query(
      'UPDATE orders SET paystack_ref = ? WHERE id = ?',
      [paystackRes.data.data.reference, orderResult.insertId]
    )

    return res.json({
      orderId: orderResult.insertId,
      accessCode: paystackRes.data.data.access_code,
      reference: paystackRes.data.data.reference,
    })
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}
```

### 4.2 Webhook Handler

```javascript
// POST /api/webhooks/paystack
async function handlePaystackWebhook(req, res) {
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(req.body))
    .digest('hex')

  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(401).send('Invalid signature')
  }

  const event = req.body

  // Log every event
  await db.query(
    'INSERT INTO payment_events (paystack_ref, event_type, payload) VALUES (?, ?, ?)',
    [event.data?.reference, event.event, JSON.stringify(event)]
  )

  if (event.event === 'charge.success') {
    await processSuccessfulPayment(event.data)
  } else if (event.event === 'charge.failed' || event.event === 'charge.abandoned') {
    await releaseReservedTokens(event.data.reference)
  }

  res.sendStatus(200)
}

async function processSuccessfulPayment(data) {
  const conn = await pool.getConnection()
  await conn.beginTransaction()
  try {
    const [order] = await conn.query(
      `SELECT * FROM orders WHERE paystack_ref = ? AND status = 'pending' FOR UPDATE`,
      [data.reference]
    )

    if (!order.length) {
      await conn.commit() // Already processed (idempotent)
      return
    }

    // Verify amount matches
    const expectedKobo = Math.round(order[0].total_amount * 100)
    if (data.amount !== expectedKobo) {
      await conn.query(
        "UPDATE orders SET status = 'failed' WHERE id = ?",
        [order[0].id]
      )
      await conn.commit()
      return // Amount mismatch — flag for manual review
    }

    // Mark order as paid
    await conn.query(
      `UPDATE orders SET status = 'paid', paid_at = NOW(),
        payment_method = ?, paystack_channel = ?
       WHERE id = ?`,
      [data.authorization?.channel, data.authorization?.channel_type, order[0].id]
    )

    // Mark tokens as sold
    await conn.query(
      `UPDATE tokens SET status = 'sold', sold_at = NOW()
       WHERE id IN (
         SELECT token_id FROM order_tokens WHERE order_id = ?
       )`,
      [order[0].id]
    )

    // Create/update customer record
    if (data.customer?.email || data.authorization?.customer) {
      const phone = data.authorization?.customer?.phone || order[0].customer_phone
      const email = data.customer?.email || order[0].customer_email
      await upsertCustomer(conn, { phone, email })
    }

    // Audit log
    await conn.query(
      `INSERT INTO audit_log (actor_type, action, entity_type, entity_id, details)
       VALUES ('system', 'order.paid', 'order', ?, ?)`,
      [order[0].id, JSON.stringify({ reference: data.reference, amount: data.amount })]
    )

    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}
```

### 4.3 Payment Verification (always verify server-side)

```javascript
async function verifyPaystackTransaction(reference) {
  const res = await axios.get(
    `https://api.paystack.co/transaction/verify/${reference}`,
    { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
  )
  return res.data.data // { status, amount, reference, ... }
}
```

---

## 5. Idempotency & Race Conditions

### 5.1 Idempotency

Every order **must** carry a client-generated `idempotency_key` (UUID or ULID).

```
Frontend generates: crypto.randomUUID()
Stored in: orders.idempotency_key (UNIQUE index)
```

**What happens on retry/duplicate:**
- If `orders.idempotency_key` already exists → return the existing order
- If Paystack charges again for the same reference → webhook finds `status = 'paid'` → skips (idempotent)
- If the frontend calls `/api/orders` twice with the same key → second call returns the first order

**Frontend contract:**
```javascript
// On page load / before checkout:
const idempotencyKey = localStorage.getItem('rw_current_order_key')
  || crypto.randomUUID()
localStorage.setItem('rw_current_order_key', idempotencyKey)

// After payment completes successfully, clear it:
localStorage.removeItem('rw_current_order_key')
```

### 5.2 Race Conditions

**Problem:** Two customers buy the last 3 tokens simultaneously. Without locks, both succeed → overselling.

**Solution: Pessimistic locking with `SELECT ... FOR UPDATE`**

```sql
-- Inside a transaction:
SELECT id FROM tokens
WHERE location_id = ? AND plan_id = ? AND status = 'available'
LIMIT ?
FOR UPDATE;  -- ← This locks the rows until COMMIT/ROLLBACK
```

**Additional protections:**
1. **Reservation timeout cron job** — runs every 2 minutes:
   ```sql
   UPDATE tokens SET status = 'available', reserved_at = NULL, reserved_by = NULL
   WHERE status = 'reserved' AND reserved_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE);
   ```
2. **DB-level unique constraint** on `orders.idempotency_key`
3. **Connection pool limits** prevent thundering herd on the DB
4. **Isolation level:** Use `READ COMMITTED` (MariaDB default) — sufficient with explicit locks

### 5.3 Concurrency Summary

| Risk | Mitigation |
|------|-----------|
| Double payment | Idempotency key (unique constraint) + webhook dedup |
| Overselling stock | `SELECT ... FOR UPDATE` inside transaction |
| Stale reservations | Cron job releases after 10 minutes |
| Webhook replay | `payment_events.processed` flag + idempotent updates |
| Amount tampering | Server-side amount verification against `orders.total_amount` |
| Concurrent stock check | Pessimistic lock on token rows during reservation |

---

## 6. MikroTik Token Import (PDF Extraction)

MikroTik RouterOS exports hotspot user tokens as PDF files. Each PDF contains rows of:
```
username | password | profile | server | limit-uptime
```

### 6.1 Extraction Pipeline

```
Admin uploads PDF
        │
        ▼
  ┌─────────────┐
  │  pdf-parse   │  Extract raw text from PDF
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │ Regex Parse  │  Extract username/password pairs
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  Validate    │  Check format, deduplicate, skip empties
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  Bulk Insert │  INSERT IGNORE (skip duplicate codes)
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  Update Batch│  Mark batch status = 'completed'
  └─────────────┘
```

### 6.2 API Endpoint

```javascript
// POST /api/admin/tokens/import
// Requires: admin JWT, multipart/form-data with PDF file
async function importTokens(req, res) {
  const { locationId, planId } = req.body
  const pdfBuffer = req.file.buffer

  // 1. Parse PDF
  const pdfData = await pdf(pdfBuffer)
  const text = pdfData.text

  // 2. Extract tokens (MikroTik PDF format varies, use flexible regex)
  const tokens = extractTokensFromPDF(text)

  if (!tokens.length) {
    return res.status(400).json({
      error: 'No valid tokens found in PDF',
      hint: 'Ensure the PDF was exported from MikroTik RouterOS hotspot users',
    })
  }

  // 3. Create batch record
  const [batch] = await db.query(
    `INSERT INTO token_batches
      (location_id, plan_id, imported_by, filename, token_count, status)
     VALUES (?, ?, ?, ?, ?, 'processing')`,
    [locationId, planId, req.admin.id, req.file.originalname, tokens.length]
  )

  // 4. Bulk insert tokens
  let inserted = 0
  for (const token of tokens) {
    try {
      await db.query(
        `INSERT INTO tokens (batch_id, location_id, plan_id, code, expires_at)
         VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
        [batch.insertId, locationId, planId, token.code, getValidityDays(planId)]
      )
      inserted++
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') continue // Skip duplicate codes
      throw err
    }
  }

  // 5. Update batch
  await db.query(
    'UPDATE token_batches SET status = ?, token_count = ?, completed_at = NOW() WHERE id = ?',
    [inserted > 0 ? 'completed' : 'failed', inserted, batch.insertId]
  )

  return res.json({
    batchId: batch.insertId,
    total: tokens.length,
    inserted,
    duplicates: tokens.length - inserted,
  })
}

// PDF text → token array
function extractTokensFromPDF(text) {
  const tokens = []
  const lines = text.split('\n')

  for (const line of lines) {
    // MikroTik PDF format: "username    password    profile    ..."
    // Tab-separated or space-separated columns
    const parts = line.trim().split(/\s{2,}|\t/)
    if (parts.length >= 2) {
      const username = parts[0]?.trim()
      const password = parts[1]?.trim()
      if (username && password && /^[A-Za-z0-9_-]+$/.test(password)) {
        tokens.push({ code: password, username })
      }
    }
  }
  return tokens
}
```

### 6.3 MikroTik RouterOS Export Steps (for admin reference)

```
1. Login to MikroTik RouterOS webfig or Winbox
2. Go to IP → Hotspot → Users
3. Click "Export" or "Print" → Export to PDF
4. Upload the PDF via Admin Dashboard → Tokens → Import
```

---

## 7. Customer Token Lookup (Secure Flow)

### 7.1 Problem Statement

> "Anyone with a reference number or phone might view someone's tokens or purchase history."

### 7.2 Solution: OTP-Gated Token Lookup

**Three-step verification:**

```
Step 1: Enter phone or reference
         │
         ▼
Step 2: Receive OTP via SMS (6-digit, 5-min expiry)
         │
         ▼
Step 3: Enter OTP → view tokens (session expires in 15 min)
```

### 7.3 Implementation

```javascript
// ── Step 1: Request OTP ─────────────────────────────────────
// POST /api/tokens/lookup/request
async function requestLookupOTP(req, res) {
  const { phone, reference } = req.body

  // Rate limit: max 3 requests per phone per 10 minutes
  const recent = await db.query(
    `SELECT COUNT(*) as cnt FROM customer_otps
     WHERE phone = ? AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)`,
    [phone]
  )
  if (recent[0].cnt >= 3) {
    return res.status(429).json({ error: 'Too many requests. Please wait 10 minutes.' })
  }

  // Find the customer's order
  let order
  if (reference) {
    [order] = await db.query(
      'SELECT id, customer_phone FROM orders WHERE paystack_ref = ?', [reference]
    )
  } else {
    [order] = await db.query(
      'SELECT id, customer_phone FROM orders WHERE customer_phone = ?', [phone]
    )
  }

  if (!order.length) {
    // Don't reveal whether the reference/phone exists
    return res.json({ message: 'If an account exists, an OTP has been sent.' })
  }

  // Generate OTP
  const otp = generateOTP() // 6-digit random
  const otpHash = await bcrypt.hash(otp, 10)

  // Store OTP (bcrypt hashed)
  await db.query(
    `INSERT INTO customer_otps (phone, otp_hash, expires_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))`,
    [phone, otpHash]
  )

  // Send OTP via SMS
  await sendSMS(phone, `Your RichWiFi verification code is: ${otp}. Valid for 5 minutes.`)

  return res.json({ message: 'If an account exists, an OTP has been sent.' })
}

// ── Step 2: Verify OTP & Get Tokens ────────────────────────
// POST /api/tokens/lookup/verify
async function verifyLookupOTP(req, res) {
  const { phone, otp, reference } = req.body

  // Find unused, non-expired OTP
  const [otpRecord] = await db.query(
    `SELECT * FROM customer_otps
     WHERE phone = ? AND purpose = 'token_lookup'
       AND is_used = 0 AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [phone]
  )

  if (!otpRecord.length) {
    return res.status(400).json({ error: 'OTP expired or not found. Request a new one.' })
  }

  // Check attempts
  if (otpRecord[0].attempts >= otpRecord[0].max_attempts) {
    return res.status(429).json({ error: 'Too many failed attempts. Request a new OTP.' })
  }

  // Verify OTP
  const valid = await bcrypt.compare(otp, otpRecord[0].otp_hash)
  if (!valid) {
    await db.query(
      'UPDATE customer_otps SET attempts = attempts + 1 WHERE id = ?',
      [otpRecord[0].id]
    )
    return res.status(400).json({ error: 'Invalid OTP.' })
  }

  // Mark OTP as used
  await db.query(
    'UPDATE customer_otps SET is_used = 1 WHERE id = ?',
    [otpRecord[0].id]
  )

  // Find orders for this phone
  let orders
  if (reference) {
    [orders] = await db.query(
      `SELECT o.id, o.paystack_ref, o.quantity, o.total_amount, o.paid_at,
              l.name as location_name, p.label as plan_label, p.validity_days
       FROM orders o
       JOIN locations l ON o.location_id = l.id
       JOIN plans p ON o.plan_id = p.id
       WHERE o.paystack_ref = ? AND o.status = 'paid'`,
      [reference]
    )
  } else {
    [orders] = await db.query(
      `SELECT o.id, o.paystack_ref, o.quantity, o.total_amount, o.paid_at,
              l.name as location_name, p.label as plan_label, p.validity_days
       FROM orders o
       JOIN locations l ON o.location_id = l.id
       JOIN plans p ON o.plan_id = p.id
       WHERE o.customer_phone = ? AND o.status = 'paid'`,
      [phone]
    )
  }

  // Get tokens for each order
  const results = []
  for (const order of orders) {
    const [tokens] = await db.query(
      `SELECT t.code, t.status, t.expires_at
       FROM tokens t
       JOIN order_tokens ot ON t.id = ot.token_id
       WHERE ot.order_id = ?`,
      [order.id]
    )
    results.push({ ...order, tokens })
  }

  // Create temporary session
  const sessionToken = crypto.randomBytes(32).toString('hex')
  await db.query(
    `INSERT INTO customer_sessions (token, phone, expires_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
    [sessionToken, phone]
  )

  return res.json({
    sessionToken,
    expires_in: 900, // 15 minutes
    orders: results,
  })
}
```

### 7.4 Security Properties

| Threat | Mitigation |
|--------|-----------|
| Reference/phone enumeration | Generic response: "If an account exists, an OTP has been sent" |
| OTP brute-force | 5 attempts max per OTP, 3 OTP requests per 10 min |
| Session theft | 15-min expiry, session tied to phone, HTTPS-only cookies |
| Cross-customer lookup | OTP goes to the phone on file, not the submitted phone |
| Replay attacks | OTP is single-use (`is_used` flag) |
| Timing attacks | bcrypt comparison is constant-time |

---

## 8. Admin Authentication & RBAC

### 8.1 Roles

| Role | Permissions |
|------|------------|
| `super_admin` | Full access: manage admins, all CRUD, all analytics |
| `manager` | Manage locations, plans, tokens, view analytics & sales |
| `viewer` | Read-only: view analytics, sales, token inventory |

### 8.2 Login Flow

```
POST /api/admin/auth/login
Body: { email, password }
Response: { token: "<JWT>", admin: { id, name, role } }

JWT payload: { id, email, role, iat }
JWT expiry: 8 hours
JWT secret: process.env.JWT_SECRET (64+ char random string)
```

### 8.3 Middleware

```javascript
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Authentication required' })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.admin = decoded
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    next()
  }
}

// Usage:
router.get('/admin/locations', requireAuth, requireRole('super_admin', 'manager'), listLocations)
router.get('/admin/analytics', requireAuth, requireRole('super_admin', 'manager', 'viewer'), getAnalytics)
router.delete('/admin/locations/:id', requireAuth, requireRole('super_admin'), deleteLocation)
```

---

## 9. Analytics & Reporting

### 9.1 Key Metrics Endpoints

```javascript
// GET /api/admin/analytics/overview
// Query: ?from=2026-08-01&to=2026-08-26
async function getOverview(req, res) {
  const { from, to } = req.query
  const dateFilter = buildDateFilter(from, to)

  const [revenue] = await db.query(`
    SELECT
      COALESCE(SUM(total_amount), 0) as total_revenue,
      COUNT(*) as total_orders,
      COALESCE(SUM(quantity), 0) as tokens_sold,
      COALESCE(ROUND(AVG(total_amount), 2), 0) as avg_order_value
    FROM orders
    WHERE status = 'paid' ${dateFilter}
  `)

  // Previous period comparison
  const periodDays = daysBetween(from, to)
  const prevFrom = subtractDays(from, periodDays)
  const [prevRevenue] = await db.query(`
    SELECT COALESCE(SUM(total_amount), 0) as total_revenue,
           COUNT(*) as total_orders
    FROM orders
    WHERE status = 'paid'
      AND paid_at BETWEEN ? AND ?
  `, [prevFrom, from])

  return res.json({
    current: revenue[0],
    previous: prevRevenue[0],
    deltas: {
      revenue: calcDelta(revenue[0].total_revenue, prevRevenue[0].total_revenue),
      orders: calcDelta(revenue[0].total_orders, prevRevenue[0].total_orders),
    },
  })
}
```

### 9.2 Daily Sales Report

```javascript
// GET /api/admin/analytics/daily-sales
// Query: ?from=2026-08-01&to=2026-08-26&location_id=1&plan_id=1
async function getDailySales(req, res) {
  const { from, to, location_id, plan_id } = req.query

  let where = "WHERE o.status = 'paid'"
  const params = []

  if (from) { where += ' AND o.paid_at >= ?'; params.push(from) }
  if (to) { where += ' AND o.paid_at <= ?'; params.push(to + ' 23:59:59') }
  if (location_id) { where += ' AND o.location_id = ?'; params.push(location_id) }
  if (plan_id) { where += ' AND o.plan_id = ?'; params.push(plan_id) }

  const [rows] = await db.query(`
    SELECT
      DATE(o.paid_at) as date,
      l.name as location,
      p.label as plan,
      COUNT(*) as orders,
      SUM(o.quantity) as tokens_sold,
      SUM(o.total_amount) as revenue
    FROM orders o
    JOIN locations l ON o.location_id = l.id
    JOIN plans p ON o.plan_id = p.id
    ${where}
    GROUP BY DATE(o.paid_at), o.location_id, o.plan_id
    ORDER BY date DESC, revenue DESC
  `, params)

  return res.json({ sales: rows })
}
```

### 9.3 Available Analytics

| Report | Endpoint | Filters |
|--------|----------|---------|
| Overview KPIs | `GET /admin/analytics/overview` | date range |
| Daily sales | `GET /admin/analytics/daily-sales` | date range, location, plan |
| Revenue by location | `GET /admin/analytics/by-location` | date range |
| Revenue by plan | `GET /admin/analytics/by-plan` | date range, location |
| Token inventory | `GET /admin/analytics/inventory` | location, status |
| Out-of-stock alerts | `GET /admin/analytics/stock-alerts` | threshold |
| Top customers | `GET /admin/analytics/top-customers` | date range |
| Sales export (CSV) | `GET /admin/analytics/export` | all filters |

### 9.4 CSV Export

```javascript
async function exportSalesCSV(req, res) {
  const { from, to, location_id, plan_id } = req.query
  // ... same query as getDailySales ...

  const headers = ['Date', 'Location', 'Plan', 'Orders', 'Tokens Sold', 'Revenue']
  const csvRows = rows.map(r => [
    r.date, r.location, r.plan, r.orders, r.tokens_sold, r.revenue,
  ])

  const csv = [headers, ...csvRows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename=sales-report-${Date.now()}.csv`)
  res.send(csv)
}
```

---

## 10. Out-of-Stock Handling

### 10.1 Real-time Stock Check

```javascript
// GET /api/stock/:locationId/:planId
async function getStock(req, res) {
  const [result] = await db.query(`
    SELECT COUNT(*) as available
    FROM tokens
    WHERE location_id = ? AND plan_id = ? AND status = 'available'
  `, [req.params.locationId, req.params.planId])

  return res.json({
    available: result[0].available,
    low: result[0].available < 5,  // Frontend shows warning
    out: result[0].available === 0,
  })
}
```

### 10.2 Low-Stock Alerts

```javascript
// Cron job: runs every hour
const cron = require('node-cron')

cron.schedule('0 * * * *', async () => {
  const [lowStock] = await db.query(`
    SELECT l.name, p.label, COUNT(t.id) as available
    FROM locations l
    JOIN plans p ON l.id = p.location_id
    LEFT JOIN tokens t ON l.id = t.location_id
      AND p.id = t.plan_id AND t.status = 'available'
    WHERE l.is_active = 1 AND p.is_active = 1
    GROUP BY l.id, p.id
    HAVING available < 10
  `)

  if (lowStock.length) {
    // Send email notification to admin
    // or push to a notification channel
    console.warn('Low stock alerts:', lowStock)
  }
})
```

### 10.3 Automatic Stock Depletion Flow

```
Customer buys tokens
        │
        ▼
   tokens left < 5?
     ├── YES → Show warning on frontend: "Only X tokens left!"
     ├── YES (admin) → Hourly cron sends low-stock email
     └── 0 → Disable "Buy" button, show "Out of Stock"
              Admin gets immediate alert
```

---

## 11. API Endpoints Reference

### Public (no auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/locations` | List active locations + plans + stock |
| `GET` | `/api/stock/:locationId/:planId` | Check available stock |
| `POST` | `/api/orders` | Initialize purchase (idempotent) |
| `POST` | `/api/webhooks/paystack` | Paystack webhook (signature verified) |
| `POST` | `/api/tokens/lookup/request` | Request OTP for token lookup |
| `POST` | `/api/tokens/lookup/verify` | Verify OTP, return tokens |
| `GET` | `/api/plans/:locationId` | Plans + prices for a location |

### Admin (JWT required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/admin/auth/login` | Admin login |
| `GET` | `/api/admin/auth/me` | Current admin profile |
| `POST` | `/api/admin/auth/logout` | Invalidate session |
| **Locations** | | |
| `GET` | `/api/admin/locations` | List all locations |
| `POST` | `/api/admin/locations` | Create location (super_admin) |
| `PUT` | `/api/admin/locations/:id` | Update location |
| `DELETE` | `/api/admin/locations/:id` | Delete location (super_admin) |
| **Plans** | | |
| `GET` | `/api/admin/plans/:locationId` | List plans for location |
| `PUT` | `/api/admin/plans/:id` | Update plan price |
| **Tokens** | | |
| `GET` | `/api/admin/tokens` | List tokens (filterable) |
| `POST` | `/api/admin/tokens/import` | Import PDF (multipart) |
| `GET` | `/api/admin/tokens/export` | Export tokens CSV |
| `GET` | `/api/admin/tokens/batches` | List import batches |
| **Orders & Sales** | | |
| `GET` | `/api/admin/orders` | List orders (filterable) |
| `GET` | `/api/admin/orders/:id` | Order detail + tokens |
| `POST` | `/api/admin/orders/:id/refund` | Refund via Paystack |
| **Analytics** | | |
| `GET` | `/api/admin/analytics/overview` | KPIs |
| `GET` | `/api/admin/analytics/daily-sales` | Daily breakdown |
| `GET` | `/api/admin/analytics/by-location` | Revenue by location |
| `GET` | `/api/admin/analytics/by-plan` | Revenue by plan |
| `GET` | `/api/admin/analytics/inventory` | Token inventory |
| `GET` | `/api/admin/analytics/stock-alerts` | Low-stock locations |
| `GET` | `/api/admin/analytics/export` | CSV export |

---

## 12. Webhook Processing

### 12.1 Event Handling Matrix

| Paystack Event | Action | Notes |
|---------------|--------|-------|
| `charge.success` | Mark order `paid`, tokens `sold` | Verify amount server-side |
| `charge.failed` | Release reserved tokens, mark order `failed` | — |
| `charge.abandoned` | Release reserved tokens after 15 min | Timeout-based |
| `refund.created` | Mark order `refunded`, tokens `revoked` | Use Paystack refund API |
| `refund.failed` | Log event, flag for manual review | Alert admin |

### 12.2 Processing Guarantees

1. **Signature verification** — reject unsigned webhooks
2. **Idempotent processing** — check `payment_events.processed` before acting
3. **Atomic transactions** — order + token updates in single transaction
4. **Full audit trail** — every webhook stored in `payment_events`
5. **Retry tolerance** — Paystack retries up to 3 times; we handle gracefully

---

## 13. Security Considerations

### Environment Variables

```env
# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=richwifi
DB_PASSWORD=<strong-random>
DB_NAME=richwifi

# Paystack
PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_PUBLIC_KEY=pk_live_...

# Auth
JWT_SECRET=<64+ char random string>
ADMIN_DEFAULT_PASSWORD=<change-on-first-login>

# SMS Provider
SMS_API_KEY=...
SMS_SENDER_ID=RichWiFi

# App
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://richwifi.com
```

### Security Checklist

- [ ] All DB credentials in `.env`, never committed to git
- [ ] Paystack secret key server-side only
- [ ] HTTPS enforced (redirect HTTP → HTTPS)
- [ ] CORS restricted to `FRONTEND_URL`
- [ ] Rate limiting on auth endpoints (5 req/min)
- [ ] Rate limiting on OTP endpoints (3 req/10 min)
- [ ] Helmet.js for HTTP security headers
- [ ] Input validation with Zod on all endpoints
- [ ] SQL injection prevented (parameterized queries only)
- [ ] PDF upload: file type validation (PDF only), size limit (10MB)
- [ ] Admin JWT expiry: 8 hours
- [ ] Customer session expiry: 15 minutes
- [ ] Reservation timeout: 10 minutes
- [ ] Audit logging on all mutations

---

## 14. Deployment Checklist

### Step 1: Database Setup
```bash
# Via phpMyAdmin:
# 1. Create database `richwifi`
# 2. Import schema.sql
# 3. Create a DB user with SELECT, INSERT, UPDATE, DELETE on richwifi.*
```

### Step 2: Environment Setup
```bash
# Create .env with all variables from section 13
# Generate JWT_SECRET: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Step 3: Backend Deployment
```bash
npm install
npm run build  # if using TypeScript
npm start      # or pm2 start app.js
```

### Step 4: Paystack Configuration
```
1. Get API keys from https://dashboard.paystack.com
2. Set webhook URL: https://yourdomain.com/api/webhooks/paystack
3. Enable events: charge.success, charge.failed, charge.abandoned, refund.created
4. Test with Paystack test cards first
```

### Step 5: MikroTik Configuration
```
1. Ensure RouterOS hotspot is configured
2. Export user list as PDF from: IP → Hotspot → Users → Print → Export
3. Upload via Admin Dashboard → Tokens → Import
```

---

## Appendix: MikroTik PDF Format Reference

MikroTik RouterOS exports hotspot users as a table PDF. Typical columns:

```
#  | SERVER     | NAME      | PASSWORD     | PROFILE   | LIMIT-UPTIME
1  | hotspot1   | user001   | AbCd1234     | 1-day     | 00:24:00
2  | hotspot1   | user002   | XyZ98765     | 1-week    | 168:00:00
3  | hotspot1   | user003   | MnOp4567     | 1-month   | 720:00:00
```

The **PASSWORD** column is the access code customers will use.
The **PROFILE** column maps to our plan duration.
The extraction regex handles both tab-separated and multi-space-separated formats.
