const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
  section: {
    type: String,
    required: false,
  },
  title: {
    type: String,
    required: false
  },
  body: {
    type: String,
    required: false
  },
  image: {
    type: String
  },
  link: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Content', contentSchema);