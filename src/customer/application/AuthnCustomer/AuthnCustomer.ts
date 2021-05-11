import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { ClientSession, MongoClient } from 'mongodb';
import { InjectClient } from 'nest-mongodb';
import { withTransaction } from '../../../common/application';
import { UUID } from '../../../common/domain';
import { IEmailService } from '../../../infrastructure/email/IEmailService';
import { Customer } from '../../entity/Customer';
import { ICustomerRepository } from '../../persistence/ICustomerRepository';
import {
  AuthnCustomerRequest,
  AuthnCustomerResult,
  IAuthnCustomer,
  VerificationPayload,
} from './IAuthnCustomer';

@Injectable()
export class AuthnCustomer implements IAuthnCustomer {
  constructor(
    private readonly customerRepository: ICustomerRepository,
    private readonly configService: ConfigService,
    private readonly emailService: IEmailService,
    @InjectClient() private readonly mongoClient: MongoClient,
  ) {}

  async execute(
    authnCustomerRequest: AuthnCustomerRequest,
    mongoTransactionSession?: ClientSession,
  ): Promise<AuthnCustomerResult> {
    await withTransaction(
      (sessionWithTransaction: ClientSession) =>
        this.authnCustomer(authnCustomerRequest, sessionWithTransaction),
      this.mongoClient,
      mongoTransactionSession,
    );
  }

  private async authnCustomer(
    { email }: AuthnCustomerRequest,
    mongoTransactionSession: ClientSession,
  ): Promise<void> {
    let customer: Customer = await this.customerRepository.findCustomer(
      { email },
      mongoTransactionSession,
      false,
    );

    console.log({ customer });

    if (!customer) {
      customer = {
        id: UUID(),
        email,
      };

      await this.customerRepository.addCustomer(
        customer,
        mongoTransactionSession,
      );
    }

    const token: string = this.createVerificationToken(customer.id);

    await this.emailService.sendEmail({
      to: email,
      subject: 'Locly authentication link!',
      html: `<a href="localhost:3000/authn/verify/${token}">Click on this link to log in to Locly!</a>`,
    });
  }

  private createVerificationToken(customerId: UUID): string {
    const key = this.configService.get<string>('VERIFICATION_JWT_SIGNING_KEY');
    const expiresIn = this.configService.get<string>(
      'VERIFICATION_JWT_EXPIRES_IN',
    );

    const payload: VerificationPayload = { customerId };
    const token: string = jwt.sign(payload, key, { expiresIn });

    return token;
  }
}
