/*
 * "Unknown Monster?!" investigation quests (the quests.unknown setting): a
 * quest per rank whose monster, map, size, difficulty and rewards are
 * rolled again every time it's accepted. src/patches/unknown-quests.ts finds
 * the game's addresses and writes the tables below per disc; see also
 * ../docs/code-loader.md.
 *
 * How: each quest's ID is a new one, put on its board list here at every
 * load. When the game loads it (the quest load hook), the ID is swapped for
 * a real quest of the same rank, a "template", whose file the game reads
 * and decrypts as usual. After the load the hook rewrites the decrypted
 * quest: its large monster, level, size, crown spread, money, rewards and
 * text, and gives it back the new ID, which has a clear flag of its own.
 */
#include "rf.h"

/* Found or built per disc (src/patches/unknown-quests.ts). */
extern const u8 rf_uq_data[]; /* the tables, linked after the code */
extern u16 *rf_uq_lists[];    /* the boards' list pointer table */
extern u8 rf_uq_default_buf[]; /* where the loader decrypts with buf 0 */
u32 sceKernelGetSystemTimeLow(void);

#define NO_FILE 0xffff

/* A large monster record's starting point: stage, then rotation and x, y, z. */
#define START_STAGE 8
#define START_PLACE 28

/* Quest header fields. */
#define REWARDS 12
#define OBJECTIVE_A 0x28
#define OBJECTIVE_B 0x30
#define OBJECTIVE_MONSTER 1
#define SIZE 0x38
#define CROWNS 0x4a
#define QUEST_TYPE 76
#define FEE 80
#define REWARD 84
#define PENALTY 88
#define STRINGS 96
#define QUEST_ID 100
#define STARS 102
#define TARGET 112
/* Urgent and key quests move the story on; these never do. */
#define STORY ((1u << 25) | (1u << 26))

/* The tables' layout (written by src/patches/unknown-quests.ts). */
struct data {
  u32 magic;
  u32 slots;
  u32 slot_off;
  u32 names_off; /* u16 offset per emID (0 = none), from names_off, of a name */
};
struct slot {
  u16 id;
  u8 stars;
  u8 crown_max; /* the highest size variation (crowns) to roll */
  u16 list; /* index in the list pointer table */
  u16 templates;
  u32 template_off;
  u32 fee, reward, penalty;
  u8 size_lo, size_hi;
  u16 pad;
  u32 text_off;   /* title, goal prefix, fail, details, client, unknown name */
  u32 board_list; /* the list's address in the EBOOT, as on the disc */
};
struct template {
  u16 quest_id;
  u16 size; /* payload bytes */
  u8 choices;
  u8 pad[3];
  u32 choice_off; /* struct choice[choices] */
  u32 patch_off;  /* u16 offsets of species fields, 0, of level bytes, 0 */
};
struct choice {
  u8 species;
  u8 level_lo, level_hi;
  u8 rewards;     /* reward sets; 0 keeps the template's */
  u32 reward_off; /* u32 offsets of reward sets */
  /*
   * 0, or where records move to a point the disc starts this monster's
   * kind at: per record u16 offset, u16 stage, u32 rotation, f32 x, y, z;
   * until an offset of 0.
   */
  u32 start_off;
};

#define DATA_MAGIC 0x31445155 /* "UQD1" */
#define MAX_SLOTS 4
#define MAX_LIST 80 /* the board shows at most 80 quests a star */

/* Zeroed data comes zeroed from the file at every load. */
static u16 lists[MAX_SLOTS][MAX_LIST + 2];
static u32 state;

static struct {
  const struct slot *slot;
  const struct template *template;
  const struct choice *choice;
  u32 level, size, crowns, rewards;
  u32 pending, depart;
} roll;

#define AT(type, off) ((const type *)(rf_uq_data + (off)))

static const struct data *data(void) {
  const struct data *d = AT(struct data, 0);
  return d->magic == DATA_MAGIC ? d : 0;
}

/* xorshift32, seeded from the system timer on each roll. */
static u32 rnd(u32 n) {
  state ^= state << 13;
  state ^= state >> 17;
  state ^= state << 5;
  return n ? state % n : 0;
}

