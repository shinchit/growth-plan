import * as cdk from 'aws-cdk-lib';
import { GrowthStack } from '../lib/growth-stack';

const app = new cdk.App();
new GrowthStack(app, 'GrowthStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1',
  },
});
