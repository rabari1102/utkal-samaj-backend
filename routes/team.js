const express = require('express');
const Team = require('../models/Team');

const router = express.Router();

// Get team by category
router.get('/:category', async (req, res) => {
  try {
    const { category } = req.params;
    
    const teams = await Team.find({ 
      category, 
      isActive: true 
    })
    .sort({ position: 1, name: 1 });

    res.json(teams);
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all teams
router.get('/', async (req, res) => {
  try {
    const teams = await Team.find({ isActive: true })
      .sort({ category: 1, position: 1, name: 1 });

    // Group by category
    const groupedTeams = teams.reduce((acc, team) => {
      if (!acc[team.category]) {
        acc[team.category] = [];
      }
      acc[team.category].push(team);
      return acc;
    }, {});

    res.json(groupedTeams);
  } catch (error) {
    console.error('Get all teams error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;