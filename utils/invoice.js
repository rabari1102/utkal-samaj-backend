const PDFDocument = require('pdfkit');
const { Readable } = require('stream');

exports.generateInvoiceBuffer = (donation) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    doc.fontSize(20).text('Donation Invoice', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Name: ${donation.name}`);
    doc.text(`Phone: ${donation.phoneNumber}`);
    doc.text(`Email: ${donation.email || '-'}`);
    doc.text(`Amount: ₹${donation.amount}`);
    doc.text(`Date: ${donation.paymentDate.toDateString()}`);
    doc.moveDown();
    doc.text(`Thank you for your generous contribution!`, { align: 'center' });

    doc.end();
  });
};
