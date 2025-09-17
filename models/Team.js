// models/TeamNode.js
const mongoose = require('mongoose');

const teamNodeSchema = new mongoose.Schema({
  name:   { type: String, required: false },
  role:   { type: String, required: false },
  samiti: { type: String, required: false },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamNode', default: null },

  // Store one or more image keys. Accepts string or array on set.
  profilePicture: {
    type: [String],
    default: [],
    set: (v) => {
      if (!v) return [];
      if (Array.isArray(v)) return v.filter(Boolean);
      // if legacy code sets a single string, wrap to array
      return [v];
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('TeamNode', teamNodeSchema);
