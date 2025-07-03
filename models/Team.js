const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    enum: ['school', 'dharamshala', 'temple', 'core']
  },
  name: {
    type: String,
    required: true
  },
  position: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  image: {
    type: String
  },
  phoneNumber: {
    type: String
  },
  email: {
    type: String
  },
  operations: [{
    title: String,
    description: String
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

module.exports = mongoose.model('Team', teamSchema);
