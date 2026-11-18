#include <std/mem.pat>
#include <std/io.pat>
#include <std/core.pat>
#include <mhp2g/items.enum>
#include <mhp2g/equip.enum>

#pragma description MHP2G - EBOOT.BIN
#pragma author IncognitoMan

#pragma base_address 0x08801A4C

// --------------------------------------------------------------------------------------

// Equipment Creation, Upgrade and Values.

// Equip Create
enum EquipTypeID: u8 {
  Leg    = 0x00,
  Head   = 0x01,
  Chest  = 0x02,
  Arm    = 0x03,
  Waist  = 0x04,
  WepBM  = 0x05,
  WepGun = 0x06,
};

struct EquipCraftItem {
  u16 Item [[name(ItemID[this])]];
  u16 Quantity;
}[[name(std::format("{} ({})", ItemID[Item], Quantity))]];

struct EquipCreate <auto EquipType> {
  EquipTypeID Type;
  u8 Hide;
  u16 EquipID;
  EquipCraftItem Craft[4][[name("Crafting Items")]];
  u32 Unkn;
  u16 Unkn2;
} [[name(
  EquipType == 1  ? HeadArmorID[EquipID] :
  (EquipType == 2 ? ChestArmorID[EquipID] :
  (EquipType == 3 ? ArmArmorID[EquipID] :
  (EquipType == 4 ? WaistArmorID[EquipID] :
  (EquipType == 0 ? LegArmorID[EquipID] :
  (EquipType == 5 ? WepBMID[EquipID] :
  (EquipType == 6 ? WepGunID[EquipID] :
  (EquipType == 7 ? AncRustID[EquipID - 1501] :
  (EquipType == 8 ? ItemID[EquipID] :
  ("Unknown")))))))))
)]];

struct EquipmentCreateTable {
  // Armor
  EquipCreate<1> HeadCreate[437]  [[name("Head Armor Create")]];
  EquipCreate<2> ChestCreate[435] [[name("Chest Armor Create")]];
  EquipCreate<3> ArmCreate[426]   [[name("Arm Armor Create")]];
  EquipCreate<4> WaistCreate[424] [[name("Waist Armor Create")]];
  EquipCreate<0> LegCreate[434]   [[name("Leg Armor Create")]];
  // Empty Entry 1
  u16 TERM[[hidden]];
  EquipCreate<0> NullCreate1[1][[hidden]];
  // Weapons
  EquipCreate<5> GSLSCreate[131]    [[name("GS/LS Create")]];
  EquipCreate<5> LanceGLCreate[117] [[name("Lance/GL Create")]];
  EquipCreate<5> SnSDBCreate[131]   [[name("SnS/DB Create")]];
  EquipCreate<5> HamHHCreate[124]   [[name("Hammer/HH Create")]];
  EquipCreate<7> BMShardCreate[8]   [[name("Rust/Ancient Create (BM)")]];
  EquipCreate<6> LBGCreate[135]     [[name("LBG Create")]];
  EquipCreate<6> HBGCreate[107]     [[name("HBG Create")]];
  EquipCreate<6> BowCreate[61]      [[name("Bow Create")]];
  EquipCreate<7> GunShardCreate[2]  [[name("Rust/Ancient Create (Gun)")]];
  // Empty Entry 2
  u16 TERM2[[hidden]];
  EquipCreate<0> NullCreate2[1][[hidden]];
  // Decos
  EquipCreate<8> DecoCreate[192]  [[name("Decoration Create")]];
};

// --------------------------------------------------------------------------------------

// Equip Upgrade

