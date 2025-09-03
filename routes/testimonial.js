// routes/testimonial.js
const express = require("express");
const { body, validationResult } = require("express-validator");
const multer = require("multer");

const Testimonial = require("../models/testimonial");

// S3 helpers
const {
  uploadBuffer,
  deleteObject,
  getSignedDownloadUrl,
  publicUrl,
} = require("../utils/s3");

const router = express.Router();

// ---------------- S3/Upload config ----------------
const ACL = process.env.S3_OBJECT_ACL || "private"; // 'private' or 'public-read'
const USE_PUBLIC = ACL === "public-read";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Helpers to turn stored S3 keys into URLs for responses
async function keyToUrl(key) {
  if (!key) return null;
  return USE_PUBLIC ? publicUrl(key) : await getSignedDownloadUrl(key);
}
async function keysToUrls(keys = []) {
  const out = [];
  for (const k of keys) {
    out.push(await keyToUrl(k));
  }
  return out;
}

/* ------------------------------- Create API ------------------------------ */
// POST /AddTestimonial  (field: image)
router.post(
  "/AddTestimonial",
  upload.single("image"),
  [
    body("name").trim().isLength({ min: 2 }).withMessage("Name is required"),
    body("description").optional().trim().isLength({ min: 5 }).withMessage("Description is too short"),
    body("successStory").optional().trim().isLength({ min: 5 }).withMessage("successStory is too short"),
    body("education").optional().trim(),
    body("location").optional().trim(),
    body("type").optional().trim(),
  ],
  async (req, res) => {
    try {
      const { name, description, education, successStory, location, type } = req.body;

      // Upload single image (if provided) to S3
      const imageKeys = [];
      if (req.file) {
        const { key } = await uploadBuffer({
          buffer: req.file.buffer,
          contentType: req.file.mimetype,
          folder: "testimonials",
          filename: req.file.originalname,
          acl: ACL,
          metadata: { entity: "testimonial", name },
        });
        imageKeys.push(key);
      }

      const doc = new Testimonial({
        name,
        description,
        education,
        successStory,
        location,
        type,
        images: imageKeys, // store S3 keys
      });

      await doc.save();

      res.status(201).json({
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
          images: await keysToUrls(doc.images),
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
// GET /getAllTestimonials
router.get("/getAllTestimonials", async (_req, res) => {
  try {
    const testimonials = await Testimonial.find().sort({ createdAt: -1 });

    // attach resolved URLs
    const data = await Promise.all(
      testimonials.map(async (t) => ({
        ...t.toObject(),
        imageUrls: await keysToUrls(t.images || []),
      }))
    );

    res.status(200).json({
      success: true,
      count: data.length,
      data,
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

/* --------- EDIT: partial update; optional image replacement ---------- */
// PUT /editTestimonial/:id  (field: image)
// Behavior:
// - If a new image is uploaded, we'll delete ALL existing image keys (if any)
//   and replace with the new one (to match your previous single-image workflow).
// - If you want to keep existing and add another, switch to upload.array() and push.
router.put(
  "/editTestimonial/:id",
  upload.single("image"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await Testimonial.findById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: "Testimonial not found" });
      }

      // Collect updatable fields
      const fields = ["name", "description", "education", "successStory", "location", "type"];
      for (const f of fields) {
        if (Object.prototype.hasOwnProperty.call(req.body, f)) {
          existing[f] = req.body[f];
        }
      }

      let oldKeysToDelete = [];

      // If a new image is uploaded, replace the previous ones
      if (req.file) {
        // mark old for deletion AFTER save
        oldKeysToDelete = Array.isArray(existing.images) ? [...existing.images] : [];

        const { key } = await uploadBuffer({
          buffer: req.file.buffer,
          contentType: req.file.mimetype,
          folder: "testimonials",
          filename: req.file.originalname,
          acl: ACL,
          metadata: { entity: "testimonial", id },
        });

        existing.images = [key]; // replace with new single image
      }

      await existing.save();

      // Cleanup old S3 objects only after successful save
      for (const k of oldKeysToDelete) {
        try { await deleteObject(k); } catch (e) { console.warn("[testimonial:edit] S3 delete failed:", e); }
      }

      const imageUrls = await keysToUrls(existing.images || []);

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
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        message: err.message,
      });
    }
  }
);

/* ------------------------- HARD DELETE: permanently remove ------------------------- */
// DELETE /hardDeleteTestimonial/:id
router.delete("/hardDeleteTestimonial/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await Testimonial.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Testimonial not found" });
    }

    // delete S3 objects (best-effort)
    if (Array.isArray(existing.images)) {
      for (const key of existing.images) {
        try { await deleteObject(key); } catch (e) { console.warn("[testimonial:hardDelete] S3 delete failed:", e); }
      }
    }

    await Testimonial.deleteOne({ _id: id });

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