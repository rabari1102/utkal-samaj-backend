const cron = require('node-cron');
const Donation = require('../models/Donation');
const nodemailer = require('nodemailer');

// Email setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,        // your email
    pass: process.env.EMAIL_PASS         // app password
  }
});

// Reminder Job - runs daily at 9 AM
cron.schedule('0 9 * * *', async () => {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() + 5); // 5 days ahead

  const donations = await Donation.find();
  for (const donation of donations) {
    const dueDate = new Date(donation.paymentDate);
    dueDate.setFullYear(today.getFullYear());

    if (dueDate.toDateString() === startDate.toDateString() && !donation.reminderSent) {
      // Send email
      await transporter.sendMail({
        to: donation.email,
        subject: 'Reminder: Contribute to a child\'s education',
        html: `<p>Hi ${donation.name},<br/><br/>It's almost time to renew your donation to support a child's education.<br/>Please consider donating again!</p>`
      });

      // Mark reminder sent
      donation.reminderSent = true;
      await donation.save();
    }
  }

  console.log('Reminder emails sent.');
});
