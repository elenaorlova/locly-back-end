import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Code } from '../../../common/error-handling/Code';
import { Order, OrderStatus } from '../../domain/entity/Order';
import { Exception } from '../../../common/error-handling/Exception';

import { ConfirmOrderRequest } from '../../domain/use-case/confirm-order/ConfirmOrderRequest';
import { ConfirmOrderUseCase } from '../../domain/use-case/confirm-order/ConfirmOrderUseCase';
import { HostMatcher } from '../port/HostMatcher';
import { OrderRepository } from '../port/OrderRepository';

@Injectable()
export class ConfirmOrder implements ConfirmOrderUseCase {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly hostMatcher: HostMatcher,
    // TODO: More general EventEmitter class, wrapper around eventEmitter
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute({ orderId }: ConfirmOrderRequest) {
    const order: Order = await this.orderRepository.findOrder(orderId);

    order.status = OrderStatus.Confirmed;

    const isServiceAvailable: boolean = await this.hostMatcher.checkServiceAvailability(
      order.originCountry,
      order.destination.country,
    );

    if (!isServiceAvailable) {
      // TODO: Wrapper around eventEmitter
      // TODO(?): Event emitting decorator
      this.eventEmitter.emit('order.rejected.service_availability');

      throw new Exception(
        Code.INTERNAL_ERROR,
        `Service not available in country ${order.originCountry}`,
      );
    }

    await order.matchHost(this.hostMatcher).catch(error => {
      // TODO: Wrapper around eventEmitter
      // TODO(?): Event emitting decorator
      this.eventEmitter.emit('order.rejected.host_availability');
      throw error;
    });

    // TODO: Wrapper around eventEmitter
    // TODO(?): Event emitting decorator
    this.eventEmitter.emit('order.confirmed');

    return order;
  }
}