import { Injectable } from '@nestjs/common';
import {
  Binary,
  ClientSession,
  Collection,
  DeleteWriteOpResultObject,
  FilterQuery,
  UpdateWriteOpResult,
} from 'mongodb';
import { InjectCollection } from 'nest-mongodb';

import { UUID, WithoutId } from '../../../../common/domain';
import {
  expectOnlySingleResult,
  throwCustomException,
} from '../../../../common/error-handling';
import { OrderRepository } from '../../../application/port/OrderRepository';
import { Order, DraftOrder, OrderFilter } from '../../../domain/entity/Order';
import {
  OrderMongoDocument,
  draftOrderToMongoDocument,
  mongoDocumentToOrder,
  Photo,
  normalizeOrderFilter,
  normalizeItemFilter,
} from './OrderMongoMapper';
import {
  mongoQuery,
  muuidToUuid,
  uuidToMuuid,
} from '../../../../common/persistence';
import { ItemFilter } from '../../../domain/entity/Item';
import { ItemPhotosUploadResult } from '../../../domain/use-case/AddItemPhotoUseCase';

@Injectable()
export class OrderMongoRepositoryAdapter implements OrderRepository {
  constructor(
    @InjectCollection('orders')
    private readonly orderCollection: Collection<OrderMongoDocument>,
  ) {}

  async addOrder(
    draftOrder: DraftOrder,
    session?: ClientSession,
  ): Promise<void> {
    const draftOrderDocument = draftOrderToMongoDocument(draftOrder);

    await this.orderCollection
      .insertOne(draftOrderDocument, { session })
      .catch(
        throwCustomException(
          'Error creating a new draftOrder in the database',
          { draftOrder, draftOrderDocument },
        ),
      );
  }

  async setProperties(
    filter: OrderFilter,
    // TODO: better type naming for OrderFilter here
    properties: WithoutId<OrderFilter>,
    session?: ClientSession,
  ) {
    const filterWithId = normalizeOrderFilter(filter);
    const filterQuery: FilterQuery<OrderMongoDocument> = mongoQuery(
      filterWithId,
    );

    const updateResult: UpdateWriteOpResult = await this.orderCollection
      .updateOne(filterQuery, { $set: mongoQuery(properties) }, { session })
      .catch(
        throwCustomException('Error updating order', {
          filter,
          properties,
        }),
      );

    expectOnlySingleResult(
      [updateResult.matchedCount, updateResult.modifiedCount],
      {
        operation: 'setting properties on',
        entity: 'order',
      },
      { filter, properties },
    );
  }

  async findOrder(
    filter: OrderFilter,
    session?: ClientSession,
  ): Promise<Order> {
    // TODO: better typing using FilterQuery
    const filterWithId = normalizeOrderFilter(filter);
    const filterQuery: FilterQuery<OrderMongoDocument> = mongoQuery(
      filterWithId,
    );

    const orderDocument: OrderMongoDocument = await this.orderCollection
      .findOne(filterQuery, { session })
      .catch(throwCustomException('Error searching for an order', filter));

    if (!orderDocument) {
      throwCustomException('No order found', filter)();
    }

    return mongoDocumentToOrder(orderDocument);
  }

  async findOrders(
    orderIds: UUID[],
    session?: ClientSession,
  ): Promise<Order[]> {
    const orderMongoBinaryIds: Binary[] = orderIds.map(orderId =>
      uuidToMuuid(orderId),
    );

    const orderDocuments: OrderMongoDocument[] = await this.orderCollection
      .find({ _id: { $in: orderMongoBinaryIds } }, { session })
      .toArray();

    // To access all orderIds and failedOrderIds, catch the exception and access its 'data' property
    if (orderDocuments.length !== orderIds.length) {
      const failedOrderIds: UUID[] = orderIds.filter(
        orderId =>
          orderDocuments.findIndex(
            orderDocument => uuidToMuuid(orderId) === orderDocument._id,
          ) === -1,
      );

      throwCustomException('Orders not found', {
        orderIds,
        failedOrderIds,
      })();
    }

    return orderDocuments.map(orderDocument =>
      mongoDocumentToOrder(orderDocument),
    );
  }

  async deleteOrder(
    filter: OrderFilter,
    session?: ClientSession,
  ): Promise<void> {
    const filterWithId = normalizeOrderFilter(filter);
    const filterQuery: FilterQuery<OrderMongoDocument> = mongoQuery(
      filterWithId,
    );

    const deleteResult: DeleteWriteOpResultObject = await this.orderCollection
      .deleteOne(filterQuery, {
        session,
      })
      .catch(
        throwCustomException('Error deleting order', {
          filter,
        }),
      );

    expectOnlySingleResult(
      [deleteResult.deletedCount],
      {
        operation: 'deleting',
        entity: 'order',
      },
      filter,
    );
  }

  // TODO: Merge orderFilter and itemFilter
  async setItemProperties(
    orderFilter: OrderFilter,
    itemFilter: ItemFilter,
    properties: WithoutId<ItemFilter>,
    session?: ClientSession,
  ): Promise<void> {
    const orderFilterWithId = normalizeOrderFilter(orderFilter);
    const itemFilterWithId = normalizeItemFilter(itemFilter);

    const filter = {
      ...orderFilterWithId,
      items: itemFilterWithId,
    };

    const filterQueryWithoutReceivedCheck = mongoQuery(filter);
    const filterQuery = {
      ...filterQueryWithoutReceivedCheck,
      // Can't receive an already-received item
      // Query for undefined field https://docs.mongodb.com/manual/tutorial/query-for-null-fields/#existence-check
      'items.receivedDate': null,
    };

    const itemSetQuery = mongoQuery({ 'items.$': properties });

    const updateResult: UpdateWriteOpResult = await this.orderCollection
      .updateOne(filterQuery, { $set: itemSetQuery }, { session })
      .catch(
        throwCustomException('Error updating order item', {
          filter,
          properties,
        }),
      );

    expectOnlySingleResult(
      [updateResult.matchedCount, updateResult.modifiedCount],
      {
        operation: 'setting properties on',
        entity: 'order item',
        lessThanMessage:
          "the item either doesn't exist, or has already been received",
      },
      {
        filter,
        properties,
      },
    );
  }

  async addItemPhotos(
    orderFilter: OrderFilter,
    itemFilter: ItemFilter,
    photos: Photo[],
    session?: ClientSession,
  ): Promise<ItemPhotosUploadResult> {
    const orderFilterWithId = normalizeOrderFilter(orderFilter);
    const itemFilterWithId = normalizeItemFilter(itemFilter);

    const filter = {
      ...orderFilterWithId,
      items: itemFilterWithId,
    };

    const filterQuery = mongoQuery(filter);

    // TODO: typing
    const photoMuuids = photos.map(({ id }) => id);
    const photoUploadResults: ItemPhotosUploadResult = photos.map(
      ({ id, filename }) => ({ id: muuidToUuid(id), photoName: filename }),
    );

    // https://docs.mongodb.com/manual/reference/operator/update/positional/
    const result: UpdateWriteOpResult = await this.orderCollection
      .updateOne(
        filterQuery,
        { $push: { 'items.$.photos': photoMuuids } },
        { session },
      )
      .catch(
        throwCustomException('Error adding photo file id to order item', {
          orderFilter,
          itemFilter,
        }),
      );

    expectOnlySingleResult(
      [result.matchedCount, result.modifiedCount],
      {
        operation: 'adding photo id to',
        entity: 'order item',
      },
      { orderFilter, itemFilter },
    );

    return photoUploadResults;
  }
}
