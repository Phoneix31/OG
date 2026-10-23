'use strict';

const { google } = require('googleapis');
const config = require('../config');

let calendarClientPromise;

function parseDuration(value) {
  const duration = Number.parseInt(value, 10);
  if (!Number.isInteger(duration) || duration < 1 || duration > 12) {
    throw new Error('Duration must be between 1 and 12 hours');
  }
  return duration;
}

function parseLocalDateTime(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error('Invalid date or time');
  }

  const parsed = new Date(`${date}T${time}:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid date or time');
  return parsed;
}

async function getCalendarClient() {
  if (!config.googleCredentials || !config.calendarId) return null;

  if (!calendarClientPromise) {
    calendarClientPromise = (async () => {
      const credentials = { ...config.googleCredentials };
      if (credentials.private_key) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }

      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/calendar'],
      });
      return google.calendar({ version: 'v3', auth: await auth.getClient() });
    })().catch((error) => {
      calendarClientPromise = undefined;
      throw error;
    });
  }

  return calendarClientPromise;
}

async function listEventsForDate(date) {
  const calendar = await getCalendarClient();
  if (!calendar) throw new Error('Calendar is not configured');

  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T23:59:59.999`);
  if (Number.isNaN(dayStart.getTime()) || Number.isNaN(dayEnd.getTime())) {
    throw new Error('Invalid date');
  }

  const response = await calendar.events.list({
    calendarId: config.calendarId,
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  return response.data.items || [];
}

async function getBookedTimes(date) {
  const events = await listEventsForDate(date);
  return events
    .filter((event) => event.start?.dateTime && event.end?.dateTime)
    .map((event) => ({ start: event.start.dateTime, end: event.end.dateTime }));
}

async function findAvailability(date, startTime, durationValue) {
  const duration = parseDuration(durationValue);
  const events = await listEventsForDate(date);
  const proposedStart = parseLocalDateTime(date, startTime);
  const proposedEnd = new Date(proposedStart.getTime() + duration * 60 * 60 * 1000);

  const overlaps = (start, end) => events.some((event) => {
    if (!event.start?.dateTime || !event.end?.dateTime) return false;
    return start < new Date(event.end.dateTime) && end > new Date(event.start.dateTime);
  });

  if (!overlaps(proposedStart, proposedEnd)) return { available: true, suggestedStart: null };

  const candidateTimes = [
    '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
    '15:00', '16:00', '17:00', '18:00', '19:00', '20:00',
  ];
  const startIndex = Math.max(candidateTimes.indexOf(startTime) + 1, 0);

  for (const candidate of candidateTimes.slice(startIndex)) {
    const candidateStart = parseLocalDateTime(date, candidate);
    const candidateEnd = new Date(candidateStart.getTime() + duration * 60 * 60 * 1000);
    if (!overlaps(candidateStart, candidateEnd)) {
      return { available: false, suggestedStart: candidate };
    }
  }

  return { available: false, suggestedStart: null };
}

async function createBookingEvent({ name, email, phone, date, startTime, duration: durationValue }) {
  const calendar = await getCalendarClient();
  if (!calendar) throw new Error('Calendar is not configured');

  const duration = parseDuration(durationValue);
  const start = parseLocalDateTime(date, startTime);
  const end = new Date(start.getTime() + duration * 60 * 60 * 1000);
  const depositAmount = 50 * duration;
  const remainingAmount = 200 * duration;

  const event = {
    summary: `Photography Session: ${name}`,
    description: [
      `Client: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone || 'Not provided'}`,
      `Deposit paid: $${depositAmount}`,
      `Remaining balance: $${remainingAmount}`,
    ].join('\n'),
    start: { dateTime: start.toISOString(), timeZone: config.timeZone },
    end: { dateTime: end.toISOString(), timeZone: config.timeZone },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 60 },
      ],
    },
  };

  const result = await calendar.events.insert({
    calendarId: config.calendarId,
    resource: event,
  });
  return result.data;
}

module.exports = {
  createBookingEvent,
  findAvailability,
  getBookedTimes,
  isConfigured: Boolean(config.googleCredentials && config.calendarId),
};
