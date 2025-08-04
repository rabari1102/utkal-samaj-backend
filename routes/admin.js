const express = require("express");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const Content = require("../models/Content");
const Event = require("../models/Event");
const path = require("path");
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
router.get("/pending-users", async (req, res) => {
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

// CREATE EVENT API - Minor fixes
router.post(
  "/events",
  eventsUploader.array("images", 50),
  [
    body("title").trim().isLength({ min: 3 }).withMessage("Title is too short"),
    body("description").trim().isLength({ min: 10 }).withMessage("Description is too short"),
    body("eventDate").isISO8601().withMessage("Invalid event date"),
    body("location").trim().isLength({ min: 3 }).withMessage("Location is too short"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { title, description, eventDate, location } = req.body;

      // Prepare relative image paths (more robust handling)
      const relativeImagePaths = (req.files || []).map(file => {
        // Get relative path from upload directory
        const relativePath = path
          .relative(path.join(__dirname, "..", "upload"), file.path)
          .replace(/\\/g, "/"); // Ensure forward slashes for consistency
        return relativePath;
      });

      // Save to MongoDB
      const event = new Event({
        title,
        description,
        eventDate,
        location,
        images: relativeImagePaths
      });

      await event.save();

      // Construct full image URLs for response
      // const baseUrl = `${req.protocol}://${req.get('host')}`;
    const baseUrl ='http://localhost:8080'
      const imageUrls = relativeImagePaths.map(
        p => `${baseUrl}/upload/${p}`
      );

      res.status(201).json({
        success: true,
        message: "Event created successfully",
        data: {
          id: event._id,
          title: event.title,
          description: event.description,
          eventDate: event.eventDate,
          location: event.location,
          images: imageUrls
        }
      });

    } catch (error) {
      console.error("Event creation error:", error);
      res.status(500).json({ 
        success: false,
        error: "Internal server error",
        message: error.message 
      });
    }
  }
);

// FIXED UPDATE EVENT API
router.put(
  "/eventUpdate/:id",
  eventsUploader.array("images", 50),
  [
    body("title").optional().trim().isLength({ min: 3 }).withMessage("Title is too short"),
    body("description").optional().trim().isLength({ min: 10 }).withMessage("Description is too short"),
    body("eventDate").optional().isISO8601().withMessage("Invalid event date"),
    body("location").optional().trim().isLength({ min: 3 }).withMessage("Location is too short"),
  ],
  async (req, res) => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const eventId = req.params.id;
      const updates = req.body;

      // Validate ObjectId
      if (!eventId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ 
          success: false,
          error: "Invalid event ID format" 
        });
      }

      // Find the existing event
      const event = await Event.findById(eventId);
      if (!event) {
        return res.status(404).json({ 
          success: false,
          error: "Event not found" 
        });
      }

      // Update fields if provided
      if (updates.title !== undefined) event.title = updates.title;
      if (updates.description !== undefined) event.description = updates.description;
      if (updates.eventDate !== undefined) event.eventDate = updates.eventDate;
      if (updates.location !== undefined) event.location = updates.location;

      // Handle new images
      if (req.files && req.files.length > 0) {
        // Process new images to relative paths (same as CREATE)
        const newRelativeImagePaths = req.files.map(file => {
          return path
            .relative(path.join(__dirname, "..", "upload"), file.path)
            .replace(/\\/g, "/");
        });
        event.images = [...event.images, ...newRelativeImagePaths];
      }

      await event.save();
      // const baseUrl = `${req.protocol}://${req.get('host')}`;
      const baseUrl ='http://localhost:8080'
      const imageUrls = event.images.map(
        p => `${baseUrl}/upload/${p}`
      );
console.log(imageUrls,"imageUrlsimageUrls");

      res.status(200).json({
        success: true,
        message: "Event updated successfully",
        data: {
          id: event._id,
          title: event.title,
          description: event.description,
          eventDate: event.eventDate,
          location: event.location,
          images: imageUrls
        }
      });

    } catch (error) {
      console.error("Event update error:", error);
      res.status(500).json({ 
        success: false,
        error: "Server error",
        message: error.message 
      });
    }
  }
);

router.post("/gallery", galleryUploader.array("images", 50), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: "No images were uploaded." });
    }

    // const baseUrl = `${req.protocol}://${req.get("host")}`;
    const baseUrl ='http://localhost:8080'

    const uploadedFiles = req.files.map(file => {
      const normalizedPath = file.path.replace(/\\/g, "/"); // Normalize slashes
      const relativePath = path.relative(path.join(__dirname, "..", "upload"), normalizedPath);
      return {
        name: file.filename,
        path: normalizedPath,
        url: `${baseUrl}/uploads/${relativePath}`,
      };
    });

    res.status(200).json({
      success: true,
      message: "Images uploaded successfully to the gallery",
      files: uploadedFiles,
    });
  } catch (error) {
    console.error("Gallery image upload error:", error);
    res.status(500).json({ success: false, error: "Server error" });
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