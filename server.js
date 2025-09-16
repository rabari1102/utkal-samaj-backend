const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const compression = require('compression');
const path = require('path');
require('dotenv').config();
const serveIndex = require('serve-index');
// Security and Sanitization Packages
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');

const connectDB = require('./config/database');
const { sendDonationReminders } = require('./services/cronService');

// ⏱ Day.js for timezone-aware cron work
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);
const APP_TZ = 'Asia/Kolkata';

// 📦 Event model used by the hourly cron
const Event = require('./models/Event'); // <-- ensure this path is correct for your project

const app = express();
app.set('trust proxy', 'loopback');

// Security Headers
app.use(helmet());
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ extended: true, limit: "500mb" }));
// CORS Configuration
const corsOptions = {
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(compression());
app.use(mongoSanitize());
app.use(xss());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes.',
});
app.use('/api', limiter);

// 👇 Add CORS headers for static files in /uploads
app.use(
  "/uploads",
  express.static(path.join(__dirname, "upload"), {
    setHeaders: (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept"
      );
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"); // 👈 This is the key
    },
  })
);

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/user', require('./routes/user'));
app.use('/api/content', require('./routes/content'));
app.use('/api/events', require('./routes/event'));
app.use('/api/donations', require('./routes/Donation'));
app.use('/api/team', require('./routes/team'));
app.use('/api/gallery', require('./routes/gallery'));
app.use('/api/news', require('./routes/news'));
app.use('/api/testimonial', require('./routes/testimonial'));

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.send('✅ Backend is running!');
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('❌ UNHANDLED ERROR:', err);
  const statusCode = err.status || 500;
  const message = err.message || 'Something went very wrong!';
  res.status(statusCode).json({
    status: 'error',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

/* ──────────────────────────────────────────────────────────────
   🕒 CRON: Update events to LiveEvent when date is today/past
   ────────────────────────────────────────────────────────────── */
async function updateEventsToLive() {
  // "now" in IST, end of current hour (generous within the hour window)
  const now = dayjs().tz(APP_TZ).endOf('hour');
  const nowDate = now.toDate();

  // Select events whose eventDate <= "now" and not already LiveEvent
  const filter = {
    eventDate: { $lte: nowDate },
    type: { $ne: 'LiveEvent' }
  };

  const update = {
    $set: {
      type: 'LiveEvent',
      updatedAt: new Date()
    }
  };

  try {
    const result = await Event.updateMany(filter, update);
    const matched = result.matchedCount ?? result.n ?? 0;
    const modified = result.modifiedCount ?? result.nModified ?? 0;
    console.log(
      `[cron:event->Live] ${dayjs().tz(APP_TZ).format()} | cutoff<=${now.format()} | matched=${matched} modified=${modified}`
    );
  } catch (err) {
    console.error('[cron:event->Live] Error while updating events:', err);
  }
}

/* ──────────────────────────────────────────────────────────────
   🔔 CRON SCHEDULERS (scheduled after Mongo connects)
   ────────────────────────────────────────────────────────────── */
function scheduleCrons() {
  // Hourly at minute 0 in IST
  cron.schedule(
    '0 * * * *',
    () => {
      console.log('⏰ Running hourly event status check...');
      updateEventsToLive();
    },
    { timezone: APP_TZ }
  );
  console.log('[cron] Scheduled: hourly event updater at *:00 IST');

  // Daily donation reminder at 09:00 IST (kept from your original)
  cron.schedule(
    '0 9 * * *',
    () => {
      console.log('⏰ Running daily donation reminder check...');
      sendDonationReminders();
    },
    { timezone: APP_TZ }
  );
  console.log('[cron] Scheduled: daily donation reminders at 09:00 IST');
}

// Server Boot
const PORT = process.env.PORT || 3000;
connectDB()
  .then(async () => {
    // Run once on startup to catch anything due immediately
    await updateEventsToLive();

    // Then schedule recurring jobs
    scheduleCrons();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed. Server is not running.', err);
    process.exit(1);
  });
