import Stripe from 'stripe';
import { Injectable } from '@nestjs/common';
import { InjectStripeClient } from '@golevelup/nestjs-stripe';

import {
  PayShipmentRequest,
  StripeCheckoutSessionResult,
  IPayShipment,
} from './IPayShipment';
import { OrderRepository } from '../../persistence/OrderRepository';
import { InjectClient } from 'nest-mongodb';
import { ClientSession, MongoClient } from 'mongodb';
import {
  StripeCheckoutSession,
  StripePrice,
  stripePrice,
  withTransaction,
} from '../../../common/application';
import { OrderStatus } from '../../entity/Order';
import { FeeType } from '../StripeCheckoutWebhook/IStripeCheckoutWebhook';

@Injectable()
export class PayShipmentService implements IPayShipment {
  constructor(
    private readonly orderRepository: OrderRepository,
    @InjectStripeClient() private readonly stripe: Stripe,
    @InjectClient() private readonly mongoClient: MongoClient,
  ) {}

  async execute(
    payShipmentRequest: PayShipmentRequest,
    session?: ClientSession,
  ): Promise<StripeCheckoutSessionResult> {
    const checkoutSession: Stripe.Checkout.Session = await withTransaction(
      (sessionWithTransaction: ClientSession) =>
        this.createPaymentSession(payShipmentRequest, sessionWithTransaction),
      this.mongoClient,
      session,
    );

    return {
      checkoutId: checkoutSession.id,
    };
  }

  // TODO: Error handling and rejection events
  private async createPaymentSession(
    { orderId, customerId }: PayShipmentRequest,
    session: ClientSession,
  ): Promise<StripeCheckoutSession> {
    const { finalShipmentCost } = await this.orderRepository.findOrder(
      { orderId, status: OrderStatus.Finalized, customerId },
      session,
    );

    const price: StripePrice = stripePrice(finalShipmentCost);

    const checkoutSession = (await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: 'rafa.sofizadeh@gmail.com',
      line_items: [
        {
          price_data: {
            ...price,
            product_data: {
              name: 'Order Shipment Fee',
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        feeType: FeeType.Shipment,
        orderId,
      },
      mode: 'payment',
      success_url: 'https://news.ycombinator.com',
      cancel_url: 'https://reddit.com',
    })) as Stripe.Response<StripeCheckoutSession>;

    return checkoutSession;
  }
}
