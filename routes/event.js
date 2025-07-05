// const express = require('express');
// const { body, validationResult } = require('express-validator');
// const Event = require('../models/Event');
// const EventRegistration = require('../models/eventRegistration');
// const { createPaymentOrder } = require('../services/paymentService');

// const router = express.Router();

// // Get all upcoming events
// router.get('/upcoming', async (req, res) => {
//   try {
//     const events = await Event.find({ 
//       eventDate: { $gte: new Date() },
//       isActive: true 
//     })
//     .sort({ eventDate: 1 });

//     res.json(events);
//   } catch (error) {
//     console.error('Get upcoming events error:', error);
//     res.status(500).json({ error: 'Server error' });
//   }
// });

// // Get all past events
// router.get('/past', async (req, res) => {
//   try {
//     const events = await Event.find({ 
//       eventDate: { $lt: new Date() },
//       isActive: true 
//     })
//     .sort({ eventDate: -1 });

//     res.json(events);
//   } catch (error) {
//     console.error('Get past events error:', error);
//     res.status(500).json({ error: 'Server error' });
//   }
// });

// // Get event by ID
// router.get('/:id', async (req, res) => {
//   try {
//     const event = await Event.findById(req.params.id);
    
//     if (!event || !event.isActive) {
//       return res.status(404).json({ error: 'Event not found' });
//     }

//     res.json(event);
//   } catch (error) {
//     console.error('Get event error:', error);
//     res.status(500).json({ error: 'Server error' });
//   }
// });

// // Register for event
// router.post('/:id/register', [
//   body('participantName').trim().isLength({ min: 2 }),
//   body('phoneNumber').isMobilePhone(),
//   body('email').optional().isEmail(),
//   body('numberOfParticipants').isInt({ min: 1, max: 10 })
// ], async (req, res) => {
//   try {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ errors: errors.array() });
//     }

//     const { id } = req.params;
//     const { participantName, phoneNumber, email, numberOfParticipants } = req.body;

//     const event = await Event.findById(id);
//     if (!event || !event.isActive) {
//       return res.status(404).json({ error: 'Event not found' });
//     }

//     if (event.eventDate < new Date()) {
//       return res.status(400).json({ error: 'Event registration has ended' });
//     }

//     if (event.maxParticipants && 
//         event.registeredCount + numberOfParticipants > event.maxParticipants) {
//       return res.status(400).json({ error: 'Event is full' });
//     }

//     const registration = new EventRegistration({
//       eventId: id,
//       participantName,
//       phoneNumber,
//       email,
//       numberOfParticipants
//     });

//     if (event.paymentRequired && event.eventFee > 0) {
//       const totalAmount = event.eventFee * numberOfParticipants;
//       const paymentOrder = await createPaymentOrder(totalAmount, `Event Registration - ${event.title}`);
      
//       registration.paymentId = paymentOrder.id;
//       registration.paymentStatus = 'pending';
      
//       await registration.save();
      
//       res.json({
//         message: 'Registration created. Please complete payment.',
//         registrationId: registration._id,
//         paymentOrder
//       });
//     } else {
//       registration.paymentStatus = 'completed';
//       await registration.save();
      
//       // Update event registered count
//       event.registeredCount += numberOfParticipants;
//       await event.save();
      
//       res.json({
//         message: 'Registration successful',
//         registrationId: registration._id
//       });
//     }
//   } catch (error) {
//     console.error('Event registration error:', error);
//     res.status(500).json({ error: 'Server error' });
//   }
// });

// module.exports = router;