'use strict';
// Player names are unique. "Neon Tiger", "neon tiger" and "NeonTiger" all count as the same name.
const nameKey = tag => tag.normalize('NFKC').toLowerCase().replace(/\s+/g, '');

const RESERVED = new Set(['bot', 'player']);
const isReserved = tag => RESERVED.has(nameKey(tag));

// Finds a free version of a name by adding a number. Used when older saved data holds duplicates.
function distinctName(tag, isTaken) {
  for (let i = 2; ; i++) {
    const end = ` ${i}`, name = [...tag].slice(0, 16 - end.length).join('').trim() + end;
    if (!isTaken(nameKey(name))) return name;
  }
}

module.exports = { nameKey, isReserved, distinctName };
