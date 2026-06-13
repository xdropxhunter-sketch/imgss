import { MongoClient } from 'mongodb';

let client;
let clientPromise;

const uri = process.env.MONGO_URL;
const dbName = process.env.DB_NAME || 'tempshare';

if (!uri) {
  throw new Error('MONGO_URL is not defined');
}

if (!global._mongoClientPromise) {
  client = new MongoClient(uri);
  global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

export async function getDb() {
  const c = await clientPromise;
  return c.db(dbName);
}

export async function getFilesCollection() {
  const db = await getDb();
  return db.collection('files');
}
