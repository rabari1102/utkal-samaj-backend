const nodemailer = require('nodemailer');

// Correct method name: createTransport (not createTransporter)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendEmail = async (to, subject, text, attachmentPath = null) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      text
    };

    if (attachmentPath) {
      mailOptions.attachments = [{
        filename: 'receipt.pdf',
        path: attachmentPath
      }];
    }

    const result = await transporter.sendMail(mailOptions);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Email sending error:', error);
    throw new Error('Failed to send email');
  }
};

// OTP sending function using your existing email service
const sendOTP = async (email, otp) => {
  const subject = 'Your Utkal Samaj Login OTP';
  const text = `Your OTP for Utkal Samaj login is: ${otp}. Valid for 5 minutes.
  
If you didn't request this OTP, please ignore this email.`;

  return await sendEmail(email, subject, text);
};

module.exports = { sendEmail, sendOTP };