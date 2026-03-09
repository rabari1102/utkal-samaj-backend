const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay client once using environment variables
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

/**
 * Creates a new payment order with Razorpay.
 * @param {number} amount - The amount in rupees.
 * @param {string} description - The description for the payment.
 * @returns {Promise<object>} The Razorpay order object.
 */
const createPaymentOrder = async (amount, description) => {
  try {
    // Razorpay expects amount in paise, and it must be an integer
    const amountInPaise = Math.round(amount * 100); 

    const options = {
      amount: amountInPaise, 
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      notes: {
        description
      }
    };

    // Use the initialized client to create the order
    const order = await razorpay.orders.create(options);
    return order;
  } catch (error) {
    console.error('Payment order creation error:', error);
    // Include specific error details from Razorpay if available
    throw new Error(`Failed to create payment order: ${error.error?.description || error.message}`);
  }
};

/**
 * Verifies the Razorpay payment signature.
 * @param {string} paymentId - The Razorpay payment ID.
 * @param {string} orderId - The Razorpay order ID.
 * @param {string} signature - The received signature from Razorpay.
 * @returns {boolean} True if the signature is valid, false otherwise.
 */
const verifyPayment = (paymentId, orderId, signature) => {
  try {
    // String to be hashed is orderId + '|' + paymentId
    const text = orderId + '|' + paymentId;
    
    // Hash the string using the secret key
    const generated_signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(text)
      .digest('hex');

    // Compare the generated signature with the one received from Razorpay
    return generated_signature === signature;
  } catch (error) {
    console.error('Payment verification error:', error);
    return false;
  }
};

module.exports = { createPaymentOrder, verifyPayment };