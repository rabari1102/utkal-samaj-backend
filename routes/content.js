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
    fileSize: 10 * 1024 * 1024, // 10 MB file
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
    // 1) Fetch plain objects
    const items = await Content.find().sort({ createdAt: -1 }).lean().exec();

    // 2) Collect all image keys across docs (dedup) - USE "images", not "image"
    const allKeys = Array.from(
      new Set(
        items
          .flatMap((doc) => (Array.isArray(doc.images) ? doc.images : []))
          .filter(Boolean)
      )
    );

    // 3) Batch resolve to URLs just once (guard against empty input)
    const urlList = allKeys.length ? await keysToUrls(allKeys) : [];
    const keyToUrl = new Map(allKeys.map((k, i) => [k, urlList[i]]));

    // 4) Attach imageUrls per item using the map
    const data = items.map((doc) => ({
      ...doc,
      imageUrls: (Array.isArray(doc.images) ? doc.images : [])
        .map((k) => keyToUrl.get(k))
        .filter(Boolean),
    }));

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
              e?.message
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
  }
);

// -------------------- PUT (full update) --------------------
// PUT /content/:id
// form-data: keepImages (JSON string or comma-separated or array of keys/URLs), images[] (files)
router.put("/:id", upload.array("images", 12), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Content.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Content not found" });
    }

    // 1) Update only provided scalar fields
    const fields = ["section", "title", "body", "link"];
    for (const f of fields) {
      if (Object.prototype.hasOwnProperty.call(req.body, f)) {
        existing[f] = req.body[f];
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "isActive")) {
      const raw = req.body.isActive;
      existing.isActive =
        typeof raw === "boolean"
          ? raw
          : typeof raw === "string"
          ? ["true", "1", "yes", "on"].includes(raw.toLowerCase())
          : Boolean(raw);
    }

    // Helpers
    const CLOUDFRONT_URL = process.env.CLOUDFRONT_URL?.replace(/\/+$/, "");
    const BUCKET = process.env.S3_BUCKET;

    const parseMaybeJson = (val) => {
      if (val == null) return undefined;
      if (Array.isArray(val)) return val;
      if (typeof val === "string") {
        try { return JSON.parse(val); } catch (_) { /* not JSON */ }
        return val.split(",").map(s => s.trim()).filter(Boolean);
      }
      return val;
    };

    // Convert URL -> key (supports CloudFront or S3 URL forms)
    const urlToKey = (u) => {
      if (!u || typeof u !== "string") return u;
      try {
        // If it’s already a relative key like "content/abc.png"
        if (!/^https?:\/\//i.test(u)) return u.replace(/^\/+/, "");

        const url = new URL(u);
        const host = url.host;

        // CloudFront/custom CDN, e.g. https://cdn.example.com/content/abc.png
        if (CLOUDFRONT_URL && u.startsWith(CLOUDFRONT_URL)) {
          return decodeURIComponent(u.substring(CLOUDFRONT_URL.length + (CLOUDFRONT_URL.endsWith("/") ? 0 : 1)));
        }

        // Virtual-hosted–style S3: https://<bucket>.s3.amazonaws.com/<key>
        const vh = host.match(/^([^.]+)\.s3(?:-[^.]+)?\.amazonaws\.com$/i);
        if (vh) {
          const bucketInUrl = vh[1];
          if (!BUCKET || BUCKET === bucketInUrl) {
            return decodeURIComponent(url.pathname.replace(/^\/+/, ""));
          }
        }

        // Path-style S3: https://s3.amazonaws.com/<bucket>/<key> or region variant
        const pathStyle = url.pathname.split("/").filter(Boolean);
        if (pathStyle.length >= 2 && (host.startsWith("s3.") || host === "s3.amazonaws.com")) {
          const [, ...rest] = pathStyle; // drop bucket
          return decodeURIComponent(rest.join("/"));
        }

        // Fallback: try pathname as key
        return decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      } catch {
        return u;
      }
    };

    // 2) Parse list of images the client wants to KEEP (keys or URLs)
    //    We support keepImages, existingImages, or imagesToKeep for flexibility.
    const keepRaw =
      parseMaybeJson(req.body.keepImages) ??
      parseMaybeJson(req.body.existingImages) ??
      parseMaybeJson(req.body.imagesToKeep);

    const currentKeys = Array.isArray(existing.images) ? existing.images : [];
    const keepKeys =
      keepRaw === undefined
        ? // If not provided, keep everything that already exists (safer)
          [...currentKeys]
        : // Normalize every entry to an S3 key
          keepRaw.map(urlToKey).filter(Boolean);

    // 3) Upload new files
    const uploadedKeys = [];
    if (Array.isArray(req.files) && req.files.length > 0) {
      for (const file of req.files) {
        const { key } = await uploadBuffer({
          buffer: file.buffer,
          contentType: file.mimetype,
          folder: "content",
          filename: file.originalname,
          metadata: { entity: "content", id },
        });
        uploadedKeys.push(key);
      }
    }

    // 4) Final set = keepKeys ∪ uploadedKeys (dedup)
    const finalSet = Array.from(new Set([...(keepKeys || []), ...uploadedKeys]));

    // 5) Figure out what to delete from S3: old minus final
    const finalSetLookup = new Set(finalSet);
    const oldKeysToDelete = currentKeys.filter((k) => !finalSetLookup.has(k));

    // 6) Save and then delete old files
    existing.images = finalSet;
    await existing.save();

    for (const k of oldKeysToDelete) {
      try { await deleteObject(k); } catch (e) { console.warn("[content:edit] S3 delete failed:", e); }
    }

    const imageUrls = await keysToUrls(existing.images || []);

    return res.status(200).json({
      success: true,
      message: "Content updated successfully",
      data: {
        id: existing._id,
        section: existing.section,
        title: existing.title,
        body: existing.body,
        link: existing.link,
        isActive: existing.isActive,
        images: imageUrls, // always return URLs
      },
    });
  } catch (err) {
    console.error("[content:edit] Error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: err.message,
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
            e?.message
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
