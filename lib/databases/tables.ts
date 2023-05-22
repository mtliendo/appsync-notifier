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
	const table = new awsDynamodb.Table(scope, props.tableName, {
		tableName: props.tableName,
		removalPolicy: RemovalPolicy.DESTROY,
		billingMode: awsDynamodb.BillingMode.PAY_PER_REQUEST,
		partitionKey: { name: 'id', type: awsDynamodb.AttributeType.STRING },
		stream: awsDynamodb.StreamViewType.NEW_IMAGE,
	})

	return table
}
