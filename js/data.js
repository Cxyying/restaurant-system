// ===================== 共享数据层（后端版）=====================
// 改造说明：原来用 localStorage 存数据，现在改为从后端服务器获取
//
// 关键变化：
//   - getStore()  → 从内存缓存读取（同步，接口不变）
//   - saveStore() → 更新内存缓存 + 发送到后端（同步，接口不变）
//   - initStore() → 从后端加载初始数据（需要 async）
//   - refreshStore() → 从后端刷新数据（async，轮询用）
//
// 原理：数据存在服务器的 data.json 文件里，所有设备通过网络
// 访问同一个文件，所以不同手机/电脑能看到同一份数据。

const API_BASE = '/api';  // 后端 API 地址（同源，相对路径即可）

// 内存缓存：从后端拿到的数据存在这个变量里
let _storeCache = null;

// ---- 从后端读取全部数据（异步）----
async function fetchStoreFromBackend() {
  try {
    const res = await fetch(API_BASE + '/data');
    if (res.ok) {
      _storeCache = await res.json();
      return _storeCache;
    }
  } catch (e) {
    console.error('从后端获取数据失败:', e);
  }
  return null;
}

// ---- 初始化数据（页面加载时调用，需要 async）----
async function initStore() {
  const data = await fetchStoreFromBackend();
  if (data && data.initialized) {
    _storeCache = data;
    return _storeCache;
  }
  // 后端不可用时，使用本地默认数据（降级方案）
  console.warn('后端不可用，使用本地默认数据');
  _storeCache = getDefaultData();
  return _storeCache;
}

// ---- 本地默认数据（降级方案，后端挂了时用）----
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

// ---- 读取数据（同步）----
// 从内存缓存读取，接口跟之前完全一样
// app.js 和 admin.js 里的 store = getStore() 不需要改
function getStore() {
  return _storeCache;
}

// ---- 保存数据（同步 + 后台异步发送）----
// 先立刻更新内存缓存（保证UI马上能看到变化）
// 然后后台发送到服务器（不阻塞UI，"fire-and-forget"模式）
function saveStore(data) {
  _storeCache = data;  // 立刻更新本地缓存
  // 后台发送到服务器，不等待结果
  fetch(API_BASE + '/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).catch(e => console.error('保存到后端失败:', e));
}

// ---- 刷新数据（异步，轮询用）----
// 从后端获取最新数据，更新内存缓存
// 不返回值，只是默默更新 _storeCache
// 调用后，下次 getStore() 就能拿到最新数据了
function refreshStore() {
  fetch(API_BASE + '/data')
    .then(res => res.json())
    .then(data => { _storeCache = data; })
    .catch(e => console.error('刷新数据失败:', e));
}

// ---- 重置数据（管理后台"清除所有数据"用）----
async function resetStore() {
  try {
    const res = await fetch(API_BASE + '/reset', { method: 'POST' });
    if (res.ok) {
      _storeCache = await res.json();
      return _storeCache;
    }
  } catch (e) {
    console.error('重置数据失败:', e);
  }
  return null;
}

// ===================== 公共工具函数 =====================
function showToast(msg, duration) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration || 2500);
}

function formatPrice(p) { return '¥' + Number(p).toFixed(2); }
function formatTime(iso) { const d = new Date(iso); return d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); }

// 状态标签常量
const statusLabels = { pending:'待出餐', served:'已出餐', completed:'已完成', cancelled:'已取消' };
const statusClasses = { pending:'tag-pending', served:'tag-served', completed:'tag-completed', cancelled:'tag-cancelled' };
const tableStatusLabels = { free:'空闲', occupied:'用餐中', reserved:'已预订' };
const tableStatusClasses = { free:'tag-free', occupied:'tag-occupied', reserved:'tag-reserved' };

// 菜品标签渲染（统一图标和样式）
const BADGE_MAP = {
  hot:  '<span class="badge badge-hot">🔥 热销</span>',
  new:  '<span class="badge badge-new">✨ 新品</span>',
  spicy: '<span class="badge badge-spicy">🌶️ 辣</span>'
};
function renderBadges(badges) {
  if (!badges || !badges.length) return '';
  return badges.map(b => BADGE_MAP[b]).filter(Boolean).join('');
}
