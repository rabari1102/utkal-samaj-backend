const mongoose = require('mongoose');

const gallerySchema = new mongoose.Schema({
  eventName: {
    type: String,
    required: false
  },
  images: [{
    url: String,
    caption: String
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Gallery', gallerySchema);
