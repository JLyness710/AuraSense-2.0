    // index.js (Google Cloud Function)

    // Load environment variables for local testing (will use Cloud Functions' built-in env vars in deployment)
    // require('dotenv').config(); // Uncomment if testing locally with dotenv

    const sgMail = require('@sendgrid/mail');
    const twilio = require('twilio');
    const cors = require('cors'); // Import CORS for the Cloud Function endpoint

    // --- Configuration (from Cloud Function Environment Variables) ---
    // These will be set in the Cloud Function's Runtime, Build, and Connections settings
    const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
    const ALERT_SENDER_EMAIL = process.env.SENDGRID_VERIFIED_SENDER;
    const ALERT_RECIPIENT = process.env.ALERT_RECIPIENT; // Email or phone number for alerts

    const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

    if (!SENDGRID_API_KEY) {
        console.error("ERROR: SENDGRID_API_KEY is not set in Cloud Function environment!");
    } else {
        sgMail.setApiKey(SENDGRID_API_KEY);
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
    
