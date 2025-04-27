import { defineBackend } from '@aws-amplify/backend';
import { transcribe } from './transcribe/resource'
import { auth } from './auth/resource';
import { data } from './data/resource';

defineBackend({
  auth,
  data,
  transcribe
});