static const struct slot *find_slot(u32 id) {
  const struct data *d = data();
  if (!d) return 0;
  for (u32 k = 0; k < d->slots; k++) {
    const struct slot *s = AT(struct slot, d->slot_off) + k;
    if (s->id == id) return s;
  }
  return 0;
}

static void roll_quest(const struct slot *s) {
  state = sceKernelGetSystemTimeLow() | 1;
  roll.slot = s;
  roll.template = AT(struct template, s->template_off) + rnd(s->templates);
  roll.choice = AT(struct choice, roll.template->choice_off) + rnd(roll.template->choices);
  const struct choice *c = roll.choice;
  roll.level = c->level_lo + rnd(c->level_hi - c->level_lo + 1);
  roll.size = s->size_lo + rnd(s->size_hi - s->size_lo + 1);
  roll.crowns = rnd(s->crown_max + 1);
  roll.rewards = rnd(c->rewards);
}

static void put16(u8 *at, u32 v) {
  at[0] = v;
  at[1] = v >> 8;
}
static void put32(u8 *at, u32 v) {
  put16(at, v);
  put16(at + 2, v >> 16);
}
static u32 get16(const u8 *at) { return at[0] | at[1] << 8; }
static u32 get32(const u8 *at) { return get16(at) | get16(at + 2) << 16; }

static u32 copy_string(u8 *to, const u8 *from) {
  u32 n = 0;
  while (from[n]) {
    to[n] = from[n];
    n++;
  }
  to[n] = 0;
  return n + 1;
}
static const u8 *next_string(const u8 *s) {
  while (*s) s++;
  return s + 1;
}

static const u8 *name_of(u32 em) {
  const struct data *d = data();
  u32 off = get16(rf_uq_data + d->names_off + em * 2);
  return off ? rf_uq_data + d->names_off + off : 0;
}

/*
 * The rewards: a set is a u16 table count, then per table u16 kind, u16
 * draws, u16 items and the items (u16 chance, item, amount). Written as
 * quest files have them: the tables (8 bytes, until 0xFFFF), then each
 * one's items (6 bytes, until a chance of 0xFFFF). Returns the bytes used.
 */
static u32 write_rewards(u8 *quest, u32 at, const u8 *set) {
  u32 tables = get16(set);
  u32 items = at + tables * 8 + 4;
  const u8 *from = set + 2;
  for (u32 t = 0; t < tables; t++) {
    u32 count = get16(from + 4);
    u8 *entry = quest + at + t * 8;
    put16(entry, get16(from));
    put16(entry + 2, get16(from + 2));
    put32(entry + 4, items);
    from += 6;
    for (u32 k = 0; k < count * 3; k++, from += 2) put16(quest + items + k * 2, get16(from));
    items += count * 6;
    put16(quest + items, 0xffff);
    put16(quest + items + 2, 0);
    put16(quest + items + 4, 0);
    items += 6;
  }
  put16(quest + at + tables * 8, 0xffff);
  put16(quest + at + tables * 8 + 2, 0);
  return ((items - at) + 3) & ~3u;
}

/*
 * The text: one block of six strings every language slot points at (the
 * JP disc's quests share one the same way). Accepting it in town names no
 * monster, like the board; the quest itself does once it starts.
 */
static void write_text(u8 *quest, u32 at, const struct slot *s, const u8 *name) {
  const u8 *title = rf_uq_data + s->text_off;
  const u8 *goal = next_string(title);
  const u8 *fail = next_string(goal);
  const u8 *details = next_string(fail);
  const u8 *client = next_string(details);
  const u8 *unknown = next_string(client);
  if (!name) name = unknown;
  u32 ptrs[6];
  u32 p = at;
  ptrs[0] = p;
  p += copy_string(quest + p, title);
  ptrs[1] = p;
  p += copy_string(quest + p, goal) - 1;
  p += copy_string(quest + p, name);
  ptrs[2] = p;
  p += copy_string(quest + p, fail);
  ptrs[3] = p;
  p += copy_string(quest + p, details);
  ptrs[4] = p;
  p += copy_string(quest + p, name);
  ptrs[5] = p;
  p += copy_string(quest + p, client);
  p = (p + 3) & ~3u;
  u32 block = p;
  for (u32 k = 0; k < 6; k++, p += 4) put32(quest + p, ptrs[k]);
  u32 langs = p;
  for (u32 k = 0; k < 7; k++, p += 4) put32(quest + p, block);
  put32(quest + STRINGS, langs);
}

