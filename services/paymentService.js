// const Razorpay = require('razorpay');
// const crypto = require('crypto');

// // const razorpay = new Razorpay({
// //   key_id: process.env.RAZORPAY_KEY_ID,
// //   key_secret: process.env.RAZORPAY_KEY_SECRET
// // });

// const createPaymentOrder = async (amount, description) => {
//   try {
//     const options = {
//       amount: amount * 100, // Razorpay expects amount in paise
//       currency: 'INR',
//       receipt: `receipt_${Date.now()}`,
//       notes: {
//         description
//       }
//     };

//     const order = await razorpay.orders.create(options);
//     return order;
//   } catch (error) {
//     console.error('Payment order creation error:', error);
//     throw new Error('Failed to create payment order');
//   }
// };

// const verifyPayment = (paymentId, orderId, signature) => {
//   try {
//     const text = orderId + '|' + paymentId;
//     const generated_signature = crypto
//       .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
//       .update(text)
//       .digest('hex');

//     return generated_signature === signature;
//   } catch (error) {
//     console.error('Payment verification error:', error);
//     return false;
//   }
// };

// module.exports = { createPaymentOrder, verifyPayment };