const fs = require("fs");
const path = require("path");
const { createClient } = require('@supabase/supabase-js');
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath,'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1,-1);
    process.env[m[1]] = v;
  }
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{autoRefreshToken:false,persistSession:false} });
(async () => {
  const sqls = [
    `select 1 from pg_indexes where schemaname='public' and indexname='cms_customers_email_referral_uidx'`,
    `select 1 from pg_indexes where schemaname='public' and indexname='survey_responses_survey_customer_guid_uidx'`
  ];
  for (const sql of sqls) {
    const { data, error } = await sb.rpc('exec_sql', { sql });
    console.log('sql:', sql.split(' ')[2], 'rows', data?.length || 0, 'error', error?.message || null);
  }
})();
