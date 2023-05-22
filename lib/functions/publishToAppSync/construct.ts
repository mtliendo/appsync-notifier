import { Runtime } from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { Construct } from 'constructs'
import path = require('path')

type publishToAppSyncProps = {
	appSyncARN: string
	appSyncURL: string
}

export const createPublishToAppSyncFunc = (
	scope: Construct,
	props: publishToAppSyncProps
) => {
	const publishToAppSyncFunc = new NodejsFunction(
		scope,
		'publishToAppSyncFunc',
		{
			functionName: `publishToAppSyncFunc`,
			runtime: Runtime.NODEJS_16_X,
			handler: 'handler',
			entry: path.join(__dirname, `./main.ts`),
			environment: {
				APPSYNC_URL: props.appSyncURL,
				REGION: process.env.CDK_DEFAULT_REGION!,
			},
		}
	)

	return publishToAppSyncFunc
}
