import amqp, { Channel, ConsumeMessage } from 'amqplib';
import { Logger, ExecutionJob, ExploreJob } from '@platform/shared';

const EXCHANGE = 'test-execution';
const QUEUE = 'execution.jobs';
const RETRY_QUEUE = 'execution.retry';
const DLQ = 'execution.dlq';
const ROUTING_KEY = 'execute';
const EXPLORE_QUEUE = 'explore.jobs';
const EXPLORE_KEY = 'explore';

type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;

export class RabbitMQService {
  private connection: AmqpConnection | null = null;
  private channel: Channel | null = null;
  private logger = new Logger('rabbitmq');

  constructor(private readonly url: string) {}

  async connect(): Promise<Channel> {
    this.connection = await amqp.connect(this.url);
    this.channel = await this.connection.createChannel();

    const channel = this.channel;
    await channel.assertExchange(EXCHANGE, 'direct', { durable: true });
    await channel.assertQueue(QUEUE, {
      durable: true,
      deadLetterExchange: EXCHANGE,
      deadLetterRoutingKey: 'retry',
    });
    await channel.assertQueue(RETRY_QUEUE, {
      durable: true,
      deadLetterExchange: EXCHANGE,
      deadLetterRoutingKey: 'execute',
      messageTtl: 10000,
    });
    await channel.assertQueue(DLQ, { durable: true });

    await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);
    await channel.bindQueue(RETRY_QUEUE, EXCHANGE, 'retry');
    await channel.bindQueue(DLQ, EXCHANGE, 'dlq');
    await channel.assertQueue(EXPLORE_QUEUE, { durable: true });
    await channel.bindQueue(EXPLORE_QUEUE, EXCHANGE, EXPLORE_KEY);

    channel.prefetch(5);
    this.logger.info('RabbitMQ connected');
    return channel;
  }

  async publishJob(job: ExecutionJob): Promise<void> {
    if (!this.channel) throw new Error('RabbitMQ not connected');
    this.channel.publish(EXCHANGE, ROUTING_KEY, Buffer.from(JSON.stringify(job)), {
      persistent: true,
      contentType: 'application/json',
    });
    this.logger.info('Job published', { executionId: job.executionId });
  }

  async publishExploreJob(job: ExploreJob): Promise<void> {
    if (!this.channel) throw new Error('RabbitMQ not connected');
    this.channel.publish(EXCHANGE, EXPLORE_KEY, Buffer.from(JSON.stringify(job)), {
      persistent: true,
      contentType: 'application/json',
    });
    this.logger.info('Explore job published', { exploreId: job.exploreId });
  }

  async consumeExplore(handler: (job: ExploreJob) => Promise<void>): Promise<void> {
    if (!this.channel) throw new Error('RabbitMQ not connected');
    const channel = this.channel;
    await channel.consume(EXPLORE_QUEUE, async (msg) => {
      if (!msg) return;
      try {
        const job: ExploreJob = JSON.parse(msg.content.toString());
        await handler(job);
        channel.ack(msg);
      } catch (err) {
        this.logger.error('Explore job failed', { error: (err as Error).message });
        channel.ack(msg);
      }
    });
  }

  async consume(handler: (job: ExecutionJob, msg: ConsumeMessage) => Promise<void>): Promise<void> {
    if (!this.channel) throw new Error('RabbitMQ not connected');
    const channel = this.channel;
    await channel.consume(QUEUE, async (msg) => {
      if (!msg) return;
      try {
        const job: ExecutionJob = JSON.parse(msg.content.toString());
        await handler(job, msg);
        channel.ack(msg);
      } catch (err) {
        this.logger.error('Job processing failed', { error: (err as Error).message });
        const retryCount = (msg.properties.headers?.['x-retry-count'] as number) || 0;
        if (retryCount < 3) {
          channel.publish(EXCHANGE, 'retry', msg.content, {
            persistent: true,
            headers: { 'x-retry-count': retryCount + 1 },
          });
        } else {
          channel.publish(EXCHANGE, 'dlq', msg.content, { persistent: true });
        }
        channel.ack(msg);
      }
    });
  }

  async close(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }
}
