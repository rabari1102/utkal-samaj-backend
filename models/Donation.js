const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
  donorName: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  email: {
    type: String
  },
  amount: {
    type: Number,
    required: true
  },
  paymentId: { // Stores the Razorpay ORDER ID
    type: String,
    required: true
  },
  paymentStatus: { // Record status: 'pending', 'completed', 'failed'
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  donationDate: {
    type: Date,
    default: Date.now
  },
  nextReminderDate: {
    type: Date
  },
  receiptUrl: { // Stores the path/URL of the generated receipt
    type: String
  }
});

donationSchema.pre('save', function(next) {
  if (this.isNew && this.paymentStatus === 'completed') {
    const nextYear = new Date(this.donationDate);
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    nextYear.setDate(nextYear.getDate() - 5); // 5 days before
    this.nextReminderDate = nextYear;
  }
  next();
});

module.exports = mongoose.model('Donation', donationSchema);