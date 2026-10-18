# 部署與維運

本文件從舊版 README 移過來，內容是發版、正式主機部署、服務安裝與上線檢查。專案介紹見 [README](../README.md)。

## 設定與部署

正式網址為 `https://connect4.oraclelee.com`。正式主機需要 Podman 3.4+、
systemd user service、Nginx 與有效的 TLS 憑證；開發機不需要安裝以下服務。

### 發版與取得映像

版本規則：小修改把最後一位 +1（3.0.0 → 3.0.1），大改把中間那位 +1（3.0.0 → 3.1.0）。
不要手改版本號，在開發機任何一個 checkout 執行：

```bash
scripts/release.sh patch     # 或 minor；加 --dry-run 只做檢查
```

腳本在一個暫時的 worktree 裡改 `pyproject.toml` 與 `frontend/package.json`、確認舊版本號
沒有殘留在建置或部署檔案裡，開一個「Release X.Y.Z」的 pull request 並設定綠燈自動合併；
合併後把 `vX.Y.Z` tag 打在合併出來的 main commit 上。CI 的 `backend` 與 `frontend` 兩個 job
平行跑完整測試（含 e2e），都綠之後 `container` job 會確認 tag 與兩個 manifest 的版本一致，
建立 GitHub Release，再把映像發布到
`ghcr.io/edwardleeee/connect4-web:<tag>`（同時更新 `latest`）。GHCR 套件為
Private，正式主機要先用一個只有 `read:packages` 權限的 GitHub personal access
token（classic）登入一次：

```bash
podman login ghcr.io --username <GitHub 帳號> --authfile ~/.config/containers/auth.json
```

一定要指定 `--authfile`：不指定時 podman 把憑證存在
`$XDG_RUNTIME_DIR/containers/auth.json`，那個目錄在 tmpfs，主機重開機就會被清掉，
下次 `podman pull` 會失敗；存在 `~/.config/containers/auth.json` 才會保留。

每個映像都帶 `org.opencontainers.image.revision` label（建置時的 commit SHA），
部署前可以確認拉到的映像對應哪個 commit，不必猜 tag 是否被移動過：

```bash
podman image inspect --format '{{ index .Labels "org.opencontainers.image.revision" }}' ghcr.io/edwardleeee/connect4-web:v3.0.0
```

之後正式主機不必安裝 Rust 或 Node，直接拉映像部署：

```bash
deploy/deploy.sh v3.0.0
```

腳本會 `podman pull` 該 tag、把它標成 `localhost/connect4-web:production`、重啟
服務並等待 `/api/health` 回 200；60 秒內不健康就自動切回上一版映像
（`localhost/connect4-web:previous`）。回滾同一支腳本帶舊 tag 即可。

沒有網路或要驗證未發布的變更時，仍可在主機上從原始碼建置：

```bash
git pull --ff-only origin main
podman build --format docker --file Containerfile --tag localhost/connect4-web:production .
```

映像會分階段建置 Vue、Rust/PyO3 與 Python 套件；最終容器以非 root
帳號執行單一 Uvicorn worker。不要在正式環境加入 `--reload` 或增加
worker，因為房間與配對狀態目前存於單一程序記憶體。正式主機目前是 Podman 4.9.3；
不論版本都要用 Docker image format（`--format docker`），才能保留映像內的
`HEALTHCHECK`。

### 安裝 rootless 背景服務

```bash
install -d -m 700 ~/.config/connect4 ~/.config/systemd/user
install -m 600 deploy/connect4.env.example ~/.config/connect4/connect4.env
install -m 644 deploy/connect4.service ~/.config/systemd/user/connect4.service
sudo loginctl enable-linger "$(id -un)"
systemctl --user daemon-reload
systemctl --user enable --now connect4.service
```

`connect4.env` 的正式預設值為：

```bash
CONNECT4_COOKIE_SECURE=1
CONNECT4_ALLOWED_ORIGINS=https://connect4.oraclelee.com
CONNECT4_APP_ORIGINS=capacitor://localhost,https://localhost
```

`CONNECT4_APP_ORIGINS` 是手機 app 頁面的來源（iOS `capacitor://localhost`、Android
`https://localhost`）。只有這些來源能跨網域讀取 `/api/session`，並用 session token 連線，詳見
`docs/protocol.md` 的「App 連線」。沒設定時預設就是這兩個；設成空字串就關閉 app 模式。

服務只發布到 `127.0.0.1:55555`，由 Nginx 對外提供 HTTPS 與 WebSocket。
反向代理範例位於 `connect4.conf`；確認憑證路徑後安裝並重新載入：

```bash
sudo install -m 644 connect4.conf /etc/nginx/sites-available/connect4.conf
sudo ln -s /etc/nginx/sites-available/connect4.conf /etc/nginx/sites-enabled/connect4.conf
sudo nginx -t
sudo systemctl reload nginx
```

若啟用連結已存在，保留現有連結即可。正式切換前依序檢查：

```bash
systemctl --user status connect4.service
curl --fail http://127.0.0.1:55555/api/health
curl --fail https://connect4.oraclelee.com/api/health
journalctl --user-unit connect4.service --follow
```

只有原生精確求解器自測通過，`GET /api/health` 才回傳 HTTP 200；回應裡的 `version`
是上線的應用程式版本，部署後用它確認換版成功（`deploy.sh` 結尾也會印出）。更新版本的順序是：
開發機 `scripts/release.sh patch|minor` → 等 GitHub Actions 全綠 → 正式主機
`deploy/deploy.sh vX.Y.Z`（或從原始碼重建相同 production tag 再
`systemctl --user restart connect4.service`）。程序重啟會清除進行中的房間與配對。

### iOS Universal Links（apple-app-site-association）

