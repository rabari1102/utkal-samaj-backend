const nodemailer = require("nodemailer");

// Correct method name: createTransport (not createTransporter)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async (
  to,
  subject,
  htmlContent,
  textContent,
  attachments = []
) => {
  try {
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

    const result = transporter.sendMail(mailOptions);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("Email sending error:", error);
    throw new Error("Failed to send email");
  }
};

// OTP sending function using your existing email service
const sendOTP = async (email, otp, user = {}) => {
  const subject = `🔐 Your Utkal Samaj Login OTP`;

  const htmlContent = `
    <div style="font-family: 'Arial', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h2 style="margin: 0; font-size: 24px;">🏛️ Utkal Samaj</h2>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">One-Time Password (OTP) for Login</p>
      </div>

      <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
          Dear <strong>${user.firstName || "User"}</strong>,
        </p>

        <p style="font-size: 14px; color: #666; line-height: 1.6; margin-bottom: 15px;">
          Please use the following One-Time Password (OTP) to log in to your Utkal Samaj account:
        </p>

        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin: 20px 0; text-align: center;">
          <h3 style="margin: 0; font-size: 28px; letter-spacing: 5px; color: #2d3748;">
            ${otp}
          </h3>
          <p style="font-size: 14px; color: #718096; margin-top: 10px;">
            This OTP is valid for <strong>5 minutes</strong>.
          </p>
        </div>

        <p style="font-size: 14px; color: #666; line-height: 1.6;">
          If you didn’t request this OTP, please ignore this email. Your account is safe.
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;" />

        <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">
          Best regards,<br />
          <strong>Utkal Samaj Management System</strong><br />
          Generated on: ${new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  `;

  const textContent = `
Utkal Samaj - OTP for Login

Dear ${user.firstName || "User"},

Your OTP for Utkal Samaj login is: ${otp}
This OTP is valid for 5 minutes.

If you didn’t request this, please ignore this email.

Best regards,
Utkal Samaj Management System
Generated on: ${new Date().toLocaleDateString()}
`;

  return await sendEmail(email, subject,htmlContent, textContent );
};

module.exports = { sendEmail, sendOTP };
