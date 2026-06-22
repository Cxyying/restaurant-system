// ===================== 变量 =====================
let editingId = null;

// ===================== 弹窗控制 =====================
function openModal(id) {
  document.getElementById(id).classList.add('show');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

// ===================== 页面切换 =====================
function showSection(id) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('section-' + id).classList.add('active');
  document.getElementById('nav-' + id).classList.add('active');
  const titles = {dashboard:'数据概览',orders:'订单管理',tables:'桌台管理',dishes:'菜品管理',categories:'分类管理',reports:'营业报表',ratings:'评价管理',settings:'系统设置'};
  document.getElementById('pageTitle').textContent = titles[id] || id;

  const renderMap = {orders:openOrderSection, tables:renderTables, dishes:renderDishes, categories:renderCategories, reports:renderReports, ratings:renderRatings, settings:renderSettings};
  if (renderMap[id]) renderMap[id]();
}

// ===================== 仪表盘 =====================
function renderDashboard() {
  const store = getStore();
  const orders = store.orders;
  const todayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === new Date().toDateString());
  // 只统计已结账的订单
  const todayPaidOrders = todayOrders.filter(o => o.paid);
  const todayRevenue = todayPaidOrders.reduce((s,o) => s+o.total, 0);
  const occupiedCount = store.tables.filter(t => t.status === 'occupied').length;

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card orange">
      <div class="stat-icon">💰</div>
      <div class="stat-label">今日营业额</div>
      <div class="stat-value"><small>¥</small>${todayRevenue.toFixed(2)}</div>
      <div class="stat-change">${todayRevenue > 0 ? '↑ 实时统计' : '暂无订单'}</div>
    </div>
    <div class="stat-card blue">
      <div class="stat-icon">📋</div>
      <div class="stat-label">今日订单数</div>
      <div class="stat-value">${todayOrders.length}</div>
      <div class="stat-change">${todayOrders.length > 0 ? '↑ 进行中' : '等待首单'}</div>
    </div>
    <div class="stat-card green">
      <div class="stat-icon">🪑</div>
      <div class="stat-label">当前在座桌台</div>
      <div class="stat-value">${occupiedCount} <small>/ ${store.tables.length}</small></div>
      <div class="stat-change">上座率 ${(occupiedCount/store.tables.length*100).toFixed(0)}%</div>
    </div>
    <div class="stat-card red">
      <div class="stat-icon">🍜</div>
      <div class="stat-label">在售菜品数</div>
      <div class="stat-value">${store.dishes.filter(d=>d.available).length}</div>
      <div class="stat-change">共 ${store.dishes.length} 道菜品</div>
    </div>
  `;

  // 最新订单
  const recent = [...orders].reverse().slice(0, 6);
  document.getElementById('recentOrders').innerHTML = recent.length ? recent.map(o => `
    <div class="order-mini-item">
      <div class="order-mini-info">
        <div class="order-mini-title">${o.orderNo || '#' + o.id} ${o.tableName}</div>
        <div class="order-mini-sub">${formatTime(o.createdAt)} · ${o.items.length}道菜</div>
      </div>
      <span class="order-mini-price">${formatPrice(o.total)}</span>
      <span class="tag ${statusClasses[o.status]}">${statusLabels[o.status]}</span>
    </div>
  `).join('') : '<div style="padding:20px;text-align:center;color:#999">暂无订单</div>';

  // 桌台地图
  document.getElementById('dashTableMap').innerHTML = store.tables.map(t => `
    <div class="table-map-item ${t.status}">
      <div class="table-map-num">${t.name}</div>
      <div class="table-map-status">${tableStatusLabels[t.status]}</div>
    </div>
  `).join('');

  // 热销榜（从订单中真实统计）
  const dishSoldMap = {};
  store.dishes.forEach(d => { dishSoldMap[d.id] = { ...d, realQty: 0 }; });
  orders.forEach(o => {
    o.items.forEach(item => {
      if (dishSoldMap[item.dishId]) dishSoldMap[item.dishId].realQty += item.qty;
    });
  });
  const sorted = Object.values(dishSoldMap).sort((a,b) => b.realQty - a.realQty).filter(d => d.realQty > 0).slice(0, 8);
  const maxSold = sorted[0]?.realQty || 1;

  if (sorted.length === 0) {
    document.getElementById('hotDishChart').innerHTML =
      '<div style="text-align:center;padding:30px;color:#999;font-size:14px">暂无销售数据，顾客下单后将显示热销排行</div>';
  } else {
    document.getElementById('hotDishChart').innerHTML = sorted.map(d => `
      <div class="chart-bar-row">
        <span class="chart-bar-label">${d.emoji} ${d.name}</span>
        <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${d.realQty/maxSold*100}%"></div></div>
        <span class="chart-bar-val">${d.realQty}份</span>
      </div>
    `).join('');
  }

  // 更新铃铛红点：有待出餐(pending)订单时显示红点，否则隐藏
  const pendingCount = store.orders.filter(o => o.status === 'pending').length;
  const notifDot = document.getElementById('notifDot');
  if (notifDot) {
    if (pendingCount > 0) {
      notifDot.classList.add('show');
      notifDot.title = pendingCount + ' 个待出餐订单';
    } else {
      notifDot.classList.remove('show');
      notifDot.title = '暂无新通知';
    }
  }

  // 检查新的催单通知
  checkUrges();
}

// 检查并显示催单提醒
function checkUrges() {
  const store = getStore();
  if (!store.urges || store.urges.length === 0) return;

  // 筛选出未读的催单（按时间排序，最新的在前）
  const newUrges = store.urges.filter(u => u.status === 'new').sort((a,b) => b.id - a.id);
  if (newUrges.length === 0) return;

  // 显示最新的催单
  const latest = newUrges[0];
  var tblName = latest.tableName || (latest.tableId + '号桌');
  showToast('⏰ ' + tblName + ' 催促上菜！请尽快处理', 6000);

  // 标记为已读
  store.urges.forEach(function(u) {
    if (u.status === 'new') u.status = 'seen';
  });
  saveStore(store);
}

// 检查并显示呼叫服务员提醒
function checkCalls() {
  const store = getStore();
  if (!store.calls || store.calls.length === 0) return;

  // 筛选出未处理的呼叫（按时间排序，最新的在前）
  const newCalls = store.calls.filter(c => c.status === 'new').sort((a,b) => b.id - a.id);
  if (newCalls.length === 0) return;

  // 显示所有未处理的呼叫（可能有多桌同时叫）——使用大弹窗
  newCalls.forEach(function(call) {
    showCallAlert(call);
  });

  // 【关键】标记为已通知（与 checkUrges 保持一致），避免每次进入都重复弹窗
  store.calls.forEach(function(c) {
    if (c.status === 'new') c.status = 'seen';
  });
  saveStore(store);
}

// ===================== 呼叫服务员大弹窗 =====================
let callAlertTimer = null;
let callAlertAudioCtx = null;

function showCallAlert(call) {
  var tblName = call.tableName || (call.tableId + '号桌');
  var callTime = new Date(call.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  // 设置弹窗内容
  var alertEl = document.getElementById('callAlert');
  if (!alertEl) return;

  document.getElementById('callAlertTable').textContent = tblName;
  document.getElementById('callAlertTime').textContent = callTime;
  document.getElementById('callAlertId').value = call.id;

  // 显示弹窗
  alertEl.classList.add('show');

  // 播放提示音（蜂鸣声）
  try {
    if (!callAlertAudioCtx) callAlertAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var ctx = callAlertAudioCtx;
    for (var i = 0; i < 3; i++) {
      (function(idx) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        var start = ctx.currentTime + idx * 0.4;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.3, start + 0.05);
        gain.gain.linearRampToValueAtTime(0, start + 0.2);
        osc.start(start);
        osc.stop(start + 0.25);
      })(i);
    }
  } catch(e) {}

  // 自动关闭计时（30秒后自动消失）
  if (callAlertTimer) clearTimeout(callAlertTimer);
  callAlertTimer = setTimeout(function() {
    closeCallAlert();
  }, 30000);
}

function closeCallAlert() {
  var alertEl = document.getElementById('callAlert');
  if (alertEl) alertEl.classList.remove('show');
  if (callAlertTimer) { clearTimeout(callAlertTimer); callAlertTimer = null; }
}

function handleCallAlert() {
  var callId = parseInt(document.getElementById('callAlertId').value, 10);
  if (callId) dismissCall(callId);
  closeCallAlert();
}

// ===================== 订单管理 =====================
function renderOrders() {
  const store = getStore();
  populateMonthFilter(store);
  // 如果有筛选条件，走筛选逻辑；否则显示全部
  var hasFilter = document.getElementById('orderSearch').value.trim() ||
    document.getElementById('orderPhoneFilter').value.trim() ||
    document.getElementById('orderStatusFilter').value ||
    document.getElementById('orderDateFilter').value ||
    document.getElementById('orderMonthFilter').value;
  if (hasFilter) {
    filterOrders();
  } else {
    renderOrderTable(store.orders);
  }
}

// 切换到订单管理页时调用（重置筛选，显示全部）
function openOrderSection() {
  clearOrderFilters();
  var store = getStore();
  populateMonthFilter(store);
  renderOrderTable(store.orders);
}

function populateMonthFilter(store) {
  // 获取所有有订单的年月
  const months = new Set();
  store.orders.forEach(o => {
    const d = new Date(o.createdAt);
    months.add(d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'));
  });
  const sel = document.getElementById('orderMonthFilter');
  sel.innerHTML = '<option value="">全部月份</option>' +
    [...months].sort().reverse().map(m => {
      const [y, mo] = m.split('-');
      return `<option value="${m}">${y}年${parseInt(mo)}月</option>`;
    }).join('');
}

function onMonthChange() {
  const monthVal = document.getElementById('orderMonthFilter').value;
  const dateInput = document.getElementById('orderDateFilter');
  if (monthVal) {
    dateInput.value = '';
    dateInput.disabled = true;
  } else {
    dateInput.disabled = false;
  }
  filterOrders();
}

function renderOrderTable(orders) {
  const tbody = document.getElementById('orderTable');
  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#999">暂无订单</td></tr>';
    return;
  }
  tbody.innerHTML = [...orders].reverse().map(o => {
    const dishStr = o.items.map(i => `${i.dishName}×${i.qty}`).join('、');
    return `<tr>
      <td><strong>${o.orderNo || '#' + o.id}</strong></td>
      <td>${o.tableName}</td>
      <td style="color:var(--primary);font-weight:600">${maskAdminPhone(o.phone)}</td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${dishStr}">${dishStr}</td>
      <td><strong style="color:var(--primary)">${formatPrice(o.total)}</strong></td>
      <td>${formatTime(o.createdAt)}</td>
      <td><span class="tag ${statusClasses[o.status]}">${statusLabels[o.status]}</span></td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          ${o.status === 'pending' ? `<button class="btn btn-success btn-sm" onclick="updateOrderStatus(${o.id},'served')">标记出餐</button>` : ''}
          ${o.status === 'served' ? `<span style="color:#52C41A;font-size:12px;font-weight:600">✅ 已出餐</span>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

function updateOrderStatus(orderId, newStatus) {
  const store = getStore();
  const order = store.orders.find(o => o.id === orderId);
  if (order) {
    order.status = newStatus;
    // 当订单标记为"已出餐"时，同步所有菜品的served状态
    if (newStatus === 'served') {
      order.items.forEach(i => i.served = true);
    }
    saveStore(store);
    renderOrders();
    renderTables(); // 同步刷新桌台管理
    renderDashboard(); // 同步刷新数据概览
    showToast(`订单 ${order.orderNo || '#' + orderId} 状态已更新为：${statusLabels[newStatus]}`);
  }
}

// 从订单的createdAt提取本地日期字符串 YYYY-MM-DD（解决ISO UTC时区偏移问题）
function getOrderLocalDate(o) {
  if (!o.createdAt) return '';
  var d = new Date(o.createdAt);
  if (isNaN(d.getTime())) return '';
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

// 清空所有筛选条件并显示全部订单
function clearOrderFilters() {
  document.getElementById('orderSearch').value = '';
  document.getElementById('orderPhoneFilter').value = '';
  document.getElementById('orderStatusFilter').value = '';
  document.getElementById('orderDateFilter').value = '';
  document.getElementById('orderDateFilter').disabled = false;
  document.getElementById('orderMonthFilter').value = '';
}

// 管理端手机号显示（带眼睛切换功能）
function maskAdminPhone(phone) {
  if (!phone) return '<span style="color:#ccc">未登录</span>';
  var full = phone;
  var masked = phone.length === 11 ? phone.substring(0, 3) + '****' + phone.substring(7) : phone;
  // 用 data 属性存储完整号码，点击眼睛图标切换
  return '<span style="display:inline-flex;align-items:center;gap:4px">' +
    '<span class="phone-text" data-full="' + full + '" data-masked="' + masked + '">' + masked + '</span>' +
    '<span class="eye-toggle" title="点击查看完整号码" onclick="togglePhoneShow(this)">👁️</span>' +
    '</span>';
}

// 切换手机号显示/隐藏
function togglePhoneShow(eyeEl) {
  var textSpan = eyeEl.previousElementSibling;
  if (!textSpan || !textSpan.classList.contains('phone-text')) return;
  var current = textSpan.textContent;
  var full = textSpan.getAttribute('data-full');
  var masked = textSpan.getAttribute('data-masked');
  if (current === full) {
    // 当前是完整 → 切换到脱敏
    textSpan.textContent = masked;
    eyeEl.textContent = '👁️';
    eyeEl.title = '点击查看完整号码';
  } else {
    // 当前是脱敏 → 切换到完整
    textSpan.textContent = full;
    eyeEl.textContent = '🙈';
    eyeEl.title = '点击隐藏号码';
  }
}

// 点击铃铛图标
function onBellClick() {
  const store = getStore();
  const pendingCount = store.orders.filter(o => o.status === 'pending').length;
  if (pendingCount > 0) {
    showToast('🔔 有 ' + pendingCount + ' 个待出餐订单');
  } else {
    showToast('✅ 暂无新通知，所有订单已处理');
  }
}

function filterOrders() {
  var store = getStore();
  var rawKeyword = document.getElementById('orderSearch').value.trim();
  var phoneKeyword = document.getElementById('orderPhoneFilter').value.trim();
  var statusFilter = document.getElementById('orderStatusFilter').value;
  var dateFilter = document.getElementById('orderDateFilter').value;
  var monthFilter = document.getElementById('orderMonthFilter').value;
  var filtered = store.orders;

  if (rawKeyword) {
    var kw = rawKeyword.toLowerCase();
    filtered = filtered.filter(function(o) {
      // 订单号：支持子串匹配（如输入001能匹配到ORD...001）
      if (String(o.orderNo || '').toLowerCase().indexOf(kw) >= 0) return true;
      // 桌台名：精确匹配（搜"1号桌"不会匹配到"11号桌"）
      if ((o.tableName||'') === rawKeyword) return true;
      // 也支持纯数字搜索（如输入"1"只匹配名为"1号桌"的）
      if (/^\d+$/.test(rawKeyword) && (o.tableName||'') === rawKeyword + '号桌') return true;
      return false;
    });
  }
  // 手机号筛选（支持子串匹配：输入138可搜到138****5678）
  if (phoneKeyword) {
    filtered = filtered.filter(function(o) {
      return (o.phone||'').indexOf(phoneKeyword) >= 0;
    });
  }
  if (statusFilter) filtered = filtered.filter(function(o){ return o.status === statusFilter; });
  if (dateFilter) filtered = filtered.filter(function(o){ return getOrderLocalDate(o) === dateFilter; });
  if (monthFilter) filtered = filtered.filter(function(o){
    var d = new Date(o.createdAt);
    return !isNaN(d.getTime()) && (d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') === monthFilter);
  });

  renderOrderTable(filtered);
}

function refreshOrders() { openOrderSection(); showToast('🔄 订单列表已刷新'); }

// ===================== 桌台管理 =====================
function renderTables() {
  const store = getStore();
  // 构建桌号→所有订单的数组映射（同一桌台可能有多单，包括已结账的）
  // 【规则】显示当前会话的所有订单（含已结账），直到桌位变空闲才消失
  const tableOrdersMap = {};
  store.orders.forEach(o => {
    // 排除已取消的订单
    if (o.status !== 'cancelled') {
      // 【硬规则】只有用餐中的桌台才显示当前会话的订单（空闲/已预订绝不显示）
      const table = store.tables.find(t => t.id === o.tableId);
      if (table && table.status === 'occupied' && o.tableSessionId === table.currentSessionId) {
        // 【双保险】订单创建时间必须在当前会话开始之后
        const sessionStart = table.sessionStartTime || 0;
        if (new Date(o.createdAt).getTime() >= sessionStart) {
          if (!tableOrdersMap[o.tableId]) { tableOrdersMap[o.tableId] = []; }
          tableOrdersMap[o.tableId].push(o);
        }
      }
    }
  });

  document.getElementById('tableMap').innerHTML = store.tables.map(t => {
    const orders = tableOrdersMap[t.id] || [];
    let ordersHtml = '';
    let cardBgStyle = '';
    // 计算整体出餐状态和整体结账状态
    let allOrdersAllServed = false;
    let totalItems = 0;
    let totalServedItems = 0;
    let totalAmount = 0;
    let allPaid = true; // 所有订单是否都已结账

    if (orders.length > 0) {
      const dishMap = {};
      store.dishes.forEach(d => dishMap[d.id] = d);

      allOrdersAllServed = true;
      allPaid = orders.every(o => o.paid === true);
      ordersHtml = orders.map(order => {
        const orderAllServed = order.items.every(i => i.served === true || (i.served === undefined && order.status === 'served'));
        if (!orderAllServed) allOrdersAllServed = false;
        totalItems += order.items.length;
        totalServedItems += order.items.filter(i => i.served === true || (i.served === undefined && order.status === 'served')).length;
        totalAmount += order.total;

        // 每道菜单独一行，宽松布局
        const itemsHtml = order.items.map((i, idx) => {
          const d = dishMap[i.dishId];
          const name = d ? `${d.emoji}${d.name}` : `菜品#${i.dishId}`;
          const isServed = i.served === true || (i.served === undefined && order.status === 'served');
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;margin-bottom:3px;border-radius:6px;font-size:12px;background:${isServed ? '#f6ffed' : '#fffbe6'};border-left:3px solid ${isServed ? '#52C41A' : '#FAAD14'}">
            <span style="flex:1">${name} ×${i.qty}</span>
            <span style="color:${isServed ? '#52C41A' : '#FAAD14'};font-weight:600;font-size:11px">${isServed ? '✅已出餐' : '⏳待出餐'}</span>
          </div>`;
        }).join('');

        return `
        <div style="margin-bottom:10px;padding:10px;background:#fff;border-radius:8px;border:1px solid #e8e8e8;text-align:left">
          <div style="font-weight:600;color:#1890ff;font-size:12px;margin-bottom:6px">📋 ${order.orderNo || '#' + order.id} ${order.paid ? '<span class="tag tag-served" style="font-size:10px;padding:1px 6px;margin-left:6px">✅已结账</span>' : ''}</div>
          <div>${itemsHtml}</div>
          <div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center;padding-top:6px;border-top:1px dashed #eee">
            <span style="font-weight:700;color:#FF6B35;font-size:13px">小计：¥${order.total.toFixed(2)}</span>
            <button class="btn btn-sm" style="background:#722ED1;color:white;font-size:11px;padding:3px 10px" onclick="openOrderDetail(${order.id})">📋 标记出餐</button>
          </div>
        </div>`;
      }).join('');

      // 根据出餐状态设置桌台背景色
      cardBgStyle = allOrdersAllServed ? 'background:#f6ffed;border-color:#b7eb8f' : 'background:#fff1f0;border-color:#ffa39e';
    }

    const serveStatusText = orders.length > 0
      ? (allOrdersAllServed ? '✅ 已全部出餐' : `⏳ 还有${totalItems - totalServedItems}道未出`)
      : '';

    // 预约信息展示
    let reserveInfoHtml = '';
    if (t.status === 'reserved' && t.reservedBy) {
      var reserveFull = t.reservedBy;
      var reserveMasked = reserveFull.length === 11
        ? reserveFull.substring(0, 3) + '****' + reserveFull.substring(7)
        : reserveFull;
      var reserveTimeStr = t.reservedTime ? new Date(t.reservedTime).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
      var noteStr = t.reservedNote ? '<br><span style="color:#888;font-size:11px">📝 ' + t.reservedNote + '</span>' : '';
      // 计算倒计时状态
      var expireStatus = '';
      if (t.reservedTime) {
        var deadline = new Date(t.reservedTime).getTime() + 10 * 60 * 1000;
        var remain = Math.floor((deadline - Date.now()) / 1000);
        if (remain > 0) {
          expireStatus = '<div style="margin-top:4px;font-size:11px;color:#F59E0B">⏳ 超时将自动取消</div>';
        } else {
          expireStatus = '<div style="margin-top:4px;font-size:11px;color:#EF4444">⚠️ 已超时，即将取消</div>';
        }
      }
      reserveInfoHtml = `<div style="margin-top:6px;padding:8px;background:#EEF2FF;border-radius:8px;font-size:12px;text-align:left;line-height:1.7">
        <div style="font-weight:600;color:#4F46E5">📅 预订信息</div>
        <div style="display:inline-flex;align-items:center;gap:4px">📱 预约人：<span class="phone-text" data-full="${reserveFull}" data-masked="${reserveMasked}">${reserveMasked}</span><span class="eye-toggle" title="点击查看完整号码" onclick="togglePhoneShow(this)">👁️</span></div>
        ${reserveTimeStr ? '<div>⏰ 到店时间：' + reserveTimeStr + '</div>' : ''}${expireStatus}${noteStr}
      </div>`;
    }

    // 检查该桌是否有未读的催促
    var hasNewUrge = false;
    if (store.urges && store.urges.length > 0) {
      hasNewUrge = store.urges.some(function(u) {
        return u.tableId === t.id && u.status === 'new';
      });
    }

    return `
    <div class="table-map-item ${t.status}" id="tmap-${t.id}" style="${cardBgStyle}">
      <div style="font-size:28px;margin-bottom:6px">🪑</div>
      <div class="table-map-num">${t.name}</div>
      <div class="table-map-status">${tableStatusLabels[t.status]} · ${t.seats}座</div>
      ${hasNewUrge ? '<div style="margin-top:6px"><span class="tag" style="background:#ff4d4f;color:white;font-size:12px;padding:3px 12px;border-radius:10px;animation:urgeBlink 1s infinite">🔥 催促上菜</span></div>' : ''}
      ${serveStatusText
        ? `<div style="margin-top:4px"><span class="tag ${allOrdersAllServed ? 'tag-served' : 'tag-pending'}" style="font-size:11px;padding:2px 10px;border-radius:10px">${serveStatusText}</span></div>`
        : ''
      }
      ${(t.sessionPhone && orders.length > 0) ? (() => {
        var phoneFull = t.sessionPhone;
        var phoneMasked = phoneFull.length === 11
          ? phoneFull.substring(0, 3) + '****' + phoneFull.substring(7)
          : phoneFull;
        return `<div style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#1890ff">
          <span>👤</span>
          <span class="phone-text" data-full="${phoneFull}" data-masked="${phoneMasked}">${phoneMasked}</span>
          <span class="eye-toggle" title="点击查看完整号码" onclick="togglePhoneShow(this)">👁️</span>
        </div>`;
      })() : ''}
      ${orders.length > 0
        ? `<div style="margin-top:6px;display:flex;justify-content:center;align-items:center;gap:8px">
            ${!allPaid
              ? `<button class="btn btn-sm" style="background:#1890ff;color:white;font-size:12px;padding:5px 16px;border-radius:20px;font-weight:600;box-shadow:0 2px 6px rgba(24,144,255,0.35)" onclick="checkoutTable(${t.id})">💰 全部结账（¥${totalAmount.toFixed(2)}）</button>`
              : '<span class="tag tag-served" style="font-size:12px;padding:4px 14px;border-radius:20px;font-weight:600">💰 已全部结账</span>'
            }
          </div>`
        : ''
      }
      ${reserveInfoHtml}
      <div style="margin-top:8px;display:flex;gap:4px;justify-content:center;flex-wrap:wrap">
        <select style="font-size:11px;padding:2px 4px;border:1px solid #ddd;border-radius:4px;background:white" onchange="changeTableStatus(${t.id}, this.value)">
          <option value="free" ${t.status==='free'?'selected':''}>空闲</option>
          <option value="occupied" ${t.status==='occupied'?'selected':''}>用餐中</option>
          <option value="reserved" ${t.status==='reserved'?'selected':''}>已预订</option>
        </select>
        <button class="btn btn-danger btn-sm" onclick="deleteTable(${t.id})">删</button>
      </div>
      ${ordersHtml}
    </div>`;
  }).join('');
}

function changeTableStatus(id, status) {
  const store = getStore();
  const t = store.tables.find(t => t.id === id);
  if (t) {
    // 当桌位从空闲变为"用餐中"时，开启新会话（旧订单自动隔离）
    if (status === 'occupied' && t.status === 'free') {
      t.currentSessionId = Date.now(); // 时间戳，永不碰撞
      t.sessionStartTime = Date.now(); // 会话开始时间
    }
    // 桌位变为空闲时，递增会话ID（隔离旧订单），清除会话绑定的手机号和预约信息
    if (status === 'free') {
      t.currentSessionId = Date.now(); // 时间戳，下次开启新会话时旧订单不再匹配
      t.sessionPhone = null;
      t.reservedBy = null;
      t.reservedAt = null;
      t.reservedTime = null;
      t.reservedTime = null;
      t.reservedNote = null;
    }
    // 状态从预订变为其他状态时，清除预约信息
    if (status !== 'reserved' && t.status === 'reserved') {
      t.reservedBy = null;
      t.reservedAt = null;
      t.reservedTime = null;
      t.reservedNote = null;
    }
    t.status = status;
    saveStore(store);
    showToast(`${t.name} 状态已更新为：${tableStatusLabels[status]}`);
    renderTables();
    renderDashboard(); // 立即刷新数据概览（桌位状态/统计数字）
  }
}

// 订单结账（只有结账后才计入营业额）
function checkoutOrder(orderId) {
  if (!confirm('确认该订单已结账？结账后将计入今日营业额。')) return;
  const store = getStore();
  const order = store.orders.find(o => o.id === orderId);
  if (order) { order.paid = true; saveStore(store); renderTables(); renderDashboard(); showToast(`💰 订单 ${order.orderNo || '#' + orderId} 已结账 ✅`); }
}

// 桌台全部结账（一键结账该桌台所有未结账的订单）
function checkoutTable(tableId) {
  const store = getStore();
  const tableOrders = store.orders.filter(o =>
    o.tableId === tableId &&
    o.status !== 'completed' && o.status !== 'cancelled' &&
    !o.paid
  );
  if (tableOrders.length === 0) { showToast('没有需要结账的订单'); return; }
  const totalAmount = tableOrders.reduce((s, o) => s + o.total, 0);
  const orderNos = tableOrders.map(o => o.orderNo || '#' + o.id).join('、');
  if (!confirm(`确认将 ${store.tables.find(t => t.id === tableId)?.name} 的 ${tableOrders.length} 个订单全部结账？\n\n订单：${orderNos}\n合计金额：¥${totalAmount.toFixed(2)}\n\n结账后将计入今日营业额。**注意：结账后桌位状态不会自动变为空闲，需要手动更改。**`)) return;
  let count = 0;
  tableOrders.forEach(o => {
    o.paid = true; // 只标记已结账，不改订单状态和菜品出餐状态
    count++;
  });
  // 结账后不自动重置桌位状态，保持当前状态，需要手动更改
  // 【关键】不递增currentSessionId、不清除sessionPhone
  //   - 管理端桌台已通过 !o.paid 过滤隐藏已结账订单（v19）
  //   - 客户端"我的订单"需要结账后仍显示菜品，直到桌位变空闲才消失
  //   - sessionID递延到 changeTableStatus() 中桌位变free时才执行
  saveStore(store);
  renderTables();
  renderDashboard();
  showToast(`💰 ${tableOrders.length} 个订单已全部结账，¥${totalAmount.toFixed(2)} ✅`);
}

function deleteTable(id) {
  if (!confirm('确定删除该桌台？')) return;
  const store = getStore();
  store.tables = store.tables.filter(t => t.id !== id);
  saveStore(store); renderTables(); showToast('桌台已删除');
}

// 处理呼叫服务员（标记为已处理）
function dismissCall(callId) {
  const store = getStore();
  const call = store.calls ? store.calls.find(c => c.id === callId) : null;
  if (call) {
    call.status = 'handled';
    saveStore(store);
    renderTables();
    showToast(`✅ ${call.tableName || call.tableId + '号桌'} 呼叫已处理`);
  }
}

function resetAllTables() {
  if (!confirm('确认将所有桌台状态重置为空闲？')) return;
  const store = getStore();
  store.tables.forEach(t => {
    t.status = 'free';
    t.sessionPhone = null;
    t.currentSessionId = 0; // 重置会话ID，与旧订单完全隔离
    t.sessionStartTime = 0; // 重置会话开始时间
    t.reservedBy = null;
    t.reservedAt = null;
    t.reservedTime = null;
    t.reservedNote = null;
  });
  saveStore(store); renderTables(); showToast('✅ 所有桌台已重置为空闲');
}

let editTableId = null;
function openTableModal(id) {
  editTableId = id || null;
  const store = getStore();
  if (id) {
    const t = store.tables.find(t => t.id === id);
    document.getElementById('tf-name').value = t.name;
    document.getElementById('tf-seats').value = t.seats;
    document.getElementById('tf-status').value = t.status;
    document.getElementById('tableModalTitle').textContent = '编辑桌台';
  } else {
    document.getElementById('tf-name').value = '';
    document.getElementById('tf-seats').value = 4;
    document.getElementById('tf-status').value = 'free';
    document.getElementById('tableModalTitle').textContent = '新增桌台';
  }
  document.getElementById('tableModal').classList.add('show');
}

function saveTable() {
  const name = document.getElementById('tf-name').value.trim();
  const seats = parseInt(document.getElementById('tf-seats').value);
  const status = document.getElementById('tf-status').value;
  if (!name) { showToast('请填写桌台名称'); return; }
  const store = getStore();
  if (editTableId) {
    const t = store.tables.find(t => t.id === editTableId);
    if (t) { t.name = name; t.seats = seats; t.status = status; }
  } else {
    const maxId = store.tables.reduce((m,t) => Math.max(m,t.id), 0);
    store.tables.push({ id: maxId+1, name, seats, status });
  }
  saveStore(store); closeModal('tableModal'); renderTables(); showToast('桌台已保存 ✅');
}

// ===================== 菜品管理 =====================
function renderDishes() {
  const store = getStore();
  // 填充分类筛选
  const sel = document.getElementById('dishCatFilter');
  sel.innerHTML = '<option value="">全部分类</option>' +
    store.categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
  filterDishes();
}

function filterDishes() {
  const store = getStore();
  const keyword = document.getElementById('dishSearch').value.toLowerCase();
  const catFilter = document.getElementById('dishCatFilter').value;
  let dishes = store.dishes;
  if (keyword) dishes = dishes.filter(d => d.name.includes(keyword) || d.desc.includes(keyword));
  if (catFilter) dishes = dishes.filter(d => d.catId == catFilter);
  renderDishTable(dishes);
}

function renderDishTable(dishes) {
  const store = getStore();
  const tbody = document.getElementById('dishTable');
  tbody.innerHTML = dishes.map(d => {
    const cat = store.categories.find(c => c.id === d.catId);
    return `
      <tr>
        <td><div class="dish-emoji-box">${d.emoji}</div></td>
        <td><strong>${d.name}</strong><div style="font-size:12px;color:#999;margin-top:2px">${d.desc.substring(0,30)}...</div></td>
        <td>${cat ? `${cat.icon} ${cat.name}` : '-'}</td>
        <td><strong style="color:var(--primary)">${formatPrice(d.price)}</strong></td>
        <td>${d.sold}份</td>
        <td>${renderBadges(d.badges) || '<span style="color:#bbb;font-size:12px">—</span>'}</td>
        <td><span class="tag ${d.available ? 'tag-available' : 'tag-unavailable'}">${d.available ? '已上架' : '已下架'}</span></td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-outline btn-sm" onclick="openDishModal(${d.id})">编辑</button>
            <button class="btn btn-sm" style="background:${d.available?'#FFF1F0':'#F6FFED'};color:${d.available?'var(--danger)':'var(--success)'};border:1px solid ${d.available?'var(--danger)':'var(--success)'}" onclick="toggleDishAvail(${d.id})">${d.available?'下架':'上架'}</button>
            <button class="btn btn-danger btn-sm" onclick="deleteDish(${d.id})">删除</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openDishModal(id) {
  editingId = id || null;
  const store = getStore();
  const cats = store.categories;
  document.getElementById('df-cat').innerHTML = cats.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');

  if (id) {
    const d = store.dishes.find(d => d.id === id);
    document.getElementById('df-name').value = d.name;
    document.getElementById('df-cat').value = d.catId;
    document.getElementById('df-desc').value = d.desc;
    document.getElementById('df-price').value = d.price;
    document.getElementById('df-emoji').value = d.emoji;
    document.getElementById('df-badge-hot').checked = d.badges.includes('hot');
    document.getElementById('df-badge-new').checked = d.badges.includes('new');
    document.getElementById('df-badge-spicy').checked = d.badges.includes('spicy');
    document.getElementById('df-available').value = String(d.available);
    document.getElementById('dishModalTitle').textContent = '编辑菜品';
  } else {
    document.getElementById('df-name').value = '';
    document.getElementById('df-desc').value = '';
    document.getElementById('df-price').value = '';
    document.getElementById('df-emoji').value = '🍜';
    document.getElementById('df-badge-hot').checked = false;
    document.getElementById('df-badge-new').checked = false;
    document.getElementById('df-badge-spicy').checked = false;
    document.getElementById('df-available').value = 'true';
    document.getElementById('dishModalTitle').textContent = '新增菜品';
  }
  document.getElementById('dishModal').classList.add('show');
}

function saveDish() {
  const name = document.getElementById('df-name').value.trim();
  const catId = parseInt(document.getElementById('df-cat').value);
  const desc = document.getElementById('df-desc').value.trim();
  const price = parseFloat(document.getElementById('df-price').value);
  const emoji = document.getElementById('df-emoji').value.trim() || '🍜';
  const available = document.getElementById('df-available').value === 'true';
  const badges = [];
  if (document.getElementById('df-badge-hot').checked) badges.push('hot');
  if (document.getElementById('df-badge-new').checked) badges.push('new');
  if (document.getElementById('df-badge-spicy').checked) badges.push('spicy');

  if (!name) { showToast('请填写菜品名称'); return; }
  if (isNaN(price) || price < 0) { showToast('请填写有效价格'); return; }

  const store = getStore();
  if (editingId) {
    const d = store.dishes.find(d => d.id === editingId);
    if (d) Object.assign(d, {name,catId,desc,price,emoji,available,badges});
  } else {
    const maxId = store.dishes.reduce((m,d) => Math.max(m,d.id), 0);
    store.dishes.push({id:maxId+1,name,catId,desc,price,emoji,available,badges,sold:0});
  }
  saveStore(store); closeModal('dishModal'); renderDishes(); showToast('菜品已保存 ✅');
}

function toggleDishAvail(id) {
  const store = getStore();
  const d = store.dishes.find(d => d.id === id);
  if (d) { d.available = !d.available; saveStore(store); filterDishes(); showToast(`${d.name} 已${d.available?'上架':'下架'}`); }
}

function deleteDish(id) {
  if (!confirm('确定删除该菜品？')) return;
  const store = getStore();
  store.dishes = store.dishes.filter(d => d.id !== id);
  saveStore(store); filterDishes(); showToast('菜品已删除');
}

// ===================== 分类管理 =====================
function renderCategories() {
  const store = getStore();
  document.getElementById('catTable').innerHTML = store.categories.map(c => {
    const count = store.dishes.filter(d => d.catId === c.id).length;
    return `
      <tr>
        <td style="font-size:24px">${c.icon}</td>
        <td><strong>${c.name}</strong></td>
        <td>${count} 道菜品</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-outline btn-sm" onclick="openCatModal(${c.id})">编辑</button>
            <button class="btn btn-danger btn-sm" onclick="deleteCat(${c.id})">删除</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openCatModal(id) {
  editingId = id || null;
  const store = getStore();
  if (id) {
    const c = store.categories.find(c => c.id === id);
    document.getElementById('cf-name').value = c.name;
    document.getElementById('cf-icon').value = c.icon;
    document.getElementById('catModalTitle').textContent = '编辑分类';
  } else {
    document.getElementById('cf-name').value = '';
    document.getElementById('cf-icon').value = '';
    document.getElementById('catModalTitle').textContent = '新增分类';
  }
  document.getElementById('catModal').classList.add('show');
}

function saveCat() {
  const name = document.getElementById('cf-name').value.trim();
  const icon = document.getElementById('cf-icon').value.trim() || '🍽️';
  if (!name) { showToast('请填写分类名称'); return; }
  const store = getStore();
  if (editingId) {
    const c = store.categories.find(c => c.id === editingId);
    if (c) { c.name = name; c.icon = icon; }
  } else {
    const maxId = store.categories.reduce((m,c) => Math.max(m,c.id), 0);
    store.categories.push({id:maxId+1,name,icon});
  }
  saveStore(store); closeModal('catModal'); renderCategories(); showToast('分类已保存 ✅');
}

function deleteCat(id) {
  if (!confirm('删除分类将同时影响该分类下的菜品，确定删除？')) return;
  const store = getStore();
  store.categories = store.categories.filter(c => c.id !== id);
  saveStore(store); renderCategories(); showToast('分类已删除');
}

// ===================== 营业报表 =====================
function renderReports() {
  const store = getStore();
  const orders = store.orders;
  // 只统计已结账的订单
  const paidOrders = orders.filter(o => o.paid);
  const totalRevenue = paidOrders.reduce((s,o) => s+o.total, 0);
  const totalOrders = orders.length;
  const avgOrder = paidOrders.length ? totalRevenue / paidOrders.length : 0;

  // 计算真实总销售菜品数量（从订单中统计）
  let totalSoldDishes = 0;
  orders.forEach(o => { o.items.forEach(i => { totalSoldDishes += i.qty; }); });

  document.getElementById('reportStatsGrid').innerHTML = `
    <div class="stat-card orange"><div class="stat-icon">💰</div><div class="stat-label">累计营业额</div><div class="stat-value"><small>¥</small>${totalRevenue.toFixed(2)}</div></div>
    <div class="stat-card blue"><div class="stat-icon">📋</div><div class="stat-label">累计订单数</div><div class="stat-value">${totalOrders}</div></div>
    <div class="stat-card green"><div class="stat-icon">📊</div><div class="stat-label">客均消费</div><div class="stat-value"><small>¥</small>${avgOrder.toFixed(2)}</div></div>
    <div class="stat-card red"><div class="stat-icon">🍜</div><div class="stat-label">总销售菜品</div><div class="stat-value">${totalSoldDishes}份</div></div>
  `;

  // 最近7天真实趋势
  const dayLabels = [];
  const dayRevenues = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toDateString();
    const dayName = ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
    dayLabels.push(dayName);
    const dayRev = orders.filter(o => new Date(o.createdAt).toDateString() === dateStr && o.paid).reduce((s,o) => s+o.total, 0);
    dayRevenues.push(dayRev);
  }
  const maxRev = Math.max(...dayRevenues) || 1;

  if (orders.length === 0 && totalSoldDishes === 0) {
    // 没有数据时显示空状态
    document.getElementById('revenueChart').innerHTML = `
      <div style="text-align:center;padding:40px;color:#999;font-size:14px">
        <div style="font-size:40px;margin-bottom:12px">📊</div>
        暂无营业数据<br>顾客下单后这里将自动显示报表
      </div>`;
  } else {
    document.getElementById('revenueChart').innerHTML = dayRevenues.map((v,i) => `
      <div class="chart-bar-row">
        <span class="chart-bar-label">${dayLabels[i]}</span>
        <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${v/maxRev*100}%;background:${i>=5?'#52C41A':'var(--primary)'}"></div></div>
        <span class="chart-bar-val">${v > 0 ? '¥'+v.toFixed(0) : '-'}</span>
      </div>
    `).join('');
  }

  // 菜品销售排行（从订单真实统计）
  const dishSalesMap = {};
  store.dishes.forEach(d => { dishSalesMap[d.id] = { ...d, qty: 0, revenue: 0 }; });
  orders.forEach(o => {
    o.items.forEach(item => {
      if (dishSalesMap[item.dishId]) {
        dishSalesMap[item.dishId].qty += item.qty;
        const dish = store.dishes.find(d => d.id === item.dishId);
        if (dish) dishSalesMap[item.dishId].revenue += (dish.price * item.qty);
      }
    });
  });

  const sorted = Object.values(dishSalesMap).sort((a,b) => b.qty - a.qty).filter(d => d.qty > 0);

  if (sorted.length === 0) {
    document.getElementById('salesRankTable').innerHTML =
      '<tr><td colspan="6" style="text-align:center;padding:30px;color:#999">暂无销售数据</td></tr>';
  } else {
    document.getElementById('salesRankTable').innerHTML = sorted.map((d, i) => {
      const cat = store.categories.find(c => c.id === d.catId);
      const rank = ['🥇','🥈','🥉'][i] || `#${i+1}`;
      return `
        <tr>
          <td style="font-size:20px;width:50px">${rank}</td>
          <td><div style="display:flex;align-items:center;gap:10px"><div class="dish-emoji-box" style="width:36px;height:36px;font-size:18px">${d.emoji}</div><strong>${d.name}</strong></div></td>
          <td>${cat ? `${cat.icon} ${cat.name}` : '-'}</td>
          <td>${formatPrice(d.price)}</td>
          <td><strong>${d.qty}</strong> 份</td>
          <td><strong style="color:var(--primary)">${formatPrice(d.revenue)}</strong></td>
        </tr>
      `;
    }).join('');
  }
}

