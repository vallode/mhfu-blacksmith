#include <std/mem.pat>
#include <std/io.pat>
#include <std/core.pat>
#include <mhp2g/monster.enum>
#include <mhp2g/stages.enum>
#include <mhp2g/items.enum>

#pragma magic [ 67 61 6D 65 5F 74 61 73  6B 2E 6F 76 6C ] @ 0x20
#pragma description MHP2G - game_task.ovl
#pragma author IncognitoMan

#pragma base_address 0x09A5A580

// --------------------------------------------------------------------------------------

// Hitzones
struct HitZoneVal{
  u8 Unkn; // Part ID?
  u8 Cut;
  u8 Bash;
  u8 Shot;
  u8 Fire;
  u8 Water;
  u8 Ice;
  u8 Thunder;
  u8 Dragon;
  u8 KO;
};

struct HitzoneTbl {
  u32 PTR[[hidden]];

  HitZoneVal Hitzones[while(std::mem::read_unsigned($,2) !=0)] @ PTR;
};

// --------------------------------------------------------------------------------------

// Navway

struct NavWayZoneInVec {
  float X[[name(std::format("X : {}", this))]];
  float Y[[name(std::format("Y : {}", this))]];
  float Z[[name(std::format("Z : {}", this))]];
  float Rotation[[name(std::format("Rotation : {}", this))]]; 
};

struct NavWayVec3 {
  float X[[name(std::format("X : {}", this))]];
  float Y[[name(std::format("Y : {}", this))]];
  float Z[[name(std::format("Z : {}", this))]];
};

struct NavWayVec4 {
  float X[[name(std::format("X : {}", this))]];
  float Y[[name(std::format("Y : {}", this))]];
  float Z[[name(std::format("Z : {}", this))]];
  float Size[[name(std::format("Size : {}", this))]]; // maybe?
  u32 Flag;
};

struct NavWaySubType {
  s16 AreaID;
  s16 NumPoints;
  NavWayVec4 *NavPoints[NumPoints] : u32;
  NavWayZoneInVec WarpInPoint;
}[[name(AreaID >= 1 && AreaID <= 267 ? stageID[AreaID] : "Invalid Area")]];

struct NavWayType2 {
  s16 AreaID;
  s16 NumPoints;
  NavWaySubType *NavPoints[NumPoints] : u32;
}[[name(stageID[AreaID])]];

struct NavWayType1 {
  s16 AreaID;
  s16 NumPoints;
  NavWayVec3 *NavPoints[NumPoints] : u32;
}[[name(stageID[AreaID])]];

struct NavWayTbl {
  NavWayType1 *PTR1[
    while(
      std::mem::read_signed($, 2) !=-1
    )
  ] : u32;
  NavWayType1 *PTR2[
    while(
      std::mem::read_signed($, 2) !=-1
    )
  ] : u32;
  NavWayType1 *PTR3[
    while(
      std::mem::read_signed($, 2) !=-1
    )
  ] : u32;
  NavWayType1 *PTR4[
    while(
      std::mem::read_signed($, 2) !=-1
    )
  ] : u32;
  NavWayType1 *PTR5[
    while(
      std::mem::read_signed($, 2) !=-1
    )
  ] : u32;
  if (
    std::mem::read_unsigned($ + 0x4, 4) > 0x09A5A580 && 
    std::mem::read_unsigned($ + 0x4, 4) < 0x09C0C180) { 
      NavWayType1 *PTR6[
        while(
          std::mem::read_signed($, 2) !=-1
        )
      ] : u32;
      NavWayType2 *PTR7[
        while(
          std::mem::read_signed($, 2) !=-1
        )
      ] : u32 [[name("Exit Paths")]];
  } else { 
      NavWayType1 *PTR6[
        while(
          std::mem::read_signed($, 2) !=-1
        )
      ] : u32;
  }
};

// --------------------------------------------------------------------------------------

// PTR2

struct PTRTbl {
  u32 Unkn1;
};

// --------------------------------------------------------------------------------------

