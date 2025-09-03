// routes/testimonial.js
const express = require("express");
const { body, validationResult } = require("express-validator");
const path = require("path");
const fs = require("fs");
const testiMonial = require("../models/testimonial");
const createUploader = require("../utils/upload");

const router = express.Router();

const testimonialUploader = createUploader("testimonials");

const UPLOAD_ROOT = path.join(__dirname, "..", "upload");

/* -------------------------- Helper: image URLs --------------------------- */
function generateImageUrls(req, relPaths = []) {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  return relPaths.map((p) => `${baseUrl}/uploads/${p.replace(/^\/+/, "")}`);
}

/* ------------------------------- Create API ------------------------------ */
router.post(
  "/AddTestimonial",
  testimonialUploader.single("image"),
  [
    body("name").trim().isLength({ min: 2 }).withMessage("Name is required"),
    body("description")
      .optional()
      .trim()
      .isLength({ min: 5 })
      .withMessage("Description is too short"),
    body("successStory")
      .optional()
      .trim()
      .isLength({ min: 5 })
      .withMessage("successStory is too short"),
    body("education").optional().trim(),
    body("location").optional().trim(),
    body("type").optional().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Clean up uploaded file if validation fails
        if (req.file) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (_) {}
        }
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { name, description, education,successStory,location, type } = req.body;

      // Since we used .single("image"), file is at req.file (or undefined)
      const relativeImagePaths = req.file
        ? [path.relative(UPLOAD_ROOT, req.file.path).replace(/\\/g, "/")]
        : [];

      const doc = new testiMonial({
        name,
        description,
        education,
        successStory,
        location,
        type,
        images: relativeImagePaths,
      });

      await doc.save();

      const imageUrls = generateImageUrls(req, relativeImagePaths);

      return res.status(201).json({
        success: true,
        message: "Testimonial created successfully",
        data: {
          id: doc._id,
          name: doc.name,
          description: doc.description,
          education: doc.education,
          successStory: doc.successStory,
          location: doc.location,
          type: doc.type,
          images: imageUrls, // public URLs
        },
      });
    } catch (err) {
      console.error("[testimonial:create] Error:", err);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        message: err.message,
      });
    }
  }
);

/* ------------------------- GET: all testimonials ------------------------- */
router.get("/getAllTestimonials", async (req, res) => {
  try {
    const testimonials = await testiMonial.find().sort({ createdAt: -1 });

    const updated = testimonials.map((t) => ({
      ...t.toObject(),
      imageUrls: generateImageUrls(req, t.images || []),
    }));

    res.status(200).json({
      success: true,
      count: updated.length,
      data: updated,
    });
  } catch (error) {
    console.error("[testimonial:getAll] Error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

// EDIT: update a testimonial (partial update), optionally replace image
router.patch(
  "/editTestimonial/:id",
  testimonialUploader.single("image"), // optional
  async (req, res) => {
    try {
      const { id } = req.params;
      // Fetch existing doc (needed for image cleanup)
      const existing = await testiMonial.findById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: "Testimonial not found" });
      }

      // Collect all updatable fields (no validation – whatever you send will be set)
      const fields = ["name", "description", "education", "successStory", "location", "type"];
      const updates = {};
      for (const f of fields) {
        // Only set fields that the client included (even empty strings allowed)
        if (Object.prototype.hasOwnProperty.call(req.body, f)) {
          updates[f] = req.body[f];
        }
      }

      // Optional image replacement
      if (req.file?.path) {
        const newRel = toRelativeFromRoot(req.file.path);

        // Delete old images if any
        if (Array.isArray(existing.images)) {
          for (const rel of existing.images) {
            const abs = path.join(UPLOAD_ROOT, rel);
            safeUnlink(abs);
          }
        }

        // Save new image (single)
        updates.images = newRel ? [newRel] : [];
      }

      // Persist changes
      Object.assign(existing, updates);
      await existing.save();

      // Build public URLs for response
      const imageUrls = generateImageUrls(req, existing.images || []);

      return res.status(200).json({
        success: true,
        message: "Testimonial updated successfully",
        data: {
          id: existing._id,
          name: existing.name,
          description: existing.description,
          education: existing.education,
          successStory: existing.successStory,
          location: existing.location,
          type: existing.type,
          images: imageUrls,
        },
      });
    } catch (err) {
      console.error("[testimonial:edit] Error:", err);

      // If an error happened after receiving a new upload, clean that new file
      if (req.file?.path) safeUnlink(req.file.path);

      return res.status(500).json({
        success: false,
        error: "Internal server error",
        message: err.message,
      });
    }
  }
);

/* ------------------------- HARD DELETE: permanently remove ------------------------- */
router.delete("/hardDeleteTestimonial/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Find doc so we can remove images from disk first
    const existing = await testiMonial.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Testimonial not found" });
    }

    // Remove image files from disk
    if (Array.isArray(existing.images)) {
      for (const rel of existing.images) {
        const abs = path.join(UPLOAD_ROOT, rel);
        try {
          if (fs.existsSync(abs)) fs.unlinkSync(abs);
        } catch (e) {
          // If one file fails to delete, continue with others
          console.warn(`[testimonial:hardDelete] Failed to delete file: ${abs}`, e.message);
        }
      }
    }

    // Delete document from DB
    await testiMonial.deleteOne({ _id: id });

    return res.status(200).json({
      success: true,
      message: "Testimonial permanently deleted",
      data: { id },
    });
  } catch (err) {
    console.error("[testimonial:hardDelete] Error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: err.message,
    });
  }
});

module.exports = router;
