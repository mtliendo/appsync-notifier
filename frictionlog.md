# Project

AppSync Notifier

## Purpose

To create a way for a client to publish data to DynamoDB, then use a Lambda Function to trigger a NONE datasource so that the frontend can subscribe to the update. It's worth calling ou that AppSync will already return the response from DynamoDB by nature of GraphQL, but a future project will include asynchronous flows so this is simulating that.

AppSync -> DDB -> Lambda (DDB Stream) -> AppSync

## Prerequisites

This project uses the AWS CDK to create the backend. I'm sure I'll create a frontend at some point that will consume these events but this repo is only the backend configuration. All code is written in TypeScript.

As such, you'll need the following tools installed:

- A bootstrapped AWS CDK region in your AWS account (one-time command)
- NodeJS 18.x.x
- NPM 8.x.x

## Context

This is a friction log of what it takes/how it feels for me to build this. I've done similar setups before and feel comfortable that this won't be too difficult. My biggest concerns are around testing the solution. Even the resolvers will be written in TypeScript, and this is my first time working with the `NONE` datasource, so I'm curious how that will go. I'm also not very experienced with creating subscriptions since I mostly work with CRUDL apps, but IIRC the docs are pretty decent when it comes to showing how they relate to mutations.

## Getting Started

Inside an empty directory, I created ran the following command to setup my project:

```bash
npx aws-cdk@latest init -l typescript && code .
```

## App Creation

### AppSync Core API

