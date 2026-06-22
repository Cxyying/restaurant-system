// ===================== 西荣餐厅后端服务器 =====================
// 技术栈：Node.js + Express + MongoDB Atlas（云部署）/ JSON文件（本地开发）
//
// 部署方式：
//   本地开发：直接 node server.js（用 data.json 存数据）
//   云部署：设置 MONGODB_URI 环境变量（用 MongoDB Atlas 存数据，永远不会丢）
//
// 这个文件做了三件事：
// 1. 启动一个 Web 服务器（Express）
// 2. 提供三个 API 接口让前端读写数据
// 3. 把前端 HTML/CSS/JS 文件当作静态网页托管出去

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;  // 云平台会自动设置 PORT 环境变量

// ---- 中间件 ----
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ---- 数据存储方式 ----
// 两种模式：
//   1. 云部署：设置了 MONGODB_URI → 用 MongoDB Atlas（数据永远不丢）
//   2. 本地开发：没设置 MONGODB_URI → 用 data.json 文件（方便调试）
const MONGODB_URI = process.env.MONGODB_URI;
const DATA_FILE = path.join(__dirname, 'data.json');
const DB_NAME = 'restaurant';
const COLLECTION_NAME = 'data';

let mongoClient = null;
let mongoCollection = null;
let useMongoDB = false;

// ---- 连接 MongoDB（异步，服务器启动时调用）----
async function connectMongoDB() {
  if (!MONGODB_URI) {
    console.log('  ⚡ 未设置 MONGODB_URI，使用本地 data.json 存数据');
    return false;
  }
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    const db = mongoClient.db(DB_NAME);
    mongoCollection = db.collection(COLLECTION_NAME);
    useMongoDB = true;
    console.log('  ✅ 已连接 MongoDB Atlas（数据云端持久保存）');
    return true;
  } catch (e) {
    console.error('  ❌ MongoDB 连接失败:', e.message);
    console.log('  ⚡ 将回退到本地 data.json 模式');
    return false;
  }
}

