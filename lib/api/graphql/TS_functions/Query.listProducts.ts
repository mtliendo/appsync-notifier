import { Context } from '@aws-appsync/utils'

export function request(ctx: Context) {
	return { operation: 'Scan' }
}

export function response(ctx: Context) {
	return ctx.result.items
}