// ===================== 评价管理 =====================
function renderRatings() {
  const store = getStore();
  const ratings = store.ratings || [];
  const container = document.getElementById('ratingsContainer');
  if (!ratings.length) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:#999">暂无顾客评价</div>';
    return;
  }
  container.innerHTML = [...ratings].reverse().map(r => `
    <div style="padding:16px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div>
          <strong>${store.tables.find(t=>t.id===r.tableId)?.name || '未知桌台'}</strong>
          <span style="margin-left:12px;color:var(--warning);font-size:16px">${'⭐'.repeat(r.score)}</span>
        </div>
        <span style="font-size:12px;color:#999">${formatTime(r.createdAt)}</span>
      </div>
      ${r.text ? `<div style="font-size:14px;color:var(--text-gray);background:var(--bg);padding:10px 14px;border-radius:8px">"${r.text}"</div>` : ''}
    </div>
  `).join('');
}

// ===================== 系统设置 =====================
function renderSettings() {
  const store = getStore();
  document.getElementById('settingName').value = store.restaurantName || '';
}

function saveSettings() {
  const store = getStore();
  store.restaurantName = document.getElementById('settingName').value.trim() || '西荣餐厅';
  saveStore(store); showToast('设置已保存 ✅');
}

function clearAllData() {
  if (!confirm('⚠️ 警告：此操作将清除所有订单、评价数据，菜品和桌台将重置为默认状态。确定继续？')) return;
  resetStore().then(function(data) {
    if (data) location.reload();
    else showToast('重置失败，请检查服务器连接');
  });
}

