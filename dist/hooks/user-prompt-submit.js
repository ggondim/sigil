#!/usr/bin/env node
var Me=Object.defineProperty;var h=(t,e)=>()=>(t&&(e=t(t=0)),e);var N=(t,e)=>{for(var n in e)Me(t,n,{get:e[n],enumerable:!0})};function z(t,e){let n={};for(let o of t)n[o[e]]=o;return n}function H(t,e){if(e<1)return[];let n=[];for(let o=0;o<t.length;o+=e)n.push(t.slice(o,o+e));return n}var B=h(()=>{});var Et={};N(Et,{default:()=>d});var O,Be,d,w=h(()=>{O=(t,e,n)=>process.env[t]??(e&&process.env[e])??n,Be={db:{type:O("SIGIL_DB_TYPE","CORTEX_DB_TYPE","pglite"),host:O("SIGIL_DB_HOST","CORTEX_DB_HOST","localhost"),port:Number(O("SIGIL_DB_PORT","CORTEX_DB_PORT",5432)),database:O("SIGIL_DB_NAME","CORTEX_DB_NAME","sigil"),user:O("SIGIL_DB_USER","CORTEX_DB_USER","sigil_app"),password:O("SIGIL_DB_PASSWORD","CORTEX_DB_PASSWORD","")},embedding:{provider:process.env.EMBEDDING_PROVIDER||"",model:process.env.EMBEDDING_MODEL||"nomic-embed-text",dimensions:Number(process.env.EMBEDDING_DIMENSIONS)||768,ollamaHost:process.env.OLLAMA_HOST||"http://localhost:11434",openaiApiKey:process.env.OPENAI_API_KEY||"",voyageApiKey:process.env.VOYAGE_API_KEY||""},llm:{provider:process.env.LLM_PROVIDER||"",openaiApiKey:process.env.OPENAI_API_KEY||"",openaiModel:process.env.LLM_OPENAI_MODEL||"gpt-4o-mini",ollamaHost:process.env.LLM_OLLAMA_HOST||process.env.OLLAMA_HOST||"http://localhost:11434",ollamaModel:process.env.LLM_OLLAMA_MODEL||"qwen2.5:7b",cliModel:process.env.LLM_CLI_MODEL||"haiku",apiKey:process.env.ANTHROPIC_API_KEY||"",extractionModel:process.env.LLM_EXTRACTION_MODEL||"",decisionModel:process.env.LLM_DECISION_MODEL||"",entityModel:process.env.LLM_ENTITY_MODEL||"",maxRetries:Number(process.env.LLM_MAX_RETRIES)||3,cliTimeout:Number(process.env.LLM_CLI_TIMEOUT)||12e4},output:{storage:process.env.OUTPUT_STORAGE||"local",dir:process.env.OUTPUT_DIR||"./output",s3:{endpoint:process.env.S3_ENDPOINT||"",bucket:process.env.S3_BUCKET||"",region:process.env.S3_REGION||"us-east-1",accessKey:process.env.S3_ACCESS_KEY||"",secretKey:process.env.S3_SECRET_KEY||"",publicUrl:process.env.S3_PUBLIC_URL||""}},server:{port:Number(process.env.PORT)||4e3,host:process.env.HOST||"0.0.0.0",logLevel:process.env.LOG_LEVEL||"info"},defaults:{namespace:process.env.DEFAULT_NAMESPACE||"default"},memory:{skipThreshold:Number(process.env.MEMORY_SKIP_THRESHOLD)||.88,ambiguousThreshold:Number(process.env.MEMORY_AMBIGUOUS_THRESHOLD)||.78,minFactSimilarity:Number(process.env.MEMORY_MIN_FACT_SIMILARITY)||.45},search:{synthesize:O("SIGIL_SYNTHESIZE","CORTEX_SYNTHESIZE","true")!=="false",synthesizeModel:O("SIGIL_SYNTH_MODEL","CORTEX_SYNTH_MODEL","")},ingest:{eagerExtract:O("SIGIL_EAGER_EXTRACT","CORTEX_EAGER_EXTRACT","true")!=="false"}},d=Be});var yt={};N(yt,{chat:()=>$e});async function $e(t,{model:e,jsonMode:n=!1}={}){let o=e||d.llm.openaiModel,i=[{role:"user",content:t}];n&&!t.toLowerCase().includes("json")&&i.unshift({role:"system",content:"Respond with valid JSON."});let a={model:o,messages:i};n&&(a.response_format={type:"json_object"});let s=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${d.llm.openaiApiKey}`},body:JSON.stringify(a)});if(!s.ok){let E=await s.text();throw new Error(`OpenAI error ${s.status}: ${E}`)}let r=await s.json(),c=r.choices[0].message.content.trim(),u=r.usage||{};return{text:c,inputTokens:u.prompt_tokens||0,outputTokens:u.completion_tokens||0,model:o}}var _t=h(()=>{w()});import{createRequire as Ue}from"node:module";import{join as We}from"node:path";import{homedir as Ye}from"node:os";import{mkdirSync as Ge}from"node:fs";async function Ve(t){if(!R){let{PGlite:e}=await import("@electric-sql/pglite"),{vector:n}=await import("@electric-sql/pglite/vector");Ge(t,{recursive:!0}),R=new e(`file://${t}`,{extensions:{vector:n}}),await R.waitReady}return R}var Ke,je,q,R,J,$,gt=h(()=>{Ke=Ue(import.meta.url),je=Ke("knex/lib/dialects/postgres/index.js"),q=process.env.SIGIL_PGLITE_PATH||We(Ye(),".sigil","db"),R=null;J=class{constructor(e){this._db=e}query(e,n){let o=typeof e=="string"?e:e.text,i=e?.values||[],s=!i.length&&o.split(";").filter(r=>r.trim()).length>1?this._db.exec(o).then(r=>{let c=r[r.length-1]||{};return{command:o.trim().split(/\s+/)[0].toUpperCase(),rows:c.rows||[],fields:c.fields||[],rowCount:c.affectedRows??c.rows?.length??0}}):this._db.query(o,i).then(r=>({command:(o||"").trim().split(/\s+/)[0].toUpperCase(),rows:r.rows,fields:r.fields||[],rowCount:r.affectedRows??r.rows.length}));if(typeof n=="function")s.then(r=>n(null,r)).catch(r=>n(r));else return s}end(e){return typeof e=="function"?e(null):Promise.resolve()}on(){}removeListener(){}},$=class extends je{constructor(e){super(e),this._pglitePath=e?.connection?.pglitePath||q}acquireRawConnection(){return Ve(this._pglitePath).then(e=>(this.version||(this.version="17.0"),new J(e)))}async destroyRawConnection(){}async destroy(){await super.destroy(),R&&(await R.close(),R=null)}}});var U={};N(U,{default:()=>p});import wt from"knex";function St(t){return Array.isArray(t)?t.map(Z):t&&typeof t=="object"?Z(t):t}function At(t,e){return e(qe(t))}function Z(t){if(!t||typeof t!="object"||t instanceof Date)return t;if(Array.isArray(t))return t.map(Z);let e={};for(let[n,o]of Object.entries(t))e[n.replace(/_([a-z])/g,(i,a)=>a.toUpperCase())]=o;return e}function qe(t){return t.replace(/[A-Z]/g,e=>`_${e.toLowerCase()}`)}var ze,Je,p,S=h(()=>{w();gt();ze=d.db.type==="postgres",Je=ze?wt({client:"pg",connection:{host:d.db.host,port:d.db.port,database:d.db.database,user:d.db.user,password:d.db.password},pool:{min:2,max:10},postProcessResponse:St,wrapIdentifier:At}):wt({client:$,connection:{pglitePath:q},pool:{min:1,max:1},postProcessResponse:St,wrapIdentifier:At});p=Je});function T(t){return Math.ceil((t||"").length/4)}function X(t,e,n){let o=Ze[t];return o?(e*o.input+n*o.output)/1e6:0}function v({provider:t,model:e,caller:n,input:o,response:i,inputTokens:a,outputTokens:s,cost:r,durationMs:c,status:u,error:E}){p("llm_log").insert({provider:t,model:e,caller:n,input:o?.slice(0,1e4),response:i?.slice(0,1e4),inputTokens:a,outputTokens:s,cost:r,durationMs:c,status:u,error:E?.slice(0,2e3)}).catch(l=>console.error("[llm-log] Write failed:",l.message))}async function Q(t,e=3){for(let n=1;n<=e;n++)try{return await t()}catch(o){if(n===e)throw o;let i=Math.min(1e3*2**(n-1),1e4);await new Promise(a=>setTimeout(a,i))}}var Ze,M=h(()=>{S();Ze={"gpt-4o-mini":{input:.15,output:.6},"gpt-4o":{input:2.5,output:10},"gpt-4.1-nano":{input:.1,output:.4},"gpt-4.1-mini":{input:.4,output:1.6},"claude-haiku-4-5-20251001":{input:.8,output:4},"claude-sonnet-4-6":{input:3,output:15},"claude-opus-4-6":{input:15,output:75}}});var Tt={};N(Tt,{chat:()=>Qe});async function Xe(){if(!tt){let{default:t}=await import("@anthropic-ai/sdk");tt=new t({apiKey:d.llm.apiKey})}return tt}async function Qe(t,{model:e,jsonMode:n=!1}={}){let o=e||"claude-haiku-4-5-20251001",i=await Xe(),a=[{role:"user",content:t}],s=n?"Respond with valid JSON only. No explanation or wrapping.":void 0,r=await i.messages.create({model:o,max_tokens:4096,messages:a,...s&&{system:s}});return{text:r.content[0].text.trim(),inputTokens:r.usage?.input_tokens||T(t),outputTokens:r.usage?.output_tokens||T(r.content[0].text),model:o}}var tt,Nt=h(()=>{w();M();tt=null});var It={};N(It,{chat:()=>rn});import{spawn as tn}from"node:child_process";function on(t,e){let n=d.llm.cliTimeout||12e4;return new Promise((o,i)=>{let a=tn("claude",t,{stdio:["pipe","pipe","pipe"]}),s=setTimeout(()=>{a.kill("SIGTERM"),i(new Error(`claude CLI timed out after ${n}ms`))},n),r="",c="";a.stdout.on("data",u=>{r+=u}),a.stderr.on("data",u=>{c+=u}),a.on("error",u=>{clearTimeout(s),i(new Error(`Failed to spawn claude CLI: ${u.message}`))}),a.on("close",u=>{clearTimeout(s),o({stdout:r,stderr:c,code:u})}),a.stdin.write(e),a.stdin.end()})}async function rn(t,{model:e,jsonMode:n=!1}={}){let o=e||d.llm.cliModel||"haiku",i=en[o]||o,a=["-p","--model",i,"--output-format","json"];n&&a.push("--json-schema",nn);let{stdout:s,stderr:r,code:c}=await on(a,t);if(c!==0)throw new Error(`claude CLI exited ${c}: ${(r||s).slice(0,500)}`);let u;try{u=JSON.parse(s)}catch{return{text:s.trim(),inputTokens:T(t),outputTokens:T(s),model:i}}if(u.is_error)throw new Error(`claude CLI error: ${u.result||"unknown error"}`);let E=n&&u.structured_output?JSON.stringify(u.structured_output):(u.result||"").trim(),l=u.usage||{};return{text:E,inputTokens:l.input_tokens||T(t),outputTokens:l.output_tokens||T(E),model:i,cost:u.total_cost_usd||0}}var en,nn,Ot=h(()=>{w();M();en={"claude-haiku-4-5-20251001":"haiku","claude-sonnet-4-6":"sonnet","claude-opus-4-6":"opus"},nn=JSON.stringify({type:"object",additionalProperties:!0})});var Ct={};N(Ct,{chat:()=>an});async function an(t,{model:e,jsonMode:n=!1}={}){let o=e||d.llm.ollamaModel,i=`${d.llm.ollamaHost}/api/chat`,a={model:o,messages:[{role:"user",content:t}],stream:!1};n&&(a.format="json");let s=await fetch(i,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(a)});if(!s.ok){let c=await s.text();throw new Error(`Ollama error ${s.status}: ${c}`)}let r=await s.json();return{text:r.message.content.trim(),inputTokens:r.prompt_eval_count||T(t),outputTokens:r.eval_count||T(r.message.content),model:o}}var Rt=h(()=>{w();M()});var bt={};N(bt,{embedBatch:()=>cn});async function cn(t,{model:e,ollamaHost:n}){let o=H(t,sn),i=[];for(let a of o){let s=await fetch(`${n}/api/embed`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:e,input:a})});if(!s.ok)throw new Error(`Ollama embed failed: ${s.status} ${await s.text()}`);let r=await s.json();i.push(...r.embeddings)}return i}var sn,Dt=h(()=>{B();sn=50});var Lt={};N(Lt,{embedBatch:()=>un});async function un(t,{model:e,openaiApiKey:n,dimensions:o}={}){let i={model:e,input:t};o&&/^text-embedding-3/.test(e)&&(i.dimensions=o);let a=await fetch("https://api.openai.com/v1/embeddings",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${n}`},body:JSON.stringify(i)});if(!a.ok)throw new Error(`OpenAI embed failed: ${a.status} ${await a.text()}`);return(await a.json()).data.map(r=>r.embedding)}var vt=h(()=>{});var Mt={};N(Mt,{embedBatch:()=>ln});async function ln(t,{model:e,voyageApiKey:n,inputType:o="document",dimensions:i}={}){if(!n)throw new Error("VOYAGE_API_KEY is not set. Get one at dashboard.voyageai.com.");let a=H(t,dn),s=[];for(let r of a){let c={input:r,model:e||"voyage-3-large",input_type:o==="query"?"query":"document"};i&&(c.output_dimension=i);let u=await fetch("https://api.voyageai.com/v1/embeddings",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${n}`},body:JSON.stringify(c)});if(!u.ok){let m=await u.text();throw new Error(`Voyage embed failed: ${u.status} ${m}`)}let l=[...(await u.json()).data].sort((m,f)=>m.index-f.index);s.push(...l.map(m=>m.embedding))}return s}var dn,kt=h(()=>{B();dn=50});import{spawn as mn}from"node:child_process";async function rt(t){if(!et[t]){let e=ot[t];if(!e)throw new Error(`Unknown LLM provider: "${t}". Available: ${Object.keys(ot).join(", ")}`);let n=await e();et[t]=n.chat}return et[t]}async function Pt(t){if(!nt[t]){let e=xt[t];if(!e)throw new Error(`Unknown embedding provider: "${t}". Available: ${Object.keys(xt).join(", ")}`);let n=await e();nt[t]=n.embedBatch}return nt[t]}function Ft(t,e){if(!t)return{provider:e,model:null};let n=t.indexOf(":");return n>0&&ot[t.slice(0,n)]?{provider:t.slice(0,n),model:t.slice(n+1)}:{provider:e,model:t}}async function Ht(){let t=d.llm.ollamaHost||d.embedding.ollamaHost||"http://localhost:11434";try{return(await fetch(`${t}/api/tags`,{signal:AbortSignal.timeout(2e3)})).ok}catch{return!1}}function pn(){return new Promise(t=>{let e=mn("claude",["--version"],{stdio:"pipe"});e.on("error",()=>t(!1)),e.on("close",n=>t(n===0)),setTimeout(()=>{e.kill(),t(!1)},3e3)})}async function Bt(){if(A)return A;if(d.llm.provider)return A=d.llm.provider,A;if(d.llm.apiKey)return A="anthropic",A;if(d.llm.openaiApiKey)return A="openai",A;if(await Ht())return A="ollama",A;if(await pn())return A="claude-cli",A;throw new Error(`No LLM provider available. Either:
  - Set LLM_PROVIDER (openai, anthropic, ollama, claude-cli)
  - Set ANTHROPIC_API_KEY or OPENAI_API_KEY
  - Start Ollama locally
  - Install the Claude CLI (claude)`)}async function $t(){if(I)return I;if(d.embedding.provider)return I=d.embedding.provider,I;if(d.embedding.voyageApiKey)return I="voyage",I;if(await Ht())return I="ollama",I;if(d.embedding.openaiApiKey)return I="openai",I;throw new Error(`No embedding provider available. Either:
  - Set EMBEDDING_PROVIDER (voyage, ollama, openai)
  - Set VOYAGE_API_KEY (recommended \u2014 best quality)
  - Start Ollama locally
  - Set OPENAI_API_KEY`)}var ot,xt,et,nt,A,I,it=h(()=>{w();ot={openai:()=>Promise.resolve().then(()=>(_t(),yt)),anthropic:()=>Promise.resolve().then(()=>(Nt(),Tt)),"claude-cli":()=>Promise.resolve().then(()=>(Ot(),It)),ollama:()=>Promise.resolve().then(()=>(Rt(),Ct))},xt={ollama:()=>Promise.resolve().then(()=>(Dt(),bt)),openai:()=>Promise.resolve().then(()=>(vt(),Lt)),voyage:()=>Promise.resolve().then(()=>(kt(),Mt))},et={},nt={};A=null,I=null});function C(t){return t?`[${t.join(",")}]`:null}var b=h(()=>{});import{createHash as fn}from"node:crypto";function En(t,e,n,o="document"){let i=fn("sha256");return i.update(t),i.update("\0"),i.update(e),i.update("\0"),i.update(o),i.update("\0"),i.update(n),i.digest("hex")}async function yn(t){if(!t.length)return new Map;let e=await p("embedding_cache").whereIn("key",t).select("key","embedding");return new Map(e.map(n=>[n.key,_n(n.embedding)]))}function _n(t){return Array.isArray(t)||typeof t!="string"?t:(t.startsWith("[")?t.slice(1,-1):t).split(",").map(Number)}async function gn(t){t.length&&await p("embedding_cache").whereIn("key",t).update({hits:p.raw("hits + 1"),lastUsedAt:p.fn.now()})}async function wn(t,e,n){if(t.length){for(let{key:o,embedding:i}of t)await p.raw(`
      INSERT INTO embedding_cache (key, provider, model, embedding, hits, created_at, last_used_at)
      VALUES (?, ?, ?, ?, 0, NOW(), NOW())
      ON CONFLICT (key) DO UPDATE
        SET last_used_at = NOW(),
            hits = embedding_cache.hits + 1
    `,[o,e,n,C(i)]);await An()}}async function An(){let t=Date.now();if(t-Wt<Sn)return;Wt=t;let[{count:e}]=await p("embedding_cache").count("key as count"),n=Number(e);if(n<=Ut)return;let o=Math.min(n-Ut,hn);await p.raw(`
    DELETE FROM embedding_cache WHERE key IN (
      SELECT key FROM embedding_cache ORDER BY last_used_at ASC LIMIT ?
    )
  `,[o])}async function Yt(t,e,n,o,i,a={}){if(!t.length)return[];let s=a.inputType||i?.inputType||"document",r=t.map(f=>En(e,n,f,s)),c=await yn(r),u=[],E=[],l=new Array(t.length);for(let f=0;f<t.length;f++){let y=c.get(r[f]);y?l[f]=y:(u.push(t[f]),E.push(f))}if(u.length){let f=await o(u,i),y=[];for(let _=0;_<u.length;_++){let g=E[_];l[g]=f[_],y.push({key:r[g],embedding:f[_]})}wn(y,e,n).catch(_=>{process.stderr.write(`[embedding-cache] store failed: ${_.message}
`)})}let m=r.filter(f=>c.has(f));return m.length&&gn(m).catch(()=>{}),l}var Ut,hn,Wt,Sn,Gt=h(()=>{b();S();Ut=1e4,hn=500;Wt=0,Sn=6e4});async function at(t,e={}){let[n]=await st([t],e);return n}async function st(t,{inputType:e="document"}={}){if(!t.length)return[];let n=await $t(),o=await Pt(n),i=d.embedding.model,a={...d.embedding,inputType:e};return Yt(t,n,i,o,a,{inputType:e})}var Ho,ct=h(()=>{w();it();Gt();({dimensions:Ho}=d.embedding)});async function Kt(t,e){return p("entity").whereRaw("LOWER(name) = LOWER(?)",[t]).where({namespace:e||d.defaults.namespace}).whereNull("mergedWith").first()||null}async function jt(t,{entityType:e,namespace:n,limit:o=10}={}){let i=p("entity").whereRaw("LOWER(name) LIKE ?",[`%${t.toLowerCase()}%`]).whereNull("mergedWith").orderBy("mentionCount","desc").limit(o);return e&&i.where({entityType:e}),n&&i.where({namespace:n}),i}var Vt=h(()=>{S();b();w()});async function zt(t,{limit:e=50}={}){return p("fact").join("fact_entity","fact.id","fact_entity.fact_id").where("fact_entity.entity_id",t).where("fact.status","active").select("fact.*","fact_entity.mention_count as entityMentionCount").orderBy("fact_entity.mention_count","desc").limit(e)}async function Jt(t){if(!t.length)return new Map;let e=await p("fact_entity").whereIn("factId",t).select("factId","entityId"),n=new Map;for(let o of e)n.has(o.factId)||n.set(o.factId,[]),n.get(o.factId).push(o.entityId);return n}var ut=h(()=>{S()});async function qt(t){let e=await Bt();return Ft(t,e)}async function dt(t,{model:e,caller:n}={}){let{provider:o,model:i}=await qt(e),a=await rt(o),s=Date.now();try{let r=await Q(()=>a(t,{model:i,jsonMode:!1}),d.llm.maxRetries),c=r.cost||X(r.model,r.inputTokens,r.outputTokens);return v({provider:o,model:r.model,caller:n,input:t,response:r.text,inputTokens:r.inputTokens,outputTokens:r.outputTokens,cost:c,durationMs:Date.now()-s,status:"success"}),r.text}catch(r){throw v({provider:o,model:i,caller:n,input:t,response:null,inputTokens:0,outputTokens:0,cost:0,durationMs:Date.now()-s,status:"error",error:r.message}),r}}async function W(t,{model:e,caller:n}={}){let{provider:o,model:i}=await qt(e),a=await rt(o),s=Date.now();try{let r=await Q(()=>a(t,{model:i,jsonMode:!0}),d.llm.maxRetries),c=r.cost||X(r.model,r.inputTokens,r.outputTokens);return v({provider:o,model:r.model,caller:n,input:t,response:r.text,inputTokens:r.inputTokens,outputTokens:r.outputTokens,cost:c,durationMs:Date.now()-s,status:"success"}),Tn(r.text)}catch(r){throw v({provider:o,model:i,caller:n,input:t,response:null,inputTokens:0,outputTokens:0,cost:0,durationMs:Date.now()-s,status:"error",error:r.message}),r}}function Tn(t){try{return JSON.parse(t.trim())}catch{}let e=t.match(/```(?:json)?\s*([\s\S]*?)```/);if(e)try{return JSON.parse(e[1].trim())}catch{}let n=t.match(/[\[{][\s\S]*[\]}]/);if(n)try{return JSON.parse(n[0])}catch{}return null}var k=h(()=>{w();it();M()});import{fileURLToPath as Nn}from"node:url";import{dirname as Zt,join as Y}from"node:path";import{existsSync as Xt}from"node:fs";function In(){let t=Zt(Nn(import.meta.url));for(let e=0;e<10;e++){if(Xt(Y(t,"package.json"))&&Xt(Y(t,"prompts")))return t;let n=Zt(t);if(n===t)break;t=n}return process.cwd()}var Qt,G,Qo,lt=h(()=>{Qt=In(),G=Y(Qt,"prompts"),Qo=Y(Qt,"src","db","migrations")});import On from"node:path";async function te(t){t.length&&await p.raw(`UPDATE fact_lifecycle
     SET access_count = access_count + 1,
         last_accessed_at = NOW(),
         stage = CASE WHEN stage = 'stable' THEN 'editing' ELSE stage END,
         stage_entered_at = CASE WHEN stage = 'stable' THEN NOW() ELSE stage_entered_at END
     WHERE fact_id = ANY(?)`,[t])}var cr,ur,dr,ee=h(()=>{S();ct();k();b();w();lt();cr=On.join(G,"audm-decision.md"),ur=d.memory.skipThreshold,dr=d.memory.ambiguousThreshold});async function ne(t){if(!t||t.length<2)return;let e=[...new Set(t.filter(a=>Number.isInteger(a)))].sort((a,s)=>a-s);if(e.length<2)return;let n=[];for(let a=0;a<e.length;a++)for(let s=a+1;s<e.length;s++)n.push([e[a],e[s]]);let o=n.map(()=>"(?, ?, 1, NOW(), NOW())").join(", "),i=n.flat();await p.raw(`
    INSERT INTO hebbian_edge (fact_a_id, fact_b_id, strength, first_seen_at, last_seen_at)
    VALUES ${o}
    ON CONFLICT (fact_a_id, fact_b_id)
    DO UPDATE SET
      strength = hebbian_edge.strength + 1,
      last_seen_at = NOW()
  `,i)}var oe=h(()=>{S()});async function re(t,{direction:e="both",relationType:n,limit:o=50}={}){let i=r=>{let c=r==="outgoing"?"source_id":"target_id",u=r==="outgoing"?"target_id":"source_id";return p.raw(`
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
    `,n?[t,n,o]:[t,o])};if(e==="outgoing"){let{rows:r}=await i("outgoing");return r}if(e==="incoming"){let{rows:r}=await i("incoming");return r}let[a,s]=await Promise.all([i("outgoing"),i("incoming")]);return[...a.rows,...s.rows]}var ie=h(()=>{S()});function K({minConfidence:t="medium",pointInTime:e,categories:n}){let o=Cn[t]??1,i=[o],a="",s="";return e&&(a="AND valid_from <= ? AND (valid_until IS NULL OR valid_until > ?)",i.push(e,e)),n?.length&&(s="AND category = ANY(?)",i.push(n)),{minRank:o,temporalClause:a,categoryClause:s,filterParams:i}}var Cn,x,j=h(()=>{Cn={low:0,medium:1,high:2},x=`CASE confidence
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 1
            ELSE 0
          END`});async function ae(t,{namespaces:e,limit:n=20}){let o=C(t),{rows:i}=await p.raw(`
    SELECT id, document_id AS "documentId", chunk_index AS "chunkIndex",
           content, section_heading AS "sectionHeading", namespace,
           1 - (embedding <=> ?) as similarity
    FROM chunk
    WHERE namespace = ANY(?)
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ?
    LIMIT ?
  `,[o,e,o,n]);return i}var se=h(()=>{S();b();w();j()});async function ce(t,{namespaces:e,limit:n=20}){let{rows:o}=await p.raw(`
    SELECT id, document_id AS "documentId", chunk_index AS "chunkIndex",
           content, section_heading AS "sectionHeading", namespace,
           ts_rank(search_vector, plainto_tsquery('english', ?)) as rank
    FROM chunk
    WHERE namespace = ANY(?)
      AND search_vector @@ plainto_tsquery('english', ?)
    ORDER BY rank DESC
    LIMIT ?
  `,[t,e,t,n]);return o}var ue=h(()=>{S();j()});async function le(t,e,{namespaces:n,limit:o=5,minConfidence:i="medium",pointInTime:a,categories:s}){let r=C(e),{temporalClause:c,categoryClause:u,filterParams:E}=K({minConfidence:i,pointInTime:a,categories:s}),l=o*vn,m=[r,r,n,...E,r,l],f=[t,t,n,...E,t,l],y=[l,l,o],_=`
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
        AND ${x} >= ?
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
        AND ${x} >= ?
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
               ${Dn} * (1.0 / (${de} + COALESCE(s.rank_ix, ?)))
             + ${Ln} * (1.0 / (${de} + COALESCE(k.rank_ix, ?)))
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
             CASE f.importance WHEN 'vital' THEN ${Mn} ELSE 1.0 END AS importance_mult,
             CASE f.confidence
               WHEN 'high'   THEN ${kn}
               WHEN 'medium' THEN ${xn}
               WHEN 'low'    THEN ${Pn}
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
  `,g=[...m,...f,...y],{rows:F}=await p.raw(_,g);if(!F.length)return[];let ve=F[0].final_score||F[0].rrf_raw||1;return F.map(V=>({...V,rrfScore:Math.round(Number(V.final_score||V.rrf_raw)/Number(ve)*100)/100}))}var de,Dn,Ln,vn,Mn,kn,xn,Pn,me=h(()=>{S();b();w();j();de=20,Dn=1,Ln=.7,vn=3,Mn=1.5,kn=1,xn=.85,Pn=.7});async function pe(t){let e=t.map(i=>i.id),n=await Jt(e),o=new Set;for(let i of n.values())for(let a of i)o.add(a);return o.size?p("entity").whereIn("id",[...o]).whereNull("mergedWith").select("id","uid","name","entityType","description"):[]}async function fe(t,{limit:e=10}={}){if(!t.length)return[];let n=await p("relation").where(function(){this.whereIn("sourceId",t).orWhereIn("targetId",t)}).whereNull("invalidAt").select("*").limit(e*3),o=new Set(t),i=new Set,a=new Map;for(let l of n){let m=o.has(l.sourceId)?l.targetId:l.sourceId;i.add(m),a.has(m)||a.set(m,l)}if(!i.size)return[];let s=await p("entity").whereIn("id",[...i]).whereNull("mergedWith").select("id","name"),r=new Map(s.map(l=>[l.id,l.name])),c=await p("fact").join("fact_entity","fact.id","fact_entity.factId").whereIn("fact_entity.entityId",[...i]).where("fact.status","active").select("fact.*","fact_entity.entityId").orderBy("fact_entity.mentionCount","desc").limit(e*3),u=new Set,E=[];for(let l of c){if(u.has(l.id))continue;u.add(l.id);let m=a.get(l.entityId),f=r.get(l.entityId)||"unknown",y=m?.relationType||"related";if(E.push({...l,relationPath:`${f} (${y})`,graphDistance:1}),E.length>=e)break}return E}function he(t,e,n,o){let i=new Set(n),a=t.map(r=>({...r,resultType:"direct"})),s=e.filter(r=>!t.some(c=>c.id===r.id)).map(r=>({...r,rrfScore:(r.rrfScore||.1)*.5,resultType:"related"}));return[...a,...s].slice(0,o)}var Ee=h(()=>{S();ut()});var D,mt=h(()=>{D=class{#t=new Map;#e;#n;constructor({maxSize:e=100,ttlMs:n=300*1e3}={}){this.#e=e,this.#n=n}get(e){let n=this.#t.get(e);if(n){if(Date.now()-n.timestamp>this.#n){this.#t.delete(e);return}return n.value}}set(e,n){if(this.#t.size>=this.#e){let o=this.#t.keys().next().value;this.#t.delete(o)}this.#t.set(e,{value:n,timestamp:Date.now()})}}});async function _e(t){let e=ye.get(t);if(e)return e;let n=`You are a search query expander for a personal knowledge base.

Given the user's query, generate 3-5 alternative search queries that would help find ALL relevant information \u2014 including facts that don't literally match the query but are semantically related.

Think about:
- Synonyms and rephrased versions
- Inverse/negative framings (if someone asks "what should I use", also search for "what to avoid")
- Related concepts that would inform the answer
- Specific terms someone might have used when storing this knowledge

User query: "${t}"

Respond with ONLY a JSON array of strings. Do not include the original query.`;try{let o=await W(n,{model:d.llm.extractionModel,caller:"query-expander"});if(!Array.isArray(o))return[t];let i=o.filter(s=>typeof s=="string"&&s.trim()).slice(0,Fn),a=i.length?[t,...i]:[t];return ye.set(t,a),a}catch(o){return console.error("[query-expander] Failed:",o.message),[t]}}var Fn,ye,ge=h(()=>{k();mt();w();Fn=5,ye=new D({maxSize:100,ttlMs:300*1e3})});import{readFile as Hn}from"node:fs/promises";import{join as Bn}from"node:path";async function Ae(t){let e=t.trim().toLowerCase(),n=pt.get(e);if(n)return n;let i=`${await Hn($n,"utf8")}

---

Query: ${t}

---

Respond with ONLY a JSON object: { "intent": "preference|factual|entity_lookup|exploratory|temporal", "categories": [...], "entities": [...], "expand": bool, "pointInTime": null or "YYYY-MM-DD", "reasoning": "..." }`;try{let a=await W(i,{model:d.llm.extractionModel,caller:"query-router"});if(!a||!Un.includes(a.intent)){let c=we("factual",{});return pt.set(e,c),c}let s=Se[a.intent],r={intent:a.intent,categories:Array.isArray(a.categories)&&a.categories.length?a.categories:s.categories,entities:Array.isArray(a.entities)?a.entities:[],expand:typeof a.expand=="boolean"?a.expand:s.expand,useGraph:s.useGraph,limit:s.limit,pointInTime:a.pointInTime||null,reasoning:a.reasoning||""};return pt.set(e,r),r}catch(a){return console.error("[query-router] Failed:",a.message),we("factual",{reasoning:`Fallback \u2014 ${a.message}`})}}function we(t,e={}){let n=Se[t];return{intent:t,categories:n.categories,entities:[],expand:n.expand,useGraph:n.useGraph,limit:n.limit,pointInTime:null,reasoning:"",...e}}var $n,pt,Un,Se,Te=h(()=>{k();mt();w();lt();$n=Bn(G,"query-router.md"),pt=new D({maxSize:200,ttlMs:600*1e3}),Un=["preference","factual","entity_lookup","exploratory","temporal"],Se={preference:{categories:["preference","opinion","personal"],expand:!1,useGraph:!1,limit:null},factual:{categories:[],expand:!1,useGraph:!1,limit:null},entity_lookup:{categories:[],expand:!1,useGraph:!0,limit:null},exploratory:{categories:[],expand:!0,useGraph:!0,limit:15},temporal:{categories:[],expand:!1,useGraph:!1,limit:null}}});var Oe={};N(Oe,{search:()=>Kn});async function Kn(t,{namespaces:e,limit:n=5,minConfidence:o="medium",useGraph:i=!1,includeChunks:a=!1,pointInTime:s,expand:r=!1,route:c=!0,categories:u,synthesize:E=d.search.synthesize}={}){E&&(a=!0);let l=null;c&&(l=await Ae(t),i=i||l.useGraph,r=r||l.expand,n=l.limit||n,s=s||l.pointInTime,u=u||(l.categories.length?l.categories:void 0));let m=await Vn(t,e),f;m?f=await zn(m,t,{namespaces:e,limit:n,minConfidence:o,includeChunks:a,pointInTime:s,categories:u}):f=await Jn(t,{namespaces:e,limit:n,minConfidence:o,useGraph:i,includeChunks:a,pointInTime:s,expand:r,categories:u});let y=f.facts.map(_=>_.id).filter(Boolean);if(te(y).catch(_=>console.error("[access-tracking]",_.message)),ne(y.slice(0,8)).catch(_=>console.error("[hebbian]",_.message)),E)try{f.synthesized=await jn(t,f)}catch(_){console.error("[synthesizer] failed:",_.message),f.synthesized=null}return f}async function jn(t,{facts:e,chunks:n}){let o=[];if(e.slice(0,10).forEach((s,r)=>{o.push(`[F${r+1}] (${s.category}) ${s.content}`)}),n.length&&n.slice(0,15).forEach((s,r)=>{let c=(s.content||"").replace(/\s+/g," ").trim();c&&o.push(`[C${r+1}] ${c.slice(0,2e3)}`)}),!o.length)return"No retrieved evidence \u2014 nothing to synthesize.";let i=`You are answering a question from a personal-memory system.
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
- Plain text only, no headers. Direct answer first, then a short justification if needed. 1-4 sentences total.`,a=d.search.synthesizeModel||d.llm.extractionModel||void 0;return dt(i,{model:a,caller:"synthesizer"})}async function Vn(t,e){if(t.length<2||t.length>Gn)return null;let n=e[0]||d.defaults.namespace,o=await Kt(t,n);return o||(await jt(t,{namespace:n,limit:1}))[0]||null}async function zn(t,e,{namespaces:n,limit:o,minConfidence:i,includeChunks:a,pointInTime:s,categories:r}){let[c,u,E]=await Promise.all([zt(t.id,{limit:o}),re(t.id,{limit:15}),Ie(e,{namespaces:n,limit:o,minConfidence:i,includeChunks:a,pointInTime:s,categories:r})]),l=c.map(g=>({...g,source:"entity"})),m=new Set(l.map(g=>g.id)),f=E.facts.filter(g=>!m.has(g.id)).map(g=>({...g,source:"search"})),y=[...l,...f].slice(0,o),_=u.map(g=>({id:g.entityId,name:g.name,type:g.entityType,relation:g.relationType,direction:g.direction,mentions:g.mentionCount}));return{facts:y,chunks:a?E.chunks:[],matchedEntity:{id:t.id,name:t.name,type:t.entityType,mentions:t.mentionCount,description:t.description||null},relatedEntities:_}}async function Jn(t,{namespaces:e,limit:n,minConfidence:o,useGraph:i,includeChunks:a,pointInTime:s,expand:r=!1,categories:c}){let u=r?await _e(t):[t],E=await st(u,{inputType:"query"}),l=await Promise.all(u.map((y,_)=>Ie(y,{queryEmbedding:E[_],namespaces:e,limit:n,minConfidence:o,includeChunks:a,pointInTime:s,categories:c}))),m=Ne(l.map(y=>y.facts),n);if(m=m.map(y=>({...y,source:"search"})),i&&m.length)try{let y=await pe(m.slice(0,5));if(y.length){let _=await fe(y.map(g=>g.id),{limit:5});m=he(m,_,y.map(g=>g.id),n)}}catch(y){console.error("[graph-enhancement] Failed:",y.message)}let f=a?Ne(l.map(y=>y.chunks),n):[];return{facts:m,chunks:f,matchedEntity:null,relatedEntities:[]}}function Ne(t,e){let n={},o={};for(let s of t)for(let[r,c]of s.entries())o[c.id]=c,n[c.id]=(n[c.id]||0)+1/(ft+r+1);let i=Object.entries(n).sort(([,s],[,r])=>r-s),a=i.length?i[0][1]:1;return i.slice(0,e).map(([s,r])=>({...o[s],rrfScore:Math.round(r/a*100)/100}))}async function Ie(t,{queryEmbedding:e,namespaces:n,limit:o,minConfidence:i,includeChunks:a=!1,pointInTime:s,categories:r}){let c=e||await at(t,{inputType:"query"}),u=le(t,c,{namespaces:n,limit:o,minConfidence:i,pointInTime:s,categories:r}),E=a?[ae(c,{namespaces:n,limit:o}),ce(t,{namespaces:n,limit:o})]:[],[l,...m]=await Promise.all([u,...E]),f=a&&m.length===2?qn(m[0],m[1],o):[];return{facts:l,chunks:f}}function qn(t,e,n){let o={},i={...z(t,"id"),...z(e,"id")};t.forEach((r,c)=>{o[r.id]=(o[r.id]||0)+Wn/(ft+c+1)}),e.forEach((r,c)=>{o[r.id]=(o[r.id]||0)+Yn/(ft+c+1)});let a=Object.entries(o).sort(([r,c],[u,E])=>{if(c!==E)return E-c;let l=i[r]?.importance==="vital"?1:0;return(i[u]?.importance==="vital"?1:0)-l}),s=a.length?a[0][1]:1;return a.slice(0,n).map(([r,c])=>({...i[r],rrfScore:Math.round(c/s*100)/100}))}var ft,Wn,Yn,Gn,Ce=h(()=>{B();ct();w();Vt();ut();ee();oe();ie();se();ue();me();Ee();ge();Te();k();ft=20,Wn=1,Yn=.7,Gn=60});import{resolve as Zn,join as Xn}from"node:path";import{existsSync as Re}from"node:fs";import{config as be}from"dotenv";var L="***MASKED***",ke=[/\b(sk-(?:proj-|ant-)?[A-Za-z0-9_\-]{20,})\b/g,/\b(ghp_[A-Za-z0-9]{36,})\b/g,/\b(github_pat_[A-Za-z0-9_]{20,})\b/g,/\b(gho_[A-Za-z0-9]{36,})\b/g,/\b(glpat-[A-Za-z0-9_\-]{20,})\b/g,/\b(xox[baprs]-[A-Za-z0-9\-]{10,})\b/g,/\b(whsec_[A-Za-z0-9]{20,})\b/g,/\b(rk_(?:live|test)_[A-Za-z0-9]{20,})\b/g,/\b(AKIA[A-Z0-9]{16})\b/g,/\b(ASIA[A-Z0-9]{16})\b/g,/\b(eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,})\b/g,/\b([A-Za-z0-9]{24}\.[A-Za-z0-9_\-]{6}\.[A-Za-z0-9_\-]{27})\b/g,/\b(\d{8,12}:[A-Za-z0-9_\-]{35})\b/g],xe=new RegExp(`\\b(api[_-]?key|api[_-]?secret|secret[_-]?key|secret|token|password|passwd|pwd|auth[_-]?token|access[_-]?token|refresh[_-]?token|bearer|private[_-]?key|client[_-]?secret)\\s*[=:]\\s*["']?([^\\s"']{8,})["']?`,"gi"),Pe=/(\w+:\/\/)([^:/\s]+):([^@\s]{3,})@/g,Fe=["DATABASE_URL","REDIS_URL","MONGODB_URI","MONGO_URI","POSTGRES_URL","DSN","CONNECTION_STRING","ENCRYPTION_KEY","JWT_SECRET","CORTEX_ENCRYPTION_KEY","SESSION_SECRET","WEBHOOK_SECRET"],He=new RegExp(`\\b(${Fe.join("|")})\\s*[=:]\\s*["']?([^\\s"']+)["']?`,"gi");function ht(t){if(!t||typeof t!="string")return t;let e=t;for(let n of ke)e=e.replace(n,L);return e=e.replace(xe,(n,o)=>`${o}=${L}`),e=e.replace(Pe,(n,o)=>`${o}${L}:${L}@`),e=e.replace(He,(n,o)=>`${o}=${L}`),e}var Qn=process.env.HOME||process.env.USERPROFILE,De=Xn(Qn,".sigil",".env"),Le=Zn(process.cwd(),".env");Re(Le)?be({path:Le,quiet:!0}):Re(De)&&be({path:De,quiet:!0});var to=8,eo=8;async function no(){let t=[];for await(let i of process.stdin)t.push(i);let e=Buffer.concat(t).toString("utf8").trim();if(!e)return P();let o=JSON.parse(e).prompt||"";if(o.length<to)return P();try{let{search:i}=await Promise.resolve().then(()=>(Ce(),Oe)),a=(await Promise.resolve().then(()=>(w(),Et))).default,{facts:s}=await i(o,{namespaces:[a.defaults.namespace],limit:eo,useGraph:!1,route:!1,expand:!1});if(!s.length)return await(await Promise.resolve().then(()=>(S(),U))).default.destroy(),P();let r=ht([`Sigil memory (${s.length} relevant facts):`,...s.map(u=>`- ${u.content}`)].join(`
`));return await(await Promise.resolve().then(()=>(S(),U))).default.destroy(),P(r)}catch(i){process.stderr.write(`[sigil:user-prompt-submit] ${i.message}
`);try{await(await Promise.resolve().then(()=>(S(),U))).default.destroy()}catch{}return P()}}function P(t){let e={hookSpecificOutput:{hookEventName:"UserPromptSubmit",...t&&{additionalContext:t}}};process.stdout.write(JSON.stringify(e))}no();
