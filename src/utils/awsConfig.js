import { Amplify } from 'aws-amplify';
import awsconfig from '../aws-exports';

// Configure Amplify
Amplify.configure(awsconfig);

// Export configuration for use in other files if needed
export const AWS_CONFIG = {
  REGION: awsconfig.aws_project_region,
  IDENTITY_POOL_ID: awsconfig.aws_cognito_identity_pool_id,
  LANGUAGE_CODE: awsconfig.predictions.convert.transcription.defaults.language
};