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

const DEFAULT_PROFILE_PIC = "/uploads/1752403303248-profilePicture.jpeg";

router.get("/tree", async (req, res) => {
  try {
    const SAMITI_PARENT_ID = "68738ad61edecc358a584c9c";

    // Recursive function to build tree
    const buildTree = async (id) => {
      const node = await TeamNode.findById(id).lean();
      if (!node) return null;

      if (!node.profilePicture) node.profilePicture = DEFAULT_PROFILE_PIC;

      const children = await TeamNode.find({ parent: id }).lean();
      node.children = await Promise.all(
        children.map((child) => buildTree(child._id))
      );

      return node;
    };

    // Step 1: Find all samiti nodes (direct children of the fixed parent)
    const samitis = await TeamNode.find({ _id: SAMITI_PARENT_ID }).lean();

    // Step 2: Build tree for each samiti
    const samitiTrees = await Promise.all(
      samitis.map((samiti) => buildTree(samiti._id))
    );

    res.json({ data: samitiTrees });
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

router.put("/:id", upload.single("profilePicture"), async (req, res) => {
  try {
    const { name, role, samiti, parent } = req.body;

    const updateData = {};

    if (name) updateData.name = name;
    if (role) updateData.role = role;
    if (samiti) updateData.samiti = samiti;
    if (parent !== undefined) updateData.parent = parent;
    console.log(req.file.buffer, "req.file.bufferreq.file.buffer");

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

    const responseObj = updatedNode.toObject();
    delete responseObj.profilePicture;

    res.json(responseObj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
