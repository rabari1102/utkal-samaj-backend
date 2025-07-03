require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5000,
  mongoURI: process.env.MONGODB_URI || 'mongodb://localhost:27017/utkal_samaj',
  jwtSecret: process.env.JWT_SECRET || 'default_jwt_secret',
  clientBaseUrl: process.env.CLIENT_BASE_URL || 'http://localhost:3000',
  email: {
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
};