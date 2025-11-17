const redis = require('redis');

let redisClient = null;

const connectRedis = async () => {
  const redisUrl = process.env.REDIS_URL;
  
  // Check if URL uses rediss:// (Redis over TLS)
  const useTLS = redisUrl && redisUrl.startsWith('rediss://');
  
  const clientConfig = {
    url: redisUrl
  };
  
  // Only add TLS config if using rediss://
  if (useTLS) {
    clientConfig.socket = {
      tls: true,
      rejectUnauthorized: true
    };
  }

  redisClient = redis.createClient(clientConfig);

  redisClient.on('error', (err) => console.error('❌ Redis Error:', err));
  redisClient.on('connect', () => console.log('✅ Redis connected'));
  redisClient.on('reconnecting', () => console.log('🔄 Redis reconnecting...'));

  try {
    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    throw error;
  }
};

const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized');
  }
  return redisClient;
};

module.exports = { getRedisClient, connectRedis };
