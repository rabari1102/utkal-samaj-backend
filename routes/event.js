// routes/events.js
const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');

const Event = require('../models/Event');
const EventRegistration = require('../models/eventRegistration');
const { createPaymentOrder } = require('../services/paymentService');

// S3 helpers
const { getSignedDownloadUrl, publicUrl, deleteObject } = require('../utils/s3');

const router = express.Router();

// Config: decide signed vs public URLs
const ACL = process.env.S3_OBJECT_ACL || 'private';
const USE_PUBLIC = ACL === 'public-read';

// Helpers
async function keyToUrl(key) {
  if (!key || typeof key !== 'string') return null;
  return USE_PUBLIC ? publicUrl(key) : await getSignedDownloadUrl(key);
}
async function keysToUrls(keys = []) {
  const out = [];
  for (const k of keys) out.push(await keyToUrl(k));
  return out;
}

/**
 * @route GET /getAllEvents
 * @desc Get all events (latest first)
 */
router.get('/getAllEvents', async (_req, res) => {
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
    console.error('Error fetching events:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route GET /past
 * @desc Get all past events (already occurred)
 */
router.get('/past', async (_req, res) => {
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
    console.error('Get past events error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route GET /getEventById/:id
 * @desc Get single event by ID
 */
router.get('/getEventById/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const data = {
      ...event.toObject(),
      imageUrls: await keysToUrls(event.images || []),
    };

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error fetching event by ID:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route POST /:id/register
 * @desc Register user for an event
 */
router.post(
  '/:id/register',
  [
    body('participantName').trim().isLength({ min: 2 }).withMessage('Name required'),
    body('phoneNumber').isMobilePhone().withMessage('Invalid phone'),
    body('email').optional().isEmail().withMessage('Invalid email'),
    body('numberOfParticipants')
      .isInt({ min: 1, max: 10 })
      .withMessage('1–10 participants allowed'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { id } = req.params;
      const { participantName, phoneNumber, email, numberOfParticipants } = req.body;

      const event = await Event.findById(id);
      if (!event || !event.isActive) {
        return res.status(404).json({ success: false, error: 'Event not found' });
      }

      if (new Date(event.eventDate) < new Date()) {
        return res.status(400).json({ success: false, error: 'Event registration has ended' });
      }

      if (
        event.maxParticipants &&
        event.registeredCount + Number(numberOfParticipants) > event.maxParticipants
      ) {
        return res.status(400).json({ success: false, error: 'Event is full' });
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
        registration.paymentStatus = 'pending';
        await registration.save();

        return res.status(201).json({
          success: true,
          message: 'Registration created. Please complete payment.',
          registrationId: registration._id,
          paymentOrder,
        });
      } else {
        registration.paymentStatus = 'completed';
        await registration.save();

        event.registeredCount += Number(numberOfParticipants);
        await event.save();

        return res.status(201).json({
          success: true,
          message: 'Registration successful',
          registrationId: registration._id,
        });
      }
    } catch (error) {
      console.error('Event registration error:', error);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
);

/**
 * @route DELETE /events/:id
 * @desc Delete an event and its S3 images
 */
router.delete('/events/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid event ID' });
    }

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    // Delete associated S3 objects (best-effort)
    if (Array.isArray(event.images) && event.images.length > 0) {
      const deletions = event.images.map(async (key) => {
        try {
          await deleteObject(key);
        } catch (e) {
          console.warn(`[event:delete] Failed to delete S3 object "${key}":`, e?.message || e);
        }
      });
      await Promise.allSettled(deletions);
    }

    await Event.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Event deleted successfully',
    });
  } catch (error) {
    console.error('Event deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
});

module.exports = router;