const AWS = require('aws-sdk')
const urlParse = require('url').URL
const nodeFetch = require('node-fetch')
import { DynamoDBStreamEvent } from 'aws-lambda'

//Just copied this over from the GraphQL file
const publish = /* GraphQL */ `
	mutation Publish($data: AWSJSON) {
		publish(data: $data)
	}
`

exports.handler = async (event: DynamoDBStreamEvent) => {
	console.log('in here')
	try {
		console.log('in the try block')
		for (const streamedItem of event.Records) {
			console.log('The streamedItem', streamedItem)
			const itemKey = streamedItem.dynamodb?.NewImage
			if (itemKey) {
				const insertedItem = AWS.DynamoDB.Converter.unmarshall(itemKey)
				console.log('insertedItem', insertedItem)
				const appsyncUrl = process.env.APPSYNC_URL
				const region = process.env.REGION

				console.log('appsync credentials', { appsyncUrl, region })

				//same as appsyncUrl but without the "https://"
				const endpoint = new urlParse(appsyncUrl).hostname
				const httpRequest = new AWS.HttpRequest(appsyncUrl, region)

				console.log('endpoint', endpoint)
				console.log('httpRequest', httpRequest)

				httpRequest.headers.host = endpoint
				httpRequest.headers['Content-Type'] = 'application/json'
				httpRequest.method = 'POST'

				const publishToAppSync = (data: any) => {
					const publishToAppSyncBody = {
						query: publish,
						operationName: 'Publish',
						variables: {
							data: JSON.stringify(data),
						},
					}

					httpRequest.body = JSON.stringify(publishToAppSyncBody)

					const signer = new AWS.Signers.V4(httpRequest, 'appsync', true)
					signer.addAuthorization(
						AWS.config.credentials,
						AWS.util.date.getDate()
					)

					const options = {
						method: httpRequest.method,
						body: httpRequest.body,
						headers: httpRequest.headers,
					}
					return nodeFetch(appsyncUrl, options).then((res: any) => res.json())
				}

				try {
					const publishedData = await publishToAppSync(insertedItem)
					console.log('publishedData', publishedData)
					return {
						statusCode: 200,
						body: publishedData,
					}
				} catch (e) {
					console.log({ error: e })
					return { statusCode: 404, body: { error: e } }
				}
			}
		}
	} catch (e) {
		console.log({ error: e })
		return { statusCode: 404, body: { error: e } }
	}
}
