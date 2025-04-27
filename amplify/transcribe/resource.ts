import { defineFunction } from "@aws-amplify/backend";
    
export const myFirstFunction = defineFunction({
  name: "transcribe",
  entry: "./handler.ts"
});