有裝 iOS app 的手機點邀請連結（`/r/房號`，舊的 `/?room=房號` 也算）時，會直接打開 app。
iOS 靠網站上的 `/.well-known/apple-app-site-association` 判斷要不要交給 app：內容在
`backend/connect4_app/well_known.py`，由 FastAPI 直接回傳。Apple 規定這個網址必須是 HTTPS、
憑證有效、不能轉址，內容是 `application/json`；CI 的 pytest 與容器冒煙測試都會檢查。

上線後在開發機檢查（GitHub runner 與 Python 的 urllib 都會被 Cloudflare 擋，要用開發機的 curl）：

```bash
curl -sS -o /dev/null -D - https://connect4.oraclelee.com/.well-known/apple-app-site-association \
    | grep -iE '^(HTTP|content-type|location)'
# 應該是 200、content-type: application/json，而且沒有 location

curl -sS -D - https://app-site-association.cdn-apple.com/a/v1/connect4.oraclelee.com
# 手機讀的是 Apple 的 CDN 這一份，不是正式站。Apple 會在 24 小時內重新抓取，
# 結果從 404（SWCERR00401 這類原因）變成 200，內容和正式站相同
```

- 網站要比帶 Associated Domains 的新版 app 先上線，Apple 的 CDN 才來得及抓到。
- 已安裝 app 的手機大約每週才更新一次這個檔案；改 Team ID 或網址規則時，改 `well_known.py` 再發版。
- 正式站回應正確、Apple 的 CDN 卻一直抓不到時，可能是 Cloudflare 擋了 Apple 的抓取程式；
  要調整 Cloudflare 前，先問使用者。

### App 連結網域（connect4-app.oraclelee.com）

手機網頁上「在 App 中打開」的橫幅連到 `https://connect4-app.oraclelee.com/r/房號`（不在房間時是 `/open`）。
在 Safari 裡按同一個網域的 universal link 會留在 Safari，所以橫幅要連到另一個子網域
（Apple TN3155「Use universal links on your site」："To use a universal link to open your app while
already browsing in the web browser, use a different subdomain."）。有裝 app 的 iPhone 直接開 app；
沒裝的話，瀏覽器會打開這個網址，伺服器再把它轉到 App Store。

這個網域由同一個容器依 Host 回應（`backend/connect4_app/app.py` 的 `AppLinkHost`，內容在
`well_known.py`）：

- `/.well-known/apple-app-site-association`：它自己的一份（`/r/??????` 與 `/open`），200、`application/json`、不轉址。
  每個寫進 entitlement 的網域都要有自己的一份（TN3155）。
- 其他所有請求：302 轉到 App Store，`Cache-Control: no-store`，不設 cookie；WebSocket 一律拒絕。
  用 302 而不是 301，是因為瀏覽器會永久記住 301，以後要改轉址目的地（例如 Android 上架後轉 Google Play）就收不回來。
- 其他 Host 完全照舊，所以 `CONNECT4_ALLOWED_ORIGINS`、`CONNECT4_APP_ORIGINS` 都不用加這個網域：它不提供網頁，
  session cookie 也沒有設 Domain，不會送到這裡。

送出的 app 會把這個網域寫進 Associated Domains，之後就不能改名或拿掉。

第一次設定（順序不能換：還沒更新的程式會把主站那份 AASA 回給這個網域，Apple 的 CDN 要是先抓到，
沒辦法清除，最多 24 小時才重抓）：

1. 部署帶有 `AppLinkHost` 的版本（3.3.4 以後）。
2. Nginx 加上 `connect4.conf` 裡這個網域的 port 80 server block（`/.well-known/acme-challenge/` 由
   `/var/www/certbot` 提供），`sudo nginx -t` 後 reload。
3. Cloudflare 新增 A 記錄 `connect4-app`，內容與 `connect4` 那一筆相同的 IP（有 AAAA 也照抄），先選
   **DNS only**：Let's Encrypt 第一次發憑證要直接連到主機。
4. `sudo certbot certonly --webroot -w /var/www/certbot -d connect4-app.oraclelee.com`。
5. 加上 443 的 server block，`sudo nginx -t` 後 reload。
6. Cloudflare 把這筆改成 **Proxied**，和主站一樣隱藏主機 IP，由 Cloudflare 的憑證對外。

443 的 server block 也要把 `/.well-known/acme-challenge/` 交給 webroot，而且要放在 proxy 之前；
否則續期的請求會被程式轉到 App Store。

上線後在開發機檢查：

```bash
H=https://connect4-app.oraclelee.com
curl -sS -o /dev/null -D - $H/.well-known/apple-app-site-association \
    | grep -iE '^(HTTP|content-type|location|cache-control)'
# 200、content-type: application/json，沒有 location
curl -sS -A 'MyAgent-Bot/*' -o /dev/null -w '%{http_code}\n' $H/.well-known/apple-app-site-association
# 隨便一個 User-Agent 也要 200（TN3155：要接受所有 User-Agent）
for p in /r/ABC123 /open /; do curl -sS -o /dev/null -w "$p %{http_code} %{redirect_url}\n" "$H$p"; done
# 每一行都是 302 https://apps.apple.com/app/id6816204087

# 上面都對了才查 Apple 的 CDN；新網域可能要等到 24 小時
curl -sS -D - https://app-site-association.cdn-apple.com/a/v1/connect4-app.oraclelee.com
```

- 已經在 app 打開後按右上角網域回到 Safari 的人，iOS 會記住「這個網域用 Safari 開」，按橫幅會到 App Store；
  在備忘錄貼上連結並長按、改選用 app 打開，就會恢復（TN3155）。
- App Store 不會把房號交給剛裝好的 app；裝好之後回 Safari 再按一次橫幅。
