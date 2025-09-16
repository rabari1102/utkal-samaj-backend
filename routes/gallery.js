const express = require("express");
const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { s3: s3FromUtils, getSignedDownloadUrl, publicUrl } = require("../utils/s3");

const router = express.Router();

const BUCKET = process.env.S3_BUCKET;
const ACL = process.env.S3_OBJECT_ACL || "private";
const USE_PUBLIC = ACL === "public-read";
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";

const s3 = s3FromUtils || new S3Client({ region: REGION });

async function keyToUrl(key) {
  if (!key) return null;
  return USE_PUBLIC ? publicUrl(key) : await getSignedDownloadUrl(key);
}

function limitConcurrency(concurrency) {
  let running = 0;
  const queue = [];
  const run = async (fn, resolve, reject) => {
    running++;
    try {
      const result = await fn();
      resolve(result);
    } catch (e) {
      reject(e);
    } finally {
      running--;
      if (queue.length) {
        const next = queue.shift();
        run(next.fn, next.resolve, next.reject);
      }
    }
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      if (running < concurrency) run(fn, resolve, reject);
      else queue.push({ fn, resolve, reject });
    });
}

router.get("/getAllGallery", async (req, res) => {
  try {
    const { prefix = "gallery/", token, sortBy = "lastModified", order = "desc" } = req.query;
    let limit = Number(req.query.limit ?? 60);
    if (!Number.isFinite(limit) || limit < 1) limit = 60;
    if (limit > 1000) limit = 1000;

    const cmd = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: String(prefix),
      MaxKeys: limit,
      ContinuationToken: token ? String(token) : undefined,
    });

    const response = await s3.send(cmd);
    const contents = Array.isArray(response.Contents) ? response.Contents : [];

    const isImageKey = (k) => /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(k);
    const throttle = limitConcurrency(10);

    const items = await Promise.all(
      contents
        .filter((obj) => obj && obj.Key && isImageKey(obj.Key))
        .map((obj) =>
          throttle(async () => {
            const key = obj.Key;
            const url = await keyToUrl(key);
            return {
              name: key.startsWith(prefix) ? key.slice(prefix.length) : key,
              key,
              url,
              size: obj.Size ?? 0,
              lastModified: obj.LastModified ?? null,
            };
          })
        )
    );

    const compare =
      {
        name: (a, b) => a.name.localeCompare(b.name),
        size: (a, b) => (a.size || 0) - (b.size || 0),
        lastModified: (a, b) => new Date(a.lastModified || 0) - new Date(b.lastModified || 0),
      }[sortBy] || ((a, b) => new Date(a.lastModified || 0) - new Date(b.lastModified || 0));

    items.sort(compare);
    if (String(order).toLowerCase() === "desc") items.reverse();

    return res.status(200).json({
      success: true,
      prefix,
      count: items.length,
      nextToken: response.IsTruncated ? response.NextContinuationToken : null,
      images: items,
    });
  } catch (error) {
    console.error("[gallery:getAll] Error:", error);
    return res.status(500).json({ success: false, error: "Server error", message: error?.message });
  }
});

router.delete("/deleteGalleryPhoto/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    if (!filename || filename.includes("..") || filename.includes("/")) {
      return res.status(400).json({ success: false, error: "Invalid filename" });
    }

    const key = `gallery/${filename}`;
    const command = new DeleteObjectCommand({ Bucket: BUCKET, Key: key });
    await s3.send(command);

    return res.status(200).json({
      success: true,
      message: `Photo '${filename}' deleted successfully from gallery`,
    });
  } catch (error) {
    console.error("[gallery:delete] Error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error while deleting photo",
      message: error?.message,
    });
  }
});

module.exports = router;