First I'll create an GraphQL API with both Cognito and IAM authorization. I've done this plenty of times and will just copy over some code from [a previous repo](https://github.com/focusOtter/microsaas-backend/blob/main/lib/api/appsync.ts) and adjust accordingly. Since this is all going to be deployed as a single stack, I'll do this in a separate directory and import it in my `lib`:

The core of creating such an API:

```ts
// lib/api/appsync.ts
type AppSyncAPIProps = {
	appName: string
	unauthenticatedRole: IRole
	userpool: UserPool
	productDB: Table
}

export function createAPI(scope: Construct, props: AppSyncAPIProps) {
	const api = new awsAppsync.GraphqlApi(scope, props.appName, {
		name: props.appName,
		schema: awsAppsync.SchemaFile.fromAsset(
			path.join(__dirname, './graphql/schema.graphql')
		),
		authorizationConfig: {
			defaultAuthorization: {
				authorizationType: awsAppsync.AuthorizationType.USER_POOL,
				userPoolConfig: {
					userPool: props.userpool,
				},
			},
			additionalAuthorizationModes: [
				{ authorizationType: awsAppsync.AuthorizationType.IAM },
			],
		},
		xrayEnabled: true,
		logConfig: {
			fieldLogLevel: awsAppsync.FieldLogLevel.ALL,
		},
	})

	return api
}
```

### Schema Creation

I haven't created the schema yet, nor have I created the datasources (DynamoDB Table and NONE datasource).

I'll move on to those before continuing in this file. Starting with the schema, I'll create a folder and file and paste in the following code:

```graphql
# lib/api/graphql/schema.graphql
type Query {
	listProducts: [Product] @aws_cognito_user_pools @aws_iam
}

type Mutation {
	createProduct(input: ProductInput): Product @aws_cognito_user_pools
}

type Subscription {
	onCreateProduct: Product @aws_subscribe(mutations: ["createProduct"])
}

type Product {
	id: ID!
	name: String
}

input ProductInput {
	name: String
}
```

I had to lookup the directive for real-time subscriptions [here](https://docs.aws.amazon.com/appsync/latest/devguide/aws-appsync-real-time-data.html). This was pretty easy to find. But I always get confused on whether it's `@aws_cognito_user_pools` or `@aws_cognito_userpools` so I had to look that up and couldn't easily find it. In the end, I just went back to [my repo](https://github.com/focusOtter/microsaas-backend/blob/main/lib/api/graphql/schema.graphql#L4) for guidance. I'm also no sure if subscriptions can take an auth directive or if they inherit from the mutation. I also forget what the cascading auth rules are, but I think I'm good on that part since `Product` doesn't have a sub-type. In terms of the app, I'm going to have the `ID` created in the appSync function, so the `ProductInput` will only need a string.

I took a moment to go through the schema and something felt off. I realized I don't want to subscribe to when the `createProduct` resolver finishes, but rather I want an ambiguous way for a Lambda function to push data to the client. This reminded me of the console experience for creating a pub/sub API (which I love btw). So after reviewing the schema for a pub/sub API, I'm currently feeling confident with the following:

```graphql
type Query {
	listProducts: [Product] @aws_cognito_user_pools @aws_iam
}

type Mutation {
	createProduct(input: ProductInput): Product @aws_cognito_user_pools
	publish(data: AWSJSON): AWSJSON
}

type Subscription {
	subscribe: AWSJSON @aws_subscribe(mutations: ["publish"])
}

type Product {
	id: ID!
	createdAt: AWSDateTime
	updatedAt: AWSDateTime
	name: String
}

input ProductInput {
	name: String
}
```

This feels much better to me. In short, this allows the DDB stream to push arbitrary data to the frontend. I may tighten that down later on but I think this is good for now. Moving on.

### Datasource Creation

My API is going to need a two datasources:

1. A DynamoDB table to hold the products
2. A NONE datasource to publish data

In a new directory/file I can create a generic DDB table to serve as my datasource pretty easily:

```ts
// lib/databases/tables.ts
import { Construct } from 'constructs'
import * as awsDynamodb from 'aws-cdk-lib/aws-dynamodb'
import { RemovalPolicy } from 'aws-cdk-lib'

type TableProps = {
	tableName: string
}

export function createTable(
	scope: Construct,
	props: TableProps
): awsDynamodb.Table {
	return new awsDynamodb.Table(scope, props.tableName, {
		tableName: props.tableName,
		removalPolicy: RemovalPolicy.DESTROY,
		billingMode: awsDynamodb.BillingMode.PAY_PER_REQUEST,
		partitionKey: { name: 'id', type: awsDynamodb.AttributeType.STRING },
	})
}
```

I forgot my API needs a Cognito userpool and identity pool. My SaaS app is saving me a bunch of time with this stuff!

### Cognito Creation

I have both userpool and IAM authorization, so I need both a userpool group and a cognito identity pool. Fortunately, my [SaaS app is here](https://github.com/focusOtter/microsaas-backend/blob/main/lib/cognito/auth.ts) to save the day once again. In a new directory/file, I add in the following:

```ts
// lib/cognito/auth.ts
import { Construct } from 'constructs'
import * as awsCognito from 'aws-cdk-lib/aws-cognito'
import {
	IdentityPool,
	UserPoolAuthenticationProvider,
} from '@aws-cdk/aws-cognito-identitypool-alpha'

type AuthProps = {
	appName: string
}

export function createAuth(scope: Construct, props: AuthProps) {
	const userPool = new awsCognito.UserPool(scope, `${props.appName}-Userpool`, {
		userPoolName: `${props.appName}-Userpool`,
		selfSignUpEnabled: true,
		accountRecovery: awsCognito.AccountRecovery.PHONE_AND_EMAIL,
		userVerification: {
			emailStyle: awsCognito.VerificationEmailStyle.CODE,
		},
		autoVerify: {
			email: true,
		},
		standardAttributes: {
			email: {
				required: true,
				mutable: true,
			},
		},
	})

	const userPoolClient = new awsCognito.UserPoolClient(
		scope,
		`${props.appName}-UserpoolClient`,
		{ userPool }
	)

	const identityPool = new IdentityPool(
		scope,
		`${props.appName}-IdentityPool`,
		{
			identityPoolName: `${props.appName}-IdentityPool`,
			allowUnauthenticatedIdentities: true,
			authenticationProviders: {
				userPools: [
					new UserPoolAuthenticationProvider({
						userPool: userPool,
						userPoolClient: userPoolClient,
					}),
				],
			},
		}
	)

	return { userPool, userPoolClient, identityPool }
}
```

> I have to manually install the `@aws-cdk/aws-cognito-identitypool-alpha` construct because it is still alpha, thus not bundled with the cdk lib. Not sure who is working on this, but pushing this to stable benefits AppSync.

Note that this also creates a webclient so that this can leverage the Amplify JS libraries on the frontend. Because various parts of auth are often used in different areas of the app (some need the identitypool, others need the userpool), I'm returning an object that contains the 3 segments.

OK. Now I think I'm ready to revisit my AppSync API.

### Adding Datasources to the AppSync API

Before adding the datasources, I added the following line:

```ts
api.grantQuery(props.unauthenticatedRole, 'listProducts')
```

I love, love the `grantQuery`/`grantMutation` methods here. I pass in the unauthenticated Role created from the Congito identity pool, along with the name of the Query/Mutation I want to allow. Super simple.

Creating a DynamoDB datasource is also fairly easy. I added the following:

```ts
const productTableDataSource = api.addDynamoDbDataSource(
	`${props.productDB.tableName}-DataSource`,
	props.productDB
)
```

This is actually my first time adding a `NONE` datasource in the CDK. Let's see here...

oh 😅 I was able to just do this:

```ts
const NONEDataSource = api.addNoneDataSource(`${api.name}-NoneDataSource`)
```

### Adding the pipeline resolvers and functions

This is always the trickiest part and what I wish was somehow easier. Ok--so based on my schema, I have 3 operations to account for: `listProducts`, `createProduct`, and `publish`. Again, if I call `createProduct` in a Lambda function, I have to update DynamoDB--I don't want to do that, hence the call to `publish` instead.

Also worth pointing out is that I want to create all my functions using TypeScript and for that I need a build step...

### Adding a TS -> JS build step with esbuild

Once again the my repo has [a file](https://github.com/focusOtter/microsaas-backend/blob/main/build.mjs) that contains the code needed for this.

Essentially, grab all the TS files in the `lib/api/graphql/TS_functions` directory and output the JS equivalent of them in the `libe/api/graphql/JS_functions` directory.

```js
/* eslint-disable */
import { build } from 'esbuild'
import glob from 'glob'
const files = await glob('lib/api/graphql/TS_functions/**/*.ts')

console.log(files)

await build({
	sourcemap: 'inline',
	sourcesContent: false,
	format: 'esm',
	target: 'esnext',
	platform: 'node',
	external: ['@aws-appsync/utils'],
	outdir: 'lib/api/graphql/JS_functions',
	entryPoints: files,
	bundle: true,
})
```

Then in my `package.json` file, I added the following script:

```js
"build:appsyncFunctions": "node build.mjs",
```

Next, I'll install `esbuild` and `glob` as dev dependencies along with the AppSync utils package:

```bash
npm i esbuild @aws-appsync/utils glob -D
```

#### The listProducts pipeline, function, and code

I'll be **very** happy when unit resolvers support VTL. But until then, I have to use a pipeline resolver for simple operations.

In this case, I'm gonna be lazy and just use a `scan` to list all of the products from the database.

The process is verbose, but not difficult.

First the function, [borrowed from here](https://github.com/focusOtter/microsaas-backend/blob/main/lib/api/appsync.ts#LL51C2-L63C3):

```ts
// lib/api/appsync.ts
const listProductsFunction = new awsAppsync.AppsyncFunction(
	scope,
	'listProductsFunction',
	{
		name: 'listProductsFunction',
		api,
		dataSource: productTableDataSource,
		runtime: awsAppsync.FunctionRuntime.JS_1_0_0,
		code: awsAppsync.Code.fromAsset(
			path.join(__dirname, 'graphql/JS_functions/Query.listProducts.js')
		),
	}
)
```

> It's worth noting that CodeWhisperer does a pretty decent job at making suggestions. Also, I wish there was a typesafe way of specifying the code path.

Note that the `code` has a path set to the `JS_functions` directory/file and not the TS version.

Next, the function has to belong to a pipeline, so I simply modified the code example [I already have here](https://github.com/focusOtter/microsaas-backend/blob/main/lib/api/appsync.ts#LL148C2-L157C4):

```ts
// lib/api/appsync.ts
new awsAppsync.Resolver(scope, 'listProductsResolver', {
	api,
	typeName: 'Query',
	fieldName: 'listProducts',
	code: awsAppsync.Code.fromAsset(
		path.join(__dirname, 'graphql/JS_functions/passThrough.js')
	),
	runtime: awsAppsync.FunctionRuntime.JS_1_0_0,
	pipelineConfig: [listProductsFunction],
})
```

The last parts are to create the relevant resolver files.

Starting with what I call a "passThrough" file. This is the `request` and `response` of the pipeline itself:

```ts
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
```

Notice that it doesn't do anything in the `request` and just returns the result from the previous function in the `response`. This highlights when pipeline resolvers are overkill.

For the `listProducts` example, I actually don't have a template for that, so I'll have to head to the docs.

Took all of 10 seconds to find [the reference](https://docs.aws.amazon.com/appsync/latest/devguide/js-resolver-reference-dynamodb.html#js-aws-appsync-resolver-reference-dynamodb-scan). This seems pretty straightforward. Gonna go with something like this:

```ts
import { Context } from '@aws-appsync/utils'

export function request(ctx: Context) {
	return { operation: 'Scan' }
}

export function response(ctx: Context) {
	return ctx.result
}
```

A nice thing about the AppSync directives is that authorization is automatically handled in these use cases.

What's also worth pointing out is that CodeWhisperer is of no use in these files--often times suggesting things that are made up.

#### The createProduct pipeline, function, and code

My hope is that this part is easy because in my SaaS app, I have the ability to [create a recipe](https://github.com/focusOtter/microsaas-backend/blob/main/lib/api/graphql/functions/Mutation.createRecipe.ts)

First the function:

```ts
const createProductFunction = new awsAppsync.AppsyncFunction(
	scope,
	'createProductFunction',
	{
		name: 'createProductFunction',
		api,
		dataSource: productTableDataSource,
		runtime: awsAppsync.FunctionRuntime.JS_1_0_0,
		code: awsAppsync.Code.fromAsset(
			path.join(__dirname, 'graphql/JS_functions/Mutation.createProduct.js')
		),
	}
)
```

Next the pipeline:

```ts
new awsAppsync.Resolver(scope, 'createProductResolver', {
	api,
	typeName: 'Mutation',
	fieldName: 'createProduct',
	code: awsAppsync.Code.fromAsset(
		path.join(__dirname, 'graphql/JS_functions/passThrough.js')
	),
	runtime: awsAppsync.FunctionRuntime.JS_1_0_0,
	pipelineConfig: [createProductFunction],
})
```

Note that this uses the same `passThrough.js` file as the previous function.

Next the code for the function:

```ts
// lib/api/graphql/TS_functions/Mutation.createProduct.ts
import { CreateProductMutationVariables, Product } from './../API'

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
	util.dynamodb.toDynamoDB
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
```

> Note: I'm choosing to add an "owner" and "\_\_typename" field as I consider it a best practice in future proofing my app. By having those two fields I can later on handle operations like "fetch me all of my products" with a [simple GSI addition](https://github.com/focusOtter/microsaas-backend/blob/main/lib/databases/tables.ts#L24-L31).

This is correct based on my [previous code example](https://github.com/focusOtter/microsaas-backend/blob/main/lib/api/graphql/functions/Mutation.createRecipe.ts), but two things are needing to be pointed out:

1. There is some TS generic stuff happening.
2. In my editor, `attributeValues` has a red squiggly. This is because of the `...values`.

The two are related. I have to create typings based off of my schema. Doing so is pretty straightforward. In my terminal, I run the following command **in the directory that contains my schema**.

```bash
npx @aws-amplify/cli codegen add
```

From there I select the following options:

- javascript
- react
- typescript
- `operations/**/*.ts`
- yes
- 4
- ./API.ts
- yes

Following those steps fixed my TS error and generated my types.

> 🚨 Make sure to change back to the main directory

```bash
cd ../../..
```

#### The publish pipeline, function, and code

This next part is completely new to me. I have to publish data to(?) a NONE datasource.

Looking at my pub/sub API in the console, I looks like it's not part of a pipeline, but rather a VTL unit resolver that takes a payload object and pushes data:

```vtl
{
  "version": "2017-02-28",
  "payload": {
      "name": "$context.arguments.name",
      "data": $util.toJson($context.arguments.data)
  }
}
```

The reponse object simply returns the result:

```vtl
$util.toJson($context.result)
```

Looking at the docs, the AWSJSON takes in a string of data, but will [automatically be parsed](https://docs.aws.amazon.com/appsync/latest/devguide/scalars.html) when it gets to the function.

Also, the [docs on a NONE datasource](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-reference-none-js.html) seem easy enough to grok.

So my function is defined as such:

```ts
const publishFunction = new awsAppsync.AppsyncFunction(
	scope,
	'publishFunction',
	{
		name: 'publishFunction',
		api,
		dataSource: NONEDataSource,
		runtime: awsAppsync.FunctionRuntime.JS_1_0_0,
		code: awsAppsync.Code.fromAsset(
			path.join(__dirname, 'graphql/JS_functions/Mutation.publish.js')
		),
	}
)
```

The pipeline is as follows with the same repetitive passThrough:

```ts
new awsAppsync.Resolver(scope, 'publishResolver', {
	api,
	typeName: 'Mutation',
	fieldName: 'publish',
	code: awsAppsync.Code.fromAsset(
		path.join(__dirname, 'graphql/JS_functions/passThrough.js')
	),
	runtime: awsAppsync.FunctionRuntime.JS_1_0_0,
	pipelineConfig: [publishFunction],
})
```

For the code itself, I'm going to try the following:

```ts
// lib/api/graphql/TS_functions/Mutation.publish.ts
export function request(ctx) {
	return {
		payload: context.args,
	}
}
```

The docs are wrong here with a mismatch of `ctx` and `context`. If this was a JS file and not TS that wouldn't have been caught. I made the correction in my code and also did `ctx.args.data` to better match the schema.

For the response, I added the following:

```ts
// lib/api/graphql/TS_functions/Mutation.publish.ts
export function request(ctx) {
	return ctx.result
}
```

Note that the docs here are wrong as well. This should be `response`. I made the code correction.
Also worthing emphasizing that the return type here doesn't matter only because the return type in the schema for `publish` is `AWSJSON`. If for example the return type was `Product`, then I'd have to make sure that matched.

With that, appSync is done.

Recall that this mutation is going to be called by a Lambda function that is a DynamoDB stream. To enable that, we have to add the `@aws_iam` directive to the mutation. Here's the updated Mutation:

```graphql
type Mutation {
	createProduct(input: ProductInput): Product @aws_cognito_user_pools
	publish(data: AWSJSON): AWSJSON @aws_iam # this part is new
}
```

### Adding the DynamoDB stream

I'm actually not sure where I should put the Lambda function in my directory. I'm going to create a new `functions` directory in my `api` directory. In there, I'll create a `publishToAppSync` folder with a `main.ts` file. This file will contain the code for the function, but alongside this file, I'll create a `construct.ts` file that will create the `NodejsFunction` construct.

For the contruct code, I used chatGPT to get the IAM policy, and [modified some existing code](https://github.com/focusOtter/microsaas-backend/blob/main/lib/functions/addUserPostConfirmation/construct.ts) I had to come up with this:

```ts
import * as aws_iam from 'aws-cdk-lib/aws-iam'
import { Runtime } from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { Construct } from 'constructs'
import path = require('path')

type publishToAppSyncProps = {
	appSyncARN: string
}
export const createAddUserFunc = (
	scope: Construct,
	props: publishToAppSyncProps
) => {
	const addUserFunc = new NodejsFunction(scope, 'publishToAppSyncFunc', {
		functionName: `publishToAppSyncFunc`,
		runtime: Runtime.NODEJS_18_X,
		handler: 'handler',
		entry: path.join(__dirname, `./main.ts`),
	})

	addUserFunc.addToRolePolicy(
		new aws_iam.PolicyStatement({
			actions: ['appsync:GraphQL'],
			resources: [`${props.appSyncARN}/types/Mutation/publish`],
		})
	)
	return addUserFunc
}
```

For the code itself, I copied code from [a previous blog post I wrote](https://blog.focusotter.cloud/trigger-appsync-subscriptions-with-eventbridge-targets#heading-creating-a-lambda-function) and modified it accordingly.

I don't want to use the AppSync client because my understanding is that it's not maintained. Since I'm in node18, I have access to the `fetch` module, but that currently throws and error in Lambda functions because it's not stored on the global object. So, as with my blog post, I'll use the `node-fetch` package. To do so, I change into that directory and run the following command:

```bash
npm init -y
```

From there, I install some dependencies:

```bash
npm i node-fetch aws-lambda
```

Wait...I just remembered that the aws-sdk isn't bundled with node18 lambda functions. Grrr...ok, at the risk of a time sink, I'm gonna see if ChatGPT can pull through.

After 15 minutes, it struggled to give me something that felt like it would work. Gonna bump the nodeJS runtime down to v16 and use what I had in the blog post.

**1 hour later**: I wrestled with all of this for way too long. This is something that we 100% should have documented and kep up to date on. Calling AppSync from a Lambda function is a super common task, especially when working with DynamoDB streams. I _think_ I have it where I need it. Maybe. Debugging this part is not going to be fun. In the end, I had to use 2 of my own blog posts and chatGPT to get this to where I'm confident in moving on. Super frustrating.

Adding the lambda function as a source of the dynamodb stream was a bit of misdirection. Cognito accepts a Lambda function as a trigger, but for a stream, the Lambda function adds the database to it.

So the general flow is:

1. Create the table
2. Enable the `NEW_IMAGE` value on the `stream` property.
3. Grant the function permission to read from the stream: `table.grantStreamRead(props.publishToAppSyncFunc)`
4. Create the function
5. Add an event source to the function:

```ts
publishToAppSyncFunc.addEventSource(
	new eventsources.DynamoEventSource(props.productTable, {
		startingPosition: StartingPosition.LATEST,
		filters: [
			FilterCriteria.filter({
				eventName: FilterRule.isEqual('INSERT'),
			}),
		],
	})
)
```

This makes our handler code simpler since the only events that will be sent are the `LATEST` `NEW_IMAGE` records that have been `INSERT`ed.

### Recap

- So I have a Cognito and IAM authorized API.
- This API has 3 operations: `listProducts`, `createProduct`, and `publish`.
- The `listProducts` and `createProduct` operations use DynamoDB as a datasource.
- When an item is inserted into DynamoDB, it triggers a Lambda function.
- This function takes the record that was inserted and calls the `publish` mutation.
- The `publish` mutation is connected to a `NONE` datasource. This means clients that are subscribed to this mutation get a subscription notification.

### Putting our pieces together

At this point I feel confident about everything except the lambda trigger. I spent around 30 minutes trying to figure out how to get rid of cyclic dependencies and another 5 minutes working out small deploy issues. But it deployed fairly easily.

I also forgot to add in cfnOutput values so that I can quickly build my frontend.

I made the changes are redeployed.

Actually, everything can be test from the AppSync console. Gonna test there.
