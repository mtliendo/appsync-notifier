import { Context } from '@aws-appsync/utils'
// The before step.
//This runs before ALL the AppSync functions in this pipeline.
export function request(ctx: Context) {
	console.log(ctx.args)
	return {}
}

// The AFTER step. This runs after ALL the AppSync functions in this pipeline.
export function response(ctx: Context) {
	return ctx.prev.result
}
