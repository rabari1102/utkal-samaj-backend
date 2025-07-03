const express = require('express');
const Content = require('../models/Content');

const router = express.Router();

// Get content by section
router.get('/:section', async (req, res) => {
  try {
    const { section } = req.params;
    
    const content = await Content.findOne({ 
      section, 
      isActive: true 
    });

    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    res.json(content);
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all active content
router.get('/', async (req, res) => {
  try {
    const contents = await Content.find({ isActive: true })
      .sort({ section: 1 });

    res.json(contents);
  } catch (error) {
    console.error('Get all content error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;