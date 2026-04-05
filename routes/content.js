const express = require("express");
const { body, validationResult } = require("express-validator");
const multer = require("multer");
const Content = require("../models/Content");

// S3 helpers
const {
  uploadBuffer,
  deleteObject,
  getSignedDownloadUrl,
  publicUrl,
} = require("../utils/s3");

const router = express.Router();

// -------------------- URL helpers --------------------
const ACL = process.env.S3_OBJECT_ACL || "private";
const USE_PUBLIC = ACL === "public-read";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 3 * 1024 * 1024, // ✅ 3 MB per file
    fieldSize: 25 * 1024 * 1024, // 25 MB total for text fields (default ~1MB)
    fields: 50, // optional: max number of text fields
  },
});

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

      // Support pre-uploaded images (from presigned URL via frontend bypassing Vercel limits)
      if (req.body.uploadedImages) {
        try {
          let parsed = req.body.uploadedImages;
          if (typeof parsed === "string") {
            try {
              parsed = JSON.parse(parsed);
            } catch (_) {
              parsed = parsed
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            }
          }
          if (Array.isArray(parsed)) {
            imageKeys.push(...parsed);
          } else if (typeof parsed === "string") {
            imageKeys.push(parsed);
          }
        } catch (e) {
          console.warn("[content:create] Failed parsing uploadedImages", e);
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
  },
);

// -------------------- getAll --------------------
router.get("/getContent", async (_req, res) => {
  try {
    // 1) Fetch latest documents first
    const items = await Content.find().sort({ createdAt: -1 }).lean().exec();

    // 2) Collect all image keys (deduplicated)
    const allKeys = Array.from(
      new Set(
        items
          .flatMap((doc) => (Array.isArray(doc.images) ? doc.images : []))
          .filter(Boolean),
      ),
    );

    // 3) Convert S3 keys → URLs
    const urlList = allKeys.length ? await keysToUrls(allKeys) : [];
    const keyToUrl = new Map(allKeys.map((k, i) => [k, urlList[i]]));

    // 4) Attach sorted imageUrls (latest first)
    const data = items.map((doc) => {
      let sortedKeys = Array.isArray(doc.images) ? [...doc.images] : [];

      // 🔥 Try timestamp-based sorting (if keys contain timestamp)
      sortedKeys.sort((a, b) => {
        const getTime = (key) => {
          const match = key.match(/\d{10,13}/); // extract timestamp
          return match ? parseInt(match[0]) : 0;
        };
        return getTime(b) - getTime(a); // latest first
      });

      // fallback: if no timestamps → reverse
      if (!sortedKeys.some((k) => /\d{10,13}/.test(k))) {
        sortedKeys.reverse();
      }

      return {
        ...doc,
        imageUrls: sortedKeys.map((k) => keyToUrl.get(k)).filter(Boolean),
      };
    });

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
      return res
        .status(404)
        .json({ success: false, error: "Content not found" });

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
        return res
          .status(404)
          .json({ success: false, error: "Content not found" });
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

      let finalImages = Array.isArray(existing.images)
        ? [...existing.images]
        : [];

      // Remove selected images
      if (Array.isArray(removeImages) && removeImages.length > 0) {
        for (const key of removeImages) {
          try {
            await deleteObject(key);
          } catch (e) {
            console.warn(
              "[content:patch] Failed to delete S3 object:",
              key,
              e?.message,
            );
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
  },
);

// -------------------- PUT (full update) --------------------
// PUT /content/:id
// form-data: keepImages (JSON string or comma-separated or array of keys/URLs), images[] (files)
router.put("/:id", upload.array("images", 12), async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await Content.findById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "Content not found",
      });
    }

    // ==============================
    // 1. Update normal fields
    // ==============================
    const fields = ["section", "title", "body", "link"];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        existing[f] = req.body[f];
      }
    });

    if (req.body.isActive !== undefined) {
      const raw = req.body.isActive;
      existing.isActive =
        typeof raw === "boolean"
          ? raw
          : ["true", "1", "yes"].includes(String(raw).toLowerCase());
    }

    // ==============================
    // 2. Helpers
    // ==============================
    const parseArray = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;

      try {
        return JSON.parse(val);
      } catch {
        return val.split(",").map((v) => v.trim());
      }
    };

    const urlToKey = (url) => {
      if (!url) return null;

      if (!url.startsWith("http")) return url; // already key

      try {
        const u = new URL(url);
        return decodeURIComponent(u.pathname.replace(/^\/+/, ""));
      } catch {
        return url;
      }
    };

    const currentKeys = existing.images || [];

    // ==============================
    // 3. FRONTEND SENT IMAGES (KEEP)
    // ==============================
    const keepImagesRaw =
      req.body.keepImages ||
      req.body.images ||
      req.body.existingImages;

    const keepKeys = parseArray(keepImagesRaw)
      .map(urlToKey)
      .filter(Boolean);

    // ==============================
    // 4. UPLOAD NEW FILES
    // ==============================
    const newUploadedKeys = [];

    if (req.files?.length) {
      for (const file of req.files) {
        const { key } = await uploadBuffer({
          buffer: file.buffer,
          contentType: file.mimetype,
          folder: "content",
          filename: file.originalname,
        });

        newUploadedKeys.push(key);
      }
    }

    // ==============================
    // 5. FINAL IMAGE LIST
    // ==============================
    const finalKeys = [...new Set([...keepKeys, ...newUploadedKeys])];

    // ==============================
    // 6. DELETE UNUSED IMAGES
    // ==============================
    const toDelete = currentKeys.filter(
      (key) => !finalKeys.includes(key)
    );

    // ==============================
    // 7. SAVE DB FIRST
    // ==============================
    existing.images = finalKeys;
    await existing.save();

    // ==============================
    // 8. DELETE FROM S3
    // ==============================
    for (const key of toDelete) {
      try {
        await deleteObject(key);
      } catch (err) {
        console.warn("S3 delete failed:", key);
      }
    }

    // ==============================
    // 9. RETURN UPDATED DATA
    // ==============================
    const imageUrls = await keysToUrls(finalKeys);

    return res.json({
      success: true,
      message: "Content updated successfully",
      data: {
        ...existing.toObject(),
        imageUrls,
      },
    });
  } catch (error) {
    console.error("[UPDATE ERROR]", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// -------------------- delete --------------------
router.delete("/:id", async (req, res) => {
  try {
    const existing = await Content.findById(req.params.id);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, error: "Content not found" });
    }

    if (Array.isArray(existing.images) && existing.images.length > 0) {
      for (const key of existing.images) {
        try {
          await deleteObject(key);
        } catch (e) {
          console.warn(
            "[content:delete] Failed to delete S3 object:",
            key,
            e?.message,
          );
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
