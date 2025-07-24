const express = require("express");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const Content = require("../models/Content");
const Event = require("../models/Event");
const TeamNode = require("../models/Team");
const Gallery = require("../models/Gallery");
const upload = require("../utils/upload");
const News = require("../models/news");
const Achievement = require("../models/Achivments");
const { uploadSingle } = require("../services/uploadService");
const { auth } = require("../middlewares/auth");

const router = express.Router();

// Get pending user approvals
router.get("/pending-users", auth(["admin"]), async (req, res) => {
  try {
    // Default values
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Calculate skip value
    const skip = (page - 1) * limit;

    // Query total count
    const total = await User.countDocuments({
      isApproved: false,
      isActive: true,
      deletedAt: null,
    });

    // Fetch paginated users
    const pendingUsers = await User.find({
      isApproved: false,
      isActive: true,
      deletedAt: null,
    })
      .select("firstName lastName bloodGroup")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalUsers: total,
      users: pendingUsers,
    });
  } catch (error) {
    console.error("Get pending users error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Approve/reject user
router.put(
  "/users/:id/approval",
  auth(["admin"]),
  [body("isApproved").isBoolean()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { isApproved } = req.body;

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      user.isApproved = isApproved;

      if (isApproved === "false") {
        console.log("hello");

        user.deletedAt = new Date(); // Soft delete
      } else {
        console.log("falsse");

        user.deletedAt = null; // Restore
      }

      await user.save();

      res.json({
        message: `User ${
          isApproved ? "approved" : "soft deleted"
        } successfully`,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          isApproved: user.isApproved,
          isDeleted: user.isDeleted,
        },
      });
    } catch (error) {
      console.error("User approval error:", error);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Content management
router.put(
  "/content/:section",
  auth(["admin"]),
  uploadSingle,
  [
    body("title").optional().isString(),
    body("content").isString(),
    body("link").optional().isURL(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { section } = req.params;
      const { title, content, link } = req.body;

      let updateData = { content };
      if (title) updateData.title = title;
      if (link) updateData.link = link;
      if (req.file) updateData.image = req.file.path;

      const updatedContent = await Content.findOneAndUpdate(
        { section },
        { ...updateData, updatedAt: Date.now() },
        { new: true, upsert: true }
      );

      res.json(updatedContent);
    } catch (error) {
      console.error("Content update error:", error);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Event management
router.post(
  "/events",
  auth(["admin"]),
  uploadSingle,
  [
    body("title").trim().isLength({ min: 3 }),
    body("description").trim().isLength({ min: 10 }),
    body("eventDate").isISO8601(),
    body("location").trim().isLength({ min: 3 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const eventData = { ...req.body };
      if (req.file) eventData.image = req.file.path;

      const event = new Event(eventData);
      await event.save();

      res.status(201).json(event);
    } catch (error) {
      console.error("Event creation error:", error);
      res.status(500).json({ error: "Server error" });
    }
  }
);

router.post("/gallery",   upload.array("images", 50), async (req, res) => {
  try {
    const fileName = req.file?.filename;

    if (!fileName) {
      return res.status(400).json({ error: "No image uploaded." });
    }

    res.status(200).json({
      message: "Image uploaded successfully",
      file: {
        name: fileName,
        path: `/upload/gallery/${fileName}`,
      },
    });
  } catch (error) {
    console.error("Image upload error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// News management
router.post(
  "/news",
  auth(["admin"]),
  uploadSingle,
  [
    body("title").trim().isLength({ min: 3 }),
    body("content").trim().isLength({ min: 10 }),
    body("isUpcoming").optional().isBoolean(),
    body("registrationLink").optional().isURL(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const newsData = { ...req.body };
      if (req.file) newsData.image = req.file.path;

      const news = new News(newsData);
      await news.save();

      res.status(201).json(news);
    } catch (error) {
      console.error("News creation error:", error);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Achievement management
router.post(
  "/achievements",
  auth(["admin"]),
  uploadSingle,
  [
    body("title").trim().isLength({ min: 3 }),
    body("description").trim().isLength({ min: 10 }),
    body("achievementDate").isISO8601(),
    body("category")
      .optional()
      .isIn(["award", "recognition", "milestone", "other"]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const achievementData = { ...req.body };
      if (req.file) achievementData.image = req.file.path;

      const achievement = new Achievement(achievementData);
      await achievement.save();

      res.status(201).json(achievement);
    } catch (error) {
      console.error("Achievement creation error:", error);
      res.status(500).json({ error: "Server error" });
    }
  }
);

module.exports = router;
