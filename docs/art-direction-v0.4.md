# v0.4 街區美術與人物

本版回應「場景更宏大、更細緻，人物也是」。展示地圖由 1000×650 擴大為 2400×1600 的座標空間，保留 V5 原來的四個區域和八位居民。比例變化只屬視覺呈現，不是研究環境中的距離或新增地點。

## 場景來源與保存

- 產生方式：Codex 內建 imagegen（不是 CLI/API fallback）。
- 實際圖片尺寸：1536×1024 PNG，Phaser 對應到 2400×1600 世界座標；不宣稱原圖是 2400×1600 或 4K。
- 專案素材：[town-grand-v1.png](../assets/town-grand-v1.png)。原始生成檔另外保留在使用者的 Codex generated_images 目錄。
- 新建築、家具、河道、攤位及室內器材是場景美術。引擎設備仍只有原本的 tools/camera、A8/B2/B3，未增加可借設備、居民或研究區域。
- 此版包含屋頂剖面可見的室內陳設，尚未建立逐間房屋的室內導航；人物移動依街道和廣場步道顯示。
- 舊版程式、截圖及 Git 歷史保留，未處理或覆寫雲端研究文件。

## 人物

`src/resident-art.js` 為本專案原創程式繪製。每位居民 64×96、30 幀，包含四方向和走路／工作／閱讀休息／交談／拍照。髮型、服裝、膚色與配件依角色名字固定，換種子分配 ID 仍保留人物身分；地圖與 HTML 頭像共用素材。

[人物素材預覽](residents-v0.4.png) 和 [實際展示截圖](demo-v0.4-preview.jpg) 均由真實素材或執行畫面產生。

## 完整生成提示詞

Use case: stylized-concept. Asset type: production background map for a browser 2D life-simulation game, NOT a UI mockup. Create ONE complete expansive, highly detailed, coherent pixel-art town map, landscape 3:2 ratio, ideally 2400 by 1600. Orthographic top-down with slight front facades, like a premium handcrafted 32-bit cozy life simulation. Crisp small pixel clusters, rich material shading, soft warm late-morning light, deep moss/olive vegetation, ochre stone and terracotta roofs, teal timber, warm ivory paths. High density of meaningful architectural detail at close zoom; professional game environment quality, no blur.

COMPOSITION AND NAVIGATION ARE CRITICAL: think of logical map coordinates x0..2400,y0..1600. A wide vertical cobblestone boulevard centered at x1200 goes from top to bottom. An east-west pedestrian main avenue centered at y800 spans the full map. Four visually connected neighborhoods branch off, NOT four boxed quadrants, no hard borders. Keep a generous continuous clear horizontal pedestrian lane at y600 across x180..1100 and x1300..2230, and at y1280 across x180..1100 and x1300..2230. Paths meet the central boulevard. All these lanes are visibly empty walkable stone/gravel, no trees/furniture/buildings in their middle.

NORTHWEST: 5-6 beautiful small varied cottages, a tiny neighborhood reading house, tiled roofs with chimneys, windows, porch plants, fenced private gardens, laundry, mailboxes, bicycles, vegetable beds, small visible cutaway living-room/library corner. Buildings behind the pedestrian lane at y600, courtyards and little branches connecting front doors. NORTH EAST: a substantial connected artisan campus, 2-3 workshops with distinct tiled roofs, timber frames, roof-cutaway studio showing carpentry workbenches, cabinets, shelves, colorful material bins, technical drawings, sheltered outdoor work areas. Keep continuous clear lane y600 and apron below. SOUTHWEST: an expansive civic garden/plaza, beautiful circular stone fountain at approx x550,y1080, formal flower beds, shaded bench alcoves, a small cafe pavilion and 3 colorful market canopies near x200,y900, orchard, tiny pond at lower left edge, winding secondary park paths. Clear main plaza promenade at y1280. SOUTHEAST: photography and arts neighborhood, large airy community pavilion around x1780,y1040 with part roof cut away to show photography backdrop and art desks; botanical greenhouse, photo garden with specimen plants, small outdoor stage, pergola, flower-lined paths. Clear promenade y1280. A narrow river and riverside path run near the far RIGHT edge x2300, with two small stone bridges and reeds, water reflections, trees and flowers framing outer edges.

Scale feels like a whole living town, around 15 architectural structures plus gardens and public spaces, not four simple houses. Rich furniture and trim: roof tile courses, brick joints, stepping stones, hanging lamps, signage shapes WITHOUT LETTERS, benches, potted flowers, crates, shutters, doors. Make every building and prop have coherent shadows and perspective. Keep outdoor activity courtyards, lawns and walkways open enough for moving sprites to be layered on top.

STRICT: no people, no animals, no characters, no vehicles in motion, no UI, no HUD, no text or letters, no logos, no border, no title, no watermark, no labels. No isometric diamonds, no 3D render, no watercolor. The output is the actual playable environment artwork.
