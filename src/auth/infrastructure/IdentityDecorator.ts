import {
  createParamDecorator,
  ExecutionContext,
  HttpStatus,
} from '@nestjs/common';
import { UUID } from '../../common/domain';
import { throwCustomException } from '../../common/error-handling';
import { Host } from '../../host/entity/Host';
import { Token } from '../entity/Token';
import { IdentifiedRequest, Identity, IdentityType } from './types';

function identityDecoratorFactory<TIdentity>(
  ...allowedIdentityTypes: IdentityType[]
) {
  return function(_: unknown, ctx: ExecutionContext): TIdentity {
    const {
      identity,
    }: IdentifiedRequest<Identity> = ctx.switchToHttp().getRequest();

    if (identity === undefined) {
      throwCustomException(
        'No identity provided',
        undefined,
        HttpStatus.UNAUTHORIZED,
      )();
    }

    if (!allowedIdentityTypes.includes(identity.type)) {
      throwCustomException(
        'Invalid entity type',
        undefined,
        HttpStatus.UNAUTHORIZED,
      )();
    }

    return (identity.entity as unknown) as TIdentity;
  };
}

export const VerificationTokenIdentity = createParamDecorator<any, any, Token>(
  identityDecoratorFactory<Token>(IdentityType.VerificationToken),
);

export const CustomerIdentity = createParamDecorator<any, any, UUID>(
  identityDecoratorFactory<UUID>(IdentityType.Customer),
);

export const VerifiedHostIdentity = createParamDecorator<any, any, Host>(
  identityDecoratorFactory<Host>(IdentityType.Host),
);

export const AnonymousIdentity = createParamDecorator<any, any, null>(
  identityDecoratorFactory<null>(IdentityType.Anonymous),
);

export const UnverifiedHostIdentity = createParamDecorator<any, any, Host>(
  identityDecoratorFactory<Host>(IdentityType.UnverifiedHost),
);

export const AnyHostIdentity = createParamDecorator<any, any, Host>(
  identityDecoratorFactory<Host>(
    IdentityType.UnverifiedHost,
    IdentityType.Host,
  ),
);
