const Donation = require('../models/Donation');
const { sendSMS } = require('./smsService');

const sendDonationReminders = async () => {
  try {
    const today = new Date();
    const reminderDate = new Date(today);
    reminderDate.setHours(0, 0, 0, 0);

    const donations = await Donation.find({
      paymentStatus: 'completed',
      nextReminderDate: {
        $gte: reminderDate,
        $lt: new Date(reminderDate.getTime() + 24 * 60 * 60 * 1000)
      }
    });

    for (const donation of donations) {
      try {
        const message = `Dear ${donation.donorName}, it's been a year since your generous donation of ₹${donation.amount} to Utkal Samaj. Would you like to continue supporting children's education this year? Your contribution makes a real difference.`;
        
        await sendSMS(donation.phoneNumber, message);
        
        // Set next reminder for 5 days from today
        const nextReminder = new Date(today);
        nextReminder.setDate(nextReminder.getDate() + 1);
        
        await Donation.findByIdAndUpdate(donation._id, {
          nextReminderDate: nextReminder
        });
        
        console.log(`Reminder sent to ${donation.phoneNumber}`);
      } catch (error) {
        console.error(`Failed to send reminder to ${donation.phoneNumber}:`, error);
      }
    }

    console.log(`Processed ${donations.length} donation reminders`);
  } catch (error) {
    console.error('Donation reminder cron error:', error);
  }
};

module.exports = { sendDonationReminders };