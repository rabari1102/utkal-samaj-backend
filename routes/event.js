// routes/events.js
const express = require("express");
const mongoose = require("mongoose");
const { body, validationResult } = require("express-validator");

const Event = require("../models/Event");
const EventRegistration = require("../models/eventRegistration");
const { createPaymentOrder } = require("../services/paymentService");

// S3 helpers
const {
  getSignedDownloadUrl,
  publicUrl,
  deleteObject,
} = require("../utils/s3");

const router = express.Router();

// Config: decide signed vs public URLs
const ACL = process.env.S3_OBJECT_ACL || "private";
const USE_PUBLIC = ACL === "public-read";

// Helpers
async function keyToUrl(key) {
  if (!key || typeof key !== "string") return null;
  return USE_PUBLIC ? publicUrl(key) : await getSignedDownloadUrl(key);
}
async function keysToUrls(keys = []) {
  const out = [];
  for (const k of keys) out.push(await keyToUrl(k));
  return out;
}

// --- Helper: extract key from S3/CloudFront URL ---
function extractS3KeyFromUrl(inputUrl, opts = {}) {
  const { bucket, cloudfrontDomain } = opts;
  try {
    const u = new URL(inputUrl);
    // strip query & leading slash; decode in case of spaces etc.
    let pathname = decodeURIComponent(u.pathname || '');
    if (pathname.startsWith('/')) pathname = pathname.slice(1);

    const host = (u.host || '').toLowerCase();

    // CloudFront domain
    if (cloudfrontDomain && host === cloudfrontDomain.toLowerCase()) {
      return pathname;
    }

    // Virtual-hosted-style: <bucket>.s3.<region>.amazonaws.com/<key>
    if (bucket && host.startsWith(bucket.toLowerCase() + '.s3')) {
      return pathname;
    }

    // Path-style: s3.<region>.amazonaws.com/<bucket>/<key>
    if (host.includes('amazonaws.com')) {
      if (pathname.startsWith(bucket + '/')) {
        return pathname.slice(bucket.length + 1);
      }
      return pathname;
    }

    // Fallback (custom CDN, etc.)
    return pathname;
  } catch {
    return null;
  }
}


/**
 * @route GET /getAllEvents
 * @desc Get all events (latest first)
 */
