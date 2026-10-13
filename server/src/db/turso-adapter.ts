import {createClient,type Client,type Transaction} from '@libsql/client';
import {coerceParams,coerceRow,databaseBootstrap,pgToSqlite,toSqliteDialect} from './sqlite-adapter';

export class TursoDatabase {
  private client:Client;
  private transaction:Transaction|null=null;
  private initialized:Promise<void>|null=null;
  constructor(url:string,authToken?:string) {
    if(!url.startsWith('file:') && !authToken)throw new Error('TURSO_AUTH_TOKEN is required with TURSO_DATABASE_URL');
    this.client=createClient({url,authToken,intMode:'number'});
  }
  init():Promise<void> {
    this.initialized ||= (async()=>{
      const bootstrap=databaseBootstrap();
      bootstrap.schema.push('CREATE TABLE IF NOT EXISTS uploaded_avatars (id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),content BLOB NOT NULL,content_type TEXT NOT NULL,created_at TEXT NOT NULL)');
      bootstrap.schema.push('CREATE TABLE IF NOT EXISTS email_codes (email TEXT PRIMARY KEY,code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,last_sent_at INTEGER NOT NULL)');
      await this.client.batch(bootstrap.schema,'write');
      const schools=await this.client.execute('SELECT COUNT(*) AS n FROM schools');
      if(!schools.rows[0].n)await this.client.batch(bootstrap.metadata,'write');
      console.log('[DB] Turso database ready');
    })().catch(error=>{this.initialized=null;throw error});
    return this.initialized;
  }
  async query<T=any>(sql:string,params:any[]=[]):Promise<{rows:T[];rowCount:number}> {
    const statement=sql.trim().toUpperCase();
    if(statement==='BEGIN IMMEDIATE') {
      if(this.transaction)throw new Error('Nested database transaction');
      this.transaction=await this.client.transaction('write');
      return {rows:[],rowCount:0};
    }
    if(statement==='COMMIT'||statement==='ROLLBACK') {
      const transaction=this.transaction;
      if(!transaction)throw new Error('No database transaction');
      try {if(statement==='COMMIT')await transaction.commit();else await transaction.rollback()}
      finally {transaction.close();this.transaction=null}
      return {rows:[],rowCount:0};
    }
    const converted=pgToSqlite(toSqliteDialect(sql),params);
    const result=await (this.transaction||this.client).execute({sql:converted.sql,args:coerceParams(converted.params)});
    const rows=result.rows.map(row=>coerceRow(Object.fromEntries(result.columns.map(column=>[column,row[column]])),result.columns)) as T[];
    const write=/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql);
    return {rows,rowCount:write?Math.max(result.rowsAffected,rows.length):rows.length};
  }
  close():void {this.transaction?.close();this.transaction=null;this.client.close()}
}
