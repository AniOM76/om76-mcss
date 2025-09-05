const express = require('express');
const { google } = require('googleapis');
const { query } = require('../config/database');

const router = express.Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

router.get('/authorize/:calendarId', async (req, res) => {
  try {
    const { calendarId } = req.params;
    
    const calendar = await query(
      'SELECT * FROM mcss_calendar_configs WHERE calendar_id = $1',
      [calendarId]
    );
    
    if (calendar.rows.length === 0) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: calendarId,
      prompt: 'consent'
    });

    res.json({
      message: `OAuth authorization for ${calendar.rows[0].calendar_alias}`,
      calendar_id: calendarId,
      auth_url: authUrl,
      instructions: [
        '1. Click the auth_url to authorize OM76.MCSS',
        '2. Grant calendar permissions',
        '3. You will be redirected back with the authorization code',
        '4. The refresh token will be automatically stored'
      ]
    });
  } catch (error) {
    console.error('OM76.MCSS: Authorization error:', error);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

router.get('/callback', async (req, res) => {
  try {
    const { code, state: calendarId, error } = req.query;

    if (error) {
      return res.status(400).json({ 
        error: 'Authorization denied', 
        details: error 
      });
    }

    if (!code || !calendarId) {
      return res.status(400).json({ 
        error: 'Missing authorization code or calendar ID' 
      });
    }

    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      return res.status(400).json({
        error: 'No refresh token received. Please revoke access and try again with prompt=consent'
      });
    }

    await query(
      'UPDATE mcss_calendar_configs SET access_token = $1, refresh_token = $2, updated_at = CURRENT_TIMESTAMP WHERE calendar_id = $3',
      [tokens.access_token, tokens.refresh_token, calendarId]
    );

    const calendar = await query(
      'SELECT calendar_alias, calendar_name FROM mcss_calendar_configs WHERE calendar_id = $1',
      [calendarId]
    );

    console.log(`OM76.MCSS: Successfully authorized ${calendar.rows[0].calendar_alias} (${calendarId})`);

    res.json({
      success: true,
      message: `Successfully authorized ${calendar.rows[0].calendar_alias}`,
      calendar_id: calendarId,
      calendar_name: calendar.rows[0].calendar_name,
      has_refresh_token: !!tokens.refresh_token,
      next_steps: [
        'Calendar is now authorized',
        'You can test the calendar access',
        'Set up webhooks for real-time sync'
      ]
    });

  } catch (error) {
    console.error('OM76.MCSS: OAuth callback error:', error);
    res.status(500).json({ 
      error: 'Failed to process authorization callback',
      details: error.message 
    });
  }
});

router.get('/status', async (req, res) => {
  try {
    const calendars = await query(
      'SELECT calendar_id, calendar_alias, calendar_name, is_active, refresh_token IS NOT NULL as has_token FROM mcss_calendar_configs ORDER BY calendar_alias'
    );

    res.json({
      service: 'OM76.MCSS OAuth Status',
      calendars: calendars.rows,
      summary: {
        total: calendars.rows.length,
        authorized: calendars.rows.filter(c => c.has_token).length,
        active: calendars.rows.filter(c => c.is_active).length
      }
    });
  } catch (error) {
    console.error('OM76.MCSS: Status error:', error);
    res.status(500).json({ error: 'Failed to get authorization status' });
  }
});

router.post('/revoke/:calendarId', async (req, res) => {
  try {
    const { calendarId } = req.params;

    const result = await query(
      'UPDATE mcss_calendar_configs SET access_token = NULL, refresh_token = NULL WHERE calendar_id = $1 RETURNING calendar_alias',
      [calendarId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    res.json({
      success: true,
      message: `Revoked authorization for ${result.rows[0].calendar_alias}`,
      calendar_id: calendarId
    });
  } catch (error) {
    console.error('OM76.MCSS: Revoke error:', error);
    res.status(500).json({ error: 'Failed to revoke authorization' });
  }
});

module.exports = router;