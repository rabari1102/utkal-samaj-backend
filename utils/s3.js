// s3.js
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');
const crypto = require('crypto');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.S3_BUCKET;
const SIGNED_TTL = Number(process.env.S3_SIGNED_URL_TTL || 900);

function makeKey(folder, filename) {
  const ext = filename ? path.extname(filename) : '';
  const id = crypto.randomUUID();
  return folder ? `${folder}/${id}${ext}` : `${id}${ext}`;
}

async function uploadBuffer({ buffer, contentType, folder, filename, acl = 'private', metadata = {} }) {
  const Key = makeKey(folder, filename);
  console.log(Key, "KeyKey");
  
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key,
    Body: buffer,
    ContentType: contentType,
    ACL: acl, // 'private' (recommended) or 'public-read'
    Metadata: metadata,
  });
  await s3.send(cmd);
  return { key: Key };
}

async function deleteObject(key) {
  if (!key) return;
  const cmd = new DeleteObjectCommand({ Bucket: BUCKET, Key: key });
  await s3.send(cmd);
}

async function getSignedDownloadUrl(key) {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: SIGNED_TTL });
}

function publicUrl(key) {
  // Works only if the object is publicly readable
  // Prefer using S3_PUBLIC_BASE if you set it
  if (process.env.S3_PUBLIC_BASE) return `${process.env.S3_PUBLIC_BASE}/${key}`;
  // Fallback: construct from bucket + region
  const region = process.env.AWS_REGION;
  return `https://${BUCKET}.s3.${region}.amazonaws.com/${key}`;
}

module.exports = {
  uploadBuffer,
  deleteObject,
  getSignedDownloadUrl,
  publicUrl,
};
