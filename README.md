# 課約 TutorLedger・網頁示範版

給家教老師試用的互動示範:<https://teddykuo00325-sys.github.io/tutorledger-demo/>

真正的產品是 iOS 原生 App(另一個 private repo)。這裡**全是假資料**,不上傳任何東西,重新整理就復原。

## 結構

```
src/rules.js     規則層:扣堂、選包、對帳、衝突、到期、待確認、外聘課表。純函式,不碰畫面
src/app.js       畫面與互動。所有計算都呼叫 rules.js,這裡只負責取資料與排版
src/style.css    樣式。色票對齊 iOS 版(BrandPrimary 四種版本),Liquid Glass 外觀
src/shell.html   頁面外框與說明文字
test/rules.test.js  規則測試
build.py         把 src/ 組成單一的 index.html
index.html       建置產物(GitHub Pages 直接服務這個檔)
```

## 改完之後

```bash
# 1. 規則測試(macOS 內建的 JavaScriptCore,不需要 node)
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc src/rules.js test/rules.test.js

# 2. 組出 index.html
python3 build.py

# 3. 本機預覽
python3 -m http.server 8765    # 開 http://localhost:8765
```

**不要直接改 `index.html`**,它是建置產物,下次 build 會被蓋掉。

## 與 iOS 版的關係

規則是**簡化重寫**,不是共用程式碼。真正的規則在 iOS 版的 LedgerCore(219 條測試);
這裡的 67 條測試只確保示範頁自己說的話是對的。兩邊各寫一份必然會漂移——
所以這個示範頁只用來展示,不回頭影響產品。

規則層的註解標出了對應的 Swift 函式(例如 `pickPackage` ↔ `selectPackageForDeduction`),
iOS 版改了規則,要同步這裡時從那裡找。

## 隱私前提(示範頁也遵守)

- 分享給家長的卡片不放電話——圖片會被轉傳
- 課前提醒一位學生一張,不做全班總表
- 不做帳號、不做家長端、不上傳任何資料
