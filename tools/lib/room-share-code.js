'use strict';
const crypto=require('node:crypto');
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function checksum(payload){const n=crypto.createHash('sha256').update('ark-share-check-v1:'+payload).digest().readUInt16BE(0);return ALPHABET[(n>>5)&31]+ALPHABET[n&31];}
function format(payload){return 'WS1-'+payload.match(/.{4}/g).join('-')+'-'+checksum(payload);}
function createShareCode(){return format(Array.from({length:16},()=>ALPHABET[crypto.randomInt(32)]).join(''));}
function normalizeShareCode(input){
 if(typeof input!=='string'||input.length>100)throw Error('请粘贴完整分享码。');
 const compact=input.toUpperCase().replace(/[\s-]/g,'');
 if(!/^WS1[A-HJ-NP-Z2-9]{18}$/.test(compact))throw Error('分享码格式不正确，请复制以 WS1 开头的完整分享码。');
 const payload=compact.slice(3,19);if(compact.slice(19)!==checksum(payload))throw Error('分享码校验未通过，请重新复制，检查是否漏字或输错。');
 return format(payload);
}
function configFromShareCode(input,peers){
 const shareCode=normalizeShareCode(input),derive=purpose=>crypto.createHash('sha256').update('ark-share-v1:'+purpose+':'+shareCode).digest();
 return {version:1,role:'ask',hostIPv4:'10.126.126.1',peers,networkName:'ark-room-'+derive('name').toString('hex').slice(0,16),networkSecret:derive('secret').toString('hex'),roomCode:[...derive('lobby').subarray(0,6)].map(n=>ALPHABET[n&31]).join('')};
}
module.exports={createShareCode,normalizeShareCode,configFromShareCode};
