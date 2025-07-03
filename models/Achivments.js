const mongoose = require('mongoose');

const achievementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  achievementDate: {
    type: Date,
    required: true
  },
  image: {
    type: String
  },
  category: {
    type: String,
    enum: ['award', 'recognition', 'milestone', 'other'],
    default: 'other'
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

module.exports = mongoose.model('Achievement', achievementSchema);