const redis = require('redis');

let redisClient = null;

const connectRedis = async () => {
  // If REDIS_URL contains credentials (rediss:// or redis:// with @), use only URL
  // Otherwise, use separate password option
  const redisUrl = process.env.REDIS_URL;
  const hasCredentialsInUrl = redisUrl && (redisUrl.includes('@') || redisUrl.includes('://'));
  
  const clientOptions = hasCredentialsInUrl
    ? { url: redisUrl }
    : {
        url: redisUrl || 'redis://localhost:6379',
        password: process.env.REDIS_PASSWORD || undefined
      };

  redisClient = redis.createClient(clientOptions);

  redisClient.on('error', (err) => console.error('❌ Redis Error:', err));
  redisClient.on('connect', () => {
    console.log('✅ Redis connected');
  });
  redisClient.on('reconnecting', () => {
    console.log('🔄 Redis reconnecting...');
  });

  await redisClient.connect();
  return redisClient;
};

const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized');
  }
  return redisClient;
};

module.exports = { connectRedis, getRedisClient };
