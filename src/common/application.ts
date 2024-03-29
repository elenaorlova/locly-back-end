import { ClientSession, MongoClient } from 'mongodb';
import { Stripe } from 'stripe';
import { Cost } from '../order/entity/Order';
import { StripeCheckoutWebhookPayload } from '../order/application/StripeCheckoutWebhook/IStripeCheckoutWebhook';

export abstract class UseCase<TUseCasePort, TUseCaseResult> {
  // TODO: abstract signature doesn't affect type checker anywhere else
  abstract execute(
    port: TUseCasePort,
    mongoTransactionSession?: ClientSession,
  ): Promise<TUseCaseResult>;
}

export async function withTransaction<T>(
  fn: (mongoTransactionSession: ClientSession) => Promise<T>,
  mongoClient: MongoClient,
  mongoTransactionSession?: ClientSession,
): Promise<T> {
  // Session takes precendence over mongoClient
  return mongoTransactionSession === undefined
    ? await withNewSessionTransaction(mongoClient, fn)
    : await withExistingSessionTransaction(mongoTransactionSession, fn);
}

async function withExistingSessionTransaction<T>(
  mongoTransactionSession: ClientSession,
  fn: (mongoTransactionSession: ClientSession) => Promise<T>,
): Promise<T> {
  // Session already in transaction, program will assume it's already wrapped in mongoTransactionSession.withTransaction
  if (mongoTransactionSession.inTransaction()) {
    console.warn(
      "Session already in transaction, program will assume it's already wrapped in mongoTransactionSession.withTransaction",
    );
    return fn(mongoTransactionSession);
  }

  let result: T;
  await mongoTransactionSession.withTransaction(
    async () => (result = await fn(mongoTransactionSession)),
  );
  return result;
}

async function withNewSessionTransaction<T>(
  mongoClient: MongoClient,
  fn: (mongoTransactionSession: ClientSession) => Promise<T>,
): Promise<T> {
  let result: T;

  await mongoClient.withSession(
    async (mongoTransactionSession: ClientSession) =>
      await mongoTransactionSession.withTransaction(
        async (sessionWithTransaction: ClientSession) =>
          (result = await fn(sessionWithTransaction)),
      ),
  );

  return result;
}

export function stripePrice({ currency, amount }: Cost): StripePrice {
  return {
    currency: currency,
    unit_amount: Math.floor(amount * 100),
  };
}

export type StripePrice = Pick<
  Stripe.Checkout.SessionCreateParams.LineItem.PriceData,
  'currency' | 'unit_amount'
>;

export type StripeEvent = Omit<Stripe.Event, 'type'> & {
  type: Stripe.WebhookEndpointCreateParams.EnabledEvent;
};

export type StripeCheckoutSession = Stripe.Checkout.Session & {
  metadata: StripeCheckoutWebhookPayload;
};

export type StripeCheckoutSessionResult = {
  readonly checkoutId: string;
};
