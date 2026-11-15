"""小鎮的靜態設定：時段、物品、地點、職業、居民與預設事件排程。

這裡只有資料，沒有邏輯。要擴充成 12 位以上居民，只要在 RESIDENTS
加入新資料（或在 create_world 傳入自訂名單），住宅會自動產生。
"""

from __future__ import annotations

SLOTS = ["清晨", "上午", "中午", "下午", "傍晚", "夜晚"]
SLOT_TIMES = ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"]
SLOTS_PER_DAY = len(SLOTS)
DEFAULT_DAYS = 3
NIGHT = 5

# 每個時段的自然需求變化（飢餓越高越餓；精力越低越累；社交越高越孤單）
NEED_DRIFT = {"hunger": 9, "energy": -7, "social": 6}
SLEEP_DRIFT = {"hunger": 4, "energy": 0, "social": 2}

ITEMS = {
    "bread": {"name": "麵包", "price": 8, "food": 30},
    "vegetables": {"name": "蔬菜", "price": 6, "food": 20},
    "meal": {"name": "咖啡廳套餐", "price": 12, "food": 45},
    "wood": {"name": "木材", "price": 10, "food": 0},
    "parts": {"name": "零件", "price": 15, "food": 0},
}

# 市場貨架上限與每日清晨供應商送到倉庫的數量
SHELF_CAPACITY = {"bread": 10, "vegetables": 8, "wood": 8, "parts": 5}
DAILY_DELIVERY = {"bread": 8, "vegetables": 6, "wood": 4, "parts": 2}

# 地點：x, y 是地圖上（960x600 世界座標）的入口中心
LOCATIONS = {
    "market": {
        "name": "市場", "kind": "market", "owner": "chen", "open": [0, 1, 2, 3, 4],
        "x": 760, "y": 175, "w": 190, "h": 120,
        "equipment": {"fridge": "冷藏櫃"},
    },
    "cafe": {
        "name": "咖啡廳", "kind": "cafe", "owner": "lin", "open": [1, 2, 3, 4],
        "x": 520, "y": 175, "w": 170, "h": 120,
        "equipment": {"coffee_machine": "咖啡機"},
    },
    "workshop": {
        "name": "工作坊", "kind": "workshop", "owner": "zhe", "open": [1, 2, 3],
        "x": 790, "y": 465, "w": 180, "h": 120,
        "equipment": {"saw": "電鋸"},
    },
    "plaza": {
        "name": "公共廣場", "kind": "plaza", "owner": None, "open": [0, 1, 2, 3, 4, 5],
        "x": 470, "y": 440, "w": 230, "h": 150,
        "equipment": {},
    },
}

# 職業：工作地點、慣常工作時段、合作加成說明
JOBS = {
    "barista": {"title": "咖啡師", "sites": ["cafe"], "slots": [1, 2, 3], "verb": "煮咖啡、做套餐"},
    "grocer": {"title": "雜貨商", "sites": ["market"], "slots": [0, 1, 3], "verb": "整理貨架、補貨"},
    "carpenter": {"title": "木工", "sites": ["workshop"], "slots": [1, 3], "verb": "做家具"},
    "illustrator": {"title": "插畫家", "sites": ["cafe", "plaza", "home"], "slots": [1, 3], "verb": "畫插畫接案"},
    "organizer": {"title": "社區志工", "sites": ["plaza"], "slots": [1, 3], "verb": "整理公告欄、聯絡居民"},
    "repairer": {"title": "修理工", "sites": ["workshop", "cafe", "market"], "slots": [1, 2, 3], "verb": "修理設備"},
}

