import{e as d,c as g,a as m}from"./webrtc-DPg9_bmZ.js";const u=document.getElementById("out"),i=document.getElementById("status"),t=(n,a)=>{u.innerHTML+=`<span class="${n}">${a}</span>
`};function f(n){return new Promise(a=>{n.iceGatheringState==="complete"?a():(n.onicegatheringstatechange=()=>{n.iceGatheringState==="complete"&&a()},setTimeout(a,3e3))})}async function S(){i.textContent="Step 1/5",t("step","=== Step 1: 生成原生 offer + 等待 ICE ===");const n=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});n.createDataChannel("game");const a=await n.createOffer();await n.setLocalDescription(a),await f(n);const r=n.localDescription.sdp;t("ok","✅ 原生 offer (长度 "+r.length+")"),t("s","--- 原始 SDP ---"),t("",r),t("s","--- SDP 中 candidate 行 ---"),r.split(`
`).filter(e=>e.startsWith("a=candidate")).forEach(e=>t("",e)),t("s",`候选行总计: ${r.split(`
`).filter(e=>e.startsWith("a=candidate")).length}`),i.textContent="Step 2/5",t("step",`
=== Step 2: extractFields ===`);let s;try{s=d(r),t("ok",`✅ u=${s.u} w=${s.w.substring(0,8)}... s=${s.s} p=${s.p} candidates=${s.c.length}`),s.c.forEach((e,l)=>t("",`  [${l}] ${e}`)),s.c.length===0&&t("err","⚠ candidates 为空！")}catch(e){t("err","❌ extractFields 抛异常: "+e.message);return}i.textContent="Step 3/5",t("step",`
=== Step 3: createTemplateSdp ===`);const c=await g();t("ok","✅ 模板 (长度 "+c.length+")"),t("s","--- 模板 SDP ---"),t("",c),t("s",`模板候选行总计: ${c.split(`
`).filter(e=>e.startsWith("a=candidate")).length}`),i.textContent="Step 4/5",t("step",`
=== Step 4: applyFields ===`);let o;try{o=m(c,s),t("ok","✅ 重建 SDP (长度 "+o.length+")"),t("s","--- 重建 SDP ---"),t("",o),t("s",`重建候选行总计: ${o.split(`
`).filter(e=>e.startsWith("a=candidate")).length}`)}catch(e){t("err","❌ applyFields 抛异常: "+e.message);return}i.textContent="Step 5/5",t("step",`
=== Step 5: setRemoteDescription ===`);const p=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});p.ondatachannel=()=>{};try{await p.setRemoteDescription(new RTCSessionDescription({type:"offer",sdp:o})),t("ok","✅ setRemoteDescription 成功！全链路通过！")}catch(e){const l=e.message;t("err","❌ setRemoteDescription 失败:"),t("err","   "+l),t("err",'   <button id="diag-copy" style="margin-left:6px;cursor:pointer;background:#333;color:#ff0;border:1px solid #ff0;border-radius:4px;padding:4px 10px;font-size:13px;">📋 复制完整错误</button>'),setTimeout(()=>{document.getElementById("diag-copy")?.addEventListener("click",()=>{navigator.clipboard.writeText(l+`

--- original SDP ---
`+r+`

--- template SDP ---
`+c+`

--- rebuilt SDP ---
`+o)})},0)}p.close(),n.close(),i.textContent="完成"}S().catch(n=>{t("err","FATAL: "+n.message),i.textContent="失败"});
