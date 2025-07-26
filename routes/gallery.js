const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

/**
 * @route GET /getAllGallery
 * @desc Get all uploaded gallery images
 */
router.get("/getAllGallery", async (req, res) => {
  try {
    const galleryDir = path.join(__dirname, "../upload/gallery");

    if (!fs.existsSync(galleryDir)) {
      return res.status(404).json({ success: false, error: "Gallery folder not found." });
    }

    const files = fs.readdirSync(galleryDir);
    const imageFiles = files.filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file));

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const images = imageFiles.map(file => ({
      name: file,
      url: `${baseUrl}/uploads/gallery/${file}`,
    }));

    res.status(200).json({
      success: true,
      count: images.length,
      images,
    });
  } catch (error) {
    console.error("Error reading gallery folder:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;