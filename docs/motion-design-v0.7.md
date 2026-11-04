# 人物尺度與自然動作 · v0.7

## Imagegen 的實際用途

本環境原本已內建 imagegen；v0.6 沒有呼叫生圖工具。本輪實際使用內建 image_gen 工具，生成一張 4×4 透明背景動作參考，保存為 `assets/resident-motion-reference-v0.7.png`。原始生成檔仍保留於 Codex generated_images 目錄。

這張圖用來校對跨步、彎膝、坐姿接觸、聊天停頓及工作桌的動作順序，不直接切成遊戲人物素材。圖中有椅子與工作桌，而且只繪製小苒，無法作為八位居民的統一遊戲圖集。遊戲仍以固定像素網格製作八人的 192 幀素材，由 Phaser 呈現；這個區別讓角色身份與家具佔地維持一致。

## 呈現方式

人物顯示比例由 .56 調整為 .78，約放大 39%。每幀仍為 64×96，增加至每人 192 幀，保留原有 0–47 幀。新增四向八幀步行、四幀坐下／反向站起、閱讀、待機、聊天、工作及攝影。

步行時間依路線長度與播放速度計算；跨步依實際移動距離切換。自動播放等角色完成位移與坐下後才開始下一時段，逐步與任意跳轉回放仍可操作。坐下時降低身體、彎膝，將髖部對齊座椅；名字及影子隨身體偏移。咖啡椅依朝向繪製側面椅背。

聊天與工作動畫包含停頓，避免持續揮手與不停敲擊。動作仍由成功事件與家具站位決定，失敗事件若保留坐姿站位，維持坐姿但不播放失敗的設備活動。像素位置與畫面動作不改變研究判定。

## 完整生圖提示詞

參考圖片：`docs/demo-v0.6-preview.png`，僅作人物身份、配色與像素場景風格參考。使用 built-in tool mode，`transparent_background=true`。

```text
Create a new original 2D pixel-art animation reference sheet for the pink-cardigan, brown-bun-haired young adult resident visible in the supplied AI town screenshot. The screenshot is ONLY an identity, palette and top-down game style reference; do not recreate the UI or scenery. This is an animation art reference for making movement more natural and readable in a Phaser game, similar in spatial readability to classic social pixel worlds but with original art. One consistent character throughout, same face, brown bun hair, dusty rose cardigan over cream top, plum trousers, brown boots. Chibi proportions but adult, large readable face. Crisp pixel clusters, restrained shading, no vector smoothness. Transparent background. Make exactly a 4-column by 4-row evenly spaced sheet, all 16 slots the same size, same body scale and foot baseline, generous cell padding, no labels or text. Each row is a clear sequence of four keyframes: row1 four phases of a natural side-facing walking cycle with alternating planted feet, passing stride, counter-swing arms, only slight torso bob; row2 approaching a small wooden chair, bending knees, lowering hips onto chair, settling seated with open book (consistent simple chair in these4 cells); row3 calm side-facing conversation: neutral, small hand gesture, gentle head turn, resting hands, no exaggerated flailing; row4 facing a small wooden workbench: reaching for a tool, deliberate use/contact, retracting hands, inspecting the work (same small bench in these4 cells). Body silhouette and clothing details consistent. Show all characters complete, no cropped hair, hands or feet. Small furniture serves only to explain contact and seated posture. No backgrounds, no UI, no grid lines, no watermark.
```
