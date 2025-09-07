const express = require('express');
const { addOM76SyncJob } = require('../services/queueService');
const { logSyncActivity } = require('../services/syncService');
const GoogleCalendarManager = require('../config/google');

const router = express.Router();
const googleManager = new GoogleCalendarManager();

router.post('/calendar/:calendarId', async (req, res) => {
  try {
    const { calendarId } = req.params;
    const headers = req.headers;
    
    if (!headers['x-goog-channel-id'] || !headers['x-goog-resource-id']) {
      console.log('OM76.MCSS: Invalid webhook headers received');
      return res.status(400).json({ error: 'Invalid webhook headers' });
    }

    await logSyncActivity('webhook_received', calendarId, null, 'info', 
      'Webhook notification received', { headers: headers });

    console.log(`OM76.MCSS: Webhook received for calendar ${calendarId}`);

    if (headers['x-goog-resource-state'] === 'sync') {
      console.log('OM76.MCSS: Sync message received, acknowledging');
      return res.status(200).json({ message: 'Sync acknowledged' });
    }

    const calendarConfigs = await googleManager.getCalendarConfigs();
    const sourceConfig = calendarConfigs.find(config => config.calendar_id === calendarId);
    
    if (!sourceConfig || !sourceConfig.is_active) {
      console.log(`OM76.MCSS: Calendar ${calendarId} not found or inactive`);
      return res.status(404).json({ error: 'Calendar not found or inactive' });
    }

    try {
      const calendarService = await googleManager.authenticateCalendar(sourceConfig.refresh_token);
      
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
      const oneDayFromNow = new Date(now.getTime() + (24 * 60 * 60 * 1000));
      
      const recentEvents = await googleManager.getCalendarEvents(
        calendarService,
        calendarId,
        oneHourAgo.toISOString(),
        oneDayFromNow.toISOString()
      );

      if (recentEvents && recentEvents.length > 0) {
        console.log(`OM76.MCSS: Found ${recentEvents.length} recent events, processing...`);
        
        const jobPromises = recentEvents
          .filter(event => !isBlockEvent(event, sourceConfig.calendar_alias))
          .map(event => {
            console.log(`OM76.MCSS: Queueing sync for event: ${event.id} - ${event.summary}`);
            return addOM76SyncJob(event, calendarId, 'normal');
          });

        await Promise.all(jobPromises);
        
        await logSyncActivity('webhook_processed', calendarId, null, 'success', 
          `${jobPromises.length} sync jobs queued`);
      } else {
        console.log('OM76.MCSS: No recent events found to process');
      }

    } catch (authError) {
      console.error(`OM76.MCSS: Authentication failed for calendar ${calendarId}:`, authError);
      await logSyncActivity('webhook_auth_failed', calendarId, null, 'error', 
        `Authentication failed: ${authError.message}`);
      return res.status(401).json({ error: 'Calendar authentication failed' });
    }

    res.status(200).json({ 
      message: 'Webhook processed successfully',
      calendar: calendarId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('OM76.MCSS: Webhook processing error:', error);
    await logSyncActivity('webhook_error', req.params.calendarId, null, 'error', 
      `Webhook error: ${error.message}`);
    
    res.status(500).json({ 
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/verify/:calendarId', async (req, res) => {
  try {
    const { calendarId } = req.params;
    
    console.log(`OM76.MCSS: Webhook verification requested for calendar ${calendarId}`);
    
    res.status(200).json({
      message: 'Webhook endpoint verified',
      calendar: calendarId,
      service: 'OM76.MCSS',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('OM76.MCSS: Webhook verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.post('/manual-sync/:calendarId', async (req, res) => {
  try {
    const { calendarId } = req.params;
    const { eventId } = req.body;

    if (!eventId) {
      return res.status(400).json({ error: 'Event ID is required' });
    }

    console.log(`OM76.MCSS: Manual sync requested for event ${eventId} from calendar ${calendarId}`);

    const calendarConfigs = await googleManager.getCalendarConfigs();
    const sourceConfig = calendarConfigs.find(config => config.calendar_id === calendarId);
    
    if (!sourceConfig || !sourceConfig.is_active) {
      return res.status(404).json({ error: 'Calendar not found or inactive' });
    }

    const calendarService = await googleManager.authenticateCalendar(sourceConfig.refresh_token);
    
    try {
      const event = await calendarService.events.get({
        calendarId: calendarId,
        eventId: eventId
      });

      if (isBlockEvent(event.data, sourceConfig.calendar_alias)) {
        return res.status(400).json({ error: 'Cannot sync block events' });
      }

      const job = await addOM76SyncJob(event.data, calendarId, 'high');
      
      await logSyncActivity('manual_sync_requested', calendarId, eventId, 'info', 
        'Manual sync job queued');

      res.status(200).json({
        message: 'Manual sync queued successfully',
        jobId: job.id,
        eventId: eventId,
        calendar: calendarId,
        timestamp: new Date().toISOString()
      });

    } catch (eventError) {
      console.error(`OM76.MCSS: Failed to get event ${eventId}:`, eventError);
      res.status(404).json({ error: 'Event not found' });
    }

  } catch (error) {
    console.error('OM76.MCSS: Manual sync error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function isBlockEvent(event, calendarAlias) {
  if (!event || !event.summary) return false;
  
  const summary = event.summary.toLowerCase();
  const alias = calendarAlias?.toLowerCase();
  
  if (summary.includes('block') && (
    summary.includes('calendar') ||
    summary.includes('om76') ||
    summary.includes('mcss') ||
    (alias && summary.includes(alias))
  )) {
    return true;
  }
  
  if (event.description && event.description.includes('OM76.MCSS')) {
    return true;
  }
  
  return false;
}

module.exports = router;