static void patch(u8 *quest) {
  const struct slot *s = roll.slot;
  const struct template *t = roll.template;
  const struct choice *c = roll.choice;
  const u8 *offsets = rf_uq_data + t->patch_off;
  u32 off;
  while ((off = get16(offsets)) != 0) {
    put16(quest + off, c->species);
    offsets += 2;
  }
  offsets += 2;
  while ((off = get16(offsets)) != 0) {
    quest[off] = roll.level;
    offsets += 2;
  }
  for (const u8 *p = c->start_off ? rf_uq_data + c->start_off : 0; p && (off = get16(p)) != 0;
       p += 20) {
    put16(quest + off + START_STAGE, get16(p + 2));
    for (u32 k = 0; k < 16; k += 4) put32(quest + off + START_PLACE + k, get32(p + 4 + k));
  }
  put16(quest + QUEST_ID, s->id);
  quest[STARS] = s->stars;
  put16(quest + TARGET, c->species);
  if (get32(quest + OBJECTIVE_A) == OBJECTIVE_MONSTER) put16(quest + OBJECTIVE_A + 4, c->species);
  if (get32(quest + OBJECTIVE_B) == OBJECTIVE_MONSTER) put16(quest + OBJECTIVE_B + 4, c->species);
  quest[SIZE] = roll.size;
  quest[CROWNS] = roll.crowns;
  put32(quest + QUEST_TYPE, get32(quest + QUEST_TYPE) & ~STORY);
  put32(quest + FEE, s->fee);
  put32(quest + REWARD, s->reward);
  put32(quest + PENALTY, s->penalty);

  /* New rewards and text go after the quest, inside the loader's buffer. */
  u32 at = (t->size + 3) & ~3u;
  if (c->rewards) {
    const u8 *set = rf_uq_data + get32(rf_uq_data + c->reward_off + roll.rewards * 4);
    put32(quest + REWARDS, at);
    at += write_rewards(quest, at, set);
  }
  write_text(quest, at, s, roll.depart ? name_of(c->species) : 0);
}

static void on_load(u8 *arg) {
  struct rf_load *l = (struct rf_load *)arg;
  if (l->phase == RF_LOAD_AFTER) {
    if (roll.pending && (l->result & 0xff) == 1) {
      patch(l->buf ? l->buf : rf_uq_default_buf);
      roll.pending = 0;
    }
    return;
  }
  const struct slot *s = find_slot(l->id & 0xffff);
  if (!s) {
    roll.pending = 0;
    return;
  }
  if (l->quest[RF_QUEST_LOADER_STEP] == 0) {
    /* A new load: roll on accepting; departing loads the accepted roll again. */
    if (l->phase == RF_LOAD_ACCEPT || roll.slot != s) roll_quest(s);
    roll.depart = l->phase == RF_LOAD_DEPART;
    /* The buffer holds the template unpatched or another roll: read it again. */
    put16(l->quest + RF_QUEST_LOADED_FILE, NO_FILE);
    roll.pending = 1;
  }
  if (roll.template) l->id = roll.template->quest_id;
}

/* Puts each slot's ID on its board list: a copy, since the lists are packed. */
static void add_to_boards(const struct data *d) {
  for (u32 k = 0; k < d->slots && k < MAX_SLOTS; k++) {
    const struct slot *s = AT(struct slot, d->slot_off) + k;
    const u16 *from = (const u16 *)s->board_list;
    u32 n = 0;
    for (u32 i = 0; from[i] && n < MAX_LIST - 1; i++) {
      if (from[i] != s->id) lists[k][n++] = from[i];
    }
    lists[k][n++] = s->id;
    lists[k][n] = 0;
    rf_uq_lists[s->list] = lists[k];
  }
}

void rf_unknown_quests_init(u32 reason, u8 *save) {
  (void)reason;
  (void)save;
  const struct data *d = data();
  if (!d) return;
  add_to_boards(d);
  rf_on(RF_HOOK_QUEST_LOAD, on_load);
}
