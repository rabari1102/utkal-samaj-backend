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
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Default profile picture path (let frontend resolve this asset)
const DEFAULT_PROFILE_PIC_PATH = "/defaults/avatar.png";

// Helpers to turn stored S3 keys into URLs for responses
async function keyToUrl(key) {
  if (!key) return null;
  return USE_PUBLIC ? publicUrl(key) : await getSignedDownloadUrl(key);
}

/* ------------------------------- CREATE ------------------------------- */
// POST a new team member
// field: profilePicture (optional)
router.post("/", upload.single("profilePicture"), async (req, res) => {
  try {
    const { name, role, samiti, parent } = req.body;

    let profileKey = null;
    if (req.file) {
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
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------- TREE ------------------------------- */
// GET the full team tree (starting from a root SAMITI node)
// routes/team.js (only the relevant parts)

// --- helpers: robust key->URL (skip on bad types) ---
async function keyToUrlSafe(key) {
  try {
    if (typeof key !== "string") return null;          // skip non-strings
    const trimmed = key.trim();
    if (!trimmed) return null;                         // skip empty
    return USE_PUBLIC ? publicUrl(trimmed) : await getSignedDownloadUrl(trimmed);
  } catch (_) {
    return null; // never throw from URL resolution
  }
}

// --- GET /tree ---
router.get("/tree", async (req, res) => {
  try {
    const SAMITI_PARENT_ID = "687386d3d4d688945bf29a22"; // TODO: move to config/env

    const buildTree = async (id) => {
      const node = await TeamNode.findById(id).lean();
      if (!node) return null;

      // Resolve picture URL from S3 key safely (skip on any problem)
      const picKey = node.profilePicture ?? null;
      node.profilePicture = await keyToUrlSafe(picKey) || DEFAULT_PROFILE_PIC_PATH;

      const children = await TeamNode.find({ parent: id })
        .sort({ createdAt: "ascending" })
        .lean();

      node.children = await Promise.all(children.map((child) => buildTree(child._id)));
      return node;
    };

    const root = await TeamNode.findById(SAMITI_PARENT_ID).lean();
    if (!root) {
      return res.status(404).json({ message: "Samiti Parent ID not found" });
    }

    const tree = await buildTree(root._id);
    res.json({ data: [tree] });
  } catch (err) {
    console.error("[team:tree] Error:", err);
    // Do not block: return empty data structure on unexpected errors
    res.status(200).json({ data: [] });
  }
});

// GET a specific subtree by ID
router.get("/tree/:id", async (req, res) => {
  const nodeId = req.params.id;
  try {
    const buildTree = async (id) => {
      const node = await TeamNode.findById(id).lean();
      if (!node) return null;

      const picKey = node.profilePicture || null;
      node.profilePicture = picKey ? await keyToUrl(picKey) : DEFAULT_PROFILE_PIC_PATH;

      const children = await TeamNode.find({ parent: id }).lean();
      node.children = await Promise.all(children.map((child) => buildTree(child._id)));

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
// UPDATE a team member (replace profile picture if new one provided)
// field: profilePicture (optional)
router.put("/:id", upload.single("profilePicture"), async (req, res) => {
  try {
    const { name, role, samiti, parent } = req.body;
    const existing = await TeamNode.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Team member not found" });

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (samiti !== undefined) updateData.samiti = samiti;
    if (parent !== undefined) updateData.parent = parent;

    let oldKeyToDelete = null;

    if (req.file) {
      // upload new to S3
      const { key } = await uploadBuffer({
        buffer: req.file.buffer,
        contentType: req.file.mimetype,
        folder: "team_profiles",
        filename: req.file.originalname,
        acl: ACL,
        metadata: { entity: "team", id: String(existing._id) },
      });

      // mark old key for deletion after successful save
      if (existing.profilePicture) oldKeyToDelete = existing.profilePicture;

      updateData.profilePicture = key;
    }

    Object.assign(existing, updateData);
    await existing.save();

    // best-effort cleanup of old object AFTER save succeeds
    if (oldKeyToDelete) {
      try { await deleteObject(oldKeyToDelete); } catch (e) { console.warn("[team:update] S3 delete failed:", e); }
    }

    res.json(existing);
  } catch (error) {
    console.error("[team:update] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ------------------------------- DELETE EVENT (with S3 images) ------------------------------- */
// This endpoint was in your file; converting it to delete S3 images instead of disk files.
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
          console.error(`[event:delete] Error deleting S3 object ${key}:`, unlinkError?.message || unlinkError);
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
