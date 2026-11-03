// 只读对比本地库和线上库，迁移本地内容上线前看清楚“哪些只在本地、哪些只在线上、哪些两边都有但改过”。
//   线上库要先开隧道：ssh -N -L 127.0.0.1:27099:172.19.0.3:27017 root@服务器（172.19.0.3 是 mongo 容器在 core_mx-space 网络里的地址）
//   node scripts/deploy/diff-db.mjs [本地连接串] [线上连接串]   默认 mongodb://127.0.0.1:27018/shrio-import-20261014 与 mongodb://127.0.0.1:27099/mx-space
// 不写任何东西。阅读数、点赞数（count）和 __v 不算“改过”。
import { createRequire } from "node:module";

const { MongoClient } = createRequire(new URL("../../apps/core/package.json", import.meta.url))("mongodb");
const [localUri = "mongodb://127.0.0.1:27018/shrio-import-20261014", prodUri = "mongodb://127.0.0.1:27099/mx-space"] = process.argv.slice(2);

const ignored = new Set(["count", "__v"]);
const label = (doc) => doc.title ?? doc.name ?? doc.slug ?? doc.key ?? doc.author ?? (typeof doc.text === "string" ? doc.text.replace(/\s+/g, " ").slice(0, 40) : undefined) ?? doc.email ?? "";
const canonical = (value) => JSON.stringify(value, (key, item) => (ignored.has(key) ? undefined : item && typeof item === "object" && !Array.isArray(item) && !(item instanceof Date) && item._bsontype === undefined ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item));

const local = new MongoClient(localUri);
const prod = new MongoClient(prodUri, { directConnection: true });
await Promise.all([local.connect(), prod.connect()]);
const [ldb, pdb] = [local.db(), prod.db()];
const names = [...new Set([...(await ldb.listCollections().toArray()), ...(await pdb.listCollections().toArray())].map((c) => c.name).filter((name) => !name.startsWith("system.")))].sort();

for (const name of names) {
  const [ldocs, pdocs] = await Promise.all([ldb.collection(name).find().toArray(), pdb.collection(name).find().toArray()]);
  const lmap = new Map(ldocs.map((doc) => [String(doc._id), doc]));
  const pmap = new Map(pdocs.map((doc) => [String(doc._id), doc]));
  const onlyLocal = ldocs.filter((doc) => !pmap.has(String(doc._id)));
  const onlyProd = pdocs.filter((doc) => !lmap.has(String(doc._id)));
  const changed = ldocs.filter((doc) => pmap.has(String(doc._id)) && canonical(doc) !== canonical(pmap.get(String(doc._id))));
  if (!onlyLocal.length && !onlyProd.length && !changed.length) {
    console.log(`= ${name}（本地 ${ldocs.length} / 线上 ${pdocs.length}）一致`);
    continue;
  }
  console.log(`\n≠ ${name}（本地 ${ldocs.length} / 线上 ${pdocs.length}）只在本地 ${onlyLocal.length}，只在线上 ${onlyProd.length}，两边都有但不同 ${changed.length}`);
  for (const doc of onlyLocal) console.log(`  + 本地 ${doc._id} ${label(doc)}`);
  for (const doc of onlyProd) console.log(`  - 线上 ${doc._id} ${label(doc)}`);
  for (const doc of changed) {
    const other = pmap.get(String(doc._id));
    const fields = [...new Set([...Object.keys(doc), ...Object.keys(other)])].filter((key) => !ignored.has(key) && canonical(doc[key]) !== canonical(other[key]));
    console.log(`  ~ ${doc._id} ${label(doc)}：${fields.join(", ")}`);
  }
}
await Promise.all([local.close(), prod.close()]);
