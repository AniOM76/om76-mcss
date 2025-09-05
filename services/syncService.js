const GoogleCalendarManager = require('../config/google');
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const googleManager = new GoogleCalendarManager();

async function syncEventAcrossCalendars(eventData, sourceCalendarId) {
  try {
    await logSyncActivity('sync_started', sourceCalendarId, eventData.id, 'info', 'Starting sync process');

    const calendarConfigs = await googleManager.getCalendarConfigs();
    const sourceConfig = calendarConfigs.find(config => config.calendar_id === sourceCalendarId);
    
    if (!sourceConfig) {
      throw new Error(`Source calendar ${sourceCalendarId} not found in configurations`);
    }

    const targetConfigs = calendarConfigs.filter(config => 
      config.calendar_id !== sourceCalendarId && config.is_active
    );

    if (targetConfigs.length === 0) {
      console.log(`OM76.MCSS: No target calendars found for sync from ${sourceCalendarId}`);
      return;
    }

    const mappingId = await createEventMapping(eventData, sourceCalendarId);

    const blockPromises = targetConfigs.map(async (targetConfig) => {
      try {
        const calendarService = await googleManager.authenticateCalendar(targetConfig.refresh_token);
        
        const blockEvent = await googleManager.createBlockEvent(
          calendarService,
          targetConfig.calendar_id,
          eventData,
          sourceConfig.calendar_alias
        );

        await createBlockEventRecord(mappingId, blockEvent.id, targetConfig.calendar_id, 
          `${sourceConfig.calendar_alias} Block`);

        await logSyncActivity('block_created', targetConfig.calendar_id, blockEvent.id, 'success', 
          `Block event created for ${sourceConfig.calendar_alias}`);

        return { success: true, calendarId: targetConfig.calendar_id, blockEventId: blockEvent.id };
      } catch (error) {
        await logSyncActivity('block_failed', targetConfig.calendar_id, null, 'error', 
          `Failed to create block event: ${error.message}`);
        return { success: false, calendarId: targetConfig.calendar_id, error: error.message };
      }
    });

    const results = await Promise.allSettled(blockPromises);
    
    const successCount = results.filter(result => 
      result.status === 'fulfilled' && result.value.success
    ).length;

    await updateEventMappingStatus(mappingId, 'completed');
    await logSyncActivity('sync_completed', sourceCalendarId, eventData.id, 'success', 
      `Sync completed: ${successCount}/${targetConfigs.length} block events created`);

    console.log(`OM76.MCSS: Sync completed for event ${eventData.id}: ${successCount}/${targetConfigs.length} successful`);
    
    return { successCount, totalTargets: targetConfigs.length, results };
  } catch (error) {
    await logSyncActivity('sync_failed', sourceCalendarId, eventData.id, 'error', 
      `Sync failed: ${error.message}`);
    throw error;
  }
}

async function updateEventAcrossCalendars(eventData, sourceCalendarId) {
  try {
    await logSyncActivity('update_started', sourceCalendarId, eventData.id, 'info', 'Starting update process');

    const mapping = await getEventMapping(eventData.id, sourceCalendarId);
    if (!mapping) {
      console.log(`OM76.MCSS: No existing mapping found for event ${eventData.id}, creating new sync`);
      return await syncEventAcrossCalendars(eventData, sourceCalendarId);
    }

    const blockEvents = await getBlockEventsForMapping(mapping.id);
    const calendarConfigs = await googleManager.getCalendarConfigs();

    const updatePromises = blockEvents.map(async (blockEvent) => {
      try {
        const targetConfig = calendarConfigs.find(config => 
          config.calendar_id === blockEvent.target_calendar_id
        );
        
        if (!targetConfig) {
          throw new Error(`Target calendar ${blockEvent.target_calendar_id} not found`);
        }

        const calendarService = await googleManager.authenticateCalendar(targetConfig.refresh_token);
        
        await googleManager.updateBlockEvent(
          calendarService,
          blockEvent.target_calendar_id,
          blockEvent.block_event_id,
          eventData
        );

        await logSyncActivity('block_updated', blockEvent.target_calendar_id, 
          blockEvent.block_event_id, 'success', 'Block event updated successfully');

        return { success: true, calendarId: blockEvent.target_calendar_id };
      } catch (error) {
        await logSyncActivity('block_update_failed', blockEvent.target_calendar_id, 
          blockEvent.block_event_id, 'error', `Update failed: ${error.message}`);
        return { success: false, calendarId: blockEvent.target_calendar_id, error: error.message };
      }
    });

    const results = await Promise.allSettled(updatePromises);
    
    const successCount = results.filter(result => 
      result.status === 'fulfilled' && result.value.success
    ).length;

    await updateEventMapping(mapping.id, eventData);
    await logSyncActivity('update_completed', sourceCalendarId, eventData.id, 'success', 
      `Update completed: ${successCount}/${blockEvents.length} block events updated`);

    console.log(`OM76.MCSS: Update completed for event ${eventData.id}: ${successCount}/${blockEvents.length} successful`);
    
    return { successCount, totalBlocks: blockEvents.length, results };
  } catch (error) {
    await logSyncActivity('update_failed', sourceCalendarId, eventData.id, 'error', 
      `Update failed: ${error.message}`);
    throw error;
  }
}

