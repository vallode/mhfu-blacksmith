#include <std/mem.pat>
#include <std/io.pat>
#include <std/core.pat>
#include <mhp2g/items.enum>
#include <mhp2g/stages.enum>
#include <mhp2g/monster.enum>

#pragma magic [ 67 61 6D 65 5F 73 75 62  2E 6F 76 6C ] @ 0x20
#pragma description MHP2G - game_sub.ovl
#pragma author IncognitoMan

#pragma base_address 0x09C14280

// --------------------------------------------------------------------------------------

// Mine Bomb Minigame

// Table you pull from is based on what chain of quests you have completed
// Bomb type dictates chance rates for what interaction happens... Loss, Normal or Success

struct MineBombItem {
  u16 Item[[name(ItemID[this])]];
  u8  Amount;
  u8  Loss;
  u8  Normal;
  u8  Success;
}[[name(std::format("{} ({}) || L: {}% N: {}% S: {}%", ItemID[Item], Amount, Loss, Normal, Success))]];

struct MineBombTable {
  MineBombItem TableA[19][[name("Table A")]];
  padding[6];
  MineBombItem TableB[24][[name("Table B")]];
  padding[8];
  MineBombItem TableC[25][[name("Table C")]];
  padding[10];
  MineBombItem TableD[31][[name("Table D")]];
  padding[6];
  MineBombItem TableE[33][[name("Table E")]];
  padding[10];
  MineBombItem TableF[34][[name("Table F")]];
};

// --------------------------------------------------------------------------------------

// Insect Tree Table

struct HammerRNG {
  u8 Normal;
  u8 Success;
}[[name(std::format("Normal: {}% Success: {}%", Normal, Success))]];

struct InsectTreeItem {
  u16 Item[[name(ItemID[this])]];
  u8  Amount;
  HammerRNG Hammer[3][[name("Hammer (White/Black/Gold)")]];
  u8  TERM [[hidden]];
}[[name(std::format("{} ({})", ItemID[Item], Amount))]];

struct InsectTreeTable {
  InsectTreeItem TableA[20][[name("Table A")]];
  padding[16];
  InsectTreeItem TableB[29][[name("Table B")]];
  padding[14];
  InsectTreeItem TableC[35][[name("Table C")]];
  padding[10];
  InsectTreeItem TableD[39][[name("Table D")]];
  padding[10];
  InsectTreeItem TableE[43][[name("Table E")]];
};

// --------------------------------------------------------------------------------------

// Fish Caster Table

struct FishCasterItem {
  u16 Item[[name(ItemID[this])]];
  u8  Chance;
  u8  Amount;
}[[name(std::format("{}% {} ({})", Chance, ItemID[Item], Amount))]];;

// --------------------------------------------------------------------------------------

// Seed Farm Table

struct SeedFarmItem {
  u16 Item[[name(ItemID[this])]];
  u8  Chance;
  u8  Amount;
}[[name(std::format("{}% {} ({})", Chance, ItemID[Item], Amount))]];;

struct SeedFarmTable {
  SeedFarmItem DefaultSeed[22];
  SeedFarmItem RedSeed[16];
  SeedFarmItem GreenSeed[12];
  SeedFarmItem YellowSeed[14];
};

// --------------------------------------------------------------------------------------

// Trenya

str TrenyaLocStr[7] = {
  "Mountains",
  "Jungle",
  "Desert",
  "Swamp",
  "Forest and Hills",
  "Volcano",
  "Great Forest"
};

str TrenyaPtsStr[5] = {
  "200pt",
  "300pt",
  "500pt",
  "1000pt",
  "1500pt"
};

struct TrenyaItems {
  u16 Item[[name(ItemID[this])]];
  u8  Amount;
  u8  Chance;
}[[name(std::format("{}% {} ({})", Chance, ItemID[Item], Amount))]];

struct TrenyaItemTable {
  u32 TableAPTR [[hidden]];
  u32 TableBPTR [[hidden]];
  u32 TableCPTR [[hidden]];
  u32 TableDPTR [[hidden]];

  TrenyaItems TableA[while(std::mem::read_signed($,4) !=0)] @ TableAPTR [[name("Table A")]];
  TrenyaItems TableB[while(std::mem::read_signed($,4) !=0)] @ TableBPTR [[name("Table B")]];
  TrenyaItems TableC[while(std::mem::read_signed($,4) !=0)] @ TableCPTR [[name("Table C")]];
  TrenyaItems TableD[while(std::mem::read_signed($,4) !=0)] @ TableDPTR [[name("Table D")]];
}[[name(TrenyaPtsStr[std::core::array_index()])]];

struct TrenyaPointTable {
  TrenyaItemTable TrenyaPointTbl[5] [[name(TrenyaLocStr[std::core::array_index()])]];
}[[inline]];

// --------------------------------------------------------------------------------------

// RNG Tables for farm

