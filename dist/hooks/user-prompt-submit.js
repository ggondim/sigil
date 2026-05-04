#!/usr/bin/env node
var Le=Object.defineProperty;var h=(t,e)=>()=>(t&&(e=t(t=0)),e);var N=(t,e)=>{for(var n in e)Le(t,n,{get:e[n],enumerable:!0})};function V(t,e){let n={};for(let o of t)n[o[e]]=o;return n}function F(t,e){if(e<1)return[];let n=[];for(let o=0;o<t.length;o+=e)n.push(t.slice(o,o+e));return n}var H=h(()=>{});var ht={};N(ht,{default:()=>u});var He,u,w=h(()=>{He={db:{type:process.env.CORTEX_DB_TYPE||"pglite",host:process.env.CORTEX_DB_HOST||"localhost",port:Number(process.env.CORTEX_DB_PORT)||5432,database:process.env.CORTEX_DB_NAME||"cortex",user:process.env.CORTEX_DB_USER||"cortex_app",password:process.env.CORTEX_DB_PASSWORD||""},embedding:{provider:process.env.EMBEDDING_PROVIDER||"",model:process.env.EMBEDDING_MODEL||"nomic-embed-text",dimensions:Number(process.env.EMBEDDING_DIMENSIONS)||768,ollamaHost:process.env.OLLAMA_HOST||"http://localhost:11434",openaiApiKey:process.env.OPENAI_API_KEY||"",voyageApiKey:process.env.VOYAGE_API_KEY||""},llm:{provider:process.env.LLM_PROVIDER||"",openaiApiKey:process.env.OPENAI_API_KEY||"",openaiModel:process.env.LLM_OPENAI_MODEL||"gpt-4o-mini",ollamaHost:process.env.LLM_OLLAMA_HOST||process.env.OLLAMA_HOST||"http://localhost:11434",ollamaModel:process.env.LLM_OLLAMA_MODEL||"qwen2.5:7b",cliModel:process.env.LLM_CLI_MODEL||"haiku",apiKey:process.env.ANTHROPIC_API_KEY||"",extractionModel:process.env.LLM_EXTRACTION_MODEL||"",decisionModel:process.env.LLM_DECISION_MODEL||"",entityModel:process.env.LLM_ENTITY_MODEL||"",maxRetries:Number(process.env.LLM_MAX_RETRIES)||3,cliTimeout:Number(process.env.LLM_CLI_TIMEOUT)||12e4},output:{storage:process.env.OUTPUT_STORAGE||"local",dir:process.env.OUTPUT_DIR||"./output",s3:{endpoint:process.env.S3_ENDPOINT||"",bucket:process.env.S3_BUCKET||"",region:process.env.S3_REGION||"us-east-1",accessKey:process.env.S3_ACCESS_KEY||"",secretKey:process.env.S3_SECRET_KEY||"",publicUrl:process.env.S3_PUBLIC_URL||""}},server:{port:Number(process.env.PORT)||4e3,host:process.env.HOST||"0.0.0.0",logLevel:process.env.LOG_LEVEL||"info"},defaults:{namespace:process.env.DEFAULT_NAMESPACE||"default"},memory:{skipThreshold:Number(process.env.MEMORY_SKIP_THRESHOLD)||.88,ambiguousThreshold:Number(process.env.MEMORY_AMBIGUOUS_THRESHOLD)||.78,minFactSimilarity:Number(process.env.MEMORY_MIN_FACT_SIMILARITY)||.45},search:{synthesize:process.env.CORTEX_SYNTHESIZE!=="false",synthesizeModel:process.env.CORTEX_SYNTH_MODEL||""},ingest:{eagerExtract:process.env.CORTEX_EAGER_EXTRACT!=="false"}},u=He});var Et={};N(Et,{chat:()=>Be});async function Be(t,{model:e,jsonMode:n=!1}={}){let o=e||u.llm.openaiModel,i=[{role:"user",content:t}];n&&!t.toLowerCase().includes("json")&&i.unshift({role:"system",content:"Respond with valid JSON."});let a={model:o,messages:i};n&&(a.response_format={type:"json_object"});let s=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${u.llm.openaiApiKey}`},body:JSON.stringify(a)});if(!s.ok){let E=await s.text();throw new Error(`OpenAI error ${s.status}: ${E}`)}let r=await s.json(),c=r.choices[0].message.content.trim(),d=r.usage||{};return{text:c,inputTokens:d.prompt_tokens||0,outputTokens:d.completion_tokens||0,model:o}}var yt=h(()=>{w()});import{createRequire as $e}from"node:module";import{join as Ue}from"node:path";import{homedir as We}from"node:os";import{mkdirSync as Ye}from"node:fs";async function je(t){if(!R){let{PGlite:e}=await import("@electric-sql/pglite"),{vector:n}=await import("@electric-sql/pglite/vector");Ye(t,{recursive:!0}),R=new e(`file://${t}`,{extensions:{vector:n}}),await R.waitReady}return R}var Ge,Ke,J,R,z,B,_t=h(()=>{Ge=$e(import.meta.url),Ke=Ge("knex/lib/dialects/postgres/index.js"),J=process.env.CORTEX_PGLITE_PATH||Ue(We(),".cortex","db"),R=null;z=class{constructor(e){this._db=e}query(e,n){let o=typeof e=="string"?e:e.text,i=e?.values||[],s=!i.length&&o.split(";").filter(r=>r.trim()).length>1?this._db.exec(o).then(r=>{let c=r[r.length-1]||{};return{command:o.trim().split(/\s+/)[0].toUpperCase(),rows:c.rows||[],fields:c.fields||[],rowCount:c.affectedRows??c.rows?.length??0}}):this._db.query(o,i).then(r=>({command:(o||"").trim().split(/\s+/)[0].toUpperCase(),rows:r.rows,fields:r.fields||[],rowCount:r.affectedRows??r.rows.length}));if(typeof n=="function")s.then(r=>n(null,r)).catch(r=>n(r));else return s}end(e){return typeof e=="function"?e(null):Promise.resolve()}on(){}removeListener(){}},B=class extends Ke{constructor(e){super(e),this._pglitePath=e?.connection?.pglitePath||J}acquireRawConnection(){return je(this._pglitePath).then(e=>(this.version||(this.version="17.0"),new z(e)))}async destroyRawConnection(){}async destroy(){await super.destroy(),R&&(await R.close(),R=null)}}});var $={};N($,{default:()=>p});import gt from"knex";function wt(t){return Array.isArray(t)?t.map(q):t&&typeof t=="object"?q(t):t}function St(t,e){return e(Je(t))}function q(t){if(!t||typeof t!="object"||t instanceof Date)return t;if(Array.isArray(t))return t.map(q);let e={};for(let[n,o]of Object.entries(t))e[n.replace(/_([a-z])/g,(i,a)=>a.toUpperCase())]=o;return e}function Je(t){return t.replace(/[A-Z]/g,e=>`_${e.toLowerCase()}`)}var Ve,ze,p,S=h(()=>{w();_t();Ve=u.db.type==="postgres",ze=Ve?gt({client:"pg",connection:{host:u.db.host,port:u.db.port,database:u.db.database,user:u.db.user,password:u.db.password},pool:{min:2,max:10},postProcessResponse:wt,wrapIdentifier:St}):gt({client:B,connection:{pglitePath:J},pool:{min:1,max:1},postProcessResponse:wt,wrapIdentifier:St});p=ze});function T(t){return Math.ceil((t||"").length/4)}function Z(t,e,n){let o=qe[t];return o?(e*o.input+n*o.output)/1e6:0}function v({provider:t,model:e,caller:n,input:o,response:i,inputTokens:a,outputTokens:s,cost:r,durationMs:c,status:d,error:E}){p("llm_log").insert({provider:t,model:e,caller:n,input:o?.slice(0,1e4),response:i?.slice(0,1e4),inputTokens:a,outputTokens:s,cost:r,durationMs:c,status:d,error:E?.slice(0,2e3)}).catch(l=>console.error("[llm-log] Write failed:",l.message))}async function X(t,e=3){for(let n=1;n<=e;n++)try{return await t()}catch(o){if(n===e)throw o;let i=Math.min(1e3*2**(n-1),1e4);await new Promise(a=>setTimeout(a,i))}}var qe,L=h(()=>{S();qe={"gpt-4o-mini":{input:.15,output:.6},"gpt-4o":{input:2.5,output:10},"gpt-4.1-nano":{input:.1,output:.4},"gpt-4.1-mini":{input:.4,output:1.6},"claude-haiku-4-5-20251001":{input:.8,output:4},"claude-sonnet-4-6":{input:3,output:15},"claude-opus-4-6":{input:15,output:75}}});var At={};N(At,{chat:()=>Xe});async function Ze(){if(!Q){let{default:t}=await import("@anthropic-ai/sdk");Q=new t({apiKey:u.llm.apiKey})}return Q}async function Xe(t,{model:e,jsonMode:n=!1}={}){let o=e||"claude-haiku-4-5-20251001",i=await Ze(),a=[{role:"user",content:t}],s=n?"Respond with valid JSON only. No explanation or wrapping.":void 0,r=await i.messages.create({model:o,max_tokens:4096,messages:a,...s&&{system:s}});return{text:r.content[0].text.trim(),inputTokens:r.usage?.input_tokens||T(t),outputTokens:r.usage?.output_tokens||T(r.content[0].text),model:o}}var Q,Tt=h(()=>{w();L();Q=null});var Nt={};N(Nt,{chat:()=>on});import{spawn as Qe}from"node:child_process";function nn(t,e){let n=u.llm.cliTimeout||12e4;return new Promise((o,i)=>{let a=Qe("claude",t,{stdio:["pipe","pipe","pipe"]}),s=setTimeout(()=>{a.kill("SIGTERM"),i(new Error(`claude CLI timed out after ${n}ms`))},n),r="",c="";a.stdout.on("data",d=>{r+=d}),a.stderr.on("data",d=>{c+=d}),a.on("error",d=>{clearTimeout(s),i(new Error(`Failed to spawn claude CLI: ${d.message}`))}),a.on("close",d=>{clearTimeout(s),o({stdout:r,stderr:c,code:d})}),a.stdin.write(e),a.stdin.end()})}async function on(t,{model:e,jsonMode:n=!1}={}){let o=e||u.llm.cliModel||"haiku",i=tn[o]||o,a=["-p","--model",i,"--output-format","json"];n&&a.push("--json-schema",en);let{stdout:s,stderr:r,code:c}=await nn(a,t);if(c!==0)throw new Error(`claude CLI exited ${c}: ${(r||s).slice(0,500)}`);let d;try{d=JSON.parse(s)}catch{return{text:s.trim(),inputTokens:T(t),outputTokens:T(s),model:i}}if(d.is_error)throw new Error(`claude CLI error: ${d.result||"unknown error"}`);let E=n&&d.structured_output?JSON.stringify(d.structured_output):(d.result||"").trim(),l=d.usage||{};return{text:E,inputTokens:l.input_tokens||T(t),outputTokens:l.output_tokens||T(E),model:i,cost:d.total_cost_usd||0}}var tn,en,Ct=h(()=>{w();L();tn={"claude-haiku-4-5-20251001":"haiku","claude-sonnet-4-6":"sonnet","claude-opus-4-6":"opus"},en=JSON.stringify({type:"object",additionalProperties:!0})});var Ot={};N(Ot,{chat:()=>rn});async function rn(t,{model:e,jsonMode:n=!1}={}){let o=e||u.llm.ollamaModel,i=`${u.llm.ollamaHost}/api/chat`,a={model:o,messages:[{role:"user",content:t}],stream:!1};n&&(a.format="json");let s=await fetch(i,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(a)});if(!s.ok){let c=await s.text();throw new Error(`Ollama error ${s.status}: ${c}`)}let r=await s.json();return{text:r.message.content.trim(),inputTokens:r.prompt_eval_count||T(t),outputTokens:r.eval_count||T(r.message.content),model:o}}var Rt=h(()=>{w();L()});var bt={};N(bt,{embedBatch:()=>sn});async function sn(t,{model:e,ollamaHost:n}){let o=F(t,an),i=[];for(let a of o){let s=await fetch(`${n}/api/embed`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:e,input:a})});if(!s.ok)throw new Error(`Ollama embed failed: ${s.status} ${await s.text()}`);let r=await s.json();i.push(...r.embeddings)}return i}var an,It=h(()=>{H();an=50});var Dt={};N(Dt,{embedBatch:()=>cn});async function cn(t,{model:e,openaiApiKey:n,dimensions:o}={}){let i={model:e,input:t};o&&/^text-embedding-3/.test(e)&&(i.dimensions=o);let a=await fetch("https://api.openai.com/v1/embeddings",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${n}`},body:JSON.stringify(i)});if(!a.ok)throw new Error(`OpenAI embed failed: ${a.status} ${await a.text()}`);return(await a.json()).data.map(r=>r.embedding)}var vt=h(()=>{});var Lt={};N(Lt,{embedBatch:()=>un});async function un(t,{model:e,voyageApiKey:n,inputType:o="document",dimensions:i}={}){if(!n)throw new Error("VOYAGE_API_KEY is not set. Get one at dashboard.voyageai.com.");let a=F(t,dn),s=[];for(let r of a){let c={input:r,model:e||"voyage-3-large",input_type:o==="query"?"query":"document"};i&&(c.output_dimension=i);let d=await fetch("https://api.voyageai.com/v1/embeddings",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${n}`},body:JSON.stringify(c)});if(!d.ok){let m=await d.text();throw new Error(`Voyage embed failed: ${d.status} ${m}`)}let l=[...(await d.json()).data].sort((m,f)=>m.index-f.index);s.push(...l.map(m=>m.embedding))}return s}var dn,kt=h(()=>{H();dn=50});import{spawn as ln}from"node:child_process";async function ot(t){if(!tt[t]){let e=nt[t];if(!e)throw new Error(`Unknown LLM provider: "${t}". Available: ${Object.keys(nt).join(", ")}`);let n=await e();tt[t]=n.chat}return tt[t]}async function xt(t){if(!et[t]){let e=Mt[t];if(!e)throw new Error(`Unknown embedding provider: "${t}". Available: ${Object.keys(Mt).join(", ")}`);let n=await e();et[t]=n.embedBatch}return et[t]}function Pt(t,e){if(!t)return{provider:e,model:null};let n=t.indexOf(":");return n>0&&nt[t.slice(0,n)]?{provider:t.slice(0,n),model:t.slice(n+1)}:{provider:e,model:t}}async function Ft(){let t=u.llm.ollamaHost||u.embedding.ollamaHost||"http://localhost:11434";try{return(await fetch(`${t}/api/tags`,{signal:AbortSignal.timeout(2e3)})).ok}catch{return!1}}function mn(){return new Promise(t=>{let e=ln("claude",["--version"],{stdio:"pipe"});e.on("error",()=>t(!1)),e.on("close",n=>t(n===0)),setTimeout(()=>{e.kill(),t(!1)},3e3)})}async function Ht(){if(A)return A;if(u.llm.provider)return A=u.llm.provider,A;if(u.llm.apiKey)return A="anthropic",A;if(u.llm.openaiApiKey)return A="openai",A;if(await Ft())return A="ollama",A;if(await mn())return A="claude-cli",A;throw new Error(`No LLM provider available. Either:
  - Set LLM_PROVIDER (openai, anthropic, ollama, claude-cli)
  - Set ANTHROPIC_API_KEY or OPENAI_API_KEY
  - Start Ollama locally
  - Install the Claude CLI (claude)`)}async function Bt(){if(C)return C;if(u.embedding.provider)return C=u.embedding.provider,C;if(u.embedding.voyageApiKey)return C="voyage",C;if(await Ft())return C="ollama",C;if(u.embedding.openaiApiKey)return C="openai",C;throw new Error(`No embedding provider available. Either:
  - Set EMBEDDING_PROVIDER (voyage, ollama, openai)
  - Set VOYAGE_API_KEY (recommended \u2014 best quality)
  - Start Ollama locally
  - Set OPENAI_API_KEY`)}var nt,Mt,tt,et,A,C,rt=h(()=>{w();nt={openai:()=>Promise.resolve().then(()=>(yt(),Et)),anthropic:()=>Promise.resolve().then(()=>(Tt(),At)),"claude-cli":()=>Promise.resolve().then(()=>(Ct(),Nt)),ollama:()=>Promise.resolve().then(()=>(Rt(),Ot))},Mt={ollama:()=>Promise.resolve().then(()=>(It(),bt)),openai:()=>Promise.resolve().then(()=>(vt(),Dt)),voyage:()=>Promise.resolve().then(()=>(kt(),Lt))},tt={},et={};A=null,C=null});function O(t){return t?`[${t.join(",")}]`:null}var b=h(()=>{});import{createHash as pn}from"node:crypto";function hn(t,e,n,o="document"){let i=pn("sha256");return i.update(t),i.update("\0"),i.update(e),i.update("\0"),i.update(o),i.update("\0"),i.update(n),i.digest("hex")}async function En(t){if(!t.length)return new Map;let e=await p("embedding_cache").whereIn("key",t).select("key","embedding");return new Map(e.map(n=>[n.key,yn(n.embedding)]))}function yn(t){return Array.isArray(t)||typeof t!="string"?t:(t.startsWith("[")?t.slice(1,-1):t).split(",").map(Number)}async function _n(t){t.length&&await p("embedding_cache").whereIn("key",t).update({hits:p.raw("hits + 1"),lastUsedAt:p.fn.now()})}async function gn(t,e,n){if(t.length){for(let{key:o,embedding:i}of t)await p.raw(`
      INSERT INTO embedding_cache (key, provider, model, embedding, hits, created_at, last_used_at)
      VALUES (?, ?, ?, ?, 0, NOW(), NOW())
      ON CONFLICT (key) DO UPDATE
        SET last_used_at = NOW(),
            hits = embedding_cache.hits + 1
    `,[o,e,n,O(i)]);await Sn()}}async function Sn(){let t=Date.now();if(t-Ut<wn)return;Ut=t;let[{count:e}]=await p("embedding_cache").count("key as count"),n=Number(e);if(n<=$t)return;let o=Math.min(n-$t,fn);await p.raw(`
    DELETE FROM embedding_cache WHERE key IN (
      SELECT key FROM embedding_cache ORDER BY last_used_at ASC LIMIT ?
    )
  `,[o])}async function Wt(t,e,n,o,i,a={}){if(!t.length)return[];let s=a.inputType||i?.inputType||"document",r=t.map(f=>hn(e,n,f,s)),c=await En(r),d=[],E=[],l=new Array(t.length);for(let f=0;f<t.length;f++){let y=c.get(r[f]);y?l[f]=y:(d.push(t[f]),E.push(f))}if(d.length){let f=await o(d,i),y=[];for(let _=0;_<d.length;_++){let g=E[_];l[g]=f[_],y.push({key:r[g],embedding:f[_]})}gn(y,e,n).catch(_=>{process.stderr.write(`[embedding-cache] store failed: ${_.message}
`)})}let m=r.filter(f=>c.has(f));return m.length&&_n(m).catch(()=>{}),l}var $t,fn,Ut,wn,Yt=h(()=>{b();S();$t=1e4,fn=500;Ut=0,wn=6e4});async function it(t,e={}){let[n]=await at([t],e);return n}async function at(t,{inputType:e="document"}={}){if(!t.length)return[];let n=await Bt(),o=await xt(n),i=u.embedding.model,a={...u.embedding,inputType:e};return Wt(t,n,i,o,a,{inputType:e})}var Fo,st=h(()=>{w();rt();Yt();({dimensions:Fo}=u.embedding)});async function Gt(t,e){return p("entity").whereRaw("LOWER(name) = LOWER(?)",[t]).where({namespace:e||u.defaults.namespace}).whereNull("mergedWith").first()||null}async function Kt(t,{entityType:e,namespace:n,limit:o=10}={}){let i=p("entity").whereRaw("LOWER(name) LIKE ?",[`%${t.toLowerCase()}%`]).whereNull("mergedWith").orderBy("mentionCount","desc").limit(o);return e&&i.where({entityType:e}),n&&i.where({namespace:n}),i}var jt=h(()=>{S();b();w()});async function Vt(t,{limit:e=50}={}){return p("fact").join("fact_entity","fact.id","fact_entity.fact_id").where("fact_entity.entity_id",t).where("fact.status","active").select("fact.*","fact_entity.mention_count as entityMentionCount").orderBy("fact_entity.mention_count","desc").limit(e)}async function zt(t){if(!t.length)return new Map;let e=await p("fact_entity").whereIn("factId",t).select("factId","entityId"),n=new Map;for(let o of e)n.has(o.factId)||n.set(o.factId,[]),n.get(o.factId).push(o.entityId);return n}var ct=h(()=>{S()});async function Jt(t){let e=await Ht();return Pt(t,e)}async function dt(t,{model:e,caller:n}={}){let{provider:o,model:i}=await Jt(e),a=await ot(o),s=Date.now();try{let r=await X(()=>a(t,{model:i,jsonMode:!1}),u.llm.maxRetries),c=r.cost||Z(r.model,r.inputTokens,r.outputTokens);return v({provider:o,model:r.model,caller:n,input:t,response:r.text,inputTokens:r.inputTokens,outputTokens:r.outputTokens,cost:c,durationMs:Date.now()-s,status:"success"}),r.text}catch(r){throw v({provider:o,model:i,caller:n,input:t,response:null,inputTokens:0,outputTokens:0,cost:0,durationMs:Date.now()-s,status:"error",error:r.message}),r}}async function U(t,{model:e,caller:n}={}){let{provider:o,model:i}=await Jt(e),a=await ot(o),s=Date.now();try{let r=await X(()=>a(t,{model:i,jsonMode:!0}),u.llm.maxRetries),c=r.cost||Z(r.model,r.inputTokens,r.outputTokens);return v({provider:o,model:r.model,caller:n,input:t,response:r.text,inputTokens:r.inputTokens,outputTokens:r.outputTokens,cost:c,durationMs:Date.now()-s,status:"success"}),An(r.text)}catch(r){throw v({provider:o,model:i,caller:n,input:t,response:null,inputTokens:0,outputTokens:0,cost:0,durationMs:Date.now()-s,status:"error",error:r.message}),r}}function An(t){try{return JSON.parse(t.trim())}catch{}let e=t.match(/```(?:json)?\s*([\s\S]*?)```/);if(e)try{return JSON.parse(e[1].trim())}catch{}let n=t.match(/[\[{][\s\S]*[\]}]/);if(n)try{return JSON.parse(n[0])}catch{}return null}var k=h(()=>{w();rt();L()});import{fileURLToPath as Tn}from"node:url";import{dirname as qt,join as W}from"node:path";import{existsSync as Zt}from"node:fs";function Nn(){let t=qt(Tn(import.meta.url));for(let e=0;e<10;e++){if(Zt(W(t,"package.json"))&&Zt(W(t,"prompts")))return t;let n=qt(t);if(n===t)break;t=n}return process.cwd()}var Xt,Y,Xo,ut=h(()=>{Xt=Nn(),Y=W(Xt,"prompts"),Xo=W(Xt,"src","db","migrations")});import Cn from"node:path";async function Qt(t){t.length&&await p.raw(`UPDATE fact_lifecycle
     SET access_count = access_count + 1,
         last_accessed_at = NOW(),
         stage = CASE WHEN stage = 'stable' THEN 'editing' ELSE stage END,
         stage_entered_at = CASE WHEN stage = 'stable' THEN NOW() ELSE stage_entered_at END
     WHERE fact_id = ANY(?)`,[t])}var sr,cr,dr,te=h(()=>{S();st();k();b();w();ut();sr=Cn.join(Y,"audm-decision.md"),cr=u.memory.skipThreshold,dr=u.memory.ambiguousThreshold});async function ee(t){if(!t||t.length<2)return;let e=[...new Set(t.filter(a=>Number.isInteger(a)))].sort((a,s)=>a-s);if(e.length<2)return;let n=[];for(let a=0;a<e.length;a++)for(let s=a+1;s<e.length;s++)n.push([e[a],e[s]]);let o=n.map(()=>"(?, ?, 1, NOW(), NOW())").join(", "),i=n.flat();await p.raw(`
    INSERT INTO hebbian_edge (fact_a_id, fact_b_id, strength, first_seen_at, last_seen_at)
    VALUES ${o}
    ON CONFLICT (fact_a_id, fact_b_id)
    DO UPDATE SET
      strength = hebbian_edge.strength + 1,
      last_seen_at = NOW()
  `,i)}var ne=h(()=>{S()});async function oe(t,{direction:e="both",relationType:n,limit:o=50}={}){let i=r=>{let c=r==="outgoing"?"source_id":"target_id",d=r==="outgoing"?"target_id":"source_id";return p.raw(`
      SELECT r.id AS "relationId", r.relation_type AS "relationType",
             r.mention_count AS "mentionCount", r.valid_at AS "validAt",
             e.id AS "entityId", e.uid, e.name, e.entity_type AS "entityType",
             e.description, '${r}' AS direction
      FROM relation r
      JOIN entity e ON e.id = r.${d}
      WHERE r.${c} = ?
        AND r.invalid_at IS NULL
        AND e.merged_with IS NULL
        ${n?"AND r.relation_type = ?":""}
      ORDER BY r.mention_count DESC
      LIMIT ?
    `,n?[t,n,o]:[t,o])};if(e==="outgoing"){let{rows:r}=await i("outgoing");return r}if(e==="incoming"){let{rows:r}=await i("incoming");return r}let[a,s]=await Promise.all([i("outgoing"),i("incoming")]);return[...a.rows,...s.rows]}var re=h(()=>{S()});function G({minConfidence:t="medium",pointInTime:e,categories:n}){let o=On[t]??1,i=[o],a="",s="";return e&&(a="AND valid_from <= ? AND (valid_until IS NULL OR valid_until > ?)",i.push(e,e)),n?.length&&(s="AND category = ANY(?)",i.push(n)),{minRank:o,temporalClause:a,categoryClause:s,filterParams:i}}var On,M,K=h(()=>{On={low:0,medium:1,high:2},M=`CASE confidence
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 1
            ELSE 0
          END`});async function ie(t,{namespaces:e,limit:n=20}){let o=O(t),{rows:i}=await p.raw(`
    SELECT id, document_id AS "documentId", chunk_index AS "chunkIndex",
           content, section_heading AS "sectionHeading", namespace,
           1 - (embedding <=> ?) as similarity
    FROM chunk
    WHERE namespace = ANY(?)
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ?
    LIMIT ?
  `,[o,e,o,n]);return i}var ae=h(()=>{S();b();w();K()});async function se(t,{namespaces:e,limit:n=20}){let{rows:o}=await p.raw(`
    SELECT id, document_id AS "documentId", chunk_index AS "chunkIndex",
           content, section_heading AS "sectionHeading", namespace,
           ts_rank(search_vector, plainto_tsquery('english', ?)) as rank
    FROM chunk
    WHERE namespace = ANY(?)
      AND search_vector @@ plainto_tsquery('english', ?)
    ORDER BY rank DESC
    LIMIT ?
  `,[t,e,t,n]);return o}var ce=h(()=>{S();K()});async function ue(t,e,{namespaces:n,limit:o=5,minConfidence:i="medium",pointInTime:a,categories:s}){let r=O(e),{temporalClause:c,categoryClause:d,filterParams:E}=G({minConfidence:i,pointInTime:a,categories:s}),l=o*vn,m=[r,r,n,...E,r,l],f=[t,t,n,...E,t,l],y=[l,l,o],_=`
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
        AND ${M} >= ?
        ${c}
        ${d}
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
        AND ${M} >= ?
        AND to_tsvector('english', content) @@ plainto_tsquery('english', ?)
        ${c}
        ${d}
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
               ${In} * (1.0 / (${de} + COALESCE(s.rank_ix, ?)))
             + ${Dn} * (1.0 / (${de} + COALESCE(k.rank_ix, ?)))
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
             CASE f.importance WHEN 'vital' THEN ${Ln} ELSE 1.0 END AS importance_mult,
             CASE f.confidence
               WHEN 'high'   THEN ${kn}
               WHEN 'medium' THEN ${Mn}
               WHEN 'low'    THEN ${xn}
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
  `,g=[...m,...f,...y],{rows:P}=await p.raw(_,g);if(!P.length)return[];let ve=P[0].final_score||P[0].rrf_raw||1;return P.map(j=>({...j,rrfScore:Math.round(Number(j.final_score||j.rrf_raw)/Number(ve)*100)/100}))}var de,In,Dn,vn,Ln,kn,Mn,xn,le=h(()=>{S();b();w();K();de=20,In=1,Dn=.7,vn=3,Ln=1.5,kn=1,Mn=.85,xn=.7});async function me(t){let e=t.map(i=>i.id),n=await zt(e),o=new Set;for(let i of n.values())for(let a of i)o.add(a);return o.size?p("entity").whereIn("id",[...o]).whereNull("mergedWith").select("id","uid","name","entityType","description"):[]}async function pe(t,{limit:e=10}={}){if(!t.length)return[];let n=await p("relation").where(function(){this.whereIn("sourceId",t).orWhereIn("targetId",t)}).whereNull("invalidAt").select("*").limit(e*3),o=new Set(t),i=new Set,a=new Map;for(let l of n){let m=o.has(l.sourceId)?l.targetId:l.sourceId;i.add(m),a.has(m)||a.set(m,l)}if(!i.size)return[];let s=await p("entity").whereIn("id",[...i]).whereNull("mergedWith").select("id","name"),r=new Map(s.map(l=>[l.id,l.name])),c=await p("fact").join("fact_entity","fact.id","fact_entity.factId").whereIn("fact_entity.entityId",[...i]).where("fact.status","active").select("fact.*","fact_entity.entityId").orderBy("fact_entity.mentionCount","desc").limit(e*3),d=new Set,E=[];for(let l of c){if(d.has(l.id))continue;d.add(l.id);let m=a.get(l.entityId),f=r.get(l.entityId)||"unknown",y=m?.relationType||"related";if(E.push({...l,relationPath:`${f} (${y})`,graphDistance:1}),E.length>=e)break}return E}function fe(t,e,n,o){let i=new Set(n),a=t.map(r=>({...r,resultType:"direct"})),s=e.filter(r=>!t.some(c=>c.id===r.id)).map(r=>({...r,rrfScore:(r.rrfScore||.1)*.5,resultType:"related"}));return[...a,...s].slice(0,o)}var he=h(()=>{S();ct()});var I,lt=h(()=>{I=class{#t=new Map;#e;#n;constructor({maxSize:e=100,ttlMs:n=300*1e3}={}){this.#e=e,this.#n=n}get(e){let n=this.#t.get(e);if(n){if(Date.now()-n.timestamp>this.#n){this.#t.delete(e);return}return n.value}}set(e,n){if(this.#t.size>=this.#e){let o=this.#t.keys().next().value;this.#t.delete(o)}this.#t.set(e,{value:n,timestamp:Date.now()})}}});async function ye(t){let e=Ee.get(t);if(e)return e;let n=`You are a search query expander for a personal knowledge base.

Given the user's query, generate 3-5 alternative search queries that would help find ALL relevant information \u2014 including facts that don't literally match the query but are semantically related.

Think about:
- Synonyms and rephrased versions
- Inverse/negative framings (if someone asks "what should I use", also search for "what to avoid")
- Related concepts that would inform the answer
- Specific terms someone might have used when storing this knowledge

User query: "${t}"

Respond with ONLY a JSON array of strings. Do not include the original query.`;try{let o=await U(n,{model:u.llm.extractionModel,caller:"query-expander"});if(!Array.isArray(o))return[t];let i=o.filter(s=>typeof s=="string"&&s.trim()).slice(0,Pn),a=i.length?[t,...i]:[t];return Ee.set(t,a),a}catch(o){return console.error("[query-expander] Failed:",o.message),[t]}}var Pn,Ee,_e=h(()=>{k();lt();w();Pn=5,Ee=new I({maxSize:100,ttlMs:300*1e3})});import{readFile as Fn}from"node:fs/promises";import{join as Hn}from"node:path";async function Se(t){let e=t.trim().toLowerCase(),n=mt.get(e);if(n)return n;let i=`${await Fn(Bn,"utf8")}

---

Query: ${t}

---

Respond with ONLY a JSON object: { "intent": "preference|factual|entity_lookup|exploratory|temporal", "categories": [...], "entities": [...], "expand": bool, "pointInTime": null or "YYYY-MM-DD", "reasoning": "..." }`;try{let a=await U(i,{model:u.llm.extractionModel,caller:"query-router"});if(!a||!$n.includes(a.intent)){let c=ge("factual",{});return mt.set(e,c),c}let s=we[a.intent],r={intent:a.intent,categories:Array.isArray(a.categories)&&a.categories.length?a.categories:s.categories,entities:Array.isArray(a.entities)?a.entities:[],expand:typeof a.expand=="boolean"?a.expand:s.expand,useGraph:s.useGraph,limit:s.limit,pointInTime:a.pointInTime||null,reasoning:a.reasoning||""};return mt.set(e,r),r}catch(a){return console.error("[query-router] Failed:",a.message),ge("factual",{reasoning:`Fallback \u2014 ${a.message}`})}}function ge(t,e={}){let n=we[t];return{intent:t,categories:n.categories,entities:[],expand:n.expand,useGraph:n.useGraph,limit:n.limit,pointInTime:null,reasoning:"",...e}}var Bn,mt,$n,we,Ae=h(()=>{k();lt();w();ut();Bn=Hn(Y,"query-router.md"),mt=new I({maxSize:200,ttlMs:600*1e3}),$n=["preference","factual","entity_lookup","exploratory","temporal"],we={preference:{categories:["preference","opinion","personal"],expand:!1,useGraph:!1,limit:null},factual:{categories:[],expand:!1,useGraph:!1,limit:null},entity_lookup:{categories:[],expand:!1,useGraph:!0,limit:null},exploratory:{categories:[],expand:!0,useGraph:!0,limit:15},temporal:{categories:[],expand:!1,useGraph:!1,limit:null}}});var Ce={};N(Ce,{search:()=>Gn});async function Gn(t,{namespaces:e,limit:n=5,minConfidence:o="medium",useGraph:i=!1,includeChunks:a=!1,pointInTime:s,expand:r=!1,route:c=!0,categories:d,synthesize:E=u.search.synthesize}={}){E&&(a=!0);let l=null;c&&(l=await Se(t),i=i||l.useGraph,r=r||l.expand,n=l.limit||n,s=s||l.pointInTime,d=d||(l.categories.length?l.categories:void 0));let m=await jn(t,e),f;m?f=await Vn(m,t,{namespaces:e,limit:n,minConfidence:o,includeChunks:a,pointInTime:s,categories:d}):f=await zn(t,{namespaces:e,limit:n,minConfidence:o,useGraph:i,includeChunks:a,pointInTime:s,expand:r,categories:d});let y=f.facts.map(_=>_.id).filter(Boolean);if(Qt(y).catch(_=>console.error("[access-tracking]",_.message)),ee(y.slice(0,8)).catch(_=>console.error("[hebbian]",_.message)),E)try{f.synthesized=await Kn(t,f)}catch(_){console.error("[synthesizer] failed:",_.message),f.synthesized=null}return f}async function Kn(t,{facts:e,chunks:n}){let o=[];if(e.slice(0,10).forEach((s,r)=>{o.push(`[F${r+1}] (${s.category}) ${s.content}`)}),n.length&&n.slice(0,15).forEach((s,r)=>{let c=(s.content||"").replace(/\s+/g," ").trim();c&&o.push(`[C${r+1}] ${c.slice(0,2e3)}`)}),!o.length)return"No retrieved evidence \u2014 nothing to synthesize.";let i=`You are answering a question from a personal-memory system.
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
- Plain text only, no headers. Direct answer first, then a short justification if needed. 1-4 sentences total.`,a=u.search.synthesizeModel||u.llm.extractionModel||void 0;return dt(i,{model:a,caller:"synthesizer"})}async function jn(t,e){if(t.length<2||t.length>Yn)return null;let n=e[0]||u.defaults.namespace,o=await Gt(t,n);return o||(await Kt(t,{namespace:n,limit:1}))[0]||null}async function Vn(t,e,{namespaces:n,limit:o,minConfidence:i,includeChunks:a,pointInTime:s,categories:r}){let[c,d,E]=await Promise.all([Vt(t.id,{limit:o}),oe(t.id,{limit:15}),Ne(e,{namespaces:n,limit:o,minConfidence:i,includeChunks:a,pointInTime:s,categories:r})]),l=c.map(g=>({...g,source:"entity"})),m=new Set(l.map(g=>g.id)),f=E.facts.filter(g=>!m.has(g.id)).map(g=>({...g,source:"search"})),y=[...l,...f].slice(0,o),_=d.map(g=>({id:g.entityId,name:g.name,type:g.entityType,relation:g.relationType,direction:g.direction,mentions:g.mentionCount}));return{facts:y,chunks:a?E.chunks:[],matchedEntity:{id:t.id,name:t.name,type:t.entityType,mentions:t.mentionCount,description:t.description||null},relatedEntities:_}}async function zn(t,{namespaces:e,limit:n,minConfidence:o,useGraph:i,includeChunks:a,pointInTime:s,expand:r=!1,categories:c}){let d=r?await ye(t):[t],E=await at(d,{inputType:"query"}),l=await Promise.all(d.map((y,_)=>Ne(y,{queryEmbedding:E[_],namespaces:e,limit:n,minConfidence:o,includeChunks:a,pointInTime:s,categories:c}))),m=Te(l.map(y=>y.facts),n);if(m=m.map(y=>({...y,source:"search"})),i&&m.length)try{let y=await me(m.slice(0,5));if(y.length){let _=await pe(y.map(g=>g.id),{limit:5});m=fe(m,_,y.map(g=>g.id),n)}}catch(y){console.error("[graph-enhancement] Failed:",y.message)}let f=a?Te(l.map(y=>y.chunks),n):[];return{facts:m,chunks:f,matchedEntity:null,relatedEntities:[]}}function Te(t,e){let n={},o={};for(let s of t)for(let[r,c]of s.entries())o[c.id]=c,n[c.id]=(n[c.id]||0)+1/(pt+r+1);let i=Object.entries(n).sort(([,s],[,r])=>r-s),a=i.length?i[0][1]:1;return i.slice(0,e).map(([s,r])=>({...o[s],rrfScore:Math.round(r/a*100)/100}))}async function Ne(t,{queryEmbedding:e,namespaces:n,limit:o,minConfidence:i,includeChunks:a=!1,pointInTime:s,categories:r}){let c=e||await it(t,{inputType:"query"}),d=ue(t,c,{namespaces:n,limit:o,minConfidence:i,pointInTime:s,categories:r}),E=a?[ie(c,{namespaces:n,limit:o}),se(t,{namespaces:n,limit:o})]:[],[l,...m]=await Promise.all([d,...E]),f=a&&m.length===2?Jn(m[0],m[1],o):[];return{facts:l,chunks:f}}function Jn(t,e,n){let o={},i={...V(t,"id"),...V(e,"id")};t.forEach((r,c)=>{o[r.id]=(o[r.id]||0)+Un/(pt+c+1)}),e.forEach((r,c)=>{o[r.id]=(o[r.id]||0)+Wn/(pt+c+1)});let a=Object.entries(o).sort(([r,c],[d,E])=>{if(c!==E)return E-c;let l=i[r]?.importance==="vital"?1:0;return(i[d]?.importance==="vital"?1:0)-l}),s=a.length?a[0][1]:1;return a.slice(0,n).map(([r,c])=>({...i[r],rrfScore:Math.round(c/s*100)/100}))}var pt,Un,Wn,Yn,Oe=h(()=>{H();st();w();jt();ct();te();ne();re();ae();ce();le();he();_e();Ae();k();pt=20,Un=1,Wn=.7,Yn=60});import{resolve as qn,join as Zn}from"node:path";import{existsSync as Re}from"node:fs";import{config as be}from"dotenv";var D="***MASKED***",ke=[/\b(sk-(?:proj-|ant-)?[A-Za-z0-9_\-]{20,})\b/g,/\b(ghp_[A-Za-z0-9]{36,})\b/g,/\b(github_pat_[A-Za-z0-9_]{20,})\b/g,/\b(gho_[A-Za-z0-9]{36,})\b/g,/\b(glpat-[A-Za-z0-9_\-]{20,})\b/g,/\b(xox[baprs]-[A-Za-z0-9\-]{10,})\b/g,/\b(whsec_[A-Za-z0-9]{20,})\b/g,/\b(rk_(?:live|test)_[A-Za-z0-9]{20,})\b/g,/\b(AKIA[A-Z0-9]{16})\b/g,/\b(ASIA[A-Z0-9]{16})\b/g,/\b(eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,})\b/g,/\b([A-Za-z0-9]{24}\.[A-Za-z0-9_\-]{6}\.[A-Za-z0-9_\-]{27})\b/g,/\b(\d{8,12}:[A-Za-z0-9_\-]{35})\b/g],Me=new RegExp(`\\b(api[_-]?key|api[_-]?secret|secret[_-]?key|secret|token|password|passwd|pwd|auth[_-]?token|access[_-]?token|refresh[_-]?token|bearer|private[_-]?key|client[_-]?secret)\\s*[=:]\\s*["']?([^\\s"']{8,})["']?`,"gi"),xe=/(\w+:\/\/)([^:/\s]+):([^@\s]{3,})@/g,Pe=["DATABASE_URL","REDIS_URL","MONGODB_URI","MONGO_URI","POSTGRES_URL","DSN","CONNECTION_STRING","ENCRYPTION_KEY","JWT_SECRET","CORTEX_ENCRYPTION_KEY","SESSION_SECRET","WEBHOOK_SECRET"],Fe=new RegExp(`\\b(${Pe.join("|")})\\s*[=:]\\s*["']?([^\\s"']+)["']?`,"gi");function ft(t){if(!t||typeof t!="string")return t;let e=t;for(let n of ke)e=e.replace(n,D);return e=e.replace(Me,(n,o)=>`${o}=${D}`),e=e.replace(xe,(n,o)=>`${o}${D}:${D}@`),e=e.replace(Fe,(n,o)=>`${o}=${D}`),e}var Xn=process.env.HOME||process.env.USERPROFILE,Ie=Zn(Xn,".cortex",".env"),De=qn(process.cwd(),".env");Re(De)?be({path:De,quiet:!0}):Re(Ie)&&be({path:Ie,quiet:!0});var Qn=8,to=8;async function eo(){let t=[];for await(let i of process.stdin)t.push(i);let e=Buffer.concat(t).toString("utf8").trim();if(!e)return x();let o=JSON.parse(e).prompt||"";if(o.length<Qn)return x();try{let{search:i}=await Promise.resolve().then(()=>(Oe(),Ce)),a=(await Promise.resolve().then(()=>(w(),ht))).default,{facts:s}=await i(o,{namespaces:[a.defaults.namespace],limit:to,useGraph:!1,route:!1,expand:!1});if(!s.length)return await(await Promise.resolve().then(()=>(S(),$))).default.destroy(),x();let r=ft([`Cortex memory (${s.length} relevant facts):`,...s.map(d=>`- ${d.content}`)].join(`
`));return await(await Promise.resolve().then(()=>(S(),$))).default.destroy(),x(r)}catch(i){process.stderr.write(`[cortex:user-prompt-submit] ${i.message}
`);try{await(await Promise.resolve().then(()=>(S(),$))).default.destroy()}catch{}return x()}}function x(t){let e={hookSpecificOutput:{hookEventName:"UserPromptSubmit",...t&&{additionalContext:t}}};process.stdout.write(JSON.stringify(e))}eo();
