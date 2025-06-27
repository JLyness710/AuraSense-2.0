    // index.js (Google Cloud Run Service - Separate Email/SMS Recipients)

    // --- Import necessary modules ---
    const express = require('express');
    const sgMail = require('@sendgrid/mail');
    const twilio = require('twilio');
    const cors = require('cors');

    // --- Initialize Express Application ---
    const app = express();
    app.use(express.json());
    // Explicitly allow your GitHub Pages domain for CORS
    app.use(cors({
        origin: 'https://jlyness710.github.io', // Your specific GitHub Pages domain
        methods: ['POST', 'GET'], // Allow POST for alerts, GET for health checks
        allowedHeaders: ['Content-Type']
    }));

    // --- Configuration Variables (Accessed from Cloud Run Environment Variables) ---
    // These values MUST be set in your Cloud Run service's "Variables & Secrets" section.
    const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
    const SENDGRID_VERIFIED_SENDER = process.env.SENDGRID_VERIFIED_SENDER;

    // NEW: Separate recipients for Email and SMS
    const EMAIL_RECIPIENT = process.env.EMAIL_RECIPIENT;
    const SMS_RECIPIENT = process.env.SMS_RECIPIENT; // This should be a direct phone number like '+17748137510'

    const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER; // Your Twilio sending phone number

    // --- Helper function to send email alert via SendGrid ---
    async function sendEmailAlert(apiKey, senderEmail, recipientEmail, subject, htmlBody) {
      if (!apiKey || !senderEmail || !recipientEmail) {
        console.error("SendGrid is not fully configured for email alert. Missing API key, sender, or recipient.");
        return { success: false, message: 'SendGrid config missing.' };
      }

      sgMail.setApiKey(apiKey);

      const msg = {
        to: recipientEmail, // Use the specific email recipient
        from: senderEmail,
        subject: subject,
        html: htmlBody,
      };

      try {
        await sgMail.send(msg);
        console.log('SendGrid Email alert sent successfully!');
        return { success: true, message: 'Email sent' };
      } catch (error) {
        console.error('Error sending email alert via SendGrid:', error.message);
        if (error.response && error.response.body && error.response.body.errors) {
          console.error('SendGrid API Response Body Errors:', JSON.stringify(error.response.body.errors));
          return { success: false, message: `SendGrid API Error: ${error.response.body.errors.map(e => e.message).join(', ')}` };
        }
        return { success: false, message: `Email failed: ${error.message}` };
      }
    }

    // --- Helper function to send SMS alert via Twilio ---
    async function sendSmsAlert(accountSid, authToken, twilioNumber, recipientPhoneNumber, messageBody) {
        if (!accountSid || !authToken || !twilioNumber || !recipientPhoneNumber) {
            console.error("Twilio credentials are not fully set. Skipping SMS.");
            return { success: false, message: "Twilio config missing." };
        }

        const client = new twilio(accountSid, authToken);

        try {
            await client.messages.create({
                body: messageBody,
                to: recipientPhoneNumber, // Use the specific SMS recipient phone number
                from: twilioNumber
            });
            console.log('Twilio SMS alert sent successfully!');
            return { success: true, message: 'SMS sent' };
        } catch (error) {
            console.error('Error sending SMS alert via Twilio:', error.message);
            if (error.code) {
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
    app.post('/test-email-sms', async (req, res) => {
        console.log("Received POST request to /test-email-sms");

        const { temp, humidity, vocCondition, uvIndex, uvCondition } = req.body;

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

        // Attempt to send email using EMAIL_RECIPIENT
        if (SENDGRID_API_KEY && SENDGRID_VERIFIED_SENDER && EMAIL_RECIPIENT) {
            console.log("Attempting to send email...");
            emailResult = await sendEmailAlert(
                SENDGRID_API_KEY,
                SENDGRID_VERIFIED_SENDER,
                EMAIL_RECIPIENT, // Use EMAIL_RECIPIENT here
                alertSubject,
                alertHtmlBody
            );
        } else {
            emailResult.message = "Email configuration or EMAIL_RECIPIENT missing. Skipping email.";
            console.warn(emailResult.message);
        }

        // Attempt to send SMS using SMS_RECIPIENT
        if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER && SMS_RECIPIENT) {
            console.log("Attempting to send SMS...");
            smsResult = await sendSmsAlert(
                TWILIO_ACCOUNT_SID,
                TWILIO_AUTH_TOKEN,
                TWILIO_PHONE_NUMBER,
                SMS_RECIPIENT, // Use SMS_RECIPIENT here
                alertSmsBody
            );
        } else {
            smsResult.message = "Twilio configuration or SMS_RECIPIENT missing. Skipping SMS.";
            console.warn(smsResult.message);
        }

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
    app.get('/', (req, res) => {
        console.log("Received GET request to root path.");
        res.status(200).send('AuraSense Alert Service is running. Use POST /test-email-sms for alerts.');
    });

    // --- Start the Express Server ---
    const port = process.env.PORT || 8080;
    app.listen(port, () => {
        console.log(`AuraSense Alert Service listening on port ${port}`);
    });

    // --- EXPLICIT EXPORT FOR CLOUD FUNCTIONS (1st Gen) / CLOUD RUN COMPATIBILITY ---
    exports.helloHttp = app;
    
