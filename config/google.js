const { google } = require('googleapis');
const { query } = require('./database');

class GoogleCalendarManager {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.WEBHOOK_BASE_URL}/auth/callback`
    );
  }

  async authenticateCalendar(refreshToken) {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken
      });
      
      return google.calendar({ 
        version: 'v3', 
        auth: this.oauth2Client 
      });
    } catch (error) {
      console.error('OM76.MCSS: Google Calendar authentication failed:', error);
      throw error;
    }
  }

  async setupWebhook(calendarService, calendarId) {
    try {
      const webhookUrl = `${process.env.WEBHOOK_BASE_URL}/webhooks/calendar/${calendarId}`;
      
      const watchRequest = {
        id: `om76-mcss-${calendarId}-${Date.now()}`,
        type: 'web_hook',
        address: webhookUrl,
        params: {
          ttl: '3600'
        }
      };
      
      const response = await calendarService.events().watch({
        calendarId: calendarId,
        requestBody: watchRequest
      });

      await query(
        'UPDATE mcss_calendar_configs SET webhook_id = $1, webhook_resource_id = $2 WHERE calendar_id = $3',
        [response.data.id, response.data.resourceId, calendarId]
      );

      console.log(`OM76.MCSS: Webhook setup successful for calendar ${calendarId}`);
      return response.data;
    } catch (error) {
      console.error(`OM76.MCSS: Webhook setup failed for calendar ${calendarId}:`, error);
      throw error;
    }
  }

  async getCalendarEvents(calendarService, calendarId, timeMin = null, timeMax = null) {
    try {
      const params = {
        calendarId: calendarId,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 2500
      };

      if (timeMin) params.timeMin = timeMin;
      if (timeMax) params.timeMax = timeMax;

      const response = await calendarService.events().list(params);
      return response.data.items || [];
    } catch (error) {
      console.error(`OM76.MCSS: Failed to get events from calendar ${calendarId}:`, error);
      throw error;
    }
  }

  async createBlockEvent(calendarService, targetCalendarId, originalEvent, sourceCalendarAlias) {
    try {
      const blockEvent = {
        summary: `${sourceCalendarAlias} Block`,
        start: originalEvent.start,
        end: originalEvent.end,
        description: `Private block event created by OM76.MCSS\nOriginal: ${originalEvent.summary || 'No title'}`,
        visibility: 'private',
        transparency: 'opaque'
      };

      const response = await calendarService.events().insert({
        calendarId: targetCalendarId,
        requestBody: blockEvent
      });

      console.log(`OM76.MCSS: Block event created in ${targetCalendarId} for ${sourceCalendarAlias}`);
      return response.data;
    } catch (error) {
      console.error(`OM76.MCSS: Failed to create block event in ${targetCalendarId}:`, error);
      throw error;
    }
  }

  async updateBlockEvent(calendarService, targetCalendarId, blockEventId, originalEvent) {
    try {
      const updateData = {
        start: originalEvent.start,
        end: originalEvent.end,
        description: `Private block event created by OM76.MCSS\nOriginal: ${originalEvent.summary || 'No title'}`
      };

      const response = await calendarService.events().update({
        calendarId: targetCalendarId,
        eventId: blockEventId,
        requestBody: updateData
      });

      console.log(`OM76.MCSS: Block event ${blockEventId} updated in ${targetCalendarId}`);
      return response.data;
    } catch (error) {
      console.error(`OM76.MCSS: Failed to update block event ${blockEventId}:`, error);
      throw error;
    }
  }

  async deleteBlockEvent(calendarService, targetCalendarId, blockEventId) {
    try {
      await calendarService.events().delete({
        calendarId: targetCalendarId,
        eventId: blockEventId
      });

      console.log(`OM76.MCSS: Block event ${blockEventId} deleted from ${targetCalendarId}`);
    } catch (error) {
      if (error.code === 404) {
        console.log(`OM76.MCSS: Block event ${blockEventId} already deleted from ${targetCalendarId}`);
        return;
      }
      console.error(`OM76.MCSS: Failed to delete block event ${blockEventId}:`, error);
      throw error;
    }
  }

  async getCalendarConfigs() {
    try {
      const result = await query(
        'SELECT * FROM mcss_calendar_configs WHERE is_active = true ORDER BY calendar_alias'
      );
      return result.rows;
    } catch (error) {
      console.error('OM76.MCSS: Failed to get calendar configs:', error);
      throw error;
    }
  }
}

module.exports = GoogleCalendarManager;