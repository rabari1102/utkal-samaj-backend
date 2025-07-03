// models/OTP.js
const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true
  },
  otp: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: { expires: '5m' }
  }
});

module.exports = mongoose.model('OTP', otpSchema);