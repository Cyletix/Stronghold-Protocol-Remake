'use strict';
// 独立传输实验，不加载或写入游戏状态、存档、音频。
const el=id=>document.getElementById(id);
let peer=null,channel=null,ready=false,generation=0;
const pending=new Map();
function log(s){el('log').textContent=(s+'\n'+el('log').textContent).slice(0,2500);}
function connected(on){el('ready').disabled=el('ping').disabled=!on;}
function reset(){generation++;if(channel)channel.close();if(peer)peer.close();peer=channel=null;ready=false;pending.clear();connected(false);el('out').value=el('in').value='';el('status').textContent='尚未连接';el('log').textContent='';}
function attach(dc){
  channel=dc;
  dc.onopen=()=>{connected(true);el('status').textContent='已连接';log('连接成功，可交换准备状态和测量延迟');};
  dc.onclose=()=>{connected(false);el('status').textContent='连接已关闭，请双方重置后重连';};
  dc.onerror=()=>log('数据通道错误，请双方重置后重试');
  dc.onmessage=event=>{
    if(typeof event.data!=='string'||event.data.length>1024)return;
    try{const m=JSON.parse(event.data);if(m.v!==1)return;
      if(m.type==='ping'&&typeof m.id==='string'&&m.id.length<80)dc.send(JSON.stringify({v:1,type:'pong',id:m.id}));
      if(m.type==='pong'&&pending.has(m.id)){log('往返延迟 '+Math.round(performance.now()-pending.get(m.id))+' ms');pending.delete(m.id);}
      if(m.type==='ready'&&typeof m.value==='boolean')log('对方'+(m.value?'已准备':'取消准备'));
    }catch{log('忽略无效消息');}
  };
}
function create(){
  if(peer)throw Error('请先重置，再创建新连接');
  const url=el('ice').value.trim(),iceServers=[];
  if(url){if(!/^(stun|stuns|turn|turns):[^\s]+$/.test(url))throw Error('服务器地址格式不正确');iceServers.push({urls:url,username:el('user').value,credential:el('password').value});}
  peer=new RTCPeerConnection({iceServers});const p=peer;
  p.ondatachannel=e=>attach(e.channel);
  p.onconnectionstatechange=()=>{if(p!==peer)return;el('status').textContent=({connected:'已连接',connecting:'正在连接',failed:'连接失败：检查网络或设置 TURN，然后双方重试',disconnected:'连接中断，正在等待恢复',closed:'连接已关闭'})[p.connectionState]||'等待对方';connected(p.connectionState==='connected'&&channel?.readyState==='open');};
  return p;
}
function read(type){const value=el('in').value;if(value.length>65536)throw Error('连接信息过长');const m=JSON.parse(value);if(m.v!==1||m.type!==type||typeof m.sdp!=='string')throw Error('连接信息类型或版本不正确');return {type:m.type,sdp:m.sdp};}
async function publish(p){
  await new Promise((resolve,reject)=>{
    const finish=error=>{clearTimeout(timer);p.removeEventListener('icegatheringstatechange',check);error?reject(error):resolve();};
    const check=()=>{if(p.iceGatheringState==='complete')finish();};
    const timer=setTimeout(()=>finish(Error('收集连接信息超时，请重置后重试')),12000);
    p.addEventListener('icegatheringstatechange',check);check();
  });
  if(p!==peer)return;
  el('out').value=JSON.stringify({v:1,type:p.localDescription.type,sdp:p.localDescription.sdp});el('status').textContent='连接信息已生成，请发给对方';
}
function action(id,fn){el(id).onclick=async()=>{const g=generation;el(id).disabled=true;try{await fn();}catch(e){if(g===generation)el('status').textContent='操作失败：'+e.message;}finally{el(id).disabled=false;}};}
action('offer',async()=>{const p=create();attach(p.createDataChannel('ark-net-lab-v1'));await p.setLocalDescription(await p.createOffer());await publish(p);});
action('answer',async()=>{const offer=read('offer'),p=create();await p.setRemoteDescription(offer);await p.setLocalDescription(await p.createAnswer());await publish(p);});
action('accept',async()=>{const answer=read('answer');if(!peer||peer.signalingState!=='have-local-offer')throw Error('请先生成邀请');await peer.setRemoteDescription(answer);});
action('ready',async()=>{if(channel?.readyState!=='open')throw Error('尚未连接');ready=!ready;channel.send(JSON.stringify({v:1,type:'ready',value:ready}));log('自己'+(ready?'已准备':'取消准备'));});
action('ping',async()=>{if(channel?.readyState!=='open')throw Error('尚未连接');if(pending.size>=10)throw Error('等待已有延迟探测完成');const id=crypto.randomUUID();pending.set(id,performance.now());channel.send(JSON.stringify({v:1,type:'ping',id}));setTimeout(()=>{if(pending.delete(id))log('延迟探测超时（5秒）');},5000);});
el('reset').onclick=reset;
window.addEventListener('pagehide',reset);
