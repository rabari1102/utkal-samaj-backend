const express = require('express');
const { getSignedUploadUrl } = require('../utils/s3');

const router = express.Router();

// GET /api/upload/presignedUrl
// Query params: folder (optional), filename (optional), contentType
router.get('/presignedUrl', async (req, res) => {
  try {
    const { folder = 'misc', filename = 'file.bin', contentType } = req.query;

    if (!contentType) {
      return res.status(400).json({ success: false, error: 'contentType query parameter is required' });
    }

    const { key, url } = await getSignedUploadUrl(folder, filename, contentType);

    res.json({
      success: true,
      data: {
        key,
        url,
      },
    });
  } catch (error) {
    console.error('[upload:presignedUrl] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate pre-signed URL' });
  }
});

module.exports = router;
