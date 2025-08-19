const express = require('express');
const { body, validationResult } = require('express-validator');
const Event = require('../models/Event');
const EventRegistration = require('../models/eventRegistration');
const { createPaymentOrder } = require('../services/paymentService');

const router = express.Router();

/**
 * Utility to generate full image URLs for an event
 */
const generateImageUrls = (req, images) => {
  // const baseUrl = `${req.protocol}://${req.get('host')}`;
    const baseUrl ='http://localhost:8080'
  return (images || []).map(imgPath =>
    `${baseUrl}/uploads/${imgPath.replace(/\\/g, '/')}`
  );
};

/**
 * @route GET /getAllEvents
 * @desc Get all events (latest first)
 */
router.get('/getAllEvents', async (req, res) => {
  try {
    const events = await Event.find().sort({ eventDate: -1 });

    const updatedEvents = events.map(event => ({
      ...event._doc,
      imageUrls: generateImageUrls(req, event.images),
    }));

    res.status(200).json({ success: true, data: updatedEvents });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route GET /past
 * @desc Get all past events (already occurred)
 */
router.get('/past', async (req, res) => {
  try {
    const events = await Event.find({
      eventDate: { $lt: new Date() },
      isActive: true,
    }).sort({ eventDate: -1 });

    const updatedEvents = events.map(event => ({
      ...event._doc,
      imageUrls: generateImageUrls(req, event.images),
    }));

    res.status(200).json({ success: true, data: updatedEvents });
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

    const eventData = {
      ...event._doc,
      imageUrls: generateImageUrls(req, event.images),
    };

    res.status(200).json({ success: true, data: eventData });
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
        event.registeredCount + numberOfParticipants > event.maxParticipants
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
        const totalAmount = event.eventFee * numberOfParticipants;

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

        event.registeredCount += numberOfParticipants;
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

router.delete("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Check if the event ID is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid event ID" 
      });
    }

    // Find the event to get image paths for deletion
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ 
        success: false, 
        message: "Event not found" 
      });
    }

    // Delete associated images from the file system
    if (event.images && event.images.length > 0) {
      const uploadDir = path.join(__dirname, '..', 'upload');
      event.images.forEach(imagePath => {
        const fullImagePath = path.join(uploadDir, imagePath);
        fs.unlink(fullImagePath, (err) => {
          if (err) {
            console.error(`Failed to delete image: ${fullImagePath}`, err);
            // Don't stop the process if an image fails to delete, just log the error
          }
        });
      });
    }

    // Delete the event from the database
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

module.exports = router;