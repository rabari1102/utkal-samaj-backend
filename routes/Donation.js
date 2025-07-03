const express = require('express');
const { body, validationResult } = require('express-validator');
const Donation = require('../models/Donation');
const { createPaymentOrder, verifyPayment } = require('../services/paymentService');
const { generateReceipt } = require('../services/reciptsService');
const { sendEmail } = require('../services/emailService');

const router = express.Router();

// Create donation
router.post('/', [
  body('donorName').trim().isLength({ min: 2 }),
  body('phoneNumber').isMobilePhone(),
  body('email').optional().isEmail(),
  body('amount').isFloat({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { donorName, phoneNumber, email, amount } = req.body;

    // Create payment order
    const paymentOrder = await createPaymentOrder(amount, 'Donation for Education');
    
    // Create donation record
    const donation = new Donation({
      donorName,
      phoneNumber,
      email,
      amount,
      paymentId: paymentOrder.id,
      paymentStatus: 'pending'
    });

    await donation.save();

    res.json({
      message: 'Donation created. Please complete payment.',
      donationId: donation._id,
      paymentOrder
    });
  } catch (error) {
    console.error('Donation creation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify payment and complete donation
router.post('/verify-payment', [
  body('paymentId').isString(),
  body('orderId').isString(),
  body('signature').isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { paymentId, orderId, signature } = req.body;

    // Verify payment with Razorpay
    const isValid = verifyPayment(paymentId, orderId, signature);
    
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Update donation status
    const donation = await Donation.findOne({ paymentId: orderId });
    if (!donation) {
      return res.status(404).json({ error: 'Donation not found' });
    }

    donation.paymentStatus = 'completed';
    await donation.save();

    // Generate receipt
    const receiptUrl = await generateReceipt(donation);
    donation.receiptUrl = receiptUrl;
    await donation.save();

    // Send receipt via email/SMS
    if (donation.email) {
      await sendEmail(
        donation.email,
        'Donation Receipt - Utkal Samaj',
        `Thank you for your donation of ₹${donation.amount}. Please find your receipt attached.`,
        receiptUrl
      );
    }

    res.json({
      message: 'Payment verified and donation completed',
      receiptUrl
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
