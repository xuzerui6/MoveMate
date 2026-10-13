process.env.NODE_ENV='production';
process.env.HOST='0.0.0.0';
process.env.ENV_FILE=process.env.ENV_FILE||'/nonexistent/movemate-cloud.env';

async function main(){
  if(!process.env.TURSO_DATABASE_URL)throw new Error('Missing TURSO_DATABASE_URL');
  await require('../dist/app').start();
}
main().catch(error=>{console.error('[Cloud] Startup stopped:',error.message);process.exitCode=1});
