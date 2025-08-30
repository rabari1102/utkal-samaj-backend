const express = require("express");
const fs = require("fs");
const path = require("path");
const { body, validationResult } = require("express-validator");

const Content = require("../models/Content");
const createUploader = require("../utils/upload"); // same factory you use elsewhere

const router = express.Router();

// Store files under uploads/content_images
const contentUploader = createUploader("content_images");

// -------------------- helpers --------------------
const DEFAULTS = {
  PUBLIC_UPLOAD_BASE: "/uploads", // make sure your static server exposes this (e.g., app.use('/uploads', express.static(path.join(__dirname,'uploads'))))
  BUCKET: "content_images",
};

const toFilename = (p) => (p ? p.split(/[/\\]/).pop() : null); // robust on win/unix
const toRelativePath = (absPath) => `${DEFAULTS.BUCKET}/${toFilename(absPath)}`;

const toPublicUrl = (req, relative) =>
  `${req.protocol}://${req.get("host")}${
    DEFAULTS.PUBLIC_UPLOAD_BASE
  }/${relative}`;

const mapUrls = (req, rels = []) => rels.map((r) => toPublicUrl(req, r));

// Delete a single file (best-effort)
const safeDelete = (absPath) => {
  try {
    if (absPath && fs.existsSync(absPath)) fs.unlinkSync(absPath);
  } catch (_) {}
};

// Convert stored relative (e.g. "content_images/abc.jpg") back to disk path
const relToDiskPath = (relative) =>
  path.join(process.cwd(), "uploads", relative); // adjust if your uploader writes elsewhere

router.post(
  "/",
  contentUploader.array("images", 12),
  [
    body("section").trim().isLength({ min: 2 }),
    body("title").optional().trim(),
    body("body").optional().trim(),
    body("isActive").optional().isBoolean().toBoolean(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Cleanup uploaded files if validation fails
        (req.files || []).forEach((f) => safeDelete(f.path));
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { section, title, body: contentBody, isActive = true } = req.body;

      const relativeImages = (req.files || []).map((f) =>
        toRelativePath(f.path)
      );

      const doc = await Content.create({
        section,
        title,
        body: contentBody,
        isActive,
        images: relativeImages, // store relative paths
      });

      return res.status(201).json({
        success: true,
        message: "Content created",
        data: {
          ...doc.toObject(),
          imageUrls: mapUrls(req, doc.images || []),
        },
      });
    } catch (error) {
      console.error("[content:create] Error:", error);
      // best-effort cleanup of uploaded files on server error
      (req.files || []).forEach((f) => safeDelete(f.path));
      return res
        .status(500)
        .json({
          success: false,
          error: "Server error",
          message: error.message,
        });
    }
  }
);

// GET /content/:id
router.get("/:id", async (req, res) => {
  try {
    const doc = await Content.findById(req.params.id);
    if (!doc)
      return res
        .status(404)
        .json({ success: false, error: "Content not found" });

    return res.json({
      success: true,
      data: { ...doc.toObject(), imageUrls: mapUrls(req, doc.images || []) },
    });
  } catch (error) {
    console.error("[content:getById] Error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Server error", message: error.message });
  }
});

router.patch(
  "/:id",
  contentUploader.array("images", 12),
  [
    body("section").optional().trim().isLength({ min: 2 }),
    body("title").optional().trim(),
    body("body").optional().trim(),
    body("isActive").optional().isBoolean().toBoolean(),
    body("replaceImages").optional().isBoolean().toBoolean(),
    body("removeImages").optional().isArray(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        (req.files || []).forEach((f) => safeDelete(f.path));
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const existing = await Content.findById(req.params.id);
      if (!existing) {
        (req.files || []).forEach((f) => safeDelete(f.path));
        return res
          .status(404)
          .json({ success: false, error: "Content not found" });
      }

      const updates = {};
      const {
        section,
        title,
        body: contentBody,
        isActive,
        replaceImages = false,
        removeImages = [],
      } = req.body;

      if (typeof section !== "undefined") updates.section = section;
      if (typeof title !== "undefined") updates.title = title;
      if (typeof contentBody !== "undefined") updates.body = contentBody;
      if (typeof isActive !== "undefined") updates.isActive = isActive;

      // Handle images
      const newRelImages = (req.files || []).map((f) => toRelativePath(f.path));
      let finalImages = Array.isArray(existing.images)
        ? [...existing.images]
        : [];

      // Remove selected images (and delete files)
      if (Array.isArray(removeImages) && removeImages.length > 0) {
        const toRemoveSet = new Set(removeImages);
        finalImages.forEach((rel) => {
          if (toRemoveSet.has(rel)) {
            safeDelete(relToDiskPath(rel));
          }
        });
        finalImages = finalImages.filter((rel) => !toRemoveSet.has(rel));
      }

      if (replaceImages) {
        // delete all remaining old files (that aren't just removed above) if we are replacing
        finalImages.forEach((rel) => safeDelete(relToDiskPath(rel)));
        finalImages = [...newRelImages];
      } else {
        // append
        finalImages.push(...newRelImages);
      }

      updates.images = finalImages;

      Object.assign(existing, updates);
      await existing.save();

      return res.json({
        success: true,
        message: "Content updated",
        data: {
          ...existing.toObject(),
          imageUrls: mapUrls(req, existing.images || []),
        },
      });
    } catch (error) {
      console.error("[content:update] Error:", error);
      // cleanup newly uploaded files on error
      (req.files || []).forEach((f) => safeDelete(f.path));
      return res
        .status(500)
        .json({
          success: false,
          error: "Server error",
          message: error.message,
        });
    }
  }
);

// DELETE /content/:id
router.delete("/:id", async (req, res) => {
  try {
    const existing = await Content.findById(req.params.id);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, error: "Content not found" });
    }

    // delete images from disk
    (existing.images || []).forEach((rel) => safeDelete(relToDiskPath(rel)));

    await Content.deleteOne({ _id: existing._id });

    return res.json({ success: true, message: "Content deleted" });
  } catch (error) {
    console.error("[content:delete] Error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Server error", message: error.message });
  }
});

module.exports = router;