// ---- 默认数据（第一次运行时写入）----
function getDefaultData() {
  return {
    initialized: true,
    restaurantName: '西荣餐厅',
    tables: Array.from({length:12}, (_,i) => ({
      id: i+1, name: `${i+1}号桌`, seats: [2,4,4,6,2,4,6,4,2,4,4,6][i],
      status: 'free',
      currentSessionId: 1,
      sessionStartTime: 0,
      sessionPhone: null,
      reservedBy: null, reservedAt: null, reservedTime: null, reservedNote: null
    })),
    categories: [
      {id:1, name:'招牌菜', icon:'⭐'},
      {id:2, name:'热菜', icon:'🔥'},
      {id:3, name:'凉菜', icon:'🥗'},
      {id:4, name:'汤类', icon:'🍲'},
      {id:5, name:'主食', icon:'🍚'},
      {id:6, name:'饮品', icon:'🥤'},
    ],
    dishes: [
      {id:1,catId:1,name:'招牌红烧肉',desc:'选用五花肉，秘制酱料慢炖3小时，肥而不腻，入口即化',price:58,emoji:'🥩',badges:['hot','spicy'],sold:0,available:true},
      {id:2,catId:1,name:'夫妻肺片',desc:'百年传统工艺，麻辣鲜香，牛肉切片薄如纸，口感Q弹',price:38,emoji:'🥜',badges:['hot'],sold:0,available:true},
      {id:3,catId:1,name:'剁椒鱼头',desc:'新鲜草鱼头，搭配特制剁椒，湘菜经典之作',price:68,emoji:'🐟',badges:['hot','spicy'],sold:0,available:true},
      {id:4,catId:2,name:'宫保鸡丁',desc:'鸡肉嫩滑，花生香脆，酸甜微辣，川菜代表作',price:42,emoji:'🍗',badges:['hot'],sold:0,available:true},
      {id:5,catId:2,name:'鱼香肉丝',desc:'猪肉丝配木耳、笋丝，鱼香汁裹匀，味道层次丰富',price:36,emoji:'🥩',badges:[],sold:0,available:true},
      {id:6,catId:2,name:'清炒时蔬',desc:'当季新鲜蔬菜，大火爆炒，脆嫩爽口，健康美味',price:22,emoji:'🥦',badges:['new'],sold:0,available:true},
      {id:7,catId:2,name:'麻婆豆腐',desc:'嫩豆腐配牛肉末，麻辣鲜香，豆腐滑嫩入味',price:28,emoji:'🍱',badges:['spicy'],sold:0,available:true},
      {id:8,catId:3,name:'凉拌黄瓜',desc:'新鲜黄瓜拍碎，大蒜香油调味，清爽开胃',price:16,emoji:'🥒',badges:[],sold:0,available:true},
      {id:9,catId:3,name:'口水鸡',desc:'整鸡蒸熟浸凉，淋上特制红油，麻辣鲜香',price:46,emoji:'🍗',badges:['hot','spicy'],sold:0,available:true},
      {id:10,catId:4,name:'番茄蛋花汤',desc:'新鲜西红柿，鸡蛋花，家的味道，暖胃养人',price:18,emoji:'🍅',badges:[],sold:0,available:true},
      {id:11,catId:4,name:'酸辣汤',desc:'木耳、豆腐、猪血，酸辣可口，开胃去腻',price:22,emoji:'🫕',badges:['spicy'],sold:0,available:true},
      {id:12,catId:5,name:'扬州炒饭',desc:'隔夜米饭配鸡蛋、火腿、青豆，粒粒分明',price:18,emoji:'🍳',badges:[],sold:0,available:true},
      {id:13,catId:5,name:'葱油面',desc:'手工面条，葱油香气四溢，简单但令人回味',price:14,emoji:'🍜',badges:['new'],sold:0,available:true},
      {id:14,catId:6,name:'酸梅汤',desc:'传统工艺熬制，酸甜开胃，解暑消渴',price:12,emoji:'🥤',badges:[],sold:0,available:true},
      {id:15,catId:6,name:'现榨橙汁',desc:'新鲜橙子现榨，维C满满，酸甜可口',price:18,emoji:'🍊',badges:['new'],sold:0,available:true},
    ],
    orders: [],
    ratings: [],
    urges: [],
    calls: [],
  };
}

// ---- 读数据（支持 MongoDB 和本地文件两种模式）----
async function readData() {
  if (useMongoDB) {
    // 从 MongoDB Atlas 读取
    const doc = await mongoCollection.findOne({ _id: 'main_data' });
    if (doc) {
      // MongoDB 文档里有 _id 字段，去掉它再返回给前端
      const data = { ...doc };
      delete data._id;
      return data;
    }
    // MongoDB 里没有数据 → 初始化默认数据
    const defaultData = getDefaultData();
    await writeData(defaultData);
    return defaultData;
  } else {
    // 从 data.json 文件读取
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('读取 data.json 失败:', e.message);
    }
    const defaultData = getDefaultData();
    writeDataLocal(defaultData);
    return defaultData;
  }
}

// ---- 写数据（支持 MongoDB 和本地文件两种模式）----
async function writeData(data) {
  if (useMongoDB) {
    // 写入 MongoDB Atlas（云端持久保存，服务器重启数据不会丢）
    await mongoCollection.replaceOne(
      { _id: 'main_data' },
      { ...data, _id: 'main_data' },
      { upsert: true }  // 如果不存在就创建，存在就更新
    );
  } else {
    // 写入本地 data.json 文件
    writeDataLocal(data);
  }
}

