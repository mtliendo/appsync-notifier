import * as cdk from 'aws-cdk-lib'
import { CfnOutput } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { createPublishToAppSyncFunc } from './functions/publishToAppSync/construct'
import { createTable } from './databases/tables'
import {
	FilterCriteria,
	FilterRule,
	StartingPosition,
} from 'aws-cdk-lib/aws-lambda'
import { createAPI } from './api/appsync'
import { createAuth } from './cognito/auth'
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources'

export class AppsyncNotifierStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props)

		const productTable = createTable(this, {
			tableName: 'ProductTable',
		})

		const notifierAuth = createAuth(this, {
			appName: 'notifierAuth',
		})

		const appsyncAPI = createAPI(this, {
			appName: 'notifierAPI',
			productDB: productTable,
			userpool: notifierAuth.userPool,
			unauthenticatedRole: notifierAuth.identityPool.unauthenticatedRole,
		})

		const publishToAppSyncFunc = createPublishToAppSyncFunc(this, {
			appSyncARN: appsyncAPI.arn,
			appSyncURL: appsyncAPI.graphqlUrl,
		})

		publishToAppSyncFunc.addEventSource(
			new eventsources.DynamoEventSource(productTable, {
				startingPosition: StartingPosition.LATEST,
				filters: [
					FilterCriteria.filter({
						eventName: FilterRule.isEqual('INSERT'),
					}),
				],
			})
		)
		productTable.grantStreamRead(publishToAppSyncFunc)
		appsyncAPI.grantMutation(publishToAppSyncFunc, 'publish')

		new CfnOutput(this, 'cognitoUserPoolId', {
			value: notifierAuth.userPool.userPoolId,
		})
		new CfnOutput(this, 'idenititypoolId', {
			value: notifierAuth.identityPool.identityPoolId,
		})

		new CfnOutput(this, 'cognitoUserPoolClientId', {
			value: notifierAuth.userPoolClient.userPoolClientId,
		})

		new CfnOutput(this, 'region', {
			value: this.region,
		})

		new CfnOutput(this, 'AppSyncURL', {
			value: appsyncAPI.graphqlUrl,
		})
	}
}
