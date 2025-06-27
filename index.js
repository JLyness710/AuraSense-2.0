     // index.js (Google Cloud Run Service)

    // --- Import necessary modules ---
    const express = require('express');
    const sgMail = require('@sendgrid/mail');
    const twilio = require('twilio');
    const cors = require('cors');

    const app = express();
    app.use(express.json());
    app.use(cors({
        origin: 'https://jlyness710.github.io', // Explicitly allow your GitHub Pages domain
        methods: ['POST'],
        allowedHeaders: ['Content-Type']
    }));

    // --- Helper function to send email alert via SendGrid ---
    // Now takes sender, recipient, and API key as arguments
    async function sendEmailAlert(apiKey, senderEmail, recipient, subject, text) {
      if (!apiKey || !senderEmail || !recipient) {
        console.error("SendGrid is not fully configured for email alert within sendEmailAlert.");
        return { success: false, message: 'SendGrid config missing.' };
      }

      sgMail.setApiKey(apiKey); // Ensure API key is set for each call if needed (robustness)

      const msg = {
        to: recipient,
        from: senderEmail,
        subject: subject,
        text: text,
      };

      try {
        await sgMail.send(msg);
        console.log('Email alert sent successfully!');
        return { success: true, message: 'Email sent' };
      } catch (error) {
        console.error('Error sending email alert:', error.response ? error.response.body : error);
        return { success: false, message: `Email failed: ${error.message}` };
      }
    }

    // --- Helper function to send SMS alert via Twilio ---
    // Now takes Twilio credentials and recipient as arguments
    async function sendSmsAlert(accountSid, authToken, twilioNumber, recipient, messageBody) {
        if (!accountSid || !authToken || !twilioNumber || !recipient) {
            console.error("Twilio credentials are not fully set within sendSmsAlert. Skipping SMS.");
            return { success: false, message: "Twilio config missing." };
        }

        const client = new twilio(accountSid, authToken);

        try {
            await client.messages.create({
                body: messageBody,
                to: recipient,
                from: twilioNumber
            });
            console.log('SMS alert sent successfully!');
            return { success: true, message: 'SMS sent' };
        } catch (error) {
            console.error('Error sending SMS alert:', error.message);
            if (error.moreInfo) {
                console.error('Twilio more info:', error.moreInfo);
            }
            return { success: false, message: `SMS failed: ${error.message}` };
        }
    }

    // --- Cloud Run Service Endpoint ---
    app.post('/test-email-sms', async (req, res) => {
        console.log("Received request to /test-email-sms");

        // Access environment variables directly inside the request handler
        const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
        const SENDGRID_VERIFIED_SENDER = process.env.SENDGRID_VERIFIED_SENDER;
        const ALERT_RECIPIENT = process.env.ALERT_RECIPIENT;

        const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
        const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
        const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

        const { temp, humidity, vocCondition, uvIndex } = req.body;

        if (!temp || !humidity || !vocCondition || !uvIndex) {
            return res.status(400).json({ error: 'Missing environmental data in request body.' });
        }

        let emailResult = { success: false, message: 'Email not attempted.' };
        let smsResult = { success: false, message: 'SMS not attempted.' };

        // Prepare content for alerts
        const emailSubject = 'AuraSense Environmental Alert!';
        const emailHtmlBody = `
            <p><strong>AuraSense System Alert:</strong></p>
            <p>Environmental conditions detected beyond normal parameters or for testing purposes:</p>
            <ul>
                <li>Temperature: ${temp} &deg;F</li>
                <li>Humidity: ${humidity} %</li>
                <li>VOC Condition: ${vocCondition}</li>
                <li>UV Index: ${uvIndex}</li>
            </ul>
            <p>Please check your AuraSense Dashboard for more details.</p>
            <p><em>This is an automated alert from your AuraSense Environmental Monitor.</em></p>
        `;
        const smsMessageBody = `AuraSense Alert:\nTemp: ${temp}°F, Humidity: ${humidity}%, VOC: ${vocCondition}, UV: ${uvIndex}. Check dashboard.`;


        // Attempt to send email
        if (SENDGRID_API_KEY && SENDGRID_VERIFIED_SENDER && ALERT_RECIPIENT) {
            emailResult = await sendEmailAlert(
                SENDGRID_API_KEY,
                SENDGRID_VERIFIED_SENDER,
                ALERT_RECIPIENT,
                emailSubject,
                emailHtmlBody
            );
        } else {
            emailResult.message = "Email configuration missing in environment variables. Skipping email.";
            console.warn(emailResult.message);
        }

        // Attempt to send SMS
        if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER && ALERT_RECIPIENT) {
            smsResult = await sendSmsAlert(
                TWILIO_ACCOUNT_SID,
                TWILIO_AUTH_TOKEN,
                TWILIO_PHONE_NUMBER,
                ALERT_RECIPIENT,
                smsMessageBody
            );
        } else {
            smsResult.message = "Twilio configuration missing in environment variables. Skipping SMS.";
            console.warn(smsResult.message);
        }

        if (emailResult.success || smsResult.success) {
            res.status(200).json({
                message: 'Alerts processed.',
                email: emailResult.message,
                sms: smsResult.message
            });
        } else {
            res.status(500).json({
                message: 'All alerts failed or were not configured.',
                email: emailResult.message,
                sms: smsResult.message
            });
        }
    });

    // Root endpoint for health check or basic info
    app.get('/', (req, res) => {
        res.status(200).send('AuraSense Alert Service is running. Use /test-email-sms for alerts.');
    });

    // IMPORTANT: For Cloud Run, you need to listen on process.env.PORT
    const port = process.env.PORT || 8080;
    app.listen(port, () => {
        console.log(`AuraSense Alert Service listening on port ${port}`);
    });

    // This line is added to explicitly export the Express app itself for Cloud Functions/Run
    // This allows the platform to find a 'function' even though it's an Express server.
    exports.helloHttp = app;
    
        sgMail.setApiKey(SENDGRID_API_KEY);
    }

    // --- Initialize Twilio Client ---
    let twilioClient = null; // Initialize to null
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
        // Only create Twilio client if credentials are provided
        twilioClient = new twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        if (!TWILIO_PHONE_NUMBER) {
            console.warn("WARNING: TWILIO_PHONE_NUMBER is not set. SMS will not work.");
        }
    } else {
        console.warn("WARNING: Twilio credentials (ACCOUNT_SID or AUTH_TOKEN) are not set. Twilio SMS will not be available.");
    }

    // --- Express Application Setup ---
    const app = express();

    // Enable CORS for all origins. For production, restrict 'origin' to your GitHub Pages URL.
    app.use(cors({ origin: true }));

    // Middleware to parse incoming JSON payloads
    app.use(express.json());

    // --- Helper function to send email alert via SendGrid ---
    async function sendEmailAlert(subject, text) {
      if (!SENDGRID_API_KEY || !ALERT_SENDER_EMAIL || !ALERT_RECIPIENT) {
        console.error("SendGrid is not fully configured for email alert.");
        return { success: false, message: 'SendGrid not configured.' };
      }

      const msg = {
        to: ALERT_RECIPIENT,
        from: ALERT_SENDER_EMAIL,
        subject: subject,
        text: text,
      };

      try {
        await sgMail.send(msg);
        console.log('SendGrid Alert Email sent successfully!');
        return { success: true, message: 'Email sent via SendGrid!' };
      } catch (error) {
        console.error('Error sending email alert:', error.response ? error.response.body : error);
        return { success: false, message: `Email failed: ${error.message}` };
      }
    }

    // --- Helper function to send SMS alert via Twilio ---
    async function sendSmsAlert(message) {
        if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
            console.error("Twilio credentials are not fully set. Skipping SMS.");
            return { success: false, message: "Twilio not configured." };
        }

        const client = new twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        const messageBody = `AuraSense Alert:\nTemp: ${req.body.temp}°F, Humidity: ${req.body.humidity}%, VOC: ${req.body.vocCondition}, UV: ${req.body.uvIndex}. Check dashboard.`;

        try {
            await client.messages.create({
                body: messageBody,
                to: ALERT_RECIPIENT,
                from: TWILIO_PHONE_NUMBER
            });
            console.log('SMS alert sent successfully!');
            return { success: true, message: 'SMS sent' };
        } catch (error) {
            console.error('Error sending SMS alert:', error.message);
            if (error.moreInfo) {
                console.error('Twilio more info:', error.moreInfo);
            }
            return { success: false, message: `SMS failed: ${error.message}` };
        }
    }

    // --- Cloud Run Service Endpoint ---
    app.post('/test-email-sms', async (req, res) => {
        console.log("Received request to /test-email-sms");
        const { temp, humidity, vocCondition, uvIndex } = req.body;

        if (!temp || !humidity || !vocCondition || !uvIndex) {
            return res.status(400).json({ error: 'Missing environmental data in request body.' });
        }

        let emailResult = { success: false, message: 'Email not attempted.' };
        let smsResult = { success: false, message: 'SMS not attempted.' };

        if (SENDGRID_API_KEY && SENDGRID_VERIFIED_SENDER && ALERT_RECIPIENT) {
            emailResult = await sendEmailAlert(
                `Test Temp: ${temp}`, // Using dynamic values from request
                `Test Humidity: ${humidity}`,
                `Test VOC: ${vocCondition}`,
                `Test UV: ${uvIndex}`
            );
        } else {
            emailResult.message = "Email configuration missing. Skipping email.";
            console.warn(emailResult.message);
        }

        if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER && ALERT_RECIPIENT) {
            smsResult = await sendSmsAlert(
                `Test Temp: ${temp}`, // Using dynamic values from request
                `Test Humidity: ${humidity}`,
                `Test VOC: ${vocCondition}`,
                `Test UV: ${uvIndex}`
            );
        } else {
            smsResult.message = "Twilio configuration missing. Skipping SMS.";
            console.warn(smsResult.message);
        }

        if (emailResult.success || smsResult.success) {
            res.status(200).json({
                message: 'Alerts processed.',
                email: emailResult.message,
                sms: smsResult.message
            });
        } else {
            res.status(500).json({
                message: 'All alerts failed or were not configured.',
                email: emailResult.message,
                sms: smsResult.message
            });
        }
    });

    // Root endpoint for health check or basic info
    app.get('/', (req, res) => {
        res.status(200).send('AuraSense Alert Service is running. Use /test-email-sms for alerts.');
    });

    // IMPORTANT: For Cloud Run, you need to listen on process.env.PORT
    const port = process.env.PORT || 8080; // Default to 8080 for local testing convenience
    app.listen(port, () => {
        console.log(`AuraSense Alert Service listening on port ${port}`);
    });
    
    }

    let twilioClient = null;
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
        twilioClient = new twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        if (!TWILIO_PHONE_NUMBER) {
            console.warn("WARNING: TWILIO_PHONE_NUMBER is not set. SMS will not work.");
        }
    } else {
        console.warn("WARNING: Twilio credentials not set. Twilio SMS will not be available.");
    }

    // Initialize CORS middleware
    const corsHandler = cors({ origin: true }); // Allow all origins for simplicity, tighten for production


    // --- Helper function to send email alert via SendGrid ---
    async function sendEmailAlert(subject, text) {
      if (!SENDGRID_API_KEY || !ALERT_SENDER_EMAIL || !ALERT_RECIPIENT) {
        console.error("SendGrid is not fully configured for email alert.");
        return { success: false, message: 'SendGrid not configured.' };
      }

      const msg = {
        to: ALERT_RECIPIENT,
        from: ALERT_SENDER_EMAIL, // MUST be a verified sender email in SendGrid
        subject: subject,
        text: text,
      };

      try {
        await sgMail.send(msg);
        console.log('SendGrid Alert Email sent successfully!');
        return { success: true, message: 'Email sent via SendGrid!' };
      } catch (error) {
        console.error('Error sending alert email via SendGrid:', error);
        if (error.response) {
          console.error('SendGrid API Response Body:', error.response.body); 
        }
        return { success: false, message: `Failed to send email: ${error.message}` };
      }
    }

    // --- Helper function to send SMS alert via Twilio ---
    async function sendSmsAlert(message) {
        if (!twilioClient || !TWILIO_PHONE_NUMBER || !ALERT_RECIPIENT) {
            console.error("Twilio is not fully configured for SMS alert.");
            return { success: false, message: 'Twilio not configured.' };
        }
        try {
            await twilioClient.messages.create({
                body: message,
                from: TWILIO_PHONE_NUMBER, // Your Twilio number
                to: ALERT_RECIPIENT        // Recipient phone number
            });
            console.log('Twilio Alert SMS sent successfully!');
            return { success: true, message: 'SMS sent via Twilio!' };
        } catch (error) {
            console.error('Error sending alert SMS via Twilio:', error);
            return { success: false, message: `Failed to send SMS: ${error.message}` };
        }
    }

    // --- Main Cloud Function Entry Point ---
    // This function will be triggered by HTTP requests from your dashboard
    exports.sendAlert = (req, res) => {
      corsHandler(req, res, async () => { // Apply CORS to the function
        if (req.method !== 'POST') {
          return res.status(405).send('Method Not Allowed. Only POST requests are accepted.');
        }

        console.log('Cloud Function received request for test alert.');
        const testSubject = 'AuraSense Test Alert (Cloud Function Triggered)';
        const testBody = `This is a test alert sent from your AuraSense dashboard via Google Cloud Function.\n\n` +
                         `Function Time: ${new Date().toLocaleString()}`;
        
        let emailSent = false;
        let smsSent = false;
        let emailMessage = '';
        let smsMessage = '';

        const emailResult = await sendEmailAlert(testSubject, testBody);
        if (emailResult.success) {
            emailSent = true;
            emailMessage = emailResult.message;
        } else {
            emailMessage = `Email failed: ${emailResult.message}`;
        }

        const smsResult = await sendSmsAlert(testBody.substring(0, 160)); // SMS usually max 160 chars
        if (smsResult.success) {
            smsSent = true;
            smsMessage = smsResult.message;
        } else {
            smsMessage = `SMS failed: ${smsResult.message}`;
        }

        if (emailSent && smsSent) {
            res.status(200).json({ status: 'success', message: `Test email and SMS sent successfully! Emails: ${emailMessage}, SMS: ${smsMessage}` });
        } else if (emailSent) {
            res.status(200).json({ status: 'success', message: `Test email sent successfully! ${smsMessage}` });
        } else if (smsSent) {
            res.status(200).json({ status: 'success', message: `Test SMS sent successfully! ${emailMessage}` });
        } else {
            res.status(500).json({ status: 'error', message: `Both email and SMS failed: Email - ${emailMessage}, SMS - ${smsMessage}` });
        }
      });
    };
    
