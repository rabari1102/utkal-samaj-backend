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
    body("education").optional({ checkFalsy: true }),
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

      const { name, description, education, location, type } = req.body;

      // Since we used .single("image"), file is at req.file (or undefined)
      const relativeImagePaths = req.file
        ? [path.relative(UPLOAD_ROOT, req.file.path).replace(/\\/g, "/")]
        : [];

      const doc = new testiMonial({
        name,
        description,
        education: education ? new Date(education) : undefined,
        location,
        type,
        images: relativeImagePaths, // store relative paths
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

module.exports = router;
