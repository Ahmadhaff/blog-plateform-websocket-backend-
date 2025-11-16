const redis = require('redis');

let redisClient = null;

const connectRedis = async () => {
  redisClient = redis.createClient({
    url: process.env.REDIS_URL,
    password: process.env.REDIS_PASSWORD || undefined
  });

  redisClient.on('error', (err) => console.error('❌ Redis Error:', err));
  redisClient.on('connect', () => console.log('✅ Redis connected'));

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
