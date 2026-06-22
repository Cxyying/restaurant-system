// ===================== 状态变量 =====================
let currentTable = null;
let cart = {}; // {dishId: qty}
let currentPage = 'home';
let ratingScore = 5;
let currentUser = null; // 当前登录用户手机号
let store = null; // 从后端加载后填充
let urgeTimer = null; // 催单倒计时定时器
let selectedReserveTableId = null; // 当前选中的预约桌位

// ===================== 工具函数 =====================
function hideModal(id) {
  document.getElementById(id).classList.remove('show');
}

function cartTotal() {
  let total = 0;
  Object.entries(cart).forEach(([id, qty]) => {
    const dish = store.dishes.find(d => d.id == id);
    if (dish) total += dish.price * qty;
  });
  return total;
}

function cartCount() {
  return Object.values(cart).reduce((a,b) => a+b, 0);
}

// ===================== 登录功能 =====================
function handleLogin() {
  const input = document.getElementById('phoneInput');
  const hint = document.getElementById('loginHint');
  const phone = input.value.trim();

  // 验证：必须11位纯数字
  if (!phone) {
    hint.textContent = '⚠️ 请输入手机号码';
    hint.classList.add('error');
    shakeInput(input);
    return;
  }
  if (!/^\d{11}$/.test(phone)) {
    hint.textContent = '⚠️ 手机号格式不正确，请输入11位数字';
    hint.classList.add('error');
    shakeInput(input);
    return;
  }
  // 简单校验：手机号以1开头，第二位为3-9
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    hint.textContent = '⚠️ 手机号无效（请输入正确的11位号码）';
    hint.classList.add('error');
    shakeInput(input);
    return;
  }

  // 登录成功
  currentUser = phone;
  sessionStorage.setItem('restaurant_user', phone);

  hint.textContent = '✅ 登录成功！正在进入...';
  hint.classList.remove('error');

  // 更新"我的"页显示
  updateUserCard();

  // 延迟一点让用户看到成功提示，然后切换到主界面
  setTimeout(function() {
    document.getElementById('loginPage').style.display = 'none';
    showPage('home');
    backToChoice();
    startWelcomeAnimation();
    showToast('欢迎您，' + maskPhone(phone) + ' 🎉');
  }, 600);
}

// 手机号脱敏显示（中间4位变星号）
function maskPhone(phone) {
  if (phone && phone.length === 11) {
    return phone.substring(0, 3) + '****' + phone.substring(7);
  }
  return phone || '';
}

// 输入时清除错误提示
function onPhoneInput() {
  var hint = document.getElementById('loginHint');
  hint.classList.remove('error');
  hint.textContent = '请输入11位手机号码';
}

// 回车键登录
function onPhoneKeydown(e) {
  if (e.key === 'Enter') handleLogin();
}

// 更新"我的"页用户信息卡片 + 首页用户栏
function updateUserCard() {
  var info = document.getElementById('userTableInfo');
  var seat = document.getElementById('userTableSeat');
  if (info) {
    // 主行显示手机号（带小眼睛切换功能）
    if (currentUser && currentUser.length === 11) {
      var masked = currentUser.substring(0, 3) + '****' + currentUser.substring(7);
      info.innerHTML = '<span class="phone-text" data-full="' + currentUser + '" data-masked="' + masked + '">' +
        masked + '</span><span class="eye-toggle-mine" onclick="toggleMinePhoneShow(this)">👁️</span>';
    } else {
      info.textContent = '未登录';
    }
  }
  if (seat) {
    // 副行显示桌号信息
    if (currentTable) {
      store = store || getStore();
      const tbl = store.tables.find(t => t.id === currentTable);
      seat.textContent = tbl ? tbl.name + ' · 感谢您的光临 🙏' : '感谢您的光临 🙏';
    } else {
      seat.textContent = '感谢您的光临 🙏';
    }
  }
  // 首页欢迎横幅中的用户信息
  var homePhone = document.getElementById('homeUserPhone');
  var homeBar = document.getElementById('homeUserBar');
  if (homePhone && homeBar) {
    homePhone.textContent = currentUser ? maskPhone(currentUser) : '';
    homeBar.style.display = currentUser ? 'flex' : 'none';
  }
}

// "我的"页手机号小眼睛切换
function toggleMinePhoneShow(eyeEl) {
  var textSpan = eyeEl.previousElementSibling;
  if (!textSpan || !textSpan.classList.contains('phone-text')) return;
  var current = textSpan.textContent;
  var full = textSpan.getAttribute('data-full');
  var masked = textSpan.getAttribute('data-masked');
  if (current === full) {
    textSpan.textContent = masked;
    eyeEl.textContent = '👁️';
  } else {
    textSpan.textContent = full;
    eyeEl.textContent = '🙈';
  }
}

// 根据当前桌位订单状态更新催单按钮
function updateUrgeBtnState() {
  var btn = document.getElementById('urgeBtn');
  if (!btn) return;

  // 先清除可能正在运行的倒计时
  if (urgeTimer) {
    clearInterval(urgeTimer);
    urgeTimer = null;
  }

  if (!currentTable) {
    btn.style.display = 'none';
    return;
  }
  // 只要入了座就始终显示催促按钮
  btn.style.display = 'block';
  store = getStore();
  var table = store.tables.find(function(t) { return t.id === currentTable; });
  // 只查询当前会话的活跃订单（排除已完成的旧订单和已取消订单）
  var tableOrders = store.orders.filter(function(o) {
    return o.tableId === currentTable
      && o.status !== 'completed'
      && o.status !== 'cancelled'
      && (!table || o.tableSessionId === table.currentSessionId);
  });
  var hasPending = tableOrders.some(function(o) { return o.status === 'pending'; });

  // 检查冷却状态（sessionStorage保存上次催单时间戳）
  var lastUrgeTime = parseInt(sessionStorage.getItem('restaurant_urge_at') || '0', 10);
  var COOLDOWN = 180; // 3分钟
  var elapsed = Math.floor((Date.now() - lastUrgeTime) / 1000);

  if (hasPending) {
    if (elapsed > 0 && elapsed < COOLDOWN) {
      // 冷却中 → 恢复倒计时
      btn.disabled = true;
      var remaining = COOLDOWN - elapsed;
      function fmt(sec) {
        var m = Math.floor(sec / 60);
        var s = sec % 60;
        return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      }
      btn.textContent = '✅ 已催单，请在 ' + fmt(remaining) + ' 后再次催促';
      btn.className = 'urge-btn';
      urgeTimer = setInterval(function() {
        remaining--;
        // 每次倒数都重新读取最新数据，检查是否已出餐
        var freshStore = getStore();
        var freshTable = freshStore.tables.find(function(t) { return t.id === currentTable; });
        var stillPending = freshStore.orders.some(function(o) {
          return o.tableId === currentTable
            && o.status === 'pending'
            && o.status !== 'completed'
            && o.status !== 'cancelled'
            && (!freshTable || o.tableSessionId === freshTable.currentSessionId);
        });
        if (!stillPending) {
          // 管理端已出餐 → 立即停止倒计时，切换为已出餐状态
          clearInterval(urgeTimer);
          urgeTimer = null;
          btn.disabled = true;
          btn.textContent = '🍽️ 已出餐，请享用';
          btn.className = 'urge-btn urge-done';
          return;
        }
        if (remaining > 0) {
          btn.textContent = '✅ 已催单，请在 ' + fmt(remaining) + ' 后再次催促';
        } else {
          clearInterval(urgeTimer);
          urgeTimer = null;
          btn.disabled = false;
          btn.textContent = '⏰ 催促上菜';
        }
      }, 1000);
    } else {
      // 冷却结束或从未催单过 → 可催单
      btn.disabled = false;
      btn.textContent = '⏰ 催促上菜';
      btn.className = 'urge-btn';
    }
  } else if (tableOrders.length > 0) {
    // 有订单但已出餐/完成 → 禁用，显示已出餐
    btn.disabled = true;
    btn.textContent = '🍽️ 已出餐，请享用';
    btn.className = 'urge-btn urge-done';
  } else {
    // 无活跃订单 → 仍显示催促按钮（入座状态始终可见），点击时 urgeOrder 会提示
    btn.disabled = false;
    btn.textContent = '⏰ 催促上菜';
    btn.className = 'urge-btn';
  }
}

