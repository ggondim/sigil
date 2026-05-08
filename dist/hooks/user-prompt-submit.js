#!/usr/bin/env node
var xe=Object.defineProperty;var h=(t,e)=>()=>(t&&(e=t(t=0)),e);var C=(t,e)=>{for(var n in e)xe(t,n,{get:e[n],enumerable:!0})};function Q(t,e){let n={};for(let o of t)n[o[e]]=o;return n}function $(t,e){if(e<1)return[];let n=[];for(let o=0;o<t.length;o+=e)n.push(t.slice(o,o+e));return n}var U=h(()=>{});var wt={};C(wt,{default:()=>d});var I,Ue,d,w=h(()=>{I=(t,e,n)=>process.env[t]??(e&&process.env[e])??n,Ue={db:{type:I("SIGIL_DB_TYPE","CORTEX_DB_TYPE","pglite"),host:I("SIGIL_DB_HOST","CORTEX_DB_HOST","localhost"),port:Number(I("SIGIL_DB_PORT","CORTEX_DB_PORT",5432)),database:I("SIGIL_DB_NAME","CORTEX_DB_NAME","sigil"),user:I("SIGIL_DB_USER","CORTEX_DB_USER","sigil_app"),password:I("SIGIL_DB_PASSWORD","CORTEX_DB_PASSWORD","")},embedding:{provider:process.env.EMBEDDING_PROVIDER||"",model:process.env.EMBEDDING_MODEL||"nomic-embed-text",dimensions:Number(process.env.EMBEDDING_DIMENSIONS)||768,ollamaHost:process.env.OLLAMA_HOST||"http://localhost:11434",openaiApiKey:process.env.OPENAI_API_KEY||"",voyageApiKey:process.env.VOYAGE_API_KEY||""},llm:{provider:process.env.LLM_PROVIDER||"",openaiApiKey:process.env.OPENAI_API_KEY||"",openaiModel:process.env.LLM_OPENAI_MODEL||"gpt-4o-mini",ollamaHost:process.env.LLM_OLLAMA_HOST||process.env.OLLAMA_HOST||"http://localhost:11434",ollamaModel:process.env.LLM_OLLAMA_MODEL||"qwen2.5:7b",cliModel:process.env.LLM_CLI_MODEL||"haiku",apiKey:process.env.ANTHROPIC_API_KEY||"",extractionModel:process.env.LLM_EXTRACTION_MODEL||"",decisionModel:process.env.LLM_DECISION_MODEL||"",entityModel:process.env.LLM_ENTITY_MODEL||"",maxRetries:Number(process.env.LLM_MAX_RETRIES)||3,cliTimeout:Number(process.env.LLM_CLI_TIMEOUT)||12e4},output:{storage:process.env.OUTPUT_STORAGE||"local",dir:process.env.OUTPUT_DIR||"./output",s3:{endpoint:process.env.S3_ENDPOINT||"",bucket:process.env.S3_BUCKET||"",region:process.env.S3_REGION||"us-east-1",accessKey:process.env.S3_ACCESS_KEY||"",secretKey:process.env.S3_SECRET_KEY||"",publicUrl:process.env.S3_PUBLIC_URL||""}},server:{port:Number(process.env.PORT)||4e3,host:process.env.HOST||"0.0.0.0",logLevel:process.env.LOG_LEVEL||"info"},defaults:{namespace:process.env.DEFAULT_NAMESPACE||"default"},memory:{skipThreshold:Number(process.env.MEMORY_SKIP_THRESHOLD)||.88,ambiguousThreshold:Number(process.env.MEMORY_AMBIGUOUS_THRESHOLD)||.78,minFactSimilarity:Number(process.env.MEMORY_MIN_FACT_SIMILARITY)||.45},search:{synthesize:I("SIGIL_SYNTHESIZE","CORTEX_SYNTHESIZE","true")!=="false",synthesizeModel:I("SIGIL_SYNTH_MODEL","CORTEX_SYNTH_MODEL","")},ingest:{eagerExtract:I("SIGIL_EAGER_EXTRACT","CORTEX_EAGER_EXTRACT","true")!=="false"}},d=Ue});var St={};C(St,{chat:()=>We});async function We(t,{model:e,jsonMode:n=!1}={}){let o=e||d.llm.openaiModel,i=[{role:"user",content:t}];n&&!t.toLowerCase().includes("json")&&i.unshift({role:"system",content:"Respond with valid JSON."});let a={model:o,messages:i};n&&(a.response_format={type:"json_object"});let s=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${d.llm.openaiApiKey}`},body:JSON.stringify(a)});if(!s.ok){let E=await s.text();throw new Error(`OpenAI error ${s.status}: ${E}`)}let r=await s.json(),c=r.choices[0].message.content.trim(),u=r.usage||{};return{text:c,inputTokens:u.prompt_tokens||0,outputTokens:u.completion_tokens||0,model:o}}var At=h(()=>{w()});import{createRequire as Ye}from"node:module";import{join as Ge}from"node:path";import{homedir as Ke}from"node:os";import{mkdirSync as je}from"node:fs";async function qe(t){if(!b){let{PGlite:e}=await import("@electric-sql/pglite"),{vector:n}=await import("@electric-sql/pglite/vector");je(t,{recursive:!0}),b=new e(`file://${t}`,{extensions:{vector:n}}),await b.waitReady}return b}var Ve,ze,et,b,tt,W,Tt=h(()=>{Ve=Ye(import.meta.url),ze=Ve("knex/lib/dialects/postgres/index.js"),et=process.env.SIGIL_PGLITE_PATH||Ge(Ke(),".sigil","db"),b=null;tt=class{constructor(e){this._db=e}query(e,n){let o=typeof e=="string"?e:e.text,i=e?.values||[],s=!i.length&&o.split(";").filter(r=>r.trim()).length>1?this._db.exec(o).then(r=>{let c=r[r.length-1]||{};return{command:o.trim().split(/\s+/)[0].toUpperCase(),rows:c.rows||[],fields:c.fields||[],rowCount:c.affectedRows??c.rows?.length??0}}):this._db.query(o,i).then(r=>({command:(o||"").trim().split(/\s+/)[0].toUpperCase(),rows:r.rows,fields:r.fields||[],rowCount:r.affectedRows??r.rows.length}));if(typeof n=="function")s.then(r=>n(null,r)).catch(r=>n(r));else return s}end(e){return typeof e=="function"?e(null):Promise.resolve()}on(){}removeListener(){}},W=class extends ze{constructor(e){super(e),this._pglitePath=e?.connection?.pglitePath||et}acquireRawConnection(){return qe(this._pglitePath).then(e=>(this.version||(this.version="17.0"),new tt(e)))}async destroyRawConnection(){}async destroy(){await super.destroy(),b&&(await b.close(),b=null)}}});var Y={};C(Y,{default:()=>f});import Nt from"knex";function Ct(t){return Array.isArray(t)?t.map(nt):t&&typeof t=="object"?nt(t):t}function Rt(t,e){return e(Xe(t))}function nt(t){if(!t||typeof t!="object"||t instanceof Date)return t;if(Array.isArray(t))return t.map(nt);let e={};for(let[n,o]of Object.entries(t))e[n.replace(/_([a-z])/g,(i,a)=>a.toUpperCase())]=o;return e}function Xe(t){return t.replace(/[A-Z]/g,e=>`_${e.toLowerCase()}`)}var Je,Ze,f,S=h(()=>{w();Tt();Je=d.db.type==="postgres",Ze=Je?Nt({client:"pg",connection:{host:d.db.host,port:d.db.port,database:d.db.database,user:d.db.user,password:d.db.password},pool:{min:2,max:10},postProcessResponse:Ct,wrapIdentifier:Rt}):Nt({client:W,connection:{pglitePath:et},pool:{min:1,max:1},postProcessResponse:Ct,wrapIdentifier:Rt});f=Ze});function T(t){return Math.ceil((t||"").length/4)}function ot(t,e,n){let o=Qe[t];return o?(e*o.input+n*o.output)/1e6:0}function x({provider:t,model:e,caller:n,input:o,response:i,inputTokens:a,outputTokens:s,cost:r,durationMs:c,status:u,error:E}){f("llm_log").insert({provider:t,model:e,caller:n,input:o?.slice(0,1e4),response:i?.slice(0,1e4),inputTokens:a,outputTokens:s,cost:r,durationMs:c,status:u,error:E?.slice(0,2e3)}).catch(l=>console.error("[llm-log] Write failed:",l.message))}async function rt(t,e=3){for(let n=1;n<=e;n++)try{return await t()}catch(o){if(n===e)throw o;let i=Math.min(1e3*2**(n-1),1e4);await new Promise(a=>setTimeout(a,i))}}var Qe,P=h(()=>{S();Qe={"gpt-4o-mini":{input:.15,output:.6},"gpt-4o":{input:2.5,output:10},"gpt-4.1-nano":{input:.1,output:.4},"gpt-4.1-mini":{input:.4,output:1.6},"claude-haiku-4-5-20251001":{input:.8,output:4},"claude-sonnet-4-6":{input:3,output:15},"claude-opus-4-6":{input:15,output:75}}});var It={};C(It,{chat:()=>en});async function tn(){if(!it){let{default:t}=await import("@anthropic-ai/sdk");it=new t({apiKey:d.llm.apiKey})}return it}async function en(t,{model:e,jsonMode:n=!1}={}){let o=e||"claude-haiku-4-5-20251001",i=await tn(),a=[{role:"user",content:t}],s=n?"Respond with valid JSON only. No explanation or wrapping.":void 0,r=await i.messages.create({model:o,max_tokens:4096,messages:a,...s&&{system:s}});return{text:r.content[0].text.trim(),inputTokens:r.usage?.input_tokens||T(t),outputTokens:r.usage?.output_tokens||T(r.content[0].text),model:o}}var it,Ot=h(()=>{w();P();it=null});var bt={};C(bt,{chat:()=>sn});import{spawn as nn}from"node:child_process";function an(t,e){let n=d.llm.cliTimeout||12e4;return new Promise((o,i)=>{let a=nn("claude",t,{stdio:["pipe","pipe","pipe"]}),s=setTimeout(()=>{a.kill("SIGTERM"),i(new Error(`claude CLI timed out after ${n}ms`))},n),r="",c="";a.stdout.on("data",u=>{r+=u}),a.stderr.on("data",u=>{c+=u}),a.on("error",u=>{clearTimeout(s),i(new Error(`Failed to spawn claude CLI: ${u.message}`))}),a.on("close",u=>{clearTimeout(s),o({stdout:r,stderr:c,code:u})}),a.stdin.write(e),a.stdin.end()})}async function sn(t,{model:e,jsonMode:n=!1}={}){let o=e||d.llm.cliModel||"haiku",i=on[o]||o,a=["-p","--model",i,"--output-format","json"];n&&a.push("--json-schema",rn);let{stdout:s,stderr:r,code:c}=await an(a,t);if(c!==0)throw new Error(`claude CLI exited ${c}: ${(r||s).slice(0,500)}`);let u;try{u=JSON.parse(s)}catch{return{text:s.trim(),inputTokens:T(t),outputTokens:T(s),model:i}}if(u.is_error)throw new Error(`claude CLI error: ${u.result||"unknown error"}`);let E=n&&u.structured_output?JSON.stringify(u.structured_output):(u.result||"").trim(),l=u.usage||{};return{text:E,inputTokens:l.input_tokens||T(t),outputTokens:l.output_tokens||T(E),model:i,cost:u.total_cost_usd||0}}var on,rn,Dt=h(()=>{w();P();on={"claude-haiku-4-5-20251001":"haiku","claude-sonnet-4-6":"sonnet","claude-opus-4-6":"opus"},rn=JSON.stringify({type:"object",additionalProperties:!0})});var Lt={};C(Lt,{chat:()=>cn});async function cn(t,{model:e,jsonMode:n=!1}={}){let o=e||d.llm.ollamaModel,i=`${d.llm.ollamaHost}/api/chat`,a={model:o,messages:[{role:"user",content:t}],stream:!1};n&&(a.format="json");let s=await fetch(i,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(a)});if(!s.ok){let c=await s.text();throw new Error(`Ollama error ${s.status}: ${c}`)}let r=await s.json();return{text:r.message.content.trim(),inputTokens:r.prompt_eval_count||T(t),outputTokens:r.eval_count||T(r.message.content),model:o}}var vt=h(()=>{w();P()});var kt={};C(kt,{embedBatch:()=>dn});async function dn(t,{model:e,ollamaHost:n}){let o=$(t,un),i=[];for(let a of o){let s=await fetch(`${n}/api/embed`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:e,input:a})});if(!s.ok)throw new Error(`Ollama embed failed: ${s.status} ${await s.text()}`);let r=await s.json();i.push(...r.embeddings)}return i}var un,Mt=h(()=>{U();un=50});var xt={};C(xt,{embedBatch:()=>ln});async function ln(t,{model:e,openaiApiKey:n,dimensions:o}={}){let i={model:e,input:t};o&&/^text-embedding-3/.test(e)&&(i.dimensions=o);let a=await fetch("https://api.openai.com/v1/embeddings",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${n}`},body:JSON.stringify(i)});if(!a.ok)throw new Error(`OpenAI embed failed: ${a.status} ${await a.text()}`);return(await a.json()).data.map(r=>r.embedding)}var Pt=h(()=>{});var Ft={};C(Ft,{embedBatch:()=>pn});async function pn(t,{model:e,voyageApiKey:n,inputType:o="document",dimensions:i}={}){if(!n)throw new Error("VOYAGE_API_KEY is not set. Get one at dashboard.voyageai.com.");let a=$(t,mn),s=[];for(let r of a){let c={input:r,model:e||"voyage-3-large",input_type:o==="query"?"query":"document"};i&&(c.output_dimension=i);let u=await fetch("https://api.voyageai.com/v1/embeddings",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${n}`},body:JSON.stringify(c)});if(!u.ok){let m=await u.text();throw new Error(`Voyage embed failed: ${u.status} ${m}`)}let l=[...(await u.json()).data].sort((m,p)=>m.index-p.index);s.push(...l.map(m=>m.embedding))}return s}var mn,Ht=h(()=>{U();mn=50});import{spawn as fn}from"node:child_process";async function ut(t){if(!at[t]){let e=ct[t];if(!e)throw new Error(`Unknown LLM provider: "${t}". Available: ${Object.keys(ct).join(", ")}`);let n=await e();at[t]=n.chat}return at[t]}async function $t(t){if(!st[t]){let e=Bt[t];if(!e)throw new Error(`Unknown embedding provider: "${t}". Available: ${Object.keys(Bt).join(", ")}`);let n=await e();st[t]=n.embedBatch}return st[t]}function Ut(t,e){if(!t)return{provider:e,model:null};let n=t.indexOf(":");return n>0&&ct[t.slice(0,n)]?{provider:t.slice(0,n),model:t.slice(n+1)}:{provider:e,model:t}}async function Wt(){let t=d.llm.ollamaHost||d.embedding.ollamaHost||"http://localhost:11434";try{return(await fetch(`${t}/api/tags`,{signal:AbortSignal.timeout(2e3)})).ok}catch{return!1}}function hn(){return new Promise(t=>{let e=fn("claude",["--version"],{stdio:"pipe"});e.on("error",()=>t(!1)),e.on("close",n=>t(n===0)),setTimeout(()=>{e.kill(),t(!1)},3e3)})}async function Yt(){if(A)return A;if(d.llm.provider)return A=d.llm.provider,A;if(d.llm.apiKey)return A="anthropic",A;if(d.llm.openaiApiKey)return A="openai",A;if(await Wt())return A="ollama",A;if(await hn())return A="claude-cli",A;throw new Error(`No LLM provider available. Either:
  - Set LLM_PROVIDER (openai, anthropic, ollama, claude-cli)
  - Set ANTHROPIC_API_KEY or OPENAI_API_KEY
  - Start Ollama locally
  - Install the Claude CLI (claude)`)}async function Gt(){if(R)return R;if(d.embedding.provider)return R=d.embedding.provider,R;if(d.embedding.voyageApiKey)return R="voyage",R;if(await Wt())return R="ollama",R;if(d.embedding.openaiApiKey)return R="openai",R;throw new Error(`No embedding provider available. Either:
  - Set EMBEDDING_PROVIDER (voyage, ollama, openai)
  - Set VOYAGE_API_KEY (recommended \u2014 best quality)
  - Start Ollama locally
  - Set OPENAI_API_KEY`)}var ct,Bt,at,st,A,R,dt=h(()=>{w();ct={openai:()=>Promise.resolve().then(()=>(At(),St)),anthropic:()=>Promise.resolve().then(()=>(Ot(),It)),"claude-cli":()=>Promise.resolve().then(()=>(Dt(),bt)),ollama:()=>Promise.resolve().then(()=>(vt(),Lt))},Bt={ollama:()=>Promise.resolve().then(()=>(Mt(),kt)),openai:()=>Promise.resolve().then(()=>(Pt(),xt)),voyage:()=>Promise.resolve().then(()=>(Ht(),Ft))},at={},st={};A=null,R=null});function O(t){return t?`[${t.join(",")}]`:null}var L=h(()=>{});import{createHash as En}from"node:crypto";function _n(t,e,n,o="document"){let i=En("sha256");return i.update(t),i.update("\0"),i.update(e),i.update("\0"),i.update(o),i.update("\0"),i.update(n),i.digest("hex")}async function gn(t){if(!t.length)return new Map;let e=await f("embedding_cache").whereIn("key",t).select("key","embedding");return new Map(e.map(n=>[n.key,wn(n.embedding)]))}function wn(t){return Array.isArray(t)||typeof t!="string"?t:(t.startsWith("[")?t.slice(1,-1):t).split(",").map(Number)}async function Sn(t){t.length&&await f("embedding_cache").whereIn("key",t).update({hits:f.raw("hits + 1"),lastUsedAt:f.fn.now()})}async function An(t,e,n){if(t.length){for(let{key:o,embedding:i}of t)await f.raw(`
      INSERT INTO embedding_cache (key, provider, model, embedding, hits, created_at, last_used_at)
      VALUES (?, ?, ?, ?, 0, NOW(), NOW())
      ON CONFLICT (key) DO UPDATE
        SET last_used_at = NOW(),
            hits = embedding_cache.hits + 1
    `,[o,e,n,O(i)]);await Nn()}}async function Nn(){let t=Date.now();if(t-jt<Tn)return;jt=t;let[{count:e}]=await f("embedding_cache").count("key as count"),n=Number(e);if(n<=Kt)return;let o=Math.min(n-Kt,yn);await f.raw(`
    DELETE FROM embedding_cache WHERE key IN (
      SELECT key FROM embedding_cache ORDER BY last_used_at ASC LIMIT ?
    )
  `,[o])}async function Vt(t,e,n,o,i,a={}){if(!t.length)return[];let s=a.inputType||i?.inputType||"document",r=t.map(p=>_n(e,n,p,s)),c=await gn(r),u=[],E=[],l=new Array(t.length);for(let p=0;p<t.length;p++){let y=c.get(r[p]);y?l[p]=y:(u.push(t[p]),E.push(p))}if(u.length){let p=await o(u,i),y=[];for(let _=0;_<u.length;_++){let N=E[_];l[N]=p[_],y.push({key:r[N],embedding:p[_]})}An(y,e,n).catch(_=>{process.stderr.write(`[embedding-cache] store failed: ${_.message}
`)})}let m=r.filter(p=>c.has(p));return m.length&&Sn(m).catch(()=>{}),l}var Kt,yn,jt,Tn,zt=h(()=>{L();S();Kt=1e4,yn=500;jt=0,Tn=6e4});async function lt(t,e={}){let[n]=await G([t],e);return n}async function G(t,{inputType:e="document"}={}){if(!t.length)return[];let n=await Gt(),o=await $t(n),i=d.embedding.model,a={...d.embedding,inputType:e};return Vt(t,n,i,o,a,{inputType:e})}var Wo,mt=h(()=>{w();dt();zt();({dimensions:Wo}=d.embedding)});async function qt(t,e){let n=e||d.defaults.namespace,o=t.toLowerCase();return f("entity").where({namespace:n}).whereNull("mergedWith").where(function(){this.whereRaw("LOWER(name) = ?",[o]).orWhereRaw("aliases @> ARRAY[?]::text[]",[o])}).first()||null}async function Jt(t,{entityType:e,namespace:n,limit:o=10}={}){let i=f("entity").whereRaw("LOWER(name) LIKE ?",[`%${t.toLowerCase()}%`]).whereNull("mergedWith").orderBy("mentionCount","desc").limit(o);return e&&i.where({entityType:e}),n&&i.where({namespace:n}),i}var Zt=h(()=>{S();L();w()});async function Xt(t,{limit:e=50}={}){return f("fact").join("fact_entity","fact.id","fact_entity.fact_id").where("fact_entity.entity_id",t).where("fact.status","active").select("fact.*","fact_entity.mention_count as entityMentionCount").orderBy("fact_entity.mention_count","desc").limit(e)}async function Qt(t){if(!t.length)return new Map;let e=await f("fact_entity").whereIn("factId",t).select("factId","entityId"),n=new Map;for(let o of e)n.has(o.factId)||n.set(o.factId,[]),n.get(o.factId).push(o.entityId);return n}var pt=h(()=>{S()});async function te(t){let e=await Yt();return Ut(t,e)}async function ft(t,{model:e,caller:n}={}){let{provider:o,model:i}=await te(e),a=await ut(o),s=Date.now();try{let r=await rt(()=>a(t,{model:i,jsonMode:!1}),d.llm.maxRetries),c=r.cost||ot(r.model,r.inputTokens,r.outputTokens);return x({provider:o,model:r.model,caller:n,input:t,response:r.text,inputTokens:r.inputTokens,outputTokens:r.outputTokens,cost:c,durationMs:Date.now()-s,status:"success"}),r.text}catch(r){throw x({provider:o,model:i,caller:n,input:t,response:null,inputTokens:0,outputTokens:0,cost:0,durationMs:Date.now()-s,status:"error",error:r.message}),r}}async function K(t,{model:e,caller:n}={}){let{provider:o,model:i}=await te(e),a=await ut(o),s=Date.now();try{let r=await rt(()=>a(t,{model:i,jsonMode:!0}),d.llm.maxRetries),c=r.cost||ot(r.model,r.inputTokens,r.outputTokens);return x({provider:o,model:r.model,caller:n,input:t,response:r.text,inputTokens:r.inputTokens,outputTokens:r.outputTokens,cost:c,durationMs:Date.now()-s,status:"success"}),Cn(r.text)}catch(r){throw x({provider:o,model:i,caller:n,input:t,response:null,inputTokens:0,outputTokens:0,cost:0,durationMs:Date.now()-s,status:"error",error:r.message}),r}}function Cn(t){try{return JSON.parse(t.trim())}catch{}let e=t.match(/```(?:json)?\s*([\s\S]*?)```/);if(e)try{return JSON.parse(e[1].trim())}catch{}let n=t.match(/[\[{][\s\S]*[\]}]/);if(n)try{return JSON.parse(n[0])}catch{}return null}var F=h(()=>{w();dt();P()});import{fileURLToPath as Rn}from"node:url";import{dirname as ee,join as j}from"node:path";import{existsSync as ne}from"node:fs";function In(){let t=ee(Rn(import.meta.url));for(let e=0;e<10;e++){if(ne(j(t,"package.json"))&&ne(j(t,"prompts")))return t;let n=ee(t);if(n===t)break;t=n}return process.cwd()}var oe,V,or,ht=h(()=>{oe=In(),V=j(oe,"prompts"),or=j(oe,"src","db","migrations")});import On from"node:path";async function re(t){t.length&&await f.raw(`UPDATE fact_lifecycle
     SET access_count = access_count + 1,
         last_accessed_at = NOW(),
         stage = CASE WHEN stage = 'stable' THEN 'editing' ELSE stage END,
         stage_entered_at = CASE WHEN stage = 'stable' THEN NOW() ELSE stage_entered_at END
     WHERE fact_id = ANY(?)`,[t])}var mr,pr,fr,ie=h(()=>{S();mt();F();L();w();ht();mr=On.join(V,"audm-decision.md"),pr=d.memory.skipThreshold,fr=d.memory.ambiguousThreshold});async function ae(t){if(!t||t.length<2)return;let e=[...new Set(t.filter(a=>Number.isInteger(a)))].sort((a,s)=>a-s);if(e.length<2)return;let n=[];for(let a=0;a<e.length;a++)for(let s=a+1;s<e.length;s++)n.push([e[a],e[s]]);let o=n.map(()=>"(?, ?, 1, NOW(), NOW())").join(", "),i=n.flat();await f.raw(`
    INSERT INTO hebbian_edge (fact_a_id, fact_b_id, strength, first_seen_at, last_seen_at)
    VALUES ${o}
    ON CONFLICT (fact_a_id, fact_b_id)
    DO UPDATE SET
      strength = hebbian_edge.strength + 1,
      last_seen_at = NOW()
  `,i)}var se=h(()=>{S()});async function ce(t,{direction:e="both",relationType:n,limit:o=50}={}){let i=r=>{let c=r==="outgoing"?"source_id":"target_id",u=r==="outgoing"?"target_id":"source_id";return f.raw(`
      SELECT r.id AS "relationId", r.relation_type AS "relationType",
             r.mention_count AS "mentionCount", r.valid_at AS "validAt",
             e.id AS "entityId", e.uid, e.name, e.entity_type AS "entityType",
             e.description, '${r}' AS direction
      FROM relation r
      JOIN entity e ON e.id = r.${u}
      WHERE r.${c} = ?
        AND r.invalid_at IS NULL
        AND e.merged_with IS NULL
        ${n?"AND r.relation_type = ?":""}
      ORDER BY r.mention_count DESC
      LIMIT ?
    `,n?[t,n,o]:[t,o])};if(e==="outgoing"){let{rows:r}=await i("outgoing");return r}if(e==="incoming"){let{rows:r}=await i("incoming");return r}let[a,s]=await Promise.all([i("outgoing"),i("incoming")]);return[...a.rows,...s.rows]}var ue=h(()=>{S()});function z({minConfidence:t="medium",pointInTime:e,categories:n}){let o=bn[t]??1,i=[o],a="",s="";return e&&(a="AND valid_from <= ? AND (valid_until IS NULL OR valid_until > ?)",i.push(e,e)),n?.length&&(s="AND category = ANY(?)",i.push(n)),{minRank:o,temporalClause:a,categoryClause:s,filterParams:i}}var bn,H,q=h(()=>{bn={low:0,medium:1,high:2},H=`CASE confidence
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 1
            ELSE 0
          END`});async function de(t,{namespaces:e,limit:n=20}){let o=O(t),{rows:i}=await f.raw(`
    SELECT id, document_id AS "documentId", chunk_index AS "chunkIndex",
           content, section_heading AS "sectionHeading", namespace,
           1 - (embedding <=> ?) as similarity
    FROM chunk
    WHERE namespace = ANY(?)
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ?
    LIMIT ?
  `,[o,e,o,n]);return i}var le=h(()=>{S();L();w();q()});async function me(t,{namespaces:e,limit:n=20}){let{rows:o}=await f.raw(`
    SELECT id, document_id AS "documentId", chunk_index AS "chunkIndex",
           content, section_heading AS "sectionHeading", namespace,
           ts_rank(search_vector, plainto_tsquery('english', ?)) as rank
    FROM chunk
    WHERE namespace = ANY(?)
      AND search_vector @@ plainto_tsquery('english', ?)
    ORDER BY rank DESC
    LIMIT ?
  `,[t,e,t,n]);return o}var pe=h(()=>{S();q()});async function he(t,e,{namespaces:n,limit:o=5,minConfidence:i="medium",pointInTime:a,categories:s}){let r=O(e),{temporalClause:c,categoryClause:u,filterParams:E}=z({minConfidence:i,pointInTime:a,categories:s}),l=o*Mn,[m,...p]=E,y=[r,r,n,m,...p,r,l],_=[t,t,n,m,t,...p,l],N=[l,l,o],Z=`
    WITH semantic AS (
      SELECT id,
             uid,
             content, category, confidence, importance, namespace, status,
             source_document_ids AS "sourceDocumentIds",
             source_section AS "sourceSection",
             created_at,
             1 - (embedding <=> ?) AS similarity,
             ROW_NUMBER() OVER (ORDER BY embedding <=> ?) AS rank_ix
      FROM fact
      WHERE namespace = ANY(?)
        AND status = 'active'
        AND embedding IS NOT NULL
        AND ${H} >= ?
        ${c}
        ${u}
      ORDER BY embedding <=> ?
      LIMIT ?
    ),
    keyword AS (
      SELECT id,
             uid,
             content, category, confidence, importance, namespace, status,
             source_document_ids AS "sourceDocumentIds",
             source_section AS "sourceSection",
             created_at,
             ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', ?)) AS keyword_rank,
             ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', ?)) DESC) AS rank_ix
      FROM fact
      WHERE namespace = ANY(?)
        AND status = 'active'
        AND ${H} >= ?
        AND to_tsvector('english', content) @@ plainto_tsquery('english', ?)
        ${c}
        ${u}
      ORDER BY keyword_rank DESC
      LIMIT ?
    ),
    fused AS (
      SELECT COALESCE(s.id, k.id) AS id,
             COALESCE(s.uid, k.uid) AS uid,
             COALESCE(s.content, k.content) AS content,
             COALESCE(s.category, k.category) AS category,
             COALESCE(s.confidence, k.confidence) AS confidence,
             COALESCE(s.importance, k.importance) AS importance,
             COALESCE(s.namespace, k.namespace) AS namespace,
             COALESCE(s.status, k.status) AS status,
             COALESCE(s."sourceDocumentIds", k."sourceDocumentIds") AS "sourceDocumentIds",
             COALESCE(s."sourceSection", k."sourceSection") AS "sourceSection",
             COALESCE(s.created_at, k.created_at) AS created_at,
             COALESCE(s.similarity, 0) AS similarity,
             (
               ${vn} * (1.0 / (${fe} + COALESCE(s.rank_ix, ?)))
             + ${kn} * (1.0 / (${fe} + COALESCE(k.rank_ix, ?)))
             ) AS rrf_raw
      FROM semantic s
      FULL OUTER JOIN keyword k ON s.id = k.id
    ),
    ranked AS (
      SELECT f.*,
             COALESCE(fl.access_count, 0) AS access_count,
             fl.last_accessed_at,
             -- ACT-R activation: ln(n+1) - 0.5*ln(t_days), softplus to keep >= 0.
             -- t_days floor of 0.01 prevents log(0). Recently-accessed facts win ties.
             ln(1.0 + exp(
               ln(COALESCE(fl.access_count, 0) + 1.0)
               - 0.5 * ln(
                   GREATEST(
                     EXTRACT(epoch FROM (now() - COALESCE(fl.last_accessed_at, f.created_at))) / 86400.0,
                     0.01
                   )
                 )
             )) AS activation,
             CASE f.importance WHEN 'vital' THEN ${xn} ELSE 1.0 END AS importance_mult,
             CASE f.confidence
               WHEN 'high'   THEN ${Pn}
               WHEN 'medium' THEN ${Fn}
               WHEN 'low'    THEN ${Hn}
               ELSE 1.0
             END AS confidence_mult
      FROM fused f
      LEFT JOIN fact_lifecycle fl ON fl.fact_id = f.id
    )
    SELECT id, uid, content, category, confidence, importance, namespace, status,
           "sourceDocumentIds", "sourceSection", similarity,
           rrf_raw,
           access_count,
           last_accessed_at AS "lastAccessedAt",
           activation,
           (rrf_raw * activation * importance_mult * confidence_mult) AS final_score
    FROM ranked
    ORDER BY final_score DESC,
             CASE WHEN importance = 'vital' THEN 0 ELSE 1 END
    LIMIT ?
  `,X=[...y,..._,...N],{rows:D}=await f.raw(Z,X);if(!D.length)return[];let g=D[0].final_score||D[0].rrf_raw||1;return D.map(k=>({...k,rrfScore:Math.round(Number(k.final_score||k.rrf_raw)/Number(g)*100)/100}))}var fe,vn,kn,Mn,xn,Pn,Fn,Hn,Ee=h(()=>{S();L();w();q();fe=20,vn=1,kn=.7,Mn=3,xn=1.5,Pn=1,Fn=.85,Hn=.7});async function ye(t){let e=t.map(i=>i.id),n=await Qt(e),o=new Set;for(let i of n.values())for(let a of i)o.add(a);return o.size?f("entity").whereIn("id",[...o]).whereNull("mergedWith").select("id","uid","name","entityType","description"):[]}async function _e(t,{limit:e=10}={}){if(!t.length)return[];let n=await f("relation").where(function(){this.whereIn("sourceId",t).orWhereIn("targetId",t)}).whereNull("invalidAt").select("*").limit(e*3),o=new Set(t),i=new Set,a=new Map;for(let l of n){let m=o.has(l.sourceId)?l.targetId:l.sourceId;i.add(m),a.has(m)||a.set(m,l)}if(!i.size)return[];let s=await f("entity").whereIn("id",[...i]).whereNull("mergedWith").select("id","name"),r=new Map(s.map(l=>[l.id,l.name])),c=await f("fact").join("fact_entity","fact.id","fact_entity.factId").whereIn("fact_entity.entityId",[...i]).where("fact.status","active").select("fact.*","fact_entity.entityId").orderBy("fact_entity.mentionCount","desc").limit(e*3),u=new Set,E=[];for(let l of c){if(u.has(l.id))continue;u.add(l.id);let m=a.get(l.entityId),p=r.get(l.entityId)||"unknown",y=m?.relationType||"related";if(E.push({...l,relationPath:`${p} (${y})`,graphDistance:1}),E.length>=e)break}return E}function ge(t,e,n,o){let i=new Set(n),a=t.map(r=>({...r,resultType:"direct"})),s=e.filter(r=>!t.some(c=>c.id===r.id)).map(r=>({...r,rrfScore:(r.rrfScore||.1)*.5,resultType:"related"}));return[...a,...s].slice(0,o)}var we=h(()=>{S();pt()});var v,Et=h(()=>{v=class{#t=new Map;#e;#n;constructor({maxSize:e=100,ttlMs:n=300*1e3}={}){this.#e=e,this.#n=n}get(e){let n=this.#t.get(e);if(n){if(Date.now()-n.timestamp>this.#n){this.#t.delete(e);return}return n.value}}set(e,n){if(this.#t.size>=this.#e){let o=this.#t.keys().next().value;this.#t.delete(o)}this.#t.set(e,{value:n,timestamp:Date.now()})}}});async function Ae(t){let e=Se.get(t);if(e)return e;let n=`You are a search query expander for a personal knowledge base.

Given the user's query, generate 3-5 alternative search queries that would help find ALL relevant information \u2014 including facts that don't literally match the query but are semantically related.

Think about:
- Synonyms and rephrased versions
- Inverse/negative framings (if someone asks "what should I use", also search for "what to avoid")
- Related concepts that would inform the answer
- Specific terms someone might have used when storing this knowledge

User query: "${t}"

Respond with ONLY a JSON array of strings. Do not include the original query.`;try{let o=await K(n,{model:d.llm.extractionModel,caller:"query-expander"});if(!Array.isArray(o))return[t];let i=o.filter(s=>typeof s=="string"&&s.trim()).slice(0,Bn),a=i.length?[t,...i]:[t];return Se.set(t,a),a}catch(o){return console.error("[query-expander] Failed:",o.message),[t]}}var Bn,Se,Te=h(()=>{F();Et();w();Bn=5,Se=new v({maxSize:100,ttlMs:300*1e3})});import{readFile as $n}from"node:fs/promises";import{join as Un}from"node:path";async function Re(t){let e=t.trim().toLowerCase(),n=yt.get(e);if(n)return n;let i=`${await $n(Wn,"utf8")}

---

Query: ${t}

---

Respond with ONLY a JSON object: { "intent": "preference|factual|entity_lookup|exploratory|temporal", "categories": [...], "entities": [...], "expand": bool, "pointInTime": null or "YYYY-MM-DD", "reasoning": "..." }`;try{let a=await K(i,{model:d.llm.extractionModel,caller:"query-router"});if(!a||!Yn.includes(a.intent)){let c=Ne("factual",{});return yt.set(e,c),c}let s=Ce[a.intent],r={intent:a.intent,categories:Array.isArray(a.categories)&&a.categories.length?a.categories:s.categories,entities:Array.isArray(a.entities)?a.entities:[],expand:typeof a.expand=="boolean"?a.expand:s.expand,useGraph:s.useGraph,limit:s.limit,pointInTime:a.pointInTime||null,reasoning:a.reasoning||""};return yt.set(e,r),r}catch(a){return console.error("[query-router] Failed:",a.message),Ne("factual",{reasoning:`Fallback \u2014 ${a.message}`})}}function Ne(t,e={}){let n=Ce[t];return{intent:t,categories:n.categories,entities:[],expand:n.expand,useGraph:n.useGraph,limit:n.limit,pointInTime:null,reasoning:"",...e}}var Wn,yt,Yn,Ce,Ie=h(()=>{F();Et();w();ht();Wn=Un(V,"query-router.md"),yt=new v({maxSize:200,ttlMs:600*1e3}),Yn=["preference","factual","entity_lookup","exploratory","temporal"],Ce={preference:{categories:["preference","opinion","personal"],expand:!1,useGraph:!1,limit:null},factual:{categories:[],expand:!1,useGraph:!1,limit:null},entity_lookup:{categories:[],expand:!1,useGraph:!0,limit:null},exploratory:{categories:[],expand:!0,useGraph:!0,limit:15},temporal:{categories:[],expand:!1,useGraph:!1,limit:null}}});var be={};C(be,{search:()=>Vn});async function Vn(t,{namespaces:e,limit:n=5,minConfidence:o="medium",useGraph:i=!1,includeChunks:a=!1,pointInTime:s,expand:r=!1,route:c=!0,categories:u,synthesize:E=d.search.synthesize}={}){E&&(a=!0);let l=null;c&&(l=await Re(t),i=i||l.useGraph,r=r||l.expand,n=l.limit||n,s=s||l.pointInTime,u=u||(l.categories.length?l.categories:void 0));let m=await qn(t,e),p;m?p=await Jn(m,t,{namespaces:e,limit:n,minConfidence:o,includeChunks:a,pointInTime:s,categories:u}):p=await Qn(t,{namespaces:e,limit:n,minConfidence:o,useGraph:i,includeChunks:a,pointInTime:s,expand:r,categories:u});let y=p.facts.map(_=>_.id).filter(Boolean);if(re(y).catch(_=>console.error("[access-tracking]",_.message)),ae(y.slice(0,8)).catch(_=>console.error("[hebbian]",_.message)),E)try{p.synthesized=await zn(t,p)}catch(_){console.error("[synthesizer] failed:",_.message),p.synthesized=null}return p}async function zn(t,{facts:e,chunks:n}){let o=[];if(e.slice(0,10).forEach((s,r)=>{o.push(`[F${r+1}] (${s.category}) ${s.content}`)}),n.length&&n.slice(0,15).forEach((s,r)=>{let c=(s.content||"").replace(/\s+/g," ").trim();c&&o.push(`[C${r+1}] ${c.slice(0,2e3)}`)}),!o.length)return"No retrieved evidence \u2014 nothing to synthesize.";let i=`You are answering a question from a personal-memory system.
Each retrieved item is labeled [F#] (a stored fact) or [C#] (a raw conversation chunk
that may include user/assistant turns and dates).

Question: ${t}

Retrieved memory items:
${o.join(`
`)}

Instructions:
- Read the chunks carefully \u2014 the answer is often a specific phrase or date inside one of them, not always pre-summarized as a fact.
- Reason step-by-step internally for temporal questions ("first", "before", "after", "how many days") \u2014 compare the dates explicitly.
- Cite items in square brackets where they directly support the answer, e.g. [C2].
- Only respond "Not in retrieved memory." if you genuinely cannot find the information after carefully reading every chunk. Prefer a careful answer with citation over refusal.
- Plain text only, no headers. Direct answer first, then a short justification if needed. 1-4 sentences total.`,a=d.search.synthesizeModel||d.llm.extractionModel||void 0;return ft(i,{model:a,caller:"synthesizer"})}async function qn(t,e){if(t.length<2||t.length>jn)return null;let n=e[0]||d.defaults.namespace,o=await qt(t,n);return o||(await Jt(t,{namespace:n,limit:1}))[0]||null}async function Jn(t,e,{namespaces:n,limit:o,minConfidence:i,includeChunks:a,pointInTime:s,categories:r}){let c=Zn(e,t),u=await G(c,{inputType:"query"}),[E,l,...m]=await Promise.all([Xt(t.id,{limit:o}),ce(t.id,{limit:15}),...c.map((g,k)=>Oe(g,{queryEmbedding:u[k],namespaces:n,limit:o,minConfidence:i,includeChunks:a,pointInTime:s,categories:r}))]),p=E.map(g=>({...g,source:"entity"})),y=J(m.map(g=>g.facts),o*2),_=new Set(p.map(g=>g.id)),N=y.filter(g=>!_.has(g.id)).map(g=>({...g,source:"search"})),Z=[...p,...N].slice(0,o),X=a?J(m.map(g=>g.chunks||[]),o):[],D=l.map(g=>({id:g.entityId,name:g.name,type:g.entityType,relation:g.relationType,direction:g.direction,mentions:g.mentionCount}));return{facts:Z,chunks:X,matchedEntity:{id:t.id,name:t.name,type:t.entityType,mentions:t.mentionCount,description:t.description||null,aliases:t.aliases||[]},relatedEntities:D}}function Zn(t,e){let n=[t],o=(e.aliases||[]).filter(s=>typeof s=="string"&&s.trim());if(!o.length)return n;let i=(e.name||"").trim(),a=new Set([t.toLowerCase()]);for(let s of o){let r=t;if(i){let c=new RegExp(`\\b${Xn(i)}\\b`,"gi");if(c.test(r))r=r.replace(c,s);else{a.has(s.toLowerCase())||(n.push(s),a.add(s.toLowerCase()));continue}}a.has(r.toLowerCase())||(n.push(r),a.add(r.toLowerCase()))}return n}function Xn(t){return t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}async function Qn(t,{namespaces:e,limit:n,minConfidence:o,useGraph:i,includeChunks:a,pointInTime:s,expand:r=!1,categories:c}){let u=r?await Ae(t):[t],E=await G(u,{inputType:"query"}),l=await Promise.all(u.map((y,_)=>Oe(y,{queryEmbedding:E[_],namespaces:e,limit:n,minConfidence:o,includeChunks:a,pointInTime:s,categories:c}))),m=J(l.map(y=>y.facts),n);if(m=m.map(y=>({...y,source:"search"})),i&&m.length)try{let y=await ye(m.slice(0,5));if(y.length){let _=await _e(y.map(N=>N.id),{limit:5});m=ge(m,_,y.map(N=>N.id),n)}}catch(y){console.error("[graph-enhancement] Failed:",y.message)}let p=a?J(l.map(y=>y.chunks),n):[];return{facts:m,chunks:p,matchedEntity:null,relatedEntities:[]}}function J(t,e){let n={},o={};for(let s of t)for(let[r,c]of s.entries())o[c.id]=c,n[c.id]=(n[c.id]||0)+1/(_t+r+1);let i=Object.entries(n).sort(([,s],[,r])=>r-s),a=i.length?i[0][1]:1;return i.slice(0,e).map(([s,r])=>({...o[s],rrfScore:Math.round(r/a*100)/100}))}async function Oe(t,{queryEmbedding:e,namespaces:n,limit:o,minConfidence:i,includeChunks:a=!1,pointInTime:s,categories:r}){let c=e||await lt(t,{inputType:"query"}),u=he(t,c,{namespaces:n,limit:o,minConfidence:i,pointInTime:s,categories:r}),E=a?[de(c,{namespaces:n,limit:o}),me(t,{namespaces:n,limit:o})]:[],[l,...m]=await Promise.all([u,...E]),p=a&&m.length===2?to(m[0],m[1],o):[];return{facts:l,chunks:p}}function to(t,e,n){let o={},i={...Q(t,"id"),...Q(e,"id")};t.forEach((r,c)=>{o[r.id]=(o[r.id]||0)+Gn/(_t+c+1)}),e.forEach((r,c)=>{o[r.id]=(o[r.id]||0)+Kn/(_t+c+1)});let a=Object.entries(o).sort(([r,c],[u,E])=>{if(c!==E)return E-c;let l=i[r]?.importance==="vital"?1:0;return(i[u]?.importance==="vital"?1:0)-l}),s=a.length?a[0][1]:1;return a.slice(0,n).map(([r,c])=>({...i[r],rrfScore:Math.round(c/s*100)/100}))}var _t,Gn,Kn,jn,De=h(()=>{U();mt();w();Zt();pt();ie();se();ue();le();pe();Ee();we();Te();Ie();F();_t=20,Gn=1,Kn=.7,jn=60});import{resolve as eo,join as no}from"node:path";import{existsSync as Le}from"node:fs";import{config as ve}from"dotenv";var M="***MASKED***",Pe=[/\b(sk-(?:proj-|ant-)?[A-Za-z0-9_\-]{20,})\b/g,/\b(ghp_[A-Za-z0-9]{36,})\b/g,/\b(github_pat_[A-Za-z0-9_]{20,})\b/g,/\b(gho_[A-Za-z0-9]{36,})\b/g,/\b(glpat-[A-Za-z0-9_\-]{20,})\b/g,/\b(xox[baprs]-[A-Za-z0-9\-]{10,})\b/g,/\b(whsec_[A-Za-z0-9]{20,})\b/g,/\b(rk_(?:live|test)_[A-Za-z0-9]{20,})\b/g,/\b(AKIA[A-Z0-9]{16})\b/g,/\b(ASIA[A-Z0-9]{16})\b/g,/\b(eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,})\b/g,/\b([A-Za-z0-9]{24}\.[A-Za-z0-9_\-]{6}\.[A-Za-z0-9_\-]{27})\b/g,/\b(\d{8,12}:[A-Za-z0-9_\-]{35})\b/g],Fe=new RegExp(`\\b(api[_-]?key|api[_-]?secret|secret[_-]?key|secret|token|password|passwd|pwd|auth[_-]?token|access[_-]?token|refresh[_-]?token|bearer|private[_-]?key|client[_-]?secret)\\s*[=:]\\s*["']?([^\\s"']{8,})["']?`,"gi"),He=/(\w+:\/\/)([^:/\s]+):([^@\s]{3,})@/g,Be=["DATABASE_URL","REDIS_URL","MONGODB_URI","MONGO_URI","POSTGRES_URL","DSN","CONNECTION_STRING","ENCRYPTION_KEY","JWT_SECRET","CORTEX_ENCRYPTION_KEY","SESSION_SECRET","WEBHOOK_SECRET"],$e=new RegExp(`\\b(${Be.join("|")})\\s*[=:]\\s*["']?([^\\s"']+)["']?`,"gi");function gt(t){if(!t||typeof t!="string")return t;let e=t;for(let n of Pe)e=e.replace(n,M);return e=e.replace(Fe,(n,o)=>`${o}=${M}`),e=e.replace(He,(n,o)=>`${o}${M}:${M}@`),e=e.replace($e,(n,o)=>`${o}=${M}`),e}var oo=process.env.HOME||process.env.USERPROFILE,ke=no(oo,".sigil",".env"),Me=eo(process.cwd(),".env");Le(Me)?ve({path:Me,quiet:!0}):Le(ke)&&ve({path:ke,quiet:!0});var ro=8,io=8;async function ao(){let t=[];for await(let i of process.stdin)t.push(i);let e=Buffer.concat(t).toString("utf8").trim();if(!e)return B();let o=JSON.parse(e).prompt||"";if(o.length<ro)return B();try{let{search:i}=await Promise.resolve().then(()=>(De(),be)),a=(await Promise.resolve().then(()=>(w(),wt))).default,{facts:s}=await i(o,{namespaces:[a.defaults.namespace],limit:io,useGraph:!1,route:!1,expand:!1});if(!s.length)return await(await Promise.resolve().then(()=>(S(),Y))).default.destroy(),B();let r=gt([`Sigil memory (${s.length} relevant facts):`,...s.map(u=>`- ${u.content}`)].join(`
`));return await(await Promise.resolve().then(()=>(S(),Y))).default.destroy(),B(r)}catch(i){process.stderr.write(`[sigil:user-prompt-submit] ${i.message}
`);try{await(await Promise.resolve().then(()=>(S(),Y))).default.destroy()}catch{}return B()}}function B(t){let e={hookSpecificOutput:{hookEventName:"UserPromptSubmit",...t&&{additionalContext:t}}};process.stdout.write(JSON.stringify(e))}ao();
