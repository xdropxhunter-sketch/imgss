import { MongoClient } from 'mongodb';
import fs from 'fs/promises';
import path from 'path';

let client;
let clientPromise;

const uri = process.env.MONGO_URL;
const dbName = process.env.DB_NAME || 'tempshare';
const useLocalFallback = !uri;
const localDbDir = path.join(process.cwd(), 'memory');
const localDbFile = path.join(localDbDir, 'files.json');

function reviveDoc(doc) {
  if (!doc) return doc;
  return {
    ...doc,
    createdAt: doc.createdAt ? new Date(doc.createdAt) : doc.createdAt,
    expiresAt: doc.expiresAt ? new Date(doc.expiresAt) : doc.expiresAt,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt) : doc.deletedAt,
  };
}

function serializeDoc(doc) {
  return {
    ...doc,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    expiresAt: doc.expiresAt instanceof Date ? doc.expiresAt.toISOString() : doc.expiresAt,
    deletedAt: doc.deletedAt instanceof Date ? doc.deletedAt.toISOString() : doc.deletedAt,
  };
}

function matchesQuery(doc, query = {}) {
  return Object.entries(query).every(([key, value]) => {
    const current = doc[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('$lte' in value) return current <= value.$lte;
      if ('$ne' in value) return current !== value.$ne;
    }
    return current === value;
  });
}

async function readLocalDocs() {
  try {
    const raw = await fs.readFile(localDbFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(reviveDoc) : [];
  } catch (e) {
    if (e?.code === 'ENOENT') return [];
    throw e;
  }
}

async function writeLocalDocs(docs) {
  await fs.mkdir(localDbDir, { recursive: true });
  await fs.writeFile(localDbFile, `${JSON.stringify(docs.map(serializeDoc), null, 2)}\n`, 'utf8');
}

function createLocalCollection() {
  let docsPromise;
  let writeChain = Promise.resolve();

  async function getDocs() {
    if (!docsPromise) docsPromise = readLocalDocs();
    return docsPromise;
  }

  async function persist(docs) {
    writeChain = writeChain.then(() => writeLocalDocs(docs));
    await writeChain;
  }

  return {
    async insertOne(doc) {
      const docs = await getDocs();
      docs.push(reviveDoc(doc));
      await persist(docs);
      return { insertedId: doc.id };
    },
    async findOne(query) {
      const docs = await getDocs();
      return docs.find((doc) => matchesQuery(doc, query)) || null;
    },
    find(query) {
      return {
        toArray: async () => {
          const docs = await getDocs();
          return docs.filter((doc) => matchesQuery(doc, query));
        },
      };
    },
    async updateOne(filter, update) {
      const docs = await getDocs();
      const idx = docs.findIndex((doc) => matchesQuery(doc, filter));
      if (idx === -1) return { matchedCount: 0, modifiedCount: 0 };
      if (update?.$set) docs[idx] = { ...docs[idx], ...update.$set };
      await persist(docs);
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
}

async function getLocalDb() {
  return {
    collection: () => createLocalCollection(),
  };
}

if (!useLocalFallback) {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
}

export async function getDb() {
  if (useLocalFallback) {
    return getLocalDb();
  }
  const c = await clientPromise;
  return c.db(dbName);
}

export async function getFilesCollection() {
  const db = await getDb();
  return db.collection('files');
}
