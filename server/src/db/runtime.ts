import {initSQLite,sqliteQuery} from './sqlite-adapter';
import {TursoDatabase} from './turso-adapter';

const cloudUrl=process.env.TURSO_DATABASE_URL;
const cloud=cloudUrl?new TursoDatabase(cloudUrl,process.env.TURSO_AUTH_TOKEN):null;
export const initDatabase=()=>cloud?cloud.init():initSQLite();
export async function databaseQuery<T=any>(sql:string,params?:any[]):Promise<{rows:T[];rowCount:number}> {
  return cloud?cloud.query<T>(sql,params):sqliteQuery<T>(sql,params);
}
