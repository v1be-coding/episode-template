import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

export type Store = Pick<DynamoDBClient, "send">;

let client: DynamoDBClient | undefined;

// One client per Lambda instance, so its connection is reused.
export function store(): Store {
  client ??= new DynamoDBClient({});
  return client;
}