async function deleteEventAcrossCalendars(eventId, sourceCalendarId) {
  try {
    await logSyncActivity('delete_started', sourceCalendarId, eventId, 'info', 'Starting delete process');

    const mapping = await getEventMapping(eventId, sourceCalendarId);
    if (!mapping) {
      console.log(`OM76.MCSS: No mapping found for deleted event ${eventId}`);
      return { successCount: 0, totalBlocks: 0 };
    }

    const blockEvents = await getBlockEventsForMapping(mapping.id);
    const calendarConfigs = await googleManager.getCalendarConfigs();

    const deletePromises = blockEvents.map(async (blockEvent) => {
      try {
        const targetConfig = calendarConfigs.find(config => 
          config.calendar_id === blockEvent.target_calendar_id
        );
        
        if (!targetConfig) {
          throw new Error(`Target calendar ${blockEvent.target_calendar_id} not found`);
        }

        const calendarService = await googleManager.authenticateCalendar(targetConfig.refresh_token);
        
        await googleManager.deleteBlockEvent(
          calendarService,
          blockEvent.target_calendar_id,
          blockEvent.block_event_id
        );

        await logSyncActivity('block_deleted', blockEvent.target_calendar_id, 
          blockEvent.block_event_id, 'success', 'Block event deleted successfully');

        return { success: true, calendarId: blockEvent.target_calendar_id };
      } catch (error) {
        await logSyncActivity('block_delete_failed', blockEvent.target_calendar_id, 
          blockEvent.block_event_id, 'error', `Delete failed: ${error.message}`);
        return { success: false, calendarId: blockEvent.target_calendar_id, error: error.message };
      }
    });

    const results = await Promise.allSettled(deletePromises);
    
    const successCount = results.filter(result => 
      result.status === 'fulfilled' && result.value.success
    ).length;

    await deleteEventMapping(mapping.id);
    await logSyncActivity('delete_completed', sourceCalendarId, eventId, 'success', 
      `Delete completed: ${successCount}/${blockEvents.length} block events removed`);

    console.log(`OM76.MCSS: Delete completed for event ${eventId}: ${successCount}/${blockEvents.length} successful`);
    
    return { successCount, totalBlocks: blockEvents.length, results };
  } catch (error) {
    await logSyncActivity('delete_failed', sourceCalendarId, eventId, 'error', 
      `Delete failed: ${error.message}`);
    throw error;
  }
}

async function createEventMapping(eventData, sourceCalendarId) {
  const mappingId = uuidv4();
  
  await query(
    `INSERT INTO mcss_event_mappings 
     (id, original_event_id, original_calendar_id, original_summary, event_start, event_end, sync_status) 
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      mappingId,
      eventData.id,
      sourceCalendarId,
      eventData.summary,
      eventData.start?.dateTime || eventData.start?.date,
      eventData.end?.dateTime || eventData.end?.date,
      'pending'
    ]
  );
  
  return mappingId;
}

async function getEventMapping(eventId, calendarId) {
  const result = await query(
    'SELECT * FROM mcss_event_mappings WHERE original_event_id = $1 AND original_calendar_id = $2',
    [eventId, calendarId]
  );
  
  return result.rows[0] || null;
}

async function updateEventMapping(mappingId, eventData) {
  await query(
    `UPDATE mcss_event_mappings 
     SET original_summary = $1, event_start = $2, event_end = $3, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $4`,
    [
      eventData.summary,
      eventData.start?.dateTime || eventData.start?.date,
      eventData.end?.dateTime || eventData.end?.date,
      mappingId
    ]
  );
}

async function updateEventMappingStatus(mappingId, status) {
  await query(
    'UPDATE mcss_event_mappings SET sync_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [status, mappingId]
  );
}

async function deleteEventMapping(mappingId) {
  await query('DELETE FROM mcss_event_mappings WHERE id = $1', [mappingId]);
}

async function createBlockEventRecord(mappingId, blockEventId, targetCalendarId, blockTitle) {
  await query(
    'INSERT INTO mcss_block_events (mapping_id, block_event_id, target_calendar_id, block_title) VALUES ($1, $2, $3, $4)',
    [mappingId, blockEventId, targetCalendarId, blockTitle]
  );
}

async function getBlockEventsForMapping(mappingId) {
  const result = await query(
    'SELECT * FROM mcss_block_events WHERE mapping_id = $1',
    [mappingId]
  );
  
  return result.rows;
}

async function logSyncActivity(eventType, calendarId, eventId, status, message, metadata = null) {
  try {
    await query(
      'INSERT INTO mcss_sync_logs (event_type, calendar_id, event_id, status, message, metadata) VALUES ($1, $2, $3, $4, $5, $6)',
      [eventType, calendarId, eventId, status, message, JSON.stringify(metadata)]
    );
  } catch (error) {
    console.error('OM76.MCSS: Failed to log sync activity:', error);
  }
}

module.exports = {
  syncEventAcrossCalendars,
  updateEventAcrossCalendars,
  deleteEventAcrossCalendars,
  logSyncActivity
};