struct EquipUpgrade <auto EquipType> {
  EquipCraftItem Craft[4][[name("Crafting Items")]];
  u16 Upgrade1 [[name(
    EquipType == 0 ? WepBMID[this] :
    (EquipType == 1 ? WepGunID[this] :
    ("Unknown"))
  )]];
  u16 Upgrade2 [[name(
    EquipType == 0 ? WepBMID[this] :
    (EquipType == 1 ? WepGunID[this] :
    ("Unknown"))
  )]];
  u16 Upgrade3 [[name(
    EquipType == 0 ? WepBMID[this] :
    (EquipType == 1 ? WepGunID[this] :
    ("Unknown"))
  )]];
  u16 Upgrade4 [[name(
    EquipType == 0 ? WepBMID[this] :
    (EquipType == 1 ? WepGunID[this] :
    ("Unknown"))
  )]];
  u16 Upgrade5 [[name(
    EquipType == 0 ? WepBMID[this] :
    (EquipType == 1 ? WepGunID[this] :
    ("Unknown"))
  )]];
  u16  NULL;
} [[name(
  EquipType == 0 ? WepBMID[std::core::array_index()] :
  (EquipType == 1 ? WepGunID[std::core::array_index()] :
  (EquipType == 2 ? "Armor Sphere Upgrade" : // No idea how id name these... order is Sphere, Sphere+, Hrd Sphere, Hvy Sphere, Ryl Sphere, Tru Sphere, Tru Max
  ("Unknown")))
)]];

struct EquipUpgradeTable {
  EquipUpgrade<1> NullUpgrade[1][[hidden]];
  EquipUpgrade<0> EquipUpgradeBM[1150] [[name("Blademaster Upgrades")]];
  EquipUpgrade<1> EquipUpgradeGun[354] [[name("Gunner Upgrades")]];
  u32 Unkn[49][[hidden]];
  EquipUpgrade<2> EquipUpgradeSphere[7] [[name("Armor Sphere Upgrades")]]; // The actual armor sphere limits are part of "ArmorSphereCaps"
};

// --------------------------------------------------------------------------------------

// Model to Weapon Type

enum WepTypeID : u8 {
  GS     = 0x00,
  HBG    = 0x01,
  Hammer = 0x02,
  Lance  = 0x03,
  SnS    = 0x04,
  LBG    = 0x05,
  DB     = 0x06,
  LS     = 0x07,
  HH     = 0x08,
  GL     = 0x09,
  Bow    = 0x0A,
};

// --------------------------------------------------------------------------------------

// Armor Values

struct ArmorSphereCaps {
  u8 ArmorSphere;
  u8 ArmorSpherePlus;
  u8 HrdArmorSphere;
  u8 HvyArmorSphere;
  u8 RylArmorSphere;
  u8 TruArmorSphere;
  u8 TruMax;
} [[name("Armor Sphere Caps")]];

struct ArmorSkills {
  u8 Skill [[name(SkillID[this])]];
  s8 Amount;
}[[name(std::format("{} ({})", SkillID[Skill], Amount))]];

struct ArmorRes {
  s8 FireRes;
  s8 WaterRes;
  s8 ThunderRes;
  s8 DragonRes;
  s8 IceRes;
} [[name("Elemental Resistances")]];

struct ArmorValue <auto ArmorType> {
  u16 MaleID;
  u16 FemaleID;
  u8 HunterType;
  u8 Rarity;
  u16 Unkn1;
  u32 Price;
  s8 Defense;
  ArmorRes Res;
  u8 Slots;
  u8 ColorSeries;
  ArmorSphereCaps SphereCaps;
  u8 Unkn2;
  u16 Unkn3;
  ArmorSkills Skills[5];
} [[name(
  ArmorType == 0  ? LegArmorID[std::core::array_index()] :
  (ArmorType == 1 ? HeadArmorID[std::core::array_index()] :
  (ArmorType == 2 ? ChestArmorID[std::core::array_index()] :
  (ArmorType == 3 ? ArmArmorID[std::core::array_index()] :
  (ArmorType == 4 ? WaistArmorID[std::core::array_index()] :
  ("Unknown")))))
)]];

