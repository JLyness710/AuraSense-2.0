// index.js (Google Cloud Run Service - Unified and Definitive Code)

// --- Import necessary modules ---
const express = require('express');
const sgMail = require('@sendgrid/mail');
const twilio = require('twilio');
const cors = require('cors'); // Required for handling cross-origin requests from your dashboard

// --- Initialize Express Application ---
const app = express();
app.use(express.json()); // Middleware to parse incoming JSON payloads
// Explicitly allow your GitHub Pages domain for CORS
// This ensures your dashboard on GitHub.io can make requests to this service
app.use(cors({
    origin: 'https://jlyness710.github.io', // Your specific GitHub Pages domain
    methods: ['POST', 'GET'], // Allow POST for alerts, GET for health checks
    allowedHeaders: ['Content-Type']
}));

// --- Configuration Variables (Accessed from Cloud Run Environment Variables) ---
// These are accessed once when the module loads.
// The values for these MUST be set in your Cloud Run service's "Variables & Secrets" section.
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_VERIFIED_SENDER = process.env.SENDGRID_VERIFIED_SENDER;
const ALERT_RECIPIENT = process.env.ALERT_RECIPIENT; // Email or phone number for alerts

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// --- Helper function to send email alert via SendGrid ---
// This function takes all necessary parameters directly,
// ensuring no scope issues with environment variables.
async function sendEmailAlert(apiKey, senderEmail, recipient, subject, htmlBody) {
  // Basic validation for SendGrid credentials
  if (!apiKey || !senderEmail || !recipient) {
    console.error("SendGrid is not fully configured for email alert. Missing API key, sender, or recipient.");
    return { success: false, message: 'SendGrid config missing.' };
  }

  // Set the SendGrid API key. This is done here to be robust, though often done once globally.
  sgMail.setApiKey(apiKey);

  // Construct the email message object
  const msg = {
    to: recipient,
    from: senderEmail,
    subject: subject,
    html: htmlBody, // HTML content for a richer email
  };

  try {
    // Attempt to send the email
    await sgMail.send(msg);
    console.log('SendGrid Email alert sent successfully!');
    return { success: true, message: 'Email sent' };
  } catch (error) {
    // Log detailed errors if sending fails
    console.error('Error sending email alert via SendGrid:', error.message);
    if (error.response && error.response.body && error.response.body.errors) {
      console.error('SendGrid API Response Body Errors:', JSON.stringify(error.response.body.errors));
      return { success: false, message: `SendGrid API Error: ${error.response.body.errors.map(e => e.message).join(', ')}` };
    }
    return { success: false, message: `Email failed: ${error.message}` };
  }
}

// --- Helper function to send SMS alert via Twilio ---
// This function takes all necessary parameters directly,
// ensuring no scope issues with environment variables.
async function sendSmsAlert(accountSid, authToken, twilioNumber, recipient, messageBody) {
    // Basic validation for Twilio credentials
    if (!accountSid || !authToken || !twilioNumber || !recipient) {
        console.error("Twilio credentials are not fully set. Skipping SMS.");
        return { success: false, message: "Twilio config missing." };
    }

    // Initialize Twilio client with provided credentials
    const client = new twilio(accountSid, authToken);

    try {
        // Attempt to send the SMS
        await client.messages.create({
            body: messageBody,
            to: recipient,
            from: twilioNumber
        });
        console.log('Twilio SMS alert sent successfully!');
        return { success: true, message: 'SMS sent' };
    } catch (error) {
        // Log detailed errors if sending fails
        console.error('Error sending SMS alert via Twilio:', error.message);
        if (error.code) { // Twilio specific error codes
            console.error(`Twilio Error Code: ${error.code}`);
            return { success: false, message: `Twilio API Error (${error.code}): ${error.message}` };
        }
        if (error.moreInfo) {
            console.error('Twilio more info:', error.moreInfo);
        }
        return { success: false, message: `SMS failed: ${error.message}` };
    }
}

