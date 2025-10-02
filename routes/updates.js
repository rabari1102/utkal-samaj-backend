const express = require("express");
const Updates = require("../models/updates");
const { body, validationResult } = require("express-validator");
const multer = require("multer");

// S3 helpers
const {
  uploadBuffer,
  deleteObject,
  getSignedDownloadUrl,
  publicUrl,
} = require("../utils/s3");
const { S3Client, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
const router = express.Router();

// -------------------- URL helpers --------------------
const ACL = process.env.S3_OBJECT_ACL || "private";
const USE_PUBLIC = ACL === "public-read";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB file
    fieldSize: 25 * 1024 * 1024, // 25 MB total for text fields (default ~1MB)
    fields: 50, // optional: max number of text fields
  },
});

const s3 = new S3Client({
  region: process.env.AWS_REGION,
});
const BUCKET = process.env.S3_BUCKET;
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

async function deleteKeysFromS3(keys = []) {
  if (!Array.isArray(keys) || keys.length === 0) {
    return { deleted: [], errors: [] };
  }

  const results = { deleted: [], errors: [] };

  // S3 DeleteObjects caps at 1000 objects/request.
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);

    try {
      const resp = await s3.send(new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: chunk.map(Key => ({ Key })) },
      }));

      if (Array.isArray(resp.Deleted)) {
        results.deleted.push(...resp.Deleted.map(d => d.Key).filter(Boolean));
      }
      if (Array.isArray(resp.Errors) && resp.Errors.length) {
        results.errors.push(...resp.Errors.map(e => ({
          Key: e.Key, Code: e.Code, Message: e.Message
        })));
      }
    } catch (err) {
      // If the whole batch fails, record individual keys with a generic error
      results.errors.push(...chunk.map(Key => ({
        Key, Code: "BatchError", Message: err.message
      })));
    }
  }

  return results;
}


router.post(
  "/",
  upload.array("images", 12),
  [
    body("title").trim().notEmpty().withMessage("title is required"),
    body("content").trim().notEmpty().withMessage("content is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { title, content } = req.body;

      // Upload images to S3 (optional)
      const imageKeys = [];
      if (Array.isArray(req.files) && req.files.length > 0) {
        for (const file of req.files) {
          const { key } = await uploadBuffer({
            buffer: file.buffer,
            contentType: file.mimetype,
            folder: "updates",
            filename: file.originalname,
            metadata: { entity: "updates" },
          });
          imageKeys.push(key);
        }
      }

      // Create document according to schema:
      // { title: String (required), content: String (required), images: [String], createdAt: Date (auto) }
      const doc = await Updates.create({
        title,
        content: content,
        images: imageKeys,
      });

      return res.status(201).json({
        success: true,
        message: "update created",
        data: {
          ...doc.toObject(),
          imageUrls: await keysToUrls(doc.images || []),
        },
      });
    } catch (error) {
      console.error("[updates:create] Error:", error);
      return res.status(500).json({
        success: false,
        error: "Server error",
        message: error.message,
      });
    }
  }
);

router.put("/:id", upload.array("images", 12), async (req, res) => {
  const logPrefix = "[updates:edit]";
  try {
    const { id } = req.params;
    const existing = await Updates.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Update not found" });
    }

    // 1) Update only provided scalar fields
    const fields = ["title", "content"];
    for (const f of fields) {
      if (Object.prototype.hasOwnProperty.call(req.body, f)) {
        existing[f] = req.body[f];
      }
    }

    const ACL = process.env.S3_ACL || undefined;

    // 2) Current keys (to potentially delete)
    const currentKeys = Array.isArray(existing.images) ? existing.images : [];

    // 3) If new files arrive, upload them and replace ALL old images
    let uploadedKeys = [];
    if (Array.isArray(req.files) && req.files.length > 0) {
      for (const file of req.files) {
        const { key } = await uploadBuffer({
          buffer: file.buffer,
          contentType: file.mimetype,
          folder: "updates",
          filename: file.originalname,
          acl: ACL,
          metadata: { entity: "updates", id },
        });
        uploadedKeys.push(key);
      }

      // Replace behavior: final = ONLY the new uploads
      existing.images = uploadedKeys;
    }

    // 4) Save first (so the doc no longer references the old keys)
    await existing.save();

    // 5) If we uploaded new images, delete ALL old S3 objects
    if (uploadedKeys.length > 0 && currentKeys.length > 0) {
      for (const k of currentKeys) {
        try {
          await deleteObject(k);
        } catch (e) {
          console.warn(`${logPrefix} S3 delete failed:`, e);
        }
      }
    }

    const imageUrls = await keysToUrls(existing.images || []);

    return res.status(200).json({
      success: true,
      message: "Update modified successfully",
      data: {
        id: existing._id,
        title: existing.title,
        content: existing.content,
        images: imageUrls, // return URLs
      },
    });
  } catch (err) {
    console.error("[updates:edit] Error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: err.message,
    });
  }
});

router.delete("/:id", async (req, res) => {
  const logPrefix = "[updates:delete]";
  try {
    const { id } = req.params;

    const doc = await Updates.findById(id);
    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "update not found" });
    }

    // Keep a copy of image keys for S3 cleanup
    const imageKeys = Array.isArray(doc.images) ? [...doc.images] : [];

    await Updates.deleteOne({ _id: id });

    // Best-effort S3 cleanup
    try {
      if (imageKeys.length > 0) {
        await deleteKeysFromS3(imageKeys); // implement in your S3 helper
      }
    } catch (delErr) {
      console.warn(`${logPrefix} Failed deleting some images from S3:`, delErr);
      // Not fatal—document is already deleted.
    }

    return res.status(200).json({
      success: true,
      message: "update deleted",
      data: { id, removedImages: imageKeys },
    });
  } catch (error) {
    console.error("[updates:delete] Error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error",
      message: error.message,
    });
  }
});

// GET /updates
router.get("/", async (req, res) => {
  try {
    // Fetch all docs (no pagination, no sorting)
    const docs = await Updates.find();

    // Convert keys -> URLs
    const data = [];
    for (const d of docs) {
      const imageKeys = Array.isArray(d.images) ? d.images : [];
      const imageUrls = await keysToUrls(imageKeys);

      data.push({
        _id: d._id,
        title: d.title,
        content: d.content,
        images: imageUrls, // return URLs
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Updates fetched successfully",
      data,
    });
  } catch (err) {
    console.error("[updates:list] Error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: err.message,
    });
  }
});


module.exports = router;
