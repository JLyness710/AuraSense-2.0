     // index.js (Google Cloud Run Service - Email Gateway SMS Support)

    // --- Import necessary modules ---
    const express = require('express');
    const sgMail = require('@sendgrid/mail'); // SendGrid for emails and email-to-SMS
    const twilio = require('twilio');     // Twilio for direct SMS (will be bypassed in this setup)
    const cors = require('cors');         // Required for handling cross-origin requests from your dashboard

    // --- Initialize Express Application ---
    const app = express();
    app.use(express.json()); // Middleware to parse incoming JSON payloads
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

    const EMAIL_RECIPIENT = process.env.EMAIL_RECIPIENT; // e.g., joshualyness3@gmail.com
    const SMS_RECIPIENT = process.env.SMS_RECIPIENT;     // e.g., 7748137510@vtext.com

    // Twilio credentials (will be ignored if SMS_RECIPIENT is an email gateway)
    const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER; // Your Twilio sending phone number

    // --- Helper function to send email alert via SendGrid ---
    // This function sends an email to the specified recipientEmail.
    // It is now used for both direct emails and email-to-SMS gateways.
    async function sendEmail(apiKey, senderEmail, recipientEmail, subject, bodyContent, isHtml = true) {
      if (!apiKey || !senderEmail || !recipientEmail) {
        console.error("SendGrid config missing for email. Skipping.");
        return { success: false, message: 'SendGrid config missing.' };
      }

      sgMail.setApiKey(apiKey);

      const msg = {
        to: recipientEmail,
        from: senderEmail,
        subject: subject,
      };

      if (isHtml) {
          msg.html = bodyContent;
      } else {
          msg.text = bodyContent; // For plain text (like SMS gateway emails)
      }

      try {
        await sgMail.send(msg);
        console.log(`Email sent successfully to ${recipientEmail}!`);
        return { success: true, message: `Email sent to ${recipientEmail}` };
      } catch (error) {
        console.error(`Error sending email to ${recipientEmail}:`, error.message);
        if (error.response && error.response.body && error.response.body.errors) {
          console.error('SendGrid API Response Body Errors:', JSON.stringify(error.response.body.errors));
          return { success: false, message: `SendGrid API Error to ${recipientEmail}: ${error.response.body.errors.map(e => e.message).join(', ')}` };
        }
        return { success: false, message: `Email failed to ${recipientEmail}: ${error.message}` };
      }
    }

    // --- Helper function to send direct SMS via Twilio (Current setup will skip this) ---
    async function sendDirectSms(accountSid, authToken, twilioNumber, recipientPhoneNumber, messageBody) {
        if (!accountSid || !authToken || !twilioNumber || !recipientPhoneNumber) {
            console.warn("Twilio credentials for direct SMS are not fully set. Skipping direct SMS.");
            return { success: false, message: "Twilio config missing or incomplete." };
        }

        const client = new twilio(accountSid, authToken);

        try {
            await client.messages.create({
                body: messageBody,
                to: recipientPhoneNumber,
                from: twilioNumber
            });
            console.log(`Twilio SMS sent successfully to ${recipientPhoneNumber}!`);
            return { success: true, message: `SMS sent to ${recipientPhoneNumber}` };
        } catch (error) {
            console.error(`Error sending Twilio SMS to ${recipientPhoneNumber}:`, error.message);
            if (error.code) {
                console.error(`Twilio Error Code: ${error.code}`);
                return { success: false, message: `Twilio API Error (${error.code}) to ${recipientPhoneNumber}: ${error.message}` };
            }
            return { success: false, message: `SMS failed to ${recipientPhoneNumber}: ${error.message}` };
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

        let emailAlertResult = { success: false, message: 'Primary email not attempted.' };
        let smsAlertResult = { success: false, message: 'SMS not attempted.' };

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
        const alertSmsPlainTextBody = `AuraSense Alert:\nTemp: ${temp}°F, Humidity: ${humidity}%, VOC: ${vocCondition}, UV: ${uvIndex}. Check dashboard.`;


        // 1. Attempt to send primary email using EMAIL_RECIPIENT
        if (SENDGRID_API_KEY && SENDGRID_VERIFIED_SENDER && EMAIL_RECIPIENT) {
            console.log(`Attempting to send primary email to: ${EMAIL_RECIPIENT}`);
            emailAlertResult = await sendEmail(
                SENDGRID_API_KEY,
                SENDGRID_VERIFIED_SENDER,
                EMAIL_RECIPIENT,
                alertSubject,
                alertHtmlBody,
                true // isHtml = true for primary email
            );
        } else {
            emailAlertResult.message = "Primary email config (API key/sender/recipient) missing. Skipping primary email.";
            console.warn(emailAlertResult.message);
        }

        // 2. Attempt to send SMS using SMS_RECIPIENT (via email gateway or direct Twilio)
        // Check if SMS_RECIPIENT is an email address (indicating an email-to-SMS gateway)
        const isSmsRecipientEmailGateway = SMS_RECIPIENT && SMS_RECIPIENT.includes('@');

        if (isSmsRecipientEmailGateway) {
            // If it's an email gateway, use SendGrid to send an email (plain text recommended for SMS gateways)
            if (SENDGRID_API_KEY && SENDGRID_VERIFIED_SENDER && SMS_RECIPIENT) {
                console.log(`Attempting to send SMS via email gateway to: ${SMS_RECIPIENT}`);
                smsAlertResult = await sendEmail( // Call the sendEmail function again
                    SENDGRID_API_KEY,
                    SENDGRID_VERIFIED_SENDER,
                    SMS_RECIPIENT, // Send to the gateway address
                    "AuraSense SMS Alert", // A simpler subject for SMS
                    alertSmsPlainTextBody, // Send plain text for SMS gateways
                    false // isHtml = false for plain text
                );
            } else {
                smsAlertResult.message = "SendGrid config or SMS_RECIPIENT (gateway) missing. Skipping email gateway SMS.";
                console.warn(smsAlertResult.message);
            }
        } else {
            // If it's not an email gateway, attempt to send via Twilio (if configured)
            if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER && SMS_RECIPIENT) {
                console.log(`Attempting to send direct SMS via Twilio to: ${SMS_RECIPIENT}`);
                smsAlertResult = await sendDirectSms( // Call the sendDirectSms function
                    TWILIO_ACCOUNT_SID,
                    TWILIO_AUTH_TOKEN,
                    TWILIO_PHONE_NUMBER,
                    SMS_RECIPIENT, // Should be in +1 format for Twilio
                    alertSmsPlainTextBody
                );
            } else {
                smsAlertResult.message = "Twilio config or SMS_RECIPIENT (direct) missing. Skipping direct SMS.";
                console.warn(smsAlertResult.message);
            }
        }

        // Send back a combined JSON response to the calling dashboard
        if (emailAlertResult.success || smsAlertResult.success) {
            res.status(200).json({
                status: 'success',
                message: 'Alerts processed.',
                email: emailAlertResult.message,
                sms: smsAlertResult.message
            });
            console.log("Alerts processed successfully overall.");
        } else {
            res.status(500).json({
                status: 'error',
                message: 'All alerts failed or were not configured.',
                email: emailAlertResult.message,
                sms: smsAlertResult.message
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
    
