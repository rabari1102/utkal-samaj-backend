const express = require('express');
const { body, validationResult } = require('express-validator');
const fs = require('fs/promises'); // Import fs promises for async file operations
const Donation = require('../models/Donation');
const { createPaymentOrder, verifyPayment } = require('../services/paymentService');
const { generateReceipt } = require('../services/reciptsService');
const { sendEmail } = require('../services/emailService');

const router = express.Router();

// Create donation - Step 1: Create Order & Initial Record
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

    // 1. Create payment order with Razorpay
    const paymentOrder = await createPaymentOrder(amount, 'Donation for Education');
    
    // 2. Create donation record with 'pending' status.
    // This immediately stores the donor's name, phone, email, and amount.
    const donation = new Donation({
      donorName,
      phoneNumber,
      email,
      amount,
      paymentId: paymentOrder.id, // Stores the Razorpay Order ID
      paymentStatus: 'pending'
    });

    await donation.save(); // Record is saved here

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

// Verify payment and complete donation - Step 2: Verify and Fulfill
router.post('/verify-payment', [
  body('paymentId').isString(), // Razorpay Payment ID
  body('orderId').isString(),   // Razorpay Order ID
  body('signature').isString()
], async (req, res) => {
  const { paymentId, orderId, signature } = req.body;
  let receiptFilePath = null;
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // 1. Verify payment with Razorpay
    const isValid = verifyPayment(paymentId, orderId, signature);
    
    if (!isValid) {
      // If verification fails, you could optionally update status to 'failed'
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // 2. Retrieve and Update donation status
    // Searches by orderId (which is stored in the paymentId field of the Donation model)
    const donation = await Donation.findOne({ paymentId: orderId });
    if (!donation) {
      return res.status(404).json({ error: 'Donation not found' });
    }

    if (donation.paymentStatus === 'completed') {
       return res.json({
          message: 'Payment already verified and donation completed',
          receiptUrl: donation.receiptUrl,
       });
    }

    // Update status to completed (this is the key record update)
    donation.paymentStatus = 'completed';
    // The pre-save hook in Donation.js sets nextReminderDate here
    await donation.save(); 

    // 3. Generate receipt, read file, and store path
    receiptFilePath = await generateReceipt(donation); 
    const pdfBuffer = await fs.readFile(receiptFilePath); // Read the generated file content

    // Store the local path for reference
    donation.receiptUrl = receiptFilePath; 
    await donation.save();

    // 4. Send receipt via email
    if (donation.email) {
      const emailHtml = `
        <p>Dear ${donation.donorName},</p>
        <p>Thank you for your generous donation of <strong>₹${donation.amount}</strong> to Utkal Samaj. Your contribution directly supports children's education.</p>
        <p>Please find your official donation receipt attached to this email.</p>
        <p>Best Regards,<br/>Utkal Samaj Team</p>
      `;
      
      const emailText = `Thank you for your donation of ₹${donation.amount}. Please find your receipt attached.`;
      
      await sendEmail(
        donation.email,
        'Donation Receipt - Utkal Samaj',
        emailHtml,
        emailText,
        [
          {
            filename: `Receipt_${donation._id}.pdf`,
            content: pdfBuffer, // Send the PDF Buffer as an attachment
            contentType: 'application/pdf',
          },
        ]
      );
    }
    
    res.json({
      message: 'Payment verified and donation completed',
      receiptUrl: `Receipt generated and sent via email for Order ID: ${orderId}`
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    // 5. Clean up local file (best effort)
    if (receiptFilePath) {
      try {
        await fs.unlink(receiptFilePath);
        console.log(`[Donation] Cleaned up local receipt file: ${receiptFilePath}`);
      } catch (e) {
        console.warn(`[Donation] Failed to clean up local receipt file: ${receiptFilePath}`, e.message);
      }
    }
  }
});

module.exports = router;