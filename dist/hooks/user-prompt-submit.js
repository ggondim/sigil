#!/usr/bin/env node
var Ye=Object.defineProperty;var E=(t,e)=>()=>(t&&(e=t(t=0)),e);var T=(t,e)=>{for(var n in e)Ye(t,n,{get:e[n],enumerable:!0})};function ot(t,e){let n={};for(let o of t)n[o[e]]=o;return n}function $(t,e){if(e<1)return[];let n=[];for(let o=0;o<t.length;o+=e)n.push(t.slice(o,o+e));return n}var Y=E(()=>{});var Tt={};T(Tt,{default:()=>d});var A,Je,d,w=E(()=>{A=(t,e,n)=>process.env[t]??(e&&process.env[e])??n,Je={db:{type:A("SIGIL_DB_TYPE","CORTEX_DB_TYPE","pglite"),host:A("SIGIL_DB_HOST","CORTEX_DB_HOST","localhost"),port:Number(A("SIGIL_DB_PORT","CORTEX_DB_PORT",5432)),database:A("SIGIL_DB_NAME","CORTEX_DB_NAME","sigil"),user:A("SIGIL_DB_USER","CORTEX_DB_USER","sigil_app"),password:A("SIGIL_DB_PASSWORD","CORTEX_DB_PASSWORD","")},embedding:{provider:process.env.EMBEDDING_PROVIDER||"",model:process.env.EMBEDDING_MODEL||"nomic-embed-text",dimensions:Number(process.env.EMBEDDING_DIMENSIONS)||768,ollamaHost:process.env.OLLAMA_HOST||"http://localhost:11434",openaiApiKey:process.env.OPENAI_API_KEY||"",voyageApiKey:process.env.VOYAGE_API_KEY||""},llm:{provider:process.env.LLM_PROVIDER||"",openaiApiKey:process.env.OPENAI_API_KEY||"",openaiModel:process.env.LLM_OPENAI_MODEL||"gpt-4o-mini",ollamaHost:process.env.LLM_OLLAMA_HOST||process.env.OLLAMA_HOST||"http://localhost:11434",ollamaModel:process.env.LLM_OLLAMA_MODEL||"qwen2.5:7b",cliModel:process.env.LLM_CLI_MODEL||"haiku",apiKey:process.env.ANTHROPIC_API_KEY||"",extractionModel:process.env.LLM_EXTRACTION_MODEL||"",decisionModel:process.env.LLM_DECISION_MODEL||"",entityModel:process.env.LLM_ENTITY_MODEL||"",maxRetries:Number(process.env.LLM_MAX_RETRIES)||3,cliTimeout:Number(process.env.LLM_CLI_TIMEOUT)||12e4},output:{storage:process.env.OUTPUT_STORAGE||"local",dir:process.env.OUTPUT_DIR||"./output",s3:{endpoint:process.env.S3_ENDPOINT||"",bucket:process.env.S3_BUCKET||"",region:process.env.S3_REGION||"us-east-1",accessKey:process.env.S3_ACCESS_KEY||"",secretKey:process.env.S3_SECRET_KEY||"",publicUrl:process.env.S3_PUBLIC_URL||""}},server:{port:Number(process.env.PORT)||4e3,host:process.env.HOST||"0.0.0.0",logLevel:process.env.LOG_LEVEL||"info"},defaults:{namespace:process.env.DEFAULT_NAMESPACE||"default"},memory:{skipThreshold:Number(process.env.MEMORY_SKIP_THRESHOLD)||.88,ambiguousThreshold:Number(process.env.MEMORY_AMBIGUOUS_THRESHOLD)||.78,minFactSimilarity:Number(process.env.MEMORY_MIN_FACT_SIMILARITY)||.45},search:{synthesize:A("SIGIL_SYNTHESIZE","CORTEX_SYNTHESIZE","true")!=="false",synthesizeModel:A("SIGIL_SYNTH_MODEL","CORTEX_SYNTH_MODEL","")},ingest:{eagerExtract:A("SIGIL_EAGER_EXTRACT","CORTEX_EAGER_EXTRACT","true")!=="false"},hebbian:{entity:{enabled:A("SIGIL_HEBBIAN_ENTITY_ENABLED",null,"true")!=="false",eta:Number(A("SIGIL_HEBBIAN_ENTITY_ETA",null,1)),cap:Number(A("SIGIL_HEBBIAN_ENTITY_CAP",null,50)),halfLifeDays:Number(A("SIGIL_HEBBIAN_ENTITY_HALF_LIFE_DAYS",null,30)),minEffective:Number(A("SIGIL_HEBBIAN_ENTITY_MIN_EFFECTIVE",null,.5)),rrfWeight:Number(A("SIGIL_HEBBIAN_ENTITY_RRF_WEIGHT",null,.3)),maxWriteEntities:Number(A("SIGIL_HEBBIAN_ENTITY_MAX_WRITE",null,12)),expandPerSeed:Number(A("SIGIL_HEBBIAN_ENTITY_EXPAND_PER_SEED",null,3))}}},d=Je});var It={};T(It,{chat:()=>qe});async function qe(t,{model:e,jsonMode:n=!1}={}){let o=e||d.llm.openaiModel,i=[{role:"user",content:t}];n&&!t.toLowerCase().includes("json")&&i.unshift({role:"system",content:"Respond with valid JSON."});let a={model:o,messages:i};n&&(a.response_format={type:"json_object"});let s=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${d.llm.openaiApiKey}`},body:JSON.stringify(a)});if(!s.ok){let _=await s.text();throw new Error(`OpenAI error ${s.status}: ${_}`)}let r=await s.json(),c=r.choices[0].message.content.trim(),u=r.usage||{};return{text:c,inputTokens:u.prompt_tokens||0,outputTokens:u.completion_tokens||0,model:o}}var Ot=E(()=>{w()});import{createRequire as Xe}from"node:module";import{join as Ze}from"node:path";import{homedir as Qe}from"node:os";import{mkdirSync as tn}from"node:fs";async function on(t){if(!L){let{PGlite:e}=await import("@electric-sql/pglite"),{vector:n}=await import("@electric-sql/pglite/vector");tn(t,{recursive:!0}),L=new e(`file://${t}`,{extensions:{vector:n}}),await L.waitReady}return L}var en,nn,rt,L,G,j,Rt=E(()=>{en=Xe(import.meta.url),nn=en("knex/lib/dialects/postgres/index.js"),rt=process.env.SIGIL_PGLITE_PATH||Ze(Qe(),".sigil","db"),L=null;G=class{constructor(e){this._db=e}query(e,n){let o=typeof e=="string"?e:e.text,i=e?.values||[],s=!i.length&&o.split(";").filter(r=>r.trim()).length>1?this._db.exec(o).then(r=>{let c=r[r.length-1]||{};return{command:o.trim().split(/\s+/)[0].toUpperCase(),rows:c.rows||[],fields:c.fields||[],rowCount:c.affectedRows??c.rows?.length??0}}):this._db.query(o,i).then(r=>({command:(o||"").trim().split(/\s+/)[0].toUpperCase(),rows:r.rows,fields:r.fields||[],rowCount:r.affectedRows??r.rows.length}));if(typeof n=="function")s.then(r=>n(null,r)).catch(r=>n(r));else return s}end(e){return typeof e=="function"?e(null):Promise.resolve()}on(){}removeListener(){}},j=class extends nn{constructor(e){super(e),this._pglitePath=e?.connection?.pglitePath||rt,this._injectedPglite=e?.connection?.pgliteInstance||null}acquireRawConnection(){return this.version||(this.version="17.0"),this._injectedPglite?Promise.resolve(new G(this._injectedPglite)):on(this._pglitePath).then(e=>new G(e))}async destroyRawConnection(){}async destroy(){await super.destroy(),!this._injectedPglite&&L&&(await L.close(),L=null)}}});var K={};T(K,{default:()=>h});import Ct from"knex";function Lt(t){return Array.isArray(t)?t.map(it):t&&typeof t=="object"?it(t):t}function Dt(t,e){return e(sn(t))}function it(t){if(!t||typeof t!="object"||t instanceof Date)return t;if(Array.isArray(t))return t.map(it);let e={};for(let[n,o]of Object.entries(t))e[n.replace(/_([a-z])/g,(i,a)=>a.toUpperCase())]=o;return e}function sn(t){return t.replace(/[A-Z]/g,e=>`_${e.toLowerCase()}`)}var rn,an,h,S=E(()=>{w();Rt();rn=d.db.type==="postgres",an=rn?Ct({client:"pg",connection:{host:d.db.host,port:d.db.port,database:d.db.database,user:d.db.user,password:d.db.password},pool:{min:2,max:10},postProcessResponse:Lt,wrapIdentifier:Dt}):Ct({client:j,connection:{pglitePath:rt},pool:{min:1,max:1},postProcessResponse:Lt,wrapIdentifier:Dt});h=an});function I(t){return Math.ceil((t||"").length/4)}function at(t,e,n){let o=cn[t];return o?(e*o.input+n*o.output)/1e6:0}function P({provider:t,model:e,caller:n,input:o,response:i,inputTokens:a,outputTokens:s,cost:r,durationMs:c,status:u,error:_}){h("llm_log").insert({provider:t,model:e,caller:n,input:o?.slice(0,1e4),response:i?.slice(0,1e4),inputTokens:a,outputTokens:s,cost:r,durationMs:c,status:u,error:_?.slice(0,2e3)}).catch(m=>console.error("[llm-log] Write failed:",m.message))}async function st(t,e=3){for(let n=1;n<=e;n++)try{return await t()}catch(o){if(n===e)throw o;let i=Math.min(1e3*2**(n-1),1e4);await new Promise(a=>setTimeout(a,i))}}var cn,F=E(()=>{S();cn={"gpt-4o-mini":{input:.15,output:.6},"gpt-4o":{input:2.5,output:10},"gpt-4.1-nano":{input:.1,output:.4},"gpt-4.1-mini":{input:.4,output:1.6},"claude-haiku-4-5-20251001":{input:.8,output:4},"claude-sonnet-4-6":{input:3,output:15},"claude-opus-4-6":{input:15,output:75}}});var vt={};T(vt,{chat:()=>un});async function dn(){if(!ct){let{default:t}=await import("@anthropic-ai/sdk");ct=new t({apiKey:d.llm.apiKey})}return ct}async function un(t,{model:e,jsonMode:n=!1}={}){let o=e||"claude-haiku-4-5-20251001",i=await dn(),a=[{role:"user",content:t}],s=n?"Respond with valid JSON only. No explanation or wrapping.":void 0,r=await i.messages.create({model:o,max_tokens:4096,messages:a,...s&&{system:s}});return{text:r.content[0].text.trim(),inputTokens:r.usage?.input_tokens||I(t),outputTokens:r.usage?.output_tokens||I(r.content[0].text),model:o}}var ct,Mt=E(()=>{w();F();ct=null});var xt={};T(xt,{chat:()=>hn});import{spawn as ln}from"node:child_process";function pn(t,e){let n=d.llm.cliTimeout||12e4;return new Promise((o,i)=>{let a=ln("claude",t,{stdio:["pipe","pipe","pipe"]}),s=setTimeout(()=>{a.kill("SIGTERM"),i(new Error(`claude CLI timed out after ${n}ms`))},n),r="",c="";a.stdout.on("data",u=>{r+=u}),a.stderr.on("data",u=>{c+=u}),a.on("error",u=>{clearTimeout(s),i(new Error(`Failed to spawn claude CLI: ${u.message}`))}),a.on("close",u=>{clearTimeout(s),o({stdout:r,stderr:c,code:u})}),a.stdin.write(e),a.stdin.end()})}async function hn(t,{model:e,jsonMode:n=!1}={}){let o=e||d.llm.cliModel||"haiku",i=mn[o]||o,a=["-p","--model",i,"--output-format","json"];n&&a.push("--json-schema",fn);let{stdout:s,stderr:r,code:c}=await pn(a,t);if(c!==0)throw new Error(`claude CLI exited ${c}: ${(r||s).slice(0,500)}`);let u;try{u=JSON.parse(s)}catch{return{text:s.trim(),inputTokens:I(t),outputTokens:I(s),model:i}}if(u.is_error)throw new Error(`claude CLI error: ${u.result||"unknown error"}`);let _=n&&u.structured_output?JSON.stringify(u.structured_output):(u.result||"").trim(),m=u.usage||{};return{text:_,inputTokens:m.input_tokens||I(t),outputTokens:m.output_tokens||I(_),model:i,cost:u.total_cost_usd||0}}var mn,fn,kt=E(()=>{w();F();mn={"claude-haiku-4-5-20251001":"haiku","claude-sonnet-4-6":"sonnet","claude-opus-4-6":"opus"},fn=JSON.stringify({type:"object",additionalProperties:!0})});var Pt={};T(Pt,{chat:()=>En});async function En(t,{model:e,jsonMode:n=!1}={}){let o=e||d.llm.ollamaModel,i=`${d.llm.ollamaHost}/api/chat`,a={model:o,messages:[{role:"user",content:t}],stream:!1};n&&(a.format="json");let s=await fetch(i,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(a)});if(!s.ok){let c=await s.text();throw new Error(`Ollama error ${s.status}: ${c}`)}let r=await s.json();return{text:r.message.content.trim(),inputTokens:r.prompt_eval_count||I(t),outputTokens:r.eval_count||I(r.message.content),model:o}}var Ft=E(()=>{w();F()});var Ht={};T(Ht,{embedBatch:()=>yn});async function yn(t,{model:e,ollamaHost:n}){let o=$(t,_n),i=[];for(let a of o){let s=await fetch(`${n}/api/embed`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:e,input:a})});if(!s.ok)throw new Error(`Ollama embed failed: ${s.status} ${await s.text()}`);let r=await s.json();i.push(...r.embeddings)}return i}var _n,Bt=E(()=>{Y();_n=50});var Wt={};T(Wt,{embedBatch:()=>gn});async function gn(t,{model:e,openaiApiKey:n,dimensions:o}={}){let i={model:e,input:t};o&&/^text-embedding-3/.test(e)&&(i.dimensions=o);let a=await fetch("https://api.openai.com/v1/embeddings",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${n}`},body:JSON.stringify(i)});if(!a.ok)throw new Error(`OpenAI embed failed: ${a.status} ${await a.text()}`);return(await a.json()).data.map(r=>r.embedding)}var Ut=E(()=>{});var $t={};T($t,{embedBatch:()=>Sn});async function Sn(t,{model:e,voyageApiKey:n,inputType:o="document",dimensions:i}={}){if(!n)throw new Error("VOYAGE_API_KEY is not set. Get one at dashboard.voyageai.com.");let a=$(t,wn),s=[];for(let r of a){let c={input:r,model:e||"voyage-3-large",input_type:o==="query"?"query":"document"};i&&(c.output_dimension=i);let u=await fetch("https://api.voyageai.com/v1/embeddings",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${n}`},body:JSON.stringify(c)});if(!u.ok){let l=await u.text();throw new Error(`Voyage embed failed: ${u.status} ${l}`)}let m=[...(await u.json()).data].sort((l,f)=>l.index-f.index);s.push(...m.map(l=>l.embedding))}return s}var wn,Yt=E(()=>{Y();wn=50});import{spawn as An}from"node:child_process";async function mt(t){if(!dt[t]){let e=lt[t];if(!e)throw new Error(`Unknown LLM provider: "${t}". Available: ${Object.keys(lt).join(", ")}`);let n=await e();dt[t]=n.chat}return dt[t]}async function jt(t){if(!ut[t]){let e=Gt[t];if(!e)throw new Error(`Unknown embedding provider: "${t}". Available: ${Object.keys(Gt).join(", ")}`);let n=await e();ut[t]=n.embedBatch}return ut[t]}function Kt(t,e){if(!t)return{provider:e,model:null};let n=t.indexOf(":");return n>0&&lt[t.slice(0,n)]?{provider:t.slice(0,n),model:t.slice(n+1)}:{provider:e,model:t}}async function Vt(){let t=d.llm.ollamaHost||d.embedding.ollamaHost||"http://localhost:11434";try{return(await fetch(`${t}/api/tags`,{signal:AbortSignal.timeout(2e3)})).ok}catch{return!1}}function bn(){return new Promise(t=>{let e=An("claude",["--version"],{stdio:"pipe"});e.on("error",()=>t(!1)),e.on("close",n=>t(n===0)),setTimeout(()=>{e.kill(),t(!1)},3e3)})}async function zt(){if(N)return N;if(d.llm.provider)return N=d.llm.provider,N;if(d.llm.apiKey)return N="anthropic",N;if(d.llm.openaiApiKey)return N="openai",N;if(await Vt())return N="ollama",N;if(await bn())return N="claude-cli",N;throw new Error(`No LLM provider available. Either:
  - Set LLM_PROVIDER (openai, anthropic, ollama, claude-cli)
  - Set ANTHROPIC_API_KEY or OPENAI_API_KEY
  - Start Ollama locally
  - Install the Claude CLI (claude)`)}async function Jt(){if(O)return O;if(d.embedding.provider)return O=d.embedding.provider,O;if(d.embedding.voyageApiKey)return O="voyage",O;if(await Vt())return O="ollama",O;if(d.embedding.openaiApiKey)return O="openai",O;throw new Error(`No embedding provider available. Either:
  - Set EMBEDDING_PROVIDER (voyage, ollama, openai)
  - Set VOYAGE_API_KEY (recommended \u2014 best quality)
  - Start Ollama locally
  - Set OPENAI_API_KEY`)}var lt,Gt,dt,ut,N,O,ft=E(()=>{w();lt={openai:()=>Promise.resolve().then(()=>(Ot(),It)),anthropic:()=>Promise.resolve().then(()=>(Mt(),vt)),"claude-cli":()=>Promise.resolve().then(()=>(kt(),xt)),ollama:()=>Promise.resolve().then(()=>(Ft(),Pt))},Gt={ollama:()=>Promise.resolve().then(()=>(Bt(),Ht)),openai:()=>Promise.resolve().then(()=>(Ut(),Wt)),voyage:()=>Promise.resolve().then(()=>(Yt(),$t))},dt={},ut={};N=null,O=null});function C(t){return t?`[${t.join(",")}]`:null}var v=E(()=>{});import{createHash as Nn}from"node:crypto";function In(t,e,n,o="document"){let i=Nn("sha256");return i.update(t),i.update("\0"),i.update(e),i.update("\0"),i.update(o),i.update("\0"),i.update(n),i.digest("hex")}async function On(t){if(!t.length)return new Map;let e=await h("embedding_cache").whereIn("key",t).select("key","embedding");return new Map(e.map(n=>[n.key,Rn(n.embedding)]))}function Rn(t){return Array.isArray(t)||typeof t!="string"?t:(t.startsWith("[")?t.slice(1,-1):t).split(",").map(Number)}async function Cn(t){t.length&&await h("embedding_cache").whereIn("key",t).update({hits:h.raw("hits + 1"),lastUsedAt:h.fn.now()})}async function Ln(t,e,n){if(t.length){for(let{key:o,embedding:i}of t)await h.raw(`
      INSERT INTO embedding_cache (key, provider, model, embedding, hits, created_at, last_used_at)
      VALUES (?, ?, ?, ?, 0, NOW(), NOW())
      ON CONFLICT (key) DO UPDATE
        SET last_used_at = NOW(),
            hits = embedding_cache.hits + 1
    `,[o,e,n,C(i)]);await vn()}}async function vn(){let t=Date.now();if(t-Xt<Dn)return;Xt=t;let[{count:e}]=await h("embedding_cache").count("key as count"),n=Number(e);if(n<=qt)return;let o=Math.min(n-qt,Tn);await h.raw(`
    DELETE FROM embedding_cache WHERE key IN (
      SELECT key FROM embedding_cache ORDER BY last_used_at ASC LIMIT ?
    )
  `,[o])}async function Zt(t,e,n,o,i,a={}){if(!t.length)return[];let s=a.inputType||i?.inputType||"document",r=t.map(f=>In(e,n,f,s)),c=await On(r),u=[],_=[],m=new Array(t.length);for(let f=0;f<t.length;f++){let p=c.get(r[f]);p?m[f]=p:(u.push(t[f]),_.push(f))}if(u.length){let f=await o(u,i),p=[];for(let y=0;y<u.length;y++){let b=_[y];m[b]=f[y],p.push({key:r[b],embedding:f[y]})}Ln(p,e,n).catch(y=>{process.stderr.write(`[embedding-cache] store failed: ${y.message}
`)})}let l=r.filter(f=>c.has(f));return l.length&&Cn(l).catch(()=>{}),m}var qt,Tn,Xt,Dn,Qt=E(()=>{v();S();qt=1e4,Tn=500;Xt=0,Dn=6e4});async function pt(t,e={}){let[n]=await V([t],e);return n}async function V(t,{inputType:e="document"}={}){if(!t.length)return[];let n=await Jt(),o=await jt(n),i=d.embedding.model,a={...d.embedding,inputType:e};return Zt(t,n,i,o,a,{inputType:e})}var or,ht=E(()=>{w();ft();Qt();({dimensions:or}=d.embedding)});async function te(t,e){let n=e||d.defaults.namespace,o=t.toLowerCase();return h("entity").where({namespace:n}).whereNull("mergedWith").where(function(){this.whereRaw("LOWER(name) = ?",[o]).orWhereRaw("aliases @> ARRAY[?]::text[]",[o])}).first()||null}async function ee(t,{entityType:e,namespace:n,limit:o=10}={}){let i=h("entity").whereRaw("LOWER(name) LIKE ?",[`%${t.toLowerCase()}%`]).whereNull("mergedWith").orderBy("mentionCount","desc").limit(o);return e&&i.where({entityType:e}),n&&i.where({namespace:n}),i}var ne=E(()=>{S();v();w()});var oe=E(()=>{S();w()});var re=E(()=>{S();oe()});async function ie(t,{limit:e=50}={}){return h("fact").join("fact_entity","fact.id","fact_entity.fact_id").where("fact_entity.entity_id",t).where("fact.status","active").select("fact.*","fact_entity.mention_count as entityMentionCount").orderBy("fact_entity.mention_count","desc").limit(e)}async function H(t){if(!t.length)return new Map;let e=await h("fact_entity").whereIn("factId",t).select("factId","entityId"),n=new Map;for(let o of e)n.has(o.factId)||n.set(o.factId,[]),n.get(o.factId).push(o.entityId);return n}var z=E(()=>{S();re()});async function ae(t){let e=await zt();return Kt(t,e)}async function Et(t,{model:e,caller:n}={}){let{provider:o,model:i}=await ae(e),a=await mt(o),s=Date.now();try{let r=await st(()=>a(t,{model:i,jsonMode:!1}),d.llm.maxRetries),c=r.cost||at(r.model,r.inputTokens,r.outputTokens);return P({provider:o,model:r.model,caller:n,input:t,response:r.text,inputTokens:r.inputTokens,outputTokens:r.outputTokens,cost:c,durationMs:Date.now()-s,status:"success"}),r.text}catch(r){throw P({provider:o,model:i,caller:n,input:t,response:null,inputTokens:0,outputTokens:0,cost:0,durationMs:Date.now()-s,status:"error",error:r.message}),r}}async function J(t,{model:e,caller:n}={}){let{provider:o,model:i}=await ae(e),a=await mt(o),s=Date.now();try{let r=await st(()=>a(t,{model:i,jsonMode:!0}),d.llm.maxRetries),c=r.cost||at(r.model,r.inputTokens,r.outputTokens);return P({provider:o,model:r.model,caller:n,input:t,response:r.text,inputTokens:r.inputTokens,outputTokens:r.outputTokens,cost:c,durationMs:Date.now()-s,status:"success"}),xn(r.text)}catch(r){throw P({provider:o,model:i,caller:n,input:t,response:null,inputTokens:0,outputTokens:0,cost:0,durationMs:Date.now()-s,status:"error",error:r.message}),r}}function xn(t){try{return JSON.parse(t.trim())}catch{}let e=t.match(/```(?:json)?\s*([\s\S]*?)```/);if(e)try{return JSON.parse(e[1].trim())}catch{}let n=t.match(/[\[{][\s\S]*[\]}]/);if(n)try{return JSON.parse(n[0])}catch{}return null}var B=E(()=>{w();ft();F()});import{fileURLToPath as kn}from"node:url";import{dirname as se,join as q}from"node:path";import{existsSync as ce}from"node:fs";function Pn(){let t=se(kn(import.meta.url));for(let e=0;e<10;e++){if(ce(q(t,"package.json"))&&ce(q(t,"prompts")))return t;let n=se(t);if(n===t)break;t=n}return process.cwd()}var de,X,Tr,_t=E(()=>{de=Pn(),X=q(de,"prompts"),Tr=q(de,"src","db","migrations")});import Fn from"node:path";async function ue(t){t.length&&await h.raw(`UPDATE fact_lifecycle
     SET access_count = access_count + 1,
         last_accessed_at = NOW(),
         stage = CASE WHEN stage = 'stable' THEN 'editing' ELSE stage END,
         stage_entered_at = CASE WHEN stage = 'stable' THEN NOW() ELSE stage_entered_at END
     WHERE fact_id = ANY(?)`,[t])}var xr,kr,Pr,le=E(()=>{S();ht();B();v();w();_t();xr=Fn.join(X,"audm-decision.md"),kr=d.memory.skipThreshold,Pr=d.memory.ambiguousThreshold});async function me(t){if(!t||t.length<2)return;let e=[...new Set(t.filter(a=>Number.isInteger(a)))].sort((a,s)=>a-s);if(e.length<2)return;let n=[];for(let a=0;a<e.length;a++)for(let s=a+1;s<e.length;s++)n.push([e[a],e[s]]);let o=n.map(()=>"(?, ?, 1, NOW(), NOW())").join(", "),i=n.flat();await h.raw(`
    INSERT INTO hebbian_edge (fact_a_id, fact_b_id, strength, first_seen_at, last_seen_at)
    VALUES ${o}
    ON CONFLICT (fact_a_id, fact_b_id)
    DO UPDATE SET
      strength = hebbian_edge.strength + 1,
      last_seen_at = NOW()
  `,i)}var fe=E(()=>{S()});var pe={};T(pe,{consolidateEntityCoRetrievalEdges:()=>Wn,getCoRetrievedEntities:()=>Bn,getEdgeStrengthsForRanking:()=>gt,getEntityHebbianStats:()=>Un,strengthenEntityEdges:()=>yt});function Z(t){return Hn/Math.max(t,1)}async function yt(t,e={}){if(!d.hebbian.entity.enabled||!t||t.length<2)return;let n=e.eta??d.hebbian.entity.eta,o=e.cap??d.hebbian.entity.cap,i=[...new Set(t.filter(c=>Number.isInteger(c)))].sort((c,u)=>c-u);if(i.length<2)return;let a=[];for(let c=0;c<i.length;c++)for(let u=c+1;u<i.length;u++)a.push([i[c],i[u]]);let s=a.map(()=>"(?, ?, ?, NOW(), NOW())").join(", "),r=a.flatMap(([c,u])=>[c,u,n]);await h.raw(`
    INSERT INTO entity_hebbian_edge (entity_a_id, entity_b_id, strength, first_seen_at, last_seen_at)
    VALUES ${s}
    ON CONFLICT (entity_a_id, entity_b_id)
    DO UPDATE SET
      strength = LEAST(entity_hebbian_edge.strength + ?, ?),
      last_seen_at = NOW()
  `,[...r,n,o])}async function Bn(t,e={}){if(!d.hebbian.entity.enabled)return[];let n=e.limit??10,o=e.minEffectiveStrength??d.hebbian.entity.minEffective,i=Z(e.halfLifeDays??d.hebbian.entity.halfLifeDays),{rows:a}=await h.raw(`
    SELECT
      CASE WHEN entity_a_id = ? THEN entity_b_id ELSE entity_a_id END AS "partnerId",
      (strength * EXP(-1.0 * ?::float8 * EXTRACT(EPOCH FROM (NOW() - last_seen_at)) / 86400.0))::float8 AS "effectiveStrength",
      strength::float8 AS "rawStrength",
      last_seen_at AS "lastSeenAt"
    FROM entity_hebbian_edge
    WHERE entity_a_id = ? OR entity_b_id = ?
    ORDER BY "effectiveStrength" DESC
    LIMIT ?
  `,[t,i,t,t,n*3]);return a.filter(s=>s.effectiveStrength>=o).slice(0,n)}async function gt(t,e,n={}){if(!d.hebbian.entity.enabled)return new Map;if(!t.length||!e.length)return new Map;let o=Z(n.halfLifeDays??d.hebbian.entity.halfLifeDays),i=[...new Set(t)],a=[...new Set(e)].filter(c=>!i.includes(c));if(!a.length)return new Map;let{rows:s}=await h.raw(`
    SELECT
      CASE
        WHEN entity_a_id = ANY(?::bigint[]) THEN entity_b_id
        ELSE entity_a_id
      END AS "candidateId",
      SUM(strength * EXP(-1.0 * ?::float8 * EXTRACT(EPOCH FROM (NOW() - last_seen_at)) / 86400.0))::float8 AS "summedStrength"
    FROM entity_hebbian_edge
    WHERE
      (entity_a_id = ANY(?::bigint[]) AND entity_b_id = ANY(?::bigint[]))
      OR
      (entity_b_id = ANY(?::bigint[]) AND entity_a_id = ANY(?::bigint[]))
    GROUP BY "candidateId"
  `,[i,o,i,a,i,a]),r=new Map;for(let c of s)r.set(Number(c.candidateId),c.summedStrength);return r}async function Wn({floor:t=.5,decayDays:e=90}={}){let n=Z(d.hebbian.entity.halfLifeDays),{rows:o}=await h.raw(`
    DELETE FROM entity_hebbian_edge
    WHERE (strength * EXP(-1.0 * ?::float8 * EXTRACT(EPOCH FROM (NOW() - last_seen_at)) / 86400.0)) <= ?
      AND last_seen_at < NOW() - (INTERVAL '1 day' * ?)
    RETURNING entity_a_id
  `,[n,t,e]);return o.length}async function Un({topN:t=5}={}){let e=Z(d.hebbian.entity.halfLifeDays),n=await h.raw(`
    SELECT
      COUNT(*)::int AS "edgeCount",
      COALESCE(AVG(strength)::float8, 0) AS "avgStrength",
      COALESCE(MAX(strength)::float8, 0) AS "maxStrength"
    FROM entity_hebbian_edge
  `),o=await h.raw(`
    SELECT
      ea.name AS "aName",
      eb.name AS "bName",
      strength::float8 AS "strength",
      (strength * EXP(-1.0 * ?::float8 * EXTRACT(EPOCH FROM (NOW() - last_seen_at)) / 86400.0))::float8 AS "decayed"
    FROM entity_hebbian_edge
    JOIN entity ea ON ea.id = entity_a_id
    JOIN entity eb ON eb.id = entity_b_id
    ORDER BY "decayed" DESC
    LIMIT ?
  `,[e,t]);return{edgeCount:n.rows[0]?.edgeCount??0,avgStrength:n.rows[0]?.avgStrength??0,maxStrength:n.rows[0]?.maxStrength??0,topPairs:o.rows??[]}}var Hn,wt=E(()=>{S();w();Hn=Math.log(2)});async function he(t,{direction:e="both",relationType:n,limit:o=50}={}){let i=r=>{let c=r==="outgoing"?"source_id":"target_id",u=r==="outgoing"?"target_id":"source_id";return h.raw(`
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
    `,n?[t,n,o]:[t,o])};if(e==="outgoing"){let{rows:r}=await i("outgoing");return r}if(e==="incoming"){let{rows:r}=await i("incoming");return r}let[a,s]=await Promise.all([i("outgoing"),i("incoming")]);return[...a.rows,...s.rows]}var Ee=E(()=>{S()});function Q({minConfidence:t="medium",pointInTime:e,categories:n}){let o=$n[t]??1,i=[o],a="",s="";return e&&(a="AND valid_from <= ? AND (valid_until IS NULL OR valid_until > ?)",i.push(e,e)),n?.length&&(s="AND category = ANY(?)",i.push(n)),{minRank:o,temporalClause:a,categoryClause:s,filterParams:i}}var $n,W,tt=E(()=>{$n={low:0,medium:1,high:2},W=`CASE confidence
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 1
            ELSE 0
          END`});async function _e(t,{namespaces:e,limit:n=20}){let o=C(t),{rows:i}=await h.raw(`
    SELECT id, document_id AS "documentId", chunk_index AS "chunkIndex",
           content, section_heading AS "sectionHeading", namespace,
           1 - (embedding <=> ?) as similarity
    FROM chunk
    WHERE namespace = ANY(?)
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ?
    LIMIT ?
  `,[o,e,o,n]);return i}var ye=E(()=>{S();v();w();tt()});async function ge(t,{namespaces:e,limit:n=20}){let{rows:o}=await h.raw(`
    SELECT id, document_id AS "documentId", chunk_index AS "chunkIndex",
           content, section_heading AS "sectionHeading", namespace,
           ts_rank(search_vector, plainto_tsquery('english', ?)) as rank
    FROM chunk
    WHERE namespace = ANY(?)
      AND search_vector @@ plainto_tsquery('english', ?)
    ORDER BY rank DESC
    LIMIT ?
  `,[t,e,t,n]);return o}var we=E(()=>{S();tt()});async function Ae(t,e,{namespaces:n,limit:o=5,minConfidence:i="medium",pointInTime:a,categories:s}){let r=C(e),{temporalClause:c,categoryClause:u,filterParams:_}=Q({minConfidence:i,pointInTime:a,categories:s}),m=o*Vn,[l,...f]=_,p=[r,r,n,l,...f,r,m],y=[t,t,n,l,t,...f,m],b=[m,m,o],R=`
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
        AND ${W} >= ?
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
        AND ${W} >= ?
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
               ${jn} * (1.0 / (${Se} + COALESCE(s.rank_ix, ?)))
             + ${Kn} * (1.0 / (${Se} + COALESCE(k.rank_ix, ?)))
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
             CASE f.importance WHEN 'vital' THEN ${zn} ELSE 1.0 END AS importance_mult,
             CASE f.confidence
               WHEN 'high'   THEN ${Jn}
               WHEN 'medium' THEN ${qn}
               WHEN 'low'    THEN ${Xn}
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
  `,nt=[...p,...y,...b],{rows:D}=await h.raw(R,nt);if(!D.length)return[];let g=D[0].final_score||D[0].rrf_raw||1;return D.map(x=>({...x,rrfScore:Math.round(Number(x.final_score||x.rrf_raw)/Number(g)*100)/100}))}var Se,jn,Kn,Vn,zn,Jn,qn,Xn,be=E(()=>{S();v();w();tt();Se=20,jn=1,Kn=.7,Vn=3,zn=1.5,Jn=1,qn=.85,Xn=.7});async function Ne(t){let e=t.map(i=>i.id),n=await H(e),o=new Set;for(let i of n.values())for(let a of i)o.add(a);return o.size?h("entity").whereIn("id",[...o]).whereNull("mergedWith").select("id","uid","name","entityType","description"):[]}async function Te(t,{limit:e=10}={}){if(!t.length)return[];let n=await h("relation").where(function(){this.whereIn("sourceId",t).orWhereIn("targetId",t)}).whereNull("invalidAt").select("*").limit(e*3),o=new Set(t),i=new Set,a=new Map;for(let m of n){let l=o.has(m.sourceId)?m.targetId:m.sourceId;i.add(l),a.has(l)||a.set(l,m)}if(!i.size)return[];let s=await h("entity").whereIn("id",[...i]).whereNull("mergedWith").select("id","name"),r=new Map(s.map(m=>[m.id,m.name])),c=await h("fact").join("fact_entity","fact.id","fact_entity.factId").whereIn("fact_entity.entityId",[...i]).where("fact.status","active").select("fact.*","fact_entity.entityId").orderBy("fact_entity.mentionCount","desc").limit(e*3),u=new Set,_=[];for(let m of c){if(u.has(m.id))continue;u.add(m.id);let l=a.get(m.entityId),f=r.get(m.entityId)||"unknown",p=l?.relationType||"related";if(_.push({...m,relationPath:`${f} (${p})`,graphDistance:1}),_.length>=e)break}return _}function Ie(t,e,n,o){let i=new Set(n),a=t.map(r=>({...r,resultType:"direct"})),s=e.filter(r=>!t.some(c=>c.id===r.id)).map(r=>({...r,rrfScore:(r.rrfScore||.1)*.5,resultType:"related"}));return[...a,...s].slice(0,o)}var Oe=E(()=>{S();z()});var M,St=E(()=>{M=class{#t=new Map;#e;#n;constructor({maxSize:e=100,ttlMs:n=300*1e3}={}){this.#e=e,this.#n=n}get(e){let n=this.#t.get(e);if(n){if(Date.now()-n.timestamp>this.#n){this.#t.delete(e);return}return n.value}}set(e,n){if(this.#t.size>=this.#e){let o=this.#t.keys().next().value;this.#t.delete(o)}this.#t.set(e,{value:n,timestamp:Date.now()})}}});async function Ce(t){let e=Re.get(t);if(e)return e;let n=`You are a search query expander for a personal knowledge base.

Given the user's query, generate 3-5 alternative search queries that would help find ALL relevant information \u2014 including facts that don't literally match the query but are semantically related.

Think about:
- Synonyms and rephrased versions
- Inverse/negative framings (if someone asks "what should I use", also search for "what to avoid")
- Related concepts that would inform the answer
- Specific terms someone might have used when storing this knowledge

User query: "${t}"

Respond with ONLY a JSON array of strings. Do not include the original query.`;try{let o=await J(n,{model:d.llm.extractionModel,caller:"query-expander"});if(!Array.isArray(o))return[t];let i=o.filter(s=>typeof s=="string"&&s.trim()).slice(0,Zn),a=i.length?[t,...i]:[t];return Re.set(t,a),a}catch(o){return console.error("[query-expander] Failed:",o.message),[t]}}var Zn,Re,Le=E(()=>{B();St();w();Zn=5,Re=new M({maxSize:100,ttlMs:300*1e3})});import{readFile as Qn}from"node:fs/promises";import{join as to}from"node:path";async function Me(t){let e=t.trim().toLowerCase(),n=At.get(e);if(n)return n;let i=`${await Qn(eo,"utf8")}

---

Query: ${t}

---

Respond with ONLY a JSON object: { "intent": "preference|factual|entity_lookup|exploratory|temporal", "categories": [...], "entities": [...], "expand": bool, "pointInTime": null or "YYYY-MM-DD", "reasoning": "..." }`;try{let a=await J(i,{model:d.llm.extractionModel,caller:"query-router"});if(!a||!no.includes(a.intent)){let c=De("factual",{});return At.set(e,c),c}let s=ve[a.intent],r={intent:a.intent,categories:Array.isArray(a.categories)&&a.categories.length?a.categories:s.categories,entities:Array.isArray(a.entities)?a.entities:[],expand:typeof a.expand=="boolean"?a.expand:s.expand,useGraph:s.useGraph,limit:s.limit,pointInTime:a.pointInTime||null,reasoning:a.reasoning||""};return At.set(e,r),r}catch(a){return console.error("[query-router] Failed:",a.message),De("factual",{reasoning:`Fallback \u2014 ${a.message}`})}}function De(t,e={}){let n=ve[t];return{intent:t,categories:n.categories,entities:[],expand:n.expand,useGraph:n.useGraph,limit:n.limit,pointInTime:null,reasoning:"",...e}}var eo,At,no,ve,xe=E(()=>{B();St();w();_t();eo=to(X,"query-router.md"),At=new M({maxSize:200,ttlMs:600*1e3}),no=["preference","factual","entity_lookup","exploratory","temporal"],ve={preference:{categories:["preference","opinion","personal"],expand:!1,useGraph:!1,limit:null},factual:{categories:[],expand:!1,useGraph:!1,limit:null},entity_lookup:{categories:[],expand:!1,useGraph:!0,limit:null},exploratory:{categories:[],expand:!0,useGraph:!0,limit:15},temporal:{categories:[],expand:!1,useGraph:!1,limit:null}}});var Fe={};T(Fe,{search:()=>ao});async function ao(t,{namespaces:e,limit:n=5,minConfidence:o="medium",useGraph:i=!1,includeChunks:a=!1,pointInTime:s,expand:r=!1,route:c=!0,categories:u,synthesize:_=d.search.synthesize}={}){_&&(a=!0);let m=null;c&&(m=await Me(t),i=i||m.useGraph,r=r||m.expand,n=m.limit||n,s=s||m.pointInTime,u=u||(m.categories.length?m.categories:void 0));let l=await uo(t,e),f;l?f=await lo(l,t,{namespaces:e,limit:n,minConfidence:o,includeChunks:a,pointInTime:s,categories:u}):f=await po(t,{namespaces:e,limit:n,minConfidence:o,useGraph:i,includeChunks:a,pointInTime:s,expand:r,categories:u});let p=f.facts.map(y=>y.id).filter(Boolean);if(ue(p).catch(y=>console.error("[access-tracking]",y.message)),me(p.slice(0,8)).catch(y=>console.error("[hebbian]",y.message)),d.hebbian.entity.enabled&&p.length>=2&&co(p).catch(y=>console.error("[hebbian-entity]",y.message)),_)try{f.synthesized=await so(t,f)}catch(y){console.error("[synthesizer] failed:",y.message),f.synthesized=null}return f}async function so(t,{facts:e,chunks:n}){let o=[];if(e.slice(0,10).forEach((s,r)=>{o.push(`[F${r+1}] (${s.category}) ${s.content}`)}),n.length&&n.slice(0,15).forEach((s,r)=>{let c=(s.content||"").replace(/\s+/g," ").trim();c&&o.push(`[C${r+1}] ${c.slice(0,2e3)}`)}),!o.length)return"No retrieved evidence \u2014 nothing to synthesize.";let i=`You are answering a question from a personal-memory system.
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
- Plain text only, no headers. Direct answer first, then a short justification if needed. 1-4 sentences total.`,a=d.search.synthesizeModel||d.llm.extractionModel||void 0;return Et(i,{model:a,caller:"synthesizer"})}async function co(t){let e=await H(t.slice(0,8)),n=[];for(let i of e.values())for(let a of i)n.push(a);let o=[...new Set(n)].slice(0,d.hebbian.entity.maxWriteEntities);await yt(o)}async function uo(t,e){if(t.length<2||t.length>io)return null;let n=e[0]||d.defaults.namespace,o=await te(t,n);return o||(await ee(t,{namespace:n,limit:1}))[0]||null}async function lo(t,e,{namespaces:n,limit:o,minConfidence:i,includeChunks:a,pointInTime:s,categories:r}){let c=mo(e,t),u=await V(c,{inputType:"query"}),[_,m,...l]=await Promise.all([ie(t.id,{limit:o}),he(t.id,{limit:15}),...c.map((g,x)=>Pe(g,{queryEmbedding:u[x],namespaces:n,limit:o,minConfidence:i,includeChunks:a,pointInTime:s,categories:r}))]),f=_.map(g=>({...g,source:"entity"})),p=et(l.map(g=>g.facts),o*2),y=new Set(f.map(g=>g.id)),b=p.filter(g=>!y.has(g.id)).map(g=>({...g,source:"search"})),R=[...f,...b].slice(0,o);if(d.hebbian.entity.enabled&&R.length>=2)try{R=await ke(R,{seedEntityIds:[t.id]})}catch(g){console.error("[hebbian-entity-boost]",g.message)}let nt=a?et(l.map(g=>g.chunks||[]),o):[],D=m.map(g=>({id:g.entityId,name:g.name,type:g.entityType,relation:g.relationType,direction:g.direction,mentions:g.mentionCount}));return{facts:R,chunks:nt,matchedEntity:{id:t.id,name:t.name,type:t.entityType,mentions:t.mentionCount,description:t.description||null,aliases:t.aliases||[]},relatedEntities:D}}function mo(t,e){let n=[t],o=(e.aliases||[]).filter(s=>typeof s=="string"&&s.trim());if(!o.length)return n;let i=(e.name||"").trim(),a=new Set([t.toLowerCase()]);for(let s of o){let r=t;if(i){let c=new RegExp(`\\b${fo(i)}\\b`,"gi");if(c.test(r))r=r.replace(c,s);else{a.has(s.toLowerCase())||(n.push(s),a.add(s.toLowerCase()));continue}}a.has(r.toLowerCase())||(n.push(r),a.add(r.toLowerCase()))}return n}function fo(t){return t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}async function po(t,{namespaces:e,limit:n,minConfidence:o,useGraph:i,includeChunks:a,pointInTime:s,expand:r=!1,categories:c}){let u=r?await Ce(t):[t],_=await V(u,{inputType:"query"}),m=await Promise.all(u.map((p,y)=>Pe(p,{queryEmbedding:_[y],namespaces:e,limit:n,minConfidence:o,includeChunks:a,pointInTime:s,categories:c}))),l=et(m.map(p=>p.facts),n);if(l=l.map(p=>({...p,source:"search"})),d.hebbian.entity.enabled&&l.length>=2)try{l=await ke(l)}catch(p){console.error("[hebbian-entity-boost]",p.message)}if(i&&l.length)try{let p=await Ne(l.slice(0,5));if(p.length){let y=await ho(p.map(R=>R.id)),b=await Te(y,{limit:5});l=Ie(l,b,y,n)}}catch(p){console.error("[graph-enhancement] Failed:",p.message)}let f=a?et(m.map(p=>p.chunks),n):[];return{facts:l,chunks:f,matchedEntity:null,relatedEntities:[]}}async function ke(t,e={}){let n=t.map(l=>l.id).filter(Boolean);if(n.length<2)return t;let o=await H(n);if(!o.size)return t;let i,a;if(e.seedEntityIds?.length)i=e.seedEntityIds,a=t;else{let l=e.seedFactCount??3,f=[];for(let p of t.slice(0,l)){let y=o.get(p.id)||[];for(let b of y)f.push(b)}i=f,a=t.slice(l)}if(!i.length)return t;let s=new Set;for(let l of a){let f=o.get(l.id)||[];for(let p of f)s.add(p)}if(!s.size)return t;let r=await gt([...new Set(i)],[...s]);if(!r.size)return t;let c=new Map,u=0;for(let l of t){let f=o.get(l.id)||[],p=0;for(let y of f){let b=r.get(y)||0;b>p&&(p=b)}c.set(l.id,p),p>u&&(u=p)}if(u===0)return t;let _=d.hebbian.entity.rrfWeight;return t.map(l=>{let f=(c.get(l.id)||0)/u,p=(l.rrfScore||0)+_*f;return{...l,rrfScore:Math.round(p*100)/100,coRetrievalBoost:Math.round(f*100)/100}}).sort((l,f)=>(f.rrfScore||0)-(l.rrfScore||0))}async function ho(t){let e=d.hebbian.entity.expandPerSeed;if(!e||!t.length)return t;let{getCoRetrievedEntities:n}=await Promise.resolve().then(()=>(wt(),pe)),o=await Promise.all(t.map(a=>n(a,{limit:e}).catch(()=>[]))),i=new Set(t);for(let a of o)for(let s of a)i.add(Number(s.partnerId));return[...i]}function et(t,e){let n={},o={};for(let s of t)for(let[r,c]of s.entries())o[c.id]=c,n[c.id]=(n[c.id]||0)+1/(bt+r+1);let i=Object.entries(n).sort(([,s],[,r])=>r-s),a=i.length?i[0][1]:1;return i.slice(0,e).map(([s,r])=>({...o[s],rrfScore:Math.round(r/a*100)/100}))}async function Pe(t,{queryEmbedding:e,namespaces:n,limit:o,minConfidence:i,includeChunks:a=!1,pointInTime:s,categories:r}){let c=e||await pt(t,{inputType:"query"}),u=Ae(t,c,{namespaces:n,limit:o,minConfidence:i,pointInTime:s,categories:r}),_=a?[_e(c,{namespaces:n,limit:o}),ge(t,{namespaces:n,limit:o})]:[],[m,...l]=await Promise.all([u,..._]),f=a&&l.length===2?Eo(l[0],l[1],o):[];return{facts:m,chunks:f}}function Eo(t,e,n){let o={},i={...ot(t,"id"),...ot(e,"id")};t.forEach((r,c)=>{o[r.id]=(o[r.id]||0)+oo/(bt+c+1)}),e.forEach((r,c)=>{o[r.id]=(o[r.id]||0)+ro/(bt+c+1)});let a=Object.entries(o).sort(([r,c],[u,_])=>{if(c!==_)return _-c;let m=i[r]?.importance==="vital"?1:0;return(i[u]?.importance==="vital"?1:0)-m}),s=a.length?a[0][1]:1;return a.slice(0,n).map(([r,c])=>({...i[r],rrfScore:Math.round(c/s*100)/100}))}var bt,oo,ro,io,He=E(()=>{Y();ht();w();ne();z();le();fe();wt();Ee();z();ye();we();be();Oe();Le();xe();B();bt=20,oo=1,ro=.7,io=60});import{resolve as _o,join as yo}from"node:path";import{existsSync as Be}from"node:fs";import{config as We}from"dotenv";var k="***MASKED***",Ge=[/\b(sk-(?:proj-|ant-)?[A-Za-z0-9_\-]{20,})\b/g,/\b(ghp_[A-Za-z0-9]{36,})\b/g,/\b(github_pat_[A-Za-z0-9_]{20,})\b/g,/\b(gho_[A-Za-z0-9]{36,})\b/g,/\b(glpat-[A-Za-z0-9_\-]{20,})\b/g,/\b(xox[baprs]-[A-Za-z0-9\-]{10,})\b/g,/\b(whsec_[A-Za-z0-9]{20,})\b/g,/\b(rk_(?:live|test)_[A-Za-z0-9]{20,})\b/g,/\b(AKIA[A-Z0-9]{16})\b/g,/\b(ASIA[A-Z0-9]{16})\b/g,/\b(eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,})\b/g,/\b([A-Za-z0-9]{24}\.[A-Za-z0-9_\-]{6}\.[A-Za-z0-9_\-]{27})\b/g,/\b(\d{8,12}:[A-Za-z0-9_\-]{35})\b/g],je=new RegExp(`\\b(api[_-]?key|api[_-]?secret|secret[_-]?key|secret|token|password|passwd|pwd|auth[_-]?token|access[_-]?token|refresh[_-]?token|bearer|private[_-]?key|client[_-]?secret)\\s*[=:]\\s*["']?([^\\s"']{8,})["']?`,"gi"),Ke=/(\w+:\/\/)([^:/\s]+):([^@\s]{3,})@/g,Ve=["DATABASE_URL","REDIS_URL","MONGODB_URI","MONGO_URI","POSTGRES_URL","DSN","CONNECTION_STRING","ENCRYPTION_KEY","JWT_SECRET","CORTEX_ENCRYPTION_KEY","SESSION_SECRET","WEBHOOK_SECRET"],ze=new RegExp(`\\b(${Ve.join("|")})\\s*[=:]\\s*["']?([^\\s"']+)["']?`,"gi");function Nt(t){if(!t||typeof t!="string")return t;let e=t;for(let n of Ge)e=e.replace(n,k);return e=e.replace(je,(n,o)=>`${o}=${k}`),e=e.replace(Ke,(n,o)=>`${o}${k}:${k}@`),e=e.replace(ze,(n,o)=>`${o}=${k}`),e}var go=process.env.HOME||process.env.USERPROFILE,Ue=yo(go,".sigil",".env"),$e=_o(process.cwd(),".env");Be($e)?We({path:$e,quiet:!0}):Be(Ue)&&We({path:Ue,quiet:!0});var wo=8,So=8;async function Ao(){let t=[];for await(let i of process.stdin)t.push(i);let e=Buffer.concat(t).toString("utf8").trim();if(!e)return U();let o=JSON.parse(e).prompt||"";if(o.length<wo)return U();try{let{search:i}=await Promise.resolve().then(()=>(He(),Fe)),a=(await Promise.resolve().then(()=>(w(),Tt))).default,{facts:s}=await i(o,{namespaces:[a.defaults.namespace],limit:So,useGraph:!1,route:!1,expand:!1,synthesize:!1});if(!s.length)return await(await Promise.resolve().then(()=>(S(),K))).default.destroy(),U();let r=Nt([`Sigil memory (${s.length} relevant facts):`,...s.map(u=>`- ${u.content}`)].join(`
`));return await(await Promise.resolve().then(()=>(S(),K))).default.destroy(),U(r)}catch(i){process.stderr.write(`[sigil:user-prompt-submit] ${i.message}
`);try{await(await Promise.resolve().then(()=>(S(),K))).default.destroy()}catch{}return U()}}function U(t){let e={hookSpecificOutput:{hookEventName:"UserPromptSubmit",...t&&{additionalContext:t}}};process.stdout.write(JSON.stringify(e))}Ao();