// Main emChunk struct
struct GeneralTol {
  u16 Initial;
  u16 RecoveryTime;
  u16 Recovery;
  u16 DurationTime;
  u16 TolIncrease;
};

struct PoisonTol {
  u16 Initial;
  u16 RecoveryTime;
  u16 Recovery;
  u16 PoisonDMG;
  u16 PoisonTotalTime;
  u16 PerSecPoison;
  u16 TolIncrease;
};

struct Tolerance {
  GeneralTol Paralysis;
  GeneralTol KO;
  GeneralTol Sleep;
  GeneralTol UnknTol;
  PoisonTol  Poison;
};

struct DetectChunk {
  float X;
  float Y;
  float Z;
  float Scale;
  u32   Angle;
  float Unkn1;
  float Unkn2;
  float Unkn3;
};

struct emPTRChunk {
  u32 NavWayPTR;
    if (
      NavWayPTR > 0x09A5A580 && 
      NavWayPTR < 0x09C0C180) { 
      NavWayTbl NavWayTable @ NavWayPTR;
    } else { 
      //
    }
  u32   UnknPTR1;

  u32   UnknPTR2;
  if (
    UnknPTR2 > 0x09A5A580 && 
    UnknPTR2 < 0x09C0C180) { 
    PTRTbl PTR2Table @ UnknPTR2;
  } else { 
    //
  }

  u32   UnknPTR3;
  if (
    UnknPTR3 > 0x09A5A580 && 
    UnknPTR3 < 0x09C0C180) { 
    PTRTbl PTR3Table @ UnknPTR3;
  } else { 
    //
  }

  u32   UnknPTR4;
  u32   UnknPTR5;
  u32   UnknPTR6;
  u32   UnknPTR7;
  u32   UnknPTR8; // Seems AI logic related
  u32   UnknPTR9;
  u32   UnknPTR10;
  u32   UnknPTR11;
  u32   UnknPTR12;
  u32   UnknPTR13;
  u32   UnknPTR14;
  u32   UnknPTR15;
  u32   UnknPTR16;
  u32   UnknPTR17;
  u32   UnknPTR18;
  u32   UnknPTR19;
  u32   UnknPTR20;
  u32   UnknPTR21;
  u32   UnknPTR22;
  u32   PartDurabilityPTR;
  u32   UnknPTR24;
  u32   UnknPTR25;
  u32   UnknPTR26;
  u32   UnknPTR27;


};

struct VecChunk {
  float Unkn[4];
};

// Main emChunk struct
struct emChunk {
  float UnknFP[16];
  float BaseScale[[name("Base Scale")]];
  float ShadowScaleX[[name("Shadow Scale (X)")]];
  float ShadowScaleY[[name("Shadow Scale (Y)")]];
  float UnknFP3;
  u32   CollisionPTR;
  u16   Unkn1;
  u16   Term1;
  u32   Unkn2;
  u32   Unkn3;
  DetectChunk DetectRange;
  DetectChunk DetectRadius;
  VecChunk VecChunkMain[6];
  u32   Unkn4;
  u32   Unkn7;
  float Unkn6;
  HitzoneTbl *HitzonePTR[
    while(
      std::mem::read_unsigned($, 4) > 0x09A5A580 &&
      std::mem::read_unsigned($, 4) < 0x09C0C180
    )
  ] : u32;
  Tolerance Tolerances;
  u16   PlayerReactionTimer;
  u16   UnknBlock1[7];
  u16   Term2[[hidden]];
  emPTRChunk emPTRTable;
  u64   TERM;

}[[name(emID[std::core::array_index()])]];

// --------------------------------------------------------------------------------------

// Veggie Elder Traders

struct VeggieTrade {
  u16 Item;
  u16 CommonT[[name("Common Trade")]];
  u16 RareT[[name("Rare Trade")]];
}[[name(std::format("{} || Common: {}  Rare: {}", ItemID[Item], ItemID[CommonT], ItemID[RareT]))]];

