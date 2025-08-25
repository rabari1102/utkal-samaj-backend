const mongoose = require("mongoose");

const testiMonialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    education: String,
    location: String,
    type: String,
    images: [String], // array of relative paths
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("testiMonial", testiMonialSchema);
