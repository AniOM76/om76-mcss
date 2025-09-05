const redis = require('redis');

let redisClient = null;

async function initializeRedisConnection() {
  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL,
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          console.error('OM76.MCSS: Redis server refused connection');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          console.error('OM76.MCSS: Redis retry time exhausted');
          return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
          console.error('OM76.MCSS: Redis max retry attempts reached');
          return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
      }
    });

    redisClient.on('connect', () => {
      console.log('OM76.MCSS: Redis client connecting...');
    });

    redisClient.on('ready', () => {
      console.log('OM76.MCSS: Redis client connected to Railway Redis');
    });

    redisClient.on('error', (err) => {
      console.error('OM76.MCSS: Redis connection error:', err);
    });

    redisClient.on('end', () => {
      console.log('OM76.MCSS: Redis connection ended');
    });

    await redisClient.connect();
    
    await redisClient.ping();
    console.log('OM76.MCSS: Redis connection verified');
    
    return redisClient;
  } catch (error) {
    console.error('OM76.MCSS: Redis initialization failed:', error);
    throw error;
  }
}

function getRedisClient() {
  if (!redisClient) {
    throw new Error('OM76.MCSS: Redis client not initialized. Call initializeRedisConnection() first.');
  }
  return redisClient;
}

async function closeRedisConnection() {
  if (redisClient) {
    await redisClient.quit();
    console.log('OM76.MCSS: Redis connection closed');
  }
}

module.exports = {
  initializeRedisConnection,
  getRedisClient,
  closeRedisConnection
};