struct VeggieTradeTable {
  VeggieTrade TableA[109][[name("Table A")]];
  padding[2];
  VeggieTrade TableB[109][[name("Table B")]];
  padding[2];
  VeggieTrade TableC[109][[name("Table C")]];
  padding[2];
  VeggieTrade TableD[109][[name("Table D")]];
  padding[2];
  VeggieTrade TableE[109][[name("Table E")]];
  padding[2];
  VeggieTrade TableF[109][[name("Table F")]];
  padding[2];
  VeggieTrade TableG[109][[name("Table G")]];
};

// --------------------------------------------------------------------------------------

// Melee Hitboxes

str PLMHitboxStr[20] = {
  "GS/LS",  // Center/Lower/Tip
  "GS Kick",
  "Kick",
  "Hammer",
  "Hunting Horn (Super Pound)",
  "Lance",
  "SnS Sword",
  "SnS Shield",
  "Bowgun Melee",
  "Dual Blades (1)",
  "Dual Blades (2)",
  "Unknown",
  "Bow Melee",
  "Unknown",
  "GunLance",
  "Unknown",
  "Hunting Horn",
  "Hunting Horn Poke",
  "Shadowbox (1)",
  "Shadowbox (2)"
};


struct PLMHitboxDim{
  u32 ModifierType;
  u32 unkn;
  float Size;
};

struct PLMHitbox{
  u16 BoneID;
  u16 Type;
  PLMHitboxDim HitboxDimension[3][[name("Dimensions/Size")]];
};

struct PLMHitboxTable {
  u32 PTR[[hidden]];

  PLMHitbox PLMeleeHitbox[while(std::mem::read_signed($,4) !=-1)] @ PTR [[name("Hitbox")]];
}[[name(PLMHitboxStr[std::core::array_index()])]];

// --------------------------------------------------------------------------------------

// Melee Motion Values

