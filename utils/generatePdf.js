// Import required packages
const puppeteer = require('puppeteer');
const ejs = require('ejs');
const path = require('path');

// PDF Generator Function
const generateMemberPDF = async (member) => {
  try {
    // Path to your EJS template file
    console.log(__dirname,"templatePathtemplatePathtemplatePath");
    const templatePath = path.join(__dirname, 'memberDetails.ejs');
    
    // Render the EJS template with member data
    const html = await ejs.renderFile(templatePath, { member });

    // Launch puppeteer and generate PDF
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    // Set viewport for better rendering
    await page.setViewport({
      width: 1200,
      height: 800,
      deviceScaleFactor: 2
    });

    // Load the HTML content
    await page.setContent(html, { 
      waitUntil: ['networkidle0', 'domcontentloaded']
    });

    // Generate PDF with optimized settings
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: false,
      margin: {
        top: '0px',
        right: '0px',
        bottom: '0px',
        left: '0px'
      },
      quality: 100
    });

    await browser.close();
    return pdfBuffer;

  } catch (error) {
    console.error('PDF generation error:', error);
    throw new Error(`Failed to generate PDF: ${error.message}`);
  }
};

module.exports = generateMemberPDF;