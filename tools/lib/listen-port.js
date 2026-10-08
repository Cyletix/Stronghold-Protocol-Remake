'use strict';

function listenOnce(server,port,host){
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{server.off('error',failed);server.off('listening',ready);};
    const failed=error=>{cleanup();reject(error);};
    const ready=()=>{cleanup();resolve(server.address().port);};
    server.once('error',failed);server.once('listening',ready);
    try{server.listen(port,host);}catch(error){failed(error);}
  });
}

// Bind the final server itself: probing and releasing a port leaves a race.
// Windows may reserve a whole range, so nearby retries also need a port-0 exit.
async function listenOnAvailablePort(server,{port=0,host='127.0.0.1',attempts=20}={}){
  if(!Number.isInteger(port)||port<0||port>65535)throw new RangeError('端口须为 0～65535 的整数。');
  if(!Number.isInteger(attempts)||attempts<1)throw new RangeError('端口尝试次数须为正整数。');
  if(port!==0){
    for(let offset=0;offset<attempts&&port+offset<=65535;offset++){
      try{return await listenOnce(server,port+offset,host);}
      catch(error){if(error.code!=='EADDRINUSE'&&error.code!=='EACCES')throw error;}
    }
  }
  return listenOnce(server,0,host);
}

module.exports={listenOnAvailablePort};
