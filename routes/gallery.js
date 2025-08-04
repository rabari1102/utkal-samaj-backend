const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

/**
 * @route GET /getAllGallery
 * @desc Get all uploaded gallery images
 */
router.get("/getAllGallery", async (req, res) => {
  try {
    const galleryDir = path.join(__dirname, "../upload/gallery");

    if (!fs.existsSync(galleryDir)) {
      return res
        .status(404)
        .json({ success: false, error: "Gallery folder not found." });
    }

    const files = fs.readdirSync(galleryDir);
    const imageFiles = files.filter((file) =>
      /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
    );

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const images = imageFiles.map((file) => ({
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

router.delete("/deleteGalleryPhoto/:filename", async (req, res) => {
  try {
    const { filename } = req.params;

    // Validate filename (security check)
    if (
      !filename ||
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\")
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid filename",
      });
    }

    const galleryDir = path.join(__dirname, "../upload/gallery");
    const filePath = path.join(galleryDir, filename);

    // Check if gallery directory exists
    if (!fs.existsSync(galleryDir)) {
      return res.status(404).json({
        success: false,
        error: "Gallery folder not found",
      });
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: "Photo not found",
      });
    }

    // Verify it's an image file
    if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(filename)) {
      return res.status(400).json({
        success: false,
        error: "Invalid file type",
      });
    }

    // Delete the file
    fs.unlinkSync(filePath);

    res.status(200).json({
      success: true,
      message: `Photo '${filename}' deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting photo:", error);
    res.status(500).json({
      success: false,
      error: "Server error while deleting photo",
    });
  }
});
module.exports = router;
