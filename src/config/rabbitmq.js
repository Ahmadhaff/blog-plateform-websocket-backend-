const amqp = require('amqplib');

let rabbitChannel = null;
let rabbitConnection = null;

const connectRabbitMQ = async () => {
  try {
    rabbitConnection = await amqp.connect(process.env.RABBITMQ_URL);
    rabbitChannel = await rabbitConnection.createChannel();

    await rabbitChannel.assertExchange('blog-events', 'topic', { durable: true });

    console.log('✅ RabbitMQ connected');
    return rabbitChannel;
  } catch (error) {
    console.error('❌ RabbitMQ connection error:', error);
    setTimeout(connectRabbitMQ, 5000);
  }
};

const getRabbitChannel = () => {
  if (!rabbitChannel) {
    throw new Error('RabbitMQ channel not initialized');
  }
  return rabbitChannel;
};

module.exports = {
  connectRabbitMQ,
  getRabbitChannel
};
