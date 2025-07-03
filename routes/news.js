const express = require('express');
const News = require('../models/news');

const router = express.Router();

// Get all news
router.get('/', async (req, res) => {
  try {
    const news = await News.find({ isActive: true })
      .sort({ createdAt: -1 });

    res.json(news);
  } catch (error) {
    console.error('Get news error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get upcoming news/events
router.get('/upcoming', async (req, res) => {
  try {
    const upcomingNews = await News.find({ 
      isUpcoming: true, 
      isActive: true 
    })
    .sort({ eventDate: 1 });

    res.json(upcomingNews);
  } catch (error) {
    console.error('Get upcoming news error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get past news/events
router.get('/past', async (req, res) => {
  try {
    const pastNews = await News.find({ 
      isUpcoming: false, 
      isActive: true 
    })
    .sort({ createdAt: -1 });

    res.json(pastNews);
  } catch (error) {
    console.error('Get past news error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;