// --- Cloud Run Service Endpoint for POST requests (Main Alert Trigger) ---
// This is the endpoint your GitHub Pages dashboard will call to send alerts.
app.post('/test-email-sms', async (req, res) => {
    console.log("Received POST request to /test-email-sms");

    // Extract environmental data from the request body sent by the dashboard
    const { temp, humidity, vocCondition, uvIndex, uvCondition } = req.body;

    // Basic validation: ensure all required data points are present
    if (!temp || !humidity || !vocCondition || !uvIndex) {
        console.error('Missing environmental data in request body. Responding with 400.');
        return res.status(400).json({ error: 'Missing environmental data in request body.' });
    }

    let emailResult = { success: false, message: 'Email not attempted.' };
    let smsResult = { success: false, message: 'SMS not attempted.' };

    // Prepare dynamic content for the alerts
    const alertSubject = 'AuraSense Environmental Alert!';
    const alertHtmlBody = `
        <p><strong>AuraSense System Alert:</strong></p>
        <p>Environmental conditions detected beyond normal parameters or for testing purposes:</p>
        <ul>
            <li>Temperature: ${temp} &deg;F</li>
            <li>Humidity: ${humidity} %</li>
            <li>VOC Condition: ${vocCondition}</li>
            <li>UV Index: ${uvIndex} (${uvCondition || 'N/A'})</li>
        </ul>
        <p>Please check your AuraSense Dashboard for more details.</p>
        <p><em>This is an automated alert from your AuraSense Environmental Monitor.</em></p>
    `;
    const alertSmsBody = `AuraSense Alert:\nTemp: ${temp}°F, Humidity: ${humidity}%, VOC: ${vocCondition}, UV: ${uvIndex}. Check dashboard.`;

    // Attempt to send email only if all SendGrid credentials are available
    if (SENDGRID_API_KEY && SENDGRID_VERIFIED_SENDER && ALERT_RECIPIENT) {
        console.log("Attempting to send email...");
        emailResult = await sendEmailAlert(
            SENDGRID_API_KEY,
            SENDGRID_VERIFIED_SENDER,
            ALERT_RECIPIENT,
            alertSubject,
            alertHtmlBody
        );
    } else {
        emailResult.message = "Email configuration missing in environment variables. Skipping email.";
        console.warn(emailResult.message);
    }

    // Attempt to send SMS only if all Twilio credentials are available
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER && ALERT_RECIPIENT) {
        console.log("Attempting to send SMS...");
        smsResult = await sendSmsAlert(
            TWILIO_ACCOUNT_SID,
            TWILIO_AUTH_TOKEN,
            TWILIO_PHONE_NUMBER,
            ALERT_RECIPIENT,
            alertSmsBody
        );
    } else {
        smsResult.message = "Twilio configuration missing in environment variables. Skipping SMS.";
        console.warn(smsResult.message);
    }

    // Send back a combined JSON response to the calling dashboard
    if (emailResult.success || smsResult.success) {
        res.status(200).json({
            status: 'success',
            message: 'Alerts processed.',
            email: emailResult.message,
            sms: smsResult.message
        });
        console.log("Alerts processed successfully overall.");
    } else {
        res.status(500).json({
            status: 'error',
            message: 'All alerts failed or were not configured.',
            email: emailResult.message,
            sms: smsResult.message
        });
        console.error("All alerts failed or were not configured.");
    }
});

// --- Cloud Run Service Endpoint for GET requests (Health Check / Root Path) ---
// This endpoint is useful for basic health checks or just to confirm the service is running.
app.get('/', (req, res) => {
    console.log("Received GET request to root path.");
    res.status(200).send('AuraSense Alert Service is running. Use POST /test-email-sms for alerts.');
});

// --- Start the Express Server ---
// Cloud Run provides the PORT environment variable. Your application MUST listen on this port.
const port = process.env.PORT || 8080; // Default to 8080 for local development convenience
app.listen(port, () => {
    console.log(`AuraSense Alert Service listening on port ${port}`);
});

// --- EXPLICIT EXPORT FOR CLOUD FUNCTIONS (1st Gen) / CLOUD RUN COMPATIBILITY ---
// This line explicitly exports the Express app instance. In some Cloud Functions
// or Cloud Run "source deployment" contexts, this helps the platform correctly
// identify and run the application as the main entry point, especially if it's
// implicitly looking for a named function like 'helloHttp'.
// This ensures the Express server starts and listens correctly.
exports.helloHttp = app;