// ---- 本地文件写入（只在本地开发模式下使用）----
function writeDataLocal(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ---- 数据迁移和修复 ----
function migrateData(data) {
  let migrated = false;
  const validStatuses = ['pending', 'served', 'completed', 'cancelled'];

  (data.orders || []).forEach(o => {
    if (!validStatuses.includes(o.status)) {
      if (o.status === 'cooking' || o.status === 'ready') o.status = 'pending';
      migrated = true;
    }
    (o.items || []).forEach(i => {
      if (i.served === undefined) { i.served = (o.status === 'served'); migrated = true; }
    });
    if (o.paid === undefined) { o.paid = false; migrated = true; }
    if (o.tableSessionId === undefined || o.tableSessionId <= 0) { o.tableSessionId = -1; migrated = true; }
  });

  (data.tables || []).forEach(t => {
    if (t.currentSessionId === undefined || t.currentSessionId < 1) { t.currentSessionId = 1; migrated = true; }
    if (t.sessionPhone === undefined) { t.sessionPhone = null; migrated = true; }
    if (t.sessionStartTime === undefined) { t.sessionStartTime = 0; migrated = true; }
    if (t.reservedBy === undefined) { t.reservedBy = null; migrated = true; }
    if (t.reservedAt === undefined) { t.reservedAt = null; migrated = true; }
    if (t.reservedTime === undefined) { t.reservedTime = null; migrated = true; }
    if (t.reservedNote === undefined) { t.reservedNote = null; migrated = true; }
  });

  if (!data.urges) { data.urges = []; migrated = true; }
  if (!data.calls) { data.calls = []; migrated = true; }
  if (!data.ratings) { data.ratings = []; migrated = true; }

  (data.dishes || []).forEach(d => d.sold = 0);
  (data.orders || []).forEach(o => {
    if (o.status !== 'cancelled') {
      (o.items || []).forEach(item => {
        const dish = (data.dishes || []).find(d => d.id === item.dishId);
        if (dish) dish.sold = (dish.sold || 0) + (item.qty || 0);
      });
    }
  });
  migrated = true;

  return data;
}

// ===================== API 路由 =====================

// GET /api/data — 获取全部数据
app.get('/api/data', async (req, res) => {
  try {
    let data = await readData();
    data = migrateData(data);
    // 有变化就保存
    await writeData(data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: '读取数据失败: ' + e.message });
  }
});

// POST /api/data — 保存全部数据
app.post('/api/data', async (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.initialized) {
      return res.status(400).json({ error: '数据格式不正确' });
    }
    await writeData(data);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '保存数据失败: ' + e.message });
  }
});

// POST /api/reset — 重置为默认数据
app.post('/api/reset', async (req, res) => {
  try {
    const defaultData = getDefaultData();
    await writeData(defaultData);
    res.json({ success: true, data: defaultData });
  } catch (e) {
    res.status(500).json({ error: '重置数据失败: ' + e.message });
  }
});

// ===================== 静态文件托管 =====================
const FRONTEND_DIR = path.join(__dirname, '..');
app.use(express.static(FRONTEND_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ===================== 启动服务器 =====================
async function startServer() {
  // 先连接 MongoDB（如果配置了的话）
  await connectMongoDB();

  // 防止云平台自动休眠（Render 免费15分钟后会休眠，自动ping保持活跃）
  if (process.env.RENDER && process.env.RENDER_EXTERNAL_URL) {
    const pingUrl = process.env.RENDER_EXTERNAL_URL + '/api/data';
    setInterval(() => {
      fetch(pingUrl).catch(() => {});
    }, 14 * 60 * 1000); // 每14分钟ping一次自己
    console.log('  🔄 已启用防休眠机制（每14分钟自动ping）');
  }

  app.listen(PORT, () => {
    console.log('========================================');
    console.log('  西荣餐厅后端服务器已启动！');
    console.log('========================================');
    console.log('');
    console.log('  数据存储方式：');
    if (useMongoDB) {
      console.log('    MongoDB Atlas（云端持久保存）');
    } else {
      console.log('    本地 data.json 文件');
      console.log('    ' + DATA_FILE);
    }
    console.log('');
    console.log('  顾客端：');
    console.log('    http://localhost:' + PORT + '/app.html');
    console.log('');
    console.log('  管理后台：');
    console.log('    http://localhost:' + PORT + '/admin.html');
    console.log('');
    console.log('  按 Ctrl+C 停止服务器');
    console.log('========================================');
  });
}

startServer().catch(e => {
  console.error('服务器启动失败:', e);
  process.exit(1);
});