str PLMMotValStr[109] = {
  "Empty",
  "Great Sword (Upswing)",
  "Great Sword (Side Slash)",
  "Great Sword (Draw Slash)",
  "Great Sword (Kick)",
  "Player (Kick)",
  "Hammer (Side Smack)",
  "Hammer (Combo 1)",
  "Hammer (Charge 1)",
  "Hammer (Charge 2)",
  "Hammer (Charge 3 Swipe)",
  "Hammer (Charge 3 Pound)",
  "Hammer (Spin Start)",
  "Hammer (Spin 1)",
  "Hammer (Spin Subsequent)",
  "Hammer (Spin Final)",
  "Lance (Horizontal Poke)",
  "Lance (Charge)",
  "Lance (Guard Poke)",
  "Unknown",
  "Lance (Unsheath Poke)",
  "Sword and Shield (Slash Combo 1)",
  "Sword and Shield (Jumping Slash)",
  "Sword and Shield (Revolving Slash)",
  "Sword and Shield (Guard Slash)",
  "Sword and Shield (Slash Combo 2)",
  "Sword and Shield (Slash Combo 3 - 1)",
  "Sword and Shield (Slash Combo 3 - 2)",
  "Lance (Diagonal Poke)",
  "Bowgun (Melee)",
  "Sword and Shield (Rising Slash After Roll/Jump)",
  "Lance (Charge Finisher)",
  "Hammer (Golf Swing)",
  "Hammer (Combo 2)",
  "Hammer (Unsheath)",
  "Lance (Diagonal Poke Final)",
  "Lance (Horizontal Poke Final)",
  "Dual Blades (Normal Mode Combo 1)",
  "Dual Blades (Normal Mode Combo 2 - 1)",
  "Dual Blades (Normal Mode Combo 2 - 2)",
  "Dual Blades (Normal Mode Combo 3 - 1)",
  "Dual Blades (Normal Mode Combo 3 - 2)",
  "Dual Blades (Normal Mode Combo 3 - 3)",
  "Unknown",
  "Dual Blades (Normal Mode Upslash)",
  "Dual Blades (Normal Mode Circle Slice 1)",
  "Dual Blades (Normal Mode Circle Slice 2)",
  "Dual Blades (Normal Mode Circle Slice 3)",
  "Dual Blades (Demon Dance 1)",
  "Dual Blades (Demon Dance 2)",
  "Dual Blades (Demon Dance 3)",
  "Unknown",
  "Dual Blades (Demon Mode Circle Slice 1)",
  "Dual Blades (Demon Mode Circle Slice 2)",
  "Dual Blades (Demon Mode Circle Slice 3)",
  "Unknown",
  "Unknown",
  "Long Sword (Draw Slash)",
  "Long Sword (Draw Slash Alt)",
  "Long Sword (Fade Slash)",
  "Bow (Melee 1)",
  "Bow (Melee 2)",
  "Unknown",
  "GunLance (Horizontal Poke)",
  "GunLance (Rising Poke)",
  "Unknown",
  "GunLance (Horizontal Poke Finisher)",
  "GunLance (Guard Poke)",
  "Unknown",
  "Long Sword (Spirit Combo 1)",
  "GunLance (Unsheath)",
  "Long Sword (Spirit Combo Stab)",
  "Long Sword (Stab)",
  "Long Sword (Spirit Combo 2)",
  "Long Sword (Spirit Combo Upward Slice)",
  "Long Sword (Upward Slice)",
  "Long Sword (Spirit Combo 3)",
  "Long Sword (Spirit Combo 4)",
  "Unknown",
  "Long Sword (No Spirit Combo)",
  "Long Sword (Spirit Combo 5)",
  "Hunting Horn (Left Swing)",
  "Hunting Horn (Right Swing)",
  "Hunting Horn (Initial Poke)",
  "Hunting Horn (Subsequent Poke)",
  "Hunting Horn (Super Pound 1)",
  "Hunting Horn (Super Pound 2)",
  "Hunting Horn (Forward Slam)",
  "Hunting Horn (Side Sweep Right)",
  "Hunting Horn (Side Sweep Left)",
  "Hunting Horn (Back Slam)",
  "Great Sword (Charge Level 1)",
  "Great Sword (Charge Level 2)",
  "Great Sword (Charge Level 3)",
  "Hunting Horn (Recital Begin)",
  "Hunting Horn (Recital End)",
  "Player (Shadowbox 1)",
  "Player (Shadowbox 2)",
  "Unknown",
  "Unknown",
  "Sword and Shield (Rising Slash Block)",
  "Dual Blades (Normal Mode Charging Slice 1 - 1)",
  "Dual Blades (Normal Mode Charging Slice 1 - 2)",
  "Dual Blades (Demon Mode Charging Slice 1 - 1)",
  "Dual Blades (Demon Mode Charging Slice 1 - 2)",
  "Dual Blades (Charging Slice 2 - 1)",
  "Dual Blades (Charging Slice 2 - 2)",
  "Dual Blades (Demon Dance Finisher 1)",
  "Dual Blades (Demon Dance Finisher 2)"
};

struct PlayerMotVal {
  u8 HitboxDelay;
  u8 HitboxDuration;
  u8 MotionValue;
  u8 KnockbackStrength;
  u8 Unkn1;
  u8 Unkn2;
  u8 HitDirection;
  u8 Unkn3;
  u8 Unkn4;
  u8 DamageType;
  u8 Unkn5;
  u8 Unkn6;
  u8 EffectonHit1; // both of these bitflags 
  u8 EffectonHit2; // revisit these to enum the efx
  u8 StatusDuration;
  u8 EffectonTarget;
  u8 HitlagDuration;
  u8 Unkn7;
  u8 Unkn8;
  u8 Unkn9;
  u8 KO;
  u8 Unkn10;
  u8 Unkn11;
  u8 Unkn12;  
}[[name(PLMMotValStr[std::core::array_index()])]];

// --------------------------------------------------------------------------------------

// Output 

emChunk MonChunk[90] @ 0x09BB3C20[[name("Monster Chunk")]];
VeggieTradeTable VeggieElderTrades @ 0x09BD2E58[[name("Veggie Elder Trades")]];
PLMHitboxTable MeleeHitBoxes[20] @ 0x09BF7118[[name("Player Melee Hitboxes")]];
PlayerMotVal PLMotVal[109] @ 0x09BF7168[[name("Player Melee Motion Values")]];