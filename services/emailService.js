const nodemailer = require("nodemailer");

// Ensure SMTP credentials exist
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.error("❌ Missing EMAIL_USER or EMAIL_PASS in environment variables.");
}

// Correct: createTransport
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Generic Email Sending Function
 */
const sendEmail = async (
  to,
  subject,
  htmlContent,
  textContent,
  attachments = []
) => {
  try {
    if (!to) {
      console.error("❌ Email 'to' field missing");
      throw new Error("Recipient email address required");
    }

    const mailOptions = {
      from: {
        name: "Utkal Samaj",
        address: process.env.EMAIL_USER,
      },
      to,
      subject,
      text: textContent,
      html: htmlContent,
      attachments,
    };

    console.log(`📧 Sending email to: ${to}`);

    // IMPORTANT: Use await!
    const result = await transporter.sendMail(mailOptions);

    console.log("📨 Email sent successfully. Message ID:", result.messageId);

    return {
      success: true,
      messageId: result.messageId,
      response: result.response,
    };
  } catch (error) {
    console.error("❌ Email sending error:", error);

    // Throw controlled error for API routes
    throw new Error("Failed to send email");
  }
};

/**
 * OTP Email Function
 */
const sendOTP = async (email, otp, user = {}) => {
  const subject = "🔐 Your Utkal Samaj Login OTP";

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width:600px; margin:auto;">
      <div style="background:#667eea; color:white; padding:20px; border-radius:10px 10px 0 0;">
        <h2 style="margin:0;">🏛️ Utkal Samaj</h2>
        <p style="margin:5px 0 0;">One-Time Password (OTP) for Login</p>
      </div>

      <div style="background:white; padding:25px; border-radius:0 0 10px 10px;">
        <p>Hello <strong>${user.firstName || "User"}</strong>,</p>
        <p>Please use the OTP below to log in:</p>

        <div style="margin:20px auto; padding:15px; background:#f1f3f5; border-left:4px solid #667eea; text-align:center;">
          <h1 style="letter-spacing:5px;">${otp}</h1>
          <p>This OTP is valid for <strong>5 minutes</strong>.</p>
        </div>

        <p>If you did not request this OTP, please ignore this email.</p>

        <hr />
        <p style="font-size:12px; text-align:center; color:#777;">
          Utkal Samaj Management System<br/>
          Sent on: ${new Date().toLocaleString()}
        </p>
      </div>
    </div>
  `;

  const textContent = `
Utkal Samaj - OTP for Login

Hello ${user.firstName || "User"},

Your OTP is: ${otp}
Valid for 5 minutes.

If you did not request this, please ignore this message.

Utkal Samaj Management System
Sent on: ${new Date().toLocaleString()}
`;

  return await sendEmail(email, subject, htmlContent, textContent);
};

module.exports = { sendEmail, sendOTP };
