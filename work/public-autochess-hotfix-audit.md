# Public AutoChess Lua hotfix audit

Source: https://github.com/yuanyan3060/ArknightsGameResource
Pinned commit: `57ef5385c1ab1315fe4f2094f399b5c803bd71fc`
Commit date: `2026-09-11T10:07:52Z`
Inspected: 2026-09-14 (Asia/Tokyo)
GitHub recursive tree: not truncated; 565 `.lua` paths, exactly 5 containing `autochess` (case-insensitive).

All five files were read in full from the GitHub Git Blobs API at the following blob IDs. Scope is these five filenames only, not all Lua source. This is a public current snapshot, not an assertion of equivalence to JP client 36.7.22.

| Path under `gamedata/[uc]lua/hotfixes/` | Blob SHA | Patched methods and observed effect |
| --- | --- | --- |
| `act1vautochesstutorialhotfixer.lua` | `7b337ab6526163bfcdcb88fee89a74991e8b7638` | `AutoChessUIPlugin._OnPlaneAnim`: after original method, training-mode tutorial binder receives `OnDummyAsyncBuildChanged` when available. |
| `autochessdragstatehotfixer.lua` | `6c843dc029fc7f13f7f1b1a6f30880cc3999a0cb` | `AutoChessDragState._RevertBattleOverlap`: reject nil character, otherwise call original method. |
| `autochessshophotfixer.lua` | `3d8f87276e7d1c9f4c7eb738ea454d49dd870078` | `AutoChessCharSelectPoolViewModel._AddUnusedBackupChar`: collect eligible unused backup characters at the matching chess level. `AutoChessServiceBattleInfo.Reset`: original reset then replace `battleSceneData` with a new `AutoChessBattleSceneData`. |
| `autochessutilhotfixer.lua` | `b1336264ff6a9b228828b6ed02d2ed6805e401f8` | `AutoChessUtil.CheckModeTypeTrackPoint`: iterate matching modes whose start time has arrived, call `CheckModeTrackPoint`. |
| `uichartabgroupinautochesshotfixer.lua` | `f45999f9cda1a9ec9050966b24655f57214144ed` | `UICharacterInfoTabGroupSubPanelInAutochess._RefreshEquipData`: runtime-character equipment panel refresh / hide entries when there is no AutoChess instance. |

None of these five bodies contains `RandomEnemyGenerater`, `_GenerateRandomEnemyData`, enemy count calculations, an enemy-plan generator, or an enemy-plan generator call. The shop reset is a battle-scene cache reset, not an enemy generation implementation. Therefore these five patches supply no additional evidence for the unresolved native enemy count formula. Absence in these files does not prove absence in the other 560 Lua files or in native code.

Pinned source links:

- [act1vautochesstutorialhotfixer.lua](https://github.com/yuanyan3060/ArknightsGameResource/blob/57ef5385c1ab1315fe4f2094f399b5c803bd71fc/gamedata/%5Buc%5Dlua/hotfixes/act1vautochesstutorialhotfixer.lua)
- [autochessdragstatehotfixer.lua](https://github.com/yuanyan3060/ArknightsGameResource/blob/57ef5385c1ab1315fe4f2094f399b5c803bd71fc/gamedata/%5Buc%5Dlua/hotfixes/autochessdragstatehotfixer.lua)
- [autochessshophotfixer.lua](https://github.com/yuanyan3060/ArknightsGameResource/blob/57ef5385c1ab1315fe4f2094f399b5c803bd71fc/gamedata/%5Buc%5Dlua/hotfixes/autochessshophotfixer.lua)
- [autochessutilhotfixer.lua](https://github.com/yuanyan3060/ArknightsGameResource/blob/57ef5385c1ab1315fe4f2094f399b5c803bd71fc/gamedata/%5Buc%5Dlua/hotfixes/autochessutilhotfixer.lua)
- [uichartabgroupinautochesshotfixer.lua](https://github.com/yuanyan3060/ArknightsGameResource/blob/57ef5385c1ab1315fe4f2094f399b5c803bd71fc/gamedata/%5Buc%5Dlua/hotfixes/uichartabgroupinautochesshotfixer.lua)
