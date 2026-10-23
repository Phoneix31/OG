# OG Photography

Photography portfolio and booking application with a static frontend, an Express API,
Stripe Checkout, and Google Calendar integration.

## Project structure

```text
public/                 Static site served by Express and GitHub Pages
  assets/css/           Stylesheets
  assets/js/            Browser JavaScript
  assets/images/        Portfolio images
src/
  routes/               HTTP route handlers
  services/             Stripe and Google Calendar integrations
  app.js                 Express application configuration
  config.js              Environment-backed configuration
  server.js              Process entry point
test/                    Automated checks
```

## Local setup

1. Install Node.js 22 or newer.
2. Run `npm ci`.
3. Copy `.env.example` to `.env` and replace placeholders locally.
4. Run `npm start` and open `http://localhost:3000`.

Never commit `.env`, Google service-account files, booking exports, logs, or other
customer data. GitHub Pages deploys only `public/`; the API must be hosted separately
for live booking and payment features.

## Commands

- `npm start` — run the production server.
- `npm run dev` — run the server with Node's watch mode.
- `npm test` — run security and configuration checks.
- `npm run check` — syntax-check all server modules and browser JavaScript.
