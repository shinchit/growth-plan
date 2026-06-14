import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejsLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

export class GrowthStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB
    this.table = new dynamodb.Table(this, 'CheckinsTable', {
      tableName: 'growth-checkins',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'date', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Cognito
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'growth-plan-users',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: { minLength: 8, requireUppercase: false, requireSymbols: false },
    });

    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      authFlows: { userPassword: true, userSrp: true },
      generateSecret: false,
    });

    const fromEmail = 'noreply@calm-pm-lab.com';
    const commonEnv = { TABLE_NAME: this.table.tableName, FROM_EMAIL: fromEmail };
    const lambdaDir = path.join(__dirname, '../lambda');

    const makeFn = (id: string, entry: string) =>
      new nodejsLambda.NodejsFunction(this, id, {
        entry: path.join(lambdaDir, entry),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_22_X,
        environment: commonEnv,
        timeout: cdk.Duration.seconds(10),
      });

    const checkinUpsert  = makeFn('CheckinUpsert',  'checkin-upsert/index.ts');
    const checkinGet     = makeFn('CheckinGet',     'checkin-get/index.ts');
    const summaryGet     = makeFn('SummaryGet',     'summary-get/index.ts');
    const settingsGet    = makeFn('SettingsGet',    'settings-get/index.ts');
    const settingsUpsert = makeFn('SettingsUpsert', 'settings-upsert/index.ts');
    const reminderSend   = makeFn('ReminderSend',   'reminder-send/index.ts');
    const skillsGet      = makeFn('SkillsGet',      'skills-get/index.ts');
    const skillsUpsert   = makeFn('SkillsUpsert',   'skills-upsert/index.ts');

    this.table.grantReadWriteData(checkinUpsert);
    this.table.grantReadData(checkinGet);
    this.table.grantReadData(summaryGet);
    this.table.grantReadData(settingsGet);
    this.table.grantWriteData(settingsUpsert);
    this.table.grantReadData(reminderSend);
    this.table.grantReadData(skillsGet);
    this.table.grantWriteData(skillsUpsert);

    // SES send permission for reminder
    reminderSend.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: ['*'],
    }));

    // API Gateway
    const api = new apigateway.RestApi(this, 'GrowthApi', {
      restApiName: 'growth-plan-api',
      defaultCorsPreflightOptions: {
        allowOrigins: ['https://growth.calm-pm-lab.com'],
        allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
        allowHeaders: ['Authorization', 'Content-Type'],
      },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [this.userPool],
    });
    const authOpts: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    const checkins = api.root.addResource('checkins');
    checkins.addMethod('POST', new apigateway.LambdaIntegration(checkinUpsert), authOpts);
    const checkinDate = checkins.addResource('{date}');
    checkinDate.addMethod('GET', new apigateway.LambdaIntegration(checkinGet), authOpts);
    const summary = checkins.addResource('summary');
    summary.addMethod('GET', new apigateway.LambdaIntegration(summaryGet), authOpts);

    const settings = api.root.addResource('settings');
    settings.addMethod('GET', new apigateway.LambdaIntegration(settingsGet), authOpts);
    settings.addMethod('PUT', new apigateway.LambdaIntegration(settingsUpsert), authOpts);

    const skills = api.root.addResource('skills');
    skills.addMethod('GET', new apigateway.LambdaIntegration(skillsGet), authOpts);
    skills.addMethod('PUT', new apigateway.LambdaIntegration(skillsUpsert), authOpts);

    // EventBridge rules (JST 6:00 = UTC 21:00, JST 18:00 = UTC 9:00)
    new events.Rule(this, 'ReminderMorning', {
      schedule: events.Schedule.cron({ hour: '21', minute: '0' }),
      targets: [new targets.LambdaFunction(reminderSend)],
    });
    new events.Rule(this, 'ReminderEvening', {
      schedule: events.Schedule.cron({ hour: '9', minute: '0' }),
      targets: [new targets.LambdaFunction(reminderSend)],
    });

    // Ensure CORS headers on API Gateway-level error responses (e.g. 401 from Cognito authorizer)
    const gwCorsHeaders = {
      'Access-Control-Allow-Origin': "'https://growth.calm-pm-lab.com'",
      'Access-Control-Allow-Headers': "'Authorization,Content-Type'",
    };
    new apigateway.GatewayResponse(this, 'Gw4xx', {
      restApi: api,
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: gwCorsHeaders,
    });
    new apigateway.GatewayResponse(this, 'Gw5xx', {
      restApi: api,
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: gwCorsHeaders,
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
  }
}
