// routes/team.js
const express = require("express");
const multer = require("multer");
const TeamNode = require("../models/Team");
const Event = require("../models/Event"); // used by the /events/:id delete route at bottom

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

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      return cb(new Error("Unsupported file type"));
    }
    cb(null, true);
  },
});

// Default profile picture path (let frontend resolve this asset)
const DEFAULT_PROFILE_PIC_PATH = "/defaults/avatar.png";

// Helpers to turn stored S3 keys into URLs for responses
async function keyToUrlSafe(key) {
  try {
    if (typeof key !== "string") return null;
    const trimmed = key.trim();
    if (!trimmed) return null;
    return USE_PUBLIC
      ? publicUrl(trimmed)
      : await getSignedDownloadUrl(trimmed);
  } catch {
    return null; // never throw from URL resolution
  }
}

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
/* ------------------------------- CREATE ------------------------------- */
// POST a new team member
// field: profilePicture (optional)
router.post("/", upload.single("profilePicture"), async (req, res) => {
  try {
    const { name, role, samiti, parent } = req.body;

    let profileKey = null;
    if (req.file) {
      if (!ALLOWED_IMAGE_TYPES.has(req.file.mimetype)) {
        return res.status(415).json({ error: "Unsupported Media Type" });
      }

      const { key } = await uploadBuffer({
        buffer: req.file.buffer,
        contentType: req.file.mimetype,
        folder: "team_profiles",
        filename: req.file.originalname,
        acl: ACL,
        metadata: { entity: "team" },
      });
      profileKey = key;
    }

    const teamNode = new TeamNode({
      name,
      role,
      samiti,
      parent: parent || null,
      profilePicture: profileKey, // store S3 key (or null)
    });

    await teamNode.save();

    res
      .status(201)
      .json({ message: "Team node created successfully", id: teamNode._id });
  } catch (err) {
    console.error("[team:create] Error:", err);
    const status = String(err?.message || "").includes("Unsupported file type")
      ? 415
      : 500;
    res
      .status(status)
      .json({ error: status === 415 ? "Unsupported Media Type" : err.message });
  }
});

/* ------------------------------- TREE ------------------------------- */

// --- GET /tree ---
// routes/team.js
router.get('/tree', async (_req, res) => {
  try {
    const SAMITI_PARENT_ID = '687386d3d4d688945bf29a22'; // TODO: move to env/config

    // Resolve profile picture(s) safely
    const resolvePictures = async (node) => {
      let urls = [];

      try {
        if (Array.isArray(node.profilePicture)) {
          const keys = node.profilePicture.filter(Boolean);
          urls = keys.length ? await keysToUrls(keys) : [];
        } else if (typeof node.profilePicture === 'string' && node.profilePicture) {
          const url = await keyToUrlSafe(node.profilePicture);
          if (url) urls = [url];
        }
      } catch (e) {
        console.warn('[team:tree] Failed to resolve picture URL:', e);
        // Skip broken URL — leave urls as []
      }

      // Attach both a single and array field
      node.profilePictures = urls; // all resolved URLs
      node.profilePicture = urls[0] || DEFAULT_PROFILE_PIC_PATH; // pick first or default
      return node;
    };

    // Recursively build team tree
    const buildTree = async (id) => {
      const node = await TeamNode.findById(id)
        .lean()
        .select('_id name role samiti parent profilePicture createdAt');
      if (!node) return null;

      await resolvePictures(node);

      const children = await TeamNode.find({ parent: id })
        .sort({ createdAt: 'ascending' })
        .lean()
        .select('_id name role samiti parent profilePicture createdAt');

      const childTrees = await Promise.all(
        children.map(async (child) => {
          await resolvePictures(child);
          return buildTree(child._id);
        })
      );

      node.children = (await Promise.all(childTrees)).filter(Boolean);
      return node;
    };

    const root = await TeamNode.findById(SAMITI_PARENT_ID).lean().select('_id');
    if (!root) {
      return res.status(404).json({ message: 'Samiti Parent ID not found' });
    }

    const tree = await buildTree(root._id);
    return res.json({ data: [tree] });
  } catch (err) {
    console.error('[team:tree] Error:', err);
    // Always return at least an empty structure
    return res.status(200).json({ data: [] });
  }
});