struct ArmorValuePTR {
  ArmorValue<1> *HeadArmorValues[436] : u32 [[name("Head Armor Values")]];
  ArmorValue<2> *ChestArmorValues[420] : u32 [[name("Chest Armor Values")]];
  ArmorValue<3> *ArmArmorValues[411] : u32 [[name("Arm Armor Values")]];
  ArmorValue<4> *WaistArmorValues[409] : u32 [[name("Waist Armor Values")]];
  ArmorValue<0> *LegArmorValues[420] : u32 [[name("Leg Armor Values")]];
};

// --------------------------------------------------------------------------------------

// Weapon Values

bitfield ShotCoat {
  Norm1 : 1;
  Norm2 : 1;
  Norm3 : 1;
  Pierce1 : 1;
  Pierce2 : 1;
  Pierce3 : 1;
  Pellet1 : 1;
  Pellet2 : 1;
  Pellet3 : 1;
  Crag1 : 1;
  Crag2 : 1;
  Crag3 : 1;
  Clust1 : 1;
  Clust2 : 1;
  Clust3 : 1;
  FlameS : 1;
  WaterS : 1;
  ThunderS : 1;
  FreezeS : 1;
  DragonS : 1;
  Recov1 : 1;
  Recov2 : 1;
  Poison1 : 1;
  Poison2 : 1;
  Para1 : 1;
  Para2 : 1;
  Sleep1 : 1;
  Sleep2 : 1;
  Tranq : 1;
  Paint : 1;
  Demon : 1;
  Armor : 1;
};

// Element type bitflag for weapons with multiple elements
enum EleBitFlag : u16 {
  Sleep = 1,
  Poison = 2,
  Paralysis = 4,
  Unused = 8,
  Fire = 16,
  Water = 32,
  Thunder = 64,
  Ice = 128,
  Dragon = 256,
};

// Dual attribute weapons
struct DualAttrEntry {
  EleBitFlag AttribType[[name("Attribute Type")]];
  u16 Value;
}[[name(std::format("{} ({})", AttribType, Value))]];

struct WepValueDualAttr {
  u16 WeaponID[[name(WepBMID[this])]];
  DualAttrEntry DualAttr[2][[name("Attributes")]];
}[[name(WepBMID[WeaponID])]];

// Sharpness table entries
struct WeaponSharpness {
  u16  Red[[name(std::format("Red {} ({})", this, this))]];
  u16  Orange[[name(std::format("Orange {} ({})", this - Red, this))]];
  u16  Yellow[[name(std::format("Yellow {} ({})", this - Orange, this))]];
  u16  Green[[name(std::format("Green {} ({})", this - Yellow, this))]];
  u16  Blue[[name(std::format("Blue {} ({})", this - Green, this))]];
  u16  White[[name(std::format("White {} ({})", this - Blue, this))]];
  u16  Purple[[name(std::format("Purple {} ({})", this - White, this))]];
};

struct SharpnessTable {
  WeaponSharpness Sharpness[40][[name("Sharpness ID")]];
  u32 PTR[11][[name("Sharpness PTR")]];
};

// Bowgun Mod Level
struct BGModLevel {
  u32 Attack_Inc[[name("Attack Increase")]];
  float Speed;
  float Dist_Devi[[name("Distance Deviation")]];
  float Drop_Speed[[name("Dropoff Speed")]];
  float Hori_Devi[[name("Horizontal Deviation")]];
  float EFX_Timing[[name("EFX Timing")]];
};

struct BGModTable {
  BGModLevel *ModType1[5] : u32 [[name("Mod Type 1")]];
  BGModLevel *ModType2[5] : u32 [[name("Mod Type 2")]];
  BGModLevel *ModType3[5] : u32 [[name("Mod Type 3")]];
  BGModLevel *ModType4[5] : u32 [[name("Mod Type 4")]];
};

struct BowCharges {
  u8 ChargeLv1[[name(BowChargeID[this])]];
  u8 ChargeLv2[[name(BowChargeID[this])]];
  u8 ChargeLv3[[name(BowChargeID[this])]];
  u8 ChargeLv4[[name(BowChargeID[this])]];
};

