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
		`${props.appName}UserpoolClient`,
		{ userPool }
	)

	const identityPool = new IdentityPool(scope, `${props.appName}IdentityPool`, {
		identityPoolName: `${props.appName}IdentityPool`,
		allowUnauthenticatedIdentities: true,
		authenticationProviders: {
			userPools: [
				new UserPoolAuthenticationProvider({
					userPool: userPool,
					userPoolClient: userPoolClient,
				}),
			],
		},
	})

	return { userPool, userPoolClient, identityPool }
}
