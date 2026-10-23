'use strict';

const express = require('express');
const config = require('../config');
const calendar = require('../services/calendar');
const stripe = require('../services/stripe');

const router = express.Router();

function requireStripe(res) {
  if (stripe) return true;
  res.status(503).json({ error: 'Payment service is not configured' });
  return false;
}

async function handleWebhook(req, res) {
  if (!requireStripe(res)) return;
  if (!config.stripeWebhookSecret) {
    res.status(503).json({ error: 'Stripe webhook verification is not configured' });
    return;
  }

  try {
    stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      config.stripeWebhookSecret,
    );
    res.json({ received: true });
  } catch {
    res.status(400).json({ error: 'Invalid webhook signature' });
  }
}

router.post('/create-checkout-session', async (req, res, next) => {
  if (!requireStripe(res)) return;

  const { name, email, phone, date, startTime, duration } = req.body || {};
  const parsedDuration = Number.parseInt(duration, 10);
  if (!name || !email || !phone || !date || !startTime || !Number.isInteger(parsedDuration)) {
    return res.status(400).json({ error: 'All booking fields are required' });
  }
  if (parsedDuration < 1 || parsedDuration > 12) {
    return res.status(400).json({ error: 'Duration must be between 1 and 12 hours' });
  }

  try {
    const depositAmount = 5000 * parsedDuration;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'Photography Session Deposit' },
          unit_amount: depositAmount,
        },
        quantity: 1,
      }],
      metadata: { name, email, phone, date, startTime, duration: String(parsedDuration) },
      success_url: `${config.appUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.appUrl}/cancel.html`,
    });
    return res.json({ url: session.url });
  } catch (error) {
    return next(error);
  }
});

router.post('/confirm-booking', async (req, res, next) => {
  if (!requireStripe(res)) return;

  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ success: false, message: 'Session ID is required' });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ success: false, message: 'Payment is not complete' });
    }

    const booking = session.metadata || {};
    const { name, email, phone, date, startTime, duration } = booking;
    if (!name || !email || !date || !startTime || !duration) {
      return res.status(400).json({ success: false, message: 'Booking details are incomplete' });
    }

    await calendar.createBookingEvent({ name, email, phone, date, startTime, duration });
    return res.json({ success: true, message: 'Booking confirmed' });
  } catch (error) {
    return next(error);
  }
});

module.exports = { handleWebhook, router };
