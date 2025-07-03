const express = require('express');
const Gallery = require('../models/Gallery');

const router = express.Router();

// Get all gallery items
router.get('/', async (req, res) => {
  try {
    const galleries = await Gallery.find({ isActive: true })
      .sort({ eventDate: -1 });

    res.json(galleries);
  } catch (error) {
    console.error('Get gallery error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get gallery by event
router.get('/event/:eventName', async (req, res) => {
  try {
    const { eventName } = req.params;
    
    const galleries = await Gallery.find({ 
      eventName: new RegExp(eventName, 'i'), 
      isActive: true 
    })
    .sort({ eventDate: -1 });

    res.json(galleries);
  } catch (error) {
    console.error('Get gallery by event error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get random photos for slider
router.get('/slider', async (req, res) => {
  try {
    const galleries = await Gallery.find({ isActive: true });
    
    // Extract all images from all galleries
    const allImages = [];
    galleries.forEach(gallery => {
      gallery.images.forEach(image => {
        allImages.push({
          ...image,
          eventName: gallery.eventName,
          eventDate: gallery.eventDate
        });
      });
    });

    // Shuffle and return random 10 images
    const shuffled = allImages.sort(() => 0.5 - Math.random());
    const sliderImages = shuffled.slice(0, 10);

    res.json(sliderImages);
  } catch (error) {
    console.error('Get slider images error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;