// ===================== 顶部时钟 =====================
function updateClock() {
  document.getElementById('topbarTime').textContent = new Date().toLocaleString('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
}

// ===================== 初始化 =====================
async function init() {
  // 先从后端加载数据（必须等数据到了才能渲染页面）
  var loadedStore = await initStore();
  if (!loadedStore) {
    showToast('⚠️ 无法连接服务器，请检查网络', 5000);
  }
  renderDashboard();
  updateClock();
  setInterval(updateClock, 1000);
  // 立即检查催促通知
  checkUrges();
  // 立即检查呼叫服务员通知
  checkCalls();
  // 定时刷新各个页面（每2秒从后端拉最新数据，替代之前的 localStorage 轮询）
  setInterval(() => {
    refreshStore(); // 从后端拉最新数据（异步，不阻塞UI）
    // 立刻用当前缓存刷新UI（refreshStore完成后下次轮询会用新数据）
    var store = getStore();
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
    }
    const active = document.querySelector('.page-section.active');
    if (active?.id === 'section-dashboard') renderDashboard();
    if (active?.id === 'section-orders') {
      // 软刷新：保留用户的筛选条件，只更新数据
      var hasFilter = document.getElementById('orderSearch').value.trim() ||
        document.getElementById('orderPhoneFilter').value.trim() ||
        document.getElementById('orderStatusFilter').value ||
        document.getElementById('orderDateFilter').value ||
        document.getElementById('orderMonthFilter').value;
      if (hasFilter) filterOrders(); else renderOrderTable(getStore().orders);
    }
    if (active?.id === 'section-tables') renderTables(); // 桌台管理页也定时刷新
  }, 2000);
}

