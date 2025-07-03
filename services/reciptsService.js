const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const generateReceipt = async (donation) => {
  try {
    const doc = new PDFDocument();
    const filename = `receipt_${donation._id}.pdf`;
    const filepath = path.join(__dirname, '../uploads/receipts', filename);

    // Ensure receipts directory exists
    const receiptsDir = path.dirname(filepath);
    if (!fs.existsSync(receiptsDir)) {
      fs.mkdirSync(receiptsDir, { recursive: true });
    }

    doc.pipe(fs.createWriteStream(filepath));

    // Header
    doc.fontSize(20).text('UTKAL SAMAJ', 50, 50);
    doc.fontSize(14).text('Donation Receipt', 50, 80);
    doc.text('-----------------------------------', 50, 100);

    // Donation details
    doc.fontSize(12);
    doc.text(`Receipt No: ${donation._id}`, 50, 130);
    doc.text(`Date: ${donation.donationDate.toDateString()}`, 50, 150);
    doc.text(`Donor Name: ${donation.donorName}`, 50, 170);
    doc.text(`Phone: ${donation.phoneNumber}`, 50, 190);
    if (donation.email) {
      doc.text(`Email: ${donation.email}`, 50, 210);
    }
    doc.text(`Amount: ₹${donation.amount}`, 50, 230);
    doc.text(`Payment ID: ${donation.paymentId}`, 50, 250);

    // Thank you message
    doc.text('-----------------------------------', 50, 280);
    doc.fontSize(14).text('Thank You for Your Donation!', 50, 300);
    doc.fontSize(10).text(
      'Your contribution helps us provide free education to underprivileged children. ' +
      'We deeply appreciate your support towards building a better future for our community.',
      50, 320, { width: 500 }
    );

    // Footer
    doc.fontSize(8).text('This is a computer-generated receipt.', 50, 400);
    doc.text('For queries, contact: contact@utkalsamaj.org', 50, 415);

    doc.end();

    return filepath;
  } catch (error) {
    console.error('Receipt generation error:', error);
    throw new Error('Failed to generate receipt');
  }
};

module.exports = { generateReceipt };