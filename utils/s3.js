// utils/s3.js
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  GetBucketLocationCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const path = require("path");
const crypto = require("crypto");

/** ---- ENV ---- */
const BUCKET = process.env.S3_BUCKET;
if (!BUCKET) throw new Error("[s3] Missing env S3_BUCKET");

let REGION = process.env.AWS_REGION || "us-east-1"; // will be auto-corrected below
const SIGNED_TTL = Number(process.env.S3_SIGNED_URL_TTL || 900);
const DEFAULT_ACL = process.env.S3_OBJECT_ACL || "private"; // 'private' | 'public-read'

/** ---- INTERNAL CLIENT (rebuilt after region detection) ---- */
let s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/** ---- HELPERS ---- */
function ensureStringKey(key, where = "Key") {
  if (typeof key !== "string") {
    throw new Error(`[s3] ${where} must be a string. Got: ${typeof key}`);
  }
  const trimmed = key.trim();
  if (!trimmed) throw new Error(`[s3] ${where} cannot be empty`);
  return trimmed;
}

function makeKey(folder, filename) {
  const ext = filename ? path.extname(filename) : "";
  const id = crypto.randomUUID();
  return folder ? `${folder}/${id}${ext}` : `${id}${ext}`;
}

/** ---- PUBLIC API ---- */

/**
 * Call this ONCE at app startup (before first upload/get) to lock to the real bucket region.
 * Example:
 *   const { initS3 } = require("./utils/s3");
 *   initS3().catch(err => { console.error(err); process.exit(1); });
 */
async function initS3() {
  try {
    const loc = await s3.send(new GetBucketLocationCommand({ Bucket: BUCKET }));
    // us-east-1 returns null/"" LocationConstraint
    const detected = loc.LocationConstraint || "us-east-1";
    if (detected !== REGION) {
      REGION = detected;
      s3 = new S3Client({
        region: REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
      console.log(`[s3] Using bucket "${BUCKET}" in region "${REGION}"`);
    } else {
      console.log(`[s3] Bucket "${BUCKET}" region confirmed: "${REGION}"`);
    }
  } catch (e) {
    console.error(
      `[s3] Failed to resolve region for bucket "${BUCKET}". Check S3 permissions or bucket name.`,
      e?.name || e?.Code || e
    );
    throw e;
  }
}

async function uploadBuffer({
  buffer,
  contentType,
  folder,
  filename,
  acl = DEFAULT_ACL,
  metadata = {},
}) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("[s3] uploadBuffer: 'buffer' must be a Buffer");
  }
  const Key = makeKey(folder, filename);
  console.log(Key, "will be uploaded to S3");
  
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key,
    Body: buffer,
    ContentType: contentType || "application/octet-stream",
    ACL: acl,
    Metadata: metadata,
  });
  
  await s3.send(cmd);
  return { key: Key };
}

async function deleteObject(key) {
  key = ensureStringKey(key, "Key");
  const cmd = new DeleteObjectCommand({ Bucket: BUCKET, Key: key });
  await s3.send(cmd);
}

async function getSignedDownloadUrl(key) {
  key = ensureStringKey(key, "Key");
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: SIGNED_TTL });
}

function publicUrl(key) {
  key = ensureStringKey(key, "Key");
  if (process.env.S3_PUBLIC_BASE) return `${process.env.S3_PUBLIC_BASE}/${key}`;
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

module.exports = {
  initS3,
  uploadBuffer,
  deleteObject,
  getSignedDownloadUrl,
  publicUrl,
  getRegion: () => REGION,
  getBucket: () => BUCKET,
};
