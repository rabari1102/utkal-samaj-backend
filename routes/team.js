const express = require("express");
const TeamNode = require("../models/Team");
const upload = require("../utils/upload");
const path = require("path");
const router = express.Router();

// Team management
router.post("/", upload.single("profilePicture"), async (req, res) => {
  try {
    const { name, role, samiti, parent } = req.body;

    const teamNode = new TeamNode({
      name,
      role,
      samiti,
      parent: parent || null,
      profilePicture: req.file ? req.file.buffer : null,
    });

    await teamNode.save();

    res
      .status(201)
      .json({ message: "Team node created successfully", id: teamNode._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/tree", async (req, res) => {
  try {
    const SAMITI_PARENT_ID = "687386d3d4d688945bf29a22";
    const DEFAULT_PROFILE_PIC = "your_default_image_url_or_buffer"; // Define your default picture

    // Recursive function to build tree
    const buildTree = async (id) => {
      const node = await TeamNode.findById(id).lean();
      if (!node) return null;

      if (!node.profilePicture) {
        node.profilePicture = DEFAULT_PROFILE_PIC;
      }

      // Find all children and SORT them by name in ascending order
      const children = await TeamNode.find({ parent: id })
        .sort({ createdAt: "ascending" }) // <-- This is the new line for sorting
        .lean();
      
      node.children = await Promise.all(
        children.map((child) => buildTree(child._id))
      );

      return node;
    };

    // Step 1: Find the root node
    const samitiNode = await TeamNode.findById(SAMITI_PARENT_ID).lean();
    if (!samitiNode) {
      return res.status(404).json({ message: "Samiti Parent ID not found" });
    }

    // Step 2: Build the entire tree starting from the root
    const samitiTree = await buildTree(samitiNode._id);

    // The result is a single tree object, so we wrap it in an array to match the original output structure
    res.json({ data: [samitiTree] });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/tree/:id", async (req, res) => {
  const nodeId = req.params.id;

  try {
    // Recursively fetch children tree
    const buildTree = async (id) => {
      const node = await TeamNode.findById(id).lean();
      if (!node) return null;

      // Set default profile picture if missing
      if (!node.profilePicture) node.profilePicture = DEFAULT_PROFILE_PIC;

      // Find children
      const children = await TeamNode.find({ parent: id }).lean();

      // Recursively add children
      node.children = await Promise.all(
        children.map((child) => buildTree(child._id))
      );

      return node;
    };

    const tree = await buildTree(nodeId);

    if (!tree) return res.status(404).json({ message: "Node not found" });

    res.json({ data: trees });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// This route will now work correctly with the new multer config
router.put("/:id", upload.single("profilePicture"), async (req, res) => {
  try {
    const { name, role, samiti, parent } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (role) updateData.role = role;
    if (samiti) updateData.samiti = samiti;
    if (parent !== undefined) updateData.parent = parent;

    if (req.file) {
      updateData.profilePicture = req.file.buffer;
    }

    const updatedNode = await TeamNode.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    );

    if (!updatedNode) {
      return res.status(404).json({ message: "Team member not found" });
    }
    
    res.json(updatedNode);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
