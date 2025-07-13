const express = require('express');
const TeamNode = require('../models/Team');
const upload = require('../utils/upload');
const path = require('path');
const router = express.Router();

// Team management
router.post('/', upload.single('profilePicture'), async (req, res) => {
  try {
    const { name, role, samiti, parent } = req.body;

    const teamNode = new TeamNode({
      name,
      role,
      samiti,
      parent: parent || null,
      profilePicture: req.file ? `/uploads/${req.file.filename}` : null
    });

    await teamNode.save();
    res.status(201).json(teamNode);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const DEFAULT_PROFILE_PIC = '/uploads/1752403303248-profilePicture.jpeg';

router.get('/tree', async (req, res) => {
  try {
    const DEFAULT_PROFILE_PIC = 'https://example.com/default.jpg'; // Replace with actual

    // Recursive function to build tree
    const buildTree = async (id) => {
      const node = await TeamNode.findById(id).lean();
      if (!node) return null;

      if (!node.profilePicture) node.profilePicture = DEFAULT_PROFILE_PIC;

      const children = await TeamNode.find({ parent: id }).lean();
      node.children = await Promise.all(children.map(child => buildTree(child._id)));

      return node;
    };

    // Find all root nodes (nodes with no parent)
    const rootNodes = await TeamNode.find({ parent: null }).lean();

    const trees = await Promise.all(rootNodes.map(root => buildTree(root._id)));

    res.json(trees); // Return list of full trees
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


router.get('/tree/:id', async (req, res) => {
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
      node.children = await Promise.all(children.map(child => buildTree(child._id)));

      return node;
    };

    const tree = await buildTree(nodeId);

    if (!tree) return res.status(404).json({ message: "Node not found" });

    res.json(tree);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


router.put('/:id', upload.single('profilePicture'), async (req, res) => {
  try {
    const { name, role, samiti, parent } = req.body;

    const updateData = {
      ...(name && { name }),
      ...(role && { role }),
      ...(samiti && { samiti }),
      ...(parent !== undefined && { parent }),
    };

    if (req.file) {
      updateData.profilePicture = `/uploads/${req.file.filename}`;
    }

    const updated = await TeamNode.findByIdAndUpdate(req.params.id, updateData, { new: true });

    if (!updated) return res.status(404).json({ message: 'Team member not found' });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


module.exports = router;