const express = require("express");
const { body, validationResult } = require("express-validator");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const OTP = require("../models/Otp");
const { sendOTP } = require("../services/emailService"); // Changed from smsService to emailService
const { auth } = require("../middlewares/auth");

const router = express.Router();

// Generate OTP
router.post(
  "/generate-otp",
  [
    body("email").isEmail().withMessage("Valid email address required"), // Changed from phoneNumber to email
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email } = req.body; // Changed from phoneNumber to email

      // Check if user exists and is approved
      const user = await User.findOne({ email }); // Changed from phoneNumber to email
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.isApproved) {
        return res.status(403).json({ message: "Account not approved yet" });
      }

      // Generate OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // Delete existing OTP
      await OTP.deleteMany({ email }); // Changed from phoneNumber to email

      // Save new OTP
      await new OTP({
        email, // Changed from phoneNumber to email
        otp,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      }).save();

      // Send OTP via Email
      await sendOTP(email, otp); // Changed from phoneNumber to email

      res.json({ message: "OTP sent successfully to your email" });
    } catch (error) {
      console.error("Generate OTP error:", error);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Verify OTP and login
router.post(
  "/verify-otp",
  [
    body("email").isEmail().withMessage("Valid email address required"), // Changed from phoneNumber to email
    body("otp").isLength({ min: 6, max: 6 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, otp } = req.body; // Changed from phoneNumber to email

      // Verify OTP
      const otpRecord = await OTP.findOne({ email, otp }); // Changed from phoneNumber to email
      if (!otpRecord) {
        return res.status(400).json({ message: "Invalid OTP" });
      }

      if (otpRecord.expiresAt < new Date()) {
        await OTP.deleteOne({ _id: otpRecord._id });
        return res.status(400).json({ message: "OTP has expired" });
      }

      // Get user
      const user = await User.findOne({ email }); // Changed from phoneNumber to email
      if (!user || !user.isApproved) {
        return res
          .status(403)
          .json({ message: "User not found or not approved" });
      }

      // Delete OTP
      await OTP.deleteOne({ _id: otpRecord._id });

      // Generate JWT token
      const token = jwt.sign(
        { id: user._id, email: user.email }, // Changed from phoneNumber to email
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      user.token = token;
      await user.save();
      res.json({
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email, // Changed from phoneNumber to email
          phoneNumber: user.phoneNumber, // Keep phoneNumber if still needed in User model
          role: user.role,
        },
      });
    } catch (error) {
      console.error("Verify OTP error:", error);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// User signup
router.post(
  "/signup",
  [
    body("firstName").trim().isLength({ min: 2 }),
    body("lastName").trim().isLength({ min: 2 }),
    body("fatherName").trim().isLength({ min: 2 }),
    body("email").isEmail().withMessage("Valid email address required"), // Added email validation
    body("phoneNumber").isMobilePhone(),
    body("presentAddress").trim().isLength({ min: 10 }),
    body("permanentAddress").trim().isLength({ min: 10 }),
    body("bloodGroup").isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        firstName,
        lastName,
        fatherName,
        email,
        phoneNumber,
        presentAddress,
        permanentAddress,
        bloodGroup,
      } = req.body;

      // Check if user already exists with email or phone number
      const existingUserByEmail = await User.findOne({
        email,
        isApproved: false,
      });
      if (existingUserByEmail) {
        return res.status(200).json({
          message:
            "Your ID is under process from our admin and will take 1-2 days to get created",
          userId: existingUserByAddress._id,
        });
      }
      console.log(phoneNumber, "phoneNumberphoneNumber");

      const existingUserByPhone = await User.findOne({
        phoneNumber: phoneNumber,
      });
      if (existingUserByPhone) {
        return res
          .status(400)
          .json({ message: "User already exists with this phone number" });
      }

      // Create user
      const user = new User({
        firstName,
        lastName,
        fatherName,
        email, // Added email field
        phoneNumber,
        presentAddress,
        permanentAddress,
        bloodGroup,
        isApproved: false,
      });

      await user.save();

      res.json({
        message:
          "Your ID is under process from our admin and will take 1-2 days to get created",
        userId: user._id,
      });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Get current user
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-__v");
    res.json(user);
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
