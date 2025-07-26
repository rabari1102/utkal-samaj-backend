const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  eventDate: Date,
  location: String,
  images: [String], // array of relative paths
}, {
  timestamps: true
});

module.exports = mongoose.model("Event", eventSchema);
