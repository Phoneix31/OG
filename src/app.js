'use strict';

const path = require('path');
const cors = require('cors');
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const config = require('./config');
const bookingRoutes = require('./routes/bookings');
const paymentRoutes = require('./routes/payments');
const calendar = require('./services/calendar');
const stripe = require('./services/stripe');

const app = express();
const publicDirectory = path.resolve(__dirname, '..', 'public');

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
if (config.corsOrigin) app.use(cors({ origin: config.corsOrigin }));

// Stripe must receive the untouched request body for signature verification.
app.post('/api/webhook', express.raw({ type: 'application/json' }), paymentRoutes.handleWebhook);

app.use(express.json({ limit: '100kb' }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-8' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    services: {
      calendar: calendar.isConfigured,
      payments: Boolean(stripe),
    },
  });
});
app.use('/api', bookingRoutes);
app.use('/api', paymentRoutes.router);
app.use(express.static(publicDirectory, { extensions: ['html'] }));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((error, _req, res, _next) => {
  console.error('Request failed:', error.message);
  const status = error.message.includes('not configured') ? 503 : 500;
  res.status(status).json({ error: status === 503 ? error.message : 'Internal server error' });
});

module.exports = app;
