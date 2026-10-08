'use strict';
// 旧 VM smoke 的数据白名单补齐新增的必需输入；其余测试自定义响应保持原样。
const fs = require('fs'), path = require('path');
module.exports = sandbox => {
  sandbox.ArkAttributes = require('../web/src/simulation/attributes.js');
  sandbox.ArkSim = require('../web/src/simulation/simulation-clock.js');
  sandbox.ArkWaves = require('../web/src/simulation/wave-scheduler.js');
  sandbox.ArkSourceMap = require('../web/src/simulation/source-map.js');
  sandbox.ArkHiddenBoss = require('../web/src/rules/hidden-boss.js');
  sandbox.ArkRunSetup = require('../web/src/rules/run-setup.js');
  sandbox.ArkDiyRoster = require('../web/src/rules/diy-roster.js');
  if (!sandbox.localStorage) {
    const storage = new Map();
    sandbox.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
  }
  const previous = sandbox.fetch;
  sandbox.fetch = async (url, ...args) => ['module_data.json','mode_rules.json','source_battles.json','shop_items.json','training_config.json','garrison_data.json','skill_choices.json','equipment_details.json','diy_roster.json'].includes(String(url).split('?')[0].split('/').pop())
    ? { json:async()=>JSON.parse(fs.readFileSync(path.join(__dirname,'../web/',String(url).split('?')[0].split('/').pop()),'utf8')) }
    : previous(url, ...args);
};