function urgeOrder() {
  if (!currentTable) {
    showToast('⚠️ 请先选择桌位并点餐');
    return;
  }
  store = getStore();
  var tbl = store.tables.find(t => t.id === currentTable);
  if (!tbl) {
    showToast('⚠️ 桌位信息异常');
    return;
  }

  // 检查是否有待出餐的订单
  var hasPending = store.orders.some(function(o) {
    return o.tableId === currentTable && o.status === 'pending';
  });
  if (!hasPending) {
    showToast('⚠️ 当前没有待出餐的订单');
    return;
  }

  // 创建催单记录
  if (!store.urges) store.urges = [];
  var urge = {
    id: Date.now(),
    tableId: currentTable,
    tableName: tbl.name,
    phone: currentUser || '',
    createdAt: new Date().toISOString(),
    status: 'new' // new = 未读 / seen = 已读
  };
  store.urges.push(urge);
  saveStore(store);

  // 客户端提示
  showToast('后厨已收到加急，请您耐心等待 ⏳');

  // 记录催单时间戳（sessionStorage，跨页面保持冷却）
  sessionStorage.setItem('restaurant_urge_at', Date.now().toString());

  // 按钮冷却效果（3分钟倒计时）
  var btn = document.getElementById('urgeBtn');
  btn.disabled = true;
  var remaining = 180; // 3分钟 = 180秒
  // 格式化 mm:ss
  function fmt(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  btn.textContent = '✅ 已催单，请在 ' + fmt(remaining) + ' 后再次催促';
  urgeTimer = setInterval(function() {
    remaining--;
    // 每次倒数都重新读取最新数据，检查是否已出餐
    var freshStore = getStore();
    var freshTable = freshStore.tables.find(function(t) { return t.id === currentTable; });
    var stillPending = freshStore.orders.some(function(o) {
      return o.tableId === currentTable
        && o.status === 'pending'
        && o.status !== 'completed'
        && o.status !== 'cancelled'
        && (!freshTable || o.tableSessionId === freshTable.currentSessionId);
    });
    if (!stillPending) {
      clearInterval(urgeTimer);
      urgeTimer = null;
      btn.disabled = true;
      btn.textContent = '🍽️ 已出餐，请享用';
      btn.className = 'urge-btn urge-done';
      return;
    }
    if (remaining > 0) {
      btn.textContent = '✅ 已催单，请在 ' + fmt(remaining) + ' 后再次催促';
    } else {
      clearInterval(urgeTimer);
      urgeTimer = null;
      btn.disabled = false;
      btn.textContent = '⏰ 催促上菜';
    }
  }, 1000);
}

// ===================== 呼叫服务员 =====================
let callWaiterTimer = null;

function callWaiter() {
  if (!currentTable) {
    showToast('⚠️ 请先选择桌位');
    return;
  }
  store = getStore();
  var tbl = store.tables.find(t => t.id === currentTable);
  if (!tbl) {
    showToast('⚠️ 桌位信息异常');
    return;
  }

  // 创建呼叫记录
  if (!store.calls) store.calls = [];
  var call = {
    id: Date.now(),
    tableId: currentTable,
    tableName: tbl.name,
    phone: currentUser || '',
    createdAt: new Date().toISOString(),
    status: 'new' // new = 未处理 / handled = 已处理
  };
  store.calls.push(call);
  saveStore(store);

  // 客户端提示
  showToast('🔔 服务员已收到呼叫，请稍候');

  // 按钮冷却效果（2分钟倒计时）——按手机号隔离存储
  var btn = document.getElementById('callWaiterBtn');
  btn.disabled = true;
  var remaining = 120; // 2分钟 = 120秒

  // 记录呼叫时间戳（sessionStorage，按手机号隔离）
  sessionStorage.setItem('restaurant_call_waiter_' + (currentUser || 'anonymous'), Date.now().toString());

  function fmt(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  btn.textContent = '✅ 已呼叫，' + fmt(remaining) + ' 后可再呼';
  callWaiterTimer = setInterval(function() {
    remaining--;
    if (remaining > 0) {
      btn.textContent = '✅ 已呼叫，' + fmt(remaining) + ' 后可再呼';
    } else {
      clearInterval(callWaiterTimer);
      callWaiterTimer = null;
      btn.disabled = false;
      btn.textContent = '🔔 呼叫服务员';
    }
  }, 1000);
}

// 根据当前手机号恢复呼叫服务员按钮冷却状态（不同用户隔离）
function updateCallWaiterBtnState() {
  var btn = document.getElementById('callWaiterBtn');
  if (!btn) return;

  // 先清除可能正在运行的倒计时
  if (callWaiterTimer) {
    clearInterval(callWaiterTimer);
    callWaiterTimer = null;
  }

  if (!currentTable) {
    btn.disabled = true;
    btn.textContent = '🔔 呼叫服务员';
    return;
  }

  // 检查当前手机的冷却状态（按手机号隔离的key）
  var lastCallTime = parseInt(sessionStorage.getItem('restaurant_call_waiter_' + (currentUser || 'anonymous')) || '0', 10);
  if (!lastCallTime) {
    btn.disabled = false;
    btn.textContent = '🔔 呼叫服务员';
    return;
  }

  // 计算剩余时间
  var elapsed = Math.floor((Date.now() - lastCallTime) / 1000);
  var remaining = Math.max(0, 120 - elapsed); // 2分钟冷却

  function fmt(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  if (remaining <= 0) {
    // 冷却已结束
    sessionStorage.removeItem('restaurant_call_waiter_' + (currentUser || 'anonymous'));
    btn.disabled = false;
    btn.textContent = '🔔 呼叫服务员';
    return;
  }

  // 恢复倒计时
  btn.disabled = true;
  btn.textContent = '✅ 已呼叫，' + fmt(remaining) + ' 后可再呼';
  callWaiterTimer = setInterval(function() {
    remaining--;
    if (remaining > 0) {
      btn.textContent = '✅ 已呼叫，' + fmt(remaining) + ' 后可再呼';
    } else {
      clearInterval(callWaiterTimer);
      callWaiterTimer = null;
      sessionStorage.removeItem('restaurant_call_waiter_' + (currentUser || 'anonymous'));
      btn.disabled = false;
      btn.textContent = '🔔 呼叫服务员';
    }
  }, 1000);
}

// 退出登录
function doLogout() {
  if (!confirm('确定要退出登录吗？')) return;

  // 注意：退出登录不释放桌位！桌位保持占用状态，
  // 直到管理员在后台手动重置。这样防止其他用户占用前一位客人的桌位。

  sessionStorage.removeItem('restaurant_user');
  sessionStorage.removeItem('restaurant_urge_at'); // 清除催单冷却
  currentUser = null;

  // 重置当前客户端状态（不清除服务端桌台数据）
  currentTable = null;
  cart = {};

  // 显示登录页
  document.getElementById('loginPage').style.display = '';
  var phoneInput = document.getElementById('phoneInput');
  phoneInput.value = '';
  // 重置提示文字和样式
  var hint = document.getElementById('loginHint');
  hint.textContent = '请输入11位手机号码';
  hint.classList.remove('error');
  phoneInput.focus();
}

// ===================== 首页：选择模式 =====================
function backToChoice() {
  document.getElementById('homeTableSelect').style.display = 'none';
  document.getElementById('homeAddTable').style.display = 'none';
  document.getElementById('homeReservation').style.display = 'none';
  document.querySelector('.welcome-banner').style.display = '';
  document.querySelector('.choice-section').style.display = '';
  currentTable = null;
  selectedReserveTableId = null; // 清除已选预约桌位
  showPage('home');
}

function showNewOrder() {
  document.querySelector('.welcome-banner').style.display = 'none';
  document.querySelector('.choice-section').style.display = 'none';
  document.getElementById('homeAddTable').style.display = 'none';
  document.getElementById('homeTableSelect').style.display = '';
  renderTables();
}

function showAddDishes() {
  document.querySelector('.welcome-banner').style.display = 'none';
  document.querySelector('.choice-section').style.display = 'none';
  document.getElementById('homeTableSelect').style.display = 'none';
  document.getElementById('homeAddTable').style.display = '';
  document.getElementById('addTableInput').value = '';
  document.getElementById('addTableInput').focus();
}

// ===================== 预约功能 =====================

function showReservation() {
  if (!currentUser) { showToast('请先登录后再预约'); return; }
  document.querySelector('.welcome-banner').style.display = 'none';
  document.querySelector('.choice-section').style.display = 'none';
  document.getElementById('homeTableSelect').style.display = 'none';
  document.getElementById('homeAddTable').style.display = 'none';
  document.getElementById('homeReservation').style.display = '';

  // 重置状态
  selectedReserveTableId = null;
  document.getElementById('reserveNote').value = '';
  document.getElementById('reserveTableHint').innerHTML = '请点击上方空闲桌位进行选择';

  // 设置默认预约时间为1小时后
  var defaultTime = new Date(Date.now() + 60 * 60 * 1000);
  var y = defaultTime.getFullYear();
  var m = String(defaultTime.getMonth() + 1).padStart(2, '0');
  var d = String(defaultTime.getDate()).padStart(2, '0');
  var h = String(defaultTime.getHours()).padStart(2, '0');
  var min = String(defaultTime.getMinutes()).padStart(2, '0');
  document.getElementById('reserveTimeInput').value = y + '-' + m + '-' + d + 'T' + h + ':' + min;

  // 显示我的预约信息
  renderMyReservation();

  renderReservableTables();
}

function renderMyReservation() {
  store = getStore();
  var card = document.getElementById('myReservationCard');
  if (!card) return;

  // 查找当前用户预约的桌位（排除已取消/已完成的）
  var myTable = store.tables.find(function(t) {
    return t.status === 'reserved' && t.reservedBy === currentUser;
  });

  if (!myTable) {
    card.style.display = 'none';
    return;
  }

  var timeStr = myTable.reservedTime
    ? new Date(myTable.reservedTime).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
    : '';
  var noteHtml = myTable.reservedNote
    ? '<div style="margin-top:6px;font-size:12px;color:#999">📝 ' + myTable.reservedNote + '</div>'
    : '';

  // 计算倒计时：预约时间 + 10分钟超时
  var countdownHtml = '';
  if (myTable.reservedTime) {
    var deadline = new Date(myTable.reservedTime).getTime() + 10 * 60 * 1000;
    var remaining = Math.floor((deadline - Date.now()) / 1000);
    if (remaining > 0) {
      var dd = Math.floor(remaining / 86400);
      var hh = Math.floor((remaining % 86400) / 3600);
      var mm = Math.floor((remaining % 3600) / 60);
      var timeStr = '';
      if (dd > 0) timeStr += dd + '天';
      if (hh > 0 || dd > 0) timeStr += hh + '小时';
      timeStr += mm + '分钟';
      countdownHtml = '<div class="reserve-countdown" style="color:' + (remaining < 120 ? '#EF4444' : '#F59E0B') + '">⏳ 剩余 ' + timeStr + '自动取消</div>';
    } else if (remaining > -10) {
      countdownHtml = '<div class="reserve-countdown" style="color:#EF4444">⚠️ 已超时，即将自动取消...</div>';
    }
  }

  card.style.display = 'block';
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:12px;color:#4F46E5;font-weight:600">📋 我的预约</div>
        <div style="font-size:20px;font-weight:700;color:var(--text);margin-top:4px">${myTable.name}</div>
        ${timeStr ? '<div style="font-size:13px;color:#666;margin-top:2px">⏰ 到店时间：' + timeStr + '</div>' : ''}
        ${countdownHtml}
        ${noteHtml}
      </div>
      <button class="cancel-reserve-btn" onclick="cancelMyReservation()">取消预约</button>
    </div>
  `;
}

// 取消自己的预约
function cancelMyReservation() {
  if (!confirm('确定要取消预约吗？')) return;
  store = getStore();
  var myTable = store.tables.find(function(t) {
    return t.status === 'reserved' && t.reservedBy === currentUser;
  });
  if (!myTable) return;

  // 清除预约信息，恢复为空闲
  myTable.status = 'free';
  myTable.reservedBy = null;
  myTable.reservedAt = null;
  myTable.reservedTime = null;
  myTable.reservedNote = null;
  saveStore(store);

  showToast('已取消预约');
  // 刷新预约页面
  renderMyReservation();
  renderReservableTables();
}

function renderReservableTables() {
  store = getStore();
  var grid = document.getElementById('reserveTableGrid');

  // 只显示空闲的桌位（free），已占用和已预订的不显示
  var freeTables = store.tables.filter(function(t) { return t.status === 'free'; });

  if (freeTables.length === 0) {
    grid.innerHTML = '<div class="reserve-empty">暂无空闲桌位 😅</div>';
    updateReserveBtn();
    return;
  }

  grid.innerHTML = freeTables.map(t => `
    <div class="reserve-table-btn ${selectedReserveTableId === t.id ? 'reserve-selected' : ''}"
         onclick="selectReserveTable(${t.id})">
      <div class="reserve-table-num">${t.name}</div>
      <div class="reserve-table-seats">${t.seats}人桌</div>
    </div>
  `).join('');

  updateReserveBtn();
}

function selectReserveTable(id) {
  selectedReserveTableId = id;
  renderReservableTables();

  var table = store.tables.find(t => t.id === id);
  document.getElementById('reserveTableHint').innerHTML =
    '<span style="color:var(--primary);font-weight:600;">✓ 已选择 ' + (table ? table.name : '') + '</span>';

  updateReserveBtn();
}

function updateReserveBtn() {
  var btn = document.getElementById('reserveSubmitBtn');
  if (!selectedReserveTableId) {
    btn.disabled = true;
    btn.textContent = '请先选择桌位';
  } else {
    btn.disabled = false;
    var tbl = store.tables.find(t => t.id === selectedReserveTableId);
    btn.textContent = '确认预约 - ' + (tbl ? tbl.name : '');
  }
}

function submitReservation() {
  if (!selectedReserveTableId) { showToast('请选择要预约的桌位'); return; }

  var timeVal = document.getElementById('reserveTimeInput').value;
  if (!timeVal) { showToast('请选择预约时间'); return; }

  var note = document.getElementById('reserveNote').value.trim();

  store = getStore();
  var table = store.tables.find(t => t.id === selectedReserveTableId);

  // 二次检查桌位是否仍为空闲
  if (!table || table.status !== 'free') {
    showToast('该桌位已被他人预订或占用，请重新选择');
    selectedReserveTableId = null;
    renderReservableTables();
    return;
  }

  // 检查是否已有预约（每人只能预约一个桌位）
  var existingReserve = store.tables.find(function(t) {
    return t.status === 'reserved' && t.reservedBy === currentUser;
  });
  if (existingReserve) {
    showToast('⚠️ 您已预约' + existingReserve.name + '，请先取消后再预约其他桌位');
    return;
  }

  // 检查是否正在某桌用餐（避免冲突）
  var occupying = store.tables.find(function(t) {
    return t.status === 'occupied' && t.sessionPhone === currentUser;
  });
  if (occupying) {
    showToast('⚠️ 您正在' + occupying.name + '用餐，无需预约');
    return;
  }

  // 设置桌位为已预订
  table.status = 'reserved';
  table.reservedBy = currentUser;     // 预约人手机号
  table.reservedAt = new Date().toISOString();   // 预约时间
  table.reservedTime = timeVal;        // 预约到店时间
  table.reservedNote = note;           // 备注
  saveStore(store);

  showToast('🎉 预约成功！' + table.name + ' 已为您保留');

  // 返回首页
  setTimeout(backToChoice, 1200);
}

function confirmAddTable() {
  const input = document.getElementById('addTableInput');
  const val = input.value.trim();
  if (!val) {
    showAddTableErr('输入不能为空', '⚠️ 请输入您的桌号，再点击确认加菜');
    shakeInput(input);
    return;
  }
  const tableId = Number(val);
  if (!tableId || tableId < 1) {
    showAddTableErr('桌号无效', '⚠️ 请输入有效的桌号（数字 1~99）');
    shakeInput(input);
    return;
  }
  store = getStore();
  const tbl = store.tables.find(t => t.id === tableId);
  if (!tbl) {
    showAddTableErr('桌号不存在', `⚠️ 桌号 ${tableId} 不存在，请重新输入`);
    shakeInput(input);
    return;
  }

  // === 状态检查 ===

  // 【关键】同一手机号只能在一个桌位点餐：检查是否已经在其他**用餐中**桌位使用中
  // 注意：只检查 status === 'occupied' 的桌位，空闲的桌位说明管理员已处理过
  var myOtherTable = store.tables.find(function(t) {
    if (t.id === tableId || t.status !== 'occupied') return false;
    if (t.sessionPhone !== currentUser) return false;
    return store.orders.some(function(o) {
      return o.tableId === t.id && o.phone === currentUser
        && o.status !== 'completed' && o.status !== 'cancelled';
    });
  });
  if (myOtherTable) {
    showAddTableErr(
      '您在其他桌位有订单',
      '⚠️ 您在' + myOtherTable.name + '已有订单<br>请在已下单的桌位加餐 😊',
      true
    );
    shakeInput(input);
    return;
  }

  // occupied：已有人用餐 → 【双重判断】检查是否本人
  //   ① sessionPhone 匹配（正在使用/刚下单）
  //   ② 或该桌有此手机号的订单历史（结账后sessionPhone被清除，靠订单记录识别主人）
  if (tbl.status === 'occupied') {
    var isMyOccupiedTable = tbl.sessionPhone === currentUser;
    if (!isMyOccupiedTable) {
      isMyOccupiedTable = store.orders.some(function(o) {
        return o.tableId === tableId && o.phone === currentUser;
      });
    }
    if (isMyOccupiedTable) {
      // 本人之前下单的桌位 → 允许继续加菜
      currentTable = tableId;
      showPage('menu');
      document.getElementById('menuTableBadge').textContent = tbl.name;
      updateUserCard();
      renderMenu();
      showToast(`✅ 已回到${tbl.name}，您可以继续加菜了`);
    } else {
      showAddTableErr(
        '该桌已有客人',
        '⚠️ 该桌位正在使用中<br><br>如需加菜请确认桌号是否正确，或咨询服务员 😊',
        true
      );
      shakeInput(input);
    }
    return;
  }

  // reserved 被他人预约
  if (tbl.status === 'reserved' && tbl.reservedBy !== currentUser) {
    showAddTableErr(
      '此桌已被预约',
      '⚠️ 该桌位已被其他客人预约<br><br>如想就餐，请返回选桌位或咨询服务员 😊',
      true
    );
    shakeInput(input);
    return;
  }

  // free 空闲桌位：检查本人是否有预约
  if (tbl.status === 'free') {
    var myReserved = store.tables.find(function(t) {
      return t.status === 'reserved' && t.reservedBy === currentUser;
    });
    if (myReserved) {
      showAddTableErr(
        '请前往您的预约桌位',
        '⚠️ 您已预约' + myReserved.name + '，加菜请输入该桌号<br>或返回首页从您的预约桌位开始点餐',
        true
      );
    } else {
      showAddTableErr(
        '此桌尚未入座',
        '此桌还没有人入座点餐<br><br>如想就餐，请返回首页选桌位哦 😊',
        true
      );
    }
    shakeInput(input);
    return;
  }

  // reserved 本人预约的桌位 → 允许进入（设置 sessionPhone 防止轮询踢出，保持 reserved 直到下单）
  // 到这里说明 tbl.status === 'reserved' && tbl.reservedBy === currentUser
  tbl.sessionPhone = currentUser;
  saveStore(store);

  currentTable = tableId;
  showPage('menu');
  document.getElementById('menuTableBadge').textContent = tbl.name;
  updateUserCard();
  renderMenu();
  showToast(`✅ 已进入${tbl.name}，您可以加菜了`);
}

// 显示加菜错误弹窗
function showAddTableErr(title, msg, showBackBtn) {
  document.getElementById('addTableErrTitle').textContent = title;
  document.getElementById('addTableErrMsg').innerHTML = msg;
  var btns = document.querySelectorAll('#addTableErrModal .modal-btn');
  btns[1].style.display = showBackBtn ? '' : 'none';
  document.getElementById('addTableErrModal').classList.add('show');
}

function shakeInput(el) {
  el.style.borderColor = '#FF4D4F';
  el.style.animation = 'shake 0.5s ease';
  setTimeout(function() {
    el.style.borderColor = '';
    el.style.animation = '';
  }, 600);
}

// ===================== 首页：选桌（新点餐）=====================
function renderTables() {
  store = getStore();
  const grid = document.getElementById('tableGrid');
  grid.innerHTML = store.tables.map(t => {
    let statusClass = '';
    let statusText = t.seats + '人桌';
    if (t.status === 'occupied') {
      statusClass = 'occupied';
      statusText = '已占用';
    } else if (t.status === 'reserved') {
      // 预约人自己可以看到并选中（用特殊样式标识）
      if (t.reservedBy === currentUser) {
        statusClass = 'reserved-mine';
        statusText = '📋 我的预约';
      } else {
        statusClass = 'reserved';
        statusText = '已预约';
      }
    }
    // free 状态：不再显示"点餐中"（因为进入菜单不改变桌位状态）
    return `<div class="table-btn ${statusClass} ${currentTable === t.id ? 'selected' : ''}"
         onclick="selectTable(${t.id})">
      <div class="table-num">${t.name}</div>
      <div class="table-status">${statusText}</div>
    </div>`;
  }).join('');
}

function selectTable(id) {
  const table = store.tables.find(t => t.id === id);
  if (table.status === 'occupied') {
    // 【双重判断】判断是否为本人的桌位：
    //   ① sessionPhone 匹配（正在使用/刚下单）
    //   ② 或该桌有此手机号的订单历史（结账后sessionPhone被清除，靠订单记录识别主人）
    var isMyTable = table.sessionPhone === currentUser;
    if (!isMyTable) {
      isMyTable = store.orders.some(function(o) {
        return o.tableId === id && o.phone === currentUser;
      });
    }
    if (isMyTable) {
      showToast('🍽️ 您已在此桌位点餐，请点击"返回"后使用"加菜"功能继续点餐');
    } else {
      showToast('该桌已有顾客，请选其他桌位');
    }
    return;
  }
  // 被他人预约的桌位不能选
  if (table.status === 'reserved' && table.reservedBy !== currentUser) {
    showToast('⚠️ 此桌已被其他客人预约'); return;
  }
  // 【关键】已下单后只能在自己下单的桌位点餐：检查是否已在其他**用餐中**桌位有活跃订单
  // 注意：只检查 status === 'occupied' 的桌位，空闲的桌位说明管理员已处理过
  var myOrderedTable = store.tables.find(function(t) {
    if (t.id === id || t.status !== 'occupied') return false;
    if (t.sessionPhone !== currentUser) return false;
    // 该手机号在其他桌位是否有未完成/未取消的活跃订单
    return store.orders.some(function(o) {
      return o.tableId === t.id && o.phone === currentUser
        && o.status !== 'completed' && o.status !== 'cancelled';
    });
  });
  if (myOrderedTable) {
    showToast('⚠️ 您在' + myOrderedTable.name + '已有订单，请在该桌加餐');
    return;
  }
  // 如果本人已有预约，只能选自己预约的桌位
  store = getStore();
  var myReserved = store.tables.find(function(t) {
    return t.status === 'reserved' && t.reservedBy === currentUser;
  });
  if (myReserved && myReserved.id !== id) {
    showToast('⚠️ 您已预约' + myReserved.name + '，请从该桌开始点餐');
    return;
  }
  currentTable = id;
  renderTables();
  const btn = document.getElementById('startOrderBtn');
  btn.textContent = `开始点餐 - ${table.name}`;
  btn.disabled = false;
}

function startOrdering() {
  if (!currentTable) return;
  store = getStore();
  const tbl = store.tables.find(t => t.id === currentTable);
  // 【关键】设置 sessionPhone 标记"我正在用这个桌位"
  // 这样定时轮询不会误判为"桌位被重置"而踢出用户
  // 注意：不改变桌位状态（保持 free 或 reserved），不递增 currentSessionId
  tbl.sessionPhone = currentUser;
  saveStore(store);

  // 预约的桌位：保持 reserved 状态不变（等真正下单再转 occupied）
  if (tbl.status === 'reserved' && tbl.reservedBy === currentUser) {
    showPage('menu');
    document.getElementById('menuTableBadge').textContent = tbl.name;
    updateUserCard();
    renderMenu();
    return;
  }
  // 普通空闲桌位：状态仍保持 free，但已标记 sessionPhone
  showPage('menu');
  document.getElementById('menuTableBadge').textContent = tbl.name;
  updateUserCard(); // "我的"页显示手机号
  renderMenu();
}

// 点菜页返回按钮
function goBackFromMenu() {
  var itemCount = Object.values(cart).reduce(function(s, n) { return s + n; }, 0);
  var msg = '确认返回？';
  if (itemCount > 0) msg = '您已选了' + itemCount + '件菜品，返回将清空购物车。确认返回吗？';
  if (!confirm(msg)) return;

  // 如果还没有下单，恢复桌位状态（预约的桌位恢复为预约状态）
  store = getStore();
  var hasOrder = store.orders.some(function(o) {
    return o.tableId === currentTable && o.status !== 'completed' && o.status !== 'cancelled';
  });
  if (!hasOrder && currentTable) {
    var tbl = store.tables.find(t => t.id === currentTable);
    if (tbl) {
      // 用 currentTable 判断：用户当前正在使用这个桌位（通过客户端状态判断所有权）
      // 预约的桌位 → 恢复为 reserved（保留预约信息，清除可能残留的 sessionPhone）
      if (tbl.reservedBy === currentUser) {
        tbl.status = 'reserved';
        tbl.sessionPhone = null;
        saveStore(store);
      } else if (tbl.status === 'free') {
        // 普通空闲桌位 → 清除可能残留的 sessionPhone（防御性清理）
        if (tbl.sessionPhone === currentUser) {
          tbl.sessionPhone = null;
          saveStore(store);
        }
      }
    }
  }

  currentTable = null;
  cart = {};
  showPage('home');
  backToChoice();
}

function changeTable() {
  if (confirm('确认重新选择？当前购物车将被清空，且桌位将释放。')) {
    if (currentTable) {
      store = getStore();
      const tbl = store.tables.find(t => t.id === currentTable);
      if (tbl) {
        // 预约的桌位恢复为预约状态（因为还没下单，状态没变过）
        if (tbl.reservedBy === currentUser && tbl.status === 'reserved') {
          tbl.sessionPhone = null; // 防御性清理
          saveStore(store);
        }
        // 空闲桌位：防御性清理残留的 sessionPhone
        else if (tbl.status === 'free' && tbl.sessionPhone === currentUser) {
          tbl.sessionPhone = null;
          saveStore(store);
        }
        // occupied（已下单）：回退状态
        else if (tbl.status === 'occupied' && tbl.sessionPhone === currentUser) {
          tbl.status = 'free';
          tbl.sessionPhone = null;
          tbl.currentSessionId = (tbl.currentSessionId || 1) - 1;
          if (tbl.currentSessionId < 0) tbl.currentSessionId = 0;
          saveStore(store);
        }
      }
    }
    currentTable = null;
    cart = {};
    showPage('home');
    backToChoice();
  }
}

// ===================== 页面切换 =====================
function showPage(pageId) {
  var nav = document.getElementById('bottomNav');

  // 登录页特殊处理（不是 .page 结构）
  if (pageId === 'login') {
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    currentPage = pageId;
    if (nav) nav.style.display = 'none';
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  var target = document.getElementById('page-' + pageId);
  if (target) target.classList.add('active');
  currentPage = pageId;

  if (pageId === 'home' || pageId === 'login') {
    if (nav) nav.style.display = 'none';
  } else {
    if (nav) nav.style.display = 'flex';
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    var navMap = {menu:'nav-menu', orders:'nav-orders', mine:'nav-mine'};
    if (navMap[pageId]) document.getElementById(navMap[pageId]).classList.add('active');
  }

  // 更新购物车浮动条按钮状态（订单页显示「加菜」）
  updateCartFloat();

  // "我的"页面：更新催单按钮状态 + 呼叫服务员按钮状态
  if (pageId === 'mine') { updateUrgeBtnState(); updateCallWaiterBtnState(); }
}

function switchTab(tab) {
  if (!currentTable) { showToast('请先选择桌位'); return; }
  if (tab === 'orders') renderOrders();
  // 每次进入菜单页都重新渲染，确保与管理端数据同步
  if (tab === 'menu') renderMenu();
  showPage(tab);
}

// ===================== 菜单渲染 =====================
function renderMenu() {
  store = getStore();
  const sidebar = document.getElementById('categorySidebar');
  const content = document.getElementById('menuContent');

  sidebar.innerHTML = store.categories.map((cat, i) => `
    <div class="category-item ${i===0?'active':''}" id="cat-${cat.id}" onclick="scrollToSection(${cat.id}, this)">
      <span class="cat-icon">${cat.icon}</span>${cat.name}
    </div>
  `).join('');

  content.innerHTML = store.categories.map(cat => {
    const dishes = store.dishes.filter(d => d.catId === cat.id);
    return `
      <div class="menu-section" id="section-${cat.id}">
        <div class="section-title">${cat.icon} ${cat.name}</div>
        ${dishes.map(dish => renderDishCard(dish)).join('')}
      </div>
    `;
  }).join('');
}

function renderDishCard(dish) {
  const qty = cart[dish.id] || 0;
  const badgesHtml = renderBadges(dish.badges);

  return `
    <div class="dish-card ${dish.available ? '' : 'dish-unavailable'}" id="dish-card-${dish.id}">
      <div class="dish-img">${dish.emoji}</div>
      <div class="dish-info">
        <div class="dish-name">${dish.name}</div>
        <div class="dish-desc">${dish.desc}</div>
        ${badgesHtml ? `<div class="dish-badges">${badgesHtml}</div>` : ''}
        <div class="dish-price-row">
          <div>
            <div class="dish-price"><span>¥</span>${dish.price}</div>
            <div class="dish-sold">已售 ${dish.sold}+</div>
          </div>
          <div class="qty-control">
            <button class="qty-btn minus ${qty>0?'active':''}" onclick="updateCart(${dish.id},-1)" ${qty===0?'style="opacity:0"':''}>−</button>
            <span class="qty-num" style="${qty===0?'opacity:0':''}">${qty}</span>
            <button class="qty-btn plus" onclick="updateCart(${dish.id},1)" ${!dish.available?'disabled':''}>+</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function scrollToSection(catId, el) {
  document.querySelectorAll('.category-item').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  const section = document.getElementById('section-' + catId);
  if (section) section.scrollIntoView({behavior:'smooth'});
}

// ===================== 购物车 =====================
function updateCart(dishId, delta) {
  const dish = store.dishes.find(d => d.id === dishId);
  if (!dish || !dish.available) return;

  cart[dishId] = Math.max(0, (cart[dishId] || 0) + delta);
  if (cart[dishId] === 0) delete cart[dishId];

  // 更新当前卡片
  const card = document.getElementById('dish-card-' + dishId);
  if (card) {
    const qty = cart[dishId] || 0;
    const minusBtn = card.querySelector('.qty-btn.minus');
    const qtyNum = card.querySelector('.qty-num');
    const plusBtn = card.querySelector('.qty-btn.plus');
    minusBtn.style.opacity = qty === 0 ? '0' : '1';
    minusBtn.classList.toggle('active', qty > 0);
    qtyNum.style.opacity = qty === 0 ? '0' : '1';
    qtyNum.textContent = qty;
  }

  updateCartFloat();
}

function updateCartFloat() {
  const count = cartCount();
  const total = cartTotal();
  const floatEl = document.getElementById('cartFloat');
  const badge = document.getElementById('cartBadge');
  const actionBtn = document.getElementById('cartActionBtn');

  floatEl.classList.toggle('empty', count === 0);
  badge.style.display = count > 0 ? 'flex' : 'none';
  badge.textContent = count;
  document.getElementById('cartTotal').textContent = formatPrice(total);
  document.getElementById('cartHint').textContent = `已选 ${count} 件菜品`;
  document.getElementById('cartTotalPrice').textContent = formatPrice(total);

  // 订单页 → 按钮变成「加菜」
  if (currentPage === 'orders') {
    actionBtn.textContent = '🍜 加菜';
    actionBtn.style.background = '#4CAF50';
  } else {
    actionBtn.textContent = '去下单';
    actionBtn.style.background = '';
  }
}

function handleCartAction(e) {
  if (e) e.stopPropagation();
  if (currentPage === 'orders') {
    // 订单页 → 加菜：直接回菜单页
    switchTab('menu');
  } else {
    // 菜单页 → 结算
    submitOrder(e);
  }
}

function toggleCart() {
  const overlay = document.getElementById('cartOverlay');
  const panel = document.getElementById('cartPanel');
  const isShow = panel.classList.contains('show');

  if (!isShow && cartCount() === 0) { showToast('购物车是空的，快去选菜吧 🍽️'); return; }

  overlay.classList.toggle('show', !isShow);
  panel.classList.toggle('show', !isShow);

  if (!isShow) renderCartPanel();
}

function renderCartPanel() {
  const body = document.getElementById('cartPanelBody');
  const items = Object.entries(cart).map(([id, qty]) => {
    const dish = store.dishes.find(d => d.id == id);
    if (!dish) return '';
    return `
      <div class="cart-item">
        <div class="cart-item-emoji">${dish.emoji}</div>
        <div class="cart-item-info">
          <div class="cart-item-name">${dish.name}</div>
          <div class="cart-item-price">${formatPrice(dish.price * qty)}</div>
        </div>
        <div class="qty-control">
          <button class="qty-btn minus active" onclick="updateCart(${id},-1); renderCartPanel(); updateCartFloat()">−</button>
          <span class="qty-num">${qty}</span>
          <button class="qty-btn plus" onclick="updateCart(${id},1); renderCartPanel(); updateCartFloat()">+</button>
        </div>
      </div>
    `;
  }).join('');
  body.innerHTML = items || '<div style="padding:40px;text-align:center;color:#999">购物车是空的</div>';
}

function clearCart() {
  if (confirm('确认清空购物车？')) {
    cart = {};
    updateCartFloat();
    renderCartPanel();
    toggleCart();
  }
}

// ===================== 生成日期制订单号 =====================
function generateOrderNo(store) {
  const now = new Date();
  const dateStr = now.getFullYear() + '-' +
    String(now.getMonth()+1).padStart(2,'0') + '-' +
    String(now.getDate()).padStart(2,'0');
  // 找当天最大序号
  const todayOrders = store.orders.filter(o => o.orderNo && o.orderNo.startsWith(dateStr));
  let seq = todayOrders.length + 1;
  // 兼容旧数据（没有orderNo的订单）
  return dateStr + '-' + String(seq).padStart(3, '0');
}

// ===================== 下单 =====================
function submitOrder(e) {
  if (e) e.stopPropagation();
  if (cartCount() === 0) { showToast('请先选择菜品'); return; }

  // 强制要求已登录才能下单
  if (!currentUser) {
    showToast('⚠️ 请先登录后再点餐');
    document.getElementById('loginPage').style.display = '';
    var phoneInput = document.getElementById('phoneInput');
    if (phoneInput) phoneInput.focus();
    return;
  }

  // 关闭购物车弹窗
  document.getElementById('cartOverlay').classList.remove('show');
  document.getElementById('cartPanel').classList.remove('show');

  store = getStore();
  const currentTbl = store.tables.find(t => t.id === currentTable);

  // 【关键】首次下单时统一处理状态转换和 sessionPhone 设置
  if (currentTbl) {
    // 预约桌位：reserved → occupied
    if (currentTbl.status === 'reserved' && currentTbl.reservedBy === currentUser) {
      currentTbl.status = 'occupied';
      currentTbl.currentSessionId = Date.now(); // 时间戳，永不碰撞
      currentTbl.sessionStartTime = Date.now(); // 会话开始时间（双重校验）
      currentTbl.sessionPhone = currentUser; // 下单后才标记占用者
      // 清除预约信息（已正式入座用餐）
      currentTbl.reservedBy = null;
      currentTbl.reservedAt = null;
      currentTbl.reservedTime = null;
      currentTbl.reservedNote = null;
    }
    // 空闲桌位：free → occupied（首次下单才转）
    else if (currentTbl.status === 'free') {
      currentTbl.status = 'occupied';
      currentTbl.currentSessionId = Date.now(); // 时间戳，永不碰撞
      currentTbl.sessionStartTime = Date.now(); // 会话开始时间（双重校验）
      currentTbl.sessionPhone = currentUser; // 下单后才标记占用者
    }
    // 已occupied（加菜）：保持状态，更新sessionPhone即可
    // 注意：新会话的sessionID已在结账时由管理端递增，这里无需再处理
    else if (currentTbl.status === 'occupied') {
      currentTbl.sessionPhone = currentUser; // 确保sessionPhone绑定当前客人
    }
    saveStore(store);
  }

  const orderNo = generateOrderNo(store);
  const orderId = store.orders.length > 0 ? Math.max(...store.orders.map(o=>o.id)) + 1 : 1;
  const items = Object.entries(cart).map(([id, qty]) => {
    const dish = store.dishes.find(d => d.id == id);
    // 累加销量
    dish.sold = (dish.sold || 0) + qty;
    return { dishId: Number(id), dishName: dish.name, qty, price: dish.price, subtotal: dish.price * qty, served: false };
  });

  const order = {
    id: orderId,
    orderNo,
    tableId: currentTable,
    tableName: currentTbl?.name,
    phone: currentUser || '',       // 记录下单人手机号，支持历史订单跨会话查询
    tableSessionId: currentTbl ? currentTbl.currentSessionId : 0,
    items,
    total: cartTotal(),
    status: 'pending',
    paid: false,
    createdAt: new Date().toISOString(),
    remark: '',
  };

  store.orders.push(order);
  saveStore(store);

  cart = {};
  updateCartFloat();
  renderMenu();

  showToast(`✅ 下单成功！订单号 ${orderNo}`);
  setTimeout(() => switchTab('orders'), 1000);
}

// ===================== 订单页 =====================
function renderOrders() {
  store = getStore();
  const container = document.getElementById('ordersContainer');

  // 【关键】未选桌位或桌位已空闲时，不显示任何订单（旧订单去"历史订单"查看）
  if (!currentTable) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>请先选择桌位开始点餐</p>
      </div>`;
    return;
  }
  // 只显示当前会话的订单（过滤掉上一桌客人的旧订单）
  const currentTbl = store.tables.find(t => t.id === currentTable);
  if (!currentTbl || currentTbl.status === 'free') {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>还没有订单，快去点餐吧！</p>
      </div>`;
    return;
  }

  const currentSession = currentTbl.currentSessionId || 0;
  // 【双保险】sessionId匹配 + 订单创建时间在会话开始之后（彻底杜绝旧订单泄漏）
  const sessionStart = currentTbl.sessionStartTime || 0;
  const myOrders = store.orders.filter(o =>
    o.tableId === currentTable &&
    o.tableSessionId === currentSession &&
    new Date(o.createdAt).getTime() >= sessionStart
  ).reverse();

  if (myOrders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>还没有订单，快去点餐吧！</p>
      </div>`;
    return;
  }

  const appStatusLabels = { pending:'待出餐', served:'已出餐' };
  const appStatusClasses = { pending:'status-pending', served:'status-served' };

  // 已评价的订单ID列表
  const ratedOrderIds = (store.ratings || []).map(r => r.orderId).filter(Boolean);

  container.innerHTML = myOrders.map(order => {
    const isRated = ratedOrderIds.includes(order.id);
    const ratingBtnHtml = (order.status === 'served' && !isRated)
      ? `<button class="order-rating-btn" onclick="showRatingForOrder(${order.id})">⭐ 去评价</button>`
      : (isRated ? `<span class="order-rated-badge">✅ 已评价</span>` : '');

    return `
    <div class="order-card" id="order-card-${order.id}">
      <div class="order-card-header">
        <span class="order-id">订单 ${order.orderNo || '#' + order.id}</span>
        <span class="order-status ${appStatusClasses[order.status]}">${appStatusLabels[order.status]}</span>
      </div>
      <div class="order-items">
        ${order.items.map(item => `${item.dishName} × ${item.qty}`).join('、')}
      </div>
      <div class="order-footer">
        <span class="order-time">${new Date(order.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</span>
        <span>
          <span class="order-total-text">合计：</span>
          <span class="order-total-amount">${formatPrice(order.total)}</span>
        </span>
        ${ratingBtnHtml}
      </div>
    </div>`;
  }).join('');
}

// ===================== 评价 =====================
let currentRatingOrderId = null;

function setRating(val) {
  ratingScore = val;
  document.querySelectorAll('.star').forEach((s, i) => {
    s.classList.toggle('active', i < val);
  });
}

function showRating() {
  currentRatingOrderId = null;
  document.getElementById('ratingOrderDishes').innerHTML = '';
  document.getElementById('ratingModal').classList.add('show');
}

function showRatingForOrder(orderId) {
  currentRatingOrderId = orderId;
  store = getStore();
  const order = store.orders.find(o => o.id === orderId);
  if (!order) return;

  // 显示该订单的菜品供选择
  const dishesDiv = document.getElementById('ratingOrderDishes');
  dishesDiv.innerHTML = '<div style="font-size:13px;color:#999;margin-bottom:8px;">您对以下菜品的评价：</div>' +
    order.items.map(item => {
      const dish = store.dishes.find(d => d.id === item.dishId) || {};
      const emoji = dish.emoji || '🍽️';
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f5f5f5;">
        <span style="font-size:20px;">${emoji}</span>
        <span style="flex:1;font-size:14px;">${item.dishName}</span>
      </div>`;
    }).join('');

  document.getElementById('ratingModal').classList.add('show');
}

function submitRating() {
  const text = document.getElementById('ratingText').value;
  store = getStore();
  if (!store.ratings) store.ratings = [];
  store.ratings.push({
    tableId: currentTable,
    phone: currentUser || '',       // 记录评价人手机号，支持跨会话历史查询
    orderId: currentRatingOrderId,
    score: ratingScore,
    text,
    createdAt: new Date().toISOString()
  });
  saveStore(store);
  hideModal('ratingModal');
  document.getElementById('ratingText').value = '';
  showToast('感谢您的评价！⭐');
  // 刷新订单页，显示「已评价」
  if (currentPage === 'orders') renderOrders();
}

function showCheckout() {
  store = getStore();
  const myOrders = store.orders.filter(o => o.tableId === currentTable);
  const total = myOrders.reduce((s, o) => s + o.total, 0);
  if (total === 0) { showToast('当前没有消费记录'); return; }
  showToast(`本次消费合计：${formatPrice(total)}，服务员即将为您结账`);
}

function showMyRatings() {
  store = getStore();
  // 按手机号查询全部历史评价（兼容旧数据：没有phone字段则按tableId匹配当前桌）
  const ratings = (store.ratings || []).filter(r =>
    (currentUser && r.phone === currentUser) ||
    (!r.phone && r.tableId === currentTable)
  ).slice().reverse(); // 最新的排前面
  const body = document.getElementById('myRatingsBody');
  if (ratings.length === 0) {
    body.innerHTML = '<div style="text-align:center;color:#999;padding:30px;">暂无评价记录</div>';
  } else {
    body.innerHTML = ratings.map(r => {
      const order = store.orders.find(o => o.id === r.orderId);
      const orderLabel = order ? `订单 ${order.orderNo || '#' + r.orderId}` : '独立评价';
      const tableLabel = order ? `${order.tableName || ''}` : (r.tableId ? (store.tables.find(t=>t.id===r.tableId)||{name:r.tableId+'号桌'}).name : '');
      const stars = '⭐'.repeat(r.score);
      const time = new Date(r.createdAt).toLocaleString('zh-CN', {year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
      return `<div style="padding:12px 0;border-bottom:1px solid #f5f5f5;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <div>
            <span style="font-size:13px;color:#333;font-weight:500;">${orderLabel}</span>
            ${tableLabel ? `<span style="font-size:12px;color:#aaa;margin-left:6px;">${tableLabel}</span>` : ''}
          </div>
          <span style="font-size:12px;color:#ccc;">${time}</span>
        </div>
        <div style="font-size:16px;margin-bottom:4px;">${stars}</div>
        ${r.text ? `<div style="font-size:13px;color:#666;">${r.text}</div>` : ''}
      </div>`;
    }).join('');
  }
  document.getElementById('myRatingsModal').classList.add('show');
}

// ===================== 历史订单（按手机号跨会话查询）=====================
function showHistoryOrders() {
  if (!currentUser) { showToast('请先登录'); return; }
  store = getStore();
  // 查询该手机号在所有桌位的全部历史订单，按时间倒序
  const allMyOrders = store.orders.filter(o =>
    o.phone === currentUser
  ).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const body = document.getElementById('historyOrdersBody');
  if (allMyOrders.length === 0) {
    body.innerHTML = '<div style="text-align:center;color:#999;padding:30px;">暂无历史订单</div>';
  } else {
    const appStatusLabels = { pending:'待出餐', served:'已出餐', completed:'已完成', cancelled:'已取消' };
    // 已评价的订单ID列表
    const ratedOrderIds = (store.ratings || []).map(r => r.orderId).filter(Boolean);
    body.innerHTML = allMyOrders.map(order => {
      const statusLabel = appStatusLabels[order.status] || order.status;
      const paidBadge = order.paid ? '<span style="font-size:11px;background:#f6ffed;color:#52c41a;padding:1px 7px;border-radius:10px;border:1px solid #b7eb8f;margin-left:6px;">已结账</span>' : '';
      const isRated = ratedOrderIds.includes(order.id);
      const ratedBadge = isRated ? '<span style="font-size:11px;background:#fffbe6;color:#faad14;padding:1px 7px;border-radius:10px;border:1px solid #ffe58f;margin-left:6px;">已评价</span>' : '';
      const time = new Date(order.createdAt).toLocaleString('zh-CN', {year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
      return `<div style="padding:14px 0;border-bottom:1px solid #f5f5f5;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div>
            <span style="font-size:13px;color:#333;font-weight:600;">${order.orderNo || '#' + order.id}</span>
            <span style="font-size:12px;color:#888;margin-left:6px;">${order.tableName || ''}</span>
            ${paidBadge}${ratedBadge}
          </div>
          <span style="font-size:13px;font-weight:700;color:#FA541C;">¥${order.total.toFixed(2)}</span>
        </div>
        <div style="font-size:13px;color:#666;margin-bottom:6px;line-height:1.7;">
          ${order.items.map(i => `<span style="display:inline-block;margin-right:8px;">${i.dishName}×${i.qty}</span>`).join('')}
        </div>
        <div style="font-size:12px;color:#bbb;">${time}</div>
      </div>`;
    }).join('');
  }
  document.getElementById('historyOrdersModal').classList.add('show');
}

// ===================== 跨设备数据同步（后端轮询）=====================
// 之前用 localStorage 的 storage 事件同步，现在改为定时从后端拉取最新数据
// 这样手机和电脑能看到同一份数据
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && currentPage) {
    refreshStore(); // 从后端拉最新数据
    // 数据到达后（refreshStore是异步的），下次getStore()就有新数据了
    // 这里先立刻用当前缓存刷新UI，后端数据到了之后会在轮询里自动刷新
    store = getStore();
    if (currentPage === 'menu') renderMenu();
    if (currentPage === 'orders') renderOrders();
    if (currentPage === 'mine') { updateUrgeBtnState(); updateCallWaiterBtnState(); }
  }
});

// ===================== 欢迎横幅动态效果 =====================
const FOOD_EMOJIS = ['🍜','🍚','🥟','🍔','🍕','🌮','🍣','🥗','🍰','🧋','🍦','🍩'];
function startWelcomeAnimation() {
  const banner = document.getElementById('welcomeBanner');
  if (!banner) return;
  // 每隔一段时间生成一个飘浮的 emoji
  setInterval(() => {
    if (currentPage !== 'home') return;
    const el = document.createElement('span');
    el.className = 'welcome-bg-emoji';
    el.textContent = FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)];
    // 随机位置：横坐标散布在 banner 内，纵坐标从底部往上飘
    const left = Math.random() * 85 + 5; // 5% ~ 90%
    el.style.left = left + '%';
    el.style.bottom = '-10px';
    // 随机动画时长和延迟
    const dur = Math.random() * 3 + 3; // 3~6s
    el.style.animationDuration = dur + 's';
    banner.appendChild(el);
    // 动画结束后移除元素
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, dur * 1000);
  }, 600);
}

// ===================== 初始化 =====================
async function init() {
  // 先从后端加载数据（必须等数据到了才能渲染页面）
  store = await initStore();
  if (!store) {
    showToast('⚠️ 无法连接服务器，请检查网络', 5000);
    store = getDefaultData();
  }

  // 检查是否有已登录的会话
  var savedUser = sessionStorage.getItem('restaurant_user');
  if (savedUser && /^\d{11}$/.test(savedUser)) {
    currentUser = savedUser;
    updateUserCard();
    document.getElementById('loginPage').style.display = 'none';
    showPage('home');
    backToChoice();
    startWelcomeAnimation();
  } else {
    // 显示登录页，隐藏主界面
    showPage('login');
    var phoneInput = document.getElementById('phoneInput');
    phoneInput.value = '';
    // 确保提示文字为初始状态
    var hint = document.getElementById('loginHint');
    hint.textContent = '请输入11位手机号码';
    hint.classList.remove('error');
    phoneInput.addEventListener('input', onPhoneInput);
    phoneInput.addEventListener('keydown', onPhoneKeydown);
    phoneInput.focus();
  }

  // 定时轮询：从后端拉最新数据（替代之前的 localStorage 轮询）
  setInterval(() => {
    refreshStore(); // 从后端拉最新数据（异步，不阻塞UI）
    // 立刻用当前缓存刷新UI（refreshStore完成后下次轮询会用新数据）
    store = getStore();
    // 检查预约超时（超过预约时间10分钟自动释放）
    var expiredReservations = store.tables.filter(function(t) {
      return t.status === 'reserved' && t.reservedTime && ((new Date(t.reservedTime).getTime() + 10 * 60 * 1000) < Date.now());
    });
    if (expiredReservations.length > 0) {
      expiredReservations.forEach(function(t) {
        t.status = 'free';
        t.reservedBy = null; t.reservedAt = null; t.reservedTime = null; t.reservedNote = null;
      });
      saveStore(store);
      // 如果当前在预约页，刷新我的预约卡
      if (document.getElementById('homeReservation').style.display !== 'none') {
        renderMyReservation();
        renderReservableTables();
      }
    }
    if (currentPage === 'home') {
      if (document.getElementById('homeTableSelect').style.display !== 'none') {
        renderTables();
      }
    } else if (currentPage === 'orders') {
      renderOrders();
    } else if (currentTable) {
      // 检测当前桌位是否被后台重置/取消
      const tbl = store.tables.find(t => t.id === currentTable);
      if (tbl) {
        // 桌位变回 free 且不是本人在使用 → 管理员手动重置或被清理
        if (tbl.status === 'free' && tbl.sessionPhone !== currentUser) {
          currentTable = null;
          cart = {};
          showPage('home');
          backToChoice();
          showToast('⚠️ 您的桌位已被重置，请重新选择', 3000);
        }
        // 预约被取消或被替换（reserved 但不是本人的了）
        else if (tbl.status === 'reserved' && tbl.reservedBy !== currentUser) {
          currentTable = null;
          cart = {};
          showPage('home');
          backToChoice();
          showToast('⚠️ 您的预约已失效', 3000);
        }
      }
    }
  }, 2000);
}

init();
