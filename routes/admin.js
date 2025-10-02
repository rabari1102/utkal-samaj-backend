const express = require("express");
const { body, validationResult } = require("express-validator");
const path = require("path");
const multer = require("multer");

const User = require("../models/User");
const Content = require("../models/Content");
const Event = require("../models/Event");
const TeamNode = require("../models/Team");
const Gallery = require("../models/Gallery");
const News = require("../models/updates");
const Achievement = require("../models/Achivments");

const { uploadBuffer, deleteObject, getSignedDownloadUrl, publicUrl } = require("../utils/s3");

// ---- Config ----
const ACL = process.env.S3_OBJECT_ACL || "private"; // 'private' or 'public-read'
const USE_PUBLIC = ACL === "public-read";

// In-memory uploads (no temp files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,  // 25 MB per file
    files: 50,                   // up to 50 files
    fieldSize: 50 * 1024 * 1024, // 50 MB for text fields total
    parts: 200,                  // total parts (files + fields)
  },
});

const router = express.Router();

// Helper: turn S3 key(s) into URL(s)
async function keyToUrl(key) {
  if (!key) return null;
  return USE_PUBLIC ? publicUrl(key) : await getSignedDownloadUrl(key);
}
async function keysToUrls(keys = []) {
  const urls = [];
  for (const k of keys) {
    urls.push(await keyToUrl(k));
  }
  return urls;
}

// -----------------------------
// Get pending user approvals
// -----------------------------
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

