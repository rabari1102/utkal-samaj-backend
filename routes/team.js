const express = require("express");
const TeamNode = require("../models/Team");
const createUploader = require("../utils/upload"); // Import the factory
const path = require("path");
const router = express.Router();

// Create a specific uploader for team profile pictures
// Files will be saved in 'upload/team_profiles/'
const teamUploader = createUploader("team_profiles");

// Default profile picture path (client should resolve this)
const DEFAULT_PROFILE_PIC_PATH = "/defaults/avatar.png";

// POST a new team member
router.post("/", teamUploader.single("profilePicture"), async (req, res) => {
  try {
    const { name, role, samiti, parent } = req.body;

    const teamNode = new TeamNode({
      name,
      role,
      samiti,
      parent: parent || null,
      // **IMPORTANT**: Store the file PATH, not the buffer
      profilePicture: req.file ? req.file.path : null,
    });

    await teamNode.save();

    res
      .status(201)
      .json({ message: "Team node created successfully", id: teamNode._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET the full team tree
router.get("/tree", async (req, res) => {
  try {
    const SAMITI_PARENT_ID = "687386d3d4d688945bf29a22"; // Use your actual root ID

    const buildTree = async (id, req) => {
      const node = await TeamNode.findById(id).lean();
      if (!node) return null;

      // Handle profile picture URL formatting
      if (!node.profilePicture) {
        node.profilePicture = DEFAULT_PROFILE_PIC_PATH;
      } else {
        try {
          let filePath = node.profilePicture;

          // Handle MongoDB Binary object
          if (filePath && typeof filePath === "object" && filePath.buffer) {
            // Convert MongoDB Binary to string
            filePath = filePath.buffer.toString("utf-8");
            console.log("Converted Binary to string:", filePath);
          } else if (typeof filePath !== "string") {
            console.warn(
              "Profile picture is not a string or Binary:",
              typeof filePath,
              filePath
            );
            node.profilePicture = DEFAULT_PROFILE_PIC_PATH;
            return node;
          } else {
            // Check if it's base64 encoded string
            if (
              !filePath.startsWith("/") &&
              !filePath.startsWith("http") &&
              !filePath.includes("\\") &&
              !filePath.includes("/")
            ) {
              try {
                // Decode base64 to get the actual file path
                filePath = Buffer.from(filePath, "base64").toString("utf-8");
                console.log("Decoded base64 file path:", filePath);
              } catch (decodeError) {
                console.warn(
                  "Failed to decode base64 profile picture:",
                  decodeError
                );
                node.profilePicture = DEFAULT_PROFILE_PIC_PATH;
                return node;
              }
            }
          }

          // Only proceed if we have a valid filePath string
          if (filePath && typeof filePath === "string") {
            // Extract filename from the full path - handle both Windows and Unix paths
            let filename;

            // Handle Windows paths (backslashes)
            if (filePath.includes("\\")) {
              filename = filePath.split("\\").pop();
            }
            // Handle Unix paths (forward slashes)
            else if (filePath.includes("/")) {
              filename = filePath.split("/").pop();
            }
            // If no path separators, assume it's already a filename
            else {
              filename = filePath;
            }

            console.log("Extracted filename:", filename);

            // Create proper accessible URL
            // node.profilePicture = `${req.protocol}://${req.get("host")}/uploads/team_profiles/${filename}`;
            node.profilePicture = `http://localhost:8080/uploads/team_profiles/${filename}`
          } else {
            node.profilePicture = DEFAULT_PROFILE_PIC_PATH;
          }
        } catch (error) {
          console.error("Error processing profile picture:", error);
          node.profilePicture = DEFAULT_PROFILE_PIC_PATH;
        }
      }

      const children = await TeamNode.find({ parent: id })
        .sort({ createdAt: "ascending" })
        .lean();

      node.children = await Promise.all(
        children.map((child) => buildTree(child._id, req))
      );

      return node;
    };

    const samitiNode = await TeamNode.findById(SAMITI_PARENT_ID).lean();
    if (!samitiNode) {
      return res.status(404).json({ message: "Samiti Parent ID not found" });
    }

    const samitiTree = await buildTree(samitiNode._id, req);
    res.json({ data: [samitiTree] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET a specific subtree by ID
router.get("/tree/:id", async (req, res) => {
  const nodeId = req.params.id;
  try {
    const buildTree = async (id) => {
      const node = await TeamNode.findById(id).lean();
      if (!node) return null;

      if (!node.profilePicture) {
        node.profilePicture = DEFAULT_PROFILE_PIC_PATH;
      }

      const children = await TeamNode.find({ parent: id }).lean();
      node.children = await Promise.all(
        children.map((child) => buildTree(child._id))
      );

      return node;
    };

    const tree = await buildTree(nodeId);
    if (!tree) return res.status(404).json({ message: "Node not found" });

    // Corrected variable name from 'trees' to 'tree'
    res.json({ data: tree });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// UPDATE a team member
router.put("/:id", teamUploader.single("profilePicture"), async (req, res) => {
  try {
    const { name, role, samiti, parent } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (role) updateData.role = role;
    if (samiti) updateData.samiti = samiti;
    if (parent !== undefined) updateData.parent = parent;

    // **IMPORTANT**: If a new file is uploaded, update its PATH
    if (req.file) {
      updateData.profilePicture = req.file.path;
    }

    const updatedNode = await TeamNode.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    );

    if (!updatedNode) {
      return res.status(404).json({ message: "Team member not found" });
    }

    res.json(updatedNode);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Find the event:
    const event = await Event.findById(id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // 2. Iterate and delete each image:
    if (event.images && event.images.length > 0) { // Checks if there are any images
      for (const relativeImagePath of event.images) { // Loops through each image path
        const imagePath = path.join(__dirname, "..", "upload", relativeImagePath);
        try {
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath); // Deletes the individual image file
            console.log(`Deleted image: ${imagePath}`);
          } else {
            console.log(`Image not found on disk (already deleted or path mismatch): ${imagePath}`);
          }
        } catch (unlinkError) {
          console.error(`Error deleting image ${imagePath}:`, unlinkError);
          // Important: Even if one image fails to delete, the loop continues,
          // and the event document will still be deleted from the database.
        }
      }
    }

    // 3. Delete the event from the database:
    await Event.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error("Event deletion error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

module.exports = router;
