import { Construct } from 'constructs'
import * as awsAppsync from 'aws-cdk-lib/aws-appsync'
import * as path from 'path'
import { UserPool } from 'aws-cdk-lib/aws-cognito'
import { Table } from 'aws-cdk-lib/aws-dynamodb'
import { IRole } from 'aws-cdk-lib/aws-iam'

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

	api.grantQuery(props.unauthenticatedRole, 'listProducts')

	const productTableDataSource = api.addDynamoDbDataSource(
		`SampleDBDataSource`,
		props.productDB
	)

	const NONEDataSource = api.addNoneDataSource(`NoneDataSource`)

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

	return api
}
