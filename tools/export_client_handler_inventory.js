'use strict';
// Registration inventory only: partial handlers are never completion claims.
const fixture = require('./_browser_fixture');
async function inventory() {
  const f = fixture();
  await f.run('initMode()');
  return JSON.parse(f.run(`JSON.stringify({
    boundary:'Registered skill handlers can implement only a limited behavior scope.',
    registrations:{
      ArkOperatorCombat:ArkOperatorCombat.supported,
      ArkElementOperators:ArkElementOperators.supported,
      ArkMystic:ArkMystic.skillIds,
      ArkHunter:ArkHunter.skillIds,
      ArkDollkeeper:ArkDollkeeper.skillIds,
      ArkCommonSkills:ArkCommonSkills.supported,
      ArkClientStatBuffSkills:ArkClientStatBuffSkills.supported,
      ArkClientPrograms:ArkClientPrograms.supported,
      ArkMedicSkills:ArkMedicSkills.supported,
      ArkTactician:ArkTactician.skillIds,
      ArkFlowShape:ArkFlowShape.ids,
      ArkTacticalSpecials:Object.keys(ArkTacticalSpecials.skillKeys)
    }
  })`));
}
module.exports = inventory;
if (require.main === module) inventory().then(x => process.stdout.write(JSON.stringify(x)+'\n'))
  .catch(error => { console.error(error); process.exitCode=1; });
