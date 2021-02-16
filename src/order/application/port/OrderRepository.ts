import { EntityId } from '../../../common/domain/EntityId';
import { Order } from '../../domain/entity/Order';

export abstract class OrderRepository {
  abstract addOrder(order: Order): Promise<void>;
  abstract findOrder(orderId: EntityId): Promise<Order>;
  abstract findOrders(orderIds: EntityId[]): Promise<Order[]>;
  abstract deleteOrder(orderId: EntityId): Promise<void>;
}