// Bowgun Shot Table
struct BowgunShots {
  u8 Norm1;
  u8 Norm2;
  u8 Norm3;
  u8 Pierce1;
  u8 Pierce2;
  u8 Pierce3;
  u8 Pellet1;
  u8 Pellet2;
  u8 Pellet3;
  u8 Crag1;
  u8 Crag2;
  u8 Crag3;
  u8 Clust1;
  u8 Clust2;
  u8 Clust3;
  u8 Flame;
  u8 Water;
  u8 Thunder;
  u8 Freeze;
  u8 Dragon;
  u8 Recov1;
  u8 Recov2;
  u8 Poison1;
  u8 Poison2;
  u8 Para1;
  u8 Para2;
  u8 Sleep1;
  u8 Sleep2;
  u8 Tranq;
  u8 Paint;
  u8 Demon;
  u8 Armor;
};

// Weapon class modifiers
struct WepClassMod {
  u32 GreatSword[[name("Great Sword")]];
  u32 HeavyBowgun[[name("Heavy Bowgun")]];
  u32 Hammer;
  u32 Lance;
  u32 SwordnShield[[ name("Sword and Shield")]];
  u32 LightBowgun[[name("Light Bowgun")]];
  u32 DualBlades[[name("Dual Blades")]]; 
  u32 LongSword[[name("Long Sword")]];
  u32 HuntingHorn[[name("Hunting Horn")]];
  u32 GunLance[[name("Gun Lance")]];
  u32 Bow;
};

// Blademaster
struct WepBMValue {
  u16 ModelID;
  u8  Rarity;
  u8  Unkn1; // Gunner Physx Table Index?
  u32 Price;
  u8  SharpnessID; // Sharpness Table Index
  u8  SharpnessAmount; // Visible Sharpness Steps (0-6)
  u16 Attack;
  u8  Defense;
  s8  Affinity;
  u8  EleType;
  u8  EleValue;
  u8  StatusType;
  u8  StatusValue;
  u8  Slots;
  u8  NoteGLType[[name("GL/Note Type")]];
  u8  Unkn2;
  u16 Sort_Order;
  u8  Unkn3;
}[[name(WepBMID[std::core::array_index()])]];

// Gunner
struct WepGunValue {
  u16 ModelID;
  u8  Rarity;
  u8  RangedPhysxTbl;
  u32 Price;
  u16 Attack;
  u8  Defense;
  u8  RecoilCharge[[name("Recoil/Charge Levels")]];
  u8  Slots;
  s8  Affinity;
  u16 Sort_Order;
  u8  BulletCharge[[name("Bullet/Charge Type")]];
  u8  EleType;
  u8  EleValue;
  u8  Reload; // Bowgun only, unsure what it does for Bow... for Bow seems to always be 0x02
  u32 Unkn1;
  ShotCoat ShotCoatings;
}[[name(WepGunID[std::core::array_index()])]];


// --------------------------------------------------------------------------------------

// Decoration Values

struct DecoValues {    // Actually part of the items table but they throw some deco data in...
  u16 Unkn1;
  u8  Rarity;
  u8  StackLimit;
  u8  IconDeco;   // 00 = regular jewel, 01 = "encased" jewel
  u8  IconID;
  u8  Color;
  u8  Unkn2;
  u32 Unkn3;
  u32 Price;
  u16 Unkn4;
  u16 Unkn5;
  u16 Unkn6;
  u16 SkillTblID; // Refer to DecoSkills
 }[[name(ItemID[std::core::array_index() + 948])]];

struct DecoSkillEntry {
  u8 Skill;
  s8 Amount;
}[[name(std::format("{} ({})", SkillID[Skill], Amount))]]; 

struct DecoSkill {
  u8  ReqSlots;
  u8  Unkn1;   // Always seems to be 0x0F
  u16 Unkn2;
  u32 Unkn3;   // 10, 20 and 30... no idea what these values do
  DecoSkillEntry Skills[3];
  u16 TERM;   // Technically could be a 4th skill 
}[[name(ItemID[std::core::array_index() + 948])]];

