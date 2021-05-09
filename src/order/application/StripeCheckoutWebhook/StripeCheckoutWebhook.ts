import { StripeWebhookHandler } from '@golevelup/nestjs-stripe';
import { Injectable } from '@nestjs/common';
import {
  StripeCheckoutSession,
  StripeEvent,
} from '../../../common/application';
import { throwCustomException } from '../../../common/error-handling';
import {
  ConfirmOrderHandlerRequest,
  IConfirmOrderHandler,
} from './handlers/ConfirmOrderHandler/IConfirmOrderHandler';
import {
  PayShipmentHandlerRequest,
  IPayShipmentHandler,
} from './handlers/PayShipmentHandler/IPayShipmentHandler';
import {
  StripeCheckoutResult,
  IStripeCheckoutWebhook,
  FeeType,
  StripeCheckoutWebhookPayload,
} from './IStripeCheckoutWebhook';

@Injectable()
export class StripeCheckoutWebhook implements IStripeCheckoutWebhook {
  constructor(
    private readonly confirmOrderWebhookGateway: IConfirmOrderHandler,
    private readonly payShipmentWebhookGateway: IPayShipmentHandler,
  ) {}

  @StripeWebhookHandler('checkout.session.completed')
  execute(event: StripeEvent): Promise<StripeCheckoutResult> {
    const webhookPayload = (event.data.object as StripeCheckoutSession)
      .metadata as StripeCheckoutWebhookPayload;

    switch (webhookPayload.feeType) {
      case FeeType.Service:
        return this.confirmOrderWebhookGateway.execute(
          webhookPayload as ConfirmOrderHandlerRequest,
        );
      case FeeType.Shipment:
        return this.payShipmentWebhookGateway.execute(
          webhookPayload as PayShipmentHandlerRequest,
        );
      default:
        throwCustomException(
          "Unexpected Stripe 'checkout.session.completed' webhook type",
          { webhookPayload },
        )();
    }
  }
}
