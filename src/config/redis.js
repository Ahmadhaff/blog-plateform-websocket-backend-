const redis = require('redis');

let redisClient = null;

const connectRedis = async () => {
  const redisUrl = process.env.REDIS_URL;
  const isUpstash = redisUrl && redisUrl.startsWith('rediss://');
  
  // For Upstash Redis (rediss://), configure TLS
  // For local Redis or other providers, use standard config
  const clientOptions = isUpstash
    ? {
        url: redisUrl,
        socket: {
          tls: true,
          rejectUnauthorized: false // Upstash uses self-signed certificates
        }
      }
    : redisUrl && redisUrl.includes('@')
    ? { url: redisUrl } // URL with embedded credentials
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
