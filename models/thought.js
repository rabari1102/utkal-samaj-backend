const mongoose = require("mongoose");

const thoughtSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    thought: {
      type: String,
      required: true,
      validate: {
        validator: function (value) {
          const wordCount = value.trim().split(/\s+/).length;
          return wordCount >= 5 && wordCount <= 25;
        },
        message: "Thought must contain between 5 and 25 words",
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("thought", thoughtSchema);