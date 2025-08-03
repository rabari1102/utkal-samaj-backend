const mongoose = require('mongoose');
require('dotenv').config(); // Ensure dotenv is loaded to access process.env

// Log the MONGODB_URI to ensure it's being loaded correctly.
// REMEMBER TO REMOVE OR COMMENT THIS LINE IN PRODUCTION FOR SECURITY REASONS.
console.log(process.env.MONGODB_URI, "process.env.MONGODB_URI");

/**
 * @function connectDB
 * @description Establishes a connection to the MongoDB database.
 * @returns {Promise<void>} A promise that resolves when the connection is successful.
 * @throws {Error} Throws an error if the connection fails.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // These options are generally recommended for modern Mongoose versions.
      // While some might be default in newer versions, explicitly including them
      // ensures compatibility and avoids deprecation warnings.
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // You can add more options here if needed, e.g., serverSelectionTimeoutMS, socketTimeoutMS
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB connection failed: ${error.message}`);
    // Log the full error object for more detailed debugging in development
    if (process.env.NODE_ENV === 'development') {
      console.error(error);
    }
    // Exit process with failure
    process.exit(1);
  }
};

module.exports = connectDB;