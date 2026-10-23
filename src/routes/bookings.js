'use strict';

const express = require('express');
const calendar = require('../services/calendar');

const router = express.Router();

router.post('/booked-times', async (req, res, next) => {
  try {
    if (!req.body?.date) return res.status(400).json({ success: false, message: 'Date is required' });
    const booked = await calendar.getBookedTimes(req.body.date);
    return res.json({ success: true, booked });
  } catch (error) {
    return next(error);
  }
});

router.post('/book', async (req, res, next) => {
  try {
    const { date, startTime, duration } = req.body || {};
    if (!date || !startTime || !duration) {
      return res.status(400).json({ success: false, message: 'Date, start time, and duration are required' });
    }

    const availability = await calendar.findAvailability(date, startTime, duration);
    return res.json({
      success: availability.available,
      suggestedStart: availability.suggestedStart || undefined,
      message: availability.available ? undefined : 'The requested time is unavailable',
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