# 人格特質 0~1：sociable 外向、diligent 勤奮、frugal 節儉、generous 熱心
RESIDENTS = [
    {
        "id": "lin", "name": "林曉", "job": "barista", "color": "#e07a5f",
        "personality": ["開朗", "細心", "愛聊天"],
        "traits": {"sociable": 0.8, "diligent": 0.7, "frugal": 0.4, "generous": 0.6},
        "bio": "咖啡廳老闆兼咖啡師，記得每位熟客的口味。",
        "money": 40, "inventory": {"vegetables": 2, "bread": 1},
        "needs": {"hunger": 25, "energy": 85, "social": 25},
        "goal": {"kind": "money", "target": 120, "text": "存到 120 元，換一台新的磨豆機"},
    },
    {
        "id": "chen", "name": "陳伯", "job": "grocer", "color": "#81b29a",
        "personality": ["務實", "念舊", "嘴硬心軟"],
        "traits": {"sociable": 0.5, "diligent": 0.9, "frugal": 0.8, "generous": 0.5},
        "bio": "在市場顧了三十年攤位，鎮上誰家缺什麼他最清楚。",
        "money": 60, "inventory": {"bread": 2},
        "needs": {"hunger": 20, "energy": 80, "social": 30},
        "goal": {"kind": "friends", "target": 3, "text": "跟 3 位鄰居混熟（熟悉度 ≥ 40）"},
    },
    {
        "id": "zhe", "name": "阿哲", "job": "carpenter", "color": "#b5838d",
        "personality": ["專注", "內向", "完美主義"],
        "traits": {"sociable": 0.3, "diligent": 0.9, "frugal": 0.6, "generous": 0.4},
        "bio": "工作坊的木工，正在趕一批家具訂單。",
        "money": 30, "inventory": {"wood": 2, "bread": 1},
        "needs": {"hunger": 30, "energy": 80, "social": 20},
        "goal": {"kind": "counter", "counter": "furniture", "target": 3, "text": "完成 3 件家具訂單"},
    },
    {
        "id": "yu", "name": "小雨", "job": "illustrator", "color": "#6d9dc5",
        "personality": ["敏感", "好奇", "有點害羞"],
        "traits": {"sociable": 0.55, "diligent": 0.6, "frugal": 0.5, "generous": 0.7},
        "bio": "剛搬來的插畫家，想在鎮上交到朋友。",
        "money": 25, "inventory": {"bread": 1},
        "needs": {"hunger": 35, "energy": 70, "social": 50},
        "goal": {"kind": "friends", "target": 2, "text": "交到 2 位朋友（熟悉度 ≥ 40）"},
    },
    {
        "id": "wang", "name": "王姐", "job": "organizer", "color": "#f2cc8f",
        "personality": ["熱心", "健談", "有號召力"],
        "traits": {"sociable": 0.95, "diligent": 0.7, "frugal": 0.5, "generous": 0.9},
        "bio": "社區志工，負責廣場公告欄，總想把大家湊在一起。",
        "money": 35, "inventory": {"vegetables": 1, "bread": 1},
        "needs": {"hunger": 25, "energy": 85, "social": 35},
        "goal": {"kind": "event", "target": 4, "text": "辦一場至少 4 人參加的社區活動"},
    },
    {
        "id": "kai", "name": "阿凱", "job": "repairer", "color": "#9a8c98",
        "personality": ["隨和", "可靠", "慢條斯理"],
        "traits": {"sociable": 0.6, "diligent": 0.6, "frugal": 0.6, "generous": 0.7},
        "bio": "什麼都會修的修理工，常在工作坊跟阿哲借工具。",
        "money": 30, "inventory": {"parts": 1},
        "needs": {"hunger": 30, "energy": 75, "social": 30},
        "goal": {"kind": "counter", "counter": "repairs", "target": 2, "text": "修好 2 台故障設備"},
    },
]

# 初始人際關係（未列出的組合從 0 開始）
INITIAL_RELATIONS = [
    ("lin", "chen", 35, 40),
    ("zhe", "kai", 45, 50),
    ("wang", "chen", 30, 35),
    ("wang", "lin", 25, 30),
]

# 預設事件排程：(day, slot, type)。可以用 API 手動觸發更多。
DEFAULT_SCHEDULE = [
    (1, 2, "equipment_failure"),
    (2, 0, "market_shortage"),
    (2, 1, "community_event"),
]

EVENT_TYPES = {
    "market_shortage": "市場缺貨",
    "equipment_failure": "設備故障",
    "community_event": "社區活動",
}
