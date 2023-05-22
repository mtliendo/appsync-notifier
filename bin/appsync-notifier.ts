#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { AppsyncNotifierStack } from '../lib/appsync-notifier-stack'

const app = new cdk.App()
new AppsyncNotifierStack(app, 'AppsyncNotifierStack', {
	env: {
		account: process.env.CDK_DEFAULT_ACCOUNT,
		region: process.env.CDK_DEFAULT_REGION,
	},
})
