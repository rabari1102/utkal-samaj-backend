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

const app = express();
app.set('trust proxy', 'loopback');

// Security Headers
app.use(helmet());

// CORS Configuration
const corsOptions = {
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Request Body Limit
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // or your frontend origin in prod
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Static File Serving
app.use('/uploads', express.static(path.join(__dirname, 'upload')));
app.use('/uploads', serveIndex(path.join(__dirname, 'upload')));

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

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.send('✅ Backend is running!');
});

// 404 Fallback
app.all('*', (req, res, next) => {
  const err = new Error(`Can't find ${req.originalUrl} on this server!`);
  err.status = 404;
  next(err);
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

// Cron Job
cron.schedule(
  '0 9 * * *',
  () => {
    console.log('⏰ Running daily donation reminder check...');
    sendDonationReminders();
  },
  { timezone: 'Asia/Kolkata' }
);

// Server Boot
const PORT = process.env.PORT || 3000;
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed. Server is not running.', err);
    process.exit(1);
  });