struct DecoSkillsTable {
  DecoSkill Dummy[[name("Empty"), hidden]];
  DecoSkill DecoSkills[168];
};

// --------------------------------------------------------------------------------------

// Farm RNG tables

struct FarmEntry {
  u16 Item[[name(ItemID[this])]];
  u16 Percent;
}[[name(std::format("{} ({}%)", ItemID[Item], Percent))]];

struct MiningTiers {
  FarmEntry Tier1[10];
  u32 NULL1[2][[hidden]];
  FarmEntry Tier2[22];
  u32 NULL2[2][[hidden]];
  FarmEntry Tier3[9];
  u32 NULL3[3][[hidden]];
  FarmEntry Tier4[10];
  u32 NULL4[2][[hidden]];
};

struct InsectTiers {
  FarmEntry Tier1[10];
  u32 NULL1[1][[hidden]];
  FarmEntry Tier2[11];
  FarmEntry Tier3[10];
  u32 NULL2[1][[hidden]];
  FarmEntry Tier4[11];
  FarmEntry Tier5[11];
};

struct MushroomTiers {
  FarmEntry Tier1[4];
  u32 NULL1[3][[hidden]];
  FarmEntry Tier2[6];
  u32 NULL2[1][[hidden]];
  FarmEntry Tier3[7];
};

struct BeehiveTiers {
  FarmEntry Tier1[3];
  FarmEntry Tier2[3];
  FarmEntry Tier3[3];
};

struct FarmTable {
  MiningTiers MiningPointFarm[[name("Mining Point")]];
  InsectTiers InsectPointFarm[[name("Insect Bushes")]];
  MushroomTiers MushroomPointFarm[[name("Mushroom Log")]];
  BeehiveTiers BeehivePointFarm[[name("Beehive")]];
};

FarmTable FarmTables @ 0x089995CC[[name("Farm Tables")]];

// --------------------------------------------------------------------------------------

// Output

// Weapon Class Modifiers
WepClassMod WeaponClassMods @ 0x08938104[[name("Weapon Class Modifiers")]];

// Equipment Create 
EquipmentCreateTable EquipmentCreate @ 0x08938D14[[name("Equipment Create")]];

// Equipment Upgrade
EquipUpgradeTable EquipmentUpgrade @ 0x0894CEA4[[name("Equipment Upgrade")]];

// Armor Values
ArmorValuePTR ArmorValues @ 0x08975970[[name("Armor Values")]];

// Blademaster Weapon Values
WepBMValue WepBMValues[1150] @ 0x089574C8[[name("Blademaster Weapon Values")]];

// Gunner Weapon Values
WepGunValue WepGunValues[354] @ 0x0895E098[[name("Gunner Weapon Values")]];

// Decoration Skills Table
DecoSkillsTable DecoSkills @ 0x08974EE0[[name("Decoration Skills Table")]];

// Model to Wep Type
WepTypeID Mod2WepType[553] @ 0x08975984[[name("Model to Weapon Type")]];

// Bowgun Shot Table
BowgunShots BGShotTable[58] @ 0x08975BF4[[name("Bowgun Shot Table")]];

// Bow Charge Table
BowCharges BowChargeTable[117] @ 0x08976334[[name("Bow Charge Table")]];

// Sharpness Table
SharpnessTable Sharpness @ 0x08976508[[name("Sharpness Table")]];

// Bowgun Mod Table
BGModTable BowgunMods @ 0x08976944[[name("Bowgun Mod Table")]];

// Dual Attribute Weapon Table
WepValueDualAttr WepDualAttr[15] @ 0x08976C54[[name("Dual Attribute Weapons")]];

// Decoration Values
DecoValues DecorationValues[169] @ 0x0899FB18[[name("Decoration Values")]];
