-- ============================================================
-- RichWiFi — MariaDB Schema
-- Run this manually via phpMyAdmin or CLI before deploying.
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────────────────────
-- 1. ADMINS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100)  NOT NULL,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,          -- bcrypt/argon2
  role          ENUM('super_admin','manager','viewer') NOT NULL DEFAULT 'manager',
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  last_login_at DATETIME      NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed a default super-admin (password: RichWiFi@Admin2026)
-- Hash this with bcrypt before inserting in production.
-- INSERT INTO admins (name, email, password_hash, role)
-- VALUES ('Super Admin', 'admin@richwifi.com', '<bcrypt_hash>', 'super_admin');


-- ─────────────────────────────────────────────────────────────
-- 2. LOCATIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locations (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(150)  NOT NULL,
  address       VARCHAR(300)  NOT NULL,
  theme_color   VARCHAR(100)  NOT NULL DEFAULT 'from-[#6d0214]/80 to-[#c50125]/60',
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_locations_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
-- 3. PLANS  (1-Day, 1-Week, 1-Month per location)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  location_id   INT UNSIGNED  NOT NULL,
  plan_key      ENUM('daily','weekly','monthly') NOT NULL,
  label         VARCHAR(50)   NOT NULL,          -- e.g. "1 Day"
  price         DECIMAL(10,2) NOT NULL,
  validity_days INT UNSIGNED  NOT NULL,          -- 1, 7, or 30
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_plan_location (location_id, plan_key),
  CONSTRAINT fk_plans_location
    FOREIGN KEY (location_id) REFERENCES locations(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
-- 4. TOKEN BATCHES  (one row per MikroTik PDF import)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_batches (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  location_id   INT UNSIGNED  NOT NULL,
  plan_id       INT UNSIGNED  NOT NULL,
  imported_by   INT UNSIGNED  NULL,              -- admin who imported
  filename      VARCHAR(255)  NULL,              -- original PDF name
  token_count   INT UNSIGNED  NOT NULL DEFAULT 0,
  status        ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
  notes         TEXT          NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at  DATETIME      NULL,
  INDEX idx_batches_location (location_id),
  INDEX idx_batches_plan     (plan_id),
  INDEX idx_batches_status   (status),
  CONSTRAINT fk_batches_location
    FOREIGN KEY (location_id) REFERENCES locations(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_batches_plan
    FOREIGN KEY (plan_id) REFERENCES plans(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_batches_admin
    FOREIGN KEY (imported_by) REFERENCES admins(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
-- 5. TOKENS  (individual Wi-Fi access codes)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tokens (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_id      INT UNSIGNED  NULL,
  location_id   INT UNSIGNED  NOT NULL,
  plan_id       INT UNSIGNED  NOT NULL,
  code          VARCHAR(50)   NOT NULL,          -- the actual Wi-Fi code
  status        ENUM('available','reserved','sold','used','expired','revoked')
                  NOT NULL DEFAULT 'available',
  reserved_at   DATETIME      NULL,              -- for in-flight purchases
  reserved_by   VARCHAR(255)  NULL,              -- idempotency key holding reservation
  sold_at       DATETIME      NULL,
  used_at       DATETIME      NULL,
  expires_at    DATETIME      NULL,              -- computed from plan validity
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_token_code (code),
  INDEX idx_tokens_location  (location_id),
  INDEX idx_tokens_plan      (plan_id),
  INDEX idx_tokens_status    (status),
  INDEX idx_tokens_batch     (batch_id),
  INDEX idx_tokens_reserved  (status, reserved_at),
  INDEX idx_tokens_available (location_id, plan_id, status),
  CONSTRAINT fk_tokens_location
    FOREIGN KEY (location_id) REFERENCES locations(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_tokens_plan
    FOREIGN KEY (plan_id) REFERENCES plans(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_tokens_batch
    FOREIGN KEY (batch_id) REFERENCES token_batches(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
-- 6. CUSTOMERS  (extracted from Paystack metadata)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  phone         VARCHAR(20)   NULL UNIQUE,       -- from Paystack
  email         VARCHAR(255)  NULL,
  name          VARCHAR(150)  NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customers_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
-- 7. ORDERS  (one per checkout session)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  idempotency_key     VARCHAR(64)   NOT NULL,    -- client-generated, unique per intent
  paystack_ref        VARCHAR(100)  NULL UNIQUE,  -- Paystack transaction reference
  customer_id         INT UNSIGNED  NULL,
  location_id         INT UNSIGNED  NOT NULL,
  plan_id             INT UNSIGNED  NOT NULL,
  quantity            INT UNSIGNED  NOT NULL DEFAULT 1,
  unit_price          DECIMAL(10,2) NOT NULL,
  total_amount        DECIMAL(10,2) NOT NULL,
  currency            VARCHAR(3)    NOT NULL DEFAULT 'NGN',
  status              ENUM('pending','processing','paid','failed','refunded','cancelled')
                        NOT NULL DEFAULT 'pending',
  payment_method      VARCHAR(50)   NULL,
  paystack_channel    VARCHAR(50)   NULL,
  customer_email      VARCHAR(255)  NULL,
  customer_phone      VARCHAR(20)   NULL,
  paid_at             DATETIME      NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_orders_customer    (customer_id),
  INDEX idx_orders_location    (location_id),
  INDEX idx_orders_status      (status),
  INDEX idx_orders_created     (created_at),
  INDEX idx_orders_paid_at     (paid_at),
  INDEX idx_orders_idempotency (idempotency_key),
  CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES customers(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_orders_location
    FOREIGN KEY (location_id) REFERENCES locations(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_orders_plan
    FOREIGN KEY (plan_id) REFERENCES plans(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
-- 8. ORDER_TOKENS  (links order → assigned tokens)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_tokens (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id    INT UNSIGNED  NOT NULL,
  token_id    INT UNSIGNED  NOT NULL,
  UNIQUE KEY uq_order_token (order_id, token_id),
  CONSTRAINT fk_ot_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ot_token
    FOREIGN KEY (token_id) REFERENCES tokens(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
-- 9. PAYMENT EVENTS  (full Paystack webhook audit trail)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_events (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id        INT UNSIGNED  NULL,
  paystack_ref    VARCHAR(100)  NULL,
  event_type      VARCHAR(100)  NOT NULL,        -- charge.success, charge.failed, etc.
  payload         JSON          NOT NULL,         -- full webhook body
  processed       TINYINT(1)    NOT NULL DEFAULT 0,
  error_message   TEXT          NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pe_order    (order_id),
  INDEX idx_pe_ref      (paystack_ref),
  INDEX idx_pe_type     (event_type),
  INDEX idx_pe_processed(processed),
  CONSTRAINT fk_pe_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
-- 10. CUSTOMER OTP  (for secure token lookup)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_otps (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  phone         VARCHAR(20)   NOT NULL,
  otp_hash      VARCHAR(255)  NOT NULL,          -- bcrypt hash of the 6-digit OTP
  purpose       ENUM('token_lookup','password_reset') NOT NULL DEFAULT 'token_lookup',
  attempts      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts  TINYINT UNSIGNED NOT NULL DEFAULT 5,
  is_used       TINYINT(1)    NOT NULL DEFAULT 0,
  expires_at    DATETIME      NOT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp_phone (phone, purpose, is_used),
  INDEX idx_otp_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
-- 11. CUSTOMER SESSIONS  (temporary access after OTP verification)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_sessions (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token         VARCHAR(64)   NOT NULL UNIQUE,   -- random session token
  phone         VARCHAR(20)   NOT NULL,
  expires_at    DATETIME      NOT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cs_token  (token),
  INDEX idx_cs_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────
-- 12. AUDIT LOG  (who did what and when)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_type    ENUM('admin','system','customer') NOT NULL,
  actor_id      INT UNSIGNED  NULL,
  action        VARCHAR(100)  NOT NULL,          -- e.g. 'token.batch_import', 'order.paid'
  entity_type   VARCHAR(50)   NULL,              -- e.g. 'order', 'token', 'location'
  entity_id     INT UNSIGNED  NULL,
  details       JSON          NULL,
  ip_address    VARCHAR(45)   NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_actor   (actor_type, actor_id),
  INDEX idx_audit_action  (action),
  INDEX idx_audit_entity  (entity_type, entity_id),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


SET FOREIGN_KEY_CHECKS = 1;
