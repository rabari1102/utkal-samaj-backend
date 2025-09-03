const express = require("express");
const {
  ListObjectsV2Command,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const {
  getSignedUrl,
} = require("@aws-sdk/s3-request-presigner");
const { s3, getSignedDownloadUrl, publicUrl } = require("../utils/s3");

const router = express.Router();

const BUCKET = process.env.S3_BUCKET;
const ACL = process.env.S3_OBJECT_ACL || "private"; // 'private' or 'public-read'
const USE_PUBLIC = ACL === "public-read";

/**
 * @route GET /getAllGallery
 * @desc List all gallery images from S3
 */
router.get("/getAllGallery", async (req, res) => {
  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: "gallery/", // only gallery folder
    });

    const response = await s3.send(command);

    const contents = response.Contents || [];
    const images = await Promise.all(
      contents
        .filter((obj) => /\.(jpg|jpeg|png|gif|webp)$/i.test(obj.Key))
        .map(async (obj) => {
          const url = USE_PUBLIC
            ? publicUrl(obj.Key)
            : await getSignedDownloadUrl(obj.Key);
          return {
            name: obj.Key.replace("gallery/", ""), // filename only
            key: obj.Key,
            url,
            size: obj.Size,
            lastModified: obj.LastModified,
          };
        })
    );

    res.status(200).json({
      success: true,
      count: images.length,
      images,
    });
  } catch (error) {
    console.error("[gallery:getAll] Error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * @route DELETE /deleteGalleryPhoto/:filename
 * @desc Delete a gallery photo from S3
 */
router.delete("/deleteGalleryPhoto/:filename", async (req, res) => {
  try {
    const { filename } = req.params;

    // security check
    if (!filename || filename.includes("..") || filename.includes("/")) {
      return res.status(400).json({
        success: false,
        error: "Invalid filename",
      });
    }

    const key = `gallery/${filename}`;

    const command = new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });

    await s3.send(command);

    res.status(200).json({
      success: true,
      message: `Photo '${filename}' deleted successfully from gallery`,
    });
  } catch (error) {
    console.error("[gallery:delete] Error:", error);
    res.status(500).json({
      success: false,
      error: "Server error while deleting photo",
    });
  }
});

module.exports = router;