str BombTypeStr[7] = {
  "Small Barrel Bomb",
  "Small Barrel Bomb+",
  "Bounce Bomb",
  "Bounce Bomb+",
  "Jump Barrel Bomb",
  "Large Barrel Bomb",
  "Large Barrel Bomb+"
};

struct BombTypeRNG {
  u8 Loss;
  u8 Normal;
  u8 Success;
}[[name(BombTypeStr[std::core::array_index()])]];

struct TrenyaRNG {
  u8 TblAChance; 
  u8 TblBChance;
  u8 TblCChance;
  u8 TblDChance;
}[[name(std::format("A: {}% | B: {}% | C: {}% | D: {}%", TblAChance, TblBChance, TblCChance, TblDChance))]];

struct FarmRNGTable {
  u32 BombMinItem[7];
  padding[4];
  BombTypeRNG BombRNG[7];
  padding[3];
  u32 Unkn1[8];
  u32 Unkn2[2];
  TrenyaRNG DepartArrivalChance[6] [[name("Depart/Arrival Table Chance")]];
};

// --------------------------------------------------------------------------------------

// Player Area Spawn Chance

struct PlAreaSpawnEntry {
  u16 Chance;
  u16 StageID[[name(this >= 1 && this <= 267 ? stageID[this] : "Invalid Stage")]];
}[[name(std::format("{}% {} ", Chance, stageID[StageID]))]];

struct PlAreaSpawn {
  u32 NormalPTR;
  u32 FoodSkillBuffedPTR;

  PlAreaSpawnEntry NormalRates[while(std::mem::read_signed($,1) !=-1)] @ NormalPTR;
  PlAreaSpawnEntry FoodBuffRates[while(std::mem::read_signed($,1) !=-1)] @ FoodSkillBuffedPTR;
}[[inline]];

struct PlAreaSpawnTable {
  u32 PTR;

  PlAreaSpawn PlAreaTable @ PTR;
}[[name(areaID[std::core::array_index()])]];

// --------------------------------------------------------------------------------------

// Carve/Tail/Shiny/Cap/Break rewards

// Note: 0x09CD3DC4 - 09CD3F1F are all pointers to hard coded entries handled outside gamesub.

struct Rewards {
  u16 Chance;
  u16 Item[[name(ItemID[this])]];
  u16 Amount;
}[[name(std::format("{}% {} ({})", Chance, ItemID[Item], Amount))]];

struct Carves {
  u16 Chance;
  u16 Item;
}[[name(std::format("{}% {}", Chance, ItemID[Item]))]];;

struct emCarveIndex {
  u16 unrankIndex[[name(std::format("Unranked Index : 0x{:X}", (this*4)+0x09CD2E20))]];
  u16 lowrankIndex[[name(std::format("Low Rank Index : 0x{:X}", (this*4)+0x09CD2E20))]];;
  u16 hirankIndex[[name(std::format("High Rank Index : 0x{:X}", (this*4)+0x09CD2E20))]];;
  u16 treasureIndex[[name(std::format("Treasure Index : 0x{:X}", (this*4)+0x09CD2E20))]];;
  u16 trainIndex[[name(std::format("Training Index : 0x{:X}", (this*4)+0x09CD2E20))]];;
  u16 grankIndex[[name(std::format("G Rank Index : 0x{:X}", (this*4)+0x09CD2E20))]];;
  u16 miscIndex[[name(std::format("Misc. Index : 0x{:X}", (this*4)+0x09CD2E20))]];;

  if (unrankIndex != 0xFFFF) {
    u32 unrankPtr @ (unrankIndex * 4) + 0x09CD2E20 [[name(std::format("Unranked PTR : 0x{:X}", this)), hidden]];
    Carves unrankRewards[while(std::mem::read_signed($,2) !=-1)] @ unrankPtr [[name("Unranked Carve/Tail/Shiny")]];
  }
  if (lowrankIndex != 0xFFFF) {
    u32 lowrankPtr @ (lowrankIndex * 4) + 0x09CD2E20 [[name(std::format("Low Rank PTR : 0x{:X}", this)), hidden]];
    Carves lowRewards[while(std::mem::read_signed($,2) !=-1)] @ lowrankPtr [[name("Low Rank Carve/Tail/Shiny")]];
  }
  if (hirankIndex != 0xFFFF) {
    u32 hirankPtr @ (hirankIndex * 4) + 0x09CD2E20 [[name(std::format("High Rank PTR : 0x{:X}", this)), hidden]];
    Carves hirankRewards[while(std::mem::read_signed($,2) !=-1)] @ hirankPtr [[name("High Rank Carve/Tail/Shiny")]];
  }
  if (treasureIndex != 0xFFFF) {
    u32 treasurePtr @ (treasureIndex * 4) + 0x09CD2E20 [[name(std::format("Treasure PTR : 0x{:X}", this)), hidden]];
    Carves treasureRewards[while(std::mem::read_signed($,2) !=-1)] @ treasurePtr [[name("Treasure Carve/Tail/Shiny")]];
  }
  if (trainIndex != 0xFFFF) {
    u32 trainPtr @ (trainIndex * 4) + 0x09CD2E20 [[name(std::format("Training PTR : 0x{:X}", this)), hidden]];
    Carves trainRewards[while(std::mem::read_signed($,2) !=-1)] @ trainPtr [[name("Training Carve/Tail/Shiny")]];
  }
  if (grankIndex != 0xFFFF) {
    u32 grankPtr @ (grankIndex * 4) + 0x09CD2E20 [[name(std::format("G Rank PTR : 0x{:X}", this)), hidden]];
    Carves grankRewards[while(std::mem::read_signed($,2) !=-1)] @ grankPtr [[name("G Rank Carve/Tail/Shiny")]];
  }
  if (miscIndex != 0xFFFF) {
    u32 miscPtr @ (miscIndex * 4) + 0x09CD2E20 [[name(std::format("Misc. PTR : 0x{:X}", this)), hidden]];
    Carves miscRewards[while(std::mem::read_signed($,2) !=-1)] @ miscPtr [[name("Misc. Carve/Tail/Shiny")]];
  }

};

