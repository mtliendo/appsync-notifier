import { CreateProductMutationVariables, Product } from '../API'

import {
	util,
	DynamoDBPutItemRequest,
	Context,
	AppSyncIdentityCognito,
} from '@aws-appsync/utils'

export function request(
	ctx: Context<CreateProductMutationVariables>
): DynamoDBPutItemRequest {
	let values = ctx.args.input
	let id = util.autoId()

	return {
		operation: 'PutItem',
		key: util.dynamodb.toMapValues({ id }),
		attributeValues: util.dynamodb.toMapValues({
			__typename: 'Product',
			owner: (ctx.identity as AppSyncIdentityCognito).sub,
			createdAt: util.time.nowISO8601(),
			updatedAt: util.time.nowISO8601(),
			...values,
		}),
	}
}

export function response(ctx: Context) {
	return ctx.result as Product
}
