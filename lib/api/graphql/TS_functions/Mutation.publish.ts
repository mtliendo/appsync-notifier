import { Context } from '@aws-appsync/utils'

export function request(ctx: Context) {
	return {
		payload: ctx.args.data,
	}
}

export function response(ctx: Context) {
	return ctx.result
}
