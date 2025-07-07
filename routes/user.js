const express = require("express");
const User = require("../models/User");
const { auth } = require("../middlewares/auth");
const { sendEmail } = require("../services/smsService");

const router = express.Router();

// Get all members (only name and blood group)
router.get("/members", auth(["user", "admin"]), async (req, res) => {
  try {
    // Extract pagination values from query (with defaults)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Total count for pagination
    const total = await User.countDocuments({
      isApproved: true,
      isActive: true,
      role: "user",
    });

    // Fetch paginated member list
    const members = await User.find({
      isApproved: true,
      isActive: true,
      role: "user",
    })
      .select("firstName lastName bloodGroup")
      .sort({ firstName: 1 })
      .skip(skip)
      .limit(limit);

    res.json({
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalMembers: total,
      members,
    });
  } catch (error) {
    console.error("Get members error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get member details (send to registered phone)
router.post(
  "/member-details/:id",
  auth(["user", "admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      const member = await User.findById(id).select(
        "firstName lastName fatherName presentAddress permanentAddress phoneNumber bloodGroup"
      );

      if (!member) {
        return res.status(404).json({ error: "Member not found" });
      }

      // Send details via SMS to the requesting user's phone
      const message = `Member Details:
Name: ${member.firstName} ${member.lastName}
Father: ${member.fatherName}
phoneNumber: ${member.phoneNumber}
Blood Group: ${member.bloodGroup}
Present Address: ${member.presentAddress}
Permanent Address: ${member.permanentAddress}`;

      await sendEmail(req.user.phoneNumber, message);

      res.json({
        message: "Member details sent to your registered phone number",
      });
    } catch (error) {
      console.error("Get member details error:", error);
      res.status(500).json({ error: "Server error" });
    }
  }
);

module.exports = router;