router.get("/getAllEvents", async (_req, res) => {
  try {
    const events = await Event.find().sort({ eventDate: -1 });

    const data = await Promise.all(
      events.map(async (event) => ({
        ...event.toObject(),
        imageUrls: await keysToUrls(event.images || []),
      }))
    );

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * @route GET /past
 * @desc Get all past events (already occurred)
 */
router.get("/past", async (_req, res) => {
  try {
    const events = await Event.find({
      eventDate: { $lt: new Date() },
      isActive: true,
    }).sort({ eventDate: -1 });

    const data = await Promise.all(
      events.map(async (event) => ({
        ...event.toObject(),
        imageUrls: await keysToUrls(event.images || []),
      }))
    );

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Get past events error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * @route GET /getEventById/:id
 * @desc Get single event by ID
 */
router.get("/getEventById/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ success: false, error: "Event not found" });
    }

    const data = {
      ...event.toObject(),
      imageUrls: await keysToUrls(event.images || []),
    };

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error fetching event by ID:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * @route POST /:id/register
 * @desc Register user for an event
 */
router.post(
  "/:id/register",
  [
    body("participantName")
      .trim()
      .isLength({ min: 2 })
      .withMessage("Name required"),
    body("phoneNumber").isMobilePhone().withMessage("Invalid phone"),
    body("email").optional().isEmail().withMessage("Invalid email"),
    body("numberOfParticipants")
      .isInt({ min: 1, max: 10 })
      .withMessage("1–10 participants allowed"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { id } = req.params;
      const { participantName, phoneNumber, email, numberOfParticipants } =
        req.body;

      const event = await Event.findById(id);
      if (!event || !event.isActive) {
        return res
          .status(404)
          .json({ success: false, error: "Event not found" });
      }

      if (new Date(event.eventDate) < new Date()) {
        return res
          .status(400)
          .json({ success: false, error: "Event registration has ended" });
      }

      if (
        event.maxParticipants &&
        event.registeredCount + Number(numberOfParticipants) >
          event.maxParticipants
      ) {
        return res.status(400).json({ success: false, error: "Event is full" });
      }

      const registration = new EventRegistration({
        eventId: id,
        participantName,
        phoneNumber,
        email,
        numberOfParticipants,
      });

      if (event.paymentRequired && event.eventFee > 0) {
        const totalAmount = event.eventFee * Number(numberOfParticipants);

        const paymentOrder = await createPaymentOrder(
          totalAmount,
          `Event Registration - ${event.title}`
        );

        registration.paymentId = paymentOrder.id;
        registration.paymentStatus = "pending";
        await registration.save();

        return res.status(201).json({
          success: true,
          message: "Registration created. Please complete payment.",
          registrationId: registration._id,
          paymentOrder,
        });
      } else {
        registration.paymentStatus = "completed";
        await registration.save();

        event.registeredCount += Number(numberOfParticipants);
        await event.save();

        return res.status(201).json({
          success: true,
          message: "Registration successful",
          registrationId: registration._id,
        });
      }
    } catch (error) {
      console.error("Event registration error:", error);
      res.status(500).json({ success: false, error: "Server error" });
    }
  }
);

/**
 * @route DELETE /events/:id
 * @desc Delete an event and its S3 images
 */
router.delete("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid event ID" });
    }

    const event = await Event.findById(id);
    if (!event) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }

    // Delete associated S3 objects (best-effort)
    if (Array.isArray(event.images) && event.images.length > 0) {
      const deletions = event.images.map(async (key) => {
        try {
          await deleteObject(key);
        } catch (e) {
          console.warn(
            `[event:delete] Failed to delete S3 object "${key}":`,
            e?.message || e
          );
        }
      });
      await Promise.allSettled(deletions);
    }

    await Event.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error("Event deletion error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

// DELETE /events/:id/images
// Body: { "url": "https://<bucket>.s3.<region>.amazonaws.com/path/to/file.jpg?X-Amz-..." }

router.delete("/:id/images", async (req, res) => {
  try {
    const { id } = req.params;
    const { url } = req.body;
console.log(url);

    if (typeof url !== "string" || url.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "Image URL is required" });
    }

    const event = await Event.findById(id);
    if (!event) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }

    const key = extractS3KeyFromUrl(url, {
      bucket: process.env.S3_BUCKET,
    });

    if (!key) {
      return res
        .status(400)
        .json({ success: false, message: "Could not parse S3 key from URL" });
    }

    // 2) Best-effort delete on S3
    let s3Deleted = false;
    try {
      await deleteObject(key); // your existing helper
      s3Deleted = true;
    } catch (e) {
      console.warn(
        `[event:image:delete] Failed to delete S3 object "${key}":`,
        e?.message || e
      );
    }

    // 3) Remove from DB if stored (support either key or full URL being stored)
    //    If your Event schema has `images: string[]`
    const beforeCount = Array.isArray(event.images) ? event.images.length : 0;

    const updated = await Event.findByIdAndUpdate(
      id,
      { $pull: { images: { $in: [key, url] } } },
      { new: true }
    );

    const afterCount = Array.isArray(updated?.images)
      ? updated.images.length
      : beforeCount;
    const dbRemoved = afterCount < beforeCount;

    return res.status(200).json({
      success: true,
      message:
        dbRemoved || s3Deleted
          ? "Image deletion processed"
          : "Nothing changed (image not found in DB and S3 delete may have failed)",
      details: {
        s3Deleted,
        dbRemoved,
        key,
      },
      event: updated,
    });
  } catch (error) {
    console.error("Event image deletion error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

module.exports = router;
