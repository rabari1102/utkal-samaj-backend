const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Content = require('../models/Content');
const Event = require('../models/Event');
const Team = require('../models/Team');
const Gallery = require('../models/Gallery');
const News = require('../models/news');
const Achievement = require('../models/Achivments');
const { adminAuth } = require('../middlewares/auth');
const { uploadSingle } = require('../services/uploadService');

const router = express.Router();

// Get pending user approvals
router.get('/pending-users', async (req, res) => {
  try {
    const pendingUsers = await User.find({ isApproved: false, isActive: true })
      .select('-__v')
      .sort({ createdAt: -1 });
    
    res.json(pendingUsers);
  } catch (error) {
    console.error('Get pending users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Approve/reject user
router.put('/users/:id/approval', [
  body('isApproved').isBoolean(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { isApproved } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.isApproved = isApproved;
    await user.save();

    res.json({ 
      message: `User ${isApproved ? 'approved' : 'rejected'} successfully`,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        isApproved: user.isApproved
      }
    });
  } catch (error) {
    console.error('User approval error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Content management
router.put('/content/:section', adminAuth, uploadSingle, [
  body('title').optional().isString(),
  body('content').isString(),
  body('link').optional().isURL()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { section } = req.params;
    const { title, content, link } = req.body;

    let updateData = { content };
    if (title) updateData.title = title;
    if (link) updateData.link = link;
    if (req.file) updateData.image = req.file.path;

    const updatedContent = await Content.findOneAndUpdate(
      { section },
      { ...updateData, updatedAt: Date.now() },
      { new: true, upsert: true }
    );

    res.json(updatedContent);
  } catch (error) {
    console.error('Content update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Event management
router.post('/events', adminAuth, uploadSingle, [
  body('title').trim().isLength({ min: 3 }),
  body('description').trim().isLength({ min: 10 }),
  body('eventDate').isISO8601(),
  body('location').trim().isLength({ min: 3 }),
  body('registrationRequired').optional().isBoolean(),
  body('paymentRequired').optional().isBoolean(),
  body('eventFee').optional().isNumeric()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const eventData = { ...req.body };
    if (req.file) eventData.image = req.file.path;

    const event = new Event(eventData);
    await event.save();

    res.status(201).json(event);
  } catch (error) {
    console.error('Event creation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Team management
router.post('/team', adminAuth, uploadSingle, [
  body('category').isIn(['school', 'dharamshala', 'temple', 'core']),
  body('name').trim().isLength({ min: 2 }),
  body('position').trim().isLength({ min: 2 }),
  body('description').optional().isString(),
  body('operations').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const teamData = { ...req.body };
    if (req.file) teamData.image = req.file.path;

    const teamMember = new Team(teamData);
    await teamMember.save();

    res.status(201).json(teamMember);
  } catch (error) {
    console.error('Team creation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Gallery management
router.post('/gallery', adminAuth, uploadSingle, [
  body('eventName').trim().isLength({ min: 3 }),
  body('eventDate').isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { eventName, eventDate } = req.body;
    
    let gallery = await Gallery.findOne({ eventName, eventDate });
    
    if (gallery) {
      if (req.file) {
        gallery.images.push({ url: req.file.path, caption: '' });
        await gallery.save();
      }
    } else {
      gallery = new Gallery({
        eventName,
        eventDate,
        images: req.file ? [{ url: req.file.path, caption: '' }] : []
      });
      await gallery.save();
    }

    res.json(gallery);
  } catch (error) {
    console.error('Gallery creation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// News management
router.post('/news', adminAuth, uploadSingle, [
  body('title').trim().isLength({ min: 3 }),
  body('content').trim().isLength({ min: 10 }),
  body('isUpcoming').optional().isBoolean(),
  body('registrationLink').optional().isURL()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const newsData = { ...req.body };
    if (req.file) newsData.image = req.file.path;

    const news = new News(newsData);
    await news.save();

    res.status(201).json(news);
  } catch (error) {
    console.error('News creation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Achievement management
router.post('/achievements', adminAuth, uploadSingle, [
  body('title').trim().isLength({ min: 3 }),
  body('description').trim().isLength({ min: 10 }),
  body('achievementDate').isISO8601(),
  body('category').optional().isIn(['award', 'recognition', 'milestone', 'other'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const achievementData = { ...req.body };
    if (req.file) achievementData.image = req.file.path;

    const achievement = new Achievement(achievementData);
    await achievement.save();

    res.status(201).json(achievement);
  } catch (error) {
    console.error('Achievement creation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
