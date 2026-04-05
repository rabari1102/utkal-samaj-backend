const express = require("express");
const router = express.Router();
const Thought = require("../models/thought");
// ==============================
// CREATE THOUGHT
// ==============================
router.post("/addThought", async (req, res) => {
  try {
    const { name, thought } = req.body;

    if (!name || !thought) {
      return res.status(400).json({
        success: false,
        message: "Name and thought are required",
      });
    }

    const wordCount = thought.trim().split(/\s+/).length;

    if (wordCount !== 5) {
      return res.status(400).json({
        success: false,
        message: "Thought must contain exactly 5 words",
      });
    }

    const newThought = await Thought.create({ name, thought });

    return res.status(201).json({
      success: true,
      message: "Thought created successfully",
      data: newThought,
    });
  } catch (error) {
    console.error("[addThought]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ==============================
// UPDATE THOUGHT
// ==============================
router.put("/updateThought/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, thought } = req.body;

    const existing = await Thought.findById(id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Thought not found",
      });
    }

    if (thought !== undefined) {
      const wordCount = thought.trim().split(/\s+/).length;

      if (wordCount !== 5) {
        return res.status(400).json({
          success: false,
          message: "Thought must contain exactly 5 words",
        });
      }

      existing.thought = thought;
    }

    if (name !== undefined) {
      existing.name = name;
    }

    await existing.save();

    return res.json({
      success: true,
      message: "Thought updated successfully",
      data: existing,
    });
  } catch (error) {
    console.error("[updateThought]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ==============================
// GET ALL THOUGHTS
// ==============================
router.get("/getAllThoughts", async (_req, res) => {
  try {
    const thoughts = await Thought.find().sort({ createdAt: -1 });

    return res.json({
      success: true,
      total: thoughts.length,
      data: thoughts,
    });
  } catch (error) {
    console.error("[getAllThoughts]", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// ==============================
// GET THOUGHT BY ID
// ==============================
router.get("/getThoughtById/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const thought = await Thought.findById(id);

    if (!thought) {
      return res.status(404).json({
        success: false,
        message: "Thought not found",
      });
    }

    return res.json({
      success: true,
      data: thought,
    });
  } catch (error) {
    console.error("[getThoughtById]", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// ==============================
// DELETE THOUGHT
// ==============================
router.delete("/deleteThought/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Thought.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Thought not found",
      });
    }

    return res.json({
      success: true,
      message: "Thought deleted successfully",
    });
  } catch (error) {
    console.error("[deleteThought]", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

module.exports = router;