// --- GET /tree/:id ---
router.get("/tree/:id", async (req, res) => {
  const nodeId = req.params.id;
  try {
    const buildTree = async (id) => {
      const node = await TeamNode.findById(id).lean();
      if (!node) return null;

      const picKey = node.profilePicture ?? null;
      node.profilePicture =
        (await keyToUrlSafe(picKey)) || DEFAULT_PROFILE_PIC_PATH;

      const children = await TeamNode.find({ parent: id }).lean();
      node.children = await Promise.all(
        children.map((child) => buildTree(child._id))
      );

      return node;
    };

    const tree = await buildTree(nodeId);
    if (!tree) return res.status(404).json({ message: "Node not found" });

    res.json({ data: tree });
  } catch (err) {
    console.error("[team:subtree] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------- UPDATE ------------------------------- */
/**
 * Update a team member (name and/or profile picture).
 * PUT /team/:id  (multipart/form-data with field "image")
 */
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await TeamNode.findById(id);
    if (!existing) {
      return res.status(404).json({ message: 'Team member not found' });
    }

    // Update simple fields if provided
    const fields = ['name', 'role', 'samiti', 'parent'];
    for (const f of fields) {
      if (Object.prototype.hasOwnProperty.call(req.body, f)) {
        existing[f] = req.body[f];
      }
    }

    // Track keys to delete after successful save
    let oldKeysToDelete = [];

    // If a new image is uploaded, replace previous ones with the new single key
    if (req.file) {
      // Collect previous keys for deletion (handles legacy string or array)
      const prev = existing.profilePicture;
      if (Array.isArray(prev)) oldKeysToDelete = [...prev];
      else if (typeof prev === 'string' && prev) oldKeysToDelete = [prev];

      const { key } = await uploadBuffer({
        buffer: req.file.buffer,
        contentType: req.file.mimetype,
        folder: 'team_profiles',
        filename: req.file.originalname,
        acl: ACL,
        metadata: { entity: 'team_profiles', id },
      });

      // Replace with a single key (still stored as array)
      existing.profilePicture = [key];
    }

    await existing.save();

    // Cleanup old S3 objects only after successful save
    for (const k of oldKeysToDelete) {
      try {
        await deleteObject(k);
      } catch (e) {
        console.warn('[team:update] S3 delete failed:', e);
      }
    }

    // Always return URLs array
    const imageUrls = await keysToUrls(existing.profilePicture || []);
    return res.status(200).json({
      success: true,
      message: 'Team member updated successfully',
      data: {
        id: existing._id,
        name: existing.name,
        role: existing.role,
        samiti: existing.samiti,
        parent: existing.parent,
        profilePicture: imageUrls,
      },
    });
  } catch (error) {
    console.error('[team:update] Error:', error);
    const status = String(error?.message || '').includes('Unsupported file type') ? 415 : 500;
    res.status(status).json({
      error: status === 415 ? 'Unsupported Media Type' : error.message || 'Internal Server Error',
    });
  }
});

/* ------------------------------- DELETE EVENT (with S3 images) ------------------------------- */
// Deletes the event and best-effort deletes any S3 images it references.
router.delete("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // event.images is expected to be an array of S3 KEYS
    if (Array.isArray(event.images) && event.images.length > 0) {
      for (const key of event.images) {
        try {
          await deleteObject(key);
          console.log(`[event:delete] Deleted S3 object: ${key}`);
        } catch (unlinkError) {
          console.error(
            `[event:delete] Error deleting S3 object ${key}:`,
            unlinkError?.message || unlinkError
          );
          // continue regardless
        }
      }
    }

    await Event.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error("[event:delete] Error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

module.exports = router;