// -----------------------------
// Approve/reject user
// -----------------------------
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
        user.deletedAt = new Date(); // Soft delete
      } else {
        user.deletedAt = null; // Restore
      }

      await user.save();

      res.json({
        message: `User ${isApproved ? "approved" : "soft deleted"} successfully`,
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

// -----------------------------
// Content management (single image) -> store S3 key in `image`
// PUT /content/:section  (field: image)
// -----------------------------
router.put(
  "/content/:section",
  upload.single("image"),
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

      // Find existing to know old image key
      const existing = await Content.findOne({ section });

      let newImageKey = existing?.image || null;

      // Upload new image if provided
      if (req.file) {
        const { key } = await uploadBuffer({
          buffer: req.file.buffer,
          contentType: req.file.mimetype,
          folder: "content",
          filename: req.file.originalname,
          acl: ACL,
          metadata: { section },
        });
        newImageKey = key;
      }

      const updateData = {
        content,
        updatedAt: Date.now(),
      };
      if (title) updateData.title = title;
      if (link) updateData.link = link;
      if (newImageKey) updateData.image = newImageKey; // store S3 key in `image`

      const updated = await Content.findOneAndUpdate(
        { section },
        updateData,
        { new: true, upsert: true }
      );

      // Cleanup old image AFTER successful save
      if (req.file && existing?.image && existing.image !== newImageKey) {
        try { await deleteObject(existing.image); } catch (e) { console.warn("S3 delete failed:", e); }
      }

      res.json({
        ...updated.toObject(),
        imageUrl: await keyToUrl(updated.image),
      });
    } catch (error) {
      console.error("Content update error:", error);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// -----------------------------
// CREATE EVENT
// POST /events  (field: images[])
// -----------------------------
router.post(
  "/events",
  upload.array("images", 50),
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

      // Upload all images to S3
      const imageKeys = [];
      for (const file of (req.files || [])) {
        const { key } = await uploadBuffer({
          buffer: file.buffer,
          contentType: file.mimetype,
          folder: "events",
          filename: file.originalname,
          acl: ACL,
          metadata: { title },
        });
        imageKeys.push(key);
      }

      const event = new Event({
        title,
        description,
        eventDate,
        location,
        type: "Upcoming",
        images: imageKeys, // store S3 keys
      });

      await event.save();

      res.status(201).json({
        success: true,
        message: "Event created successfully",
        data: {
          id: event._id,
          title: event.title,
          description: event.description,
          eventDate: event.eventDate,
          location: event.location,
          images: await keysToUrls(event.images),
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

// -----------------------------
// UPDATE EVENT
// PUT /eventUpdate/:id  (field: images[] optional)
// Body can include: removeImageKeys: string[]  -> S3 keys to remove
// -----------------------------
router.put(
  "/eventUpdate/:id",
  upload.array("images", 50),
  [
    body("title").optional().trim().isLength({ min: 3 }).withMessage("Title is too short"),
    body("description").optional().trim().isLength({ min: 10 }).withMessage("Description is too short"),
    body("eventDate").optional().isISO8601().withMessage("Invalid event date"),
    body("location").optional().trim().isLength({ min: 3 }).withMessage("Location is too short"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const eventId = req.params.id;
      const updates = req.body;

      if (!eventId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ success: false, error: "Invalid event ID format" });
      }

      const event = await Event.findById(eventId);
      if (!event) {
        return res.status(404).json({ success: false, error: "Event not found" });
      }

      // Field updates
      if (updates.title !== undefined) event.title = updates.title;
      if (updates.description !== undefined) event.description = updates.description;
      if (updates.eventDate !== undefined) event.eventDate = updates.eventDate;
      if (updates.location !== undefined) event.location = updates.location;

      // Remove images if requested (expects array of S3 keys)
      // Client can send JSON array or comma-separated string
      let removeKeys = [];
      if (updates.removeImageKeys) {
        try {
          removeKeys = Array.isArray(updates.removeImageKeys)
            ? updates.removeImageKeys
            : JSON.parse(updates.removeImageKeys);
        } catch {
          // maybe comma separated
          removeKeys = String(updates.removeImageKeys).split(",").map(s => s.trim()).filter(Boolean);
        }
      }

      if (removeKeys.length) {
        event.images = (event.images || []).filter(k => !removeKeys.includes(k));
      }

      // Add newly uploaded images
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const { key } = await uploadBuffer({
            buffer: file.buffer,
            contentType: file.mimetype,
            folder: "events",
            filename: file.originalname,
            acl: ACL,
            metadata: { eventId },
          });
          event.images.push(key);
        }
      }

      await event.save();

      // Cleanup removed S3 objects AFTER save succeeds
      for (const k of removeKeys) {
        try { await deleteObject(k); } catch (e) { console.warn("S3 delete failed:", e); }
      }

      res.status(200).json({
        success: true,
        message: "Event updated successfully",
        data: {
          id: event._id,
          title: event.title,
          description: event.description,
          eventDate: event.eventDate,
          location: event.location,
          images: await keysToUrls(event.images),
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

// -----------------------------
// GALLERY (multi-image)
// POST /gallery  (field: images[])
router.post("/gallery", (req, res, next) => {
  // run multer first so we can catch MulterError and respond instead of generic 413
  upload.array("images", 50)(req, res, async (err) => {
    if (err) {
      // Multer limit errors -> 413 with details
      if (err.name === "MulterError" && err.code && err.code.startsWith("LIMIT_")) {
        return res.status(413).json({
          success: false,
          error: "Upload limit exceeded",
          code: err.code,
          message: err.message,
        });
      }
      return res.status(400).json({ success: false, error: err.message });
    }

    try {
      if (!Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({ success: false, error: "No images were uploaded." });
      }

      const allowed = new Set([
        "image/jpeg", "image/jpg", "image/png", "image/webp",
        "image/gif", "image/bmp", "image/tiff"
      ]);

      const uploads = [];
      for (const file of req.files) {
        if (!allowed.has(file.mimetype)) continue;
        const { key } = await uploadBuffer({
          buffer: file.buffer,
          contentType: file.mimetype,
          folder: "gallery",
          filename: file.originalname,
          acl: ACL,
          metadata: { source: "gallery" },
        });
        uploads.push({
          key,
          contentType: file.mimetype,
          size: file.size,
          name: file.originalname,
        });
      }

      if (uploads.length === 0) {
        return res.status(400).json({ success: false, error: "No valid image files to upload." });
      }

      const urls = await Promise.all(uploads.map(u => keyToUrl(u.key)));
      const files = uploads.map((u, i) => ({
        key: u.key,
        url: urls[i],
        name: u.name,
        size: u.size,
        contentType: u.contentType,
      }));

      return res.status(200).json({
        success: true,
        message: "Images uploaded successfully to the gallery",
        files,
      });
    } catch (error) {
      console.error("Gallery image upload error:", error);
      return res.status(500).json({
        success: false,
        error: "Server error",
        message: error?.message,
      });
    }
  });
});


module.exports = router;