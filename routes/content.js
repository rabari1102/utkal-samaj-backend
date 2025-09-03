const express = require("express");
const { body, validationResult } = require("express-validator");
const multer = require("multer");
const Content = require("../models/Content");

// S3 helpers
const { uploadBuffer, deleteObject, getSignedDownloadUrl, publicUrl } = require("../utils/s3");

const router = express.Router();

// -------------------- Multer (memory) --------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
});

// -------------------- URL helpers --------------------
const ACL = process.env.S3_OBJECT_ACL || "private";
const USE_PUBLIC = ACL === "public-read";

async function keyToUrl(key) {
  if (!key || typeof key !== "string") return null;
  return USE_PUBLIC ? publicUrl(key) : await getSignedDownloadUrl(key);
}
async function keysToUrls(keys = []) {
  return Promise.all((keys || []).map((k) => keyToUrl(k)));
}

// -------------------- create --------------------
router.post(
  "/",
  upload.array("images", 12),
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
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { section, title, body: contentBody, isActive = true } = req.body;

      // Upload to S3
      const imageKeys = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const { key } = await uploadBuffer({
            buffer: file.buffer,
            contentType: file.mimetype,
            folder: "content",
            filename: file.originalname,
            metadata: { entity: "content", section },
          });
          imageKeys.push(key);
        }
      }

      const doc = await Content.create({
        section,
        title,
        body: contentBody,
        isActive,
        images: imageKeys,
      });

      return res.status(201).json({
        success: true,
        message: "Content created",
        data: {
          ...doc.toObject(),
          imageUrls: await keysToUrls(doc.images),
        },
      });
    } catch (error) {
      console.error("[content:create] Error:", error);
      return res.status(500).json({
        success: false,
        error: "Server error",
        message: error.message,
      });
    }
  }
);

// -------------------- getAll --------------------
router.get("/getContent", async (_req, res) => {
  try {
    const items = await Content.find().sort({ createdAt: -1 });

    const data = await Promise.all(
      items.map(async (doc) => ({
        ...doc.toObject(),
        imageUrls: await keysToUrls(doc.images || []),
      }))
    );

    return res.json({
      success: true,
      total: data.length,
      data,
    });
  } catch (error) {
    console.error("[content:getAll] Error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error",
      message: error.message,
    });
  }
});

// -------------------- getById --------------------
router.get("/:id", async (req, res) => {
  try {
    const doc = await Content.findById(req.params.id);
    if (!doc)
      return res.status(404).json({ success: false, error: "Content not found" });

    return res.json({
      success: true,
      data: {
        ...doc.toObject(),
        imageUrls: await keysToUrls(doc.images || []),
      },
    });
  } catch (error) {
    console.error("[content:getById] Error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error",
      message: error.message,
    });
  }
});

// -------------------- PATCH (partial update) --------------------
router.patch(
  "/:id",
  upload.array("images", 12),
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
      const existing = await Content.findById(req.params.id);
      if (!existing) {
        return res.status(404).json({ success: false, error: "Content not found" });
      }

      const {
        section,
        title,
        body: contentBody,
        isActive,
        replaceImages = false,
        removeImages = [],
      } = req.body;

      if (typeof section !== "undefined") existing.section = section;
      if (typeof title !== "undefined") existing.title = title;
      if (typeof contentBody !== "undefined") existing.body = contentBody;
      if (typeof isActive !== "undefined") existing.isActive = isActive;

      let finalImages = Array.isArray(existing.images) ? [...existing.images] : [];

      // Remove selected images
      if (Array.isArray(removeImages) && removeImages.length > 0) {
        for (const key of removeImages) {
          try {
            await deleteObject(key);
          } catch (e) {
            console.warn("[content:patch] Failed to delete S3 object:", key, e?.message);
          }
        }
        finalImages = finalImages.filter((rel) => !removeImages.includes(rel));
      }

      // Upload new images
      const newKeys = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const { key } = await uploadBuffer({
            buffer: file.buffer,
            contentType: file.mimetype,
            folder: "content",
            filename: file.originalname,
            metadata: { entity: "content", id: existing._id.toString() },
          });
          newKeys.push(key);
        }
      }

      if (replaceImages) {
        // delete all remaining old images
        for (const key of finalImages) {
          try {
            await deleteObject(key);
          } catch (_) {}
        }
        finalImages = [...newKeys];
      } else {
        finalImages.push(...newKeys);
      }

      existing.images = finalImages;
      await existing.save();

      return res.json({
        success: true,
        message: "Content updated",
        data: {
          ...existing.toObject(),
          imageUrls: await keysToUrls(existing.images || []),
        },
      });
    } catch (error) {
      console.error("[content:update:patch] Error:", error);
      return res.status(500).json({
        success: false,
        error: "Server error",
        message: error.message,
      });
    }
  }
);

// -------------------- PUT (full update) --------------------
router.put(
  "/:id",
  upload.array("images", 12),
  [
    body("section").trim().isLength({ min: 2 }),
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
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const existing = await Content.findById(req.params.id);
      if (!existing) {
        return res.status(404).json({ success: false, error: "Content not found" });
      }

      const {
        section,
        title,
        body: contentBody,
        isActive,
        replaceImages = true,
        removeImages = [],
      } = req.body;

      existing.section = section;
      if (typeof title !== "undefined") existing.title = title;
      if (typeof contentBody !== "undefined") existing.body = contentBody;
      if (typeof isActive !== "undefined") existing.isActive = isActive;

      let finalImages = Array.isArray(existing.images) ? [...existing.images] : [];

      // Remove selected images
      if (Array.isArray(removeImages) && removeImages.length > 0) {
        for (const key of removeImages) {
          try {
            await deleteObject(key);
          } catch (_) {}
        }
        finalImages = finalImages.filter((rel) => !removeImages.includes(rel));
      }

      // Upload new
      const newKeys = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const { key } = await uploadBuffer({
            buffer: file.buffer,
            contentType: file.mimetype,
            folder: "content",
            filename: file.originalname,
            metadata: { entity: "content", id: existing._id.toString() },
          });
          newKeys.push(key);
        }
      }

      if (replaceImages) {
        // delete all old
        for (const key of finalImages) {
          try {
            await deleteObject(key);
          } catch (_) {}
        }
        finalImages = [...newKeys];
      } else {
        finalImages.push(...newKeys);
      }

      existing.images = finalImages;
      await existing.save();

      return res.json({
        success: true,
        message: "Content updated (PUT)",
        data: {
          ...existing.toObject(),
          imageUrls: await keysToUrls(existing.images || []),
        },
      });
    } catch (error) {
      console.error("[content:update:put] Error:", error);
      return res.status(500).json({
        success: false,
        error: "Server error",
        message: error.message,
      });
    }
  }
);

// -------------------- delete --------------------
router.delete("/:id", async (req, res) => {
  try {
    const existing = await Content.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Content not found" });
    }

    if (Array.isArray(existing.images) && existing.images.length > 0) {
      for (const key of existing.images) {
        try {
          await deleteObject(key);
        } catch (e) {
          console.warn("[content:delete] Failed to delete S3 object:", key, e?.message);
        }
      }
    }

    await Content.deleteOne({ _id: existing._id });

    return res.json({ success: true, message: "Content deleted" });
  } catch (error) {
    console.error("[content:delete] Error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error",
      message: error.message,
    });
  }
});

module.exports = router;