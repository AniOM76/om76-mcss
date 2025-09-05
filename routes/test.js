const express = require('express');
const GoogleCalendarManager = require('../config/google');
const { query } = require('../config/database');

const router = express.Router();
const googleManager = new GoogleCalendarManager();

router.get('/calendar/:calendarId/events', async (req, res) => {
  try {
    const { calendarId } = req.params;
    const { days = 7 } = req.query;

    const calendarConfig = await query(
      'SELECT * FROM mcss_calendar_configs WHERE calendar_id = $1',
      [calendarId]
    );

    if (calendarConfig.rows.length === 0) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    const config = calendarConfig.rows[0];
    
    if (!config.refresh_token) {
      return res.status(401).json({ 
        error: 'Calendar not authorized',
        calendar_alias: config.calendar_alias,
        auth_url: `http://localhost:3000/auth/authorize/${calendarId}`
      });
    }

    const calendarService = await googleManager.authenticateCalendar(config.refresh_token);
    
    const timeMin = new Date();
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + parseInt(days));

    // Use the calendar service directly instead of the manager method
    const params = {
      calendarId: calendarId,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString()
    };

    const response = await calendarService.events().list(params);
    const events = response.data.items || [];

    res.json({
      calendar_id: calendarId,
      calendar_alias: config.calendar_alias,
      time_range: {
        from: timeMin.toISOString(),
        to: timeMax.toISOString(),
        days: parseInt(days)
      },
      events_count: events.length,
      events: events.map(event => ({
        id: event.id,
        summary: event.summary || '(No title)',
        start: event.start,
        end: event.end,
        status: event.status,
        creator: event.creator?.email,
        created: event.created,
        updated: event.updated
      }))
    });

  } catch (error) {
    console.error('OM76.MCSS: Test calendar error:', error);
    res.status(500).json({
      error: 'Failed to fetch calendar events',
      message: error.message
    });
  }
});

router.post('/calendar/:calendarId/test-event', async (req, res) => {
  try {
    const { calendarId } = req.params;

    const calendarConfig = await query(
      'SELECT * FROM mcss_calendar_configs WHERE calendar_id = $1',
      [calendarId]
    );

    if (calendarConfig.rows.length === 0) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    const config = calendarConfig.rows[0];
    
    if (!config.refresh_token) {
      return res.status(401).json({ 
        error: 'Calendar not authorized',
        calendar_alias: config.calendar_alias
      });
    }

    const calendarService = await googleManager.authenticateCalendar(config.refresh_token);
    
    const now = new Date();
    const startTime = new Date(now.getTime() + 60000); // 1 minute from now
    const endTime = new Date(startTime.getTime() + 3600000); // 1 hour duration

    const testEvent = {
      summary: 'OM76.MCSS Test Event',
      description: 'Test event created by OM76.MCSS to verify calendar integration',
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'America/New_York'
      },
      end: {
        dateTime: endTime.toISOString(), 
        timeZone: 'America/New_York'
      },
      reminders: {
        useDefault: false,
        overrides: []
      }
    };

    const response = await calendarService.events().insert({
      calendarId: calendarId,
      requestBody: testEvent
    });

    res.json({
      success: true,
      message: 'Test event created successfully',
      calendar_id: calendarId,
      calendar_alias: config.calendar_alias,
      event: {
        id: response.data.id,
        summary: response.data.summary,
        start: response.data.start,
        end: response.data.end,
        htmlLink: response.data.htmlLink
      }
    });

  } catch (error) {
    console.error('OM76.MCSS: Create test event error:', error);
    res.status(500).json({
      error: 'Failed to create test event',
      message: error.message
    });
  }
});

router.get('/sync/:calendarId', async (req, res) => {
  try {
    const { calendarId } = req.params;

    const calendarConfig = await query(
      'SELECT * FROM mcss_calendar_configs WHERE calendar_id = $1',
      [calendarId]
    );

    if (calendarConfig.rows.length === 0) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    const config = calendarConfig.rows[0];
    
    if (!config.refresh_token) {
      return res.status(401).json({ 
        error: 'Calendar not authorized',
        calendar_alias: config.calendar_alias
      });
    }

    const allConfigs = await googleManager.getCalendarConfigs();
    const authorizedConfigs = allConfigs.filter(c => c.refresh_token && c.calendar_id !== calendarId);

    if (authorizedConfigs.length === 0) {
      return res.json({
        message: 'No target calendars available for sync test',
        source_calendar: config.calendar_alias,
        authorized_calendars: allConfigs.filter(c => c.refresh_token).length,
        total_calendars: allConfigs.length
      });
    }

    res.json({
      message: 'Sync test configuration',
      source_calendar: {
        id: calendarId,
        alias: config.calendar_alias,
        authorized: true
      },
      target_calendars: authorizedConfigs.map(c => ({
        id: c.calendar_id,
        alias: c.calendar_alias,
        authorized: true
      })),
      next_steps: [
        'Create a test event in the source calendar',
        'The system will automatically create block events in target calendars',
        'Check the queue status and sync logs'
      ]
    });

  } catch (error) {
    console.error('OM76.MCSS: Sync test error:', error);
    res.status(500).json({
      error: 'Failed to check sync configuration',
      message: error.message
    });
  }
});

module.exports = router;