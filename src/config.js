'use strict';

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function loadGoogleCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must contain valid JSON');
    }
  }

  if (!process.env.GOOGLE_KEYFILE) return null;

  const keyfilePath = path.resolve(process.cwd(), process.env.GOOGLE_KEYFILE);
  return JSON.parse(fs.readFileSync(keyfilePath, 'utf8'));
}

const port = parsePositiveInteger(process.env.PORT, 3000);
const appUrl = (process.env.APP_URL || `http://localhost:${port}`).replace(/\/$/, '');

module.exports = {
  appUrl,
  calendarId: process.env.CALENDAR_ID || null,
  corsOrigin: process.env.CORS_ORIGIN || null,
  googleCredentials: loadGoogleCredentials(),
  port,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || null,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || null,
  timeZone: process.env.TIME_ZONE || 'America/Chicago',
};
