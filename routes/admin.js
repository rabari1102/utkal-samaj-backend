const express = require("express");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const Content = require("../models/Content");
const Event = require("../models/Event");
const TeamNode = require("../models/Team");
const Gallery = require("../models/Gallery");
const News = require("../models/news");
const Achievement = require("../models/Achivments");
const { auth } = require("../middlewares/auth");

// Import the uploader factory function
const createUploader = require("../utils/upload");

// Create specific uploaders for each route/purpose
const contentUploader = createUploader("content");
const eventsUploader = createUploader("events");
const galleryUploader = createUploader("gallery");
const newsUploader = createUploader("news");
const achievementsUploader = createUploader("achievements");

const router = express.Router();

// Get pending user approvals
router.get("/pending-users", auth(["admin"]), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await User.countDocuments({
      isApproved: false,
      isActive: true,
      deletedAt: null,
    });

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

// Content management - UPLOADS to 'upload/content/'
router.put(
  "/content/:section",
  contentUploader.single("image"), // Use contentUploader
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
      if (req.file) updateData.image = req.file.path; // req.file is from .single()

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

// Event management - UPLOADS to 'upload/events/'
router.post(
  "/events",
  eventsUploader.array("images", 50),
  [
    body("title").trim().isLength({ min: 3 }),
    body("description").trim().isLength({ min: 10 }),
    body("eventDate").isISO8601(),
    body("location").trim().isLength({ min: 3 }),
  ],
  async (req, res) => {
    try {
      const { title, description, eventDate, location } = req.body;
      const imagePaths = req.files?.map((file) => file.path) || [];

      const event = new Event({
        title,
        description,
        eventDate,
        location,
        images: imagePaths,
      });
      await event.save();
      res.status(201).json(event);
    } catch (error) {
      console.error("Event creation error:", error);
      res.status(500).json({ error: "Server error" });
    }
  }
);

router.put(
  "/eventUpdate/:id",
  eventsUploader.array("images", 50),
  [
    body("title").optional().trim().isLength({ min: 3 }),
    body("description").optional().trim().isLength({ min: 10 }),
    body("eventDate").optional().isISO8601(),
    body("location").optional().trim().isLength({ min: 3 }),
  ],
  async (req, res) => {
    try {
      const eventId = req.params.id;
      const updates = req.body;
      const newImages = req.files?.map((file) => file.path) || [];

      // Find the existing event
      const event = await Event.findById(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Update fields if provided
      if (updates.title) event.title = updates.title;
      if (updates.description) event.description = updates.description;
      if (updates.eventDate) event.eventDate = updates.eventDate;
      if (updates.location) event.location = updates.location;

      // Optionally append new images (you can change this to overwrite if needed)
      if (newImages.length > 0) {
        event.images = [...event.images, ...newImages];
      }

      await event.save();
      res.status(200).json(event);
    } catch (error) {
      console.error("Event update error:", error);
      res.status(500).json({ error: "Server error" });
    }
  }
);


// Gallery management - UPLOADS to 'upload/gallery/'
router.post("/gallery",  galleryUploader.array("images", 50), async (req, res) => {
  try {
    // For .array(), we check req.files, not req.file
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No images were uploaded." });
    }

    // Map the uploaded files to their paths for the response
    const uploadedFiles = req.files.map(file => ({
        name: file.filename,
        path: file.path,
    }));

    // You might want to save these paths to your Gallery model here
    // For example: await Gallery.insertMany(uploadedFiles.map(f => ({ path: f.path, ...otherData })));

    res.status(200).json({
      message: "Images uploaded successfully to the gallery",
      files: uploadedFiles,
    });
  } catch (error) {
    console.error("Gallery image upload error:", error);
    res.status(500).json({ error: "Server error" });
  }
});


// News management - UPLOADS to 'upload/news/'
router.post(
  "/news",
  newsUploader.single("image"), // Use newsUploader
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
      if (req.file) newsData.image = req.file.path; // req.file from .single()

      const news = new News(newsData);
      await news.save();
      res.status(201).json(news);
    } catch (error) {
      console.error("News creation error:", error);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Achievement management - UPLOADS to 'upload/achievements/'
router.post(
  "/achievements",
  achievementsUploader.single("image"), // Use achievementsUploader
  [
    body("title").trim().isLength({ min: 3 }),
    body("description").trim().isLength({ min: 10 }),
    body("achievementDate").isISO8601(),
    body("category").optional().isIn(["award", "recognition", "milestone", "other"]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const achievementData = { ...req.body };
      if (req.file) achievementData.image = req.file.path; // req.file from .single()

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