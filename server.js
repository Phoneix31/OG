const express = require('express');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET;
const stripe = STRIPE_KEY ? require('stripe')(STRIPE_KEY) : null;
if (!stripe) console.warn('⚠️ Stripe is not configured — payment features are disabled.');

const app = express();
const PORT = 3000;

// Google Calendar Setup
const keyfilePath = process.env.GOOGLE_KEYFILE || path.join(__dirname, 'google-service-account.json');
let serviceAccount = null;
try {
  serviceAccount = require(keyfilePath);
} catch (err) {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try { 
      serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON); 
    } catch (e) { 
      serviceAccount = null; 
    }
  } else {
    serviceAccount = null;
  }
}

if (serviceAccount && serviceAccount.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

let calendar = null;
const calendarId = process.env.CALENDAR_ID;

async function initCalendarAuth() {
  if (!serviceAccount || !calendarId) {
    console.warn('⚠️ Google Calendar is not configured — calendar features disabled.');
    return;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const client = await auth.getClient();
    calendar = google.calendar({ version: 'v3', auth: client });
    console.log('✅ Google Calendar auth OK for', serviceAccount.client_email);
  } catch (err) {
    calendar = null;
    console.error('❌ Google Calendar auth failed:', err.message);
  }
}

// Test endpoint for calendar authentication
app.get('/api/calendar-test', async (req, res) => {
  if (!calendar) return res.status(503).json({ ok: false, message: 'Calendar not configured' });
  try {
    const now = new Date();
    const resp = await calendar.events.list({ 
      calendarId, 
      timeMin: now.toISOString(), 
      timeMax: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), 
      singleEvents: true, 
      maxResults: 5 
    });
    return res.json({ ok: true, items: resp.data.items || [] });
  } catch (err) {
    console.error('Calendar test failed:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Initialize calendar auth
initCalendarAuth().catch(err => console.error('initCalendarAuth error:', err));

// Middleware
app.use(helmet({ contentSecurityPolicy: false, hsts: false }));
app.use(cors());
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Simplified webhook (no longer creates calendar events)
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (request, response) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return response.status(503).json({ error: 'Stripe is not configured' });
  }

  const sig = request.headers['stripe-signature'];
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(request.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    console.log('Webhook received:', event.type, event.data.object.id);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return response.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  if (event.type === 'checkout.session.completed') {
    console.log('✅ Checkout session completed:', event.data.object.id);
  }
  
  response.status(200).json({ received: true });
});

// Get booked times for date picker
app.post('/api/booked-times', async (req, res) => {
  const { date } = req.body;
  if (!date) return res.json({ success: false, message: 'Date required' });

  if (!calendar) {
    return res.status(503).json({ success: false, message: 'Calendar not configured' });
  }

  try {
    const timeMin = new Date(`${date}T00:00:00`);
    const timeMax = new Date(`${date}T23:59:59`);
    const response = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    const booked = events.map(event => ({
      start: event.start.dateTime,
      end: event.end.dateTime,
    }));

    res.json({ success: true, booked });
  } catch (err) {
    console.error('Error fetching booked times:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Check booking availability
app.post('/api/book', async (req, res) => {
  const { date, startTime, duration, name, email, phone } = req.body;
  if (!date || !startTime || !duration) {
    return res.json({ success: false, message: 'Missing required fields' });
  }

  if (!calendar) {
    return res.status(503).json({ success: false, message: 'Calendar not configured' });
  }

  try {
    const timeMin = new Date(`${date}T00:00:00`);
    const timeMax = new Date(`${date}T23:59:59`);
    const response = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    const proposedStart = new Date(`${date}T${startTime}:00`);
    const proposedEnd = new Date(proposedStart.getTime() + parseInt(duration) * 60 * 60 * 1000);

    let isBooked = false;
    for (let event of events) {
      const eventStart = new Date(event.start.dateTime);
      const eventEnd = new Date(event.end.dateTime);
      if (proposedStart < eventEnd && proposedEnd > eventStart) {
        isBooked = true;
        break;
      }
    }

    if (isBooked) {
      const availableTimes = [
        '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', 
        '16:00', '17:00', '18:00', '19:00', '20:00'
      ];
      const startIndex = availableTimes.indexOf(startTime) + 1;
      let suggested = null;
      
      for (let i = startIndex; i < availableTimes.length; i++) {
        const altStart = availableTimes[i];
        const altStartDate = new Date(`${date}T${altStart}:00`);
        const altEndDate = new Date(altStartDate.getTime() + parseInt(duration) * 60 * 60 * 1000);
        let altFree = true;
        
        for (let event of events) {
          const eventStart = new Date(event.start.dateTime);
          const eventEnd = new Date(event.end.dateTime);
          if (altStartDate < eventEnd && altEndDate > eventStart) {
            altFree = false;
            break;
          }
        }
        if (altFree) {
          suggested = altStart;
          break;
        }
      }
      return res.json({ success: false, suggestedStart: suggested || 'No alternatives today' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error checking slot:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create Stripe checkout session with COMPLETE form data
app.post('/api/create-checkout-session', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured' });
  }

  const { name, email, phone, date, startTime, duration } = req.body;
  
  if (!name || !email || !phone || !date || !startTime || !duration) {
    return res.status(400).json({ error: 'All form fields are required' });
  }

  try {
    const depositAmount = 5000 * parseInt(duration); // $50/hour in cents
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'Photography Session Deposit' },
          unit_amount: depositAmount,
        },
        quantity: 1,
      }],
      metadata: {
        name,           // Full name from form
        email,          // Email from form
        phone,          // Phone number from form
        date,           // Selected date
        startTime,      // Selected start time
        duration,       // Selected duration
        depositAmount: depositAmount.toString()
      },
      success_url: `http://localhost:3000/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: 'http://localhost:3000/cancel.html',
    });

    console.log('✅ Checkout session created for:', { name, email, phone: phone || 'Not provided', date, startTime, duration });
    res.json({ url: session.url });
  } catch (err) {
    console.error('❌ Error creating session:', err.message);
    res.status(500).send('Error creating Stripe session');
  }
});

// Confirm booking and create calendar event on success page
app.post('/api/confirm-booking', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ success: false, message: 'Stripe is not configured' });
  }

  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ success: false, message: 'Session ID required' });
  }
  
  try {
    // Verify Stripe session and payment status
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ success: false, message: 'Payment not completed' });
    }
    
    // Extract ALL form data from metadata
    const { 
      name, 
      email, 
      phone, 
      date, 
      startTime, 
      duration 
    } = session.metadata;
    
    if (!name || !email || !date || !startTime || !duration) {
      return res.status(400).json({ success: false, message: 'Missing booking details in session' });
    }
    
    console.log('🔄 Confirming complete booking:', { 
      name, 
      email, 
      phone: phone || 'Not provided', 
      date, 
      startTime, 
      duration 
    });
    
    // Create calendar event with all form data
    await createCalendarEvent(
      name, 
      email, 
      phone || '',  // Include phone (empty if missing)
      date, 
      startTime, 
      parseInt(duration, 10)
    );
    
    console.log(`✅ Complete booking confirmed and calendar event created for ${name}`);
    res.json({ 
      success: true, 
      message: 'Booking confirmed and added to calendar',
      bookingDetails: { 
        name, 
        email, 
        phone: phone || 'Not provided', 
        date, 
        startTime, 
        duration 
      }
    });
  } catch (err) {
    console.error('❌ Error confirming booking:', err.message);
    res.status(500).json({ success: false, message: 'Failed to confirm booking - calendar event not created' });
  }
});

// Create detailed calendar event with EXACT format requested
async function createCalendarEvent(name, email, phone, date, startTime, duration) {
  try {
    const startDateTime = new Date(`${date}T${startTime}:00`);
    if (isNaN(startDateTime.getTime())) {
      throw new Error('Invalid start date/time');
    }
    const endDateTime = new Date(startDateTime.getTime() + parseInt(duration) * 60 * 60 * 1000);
    if (isNaN(endDateTime.getTime())) {
      throw new Error('Invalid duration');
    }

    // Format times and date for display (EXACT format requested)
    const startTimeDisplay = startDateTime.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    const endTimeDisplay = endDateTime.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    const dateDisplay = startDateTime.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // Calculate payment amounts
    const depositAmount = 50 * parseInt(duration);
    const remainingAmount = 200 * parseInt(duration);

    const event = {
      summary: `📸 Photography Session: ${name}`,
      description: `📅 Date: ${dateDisplay}
🕐 Time: ${startTimeDisplay} - ${endTimeDisplay} (${duration} hour${duration > 1 ? 's' : ''})
👤 Client: ${name}
📧 Email: ${email}
📞 Phone: ${phone || 'Not provided'}
💰 Deposit Paid: $${depositAmount}
💳 Remaining Balance: $${remainingAmount} (due after session)`,
      start: { 
        dateTime: startDateTime.toISOString(), 
        timeZone: 'America/Chicago' 
      },
      end: { 
        dateTime: endDateTime.toISOString(), 
        timeZone: 'America/Chicago' 
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // Email 24 hours before
          { method: 'popup', minutes: 60 }        // Popup 1 hour before
        ]
      },
      colorId: '3' // Light blue for easy identification
    };

    console.log('📅 Creating calendar event in:', calendarId);
    console.log('👤 Event details:', { name, email, phone: phone || 'Not provided', date, startTime, duration });
    
    const result = await calendar.events.insert({
      calendarId,
      resource: event,
    });
    
    console.log('✅ Event created successfully:', result.data.summary);
    console.log('🔗 Event URL:', result.data.htmlLink);
    return result.data;
  } catch (err) {
    console.error('❌ Failed to create calendar event:', err.message);
    throw err;
  }
}

// Debug endpoint for testing calendar events
app.post('/api/debug/create-event', async (req, res) => {
  const { name, email, phone, date, startTime, duration } = req.body;
  if (!name || !email || !date || !startTime || !duration) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }
  if (!calendar) {
    return res.status(503).json({ success: false, message: 'Calendar not configured' });
  }
  
  try {
    const ev = await createCalendarEvent(
      name, 
      email, 
      phone || '', 
      date, 
      startTime, 
      parseInt(duration, 10)
    );
    return res.json({ 
      success: true, 
      event: ev,
      htmlLink: ev.htmlLink 
    });
  } catch (err) {
    console.error('Debug create-event failed:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📅 Calendar configured: ${calendar ? 'YES' : 'NO'}`);
  console.log(`🔐 Stripe configured: ${stripe ? 'YES' : 'NO'}`);
});
