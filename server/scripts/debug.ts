import initSqlJs from 'sql.js';

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');

  console.log('=== Test 1: Without transaction ===');
  db.run("INSERT INTO test VALUES (1, 'hello')");
  const r1 = db.exec('SELECT * FROM test');
  console.log('After insert:', r1[0]?.values);

  console.log('=== Test 2: With transaction ===');
  db.run('BEGIN');
  db.run("INSERT INTO test VALUES (2, 'world')");
  const r2 = db.exec('SELECT * FROM test');
  console.log('Inside transaction:', r2[0]?.values);
  db.run('COMMIT');
  const r3 = db.exec('SELECT * FROM test');
  console.log('After commit:', r3[0]?.values);

  console.log('=== Test 3: ROLLBACK ===');
  db.run('BEGIN');
  db.run("INSERT INTO test VALUES (3, 'should not exist')");
  db.run('ROLLBACK');
  const r4 = db.exec('SELECT * FROM test');
  console.log('After rollback:', r4[0]?.values);
}

main().catch(console.error);
