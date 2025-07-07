const nodemailer = require('nodemailer');

// Create transporter with your email service configuration
const createTransporter = () => {
  return nodemailer.createTransporter({
    service: 'gmail', // or 'outlook', 'yahoo', etc.
    auth: {
      user: process.env.EMAIL_USER, // Your email address
      pass: process.env.EMAIL_PASSWORD // Your email password or app-specific password
    }
  });
};

// Alternative configuration for other SMTP services
const createCustomTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST, // e.g., 'smtp.gmail.com'
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
};

const sendEmail = async (to, subject, htmlContent, textContent) => {
  try {
    if (!process.env.EMAIL_USER) {
      console.log('Email would be sent:', { to, subject, htmlContent });
      return { success: true, message: 'Email simulation' };
    }

    const transporter = createTransporter();
    
    const mailOptions = {
      from: {
        name: 'Utkal Samaj',
        address: process.env.EMAIL_USER
      },
      to: to,
      subject: subject,
      text: textContent,
      html: htmlContent
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(result,"resultresultresult");
    
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Email sending error:', error);
    throw new Error('Failed to send email');
  }
};

const sendOTP = async (email, otp) => {
  const subject = 'Your Utkal Samaj Login OTP';
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; text-align: center;">
        <h2 style="color: #333; margin-bottom: 20px;">Utkal Samaj</h2>
        <h3 style="color: #555; margin-bottom: 30px;">Login Verification</h3>
        
        <div style="background-color: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <p style="font-size: 16px; color: #666; margin-bottom: 20px;">
            Your One-Time Password (OTP) for login is:
          </p>
          
          <div style="background-color: #007bff; color: white; font-size: 32px; font-weight: bold; padding: 15px 30px; border-radius: 5px; letter-spacing: 5px; margin: 20px 0;">
            ${otp}
          </div>
          
          <p style="font-size: 14px; color: #999; margin-top: 20px;">
            This OTP is valid for <strong>5 minutes</strong> only.
          </p>
          
          <p style="font-size: 12px; color: #999; margin-top: 30px;">
            If you didn't request this OTP, please ignore this email.
          </p>
        </div>
      </div>
    </div>
  `;
  
  const textContent = `
    Utkal Samaj - Login Verification
    
    Your OTP for Utkal Samaj login is: ${otp}
    
    This OTP is valid for 5 minutes only.
    
    If you didn't request this OTP, please ignore this email.
  `;

  return await sendEmail(email, subject, htmlContent, textContent);
};

module.exports = { sendEmail, sendOTP };