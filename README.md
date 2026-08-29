# RichWiFi — Frontend

A modern Wi-Fi hotspot management platform built with **Vue 3**, **Tailwind CSS v4**, and **Paystack** for ticket purchases. Customers buy Wi-Fi access tickets online, receive them via SMS, and connect through a MikroTik hotspot.

## 🚀 Tech Stack

| Technology | Purpose |
|------------|---------|
| Vue 3 (Composition API) | UI framework |
| Tailwind CSS v4 | Styling |
| Vite 8 | Build tool & dev server |
| Paystack Inline JS | Payment processing |
| Arkesel SMS | Ticket delivery via SMS |

## 📁 Project Structure

```
src/
├── views/
│   ├── HomeView.vue          # Public landing page — locations & plans
│   ├── AdminLogin.vue        # Admin authentication
│   ├── AdminView.vue         # Admin dashboard (tabbed)
│   └── PurchaseLookupView.vue # Customer ticket lookup
├── components/
│   ├── LocationCard.vue      # Location display card
│   ├── CheckoutModal.vue     # Purchase flow (details → Paystack → polling)
│   └── admin/
│       ├── OverviewPanel.vue     # Sales analytics & charts
│       ├── LocationsPanel.vue    # Manage locations & plans
│       ├── TokensPanel.vue       # Ticket inventory & imports
│       ├── SalesPanel.vue        # Order history with filters
│       ├── SmsLogPanel.vue       # SMS delivery tracking
│       ├── BarChart.vue          # 7-day sales chart
│       ├── KpiCard.vue           # Stat cards
│       └── Pagination.vue        # Reusable pagination
├── services/
│   ├── api.js        # HTTP client with auth, error handling, CORS
│   ├── auth.js       # JWT login, session management, logout
│   ├── payment.js    # Paystack inline integration
│   └── csv.js        # CSV export utility
├── data/
│   ├── store.js      # Local state management
│   └── locations.js  # Location data helpers
├── assets/           # Images, logos
├── main.js           # App entry point
├── App.vue           # Hash-based router
└── style.css         # Global styles
```

## 🛣️ Routes

| Path | View | Description |
|------|------|-------------|
| `/#/` | HomeView | Public — browse locations, buy tickets |
| `/#/my-purchases` | PurchaseLookupView | Customers look up tickets by reference/phone |
| `/#/admin` | AdminLogin | Admin login (redirects to dashboard if authenticated) |
| `/#/admin` | AdminView | Admin dashboard with tabbed panels |

## ⚡ Getting Started

### Prerequisites

- Node.js 18+
- A running [RichWiFi Backend](https://github.com/your-org/richwifi_backend) on port 8080

### Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env — set VITE_API_URL

# Start dev server (proxies /api to backend on :8080)
npm run dev
```

The Vite dev server runs on `http://localhost:5173` with a proxy that forwards `/api/*` requests to the backend.

### Build for Production

```bash
npm run build
```

Output goes to `dist/`. Deploy to Render, Netlify, or any static host.

## 🔧 Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API base URL | `https://api.richwifi.com` |

> In development, leave this as `http://localhost:8000` or omit — the Vite proxy handles routing.

## 🛒 Purchase Flow

1. **Browse** → Customer selects a location on the home page
2. **Select Plan** → Checkout modal opens, auto-selects first in-stock plan
3. **Enter Details** → Phone number (required for SMS), optional email
4. **Pay** → Paystack inline checkout opens as popup
5. **Poll** → Frontend polls `/api/orders/{id}/poll` every 3s for payment confirmation
6. **Receive Ticket** → Ticket code displayed on screen + sent via SMS

## 🔐 Admin Dashboard

| Panel | Features |
|-------|----------|
| **Overview** | Revenue stats, 7-day sales chart, today's summary |
| **Locations** | CRUD locations, create/edit/disable plans, stock management |
| **Tickets** | Import MikroTik tickets (PDF/CSV), inventory, export, status filters |
| **Sales** | Order history with date, plan, location filters; pagination |
| **SMS Log** | Track delivery status, retry counts, error messages |

## 📦 Deployment

### Render (Static Site)

1. Push to GitHub
2. Connect repo on Render → **Static Site**
3. Set build command: `npm run build`
4. Set publish directory: `dist`
5. Set env var: `VITE_API_URL=https://api.yourdomain.com`
6. Add `public/404.html` for SPA redirect support

### Local Development

```bash
# Terminal 1 — Backend
cd ../richwifi_backend
php -S localhost:8080 -t public

# Terminal 2 — Frontend
npm run dev
```

Open `http://localhost:5173` — the proxy handles API calls automatically.

## 📄 License

Private — KingdomdataGH
