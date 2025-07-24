const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Get all gallery items
router.get("/getAllGallery", async (req, res) => {
  try {
    const galleryDir = path.join(__dirname, "../upload/gallery");

    if (!fs.existsSync(galleryDir)) {
      return res.status(404).json({ error: "Gallery folder not found." });
    }

    const files = fs.readdirSync(galleryDir);
    const imageFiles = files.filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file));
    
    const images = imageFiles.map(file => {
      return {
        name: file,
        url: `/images/gallery/${file}`,
      };
    });

    res.status(200).json({ count: images.length, images });
  } catch (error) {
    console.error("Error reading gallery folder:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;