struct bodytailshiny {
  emCarveIndex BodyCarve;
  emCarveIndex TailCarve;
  emCarveIndex ShinyDrop;
  u8 unkn1;
  u8 unkn2;
  float CarveRadius;
  u16 unkn4;
  u8 unkn5;
  u8 unkn6;
}[[name(emID[std::core::array_index()+1])]];

struct capbreakindex {
  u8 Monster[[name(emID[this])]];
  u8 Type[[name
    (this == 128 ? std::format("Type : Capture") : 
    (std::format("Type : Break ({})", this))
  )]];
  u16 unrankIndex[[name(std::format("Unranked Index : 0x{:X}", (this*4)+0x09CD87C0))]];
  u16 lowrankIndex[[name(std::format("Low Rank Index : 0x{:X}", (this*4)+0x09CD87C0))]];;
  u16 hirankIndex[[name(std::format("High Rank Index : 0x{:X}", (this*4)+0x09CD87C0))]];;
  u16 treasureIndex[[name(std::format("Treasure Index : 0x{:X}", (this*4)+0x09CD87C0))]];;
  u16 trainIndex[[name(std::format("Training Index : 0x{:X}", (this*4)+0x09CD87C0))]];;
  u16 grankIndex[[name(std::format("G Rank Index : 0x{:X}", (this*4)+0x09CD87C0))]];;

  u32 unrankPtr @ (unrankIndex*4)+0x09CD87C0 [[hidden]];
  u32 lowrankPtr @ (lowrankIndex*4)+0x09CD87C0 [[hidden]];
  u32 hirankPtr @ (hirankIndex*4)+0x09CD87C0 [[hidden]];
  u32 treasurePtr @ (treasureIndex*4)+0x09CD87C0 [[hidden]];
  u32 trainPtr @ (trainIndex*4)+0x09CD87C0 [[hidden]];
  u32 grankPtr @ (grankIndex*4)+0x09CD87C0 [[hidden]];

  Rewards unrankRewards[while(std::mem::read_signed($,2) !=-1)] @ unrankPtr [[name("Unranked Rewards")]];
  Rewards lowrankRewards[while(std::mem::read_signed($,2) !=-1)] @ lowrankPtr [[name("Low Rank Rewards")]];
  Rewards hirankRewards[while(std::mem::read_signed($,2) !=-1)] @ hirankPtr [[name("High Rank Rewards")]];
  Rewards treasureRewards[while(std::mem::read_signed($,2) !=-1)] @ treasurePtr [[name("Treasure Rewards")]];
  Rewards trainRewards[while(std::mem::read_signed($,2) !=-1)] @ trainPtr [[name("Training Rewards")]];
  Rewards grankRewards[while(std::mem::read_signed($,2) !=-1)] @ grankPtr [[name("G Rank Rewards")]];

}[[name(emID[Monster])]];

// --------------------------------------------------------------------------------------


MineBombTable MineBombMini @ 0x09CCB750[[name("Mine Bomb Rewards")]];
InsectTreeTable InsectTreeMini @ 0x09CCBB68[[name("Insect Tree Rewards")]];
FishCasterItem FishCasterTable[19] @ 0x09CCC220[[name("Fish Caster Rewards")]];
SeedFarmTable SeedFarm @ 0x09CCC270[[name("Seed Farm")]];
TrenyaPointTable TrenyaRewardTbl[7] @ 0x09CCDF08[[name("Trenya Rewards")]];
FarmRNGTable FarmRNG @ 0x09CCE138;
PlAreaSpawnTable PlayerStartArea[32] @ 0x09CCEC60[[name("Player Spawn Area Chance")]];
bodytailshiny BTS[89] @ 0x9CD3F20[[name("Carve/Tail/Shiny Rewards")]];
capbreakindex CapBreak[while(std::mem::read_signed($,1) !=-1)] @ 0x09CD9630[[name("Capture/Break Rewards")]];