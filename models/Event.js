const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  eventDate: {
    type: Date,
    required: true
  },
  registrationDeadline: {
    type: Date
  },
  location: {
    type: String,
    required: true
  },
  image: {
    type: String
  },
  registrationRequired: {
    type: Boolean,
    default: false
  },
  registrationLink: {
    type: String
  },
  paymentRequired: {
    type: Boolean,
    default: false
  },
  eventFee: {
    type: Number,
    default: 0
  },
  maxParticipants: {
    type: Number
  },
  registeredCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Event', eventSchema);
