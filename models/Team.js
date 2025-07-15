const mongoose = require('mongoose');

const teamNodeSchema = new mongoose.Schema({
  name: { type: String, required: false },
  role: { type: String, required: false },
  samiti: { type: String, required: false },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamNode', default: null },
  profilePicture: { type: Buffer }
}, { timestamps: true });

module.exports = mongoose.model('TeamNode', teamNodeSchema);