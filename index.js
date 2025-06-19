const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalBlock } } = require('mineflayer-pathfinder');
const mcDataLoader = require('minecraft-data');
const Vec3 = require('vec3');

const bot = mineflayer.createBot({
  host: 'yuvix67.aternos.me',
  port: 40185,
  username: 'FarmerBot',
  version: '1.20.4'
});

bot.loadPlugin(pathfinder);

let mcData;
let isWorking = false;

bot.once('spawn', () => {
  mcData = mcDataLoader(bot.version);

  const defaultMove = new Movements(bot, mcData);
  defaultMove.allowSprinting = true;
  defaultMove.canDig = false;
  defaultMove.allow1by1towers = false;
  defaultMove.jumpCost = 10000;
  bot.pathfinder.setMovements(defaultMove);

  bot.chat('🌾 FarmerBot is online!');
  setInterval(runFarmTask, 2000);
});

async function runFarmTask() {
  if (isWorking) return;
  isWorking = true;

  try {
    const wheatBlock = bot.findBlock({
      matching: b => b.name === 'wheat' && b.metadata === 7,
      maxDistance: 32
    });

    if (!wheatBlock) {
      isWorking = false;
      return;
    }

    await bot.pathfinder.goto(new GoalBlock(wheatBlock.position.x, wheatBlock.position.y, wheatBlock.position.z));
    await bot.dig(wheatBlock);
    bot.chat('🪓 Harvested wheat');

    await bot.waitForTicks(10);
    await collectNearbyItems(wheatBlock.position);

    const soil = bot.blockAt(wheatBlock.position.offset(0, -1, 0));
    const seed = bot.inventory.items().find(i => i.name === 'wheat_seeds');

    if (seed && soil?.name === 'farmland') {
      await bot.equip(seed, 'hand');
      await bot.placeBlock(soil, new Vec3(0, 1, 0));
      bot.chat('🌱 Replanted seed');
    }

    await storeItems();

  } catch (err) {
    console.log('❌ Error during farming:', err.message);
  } finally {
    isWorking = false;
  }
}

async function collectNearbyItems(center) {
  const items = Object.values(bot.entities).filter(e =>
    e.entityType === 64 && e.position.distanceTo(center) < 3
  );

  for (let item of items) {
    const pos = item.position.floored();
    try {
      await bot.pathfinder.goto(new GoalBlock(pos.x, pos.y, pos.z));
      await bot.waitForTicks(5);
    } catch (err) {
      console.log('⚠️ Couldn’t collect item:', err.message);
    }
  }
}

async function storeItems() {
  const chests = bot.findBlocks({
    matching: block => block.name === 'chest',
    maxDistance: 100,
    count: 5
  });

  if (!chests || chests.length === 0) {
    bot.chat('❌ No chest found.');
    return;
  }

  let closestChest = null;
  let shortestDist = Infinity;

  // Go through all nearby chests and pick the closest path (not just block distance)
  for (let pos of chests) {
    const dist = bot.entity.position.distanceTo(pos);
    if (dist < shortestDist) {
      shortestDist = dist;
      closestChest = pos;
    }
  }

  if (!closestChest) {
    bot.chat('⚠️ Could not pick a reachable chest.');
    return;
  }

  try {
    await bot.pathfinder.goto(new GoalBlock(closestChest.x, closestChest.y, closestChest.z));
    const chestBlock = bot.blockAt(closestChest);
    const container = await bot.openChest(chestBlock);

    const wheatItems = bot.inventory.items().filter(i => i.name === 'wheat');
    for (const wheat of wheatItems) {
      await container.deposit(wheat.type, null, wheat.count);
    }

    const seeds = bot.inventory.items().find(i => i.name === 'wheat_seeds');
    if (seeds && seeds.count > 1) {
      await container.deposit(seeds.type, null, seeds.count - 1);
    }

    await container.close();
    bot.chat('📦 Stored wheat & extra seeds');

  } catch (err) {
    console.log('❌ Chest storage error:', err.message);
  }
}

// Error handling
bot.on('kicked', reason => console.log('❌ Kicked:', reason));
bot.on('error', err => console.log('❌ Error:', err));
bot.on('end', () => console.log('❌ Bot disconnected'));
