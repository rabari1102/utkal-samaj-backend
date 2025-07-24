const express = require("express");
const TeamNode = require("../models/Team");
const createUploader = require("../utils/upload"); // Import the factory
const path = require("path");
const router = express.Router();

// Create a specific uploader for team profile pictures
// Files will be saved in 'upload/team_profiles/'
const teamUploader = createUploader("team_profiles");

// Default profile picture path (client should resolve this)
const DEFAULT_PROFILE_PIC_PATH = "/defaults/avatar.png";

// POST a new team member
router.post("/", teamUploader.single("profilePicture"), async (req, res) => {
  try {
    const { name, role, samiti, parent } = req.body;

    const teamNode = new TeamNode({
      name,
      role,
      samiti,
      parent: parent || null,
      // **IMPORTANT**: Store the file PATH, not the buffer
      profilePicture: req.file ? req.file.path : null,
    });

    await teamNode.save();

    res
      .status(201)
      .json({ message: "Team node created successfully", id: teamNode._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET the full team tree
router.get("/tree", async (req, res) => {
  try {
    const SAMITI_PARENT_ID = "687386d3d4d688945bf29a22"; // Use your actual root ID

    const buildTree = async (id) => {
      const node = await TeamNode.findById(id).lean();
      if (!node) return null;

      if (!node.profilePicture) {
        node.profilePicture = DEFAULT_PROFILE_PIC_PATH;
      }

      const children = await TeamNode.find({ parent: id })
        .sort({ createdAt: "ascending" })
        .lean();
      
      node.children = await Promise.all(
        children.map((child) => buildTree(child._id))
      );

      return node;
    };

    const samitiNode = await TeamNode.findById(SAMITI_PARENT_ID).lean();
    if (!samitiNode) {
      return res.status(404).json({ message: "Samiti Parent ID not found" });
    }

    const samitiTree = await buildTree(samitiNode._id);
    res.json({ data: [samitiTree] });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET a specific subtree by ID
router.get("/tree/:id", async (req, res) => {
  const nodeId = req.params.id;
  try {
    const buildTree = async (id) => {
      const node = await TeamNode.findById(id).lean();
      if (!node) return null;

      if (!node.profilePicture) {
        node.profilePicture = DEFAULT_PROFILE_PIC_PATH;
      }

      const children = await TeamNode.find({ parent: id }).lean();
      node.children = await Promise.all(
        children.map((child) => buildTree(child._id))
      );

      return node;
    };

    const tree = await buildTree(nodeId);
    if (!tree) return res.status(404).json({ message: "Node not found" });

    // Corrected variable name from 'trees' to 'tree'
    res.json({ data: tree });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// UPDATE a team member
router.put("/:id", teamUploader.single("profilePicture"), async (req, res) => {
  try {
    const { name, role, samiti, parent } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (role) updateData.role = role;
    if (samiti) updateData.samiti = samiti;
    if (parent !== undefined) updateData.parent = parent;

    // **IMPORTANT**: If a new file is uploaded, update its PATH
    if (req.file) {
      updateData.profilePicture = req.file.path;
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