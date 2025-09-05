const Queue = require('bull');
const { syncEventAcrossCalendars } = require('./syncService');

const OM76_EVENT_SYNC_QUEUE = new Queue('om76-mcss-event-sync', process.env.REDIS_URL, {
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  }
});

OM76_EVENT_SYNC_QUEUE.process('syncEvent', 5, async (job) => {
  const { eventData, sourceCalendarId } = job.data;
  
  try {
    console.log(`OM76.MCSS: Processing sync for event ${eventData.id} from ${sourceCalendarId}`);
    
    await syncEventAcrossCalendars(eventData, sourceCalendarId);
    
    console.log(`OM76.MCSS: Successfully synced event ${eventData.id}`);
    return { status: 'completed', eventId: eventData.id };
  } catch (error) {
    console.error(`OM76.MCSS: Failed to sync event ${eventData.id}:`, error.message);
    throw error;
  }
});

OM76_EVENT_SYNC_QUEUE.on('completed', (job, result) => {
  console.log(`OM76.MCSS: Job ${job.id} completed successfully`);
});

OM76_EVENT_SYNC_QUEUE.on('failed', (job, err) => {
  console.error(`OM76.MCSS: Job ${job.id} failed:`, err.message);
});

async function addOM76SyncJob(eventData, sourceCalendarId, priority = 'normal') {
  const jobOptions = {
    priority: priority === 'high' ? 1 : 10,
    delay: priority === 'immediate' ? 0 : 1000
  };
  
  return OM76_EVENT_SYNC_QUEUE.add('syncEvent', 
    { eventData, sourceCalendarId },
    jobOptions
  );
}

async function getQueueStatus() {
  try {
    return await OM76_EVENT_SYNC_QUEUE.getJobCounts();
  } catch (error) {
    console.error('OM76.MCSS: Failed to get queue status:', error);
    return { active: 0, waiting: 0, completed: 0, failed: 0 };
  }
}

async function initializeOM76Queues() {
  try {
    console.log('OM76.MCSS: Event sync queue initialized on Railway');
    
    await OM76_EVENT_SYNC_QUEUE.isReady();
    console.log('OM76.MCSS: Queue connection verified');
  } catch (error) {
    console.error('OM76.MCSS: Queue initialization failed:', error);
    throw error;
  }
}

module.exports = {
  addOM76SyncJob,
  getQueueStatus,
  initializeOM76Queues
};