// ===================== 订单详情弹窗（逐道菜标记出餐） =====================
function openOrderDetail(orderId) {
  const store = getStore();
  const order = store.orders.find(o => o.id === orderId);
  if (!order) { showToast('订单不存在'); return; }
  // 兼容旧数据：为没有served字段的item补上默认值
  order.items.forEach(i => { if (i.served === undefined) i.served = (order.status === 'served'); });
  saveStore(store);

  const dishMap = {};
  store.dishes.forEach(d => dishMap[d.id] = d);
  const itemsHtml = order.items.map(item => {
    const d = dishMap[item.dishId];
    const name = d ? d.emoji + ' ' + d.name : '菜品#' + item.dishId;
    if (item.served) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px"><span>' + name + ' × ' + item.qty + '</span><span style="color:#52C41A;font-weight:600">✅ 已出餐</span></div>';
    } else {
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px"><span>' + name + ' × ' + item.qty + '</span><button class="btn btn-sm" style="background:#722ED1;color:white;font-size:11px;padding:3px 10px" onclick="markItemServed(' + orderId + ',' + item.dishId + ')">标记出餐</button></div>';
    }
  }).join('');
  const allServed = order.items.length > 0 && order.items.every(i => i.served);
  document.getElementById('orderDetailContent').innerHTML =
    '<div style="padding:16px">' +
      '<div style="display:flex;gap:16px;margin-bottom:12px;font-size:13px;color:#666;flex-wrap:wrap">' +
        '<span>订单号：<strong>' + (order.orderNo || '#' + order.id) + '</strong></span>' +
        '<span>桌台：' + order.tableName + '</span>' +
        '<span>时间：' + formatTime(order.createdAt) + '</span>' +
      '</div>' +
      '<div style="background:' + (allServed ? '#f6ffed' : '#fff7e6') + ';border-radius:8px;padding:12px 16px;margin-bottom:12px">' +
        '<div style="font-weight:600;margin-bottom:8px;font-size:14px">菜品明细（点击"标记出餐"更新状态）</div>' +
        itemsHtml +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;font-size:14px">' +
        '<span>' + order.items.filter(i=>i.served).length + ' / ' + order.items.length + ' 道菜已出餐</span>' +
        '<span style="font-weight:700;color:#FF6B35;font-size:16px">合计：¥' + order.total.toFixed(2) + '</span>' +
      '</div>' +
      (!allServed ? '<div style="margin-top:8px"><button class="btn btn-primary" style="width:100%" onclick="markAllItemsServed(' + orderId + ')">全部标记出餐</button></div>' : '') +
      (!order.paid ? '<div style="margin-top:8px"><button class="btn btn-primary" style="width:100%;background:#1890ff;color:white" onclick="checkoutOrder(' + orderId + ');closeModal(\'orderDetailModal\')">💰 确认结账（计入营业额）</button></div>' : '<div style="margin-top:8px;text-align:center;color:#52C41A;font-weight:600;font-size:13px">✅ 该订单已结账</div>') +
    '</div>';
  document.getElementById('orderDetailModal').classList.add('show');
}

function markItemServed(orderId, dishId) {
  const store = getStore();
  const order = store.orders.find(o => o.id === orderId);
  if (!order) return;
  const item = order.items.find(i => i.dishId === dishId);
  if (item) item.served = true;
  // 检查是否全部已出餐，同步更新订单状态
  const allServed = order.items.every(i => i.served);
  if (allServed) order.status = 'served';
  saveStore(store);
  openOrderDetail(orderId);
  renderTables();
  renderOrders(); // 同步刷新订单管理列表
  renderDashboard(); // 同步刷新数据概览
  showToast('✅ 已标记出餐');
}

function markAllItemsServed(orderId) {
  const store = getStore();
  const order = store.orders.find(o => o.id === orderId);
  if (!order) return;
  order.items.forEach(i => i.served = true);
  order.status = 'served'; // 全部出餐后更新订单状态
  saveStore(store);
  openOrderDetail(orderId);
  renderTables();
  renderOrders(); // 同步刷新订单管理列表
  renderDashboard(); // 同步刷新数据概览
  showToast('✅ 全部已出餐');
}

init();


