# RichWiFi

Wi-Fi hotspot ticketing platform. Customers purchase access tickets online, receive them via SMS, and connect through MikroTik hotspot.

**Live:** [richwifi.com](https://richwifi.com)  
**Backend:** [richwifi-backend](https://github.com/rosina4555-sudo/richwifi-backend)

---

## Stack

- **Vue 3** (Composition API, `<script setup>`)
- **Tailwind CSS v4**
- **Vite 8**
- **Paystack Inline** — payment processing
- **Arkesel SMS** — ticket delivery

## Setup

```bash
npm install
cp .env.example .env   # set VITE_API_URL
npm run dev             # http://localhost:5173 (proxies /api to backend)
```

### Environment

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:8080` |

## Build

```bash
npm run build    # outputs to dist/
```

Deploy `dist/`

## Project Structure

```
src/
├── views/
│   ├── HomeView.vue            # Locations & plans
│   ├── AdminLogin.vue          # Admin auth
│   ├── AdminView.vue           # Dashboard (tabbed)
│   └── PurchaseLookupView.vue  # Ticket lookup
├── components/
│   ├── LocationCard.vue        # Location card
│   ├── CheckoutModal.vue       # Purchase flow
│   └── admin/
│       ├── OverviewPanel.vue   # Analytics
│       ├── LocationsPanel.vue  # Locations & plans
│       ├── TokensPanel.vue     # Ticket inventory
│       ├── SalesPanel.vue      # Orders
│       ├── SmsLogPanel.vue     # SMS tracking
│       ├── BarChart.vue        # Sales chart
│       ├── KpiCard.vue         # Stat cards
│       └── Pagination.vue      # Pagination
├── services/
│   ├── api.js      # HTTP client
│   ├── auth.js     # JWT session
│   ├── payment.js  # Paystack inline
│   └── csv.js      # CSV export
└── App.vue         # Hash router
```

## Purchase Flow

1. Select a location → checkout modal opens
2. Pick a plan (auto-selects first in-stock)
3. Enter phone (required for SMS) + optional email
4. Pay via Paystack popup
5. Frontend polls for confirmation
6. Ticket displayed on screen + sent via SMS

## Admin Dashboard

| Panel | What it does |
|-------|-------------|
| Overview | Revenue, 7-day chart, today's stats |
| Locations | Manage locations, create/edit plans, stock |
| Tickets | Import from MikroTik (PDF/CSV), inventory |
| Sales | Order history, filters, pagination |
| SMS Log | Delivery status, errors, retry counts |
