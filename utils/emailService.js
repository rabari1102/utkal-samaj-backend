const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

exports.sendOtpEmail = async (to, otp) => {
  await transporter.sendMail({
    from: `"Utkal Samaj Seva" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Your OTP for Login",
    html: `<p>Your OTP is <b>${otp}</b>. It is valid for 5 minutes.</p>`,
  });
};
