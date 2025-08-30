const express = require("express");
const User = require("../models/User");
const bloodDonation = require("../models/bloodDonationData");
const { sendEmail } = require("../services/emailService");
const generateMemberPDF = require("../utils/generatePdf");
const router = express.Router();
// Import body and validationResult from express-validator
const { body, validationResult } = require("express-validator");
const mongoose = require("mongoose");

// Get all members (only name and blood group)
router.get("/members", async (req, res) => {
  try {
    // Extract pagination values from query (with defaults)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const role = req.query.role; // Total count for pagination
    const total = await User.countDocuments({
      isApproved: true,
      isActive: true,
      role: role,
      deletedAt: null,
    });

    const members = await User.find({
      isApproved: true,
      isActive: true,
      role: role,
      deletedAt: null,
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
router.post("/member-details/:id", async (req, res) => {
  try {
    const { id } = req.params; // Validate MongoDB ObjectId format

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid member ID format",
      });
    }

    const member = await User.findById(id).select(
      "firstName lastName fatherName presentAddress permanentAddress phoneNumber bloodGroup"
    );

    if (!member) {
      return res.status(404).json({
        error: "Member not found",
        message: "The requested member does not exist in our records",
      });
    } // Enhanced email subject and content

    const subject = `📄 Member Profile - ${member.firstName} ${member.lastName}`;

    const htmlContent = `
        <div style="font-family: 'Arial', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h2 style="margin: 0; font-size: 24px;">🏛️ Utkal Samaj</h2>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Member Profile Document</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
              Dear <strong>${req.user.firstName || "User"}</strong>,
            </p>
            
            <p style="font-size: 14px; color: #666; line-height: 1.6; margin-bottom: 15px;">
              Please find attached the detailed member profile document for:
            </p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #333; font-size: 18px;">
                👤 ${member.firstName} ${member.lastName}
              </h3>
              <p style="margin: 0; color: #666; font-size: 14px;">
                Member ID: ${member._id}
              </p>
              <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">
                📱 ${member.phoneNumber || "Phone not provided"}
              </p>
            </div>
            
            <p style="font-size: 14px; color: #666; line-height: 1.6; margin-bottom: 15px;">
              The document contains all available member information in a professionally formatted PDF layout.
            </p>
            
            <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; font-size: 14px; color: #2d5a2d;">
                <strong>📎 Attachment:</strong> Member_${member.firstName}_${
      member.lastName
    }_Profile.pdf
              </p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;">
            
            <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">
              Best regards,<br>
              <strong>Utkal Samaj Management System</strong><br>
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
        Utkal Samaj - Member Profile Document
        
        Dear ${req.user.firstName || "User"},
        
        Please find attached the detailed member profile document for ${
      member.firstName
    } ${member.lastName}.
        
        Member Details:
        - Name: ${member.firstName} ${member.lastName}
        - Member ID: ${member._id}
        - Phone: ${member.phoneNumber || "Not provided"}
        - Father's Name: ${member.fatherName || "Not provided"}
        - Blood Group: ${member.bloodGroup || "Not provided"}
        
        The complete information is available in the attached PDF document.
        
        Best regards,
        Utkal Samaj Management System
        Generated on: ${new Date().toLocaleDateString()}
      `;

    console.log(
      `Generating PDF for member: ${member.firstName} ${member.lastName}`
    ); // Generate the PDF

    const pdfBuffer = await generateMemberPDF(member);

    console.log(`PDF generated successfully. Size: ${pdfBuffer.length} bytes`); // Send email with PDF attachment

    await sendEmail(req.user.email, subject, htmlContent, textContent, [
      {
        filename: `Member_${member.firstName}_${member.lastName}_Profile.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ]);

    console.log(`Email sent successfully to: ${req.user.email}`); // Success response

    res.json({
      success: true,
      message: `Member profile PDF for ${member.firstName} ${member.lastName} has been sent to your email.`,
      data: {
        memberName: `${member.firstName} ${member.lastName}`,
        memberId: member._id,
        emailSent: true,
        recipientEmail: req.user.email,
        pdfSize: `${(pdfBuffer.length / 1024).toFixed(2)} KB`,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Member details PDF generation error:", error); // Enhanced error response

    res.status(500).json({
      success: false,
      error: "Server error",
      message: "Failed to generate or send member details PDF",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
      timestamp: new Date().toISOString(),
    });
  }
});

router.post("/donors", async (req, res) => {
  try {
    const donors = await bloodDonation.insertMany(req.body);
    res.status(201).json({
      message: "All donors saved successfully.",
      count: donors.length,
    });
  } catch (error) {
    res
      .status(400)
      .json({ message: "Bulk insert failed.", error: error.message });
  }
});

router.get("/bloodGroup-list", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { bloodGroup, search } = req.query;
    const query = {};
    if (bloodGroup) {
      query.bloodGroup = bloodGroup;
    }
    if (search) {
      const safeSearch = escapeRegex(search);
      const regex = new RegExp(safeSearch, "i");
      query.$or = [
        { firstName: regex },
        { lastName: regex },
        { bloodGroup: regex },
      ];
    }
    console.log(bloodGroup, "bloodGroupbloodGroup");

    const total = await bloodDonation.countDocuments(query);

    const users = await bloodDonation
      .find(query)
      .select("firstName lastName bloodGroup createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({
      data: {
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalUsers: total,
        users,
      },
    });
  } catch (error) {
    console.error("Get blood group users error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Delete single donor by ID
router.delete("/user/:id", async (req, res) => {
  try {
    const { id } = req.params; // Validate ObjectId format

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    const deleteduser = await User.findByIdAndDelete(id);

    if (!deleteduser) {
      return res.status(404).json({
        success: false,
        message: "user not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "user deleted successfully",
      deleteduser: {
        id: deleteduser._id,
        firstName: deleteduser.firstName,
        lastName: deleteduser.lastName,
        bloodGroup: deleteduser.bloodGroup,
      },
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting user",
      error: error.message,
    });
  }
});

router.put(
  "/update-user/:id",
  [
    body("firstName").optional().trim().isLength({ min: 2 }),
    body("lastName").optional().trim().isLength({ min: 2 }),
    body("fatherName").optional().trim().isLength({ min: 2 }),
    body("email")
      .optional()
      .isEmail()
      .withMessage("Valid email address required"),
    body("phoneNumber").optional().isMobilePhone(),
    body("presentAddress").optional().trim().isLength({ min: 10 }),
    body("permanentAddress").optional().trim().isLength({ min: 10 }),
    body("bloodGroup")
      .optional()
      .isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const updates = req.body; // Check if the user ID is a valid ObjectId

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          message: "Invalid user ID",
        });
      } // Check for uniqueness of email and phone number if they are being updated

      if (updates.email) {
        const existingUserByEmail = await User.findOne({
          email: updates.email,
          _id: { $ne: id }, // Exclude the current user from the check
          deletedAt: null,
        });
        if (existingUserByEmail) {
          return res.status(400).json({
            message: "User already exists with this email address",
          });
        }
      }

      if (updates.phoneNumber) {
        const existingUserByPhone = await User.findOne({
          phoneNumber: updates.phoneNumber,
          _id: { $ne: id }, // Exclude the current user from the check
          deletedAt: null,
        });
        if (existingUserByPhone) {
          return res.status(400).json({
            message: "User already exists with this phone number",
          });
        }
      } // Find and update the user

      const user = await User.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
      );

      if (!user) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      res.status(200).json({
        message: "User updated successfully",
        data: user,
      });
    } catch (error) {
      console.error("User update error:", error);
      res.status(500).json({
        error: "Server error",
      });
    }
  }
);

module.exports = router;
