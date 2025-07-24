// File: utils/upload.js

const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * Creates a Multer upload middleware for a specific subfolder.
 * @param {string} subfolder - The name of the subfolder inside './upload' where files will be stored.
 * @returns {multer.Instance} - The configured Multer instance.
 */
const createUploader = (subfolder) => {
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadPath = path.join(__dirname, '../upload', subfolder);
      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, `file-${uniqueSuffix}${ext}`);
    }
  });

  const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  };

  return multer({ storage, fileFilter });
};

module.exports = createUploader;