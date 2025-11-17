const redis = require('redis');

let redisClient = null;

const connectRedis = async () => {

  const redisUrl = process.env.REDIS_URL;
  const isUpstash = redisUrl && redisUrl.startsWith('rediss://');
  
  // For Upstash Redis (rediss://), configure TLS and parse URL
  let clientOptions;
  
  if (isUpstash) {
    // For Upstash Redis, use the URL directly with TLS configuration
    // The redis client will parse the credentials from the URL automatically
    clientOptions = {
      url: redisUrl,
      socket: {
        tls: true,
        rejectUnauthorized: false
      }
    };
    
    // Log connection info (without exposing the full token)
    try {
      const url = new URL(redisUrl);
      console.log(`🔗 Connecting to Upstash Redis at ${url.hostname}:${url.port || 6379}`);
    } catch (error) {
      console.log(`🔗 Connecting to Upstash Redis`);
    }
  } else if (redisUrl && redisUrl.includes('@')) {
    // URL with embedded credentials (non-TLS)
    clientOptions = { url: redisUrl };
  } else {
    // Local Redis or URL without credentials
    clientOptions = {
      url: redisUrl || 'redis://localhost:6379',
      password: process.env.REDIS_PASSWORD || undefined
    };
  }

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
