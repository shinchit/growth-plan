import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { GrowthStack } from './growth-stack';

let template: Template;
beforeAll(() => {
  const app = new cdk.App();
  const stack = new GrowthStack(app, 'TestStack');
  template = Template.fromStack(stack);
});

test('DynamoDB table is created with correct keys', () => {
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TableName: 'growth-checkins',
    KeySchema: [
      { AttributeName: 'userId', KeyType: 'HASH' },
      { AttributeName: 'date', KeyType: 'RANGE' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  });
});

test('Cognito User Pool is created', () => {
  template.hasResourceProperties('AWS::Cognito::UserPool', {
    UserPoolName: 'growth-plan-users',
  });
});

test('Cognito User Pool Client is created', () => {
  template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
});

test('API Gateway is created', () => {
  template.resourceCountIs('AWS::ApiGateway::RestApi', 1);
});

test('all Lambda functions exist', () => {
  template.resourceCountIs('AWS::Lambda::Function', 8);
});

test('two EventBridge rules are created', () => {
  template.resourceCountIs('AWS::Events::Rule', 2);
});

test('CFN outputs include UserPoolId, UserPoolClientId, ApiUrl', () => {
  template.hasOutput('UserPoolId', {});
  template.hasOutput('UserPoolClientId', {});
  template.hasOutput('ApiUrl', {});
});
